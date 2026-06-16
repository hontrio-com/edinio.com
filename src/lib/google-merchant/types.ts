// Shared types for the Google Merchant Center integration.

export interface GoogleMerchantConfig {
  connected?: boolean;
  refresh_token?: string;
  account_id?: string;                 // numeric Merchant Center account id
  account_name?: string;
  connected_email?: string;
  data_source_name?: string;           // full resource name of the API data source
  notification_subscription_name?: string;
  feed_label?: string;                 // e.g. "RO"
  content_language?: string;           // e.g. "ro"
  country?: string;                    // e.g. "RO"
  auto_sync?: boolean;
  brand_default?: string;
  condition_default?: "new" | "refurbished" | "used";
  category_map?: Record<string, string>; // edinio category name -> Google product category id
  last_sync_at?: string;
}

// Public availability switch. While false, the feature shows "Disponibil în
// curând" to everyone EXCEPT admins (so the owner can still test/connect while
// Google OAuth verification is pending). Flip to true once verified.
export const GOOGLE_MERCHANT_LIVE = false;

export const DEFAULT_FEED_LABEL = "RO";
export const DEFAULT_CONTENT_LANGUAGE = "ro";
export const DEFAULT_COUNTRY = "RO";
export const CURRENCY = "RON";
