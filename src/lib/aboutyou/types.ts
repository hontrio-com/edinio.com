// Shared types for the About You Marketplace integration (SCAYLE Partner API v1).
// Base (production): https://partner.aboutyou.com/api/v1 — auth via `X-API-Key`.
//
// About You is a real fashion marketplace (not classifieds like OLX): the catalog
// is variant-first (variants grouped by `style_key`, one item per size/SKU),
// everything is async batch (submit -> batchRequestId -> poll `/results/*`), and
// orders flow BACK to the seller (webhooks + polling). Sandbox is a fully separate
// environment (own API key + isolated data; products auto-approve; a "Receive
// Orders" button simulates test orders).

export type AboutYouEnvironment = "sandbox" | "production";

export const ABOUTYOU_CURRENCY = "EUR";
export const DEFAULT_COUNTRY_OF_ORIGIN = "RO";

// Fulfillment models. v1 decision: dropshipping (seller ships with its own Edinio
// couriers; we push the tracking key + carrier to About You).
export type AboutYouFulfillmentType = "dropshipping" | "fulfillment_by_marketplace";

// Pricing. v1 decision: auto RON -> EUR using a configurable rate + margin.
export interface AboutYouFxConfig {
  rate?: number;        // 1 EUR = <rate> RON (e.g. 4.97)
  margin_pct?: number;  // extra margin (%) added on top of the converted price
  updated_at?: string;  // when the merchant last set/refreshed the rate
}

// One mapped Edinio category -> About You leaf category + defaults for its
// required attributes (mirrors the OLX category_map pattern, richer).
export interface AboutYouCategoryMapEntry {
  category_id: number;
  label: string;            // human path, e.g. "Femei > Rochii"
  brand_id?: number;        // default brand for this category (override per product)
  attributes?: number[];    // default attribute property IDs
}

// Per-store connection + settings, stored in store_settings.aboutyou_config (jsonb).
// SECURITY: `api_key` and `webhook_secret` are server-only. Server actions must
// never return them to the client (only booleans + a masked label).
export interface AboutYouConfig {
  connected?: boolean;
  api_key?: string;
  api_key_label?: string;
  api_key_added_at?: string;
  environment?: AboutYouEnvironment;
  seller_id?: string;
  seller_name?: string;
  // Webhook subscription (created via API; client_secret verifies signatures).
  webhook_subscription_id?: string;
  webhook_secret?: string;
  /**
   * Secret propriu, pus in URL-ul de abonare. Schema de semnatura a lui About You
   * nu e publicata, deci verificarea semnaturii e o deductie; tokenul asta e a
   * doua incuietoare, care nu depinde de nimic ghicit.
   */
  webhook_token?: string;
  // Fulfillment.
  fulfillment_type?: AboutYouFulfillmentType;
  default_carrier_key?: string;
  carrier_map?: Record<string, string>; // Edinio courier code -> About You carrier_key
  // Catalog defaults.
  default_country_of_origin?: string;   // ISO2, default "RO"
  brand_id?: number;                    // merchant's primary brand
  brand_name?: string;
  ship_countries?: string[];            // About You country codes to list in
  // Publicul magazinului. About You imparte arborele pe Women/Men/Girls/Boys, iar
  // categoriile romanesti („Genti") rareori spun pentru cine sunt — fara asta,
  // maparea automata n-ar avea cum sa aleaga intre ramuri.
  target_audience?: "women" | "men" | "girls" | "boys";
  // Pricing.
  price_mode?: "fx_from_ron" | "manual_eur";
  fx?: AboutYouFxConfig;
  category_map?: Record<string, AboutYouCategoryMapEntry>;
  auto_sync?: boolean;
  last_sync_at?: string;
  /**
   * De la ce pagina reia reconcilierea catalogului.
   *
   * ⚠ FARA EA SE PORNEA MEREU DE LA 1. Cu plafon de 50 de pagini si un buget de timp care se
   * termina de obicei mai devreme, un catalog mare nu ajungea NICIODATA la sfarsit: primele
   * pagini se reconciliau de zeci de ori pe ora, ultimele niciodata. Un produs respins de ei,
   * aflat pe pagina 60, ramanea la noi „activ" pentru totdeauna.
   *
   * ⚠ Cand catalogul se termina, se intoarce la 1: altfel cursorul ar creste la nesfarsit si de
   * la un punct fiecare rulare ar cere pagini goale.
   */
  reconcile_page?: number;
  /** Unde a ajuns roata pe `/products/rejected`. Vezi nota din `reconcileStatuses`. */
  rejected_page?: number;
  orders_synced_at?: string;
  needs_reconnect?: boolean;
}

// ── Statuses ──────────────────────────────────────────────────────────────────
// `local` = salvat la noi, netrimis niciodata. `draft` = About You l-a acceptat
// si asteapta publicarea. Cat timp amandoua se numeau `draft`, „Publică toate"
// incerca sa publice si produse care nu ajunsesera niciodata acolo.
export type AboutYouListingStatus =
  | "local" | "draft" | "pending" | "active" | "published" | "rejected" | "inactive" | "error";

export type AboutYouOrderItemStatus = "open" | "shipped" | "cancelled" | "returned";
export type AboutYouOrderStatus = "open" | "shipped" | "cancelled" | "returned" | "mixed";

// ── Async batch envelope ──────────────────────────────────────────────────────
export type AboutYouBatchStatus = "pending" | "processing" | "completed" | "retry" | "failed";

export interface AboutYouBatchAck { batchRequestId: string }

export interface AboutYouBatchResultItem<T = unknown> {
  requestItem?: T;
  success: boolean;
  errors?: string[];
}
export interface AboutYouBatchResult<T = unknown> {
  batchRequestId: string;
  status: AboutYouBatchStatus;
  items: AboutYouBatchResultItem<T>[];
}

// ── Nomenclature entities (confirmed against the API) ─────────────────────────
// GET /countries/ returns { countries, locales, currencies }.
export interface AboutYouCountry { code: string; name: string }
export interface AboutYouLocale { code: string; name: string }
export interface AboutYouCurrency { country_code: string; code: string; name: string }
export interface AboutYouCountriesResponse {
  countries: AboutYouCountry[];
  locales: AboutYouLocale[];
  currencies: AboutYouCurrency[];
}
// GET /brands/ returns a bare array (no pagination).
export interface AboutYouBrand { id: number; name: string; key?: string }
// GET /categories/ returns { items, pagination }. `material_composition_type`
// tells whether the category expects a textile (with fractions) or non-textile
// composition. There is no explicit leaf flag — infer from the tree.
export type AboutYouMaterialType = "textile" | "non-textile";
export interface AboutYouCategory {
  id: number;
  name: string;
  path?: string;
  parent_id?: number | null;
  material_composition_type?: AboutYouMaterialType | null;
}
// GET /categories/{id}/attribute-groups returns groups; a group's `attributes`
// are the selectable options (each with its own integer id). `is_multiselect`
// marks groups that accept several values; `is_default` marks suggested options.
export interface AboutYouAttribute {
  id: number;
  name: string;
  frontend_name: string;
  is_default?: boolean;
}
export interface AboutYouAttributeGroup {
  id: number;
  name: string;
  frontend_name: string;
  attributes: AboutYouAttribute[];
  is_multiselect?: boolean;
}
// GET /orders/carriers/ -> { items, pagination }. `key` is the carrier_key used
// when shipping order items.
export interface AboutYouCarrier {
  key: string;
  carrier_name?: string;
  country_code?: string;
  display_label?: string | null;
}

// Material composition (product payload). Textile components carry a `fraction`
// (percentages, expected to sum to 100); non-textile components omit it.
export interface AboutYouMaterialComponent { material_id: number; fraction?: number }
export interface AboutYouMaterialCluster { cluster_id: number; components: AboutYouMaterialComponent[] }

// Product status as READ from GET /products/ (differs from the settable status).
export type AboutYouReadStatus =
  | "draft" | "pending_approval" | "pending_active" | "active" | "rejected" | "inactive" | "problem";
export interface AboutYouRejectionReason { key?: string; type?: string; name?: string; description?: string }
// GET /products/ (GetProductItemSchema). Deliberately does NOT carry rejection
// data — that lives only on GET /products/rejected and on the
// `product_master.status_updated` webhook.
export interface AboutYouGetProductItem {
  style_key: string | null;
  sku: string;
  status: AboutYouReadStatus | string;
}
// GET /products/rejected (RejectedProductSchema).
export interface AboutYouRejectedProduct {
  style_key: string | null;
  rejection_reasons?: AboutYouRejectionReason[] | null;
  rejection_message?: string | null;
  rejected_product_ids_hint?: unknown;
}

// ── Product / variant payload (what we SEND on POST /products) ─────────────────
export interface AboutYouPrice {
  country_code: string;
  retail_price: number;
  sale_price?: number | null;
}
export interface AboutYouProductItem {
  style_key: string;
  sku: string;
  color: number;
  brand: number;
  category: number;
  weight: number;               // grams, 0..100000
  country_of_origin: string;    // ISO2
  attributes: number[];         // property IDs
  prices: AboutYouPrice[];      // >= 1
  images: string[];             // 1..10 URLs
  ean?: string;
  hs_code?: string;
  name?: string;
  descriptions?: Record<string, string>; // by locale
  // Required by the schema even though the value may be null: a missing key is a
  // 400 on the whole request. Typed as required so TypeScript enforces it.
  size: number | null;
  second_size?: number;
  quantity?: number;
  material_composition_textile?: AboutYouMaterialCluster[];
  material_composition_non_textile?: AboutYouMaterialCluster[];
  countries?: string[];
}

// ── Orders (what we RECEIVE on GET /orders) ───────────────────────────────────
// The full shipping-address shape is confirmed against the sandbox in Faza 3;
// kept loose here so ingestion can evolve without breaking the client.
export interface AboutYouOrderItem {
  id: number | null;
  sku: string;
  status: AboutYouOrderItemStatus;
  price_without_tax: number;
  price_with_tax: number;
  vat: number;
  shipment_tracking_key?: string | null;
  return_tracking_key?: string | null;
}
export interface AboutYouOrder {
  order_number?: string;
  customer_key?: string;
  shop_country?: string;
  status?: AboutYouOrderStatus;
  created_at?: string;
  order_items: AboutYouOrderItem[];
  [k: string]: unknown;
}
