// About You sync engine — shared by the cron drain (api/cron/aboutyou-sync) and
// the dashboard "publish now" actions, so both paths behave identically.
//
// Everything is async batch: we submit products/status, store the returned
// batchRequestId in aboutyou_batches, and a poll pass resolves it later. A
// separate reconcile pass reads products back (GET /products) to pick up the
// approval/rejection transitions About You makes on its own side.

import type { SupabaseClient } from "@supabase/supabase-js";
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
import { randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
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

export async function loadAboutYouContext(admin: Db, businessId: string): Promise<AboutYouSyncContext | null> {
  const { data: ss } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
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
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, last_synced_at")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();
  return (data as ListingRow) ?? null;
}

async function getListingByStyleKey(admin: Db, businessId: string, styleKey: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, last_synced_at")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle();
  return (data as ListingRow) ?? null;
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
  const { data } = await admin
    .from("aboutyou_variants")
    .select("sku, ean, size_id, second_size_id, color_id, quantity, retail_price_eur, sale_price_eur, enabled, ay_status")
    .eq("listing_id", listingId);
  return (data ?? []).map((v) => ({
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

async function setListingStatus(
  admin: Db, listingId: string, status: string, extra: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("aboutyou_listings")
    .update({ status, last_status_at: now, updated_at: now, ...extra } as never)
    .eq("id", listingId);
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
export async function recordBatch(
  admin: Db, businessId: string, batchRequestId: string, kind: string, relatedIds: string[],
): Promise<boolean> {
  /*
   * Contoarele se pun pe ZERO la fiecare inregistrare.
   *
   * About You deduplica payload-urile identice pe acelasi `batchRequestId`, deci
   * randul poate fi REDESCHIS pentru un lot nou. Fara resetare, un ciclu incheiat
   * isi scurgea contoarele in urmatorul: lotul nou pornea cu esecuri mostenite si
   * putea fi abandonat din prima.
   */
  const { error } = await admin.from("aboutyou_batches").upsert(
    {
      business_id: businessId, batch_request_id: batchRequestId, kind, status: "pending",
      related_ids: relatedIds as never, attempts: 0, poll_errors: 0,
      polled_at: null, result_summary: null,
    },
    { onConflict: "business_id,batch_request_id" },
  );
  if (error) {
    await logError({
      action: "aboutyou/lot-nescris", severity: "critical",
      message: `About You a primit lotul, dar nu l-am putut tine minte: ${error.message}`,
      /* ⚠ Tot ce trebuie ca sa fie reluat de mana: id-ul lor, ce fel de lot, si pe ce se aplica. */
      details: { batchRequestId, kind, relatedIds: relatedIds.slice(0, 20) },
      businessId,
    });
    return false;
  }
  return true;
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
      const zero = await updateStock(ctx.auth, lot.map((r) => ({ sku: r.sku, quantity: 0 })));
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
      const idLot = zero.data?.batchRequestId;
      if (idLot) await recordBatch(admin, ctx.businessId, idLot, "stock_removal", lot.map((r) => r.id));
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
    const res = await upsertProducts(ctx.auth, built.items.slice(i, i + 100));
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
    if (id) {
      batchRequestId = batchRequestId ?? id;
      /* ⚠ Vezi `recordBatch`: un lot netinut minte nu mai poate fi sondat niciodata. */
      if (!await recordBatch(admin, ctx.businessId, id, "product", [listing.style_key])) nescrise++;
    }
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
  await setListingStatus(admin, listing.id, "pending", { error: null, last_synced_at: now });
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

  const res = await updateProductStatus(ctx.auth, [{ style_key: listing.style_key, status }]);
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
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "status", [listing.style_key]);
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
  const res = await updateProductStatus(
    ctx.auth, [{ style_key: listing.style_key, status: tintaRetragere(listing.status) }]);
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
  if (idLot) await recordBatch(admin, ctx.businessId, idLot, "removal", [listing.style_key]);
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
  attempts: number; poll_errors: number;
}

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

export async function pollOpenBatches(admin: Db, ctx: AboutYouSyncContext, limit = 20): Promise<void> {
  const { data } = await admin
    .from("aboutyou_batches")
    .select("id, batch_request_id, kind, related_ids, attempts, poll_errors")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  const batches = (data ?? []) as BatchRow[];

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
      const renuntam = esecuri >= 6;
      await admin.from("aboutyou_batches")
        .update({ poll_errors: esecuri, polled_at: now, status: renuntam ? "failed" : "retry" } as never)
        .eq("id", b.id);
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
      const trecator = res.status === 0 || res.status === 429 || res.status >= 500;
      if (renuntam && !trecator) {
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
      const abandonat = incercari >= 120;
      await admin.from("aboutyou_batches").update({
        attempts: incercari,
        polled_at: now,
        /*
         * Interogarea a RASPUNS, deci sirul de esecuri de transport s-a rupt.
         * Fara resetare, pragul de 6 numara esecuri NECONSECUTIVE: un lot deschis
         * legitim doua ore aduna sase hopuri raspandite si e ucis oricum.
         */
        poll_errors: 0,
        ...(abandonat
          ? { status: "failed", result_summary: { status: result?.status ?? "necunoscut", abandonat: true } as never }
          : {}),
      } as never).eq("id", b.id);
      if (abandonat) {
        await marcheazaListarileLotului(admin, ctx, b, "About You nu a finalizat procesarea. Încearcă din nou.");
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
          await admin.from("aboutyou_variants")
            .update({ ay_status: "removed", updated_at: now } as never).in("id", ids);
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
        await admin.from("aboutyou_orders")
          .update({ status: hardFail ? esuat : reusit, last_synced_at: now, updated_at: now } as never)
          .eq("business_id", ctx.businessId).eq("order_id", oid);
      }
    }

    if (b.kind === "ship") {
      const orderIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      for (const oid of orderIds) {
        await admin.from("aboutyou_orders")
          .update({
            status: hardFail ? "ship_failed" : "shipped",
            last_synced_at: now,
            updated_at: now,
          } as never)
          .eq("business_id", ctx.businessId).eq("order_id", oid);
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
            await setListingStatus(admin, listing.id, "error", {
              error: errors.slice(0, 3).join("; ").slice(0, 500)
                || "About You nu a acceptat retragerea produsului. Încearcă din nou.",
            });
          } else {
            await admin.from("aboutyou_listings").delete().eq("id", listing.id);
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
          await setListingStatus(admin, listing.id, "error", { error: motiv });
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
              .in("status", ["pending", "processing", "retry"])
              .neq("id", b.id) as never);

          // Product accepted; it exists as a draft on About You until published.
          await setListingStatus(admin, listing.id, "draft", { error: null });

          if (fratiNeterminati.length > 0) {
            /* ⚠ Se spune, ca sa nu para ca s-a pierdut ceva: publicarea vine la ultimul lot. */
            await logError({
              action: "aboutyou-sync/loturi", severity: "info",
              message: `lot incheiat, dar produsul mai are ${fratiNeterminati.length} loturi in lucru: publicarea asteapta`,
              details: { styleKey: listing.style_key, batchId: b.batch_request_id },
              businessId: ctx.businessId,
            });
            continue;
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
          if (listing.product_id) {
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
    await admin.from("aboutyou_batches")
      .update({ status: hardFail ? "failed" : "completed", polled_at: now, result_summary: { status: result.status, errors: errors.slice(0, 10) } as never })
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

  for (let page = 1; page <= maxPages; page++) {
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
    if (items.length < 100) { trunchiat = false; break; }
    if (expirat()) break;
    await pause(250);
  }
  if (trunchiat) {
    await logError({
      action: "aboutyou/reconcile", severity: "warning",
      message: `Reconcilierea s-a oprit la plafonul de ${maxPages} pagini; restul catalogului nu a fost citit.`,
      details: { businessId: ctx.businessId }, businessId: ctx.businessId,
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
  // Plafon propriu: limita rutei e 50 de cereri pe minut, de douazeci de ori mai
  // stransa decat la `/products/`. Douazeci de pagini inseamna 2000 de produse
  // respinse — cu mult peste orice caz real — si lasa marja.
  for (let page = 1; page <= Math.min(maxPages, 20); page++) {
    if (expirat()) break;
    const res = await getRejectedProducts(ctx.auth, { page, per_page: 100 });
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const items = res.data?.items ?? [];
    if (items.length === 0) break;
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
    }
    // Ca mai sus: oprirea se ia din lungimea lotului, nu din `pagination.pages`.
    if (items.length < 100) break;
    await pause(250);
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

export async function processQueueItem(admin: Db, ctx: AboutYouSyncContext, item: AboutYouQueueItem): Promise<SyncOutcome> {
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
 * `valid_at` NU se trimite: fara el, About You aplica valoarea imediat, ceea ce
 * e exact ce vrem dupa o comanda. Cu el am programa o valoare in viitor si o
 * comanda intre timp ar fi suprascrisa de programare.
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
    const res = await trimite(items.slice(i, i + MAX_ITEMI_STOC_PRET));
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const id = res.data?.batchRequestId;
    if (id) {
      batchRequestId = batchRequestId ?? id;
      await recordBatch(admin, ctx.businessId, id, kind, [styleKey]);
    }
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
    .from("aboutyou_orders").select("id, items, fulfillment_type")
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

  const carrierKey = (courier ? ctx.config.carrier_map?.[courier] : undefined) ?? ctx.config.default_carrier_key;
  if (!carrierKey) return { ok: false, error: "Mapează curierul la un carrier About You în setări." };

  const rawItems = (ayOrder as { items?: unknown }).items;
  const items = Array.isArray(rawItems) ? (rawItems as { order_item_id?: number; status?: string }[]) : [];
  // Articolele deja anulate sau returnate nu se mai expediaza: trimise, About You
  // respinge intreaga cerere de expediere, deci s-ar bloca si celelalte.
  const orderItemIds = items
    .filter((i) => i.status !== "cancelled" && i.status !== "returned")
    .map((i) => i.order_item_id)
    .filter((x): x is number => typeof x === "number");
  if (orderItemIds.length === 0) return { ok: true, action: "skipped" };

  // return_tracking_key is REQUIRED by the ship endpoint; RO couriers issue a single
  // AWB for both directions, so we reuse the shipment tracking as the return key.
  const res = await shipOrderItems(ctx.auth, [{
    order_items: orderItemIds, carrier_key: carrierKey,
    shipment_tracking_key: tracking, return_tracking_key: tracking,
  }]);
  if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
  const batchRequestId = res.data?.batchRequestId;
  const now = new Date().toISOString();
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "ship", [orderId]);
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
