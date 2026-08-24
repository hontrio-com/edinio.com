import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_STOCK_TOTALS, type StockTotals } from "./types";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { MAX_STOCK_ROWS } from "@/lib/import/csv";
import { safeFetchFile } from "@/lib/import/ssrf";
import { parseTabular } from "@/lib/import/tabular";
import { loadCatalog } from "./catalog";
import { buildStockPlan } from "./matcher";
import { coloaneLipsa, readFeedRows } from "./mapping";
import {
  numaraProbleme,
  processStockChunk,
  stageStockPlan,
  } from "./committer";
import { markRun, markRunStart, patchSource, MAX_FAILURES, type StockFeedSource } from "./sources";

/**
 * Rularea unei surse: citeste adresa, calculeaza planul, scrie.
 *
 * Fiecare rulare isi face propriul rand in `product_imports`, cu
 * `source = 'stock_csv'`. Asa apare in acelasi istoric ca incarcarile manuale si
 * foloseste acelasi raport de erori descarcabil, fara cod in plus.
 *
 * Rularea are un TERMEN. Cronul are un minut, iar un feed mare nu incape.
 * Ce nu apuca sa scrie ramane in `importing`, iar tura urmatoare a cronului
 * continua exact de unde s-a oprit: randurile ramase sunt tot acolo, cu status
 * `pending`.
 */

type Client = SupabaseClient<Database>;

export interface RunResult {
  ok: boolean;
  importId?: string;
  totals?: StockTotals;
  error?: string;
  /** A ramas de lucru: cronul urmator continua acelasi job. */
  unfinished?: boolean;
}

export async function runSource(
  admin: Client,
  source: StockFeedSource,
  deadline: number,
): Promise<RunResult> {
  /*
   * ── Sursele care ucid invocarea se sting aici ──
   *
   * `markRunStart` numara esecurile dar nu dezactiveaza (vezi de ce, acolo), deci
   * pragul se verifica la intrare. Fara asta, o sursa care omoara procesul de
   * fiecare data ar fi ramas activa la nesfarsit si ar fi mancat, tura de tura,
   * bugetul de un minut al cronului inaintea celorlalti comercianti.
   * Comerciantul o poate reaprinde din ecran (reactivarea pune contorul la zero).
   */
  if (source.consecutive_failures >= MAX_FAILURES) {
    const error = "Sursa a fost oprita dupa prea multe rulari esuate la rand.";
    await patchSource(admin, source.id, { enabled: false, last_status: "error", last_error: error });
    return { ok: false, error };
  }

  /* Pesimist, INAINTE de citire si parsare: un fisier care umple memoria nu lasa
     in urma nicio exceptie de prins. */
  await markRunStart(admin, source);

  /* ── Citirea adresei ── */
  const fetched = await safeFetchFile(source.url);
  if ("error" in fetched) {
    await markRun(admin, source, { ok: false, error: fetched.error });
    return { ok: false, error: fetched.error };
  }

  const read = await parseTabular(fetched.buffer, source.url, MAX_STOCK_ROWS);
  if ("error" in read) {
    await markRun(admin, source, { ok: false, error: read.error });
    return { ok: false, error: read.error };
  }
  /*
   * Un feed taiat NU se scrie. Aici nu e nimeni care sa se uite la ecran: cronul
   * ar actualiza o parte, ar raporta reusita, iar restul stocurilor ar ramane
   * vechi la nesfarsit, fara ca nimic sa arate a problema.
   */
  if (read.parsed.truncated) {
    const error = `Feedul are peste ${MAX_STOCK_ROWS.toLocaleString("ro-RO")} de randuri.`;
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }
  const parsed = read.parsed;

  if (!source.mapping.identifier) {
    const error = "Sursa nu are aleasa coloana cu identificatorul";
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  /*
   * Coloanele alese trebuie sa mai EXISTE in fisier.
   *
   * Furnizorul redenumeste o coloana si `cell()` incepe sa intoarca sir gol
   * pentru fiecare rand: feedul citea tot fisierul, nu schimba nimic, iar
   * rularea se raporta REUSITA cu zero modificari. Comerciantul vedea bifa verde
   * si credea ca stocurile lui sunt la zi.
   */
  const lipsa = coloaneLipsa(parsed, source.mapping, { updatePrice: source.options.update_price });
  if (lipsa.length > 0) {
    const error = `Fisierul nu mai are coloanele: ${lipsa.join(", ")}. Furnizorul le-a redenumit — alege-le din nou.`;
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  /*
   * ── Jobul anterior al acestei surse, daca a ramas neterminat ──
   *
   * Valorile de scris se ingheata in `product_import_rows.parsed` la stagiere si
   * se aplica mai tarziu ORBESTE, fara sa se recompare cu catalogul. Deci un job
   * vechi, reluat ore mai tarziu, scria valori invechite peste ce apucase sa
   * scrie intre timp unul mai nou. Se ajungea acolo usor: „Ruleaza acum" are
   * doar 25 de secunde, deci lasa des lucru in urma.
   *
   * Cel vechi se anuleaza inainte sa incepem: un plan de acum cateva ore nu mai
   * are ce cauta in catalog.
   */
  if (source.last_import_id) {
    const { data: vechi } = await admin
      .from("product_imports")
      .select("id, status")
      .eq("id", source.last_import_id)
      .eq("source", "stock_csv")
      .maybeSingle();

    if (vechi && vechi.status === "importing") {
      await admin
        .from("product_import_rows")
        .delete()
        .eq("import_id", vechi.id)
        .eq("status", "pending");
      await admin
        .from("product_imports")
        .update({
          status: "cancelled",
          error: "Anulat: a pornit o rulare mai noua a aceleiasi surse.",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", vechi.id);
    }
  }

  /* ── Planul, calculat pe catalogul de ACUM ── */
  const rows = readFeedRows(parsed, source.mapping, {
    updatePrice: source.options.update_price,
  });
  const catalog = await loadCatalog(admin, source.business_id, source.options.match_key);
  const plan = buildStockPlan(rows, catalog, {
    matchKey: source.options.match_key,
    updatePrice: source.options.update_price,
  });

  /* ── Jobul, in acelasi tabel ca incarcarile manuale ── */
  const { data: job, error: jobErr } = await admin
    .from("product_imports")
    .insert({
      business_id: source.business_id,
      user_id: source.user_id,
      source: "stock_csv",
      /*
       * `staging`, nu `importing`, cat timp randurile inca se scriu.
       *
       * Intre insert si ultimul lot din `stageStockPlan` pot trece zeci de
       * secunde (pana la 100 de insert-uri consecutive pentru un feed la limita).
       * Daca functia era ucisa la 60 s la mijloc, jobul ramanea `importing` cu
       * doar o parte din randuri, iar `resumeStalledStockJobs` il gasea mai
       * tarziu, il ducea pana la capatul randurilor EXISTENTE si il declara
       * „completed" — restul stocurilor nu mai erau scrise niciodata, si nimic
       * nu arata a problema.
       *
       * `resumeStalledStockJobs` nu se uita la `staging`, deci un job pe jumatate
       * pregatit nu poate fi luat de nimeni.
       */
      status: plan.changes.length > 0 ? "staging" : "completed",
      file_name: source.name || source.url,
      mapping: source.mapping as unknown as never,
      options: source.options as unknown as never,
      totals: {
        ...EMPTY_STOCK_TOTALS,
        total: plan.totalRows,
        unchanged: plan.unchanged,
        pending: plan.changes.length,
        /* Problemele se numara ACUM, din plan, si se poarta mai departe: din
           tabel n-ar mai putea fi numarate exact (vezi `countTotals`). */
        ...numaraProbleme(plan.issues),
      } as unknown as never,
      started_at: new Date().toISOString(),
      ...(plan.changes.length === 0 ? { finished_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    const error = jobErr?.message ?? "Nu am putut initia actualizarea";
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  /*
   * Se stagiaza si cand nu e NIMIC de scris.
   *
   * Prima varianta a acestei reparatii sarea peste stagiere daca planul n-avea
   * nicio schimbare — dar tocmai atunci raportul conteaza cel mai mult:
   * „feedul nu face nimic" se explica numai prin randurile respinse, iar ele se
   * scriu tot de `stageStockPlan`. Fara ele, comerciantul descarca un raport cu
   * antetul singur.
   */
  if (plan.changes.length > 0 || plan.issues.length > 0) {
    try {
      await stageStockPlan(admin, job.id, source.business_id, plan);
      /* Abia ACUM jobul devine bun de procesat si de reluat. Cand n-a fost
         nimic de scris, statusul lui e deja `completed` si asa ramane. */
      if (plan.changes.length > 0) {
        await admin
          .from("product_imports")
          .update({ status: "importing", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Eroare la pregatire";
      /* Randurile deja scrise se sterg: un job `failed` cu randuri `pending` ar
         ramane in tabel fara sa-l mai duca nimeni la capat. */
      await admin.from("product_import_rows").delete().eq("import_id", job.id);
      await admin
        .from("product_imports")
        .update({ status: "failed", error, finished_at: new Date().toISOString() })
        .eq("id", job.id);
      await markRun(admin, source, { ok: false, error });
      return { ok: false, error };
    }
  }

  /* ── Scrierea, pana la termen ── */
  let totals: StockTotals = {
    ...EMPTY_STOCK_TOTALS,
    total: plan.totalRows,
    unchanged: plan.unchanged,
    pending: plan.changes.length,
    /* Si aici, nu doar in randul din `product_imports`: cand planul n-are nimic
       de scris, bucla de mai jos nu ruleaza si `totals` pleaca spre `markRun`
       exact asa cum e. Fara randul asta, sursa raporta „0 actualizate din N" cu
       toate contoarele de probleme pe zero — adica fix intrebarea fara raspuns. */
    ...numaraProbleme(plan.issues),
  };
  let done = plan.changes.length === 0;

  while (!done && Date.now() < deadline) {
    const res = await processStockChunk(admin, job.id);
    totals = res.totals;
    done = res.done;
  }

  /*
   * O rulare neterminata NU e un esec: adresa a fost citita, planul e scris in
   * randuri, iar restul se termina la tura urmatoare. Marcata ca esec, ar fi
   * numarat degeaba spre dezactivarea automata.
   *
   * Ca s-a terminat sau nu se citeste din `totals.pending`, nu dintr-un status
   * nou: baza accepta doar „ok" si „error" pe `last_status` (CHECK verificat in
   * productie), iar o a treia valoare ar fi facut marcarea sa cada TACUT.
   */
  await markRun(admin, source, { ok: true, importId: job.id, totals });

  return { ok: true, importId: job.id, totals, unfinished: !done };
}

/**
 * Continua joburile de stoc ramase neterminate.
 *
 * Cronul de importuri de produse nu le atinge, pentru ca filtreaza pe o lista
 * permisa de surse. Deci feedurile de stoc au nevoie de propria plasa: o pagina
 * inchisa la mijlocul unei incarcari manuale ar lasa altfel jobul blocat pe veci.
 */
export async function resumeStalledStockJobs(
  admin: Client,
  deadline: number,
  staleMs: number,
): Promise<number> {
  const staleBefore = new Date(Date.now() - staleMs).toISOString();

  const { data: jobs, error } = await admin
    .from("product_imports")
    .select("id")
    .eq("source", "stock_csv")
    .eq("status", "importing")
    .lt("updated_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(5);

  /* Eroarea nu are voie sa arate ca „niciun job de reluat": vezi `dueSources`. */
  if (error) throw new Error(`Nu am putut citi joburile ramase: ${error.message}`);

  /*
   * Joburile abandonate in `staging` se matura.
   *
   * `staging` inseamna „randurile inca se scriu", si nimeni nu-l reia dinadins:
   * asa e sigur ca un plan pe jumatate pregatit nu se aplica niciodata. Dar daca
   * functia a fost ucisa exact acolo, jobul ar ramane pe veci, cu randurile lui
   * cu tot. Aici se sterg — sunt lipsite de valoare, planul se recalculeaza
   * oricum pe catalogul de atunci.
   */
  const { data: abandonate } = await admin
    .from("product_imports")
    .select("id")
    .eq("source", "stock_csv")
    .eq("status", "staging")
    .lt("updated_at", staleBefore)
    .limit(20);

  for (const job of abandonate ?? []) {
    await admin.from("product_import_rows").delete().eq("import_id", job.id);
    await admin
      .from("product_imports")
      .update({
        status: "failed",
        error: "Pregatirea nu s-a incheiat in timpul alocat. Se reia la tura urmatoare.",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  let resumed = 0;
  for (const job of jobs ?? []) {
    if (Date.now() >= deadline) break;

    /*
     * Fiecare job cu plasa lui.
     *
     * Fara `try/catch` per job, o singura exceptie iesea din functie si oprea
     * reluarea TUTUROR celorlalte. Cum lista e ordonata dupa `created_at` si
     * taiata la cinci, acelasi job stricat ramanea primul si la tura urmatoare —
     * deci blocajul nu se dezlega niciodata singur. Lectia e deja invatata in
     * `process-imports/route.ts`, unde fiecare job are propriul `try/catch`.
     */
    try {
      let done = false;
      while (!done && Date.now() < deadline) {
        const res = await processStockChunk(admin, job.id);
        done = res.done;
      }
      /* Se numara DUPA, nu inainte: altfel un job care a crapat imediat era
         raportat cronului ca reluat cu bine. */
      resumed++;
    } catch (e) {
      logError({
        action: "resumeStalledStockJobs",
        message: e instanceof Error ? e.message : "reluare esuata",
        details: { importId: job.id },
        severity: "error",
      });
    }
  }
  return resumed;
}
