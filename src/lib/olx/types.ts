// Shared types for the OLX.ro integration (Partner API v2).
// API base: https://www.olx.ro/api/partner — header `Version: 2.0` required.

// Attribute values chosen by the merchant for a mapped category
// (code -> value or list of values, matching OLX attribute definitions).
/**
 * Ce s-a legat la fiecare atribut OLX.
 *
 * ⚠ Forma VECHE — un sir sau o lista de siruri — ramane inteleasa ca „valoare fixa", deci mapările
 * existente ale comerciantilor nu se strica si nu cer nicio migratie de date. Vezi `atribute.ts`.
 */
export type OlxAttributeValues = Record<string, import("./atribute").OlxMaparecAtribut>;

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
  /**
   * ⚠ `null` INSEAMNA „sters", si de-aia tipul il primeste. Un `undefined` nu ajunge niciodata in
   * baza: `JSON.stringify` il scoate din petic, iar `jsonb_merge_config` imbina doar cheile
   * primite — deci cartierul vechi ramanea peste noul oras.
   */
  default_district_id?: number | null;
  default_district_name?: string | null;
  contact_name?: string;
  contact_phone?: string;
  courier_enabled?: boolean;        // OLX delivery (courier flag on adverts, RO)
  auto_sync?: boolean;              // push product changes automatically
  auto_extend?: boolean;            // auto_extend_enabled on adverts
  category_map?: Record<string, OlxCategoryMapEntry>; // Edinio category name -> OLX
  /**
   * Unde a ajuns ultima trecere de reconciliere prin lista lor de anunturi.
   *
   * ⚠ CURSOR, NU FEREASTRA FIXA. La Trendyol, o scanare de cinci pagini pornita mereu de la zero
   * n-a vazut NICIODATA nimic dupa produsul 500 dintr-un catalog de 1033.
   */
  reconcile_offset?: number;
  /**
   * Anunturile din contul lui pe care le-a respins la import.
   *
   * ⚠ FARA ASTA, „Ignoră" nu tine minte nimic. Un comerciant cu optzeci si patru de anunturi vechi
   * respinge saizeci si le vede pe toate din nou la scanarea urmatoare — iar a doua oara nu le mai
   * citeste, le sare pe toate, si atunci nici pe cele care CHIAR erau ale lui.
   *
   * ⚠ Se tin ID-urile LOR, nu ale noastre: anunturile astea n-au rand la noi, tocmai de-aia sunt
   * in lista de import.
   */
  import_ignorate?: number[];
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
export interface OlxUser {
  id: number;
  name: string;
  avatar?: string | null;
  /**
   * Contul e de firma, nu de persoana.
   *
   * ⚠ `/users/me` ni-l spune de la prima conectare, dar tipul nostru nici nu-l cuprindea — deci un
   * cont OLX Business ramanea la noi `advertiser_type: "private"` pana il schimba omul de mana,
   * si nici nu avea de unde sa stie ca trebuie.
   */
  is_business?: boolean;
  phone?: string | null;
  email?: string | null;
}

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

/* ── Statistici, motive de moderare, profil de firma, facturare ───────────── */

/**
 * Ce a facut lumea cu anuntul.
 *
 * ⚠ Campurile sunt optionale dinadins: nu toate categoriile si nu toate conturile intorc tot, iar
 * un zero inventat pentru o valoare care lipseste ar arata in ecran ca „nimeni nu s-a uitat" —
 * ceea ce e cu totul altceva decat „nu stim".
 */
export interface OlxAdvertStats {
  advert_views?: number;
  phone_views?: number;
  users_observing?: number;
  message_count?: number;
}

/** De ce a fost respins anuntul. Se cere numai cand starea chiar spune ca a fost. */
export interface OlxModerationReason {
  code?: string;
  reason?: string;
  message?: string;
  fields?: { field?: string; message?: string }[];
}

/** Profilul de firma al contului OLX. */
export interface OlxBusinessProfile {
  id?: number;
  name?: string;
  description?: string;
  subdomain?: string;
  website?: string;
  phone?: string;
  address?: string;
  logo?: { url?: string } | null;
  banner?: { url?: string } | null;
}

/** O linie din istoricul de facturare al contului. */
export interface OlxBillingEntry {
  id?: number;
  created_at?: string;
  type?: string;
  description?: string;
  amount?: { value?: number; currency?: string } | number;
  balance_after?: number;
}

/** Un mesaj cu tot ce poarta el, inclusiv atasamente. */
export interface OlxMessageFull extends OlxMessage {
  attachments?: { url?: string; name?: string; mime_type?: string }[];
}
