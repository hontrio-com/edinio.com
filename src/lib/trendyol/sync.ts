// Trendyol sync engine — shared by the cron drain (api/cron/trendyol-sync) and
// the dashboard "list now" actions. Products/inventory are async batch: submit ->
// { batchRequestId } -> poll batch-requests. A reconcile pass reads approved
// products back to pick up Trendyol's approval decision.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TrendyolAuth } from "./client";
import {
  createProducts, deleteProducts, getApprovedProducts, getBatchResult, getProductBaseInfo, getUnapprovedProducts,
  isTrendyolError, setArchiveState, updateApprovedContent, updateApprovedVariants,
  updateDeliveryInfo, updatePriceInventory,
  updateUnapprovedProducts, type TrendyolItemActualizare, type TrendyolMotivRespingere,
} from "./client";
import {
  buildTrendyolItems, buildVariantPrices, deriveVariantSlots, resolveVariantQuantity, round2,
  stocVarianteiSalvate, stocuriVii, verificaBarcode,
  type MappableProduct, type TrendyolListingEnrichment, type TrendyolVariantData,
} from "./mapping";
import type { TrendyolCategoryAttribute, TrendyolConfig, TrendyolProductAttribute, TrendyolProductItem } from "./types";
import { getCategoryAttributesCached } from "./taxonomy";
import { atributeLipsaPeVariante, mesajAtributeLipsa } from "./atribute-obligatorii";
import { TRENDYOL_DEFAULT_STOREFRONT } from "./types";
import { EroareCitireBaza, randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
import { logError } from "@/lib/error-logger";
import { patchTrendyolConfig } from "./config";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, description, price, compare_at_price, images, category, sku, weight_grams, page_sections, is_active, track_inventory, stock_quantity";

export interface TrendyolSyncContext {
  auth: TrendyolAuth;
  config: TrendyolConfig;
  businessId: string;
}

export type SyncOutcome =
  | { ok: true; action: "submitted" | "removed" | "skipped"; batchRequestId?: string }
  // `authFailed` = Trendyol a respins cheile. Nu are rost sa reincercam: cronul
  // marcheaza contul „de reconectat", ca sa vada comerciantul, in loc sa consume
  // tacut incercarile si sa lase produsele nelistate fara explicatie.
  //
  // `status` = codul HTTP al esecului, cand a existat unul. Cronul il citeste ca
  // sa nu numere drept incercare un 429 sau un 503 — esecuri care nu spun nimic
  // despre elementul din coada.
  | { ok: false; error: string; authFailed?: true; status?: number };

/** 401 = chei invalide/revocate. Restul erorilor merita reincercate. */
export function esteEroareDeChei(status: number): boolean {
  return status === 401;
}

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * `true` = magazinul chiar nu are Trendyol conectat; `false` = are; `null` = nu
 * am putut afla.
 *
 * Distinctia decide daca avem voie sa STERGEM coada magazinului. `loadTrendyolContext`
 * intoarce `null` pentru doua lucruri foarte diferite — „nu e conectat" si „nu
 * am putut citi configurarea" — iar cronul stergea coada in ambele cazuri. Deci
 * un hop la baza de date arunca toata munca magazinului: si listarile, si
 * impingerile de stoc puse la coada dupa comenzi. Fara log, fara urma.
 */
export async function esteDeconectatTrendyol(admin: Db, businessId: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from("store_settings").select("trendyol_config").eq("business_id", businessId).maybeSingle();
  if (error) return null;
  const config = (data?.trendyol_config as TrendyolConfig) ?? {};
  return !config.connected || !config.api_key || !config.api_secret || !config.supplier_id;
}

/*
 * Esecuri care nu spun nimic despre elementul din coada.
 *
 * Se decide pe CODUL HTTP, nu pe textul mesajului: 429 (limita de rata), 5xx
 * (Trendyol indisponibil) si 0 (retea sau termen depasit la noi). Un element
 * lovit de asa ceva nu trebuie sa-si arda incercarile — dupa cinci minute de
 * indisponibilitate, coada s-ar goli definitiv si nimeni n-ar sti de ce.
 */
export function eTrecatoare(status: number | undefined): boolean {
  if (status == null) return false;
  return status === 429 || status === 0 || (status >= 500 && status <= 599);
}

export async function loadTrendyolContext(admin: Db, businessId: string): Promise<TrendyolSyncContext | null> {
  /* ⚠ `null` de aici insemna „magazinul nu e conectat", si toti cei opt apelanti sar peste el
     in tacere. O pana de o clipa oprea deci tot Trendyol-ul unui magazin, fara nicio urma. */
  const ss = randCitit<{ trendyol_config: unknown }>("trendyol.context", await admin
    .from("store_settings").select("trendyol_config").eq("business_id", businessId).maybeSingle() as never);
  const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
  if (!config.connected || !config.api_key || !config.api_secret || !config.supplier_id) return null;
  return {
    auth: {
      supplierId: config.supplier_id, apiKey: config.api_key, apiSecret: config.api_secret,
      environment: config.environment, storefront: config.storefront ?? TRENDYOL_DEFAULT_STOREFRONT,
      userAgentCompany: config.user_agent_company,
    },
    config,
    businessId,
  };
}

// ── Loaders ───────────────────────────────────────────────────────────────────
interface ListingRow {
  id: string; product_id: string | null; product_main_id: string; status: string;
  brand_id: number | null; category_id: number | null; attributes: unknown;
  dimensional_weight: number | null; cargo_company_id: number | null;
  /** Cate ambalaje are produsul, pentru garantia SGR. */
  sgr_units?: number | null;
  /** ⚠ Tara in care s-a FABRICAT produsul, nu originea vanzatorului. Ceruta de ei din 23.10.2026. */
  country_of_origin?: string | null;
  /** Edinio impinge singur stocul si pretul? Fals pe listarile ADOPTATE. */
  auto_inventory?: boolean | null;
  /** Produsul de la Trendyol a fost creat de NOI (lot de creare reusit)? */
  creat_de_edinio?: boolean | null;
  /** `contentId`-ul de la ei; singura cheie acceptata de `content-bulk-update`. */
  ty_content_id?: number | null;
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  /* ⚠ `null` inseamna „produsul nu e listat pe Trendyol", iar apelantii hotarasc din asta —
     inclusiv daca sa creeze o listare noua. Confundat cu o pana, s-ar crea a doua listare
     pentru un produs care o are deja. */
  const data = randCitit<ListingRow>("trendyol.listarea", await admin
    .from("trendyol_listings")
    .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, auto_inventory, creat_de_edinio, ty_content_id, sgr_units, country_of_origin")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle() as never);
  return (data as ListingRow) ?? null;
}
async function getListingByMainId(admin: Db, businessId: string, mainId: string): Promise<ListingRow | null> {
  /* ⚠ `removeByMainId` citeste `null` ca „n-are listare, deci n-am ce retrage" si sare. O pana
     de o clipa arata identic — si retragerea se pierde tacut, cu produsul ramas la vanzare pe
     Trendyol dupa ce a fost scos din magazin. */
  return randCitit<ListingRow>("trendyol.listareDupaMainId", await admin
    .from("trendyol_listings")
    .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, auto_inventory, creat_de_edinio, ty_content_id, sgr_units, country_of_origin")
    .eq("business_id", businessId).eq("product_main_id", mainId).maybeSingle() as never);
}

function toEnrichment(row: ListingRow): TrendyolListingEnrichment {
  return {
    brand_id: row.brand_id,
    category_id: row.category_id,
    attributes: Array.isArray(row.attributes) ? (row.attributes as TrendyolProductAttribute[]) : [],
    dimensional_weight: row.dimensional_weight,
    cargo_company_id: row.cargo_company_id,
    sgr_units: row.sgr_units ?? null,
  };
}

async function getVariantData(admin: Db, listingId: string): Promise<TrendyolVariantData[]> {
  /* ⚠ O lista goala inseamna „produsul n-are variante", si de-acolo pleaca mai departe un
     produs fara niciun articol. Picata, citirea arata la fel. */
  const data = randuriCitite<Record<string, never>>("trendyol.varianteleListarii", await admin
    .from("trendyol_variants")
    .select("barcode, stock_code, variant_title, attributes, quantity, list_price, sale_price, vat_rate, enabled")
    .eq("listing_id", listingId) as never) as unknown as {
      barcode: string; stock_code: string | null; variant_title: string | null; attributes: unknown;
      quantity: number; list_price: number | null; sale_price: number | null; vat_rate: number | null; enabled: boolean;
    }[];
  return data.map((v) => ({
    barcode: v.barcode,
    stock_code: v.stock_code,
    variant_title: v.variant_title,
    attributes: Array.isArray(v.attributes) ? (v.attributes as unknown as TrendyolProductAttribute[]) : [],
    quantity: v.quantity,
    list_price: v.list_price,
    sale_price: v.sale_price,
    vat_rate: v.vat_rate,
    enabled: v.enabled,
  }));
}

async function setListingStatus(admin: Db, listingId: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("trendyol_listings")
    .update({ status, last_status_at: now, updated_at: now, ...extra } as never)
    .eq("id", listingId);
}

/**
 * Scrie in registru lotul pe care Trendyol tocmai l-a PRIMIT.
 *
 * ═══ ⚠ O LUCRARE ASINCRONA NU E TERMINATA PANA NU I-AM SCRIS NUMARUL (26.08.2026) ═══
 *
 * Forma dinainte nu citea `error`. Iar sirul de intamplari e acesta:
 *
 *   POST la Trendyol        -> 200, `batchRequestId: ABC`
 *   insert in registru      -> pica (o clipa de retea)
 *   `syncProductNow`        -> intoarce `ok: true, submitted`
 *   cronul                  -> sterge elementul din coada
 *
 * Trendyol prelucreaza ABC mai departe. Daca il RESPINGE — atribut lipsa, barcode luat,
 * categorie gresita — noi nu aflam NICIODATA: nu mai avem numarul dupa care sa intrebam, si
 * nici randul din coada din care sa reluam. Produsul ramane nelistat, iar panoul arata
 * „trimis".
 *
 * ⚠ De-aia intoarce acum `false`, iar apelantii de pe drumul cozii il citesc ca esec
 * TRECATOR: elementul se reia, se retrimite, si abia atunci se sterge.
 *
 * ⚠ RETRIMITEREA E SIGURA. Toate loturile de aici sunt idempotente la ei: crearea de produs
 * pe acelasi barcode actualizeaza, iar pretul si stocul se SETEAZA, nu se aduna. Un lot in
 * plus costa o cerere; unul pierdut costa un produs nelistat despre care nimeni nu stie.
 */
async function recordBatch(admin: Db, businessId: string, batchRequestId: string, kind: string, relatedIds: string[]): Promise<boolean> {
  const { error } = await admin.from("trendyol_batches").upsert(
    { business_id: businessId, batch_request_id: batchRequestId, kind, status: "pending", related_ids: relatedIds as never },
    { onConflict: "business_id,batch_request_id" },
  );
  if (error) {
    await logError({
      action: "trendyol/batch",
      message: `lotul a fost primit de Trendyol dar nu s-a scris in registru: ${error.message}`,
      details: { batchRequestId, kind, relatedIds: relatedIds.slice(0, 20) },
      businessId, severity: "critical",
    });
    return false;
  }
  return true;
}

// ── Upsert (create/update on Trendyol) ──────────────────────────────────────────
export async function syncProductNow(
  admin: Db, ctx: TrendyolSyncContext, productId: string,
  /** Comerciantul a cerut-o EXPLICIT (buton), nu e o sincronizare automata. */
  manual = false,
): Promise<SyncOutcome> {
  /*
   * ═══ ⚠ „N-AM PUTUT INTREBA" NU E „PRODUSUL A FOST STERS" (26.08.2026) ═══
   *
   * Forma dinainte nu citea `error`. PostgREST nu arunca la refuz: intoarce
   * `{ data: null, error }`. Deci o pana de o clipa a bazei arata IDENTIC cu „produsul nu
   * mai exista in magazin" — si de aici se pleaca pe `removeProductNow`, adica se scoate
   * produsul de la vanzare de pe Trendyol.
   *
   * ⚠ E CEA MAI SCUMPA CITIRE DIN TOT MODULUL: una singura, picata la momentul nepotrivit,
   * scoate marfa din vanzare pe un canal intreg — fara nicio eroare si fara ca cineva sa
   * ceara asta. Aruncarea devine mai jos verdict „trecator", deci elementul se reia.
   */
  const product = randCitit<Record<string, unknown>>("trendyol.produsulDeSincronizat", await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle() as never);
  if (!product) return removeProductNow(admin, ctx, productId);

  /*
   * Publicare automata: produsul nou nu mai asteapta o trecere prin editor.
   *
   * Cu `auto_publish` pornit, listarea se construieste din maparea categoriei —
   * categoria si brandul vin din `category_map`, barcode-urile din variantele
   * produsului. Fara ea, comportamentul ramane cel de dinainte: un produs
   * nelistat nu pleaca nicaieri.
   *
   * Produsele dezactivate nu se auto-publica: n-are sens sa creezi pe Trendyol
   * ceva ce in magazin e ascuns.
   */
  let listing = await getListing(admin, ctx.businessId, productId);
  const activ = (product as { is_active?: boolean }).is_active !== false;

  /*
   * ═══ ⚠ O LISTARE IN RETRAGERE NU SE RESINCRONIZEAZA (26.08.2026) ═══
   *
   * De cand stergerea asteapta ziua de arhiva ceruta de ei, randul sta pe `removing` vreo 25 de
   * ore. In fereastra aia, ORICE atingere a produsului — o schimbare de pret, de stoc, o
   * editare — il repunea la coada si il trimitea pe drumul obisnuit. Iar acolo
   * `incearcaAdoptarea` gaseste produsul arhivat la ei si il DEZARHIVEAZA anume, fiindca
   * „comerciantul care publica din Edinio vrea exact opusul".
   *
   * Deci marfa pe care omul tocmai a cerut s-o scoata se intorcea la vanzare, singura, si fara
   * niciun semn. Iar stergerea de peste 25 de ore ar fi lovit un produs iar activ.
   *
   * ⚠ CU O IESIRE ANUME PENTRU CERERE EXPLICITA. Daca omul apasa el butonul de publicare
   * (`manual`), asta INSEAMNA ca s-a razgandit — si atunci retragerea se anuleaza cinstit, cu
   * toate urmele ei sterse, nu pe ocolite printr-o dezarhivare intamplatoare.
   */
  if (listing?.status === "removing") {
    if (!manual) {
      /* ⚠ `skipped`, nu esec: nu e nimic stricat — e o hotarare a comerciantului, luata acum
         cateva ore. Iesirea curata inseamna si ca elementul de coada se sterge, deci nu se
         reincearca la nesfarsit ceva ce n-are voie sa plece. */
      return { ok: true, action: "skipped" };
    }
    const acum = new Date().toISOString();
    await admin.from("trendyol_listings").update({
      status: "created", arhivat_la: null, sters_cerut_la: null, sters_eroare: null,
      updated_at: acum,
    } as never).eq("id", listing.id);
    await logError({
      action: "trendyol/retragere",
      message: "retragerea a fost anulata: comerciantul a cerut publicarea din nou",
      details: { listingId: listing.id, productId },
      businessId: ctx.businessId, severity: "warning",
    });
    listing = { ...listing, status: "created" };
  }
  // Un produs nelistat si inactiv n-are ce cauta pe Trendyol: nu-l creem doar ca
  // sa-i punem imediat stocul pe zero.
  if (!listing && !activ) return { ok: true, action: "skipped" };
  if (!listing && ctx.config.auto_publish) {
    const pregatit = await ensureListingFromMapping(admin, ctx, product as unknown as MappableProduct);
    if ("error" in pregatit) {
      /*
       * Categorie nemapata sau barcode lipsa nu se repara singure prin
       * reincercare. Tratate ca esec, ar arde cele cinci incercari ale cozii si
       * apoi elementul s-ar sterge — deci nici macar n-ar ramane o urma. Iesim
       * curat: produsul ramane „Nelistat" in tabel, iar categoriile nemapate se
       * vad in sectiunea de mapare, unde se si rezolva.
       */
      console.warn("[trendyol] auto-publicare sarita", productId, pregatit.error);
      return { ok: true, action: "skipped" };
    }
    listing = await getListing(admin, ctx.businessId, productId);
  }
  if (!listing) return { ok: false, error: "Produsul nu are configurare Trendyol. Completează detaliile de listare mai întâi." };

  // Deactivated in Edinio -> zero the stock on Trendyol instead of relisting.
  if ((product as { is_active?: boolean }).is_active === false) {
    const res = await pushInventoryNow(admin, ctx, productId, true);
    await setListingStatus(admin, listing.id, "inactive", { error: null });
    return res;
  }

  /*
   * ⚠ REACTIVAREA TREBUIE SA REPUNA STOCUL, ALTFEL RAMANE ZERO PE VECI.
   *
   * `inactive` inseamna „i-am pus stocul pe zero la ei". Produsul EXISTA acolo,
   * dar nu se vinde. Iar `inactive` nu apare in filtrul NICIUNEI reconcilieri —
   * nici de status, nici de stoc — deci nimic nu-l mai atinge vreodata.
   *
   * Cat timp reactivarea trecea prin creare, se repara singura pe ocolite:
   * lotul pica cu „codul exista deja", adoptarea il trecea pe `approved`, si
   * reconcilierea de stoc reimpingea cantitatea. Ruta noua de actualizare NU
   * duce cantitate, deci calea aia s-a inchis: fara pasul de fata, comerciantul
   * reactiveaza produsul in Edinio si el ramane invizibil la Trendyol.
   *
   * Statusul se pune pe `created`, nu direct pe `approved`: nu stim daca a fost
   * aprobat. Reconcilierea de status il ridica singura daca e cazul.
   */
  if (listing.status === "inactive") {
    await setListingStatus(admin, listing.id, "created", { error: null });
    listing = { ...listing, status: "created" };
    const reluat = await pushInventoryNow(admin, ctx, productId);
    if (!reluat.ok) return reluat;
  }

  /*
   * ⚠ LISTAREA ADOPTATA NU SE REscrie DIN OFICIU.
   *
   * Produsul e pe Trendyol pentru ca l-a pus comerciantul acolo, cu titlul,
   * descrierea si imaginile lui. Orice editare in Edinio pune un `upsert` la
   * coada, si fara garda asta actualizarea i-ar fi inlocuit tacit munca — fara
   * mesaj si fara cale de intoarcere, fiindca datele vechi nu sunt salvate
   * nicaieri.
   *
   * Am legat listarea ca sa curga comenzile si sa se poata impinge stocul la
   * cerere („Trimite stocul"), nu ca sa preluam ce a construit el.
   */
  if (existaLaTrendyol(listing) && !putemSuprascrieContinutul(listing) && !manual) {
    /*
     * Automat: nu. La CEREREA lui: da.
     *
     * Garda apara munca facuta de comerciant in panoul Trendyol de sincronizarile
     * automate declansate de orice editare. Dar aplicata si pe apasarea lui
     * explicita, listarea adoptata devenea imposibil de reparat: butonul nu
     * facea nimic, in tacere. Un produs marcat gresit ca „strain" ar fi ramas
     * blocat pentru totdeauna.
     */
    return { ok: true, action: "skipped" };
  }

  const variants = await getVariantData(admin, listing.id);
  const built = buildTrendyolItems({
    config: ctx.config, product: product as unknown as MappableProduct, listing: toEnrichment(listing), variants,
  });
  if ("error" in built) {
    await setListingStatus(admin, listing.id, "error", { error: built.error });
    return { ok: false, error: built.error };
  }

  /*
   * Aceeasi verificare de atribute obligatorii ca pe calea in masa.
   *
   * Sta si aici, nu doar acolo, fiindca doua cai catre acelasi marketplace cu
   * doua verificari diferite se despart la prima schimbare — iar simptomul ar fi
   * „merge cand public unul, esueaza cand public tot", adica exact felul de
   * diferenta pe care nimeni n-o cauta.
   */
  const catId = built.items[0]?.categoryId;
  if (typeof catId === "number") {
    const aleCategoriei = await getCategoryAttributesCached(ctx.auth, catId);
    if (aleCategoriei) {
      // TOATE variantele, nu doar prima: marimea si culoarea sunt tocmai
      // atributele obligatorii care difera intre ele.
      const lipsa = atributeLipsaPeVariante(aleCategoriei, built.items);
      if (lipsa.length > 0) {
        const mesaj = mesajAtributeLipsa(lipsa);
        await setListingStatus(admin, listing.id, "error", { error: mesaj });
        return { ok: false, error: mesaj };
      }
    }
  }

  /*
   * ⚠ CREARE SAU ACTUALIZARE — dupa starea produsului la ei.
   *
   * Un produs care exista deja la Trendyol NU se poate recrea: raspunsul e
   * mereu „codul de bare exista deja", deci reincercarea unei listari respinse
   * nu repara niciodata nimic. Asta a fost cazul real: un produs respins pentru
   * imagini, reincercat de comerciant, refuzat ca duplicat, la nesfarsit.
   *
   * Trendyol are trei drumuri diferite, si alegerea depinde de starea LOR:
   *   - produs inexistent          -> `createProducts`
   *   - produs NEAPROBAT (sau respins la revizuie) -> `unapproved-bulk-update`,
   *     pe barcode, cu setul complet de date
   *   - produs APROBAT             -> `content-bulk-update`, pe `contentId`,
   *     si acolo nu se mai pot schimba barcode, brand, categorie, marime, culoare
   */
  const ruta = rutaDeTrimitere(listing);

  /*
   * ⚠ BARCODURILE NOI SE CREEAZA, CHIAR SI PE UN PRODUS CARE EXISTA DEJA.
   *
   * Rutele de actualizare nu pot introduce barcoduri necunoscute. Un produs
   * listat cu marimile S si M, caruia comerciantul ii adauga L, ar fi plecat
   * intreg prin actualizare — iar L n-ar fi ajuns NICIODATA la ei, fara niciun
   * mesaj. Clientii ar fi vazut un produs caruia ii lipseste o marime.
   *
   * Deci se despart: barcodurile cunoscute pe ruta de actualizare, cele noi pe
   * creare, cu acelasi `productMainId` — asa devin variante ale aceluiasi produs.
   */
  const cunoscute = await barcoduriDejaLaEi(admin, ctx, listing, built.items.map((i) => i.barcode));
  const deCreat = ruta === "creare" ? built.items : built.items.filter((i) => !cunoscute.has(i.barcode));
  const deActualizat = ruta === "creare" ? [] : built.items.filter((i) => cunoscute.has(i.barcode));

  const trimiteri: { res: Awaited<ReturnType<typeof createProducts>>; kind: string }[] = [];
  if (deActualizat.length > 0) {
    trimiteri.push({
      kind: "update",
      res: ruta === "actualizare_aprobat"
        ? await updateApprovedContent(ctx.auth, [{
          contentId: listing.ty_content_id as number,
          title: deActualizat[0]?.title,
          description: deActualizat[0]?.description,
          images: deActualizat[0]?.images,
          /*
           * ⚠ Doar atributele DE PRODUS. Cele `slicer`/`varianter` — marimea,
           * culoarea — sunt interzise pe un produs aprobat si resping tot lotul.
           * Iar `built.items[0].attributes` le contine pe ale PRIMEI variante,
           * deci ar fi trimis „Mărime = S" pe cardul intregului produs.
           */
          attributes: await atributeDeProdus(ctx, deActualizat[0]),
        }])
        : await updateUnapprovedProducts(ctx.auth, deActualizat.map(faraStocSiPret)),
    });
    /*
     * ⚠ Pe produs APROBAT, ruta de continut NU duce `sgrPrice`.
     *
     * Iar `createProducts` refuza un barcode existent. Fara trimiterea de mai
     * jos, garantia SGR ramanea inghetata la valoarea de la prima listare,
     * pentru totdeauna: comerciantul isi corecta baxul in editor, vedea „Se
     * trimit 3,00 lei", primea „Trimis pe Trendyol" — si la ei ramanea 0,50.
     * Iar daca adauga o marime noua, aceea pleca prin creare CU valoarea
     * corecta, deci acelasi produs avea doua garantii diferite.
     *
     * `variant-bulk-update` e singura ruta care o poate schimba; accepta
     * actualizare partiala, deci se trimite doar campul.
     */
    if (ruta === "actualizare_aprobat") {
      const cuSgr = deActualizat
        .filter((i) => typeof i.sgrPrice === "number")
        .map((i) => ({ barcode: i.barcode, sgrPrice: i.sgrPrice as number }));
      if (cuSgr.length > 0) {
        trimiteri.push({ kind: "update", res: await updateApprovedVariants(ctx.auth, cuSgr) });
      }
    }
  }
  if (deCreat.length > 0) {
    trimiteri.push({ kind: "product", res: await createProducts(ctx.auth, deCreat) });
  }
  if (trimiteri.length === 0) return { ok: true, action: "skipped" };

  const picata = trimiteri.find((t) => isTrendyolError(t.res));
  if (picata && isTrendyolError(picata.res)) {
    const e = picata.res;
    await setListingStatus(admin, listing.id, "error", { error: e.error });
    return esteEroareDeChei(e.status)
      ? { ok: false, error: e.error, authFailed: true, status: e.status }
      : { ok: false, error: e.error, status: e.status };
  }

  /*
   * Statusul dupa o ACTUALIZARE nu se intoarce pe „pending".
   *
   * Produsul e deja la ei; trimiterea doar ii schimba datele. Pus pe „pending",
   * un produs aprobat ar aparea in interfata ca si cum ar astepta prima
   * acceptare, iar `reconcileStatuses` l-ar „re-aproba" degeaba.
   *
   * Cand se creeaza barcoduri NOI pe un produs existent, statusul tot nu se
   * schimba: produsul e acolo, doar ii adaugam variante.
   */
  await setListingStatus(
    admin, listing.id,
    ruta === "creare" ? "pending" : listing.status,
    { error: null, last_synced_at: new Date().toISOString() },
  );
  let batchRequestId: string | undefined;
  for (const t of trimiteri) {
    if (isTrendyolError(t.res)) continue;
    const id = t.res.data?.batchRequestId;
    if (!id) continue;
    batchRequestId = batchRequestId ?? id;
    const scris = await recordBatch(admin, ctx.businessId, id, t.kind, [listing.product_main_id]);
    /* ⚠ Idem: lot primit de ei, nescris la noi, deci lucrarea NU e terminata. */
    if (!scris) return { ok: false, error: "lotul nu s-a putut scrie in registru", status: 0 };
  }
  return { ok: true, action: "submitted", batchRequestId };
}

/**
 * Care dintre barcoduri exista DEJA in catalogul Trendyol.
 *
 * ⚠ NU se poate raspunde doar din `trendyol_variants.exista_la_ei`.
 *
 * Coloana aia sta pe un rand care se poate pierde: comerciantul apasa „Elimină"
 * si retrimite, iar listarea si variantele se recreeaza de la zero, cu marcajul
 * pe `false`. Atunci un produs care CHIAR e la Trendyol pleaca iar pe creare si
 * primeste „codul de bare exista deja" — la nesfarsit, oricate apasari. Vazut
 * de doua ori pe acelasi produs, in aceeasi zi.
 *
 * Deci pentru barcodurile nemarcate se intreaba sursa adevarata: serviciul lor
 * de stare pe barcode (404 = nu exista, 200 = exista). Raspunsul se scrie inapoi
 * in coloana, deci intrebarea se pune o singura data per barcode.
 */
export async function barcoduriDejaLaEi(
  admin: Db, ctx: TrendyolSyncContext, listing: ListingRow, barcoduri: string[],
): Promise<Set<string>> {
  const data = randuriCitite<{ barcode: string; exista_la_ei: boolean }>(
    "trendyol.barcoduriStiute", await admin.from("trendyol_variants")
      .select("barcode, exista_la_ei").eq("listing_id", listing.id) as never);
  const stiute = new Set(
    data.filter((v) => (v as { exista_la_ei: boolean }).exista_la_ei)
      .map((v) => (v as { barcode: string }).barcode),
  );
  /*
   * Se intreaba doar pentru listarile despre care stim ca sunt la ei. Pentru un
   * produs nou, barcodurile chiar nu exista si o cerere per varianta ar fi doar
   * risipa — plus un 404 asteptat la fiecare publicare.
   */
  if (!existaLaTrendyol(listing)) return stiute;

  const denecunoscute = barcoduri.filter((b) => !stiute.has(b));
  for (const barcode of denecunoscute.slice(0, 20)) {
    const res = await getProductBaseInfo(ctx.auth, barcode);
    if (isTrendyolError(res)) continue;             // 404 „product.not.found" = chiar nu exista
    if (res.data?.approved == null) continue;
    stiute.add(barcode);
    await admin.from("trendyol_variants").update({ exista_la_ei: true } as never)
      .eq("listing_id", listing.id).eq("barcode", barcode);
  }
  return stiute;
}

/**
 * Pe ce drum pleaca produsul: creare, actualizare de ciorna, sau de continut.
 *
 * Sta separat ca sa poata fi probata: e o decizie cu trei ramuri, iar ramura
 * gresita inseamna ori un refuz sigur („codul exista deja"), ori o cerere pe
 * `contentId` cand nu-l avem.
 */
export type RutaTrimitere = "creare" | "actualizare_neaprobat" | "actualizare_aprobat";

/** Statusurile in care produsul EXISTA deja la Trendyol, dar inca nu e aprobat. */
const NEAPROBAT_LA_EI = new Set(["created", "rejected"]);
/**
 * Statusurile in care produsul e aprobat si vandabil la ei.
 *
 * ⚠ `inactive` NU e aici. Inseamna „i-am pus stocul pe zero", iar ruta de
 * continut nu duce cantitate — deci un produs reactivat ar fi ramas invizibil
 * la ei pentru totdeauna. Reactivarea se trateaza separat, in `syncProductNow`.
 */
const APROBAT_LA_EI = new Set(["approved", "active"]);

/**
 * Produsul exista deja in catalogul Trendyol?
 *
 * ⚠ Asta e o intrebare despre STARE, nu o permisiune de scriere. Vezi
 * `putemSuprascrieContinutul` — cele doua au fost confundate o data si
 * rezultatul era ca datele lucrate de comerciant in panoul Trendyol se
 * inlocuiau tacit cu cele din Edinio.
 */
export function existaLaTrendyol(listing: { creat_de_edinio?: boolean | null; auto_inventory?: boolean | null }): boolean {
  return listing.creat_de_edinio === true || listing.auto_inventory === false;
}

/**
 * Avem voie sa-i rescriem continutul de la Trendyol?
 *
 * DA pentru produsele pe care le-am creat noi. NU pentru cele ADOPTATE: acolo
 * titlul, descrierea si imaginile sunt munca comerciantului, facuta in panoul
 * lor. Le-am legat ca sa curga comenzile, nu ca sa i le inlocuim.
 */
export function putemSuprascrieContinutul(listing: { creat_de_edinio?: boolean | null }): boolean {
  return listing.creat_de_edinio === true;
}

export function rutaDeTrimitere(listing: {
  status: string; creat_de_edinio?: boolean | null; ty_content_id?: number | null; auto_inventory?: boolean | null;
}): RutaTrimitere {
  if (!existaLaTrendyol(listing)) return "creare";
  if (APROBAT_LA_EI.has(listing.status)) {
    // Fara `contentId` nu se poate actualiza continutul unui produs aprobat:
    // ruta aia nu accepta barcode. Il aflam la prima reconciliere; pana atunci
    // incercarea de creare macar produce un refuz explicit, nu o cerere invalida.
    return listing.ty_content_id ? "actualizare_aprobat" : "creare";
  }
  if (NEAPROBAT_LA_EI.has(listing.status)) return "actualizare_neaprobat";
  return "creare";
}

/**
 * Atributele care au voie sa plece pe `content-bulk-update`.
 *
 * ⚠ Pe un produs APROBAT, Trendyol interzice modificarea atributelor marcate
 * `slicer` sau `varianter` — adica exact marimea si culoarea. Trimise, resping
 * lotul intreg. Iar sursa noastra (`built.items[0].attributes`) le CONTINE, si
 * inca pe ale primei variante: pentru un tricou S/M/L ar fi plecat „Mărime = S"
 * ca atribut al intregului produs.
 *
 * Cand nu putem afla ce e varianter (nomenclatorul lor cazut), NU ghicim si nu
 * trimitem nimic: mai bine o actualizare de continut fara atribute decat un lot
 * respins sau un atribut pus gresit.
 */
export async function atributeDeProdus(
  ctx: TrendyolSyncContext, item: TrendyolProductItem | undefined,
): Promise<TrendyolProductAttribute[] | undefined> {
  const toate = item?.attributes;
  if (!toate?.length || typeof item?.categoryId !== "number") return undefined;
  const aleCategoriei = await getCategoryAttributesCached(ctx.auth, item.categoryId);
  if (!aleCategoriei) return undefined;
  const interzise = new Set(
    aleCategoriei
      .filter((a) => (a as { varianter?: boolean; slicer?: boolean }).varianter === true
        || (a as { varianter?: boolean; slicer?: boolean }).slicer === true)
      .map((a) => a.attribute?.id)
      .filter((id): id is number => typeof id === "number"),
  );
  const pastrate = toate.filter((a) => !interzise.has(a.attributeId));
  // „Totul sau nimic": daca tot ce ramane e gol, nu trimitem un vector gol —
  // ar sterge atributele produsului.
  return pastrate.length > 0 ? pastrate : undefined;
}

/** Payload-ul de actualizare nu contine stoc si pret: alea merg doar prin `price-and-inventory`. */
export function faraStocSiPret(item: TrendyolProductItem): TrendyolItemActualizare {
  const { quantity: _q, listPrice: _l, salePrice: _s, ...rest } = item;
  void _q; void _l; void _s;
  return rest;
}

// ── Listare din maparea categoriei ──────────────────────────────────────────────
// Ca sa nu ceara o trecere prin editor pentru fiecare produs: categoria mapata da
// categoria si brandul Trendyol, iar variantele produsului dau barcode-urile.
// Folosit si de butonul din pagina produsului, si de trimiterea in masa.

export interface ListingPregatit { listingId: string; creatAcum: boolean }

export async function ensureListingFromMapping(
  admin: Db, ctx: TrendyolSyncContext, product: MappableProduct,
): Promise<ListingPregatit | { error: string }> {
  const existing = await getListing(admin, ctx.businessId, product.id);
  if (existing) return { listingId: existing.id, creatAcum: false };

  const entry = product.category ? ctx.config.category_map?.[product.category] : undefined;
  if (!entry?.category_id) {
    return {
      error: product.category
        ? `Categoria „${product.category}" nu este mapată la Trendyol.`
        : "Produsul nu are categorie.",
    };
  }
  const brandId = entry.brand_id ?? ctx.config.brand_id;
  if (!brandId) return { error: "Categoria nu are brand Trendyol ales." };

  const slots = deriveVariantSlots(product);
  for (const s of slots) {
    const problema = verificaBarcode(s.barcode.trim());
    if (problema) return { error: problema };
  }

  const now = new Date().toISOString();
  const { data: up, error: upErr } = await admin.from("trendyol_listings").upsert(
    {
      business_id: ctx.businessId, product_id: product.id, product_main_id: product.id,
      brand_id: brandId, category_id: entry.category_id,
      attributes: ((entry.attributes ?? []) as unknown) as never,
      dimensional_weight: null, cargo_company_id: null, updated_at: now,
    } as never,
    { onConflict: "business_id,product_main_id" },
  ).select("id").single();
  if (upErr || !up) return { error: "Eroare la pregătirea listării." };
  const listingId = (up as { id: string }).id;

  // Barcode-ul e identificatorul lui Trendyol: folosit de doua produse, al doilea
  // il suprascrie pe primul in catalogul lor.
  const barcodes = slots.map((s) => s.barcode.trim());
  /* ⚠ O lista goala inseamna „niciun barcode nu e luat". Venita dintr-o pana, ar fi lasat
     doua produse pe acelasi barcode la Trendyol — iar stocul unuia l-ar fi scris pe celalalt. */
  const clash = randuriCitite<{ barcode: string; listing_id: string }>("trendyol.barcodeLuat", await admin
    .from("trendyol_variants")
    .select("barcode, listing_id").eq("business_id", ctx.businessId).in("barcode", barcodes) as never);
  const conflict = (clash ?? []).find((c) => c.listing_id !== listingId);
  if (conflict) {
    return { error: `Barcode-ul „${conflict.barcode}" este deja folosit de alt produs.` };
  }

  await admin.from("trendyol_variants").delete().eq("listing_id", listingId);
  if (slots.length > 0) {
    await admin.from("trendyol_variants").insert(slots.map((s) => ({
      listing_id: listingId, business_id: ctx.businessId, product_id: product.id,
      barcode: s.barcode.trim(), stock_code: null, attributes: [] as unknown as never,
      /*
       * Titlul combinatiei se PASTREAZA, nu se mai arunca.
       *
       * `deriveVariantSlots` il stia dintotdeauna (`label`), dar aici se scria doar
       * barcode-ul — si atunci, la o comanda venita de pe Trendyol, se putea scadea
       * doar stocul de PRODUS. Pe un produs cu marimi, scaderea aia se sterge la
       * prima editare de variante, fiindca declansatorul recalculeaza coloana din
       * suma combinatiilor. Adica vanzarea de pe marketplace dispare din stoc.
       *
       * `null` pentru produsele fara variante (`key === "default"`): acolo nu
       * exista nicio combinatie de scazut, iar stocul de produs e cel adevarat.
       */
      variant_title: s.key === "default" ? null : s.label,
      quantity: null, list_price: null, sale_price: null, vat_rate: null, enabled: true,
    })) as never);
  }
  return { listingId, creatAcum: true };
}

// ── Trimitere in masa ───────────────────────────────────────────────────────────
// Trendyol accepta pana la 1000 de articole intr-o singura cerere de creare. Un
// apel pe produs ar insemna 200 de cereri pentru 200 de produse — deci construim
// articolele pentru toata selectia si le trimitem impreuna. Citirile din baza sunt
// si ele grupate: altfel 200 de produse insemnau sute de interogari.

/** Cate articole trimitem intr-o cerere. Sub plafonul lor, ca sa ramana loc de variante. */
const ARTICOLE_PE_CERERE = 200;

export interface BulkSyncOutcome {
  submitted: number;
  failed: number;
  errors: { product: string; message: string }[];
  batchRequestIds: string[];
}

interface ProdusDeTrimis { items: TrendyolProductItem[]; listingId: string; mainId: string }
export interface LotTrendyol { items: TrendyolProductItem[]; listingIds: string[]; mainIds: string[] }

/**
 * Imparte produsele in cereri, fara sa rupa un produs in doua.
 *
 * Variantele aceluiasi produs sunt legate prin `productMainId`: trimise in loturi
 * diferite, Trendyol le proceseaza ca doua produse distincte si a doua cerere il
 * suprascrie pe primul. Deci un produs incape intreg intr-un lot, chiar daca lotul
 * depaseste plafonul — un singur produs cu foarte multe variante e mai bine trimis
 * intreg decat spart.
 */
export function grupeazaInLoturi(produse: ProdusDeTrimis[], maxArticole: number): LotTrendyol[] {
  const loturi: LotTrendyol[] = [];
  let curent: LotTrendyol = { items: [], listingIds: [], mainIds: [] };
  for (const p of produse) {
    if (curent.items.length > 0 && curent.items.length + p.items.length > maxArticole) {
      loturi.push(curent);
      curent = { items: [], listingIds: [], mainIds: [] };
    }
    curent.items.push(...p.items);
    curent.listingIds.push(p.listingId);
    curent.mainIds.push(p.mainId);
  }
  if (curent.items.length > 0) loturi.push(curent);
  return loturi;
}

export async function syncProductsBulk(
  admin: Db, ctx: TrendyolSyncContext, productIds: string[],
): Promise<BulkSyncOutcome> {
  const out: BulkSyncOutcome = { submitted: 0, failed: 0, errors: [], batchRequestIds: [] };
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return out;

  /* ⚠ Lista goala inseamna „niciun produs de pregatit", si lotul se incheie ca reusit fara sa
     fi trimis nimic. */
  const lista = randuriCitite<Record<string, never>>("trendyol.produseDePregatit", await admin
    .from("products").select(PRODUCT_FIELDS).eq("business_id", ctx.businessId).in("id", ids) as never
  ) as unknown as MappableProduct[];

  // Fiecare produs isi pregateste listarea; erorile sunt per produs, ca sa nu
  // pice toata selectia din cauza unuia fara categorie mapata.
  const pregatite: { product: MappableProduct; listingId: string }[] = [];
  for (const p of lista) {
    if ((p as { is_active?: boolean }).is_active === false) {
      out.failed++;
      out.errors.push({ product: p.name, message: "Produs inactiv." });
      continue;
    }
    const gata = await ensureListingFromMapping(admin, ctx, p);
    if ("error" in gata) { out.failed++; out.errors.push({ product: p.name, message: gata.error }); continue; }
    pregatite.push({ product: p, listingId: gata.listingId });
  }
  if (pregatite.length === 0) return out;

  // Listarile si variantele, citite o singura data pentru toate.
  const listingIds = pregatite.map((x) => x.listingId);
  const [{ data: randuriListari }, { data: randuriVariante }] = await Promise.all([
    admin.from("trendyol_listings")
      .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, auto_inventory, creat_de_edinio, ty_content_id, sgr_units, country_of_origin")
      .eq("business_id", ctx.businessId).in("id", listingIds),
    admin.from("trendyol_variants")
      .select("listing_id, barcode, stock_code, variant_title, attributes, quantity, list_price, sale_price, vat_rate, enabled")
      .in("listing_id", listingIds),
  ]);
  const listariDupaId = new Map((randuriListari ?? []).map((l) => [(l as ListingRow).id, l as ListingRow]));
  const varianteDupaListare = new Map<string, TrendyolVariantData[]>();
  for (const v of randuriVariante ?? []) {
    const row = v as { listing_id: string } & Record<string, unknown>;
    const arr = varianteDupaListare.get(row.listing_id) ?? [];
    arr.push({
      barcode: row.barcode as string,
      stock_code: (row.stock_code as string | null) ?? null,
      variant_title: (row.variant_title as string | null) ?? null,
      attributes: Array.isArray(row.attributes) ? (row.attributes as unknown as TrendyolProductAttribute[]) : [],
      quantity: (row.quantity as number | null) ?? null,
      list_price: (row.list_price as number | null) ?? null,
      sale_price: (row.sale_price as number | null) ?? null,
      vat_rate: (row.vat_rate as number | null) ?? null,
      enabled: (row.enabled as boolean) ?? true,
    });
    varianteDupaListare.set(row.listing_id, arr);
  }

  // Constructia articolelor, pastrand legatura articol -> listare pentru statusuri.
  const deTrimis: { items: TrendyolProductItem[]; listingId: string; mainId: string }[] = [];
  /*
   * Atributele obligatorii ale fiecarei categorii, cerute O DATA per categorie.
   *
   * Sunt cateva categorii distincte intr-un lot de sute de produse, iar
   * `getCategoryAttributesCached` mai are si un cache de sase ore — deci
   * verificarea nu adauga un dus-intors pe produs.
   */
  const atributeCategorie = new Map<number, TrendyolCategoryAttribute[] | null>();

  for (const { product, listingId } of pregatite) {
    const listing = listariDupaId.get(listingId);
    if (!listing) { out.failed++; out.errors.push({ product: product.name, message: "Listare negăsită." }); continue; }
    const built = buildTrendyolItems({
      config: ctx.config, product, listing: toEnrichment(listing),
      variants: varianteDupaListare.get(listingId) ?? [],
    });
    if ("error" in built) {
      await setListingStatus(admin, listingId, "error", { error: built.error });
      out.failed++;
      out.errors.push({ product: product.name, message: built.error });
      continue;
    }

    /*
     * ATRIBUTELE OBLIGATORII SE VERIFICA AICI, INAINTE DE TRIMITERE.
     *
     * Fara asta, produsul pleaca si e respins de Trendyol, cu raspunsul sosind
     * ore mai tarziu pe LOT, nu pe produsul care avea gaura. Masurat: trei rulari,
     * doua magazine, 0/25, 0/14 si 1/13 — si singurul motiv pastrat undeva a fost
     * „Lipseste ID atribut: 47, Nume atribut: Culoare", pe doua produse din 52.
     *
     * Cand nu putem afla atributele categoriei (API cazut), NU se blocheaza
     * produsul: se trimite ca pana acum. O verificare care nu poate rula n-are
     * voie sa devina ea insasi motivul pentru care nu se listeaza nimic.
     */
    const catId = built.items[0]?.categoryId;
    if (typeof catId === "number") {
      if (!atributeCategorie.has(catId)) {
        atributeCategorie.set(catId, await getCategoryAttributesCached(ctx.auth, catId));
      }
      const aleCategoriei = atributeCategorie.get(catId);
      if (aleCategoriei) {
        const lipsa = atributeLipsaPeVariante(aleCategoriei, built.items);
        if (lipsa.length > 0) {
          const mesaj = mesajAtributeLipsa(lipsa);
          await setListingStatus(admin, listingId, "error", { error: mesaj });
          out.failed++;
          out.errors.push({ product: product.name, message: mesaj });
          continue;
        }
      }
    }

    deTrimis.push({ items: built.items, listingId, mainId: listing.product_main_id });
  }
  if (deTrimis.length === 0) return out;

  const loturi = grupeazaInLoturi(deTrimis, ARTICOLE_PE_CERERE);

  const acum = new Date().toISOString();
  for (const lot of loturi) {
    const res = await createProducts(ctx.auth, lot.items);
    if (isTrendyolError(res)) {
      for (const listingId of lot.listingIds) await setListingStatus(admin, listingId, "error", { error: res.error });
      out.failed += lot.listingIds.length;
      // Un singur mesaj pe lot: e aceeasi eroare pentru toate produsele din el.
      out.errors.push({ product: `${lot.listingIds.length} produse`, message: res.error });
      continue;
    }
    for (const listingId of lot.listingIds) {
      await setListingStatus(admin, listingId, "pending", { error: null, last_synced_at: acum });
    }
    out.submitted += lot.listingIds.length;
    const batchRequestId = res.data?.batchRequestId;
    if (batchRequestId) {
      out.batchRequestIds.push(batchRequestId);
      /*
       * ⚠ LOTUL PRIMIT DE EI SI NESCRIS DE NOI = REZULTAT NECUNOSCUT (26.08.2026).
       *
       * Regula e simpla si se aplica peste tot: daca ne-au dat un `batchRequestId` si noi nu-l
       * putem tine minte, nu mai avem cum sa aflam ce s-a intamplat cu produsele alea. Marcate
       * `pending`, ar fi asteptat la nesfarsit o confirmare pe care n-o mai putem cere.
       *
       * De-aia listarile se intorc pe `error`, cu motivul scris: vizibile si reincercabile e
       * mult mai bine decat blocate in „in aprobare" pe veci. Publicarea e idempotenta la ei —
       * acelasi produs trimis de doua ori nu face doua produse, se potriveste pe barcode.
       */
      const scris = await recordBatch(admin, ctx.businessId, batchRequestId, "product", lot.mainIds);
      if (!scris) {
        for (const listingId of lot.listingIds) {
          await setListingStatus(admin, listingId, "error", {
            error: "Lotul a fost primit de Trendyol, dar nu s-a putut tine minte. Se reia.",
          });
        }
      }
    }
    await pause(200);
  }
  return out;
}

// ── Inventory / price push (also used to deactivate by zeroing stock) ───────────
export type InventoryItem = { barcode: string; quantity: number; salePrice: number; listPrice: number };

// Compute the price-and-inventory items Edinio intends for a product. Shared by the
// forward push AND the reverse reconciliation, so both agree exactly (no oscillation).
// Returns null when the listing isn't pushable (not on Trendyol yet, no variants).
async function computeInventoryItems(
  admin: Db, ctx: TrendyolSyncContext, productId: string, forceZero = false, manual = false,
): Promise<{ items: InventoryItem[]; listing: ListingRow } | { error: string } | null> {
  /* ⚠ Aici `null` inseamna „nu se poate impinge", iar miscarea de stoc de dupa o vanzare s-ar
     pierde tacut — marfa s-ar vinde a doua oara pe Trendyol. Se deosebeste de o pana. */
  const product = randCitit<Record<string, unknown>>("trendyol.produsulPentruStoc", await admin
    // `page_sections` NU e de decor aici: acolo stau combinatiile cu stocul lor.
    // Fara el, impingerea de stoc n-avea de unde sti cate bucati are marimea M si
    // trimitea totalul produsului pe fiecare barcode — iar reconcilierea, care
    // foloseste exact functia asta, confirma cifra gresita in loc s-o corecteze.
    .from("products").select("id, sku, price, compare_at_price, track_inventory, stock_quantity, page_sections")
    .eq("id", productId).eq("business_id", ctx.businessId).maybeSingle() as never);
  if (!product) return null;
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return null;
  // price-and-inventory only works for products that already exist on Trendyol; a
  // not-yet-created listing (draft/pending/error) will get its stock+price from the
  // createProducts payload instead.
  if (!["created", "approved", "active", "inactive"].includes(listing.status)) return null;
  /*
   * Listarile ADOPTATE nu-si primesc stocul si pretul de la noi din oficiu.
   *
   * Sunt produse pe care comerciantul le are pe Trendyol de pe alta cale, cu
   * valorile puse acolo de el. Le-am legat ca sa nu ramana blocate si ca sa
   * curga comenzile — dar a le suprascrie tacit pretul ar fi o surpriza scumpa.
   *
   * `forceZero` trece oricum: scoaterea din vanzare a unui produs dezactivat in
   * Edinio nu poate depinde de o preferinta de sincronizare. La fel si o
   * impingere ceruta EXPLICIT de comerciant (`manual`).
   */
  if (listing.auto_inventory === false && !manual && !forceZero) return null;
  const variants = (await getVariantData(admin, listing.id)).filter((v) => v.enabled && v.barcode);
  if (variants.length === 0) return null;

  const single = variants.length === 1;
  const prod = product as unknown as MappableProduct;
  const stocuri = stocuriVii(prod);
  const items: InventoryItem[] = [];
  for (const v of variants) {
    /* ⚠ Si aici trece configul: pe o vitrina cu alta moneda, lipsa pretului explicit
       trebuie sa opreasca trimiterea, nu sa cada inapoi pe pretul in lei. */
    const priced = buildVariantPrices(prod, v, ctx.config);
    if ("error" in priced) return { error: priced.error };
    items.push({
      barcode: v.barcode,
      quantity: resolveVariantQuantity(prod, v.quantity, single, forceZero, stocVarianteiSalvate(stocuri, v)),
      salePrice: priced.salePrice,
      listPrice: priced.listPrice,
    });
  }
  return { items, listing };
}

export async function pushInventoryNow(
  admin: Db, ctx: TrendyolSyncContext, productId: string, forceZero = false, manual = false,
): Promise<SyncOutcome> {
  const built = await computeInventoryItems(admin, ctx, productId, forceZero, manual);
  if (built === null) return { ok: true, action: "skipped" };
  if ("error" in built) return { ok: false, error: built.error };

  const res = await updatePriceInventory(ctx.auth, built.items);
  if (isTrendyolError(res)) {
    return esteEroareDeChei(res.status)
      ? { ok: false, error: res.error, authFailed: true, status: res.status }
      : { ok: false, error: res.error, status: res.status };
  }
  const batchRequestId = res.data?.batchRequestId;
  if (batchRequestId) {
    const scris = await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", [built.listing.product_main_id]);
    /* ⚠ Trendyol a primit lotul, dar nu i-am putut scrie numarul. `status: 0` il face
       „trecator": elementul se reia FARA sa arda o incercare, si se retrimite. Vezi
       `recordBatch` pentru de ce retrimiterea e sigura. */
    if (!scris) return { ok: false, error: "lotul nu s-a putut scrie in registru", status: 0 };
  }
  return { ok: true, action: "submitted", batchRequestId };
}

/**
 * Duce termenul de expediere la produsele DEJA listate.
 *
 * ═══ ⚠ DE CE NU PRIN `upsert` ═══
 *
 * `deliveryOption` incape si in incarcatura de produs, dar aia trimite CONTINUTUL intreg si trece
 * produsul din nou prin revizuia lor. Termenul are ruta lui — `delivery-info-bulk-update` — care
 * nu atinge continutul. Aceeasi regula pe care o tinem la eMAG: ruta cea mai usoara pentru
 * intentia avuta. Acolo, confuzia intre ele a raportat succes pe 1051 de produse fara sa schimbe
 * niciun pret.
 *
 * ⚠ CAND COMERCIANTUL N-A ALES NIMIC, nu se trimite nimic — si nu e o scapare. `null` inseamna
 * „las cum e in contul lor", iar o cerere cu o valoare de rezerva i-ar rescrie hotararea. Nu
 * exista „sterge termenul" prin ruta asta, deci intoarcerea la implicit se face din panoul lor.
 *
 * ⚠ SE TRIMITE PE BARCOD, ca si stocul: la ei termenul sta pe varianta, nu pe produs.
 */
export async function pushLivrareNow(
  admin: Db, ctx: TrendyolSyncContext, productId: string,
): Promise<SyncOutcome> {
  const zile = ctx.config.delivery_duration;
  if (zile == null) return { ok: true, action: "skipped" };

  /* Barcodurile ies din aceeasi socoteala ca la stoc, deci nu se pot desparti de ea. */
  const built = await computeInventoryItems(admin, ctx, productId);
  if (built === null) return { ok: true, action: "skipped" };
  if ("error" in built) return { ok: false, error: built.error };

  const items = built.items.map((i) => ({ barcode: i.barcode, deliveryOptions: { deliveryDuration: zile } }));
  if (items.length === 0) return { ok: true, action: "skipped" };

  const res = await updateDeliveryInfo(ctx.auth, items);
  if (isTrendyolError(res)) {
    return esteEroareDeChei(res.status)
      ? { ok: false, error: res.error, authFailed: true, status: res.status }
      : { ok: false, error: res.error, status: res.status };
  }
  const batchRequestId = res.data?.batchRequestId;
  if (batchRequestId) {
    const scris = await recordBatch(admin, ctx.businessId, batchRequestId, "livrare", [built.listing.product_main_id]);
    /* ⚠ Ca la stoc: lotul primit si nescris se reia FARA sa arda o incercare. */
    if (!scris) return { ok: false, error: "lotul nu s-a putut scrie in registru", status: 0 };
  }
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Remove ──────────────────────────────────────────────────────────────────────
/*
 * ⚠ TRENDYOL NU ARE STERGERE DE PRODUS.
 *
 * Singurul mod de a scoate ceva din vanzare la ei e stocul pe zero. Deci
 * ordinea conteaza: intai zeroizam ACOLO, si abia dupa aia stergem randurile de
 * aici. Invers — sau sarind peste zeroizare — produsul ramane listat si
 * VANDABIL pe Trendyol, fara sa mai existe la noi nimic care sa-l corecteze:
 * comenzile ar continua sa vina pentru marfa pe care magazinul n-o mai are.
 */

/**
 * Pune pe zero stocul tuturor barcodurilor unei listari.
 *
 * Se lucreaza pe BARCODURI, nu pe statusul listarii. Vechea garda sarea peste
 * zeroizare cand statusul era `draft` sau `error` — dar `error` se pune si dupa
 * ce produsul a ajuns pe Trendyol (un lot picat pe alta varianta, o respingere
 * ulterioara), deci tocmai produsele listate si stricate ramaneau la vanzare.
 * Trendyol accepta fara sa se planga barcoduri pe care nu le cunoaste.
 */
/**
 * Verdictul unei incercari de a scoate marfa din vanzare la ei.
 *
 * ⚠ TREI, nu doua: „n-am reusit acum" si „nu se poate" duc in locuri diferite. Prima cere
 * reluare, a doua cere omul.
 */
type VerdictScoatere = "gata" | "trecatoare" | "refuz";

async function zeroizeazaStocul(
  admin: Db, ctx: TrendyolSyncContext, listingId: string,
): Promise<{ verdict: VerdictScoatere; barcoduri: string[]; motiv?: string }> {
  const data = randuriCitite<{ barcode: string; list_price: number | null; sale_price: number | null }>(
    "trendyol.varianteleDeZeroizat", await admin.from("trendyol_variants")
      .select("barcode, quantity, list_price, sale_price, vat_rate, enabled, stock_code, variant_title")
      .eq("listing_id", listingId) as never);
  const barcoduri = (data ?? []).map((v) => (v as { barcode: string }).barcode).filter(Boolean);
  /* ⚠ Fara barcode-uri n-avem ce zeroiza SI nici ce sterge: listarea n-a ajuns niciodata la
     ei sub o forma pe care s-o putem numi. Se lasa sa treaca. */
  if (barcoduri.length === 0) return { verdict: "gata", barcoduri: [] };
  // Preturile trebuie sa ramana valide (`listPrice >= salePrice > 0`), altfel
  // Trendyol refuza tot lotul si stocul NU ajunge pe zero.
  const items: InventoryItem[] = (data ?? []).map((v) => {
    const r = v as { barcode: string; list_price: number | null; sale_price: number | null };
    const sale = r.sale_price && r.sale_price > 0 ? r.sale_price : 1;
    const list = r.list_price && r.list_price >= sale ? r.list_price : sale;
    return { barcode: r.barcode, quantity: 0, salePrice: round2(sale), listPrice: round2(list) };
  });
  for (let i = 0; i < items.length; i += 100) {
    const res = await updatePriceInventory(ctx.auth, items.slice(i, i + 100));
    if (isTrendyolError(res)) {
      /*
       * ═══ ⚠ AICI SE PIERDEA MARFA DIN VEDERE (26.08.2026) ═══
       *
       * Forma dinainte scria un `console.warn` — care nu ajunge nici macar in jurnal — si se
       * intorcea. Iar apelantul stergea listarea din `trendyol_listings` ORICUM. Deci:
       *
       *   la Trendyol: produsul, cu stoc > 0, in continuare DE VANZARE
       *   la Edinio:   nicio urma ca a existat vreodata acolo
       *
       * Se vinde marfa stearsa din magazin, si nimeni nu mai are de unde afla.
       */
      await logError({
        action: "trendyol/stergere",
        message: `stocul nu s-a putut pune pe zero: ${res.error}`,
        details: { listingId, barcoduri: barcoduri.slice(0, 20), status: res.status },
        businessId: ctx.businessId, severity: "critical",
      });
      return {
        verdict: eTrecatoare(res.status) ? "trecatoare" : "refuz",
        barcoduri, motiv: res.error,
      };
    }
    const batchRequestId = res.data?.batchRequestId;
    if (batchRequestId) {
      /*
       * ⚠ NESCRIS INSEAMNA NECUNOSCUT, si aici conteaza mai mult ca oriunde: zeroizarea e prima
       * plasa a retragerii. Nestiind daca s-a facut, verdictul NU are voie sa fie „gata".
       */
      const scris = await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", []);
      if (!scris) {
        return {
          verdict: "trecatoare",
          barcoduri,
          motiv: "Lotul de stoc a fost primit de Trendyol, dar nu s-a putut tine minte.",
        };
      }
    }
  }
  return { verdict: "gata", barcoduri };
}

/**
 * Scoate produsul de la vanzare la ei, si abia apoi uita listarea.
 *
 * ═══ ⚠ ORDINEA E TOATA REPARATIA ═══
 *
 *   1. ARHIVARE  — il scoate din vanzare IMEDIAT si sigur. Chiar daca tot ce urmeaza pica,
 *                  marfa nu se mai vinde.
 *   2. STOC ZERO — a doua plasa, pentru cazul in care arhivarea e refuzata.
 *   3. STERGERE  — `DELETE /products`, cererea adevarata pe care n-o foloseam.
 *   4. Abia daca marfa nu se mai vinde, se uita listarea la noi.
 *
 * ⚠ CAND NU SE POATE, RANDUL RAMANE, marcat `removing`. E o piatra de mormant, nu un defect:
 * atat timp cat exista, coada reia stergerea, panoul il poate arata, iar noi stim ca la ei a
 * mai ramas ceva. Sters, n-am mai fi stiut nimic.
 */
/**
 * Cat trebuie sa stea un produs arhivat inainte sa poata fi sters.
 *
 * ⚠ E REGULA LOR, nu prudenta noastra: pentru un produs aprobat, stergerea e ingaduita abia
 * dupa ce a stat arhivat peste o zi. Douazeci si cinci de ore, nu douazeci si patru: ceasul lor
 * si al nostru nu bat la fel, iar o ora in plus nu costa nimic — marfa e deja scoasa din vanzare.
 */
const ORE_ARHIVA_INAINTE_DE_STERGERE = 25;

async function scoateDeLaVanzare(
  admin: Db, ctx: TrendyolSyncContext, listing: ListingRow,
): Promise<SyncOutcome> {
  /* `draft` n-a plecat niciodata la ei: n-are ce arhiva, ce zeroiza sau ce sterge. */
  if (listing.status === "draft") {
    await admin.from("trendyol_listings").delete().eq("id", listing.id);
    return { ok: true, action: "removed" };
  }

  const zero = await zeroizeazaStocul(admin, ctx, listing.id);

  if (zero.barcoduri.length === 0) {
    /* Fara barcoduri, listarea n-a ajuns niciodata la ei sub o forma pe care s-o putem numi. */
    await admin.from("trendyol_listings").delete().eq("id", listing.id);
    return { ok: true, action: "removed" };
  }

  /* ⚠ ARHIVAREA INAINTE DE ORICE: e singura care scoate marfa din vanzare fara sa depinda de
     cantitate. Dar e si ea un LOT, deci „primita" nu inseamna „facuta" — vezi mai jos. */
  const arh = await setArchiveState(ctx.auth, zero.barcoduri.map((barcode) => ({ barcode, archived: true })));
  const arhivat = !isTrendyolError(arh);
  if (!arhivat) {
    await logError({
      action: "trendyol/stergere",
      message: `arhivarea la stergere a esuat: ${arh.error}`,
      details: { listingId: listing.id, status: arh.status },
      businessId: ctx.businessId, severity: "warning",
    });
  }

  /*
   * ═══ ⚠ RANDUL NU SE MAI STERGE AICI. NICIODATA (26.08.2026) ═══
   *
   * Forma dinainte cerea arhivarea, cerea stergerea, si uita listarea pe loc. Amandoua sunt
   * insa LOTURI ASINCRONE la ei: raspunsul HTTP spune ca au primit cererea, nu ca au facut-o.
   * Masurat pe registrul nostru, pe trafic real, loturile pica la ei des — 632 din 1954 la
   * stoc, 78 din 150 la produs.
   *
   * Deci se putea intampla asta, si nu era o inlantuire nefireasca:
   *
   *     arhivare  primita  -> mai tarziu ESUATA
   *     stoc zero primit   -> mai tarziu ESUAT
   *     stergere  primita  -> mai tarziu ESUATA
   *     la noi:            randul, sters deja
   *
   * Adica produsul ramanea la vanzare la ei, si la noi nu mai era nicio urma ca a existat.
   *
   * ⚠ ACUM RANDUL STA PE `removing` PANA CAND LOTURILE CONFIRMA. `removing` nu e o stare
   * inventata: e chiar piatra de mormant a casei pentru „marfa poate fi inca vandabila".
   *
   * ⚠ SI STERGEREA NU MAI PLEACA IN ACEEASI CLIPA CU ARHIVAREA. Ei cer ca un produs aprobat sa
   * fi stat arhivat PESTE O ZI. Ceruta imediat, stergerea e refuzata pe buna dreptate — iar noi
   * o luam drept „gata". Pleaca din cron, cand `arhivat_la` e destul de vechi. Vezi
   * `stergeCePoateFiSters`.
   */
  const acum = new Date().toISOString();
  const { error: eSemn } = await admin.from("trendyol_listings")
    .update({ status: "removing", error: arhivat ? null : arh.error, updated_at: acum } as never)
    .eq("id", listing.id);
  if (eSemn) {
    /* ⚠ Nemarcat, randul ar fi ramas „approved" si nimeni n-ar mai fi stiut ca e de scos. */
    return { ok: false, error: "Retragerea nu s-a putut marca la noi.", status: 0 };
  }

  /*
   * ⚠ LOTUL DE ARHIVARE SE URMARESTE, si `recordBatch` se VERIFICA. Daca ei ne-au dat un
   * `batchRequestId` si noi nu l-am putut scrie, rezultatul e NECUNOSCUT — nu reusit. Elementul
   * se reia, iar arhivarea e idempotenta: arhivarea unui produs deja arhivat nu strica nimic.
   */
  if (arhivat && arh.data?.batchRequestId) {
    const scris = await recordBatch(admin, ctx.businessId, arh.data.batchRequestId, "archive", [listing.id]);
    if (!scris) return { ok: false, error: "Lotul de arhivare n-a putut fi tinut minte.", status: 0 };
  }

  if (!arhivat) {
    return {
      ok: false,
      error: `Produsul e inca de vanzare pe Trendyol: ${arh.error}`,
      /* ⚠ Trecatoare de la ORICARE dintre cele doua. */
      status: (eTrecatoare(arh.status) || zero.verdict === "trecatoare") ? 0 : undefined,
    };
  }

  /* Marfa e pe drumul spre „nu se mai vinde". Restul il duce cronul, dupa confirmari. */
  return { ok: true, action: "removed" };
}

/**
 * Ce s-a arhivat acum mai bine de o zi se poate si sterge.
 *
 * ═══ ⚠ EI CER O ZI DE ARHIVA INAINTE DE STERGERE ═══
 *
 * Pentru un produs APROBAT, `DELETE /products` e ingaduit numai dupa ce a stat arhivat peste o
 * zi. Ceruta imediat dupa arhivare — cum faceam — cererea e refuzata pe buna dreptate, iar noi
 * o citeam drept „gata" si uitam listarea.
 *
 * ⚠ `arhivat_la` SE SCRIE LA CONFIRMAREA LOTULUI, nu la trimiterea lui. Altfel ceasul ar porni
 * de la o arhivare care poate n-a avut loc.
 */
export async function stergeCePoateFiSters(
  admin: Db, ctx: TrendyolSyncContext, maxProduse = 20,
): Promise<{ cerute: number }> {
  const prag = new Date(Date.now() - ORE_ARHIVA_INAINTE_DE_STERGERE * 3600_000).toISOString();
  const randuri = randuriCitite<{ id: string }>("trendyol.listariDeSters", await admin
    .from("trendyol_listings").select("id")
    .eq("business_id", ctx.businessId).eq("status", "removing")
    .not("arhivat_la", "is", null).lt("arhivat_la", prag)
    /* ⚠ Cele la care n-am mai incercat de mult intai, ca sa nu se blocheze coada pe una care
       refuza mereu. */
    .order("sters_cerut_la", { ascending: true, nullsFirst: true })
    .limit(maxProduse) as never);

  let cerute = 0;
  for (const l of randuri) {
    const barcoduri = randuriCitite<{ barcode: string }>("trendyol.barcoduriDeSters", await admin
      .from("trendyol_variants").select("barcode")
      .eq("listing_id", l.id).not("barcode", "is", null) as never)
      .map((v) => v.barcode).filter(Boolean);
    if (barcoduri.length === 0) {
      /* N-avem ce numi la ei; randul si-a facut treaba de piatra de mormant. */
      await admin.from("trendyol_listings").delete().eq("id", l.id);
      continue;
    }

    const acum = new Date().toISOString();
    const ster = await deleteProducts(ctx.auth, barcoduri);
    if (isTrendyolError(ster)) {
      /*
       * ⚠ RANDUL RAMANE. Un refuz aici nu inseamna ca produsul a disparut — inseamna ca inca e
       * acolo, arhivat. Sters randul, n-am mai fi stiut nici macar atat.
       */
      await admin.from("trendyol_listings")
        .update({ sters_cerut_la: acum, sters_eroare: ster.error, updated_at: acum } as never)
        .eq("id", l.id);
      continue;
    }

    const idLot = ster.data?.batchRequestId;
    if (!idLot) {
      /* Fara id de lot n-avem ce urmari. Marfa e arhivata, deci nu se vinde; randul se uita. */
      await admin.from("trendyol_listings").delete().eq("id", l.id);
      cerute++;
      continue;
    }

    /* ⚠ `related_ids` poarta ID-UL LISTARII: la confirmare trebuie sa stim ce rand sa uitam. */
    const scris = await recordBatch(admin, ctx.businessId, idLot, "delete", [l.id]);
    await admin.from("trendyol_listings")
      .update({
        sters_cerut_la: acum,
        /* ⚠ Lotul primit dar nescris = rezultat NECUNOSCUT. Se noteaza si se reia. */
        sters_eroare: scris ? null : "Lotul de stergere n-a putut fi tinut minte; se reia.",
        updated_at: acum,
      } as never)
      .eq("id", l.id);
    cerute++;
  }
  return { cerute };
}

export async function removeProductNow(admin: Db, ctx: TrendyolSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  return scoateDeLaVanzare(admin, ctx, listing);
}
export async function removeByMainId(admin: Db, ctx: TrendyolSyncContext, mainId: string): Promise<SyncOutcome> {
  const listing = await getListingByMainId(admin, ctx.businessId, mainId);
  if (!listing) return { ok: true, action: "skipped" };
  /* Aceeasi cale, si din acelasi motiv: drumul din coada (produs sters din Edinio) trecea
     direct la stergerea randului, deci lasa produsul viu si vandabil la ei. */
  return scoateDeLaVanzare(admin, ctx, listing);
}

/**
 * ⚠ NUMAI CE ARATA A UUID. `related_ids` a purtat candva BARCODURI la loturile de stergere. Un
 * rand vechi ar trimite siruri ca „8595602540280" intr-un `.in("id", ...)`, iar Postgres refuza
 * tot lotul cu „invalid input syntax for type uuid" — o singura ramasita ar rupe sondarea
 * pentru toti.
 */
function eUuid(x: unknown): x is string {
  return typeof x === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

// ── Batch polling (cron) ────────────────────────────────────────────────────────
interface BatchRow {
  id: string; batch_request_id: string; kind: string; related_ids: unknown; attempts: number;
  /** ⚠ Pene ale LEGATURII, nu ale lotului. Vezi nota din `pollOpenBatches`. */
  poll_errors?: number | null;
}

/** Barcode-ul unui articol din raspunsul lotului, indiferent de forma. */
export function barcodeArticol(item: { requestItem?: { product?: { barcode?: string }; barcode?: string } }): string | null {
  const b = item.requestItem?.product?.barcode ?? item.requestItem?.barcode;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

/**
 * Lotul e chiar terminat?
 *
 * `getBatchResult` raspunde HTTP 200 si pentru un `batchRequestId` pe care
 * Trendyol nu-l mai cunoaste (peste patru ore le uita): plicul vine intreg, dar
 * cu TOATE campurile pe `null`. Citit ca „nu e FAILED, deci a mers", produsele
 * erau marcate „create pe Trendyol" fara sa fi ajuns vreodata acolo — si nimic
 * nu le mai reincerca, fiindca lotul se inchidea ca reusit.
 *
 * Deci: plic gol = necunoscut, nu terminat.
 */
export type StareLot = "gata" | "in_lucru" | "necunoscut";

export function stareLot(result: {
  status?: string | null; itemCount?: number | null; batchRequestType?: string | null;
  items?: { status?: string }[] | null;
} | null | undefined): StareLot {
  if (!result) return "necunoscut";
  const st = result.status ? String(result.status).toUpperCase() : null;
  const art = Array.isArray(result.items) ? result.items : [];
  /*
   * ⚠ „COMPLETED" POATE SOSI INAINTE CA ARTICOLELE SA FIE COMPLETATE.
   *
   * Probat in productie: la 5 secunde dupa trimitere, lotul raspundea
   * `status: "COMPLETED"` cu `items: []` si `failedItemCount: 0` — iar cateva
   * minute mai tarziu, ACELASI lot raporta `failedItemCount: 1` si articolul
   * `FAILED` cu „codul de bare exista deja".
   *
   * Citit ca terminal, primul raspuns inseamna „a mers": lotul se inchidea ca
   * reusit, iar barcodurile se marcau ca ajunse la Trendyol — cand de fapt
   * fusesera refuzate. Un produs putea aparea „creat" fara sa existe acolo.
   *
   * Deci un lot cu status terminal dar FARA articole raportate inca nu si-a spus
   * raspunsul. Exceptia e `itemCount === 0`: acolo chiar n-are ce raporta.
   */
  if (st === "COMPLETED" || st === "FAILED") {
    if (art.length === 0 && result.itemCount !== 0) return "in_lucru";
    return "gata";
  }
  if (st) return "in_lucru";

  /*
   * Fara `status`, plicul se judeca dupa continut.
   *
   * ⚠ Aici era cat pe ce sa opresc TOATE loturile: prima versiune trata orice
   * raspuns fara `status` drept „necunoscut", deci un lot care raporteaza
   * `itemCount` si articole terminale — dar caruia ii lipseste campul `status` —
   * s-ar fi reincercat de sase ori si apoi ar fi fost inchis ca esuat, desi
   * reusise. Pe loturile de stoc asta ar fi insemnat ca nicio impingere nu se
   * mai confirma vreodata.
   *
   * Plicul CU ADEVARAT gol — fara `itemCount`, fara `batchRequestType`, fara
   * articole — e altceva: asa raspunde Trendyol la un lot pe care nu-l mai
   * cunoaste (probat: identic cu un `batchRequestId` inventat). Acela e
   * „necunoscut", si NU are voie sa treaca drept succes.
   */
  const articole = Array.isArray(result.items) ? result.items : [];
  const areSubstanta = result.itemCount != null || result.batchRequestType != null || articole.length > 0;
  if (!areSubstanta) return "necunoscut";
  const inLucru = articole.some((it) => String(it?.status ?? "").toUpperCase() === "IN_PROGRESS");
  return inLucru ? "in_lucru" : "gata";
}

export async function pollOpenBatches(admin: Db, ctx: TrendyolSyncContext, limit = 20): Promise<void> {
  /* ⚠ O citire picata NU inseamna „niciun lot deschis": ar fi lasat loturi netratate fara
     nicio urma. Aruncarea iese din functie si e prinsa de cron, care o scrie. */
  const batches = randuriCitite<BatchRow>("trendyol.loturiDeschise", await admin
    .from("trendyol_batches")
    .select("id, batch_request_id, kind, related_ids, attempts, poll_errors")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    /* ⚠ Loturile pe care o pana le-a asezat deoparte nu se intreaba inca. */
    .or(`next_poll_at.is.null,next_poll_at.lte.${new Date().toISOString()}`)
    .order("submitted_at", { ascending: true })
    .limit(limit) as never);

  for (const [i, b] of batches.entries()) {
    /*
     * Ritm intre interogari.
     *
     * Douazeci de cereri una dupa alta, fara pauza, pe fiecare magazin: la
     * doisprezece magazine inseamna 240 de cereri intr-o rulare care are un
     * minut la dispozitie. Nu depaseste plafonul lor (masurat: 6,5% din cota de
     * citire), dar suprapune rularile intre ele, iar doua rulari suprapuse
     * reinteroga aceleasi loturi. O pauza scurta le desparte.
     */
    if (i > 0) await pause(120);
    const res = await getBatchResult(ctx.auth, b.batch_request_id);
    const now = new Date().toISOString();

    if (isTrendyolError(res)) {
      /*
       * ═══ ⚠ O PANA A LOR NU E UN LOT ESUAT (26.08.2026) ═══
       *
       * Forma dinainte crestea `attempts` la ORICE raspuns nereusit si, la a sasea, inchidea
       * lotul ca `failed`. Dar `isTrendyolError` prinde deopotriva un 429 si un raspuns
       * limpede al lor. Sase indisponibilitati la rand inchideau ca ESUAT un lot pe care
       * Trendyol putea sa-l fi procesat cu succes — iar comerciantul vedea produse pe
       * „eroare" fara sa fie nimic in neregula cu ele.
       *
       * ⚠ CONTOR SEPARAT, SI NICIODATA TERMINAL. `poll_errors` e despre LEGATURA cu ei, nu
       * despre lot: aseaza lotul deoparte pentru cateva minute si atat. Un lot acceptat de ei
       * se inchide „failed" numai dupa un raspuns VALID care spune asta.
       */
      if (eTrecatoare(res.status)) {
        const pene = (b.poll_errors ?? 0) + 1;
        await admin.from("trendyol_batches").update({
          poll_errors: pene,
          polled_at: now,
          /* Asteptare crescatoare, plafonata la un sfert de ora. */
          next_poll_at: new Date(Date.now() + Math.min(pene, 5) * 3 * 60_000).toISOString(),
        } as never).eq("id", b.id);
        continue;
      }

      /* Un raspuns limpede al lor CHIAR spune ceva despre lot: aici contorul vechi are rost. */
      await admin.from("trendyol_batches")
        .update({ attempts: b.attempts + 1, polled_at: now, status: b.attempts + 1 >= 6 ? "failed" : "retry" } as never)
        .eq("id", b.id);
      continue;
    }

    /* ⚠ Legatura merge: contorul de pene se pune la zero, altfel cinci pene rare de-a lungul
       unei luni ar fi asezat lotul deoparte pentru un sfert de ora degeaba. */
    if ((b.poll_errors ?? 0) > 0) {
      await admin.from("trendyol_batches")
        .update({ poll_errors: 0, next_poll_at: null } as never).eq("id", b.id);
    }
    const result = res.data;
    const stare = stareLot(result);
    if (stare !== "gata") {
      const attempts = b.attempts + 1;
      /*
       * Un lot pe care Trendyol nu-l mai recunoaste nu se reincearca la infinit:
       * dupa sase treceri il inchidem ca esuat, cu motiv explicit, si produsele
       * lui raman pe „pending" — de unde reconcilierea le poate ridica daca
       * totusi au ajuns acolo. Inchis ca „reusit", cum se intampla inainte, nu
       * le-ar mai fi reincercat nimeni niciodata.
       */
      const epuizat = stare === "necunoscut" && attempts >= 6;
      await admin.from("trendyol_batches").update({
        attempts, polled_at: now,
        ...(epuizat
          ? { status: "failed", result_summary: { status: null, errors: ["Trendyol nu mai recunoaște acest lot."] } as never }
          : {}),
      } as never).eq("id", b.id);
      continue;
    }

    const items = result?.items ?? [];
    const esuate = items.filter((it) => String(it.status).toUpperCase() !== "SUCCESS");
    const errors = esuate.flatMap((it) => it.failureReasons ?? []);
    const hardFail = (result?.failedItemCount ?? 0) > 0 || esuate.length > 0 || String(result?.status).toUpperCase() === "FAILED";

    // Only product batches reflect onto the listing status; inventory batches settle.
    if (b.kind === "product") {
      const mainIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      /*
       * ESECUL SE LEAGA DE ARTICOL, NU DE LOT.
       *
       * Un lot poate purta pana la 200 de articole, si Trendyol spune pentru
       * FIECARE daca a trecut. Marcate toate `error` din cauza unuia, 199 de
       * produse perfect valide ramaneau blocate — iar `error` opreste si
       * impingerea de stoc, deci ramaneau si inghetate pe Trendyol, unde chiar
       * fusesera create.
       *
       * Legatura se face pe barcode: din el aflam listarea, din listare produsul.
       */
      const motivePeListare = new Map<string, string[]>();
      // Cate articole esuate NU s-au putut lega de o listare. Fiecare dintre ele
      // e o eroare care ar disparea daca ne-am bizui doar pe legaturi.
      let esuateNelegate = 0;
      const barcoduriEsuate = esuate.map(barcodeArticol).filter((x): x is string => x !== null);
      const listarePeBarcode = new Map<string, string>();
      if (barcoduriEsuate.length > 0) {
        const { data: randuri } = await admin.from("trendyol_variants")
          .select("barcode, listing_id").eq("business_id", ctx.businessId).in("barcode", barcoduriEsuate.slice(0, 400));
        for (const r of randuri ?? []) {
          listarePeBarcode.set((r as { barcode: string }).barcode, (r as { listing_id: string }).listing_id);
        }
      }
      for (const it of esuate) {
        const bc = barcodeArticol(it);
        const lid = bc ? listarePeBarcode.get(bc) : undefined;
        if (!lid) { esuateNelegate++; continue; }
        const motive = motivePeListare.get(lid) ?? [];
        // `failureReasons` poate fi gol: articolul tot a esuat, iar listarea lui
        // trebuie sa ramana marcata, cu un motiv generic.
        motive.push(...(it.failureReasons?.length ? it.failureReasons : ["Articol respins de Trendyol, fără motiv comunicat."]));
        motivePeListare.set(lid, motive);
      }
      /*
       * ⚠ UN ESEC NELEGAT NU ARE VOIE SA DISPARA.
       *
       * Legarea pe articol e o imbunatatire doar cat timp acopera TOT ce a
       * esuat. Un articol picat al carui barcode nu duce la nicio listare —
       * raspuns fara `requestItem`, sau varianta resalvata intre timp cu alt
       * barcode — ar fi lasat produsul lui sa iasa „created", adica raportat ca
       * listat desi Trendyol l-a refuzat. Mai bine o eroare pe tot lotul decat
       * o eroare pierduta.
       */
      const peLot = hardFail && (motivePeListare.size === 0 || esuateNelegate > 0);

      for (const mid of mainIds) {
        const listing = await getListingByMainId(admin, ctx.businessId, mid);
        if (!listing) continue;
        const aleLui = motivePeListare.get(listing.id);
        const motiveleLui = (aleLui && aleLui.length > 0) ? aleLui : (peLot ? errors : null);
        if (motiveleLui) {
          /*
           * Inainte de a scrie „eroare", intrebam daca produsul nu cumva EXISTA
           * deja la ei. Cel mai des motiv de refuz la creare e chiar asta, iar
           * el nu e o eroare de reparat, ci o listare de adoptat.
           */
          const adoptat = await incearcaAdoptarea(admin, ctx, listing, motiveleLui);
          if (!adoptat) {
            await setListingStatus(admin, listing.id, "error", {
              error: motiveleLui.slice(0, 5).join("; ").slice(0, 500) || "Eroare la procesarea pe Trendyol.",
            });
          }
        } else if (listing.status === "pending") {
          // Accepted; exists on Trendyol pending approval. `creat_de_edinio`
          // retine ca produsul de acolo e al NOSTRU: un refuz ulterior de tipul
          // „codul exista deja" e atunci propriul nostru produs, nu unul strain.
          await setListingStatus(admin, listing.id, "created", { error: null, creat_de_edinio: true });
        }
        /*
         * Barcodurile acceptate se marcheaza, ca o varianta adaugata mai tarziu
         * sa poata fi deosebita de cele deja existente si sa plece pe creare.
         */
        if (!motiveleLui) {
          await admin.from("trendyol_variants").update({ exista_la_ei: true } as never)
            .eq("listing_id", listing.id);
        }
      }
    } else if (b.kind === "update") {
      /*
       * Lotul de ACTUALIZARE se trateaza separat, nu ca unul de creare.
       *
       * ⚠ Trecut prin ramura de creare, un esec de actualizare ar fi chemat
       * `incearcaAdoptarea`, care gaseste produsul (evident, exista — tocmai de
       * aia il actualizam), ii pune statusul pe „aprobat" si ii STERGE eroarea.
       * Adica repararea care a picat ar fi aratat ca reusita.
       *
       * Aici: esecul se scrie, reusita nu atinge statusul — starea adevarata o
       * spune reconcilierea, dupa ce Trendyol reia revizuirea.
       */
      const mainIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      for (const mid of mainIds) {
        const listing = await getListingByMainId(admin, ctx.businessId, mid);
        if (!listing) continue;
        if (hardFail) {
          /*
           * ⚠ Esecul de ACTUALIZARE se scrie in `issues`, nu in `error`.
           *
           * `error` e teritoriul reconcilierilor: `reconcileStatuses` il pune pe
           * `null` cand produsul apare aprobat, iar `reconcileRejections` cand
           * nu mai e respins. Amandoua ruleaza in ACEEASI trecere de cron care
           * tocmai a scris esecul — deci mesajul disparea in aceeasi rulare, si
           * comerciantul credea ca reparatia lui a mers.
           */
          const motiv = errors.length
            ? errors.slice(0, 3).join("; ")
            : "Trendyol nu a comunicat un motiv.";
          await admin.from("trendyol_listings").update({
            issues: [{ tip: "actualizare", mesaj: motiv.slice(0, 500) }] as never,
            updated_at: new Date().toISOString(),
          } as never).eq("id", listing.id);

          /*
           * ═══ ⚠ „NU EXISTA LA EI" TREBUIE SA STINGA STEAGUL CARE SPUNE CA EXISTA (26.08.2026) ═══
           *
           * Masurat pe un cont real: 14 listari stateau in `created` din 19 august, deci de o
           * saptamana, iar `issues` purta chiar raspunsul lor:
           *
           *     „Produsul nu a fost găsit cu ID-ul furnizorului 1182665 și codul de bare 139231."
           *
           * Verificat direct pe API-ul lor: barcodurile alea chiar NU exista in catalog. Iar la
           * noi, `trendyol_variants.exista_la_ei` era `true` pe toate.
           *
           * ⚠ SI DE-AIA NU SE REPARA NICIODATA SINGUR. `barcoduriDejaLaEi` porneste de la steagul
           * ala; cu el aprins, `deCreat` iese GOL si tot produsul pleaca pe calea de ACTUALIZARE.
           * Ei raspund „nu exista", noi scriem raspunsul in `issues`, si mergem mai departe — la
           * urmatoarea trecere, exact la fel. O minciuna care se autointretine: chiar mesajul
           * care dovedeste lipsa nu atingea steagul care impiedica recrearea.
           *
           * ⚠ SE STINGE NUMAI PE ACEST MESAJ, nu pe orice esec. Un refuz de continut, o imagine
           * respinsa, un atribut lipsa — toate inseamna ca produsul CHIAR e acolo, si stins
           * steagul, l-am fi trimis pe calea de creare, unde ei raspund „codul de bare exista
           * deja". Ar fi fost celalalt fel de bucla.
           */
          if (/nu a fost g[ăa]sit|not found/i.test(motiv)) {
            await admin.from("trendyol_variants")
              .update({ exista_la_ei: false } as never)
              .eq("listing_id", listing.id);
            /*
             * ⚠ SI SE REPUNE LA COADA, altfel stinsul steagului n-ar folosi la nimic.
             *
             * Nimic nu reia o listare dupa un esec de actualizare — nici coada, nici
             * reconcilierea. Steagul stins si atat, produsul ar fi ramas tot in `created`, doar
             * cu o piedica in minus. Reparatia trebuie sa ajunga pana la capat singura, altfel e
             * o jumatate de reparatie care arata ca una intreaga.
             *
             * ⚠ `attempts: 0`: e o lucrare NOUA, nu continuarea celei care a esuat. Trimisa cu
             * datoria veche, ar fi fost abandonata dupa una-doua treceri.
             */
            if (listing.product_id) {
              await admin.from("trendyol_sync_queue").upsert({
                business_id: ctx.businessId,
                product_id: listing.product_id,
                offer_id: listing.product_id,
                op: "upsert",
                attempts: 0,
                last_error: null,
                next_retry_at: null,
                abandonat_la: null,
              } as never, { onConflict: "business_id,offer_id,op" });
            }

            await logError({
              action: "trendyol/actualizare",
              message: "produsul nu exista la ei; steagul s-a stins si s-a repus la coada pentru CREARE",
              details: { listingId: listing.id, motiv: motiv.slice(0, 200) },
              businessId: ctx.businessId, severity: "warning",
            });
          }
        } else {
          // Reusita sterge urma esecului anterior si confirma barcodurile.
          await admin.from("trendyol_listings").update({ issues: [] as never } as never).eq("id", listing.id);
          await admin.from("trendyol_variants").update({ exista_la_ei: true } as never).eq("listing_id", listing.id);
        }
      }
    } else if (b.kind === "inventory" && !hardFail) {
      // Lotul de stoc a trecut: contorul de reluari se sterge, ca produsul sa
      // nu ramana cu o datorie veche care sa-l blocheze la urmatoarea problema.
      await reseteazaReluarileDeStoc(admin, ctx, Array.isArray(b.related_ids) ? (b.related_ids as string[]) : []);
    } else if (b.kind === "archive") {
      /*
       * ═══ ⚠ CEASUL CELOR 24 DE ORE PORNESTE DE AICI, NU DE LA TRIMITERE (26.08.2026) ═══
       *
       * Ei cer ca un produs aprobat sa fi stat arhivat peste o zi inainte de stergere. Daca am
       * fi pornit ceasul cand am TRIMIS arhivarea, l-am fi pornit de la ceva care poate n-a avut
       * loc: arhivarea e un lot, iar loturile pica la ei des.
       *
       * ⚠ La esec, `arhivat_la` ramane gol — deci stergerea nu pleaca niciodata, si randul sta
       * pe `removing` cu motivul scris. Vizibil si nereparat e mult mai bine decat sters si uitat.
       */
      const listariArhivate = (Array.isArray(b.related_ids) ? b.related_ids : []).filter(eUuid);
      if (listariArhivate.length > 0) {
        if (hardFail) {
          /*
           * ═══ ⚠ RETRAGEREA MUREA AICI, IN TACERE (26.08.2026) ═══
           *
           * Singura urma era coloana `sters_eroare`, pe care n-o citeste nimeni. Iar
           * `stergeCePoateFiSters` filtreaza pe `arhivat_la is not null` — care ramane gol la
           * esec — deci randul nu era ales NICIODATA. Elementul de coada fusese deja consumat
           * (`scoateDeLaVanzare` intoarce `ok: true`), deci nimic nu relua arhivarea.
           *
           * Rezultat: produsul ramanea la vanzare pe Trendyol, cu stocul vechi, la nesfarsit;
           * la noi randul statea pe `removing` pe veci; in jurnal nu aparea nimic. Iar daca
           * produsul fusese sters din Edinio, nu mai exista nici macar un buton de apasat.
           *
           * ⚠ SE SCRIE SI SE REPUNE LA COADA. Arhivarea e idempotenta la ei — arhivarea a ceva
           * deja arhivat nu strica — deci reincercarea e sigura.
           */
          const motivArh = errors.slice(0, 2).join("; ") || "Trendyol nu a comunicat un motiv.";
          await admin.from("trendyol_listings").update({
            sters_eroare: `Arhivarea a esuat la ei: ${motivArh}`,
            updated_at: now,
          } as never).eq("business_id", ctx.businessId).in("id", listariArhivate);

          await logError({
            action: "trendyol/stergere",
            message: `arhivarea a esuat la ei; produsul RAMANE la vanzare pana se reia: ${motivArh}`,
            details: { batchRequestId: b.batch_request_id, listari: listariArhivate.slice(0, 20) },
            businessId: ctx.businessId, severity: "critical",
          });

          /* ⚠ Se repune la coada pe `delete`, adica pe drumul care reia intreaga retragere:
             zeroizare, arhivare, si apoi stergerea amanata. */
          const deReluat = randuriCitite<{ id: string; product_id: string | null }>(
            "trendyol.listariDeReluat", await admin
              .from("trendyol_listings").select("id, product_id")
              .eq("business_id", ctx.businessId).in("id", listariArhivate) as never);
          const randuriCoada = deReluat
            .filter((l) => l.product_id)
            .map((l) => ({
              business_id: ctx.businessId, product_id: l.product_id, offer_id: l.product_id as string,
              op: "delete", attempts: 0, last_error: null, next_retry_at: null, abandonat_la: null,
            }));
          if (randuriCoada.length > 0) {
            await admin.from("trendyol_sync_queue")
              .upsert(randuriCoada as never, { onConflict: "business_id,offer_id,op" });
          }
        } else {
          /* ⚠ NUMAI PE RANDURI CARE CHIAR SUNT IN RETRAGERE. A doua centura: un lot etichetat
             gresit „archive" n-ar putea porni ceasul de stergere pe un produs viu. */
          await admin.from("trendyol_listings").update({
            arhivat_la: now, sters_eroare: null, updated_at: now,
          } as never)
            .eq("business_id", ctx.businessId).eq("status", "removing").in("id", listariArhivate);
        }
      }
    } else if (b.kind === "delete") {
      /*
       * ⚠ LISTAREA SE UITA NUMAI LA O STERGERE CONFIRMATA (26.08.2026).
       *
       * Forma dinainte o uita SI la esec, cu argumentul „produsul e oricum arhivat si pe stoc
       * zero". Dar nici arhivarea, nici zeroizarea nu fusesera confirmate atunci — erau tot
       * loturi doar primite. Deci argumentul se sprijinea pe doua presupuneri, iar pretul
       * greselii era sa pierdem orice urma a unui produs inca vandabil.
       *
       * ⚠ ACUM: la esec randul RAMANE pe `removing`, cu motivul scris, si se reincearca. Ei cer
       * o zi de arhiva inainte de stergere, iar refuzul cel mai probabil e chiar „prea devreme"
       * — un refuz care trece de la sine.
       */
      const listariDeUitat = (Array.isArray(b.related_ids) ? b.related_ids : []).filter(eUuid);
      if (listariDeUitat.length === 0) {
        await logError({
          action: "trendyol/stergere",
          message: "lotul de stergere n-are id-uri de listare, deci nu se stie ce rand sa se uite",
          details: { batchRequestId: b.batch_request_id },
          businessId: ctx.businessId, severity: "warning",
        });
      } else if (hardFail) {
        await logError({
          action: "trendyol/stergere",
          message: `lotul de stergere a esuat; produsul ramane arhivat si marcat pentru retragere: ${errors.slice(0, 2).join("; ")}`,
          details: { batchRequestId: b.batch_request_id, listari: listariDeUitat.slice(0, 20) },
          businessId: ctx.businessId, severity: "warning",
        });
        await admin.from("trendyol_listings").update({
          sters_eroare: errors.slice(0, 2).join("; ") || "Stergerea a fost refuzata la ei.",
          updated_at: now,
        } as never).eq("business_id", ctx.businessId).in("id", listariDeUitat);
      } else {
        await admin.from("trendyol_listings")
          .delete().eq("business_id", ctx.businessId).in("id", listariDeUitat);
      }
    } else if (b.kind === "inventory" && hardFail) {
      /*
       * Esecul unui lot de stoc nu mai dispare in tacere.
       *
       * Nu atingea nimic si nu scria nicaieri: stocul ramanea pe Trendyol cu
       * valoarea veche, la nesfarsit, iar comerciantul vindea ce nu mai avea.
       * Acum se scrie in log, iar produsele lui se repun la coada — impingerea
       * de stoc e ieftina si idempotenta, deci reincercarea nu strica nimic.
       */
      await jurnalLotEsuat(admin, ctx, b, errors);
    }
    await admin.from("trendyol_batches")
      .update({ status: hardFail ? "failed" : "completed", polled_at: now, result_summary: { status: result?.status ?? null, errors: errors.slice(0, 10) } as never })
      .eq("id", b.id);
  }
}

/**
 * Produsul exista deja in contul lor? Atunci il ADOPTAM, nu-l lasam pe eroare.
 *
 * ⚠ De ce e nevoie: comerciantii isi listeaza produse pe Trendyol si altfel
 * decat prin Edinio — manual din panoul lor, sau cu un tool anterior. Trendyol
 * refuza corect sa CREEZE un produs cu un cod de bare pe care contul il are
 * deja, iar noi n-aveam alta cale in afara de creare. Listarea ramanea blocata
 * pe `error` la nesfarsit, oricate reincercari, iar comenzile de pe acel produs
 * nu se legau de nimic. Masurat live: 2 din 4 produse trimise.
 *
 * Verificarea NU se face pe textul erorii — documentatia lor interzice explicit
 * potrivirea pe mesaj, iar textul e localizat. Se intreaba serviciul de stare pe
 * barcode: 404 cu `product.not.found` inseamna „nu exista", 200 inseamna
 * „exista", plus `approved`, `archived` si `contentId`.
 *
 * Ce NU face: nu-i atinge pretul si stocul. Un produs listat pe alta cale are
 * valorile puse de comerciant acolo, si nu le suprascriem fara sa ceara —
 * `auto_inventory` ramane fals, iar impingerea manuala merge oricand.
 */
async function incearcaAdoptarea(
  admin: Db, ctx: TrendyolSyncContext, listing: ListingRow, motive: string[],
): Promise<boolean> {
  const { data: variante } = await admin.from("trendyol_variants")
    .select("barcode").eq("listing_id", listing.id).eq("enabled", true).limit(1);
  const barcode = (variante ?? [])[0] ? (variante![0] as { barcode: string }).barcode : null;
  if (!barcode) return false;

  const res = await getProductBaseInfo(ctx.auth, barcode);
  if (isTrendyolError(res)) return false;      // 404 „product.not.found" sau retea: eroarea ramane eroare
  const info = res.data;
  if (!info || info.approved == null) return false;

  /*
   * Arhivat inseamna „in cont, dar nu se vinde". Comerciantul care publica din
   * Edinio vrea exact opusul, deci il scoatem din arhiva. Daca apelul pica, tot
   * adoptam — dar spunem in log de ce produsul nu se vede inca la ei.
   */
  if (info.archived === true) {
    const dez = await setArchiveState(ctx.auth, [{ barcode, archived: false }]);
    if (isTrendyolError(dez)) {
      /* ⚠ In jurnal, nu in consola: un `console.warn` nu ajunge nicaieri unde se uita cineva. */
      await logError({
        action: "trendyol/adoptare",
        message: `produs adoptat dar NEDEZARHIVAT, deci nu se vede inca la ei: ${dez.error}`,
        details: { barcode, listingId: listing.id },
        businessId: ctx.businessId, severity: "warning",
      });
    } else {
      const batchRequestId = dez.data?.batchRequestId;
      /*
       * ⚠ FEL PROPRIU, NU „archive" (26.08.2026).
       *
       * Asta e o DEZarhivare — opusul. Inregistrata sub acelasi fel ca arhivarea de la
       * retragere, sondarea ar fi citit-o drept „s-a arhivat" si ar fi pornit ceasul de 25 de
       * ore dupa care produsul se STERGE. Adica exact produsul pe care comerciantul tocmai
       * l-a publicat.
       *
       * Azi n-ar fi lovit, si numai din noroc: purta `product_main_id`, care nu se potriveste
       * cu niciun `id` de listare. Norocul ala tine pana cand cineva „indreapta" id-ul.
       */
      if (batchRequestId) {
        const scris = await recordBatch(admin, ctx.businessId, batchRequestId, "dezarhivare", [listing.id]);
        if (!scris) {
          /* ⚠ Adoptarea merge mai departe — produsul e al lui si trebuie legat — dar se scrie ca
             dezarhivarea ramane necunoscuta, altfel el s-ar mira de ce nu se vede la ei. */
          await logError({
            action: "trendyol/adoptare",
            message: "dezarhivarea a fost primita de Trendyol dar nu s-a putut tine minte; produsul poate ramane invizibil la ei",
            details: { barcode, listingId: listing.id },
            businessId: ctx.businessId, severity: "warning",
          });
        }
      }
    }
  }

  /*
   * ⚠ „Codul de bare exista deja" NU inseamna mereu „produs strain".
   *
   * E adevarat si pentru un produs pe care tot noi l-am creat cu cinci minute
   * inainte: comerciantul apasa „Reincearca" pe o listare de-a noastra si
   * Trendyol raspunde exact la fel. Tratata ca listare straina, i se oprea
   * sincronizarea de stoc si aparea „Preluat" — vazut in productie pe un produs
   * respins la revizuie si reincercat de comerciant.
   *
   * Deci stocul se opreste doar cand produsul chiar NU e al nostru.
   */
  /*
   * ⚠ PROPRIETATEA NU SE CITESTE DINTR-O COLOANA CARE SE POATE PIERDE.
   *
   * `creat_de_edinio` sta pe listare, iar listarea se poate sterge si recrea —
   * comerciantul apasa „Elimină" si retrimite. Randul nou porneste cu `false`,
   * iar refuzul „codul de bare exista deja" devine atunci indistinctibil de un
   * produs strain: il adoptam, ii oprim stocul, si — mai rau — nu-l mai putem
   * repara, fiindca listarile adoptate nu se mai rescriu.
   *
   * Vazut in productie: un produs creat de noi, sters si retrimis, a ajuns
   * marcat „Preluat" cu doua loturi de creare REUSITE in istoricul lui.
   *
   * Loturile nu se sterg odata cu listarea, deci ele sunt dovada care rezista.
   *
   * ⚠ `related_ids` e jsonb: `.contains()` PRIMESTE UN SIR JSON, nu un vector.
   * Probat prin clientul real — cu `JSON.stringify([id])` intoarce 2, cu vectorul
   * brut arunca eroare. Vezi [[proba-prin-clientul-real]].
   */
  const { count: loturiProprii } = await admin
    .from("trendyol_batches")
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).eq("kind", "product").eq("status", "completed")
    .contains("related_ids", JSON.stringify([listing.product_main_id]));
  const alNostru = listing.creat_de_edinio === true || (loturiProprii ?? 0) > 0;
  await setListingStatus(admin, listing.id, info.approved ? "approved" : "created", {
    error: null,
    // Proprietatea redescoperita din loturi se scrie inapoi pe listare.
    ...(alNostru ? { creat_de_edinio: true } : { auto_inventory: false }),
    ty_content_id: info.contentId ?? null,
    last_synced_at: new Date().toISOString(),
  });
  console.warn(
    `[trendyol] listare ADOPTATA (${barcode}): produsul exista deja in contul lor` +
    `${info.archived === true ? ", era arhivat si l-am scos din arhiva" : ""}. ` +
    `Stocul si pretul NU se impinge automat. Refuzul la creare a fost: ${motive.slice(0, 2).join("; ")}`,
  );
  return true;
}

async function jurnalLotEsuat(admin: Db, ctx: TrendyolSyncContext, b: BatchRow, errors: string[]): Promise<void> {
  const mainIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
  console.warn(
    `[trendyol] lot de stoc esuat ${b.batch_request_id} (${mainIds.length} produse): ${errors.slice(0, 3).join("; ")}`,
  );
  if (mainIds.length === 0) return;
  /* ⚠ Goala, inseamna „n-am ce repune la coada" — si un lot de stoc esuat ramane esuat. */
  const randuriListari = randuriCitite<{ id: string; product_id: string | null; inventory_retries: number | null }>(
    "trendyol.listariLotEsuat", await admin.from("trendyol_listings")
      .select("id, product_id, inventory_retries")
      .eq("business_id", ctx.businessId).in("product_main_id", mainIds.slice(0, 200)) as never);
  if (randuriListari.length === 0) return;

  /*
   * ⚠ REPUNEREA LA COADA E MARGINITA, IAR CONTORUL STA PE LISTARE.
   *
   * Prima incercare de a margini bucla tinea contorul in `trendyol_sync_queue`
   * si NU functiona deloc: randul de acolo se sterge in clipa in care Trendyol
   * raspunde 200 la impingere — dar 200 inseamna doar „primit", nu „aplicat".
   * Esecul apare abia in lot, cand randul nu mai exista, deci contorul se citea
   * mereu ca zero si plafonul nu se atingea niciodata. Bucla ramanea infinita:
   * impinge, esueaza, repune, impinge — doua apeluri pe minut pentru fiecare
   * produs otravit, fara niciun semn, pana cand coada magazinului nu mai avea
   * loc de listari noi.
   *
   * Pe listare, contorul supravietuieste ciclului. Se pune la zero cand un lot
   * de stoc chiar reuseste (vezi `reseteazaReluarileDeStoc`).
   */
  const motiv = errors.slice(0, 2).join("; ").slice(0, 500) || "Lot de stoc eșuat pe Trendyol.";
  const deRepus = listariDeRepus(randuriListari);
  const abandonate = randuriListari.length - deRepus.length;
  if (abandonate > 0) {
    console.warn(
      `[trendyol] ${abandonate} produse nu se mai repun la coada de stoc: cele ${MAX_REPUNERI_STOC} reluari s-au epuizat. Motiv: ${motiv}`,
    );

    /*
     * ═══ ⚠ SI SE SCRIE PE LISTARE, NU DOAR IN CONSOLA (24.08.2026) ═══
     *
     * Plafonul isi facea treaba: masurat pe contul real, 23 de listari stateau fix la
     * `inventory_retries = 3` si nu se mai repuneau. Bine — bucla e oprita.
     *
     * ⚠ DAR TOATE 23 aveau `status: 'approved'`, `error: null` si `issues: []`. Adica
     * arata perfect sanatoase pe ecran, iar de fapt nu mai primeau NICIODATA nici pret,
     * nici stoc. Printre ele „Royal Canin Feline Health Nutrition Kitten 10 kg" — produse
     * adevarate, pe care omul crede ca le vinde la zi.
     *
     * Motivele venite de la ei sunt limpezi si actionabile: „Prețul și stocul produselor
     * închise pentru vânzare nu pot fi actualizate", „...produsului arhivat...", „Produsul
     * nu a fost găsit cu ID-ul furnizorului". Toate trei se rezolva in panoul Trendyol.
     *
     * Un plafon fara urma e o tacere, nu o reparatie. `error` NU se atinge: acolo umbla
     * reconcilierile, iar mesajul ar fi disparut in aceeasi trecere de cron. `issues`
     * supravietuieste.
     */
    const abandonateAcum = randuriListari.filter((l) => !deRepus.some((d) => d.id === l.id));
    for (const l of abandonateAcum) {
      await admin.from("trendyol_listings").update({
        issues: [{
          tip: "stoc-oprit",
          mesaj: `Trendyol a refuzat de ${MAX_REPUNERI_STOC} ori prețul și stocul, deci nu se mai încearcă. `
            + `Produsul nu mai primește actualizări până nu rezolvi asta în panoul Trendyol. ${motiv}`.slice(0, 500),
        }] as never,
        updated_at: new Date().toISOString(),
      } as never).eq("id", l.id);
    }
  }
  if (deRepus.length === 0) return;

  for (const l of deRepus) {
    await admin.from("trendyol_listings")
      .update({ inventory_retries: (l.inventory_retries ?? 0) + 1 } as never)
      .eq("id", l.id);
  }
  await admin.from("trendyol_sync_queue").upsert(
    deRepus.map((l) => ({
      business_id: ctx.businessId, product_id: l.product_id, offer_id: l.product_id as string,
      op: "inventory", attempts: 0, last_error: motiv,
    })) as never,
    { onConflict: "business_id,offer_id,op" },
  );
}

/** Un lot de stoc reusit sterge datoria: produsul poate fi reincercat din nou, oricand. */
async function reseteazaReluarileDeStoc(admin: Db, ctx: TrendyolSyncContext, mainIds: string[]): Promise<void> {
  if (mainIds.length === 0) return;
  await admin.from("trendyol_listings")
    .update({ inventory_retries: 0 } as never)
    .eq("business_id", ctx.businessId).in("product_main_id", mainIds.slice(0, 200))
    .gt("inventory_retries", 0);
}

/** Cate reluari acceptam pentru un produs al carui lot de stoc pica. */
export const MAX_REPUNERI_STOC = 3;

/**
 * Care listari se mai repun la coada dupa un lot de stoc esuat.
 *
 * Sta separat, ca sa poata fi PROBATA. Prima incercare de a margini bucla
 * traia in mijlocul unei functii care vorbeste cu baza de date, si tocmai de
 * aceea n-a fost prinsa: contorul se citea din randul de coada, care e sters la
 * trimitere, deci era mereu zero si plafonul nu se atingea niciodata.
 */
export function listariDeRepus<T extends { product_id: string | null; inventory_retries: number | null }>(
  listari: T[],
): T[] {
  return listari.filter((l) => l.product_id && (l.inventory_retries ?? 0) < MAX_REPUNERI_STOC);
}

// ── Reconcile (cron): approved products -> mark listings approved ───────────────
/**
 * Aduce produsele aprobate si ridica statusul listarilor care le corespund.
 *
 * Paginarea porneste de unde a ramas trecerea anterioara, nu de la zero.
 * Plafonul de cinci pagini insemna 500 de produse dintr-un catalog de 1033: pe
 * cele de dupa pagina a cincea nu le vedea NICIODATA nicio rulare, oricat de
 * des ar fi rulat cronul, fiindca fiecare rulare relua exact aceleasi pagini.
 * Restul ramaneau „created" pe veci, desi pe Trendyol erau demult aprobate.
 */
/**
 * Cate listari se intreaba PE NUME intr-o trecere.
 *
 * ⚠ Fiecare e o cerere catre ei, din grupul „citire de produs". Douazeci ajunge ca o
 * publicare obisnuita sa se confirme in aceeasi trecere, si e departe de orice plafon.
 */
const INTREBARI_TINTITE = 20;

/**
 * Listarile care asteapta aprobarea se intreaba DIRECT, pe numele lor.
 *
 * ═══ ⚠ DE CE, CAND EXISTA DEJA SCANAREA PAGINATA ═══
 *
 * Scanarea citeste catalogul lor pagina cu pagina, cu un cursor care se roteste. E completa —
 * si aici auditul a spus mai mult decat era: nimic nu ramane „nevazut niciodata", fiindca
 * dupa ultima pagina cursorul se intoarce la zero. Dar e LENTA: la un vanzator cu sapte mii
 * de produse, cinci pagini pe trecere inseamna vreo paisprezece minute pana ajunge cursorul
 * la pagina care contine chiar produsul publicat acum.
 *
 * Iar intrebarea pe care o punem e mica: „a fost aprobat produsul ASTA?". Avem cel mult
 * cateva listari in asteptare, si `getApprovedProducts` primeste `productMainId`. Deci se
 * intreaba direct, si raspunsul vine in aceeasi trecere.
 *
 * ⚠ SCANAREA RAMANE. Ea prinde ce intrebarea tintita nu poate: produse aprobate la ei pe care
 * noi nici nu le avem in asteptare, si nepotriviri aparute din alta parte.
 */
async function confirmaTintit(
  admin: Db, ctx: TrendyolSyncContext, now: string,
): Promise<void> {
  const asteapta = randuriCitite<{ id: string; product_main_id: string }>(
    "trendyol.listariInAsteptare", await admin
      .from("trendyol_listings").select("id, product_main_id")
      .eq("business_id", ctx.businessId).in("status", ["pending", "created"])
      /* ⚠ Cele mai demult neverificate intai, ca sa nu ramana niciuna in urma. */
      .order("last_status_at", { ascending: true, nullsFirst: true })
      .limit(INTREBARI_TINTITE) as never);

  for (const l of asteapta) {
    if (!l.product_main_id) continue;
    const res = await getApprovedProducts(ctx.auth, { productMainId: l.product_main_id, size: 1 });
    /* ⚠ O eroare NU inseamna „nu e aprobat": se lasa pe seama scanarii, care vine oricum. */
    if (isTrendyolError(res)) continue;
    let gasit = (res.data?.content ?? []).length > 0;

    /*
     * ═══ ⚠ EI ISI SCHIMBA `productMainId`, SI ATUNCI NU-L MAI GASIM NICIODATA (26.08.2026) ═══
     *
     * Noi trimitem UUID-ul nostru ca `productMainId`. Cand ei leaga produsul de o fisa deja
     * existenta din catalogul LOR, il inlocuiesc cu al lor — `TYCA6CAF3173D9F507C6F9800`.
     *
     * ⚠ SI AMANDOUA CAILE POTRIVEAU PE EL: si intrebarea tintita de aici, si scanarea paginata
     * de mai jos. Deci un produs caruia i-au schimbat id-ul ramanea „in aprobare" la noi PENTRU
     * TOTDEAUNA, desi la ei se vindea.
     *
     * ⚠ MASURAT pe un cont real: din 76 de listari blocate in `created`, 11 aveau id-ul
     * schimbat de ei si erau aprobate; a 12-a chiar astepta aprobarea, si a ramas cum trebuie.
     *
     * ⚠ SI COSTA MAI MULT DECAT O ETICHETA GRESITA: plasa de deriva a stocului se uita numai la
     * `approved`/`active`. Blocate in `created`, produsele alea se vindeau la ei fara nicio
     * plasa — daca o trimitere de stoc pica tacut, nimic n-o prindea.
     *
     * ⚠ CODUL DE BARE E AL NOSTRU SI NU SE SCHIMBA. De-aia el e a doua intrebare.
     *
     * ⚠ NU SE SCRIE ID-UL LOR PESTE AL NOSTRU. `product_main_id` e cheie unica, tinta de
     * `onConflict` la salvare, si pleaca in fiecare publicare — schimbat aici, ar fi rescris
     * inapoi la prima salvare din editor si ar fi bulversat publicarea. Se raspunde doar la
     * intrebarea „e aprobat?", care e tot ce ne trebuie.
     */
    if (!gasit) {
      const bc = randCitit<{ barcode: string }>("trendyol.barcodePentruConfirmare", await admin
        .from("trendyol_variants").select("barcode")
        .eq("listing_id", l.id).eq("enabled", true)
        .not("barcode", "is", null).limit(1).maybeSingle() as never);
      if (bc?.barcode) {
        const dupaBarcode = await getProductBaseInfo(ctx.auth, bc.barcode);
        /* ⚠ Tot o eroare nu inseamna „nu e aprobat". Si nici `archived` nu inseamna aprobat. */
        if (!isTrendyolError(dupaBarcode)
          && dupaBarcode.data?.approved === true
          && dupaBarcode.data?.archived !== true) {
          gasit = true;
        }
      }
    }

    /*
     * ═══ ⚠ MARCAJUL SE SCRIE SI CAND NU S-A GASIT (indreptat in aceeasi ora) ═══
     *
     * Prima forma scria `last_status_at` NUMAI la aprobare. Dar lista se cere ordonata dupa
     * chiar campul asta, cu nulurile intai — deci cele NEAPROBATE ramaneau cu `null` si erau
     * alese din nou la fiecare trecere, iar restul nu ajungeau NICIODATA la rand.
     *
     * ⚠ Masurat: un magazin are 97 de listari in asteptare si se intreaba 20 pe trecere. Cu
     * marcajul scris doar la reusita, aceleasi 20 s-ar fi intrebat la nesfarsit, iar celelalte
     * 77 n-ar fi fost verificate niciodata pe calea tintita. Infometare — si ar fi aratat ca
     * merge, fiindca primele 20 chiar se confirmau.
     */
    await admin.from("trendyol_listings")
      .update({
        ...(gasit ? { status: "approved", error: null } : {}),
        last_status_at: now,
        updated_at: now,
      } as never)
      .eq("id", l.id);
    await pause(120);
  }
}

export async function reconcileStatuses(
  admin: Db, ctx: TrendyolSyncContext, maxPages = 5,
): Promise<void> {
  /* ⚠ Intai cele in asteptare, pe nume: o publicare se confirma in aceeasi trecere, nu peste
     un sfert de ora. Vezi `confirmaTintit`. */
  await confirmaTintit(admin, ctx, new Date().toISOString());

  const approvedMainIds = new Set<string>();
  const start = Math.max(0, Number(ctx.config.reconcile_page ?? 0) || 0);
  let page = start;
  let totalPages = start + 1;
  let citite = 0;

  for (; citite < maxPages; citite++, page++) {
    const res = await getApprovedProducts(ctx.auth, { page, size: 100 });
    if (isTrendyolError(res)) {
      /*
       * ⚠ CURSORUL NU ARE VOIE SA RAMANA INFIPT INTR-O PAGINA CARE CADE.
       *
       * Inainte, reconcilierea relua mereu de la zero, deci o pagina cu
       * probleme nu bloca nimic. Cu un cursor persistent, un 400 la pagina 100
       * (catalogul s-a micsorat, plafon depasit) ar fi oprit reconcilierea
       * magazinului PENTRU TOTDEAUNA: aceeasi pagina, aceeasi eroare, la
       * fiecare rulare. O eroare trecatoare (429, 5xx) pastreaza cursorul si se
       * reia; una permanenta il duce inapoi la inceput.
       */
      if (!eTrecatoare(res.status)) page = -1;
      break;
    }
    const content = res.data?.content ?? [];
    totalPages = Math.max(1, Number(res.data?.totalPages ?? 1));
    for (const p of content) if (p.productMainId) approvedMainIds.add(p.productMainId);
    if (content.length === 0 || page + 1 >= totalPages) { page = -1; break; }
    await pause(250);
  }
  // `page = -1` de mai sus inseamna „am ajuns la capat": tura urmatoare reia de
  // la inceput, ca sa prinda si produsele aprobate intre timp.
  const urmatoarea = page < 0 || page >= totalPages ? 0 : page;
  await salveazaPaginaReconciliere(admin, ctx, urmatoarea);

  if (approvedMainIds.size === 0) return;
  const now = new Date().toISOString();
  // Mark listings that appear in the approved set (and are not already approved).
  /* ⚠ O citire picata nu inseamna „nicio listare in asteptare": ar fi lasat produsele
     aprobate marcate „in aprobare" pana la trecerea urmatoare, fara nicio urma de ce. */
  const listings = randuriCitite<{ id: string; product_main_id: string; status: string }>(
    "trendyol.listariDeConfirmat", await admin
      .from("trendyol_listings").select("id, product_main_id, status")
      .eq("business_id", ctx.businessId).in("status", ["pending", "created"]) as never);
  for (const l of listings ?? []) {
    if (approvedMainIds.has((l as { product_main_id: string }).product_main_id)) {
      await admin.from("trendyol_listings").update({ status: "approved", error: null, last_status_at: now, updated_at: now } as never).eq("id", (l as { id: string }).id);
    }
  }
}

async function salveazaPaginaReconciliere(admin: Db, ctx: TrendyolSyncContext, pagina: number): Promise<void> {
  if ((ctx.config.reconcile_page ?? 0) === pagina) return;
  /* ⚠ Numai campul atins. Cu obiectul intreg, cursorul de comenzi scris de cealalta bucata a
     cronului, cu o clipa inainte, se pierdea. */
  ctx.config.reconcile_page = pagina;
  await patchTrendyolConfig(admin, ctx.businessId, { reconcile_page: pagina });
}

// ── Respingerile de la revizuie (cron) ──────────────────────────────────────────
/**
 * Aduce produsele RESPINSE la revizuire si scrie motivul pe listare.
 *
 * ⚠ DE CE E NEVOIE — si de ce n-a prins-o niciun audit de cod.
 *
 * Un lot poate raspunde `COMPLETED` cu articolul `SUCCESS`, deci produsul chiar
 * a fost acceptat de API. Abia DUPA aceea Trendyol il trece prin revizuire de
 * continut si il poate respinge: „Eroare de conexiune la serverul de imagini",
 * titlu neconform, imagine gresita. Produsul nu se vinde, comerciantul nu stie,
 * iar Edinio il arata „in aprobare" pe vecie — fiindca nimic nu citea starea.
 *
 * Vazut in productie pe contul unui comerciant, la prima publicare reala:
 * lotul spunea SUCCESS, panoul Trendyol spunea „Revizuire necesara".
 *
 * Coloanele `rejection_reasons` si `issues` existau in schema de la inceput si
 * nicio linie de cod nu le atingea.
 */
export async function reconcileRejections(admin: Db, ctx: TrendyolSyncContext, maxPages = 3): Promise<void> {
  const respinse = new Map<string, TrendyolMotivRespingere[]>();
  for (let page = 0; page < maxPages; page++) {
    const res = await getUnapprovedProducts(ctx.auth, { page, size: 200, status: "rejected" });
    if (isTrendyolError(res)) return;
    const content = res.data?.content ?? [];
    for (const p of content) {
      // `productMainId` e chiar id-ul produsului nostru: asa il trimitem la creare.
      if (p.productMainId && p.rejectReasonDetails?.length) {
        respinse.set(p.productMainId, p.rejectReasonDetails);
      }
    }
    const total = Number(res.data?.totalPages ?? 1);
    if (content.length === 0 || page + 1 >= total) break;
    await pause(250);
  }

  /*
   * Se citesc TOATE listarile care au fost trimise vreodata, nu doar cele
   * respinse. Motivul: un produs reparat de comerciant reintra automat in
   * aprobare la ei („the product will re-enter the approval process"), si atunci
   * trebuie sa-i STERGEM motivul vechi — altfel ramane in interfata o eroare
   * care nu mai e adevarata, si omul repara ceva ce e deja bun.
   */
  const { data: listari } = await admin
    .from("trendyol_listings").select("id, product_main_id, status, rejection_reasons")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "created", "approved", "active", "rejected"]);

  const now = new Date().toISOString();
  for (const l of listari ?? []) {
    const row = l as { id: string; product_main_id: string; status: string; rejection_reasons: unknown };
    const motive = respinse.get(row.product_main_id);
    const areMotiveVechi = Array.isArray(row.rejection_reasons) && row.rejection_reasons.length > 0;

    if (motive) {
      const text = motive
        .map((m) => [m.rejectReason, m.rejectReasonDetail].filter(Boolean).join(" — "))
        .join(" | ").slice(0, 1000);
      if (row.status === "rejected" && areMotiveVechi) continue;   // deja stiut, nu rescriem
      await admin.from("trendyol_listings").update({
        status: "rejected",
        rejection_reasons: motive as never,
        // Motivul lor, in romana, ajunge acolo unde comerciantul se uita oricum.
        error: text,
        last_status_at: now, updated_at: now,
      } as never).eq("id", row.id);
    } else if (row.status === "rejected" || areMotiveVechi) {
      // Nu mai e respins: reparat de comerciant si reintrat in aprobare.
      await admin.from("trendyol_listings").update({
        status: row.status === "rejected" ? "created" : row.status,
        rejection_reasons: [] as never,
        error: null,
        last_status_at: now, updated_at: now,
      } as never).eq("id", row.id);
    }
  }
}

// ── Reverse reconciliation (cron): correct stock/price drift on Trendyol ─────────
// Trendyol has no stock webhook, and a push can fail silently. This reads Trendyol's
// current approved inventory and, where it disagrees with what Edinio intends
// (Edinio being the source of truth), re-pushes the corrected values. Shares
// computeInventoryItems with the forward push so a settled state produces zero
// drift (no oscillation); only genuine differences are corrected.
/**
 * Scrie `ty_content_id` pe listarile care n-au unul.
 *
 * ⚠ Numai unde LIPSESTE. Un `contentId` deja scris nu se atinge: daca produsul a
 * fost intre timp recreat la ei, valoarea corecta o afla adoptia, care vede
 * refuzul; o suprascriere oarba de aici ar putea sa o strice la loc.
 */
async function completeazaContentIds(
  admin: Db, businessId: string, contentIds: Map<string, number>,
): Promise<void> {
  if (contentIds.size === 0) return;
  const { data: fara } = await admin
    .from("trendyol_listings").select("id, product_main_id")
    .eq("business_id", businessId).is("ty_content_id", null);
  for (const l of fara ?? []) {
    const mainId = (l as { product_main_id: string | null }).product_main_id;
    if (!mainId) continue;
    const cid = contentIds.get(mainId);
    if (cid == null) continue;
    await admin.from("trendyol_listings")
      .update({ ty_content_id: cid } as never)
      .eq("id", (l as { id: string }).id);
  }
}

export async function reconcileInventory(admin: Db, ctx: TrendyolSyncContext, maxProducts = 60): Promise<{ corrected: number }> {
  const trendyol = new Map<string, { quantity: number; salePrice: number; listPrice: number }>();
  /*
   * ⚠ SE CULEGE SI `contentId`, nu doar stocul si pretul. Aici a fost al treilea
   * defect gasit pe 21.08, si cel care chiar tinea preturile pe loc.
   *
   * `rutaDeTrimitere` alege actualizarea unui produs aprobat DOAR daca listarea
   * are `ty_content_id`; fara el cade inapoi pe creare, iar Trendyol refuza cu
   * „Codul de bare ... există deja". La VetDepo aveau `ty_content_id` zece
   * listari din 1061, deci practic fiecare schimbare de pret pleca pe creare si
   * era refuzata.
   *
   * Exista o cale de vindecare — refuzul declanseaza adoptia, care intreaba
   * serviciul de stare pe barcode si scrie `contentId` — dar ea costa cate un
   * refuz de fiecare produs. Pe un catalog de o mie, o mie de refuzuri la ei ca
   * sa aflam ce raspunsul de mai jos ne spunea oricum, din zece cereri.
   *
   * Raspunsul de la `approved/inventory-and-price` contine `contentId` pentru
   * fiecare produs. Il scriem pe listare cand lipseste, si ruta de actualizare
   * devine disponibila fara niciun refuz.
   */
  const contentIds = new Map<string, number>();
  /* Zece pagini a cate o suta acopereau 1000 de produse, adica sub cate are un
     catalog mediu de marketplace. VetDepo are 1051, deci ultimele cincizeci nu
     erau vazute niciodata. */
  for (let page = 0; page < 20; page++) {
    const res = await getApprovedProducts(ctx.auth, { page, size: 100 });
    if (isTrendyolError(res)) return { corrected: 0 };
    const content = res.data?.content ?? [];
    if (content.length === 0) break;
    for (const p of content) {
      if (p.productMainId && typeof p.contentId === "number") contentIds.set(p.productMainId, p.contentId);
      for (const v of p.variants ?? []) {
        if (v.barcode) trendyol.set(v.barcode, { quantity: Number(v.quantity ?? 0), salePrice: Number(v.salePrice ?? 0), listPrice: Number(v.listPrice ?? 0) });
      }
    }
    const total = Number(res.data?.totalPages ?? 1);
    if (page + 1 >= total) break;
    await pause(250);
  }

  await completeazaContentIds(admin, ctx.businessId, contentIds);
  if (trendyol.size === 0) return { corrected: 0 };

  /*
   * ⚠ FEREASTRA SE ROTESTE. Aici a fost al doilea defect gasit pe 21.08.
   *
   * Era `.limit(maxProducts)` fara `order` si fara decalaj. Postgres intoarce
   * atunci randurile in ordinea pe care o da planul, iar pentru aceeasi
   * interogare pe o tabela neschimbata ordinea aia e practic mereu aceeasi:
   * probat pe productie, doua rulari au dat ACELEASI 60 de randuri din 1051.
   *
   * Adica plasa de siguranta acoperea 5,7% din catalog, mereu aceeasi felie, iar
   * restul de 991 de produse nu li se verifica pretul niciodata. Cand punerea in
   * coada a cazut (vezi `queue.ts`), nimic nu a mai prins diferenta, si preturile
   * au ramas vechi la Trendyol o zi intreaga, fara nicio urma nicaieri.
   *
   * Acum: ordonare stabila dupa `product_id` si o fereastra care avanseaza cu
   * minutul, ca la rotatia magazinelor din `marketplace/rotatie.ts`. La 1051 de
   * listari si 60 pe trecere, catalogul se parcurge intreg in vreo optsprezece
   * treceri. E o PLASA, nu calea principala: calea principala e coada.
   */
  const { count: totalListari } = await admin
    .from("trendyol_listings").select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId).in("status", ["approved", "active"]);
  const total = totalListari ?? 0;
  if (total === 0) return { corrected: 0 };
  /* Aceeasi tura ca la rotatia magazinelor: minutul curent. Cand un magazin nu e
     ales la o trecere, fereastra lui a avansat oricum, deci la urmatoarea ii vine
     alta felie. */
  const tura = Math.floor(Date.now() / 60_000);
  const start = total > maxProducts ? (tura * maxProducts) % total : 0;
  /*
   * ⚠ CEA MAI PERICULOASA TACERE DIN FISIER. Goala, fereastra inseamna „nicio deriva gasita" —
   * adica exact ce raporteaza si un catalog perfect sincronizat. O pana de o clipa aici arata
   * din panou ca sanatate.
   */
  const listings = randuriCitite<{ product_id: string | null }>("trendyol.fereastraDeriva", await admin
    .from("trendyol_listings").select("product_id")
    .eq("business_id", ctx.businessId).in("status", ["approved", "active"])
    .order("product_id", { ascending: true })
    .range(start, start + maxProducts - 1) as never);

  const drifted: InventoryItem[] = [];
  /*
   * ⚠ SE TINE MINTE AL CUI E FIECARE ARTICOL. Aici a fost defectul gasit 22.08.
   *
   * Loturile de reconciliere se inregistrau cu `related_ids: []`, iar
   * `jurnalLotEsuat` incepe cu `if (mainIds.length === 0) return`. Adica toata
   * tratarea esecului — legarea motivului de produs, contorul de reluari de pe
   * listare, repunerea marginita la coada — exista, e bine gandita, si NU se
   * aplica deloc loturilor venite de aici.
   *
   * Vazut in productie la VetDepo: un lot de reconciliere refuzat cu „Prețul și
   * stocul produselor închise pentru vânzare nu pot fi actualizate.". Trendyol
   * spune pentru FIECARE articol daca a trecut, deci celelalte chiar se
   * aplicasera; dar produsul inchis la vanzare nu se afla de nicaieri, si
   * comerciantul n-avea cum sa stie de ce ii ramane un pret vechi.
   */
  const mainIdPeBarcode = new Map<string, string>();
  for (const l of listings ?? []) {
    const pid = (l as { product_id: string | null }).product_id;
    if (!pid) continue;
    const built = await computeInventoryItems(admin, ctx, pid);
    if (!built || "error" in built) continue;
    for (const it of built.items) {
      const cur = trendyol.get(it.barcode);
      if (!cur) continue; // not (yet) approved on Trendyol
      const qtyDrift = cur.quantity !== it.quantity;
      const priceDrift = Math.abs(cur.salePrice - it.salePrice) > 0.01 || Math.abs(cur.listPrice - it.listPrice) > 0.01;
      if (qtyDrift || priceDrift) {
        drifted.push(it);
        mainIdPeBarcode.set(it.barcode, built.listing.product_main_id);
      }
    }
  }
  if (drifted.length === 0) return { corrected: 0 };

  let corrected = 0;
  for (let i = 0; i < drifted.length; i += 100) {
    const chunk = drifted.slice(i, i + 100);
    const res = await updatePriceInventory(ctx.auth, chunk);
    if (!isTrendyolError(res)) {
      corrected += chunk.length;
      const batchRequestId = res.data?.batchRequestId;
      if (batchRequestId) {
        /* Produsele DIN LOTUL ASTA, nu toate cele derivate: asa motivul unui
           refuz se leaga de produsul lui, iar reluarea nu atinge pe altcineva. */
        const aleLotului = [...new Set(
          chunk.map((it) => mainIdPeBarcode.get(it.barcode)).filter((x): x is string => !!x),
        )];
        const scris = await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", aleLotului);
        if (!scris) {
          /*
           * ⚠ Aici nu se poate intoarce nimic — suntem in mijlocul unei plase care trece prin
           * catalog. Dar tacerea ar fi cea mai rea alegere: repararea derivei ar parea facuta,
           * iar produsele ar ramane departate fara sa mai afle nimeni.
           */
          await logError({
            action: "trendyol/deriva",
            message: "lotul de reparare a derivei a fost primit de Trendyol dar nu s-a putut tine minte",
            details: { batchRequestId, produse: aleLotului.slice(0, 20) },
            businessId: ctx.businessId, severity: "warning",
          });
        }
      }
    }
    await pause(300);
  }
  return { corrected };
}

// ── Queue routing ────────────────────────────────────────────────────────────────
export interface TrendyolQueueItem {
  id: string; business_id: string; product_id: string | null; offer_id: string; op: string; attempts: number;
  /**
   * Generatia randului la clipa revendicarii.
   *
   * ⚠ EXISTA IN BAZA DE MULT, dar lucratorul n-o citea. `trendyol_sync_queue.generation` are
   * declansator care o creste la fiecare update, iar `revendica_din_coada` intoarce randul
   * intreg (`to_jsonb(q.*)`) — deci valoarea venea deja in raspuns si se arunca.
   *
   * Fara ea, o cerere noua venita cat timp lucratorul era la Trendyol era stearsa de
   * terminarea celei vechi. Vezi `src/lib/marketplace/coada-cas.ts`.
   *
   * ⚠ Optionala: un apelant care nu trece prin `revendica_din_coada` n-o are, si atunci se
   * scrie fara paza — mai bine fara paza decat deloc.
   */
  generation?: number | null;
}

export async function processQueueItem(admin: Db, ctx: TrendyolSyncContext, item: TrendyolQueueItem): Promise<SyncOutcome> {
  /*
   * ═══ ⚠ O CITIRE PICATA IESE „TRECATOARE", NU „ESUATA" (26.08.2026) ═══
   *
   * `randCitit` arunca `EroareCitireBaza` cand baza n-a raspuns, si se prinde AICI, la
   * marginea lucrarii. Doua motive pentru care se prinde intr-un singur loc:
   *
   *   1. Neprinsa, aruncarea ar fi iesit din `processQueueItem` si ar fi rupt bucla
   *      cronului — deci o pana pe UN produs ar fi oprit lucrarile TUTUROR magazinelor din
   *      trecerea aceea.
   *   2. Prinsa mai adanc, fiecare citire ar fi trebuit sa stie singura ce sa faca, iar una
   *      uitata ar fi lasat gaura la loc.
   *
   * ⚠ `status: 0` NU E DECOR: `eTrecatoare` il citeste ca pana de retea, iar cronul atunci
   * NU arde o incercare si nu abandoneaza elementul. Un produs nu are de ce sa-si piarda
   * incercarile fiindca baza noastra a clipit.
   */
  try {
    switch (item.op) {
      case "delete":
        return await removeByMainId(admin, ctx, item.offer_id);
      case "inventory":
        return item.product_id ? await pushInventoryNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
      case "livrare":
        return item.product_id ? await pushLivrareNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
      default:
        return item.product_id ? await syncProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    }
  } catch (e) {
    if (e instanceof EroareCitireBaza) {
      return { ok: false, error: e.message, status: 0 };
    }
    throw e;
  }
}
