// Shared types for the Trendyol Marketplace integration (Partner API v3.0).
// Base (prod): https://apigw.trendyol.com — auth via HTTP Basic (apiKey:apiSecret)
// + required User-Agent header + supplierId in the URL path.
//
// Structurally a cousin of [[aboutyou-integration-plan]]: variant-first catalog
// (variants grouped by `productMainId`, one per `barcode`), everything write-side
// is async batch (submit -> batchRequestId -> poll batch-requests), orders flow
// back as shipment packages. KEY differences vs About You: Basic auth, barcode as
// the identifier, and fulfillment through Trendyol's contracted cargo (the seller
// marks a package Picking -> Invoiced; Trendyol assigns the tracking) rather than
// pushing its own courier AWB. Decision: Trendyol RO, currency RON (no FX).

export type TrendyolEnvironment = "stage" | "production";

export const TRENDYOL_CURRENCY = "RON";
export const TRENDYOL_DEFAULT_VAT = 19;

// Known Trendyol cargo companies (id = cargoCompanyId). The live getProviders
// path is not documented and these IDs are effectively static, so the picker uses
// this list. Must match the seller's contracted provider.
export const TRENDYOL_CARGO_PROVIDERS: { id: number; name: string; code: string }[] = [
  { id: 17, name: "Trendyol Express", code: "TEXMP" },
  { id: 4, name: "Yurtiçi Kargo", code: "YKMP" },
  { id: 7, name: "Aras Kargo", code: "ARASMP" },
  { id: 19, name: "PTT Kargo", code: "PTTMP" },
  { id: 9, name: "Sürat Kargo", code: "SURATMP" },
  { id: 6, name: "Horoz Kargo", code: "HOROZMP" },
  { id: 20, name: "CEVA", code: "CEVAMP" },
  { id: 10, name: "DHL eCommerce", code: "DHLECOMMP" },
  { id: 30, name: "Ceva Tedarik", code: "CEVATEDARIK" },
  { id: 38, name: "Kolay Gelsin", code: "SENDEOMP" },
];

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
  user_agent_company?: string;      // User-Agent "{sellerId} - {company}" (default SelfIntegration)
  seller_name?: string;
  // Catalog defaults resolved from Trendyol.
  shipment_address_id?: number;
  returning_address_id?: number;
  default_cargo_company_id?: number;
  currency?: string;                // "RON" (Trendyol RO)
  brand_id?: number;
  brand_name?: string;
  category_map?: Record<string, TrendyolCategoryMapEntry>;
  // Webhook (credentials WE set; Trendyol echoes them so we can verify).
  webhook_id?: string;
  webhook_secret?: string;
  auto_sync?: boolean;
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
export interface TrendyolSupplierAddress {
  id: number;
  addressType?: string;             // Shipment | Invoice | Returning
  city?: string;
  district?: string;
  fullAddress?: string;
  isShipmentAddress?: boolean;
  isReturningAddress?: boolean;
  isInvoiceAddress?: boolean;
  isDefault?: boolean;
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
export interface TrendyolProductItem {
  barcode: string;                  // max 40, the variant identifier
  title: string;                    // max 100
  productMainId: string;            // groups variants
  brandId: number;
  categoryId: number;               // must be a LEAF category
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;              // max 30000
  currencyType: string;            // "RON" (confirm on stage)
  listPrice: number;               // >= salePrice
  salePrice: number;
  vatRate: number;
  cargoCompanyId: number;          // must be a contracted provider
  images: TrendyolImage[];         // max 8
  attributes: TrendyolProductAttribute[];
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
