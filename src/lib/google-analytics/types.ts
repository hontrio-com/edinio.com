// Shared types for the Google Analytics (GA4) integration.

export interface GoogleAnalyticsConfig {
  connected?: boolean;
  manual?: boolean;             // connected WITHOUT OAuth: merchant pasted the Measurement ID (tracking only, no reports)
  refresh_token?: string;
  connected_email?: string;
  account_name?: string;        // GA account display name
  property_id?: string;         // numeric GA4 property id, e.g. "123456789"
  property_name?: string;       // property display name
  measurement_id?: string;      // web stream Measurement ID, e.g. "G-XXXXXXXXXX"
  stream_name?: string;         // full resource name properties/x/dataStreams/y
  tracking_enabled?: boolean;   // inject gtag on the storefront (default true)
  api_secret?: string;          // GA4 Measurement Protocol API secret (server-side purchase/refund)
  connected_at?: string;
}

// Public availability switch (kill-switch) for the OAuth path (account connect +
// in-app reports). Google OAuth verification approved 2026-07-21, so it is live
// for all merchants. The manual Measurement ID path was always public. Set back
// to false to hide the OAuth path from non-admins again (admins retain access).
export const GOOGLE_ANALYTICS_LIVE = true;
