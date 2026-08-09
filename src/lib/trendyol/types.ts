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

/** Cotele de TVA acceptate de o vitrina. Trimis altceva, produsul e respins. */
export function coteTvaVitrina(code: TrendyolStoreFront | undefined): number[] {
  return infoVitrina(code).tva;
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
  user_agent_company?: string;      // User-Agent "{sellerId} - {company}" (default SelfIntegration)
  seller_name?: string;
  // Catalog defaults resolved from Trendyol.
  shipment_address_id?: number;
  returning_address_id?: number;
  /**
   * Curierul implicit, ca `providerCode` (sir). Se foloseste la trimiterea
   * AWB-ului, nu la crearea produsului.
   */
  default_carrier_code?: string;
  /** @deprecated ID numeric turcesc; nu exista pe international. Ignorat. */
  default_cargo_company_id?: number;
  currency?: string;                // moneda vitrinei (RO -> RON)
  brand_id?: number;
  brand_name?: string;
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
  needs_reconnect?: boolean;
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
  customAttributeValue?: string;
}
// Campurile sunt exact cele din „Product Create V2" pe marketplace-ul
// international. `currencyType` si `cargoCompanyId` NU exista acolo (sunt din
// versiunea domestica turceasca): moneda o da vitrina, iar curierul se comunica
// separat, la expediere. Trimise degeaba, ingreuneaza payload-ul si pot fi
// respinse la validare.
export interface TrendyolProductItem {
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
}

// ── Orders (shipment packages we RECEIVE) ─────────────────────────────────────
export interface TrendyolOrderLine {
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
  currencyCode?: string;
  lines: TrendyolOrderLine[];
  [k: string]: unknown;
}
