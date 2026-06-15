-- Abandoned carts: server-side capture of in-progress checkouts so merchants can
-- recover lost sales via email/SMS. Carts live only in localStorage today; this
-- table is written by the storefront (service-role, anonymous customers) as the
-- customer fills the checkout form, and marked 'converted' when an order is placed.
--
-- Opt-in: tracking is OFF by default. Each store enables it from the dashboard,
-- which sets store_settings.abandoned_cart_enabled = true (see below). Capture is
-- skipped server-side unless the flag is on.
--
-- Lifecycle:
--   open       -> captured, no order yet. "Abandoned" (for display) = open AND
--                 last_activity_at < now() - 1 hour (computed at query time, no cron).
--   converted  -> an order was placed from this session/contact. order_id linked.
--   recovered  -> derived: converted AND a recovery message was sent.

create table if not exists public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id text not null,
  source text not null default 'cart',            -- 'cart' | 'buy_now'
  customer_name text,
  email text,
  phone text,
  items jsonb not null default '[]'::jsonb,        -- [{product_id,name,price,quantity,image_url}]
  item_count integer not null default 0,
  subtotal numeric not null default 0,
  status text not null default 'open',             -- 'open' | 'converted'
  order_id uuid references public.orders(id) on delete set null,
  converted_at timestamptz,
  recovery_email_sent_at timestamptz,
  recovery_sms_sent_at timestamptz,
  recovery_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per browser cart session per store (upsert target).
create unique index if not exists abandoned_carts_business_session_uidx
  on public.abandoned_carts (business_id, session_id);

create index if not exists abandoned_carts_business_status_activity_idx
  on public.abandoned_carts (business_id, status, last_activity_at desc);
create index if not exists abandoned_carts_business_email_idx
  on public.abandoned_carts (business_id, email);
create index if not exists abandoned_carts_business_phone_idx
  on public.abandoned_carts (business_id, phone);

alter table public.abandoned_carts enable row level security;

-- Owner-only access. Storefront writes use the service role (admin client), which
-- bypasses RLS — exactly like order creation for anonymous customers.
drop policy if exists "owner_select_abandoned_carts" on public.abandoned_carts;
create policy "owner_select_abandoned_carts" on public.abandoned_carts
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_update_abandoned_carts" on public.abandoned_carts;
create policy "owner_update_abandoned_carts" on public.abandoned_carts
  for update using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_delete_abandoned_carts" on public.abandoned_carts;
create policy "owner_delete_abandoned_carts" on public.abandoned_carts
  for delete using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- Per-store opt-in flag. Feature is disabled until the merchant activates it.
alter table public.store_settings
  add column if not exists abandoned_cart_enabled boolean not null default false;
