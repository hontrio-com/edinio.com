// Trendyol sync engine — shared by the cron drain (api/cron/trendyol-sync) and
// the dashboard "list now" actions. Products/inventory are async batch: submit ->
// { batchRequestId } -> poll batch-requests. A reconcile pass reads approved
// products back to pick up Trendyol's approval decision.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TrendyolAuth } from "./client";
import {
  createProducts, getApprovedProducts, getBatchResult, getProductBaseInfo, getUnapprovedProducts,
  isTrendyolError, setArchiveState, updateApprovedContent, updatePriceInventory,
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
  const { data: ss } = await admin
    .from("store_settings").select("trendyol_config").eq("business_id", businessId).maybeSingle();
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
  /** Edinio impinge singur stocul si pretul? Fals pe listarile ADOPTATE. */
  auto_inventory?: boolean | null;
  /** Produsul de la Trendyol a fost creat de NOI (lot de creare reusit)? */
  creat_de_edinio?: boolean | null;
  /** `contentId`-ul de la ei; singura cheie acceptata de `content-bulk-update`. */
  ty_content_id?: number | null;
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("trendyol_listings")
    .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, auto_inventory, creat_de_edinio, ty_content_id")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();
  return (data as ListingRow) ?? null;
}
async function getListingByMainId(admin: Db, businessId: string, mainId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("trendyol_listings")
    .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, auto_inventory, creat_de_edinio, ty_content_id")
    .eq("business_id", businessId).eq("product_main_id", mainId).maybeSingle();
  return (data as ListingRow) ?? null;
}

function toEnrichment(row: ListingRow): TrendyolListingEnrichment {
  return {
    brand_id: row.brand_id,
    category_id: row.category_id,
    attributes: Array.isArray(row.attributes) ? (row.attributes as TrendyolProductAttribute[]) : [],
    dimensional_weight: row.dimensional_weight,
    cargo_company_id: row.cargo_company_id,
  };
}

async function getVariantData(admin: Db, listingId: string): Promise<TrendyolVariantData[]> {
  const { data } = await admin
    .from("trendyol_variants")
    .select("barcode, stock_code, variant_title, attributes, quantity, list_price, sale_price, vat_rate, enabled")
    .eq("listing_id", listingId);
  return (data ?? []).map((v) => ({
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

async function recordBatch(admin: Db, businessId: string, batchRequestId: string, kind: string, relatedIds: string[]): Promise<void> {
  await admin.from("trendyol_batches").upsert(
    { business_id: businessId, batch_request_id: batchRequestId, kind, status: "pending", related_ids: relatedIds as never },
    { onConflict: "business_id,batch_request_id" },
  );
}

// ── Upsert (create/update on Trendyol) ──────────────────────────────────────────
export async function syncProductNow(
  admin: Db, ctx: TrendyolSyncContext, productId: string,
  /** Comerciantul a cerut-o EXPLICIT (buton), nu e o sincronizare automata. */
  manual = false,
): Promise<SyncOutcome> {
  const { data: product } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
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
    await recordBatch(admin, ctx.businessId, id, t.kind, [listing.product_main_id]);
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
  const { data } = await admin.from("trendyol_variants")
    .select("barcode, exista_la_ei").eq("listing_id", listing.id);
  const stiute = new Set(
    (data ?? []).filter((v) => (v as { exista_la_ei: boolean }).exista_la_ei)
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
  const { data: clash } = await admin.from("trendyol_variants")
    .select("barcode, listing_id").eq("business_id", ctx.businessId).in("barcode", barcodes);
  const conflict = (clash ?? []).find((c) => (c as { listing_id: string }).listing_id !== listingId);
  if (conflict) {
    return { error: `Barcode-ul „${(conflict as { barcode: string }).barcode}" este deja folosit de alt produs.` };
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

  const { data: produse } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("business_id", ctx.businessId).in("id", ids);
  const lista = (produse ?? []) as unknown as MappableProduct[];

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
      .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, auto_inventory, creat_de_edinio, ty_content_id")
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
      await recordBatch(admin, ctx.businessId, batchRequestId, "product", lot.mainIds);
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
  const { data: product } = await admin
    // `page_sections` NU e de decor aici: acolo stau combinatiile cu stocul lor.
    // Fara el, impingerea de stoc n-avea de unde sti cate bucati are marimea M si
    // trimitea totalul produsului pe fiecare barcode — iar reconcilierea, care
    // foloseste exact functia asta, confirma cifra gresita in loc s-o corecteze.
    .from("products").select("id, sku, price, compare_at_price, track_inventory, stock_quantity, page_sections")
    .eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
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
    const priced = buildVariantPrices(prod, v);
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
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", [built.listing.product_main_id]);
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
async function zeroizeazaStocul(admin: Db, ctx: TrendyolSyncContext, listingId: string): Promise<void> {
  const { data } = await admin.from("trendyol_variants")
    .select("barcode, quantity, list_price, sale_price, vat_rate, enabled, stock_code, variant_title")
    .eq("listing_id", listingId);
  const barcoduri = (data ?? []).map((v) => (v as { barcode: string }).barcode).filter(Boolean);
  if (barcoduri.length === 0) return;
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
      console.warn(`[trendyol] zeroizarea stocului a esuat la stergere: ${res.error}`);
      return;
    }
    const batchRequestId = res.data?.batchRequestId;
    if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", []);
  }
}

export async function removeProductNow(admin: Db, ctx: TrendyolSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  // `draft` nu a plecat niciodata la ei, deci n-are ce zeroiza. Orice altceva, da
  // — inclusiv `error`, care poate insemna „creat, dar cu o eroare ulterioara".
  if (listing.status !== "draft") {
    await zeroizeazaStocul(admin, ctx, listing.id);
  }
  await admin.from("trendyol_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}
export async function removeByMainId(admin: Db, ctx: TrendyolSyncContext, mainId: string): Promise<SyncOutcome> {
  const listing = await getListingByMainId(admin, ctx.businessId, mainId);
  if (!listing) return { ok: true, action: "skipped" };
  // Aceeasi regula si aici: calea din coada (produs sters din Edinio) trecea
  // direct la stergerea randului, deci lasa produsul viu si vandabil la ei.
  if (listing.status !== "draft") {
    await zeroizeazaStocul(admin, ctx, listing.id);
  }
  await admin.from("trendyol_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}

// ── Batch polling (cron) ────────────────────────────────────────────────────────
interface BatchRow { id: string; batch_request_id: string; kind: string; related_ids: unknown; attempts: number }

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
  const { data } = await admin
    .from("trendyol_batches")
    .select("id, batch_request_id, kind, related_ids, attempts")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  const batches = (data ?? []) as BatchRow[];

  for (const b of batches) {
    const res = await getBatchResult(ctx.auth, b.batch_request_id);
    const now = new Date().toISOString();

    if (isTrendyolError(res)) {
      await admin.from("trendyol_batches")
        .update({ attempts: b.attempts + 1, polled_at: now, status: b.attempts + 1 >= 6 ? "failed" : "retry" } as never)
        .eq("id", b.id);
      continue;
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
      console.warn(`[trendyol] produs adoptat dar NEDEZARHIVAT (${barcode}): ${dez.error}`);
    } else {
      const batchRequestId = dez.data?.batchRequestId;
      if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "archive", [listing.product_main_id]);
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
  const { data: listari } = await admin.from("trendyol_listings")
    .select("id, product_id, inventory_retries")
    .eq("business_id", ctx.businessId).in("product_main_id", mainIds.slice(0, 200));
  const randuriListari = (listari ?? []) as { id: string; product_id: string | null; inventory_retries: number | null }[];
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
export async function reconcileStatuses(
  admin: Db, ctx: TrendyolSyncContext, maxPages = 5,
): Promise<void> {
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
  const { data: listings } = await admin
    .from("trendyol_listings").select("id, product_main_id, status")
    .eq("business_id", ctx.businessId).in("status", ["pending", "created"]);
  for (const l of listings ?? []) {
    if (approvedMainIds.has((l as { product_main_id: string }).product_main_id)) {
      await admin.from("trendyol_listings").update({ status: "approved", error: null, last_status_at: now, updated_at: now } as never).eq("id", (l as { id: string }).id);
    }
  }
}

async function salveazaPaginaReconciliere(admin: Db, ctx: TrendyolSyncContext, pagina: number): Promise<void> {
  if ((ctx.config.reconcile_page ?? 0) === pagina) return;
  const { data: ss } = await admin
    .from("store_settings").select("trendyol_config").eq("business_id", ctx.businessId).maybeSingle();
  const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
  ctx.config.reconcile_page = pagina;
  await admin.from("store_settings")
    .update({ trendyol_config: { ...config, reconcile_page: pagina } as never })
    .eq("business_id", ctx.businessId);
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
export async function reconcileInventory(admin: Db, ctx: TrendyolSyncContext, maxProducts = 60): Promise<{ corrected: number }> {
  const trendyol = new Map<string, { quantity: number; salePrice: number; listPrice: number }>();
  for (let page = 0; page < 10; page++) {
    const res = await getApprovedProducts(ctx.auth, { page, size: 100 });
    if (isTrendyolError(res)) return { corrected: 0 };
    const content = res.data?.content ?? [];
    if (content.length === 0) break;
    for (const p of content) {
      for (const v of p.variants ?? []) {
        if (v.barcode) trendyol.set(v.barcode, { quantity: Number(v.quantity ?? 0), salePrice: Number(v.salePrice ?? 0), listPrice: Number(v.listPrice ?? 0) });
      }
    }
    const total = Number(res.data?.totalPages ?? 1);
    if (page + 1 >= total) break;
    await pause(250);
  }
  if (trendyol.size === 0) return { corrected: 0 };

  const { data: listings } = await admin
    .from("trendyol_listings").select("product_id")
    .eq("business_id", ctx.businessId).in("status", ["approved", "active"]).limit(maxProducts);

  const drifted: InventoryItem[] = [];
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
      if (qtyDrift || priceDrift) drifted.push(it);
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
      if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", []);
    }
    await pause(300);
  }
  return { corrected };
}

// ── Queue routing ────────────────────────────────────────────────────────────────
export interface TrendyolQueueItem {
  id: string; business_id: string; product_id: string | null; offer_id: string; op: string; attempts: number;
}

export async function processQueueItem(admin: Db, ctx: TrendyolSyncContext, item: TrendyolQueueItem): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeByMainId(admin, ctx, item.offer_id);
    case "inventory":
      return item.product_id ? pushInventoryNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    default:
      return item.product_id ? syncProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
  }
}
