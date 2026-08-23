import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { marcajUrmator } from "@/lib/marketplace/marcaj";
import { emagGloballyEnabled, iesireEmag } from "@/lib/emag/auth";
import { citesteOferte, isEmagError } from "@/lib/emag/client";
import { esteDeconectatEmag, loadEmagContext, type ContextEmag } from "@/lib/emag/sync";
import { trimiteElement } from "@/lib/emag/trimite";
import { aduComenzile } from "@/lib/emag/orders";
import { urcaFacturaLaEmag, type Factura } from "@/lib/emag/facturi";
import type { EmagConfig, EmagOfertaCitita, StareOferta } from "@/lib/emag/types";
import type { OpEmag } from "@/lib/emag/queue";
import { eVandabila } from "@/lib/emag/rute";

/**
 * Trecerea din minut in minut a integrarii eMAG.
 *
 * ═══ DOI PASI, CU ROLURI DIFERITE ═══
 *
 *   1. COADA         — ce a schimbat comerciantul pleaca spre eMAG
 *   2. RECONCILIEREA — ce a hotarat eMAG se aduce inapoi
 *
 * Al doilea nu e un lux. Validarea la ei dureaza ore si nu ne anunta nimeni cand se
 * incheie: fara pasul asta, panoul ar arata „trimis" la nesfarsit pentru un produs
 * respins acum trei zile. Exact ce s-a intamplat la Trendyol.
 *
 * ═══ ⚠ RITMUL: 3 CERERI PE SECUNDA, CUMULAT ═══
 *
 * Nu pe magazin — pe TOT ce nu e comanda. Limita e tinuta in `client.ts`, cu o
 * galeata de jetoane, si de aceea nu se mai pune si aici: doua franari inmultite ar
 * fi facut trecerea de doua ori mai lunga fara niciun castig.
 *
 * ⚠ Cererile REFUZATE se numara si ele in limita lor. Deci o coada plina de elemente
 * care esueaza costa acelasi ritm ca una care reuseste — inca un motiv pentru care
 * un `refuz` arde o incercare si nu se reia la nesfarsit.
 *
 * ⚠ Documentatia lor cere sa nu se cheme la ore rotunde. Un cron din minut in minut
 * nu e o ora rotunda; pasii lenti se prind pe `getMinutes() % N`, deci nici ei nu
 * cad toti odata.
 */

export const maxDuration = 60;

type Admin = ReturnType<typeof createClient<Database>>;

/** Cate elemente de coada se revendica intr-o trecere. */
const LOT_COADA = 30;

/**
 * Dupa cate incercari se opreste un element.
 *
 * ⚠ SE NUMARA NUMAI REFUZURILE. Un 429 sau un 503 nu arde nimic: altfel cinci minute
 * de pana la eMAG ar goli cozile tuturor magazinelor, iar produsele ar ramane
 * nesincronizate fara ca nimeni sa afle. Vezi `ardeIncercare` din `errors.ts`.
 */
const INCERCARI_MAXIM = 5;

/** Cate magazine se reconciliaza intr-o trecere. */
const MAGAZINE_RECONCILIERE = 6;

/** Cate magazine isi aduc comenzile intr-o trecere. */
const MAGAZINE_COMENZI = 8;

/**
 * Cu cat se suprapune fereastra de comenzi peste marcajul trecut.
 *
 * ⚠ NU E O PRECAUTIE VAGA. Ceasul lor si al nostru nu bat la fel, iar o comanda
 * modificata chiar in secunda marcajului ar cadea exact intre doua ferestre — citita
 * de niciuna. Cinci minute de suprapunere costa cateva comenzi recitite (ingestul e
 * idempotent) si inchid gaura cu totul.
 */
const SUPRAPUNERE_MS = 5 * 60 * 1000;

/** Cate magazine isi urca facturile intr-o trecere. */
const MAGAZINE_FACTURI = 5;

/** Cate facturi se urca pentru un magazin intr-o trecere. */
const FACTURI_PE_TRECERE = 10;

/** ⚠ Maximul lor. Cerut mai mare, eMAG intoarce tot 100 fara sa spuna. */
const PE_PAGINA = 100;

interface ElementCoada {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: OpEmag;
  attempts: number;
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!emagGloballyEnabled()) {
    return NextResponse.json({ ok: true, oprit: "EMAG_LIVE=false" });
  }

  /*
   * ⚠ FARA IESIREA PE IP FIX NU SE INCEARCA NIMIC.
   *
   * eMAG accepta apeluri numai de la adrese albite. Plecate direct de pe Vercel, ele
   * ar primi un refuz care nu pomeneste nimic despre IP-uri — iar fiecare element
   * din coada si-ar arde cele cinci incercari pe un motiv pe care nimeni nu l-ar
   * ghici din mesaj. Mai bine nicio cerere si o urma limpede in jurnal.
   */
  const iesire = iesireEmag();
  if (iesire.eroare) {
    await logError({ action: "emag-sync", message: iesire.eroare, severity: "critical" });
    return NextResponse.json({ ok: false, error: iesire.eroare }, { status: 503 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let duse = 0, cazute = 0, reconciliate = 0, comenziNoi = 0, facturi = 0;
  const inceputulRularii = Date.now();

  /* Contextul unui magazin se citeste O DATA pe trecere: e o citire cu decriptare,
     iar coada poate avea zeci de elemente ale aceluiasi magazin. */
  const contexte = new Map<string, ContextEmag | null>();
  async function ctxPentru(businessId: string): Promise<ContextEmag | null> {
    if (contexte.has(businessId)) return contexte.get(businessId)!;
    const c = await loadEmagContext(admin, businessId);
    contexte.set(businessId, c);
    return c;
  }

  /* ── 1) Coada ──────────────────────────────────────────────────────────────
   *
   * ⚠ RANDURILE SE REVENDICA, NU SE CITESC.
   *
   * Cronul porneste din minut in minut si face apeluri externe care pot dura mai
   * mult de un minut. Cu un `select … limit N`, doua rulari ar citi ACELEASI randuri
   * si ar trimite de doua ori la eMAG. `revendica_din_coada` le incuie cu
   * `for update skip locked` si le pune un termen, deci al doilea lucrator primeste
   * randurile URMATOARE. Vezi `2026-08-19-lease-cozi-marketplace`.
   */
  const { data: revendicate, error: eCoada } = await admin.rpc("revendica_din_coada", {
    p_coada: "emag_sync_queue", p_limita: LOT_COADA,
  });
  if (eCoada) {
    await logError({
      action: "emag-sync",
      message: `coada nu s-a putut revendica: ${eCoada.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "coada indisponibila" }, { status: 503 });
  }

  const coada = ((revendicate ?? []) as unknown[]) as ElementCoada[];
  const peMagazin = new Map<string, ElementCoada[]>();
  for (const el of coada) {
    if (!peMagazin.has(el.business_id)) peMagazin.set(el.business_id, []);
    peMagazin.get(el.business_id)!.push(el);
  }

  for (const [businessId, elemente] of peMagazin) {
    const ctx = await ctxPentru(businessId);
    if (!ctx) {
      /*
       * ⚠ LIPSA CONTEXTULUI NU INSEAMNA „MAGAZIN DECONECTAT".
       *
       * `loadEmagContext` intoarce `null` si cand configurarea NU S-A PUTUT CITI.
       * Confundate, un hop de o secunda la baza ar fi aruncat toata munca
       * magazinului — inclusiv impingerile de stoc puse la coada dupa comenzi deja
       * incasate — fara log si fara urma.
       *
       * `esteDeconectatEmag` are trei raspunsuri. Cand nu se stie, coada ramane
       * neatinsa si se reia la trecerea urmatoare.
       */
      const deconectat = await esteDeconectatEmag(admin, businessId);
      if (deconectat === true) {
        await admin.from("emag_sync_queue").delete().in("id", elemente.map((e) => e.id));
      } else {
        await logError({
          action: "emag-sync",
          message: `configurarea magazinului nu s-a putut citi; coada de ${elemente.length} ramane neatinsa`,
          businessId,
          severity: "warning",
        });
      }
      continue;
    }

    for (const el of elemente) {
      if (!el.product_id) {
        await admin.from("emag_sync_queue").delete().eq("id", el.id);
        continue;
      }

      const r = await trimiteElement(admin, ctx, el.product_id, el.op);

      /* „Sarit" inseamna „nu era nimic de facut, si nu e o eroare". Iese din coada
         linistit: reincercat, si-ar arde incercarile pe un lucru care nu se schimba. */
      if (r.verdict === "sarit" || r.verdict === "reusit" || r.verdict === "reusit_cu_observatii") {
        await admin.from("emag_sync_queue").delete().eq("id", el.id);
        duse++;
        continue;
      }

      cazute++;

      if (r.verdict === "chei") {
        /*
         * ⚠ SE OPRESTE MAGAZINUL, NU ELEMENTUL. Acreditarile nu se repara singure,
         * iar mai departe n-am face decat sa ardem cererile lui degeaba — si sa-i
         * umplem coada de esecuri care arata ca defecte de produs.
         */
        await patchConfig(admin, businessId, { needs_reconnect: true });
        break;
      }

      if (r.verdict === "trecatoare") {
        /*
         * ⚠ NU SE ARDE NICIO INCERCARE. Doar se elibereaza revendicarea, ca elementul
         * sa poata fi luat la trecerea urmatoare. Numarate, cinci minute de 429 ar fi
         * golit definitiv coada unui magazin — chiar incidentul de la Trendyol.
         */
        await admin.from("emag_sync_queue")
          .update({ revendicat_pana: null, last_error: r.mesaj || null }).eq("id", el.id);
        continue;
      }

      /* Refuz: arde o incercare si scrie motivul. */
      const incercari = (el.attempts ?? 0) + 1;
      if (incercari >= INCERCARI_MAXIM) {
        await admin.from("emag_sync_queue").delete().eq("id", el.id);
        await logError({
          action: "emag-sync",
          message: `element abandonat dupa ${incercari} incercari: ${r.mesaj}`,
          businessId,
          details: { productId: el.product_id, op: el.op },
          severity: "warning",
        });
        continue;
      }
      await admin.from("emag_sync_queue")
        .update({ attempts: incercari, last_error: r.mesaj || null, revendicat_pana: null })
        .eq("id", el.id);
    }
  }

  /* ── 2) Reconcilierea ──────────────────────────────────────────────────────
   *
   * ⚠ CURSOR, NU O FEREASTRA FIXA DE LA ZERO.
   *
   * La Trendyol, reconcilierea citea mereu primele cinci pagini. Intr-un catalog de
   * 1033 de produse, nimic dupa produsul 500 n-a fost vazut NICIODATA — si nimeni
   * n-a observat, fiindca primele cinci pagini se actualizau frumos.
   *
   * Aici pagina de pornire se tine in `emag_config.reconcile_page` si merge mai
   * departe la fiecare trecere, luand-o de la capat cand catalogul se termina.
   */
  const { ids: magazine, error: eMagazine } = await magazineConectate(admin, "emag_config");
  if (eMagazine) {
    await logError({ action: "emag-sync", message: `magazinele nu s-au putut citi: ${eMagazine}`, severity: "warning" });
  }

  for (const businessId of alegeInRotatie(magazine, MAGAZINE_RECONCILIERE)) {
    const ctx = await ctxPentru(businessId);
    if (!ctx) continue;

    const pagina = Math.max(1, ctx.config.reconcile_page ?? 1);
    const r = await citesteOferte(ctx.auth, { currentPage: pagina, itemsPerPage: PE_PAGINA });
    if (isEmagError(r)) {
      if (r.verdict === "chei") await patchConfig(admin, businessId, { needs_reconnect: true });
      continue;
    }

    const oferte = (Array.isArray(r.data) ? r.data : []) as EmagOfertaCitita[];
    reconciliate += await scrieStatusurile(admin, businessId, oferte);

    /* ⚠ Pagina urmatoare, sau de la capat. Fara intoarcerea la 1, cursorul ar fi
       depasit catalogul si reconcilierea s-ar fi oprit tacut pe pagini goale. */
    await patchConfig(admin, businessId, {
      reconcile_page: oferte.length < PE_PAGINA ? 1 : pagina + 1,
    });
  }

  /* ── 3) Comenzile ─────────────────────────────────────────────────── */
  for (const businessId of alegeInRotatie(magazine, MAGAZINE_COMENZI)) {
    const ctx = await ctxPentru(businessId);
    if (!ctx) continue;

    const marcaj = Date.parse(ctx.config.orders_synced_at ?? "");
    const deLa = new Date(
      Number.isFinite(marcaj) ? marcaj - SUPRAPUNERE_MS : inceputulRularii - 24 * 60 * 60 * 1000,
    );

    const rez = await aduComenzile(admin, ctx, deLa);
    comenziNoi += rez.noi;

    /*
     * ═══ ⚠ MARCAJUL AVANSEAZA NUMAI CAND S-A CITIT TOT ═══
     *
     * `marcajUrmator` intoarce `null` cand nu s-a citit tot si nu se stie nici pana
     * unde — si atunci marcajul ramane pe loc, iar fereastra urmatoare reia de acolo.
     *
     * Pus la „acum" dupa o trecere trunchiata, comenzile necitite ar fi ramas in urma
     * ferestrei si NU s-ar mai fi citit niciodata. Fara nicio eroare, fiindca fiecare
     * trecere in parte a reusit. Asta e chiar incidentul pentru care exista
     * `marcaj.ts`, si de aceea nu se scrie de mana aici.
     */
    const urmator = marcajUrmator(rez, { runStartMs: inceputulRularii, overlapMs: SUPRAPUNERE_MS });
    if (urmator != null) {
      await patchConfig(admin, businessId, { orders_synced_at: new Date(urmator).toISOString() });
    }
  }

  /* ── 4) Facturile ───────────────────────────────────────────────────
   *
   * ═══ ⚠ eMAG CERE FACTURA, SPRE DEOSEBIRE DE CELELALTE ═══
   *
   * La Trendyol si About You, marketplace-ul factureaza el clientul final. La eMAG,
   * comerciantul factureaza clientul SI trebuie sa incarce factura inapoi la ei.
   * Nechemat pasul asta, comenzile ar fi ramas fara factura si la ei, si la client —
   * o lipsa fiscala care nu se vede nicaieri in Edinio.
   *
   * ⚠ Se ia doar `getMinutes() % 5 === 0`: emiterea facturii se intampla la
   * schimbarea de status, iar urcarea nu are de ce sa alerge in fiecare minut peste
   * comenzile care asteapta un PDF ce inca nu exista.
   */
  if (new Date(inceputulRularii).getMinutes() % 5 === 0) {
    for (const businessId of alegeInRotatie(magazine, MAGAZINE_FACTURI, 5)) {
      const ctx = await ctxPentru(businessId);
      if (!ctx) continue;
      facturi += await urcaFacturile(admin, ctx);
    }
  }

  return NextResponse.json({ ok: true, duse, cazute, reconciliate, comenziNoi, facturi });
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURILE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Facturile comenzilor eMAG care inca n-au ajuns la ei.
 *
 * ⚠ FILTRUL E `invoice_uploaded_at is null`, PE UN INDEX PARTIAL. Corectitudinea o
 * da `cuRegistru`, care urca o singura data; coloana e doar filtrul. Fara ea, cronul
 * ar fi trecut la fiecare rulare prin TOATE comenzile eMAG cu factura ale fiecarui
 * magazin — la un comerciant cu zece mii de comenzi vechi, zece mii de randuri pe
 * minut, la nesfarsit, pentru zero lucru. Si nu s-ar fi vazut ca defect: totul merge,
 * doar ca baza geme.
 */
async function urcaFacturile(admin: Admin, ctx: ContextEmag): Promise<number> {
  const { data } = await admin.from("emag_orders")
    .select("id, order_id")
    .eq("business_id", ctx.businessId)
    .is("invoice_uploaded_at", null)
    .not("order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(FACTURI_PE_TRECERE);

  let urcate = 0;
  for (const r of (data ?? []) as { id: string; order_id: string | null }[]) {
    if (!r.order_id) continue;

    const rez = await urcaFacturaLaEmag(admin, ctx, r.order_id, aduPdfFacturii);

    if (rez.fel === "urcata" || rez.fel === "deja") {
      await admin.from("emag_orders")
        .update({ invoice_uploaded_at: new Date().toISOString(), invoice_number: rez.numar })
        .eq("id", r.id);
      urcate++;
      continue;
    }

    /*
     * ⚠ „Fara factura" NU se marcheaza si NU se raporteaza ca eroare. Inseamna doar
     * ca documentul inca nu s-a emis — comanda abia a intrat, sau facturarea automata
     * se declanseaza la livrare. Marcata, comanda ar fi iesit definitiv din filtru si
     * n-ar mai fi primit niciodata factura.
     */
    if (rez.fel === "esec") {
      await logError({
        action: "emag-sync",
        message: `factura nu s-a putut urca: ${rez.mesaj}`,
        businessId: ctx.businessId,
        details: { orderId: r.order_id },
        severity: "warning",
      });
    }
  }
  return urcate;
}

/**
 * Octetii facturii, de la furnizorul care a emis-o.
 *
 * ⚠ Modulele de facturare se incarca LENES, la nevoie. Importate sus, fiecare
 * rulare a cronului — inclusiv cele in care nu e nicio factura de urcat — ar fi tras
 * dupa ea trei module de facturare cu tot cu dependintele lor.
 */
async function aduPdfFacturii(f: Factura): Promise<ArrayBuffer | { error: string }> {
  try {
    const r = await fetch(f.url, { cache: "no-store" });
    if (!r.ok) return { error: `Nu s-a putut descarca factura (${r.status}).` };
    return await r.arrayBuffer();
  } catch {
    return { error: "Eroare de retea la descarcarea facturii." };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VERDICTUL LOR, SCRIS LA NOI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Statusurile aduse de la eMAG, puse pe randurile noastre.
 *
 * ⚠ SE SCRIE SI CE E RAU, INTREG. `doc_errors` e SINGURUL loc din care afla
 * comerciantul ce sa repare. La Trendyol motivul respingerii n-a fost aratat, iar
 * produsele au stat „in aprobare" la nesfarsit — cu comerciantul convins ca noi le
 * tinem pe loc.
 */
async function scrieStatusurile(
  admin: Admin, businessId: string, oferte: EmagOfertaCitita[],
): Promise<number> {
  let scrise = 0;
  for (const o of oferte) {
    if (!Number.isFinite(o.id)) continue;

    const validation = unNumar(o.validation_status);
    const offerValidation = unNumar(o.offer_validation_status);
    const stoc = (o.stock ?? []).reduce((s, x) => s + (Number.isFinite(x?.value) ? x.value : 0), 0);

    const vandabila = eVandabila({
      stoc,
      status: o.status ?? null,
      offer_validation_status: offerValidation,
      validation_status: validation,
    });

    const { error } = await admin.from("emag_offers").update({
      validation_status: validation,
      offer_validation_status: offerValidation,
      translation_validation_status: unNumar(o.translation_validation_status),
      doc_errors: (o.doc_errors ?? []) as never,
      part_number_key: o.part_number_key ?? null,
      ownership: o.ownership ?? null,
      number_of_offers: o.number_of_offers ?? null,
      buy_button_rank: o.buy_button_rank ?? null,
      best_offer_sale_price: o.best_offer_sale_price ?? null,
      status: (vandabila ? "live" : "sent") satisfies StareOferta,
      last_status_at: new Date().toISOString(),
    }).eq("business_id", businessId).eq("emag_id", o.id);

    if (!error) scrise++;
  }
  return scrise;
}

/**
 * Numarul dintr-un status care vine in trei forme.
 *
 * ⚠ eMAG trimite `validation_status` cand ca tablou de obiecte, cand ca obiect, cand
 * ca numar — se vede chiar in exemplele din OpenAPI-ul lor. Citit pe o singura
 * forma, statusul ar fi ramas `null` pentru jumatate din oferte, iar panoul ar fi
 * aratat „în validare" la nesfarsit pentru produse aprobate demult.
 */
function unNumar(v: unknown): number | null {
  if (Array.isArray(v)) return unNumar(v[0]);
  if (v && typeof v === "object") {
    const n = (v as { value?: unknown }).value;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * O bucata din `emag_config`, scrisa fara sa se piarda restul.
 *
 * ⚠ SE CITESTE INTAI. `emag_config` e un singur `jsonb`: scris cu obiectul mic, ar
 * fi sters acreditarile, harta categoriilor si toate marcajele magazinului — adica
 * l-ar fi deconectat, dintr-o actualizare de cursor.
 */
async function patchConfig(admin: Admin, businessId: string, patch: Partial<EmagConfig>): Promise<void> {
  const { data } = await admin.from("store_settings")
    .select("emag_config").eq("business_id", businessId).maybeSingle();
  const config = ((data?.emag_config as EmagConfig) ?? {}) || {};
  await admin.from("store_settings")
    .update({ emag_config: { ...config, ...patch } as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
}
