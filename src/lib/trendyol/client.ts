// Thin authenticated REST wrapper over the Trendyol Partner API v3.0.
// Auth: HTTP Basic (base64 apiKey:apiSecret) + mandatory User-Agent header;
// supplierId is part of the URL path. Base URL resolved per environment
// (stage | production). Write-side is async batch (POST -> { batchRequestId },
// polled via the batch-requests endpoint).
//
// Errors are normalised into a single shape so callers branch with
// `isTrendyolError`. `cache: "no-store"` (Vercel Data Cache returned 500s at
// runtime for small upstream calls in the OLX/About You clients).

import { basicAuthHeader, trendyolBaseUrl, userAgent } from "./auth";
import { mesajDupaStatus, traduMesajTrendyol } from "./errors";
import type {
  TrendyolBatchAck, TrendyolBatchResult, TrendyolBrand, TrendyolCategory,
  TrendyolCategoryAttribute, TrendyolEnvironment, TrendyolProductAttribute, TrendyolProductItem,
  TrendyolShipmentPackage, TrendyolSupplierAddresses, TrendyolStoreFront,
} from "./types";
import { TRENDYOL_DEFAULT_STOREFRONT } from "./types";
import type { TrendyolClaim } from "./types";
import { asteaptaRandulTrendyol, grupulCaii, tineCont429 } from "./ritm";

export interface TrendyolAuth {
  supplierId: string;
  apiKey: string;
  apiSecret: string;
  environment?: TrendyolEnvironment;
  /**
   * Vitrina (tara). Antet OBLIGATORIU pe marketplace-ul international.
   * Fara el, Trendyol raspunde „furnizor negasit" desi cheile sunt bune.
   */
  storefront?: TrendyolStoreFront;
  userAgentCompany?: string;
}

/**
 * Limba nomenclatoarelor. Trendyol accepta doar `ro`, `el`, `ar` si `en`; orice
 * altceva (`bg`, `cz`) e ignorat sau respins, deci restul cad pe engleza.
 */
function limbaVitrinei(vitrina: TrendyolStoreFront): string {
  if (vitrina === "RO") return "ro";
  if (vitrina === "GR") return "el";
  if (vitrina === "SA" || vitrina === "AE" || vitrina === "KW") return "ar";
  return "en";
}

export type TrendyolResult<T> =
  | { data: T }
  | { error: string; status: number; details?: unknown };

export function isTrendyolError<T>(r: TrendyolResult<T>): r is { error: string; status: number; details?: unknown } {
  return "error" in r;
}

async function call<T>(
  auth: TrendyolAuth,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<TrendyolResult<T>> {
  if (!auth?.apiKey || !auth?.apiSecret || !auth?.supplierId) {
    return { error: "Credențialele Trendyol lipsesc.", status: 0 };
  }
  const vitrina = auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT;

  /*
   * ═══ ⚠ RITMUL SE NUMARA INTR-UN SINGUR LOC, PE GRUP SI PE VANZATOR ═══
   *
   * Pana azi clientul n-avea nicio franare: singura era `PACE_MS = 350` in bucla cronului, in
   * memoria unei instante. Deci cronul, un buton apasat de om, importul si un webhook sosit
   * intre timp credeau fiecare ca au bugetul intreg — iar Trendyol vedea suma.
   *
   * ⚠ Din 14 septembrie 2026 limitele lor trec pe GRUPURI DE SERVICII, per vanzator. De-aia
   * cheia e `supplierId:vitrina:grup`: doua magazine Edinio pe acelasi cont impart bugetul,
   * iar o trecere grea de catalog n-are voie sa intarzie o miscare de stoc dupa o vanzare.
   *
   * ═══ ⚠ SI CAND N-A VENIT RANDUL, CEREREA NU MAI PLEACA (26.08.2026) ═══
   *
   * Pana azi pleca. Argumentul scris aici era ca un limitator care blocheaza ar opri
   * confirmarile de comenzi si miscarile de stoc ale tuturor magazinelor — un incident mai
   * mare decat depasirea de care ne aparam.
   *
   * ⚠ ARGUMENTUL NU MAI STA, si nu fiindca s-a razgandit cineva: `ceruJeton` intoarce
   * `ok: true` la ORICE necaz cu baza. Deci `false` de aici nu mai poate insemna „contorul e
   * cazut" — inseamna strict „galeata e plina si dupa cinci secunde de asteptare". Iar in
   * cazul ala a trimite oricum inseamna ca limitatorul nu limiteaza nimic tocmai cand ar
   * trebui: la inghesuiala.
   *
   * ⚠ SI CE ERA DE APARAT E APARAT PE ALTA CALE. Galetile sunt pe grup: o trecere grea de
   * catalog nu poate goli galeata comenzilor, fiindca n-o atinge.
   *
   * ⚠ SE INTOARCE 429, NU O EROARE OARECARE. Casa citeste 429 ca trecator peste tot
   * (`eTrecatoare` in `sync.ts`): coada reincearca si NU arde o incercare. O eroare cu alt cod
   * ar fi golit cozi — chiar incidentul Trendyol de acum o luna.
   */
  const grup = grupulCaii(path, method);
  if (!await asteaptaRandulTrendyol(auth.supplierId, vitrina, grup)) {
    return {
      error: "Prea multe cereri catre Trendyol chiar acum. Se reia singur peste putin.",
      status: 429,
    };
  }

  try {
    const res = await fetch(`${trendyolBaseUrl(auth.environment)}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(auth.apiKey, auth.apiSecret),
        "User-Agent": userAgent(auth.supplierId, auth.userAgentCompany),
        // Vitrina: OpenAPI-ul international il declara `required: true` pe
        // practic toate serviciile, inclusiv pe cel de adrese folosit la testul
        // de conexiune. Lipsa lui a fost cauza erorii „furnizor negasit".
        storeFrontCode: vitrina,
        // Nomenclatoarele (categorii, atribute) vin in limba ceruta aici.
        "Accept-Language": limbaVitrinei(vitrina),
        Accept: "application/json",
        /* ⚠ La `FormData` NU se pune antetul: `fetch` il scrie singur, cu granita. Scris de
           noi, granita ar lipsi si corpul n-ar putea fi despartit de nimeni. */
        ...(body !== undefined && !(body instanceof FormData)
          ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined
        : body instanceof FormData ? body
        : JSON.stringify(body),
      cache: "no-store",
      // Fara asta, o cerere blocata consuma tot bugetul functiei si esueaza
      // fara mesaj util — apelurile astea ruleaza si din cron-uri.
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 204) return { data: undefined as T };
    const text = await res.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      /*
       * ⚠ EI AU SPUS „PREA REPEDE": TAC TOATE INSTANTELE, nu doar asta.
       *
       * Fara pauza impartita, prima instanta ia 429 si se opreste, iar celelalte continua sa
       * bata la aceeasi usa — si fiecare pana isi arde propriile jetoane. Cererile respinse
       * se numara si ele in limita lor, deci o pauza necoordonata face raul mai mare.
       *
       * ⚠ Nu se asteapta dupa scriere: raspunsul pentru cererea ASTA e oricum 429. Pauza e
       * pentru cele care vin dupa.
       */
      if (res.status === 429) {
        void tineCont429(auth.supplierId, vitrina, grup, res.headers);
      }
      const obj = (json ?? {}) as {
        errors?: { message?: string; key?: string; errorCode?: string }[];
        message?: string; exception?: string; key?: string;
      };
      const primaEroare = Array.isArray(obj.errors) ? obj.errors[0] : undefined;
      const brut =
        primaEroare?.message ||
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.exception === "string" && obj.exception) ||
        "";
      /*
       * `key` e identificatorul STABIL al erorii; `message` e localizat de
       * `Accept-Language` si se schimba sub noi. Documentatia lor cere explicit
       * sa nu potrivim pe text.
       */
      const cheie = primaEroare?.key || primaEroare?.errorCode || (typeof obj.key === "string" ? obj.key : undefined);
      // Codul HTTP spune uneori mai mult decat textul; altfel traducem textul.
      const detail = mesajDupaStatus(res.status, auth.environment) ?? traduMesajTrendyol(brut, res.status, cheie);
      return { error: detail, status: res.status, details: json };
    }
    return { data: json as T };
  } catch (e) {
    const abandonat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      error: abandonat
        ? "Trendyol nu a raspuns la timp. Reincearca peste cateva minute."
        : "Nu am putut contacta Trendyol. Verifica reteaua si reincearca.",
      status: 0,
    };
  }
}

// ── Connection test ───────────────────────────────────────────────────────────
// Filtrul de produse aprobate: seller-scoped (valideaza supplierId + Basic auth +
// vitrina deodata), ieftin cu size=1, si cu limita generoasa (2000 cereri/minut).
//
// NU folosim serviciul de adrese aici, desi ar parea mai natural: e limitat la
// O SINGURA cerere pe ora, deci al doilea click pe „Conecteaza" ar da 429, iar
// documentatia cere sa nu fie apelat pana nu e aprobat contul de vanzator — adica
// exact cand comerciantul isi testeaza prima oara cheile.
export async function testConnection(
  auth: TrendyolAuth,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await getApprovedProducts(auth, { page: 0, size: 1 });
  if (!isTrendyolError(res)) return { ok: true };
  // `call` traduce deja mesajul si trateaza codurile HTTP; aici nu mai
  // reinterpretam nimic, ca sa nu ajungem sa spunem „chei invalide" pentru un
  // 403 care inseamna cu totul altceva.
  return { ok: false, error: res.error, status: res.status };
}

// ── Seller info / nomenclature ────────────────────────────────────────────────
export function getSupplierAddresses(auth: TrendyolAuth) {
  return call<TrendyolSupplierAddresses>(auth, "GET", `/integration/sellers/${auth.supplierId}/addresses`);
}
export function getCategoryTree(auth: TrendyolAuth) {
  return call<{ categories: TrendyolCategory[] } | TrendyolCategory[]>(auth, "GET", "/integration/product/product-categories");
}
export function getCategoryAttributes(auth: TrendyolAuth, categoryId: number) {
  return call<{ categoryAttributes: TrendyolCategoryAttribute[] }>(auth, "GET", `/integration/product/categories/${categoryId}/attributes`);
}
// Attribute values for a category attribute (fetched separately — NOT inline in
// getCategoryAttributes). page/size up to 1000.
export function getCategoryAttributeValues(auth: TrendyolAuth, categoryId: number, attributeId: number, page = 0, size = 1000) {
  return call<{ content: { attributeValueId: number; attributeValue: string }[]; totalElements?: number }>(
    auth, "GET", `/integration/product/categories/${categoryId}/attributes/${attributeId}/values?page=${page}&size=${size}`);
}

/*
 * Lista completa de branduri, paginata.
 *
 * ⚠ NU incerca sa o incarci toata: pagina 200 raspunde in continuare cu 1000 de
 * randuri, deci catalogul are peste doua sute de mii de branduri. Un cache
 * „complet" ar insemna sute de cereri si zeci de megaocteti pentru fiecare
 * vitrina. Pentru cautare foloseste `getBrandsByName`.
 */
export function getBrands(auth: TrendyolAuth, page = 0, size = 1000) {
  return call<{ brands: TrendyolBrand[] }>(auth, "GET", `/integration/product/brands?page=${page}&size=${size}`);
}
/*
 * Cautarea dupa nume.
 *
 * ⚠ `size` NU e in documentatie, dar functioneaza si conteaza enorm: fara el,
 * serviciul taie la 20 de randuri. Probat pe „Avon" — 20 de rezultate fara
 * `size`, 31 (toate) cu `size=100`, si printre cele taiate erau chiar potrivirile
 * exacte pe care le cauta comerciantul. Peste 100 nu se mai schimba nimic: 100 e
 * deja intreaga multime de potriviri.
 *
 * Nu e sensibila la registru, desi comentariul de aici sustinea contrariul:
 * „avon" si „Avon" intorc exact aceleasi randuri.
 *
 * Atentie si la forma: lista completa vine invelita in `{ brands: [...] }`, dar
 * cautarea raspunde cu un ARRAY simplu. Citit gresit, nu returna niciodata nimic.
 */
export function getBrandsByName(auth: TrendyolAuth, name: string, size = 500) {
  return call<TrendyolBrand[]>(
    auth, "GET", `/integration/product/brands/by-name?name=${encodeURIComponent(name)}&size=${size}`);
}

// Approved products (stock/price). Presence of a productMainId here => approved;
// used to reconcile listing approval status after batch success.
export function getApprovedProducts(
  auth: TrendyolAuth,
  params: { page?: number; size?: number; productMainId?: string; barcode?: string; status?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  // Serviciul refuza peste 100 pe pagina; cerut mai mult, raspunde 400 si
  // reconcilierea se opreste tacut la prima pagina.
  if (params.size != null) q.set("size", String(Math.max(1, Math.min(100, params.size))));
  if (params.productMainId) q.set("productMainId", params.productMainId);
  if (params.barcode) q.set("barcode", params.barcode);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return call<{ content: { productMainId?: string; contentId?: number; variants?: { barcode?: string; quantity?: number; salePrice?: number; listPrice?: number }[] }[]; totalElements?: number; totalPages?: number }>(
    auth, "GET", `/integration/product/sellers/${auth.supplierId}/products/approved/inventory-and-price${qs ? `?${qs}` : ""}`);
}

/**
 * Starea unui produs la ei, dupa barcode.
 *
 * Cel mai ieftin mod de a afla trei lucruri deodata: daca produsul EXISTA in
 * catalogul vanzatorului, daca e aprobat si daca e arhivat. Barcode-ul e in
 * CALE, nu in query.
 *
 * Probat: 200 cu `{approved, archived, contentId}` cand exista; **404** cu
 * `errors[0].key = "product.not.found"` cand nu. Discriminantul e curat, deci
 * nu trebuie ghicit nimic din textul erorii.
 *
 * `contentId` de aici e singura cale catre `content-bulk-update`, care NU
 * lucreaza pe barcode.
 */
export function getProductBaseInfo(auth: TrendyolAuth, barcode: string) {
  return call<{
    barcode: string; approved?: boolean; approvedDate?: number;
    archived?: boolean; contentId?: number; listingId?: string;
  }>(auth, "GET", `/integration/product/sellers/${auth.supplierId}/product/${encodeURIComponent(barcode)}`);
}

/**
 * Arhiveaza sau scoate din arhiva produse, dupa barcode.
 *
 * Un produs arhivat la ei ramane in cont dar NU se vinde. Cand comerciantul il
 * publica din Edinio, asta e ce vrea de fapt: sa reintre la vanzare.
 */
export function setArchiveState(auth: TrendyolAuth, items: { barcode: string; archived: boolean }[]) {
  return call<TrendyolBatchAck>(
    auth, "PUT", `/integration/product/sellers/${auth.supplierId}/products/archive-state`, { items });
}

/**
 * Sterge produse din catalogul vanzatorului, dupa barcode.
 *
 * ═══ ⚠ TRENDYOL CHIAR ARE STERGERE, SI N-O FOLOSEAM ═══
 *
 * Comentariile din `sync.ts` porneau de la ideea ca ei n-au stergere, asa ca stergerea unui
 * produs din Edinio se traducea in „stoc zero, apoi uitam listarea". Dar
 * `DELETE /integration/product/sellers/{id}/products` exista, primeste unul sau mai multe
 * barcode-uri si raspunde asincron cu `batchRequestId`, ca orice alta scriere de produs.
 *
 * ⚠ NU E O SCURTATURA CATRE „gata": raspunsul spune doar ca au PRIMIT cererea. Verdictul se
 * afla din `getBatchResult`, ca la orice lot — de-aia se scrie in registru.
 *
 * ⚠ SI NU E MEREU CU PUTINTA. Un produs cu comenzi in curs, sau intr-o stare pe care ei o
 * apara, poate fi refuzat. De-aia calea de stergere din `sync.ts` incepe cu ARHIVAREA (care
 * il scoate din vanzare imediat) si abia apoi cere stergerea: chiar daca stergerea e
 * refuzata, marfa nu se mai vinde.
 */
export function deleteProducts(auth: TrendyolAuth, barcodes: string[]) {
  return call<TrendyolBatchAck>(
    auth, "DELETE", `/integration/product/sellers/${auth.supplierId}/products`,
    { items: barcodes.map((barcode) => ({ barcode })) });
}

/**
 * Produsele NEAPROBATE: in asteptare sau RESPINSE la revizuire.
 *
 * ⚠ Aici se afla singurul lucru pe care lotul nu-l spune niciodata.
 *
 * Un lot poate raspunde `COMPLETED` cu articolul `SUCCESS` — produsul a fost
 * acceptat — si abia dupa aceea Trendyol sa-l respinga la revizuirea de
 * continut: „Eroare de conexiune la serverul de imagini", „titlu neconform",
 * si asa mai departe. Produsul nu se vinde, iar noi il aratam „in aprobare" la
 * nesfarsit, fiindca nimic nu citea starea asta.
 *
 * `rejectReasonDetails[]` vine cu motivul SI explicatia, traduse in limba
 * cerută de `Accept-Language`. `status` accepta `rejected` si `pendingApproval`,
 * deci se poate intreba tintit.
 */
export interface TrendyolMotivRespingere {
  rejectReason?: string;
  rejectReasonDetail?: string;
}
export function getUnapprovedProducts(
  auth: TrendyolAuth,
  params: { page?: number; size?: number; status?: "rejected" | "pendingApproval"; barcode?: string; productMainId?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  // Documentat: maximum 1000 pe pagina, iar `page * size` nu poate depasi 10.000.
  if (params.size != null) q.set("size", String(Math.max(1, Math.min(1000, params.size))));
  if (params.status) q.set("status", params.status);
  if (params.barcode) q.set("barcode", params.barcode);
  if (params.productMainId) q.set("productMainId", params.productMainId);
  const qs = q.toString();
  return call<{
    content: {
      productMainId?: string; barcode?: string; title?: string;
      rejectReasonDetails?: TrendyolMotivRespingere[];
    }[];
    totalElements?: number; totalPages?: number;
  }>(auth, "GET", `/integration/product/sellers/${auth.supplierId}/products/unapproved${qs ? `?${qs}` : ""}`);
}

// ── Products (async batch) ────────────────────────────────────────────────────
export function createProducts(auth: TrendyolAuth, items: TrendyolProductItem[]) {
  return call<TrendyolBatchAck>(auth, "POST", `/integration/product/sellers/${auth.supplierId}/v2/products`, { items });
}
// Forma lui `requestItem` difera dupa tipul lotului: `ProductV2OnBoarding` il
// invele in `product`, iar loturile de stoc/pret trimit barcode-ul direct. Le
// declaram pe amandoua, ca legarea rezultatului de produs sa nu depinda de tip.
/**
 * Actualizeaza produsele NEAPROBATE (ciorna sau respinse la revizuie).
 *
 * ⚠ Asta e ruta prin care se REPARA un produs respins. Recrearea nu merge:
 * Trendyol raspunde „codul de bare exista deja", fiindca produsul chiar exista.
 *
 * Documentatia lor: „You can easily update any information except barcode if the
 * product is not approved", si „as you will send the full data" — deci se trimite
 * setul COMPLET, nu doar campul schimbat.
 *
 * Payload-ul e cel de creare MINUS `quantity`, `listPrice` si `salePrice`:
 * stocul si pretul se schimba numai prin `price-and-inventory`.
 */
export type TrendyolItemActualizare = Omit<TrendyolProductItem, "quantity" | "listPrice" | "salePrice">;

export function updateUnapprovedProducts(auth: TrendyolAuth, items: TrendyolItemActualizare[]) {
  return call<TrendyolBatchAck>(
    auth, "POST", `/integration/product/sellers/${auth.supplierId}/products/unapproved-bulk-update`, { items });
}

/**
 * Actualizeaza CONTINUTUL unui produs deja APROBAT.
 *
 * ⚠ Cheia e `contentId`, NU barcode-ul — un cod care trimite barcode aici n-are
 * cum sa functioneze. `contentId` se afla din serviciul de stare pe barcode si
 * il pastram in `trendyol_listings.ty_content_id`.
 *
 * La produs aprobat NU se mai pot schimba: barcode, productMainId, brandId,
 * categoryId, si nici atributele `slicer` sau `varianter` (marimea, culoarea).
 *
 * ⚠ Atributele sunt „totul sau nimic": daca trimiti unul singur modificat,
 * trebuie sa le trimiti pe TOATE ale produsului, altfel le pierzi pe celelalte.
 */
export function updateApprovedContent(
  auth: TrendyolAuth,
  items: { contentId: number; title?: string; description?: string; images?: { url: string }[]; attributes?: TrendyolProductAttribute[] }[],
) {
  return call<TrendyolBatchAck>(
    auth, "POST", `/integration/product/sellers/${auth.supplierId}/products/content-bulk-update`, { items });
}

/**
 * Actualizeaza campurile DE VARIANTA ale unui produs aprobat.
 *
 * ⚠ Ruta asta e singura prin care se pot schimba `vatRate`, `stockCode`,
 * `dimensionalWeight` si — cel mai important pentru Romania — **`sgrPrice`** pe
 * un produs deja aprobat. `content-bulk-update` nu le are in schema, iar
 * `createProducts` refuza un barcode existent: fara ea, garantia SGR ramane
 * inghetata la valoarea de la prima listare, pentru totdeauna.
 *
 * Cheia e `barcode`, si actualizarea e PARTIALA: se trimite doar ce se schimba.
 * Singurul camp care nu se poate modifica e chiar barcode-ul.
 */
export function updateApprovedVariants(
  auth: TrendyolAuth,
  items: { barcode: string; sgrPrice?: number; vatRate?: number; stockCode?: string; dimensionalWeight?: number }[],
) {
  return call<TrendyolBatchAck>(
    auth, "POST", `/integration/product/sellers/${auth.supplierId}/products/variant-bulk-update`, { items });
}

export function getBatchResult(auth: TrendyolAuth, batchRequestId: string) {
  return call<TrendyolBatchResult<{ product?: { barcode?: string }; barcode?: string }>>(
    auth, "GET", `/integration/product/sellers/${auth.supplierId}/products/batch-requests/${encodeURIComponent(batchRequestId)}`);
}

// ── Price & inventory (async batch) ───────────────────────────────────────────
export function updatePriceInventory(
  auth: TrendyolAuth,
  items: { barcode: string; quantity: number; salePrice: number; listPrice: number }[],
) {
  return call<TrendyolBatchAck>(auth, "POST", `/integration/inventory/sellers/${auth.supplierId}/products/price-and-inventory`, { items });
}

// ── Orders (shipment packages) & fulfillment ──────────────────────────────────
export function getOrders(
  auth: TrendyolAuth,
  params: { status?: string; startDate?: number; endDate?: number; page?: number; size?: number; orderNumber?: string; orderByField?: string; orderByDirection?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.startDate != null) q.set("startDate", String(params.startDate));
  if (params.endDate != null) q.set("endDate", String(params.endDate));
  if (params.page != null) q.set("page", String(params.page));
  // Serviciul refuza peste 200 pe pagina. Necaptusit, o cerere mai mare intoarce
  // 400 si ingestul de comenzi se opreste tacut la prima pagina.
  if (params.size != null) q.set("size", String(Math.max(1, Math.min(200, params.size))));
  if (params.orderNumber) q.set("orderNumber", params.orderNumber);
  if (params.orderByField) q.set("orderByField", params.orderByField);
  if (params.orderByDirection) q.set("orderByDirection", params.orderByDirection);
  const qs = q.toString();
  /*
   * Calea V2.
   *
   * Documentatia lor: „The following endpoint services will be deprecated as of
   * October 15, 2026" — si `/orders` era exact una dintre ele. Ramasa pe V1,
   * integrarea si-ar fi pierdut comenzile peste noapte, la o data fixa si
   * anuntata. Fereastra de date e limitata la 2 saptamani; vezi
   * `fereastraComenzi` in orders.ts.
   */
  return call<{ content: TrendyolShipmentPackage[]; totalElements?: number; totalPages?: number; page?: number; size?: number }>(
    auth, "GET", `/integration/order/sellers/${auth.supplierId}/v2/orders${qs ? `?${qs}` : ""}`);
}
// Move a package Picking -> Invoiced. Trendyol's contracted cargo handles the
// actual shipment (tracking is assigned by Trendyol).
export function updatePackage(
  auth: TrendyolAuth,
  packageId: number,
  body: { lines: { lineId: number; quantity: number }[]; params?: Record<string, unknown>; status: "Picking" | "Invoiced" },
) {
  return call<undefined>(auth, "PUT", `/integration/order/sellers/${auth.supplierId}/shipment-packages/${packageId}`, body);
}

/**
 * „Nu pot furniza": anuleaza linii dintr-un pachet, cu motiv.
 *
 * ═══ ⚠ E SINGURA CALE ADEVARATA DE ANULARE (26.08.2026) ═══
 *
 * Pana azi comerciantul anula o comanda Trendyol din selectorul generic al comenzii. Aia
 * schimba starea DOAR la noi: elibera stocul local, iar la Trendyol comanda ramanea activa —
 * si la prima recitire revendica marfa inapoi. Daca intre timp se vanduse, stocul intra pe
 * minus si ramanea doar un rand in jurnal.
 *
 * ⚠ `shouldKeepPreviousStatus: true`, si nu din comoditate. Ei SPARG pachetul cand se anuleaza
 * o parte din el si dau un `shipmentPackageId` NOU restului. Cu `false`, ce ramane porneste pe
 * „created" — adica o comanda deja pregatita s-ar intoarce la inceput. Cu `true`, isi tine
 * starea. (Spargerea se intampla oricum; noul pachet ne vine la urmatoarea recitire, fiindca
 * anularea modifica comanda si intra singura in fereastra de citire.)
 */
export function unsupplyPackageItems(
  auth: TrendyolAuth, packageId: number,
  p: { lines: { lineId: number; quantity: number }[]; reasonId: number; shouldKeepPreviousStatus?: boolean },
) {
  return call<undefined>(
    auth, "PUT",
    `/integration/order/sellers/${auth.supplierId}/shipment-packages/${packageId}/items/unsupplied`,
    {
      lines: p.lines,
      reasonId: p.reasonId,
      shouldKeepPreviousStatus: p.shouldKeepPreviousStatus ?? true,
    });
}

/**
 * Trimite AWB-ul propriu catre Trendyol.
 *
 * Pe marketplace-ul international, jumatate din curieri sunt platiti de vanzator
 * (DPD, DHL, GLS, PACKETA): acolo Trendyol NU are de unde sa stie numarul de
 * urmarire, iar comanda ramane blocata daca nu il trimitem noi. Doar curierii
 * „platiti de Trendyol" (FAN Courier, DPD-RO, FANEX) isi completeaza singuri AWB-ul.
 *
 * Pachetul trebuie sa fie deja pe „Picking"; dupa „Shipped" nu se mai poate schimba.
 */
export function updateTrackingDetails(
  auth: TrendyolAuth,
  packageId: number,
  body: { cargoSenderNumber: string; providerCode: string; returnTrackingNumber?: string },
) {
  return call<undefined>(
    auth, "PUT", `/integration/order/sellers/${auth.supplierId}/shipment-packages/${packageId}/tracking-details`, body);
}

// ── Webhooks ──────────────────────────────────────────────────────────────────
/* ═══════════════════════════════════════════════════════════════════════════
   RETURURILE (CLAIMS)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cererile de retur ale vanzatorului.
 *
 * ⚠ PANA AZI NU CITEAM NIMIC DIN ASTA. Tot ce stia Edinio despre un retur era statusul
 * grosier al pachetului (`Returned`) — nu ce articol s-a intors, nu cate bucati, nu de ce, si
 * nu daca cererea asteapta o hotarare de la comerciant.
 *
 * ⚠ FEREASTRA E OBLIGATORIE LA EI si e de cel mult doua saptamani, ca la comenzi. Ceruta mai
 * larga, serviciul raspunde 400 — deci cronul cere ferestre scurte si le mata inainte cu un
 * cursor, exact ca la comenzi.
 */
export function getClaims(
  auth: TrendyolAuth,
  params: { startDate: number; endDate: number; page?: number; size?: number; claimIds?: string[]; claimItemStatus?: string },
) {
  const q = new URLSearchParams();
  q.set("startDate", String(params.startDate));
  q.set("endDate", String(params.endDate));
  if (params.page != null) q.set("page", String(params.page));
  /* Serviciul lor taie la 200; cerut mai mult, raspunde 400. */
  if (params.size != null) q.set("size", String(Math.max(1, Math.min(200, params.size))));
  if (params.claimIds?.length) q.set("claimIds", params.claimIds.join(","));
  if (params.claimItemStatus) q.set("claimItemStatus", params.claimItemStatus);
  return call<{
    content?: TrendyolClaim[];
    totalElements?: number; totalPages?: number; page?: number; size?: number;
  }>(auth, "GET",
    `/integration/order/sellers/${auth.supplierId}/claims${sufixulRegiunii(auth)}?${q.toString()}`);
}

/**
 * Aproba returul pentru anumite LINII ale cererii.
 *
 * ⚠ PE LINII, nu pe cerere: Trendyol are retururi partiale, iar comerciantul poate accepta o
 * bucata si respinge alta din aceeasi cerere. O aprobare „pe tot" ar fi luat o hotarare pe
 * care el n-a luat-o.
 */
/**
 * Golful are capetele LUI pentru retururi.
 *
 * ═══ ⚠ EUROPA SI GOLFUL NU IMPART ACELEASI CAI ═══
 *
 * Trendyol are o sectiune separata de documentatie, „Returned Order Integration for GULF
 * region", cu variante `-gulf` ale acelorasi servicii. Trimise pe calea europeana, cererile
 * unui vanzator din Golf nu gasesc nimic — si asta ARATA la fel ca „n-are retururi".
 *
 * ⚠ NEVERIFICAT PE TRAFIC, si se spune pe fata: niciunul dintre conturile noastre nu e
 * inregistrat in Golf, deci n-am avut cum sa lovim capetele astea. Numele vine din indexul lor
 * de documentatie. Pe vitrinele europene — singurele pe care le folosim azi — nu se schimba
 * nimic.
 */
const VITRINE_GOLF = new Set(["SA", "AE", "KW", "QA", "BH", "OM"]);

export function eVitrinaGolf(vitrina: string | undefined): boolean {
  return VITRINE_GOLF.has((vitrina ?? "").toUpperCase());
}

/** Sufixul cerut de regiunea vitrinei. `""` pentru Europa. */
function sufixulRegiunii(auth: TrendyolAuth): string {
  return eVitrinaGolf(auth.storefront) ? "-gulf" : "";
}

export function approveClaimItems(auth: TrendyolAuth, claimId: string, claimLineItemIdList: string[]) {
  return call<undefined>(
    auth, "PUT",
    `/integration/order/sellers/${auth.supplierId}/claims${sufixulRegiunii(auth)}/${encodeURIComponent(claimId)}/items/approve`,
    { claimLineItemIdList });
}

/**
 * Respinge liniile, cu motiv si (optional) dovezi.
 *
 * ═══ ⚠ NU E JSON, SI LISTA NU E O LISTA (26.08.2026) ═══
 *
 * Trimiteam un corp JSON cu `claimItemIdList` ca tablou. Referinta lor cere altceva, si
 * amandoua deosebirile conteaza:
 *
 *   - `multipart/form-data`, fiindca la aceeasi cerere se pot atasa si dovezi (poze, PDF-uri);
 *   - `claimItemIdList` ca SIR despartit prin virgula, nu ca tablou;
 *   - `description` de cel mult 500 de caractere.
 *
 * ⚠ Trimis in forma veche, serviciul refuza cererea intreaga — iar comerciantul ramane cu
 * „am respins" apasat si cu returul netratat la ei, care le expira in favoarea clientului.
 *
 * ⚠ ANTETUL NU SE SCRIE DE MANA. `fetch` pune singur `Content-Type: multipart/form-data` CU
 * granita, cand corpul e un `FormData`; scris de noi, granita ar lipsi si corpul n-ar putea fi
 * despartit de nimeni.
 */
export function rejectClaimItems(
  auth: TrendyolAuth, claimId: string,
  p: { claimIssueReasonId: number; claimItemIdList: string[]; description: string; files?: Blob[] },
) {
  const corp = new FormData();
  corp.set("claimIssueReasonId", String(p.claimIssueReasonId));
  corp.set("claimItemIdList", p.claimItemIdList.join(","));
  corp.set("description", p.description.slice(0, 500));
  for (const f of p.files ?? []) corp.append("files", f);
  return call<undefined>(
    auth, "POST", `/integration/order/sellers/${auth.supplierId}/claims/${encodeURIComponent(claimId)}/issue`,
    corp);
}

/** Motivele pe care le accepta ei la respingere. Se citesc, nu se ghicesc. */
export function getClaimIssueReasons(auth: TrendyolAuth) {
  return call<{ id: number; name: string; externalReasonId?: number }[]>(
    auth, "GET", "/integration/order/claim-issue-reasons");
}

export function createWebhook(
  auth: TrendyolAuth,
  body: { url: string; authenticationType: "BASIC_AUTHENTICATION" | "API_KEY"; username?: string; password?: string; apiKey?: string; subscribedStatuses?: string[]; countryCodes?: string[] },
) {
  return call<{ id?: string }>(auth, "POST", `/integration/webhook/sellers/${auth.supplierId}/webhooks`, body);
}
export function deleteWebhook(auth: TrendyolAuth, webhookId: string) {
  return call<undefined>(auth, "DELETE", `/integration/webhook/sellers/${auth.supplierId}/webhooks/${encodeURIComponent(webhookId)}`);
}
export function getWebhooks(auth: TrendyolAuth) {
  return call<{ id?: string; url?: string }[]>(auth, "GET", `/integration/webhook/sellers/${auth.supplierId}/webhooks`);
}
