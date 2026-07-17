// Shared types for the OLX.ro integration (Partner API v2).
// API base: https://www.olx.ro/api/partner — header `Version: 2.0` required.

// Attribute values chosen by the merchant for a mapped category
// (code -> value or list of values, matching OLX attribute definitions).
export type OlxAttributeValues = Record<string, string | string[]>;

// One mapped Edinio category -> OLX leaf category + its required attributes.
export interface OlxCategoryMapEntry {
  category_id: number;
  label: string;            // human path, e.g. "Electronice > Telefoane"
  photos_limit?: number;
  attributes: OlxAttributeValues;
}

export interface OlxConfig {
  connected?: boolean;
  // OAuth tokens. OLX access tokens live ~24h; refresh tokens ROTATE and expire
  // after 1 month — every refresh must persist the (possibly new) refresh token.
  access_token?: string;
  access_token_expires_at?: string; // ISO
  refresh_token?: string;
  token_updated_at?: string;
  needs_reconnect?: boolean;        // set when the refresh token is rejected
  olx_user_id?: number;
  olx_user_name?: string;
  advertiser_type?: "private" | "business";
  default_city_id?: number;
  default_city_name?: string;
  default_district_id?: number;
  default_district_name?: string;
  contact_name?: string;
  contact_phone?: string;
  courier_enabled?: boolean;        // OLX delivery (courier flag on adverts, RO)
  auto_sync?: boolean;              // push product changes automatically
  auto_extend?: boolean;            // auto_extend_enabled on adverts
  category_map?: Record<string, OlxCategoryMapEntry>; // Edinio category name -> OLX
  last_sync_at?: string;
}

export const OLX_CURRENCY = "RON";

// Advert statuses (from the Partner API spec).
export type OlxAdvertStatus =
  | "new"                // waiting for moderation
  | "active"             // live on OLX
  | "limited"            // free-ads quota exceeded -> needs a packet + activate
  | "unpaid"             // waiting for payment
  | "unconfirmed"        // waiting for confirmation
  | "removed_by_user"    // deactivated
  | "outdated"           // expired (valid_to passed)
  | "moderated"          // negative moderation result
  | "blocked"            // blocked by moderation
  | "disabled"           // disabled by moderation, waiting verification
  | "removed_by_moderator"
  | "error";             // local-only: sync failed (validation etc.)

// ── API entities (subset we consume) ─────────────────────────────────────────────
export interface OlxUser { id: number; name: string; avatar?: string | null }

export interface OlxCategory {
  id: number;
  name: string;
  parent_id?: number;
  photos_limit?: number;
  is_leaf?: boolean;
}

export interface OlxCategorySuggestion {
  id: number;
  name: string;
  path?: { id: number; name: string }[];
}

export interface OlxAttributeDef {
  code: string;
  label: string;
  unit?: string | null;
  validation?: {
    type?: "salary" | "price" | "attribute";
    required?: boolean;
    numeric?: boolean;
    min?: number | null;
    max?: number | string | null;
    allow_multiple_values?: boolean;
  };
  values?: { code: string; label: string }[];
}

export interface OlxCity {
  id: number;
  region_id?: number;
  name: string;
  county?: string;
  municipality?: string;
}

export interface OlxDistrict { id: number; city_id?: number; name: string }

export interface OlxAdvert {
  id: number;
  status: string;
  url?: string;
  created_at?: string;
  activated_at?: string;
  valid_to?: string;
  title?: string;
  description?: string;
  category_id?: number;
  external_id?: string;
  external_url?: string;
  price?: { value?: number; currency?: string; negotiable?: boolean } | null;
  images?: { url: string }[];
  courier?: boolean | null;
  auto_extend_enabled?: boolean;
}

export interface OlxAccountBalance {
  sum: number;
  wallet: number;
  bonus: number;
  refund: number;
  currency: string;
}

export type OlxPaymentMethod = "account" | "postpaid";

export interface OlxPacket {
  size: number;
  category_id: number;
  name?: string;
  price?: number;
  is_premium?: boolean;
  type?: string; // base | mega
  features?: { key: string; label: string }[];
}

export interface OlxBoughtPacket {
  id: string;
  name?: string;
  is_active?: boolean;
  size?: number;
  left?: number;
  active_to?: string;
  price?: number;
  categories_labels?: string[];
  categories_ids?: number[];
}

export interface OlxPaidFeature {
  code: string;
  type: string;      // e.g. topads
  duration?: number; // days
  name?: string;
  valid_to?: string; // only on active features
}

export interface OlxThread {
  id: number;
  advert_id: number;
  interlocutor_id?: number;
  total_count?: number;
  unread_count?: number;
  created_at?: string;
  is_favourite?: boolean;
}

export interface OlxMessage {
  id: number;
  thread_id?: number;
  created_at?: string;
  type: "sent" | "received";
  text?: string;
  is_read?: boolean;
  attachments?: { name?: string; url?: string }[] | null;
}
