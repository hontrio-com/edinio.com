-- Abandoned-cart recovery automations: timed multi-step sequences (email/SMS)
-- driven by a cron. Config lives per-store on store_settings; per-cart progress
-- and an email opt-out list support the cron.

-- Per-store automation config:
-- { enabled, min_cart_value, quiet_hours:{start,end}, steps:[{id,delay_hours,channel,message,discount_code}] }
alter table public.store_settings
  add column if not exists abandoned_cart_automation jsonb not null default '{}'::jsonb;

-- Per-cart sequence progress.
alter table public.abandoned_carts
  add column if not exists automation_step integer not null default 0,
  add column if not exists last_recovery_at timestamptz;

-- Email opt-out (unsubscribe) suppression list. Written by the unsubscribe route
-- (service role); read by the cron. No public access.
create table if not exists public.recovery_optout (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists recovery_optout_business_email_uidx
  on public.recovery_optout (business_id, lower(email));

alter table public.recovery_optout enable row level security;
-- Owner can see their opt-outs; writes happen via service role (admin) in routes.
drop policy if exists "owner_select_recovery_optout" on public.recovery_optout;
create policy "owner_select_recovery_optout" on public.recovery_optout
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );
