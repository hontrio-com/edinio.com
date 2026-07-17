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
  connected_at?: string;
}

// Public availability switch. While false, the feature shows "Disponibil în
// curând" to everyone EXCEPT admins (so the owner can still test/connect while
// Google OAuth verification is pending). Flip to true once verified.
export const GOOGLE_ANALYTICS_LIVE = false;
