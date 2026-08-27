// About You sync engine — shared by the cron drain (api/cron/aboutyou-sync) and
// the dashboard "publish now" actions, so both paths behave identically.
//
// Everything is async batch: we submit products/status, store the returned
// batchRequestId in aboutyou_batches, and a poll pass resolves it later. A
// separate reconcile pass reads products back (GET /products) to pick up the
// approval/rejection transitions About You makes on its own side.

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { logError } from "@/lib/error-logger";
import type { Database } from "@/types/database.types";
import type { AboutYouAuth, AboutYouResult } from "./client";
import {
  getCancelBatchResults, getPriceBatchResults, getProductBatchResults, getProducts,
  getRejectedProducts, getReturnBatchResults, getShipBatchResults, getStatusBatchResults,
  getStockBatchResults, isAboutYouError, shipOrderItems,
  updatePrice, updateProductStatus, updateStock, upsertProducts,
} from "./client";
import {
  atasezaPreturileRon, buildAboutYouItems, buildVariantPrices, deriveVariantSlots, effectiveCategoryId,
  stocVarianta, validateListing,
  type AboutYouListingEnrichment, type AboutYouStoredMaterial, type AboutYouVariantData,
  type MappableProduct,
} from "./mapping";
import { EroareCitireBaza, randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
import { patchAboutYouConfig } from "./config";
import { CURIERI_ABOUTYOU, SELECT_AWB_ABOUTYOU } from "./curieri";
import { cereMarime, getCerintaMaterial } from "./taxonomy";
import type { AboutYouBatchAck } from "./types";
import type { AboutYouConfig, AboutYouRejectionReason } from "./types";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, description, price, compare_at_price, images, category, sku, weight_grams, page_sections, is_active, track_inventory, stock_quantity";

export interface AboutYouSyncContext {
  auth: AboutYouAuth;
  config: AboutYouConfig;
  businessId: string;
}

export type SyncOutcome =
  | { ok: true; action: "submitted" | "published" | "removed" | "skipped"; batchRequestId?: string }
  /**
   * `status` = codul HTTP de la About You, cand esecul vine de acolo.
   *
   * Cronul decide din el daca elementul merita reincercat fara sa consume o
   * incercare (429, 5xx, retea). Ghicit din textul mesajului, ar depinde de un
   * sir pe care About You il poate schimba oricand — si atunci coada s-ar goli
   * exact cand nu trebuie.
   */
  | { ok: false; error: string; status?: number };

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Configurarea magazinului, sau `null` daca nu e conectat.
 *
 * ═══ ⚠ O PANA A BAZEI ARATA CA UN MAGAZIN NECONECTAT (27.08.2026) ═══
 *
 * `const { data: ss }` inghitea eroarea, iar `?? {}` o prefacea in „nu e conectat". Pasii 2, 3
 * si 4 din cron fac `if (!ctx) continue`, deci un hop de-o clipa al bazei sarea TACUT peste
 * sondarea loturilor, reconciliere si ingestul comenzilor magazinului — iar rularea se numara
 * drept reusita. Exact tiparul din regula casei: „lista goala e cea mai inselatoare forma".
 *
 * Acum arunca `EroareCitireBaza`. Cine cheama alege ce face; ce nu mai poate face nimeni e sa
 * confunde „nu e conectat" cu „n-am putut intreba".
 */
export async function loadAboutYouContext(admin: Db, businessId: string): Promise<AboutYouSyncContext | null> {
  const ss = randCitit<{ aboutyou_config: unknown }>("aboutyou.config", await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single());
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  if (!config.connected || !config.api_key) return null;
  return { auth: { apiKey: config.api_key, environment: config.environment }, config, businessId };
}

// ── Loaders ───────────────────────────────────────────────────────────────────
interface ListingRow {
  id: string;
  product_id: string | null;
  style_key: string;
  status: string;
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: unknown;
  material_composition: unknown;
  country_of_origin: string | null;
  hs_code: string | null;
  /** Momentul in care produsul chiar a plecat spre About You. `null` = doar local. */
  last_synced_at: string | null;
  /** Ce stiam despre el INAINTE de trimiterea in curs. Vezi `urmareaLotului`. */
  stare_dinainte: string | null;
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  /* ⚠ Arunca la pana: „listarea nu exista" duce pe calea care o STERGE si o recreeaza. */
  return randCitit<ListingRow>("aboutyou.getListing", await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, last_synced_at, stare_dinainte")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle() as never);
}

async function getListingByStyleKey(admin: Db, businessId: string, styleKey: string): Promise<ListingRow | null> {
  /* ⚠ Arunca la pana: „listarea nu exista" duce pe calea care o STERGE si o recreeaza. */
  return randCitit<ListingRow>("aboutyou.getListingByStyleKey", await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, last_synced_at, stare_dinainte")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle() as never);
}

function toEnrichment(row: ListingRow): AboutYouListingEnrichment {
  return {
    brand_id: row.brand_id,
    category_id: row.category_id,
    color_id: row.color_id,
    attributes: Array.isArray(row.attributes) ? (row.attributes as number[]) : [],
    material_composition: (row.material_composition as AboutYouStoredMaterial | null) ?? null,
    country_of_origin: row.country_of_origin,
    hs_code: row.hs_code,
  };
}

async function getVariantData(admin: Db, listingId: string): Promise<AboutYouVariantData[]> {
  /*
   * ⚠ Arunca la pana. O lista goala inseamna „produsul n-are nicio varianta", iar de-acolo
   * pleaca doua cai rele: trimiterea cade cu „Nicio varianta activa de listat" si scrie o eroare
   * care arata permanenta, iar retragerea variantelor ar crede ca s-au sters TOATE.
   */
  const data = randuriCitite<{
    sku: string; ean: string | null; size_id: number | null; second_size_id: number | null;
    color_id: number | null; quantity: number | null; retail_price_eur: number | null;
    sale_price_eur: number | null; enabled: boolean; ay_status: string | null;
  }>("aboutyou.getVariantData", await admin
    .from("aboutyou_variants")
    .select("sku, ean, size_id, second_size_id, color_id, quantity, retail_price_eur, sale_price_eur, enabled, ay_status")
    .eq("listing_id", listingId) as never);
  return data.map((v) => ({
    sku: v.sku,
    ean: v.ean,
    size_id: v.size_id,
    second_size_id: v.second_size_id,
    color_id: v.color_id,
    quantity: v.quantity,
    retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur,
    /*
     * DOUA INTELESURI DIFERITE, tinute in doua coloane diferite.
     *
     * `enabled` e VOINTA COMERCIANTULUI: a bifat sau nu varianta in editor.
     * `ay_status` e ce am facut NOI cu ea la About You. O prima versiune stingea
     * `enabled` la retragere si le amesteca: o varianta care revenea pe produs
     * rămânea stinsa pe veci, fiindca nu se mai putea deosebi de una scoasa
     * intentionat. Aici doar le compunem pentru payload — retrasa nu pleaca —, dar
     * coloana pastreaza ce a vrut omul.
     */
    enabled: v.enabled && v.ay_status !== "removing" && v.ay_status !== "removed",
  }));
}

/**
 * Scrie starea listarii. Intoarce `false` daca n-a putut.
 *
 * ⚠ RASPUNSUL CONTEAZA LA ASEZAREA LOTULUI. Lotul se inchidea pe `completed` chiar cand scrierea
 * de aici picase: rezultatul lui About You e citit O SINGURA DATA, iar dupa inchidere nu se mai
 * intreaba niciodata. Deci listarea ramanea pe `pending` la nesfarsit, cu adevarul pierdut
 * definitiv — sau, si mai rau, un produs respins ramanea aratand ca merge.
 */
async function setListingStatus(
  admin: Db, listingId: string, status: string, extra: Record<string, unknown> = {},
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await admin.from("aboutyou_listings")
    .update({ status, last_status_at: now, updated_at: now, ...extra } as never)
    .eq("id", listingId);
  return !error;
}

/**
 * Tine minte un lot trimis la About You.
 *
 * ═══ ⚠ FEREASTRA „EI AU PRIMIT, NOI N-AM APUCAT SA SCRIEM" (26.08.2026) ═══
 *
 * Se cheama DUPA ce cererea externa a reusit si ei ne-au dat `batchRequestId`. Daca scrierea de
 * aici pica, id-ul se pierdea in TACERE: nu mai stiam ce sa sondam, lotul nu se incheia niciodata,
 * iar listarea ramanea `pending` pe veci — fara nicio eroare nicaieri.
 *
 * ⚠ SI NU SE POATE RETRIMITE ORBESTE. O cerere externa cu rezultat necunoscut, retrimisa, face
 * dubluri. Deduplicarea lor pe payload identic ajuta, dar e o fereastra, nu o garantie.
 *
 * ⚠ DECI ID-UL SE SCRIE MACAR IN JURNAL, ca `critical`, cu tot ce trebuie ca sa fie recuperat de
 * mana. Iar functia INTOARCE daca a reusit, ca apelantul sa nu mai spuna „trimis" despre ceva ce
 * nu mai poate urmari.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   INTENTIA SE SCRIE INAINTEA CERERII
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ FEREASTRA: About You accepta cererea, ne da `batchRequestId`, iar INSERT-ul nostru pica. De
   acolo nu mai stim nimic despre soarta operatiei. `recordBatch` scria de mult un `critical` cu
   tot ce trebuie pentru o reluare de mana — dar sapte din opt chematori nici nu-i citeau
   raspunsul, deci operatia raporta REUSITA. O expediere, o anulare sau un retur „reusite" despre
   care nu se mai afla niciodata daca s-au intamplat.

   ⚠ SI NU E DE AJUNS SA CITIM RASPUNSUL. Ramane fereastra dintre clipa in care ei accepta si
   clipa in care noi scriem. O reluare oarba de acolo poate anula sau expedia de DOUA ORI — deci
   operatia nu se poate relua, dar nici nu se poate uita.

   Trei feluri de a se opri, toate vizibile acum:

     insertul pica  → cererea externa NU se face. Nimic nu s-a intamplat.
     ei REFUZA      → randul se sterge. Nimic nu s-a intamplat.
     updateul pica  → randul ramane pe `intentie` cu `trimis_la` pus: „am trimis si nu stiu ce a
                      iesit". Starea care lipsea, si singura care cere un om.

   ⚠ REFUZ vs NECUNOSCUT se hotaraste pe CODUL HTTP, niciodata pe textul mesajului — aceeasi
   regula ca la eMAG si Trendyol. `408` si `429` NU sunt refuzuri: sunt „mai incearca".
*/

/**
 * Ce s-a ales din trimitere. Trei stari, si nu se confunda intre ele.
 *
 * ═══ ⚠ „ACCEPTAT LA EI, NECUNOSCUT LA NOI" LIPSEA (27.08.2026) ═══
 *
 * Prima varianta a lui `cuLotDurabil` scria intentia inainte de cerere — bine — dar cand About
 * You raspundea cu `batchRequestId` iar UPDATE-ul care leaga id-ul de intentie pica, se scria un
 * `critical` si se intorcea chematorului raspunsul extern CURAT. Adica exact minciuna pe care
 * intentia trebuia s-o inlature, doar mutata cu un pas mai incolo: operatia parea urmarita.
 *
 * Acum starea are nume, si chematorul e OBLIGAT de tipuri s-o vada.
 */
export type LotDurabil<T> =
  /** Intentia n-a putut fi scrisa, deci cererea NICI nu s-a facut. Nimic nu s-a intamplat. */
  | { fel: "intentie-nescrisa" }
  /** Cererea s-a facut si urma exista: purtarea obisnuita. */
  | { fel: "urmarit"; res: AboutYouResult<T> }
  /**
   * Ei au primit-o, noi n-am putut lega id-ul. Nu se stie ce a iesit si NU se poate relua orbeste.
   *
   * ⚠ Randul ramane pe `intentie` cu `trimis_la` pus, iar `alarmaIntentiiDeschise` il scoate la
   * lumina. Chematorul nu are voie sa spuna „gata".
   */
  | { fel: "neurmarit"; res: AboutYouResult<T> };

/** Un refuz limpede: cererea n-a ajuns sa faca nimic la ei. */
export function eRefuzLimpede(status: number | undefined): boolean {
  if (status == null) return false;                    // retea cazuta: nu se stie
  if (status === 408 || status === 429) return false;  // „mai incearca", nu „nu"
  return status >= 400 && status < 500;
}

/**
 * Trimite ceva la About You cu urma scrisa INAINTE.
 *
 * ⚠ Cand INTENTIA nu se poate scrie, `trimite` nici nu se cheama. E singura purtare corecta: mai
 * bine o operatie neincercata decat una neurmarita.
 */
export async function cuLotDurabil<T extends { batchRequestId?: string | null }>(
  admin: Db, businessId: string, kind: string, relatedIds: string[],
  trimite: () => Promise<AboutYouResult<T>>,
): Promise<LotDurabil<T>> {
  const intentId = randomUUID();
  const { error: eIntentie } = await admin.from("aboutyou_batches").insert({
    business_id: businessId, batch_request_id: null, intent_id: intentId,
    kind, status: "intentie", related_ids: relatedIds as never,
    attempts: 0, poll_errors: 0,
    /* ⚠ Pus INAINTE de apel, nu dupa: dupa, o cadere intre apel si scriere ar lasa randul
       aratand ca n-a plecat nimic — exact minciuna de care fugim. */
    trimis_la: new Date().toISOString(),
  } as never);
  if (eIntentie) {
    await logError({
      action: "aboutyou/intentie", severity: "critical",
      message: `intentia nu s-a putut scrie, deci cererea catre About You NU s-a mai facut: ${eIntentie.message}`,
      details: { kind, relatedIds: relatedIds.slice(0, 20) }, businessId,
    });
    return { fel: "intentie-nescrisa" };
  }

  const res = await trimite();

  if (isAboutYouError(res)) {
    if (eRefuzLimpede(res.status)) {
      /* Refuz limpede: la ei nu s-a intamplat nimic, deci urma n-are ce pazi. */
      await admin.from("aboutyou_batches")
        .delete().eq("business_id", businessId).eq("intent_id", intentId);
      return { fel: "urmarit", res };
    }
    /*
     * ⚠ NECUNOSCUT: randul RAMANE. O pana de retea sau un `5xx` nu spun daca cererea a apucat sa
     * fie primita. Sters, am fi declarat „nu s-a intamplat" fara sa stim.
     *
     * ⚠ SI CHEMATORUL AFLA. Pentru o operatie cu un singur foc — expediere, anulare, retur —
     * deosebirea dintre „refuzata" si „poate s-a facut" e chiar deosebirea dintre a relua si a nu
     * relua.
     */
    await admin.from("aboutyou_batches")
      .update({ status: "necunoscut", result_summary: { eroare: res.error, status: res.status } as never } as never)
      .eq("business_id", businessId).eq("intent_id", intentId);
    return { fel: "neurmarit", res };
  }

  const id = res.data?.batchRequestId ?? null;
  const { error: eInchidere } = await admin.from("aboutyou_batches")
    .update({ batch_request_id: id, status: id ? "pending" : "necunoscut" } as never)
    .eq("business_id", businessId).eq("intent_id", intentId);
  if (eInchidere) {
    await logError({
      action: "aboutyou/intentie", severity: "critical",
      message: `About You a primit lotul (${id ?? "fara id"}), dar intentia n-a putut fi inchisa: ${eInchidere.message}`,
      details: { kind, batchRequestId: id, relatedIds: relatedIds.slice(0, 20) }, businessId,
    });
    return { fel: "neurmarit", res };
  }
  /*
   * ⚠ SI UN RASPUNS FARA `batchRequestId` E TOT NEURMARIT: fara id n-avem ce sonda niciodata, deci
   * soarta operatiei ramane necunoscuta la fel ca la o scriere picata.
   */
  if (id == null) return { fel: "neurmarit", res };
  return { fel: "urmarit", res };
}

/**
 * Pentru operatiile in care RETRIMITEREA E INOFENSIVA: pret, stoc, status, produs.
 *
 * ⚠ La ele valoarea bate istoricul — a doua trimitere a aceluiasi pret da acelasi pret — deci
 * „nu stiu ce a iesit" se poate trata ca „n-a mers, mai incearca". `status: 0` inseamna cauza
 * trecatoare: elementul ramane in coada fara sa arda o incercare.
 *
 * ⚠ NU SE FOLOSESTE la expediere, anulare si retur. Acolo o retrimitere poate expedia sau anula
 * de doua ori, si tocmai de-aia starea are nume.
 */
export function caUnRezultat<T extends { batchRequestId?: string | null }>(
  lot: LotDurabil<T>, ceFaceam: string,
): AboutYouResult<T> {
  if (lot.fel === "intentie-nescrisa") {
    return { error: `Nu am putut ține evidența cererii (${ceFaceam}); se reia.`, status: 0 };
  }
  if (lot.fel === "neurmarit" && !isAboutYouError(lot.res)) {
    return { error: `About You a primit cererea (${ceFaceam}), dar nu o putem urmări; se reia.`, status: 0 };
  }
  return lot.res;
}

/**
 * Intentiile ramase deschise: am trimis si nu stim ce a iesit.
 *
 * ⚠ Se scrie o SINGURA data pe rand (`alarma_scrisa_la`), altfel cronul de minut ar umple
 * jurnalul cu acelasi rand de 1440 de ori pe zi si ar ingropa alarmele adevarate.
 */
const PRAG_INTENTIE_MS = 10 * 60 * 1000;
export async function alarmaIntentiiDeschise(admin: Db, businessId: string): Promise<number> {
  const limita = new Date(Date.now() - PRAG_INTENTIE_MS).toISOString();
  const randuri = randuriCitite<{ id: string; kind: string; related_ids: unknown; trimis_la: string | null }>(
    "aboutyou.intentiiDeschise", await admin
      .from("aboutyou_batches").select("id, kind, related_ids, trimis_la")
      .eq("business_id", businessId)
      .in("status", ["intentie", "necunoscut"])
      .lt("submitted_at", limita)
      .is("alarma_scrisa_la", null)
      .limit(50) as never);

  for (const r of randuri) {
    await logError({
      action: "aboutyou/intentie-deschisa", severity: "critical",
      message: r.trimis_la
        ? `operatie „${r.kind}" trimisa la About You fara sa stim ce a iesit: verifica in Seller Center inainte de a o relua`
        : `operatie „${r.kind}" ramasa deschisa fara sa fi plecat`,
      details: { kind: r.kind, relatedIds: r.related_ids, trimisLa: r.trimis_la }, businessId,
    });
    await admin.from("aboutyou_batches")
      .update({ alarma_scrisa_la: new Date().toISOString() } as never).eq("id", r.id);
  }
  return randuri.length;
}

/*
 * ── Reconcilierea variantelor ────────────────────────────────────────────────
 *
 * `aboutyou_variants` nu se punea NICIODATA de acord cu variantele reale ale
 * produsului. Randurile se scriau intr-un singur loc — apasarea pe „Salvează" in
 * editor — iar trimiterea citea exclusiv de acolo. Adica:
 *
 *   ce pleaca la About You = setul de variante din momentul ultimei salvari,
 *   nu setul de acum.
 *
 * Trei urmari, toate tacute: marimea adaugata dupa aceea nu ajungea niciodata
 * („Missing rows are simply ignored" — documentatia lor); marimea stearsa pleca
 * mai departe cu pretul de baza; iar o marime scoasa de la vanzare rămânea
 * vandabila acolo. Trendyol facea deja reconcilierea corect; aici lipsea.
 *
 * ═══ DOUA HOTARARI CARE PAR OCOLISURI SI NU SUNT ═══
 *
 * 1. RANDUL LOCAL NU SE STERGE NICIODATA, doar se marcheaza. E singura urma a
 *    maparii `sku -> product_id + variant_title`, iar `orders.ts` o foloseste ca
 *    sa lege o comanda de produs si sa scada stocul combinatiei. Sters, o comanda
 *    sosita pe acel SKU — About You poate trimite una si dupa retragere — intra cu
 *    `product_id` null, fara nicio scadere de stoc si fara niciun avertisment.
 *    Randul retras nu strica nimic: `enabled: false` il tine afara din payload.
 *
 * 2. SCOATEREA SE FACE PRIN STOC 0, nu prin stergere. `DELETE /products/{sku}`
 *    exista (50 de cereri pe minut), dar documentatia lor il refuza pentru orice
 *    varianta cu vanzari inregistrate si pentru cele in „Active"/„Pending Active" —
 *    adica exact pentru cele pe care am vrea sa le scoatem. Iar bugetul nu ajunge:
 *    cronul ia 30 de elemente pe rulare, deci ar iesi sute de cereri de stergere
 *    pe minut fata de cele 50 permise, plus secunde de asteptare intr-o fereastra
 *    de un minut. Stocul 0 e mecanismul lor propriu si e o singura cerere in lot
 *    pentru toate SKU-urile.
 */
interface RandVarianta {
  id: string; sku: string; enabled: boolean; ay_status: string | null; variant_title: string | null;
}

type RezultatReconciliere = { ok: true } | { ok: false; error: string; status?: number };

async function reconciliazaVariante(
  admin: Db, ctx: AboutYouSyncContext, listing: ListingRow, produs: MappableProduct,
): Promise<RezultatReconciliere> {
  const slots = deriveVariantSlots(produs);
  const dupaSku = new Map(slots.map((s) => [s.sku, s]));

  const { data, error } = await admin
    .from("aboutyou_variants").select("id, sku, enabled, ay_status, variant_title").eq("listing_id", listing.id);
  /*
   * O citire cazuta nu inseamna „nu exista variante".
   *
   * Tratata ca lista goala, toate randurile ar aparea drept disparute de pe
   * produs. Se raporteaza ca esec TRECATOR (`status: 0`), deci cronul reia fara
   * sa consume o incercare — inainte ieseam tacut si scoaterea nu se mai relua.
   */
  if (error) return { ok: false, error: `Nu am putut citi variantele: ${error.message}`, status: 0 };
  const randuri = (data ?? []) as RandVarianta[];
  const dupaSkuLocal = new Map(randuri.map((r) => [r.sku, r]));

  // 1) Variante aparute pe produs dupa ultima salvare.
  const noi = slots.filter((s) => !dupaSkuLocal.has(s.sku));
  if (noi.length > 0) {
    const { error: eInsert } = await admin.from("aboutyou_variants").insert(noi.map((s) => ({
      listing_id: listing.id, business_id: ctx.businessId, product_id: listing.product_id,
      // `variantTitle`, nu `label`: dupa el se scade stocul combinatiei la o
      // comanda. „Unic" n-ar corespunde niciunei combinatii si ar da alarme false.
      sku: s.sku, ean: s.gtin, quantity: s.quantity, variant_title: s.variantTitle, enabled: true,
    })) as never);
    /*
     * Eroarea se CITESTE. `UNIQUE (business_id, sku)` respinge intreg lotul cand
     * un singur SKU e folosit de alt produs, iar inghitita, reconcilierea se
     * oprea aici la fiecare rulare, la nesfarsit, fara nicio urma: variantele noi
     * nu ajungeau niciodata pe About You si nimeni nu afla de ce.
     */
    if (eInsert) {
      return { ok: false, error: `Nu am putut adăuga variantele noi: ${eInsert.message}. Verifică să nu folosești același SKU la două produse.` };
    }
  }

  /*
   * 2) Titlurile combinatiilor se REIMPROSPATEAZA.
   *
   * Se scriau o singura data, la creare. Un titlu schimbat in fisa produsului cu
   * SKU-ul pastrat lasa in baza titlul vechi, iar scaderea de stoc pe combinatie
   * cauta ceva ce nu mai exista — tacut.
   */
  for (const r of randuri) {
    const slot = dupaSku.get(r.sku);
    if (slot && slot.variantTitle !== r.variant_title) {
      await admin.from("aboutyou_variants")
        .update({ variant_title: slot.variantTitle } as never).eq("id", r.id);
    }
  }

  /*
   * 3) Ce nu mai are ce cauta pe About You: variantele disparute de pe produs
   *    (inclusiv cele doar dezactivate in fisa, pentru ca `combinatii()` le
   *    filtreaza si atunci nu mai produc slot) si cele scoase din listare.
   *    `ay_status = "removed"` opreste repetarea; se sterge cand varianta revine.
   */
  /*
   * `removing` NU opreste reincercarea — doar `removed` o face.
   *
   * Exclus si el, o varianta al carei lot de stoc pica rămânea „in curs de
   * retragere" pentru totdeauna: nu mai intra in `deScos`, deci zeroul nu se mai
   * cerea niciodata, iar `pollOpenBatches` nu marca nimic pe esec. Comentariul de
   * mai jos sustinea contrariul. Reluarea e ieftina: acelasi payload primeste
   * acelasi `batchRequestId`.
   */
  const deScos = randuri.filter((r) => (!dupaSku.has(r.sku) || !r.enabled) && r.ay_status !== "removed");

  if (deScos.length > 0) {
    if (listing.last_synced_at != null) {
      const lot = deScos.slice(0, MAX_ITEMI_STOC_PRET);
      /*
       * ⚠ Prin `cuLotDurabil`: urma se scrie INAINTE de cerere. `null` inseamna ca intentia
       * n-a putut fi scrisa, deci cererea nici nu s-a facut — randurile raman `enabled: false`
       * si zeroul se reincearca la trecerea urmatoare.
       */
      /* ⚠ Un zero retrimis da tot zero, deci „nu stiu ce a iesit" se poate trata ca „mai incearca". */
      const zero = caUnRezultat(await cuLotDurabil(admin, ctx.businessId, "stock_removal",
        lot.map((r) => r.id),
        () => updateStock(ctx.auth, lot.map((r) => ({ sku: r.sku, quantity: 0 })))),
        "retragerea variantelor");
      if (isAboutYouError(zero)) {
        return { ok: false, error: `Nu am putut retrage variantele scoase: ${zero.error}`, status: zero.status };
      }
      /*
       * MARCAJUL „RETRAS" NU SE PUNE PE ACCEPTARE.
       *
       * Un 2xx spune doar ca lotul a fost PRIMIT, iar documentatia lor e explicita:
       * „un lot cu `status: completed` poate conține items cu `success: false`".
       * Marcat aici, un zero neaplicat rămânea nevazut — si randul nu se mai
       * intorcea niciodata, fiindca ramura de reactivare cere `enabled: true`, exact
       * ce tocmai stinsesem. Varianta rămânea vandabila pe About You la nesfarsit.
       *
       * Deci: acum se stinge doar `enabled` (ca sa nu mai plece in niciun payload),
       * iar `ay_status = "removed"` il pune `pollOpenBatches` cand lotul se incheie
       * cu succes. Lotul poarta tipul `stock_removal` si, in `related_ids`, ID-URILE
       * RANDURILOR — nu `style_key`, cum face impingerea obisnuita de stoc. Pana
       * atunci randul reintra in `deScos` si zeroul se reincearca; payload-ul
       * identic primeste acelasi `batchRequestId`, deci reluarea e ieftina.
       */
      await admin.from("aboutyou_variants")
        .update({ ay_status: "removing" } as never).in("id", lot.map((r) => r.id));
    } else {
      // Listarea n-a plecat niciodata spre About You: nu e nimic de retras acolo,
      // deci marcajul se poate pune direct.
      await admin.from("aboutyou_variants")
        .update({ ay_status: "removed" } as never).in("id", deScos.map((r) => r.id));
    }
  }

  /*
   * 4) Variantele revenite se retrimit, deci semnul de „retras" cade.
   *
   * Conditia e „slotul exista SI comerciantul o vrea activa": `enabled` a rămas
   * neatins de retragere tocmai ca sa se poata deosebi aici o varianta revenita pe
   * produs de una scoasa intentionat din listare.
   */
  const reactivate = randuri.filter((r) => dupaSku.has(r.sku) && r.enabled
    && (r.ay_status === "removing" || r.ay_status === "removed"));
  if (reactivate.length > 0) {
    await admin.from("aboutyou_variants")
      .update({ ay_status: null } as never).in("id", reactivate.map((r) => r.id));
  }
  return { ok: true };
}

// ── Upsert (create/update on About You) ─────────────────────────────────────────
export async function syncProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  /*
   * `data: null` inseamna DOUA lucruri diferite, si le confundam.
   *
   * Produs sters (`error === null`) — atunci da, il scoatem si de pe About You.
   * Dar o citire cazuta (timeout de instructiune, conexiune pierduta) intoarce
   * tot `data: null`, cu `error` completat. Pe acea ramura codul chema
   * `removeProductNow`: trecea produsul pe `inactive` la About You si stergea
   * randul din `aboutyou_listings`, cu tot cu variante. Un hop de retea rupea
   * definitiv o listare bine configurata.
   */
  const { data: product, error: eroareProdus } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (eroareProdus) return { ok: false, error: eroareProdus.message };
  if (!product) return removeProductNow(admin, ctx, productId);

  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Produsul nu are configurare About You. Completează detaliile de listare mai întâi." };

  /*
   * Dezactivat in Edinio -> dezactivat si pe About You.
   *
   * „Exista acolo?" se citeste din `last_synced_at`, nu dintr-o lista de
   * statusuri — aceeasi capcana pe care `stergeListare` o are explicata mai jos.
   * Lista de dinainte omitea `error`, `problem` si `rejected`, iar de cand
   * validarea locala poate muta o listare pe `error`, cazul devenise usor de
   * atins: produsul scos de la vanzare in Edinio rămânea VANDABIL pe About You,
   * elementul se stergea din coada ca reusit, si nimic nu semnala nimic. Despre
   * `problem`, documentatia lor spune chiar ca produsul revine singur pe `active`
   * dupa ce cauza dispare.
   */
  if ((product as { is_active?: boolean }).is_active === false) {
    if (listing.last_synced_at != null) {
      /*
       * Tinta se alege dupa unde a ajuns produsul, nu `inactive` orbeste.
       * Documentatia: „Only previously published products can be set to
       * `inactive`", iar un produs aflat in aprobare nu accepta decat `draft`.
       * Cererea respinsa nu lasa nicio urma, iar About You termina aprobarea si
       * produsul devine ACTIV — cu stocul intreg — desi comerciantul tocmai il
       * scosese de la vanzare.
       */
      return setRemoteStatus(admin, ctx, productId, tintaRetragere(listing.status));
    }
    return { ok: true, action: "skipped" };
  }

  const produs = product as unknown as MappableProduct;
  const enrichment = toEnrichment(listing);
  // Intai punem randurile de acord cu variantele reale ale produsului, apoi le
  // citim: altfel am trimite setul inghetat la ultima salvare din editor.
  const rec = await reconciliazaVariante(admin, ctx, listing, produs);
  if (!rec.ok) {
    /*
     * Esecul reconcilierii OPRESTE trimiterea si se vede.
     *
     * Intorcea `void`, deci un esec era complet tacit: elementul se stergea din
     * coada ca reusit, iar variantele ramaneau nesincronizate pe vecie. Pe cauze
     * trecatoare lasam listarea in pace, ca sa nu apara rosie degeaba.
     */
    const trecator = rec.status === 0 || rec.status === 429 || (rec.status ?? 0) >= 500;
    if (!trecator) await setListingStatus(admin, listing.id, "error", { error: rec.error });
    return { ok: false, error: rec.error, status: rec.status };
  }
  const variants = atasezaPreturileRon(produs, await getVariantData(admin, listing.id));

  /*
   * VALIDAREA COMPLETA SE FACE SI AICI, nu doar in editor.
   *
   * `validateListing` era chemata dintr-un singur loc: butonul „Salvează și
   * trimite". Calea automata — `auto_sync` pornit, o schimbare de pret, o
   * comanda, cronul — ajungea direct la `buildAboutYouItems`, care se opreste la
   * PRIMA problema si nu verifica deloc materialul. Asa plecau spre About You
   * produse fara compozitie si fara EAN, iar comerciantul afla peste zile, din
   * „produs respins", fara sa i se spuna ce lipseste.
   */
  const cerinta = await getCerintaMaterial(ctx.auth, effectiveCategoryId(ctx.config, produs, enrichment));
  // (`categoria` se recalculeaza mai jos pentru regula de marime.)
  if (!cerinta.ok) {
    /*
     * DOUA FELURI DE ESEC, cu tratament opus.
     *
     * O limita de rata sau o pana de retea sunt trecatoare: intorcem codul HTTP,
     * iar cronul reincearca FARA sa consume o incercare (vezi `eTrecatoare` din
     * ruta de cron). Nu marcam listarea, ca sa nu apara rosie pentru ceva ce
     * comerciantul nu are cum sa repare.
     *
     * O cheie invalidata (401), o categorie stearsa din taxonomie (404) sau un
     * raspuns gol NU trec singure. Pe acele coduri cronul consuma incercari si,
     * la a cincea, STERGE randul din coada — asa se pierdea sincronizarea
     * definitiv, fara status, fara jurnal si fara nimic vizibil in panou.
     */
    // `200` inseamna „ne-au raspuns, dar fara nicio categorie": tot o
    // indisponibilitate a lor. Il traducem in `0`, codul pe care ruta de cron il
    // citeste ca trecator alaturi de 429 si 5xx.
    const status = cerinta.status === 200 ? 0 : cerinta.status;
    const trecatoare = status === 0 || status === 429 || status >= 500;
    const mesaj = `Nu am putut citi taxonomia About You: ${cerinta.error}`;
    if (!trecatoare) {
      await setListingStatus(admin, listing.id, "error", { error: mesaj });
    }
    return { ok: false, error: mesaj, status };
  }
  const categoria = effectiveCategoryId(ctx.config, produs, enrichment);
  const marimeCeruta = await cereMarime(ctx.auth, categoria);
  if (marimeCeruta === null) {
    // Nu stim daca cere marime: nu deducem „nu cere". Se reia.
    return { ok: false, error: "Nu am putut citi atributele categoriei About You.", status: 0 };
  }
  const verificare = validateListing(
    { config: ctx.config, product: produs, listing: enrichment, variants },
    { tip: cerinta.tip, path: cerinta.path, cereMarime: marimeCeruta },
  );
  if (verificare.issues.length > 0) {
    const rezumat = verificare.issues.slice(0, 5).join(" ").slice(0, 500);
    await setListingStatus(admin, listing.id, "error", { error: rezumat });
    return { ok: false, error: rezumat };
  }

  const built = buildAboutYouItems({
    config: ctx.config,
    product: produs,
    listing: enrichment,
    variants,
  });
  if ("error" in built) {
    await setListingStatus(admin, listing.id, "error", { error: built.error });
    return { ok: false, error: built.error };
  }

  // POST /products/ accepta cel mult 100 de articole (`maxItems`), iar depasirea
  // respinge cererea INTREAGA, nu doar surplusul. Un produs cu peste 100 de
  // variante nu s-ar fi putut lista deloc.
  let batchRequestId: string | undefined;
  const transe = Math.ceil(built.items.length / 100);
  let nescrise = 0;
  for (let i = 0; i < built.items.length; i += 100) {
    /* ⚠ Acelasi produs retrimis da acelasi produs: reluarea e inofensiva. */
    const res = caUnRezultat(await cuLotDurabil(admin, ctx.businessId, "product", [listing.style_key],
      () => upsertProducts(ctx.auth, built.items.slice(i, i + 100))), "trimiterea produsului");
    if (isAboutYouError(res)) {
      /*
       * ⚠ UN ESEC LA MIJLOCUL SIRULUI LASA PRODUSUL PE JUMATATE LA EI. Transele dinainte au
       * plecat si nu se pot lua inapoi; iesim aici, deci ele raman acolo fara ca nimic sa spuna
       * ca produsul e incomplet. Se scrie, ca omul sa stie ce vede daca se uita in panoul lor.
       */
      if (i > 0) {
        await logError({
          action: "aboutyou/lot-partial", severity: "warning",
          message: `transa ${Math.floor(i / 100) + 1} din ${transe} a picat; primele ${Math.floor(i / 100)} au ajuns deja la About You`,
          details: { styleKey: listing.style_key, variante: built.items.length, eroare: res.error },
          businessId: ctx.businessId,
        });
      }
      await setListingStatus(admin, listing.id, "error", { error: res.error });
      return { ok: false, error: res.error, status: res.status };
    }
    const id = res.data?.batchRequestId;
    if (id) batchRequestId = batchRequestId ?? id;
    /* Un raspuns fara id nu se poate sonda niciodata: `cuLotDurabil` a lasat randul „necunoscut". */
    else nescrise++;
    if (i + 100 < built.items.length) await pause(300);
  }

  /*
   * ⚠ DACA VREUN LOT N-A PUTUT FI TINUT MINTE, LISTAREA NU TRECE PE `pending`. `pending` inseamna
   * „am trimis si astept raspunsul lor" — dar noi n-am mai avea ce astepta, si listarea ar sta
   * asa la nesfarsit. `error` cu motivul scris ii da omului si un buton de reluare.
   */
  if (nescrise > 0) {
    const motiv = `${nescrise} ${nescrise === 1 ? "lot a plecat" : "loturi au plecat"} la About You, dar nu le-am putut ține minte ca să le urmărim. Reîncearcă trimiterea.`;
    await setListingStatus(admin, listing.id, "error", { error: motiv });
    return { ok: false, error: motiv };
  }
  const now = new Date().toISOString();
  /*
   * ⚠ SE TINE MINTE INAINTE DE A ACOPERI. `pending` sterge `status`, iar `last_synced_at: now`
   * sterge si celalalt fapt de care e nevoie la incheierea lotului: „exista la ei dinainte?".
   * Vezi `urmareaLotului`.
   */
  await setListingStatus(admin, listing.id, "pending", {
    error: null, last_synced_at: now, stare_dinainte: stareaDeTinutMinte(listing),
  });
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Publish / unpublish ─────────────────────────────────────────────────────────
async function setRemoteStatus(
  admin: Db, ctx: AboutYouSyncContext, productId: string, status: "published" | "inactive" | "draft",
): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Listarea About You nu există." };

  /*
   * Nu se poate schimba statusul unui produs care nu exista pe About You.
   *
   * `PUT /products/status` lucreaza pe `style_key`, adica pe product master-ul
   * creat de `POST /products/`. O listare salvata doar local nu are asa ceva,
   * deci cererea esueaza — dar esua TACUT: elementul se reincerca de cinci ori
   * si apoi disparea din coada cu tot cu motiv, iar comerciantul vedea „Publicat
   * pe About You" pentru un produs care nu ajunsese niciodata acolo.
   */
  /*
   * ⚠ „A PLECAT" NU INSEAMNA „EXISTA ACOLO". Probat pe fir, 17.08.
   *
   * `last_synced_at` se scrie cand lotul de produs e TRIMIS, nu cand e acceptat.
   * Comerciantul a apasat „Publică" la patru secunde dupa trimitere, iar lotul de
   * produs picase intre timp („Size is required for this category"): publicarea a
   * plecat spre un product master inexistent si a primit „Product master not found".
   *
   * Dovada ca produsul EXISTA la ei e statusul: `draft` il scrie `pollOpenBatches`
   * abia dupa un lot incheiat fara erori, iar restul vin de la ei prin reconciliere.
   */
  const EXISTA_LA_EI = new Set(["draft", "active", "published", "inactive",
    "pending_approval", "pending_active", "rejected", "problem"]);
  if (status === "published" && !EXISTA_LA_EI.has(listing.status)) {
    return {
      ok: false,
      error: listing.status === "pending"
        ? "Produsul e încă în curs de trimitere. Așteaptă să apară „Ciornă pe About You”, apoi publică-l."
        : "Trimite întâi produsul pe About You, apoi publică-l.",
    };
  }

  if (listing.last_synced_at == null) {
    if (status === "published") {
      return { ok: false, error: "Trimite întâi produsul pe About You, apoi publică-l." };
    }
    // Retragere sau dezactivare a unei listari care exista doar la noi: nu avem
    // ce cere de la About You, doar reflectam local.
    await setListingStatus(admin, listing.id, status === "inactive" ? "inactive" : "local", { error: null });
    return { ok: true, action: "skipped" };
  }

  const res = caUnRezultat(await cuLotDurabil(admin, ctx.businessId, "status", [listing.style_key],
    () => updateProductStatus(ctx.auth, [{ style_key: listing.style_key, status }])),
    "schimbarea stării");
  if (isAboutYouError(res)) {
    await setListingStatus(admin, listing.id, "error", { error: res.error });
    return { ok: false, error: res.error, status: res.status };
  }
  const batchRequestId = res.data?.batchRequestId;
  const statusLocal = status === "published" ? "pending" : status === "inactive" ? "inactive" : "draft";
  /*
   * ⚠ `error` NU se goleste aici. Probat pe fir, 17.08.
   *
   * Lotul de produs picase cu „Size is required for this category" si motivul era
   * scris corect pe listare. Patru secunde mai tarziu, o apasare pe „Publică" l-a
   * STERS si a pus statusul inapoi pe „in asteptare": ecranul arata ca totul e in
   * regula, iar comerciantul astepta un produs care nu venea. O cerere ACCEPTATA
   * nu spune nimic despre esecul dinainte — golirea aparține doar cailor care chiar
   * au reusit, adica lotului incheiat fara erori.
   */
  await setListingStatus(admin, listing.id, statusLocal);
  return { ok: true, action: "published", batchRequestId };
}

export function publishProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  return setRemoteStatus(admin, ctx, productId, "published");
}
/*
 * Retragerea: `draft` INAINTE de aprobare, `inactive` DUPA.
 *
 * Documentatia lor e explicita: „Reverting to `draft` is only supported before the
 * product reaches approval, after which one should use `inactive`." Trimiteam
 * `inactive` mereu, deci pentru un produs aflat in aprobare cererea putea fi
 * respinsa — iar comerciantul primea „Produsul a fost retras". Ramura `draft` din
 * `setRemoteStatus` exista de la inceput si nu era apelata de nimeni.
 */
/*
 * Statusuri raportate de ABOUT YOU care inseamna „inca nu a trecut de aprobare".
 *
 * ⚠ Aici au voie DOAR statusurile lor. Prima varianta continea si `pending` si
 * `error`, care sunt LOCALE si se scriu peste produse demult aprobate — un esec de
 * articol la actualizare lasa produsul `active` la ei si `error` la noi. Pentru
 * acelea am fi cerut `draft`, iar documentatia il refuza: „Once a product has been
 * approved, it can no longer be set back to `draft`". Cererea cadea, se scria iar
 * `error`, si urmatoarea incercare calcula tot `draft`: bucla infinita, cu produsul
 * ramas vandabil.
 */
const INAINTE_DE_APROBARE = new Set(["draft", "pending_approval", "rejected"]);

/*
 * ═══ ⚠ O MODIFICARE LA UN PRODUS APROBAT IL DADEA INAPOI LA „CIORNA" (27.08.2026) ═══
 *
 * `pollOpenBatches` scria `draft` la fiecare lot de produs incheiat cu bine, cu comentariul
 * „exists as a draft on About You until published". Adevarat, dar NUMAI la prima trimitere:
 * documentatia lor spune „Newly created products start in the `draft` state", si tot ea spune ca
 * un produs aprobat nu se mai poate intoarce acolo. Deci, dupa orice modificare a unui produs
 * ACTIV, panoul arata „Ciorna" pentru un produs care se vinde, se punea la coada o publicare pe
 * care n-o ceruse nimeni, iar retragerea cerea `draft` si primea refuz.
 *
 * ⚠ SI CIORNELE LASATE DINADINS: lantul de publicare se declanseaza pe trecerea
 * `pending -> draft` tocmai ca „sa nu atinga ciornele vechi, lasate dinadins nepublicate" — dar o
 * retrimitere trecea exact pe-acolo, deci le publica la prima modificare.
 *
 * Ce se stia inainte de trimitere se tine minte in `stare_dinainte`, fiindca la momentul lotului
 * `status` e deja `pending` si `last_synced_at` a fost rescris: tocmai cele doua fapte de care e
 * nevoie sunt sterse chiar de trimitere.
 */
export const STARI_ALE_LOR = new Set([
  "draft", "active", "published", "inactive", "pending_approval", "pending_active",
  "rejected", "problem",
]);

/** Ce se tine minte inainte de a acoperi starea cu `pending`. */
export function stareaDeTinutMinte(listing: { status: string; last_synced_at: string | null }): string {
  if (listing.last_synced_at == null) return "prima";
  return STARI_ALE_LOR.has(listing.status) ? listing.status : "necunoscut";
}

/**
 * Ce se face cu listarea cand lotul ei de produs s-a incheiat cu bine.
 *
 * `status: null` inseamna „nu se atinge": ramane pe `pending`, iar reconcilierea — care oricum
 * trece prin tot catalogul lor — scrie starea adevarata. Mai bine asa decat un `draft` inventat.
 */
export function urmareaLotului(stareDinainte: string | null): { status: string | null; publica: boolean } {
  /* Prima trimitere: produsul chiar s-a nascut ciorna, si publicarea se inlantuie singura. */
  if (stareDinainte == null || stareDinainte === "prima") return { status: "draft", publica: true };
  /* Retrimitere cu starea lor stiuta: se pune inapoi, si nu se publica nimic nou. */
  if (STARI_ALE_LOR.has(stareDinainte)) return { status: stareDinainte, publica: false };
  /* Retrimitere fara sa stim unde ajunsese: nu se inventeaza. */
  return { status: null, publica: false };
}

/** Ce status se cere la About You cand retragem, dupa unde a ajuns produsul. */
function tintaRetragere(status: string): "draft" | "inactive" {
  return INAINTE_DE_APROBARE.has(status) ? "draft" : "inactive";
}

export async function unpublishProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Listarea About You nu există." };
  return setRemoteStatus(admin, ctx, productId, tintaRetragere(listing.status));
}

/*
 * Dezactiveaza pe About You, apoi sterge randurile locale.
 *
 * ORDINEA CONTEAZA, si esecul dezactivarii NU se poate inghiti: randul local e
 * singura urma ca produsul exista pe About You. Sters dupa o dezactivare esuata,
 * produsul ramane ACTIV pe marketplace, se vinde in continuare, iar noi nu mai
 * avem nici macar `style_key`-ul ca sa-l oprim. De aceea, daca About You nu
 * confirma dezactivarea, pastram randul si intoarcem eroare: elementul se
 * reincearca la urmatoarea trecere a cronului.
 */
async function stergeListare(
  admin: Db, ctx: AboutYouSyncContext, listing: ListingRow,
): Promise<SyncOutcome> {
  /*
   * „Exista pe About You?" se citeste din `last_synced_at`, nu din `status`.
   *
   * Pe `status` era o capcana care se inchidea singura: cand dezactivarea esua,
   * scriam `status = "error"` — iar „error" era tocmai una din valorile citite ca
   * „exista doar local". A doua incercare sarea peste dezactivare si stergea randul,
   * lasand produsul ACTIV pe About You si fara nicio urma la noi. `last_synced_at`
   * se scrie o singura data, cand produsul chiar a plecat, si nu se mai retrage.
   */
  const eDoarLocala = listing.last_synced_at == null;
  if (eDoarLocala) {
    await admin.from("aboutyou_listings").delete().eq("id", listing.id);
    return { ok: true, action: "removed" };
  }

  /*
   * ⚠ ACCEPTAREA NU E REUSITA, iar aici diferenta costa cel mai mult.
   *
   * `PUT /products/status` e ASINCRON: 200 inseamna „am primit cererea", iar
   * verdictul vine din `/results/status`. `isAboutYouError` e fals pentru orice
   * cerere acceptata, deci garda descrisa mai sus nu acoperea cazul real: randul
   * se stergea imediat, `ON DELETE CASCADE` lua cu el si `aboutyou_variants` cu
   * toata maparea SKU, elementul ieșea din coada ca reusit — iar daca About You
   * respingea dezactivarea, produsul rămânea ACTIV si vandabil, fara `style_key`
   * la noi si fara niciun rand de apasat. Comenzile care intrau dupa aceea nu mai
   * gaseau produsul si nu scadeau stoc.
   *
   * Acum lotul se INREGISTREAZA cu tipul `removal`, statusul listarii nu se atinge,
   * iar `pollOpenBatches` sterge randul abia cand lotul se incheie cu bine.
   */
  const res = caUnRezultat(await cuLotDurabil(admin, ctx.businessId, "removal", [listing.style_key],
    () => updateProductStatus(
      ctx.auth, [{ style_key: listing.style_key, status: tintaRetragere(listing.status) }])),
    "retragerea produsului");
  if (isAboutYouError(res)) {
    await setListingStatus(admin, listing.id, "error", {
      error: `Nu am putut retrage produsul de pe About You: ${res.error}`,
    });
    return { ok: false, error: res.error, status: res.status };
  }

  /*
   * ⚠ STATUSUL LISTARII NU SE ATINGE AICI, deliberat.
   *
   * O prima varianta punea un status propriu, „removing", si astepta ca lotul sa-l
   * gaseasca. Se agata pe SASE cai diferite: abandonul la 120 de treceri si
   * renuntarea la sase esecuri de interogare filtreaza dupa „pending"; un raspuns
   * fara `batchRequestId` nu inregistra niciun lot; iar `reconcileStatuses` scrie
   * statusul venit de la About You peste el — CHIAR IN ACEEASI rulare a cronului,
   * fiindca pasul 3 vine dupa pasul 1. Randul rămânea in panou pe vecie, dupa ce
   * comerciantul apasase „Elimină".
   *
   * Acum semnul e pe LOT, nu pe listare: `kind = "removal"`. Daca lotul nu se
   * aseaza niciodata, randul rămâne exact cum era — vizibil, cu statusul lui
   * adevarat — si omul poate apasa din nou. Nicio stare fara ieșire.
   */
  const idLot = res.data?.batchRequestId;
  return { ok: true, action: "removed", batchRequestId: idLot };
}

export async function removeProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  return stergeListare(admin, ctx, listing);
}

export async function removeByStyleKey(admin: Db, ctx: AboutYouSyncContext, styleKey: string): Promise<SyncOutcome> {
  const listing = await getListingByStyleKey(admin, ctx.businessId, styleKey);
  if (!listing) return { ok: true, action: "skipped" };
  return stergeListare(admin, ctx, listing);
}

// ── Batch polling (cron) ────────────────────────────────────────────────────────
interface BatchRow {
  id: string; batch_request_id: string; kind: string; related_ids: unknown;
  attempts: number; poll_errors: number; submitted_at: string;
  tranzient_de_la: string | null; alarma_scrisa_la: string | null;
}

/**
 * Cat se amana urmatoarea interogare, dupa un esec de TRANSPORT.
 *
 * ⚠ CRESTE, si de-aia exista: cauza obisnuita e o limita de rata sau o pana la ei, adica exact
 * situatia in care a intreba din minut in minut inrautateste lucrurile. Un minut, doua, patru…
 * pana la un sfert de ora.
 */
function amanare(esecuri: number): number {
  return Math.min(15, 2 ** Math.max(0, esecuri - 1)) * 60_000;
}

/** Dupa atata vreme de esecuri de transport neintrerupte, se scrie o alarma. */
const ORE_PANA_LA_ALARMA = 1;

/** Trece pe „error" listarile unui lot care s-a inchis fara sa se fi asezat. */
async function marcheazaListarileLotului(
  admin: Db, ctx: AboutYouSyncContext, b: BatchRow, mesaj: string,
): Promise<void> {
  if (b.kind !== "product" && b.kind !== "status") return;
  const styleKeys = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
  for (const sk of styleKeys) {
    const listing = await getListingByStyleKey(admin, ctx.businessId, sk);
    if (listing && listing.status === "pending") {
      await setListingStatus(admin, listing.id, "error", { error: mesaj });
    }
  }
}

/** Cat de rar se intreaba un lot care e in lucru la ei de peste doua ore. */
const AMANARE_LOT_LENT_MS = 30 * 60 * 1000;

/** Felurile de lot care lucreaza pe COMENZI, nu pe listari. `related_ids` poarta id-uri de comanda. */
const LOTURI_DE_COMANDA: Record<string, string> = {
  ship: "ship_necunoscut", cancel: "cancel_necunoscut", return: "return_necunoscut",
};

/**
 * Cand am incetat sa intrebam despre un lot de comanda.
 *
 * ═══ ⚠ COMANDA RAMANEA `ship_pending` PE VECI (27.08.2026) ═══
 *
 * La sapte zile lotul se inchidea, si se chema `marcheazaListarileLotului` — care cauta LISTARI
 * dupa `style_key`. Dar la `ship`, `cancel` si `return`, `related_ids` poarta id-uri de COMANDA:
 * cautarea nu gasea nimic, deci comanda ramanea „in curs" pentru totdeauna, fara nicio urma.
 *
 * ⚠ SI NU SE SCRIE `ship_failed`. Ecranul arata butonul „Reia expedierea" pe el, iar o reluare
 * peste o expediere care poate a fost primita inseamna doua expedieri raportate pe aceleasi
 * linii. Starea noua spune adevarul: nu stim, si trebuie sa se uite un om.
 */
async function marcheazaComenzileLotului(
  admin: Db, ctx: AboutYouSyncContext, b: BatchRow,
): Promise<void> {
  const stare = LOTURI_DE_COMANDA[b.kind];
  if (!stare) return;
  const orderIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
  for (const oid of orderIds) {
    await admin.from("aboutyou_orders")
      .update({ status: stare, updated_at: new Date().toISOString() } as never)
      .eq("business_id", ctx.businessId).eq("order_id", oid);
  }
  await logError({
    action: "aboutyou-sync/lot-necunoscut", severity: "critical",
    message: `am incetat sa intrebam de lotul „${b.kind}" dupa sapte zile: verifica in Seller Center inainte de a-l relua`,
    details: { batchRequestId: b.batch_request_id, kind: b.kind, orderIds: orderIds.slice(0, 20) },
    businessId: ctx.businessId,
  });
}

export async function pollOpenBatches(admin: Db, ctx: AboutYouSyncContext, limit = 20): Promise<void> {
  const batches = randuriCitite<BatchRow>("aboutyou.loturiDeschise", await admin
    .from("aboutyou_batches")
    .select("id, batch_request_id, kind, related_ids, attempts, poll_errors, submitted_at, tranzient_de_la, alarma_scrisa_la")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    /* ⚠ Loturile amanate dupa un esec de transport se sar: vezi `amanare`. Fara asta, un lot in
       amanare ar fi tot interogat si amanarea n-ar insemna nimic. */
    .or(`next_poll_at.is.null,next_poll_at.lte.${new Date().toISOString()}`)
    .order("submitted_at", { ascending: true })
    .limit(limit) as never);

  for (const b of batches) {
    const res =
      // `removal` e tot o schimbare de status la ei; difera doar ce facem noi cu
      // rezultatul, iar rezultatul se citeste de pe aceeasi ruta.
      b.kind === "status" || b.kind === "removal" ? await getStatusBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "stock" || b.kind === "stock_removal" ? await getStockBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "price" ? await getPriceBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "ship" ? await getShipBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "cancel" ? await getCancelBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "return" ? await getReturnBatchResults(ctx.auth, b.batch_request_id)
      : await getProductBatchResults(ctx.auth, b.batch_request_id);
    const now = new Date().toISOString();

    if (isAboutYouError(res)) {
      /*
       * CONTOR PROPRIU pentru esecurile de TRANSPORT.
       *
       * Amandouă buclele foloseau `attempts`, cu praguri diferite: 120 pentru „nu
       * s-a asezat inca", 6 pentru „interogarea a picat". Deci un lot care
       * aștepta legitim sase minute ajungea la `attempts = 6`, iar primul 429 pe
       * `/results/products` — 200 de cereri pe minut, chemat de zeci de ori — il
       * trecea pe `failed`. Selectia de mai sus exclude `failed`, deci lotul nu
       * mai era interogat NICIODATA, iar listarea rămânea „pending" pe vecie: nu
       * ajungea `draft`, „Publică toate" o sarea, si omul vedea „in curs" mereu.
       */
      const esecuri = b.poll_errors + 1;
      const trecatoare = res.status === 0 || res.status === 429 || res.status >= 500;

      /*
       * ═══ ⚠ O PANA LA EI NU MAI INCHIDE LOTUL CA ESUAT (26.08.2026) ═══
       *
       * Contorul e per lot, si asta e corect. Dar CAUZA e comuna: cand About You da 5xx sau 429,
       * TOATE loturile deschise ale TUTUROR magazinelor esueaza la aceeasi interogare, in aceeasi
       * rulare. Cronul merge din minut in minut, pragul era sase — deci sase minute de
       * indisponibilitate la ei inchideau ca `failed` tot ce era deschis in platforma. Iar
       * selectia exclude `failed`: loturile alea nu mai erau interogate NICIODATA, desi la ei
       * puteau fi de mult `completed`.
       *
       * ⚠ 429 / 5xx / retea NU SPUN NIMIC DESPRE LOT. Singurele care il pot inchide sunt un
       * raspuns explicit de esec de la ei, sau un 4xx permanent — lot necunoscut, cheie
       * invalidata. Aia raman cu prag, fiindca reincercarea lor chiar n-are ce sa mai aduca.
       *
       * ⚠ In locul pragului, o AMANARE care creste: lotul ramane deschis, dar nu se mai intreaba
       * din minut in minut — altfel am lovi in continuu o limita de rata deja atinsa.
       */
      const renuntam = !trecatoare && esecuri >= 6;
      const deLa = b.tranzient_de_la ?? now;
      await admin.from("aboutyou_batches")
        .update({
          poll_errors: esecuri, polled_at: now,
          status: renuntam ? "failed" : "retry",
          ...(trecatoare
            ? {
              next_poll_at: new Date(Date.now() + amanare(esecuri)).toISOString(),
              tranzient_de_la: deLa,
            }
            : { next_poll_at: null }),
        } as never)
        .eq("id", b.id);

      /*
       * ⚠ TACEREA NU E O OPTIUNE cand lotul ramane deschis la nesfarsit. Dupa un ceas de esecuri
       * de transport neintrerupte se scrie o data — nu la fiecare trecere, altfel acelasi lot ar
       * umple jurnalul si l-ar face necitibil taman cand e nevoie de el.
       */
      if (trecatoare) {
        const deCat = Date.now() - Date.parse(deLa);
        const scrisRecent = b.alarma_scrisa_la
          && Date.now() - Date.parse(b.alarma_scrisa_la) < ORE_PANA_LA_ALARMA * 3600_000;
        if (deCat >= ORE_PANA_LA_ALARMA * 3600_000 && !scrisRecent) {
          await logError({
            action: "aboutyou/loturi", severity: "warning",
            message: `lotul nu se poate interoga de ${Math.round(deCat / 3600_000)} ${deCat >= 7200_000 ? "ore" : "ora"}: About You raspunde ${res.status}`,
            details: { batchRequestId: b.batch_request_id, kind: b.kind, esecuri },
            businessId: ctx.businessId,
          });
          await admin.from("aboutyou_batches")
            .update({ alarma_scrisa_la: now } as never).eq("id", b.id);
        }
      }
      /*
       * ⚠ LISTAREA NU SE VOPSESTE IN ROSU PENTRU O CAUZA TRECATOARE.
       *
       * Un 429 sau un 5xx pe ruta de rezultate nu spune NIMIC despre produs — el
       * poate fi deja acceptat la About You. Marcata „error", listarea nu mai
       * ajungea niciodata `draft`, deci „Publică toate" o sarea; iar „error" nu e
       * nici in `PENDING_STATUSES`, nici in `ACTIVE_STATUSES`, deci magazinul nu
       * mai era ales nici pentru reconciliere. Defectul pe care C6 il repara ar
       * fi fost doar mutat din „in asteptare pe veci" in „eroare pe veci".
       *
       * Lasata pe „pending", listarea ramane in selectia de reconciliere, iar
       * statusul adevarat se citeste de la About You la trecerea urmatoare. Doar
       * cauzele PERMANENTE (cheie invalidata, lot necunoscut) se scriu pe listare.
       */
      /* ⚠ `renuntam` e deja fals pentru cauzele trecatoare — vezi nota de mai sus. */
      if (renuntam) {
        await marcheazaListarileLotului(admin, ctx, b, `Nu am putut citi rezultatul de la About You: ${res.error}`);
      }
      continue;
    }
    const result = res.data;
    /*
     * LOTUL E INCHEIAT doar pe LISTA ALBA, nu prin excludere.
     *
     * Conditia era „nu e pending/processing/retry", deci un corp gol, un JSON
     * necitibil (clientul da `{}` pe parsare esuata) sau un status nou introdus de
     * ei cadeau toate pe ramura de INCHEIERE — cu `items` gol, deci zero erori,
     * deci SUCCES. Listarea trecea pe „ciornă" si comerciantul o publica, desi
     * About You nu primise nimic.
     */
    const incheiat = result?.status === "completed" || result?.status === "failed";
    if (!incheiat) {
      /*
       * Un lot care nu se aseaza NU poate ramane deschis la nesfarsit.
       *
       * Selectia de mai sus ia cele mai vechi loturi deschise, in limita `limit`.
       * Un lot ramas „pending" era numarat la fiecare trecere si, fiind cel mai
       * vechi, ocupa un loc pentru totdeauna: cu destule astfel de loturi, cele
       * noi nu mai ajungeau niciodata sa fie interogate. Cronul ruleaza din minut
       * in minut, deci 120 de incercari inseamna ca About You a avut doua ore sa
       * raspunda. Dupa atat, lotul se inchide ca esuat si eliberam locul.
       */
      const incercari = b.attempts + 1;
      /*
       * ═══ ⚠ „INCA PROCESEAZA" NU E „A ESUAT" (27.08.2026) ═══
       *
       * La 120 de treceri lotul se inchidea ca `failed`, iar listarile lui primeau „About You nu
       * a finalizat procesarea". Numai ca About You nu spusese asta niciodata: `pending`,
       * `processing` si `retry` sunt starile LOR de lucru, si nu exista nicaieri o intelegere
       * dupa care doua ore ar insemna esec. Am inventat un verdict.
       *
       * ⚠ TEMEIUL DE ATUNCI ERA REAL, si nu se pierde: selectia ia cele mai VECHI loturi
       * deschise, in limita `limit`, deci un lot ramas deschis ocupa un loc pentru totdeauna si
       * cele noi nu mai ajungeau sa fie interogate. Dar leacul pentru infometare nu e uciderea
       * lotului — e AMANAREA, si unealta exista deja: `next_poll_at` taie selectia.
       *
       * Deci: pana la prag se intreaba din minut in minut; dupa prag, mult mai rar, si se scrie
       * o data ca sa se vada. Listarea ramane pe `pending`, fiindca asta e adevarul.
       *
       * ⚠ SI TOTUSI EXISTA UN CAPAT. Un lot deschis la nesfarsit e o stare fara iesire, iar
       * `batchRequestId` poate fi si pierdut de ei. Dupa sapte zile se inchide — dar mesajul
       * spune ce s-a intamplat cu adevarat: noi am incetat sa intrebam, nu ei au raspuns „esuat".
       */
      const PRAG_INCETINIRE = 120;
      const SAPTE_ZILE_MS = 7 * 24 * 60 * 60 * 1000;
      const vechimeMs = Date.now() - new Date(b.submitted_at).getTime();
      const amIncetatSaIntreb = vechimeMs > SAPTE_ZILE_MS;
      const incetinit = incercari >= PRAG_INCETINIRE;

      await admin.from("aboutyou_batches").update({
        attempts: incercari,
        polled_at: now,
        /*
         * Interogarea a RASPUNS, deci sirul de esecuri de transport s-a rupt.
         * Fara resetare, pragul de 6 numara esecuri NECONSECUTIVE: un lot deschis
         * legitim doua ore aduna sase hopuri raspandite si e ucis oricum.
         */
        poll_errors: 0,
        /* ⚠ Sirul de esecuri de transport se rupe; amanarea, insa, o pune incetinirea de mai jos. */
        tranzient_de_la: null,
        next_poll_at: incetinit
          ? new Date(Date.now() + AMANARE_LOT_LENT_MS).toISOString()
          : null,
        ...(amIncetatSaIntreb
          ? {
            status: "failed",
            result_summary: {
              status: result?.status ?? "necunoscut",
              /* ⚠ „Am incetat sa intrebam", nu „ei au esuat". Cuvantul conteaza pentru cine citeste. */
              amIncetatSaIntrebam: true, zile: 7,
            } as never,
          }
          : {}),
      } as never).eq("id", b.id);

      if (amIncetatSaIntreb) {
        /* ⚠ Loturile de COMANDA au alt drum: `related_ids` poarta id-uri de comanda, nu chei de
           produs, iar starea scrisa nu are voie sa invite la o reluare oarba. */
        if (LOTURI_DE_COMANDA[b.kind]) {
          await marcheazaComenzileLotului(admin, ctx, b);
        } else {
          await marcheazaListarileLotului(admin, ctx,
            b, "About You nu a terminat procesarea in sapte zile si am incetat sa intrebam. Trimite produsul din nou.");
        }
      } else if (incetinit && b.alarma_scrisa_la == null) {
        /* ⚠ O SINGURA DATA pe lot: cronul de minut ar scrie altfel acelasi rand la nesfarsit. */
        await logError({
          action: "aboutyou-sync/lot-lent", severity: "warning",
          message: `lotul ${b.kind} e in lucru la About You de peste doua ore: se intreaba mai rar, dar nu se abandoneaza`,
          details: { batchRequestId: b.batch_request_id, incercari, relatedIds: b.related_ids },
          businessId: ctx.businessId,
        });
        await admin.from("aboutyou_batches")
          .update({ alarma_scrisa_la: now } as never).eq("id", b.id);
      }
      continue;
    }

    // Completed or failed: aggregate per-style errors and settle the batch.
    const styleKeys = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
    const errors = (result.items ?? []).filter((it) => !it.success).flatMap((it) => it.errors ?? []);
    /*
     * Verdictul se ia din `success`, nu din numarul de texte de eroare.
     *
     * `UpsertProductResultItemSchema` cere `errors` in raspuns, dar nimic nu
     * garanteaza ca e nevida cand `success` e `false`. Socotit pe `errors.length`,
     * un articol respins cu lista goala trecea drept REUSIT: listarea ajungea
     * „ciornă", comerciantul o publica, si About You nu avea ce publica.
     */
    const esuate = (result.items ?? []).filter((it) => !it.success).length;
    const hardFail = result.status === "failed" || esuate > 0;

    /*
     * Loturile de expediere isi aseaza propria comanda.
     *
     * `shipOrderNow` lasa comanda pe `ship_pending`; abia aici stim daca About
     * You a acceptat. Fara pasul asta, o expediere respinsa ramanea marcata ca
     * reusita si nimeni n-o mai relua — clientul astepta un colet despre care
     * marketplace-ul nu stia nimic.
     */
    /*
     * ⚠ SCRIERILE LOCALE PICATE TIN LOTUL DESCHIS.
     *
     * Rezultatul lui About You se citeste O SINGURA DATA: lotul inchis pe `completed` nu se mai
     * intreaba niciodata. Deci o scriere locala picata inseamna ca adevarul lor e pierdut
     * definitiv — comanda ramane `ship_pending` pe veci, listarea ramane `pending`, sau un produs
     * respins arata ca merge. Lasat pe `retry`, lotul se reinterogheaza si asezarea se reface.
     *
     * ⚠ SE DECLARA AICI, INAINTEA TUTUROR ASEZARILOR, nu doar inaintea celor de catalog: prima
     * varianta il punea mai jos, deci `stock_removal`, `ship`, `cancel` si `return` inchideau
     * lotul oricum. Cea mai scumpa era expedierea: comanda ramanea `ship_pending`, comerciantul
     * credea ca n-a plecat si apasa „Reia expedierea".
     */
    let asezat = true;

    /*
     * Retragerea unei variante se confirma ABIA AICI.
     *
     * `reconciliazaVariante` a stins doar `enabled`; marcajul „retras" se pune cand
     * stocul zero a fost chiar aplicat. Pe eșec nu marcam nimic: randul reintra in
     * `deScos` la trecerea urmatoare si zeroul se reincearca. `related_ids` poarta
     * aici id-urile RANDURILOR din `aboutyou_variants`.
     */
    if (b.kind === "stock_removal") {
      if (!hardFail) {
        const ids = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
        if (ids.length > 0) {
          const { error: eScos } = await admin.from("aboutyou_variants")
            .update({ ay_status: "removed", updated_at: now } as never).in("id", ids);
          /*
           * ⚠ Nescris, marcajul „retras" lipseste, deci variantele reintra in `deScos` la
           * fiecare trecere si zeroul se retrimite la nesfarsit. Lotul ramane deschis.
           */
          if (eScos) asezat = false;
        }
      }
    }

    /*
     * Anularea si returul isi inchid propria comanda.
     *
     * Lotul lor nu se inregistra deloc, deci `cancel_pending` / `return_pending`
     * erau stari fara ieșire: comerciantul vedea „in curs" pentru totdeauna, fara
     * sa afle daca About You a acceptat. Statusul de esec il lasa vizibil, ca sa se
     * poata relua din panou.
     */
    if (b.kind === "cancel" || b.kind === "return") {
      const orderIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      const reusit = b.kind === "cancel" ? "cancelled" : "returned";
      const esuat = b.kind === "cancel" ? "cancel_failed" : "return_failed";
      for (const oid of orderIds) {
        const { error: eStare } = await admin.from("aboutyou_orders")
          .update({ status: hardFail ? esuat : reusit, last_synced_at: now, updated_at: now } as never)
          .eq("business_id", ctx.businessId).eq("order_id", oid);
        /*
         * ⚠ Nescrisa, comanda ramane pe `cancel_pending` / `return_pending` PENTRU TOTDEAUNA:
         * rezultatul lor se citeste o singura data, iar lotul inchis nu se mai intreaba. Iar
         * comerciantul vede „in curs" pe ceva ce s-a terminat de mult.
         */
        if (eStare) asezat = false;
      }
    }

    if (b.kind === "ship") {
      const orderIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      for (const oid of orderIds) {
        const { error: eExp } = await admin.from("aboutyou_orders")
          .update({
            status: hardFail ? "ship_failed" : "shipped",
            last_synced_at: now,
            updated_at: now,
          } as never)
          .eq("business_id", ctx.businessId).eq("order_id", oid);
        /*
         * ⚠ Cea mai scumpa dintre toate: nescrisa, comanda ramane `ship_pending`, comerciantul
         * crede ca expedierea n-a plecat si apasa „Reia expedierea" — doua expedieri raportate pe
         * aceleasi linii, pentru o scriere de-o clipa care n-a mers.
         */
        if (eExp) asezat = false;
      }
    }

    if (b.kind === "stock" || b.kind === "price") {
      for (const sk of styleKeys) {
        const randListare = await getListingByStyleKey(admin, ctx.businessId, sk);
        if (!randListare) continue;
        /*
         * ═══ ⚠ DOUA LOTURI DE STOC POT SA SE ASEZE IN ORDINE INVERSA (26.08.2026) ═══
         *
         * Loturile lor se prelucreaza ASINCRON. Trimitem stocul 5, apoi la o secunda stocul 3; daca
         * al doilea se aseaza primul si primul dupa el, la ei ramane 5 — iar la noi coada e goala,
         * deci nimic nu mai reimpinge. Se vinde marfa care nu exista.
         *
         * ⚠ EI AU UN CAMP ANUME PENTRU ASTA — `valid_at` — dar nu-l putem folosi: documentatia lor
         * cere autentificare de partener, iar o marca de timp gresita ar putea opri impingerea de
         * stoc pentru toate magazinele. Vezi nota de la `MAX_ITEMI_STOC_PRET`.
         *
         * ⚠ SI NU EXISTA NICIUN CAPAT DE CITIRE a stocului sau pretului: `GET /products/` da doar
         * `style_key`, `sku` si `status`. Deci nici deriva fata de ei nu se poate masura.
         *
         * ⚠ DAR REORDONAREA SE VEDE DIN DATELE NOASTRE. Daca un lot mai NOU pentru acelasi produs
         * s-a incheiat deja, inseamna ca asta se aseaza dupa el — deci poate sa-l fi suprascris cu
         * o valoare mai veche. Atunci se pune la coada o impingere proaspata, care citeste stocul
         * de acum. Nu stim daca s-a stricat ceva; stim ca S-AR FI PUTUT, si costa o cerere.
         */
        if (!hardFail && randListare.product_id) {
          const maiNou = randuriCitite<{ id: string }>(
            "aboutyou.lotMaiNouIncheiat", await admin
              .from("aboutyou_batches").select("id")
              .eq("business_id", ctx.businessId).eq("kind", b.kind)
              .contains("related_ids", [sk])
              .eq("status", "completed")
              .gt("submitted_at", b.submitted_at)
              .neq("id", b.id).limit(1) as never);

          if (maiNou.length > 0) {
            const { error: eReimpins } = await admin.from("aboutyou_sync_queue").upsert(
              {
                business_id: ctx.businessId, product_id: randListare.product_id,
                offer_id: sk, op: b.kind === "stock" ? "stock" : "upsert",
                attempts: 0, last_error: null,
              },
              { onConflict: "business_id,offer_id,op" },
            );
            await logError({
              action: "aboutyou-sync/loturi", severity: eReimpins ? "error" : "info",
              message: eReimpins
                ? `lot asezat dupa unul mai nou, iar reimpingerea n-a putut fi pusa la coada: ${eReimpins.message}`
                : `lot ${b.kind} asezat dupa unul mai nou al aceluiasi produs: se reimpinge valoarea de acum`,
              details: { styleKey: sk, batchRequestId: b.batch_request_id },
              businessId: ctx.businessId,
            });
          }
        }
      }
    }

    // Only catalog batches (product create/update, status) reflect onto the
    // listing status; stock/price batches are transient and just settle.
    if (b.kind === "product" || b.kind === "status" || b.kind === "removal") {
      for (const sk of styleKeys) {
        const listing = await getListingByStyleKey(admin, ctx.businessId, sk);
        if (!listing) continue;
        /*
         * Retragerea se incheie ABIA AICI, si se recunoaste dupa TIPUL LOTULUI.
         *
         * `stergeListare` a cerut retragerea si a lasat randul neatins. Reusita il
         * sterge; esecul il lasa vizibil, cu motivul, ca sa se poata relua — altfel
         * produsul ar rămâne activ pe About You fara nicio urma la noi.
         */
        if (b.kind === "removal") {
          if (hardFail) {
            if (!await setListingStatus(admin, listing.id, "error", {
              error: errors.slice(0, 3).join("; ").slice(0, 500)
                || "About You nu a acceptat retragerea produsului. Încearcă din nou.",
            })) asezat = false;
          } else {
            const { error: eSters } = await admin.from("aboutyou_listings").delete().eq("id", listing.id);
            /* ⚠ Randul nesters inseamna ca produsul apare mai departe in panou desi e retras. */
            if (eSters) asezat = false;
          }
          continue;
        }
        if (hardFail) {
          // Cand About You respinge articole fara sa spuna de ce, spunem macar
          // CATE: „Eroare la procesare" singur nu-i da omului nimic de cautat.
          const motiv = errors.slice(0, 5).join("; ").slice(0, 500)
            || (esuate > 0
              ? `About You a respins ${esuate} ${esuate === 1 ? "variantă" : "variante"}, fără să precizeze motivul.`
              : "Eroare la procesarea pe About You.");
          /*
           * ⚠ CE VEDE CUMPARATORUL ACUM. Un esec la o MODIFICARE nu opreste produsul de la ei:
           * acolo ramane varianta dinainte, si se vinde mai departe. Scris asa, „eroare" singur il
           * lasa pe comerciant sa creada ca produsul e cazut — iar el se uita in alta parte in loc
           * sa retrimita. Se spune, cat timp mai stim starea.
           */
          const eraLaEi = STARI_ALE_LOR.has(listing.stare_dinainte ?? "");
          const coada = eraLaEi
            ? ` La About You produsul rămâne „${listing.stare_dinainte}”, cu varianta dinainte de modificare.`
            : "";
          if (!await setListingStatus(admin, listing.id, "error", {
            error: (motiv + coada).slice(0, 500),
            /* Si-a facut treaba: urmatoarea trimitere isi scrie propria stare de dinainte. */
            stare_dinainte: null,
          })) asezat = false;
        } else if (b.kind === "product" && listing.status === "pending") {
          /*
           * ═══ ⚠ UN PRODUS CU PESTE 100 DE VARIANTE PLEACA IN MAI MULTE LOTURI ═══
           *
           * `POST /products/` primeste cel mult 100 de articole, deci 250 de variante inseamna
           * trei loturi, fiecare cu `batchRequestId`-ul lui. Loturile se aseaza la ei ASINCRON si
           * in orice ordine.
           *
           * ⚠ AICI SE PUBLICA LA PRIMUL LOT INCHEIAT. Nu e o cursa care se poate intampla — e
           * comportamentul obisnuit al oricarui produs cu peste 100 de variante: se cerea
           * aprobarea produsului cand doua treimi din variante nu ajunsesera inca.
           *
           * ⚠ NU E NEVOIE DE NICIUN CONTOR NOU: loturile aceluiasi produs poarta acelasi
           * `style_key` in `related_ids`. Deci se intreaba direct baza daca a mai ramas vreunul
           * neincheiat — si daca da, publicarea asteapta lotul care se incheie ultimul.
           */
          const fratiNeterminati = randuriCitite<{ id: string }>(
            "aboutyou.loturileFratelui", await admin
              .from("aboutyou_batches").select("id")
              .eq("business_id", ctx.businessId).eq("kind", "product")
              .contains("related_ids", [listing.style_key])
              /*
               * ═══ ⚠ SI FRATII NEURMARITI BLOCHEAZA (27.08.2026) ═══
               *
               * Lista era doar `pending/processing/retry`. Dar de cand urma se scrie INAINTE de
               * cerere, un frate poate sta pe `intentie` (trimis, id nelegat) sau pe `necunoscut`
               * (raspuns pe care nu-l putem citi). Amandoua inseamna „poate n-a ajuns tot
               * produsul acolo" — exact ce verificarea asta trebuie sa impiedice.
               *
               * ⚠ Fara ele, un produs cu 250 de variante putea fi publicat cu o transa lipsa, si
               * marimile alea ar fi fost de vanzare fara sa existe.
               */
              .in("status", ["intentie", "necunoscut", "pending", "processing", "retry"])
              .neq("id", b.id) as never);

          /*
           * ═══ ⚠ UN PRODUS CU PESTE 100 DE VARIANTE NU SE PUBLICA NICIODATA (27.08.2026) ═══
           *
           * Statusul se scria INAINTEA verificarii fratilor. Deci, la trei loturi:
           *
           *   lotul 1 se incheie → listarea trece pe `draft` → vede frati → nu publica
           *   lotul 2 se incheie → `listing.status` nu mai e `pending` → ramura nici nu se intra
           *   lotul 3 se incheie → la fel
           *
           * Adica nimeni nu publica. Verificarea fratilor, pusa ca sa nu se publice PREA DEVREME,
           * facea sa nu se publice DELOC — si numai la produsele mari, unde se observa cel mai greu.
           * Proba care o pazea verifica doar ca verificarea exista si e inaintea publicarii; nu si
           * ca scrierea statusului vine dupa ea. Verde, peste defect.
           *
           * ⚠ ACUM NU SE ATINGE NIMIC PANA LA ULTIMUL LOT. Cat mai are frati in lucru, listarea
           * ramane `pending` — ceea ce e si adevarat: produsul chiar nu e intreg la ei. Ultimul lot
           * care se aseaza gaseste zero frati, scrie starea si pune publicarea la coada.
           *
           * ⚠ SI UN FRATE PICAT OPRESTE PUBLICAREA, cum trebuie: ramura de esec scrie `error`, deci
           * ultimul lot bun nu mai gaseste `pending` si nu publica un produs incomplet.
           */
          if (fratiNeterminati.length > 0) {
            /* ⚠ Se spune, ca sa nu para ca s-a pierdut ceva: totul vine la ultimul lot. */
            await logError({
              action: "aboutyou-sync/loturi", severity: "info",
              message: `lot incheiat, dar produsul mai are ${fratiNeterminati.length} loturi in lucru: statusul si publicarea asteapta`,
              details: { styleKey: listing.style_key, batchId: b.batch_request_id },
              businessId: ctx.businessId,
            });
            continue;
          }

          /*
           * ⚠ „Ciorna" DOAR LA PRIMA TRIMITERE. Vezi `urmareaLotului`: la o modificare a unui
           * produs deja aprobat se pune inapoi starea lui de la ei, iar cand n-o stim ramane pe
           * `pending` si o scrie reconcilierea.
           */
          const urmare = urmareaLotului(listing.stare_dinainte);
          if (urmare.status != null) {
            if (!await setListingStatus(admin, listing.id, urmare.status, { error: null, stare_dinainte: null })) {
              asezat = false;
            }
          } else {
            const { error: eStare } = await admin.from("aboutyou_listings")
              .update({ error: null, stare_dinainte: null } as never).eq("id", listing.id);
            if (eStare) asezat = false;
          }
          /*
           * PUBLICAREA SE INLANTUIE SINGURA. Aici, si nicaieri altundeva.
           *
           * API-ul lor are doi pasi — `POST /products/` creeaza produsul, iar
           * `PUT /products/status` il duce spre aprobare („Newly created products
           * start in the `draft` state") — si ii lasasem pe amandoi in interfata,
           * ca doua butoane. Dar pasii sunt ASINCRONI: produsul apare la ei abia
           * dupa ce lotul se aseaza, in zeci de secunde. Comerciantul a apasat
           * „Publică" la patru secunde dupa trimitere si a primit „Product master
           * not found" — i se cerea sa nimereasca un moment pe care nu-l poate
           * vedea.
           *
           * Momentul asta il stim NOI, exact: lotul tocmai s-a incheiat cu bine.
           * Deci punem singuri publicarea la coada. Se declanseaza doar la
           * trecerea `pending -> draft`, adica imediat dupa o trimitere reusita —
           * nu atinge ciornele vechi, lasate dinadins nepublicate.
           */
          if (listing.product_id && urmare.publica) {
            /* ⚠ Si aici se verifica `error`: fara el, publicarea nu se punea la coada si produsul
               ramanea ciorna la ei pentru totdeauna, fara nicio urma. */
            const { error: ePub } = await admin.from("aboutyou_sync_queue").upsert(
              { business_id: ctx.businessId, product_id: listing.product_id, offer_id: listing.style_key, op: "publish", attempts: 0, last_error: null },
              { onConflict: "business_id,offer_id,op" },
            );
            if (ePub) {
              await logError({
                action: "aboutyou-sync/loturi", severity: "error",
                message: `publicarea nu s-a putut pune la coada: ${ePub.message}`,
                details: { styleKey: listing.style_key, productId: listing.product_id },
                businessId: ctx.businessId,
              });
            }
          }
        }
      }
    }
    /*
     * ⚠ `retry`, NU `completed`, cand asezarea locala n-a mers: lotul se reinterogheaza la
     * trecerea urmatoare si se aseaza atunci. Inchis, rezultatul lor s-ar fi pierdut pentru
     * totdeauna — el nu se mai poate cere a doua oara dupa ce randul e marcat gata.
     */
    if (!asezat) {
      await logError({
        action: "aboutyou-sync/loturi", severity: "warning",
        message: "rezultatul lotului n-a putut fi asezat local: lotul ramane deschis si se reia",
        details: { batchRequestId: b.batch_request_id, kind: b.kind }, businessId: ctx.businessId,
      });
    }
    await admin.from("aboutyou_batches")
      .update({
        status: !asezat ? "retry" : hardFail ? "failed" : "completed",
        polled_at: now,
        result_summary: { status: result.status, errors: errors.slice(0, 10) } as never,
      })
      .eq("id", b.id);
  }
}

/*
 * ── Reconciliere (cron): citim inapoi statusurile de la About You ─────────────
 *
 * DOUA APELURI, nu unul, pentru ca sunt doua raspunsuri diferite.
 *
 * `GET /products/` da statusul, dar NU si motivul respingerii — schema lui nici
 * nu are campurile alea. Codul le citea totusi de acolo, primea `undefined` si
 * scria peste ce stia deja: dupa fiecare trecere a cronului, un produs respins
 * ramanea „respins" cu lista de motive golita. Motivele vin de la
 * `GET /products/rejected`, si doar de acolo le scriem.
 */
/*
 * Cand un style are SKU-uri in stari diferite, care stare descrie produsul?
 *
 * `GET /products/` intoarce un rand PER SKU, iar noi tinem un status PER STYLE.
 * Scrise pe rand, ultimul SKU din pagina castiga — deci un produs cu o marime
 * respinsa si restul active putea aparea „Activ", la intamplare. Ordinea de mai
 * jos e explicita: ce cere atentia bate ce merge.
 */
const PRIORITATE_STATUS = [
  "rejected", "problem", "pending_approval", "pending_active", "draft", "inactive", "active",
];
function statusDominant(stari: Set<string>): string {
  for (const s of PRIORITATE_STATUS) if (stari.has(s)) return s;
  return [...stari][0] ?? "active";
}

export async function reconcileStatuses(
  admin: Db, ctx: AboutYouSyncContext, maxPages = 50, pana?: number,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  /*
   * Reconcilierea are TERMEN, altfel mananca fereastra pasului urmator.
   *
   * Ridicand plafonul de la 5 la 50 de pagini, un catalog mare putea consuma
   * singur toata rularea cronului — iar pasul de dupa e POLLUL DE COMENZI, adica
   * exact ce nu are voie sa cada. Ce nu incape se reia peste un minut: nimic nu se
   * pierde, doar se amana.
   */
  const expirat = () => pana != null && Date.now() > pana;
  const respinse: string[] = [];
  // Un rand PER SKU, un status PER STYLE: se aduna intai, se scrie o data.
  const peStyle = new Map<string, Set<string>>();
  let trunchiat = true;

  /*
   * ═══ ⚠ SE PORNEA DE LA PAGINA 1 LA FIECARE RULARE (26.08.2026) ═══
   *
   * Cu plafon de 50 de pagini si un buget de timp care se termina de obicei mai devreme, un
   * catalog mare nu ajungea NICIODATA la sfarsit: aceleasi prime pagini se reconciliau de zeci de
   * ori pe ora, iar ultimele niciodata. Un produs respins de ei, aflat pe pagina 60, ramanea la
   * noi „activ" pentru totdeauna — si comerciantul nu afla de ce nu se vinde.
   *
   * ⚠ E CHIAR DEFECTUL REPARAT LA TRENDYOL, unde „scanarea fixa de 5 pagini de la zero n-a vazut
   * niciodata nimic dupa produsul 500 intr-un catalog de 1033". eMAG are de mult
   * `reconcile_page`; aici lipsea.
   *
   * ⚠ SE TINE MINTE UNDE S-A AJUNS, si se reia de-acolo. Cand catalogul se termina, se intoarce
   * la 1 — deci roata se invarte si fiecare pagina isi vine la rand.
   */
  const dePeLa = Math.max(1, Number(ctx.config.reconcile_page ?? 1) || 1);
  let urmatoarea = dePeLa;

  for (let page = dePeLa; page < dePeLa + maxPages; page++) {
    urmatoarea = page + 1;
    const res = await getProducts(ctx.auth, { page, per_page: 100 });
    /*
     * Eroarea NU se mai inghite. Inainte se ieșea cu `return` gol, iar cronul
     * numara rularea drept reusita: o cheie invalidata sau o pana lasau statusurile
     * inghetate la nesfarsit, fara nicio urma nicaieri.
     */
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const items = res.data?.items ?? [];
    for (const it of items) {
      if (!it.style_key) continue;
      const set = peStyle.get(it.style_key) ?? new Set<string>();
      set.add(String(it.status));
      peStyle.set(it.style_key, set);
    }
    /*
     * Paginarea se opreste pe LUNGIMEA lotului, nu pe `pagination.pages`.
     * `pages` e nulabil in schema lor, iar `Number(undefined ?? 1)` dadea 1: ne
     * opream dupa prima suta de SKU-uri si restul catalogului nu se reconcilia
     * niciodata. Aceeasi regula o foloseste deja `taxonomy.ts`.
     */
    /*
     * ⚠ CATALOGUL S-A TERMINAT: roata se intoarce la inceput. Fara asta, cursorul ar creste la
     * nesfarsit si de la un punct incolo fiecare rulare ar cere pagini goale.
     */
    if (items.length < 100) { trunchiat = false; urmatoarea = 1; break; }
    if (expirat()) break;
    await pause(250);
  }

  /*
   * ⚠ CURSORUL SE SCRIE SI CAND S-A OPRIT DIN BUGET, nu doar la capat. Tocmai oprirea din buget e
   * cazul obisnuit la un catalog mare — si singurul in care „de la 1" insemna sa nu se ajunga
   * niciodata mai departe.
   */
  await patchAboutYouConfig(admin, ctx.businessId, { reconcile_page: urmatoarea });

  if (trunchiat) {
    await logError({
      action: "aboutyou/reconcile", severity: "info",
      message: `Reconcilierea s-a oprit la pagina ${urmatoarea - 1}; se reia de-acolo la trecerea urmatoare.`,
      details: { businessId: ctx.businessId, dePeLa, urmatoarea }, businessId: ctx.businessId,
    });
  }

  {
    const now = new Date().toISOString();
    for (const [styleKey, stari] of peStyle) {
      const status = statusDominant(stari);
      const eRespins = status === "rejected";
      if (eRespins) respinse.push(styleKey);
      await admin.from("aboutyou_listings")
        .update({
          status,
          last_status_at: now,
          updated_at: now,
          /*
           * Motivele respingerii se golesc cand About You o retrage, dar `error`
           * NU se atinge aici.
           *
           * `error` e scris si de `pollOpenBatches` pentru eșecurile de ARTICOL la
           * o actualizare. Un articol respins nu schimba statusul produsului pe
           * About You — rămâne `active` —, deci `eRespins` era fals si mesajul
           * dispărea in maximum un minut: comerciantul credea ca modificarea e
           * live, iar acolo rămâneau datele vechi. Golirea lui `error` aparține
           * exclusiv cailor care CHIAR au reusit: trimiterea (`syncProductNow`) si
           * lotul incheiat fara erori.
           */
          ...(eRespins ? {} : { rejection_reasons: [] as never }),
        } as never)
        .eq("business_id", ctx.businessId).eq("style_key", styleKey);
    }
  }

  if (respinse.length === 0) return { ok: true };
  await pause(250);

  // Limita de rata aici e 50/min, de douazeci de ori mai stransa: o singura
  // trecere paginata, nu cate o cerere per produs respins.
  const deRespins = new Set(respinse);

  /*
   * ═══ ⚠ CAND SUNT PUTINE, SE CER PE NUME (27.08.2026) ═══
   *
   * `/products/rejected` accepta `style_key`. Cu putine produse respinse — cazul obisnuit —
   * intrebam exact pe cele care ne trebuie: raspuns sigur, fara paginare, deci fara nicio cale
   * prin care un style sa nu-si primeasca motivul.
   *
   * ⚠ PRAGUL E O SOCOTEALA, nu un gust: ruta are 50 de cereri pe minut. Peste cincisprezece
   * nume, paginarea (100 pe pagina) costa mai putin decat cate o cerere de fiecare.
   */
  const PRAG_PE_NUME = 15;
  if (deRespins.size <= PRAG_PE_NUME) {
    for (const styleKey of [...deRespins]) {
      if (expirat()) break;
      const unul = await getRejectedProducts(ctx.auth, { style_key: styleKey, per_page: 1 });
      if (isAboutYouError(unul)) return { ok: false, error: unul.error, status: unul.status };
      const it = (unul.data?.items ?? [])[0];
      /*
       * ⚠ Lipsa NU se scrie ca „fara motive": statusul vine din `GET /products/`, iar ruta de
       * respinse se poate aseza cu intarziere. Sters, motivul de la trimiterea dinainte ar
       * disparea si comerciantul ar ramane cu „respins" si nimic altceva.
       */
      if (!it || !it.style_key) continue;
      const rejection = (it.rejection_reasons ?? []) as AboutYouRejectionReason[];
      await admin.from("aboutyou_listings")
        .update({
          rejection_reasons: (rejection as unknown) as never,
          error: it.rejection_message ?? null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("business_id", ctx.businessId).eq("style_key", it.style_key);
      await pause(250);
    }
    return { ok: true };
  }
  /*
   * ═══ ⚠ MOTIVELE PORNEAU MEREU DE LA PAGINA 1, SI SE OPREAU LA 20 (27.08.2026) ═══
   *
   * Peste 2000 de produse respinse, un style aflat mai departe nu-si primea NICIODATA motivul:
   * comerciantul vedea „respins" fara sa afle de ce, si nu mai avea cum sa afle. E acelasi
   * defect reparat luna asta la catalogul principal si la Trendyol — „scanarea fixa de la zero
   * n-a vazut niciodata nimic dupa produsul 500" — ramas aici.
   *
   * Doua leacuri, si primul face aproape toata treaba:
   *
   * ⚠ SE IESE CAND S-A GASIT TOT CE CAUTAM. Bucla mergea mai departe si dupa ce fiecare style
   * cerut isi primise motivul — pagini cerute degeaba, pe o ruta cu 50 de cereri pe minut. Cu
   * iesirea, plafonul de 20 aproape nu mai are cand sa muste.
   *
   * ⚠ SI SE TINE MINTE UNDE S-A AJUNS, ca roata sa se invarta si in cazul rau. Cand catalogul de
   * respinse se termina, se porneste iar de la 1.
   */
  const dePeLaR = Math.max(1, Number(ctx.config.rejected_page ?? 1) || 1);
  let urmatoareaR = dePeLaR;
  let gasiteToate = false;
  for (let page = dePeLaR; page < dePeLaR + Math.min(maxPages, 20); page++) {
    urmatoareaR = page + 1;
    if (expirat()) break;
    const res = await getRejectedProducts(ctx.auth, { page, per_page: 100 });
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const items = res.data?.items ?? [];
    /* Catalogul s-a terminat: roata se intoarce la inceput. */
    if (items.length === 0) { urmatoareaR = 1; break; }
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it.style_key || !deRespins.has(it.style_key)) continue;
      const rejection = (it.rejection_reasons ?? []) as AboutYouRejectionReason[];
      await admin.from("aboutyou_listings")
        .update({
          rejection_reasons: (rejection as unknown) as never,
          error: it.rejection_message ?? null,
          updated_at: now,
        } as never)
        .eq("business_id", ctx.businessId).eq("style_key", it.style_key);
      /* ⚠ Scos din multime: cand se goleste, n-avem ce mai cauta. */
      deRespins.delete(it.style_key);
    }
    if (deRespins.size === 0) { gasiteToate = true; break; }
    // Ca mai sus: oprirea se ia din lungimea lotului, nu din `pagination.pages`.
    if (items.length < 100) { urmatoareaR = 1; break; }
    await pause(250);
  }
  /*
   * ⚠ CURSORUL NU SE MUTA CAND AM GASIT TOT. Mutat si atunci, urmatoarea trecere ar sari peste
   * paginile de la inceput fara motiv — iar cele mai multe treceri se termina asa.
   */
  if (!gasiteToate && urmatoareaR !== dePeLaR) {
    await patchAboutYouConfig(admin, ctx.businessId, { rejected_page: urmatoareaR });
  }
  return { ok: true };
}

// ── Queue routing ────────────────────────────────────────────────────────────────
export interface AboutYouQueueItem {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: string;
  attempts: number;
  /**
   * Generatia randului la clipa revendicarii.
   *
   * ═══ ⚠ EXISTA IN BAZA DE MULT, DAR LUCRATORUL O ARUNCA (26.08.2026) ═══
   *
   * `aboutyou_sync_queue` are coloana `generation` si declansatorul `trg_generatie` care o
   * creste la fiecare update — verificat in baseline. Iar lucratorul trece prin
   * `revendica_din_coada`, care intoarce randul INTREG (`to_jsonb(q.*)`), deci valoarea venea
   * deja in raspuns si se arunca.
   *
   * Fara ea:
   *
   *   10:00:00  stocul e 5   -> rand in coada, generatia 10
   *   10:00:01  lucratorul revendica randul si pleaca la About You
   *   10:00:02  omul schimba stocul la 3 -> acelasi rand, generatia 11
   *   10:00:04  lucratorul termina cu 5 si face `delete where id = X`
   *
   * Generatia 11 dispare, desi n-a plecat niciodata. Comerciantul vede 3 in magazin si 5 la
   * About You, fara nicio eroare nicaieri.
   *
   * ⚠ Optionala: un apelant care nu trece prin `revendica_din_coada` n-o are, si atunci se
   * scrie fara paza — mai bine fara paza decat deloc. Vezi `src/lib/marketplace/coada-cas.ts`.
   */
  generation?: number | null;
}

/**
 * Un element de coada, dus la capat.
 *
 * ═══ ⚠ O CITIRE PICATA AR FI OMORAT TOATA RULAREA CRONULUI (27.08.2026) ═══
 *
 * De azi, citirile din baza ARUNCA `EroareCitireBaza` in loc sa intoarca `null` — altfel o pana
 * de-o clipa trecea drept „listarea nu exista" si elementul se STERGEA din coada ca reusit.
 *
 * Dar bucla din cron n-avea nicio plasa in jurul lui `processQueueItem`: aruncarea ar fi iesit
 * din bucla magazinelor si ar fi oprit pasii 2, 3 si 4 — sondarea loturilor, reconcilierea si
 * ingestul comenzilor — pentru TOATA platforma. Adica reparatia unei tacerimi ar fi produs o
 * cadere mult mai mare.
 *
 * ⚠ SE PRINDE AICI, la marginea lucratorului de coada, si devine `status: 0`. Regula e scrisa
 * chiar in `rand-citit.ts`: „se prinde intr-un singur loc, la marginea lui `trimiteElement`, si
 * devine verdictul `trecatoare` — cel care nu arde nicio incercare". Cronul stie deja ce sa faca
 * cu `0`: nu pune nimic in contul elementului si opreste magazinul pe tura asta.
 */
export async function processQueueItem(admin: Db, ctx: AboutYouSyncContext, item: AboutYouQueueItem): Promise<SyncOutcome> {
  try {
    return await trimiteElement(admin, ctx, item);
  } catch (e) {
    if (e instanceof EroareCitireBaza) {
      return { ok: false, error: e.message, status: 0 };
    }
    throw e;
  }
}

async function trimiteElement(admin: Db, ctx: AboutYouSyncContext, item: AboutYouQueueItem): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeByStyleKey(admin, ctx, item.offer_id);
    case "publish":
      return item.product_id ? publishProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "stock":
      return item.product_id ? pushStockNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "price":
      return item.product_id ? pushPriceNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "ship":
      return shipOrderNow(admin, ctx, item.offer_id);
    default:
      // upsert: full product push (also refreshes stock + price on About You).
      return item.product_id ? syncProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
  }
}

/*
 * ── Impingere dedicata de stoc / pret ────────────────────────────────────────
 *
 * Stocul se calculeaza cu ACEEASI regula ca la creare (`stocVarianta` din
 * mapping.ts). Erau doua reguli diferite pentru acelasi lucru — una la creare,
 * alta aici — iar cele doua puteau devia oricat fara ca nimic sa semnaleze.
 *
 * ═══ ⚠ `valid_at` NU SE TRIMITE, SI MOTIVUL SCRIS AICI ERA O PRESUPUNERE (26.08.2026) ═══
 *
 * Scria ca „cu el am programa o valoare in viitor". Nu stim asta. Numele campului si contextul in
 * care apare la ei sugereaza contrariul — clipa in care valoarea comerciantului A DEVENIT valida,
 * folosita ca o actualizare veche sa nu suprascrie una noua. Documentatia lor e in spatele
 * autentificarii de partener, deci n-am putut citi contractul.
 *
 * ⚠ NU SE GHICESTE PE UN CAMP CARE PLEACA LA EI. Daca semantica noastra e gresita in celalalt
 * sens — de pilda daca ei cer `valid_at` in viitor si resping o marca de timp din trecut —
 * impingerea de stoc s-ar opri pentru TOATE magazinele, si asta e mai rau decat lipsa campului.
 *
 * ⚠ CE FACEM IN LOC, si acopera aceeasi paguba fara sa depinda de contractul lor:
 *
 *   1. Valoarea se citeste PROASPAT la trimitere (vezi `pushStockNow` mai jos), nu la punerea in
 *      coada — deci nu plecam niciodata cu o cifra invechita de la noi.
 *   2. Ce ramane e reordonarea la ei, intre doua loturi trimise la secunde distanta. Pentru aia
 *      trebuie o verificare de deriva — citim inapoi ce au ei si reimpingem la nepotrivire —
 *      exact ca `masoaraDeriva` de la eMAG. E singura care prinde si derivele venite din alte
 *      cauze, nu doar din reordonare.
 *
 * ⚠ DE CERUT DE LA EI, in scris: ce inseamna exact `valid_at`, ce se intampla cu o marca de timp
 * din trecut, si daca lipsa lui inseamna „aplica acum". Pana atunci nu se pune.
 */
const MAX_ITEMI_STOC_PRET = 1000;

export async function pushStockNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product, error: eroareProdus } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (eroareProdus) return { ok: false, error: eroareProdus.message };
  if (!product) return { ok: true, action: "skipped" };
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  const produs = product as unknown as MappableProduct;
  const variants = atasezaPreturileRon(produs, await getVariantData(admin, listing.id))
    .filter((v) => v.enabled && v.sku);
  if (variants.length === 0) return { ok: true, action: "skipped" };

  const items = variants.map((v) => ({
    sku: v.sku,
    quantity: Math.max(0, Math.min(1_000_000, Math.round(v.quantity ?? stocVarianta(produs, null).quantity))),
  }));

  return trimiteInTranse(admin, ctx, listing.style_key, "stock", items,
    (lot) => updateStock(ctx.auth, lot));
}

/**
 * Trimite in transe de cel mult 1000 (limita `maxItems` a schemelor de stoc si
 * pret). Peste limita, cererea INTREAGA e respinsa, nu doar surplusul.
 */
async function trimiteInTranse<T>(
  admin: Db, ctx: AboutYouSyncContext, styleKey: string, kind: "stock" | "price",
  items: T[], trimite: (lot: T[]) => Promise<AboutYouResult<AboutYouBatchAck>>,
): Promise<SyncOutcome> {
  if (items.length === 0) return { ok: true, action: "skipped" };
  let batchRequestId: string | undefined;
  for (let i = 0; i < items.length; i += MAX_ITEMI_STOC_PRET) {
    const res = caUnRezultat(await cuLotDurabil(admin, ctx.businessId, kind, [styleKey],
      () => trimite(items.slice(i, i + MAX_ITEMI_STOC_PRET))), `împingerea de ${kind}`);
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const id = res.data?.batchRequestId;
    if (id) batchRequestId = batchRequestId ?? id;
    if (i + MAX_ITEMI_STOC_PRET < items.length) await pause(300);
  }
  return { ok: true, action: "submitted", batchRequestId };
}

export async function pushPriceNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product, error: eroareProdus } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  // O citire cazuta nu inseamna „produs sters": elementul trebuie reincercat,
  // nu sarit tacut, altfel pretul de pe About You ramane vechi la nesfarsit.
  if (eroareProdus) return { ok: false, error: eroareProdus.message };
  if (!product) return { ok: true, action: "skipped" };
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  const produs = product as unknown as MappableProduct;
  const variants = atasezaPreturileRon(produs, await getVariantData(admin, listing.id))
    .filter((v) => v.enabled && v.sku);
  if (variants.length === 0) return { ok: true, action: "skipped" };

  const items: { sku: string; price: { country_code: string; retail_price: number; sale_price?: number | null } }[] = [];
  for (const v of variants) {
    const priced = buildVariantPrices(ctx.config, produs, v);
    if ("error" in priced) return { ok: false, error: priced.error };
    for (const p of priced.prices) {
      items.push({ sku: v.sku, price: { country_code: p.country_code, retail_price: p.retail_price, sale_price: p.sale_price ?? null } });
    }
  }
  // Un item PER SKU PER TARA: cu multe marimi si mai multe tari, limita de 1000
  // se atinge repede.
  return trimiteInTranse(admin, ctx, listing.style_key, "price", items,
    (lot) => updatePrice(ctx.auth, lot));
}

// ── Fulfillment: push AWB tracking to About You (Faza 4, dropshipping) ────────────
// The About You order item integer IDs live in aboutyou_orders.items; the courier
// + tracking are derived from whichever *_awb_number the merchant generated in
// Edinio, mapped to an About You carrier_key via the store's carrier_map.
// Lista trăiește in `./curieri`, ca ecranul de mapare sa nu mai poata rămâne in
// urma: sase curieri lipseau de acolo, iar lipsa nu da nicio eroare.
const COURIER_FIELDS = CURIERI_ABOUTYOU.map((c) => ({ field: c.camp, courier: c.cod }));

export async function shipOrderNow(admin: Db, ctx: AboutYouSyncContext, orderId: string): Promise<SyncOutcome> {
  const { data: order, error: eOrder } = await admin
    .from("orders")
    /* Literalul trebuie sa rămână literal (PostgREST nu poate tipiza un sir
       calculat), dar un test verifica ca acopera fiecare curier din lista —
       altfel coloana lipsa nu ajunge in `row`, bucla de mai jos n-o gaseste si
       expedierea iese cu „skipped": un succes raportat pentru o comanda ramasa
       neexpediata la marketplace. */
    .select(SELECT_AWB_ABOUTYOU)
    .eq("id", orderId).eq("business_id", ctx.businessId).maybeSingle();
  // Ca mai jos: o citire cazuta se reincearca, nu se raporteaza ca reusita.
  if (eOrder) return { ok: false, error: `Nu am putut citi comanda: ${eOrder.message}`, status: 0 };
  if (!order) return { ok: true, action: "skipped" };

  const { data: ayOrder, error: eAy } = await admin
    .from("aboutyou_orders").select("id, items, fulfillment_type, raw")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  /*
   * O citire cazuta NU inseamna „nu e comanda About You".
   *
   * Inghitita, ieșea `skipped` — un SUCCES — iar cronul stergea elementul din
   * coada: AWB-ul nu mai ajungea niciodata la About You, iar clientul astepta un
   * colet despre care marketplace-ul nu stia nimic. `status: 0` e citit de cron ca
   * trecator, deci elementul rămâne in coada fara sa consume o incercare.
   */
  if (eAy) return { ok: false, error: `Nu am putut citi comanda About You: ${eAy.message}`, status: 0 };
  if (!ayOrder) return { ok: true, action: "skipped" }; // not an About You order

  /*
   * FULFILLMENT BY ABOUT YOU: nu noi expediem, deci n-avem ce raporta.
   *
   * Pe modelul FbAY, marfa sta in depozitul lor si tot ei o trimit. Codul nu se
   * uita deloc la asta si incerca `POST /orders/ship` cu AWB-ul nostru — o
   * expediere pe care About You nu o poate accepta, reincercata pana ieșea din
   * coada. Comanda apare oricum in Edinio, doar ca fara pasul de expediere.
   */
  const fel = (ayOrder as { fulfillment_type?: string | null }).fulfillment_type;
  if (fel === "fulfillment_by_marketplace") return { ok: true, action: "skipped" };

  const row = order as Record<string, unknown>;
  let tracking: string | undefined;
  let courier: string | undefined;
  for (const { field, courier: c } of COURIER_FIELDS) {
    const v = row[field];
    if (typeof v === "string" && v.trim()) { tracking = v.trim(); courier = c; break; }
  }
  if (!tracking && typeof row.tracking_number === "string" && row.tracking_number.trim()) tracking = row.tracking_number.trim();
  if (!tracking) return { ok: true, action: "skipped" }; // no AWB generated yet

  const alNostru = (courier ? ctx.config.carrier_map?.[courier] : undefined) ?? ctx.config.default_carrier_key;

  /*
   * ═══ ⚠ TRANSPORTATORUL ATRIBUIT DE EI BATE MAPAREA NOASTRA (27.08.2026) ═══
   *
   * Expedierea pleca mereu cu `carrier_key` socotit din curierul Edinio si din harta din setari,
   * fara sa se uite vreodata la ce a atribuit About You comenzii. Cand cele doua difera, coletul
   * pleaca declarat la alt transportator decat cel pe care il asteapta ei.
   *
   * ⚠ NU SE GHICESTE NUMELE CAMPULUI. Se citeste din raspunsul BRUT al comenzii (vezi migratia
   * 2026-11-24) si numai daca e chiar acolo. Lipsa lui inseamna „ei nu atribuie nimic", si atunci
   * ramane exact purtarea de pana acum — deci nicio expediere nu se strica din reparatia asta.
   *
   * ⚠ CAND EXISTA SI DIFERA, SE OPRESTE. Nu se trimite nici al lor cu AWB-ul nostru (numarul
   * apartine curierului nostru), nici al nostru peste hotararea lor. Se cere omului sa lamureasca,
   * fiindca amandoua variantele tacute produc un colet pe care nu-l gaseste nimeni.
   */
  const brut = (ayOrder as { raw?: unknown }).raw as Record<string, unknown> | null | undefined;
  const alLor = typeof brut?.carrier_key === "string" && brut.carrier_key.trim()
    ? brut.carrier_key.trim()
    : null;

  if (alLor && alNostru && alLor !== alNostru) {
    return {
      ok: false,
      error: `About You a atribuit comenzii transportatorul „${alLor}”, iar AWB-ul e de la „${alNostru}”.`
        + " Emite AWB-ul la transportatorul lor sau corectează maparea curierilor în setări.",
    };
  }
  const carrierKey = alLor ?? alNostru;
  if (!carrierKey) return { ok: false, error: "Mapează curierul la un carrier About You în setări." };

  const rawItems = (ayOrder as { items?: unknown }).items;
  const items = Array.isArray(rawItems) ? (rawItems as { order_item_id?: number; status?: string }[]) : [];
  /*
   * ═══ ⚠ SE EXPEDIAZA NUMAI LINIILE `open` (26.08.2026) ═══
   *
   * Aici se filtra „orice in afara de `cancelled` si `returned`", deci treceau si liniile deja
   * `shipped`, si orice stare noua pe care ei ar introduce-o. O linie deja expediata, trimisa a
   * doua oara, e chiar cazul in care ei resping cererea INTREAGA — deci s-ar bloca si celelalte,
   * exact paguba pe care filtrul voia s-o inlature.
   *
   * ⚠ SE NUMESC STARILE CERUTE, NU CELE OPRITE. O lista de „ce se opreste" lasa pe dinafara tot
   * ce nu cunoastem, iar `status`-ul liniei poate primi valori noi fara sa ne intrebe.
   */
  const orderItemIds = items
    .filter((i) => i.status === "open")
    .map((i) => i.order_item_id)
    .filter((x): x is number => typeof x === "number");
  if (orderItemIds.length === 0) return { ok: true, action: "skipped" };

  /*
   * ═══ ⚠ AWB-UL DE RETUR, CAND CHIAR AVEM UNUL (26.08.2026) ═══
   *
   * `return_tracking_key` e cerut de ruta de expediere, iar noi puneam acolo AWB-ul de TUR,
   * presupunand ca e valabil in ambele sensuri. Presupunerea nu tine la orice curier — si se vede
   * chiar in casa: Sameday are camp separat de retur (`sameday_return_awb_number`), semn ca
   * returul NU e mereu acelasi document.
   *
   * ⚠ DAR NU SE POATE CERE UNUL ADEVARAT LA TOTI. Din cei 17 curieri din `CURIERI_ABOUTYOU`, unul
   * singur are azi AWB de retur. Oprita expedierea pana cand exista, s-ar fi blocat 16 din 17 —
   * mult mai rau decat eticheta gresita pe care o reparam.
   *
   * ═══ ⚠ SI TOTUSI NU SE MAI TRIMITE CEL DE TUR (27.08.2026) ═══
   *
   * Rezerva era `return_tracking_key: awbRetur || tracking`: fara AWB de retur, pleca numarul de
   * TUR. Clientul primeste atunci o eticheta de retur care nu duce nicaieri — un document valid
   * pentru alt drum. Nu e o lipsa, e o informatie FALSA, si e mai rea decat lipsa.
   *
   * ⚠ CAMPUL E OPTIONAL, si nu e o presupunere: `shipOrderItems` il are `?` in semnatura, iar
   * `AboutYouOrderItem.return_tracking_key` e `?: string | null` in schema lor de citire. Doua
   * semne independente. Deci cand nu avem unul adevarat, se OMITE.
   *
   * ⚠ SI DACA TOTUSI IL CER: un refuz limpede (4xx, deci „nu s-a intamplat nimic" dupa chiar
   * regula noastra din `eRefuzLimpede`) se reia O SINGURA DATA cu numarul de tur, si se scrie de
   * ce. Asa nu se blocheaza nicio expediere, dar nici nu se minte din prima.
   */
  const awbRetur = typeof (row as { sameday_return_awb_number?: unknown }).sameday_return_awb_number === "string"
    ? String((row as { sameday_return_awb_number?: unknown }).sameday_return_awb_number).trim()
    : "";
  /*
   * ⚠ EXPEDIEREA E CEA MAI SCUMPA DE PIERDUT: fara urma, comanda ramane `ship_pending` si
   * comerciantul crede ca a plecat. De aceea trece prin `cuLotDurabil`, iar cand intentia nu se
   * poate scrie, cererea NU se face deloc.
   */
  const trimiteExpedierea = (cuRetur: string | undefined) =>
    cuLotDurabil(admin, ctx.businessId, "ship", [orderId], () => shipOrderItems(ctx.auth, [{
      order_items: orderItemIds, carrier_key: carrierKey,
      shipment_tracking_key: tracking as string,
      ...(cuRetur ? { return_tracking_key: cuRetur } : {}),
    }]));

  /*
   * ═══ ⚠ EXPEDIEREA NU SE RELUA ORBESTE, SI DE-AIA STAREA ARE NUME ═══
   *
   * `caUnRezultat` preface „nu stiu ce a iesit" in „mai incearca" — bun la pret si la stoc, unde
   * valoarea bate istoricul. Aici ar insemna un al doilea `POST /orders/ship` peste unul care
   * poate a fost primit: doua expedieri raportate pe aceleasi linii.
   *
   * ⚠ Deci se OPRESTE, si se cere un om. Randul de intentie ramane deschis si
   * `alarmaIntentiiDeschise` il scoate la lumina cu tot ce trebuie ca sa fie verificat in Seller
   * Center inainte de o reluare de mana.
   */
  const lot1 = await trimiteExpedierea(awbRetur || undefined);
  if (lot1.fel === "intentie-nescrisa") {
    return { ok: false, error: "Nu am putut ține evidența expedierii; încearcă din nou.", status: 0 };
  }
  if (lot1.fel === "neurmarit") {
    return {
      ok: false,
      error: "Am trimis expedierea la About You, dar nu știm dacă a fost primită."
        + " Verifică în Seller Center înainte de a încerca din nou.",
      /* ⚠ NU `0`: `0` inseamna trecator, iar cronul ar relua singur. Aici tocmai asta n-are voie. */
      status: 409,
    };
  }
  let res = lot1.res;
  if (isAboutYouError(res) && !awbRetur && eRefuzLimpede(res.status)) {
    /* Vezi nota de mai sus: o singura reluare, cu numarul de tur, si scrisa. */
    await logError({
      action: "aboutyou/expediere", severity: "warning",
      message: "About You a refuzat expedierea fara AWB de retur: s-a retrimis cu numarul de tur, care NU e o eticheta de retur valabila",
      details: { orderId, carrierKey, raspuns: res.error }, businessId: ctx.businessId,
    });
    const lot2 = await trimiteExpedierea(tracking);
    if (lot2.fel === "intentie-nescrisa") {
      return { ok: false, error: "Nu am putut ține evidența expedierii; încearcă din nou.", status: 0 };
    }
    if (lot2.fel === "neurmarit") {
      return {
        ok: false,
        error: "Am trimis expedierea la About You, dar nu știm dacă a fost primită."
          + " Verifică în Seller Center înainte de a încerca din nou.",
        status: 409,
      };
    }
    res = lot2.res;
  }
  if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
  const batchRequestId = res.data?.batchRequestId;
  const now = new Date().toISOString();
  /*
   * Statusul devine „trimis catre About You", nu „expediat".
   *
   * Expedierea e asincrona: raspunsul de aici e doar confirmarea ca lotul a fost
   * primit. Scriind direct „shipped", o expediere pe care About You o respinge
   * mai tarziu (curier nemapat, articol deja anulat) ramanea marcata ca reusita
   * si nimeni nu o mai relua. Statusul final il pune `pollOpenBatches`, dupa ce
   * vede rezultatul lotului.
   */
  await admin.from("aboutyou_orders")
    .update({ status: "ship_pending", last_synced_at: now, updated_at: now } as never)
    .eq("id", (ayOrder as { id: string }).id);
  return { ok: true, action: "submitted", batchRequestId };
}
