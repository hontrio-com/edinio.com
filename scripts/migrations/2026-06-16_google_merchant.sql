-- Google Merchant Center integration (Merchant API). Each store connects its own
-- Merchant Center account via OAuth; we store the connection + per-product sync
-- state + a sync queue processed by a cron.

-- Connection + settings (refresh token, account, data source, category map, etc.).
-- Stored like other secrets (stripe_config/smso_config): service-role/owner only.
alter table public.store_settings
  add column if not exists google_merchant_config jsonb not null default '{}'::jsonb;

-- Per-product sync state + Google status (for the dashboard + reconciliation).
create table if not exists public.gmc_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  offer_id text not null,
  status text not null default 'pending', -- pending | active | disapproved | expiring | error
  destinations jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  last_status_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gmc_products_business_product_uidx on public.gmc_products (business_id, product_id);
create index if not exists gmc_products_business_status_idx on public.gmc_products (business_id, status);

-- Sync queue. offer_id is always present (= product.id) so delete ops survive a
-- product deletion (product_id set null on delete).
create table if not exists public.gmc_sync_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  offer_id text not null,
  op text not null default 'upsert', -- upsert | delete
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists gmc_sync_queue_dedupe_uidx on public.gmc_sync_queue (business_id, offer_id, op);
create index if not exists gmc_sync_queue_created_idx on public.gmc_sync_queue (created_at);

alter table public.gmc_products enable row level security;
alter table public.gmc_sync_queue enable row level security;

-- Owner can read their rows; all writes go through the service role (admin client).
drop policy if exists "owner_select_gmc_products" on public.gmc_products;
create policy "owner_select_gmc_products" on public.gmc_products
  for select using (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists "owner_select_gmc_sync_queue" on public.gmc_sync_queue;
create policy "owner_select_gmc_sync_queue" on public.gmc_sync_queue
  for select using (business_id in (select id from public.businesses where user_id = auth.uid()));
