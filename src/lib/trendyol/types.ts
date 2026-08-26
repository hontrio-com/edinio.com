// Shared types for the Trendyol Marketplace integration (Partner API v3.0).
// Base (prod): https://apigw.trendyol.com — auth via HTTP Basic (apiKey:apiSecret)
// + required User-Agent header + supplierId in the URL path.
//
// Structurally a cousin of [[aboutyou-integration-plan]]: variant-first catalog
// (variants grouped by `productMainId`, one per `barcode`), everything write-side
// is async batch (submit -> batchRequestId -> poll batch-requests), orders flow
// back as shipment packages. KEY differences vs About You: Basic auth and barcode
// as the identifier.
//
// ATENTIE la versiune: exista trei seturi de documentatie, iar Romania e pe cel
// INTERNATIONAL (v3.0). Fata de cel domestic turcesc, acolo: antetul
// `storeFrontCode` e obligatoriu, `currencyType` si `cargoCompanyId` nu exista in
// payload-ul de produs, curierii au coduri-sir (nu ID-uri), iar la curierii platiti
// de vanzator AWB-ul trebuie trimis de noi.

export type TrendyolEnvironment = "stage" | "production";

/**
 * Vitrina (tara) pe care vinde comerciantul.
 *
 * Marketplace-ul international cere antetul `storeFrontCode` pe PRACTIC TOATE
 * apelurile — OpenAPI il declara `required: true`. Fara el, gateway-ul nu poate
 * lega vanzatorul de o vitrina si raspunde „Tedarikci bulunamadi" (furnizor
 * negasit), desi cheile sunt bune. Nu e un credential din portal: e o alegere a
 * comerciantului, si e primul lucru de completat.
 *
 * Sursa: developers.trendyol.com/v3.0/docs/5-regions-and-store-front-codes
 */
export type TrendyolStoreFront = "RO" | "GR" | "BG" | "CZ" | "SK" | "DE" | "SA" | "AE" | "KW";

export interface TrendyolStoreFrontInfo {
  code: TrendyolStoreFront;
  tara: string;
  regiune: "CEE" | "Europa" | "GULF";
  /** Cotele de TVA acceptate. Orice alta valoare = produs respins. */
  tva: number[];
  /** Moneda in care Trendyol interpreteaza preturile vitrinei. */
  moneda: string;
}

// Sursa: developers.trendyol.com/v3.0/docs/5-regions-and-store-front-codes
// (cotele sunt copiate exact din tabelul lor — SA si AE nu au 0).
export const TRENDYOL_STOREFRONTS: TrendyolStoreFrontInfo[] = [
  { code: "RO", tara: "România", regiune: "CEE", tva: [0, 11, 21], moneda: "RON" },
  { code: "BG", tara: "Bulgaria", regiune: "CEE", tva: [0, 9, 20], moneda: "BGN" },
  { code: "GR", tara: "Grecia", regiune: "CEE", tva: [0, 6, 13, 24], moneda: "EUR" },
  { code: "CZ", tara: "Cehia", regiune: "CEE", tva: [0, 12, 21], moneda: "CZK" },
  { code: "SK", tara: "Slovacia", regiune: "CEE", tva: [0, 19, 23], moneda: "EUR" },
  { code: "DE", tara: "Germania", regiune: "Europa", tva: [0, 7, 19], moneda: "EUR" },
  { code: "SA", tara: "Arabia Saudită", regiune: "GULF", tva: [15], moneda: "SAR" },
  { code: "AE", tara: "Emiratele Arabe Unite", regiune: "GULF", tva: [5], moneda: "AED" },
  { code: "KW", tara: "Kuweit", regiune: "GULF", tva: [0], moneda: "KWD" },
];

/** Vitrina implicita: platforma e romaneasca, deci si comerciantii sunt. */
export const TRENDYOL_DEFAULT_STOREFRONT: TrendyolStoreFront = "RO";

export function infoVitrina(code: TrendyolStoreFront | undefined): TrendyolStoreFrontInfo {
  return TRENDYOL_STOREFRONTS.find((s) => s.code === code) ?? TRENDYOL_STOREFRONTS[0];
}

/**
 * Cotele de TVA acceptate de o vitrina.
 *
 * ⚠ `origine` NU e un parametru decorativ. Sub Cross Country, un vanzator cu
 * originea in Romania care listeaza pe GR sau BG poate folosi si cotele
 * ROMANESTI (11 si 21), pe langa cele locale — documentatia lor o spune explicit.
 * Un tabel fix „GR ⇒ {0,6,13,24}" ar respinge cote perfect legale, iar
 * `tvaPentruVitrina` le-ar „corecta" tacit la altceva: produsul s-ar lista cu
 * TVA gresit si s-ar vinde asa.
 *
 * Romania e SINGURA tara-sursa de Cross Country din tot v3.0, deci cazul asta e
 * exact al comerciantilor nostri.
 */
export function coteTvaVitrina(
  code: TrendyolStoreFront | undefined,
  origine?: TrendyolStoreFront | undefined,
): number[] {
  const locale = infoVitrina(code).tva;
  const esteCrossCountryRo = origine === "RO" && (code === "GR" || code === "BG");
  if (!esteCrossCountryRo) return locale;
  const aleOriginii = infoVitrina("RO").tva;
  return [...new Set([...locale, ...aleOriginii])].sort((a, b) => a - b);
}

/**
 * Cota de TVA implicita a vitrinei: cea mai mare (standard).
 *
 * Pentru Romania asta inseamna 21. Cota veche de 19 NU mai e acceptata: vitrina
 * RO primeste doar 0, 11 sau 21, iar un produs trimis cu 19 e respins.
 */
export function tvaImplicitVitrina(code: TrendyolStoreFront | undefined): number {
  const cote = coteTvaVitrina(code);
  return cote.length > 0 ? Math.max(...cote) : 21;
}

export const TRENDYOL_CURRENCY = "RON";
export const TRENDYOL_DEFAULT_VAT = 21;

/**
 * Curierii marketplace-ului international, pe vitrine.
 *
 * NU sunt ID-uri numerice: pe international, curierul se comunica prin `providerCode`
 * (sir), la serviciul „update tracking number", si NU face parte din payload-ul de
 * creare a produsului (acolo `cargoCompanyId` pur si simplu nu exista).
 *
 * `platesteVanzatorul: true` = tu contractezi curierul si TREBUIE sa trimiti AWB-ul
 * catre Trendyol. `false` = plateste Trendyol, iar AWB-ul vine inapoi in comanda.
 *
 * Sursa: developers.trendyol.com/v3.0/docs/8-carrier-companies
 */
export interface TrendyolCarrier {
  code: string;
  name: string;
  platesteVanzatorul: boolean;
  /** Vitrinele pe care curierul e disponibil. */
  vitrine: TrendyolStoreFront[];
  nota?: string;
}

export const TRENDYOL_CARRIERS: TrendyolCarrier[] = [
  // Romania.
  { code: "FANCOURIER", name: "FAN Courier", platesteVanzatorul: false, vitrine: ["RO"], nota: "RO catre RO" },
  { code: "DPD-RO", name: "DPD România", platesteVanzatorul: false, vitrine: ["RO", "GR", "BG"], nota: "din RO catre RO, GR sau BG" },
  { code: "FANEX", name: "FANEX", platesteVanzatorul: false, vitrine: ["RO"], nota: "RO catre RO" },
  { code: "DPDMP", name: "DPD", platesteVanzatorul: true, vitrine: ["RO", "DE"] },
  { code: "DHLMP", name: "DHL", platesteVanzatorul: true, vitrine: ["RO", "DE"] },
  { code: "GLS", name: "GLS", platesteVanzatorul: true, vitrine: ["RO"] },
  { code: "GENIKI", name: "GENIKI", platesteVanzatorul: true, vitrine: ["RO", "GR"], nota: "doar RO catre GR" },
  { code: "PACKETA", name: "PACKETA", platesteVanzatorul: true, vitrine: ["RO", "SK", "CZ", "GR"] },
  // Restul Europei.
  { code: "HERMESMP", name: "Hermes", platesteVanzatorul: true, vitrine: ["DE"] },
  { code: "DHLEXPMP", name: "DHL Express", platesteVanzatorul: true, vitrine: ["DE"] },
  { code: "ACS Courier", name: "ACS Courier", platesteVanzatorul: true, vitrine: ["GR"] },
];

/** Curierii pe care ii poate alege un vanzator de pe vitrina data. */
export function curieriVitrina(code: TrendyolStoreFront | undefined): TrendyolCarrier[] {
  const v = code ?? TRENDYOL_DEFAULT_STOREFRONT;
  return TRENDYOL_CARRIERS.filter((c) => c.vitrine.includes(v));
}

// Selected attribute value for a product (predefined id or freetext when allowCustom).
export interface TrendyolAttributeValue {
  attributeId: number;
  attributeValueId?: number;
  /**
   * Mai multe valori pe acelasi atribut.
   *
   * ⚠ EXISTA IN API-UL LOR, si taxonomia ne-o spunea deja: cand
   * `allowMultipleAttributeValues` e `true` la o categorie, atributul acela primeste
   * `attributeValueIds: [123, 456]`. Noi citeam steagul din taxonomie si nu-l foloseam
   * nicaieri, deci o categorie cu un atribut multi-select OBLIGATORIU nu putea fi
   * reprezentata: se trimitea o singura valoare, iar ei refuzau produsul.
   *
   * ⚠ NU SE TRIMIT AMANDOUA. `attributeValueId` si `attributeValueIds` se exclud; cand exista
   * lista, ea pleaca si singularul se lasa deoparte.
   */
  attributeValueIds?: number[];
  customAttributeValue?: string;
}

// One mapped Edinio category -> Trendyol leaf category + defaults.
export interface TrendyolCategoryMapEntry {
  category_id: number;
  label: string;                    // human path, e.g. "Giyim > Tişört"
  brand_id?: number;                // default brand for this category
  brand_name?: string;              // numele lui, ca sa nu afisam ID-ul brut
  attributes?: TrendyolAttributeValue[]; // default category attribute values
}

// Per-store connection + settings, stored in store_settings.trendyol_config (jsonb).
// SECURITY: `api_key`, `api_secret`, `webhook_secret` are server-only. Server
// actions never return them to the client (only booleans + a masked preview).
export interface TrendyolConfig {
  connected?: boolean;
  supplier_id?: string;             // Trendyol sellerId
  api_key?: string;
  api_secret?: string;
  environment?: TrendyolEnvironment;
  /** Vitrina/tara: antet `storeFrontCode`, obligatoriu pe marketplace-ul international. */
  storefront?: TrendyolStoreFront;
  /**
   * Vitrinele de DESTINATIE, cand comerciantul si-a extins prin Cross Country.
   *
   * ⚠ Sub Cross Country, antetul difera pe servicii: produsele se citesc cu
   * vitrina de ORIGINE (RO), dar comenzile cu cea de DESTINATIE (BG/GR). Un cod
   * care tine o singura vitrina per conexiune citeste produsele corect si NU
   * vede niciodata comenzile din tarile in care s-a extins.
   *
   * Gol pentru comerciantii neextinsi, adica pentru toti azi.
   */
  cross_country_storefronts?: TrendyolStoreFront[];
  /**
   * Tara de ORIGINE a vanzatorului. Conteaza doar sub Cross Country, unde
   * decide ce cote de TVA sunt legale pe vitrina de destinatie.
   */
  origine?: TrendyolStoreFront;
  /** Marcajul ferestrei de retururi. ⚠ Fereastra lor e de cel mult doua saptamani. */
  /**
   * Comerciantul factureaza CLIENTUL FINAL la Trendyol, si vrea ca Edinio s-o faca.
   *
   * ⚠ MASURAT PE API-UL LOR ca asa stau lucrurile: `invoiceAddress` poarta numele si adresa
   * clientului, iar `invoiceStatus`/`invoiceNumber` sunt campuri pe care doar vanzatorul le
   * misca — si erau „NotInvoiced"/gol pe toate comenzile contului.
   *
   * ⚠ DAR RAMANE STINS DIN START, si nu din nehotarare: `invoiceNumber` la ei are format fix
   * (3 alfanumerice + 13 cifre) in care o serie romaneasca obisnuita nu incape, iar ei n-au
   * niciun capat de corectie sau stergere — fiecare trimitere e cu un singur foc si pe veci.
   * Raspunderea fiscala e a comerciantului, deci si hotararea.
   */
  factureaza_clientul?: boolean;
  /**
   * Comenzile se citesc prin `orders/stream`, nu prin paginarea clasica.
   *
   * ⚠ STINS DIN START. Calea de azi merge si e verificata; fluxul rezolva un plafon
   * (`maxQueryWindowResult = 10000`) la care magazinele noastre nu ajung. Comenzile sunt calea
   * cea mai sensibila din toata integrarea — ele misca stocul — si nu se schimba sub un magazin
   * care merge, pentru o problema pe care n-o are.
   */
  foloseste_stream?: boolean;
  claims_synced_at?: string;
  /**
   * ⚠ Pozitia pe FIECARE vitrina. Cu un marcaj comun, o vitrina cazuta ii tine pe loc pe
   * celelalte, iar una care merge inainte o poate SARI pe cea cazuta — si atunci retururile ei
   * ies din fereastra de doua saptamani si nu se mai citesc niciodata.
   *
   * Comenzile aveau deja regula asta; retururile nu.
   */
  claims_synced_per_storefront?: Partial<Record<TrendyolStoreFront, string>>;
  /**
   * Cat de lata sa fie fereastra de retururi, pe fiecare vitrina.
   *
   * ⚠ EXISTA CA SA POATA PROGRESA. Retururile n-au cursor, iar `getClaims` n-are parametru de
   * sortare documentat — deci un cursor cladit pe ordinea paginilor ar sari peste cereri. Cand
   * o fereastra are mai multe pagini decat citim intr-o trecere, se ingusteaza si se tine minte
   * ingustata; altfel trecerea urmatoare ar cere iar doua saptamani si ar relua ACELEASI pagini,
   * la nesfarsit.
   */
  claims_fereastra_per_storefront?: Partial<Record<TrendyolStoreFront, number>>;
  /**
   * Tara in care s-a FABRICAT produsul, implicita pentru tot magazinul.
   *
   * ⚠ NU E `origine`, care e chiar deasupra. Aceea e originea VANZATORULUI, folosita la
   * cotele de TVA sub Cross Country. Asta e tara de fabricatie a marfii, ceruta de Trendyol
   * ca `origin` de nivel intai — optionala de pe 17.08.2026, OBLIGATORIE din 23.10.2026.
   *
   * ⚠ E doar un implicit, si de-aia se poate scrie si pe listare: un magazin din Romania
   * vinde hrana facuta in Germania si jucarii facute in China. O valoare pusa peste tot ar
   * fi o declaratie falsa, nu o comoditate.
   */
  /* ⚠ `null` inseamna „scoate-o", si de-aia tipul il ingaduie: fara el, comerciantul care si-a
     pus tara gresit n-ar mai fi putut s-o SCOATA — doar s-o inlocuiasca. Vezi `jsonb_merge_config`. */
  default_country_of_origin?: string | null;
  user_agent_company?: string;      // User-Agent "{sellerId} - {company}" (default SelfIntegration)
  seller_name?: string;
  /*
   * Catalog defaults resolved from Trendyol.
   *
   * ⚠ SI `null`, NU DOAR LIPSA (26.08.2026). De cand configurarea se scrie ca PETIC imbinat
   * in Postgres, cheia absenta inseamna „las-o cum e" — deci un camp pe care comerciantul
   * l-a golit trebuie sa plece ca `null` ca sa se stearga cu adevarat. Cititorii il iau
   * drept lipsa oricum, fiindca toti intreaba pe adevarat/fals, nu `!== undefined`.
   */
  shipment_address_id?: number | null;
  returning_address_id?: number | null;
  /**
   * Curierul implicit, ca `providerCode` (sir). Se foloseste la trimiterea
   * AWB-ului, nu la crearea produsului.
   */
  default_carrier_code?: string | null;
  /** @deprecated ID numeric turcesc; nu exista pe international. Ignorat. */
  default_cargo_company_id?: number;
  currency?: string;                // moneda vitrinei (RO -> RON)
  /** ⚠ Si `null`: vezi nota de la adrese. */
  brand_id?: number | null;
  brand_name?: string | null;
  category_map?: Record<string, TrendyolCategoryMapEntry>;
  // Webhook (credentials WE set; Trendyol echoes them so we can verify).
  webhook_id?: string;
  webhook_secret?: string;
  auto_sync?: boolean;
  /**
   * Publica pe Trendyol orice produs nou din magazin, fara trecere prin editor.
   * Listarea se construieste din maparea categoriei; produsele cu categoria
   * nemapata esueaza vizibil in coada, nu pleaca gresit.
   */
  auto_publish?: boolean;
  last_sync_at?: string;
  orders_synced_at?: string;
  /**
   * Marcajul comenzilor, PE FIECARE vitrina.
   *
   * Cu un singur marcaj, o vitrina cazuta le tine pe celelalte pe loc, iar una
   * care merge inainte o poate SARI pe cea cazuta — si atunci comenzile ei se
   * pierd definitiv dupa ce ies din fereastra de doua saptamani.
   * `orders_synced_at` ramane pentru vitrina principala, ca nimeni sa nu-si
   * piarda pozitia la livrarea care a introdus campul asta.
   */
  orders_synced_per_storefront?: Partial<Record<TrendyolStoreFront, string>>;
  needs_reconnect?: boolean;
  /**
   * Pagina de la care continua reconcilierea aprobarilor.
   *
   * Fara ea, fiecare rulare relua primele cinci pagini: dintr-un catalog de o
   * mie de produse aprobate, cele de dupa a cincea suta nu erau vazute
   * NICIODATA, oricat de des ar fi rulat cronul.
   */
  reconcile_page?: number;
}

// ── Statuses ──────────────────────────────────────────────────────────────────
export type TrendyolListingStatus =
  | "draft" | "pending" | "created" | "approved" | "active" | "rejected" | "inactive" | "error";

// Shipment package (order) statuses.
export type TrendyolOrderStatus =
  | "Awaiting" | "Created" | "Picking" | "Invoiced" | "Shipped" | "AtCollectionPoint"
  | "Delivered" | "UnDelivered" | "Returned" | "Cancelled" | "UnPacked" | "UnSupplied";

// ── Async batch envelope ──────────────────────────────────────────────────────
export interface TrendyolBatchAck { batchRequestId: string }

export interface TrendyolBatchResultItem<T = unknown> {
  requestItem?: T;
  status: "SUCCESS" | "FAILED" | string;
  failureReasons?: string[];
}
export interface TrendyolBatchResult<T = unknown> {
  batchRequestId: string;
  status: string;                   // COMPLETED | PROCESSING | ...
  items: TrendyolBatchResultItem<T>[];
  itemCount?: number;
  failedItemCount?: number;
  batchRequestType?: string;        // ProductV2OnBoarding | ProductV2Update | ProductInventoryUpdate
}

// ── Nomenclature entities ─────────────────────────────────────────────────────
export interface TrendyolCategory {
  id: number;
  name: string;
  parentId?: number | null;
  subCategories?: TrendyolCategory[];
}
export interface TrendyolAttributeValueDef { id: number; name: string }
export interface TrendyolCategoryAttribute {
  attribute: { id: number; name: string };
  required: boolean;
  allowCustom?: boolean;
  varianter?: boolean;              // true => variant dimension (size/color)
  allowMultipleAttributeValues?: boolean;
  slicer?: boolean;
  attributeValues?: TrendyolAttributeValueDef[];
}
export interface TrendyolBrand { id: number; name: string }
export interface TrendyolCargoProvider { id: number; name: string; code?: string }
// Numele campurilor sunt cele din raspunsul real (`shipmentAddress`, nu
// `isShipmentAddress` — varianta cu „is" e din documentatia domestica si nu se
// potriveste niciodata, adica adresele ar fi ramas nefiltrate in selector).
export interface TrendyolSupplierAddress {
  id: number;
  addressType?: string;             // Shipment | Invoice | Returning
  country?: string;
  city?: string;
  district?: string;
  postCode?: string;
  address?: string;
  fullAddress?: string;
  shipmentAddress?: boolean;
  returningAddress?: boolean;
  invoiceAddress?: boolean;
  default?: boolean;
}

/** Adresa e buna de expediere? Trendyol raspunde cand cu flag, cand cu tip. */
export function esteAdresaDe(a: TrendyolSupplierAddress, fel: "Shipment" | "Returning" | "Invoice"): boolean {
  if (fel === "Shipment") return a.shipmentAddress === true || a.addressType === "Shipment";
  if (fel === "Returning") return a.returningAddress === true || a.addressType === "Returning";
  return a.invoiceAddress === true || a.addressType === "Invoice";
}
export interface TrendyolSupplierAddresses {
  supplierAddresses: TrendyolSupplierAddress[];
  defaultShipmentAddress?: TrendyolSupplierAddress | null;
  defaultReturningAddress?: TrendyolSupplierAddress | null;
  defaultInvoiceAddress?: TrendyolSupplierAddress | null;
}

// ── Product payload (what we SEND on createProducts) ──────────────────────────
export interface TrendyolImage { url: string }
export interface TrendyolProductAttribute {
  attributeId: number;
  attributeValueId?: number;
  /**
   * Mai multe valori pe acelasi atribut.
   *
   * ⚠ EXISTA IN API-UL LOR, si taxonomia ne-o spunea deja: cand
   * `allowMultipleAttributeValues` e `true` la o categorie, atributul acela primeste
   * `attributeValueIds: [123, 456]`. Noi citeam steagul din taxonomie si nu-l foloseam
   * nicaieri, deci o categorie cu un atribut multi-select OBLIGATORIU nu putea fi
   * reprezentata: se trimitea o singura valoare, iar ei refuzau produsul.
   *
   * ⚠ NU SE TRIMIT AMANDOUA. `attributeValueId` si `attributeValueIds` se exclud; cand exista
   * lista, ea pleaca si singularul se lasa deoparte.
   */
  attributeValueIds?: number[];
  customAttributeValue?: string;
}
// Campurile sunt exact cele din „Product Create V2" pe marketplace-ul
// international. `currencyType` si `cargoCompanyId` NU exista acolo (sunt din
// versiunea domestica turceasca): moneda o da vitrina, iar curierul se comunica
// separat, la expediere. Trimise degeaba, ingreuneaza payload-ul si pot fi
// respinse la validare.
export interface TrendyolProductItem {
  /**
   * Tara de fabricatie, ISO 3166-1 alpha-2.
   *
   * ⚠ CAMP NOU DE NIVEL INTAI, adaugat de ei pe 17.08.2026. Optional pana pe 23.10.2026,
   * apoi obligatoriu. In perioada dintre ele, o categorie care cere „origine" si ca ATRIBUT
   * trebuie sa primeasca in continuare si atributul — deci cele doua NU se exclud.
   */
  origin?: string;
  barcode: string;                  // max 40, the variant identifier
  title: string;                    // max 100
  productMainId: string;            // max 40, groups variants
  brandId: number;
  categoryId: number;               // must be a LEAF category
  quantity: number;
  stockCode: string;                // max 100
  description: string;              // max 30000, HTML allowed
  listPrice: number;                // >= salePrice
  salePrice: number;
  vatRate: number;                  // must be one of the storefront's rates
  images: TrendyolImage[];          // max 8, HTTPS only
  attributes: TrendyolProductAttribute[];
  dimensionalWeight?: number;
  deliveryDuration?: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  /**
   * Garantia SGR, in moneda vitrinei.
   *
   * Obligatorie in ROMANIA, si numai acolo, pe categoriile de bauturi si uleiuri.
   * Vezi `necesitaSgr` si `pretSgr`.
   */
  sgrPrice?: number;
}

// ── SGR (Sistemul Garantie-Returnare) ─────────────────────────────────────────
/*
 * Garantia de ambalaj, obligatorie prin lege in Romania.
 *
 * ⚠ Se aplica DOAR pe vitrina RO — documentatia lor o spune raspicat: „SGR is
 * valid only for the listings in Romania" — si doar pe categoriile de mai jos,
 * transcrise una cate una din tabelul lor (38, nu un interval: `5643-5658` din
 * rezumat ascunde randuri, iar o categorie lipsa inseamna o listare refuzata).
 *
 * Valoarea e 0,50 lei pe UNITATE de ambalaj: un bax de sase doze inseamna 3 lei,
 * nu 0,50. De aceea numarul de unitati se poate scrie pe listare.
 */
export const TRENDYOL_CATEGORII_SGR: ReadonlySet<number> = new Set([
  1415, // Bauturi energizante
  1417, // Pudra pentru bauturi
  1419, // Sucuri
  1420, // Apa
  1421, // Bors / suc de sfecla
  1422, // Lapte UHT
  1439, // Uleiuri de gatit
  2401, // Cafea rece
  2404, // Ayran / lapte batut
  2405, // Salep
  2728, // Ceai rece
  2891, // Cola
  2892, // Bauturi racoritoare
  2893, // Bautura din malt
  2894, // Sifon si apa minerala
  2900, // Limonada
  3541, // Ulei
  4089, // Gheata
  4091, // Boza
  5067, // Chefir
  5068, // Bauturi functionale
  5069, // Ciocolata calda
  5643, // Vin
  5644, // Sampanie
  5645, // Whisky
  5646, // Vodca
  5647, // Coniac
  5648, // Gin
  5649, // Rom
  5650, // Lichior
  5651, // Tequila
  5652, // Aperitive
  5653, // Bauturi traditionale
  5654, // Bere
  5655, // Cocteiluri
  5656, // Vinars
  5657, // Vermut
  5658, // Alte bauturi alcoolice
]);

/** Garantia pentru o unitate de ambalaj, in lei. */
export const SGR_PE_UNITATE = 0.5;

/** Categoria asta cere SGR pe vitrina asta? */
export function necesitaSgr(categoryId: number | null | undefined, vitrina: TrendyolStoreFront | undefined): boolean {
  if (vitrina !== "RO") return false;
  return typeof categoryId === "number" && TRENDYOL_CATEGORII_SGR.has(categoryId);
}

/** Garantia de trimis, pentru un produs cu `unitati` ambalaje. */
export function pretSgr(unitati: number | null | undefined): number {
  const n = Number(unitati);
  const u = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return Math.round(u * SGR_PE_UNITATE * 100) / 100;
}

// ── Orders (shipment packages we RECEIVE) ─────────────────────────────────────
export interface TrendyolOrderLine {
  /** ⚠ Garantia SGR pe LINIE. Vezi nota de la `totalSgrFee`: se pastreaza, nu se aduna. */
  lineSgrFee?: number;
  lineId: number;
  quantity: number;
  productName?: string;
  barcode?: string;
  stockCode?: string;
  merchantSku?: string;
  price?: number;
  lineUnitPrice?: number;
  vatRate?: number;
  orderLineItemStatusName?: string;
  productSize?: string;
  productColor?: string;
}
export interface TrendyolShipmentPackage {
  shipmentPackageId: number;
  orderNumber: string;
  orderDate?: number;
  /**
   * Epoca in milisecunde a ULTIMEI MODIFICARI a pachetului.
   *
   * ⚠ Nu se confunda cu `orderDate`. Fereastra de interogare si sortarea merg
   * amandoua pe data ultimei modificari, iar cursorul de sincronizare se
   * construieste din campul asta: pe `orderDate` ar sari comenzi, fiindca acela
   * nu se misca atunci cand se schimba statusul pachetului.
   */
  lastModifiedDate?: number;
  status?: string;
  shipmentPackageStatus?: string;
  cargoTrackingNumber?: number | string | null;
  cargoTrackingLink?: string | null;
  cargoProviderName?: string | null;
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  shipmentAddress?: Record<string, unknown>;
  invoiceAddress?: Record<string, unknown>;
  packageTotalPrice?: number;
  totalPrice?: number;
  /**
   * Din ce pachet s-a nascut acesta, dupa o anulare partiala sau o spargere.
   *
   * ⚠ CITAT DIN DOCUMENTATIA LOR: „Bu alan iptal veya bölme işlemlerinden sonra doldurulur ve bu
   * işlemlerden sonra ilk paketin packageid'sini verir." — se completeaza dupa anulare sau
   * spargere si da id-ul pachetului INITIAL.
   *
   * ⚠ FARA EL, UN PACHET SPART DEVENEA O COMANDA NOUA la noi, si consuma stocul A DOUA OARA
   * pentru aceleasi bucati.
   */
  originPackageIds?: (number | string)[] | number | string | null;
  /**
   * Garantia SGR incasata pe tot pachetul.
   *
   * ⚠ ADAUGAT DE EI IN 2026, si noi il stiam doar pe partea de PRODUS (`sgrPrice`, cat
   * declaram la publicare). Pe comanda nu-l citeam deloc — deci nu puteam sti daca totalul
   * pachetului il cuprinde sau nu, si nici cat se intoarce la un retur.
   *
   * ⚠ NU SE ADUNA LA TOTAL DE CATRE NOI. `packageTotalPrice` e ce a platit clientul; daca SGR
   * e inauntru, adunat inca o data ar umfla comanda. Se pastreaza ca sa se POATA verifica, si
   * pe fiecare linie separat.
   */
  totalSgrFee?: number;
  currencyCode?: string;
  lines: TrendyolOrderLine[];
  [k: string]: unknown;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETURURILE (CLAIMS)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * O cerere de retur, asa cum vine de la ei.
 *
 * ⚠ TOATE CAMPURILE SUNT OPTIONALE, DINADINS. Forma raspunsului lor nu e in schema pe care o
 * avem, iar la eMAG exact presupunerea asta ne-a costat: `ownership` a venit `boolean` acolo
 * unde documentatia scria 1/2, si `doc_errors` a fost gol la toate cele 152 de oferte
 * respinse. De-aia `raw` se pastreaza intreg pe rand, si citirea e tolerantă.
 */
export interface TrendyolClaim {
  id?: string;
  /** Numele din referinta lor; `id` e cel din raspunsul viu. Se citesc amandoua. */
  claimId?: string;
  orderNumber?: string;
  orderDate?: number;
  claimDate?: number;
  lastModifiedDate?: number;
  /**
   * ⚠ ASTA E DENUMIREA LOR ADEVARATA (verificat in referinta `getClaims`).
   * `shipmentPackageId` nu exista in raspuns; il citeam si iesea mereu gol.
   */
  orderShipmentPackageId?: number;
  orderOutboundPackageId?: number;
  shipmentPackageId?: number;
  cargoTrackingNumber?: string | number;
  cargoProviderName?: string;
  /**
   * Coletul de retur-RESPINS: ce se intoarce la CLIENT dupa ce respingem returul.
   *
   * ⚠ LIPSESTE CU TOTUL cand nu s-a creat un asemenea colet, si asta NU e acelasi lucru cu
   * „dontShipBack: false". Documentatia lor o spune pe fata: „If there is no return rejection
   * package, this field will not appear." Absenta e a treia stare.
   */
  rejectedPackageInfo?: TrendyolColetRespins;
  /**
   * ⚠ ACEEASI CHEIE, SCRISA CU `p` MIC (26.08.2026).
   *
   * In raspunsul-exemplu din `reference/getclaims` scrie `"rejectedpackageinfo"`, tot cu litere
   * mici, iar pentru schimb `"replacementOutboundpackageinfo"`. Schema lor foloseste ALTA scriere
   * decat exemplul lor — deci nu se poate sti care vine in trafic. Se citesc amandoua.
   */
  rejectedpackageinfo?: TrendyolColetRespins;
  /**
   * ⚠ NU EXISTA IN RASPUNSUL LOR. Verificat in raspunsul-exemplu din `reference/getclaims`:
   * campurile de nivel intai ale unei cereri sunt `id`, `claimId`, `orderNumber`, `orderDate`,
   * `customerFirstName`, `customerLastName`, `claimDate`, `cargoTrackingNumber`,
   * `cargoTrackingLink`, `cargoSenderNumber`, `cargoProviderName`, `orderShipmentPackageId`,
   * `replacementOutboundpackageinfo`, `rejectedpackageinfo`, `items`, `lastModifiedDate`,
   * `orderOutboundPackageId`. `status` NU e printre ele.
   *
   * ⚠ SE PASTREAZA DOAR CA SA NU FIE RECITIT DIN GRESEALA. Starea unei cereri se ia din liniile
   * ei — vezi `stareaCererii`. Scris in baza de aici, `claim_status` iesea NULL la fiecare rand,
   * iar panoul care filtra pe el ramanea gol.
   */
  status?: string;
  /**
   * ⚠ NU SUNT LINIILE. Fiecare element e un INVELIS: `orderLine` (ce produs) plus
   * `claimItems[]` (ce bucati s-au intors din el). Vezi `liniileReturului`.
   */
  items?: TrendyolClaimGrup[];
  /** Forma plata, pe care unele raspunsuri ale lor o mai dau. Se citeste tot. */
  claimItems?: TrendyolClaimItem[];
}

/**
 * Coletul care se intoarce la CLIENT dupa o respingere.
 *
 * ═══ ⚠ „RESPINS" NU INSEAMNA „GATA" (26.08.2026) ═══
 *
 * Regula lor, verbatim: „If `dontShipBack: true`: You do not need to ship the package back to
 * the customer. If `dontShipBack: false`: You must ship the package back to the customer only
 * if your rejection request has been accepted by Trendyol."
 *
 * Deci comerciantul apasa „Respinge", primeste 200, si crede ca a terminat — cand de fapt mai
 * are de expediat un colet inapoi. Nefacut, returul se intoarce impotriva lui.
 *
 * ⚠ RASPUNSUL LA RESPINGERE E DOAR `HTTP 200`, fara corp. Deci `dontShipBack` nu se poate citi
 * de-acolo: se afla abia la urmatoarea citire a cererilor.
 */
export interface TrendyolColetRespins {
  /** ⚠ Vine NUMERIC in exemplul lor, nu ca sir. */
  cargoTrackingNumber?: string | number;
  packageId?: number;
  cargoProviderName?: string;
  cargoTrackingLink?: string;
  /** Id-urile bucatilor (claimItem.id) care merg inapoi. */
  items?: string[];
  shipmentAddress?: Record<string, unknown>;
  dontShipBack?: boolean;
  /** PIN-ul de ridicare, cand curierul e de tip BoxNow. */
  sellerOtp?: string;
}

/** Invelisul din `items[]`: produsul o data, bucatile intoarse din el separat. */
export interface TrendyolClaimGrup {
  orderLine?: TrendyolClaimOrderLine;
  claimItems?: TrendyolClaimItem[];
  /* Campurile de mai jos apar cand raspunsul vine plat, nu invelit. */
  id?: string;
  claimItemId?: string;
  barcode?: string;
  productName?: string;
  quantity?: number;
  customerClaimItemReason?: { name?: string; externalReasonId?: number };
  trendyolClaimItemReason?: { name?: string };
  customerNote?: string;
  claimItemStatus?: { name?: string } | string;
}

/** Linia de comanda din care s-a intors marfa. Aici stau codul de bare si numele. */
export interface TrendyolClaimOrderLine {
  id?: number | string;
  productName?: string;
  barcode?: string;
  merchantSku?: string;
  productColor?: string;
  productSize?: string;
  price?: number;
  vatBaseAmount?: number;
  salesCampaignId?: number;
  productCategory?: string;
}

/**
 * O bucata intoarsa.
 *
 * ⚠ N-AU CAMP DE CANTITATE, si asta nu e o scapare: un retur de trei bucati vine ca TREI
 * elemente cu id-uri diferite. Deci o linie inseamna o bucata, iar repunerea in stoc aduna 1.
 */
export interface TrendyolClaimItem {
  id?: string;
  claimItemId?: string;
  orderLineItemId?: number | string;
  orderLineId?: number;
  barcode?: string;
  productName?: string;
  quantity?: number;
  customerClaimItemReason?: { name?: string; externalReasonId?: number };
  trendyolClaimItemReason?: { name?: string };
  note?: string;
  customerNote?: string;
  claimItemStatus?: { name?: string } | string;
  resolved?: boolean;
  autoAccepted?: boolean;
  acceptedBySeller?: boolean;
}

/**
 * Motivele pe care le primeste Trendyol la o anulare de linii.
 *
 * ⚠ ID-URILE SUNT ALE LOR, si nu se inventeaza: un id gresit e refuzat abia la trimitere, cand
 * comerciantul crede ca a anulat comanda — iar la ei ramane activa si pleaca la client.
 *
 * ⚠ 503 NU EXISTA, si il aveam (26.08.2026). Il luasem dintr-o pagina care il listeaza, iar
 * verificarea pe tabelul lor oficial l-a infirmat de doua ori: sunt 500, 501, 502, 504, 505,
 * 506 — fara 503. Un comerciant care l-ar fi ales primea un refuz pe care nu-l putea intelege,
 * si comanda ii ramanea neanulata la ei.
 *
 * ⚠ NU SE POT CITI DE LA EI. Spre deosebire de motivele de respingere a returului
 * (`claim-issue-reasons`, care raspunde), niciun capat de anulare nu raspunde pe contul nostru
 * (probat: 556 si 401 pe trei cai). Deci lista e cea publicata de ei, scrisa aici o data.
 */
export const MOTIVE_ANULARE_TRENDYOL: { id: number; nume: string }[] = [
  { id: 500, nume: "Nu mai am produsul pe stoc" },
  { id: 501, nume: "Produsul e defect sau deteriorat" },
  { id: 502, nume: "Prețul era greșit" },
  { id: 504, nume: "Eroare de integrare (preț sau stoc transferat greșit)" },
  { id: 505, nume: "Același client a cumpărat în cantitate mare, după reducere" },
  { id: 506, nume: "Forță majoră" },
];

/**
 * Motivele de respingere a returului, in romaneste.
 *
 * ═══ ⚠ EI LE DAU NUMAI IN TURCA (26.08.2026) ═══
 *
 * Probat direct pe API-ul lor, cu `storeFrontCode: RO` si `Accept-Language: ro`, apoi cu `INT`
 * si `en`: aceleasi propozitii turcesti de fiecare data. Capatul `claim-issue-reasons` pur si
 * simplu nu traduce.
 *
 * ⚠ DECI ECRANUL AR FI ARATAT „Müşteriden gelen ürün defolu/zarar görmüş" unui comerciant din
 * Romania, intr-o lista din care trebuie sa aleaga inainte sa respinga un retur. Ar fi ales
 * la nimereala, si a nimeri gresit aici inseamna un arbitraj pierdut.
 *
 * ⚠ ID-URILE RAMAN ALE LOR, si lista tot de la ei se citeste. Aici se traduce DOAR eticheta;
 * un motiv nou, pe care ei il adauga si noi nu-l stim, se arata cu numele lui turcesc — mai
 * bine asa decat sa dispara din lista.
 */
export const MOTIVE_RETUR_RO: Record<number, string> = {
  51: "Produsul primit de la client e folosit",
  151: "Produsului primit de la client îi lipsește o piesă sau un accesoriu",
  201: "Produsul primit de la client e altul decât cel trimis",
  251: "Produsul primit de la client e defect sau deteriorat",
  401: "Din produsele primite de la client lipsesc bucăți",
  451: "Trimit produsul primit de la client la analiză",
  1651: "Coletul de retur trimis de client nu a ajuns la mine",
  1701: "Produsul pe care l-am trimis nu e greșit",
  1751: "Produsul pe care l-am trimis nu e defect",
  1801: "Nu s-a găsit niciun defect de fabricație",
  1851: "Produsul a fost înlocuit",
  1901: "Produsul a fost reparat",
  1951: "Clientul nu a emis factura de retur pentru firmă",
  2001: "Clientul a emis greșit factura de retur pentru firmă",
  2051: "Ambalajul unui produs cu risc de igienă a fost deschis",
  2101: "Cerere de schimb venită din întrebarea la comandă (a nu se folosi fără cererea clientului)",
  2151: "Trimit clientului factura pentru a duce produsul la service",
  2201: "Din produsul pe care l-am trimis nu lipsește nimic",
};

/** Starile in care cererea inca asteapta o hotarare de la comerciant. */
export const CLAIM_DE_HOTARAT = ["Created", "WaitingInAction", "InAnalysis"] as const;
