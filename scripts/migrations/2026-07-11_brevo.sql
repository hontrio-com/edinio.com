-- Brevo (email marketing) integration — BYO: each merchant connects their own Brevo
-- (ex-Sendinblue) account via an API key. Subscribers are synced from the checkout
-- opt-in, existing customers and forms into a chosen list; campaigns are composed and
-- sent inside Brevo (never through Edinio's own email infra — no cost/reputation
-- exposure to us). Second email-marketing option next to Mailchimp; identical model.
--
-- Config (API key + selected list + sync sources + webhook_secret + ecommerce_sync)
-- lives per-store in store_settings.brevo_config, like the other secret configs
-- (stripe_config/mailchimp_config). store_settings RLS is owner-only ("Owners can
-- manage store settings", no anon SELECT), so the API key is never publicly readable.
-- It is also never sent to the browser (server actions only).
alter table public.store_settings
  add column if not exists brevo_config jsonb;

-- Suppression list: when a contact unsubscribes in Brevo, the marketing webhook fires
-- and we record the email here so we never re-add them (belt-and-suspenders on top of
-- omitting emailBlacklisted, and survives list changes). Writes come from the webhook
-- via the service role; owners may read their own for visibility.
create table if not exists public.brevo_suppressions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table public.brevo_suppressions enable row level security;

create policy "Owners read own brevo suppressions" on public.brevo_suppressions
  for select using (exists (select 1 from public.businesses b where b.id = business_id and b.user_id = auth.uid()));

create index if not exists brevo_suppressions_business_email_idx on public.brevo_suppressions (business_id, email);

-- Per-form opt-in: when a merchant-built form has brevo_enabled, its submissions are
-- synced as Brevo contacts (mirrors forms.mailchimp_enabled).
alter table public.forms
  add column if not exists brevo_enabled boolean;
