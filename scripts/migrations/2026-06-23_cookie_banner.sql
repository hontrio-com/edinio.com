-- Cookie consent banner. Each store is legally required (GDPR / ePrivacy) to show
-- a cookie banner that gates non-essential tracking until the visitor consents.
-- The banner content auto-adapts to the store's active integrations (Facebook /
-- TikTok pixels = "marketing"; Google Tag = "analytics"); only the visual config
-- (enabled, position) is stored here. Null = use sensible defaults (enabled,
-- bottom subtle bar). Consent itself is stored per-visitor in localStorage, not here.
alter table public.store_settings
  add column if not exists cookie_banner_config jsonb;
