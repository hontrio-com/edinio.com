-- Mailchimp (email marketing) integration — BYO: each merchant connects their own
-- Mailchimp account via an API key. Subscribers are synced from the checkout opt-in,
-- popups and existing customers into a chosen audience; campaigns are composed and
-- sent inside Mailchimp (never through Edinio's own email infra — no cost/reputation
-- exposure to us).
--
-- Config (API key + selected audience + sync sources) lives per-store here, like the
-- other secret configs (stripe_config/smso_config). store_settings RLS is owner-only
-- ("Owners can manage store settings", no anon SELECT), so the API key is never
-- publicly readable. It is also never sent to the browser (server actions only).
alter table public.store_settings
  add column if not exists mailchimp_config jsonb;
