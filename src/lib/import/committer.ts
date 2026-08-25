// Writes StagedProduct[] into the DB in resumable chunks.
// Owns: plan-limit enforcement, batch slug dedupe, category-tree upsert,
// insert/upsert by external_id, and the background image-rehost phase.
// Driven by processImport(), which both the server action and the cron call.

import { logError } from "@/lib/error-logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouSyncMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolSyncMany } from "@/lib/trendyol/queue";
import { enqueueEmagSyncMany, publicaPeEmagMany } from "@/lib/emag/queue";
import { getProductLimit, numaraProduseleContului } from "@/lib/plan-limits";
import type {
  ImportOptions,
  ImportStatus,
  ImportTotals,
  StagedProduct,
  ValidationSummary,
} from "./types";
import { EMPTY_TOTALS } from "./types";
import { rehostProductImages, rehostImageUrl, needsRehost, isR2Url, type CacheRehostare } from "./image-rehost";
import { parseShippingClasses } from "@/lib/shipping/rules";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";

type Admin = ReturnType<typeof createAdminClient>;

/*
 * Cate produse pe tick.
 *
 * A stat la 40 fiindca ATAT incapea: trei cereri de fiecare produs faceau un tick
 * de ~6,5 s, si opt tick-uri umpleau bugetul de 60 s al functiei. Ridicat singur,
 * n-ar fi schimbat nimic — la 100 ar fi incaput trei tick-uri in loc de opt, deci
 * 300 de produse in loc de 320.
 *
 * De cand scrierile merg in valuri (vezi `scrieProdusele`), un tick tine ~1 s, si
 * abia acum marimea bucatii chiar cumpara ceva: 8 x 200 = 1.600 de produse pe
 * ridicare, in loc de 320.
 *
 * Nu creste riscul la o functie taiata de limita de timp: produsele se scriu in
 * valuri de opt, iar fiecare val isi marcheaza randurile inainte sa inceapa
 * urmatorul — deci fereastra „scris dar nemarcat" ramane de cel mult opt produse,
 * oricat de mare ar fi bucata.
 */
const COMMIT_CHUNK = 200;
const REHOST_CHUNK = 15; // products whose images are rehosted per tick (slower)
const STAGE_BATCH = 500; // import_rows inserted per batch

interface JobRow {
  id: string;
  business_id: string;
  user_id: string;
  source: string;
  status: string;
  options: unknown;
  totals: unknown;
}

// ── Staging ─────────────────────────────────────────────────────────────────

/** Persist canonical products as import rows so commits can resume statelessly. */
export async function stageProducts(
  admin: Admin,
  importId: string,
  businessId: string,
  products: StagedProduct[],
  importImages: boolean,
): Promise<{ total: number; imagesTotal: number }> {
  let imagesTotal = 0;
  const rows = products.map((p, i) => {
    if (importImages) imagesTotal += p.images.length;
    return {
      import_id: importId,
      business_id: businessId,
      row_index: i,
      parsed: p as unknown as never,
      external_id: p.external_id,
      status: "pending",
    };
  });

  for (let i = 0; i < rows.length; i += STAGE_BATCH) {
    const { error } = await admin.from("product_import_rows").insert(rows.slice(i, i + STAGE_BATCH));
    if (error) throw new Error(error.message);
  }
  return { total: products.length, imagesTotal };
}

// ── Validation (pure, used for the review step) ──────────────────────────────

export function validateStaged(
  products: StagedProduct[],
  opts: { existingCategories: Set<string>; currentCount: number; limit: number },
): ValidationSummary {
  const errors: ValidationSummary["errors"] = [];
  const warnings: ValidationSummary["warnings"] = [];
  const newCategories = new Set<string>();
  let valid = 0;

  products.forEach((p, i) => {
    const name = (p.name ?? "").trim();
    if (!name) {
      errors.push({ row_index: i, name: name || `Rand ${i + 1}`, message: "Lipseste numele produsului" });
      return;
    }
    if (!(p.price > 0)) {
      errors.push({ row_index: i, name, message: "Pret lipsa sau invalid" });
      return;
    }
    valid++;
    if (p.images.length === 0) warnings.push({ row_index: i, name, message: "Produs fara imagini" });
    const leaf = p.category_path[p.category_path.length - 1];
    if (leaf && !opts.existingCategories.has(leaf.toLowerCase())) newCategories.add(leaf);
  });

  if (opts.limit !== Infinity && opts.currentCount + valid > opts.limit) {
    const importable = Math.max(0, opts.limit - opts.currentCount);
    warnings.push({
      row_index: -1,
      name: "Limita de plan",
      message: `Planul tau permite ${opts.limit} produse. Vor fi importate maximum ${importable}, restul vor fi sarite.`,
    });
  }

  return { total: products.length, valid, errors, warnings, newCategories: [...newCategories] };
}

// ── Commit phase ─────────────────────────────────────────────────────────────

interface CommitDeltas {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Randurile de stagiere ale unui import incheiat, sterse cand nu mai spun nimic.
 *
 * `product_import_rows` stageaza FIECARE rand al fisierului si nu se curata
 * niciodata: 8.331 de randuri si 25 MB acumulate din importuri de mult terminate.
 * Bomba nu e insa istoricul, ci feedul de stocuri — `stock-feed/runner.ts`
 * stageaza un set COMPLET la fiecare rulare ORARA a fiecarei surse. Zero surse
 * configurate azi, dar cronul e deja programat: la prima sursa reala, tabela
 * creste cu tot fisierul in fiecare ora, pentru totdeauna.
 *
 * Se pastreaza `failed` si `skipped`: din ele se compune raportul de erori pe care
 * comerciantul il descarca din `/api/imports/[id]/error-report`. Randurile
 * reusite (`created`/`updated`) nu mai au niciun cititor odata ce produsul exista
 * — id-ul lui e deja pe produs.
 *
 * Esecul e inghitit deliberat: o curatare care nu reuseste n-are voie sa faca un
 * import incheiat sa para picat. Randurile raman, si le ia urmatoarea trecere.
 */
/**
 * Spune canalelor de vanzare ce produse s-au schimbat la import.
 *
 * ═══ ⚠ IMPORTUL NU ANUNTA PE NIMENI (gasit 24.08.2026) ═══
 *
 * `grep -ci enqueue` da ZERO in toata calea de import: nici aici, nici in
 * `import.actions.ts`, nici in cronul `process-imports`. Committer-ul scrie direct in
 * `products` si tace.
 *
 * Iar calea NORMALA de salvare a produsului le anunta pe toate cinci — `product.actions.ts`
 * la creare si la editare: GMC, OLX, About You, Trendyol, eMAG. Deci un produs editat din
 * panou pleaca peste tot, iar acelasi produs editat prin CSV nu pleaca nicaieri.
 *
 * ⚠ CE PIERDE COMERCIANTUL: un produs publicat pe eMAG, actualizat prin CSV, ramane acolo
 * cu titlul, descrierea si imaginile VECHI. Iar `sync_continut` e pornit implicit, deci
 * continutul CHIAR ar fi plecat daca s-ar fi pus ceva in coada. Nu e o alegere, e o
 * lipsa.
 *
 * ⚠ SI NU E NUMAI eMAG. Auditul extern l-a incadrat ca defect eMAG; reparat asa, ar fi
 * ramas patru canale rupte. Committer-ul de feed de stocuri chiar anunta
 * (`stock-feed/committer.ts`), deci gaura e a acestui committer, nu un tipar al casei.
 *
 * ═══ ⚠ DE CE ABIA LA SFARSIT, NU LA FIECARE BUCATA ═══
 *
 * Imaginile se rehosteaza DUPA scrierea produselor, intr-o faza separata. Anuntat mai
 * devreme, marketplace-ul ar fi primit adresa de la furnizor, iar cateva secunde mai
 * tarziu Edinio ar fi avut alta — deci ori poza straina la ei, ori inca o trimitere.
 *
 * Se cheama la AMANDOUA punctele terminale, ca si curatarea: importurile cu imagini se
 * termina pe cealalta ramura, si tocmai alea au cele mai multe randuri.
 *
 * ⚠ Deriva NU tine locul: ea compara doar pret si stoc, iar continutul n-are nicio ruta
 * de reparatie acolo. Un titlu gresit la ei ramane gresit pentru totdeauna.
 */
async function anuntaCanalele(admin: Admin, importId: string, businessId: string): Promise<void> {
  try {
    /* ⚠ Se citeste o data, si numai pentru eMAG: celelalte canale n-au publicare
       automata legata de import. */
    const { data: setari, error: eSetari } = await admin
      .from("store_settings").select("emag_config").eq("business_id", businessId).maybeSingle();

    /*
     * ⚠ O CITIRE PICATA ARATA EXACT CA „AUTO_PUBLISH E STINS" (25.08.2026).
     *
     * Fara `error`, `setari` iesea `null`, `autoPublish` iesea `false`, si lotul de produse
     * NOI dintr-un import nu mai intra pe calea de publicare. Nicaieri nicio urma: importul
     * se incheia cu bine, iar comerciantul care bifase „Publică automat produsele noi"
     * ramanea sa se uite la un catalog nepublicat fara sa stie de ce.
     *
     * ⚠ SI NU SE REPARA SINGUR: plasa de siguranta cere `last_synced_at is not null`, iar
     * un produs care n-a plecat niciodata n-are asa ceva. Nici urmatoarea editare nu-l
     * reia — acolo `produsNou` e fals.
     *
     * ⚠ NU SE OPRESTE ANUNTUL, se scrie doar. Celelalte canale (Google, OLX, About You,
     * Trendyol) n-au nicio treaba cu steagul asta si trebuie anuntate oricum; iar
     * publicarea ramane cu putinta din cardul „De publicat". Transformam o pierdere muta
     * intr-una masurabila, fara sa luam si ce merge.
     */
    if (eSetari) {
      await logError({
        action: "import.anunta-canalele",
        message: `setarile eMAG nu s-au putut citi, deci publicarea automata nu s-a putut hotari: ${eSetari.message}`,
        details: { importId },
        businessId, severity: "warning",
      });
    }

    const autoPublish =
      ((setari?.emag_config ?? {}) as { auto_publish?: boolean }).auto_publish === true;

    /* ⚠ INAINTE de curatare: `curataRandurileReusite` sterge chiar randurile astea. */
    const { data, error } = await admin
      .from("product_import_rows")
      .select("product_id, status")
      .eq("import_id", importId)
      .in("status", ["created", "updated"]);
    if (error) throw error;

    /*
     * ═══ ⚠ „NOU" SI „ACTUALIZAT" NU SE ANUNTA LA FEL (25.08.2026) ═══
     *
     * `enqueueEmagSyncMany` sincronizeaza numai ofertele care EXISTA deja la ei — asa
     * trebuie, altfel orice atingere in masa ar publica tot catalogul. Dar un produs NOU
     * din import n-are inca oferta, deci pica prin filtru si nu se publica niciodata.
     *
     * ⚠ Iar comerciantul a bifat „Publică automat produsele noi". Pentru el, propozitia
     * aia nu are asterisc: un produs nou e nou indiferent daca a venit din formular, din
     * duplicare sau dintr-un CSV. Din formular mergea, din CSV nu.
     *
     * Cele actualizate raman pe calea obisnuita: ele au deja oferta, si `auto_sync` e
     * intrebarea potrivita pentru ele, nu `auto_publish`.
     */
    const noi: string[] = [];
    const atinse: string[] = [];
    for (const r of (data ?? []) as { product_id: string | null; status: string }[]) {
      if (!r.product_id) continue;
      atinse.push(r.product_id);
      if (r.status === "created") noi.push(r.product_id);
    }
    const unice = [...new Set(atinse)];
    const uniceNoi = [...new Set(noi)];
    if (unice.length === 0) return;

    /*
     * ⚠ Toate cinci, in paralel, si niciuna nu poate rupe importul: fiecare `enqueue…`
     * are deja `inghiteDarScrie` inauntru, iar `allSettled` prinde ce ar scapa printre.
     * Un import incheiat cu bine n-are voie sa para picat fiindca o coada de marketplace
     * n-a raspuns.
     */
    await Promise.allSettled([
      enqueueGmcSyncMany(businessId, unice),
      enqueueOlxSyncMany(businessId, unice),
      enqueueAboutYouSyncMany(businessId, unice),
      enqueueTrendyolSyncMany(businessId, unice),
      enqueueEmagSyncMany(businessId, unice),
      /*
       * ⚠ Produsele NOI, pe calea de publicare, si NUMAI daca omul a cerut-o.
       *
       * `publicaPeEmagMany` are `publicaSiFaraOferta: true`, deci trece de filtrul care
       * opreste restul. Chemata neconditionat, ar fi publicat pe eMAG orice import — chiar
       * si al unui comerciant care n-a bifat nimic. Steagul e intrebarea, nu importul.
       */
      autoPublish ? publicaPeEmagMany(businessId, uniceNoi) : Promise.resolve(0),
    ]);
  } catch (e) {
    /* ⚠ Se scrie, nu se inghite: un import care nu si-a anuntat canalele arata identic
       cu unul care si le-a anuntat, iar diferenta se vede abia in comenzi anulate. */
    console.error(`[import] anuntarea canalelor pentru ${importId} a esuat:`, e);
  }
}

async function curataRandurileReusite(admin: Admin, importId: string): Promise<void> {
  const { error } = await admin
    .from("product_import_rows")
    .delete()
    .eq("import_id", importId)
    .in("status", ["created", "updated"]);
  if (error) console.error(`[import] curatarea randurilor pentru ${importId} a esuat:`, error.message);
}

async function commitChunk(admin: Admin, job: JobRow): Promise<{ deltas: CommitDeltas; remaining: number }> {
  const businessId = job.business_id;
  const options = job.options as unknown as ImportOptions;
  const source = job.source;
  const deltas: CommitDeltas = { created: 0, updated: 0, skipped: 0, failed: 0 };

  /*
   * ═══ ⚠ O CITIRE PICATA NU INSEAMNA „NU MAI E NIMIC DE IMPORTAT" ═══
   *
   * Fara `error` destructurat, o pana de o clipa da `pending = null`, iar randul de mai jos
   * intoarce `remaining: 0`. Atunci `processImport` muta jobul pe „gata", anunta canalele de
   * vanzare si porneste publicarea — cu randuri INCA nescrise. Comerciantul vede „import
   * terminat" si un catalog incomplet, fara nicio urma care sa spuna de ce.
   *
   * ⚠ E ACEEASI CITIRE PE CARE AM INCHIS-O ASTAZI LA REHOSTUL IMAGINILOR, si i-am lasat sora
   * neatinsa. Regula casei: „nu stiu cate au ramas" inseamna REIA, niciodata zero.
   */
  const { data: pending, error: ePending } = await admin
    .from("product_import_rows")
    .select("id, row_index, parsed, external_id")
    .eq("import_id", job.id)
    .eq("status", "pending")
    .order("row_index", { ascending: true })
    .limit(COMMIT_CHUNK);

  if (ePending) throw new Error(`randurile de import nu s-au putut citi: ${ePending.message}`);
  if (!pending || pending.length === 0) return { deltas, remaining: 0 };

  // Plan limit + current usage.
  /* ⚠ O citire picata ar fi facut, pentru o clipa, dintr-un plan platit unul gratuit — iar
     limita mai mica ar fi respins randuri legitime, care apoi s-ar fi marcat „esuate". */
  const { data: profile, error: ePlan } = await admin
    .from("users_profile").select("plan").eq("id", job.user_id).single();
  if (ePlan) throw new Error(`planul contului nu s-a putut citi: ${ePlan.message}`);
  const limit = getProductLimit(profile?.plan ?? "free");
  // Pe CONT, nu pe magazin: altfel al doilea magazin dubla limita la import.
  let currentCount = await numaraProduseleContului(admin, job.user_id);

  // Preload existing slugs + category tree for in-memory dedupe/upsert.
  const slugSet = await loadSlugs(admin, businessId);
  const catMap = await loadCategories(admin, businessId);
  // Shipping classes are keyed by name in the CSV; map them to their stored ids.
  const shipClassMap = await loadShippingClasses(admin, businessId);

  /*
   * ═══ DOUA FAZE: pregatire SECVENTIALA, apoi scriere PARALELA ═══
   *
   * Masurat inainte: ~130 de cereri la baza pe un tick de 40 de produse — trei de
   * fiecare produs (cautarea la suprascriere, scrierea, marcarea randului) plus
   * cele fixe. La ~50 ms fiecare, un tick tinea ~6,5 s, iar opt tick-uri umpleau
   * exact bugetul de 60 s al functiei.
   *
   * De asta ridicarea lui `COMMIT_CHUNK` NU ajuta cu nimic, desi pare reparatia
   * evidenta: la 100 de produse pe bucata, un tick ar tine 17 s si ar incapea trei
   * — adica 300 de produse pe rulare, in loc de 320. Constrangerea nu e marimea
   * bucatii, e numarul de dus-intorsuri.
   *
   * Ce NU se poate paraleliza, si de asta exista faza intai:
   *
   *   - `dedupeSlug` MUTA `slugSet`. In paralel, doua produse cu acelasi nume ar
   *     primi acelasi slug, si al doilea ar pica pe unicitate.
   *   - `upsertCategoryPath` MUTA `catMap` si poate CREA categorii. In paralel,
   *     doua produse din aceeasi categorie noua ar crea-o de doua ori.
   *   - limita de plan se citeste si se creste; decisa in paralel, ar lasa sa
   *     treaca mai multe produse decat permite planul.
   *
   * Ce ramane dupa aceea — scrierea produsului si marcarea randului — e
   * independent de la un produs la altul, deci merge in valuri.
   */

  /*
   * Cautarea la suprascriere, o SINGURA data pentru toata bucata.
   *
   * Era cate un `maybeSingle()` de fiecare produs: patruzeci de dus-intorsuri ca
   * sa afli patruzeci de id-uri care incap intr-o interogare.
   */
  const idDupaExternal = new Map<string, string>();
  if (options.overwrite_existing) {
    const externals = [...new Set(
      pending.map((r) => (r.parsed as unknown as StagedProduct | null)?.external_id)
             .filter((x): x is string => Boolean(x)))];
    if (externals.length > 0) {
      const { data: existente, error } = await admin
        .from("products")
        .select("id, external_id")
        .eq("business_id", businessId)
        .eq("source", source)
        .in("external_id", externals);
      // O citire picata NU se ia drept „niciunul nu exista": asa s-ar crea
      // duplicate pentru produse care exista deja. Se opreste bucata, se reia.
      if (error) throw new Error(`cautarea produselor existente a esuat: ${error.message}`);
      for (const e of existente ?? []) {
        if (e.external_id) idDupaExternal.set(e.external_id as string, e.id as string);
      }
    }
  }

  const deScris: ProdusPregatit[] = [];
  const deEsuat: { rowId: string; motiv: string }[] = [];

  // ── Faza 1: pregatire, un produs dupa altul ────────────────────────────────
  for (const row of pending) {
    const p = row.parsed as unknown as StagedProduct | null;
    const rowId = row.id;

    if (!p || !(p.name ?? "").trim()) {
      deEsuat.push({ rowId, motiv: "Lipseste numele produsului" });
      continue;
    }
    if (!(p.price > 0)) {
      deEsuat.push({ rowId, motiv: "Pret lipsa sau invalid" });
      continue;
    }

    const existingId = (options.overwrite_existing && p.external_id)
      ? idDupaExternal.get(p.external_id) ?? null
      : null;

    /*
     * Limita de plan atinsa: se marcheaza TOT restul dintr-o data si se iese.
     *
     * `currentCount` doar creste, deci din clipa in care conditia e adevarata
     * ramane adevarata pentru fiecare rand care urmeaza — nu doar din bucata
     * asta, ci din tot importul. Pana la reparatia din 17.08 se afla asta din nou
     * la fiecare rand: un `UPDATE` propriu ca sa-l marcheze `skipped`, patruzeci
     * pe bucata. Masurat, 22 de minute intr-un job care crease ZECE produse.
     *
     * Numai CREARILE consuma din limita: o suprascriere nu adauga niciun produs.
     */
    if (!existingId && limit !== Infinity && currentCount >= limit) {
      // Ce s-a pregatit pana aici se scrie mai jos; restul se marcheaza deodata.
      await scrieMarcaje(admin, deEsuat);
      deltas.failed += deEsuat.length;
      await scrieProdusele(admin, businessId, deScris, deltas);
      const { count, error: eSarite } = await admin
        .from("product_import_rows")
        .update({ status: "skipped", error: "Limita de plan atinsa" }, { count: "exact" })
        .eq("import_id", job.id)
        .eq("status", "pending");
      /*
       * ⚠ A TREIA SORA DIN ACEEASI FAMILIE, si ultima (25.08.2026, seara).
       *
       * Fara `error`, o scriere picata lasa randurile pe `pending`, dar `remaining: 0` de mai
       * jos declara importul TERMINAT. Se anunta canalele de vanzare, porneste publicarea, iar
       * randurile raman nescrise — exact tiparul inchis dimineata la rehostul imaginilor si
       * dupa-amiaza la citirea randurilor.
       *
       * ⚠ „Nu stiu daca s-a scris" inseamna REIA, niciodata zero.
       */
      if (eSarite) {
        throw new Error(`randurile peste limita planului nu s-au putut marca: ${eSarite.message}`);
      }
      deltas.skipped += count ?? 0;
      return { deltas, remaining: 0 };
    }

    const category = await upsertCategoryPath(admin, businessId, p.category_path, catMap);
    // Match the CSV shipping-class name to a stored class id (case-insensitive); unknown -> standard.
    const shippingClassId = p.shipping_class
      ? shipClassMap.get(p.shipping_class.trim().toLowerCase()) ?? null
      : null;

    const payload = buildPayload(p, businessId, source, category, shippingClassId);
    // Slugul se rezerva ACUM, cat suntem inca secventiali.
    const slug = existingId ? null : dedupeSlug(payload.slug, slugSet);

    deScris.push({ rowId, payload, slug, existingId });
    /*
     * Se numara la PREGATIRE, nu dupa ce insertul reuseste.
     *
     * Un insert picat lasa deci un produs fantoma in socoteala, si importul se
     * poate opri cu un produs mai devreme decat ar fi trebuit. Am ales asta anume:
     * cealalta greseala — sa numeri doar reusitele si sa afli prea tarziu — trece
     * comerciantul PESTE limita platita. Mai bine un produs in minus decat un plan
     * incalcat, mai ales ca insert-urile picate sunt rare.
     */
    if (!existingId) currentCount++;
  }

  // ── Faza 2: scrierea, in valuri ────────────────────────────────────────────
  await scrieMarcaje(admin, deEsuat);
  deltas.failed += deEsuat.length;
  await scrieProdusele(admin, businessId, deScris, deltas);


  /* ⚠ Perechea de sus: `remaining ?? 0` pe o numaratoare picata declara importul terminat.
     `count` poate fi `null` SI cand cererea a mers, deci se verifica `error`, nu valoarea. */
  const { count: remaining, error: eRamase } = await admin
    .from("product_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", job.id)
    .eq("status", "pending");

  if (eRamase) throw new Error(`randurile ramase nu s-au putut numara: ${eRamase.message}`);

  return { deltas, remaining: remaining ?? 0 };
}

/**
 * Cate produse se scriu deodata.
 *
 * Scrierea unui produs si marcarea randului lui sunt independente de ale
 * celorlalte — tot ce era comun (slugul rezervat, categoria creata, limita de
 * plan) s-a hotarat deja, secvential, in faza intai.
 *
 * Opt, nu mai mult: fiecare produs inseamna doua scrieri, deci opt deodata sunt
 * saisprezece cereri in zbor. Peste atat nu mai castigi nimic — dus-intorsul nu
 * mai e cel care asteapta, ci baza — si incepi sa concurezi cu traficul real al
 * magazinelor, care merge pe aceeasi baza.
 */
const SCRIERI_DEODATA = 8;

/**
 * Marcheaza randurile picate, GRUPAT dupa motiv.
 *
 * Erau patruzeci de `UPDATE`-uri separate, cate unul de rand. Motivele sunt insa
 * cateva la numar („Lipseste numele produsului", „Pret lipsa sau invalid"), deci
 * o instructiune pe motiv le acopera pe toate.
 */
async function scrieMarcaje(
  admin: Admin,
  esuate: { rowId: string; motiv: string }[],
): Promise<void> {
  if (esuate.length === 0) return;
  const peMotiv = new Map<string, string[]>();
  for (const e of esuate) {
    const l = peMotiv.get(e.motiv);
    if (l) l.push(e.rowId); else peMotiv.set(e.motiv, [e.rowId]);
  }
  for (const [motiv, ids] of peMotiv) {
    await admin.from("product_import_rows").update({ status: "failed", error: motiv }).in("id", ids);
  }
}

interface ProdusPregatit {
  rowId: string;
  payload: ReturnType<typeof buildPayload>;
  slug: string | null;
  existingId: string | null;
}

/**
 * Scrie produsele pregatite, in valuri de `SCRIERI_DEODATA`.
 *
 * Fiecare produs isi pastreaza propriul verdict: o eroare pe unul il marcheaza pe
 * el `failed`, cu cauza reala, si nu atinge restul. De asta NU se face un singur
 * `insert` cu tot lotul, desi ar fi si mai putine cereri — la un lot, o singura
 * incalcare de unicitate ar pica toate patruzeci si i-ar spune comerciantului ca
 * n-a mers nimic, cand de fapt n-a mers unul.
 */
async function scrieProdusele(
  admin: Admin,
  businessId: string,
  pregatite: ProdusPregatit[],
  deltas: CommitDeltas,
): Promise<void> {
  for (let i = 0; i < pregatite.length; i += SCRIERI_DEODATA) {
    await Promise.all(pregatite.slice(i, i + SCRIERI_DEODATA).map(async (it) => {
      if (it.existingId) {
        // Slugul existent se pastreaza (ca sa nu se ciocneasca); restul se scrie.
        const { slug: _slug, ...rest } = it.payload;
        void _slug;
        const { error } = await admin
          .from("products")
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq("id", it.existingId)
          .eq("business_id", businessId);
        if (error) {
          // Pastreaza cauza reala (trunchiata) — un mesaj generic a ascuns o ora
          // de depanare cand toate randurile picau pe unicitatea slug-ului.
          await failRow(admin, it.rowId, `Eroare la actualizare: ${(error.message ?? "necunoscuta").slice(0, 120)}`);
          deltas.failed++;
          return;
        }
        await admin.from("product_import_rows")
          .update({ status: "updated", product_id: it.existingId, error: null }).eq("id", it.rowId);
        deltas.updated++;
        return;
      }

      /*
       * ═══ ⚠ INSERTUL SI MARCAREA RANDULUI NU SUNT ATOMICE ═══
       *
       * Produsul se scrie, apoi randul de import se marcheaza „created". Daca a doua scriere
       * pica, randul ramane `pending`, iar trecerea urmatoare il ia de la capat si creeaza AL
       * DOILEA produs. Unicitatea `(business_id, source, external_id)` nu ajuta: ea cere
       * `external_id`, iar importurile generice n-au. Slugul se dedubleaza, deci al doilea
       * primeste alt slug si trece nestingherit.
       *
       * ⚠ SE REPARA CU O CHEIE DE IDEMPOTENTA, nu cu o tranzactie distribuita. `import_row_id`
       * poarta randul care a creat produsul, cu index unic partial. Atunci reluarea nu mai
       * POATE crea un al doilea: se loveste de unicitate, iar mai jos se recupereaza id-ul
       * produsului care exista deja si se marcheaza randul.
       *
       * Alternativa era un RPC care sa faca ambele intr-o tranzactie — corect, dar ar fi mutat
       * toata calea de import in SQL: mult risc pe un drum care merge, pentru o pana care
       * trebuie sa cada exact intre doua scrieri.
       */
      const { data: inserted, error } = await admin
        .from("products")
        .insert({ ...it.payload, slug: it.slug, import_row_id: it.rowId } as never)
        .select("id")
        .single();

      let productId = inserted?.id ?? null;

      /* ⚠ Numele indexului se cauta in TOT ce trimite PostgREST, nu doar in `message`:
         la unele versiuni el sta in `details`, iar o cautare doar pe `message` ar fi ratat
         chiar cazul pentru care s-a facut cheia — si l-ar fi raportat drept slug duplicat. */
      const spuneCheia = error?.code === "23505"
        && `${error.message ?? ""} ${error.details ?? ""}`.includes("products_import_row_uidx");

      if (spuneCheia) {
        /* ⚠ Produsul CHIAR s-a creat la o trecere dinainte, doar marcarea randului s-a pierdut.
           Nu e un duplicat de slug: e chiar reluarea pe care cheia o face inofensiva. */
        const { data: deja } = await admin
          .from("products").select("id")
          .eq("business_id", businessId).eq("import_row_id", it.rowId).maybeSingle();
        productId = deja?.id ?? null;
      } else if (error || !inserted) {
        const cause = error?.code === "23505"
          ? "Produs duplicat (slug deja existent)"
          : `Eroare la salvare: ${(error?.message ?? "necunoscuta").slice(0, 120)}`;
        await failRow(admin, it.rowId, cause);
        deltas.failed++;
        return;
      }

      if (!productId) {
        await failRow(admin, it.rowId, "Produsul s-a creat, dar id-ul nu s-a putut citi");
        deltas.failed++;
        return;
      }

      /* ⚠ Daca marcarea pica ACUM, randul ramane `pending` si se reia — dar cheia de mai sus
         face ca reluarea sa adopte produsul existent, nu sa creeze inca unul. Se scrie totusi
         in jurnal: o pana care se repeta ar tine jobul in `committing` la nesfarsit, si atunci
         trebuie sa se vada CE anume nu se poate scrie, nu doar ca nu se termina. */
      const { error: eMarcaj } = await admin.from("product_import_rows")
        .update({ status: "created", product_id: productId, error: null }).eq("id", it.rowId);
      if (eMarcaj) {
        await logError({
          action: "import.commit",
          message: `produsul s-a creat dar randul n-a putut fi marcat: ${eMarcaj.message}`,
          details: { rowId: it.rowId, productId },
          businessId, severity: "warning",
        });
        return;
      }
      deltas.created++;
    }));
  }
}

// ── Image rehost phase ───────────────────────────────────────────────────────

/*
 * =========== N-AM PUTUT INTREBA NU INSEAMNA NU MAI E NIMIC DE FACUT (25.08.2026) ===========
 *
 * Toate cele patru atingeri de baza din functia asta erau oarbe: `{ data }` fara `error`,
 * iar PostgREST nu arunca la un refuz - intoarce `{ data: null, error }`. Deci o singura
 * interogare picata facea ca faza sa se declare INCHEIATA.
 *
 * CE URMEAZA DUPA INCHEIERE: apelantul vede `remaining === 0`, pune importul pe
 * "completed" si cheama `anuntaCanalele` - adica eMAG primeste produsul inainte ca starea
 * lui la noi sa fie sigura. Cu `auto_publish` bifat, produsele NOI se si publica asa.
 *
 * CE RAMANE STRICAT, si nu se repara singur: `images_done = true` si `status =
 * "completed"` sunt fapte false scrise pe disc, iar randurile care le-ar fi putut
 * contrazice se sterg doua linii mai jos (`curataRandurileReusite`). Nu exista trecere
 * urmatoare: cronul nu mai ridica jobul, si nimic nu recauta produse cu adrese externe.
 * Produsele raman cu pozele furnizorului - merg azi, se sparg in ziua in care el le muta.
 *
 * CARE DINTRE CELE PATRU E CEL MAI PROBABIL, masurat pe biblioteca: postgrest-js
 * reincearca singura de trei ori, dar NUMAI pentru GET/HEAD. Cele trei citiri au deci
 * plasa; `update`-ul (PATCH) e explicit exclus. Adica tocmai scrierea - singura care
 * pierde o adresa R2 deja platita - e cea fara plasa.
 *
 * `incert` spune "nu stiu daca s-a terminat". Apelantul incheie numai cand stie.
 */
async function rehostChunk(admin: Admin, job: JobRow): Promise<{ done: number; failed: number; remaining: number; incert?: boolean }> {
  const businessId = job.business_id;
  const cache: CacheRehostare = new Map();
  let imagesDone = 0;
  let imagesFailed = 0;

  const { data: rows, error: eRows } = await admin
    .from("product_import_rows")
    .select("id, product_id")
    .eq("import_id", job.id)
    .eq("images_done", false)
    .in("status", ["created", "updated"])
    .order("row_index", { ascending: true })
    .limit(REHOST_CHUNK);

  if (eRows) {
    /* `remaining: 1` tine jobul in `rehosting_images`, deci cronul il ridica din nou.
       Zero ar fi insemnat "gata", si ar fi pornit anuntul catre canale. */
    await logError({
      action: "import.rehost",
      message: `randurile de rehostat nu s-au putut citi: ${eRows.message}`,
      details: { importId: job.id },
      businessId, severity: "warning",
    });
    return { done: 0, failed: 0, remaining: 1, incert: true };
  }

  if (!rows || rows.length === 0) return { done: 0, failed: 0, remaining: 0 };

  /*
   * Produsele se rehosteaza in BAZIN, nu unul dupa altul.
   *
   * Rehostarea e partea grea a importului — 88% din durata lui, masurat: 2.828 de
   * imagini, cate ~1,17 s fiecare, toate la coada. Fiecare imagine inseamna o
   * descarcare de pe serverul altcuiva si o urcare in R2, deci timpul e aproape
   * numai ASTEPTARE; puse in paralel, se suprapune.
   *
   * PATRU, nu cincisprezece: sursa e de obicei un singur CDN al furnizorului, iar
   * o rafala prea larga se intoarce ca `429` — adica imagini pierdute, nu doar
   * mai lente. Patru produse deodata, fiecare cu imaginile lui cerute in paralel,
   * inseamna un varf de ordinul zecilor de cereri, nu al sutelor. Numarul asta se
   * poate ridica, dar numai dupa ce se masoara pe un import real.
   *
   * Duplicarea e imposibila: cache-ul tine PROMISIUNI, deci doi lucratori care
   * cer aceeasi adresa in aceeasi clipa asteapta amandoi acelasi rezultat, si in
   * R2 ajunge un singur obiect. Vezi `CacheRehostare`.
   */
  const PARALEL = 4;
  for (let i = 0; i < rows.length; i += PARALEL) {
    await Promise.all(rows.slice(i, i + PARALEL).map(async (row) => {
    if (!row.product_id) {
      await admin.from("product_import_rows").update({ images_done: true }).eq("id", row.id);
      return;
    }
    const { data: product, error: eProdus } = await admin.from("products").select("images, page_sections").eq("id", row.product_id).single();
    /* Fara asta, o citire picata dadea `product = null`, deci zero imagini, deci "nimic
       de rehostat" - si randul se marca `images_done: true` cateva linii mai jos. Randul
       se lasa NEATINS ca sa fie luat din nou la trecerea urmatoare. */
    if (eProdus) {
      imagesFailed += 1;
      await logError({
        action: "import.rehost",
        message: `produsul nu s-a putut citi pentru rehostare: ${eProdus.message}`,
        details: { importId: job.id, productId: row.product_id },
        businessId, severity: "warning",
      });
      return;
    }
    const images = Array.isArray(product?.images) ? (product!.images as string[]) : [];
    const update: Record<string, unknown> = {};

    if (images.length && needsRehost(images)) {
      const res = await rehostProductImages(images, businessId, job.id, cache);
      imagesDone += res.done;
      imagesFailed += res.failed;
      update.images = res.images as unknown as never;
    }

    // Rehost per-variant images too, reusing the SAME cache: a variant image shared
    // with the gallery resolves to the identical rehosted URL, so it can never end up
    // as an external duplicate of the gallery image on the storefront. Runs after the
    // gallery loop above so the cache is already primed with the shared URLs.
    const ps = (product?.page_sections ?? null) as { variants?: { combinations?: { image?: string }[] } } | null;
    const combos = ps?.variants?.combinations;
    if (ps && Array.isArray(combos) && combos.some((c) => c?.image && !isR2Url(c.image))) {
      for (const c of combos) {
        if (c?.image && !isR2Url(c.image)) {
          const res = await rehostImageUrl(c.image, businessId, job.id, cache);
          c.image = res.url;
        }
      }
      update.page_sections = ps as unknown as never;
    }

    if (Object.keys(update).length > 0) {
      const { error: eScriere } = await admin.from("products").update(update as never).eq("id", row.product_id);
      /*
       * CEL MAI SCUMP DINTRE CELE PATRU, SI SINGURUL FARA PLASA.
       *
       * Imaginile sunt DEJA urcate in R2 si platite. Daca scrierea adreselor pica si
       * randul s-ar marca totusi "gata", adresele acelea s-ar pierde pentru totdeauna:
       * cheia R2 se compune din `Date.now()` si `Math.random()` (`image-rehost.ts`), iar
       * cache-ul traieste doar cat o bucata. Deci nu se pot nici regasi, nici recalcula -
       * raman obiecte platite pe care nu le mai stie nimeni.
       *
       * Iar PATCH e chiar metoda pe care biblioteca NU o reincearca singura.
       */
      if (eScriere) {
        imagesFailed += 1;
        await logError({
          action: "import.rehost",
          message: `adresele rehostate nu s-au putut scrie: ${eScriere.message}`,
          details: { importId: job.id, productId: row.product_id },
          businessId, severity: "error",
        });
        return;
      }
    }
    await admin.from("product_import_rows").update({ images_done: true }).eq("id", row.id);
    }));
  }

  const { count: remaining, error: eRest } = await admin
    .from("product_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", job.id)
    .eq("images_done", false)
    .in("status", ["created", "updated"]);

  /* `remaining ?? 0` facea dintr-o numaratoare picata un "zero ramase", adica sfarsitul
     fazei. Aici se spune "nu stiu", si apelantul mai trece o data. */
  if (eRest) {
    await logError({
      action: "import.rehost",
      message: `cate randuri mai au imagini de rehostat nu s-a putut afla: ${eRest.message}`,
      details: { importId: job.id },
      businessId, severity: "warning",
    });
    return { done: imagesDone, failed: imagesFailed, remaining: 1, incert: true };
  }

  return { done: imagesDone, failed: imagesFailed, remaining: remaining ?? 0 };
}

// ── Orchestration tick ────────────────────────────────────────────────────────

/**
 * Advance an import by one chunk. Idempotent and safe to call repeatedly from
 * both the client loop and the cron fallback. Returns the new status + totals.
 */
export async function processImport(
  admin: Admin,
  importId: string,
): Promise<{ status: ImportStatus; totals: ImportTotals; done: boolean }> {
  const { data: jobRaw, error: eJob } = await admin
    .from("product_imports")
    .select("id, business_id, user_id, source, status, options, totals")
    .eq("id", importId)
    .single();

  /*
   * ═══ ⚠ „N-AM PUTUT CITI JOBUL" NU E „JOBUL NU EXISTA" (25.08.2026, auditul 9.6) ═══
   *
   * `error` nu se citea. La o pana de o clipa a bazei, `jobRaw` vine `null`, iar functia
   * raspundea `status: "failed", done: true` — adica exact ce raspunde pentru un import
   * chiar sters. Si `done: true` nu opreste doar bucla: pe calea din panou, apelantul
   * sterge apoi FISIERUL BRUT. Un import intreg pierdut, si nici macar reluabil, dintr-o
   * secunda de retea — iar comerciantul citeste „importul a esuat" despre un fisier bun.
   *
   * ⚠ ARUNCA, nu intoarce. Din cron, aruncarea e prinsa si scrisa, jobul ramane `importing`
   * si se reia la minutul urmator — de unde a ramas. Din panou, apelantul o prinde si
   * marcheaza importul picat, DAR nu mai sterge fisierul, deci se poate relua.
   *
   * ⚠ Lipsa adevarata ramane `failed`: un job sters chiar nu mai are ce continua.
   */
  if (eJob) throw new Error(`jobul de import nu s-a putut citi: ${eJob.message}`);

  if (!jobRaw) return { status: "failed", totals: EMPTY_TOTALS, done: true };
  const job = jobRaw as JobRow;

  /*
   * Bariera de siguranta: acest committer CREEAZA produse din
   * `product_import_rows.parsed`. Tabelul `product_imports` tine si joburi de alt
   * fel, cum e feedul de stocuri, la care `parsed` are cu totul alta forma.
   * Ajuns aici cu un astfel de job, ar incerca sa importe produse din stocuri.
   *
   * Apelantii filtreaza deja pe sursa, dar protectia nu trebuie sa depinda de
   * disciplina apelantului: e prea scump daca cineva uita.
   */
  /*
   * ⚠ `emag_api` E AICI DINADINS, SI NU CONTRAZICE REGULA „nu facem duplicate".
   *
   * Bariera asta e despre FORMA jobului, nu despre politica de duplicate: ea
   * opreste un job de stoc sa ajunga pe mana unui committer de produse. Iar
   * randurile venite din eMAG au chiar forma pe care o asteapta — `StagedProduct`.
   *
   * Duplicatele se opresc mai devreme, in `import-run.ts`: prin committer trec
   * NUMAI ofertele pentru care potrivirea a spus „nou". Cele legate nu ajung aici
   * niciodata. Lasat pe dinafara, importul din eMAG ar fi ramas inghetat la
   * „importing" pana l-ar fi sters cineva de mana — fiindca nimeni n-ar fi avut
   * voie sa-l duca la capat.
   */
  if (!["shopify_csv", "woo_csv", "generic_csv", "emag_api"].includes(job.source)) {
    return { status: job.status as ImportStatus, totals: EMPTY_TOTALS, done: true };
  }

  const options = job.options as unknown as ImportOptions;
  const totals: ImportTotals = { ...EMPTY_TOTALS, ...((job.totals as Partial<ImportTotals>) ?? {}) };

  if (job.status === "importing") {
    const { deltas, remaining } = await commitChunk(admin, job);
    totals.created += deltas.created;
    totals.updated += deltas.updated;
    totals.skipped += deltas.skipped;
    totals.failed += deltas.failed;

    let status: ImportStatus = "importing";
    const patch: Record<string, unknown> = { totals: totals as unknown as never, updated_at: new Date().toISOString() };
    if (remaining === 0) {
      const wantImages = options.import_images && totals.images_total > 0;
      status = wantImages ? "rehosting_images" : totals.failed > 0 ? "completed_with_errors" : "completed";
      patch.status = status;
      if (status !== "rehosting_images") patch.finished_at = new Date().toISOString();
    }
    await admin.from("product_imports").update(patch as never).eq("id", importId);
    // Importul s-a incheiat aici (fara pas de imagini): randurile reusite nu mai
    // au cititor. Vezi `curataRandurileReusite`.
    if (status === "completed" || status === "completed_with_errors") {
      /* ⚠ Anuntul INAINTEA curatarii: aceasta sterge chiar randurile din care se afla ce
         produse s-au atins. Vezi `anuntaCanalele`. */
      await anuntaCanalele(admin, importId, job.business_id);
      await curataRandurileReusite(admin, importId);
    }
    return { status, totals, done: status === "completed" || status === "completed_with_errors" };
  }

  if (job.status === "rehosting_images") {
    const { done, failed, remaining, incert } = await rehostChunk(admin, job);
    totals.images_done += done + failed; // count attempts so the bar reaches 100%

    let status: ImportStatus = "rehosting_images";
    const patch: Record<string, unknown> = { totals: totals as unknown as never, updated_at: new Date().toISOString() };
    /* `!incert`: faza se incheie numai cand chiar STIM ca nu mai e nimic. Vezi nota din
       `rehostChunk` - de aici pleaca `anuntaCanalele`, deci o incheiere pripita trimite
       produsul la eMAG inainte sa fie gata. */
    if (remaining === 0 && !incert) {
      status = totals.failed > 0 ? "completed_with_errors" : "completed";
      patch.status = status;
      patch.finished_at = new Date().toISOString();
    }
    await admin.from("product_imports").update(patch as never).eq("id", importId);
    // Al doilea punct terminal: dupa rehostarea imaginilor. Curatarea sta la
    // AMANDOUA, nu doar la primul — altfel importurile cu imagini nu s-ar curata
    // niciodata, si tocmai alea au cele mai multe randuri.
    if (status === "completed" || status === "completed_with_errors") {
      /* ⚠ Anuntul INAINTEA curatarii: aceasta sterge chiar randurile din care se afla ce
         produse s-au atins. Vezi `anuntaCanalele`. */
      await anuntaCanalele(admin, importId, job.business_id);
      await curataRandurileReusite(admin, importId);
    }
    return { status, totals, done: status === "completed" || status === "completed_with_errors" };
  }

  const status = job.status as ImportStatus;
  const done = status === "completed" || status === "completed_with_errors" || status === "failed" || status === "cancelled";
  return { status, totals, done };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPayload(
  p: StagedProduct,
  businessId: string,
  source: string,
  category: string | null,
  shippingClassId: string | null,
) {
  const page_sections: Record<string, unknown> = {};
  if (p.variants && p.variants.combinations.length > 0) page_sections.variants = p.variants;
  if (p.seo) page_sections.seo = p.seo;
  if (p.short_description) page_sections.short_description = p.short_description;
  if (p.stock_status) page_sections.stock_status = p.stock_status;
  if (p.low_stock_threshold != null) page_sections.low_stock_threshold = p.low_stock_threshold;
  if (p.dimensions && (p.dimensions.length || p.dimensions.width || p.dimensions.height)) page_sections.dimensions = p.dimensions;
  if (p.specifications && p.specifications.length > 0) page_sections.specifications = p.specifications;
  if (p.quantity_tiers) page_sections.quantity_tiers = p.quantity_tiers;
  // EAN/brand share page_sections.google with the product form (Google/Facebook feeds read them).
  const google: Record<string, string> = {};
  if (p.gtin) google.gtin = p.gtin;
  if (p.brand) google.brand = p.brand;
  if (Object.keys(google).length > 0) page_sections.google = google;

  return {
    business_id: businessId,
    name: p.name.trim(),
    slug: p.slug,
    description: p.description_html,
    price: p.price,
    compare_at_price: p.compare_at_price,
    category,
    sku: p.sku,
    // Always store the source URLs now; the rehost phase swaps them for R2 URLs.
    images: p.images.map((i) => i.src) as unknown as never,
    track_inventory: p.track_inventory,
    stock_quantity: p.track_inventory ? p.stock_quantity ?? 0 : null,
    is_featured: p.is_featured,
    // Per-product when the source provides it (generic "Publicat" column); preset
    // adapters set p.is_active = options.default_active, so they are unaffected.
    is_active: p.is_active,
    weight_grams: p.weight_grams,
    shipping_class: shippingClassId,
    page_sections: page_sections as unknown as never,
    tags: p.tags as unknown as never,
    source,
    external_id: p.external_id,
    sort_order: 0,
  };
}

async function loadSlugs(admin: Admin, businessId: string): Promise<Set<string>> {
  // Windowed past the 1000-row PostgREST cap: cu set incomplet, dedupeSlug
  // returna slug-uri deja existente in DB si TOATE insert-urile picau pe
  // constrangerea de unicitate (incident 25.07: job cu 100/100 esuate la un
  // catalog de peste 1000 de produse).
  const data = await fetchAllRowsStrict("import.commit.slugs", (from, to) =>
    admin.from("products").select("id, slug").eq("business_id", businessId).not("slug", "is", null).order("id").range(from, to)
  );
  return new Set(data.map((r) => r.slug as string));
}

/** Map each store shipping class NAME (lowercased) to its stored id, for CSV resolution. */
async function loadShippingClasses(admin: Admin, businessId: string): Promise<Map<string, string>> {
  const { data } = await admin
    .from("store_settings")
    .select("shipping_classes")
    .eq("business_id", businessId)
    .maybeSingle();
  const map = new Map<string, string>();
  for (const c of parseShippingClasses(data?.shipping_classes ?? [])) {
    const key = c.name.trim().toLowerCase();
    if (key) map.set(key, c.id);
  }
  return map;
}

function dedupeSlug(base: string | null, slugSet: Set<string>): string | null {
  if (!base) return null;
  if (!slugSet.has(base)) {
    slugSet.add(base);
    return base;
  }
  let n = 2;
  while (slugSet.has(`${base}-${n}`)) n++;
  const next = `${base}-${n}`;
  slugSet.add(next);
  return next;
}

interface CatNode {
  id: string;
  name: string;
}

async function loadCategories(admin: Admin, businessId: string): Promise<Map<string, CatNode>> {
  // Windowed past the 1000-row PostgREST cap — an incomplete dedup map would
  // make the committer re-insert categories that already exist.
  const data = await fetchAllRowsStrict("import.commit.categories", (from, to) =>
    admin.from("categories").select("id, name, parent_id").eq("business_id", businessId).order("id").range(from, to)
  );
  const map = new Map<string, CatNode>();
  for (const c of data) {
    map.set(catKey(c.parent_id, c.name), { id: c.id, name: c.name });
  }
  return map;
}

function catKey(parentId: string | null, name: string): string {
  return `${parentId ?? ""}::${name.trim().toLowerCase()}`;
}

async function upsertCategoryPath(
  admin: Admin,
  businessId: string,
  path: string[],
  catMap: Map<string, CatNode>,
): Promise<string | null> {
  let parentId: string | null = null;
  let leafName: string | null = null;

  for (const raw of path) {
    const name = raw.trim();
    if (!name) continue;
    const key = catKey(parentId, name);
    let node: CatNode | undefined = catMap.get(key);

    if (!node) {
      const ins = (await admin
        .from("categories")
        .insert({ business_id: businessId, name, parent_id: parentId, sort_order: 0 })
        .select("id, name")
        .single()) as { data: { id: string; name: string } | null };
      if (ins.data) {
        node = { id: ins.data.id, name: ins.data.name };
      } else {
        // Likely a concurrent insert hit the unique constraint; fetch the winner.
        const found = await findCategory(admin, businessId, name, parentId);
        if (found) node = found;
      }
      if (node) catMap.set(key, node);
    }

    if (node) {
      parentId = node.id;
      leafName = node.name;
    }
  }
  return leafName;
}

async function findCategory(
  admin: Admin,
  businessId: string,
  name: string,
  parentId: string | null,
): Promise<CatNode | null> {
  const base = admin.from("categories").select("id, name").eq("business_id", businessId).eq("name", name);
  const { data } = parentId
    ? await base.eq("parent_id", parentId).maybeSingle()
    : await base.is("parent_id", null).maybeSingle();
  return data ? { id: data.id, name: data.name } : null;
}

async function failRow(admin: Admin, rowId: string, message: string): Promise<void> {
  await admin.from("product_import_rows").update({ status: "failed", error: message }).eq("id", rowId);
}
