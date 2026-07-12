-- Klaviyo (email marketing) integration — BYO: each merchant connects their own Klaviyo
-- account via a PRIVATE API key (pk_...). Contacts are synced from the checkout opt-in,
-- existing customers and forms; e-commerce is pushed as "Placed Order" events + catalog
-- items. Campaigns run inside Klaviyo (merchant's account + cost). Third email-marketing
-- option next to Mailchimp + Brevo; identical BYO model.
--
-- Config (private API key + selected list + sync sources + ecommerce_sync) lives per-store
-- in store_settings.klaviyo_config, like the other secret configs. store_settings RLS is
-- owner-only ("Owners can manage store settings", no anon SELECT), so the key is never
-- publicly readable and is never sent to the browser (server actions only).
--
-- NOTE: unlike Mailchimp/Brevo there is NO suppression table and NO inbound webhook —
-- Klaviyo enforces unsubscribes server-side (the subscribe endpoint never resurrects a
-- contact who unsubscribed), so a local suppression list would be redundant.
alter table public.store_settings
  add column if not exists klaviyo_config jsonb;

-- Per-form opt-in: a merchant-built form flagged with klaviyo_enabled syncs its submissions
-- as Klaviyo subscribers (mirrors forms.mailchimp_enabled / forms.brevo_enabled).
alter table public.forms
  add column if not exists klaviyo_enabled boolean;
