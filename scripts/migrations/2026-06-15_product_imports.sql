-- ============================================================================
-- Product import system — staging tables + products dedupe columns.
-- Safe to run on an existing DB (idempotent: IF NOT EXISTS / IF EXISTS guards).
-- Apply manually in the Supabase SQL editor (same flow as scripts/security).
-- ============================================================================

-- ── 1. products: dedupe / re-sync keys ──────────────────────────────────────
-- Lets a re-import update the same product instead of creating duplicates.
-- source = 'shopify_csv' | 'woo_csv' | 'generic_csv' | 'shopify_url' | ...
-- external_id = the source's stable id (Shopify Handle, Woo SKU/ID, ...).
alter table public.products
  add column if not exists source      text,
  add column if not exists external_id text;

-- Unique only when both are present, so manually-created products (NULLs) are unaffected.
create unique index if not exists products_source_external_uidx
  on public.products (business_id, source, external_id)
  where source is not null and external_id is not null;

-- ── 2. product_imports: one row per import job ──────────────────────────────
create table if not exists public.product_imports (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  source          text not null,
  status          text not null default 'uploaded',
    -- uploaded -> mapping -> validating -> importing -> rehosting_images
    --          -> completed | completed_with_errors | failed | cancelled
  file_url        text,                       -- raw uploaded file, stored in R2
  file_name       text,
  mapping         jsonb not null default '{}'::jsonb,  -- their column -> our field
  options         jsonb not null default '{}'::jsonb,  -- collapse_variants, import_images, default_active, overwrite_existing
  totals          jsonb not null default '{}'::jsonb,  -- {total, created, updated, skipped, failed, images_total, images_done}
  error           text,
  error_report_url text,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz not null default now()
);

create index if not exists product_imports_business_idx on public.product_imports (business_id, created_at desc);
-- Lets the cron fallback worker find jobs that still need processing.
create index if not exists product_imports_active_idx on public.product_imports (status)
  where status in ('importing', 'rehosting_images');

-- ── 3. product_import_rows: one row per source product (staging) ────────────
create table if not exists public.product_import_rows (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references public.product_imports(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  row_index   int  not null,
  raw         jsonb,                          -- original source row(s), for debugging
  parsed      jsonb,                          -- canonical StagedProduct
  external_id text,
  status      text not null default 'pending',-- pending | created | updated | skipped | failed
  images_done boolean not null default false, -- image rehost phase processed this row
  product_id  uuid references public.products(id) on delete set null,
  error       text
);

-- Drives the chunked, resumable committer: "next pending rows for this job, in order".
create index if not exists product_import_rows_cursor_idx
  on public.product_import_rows (import_id, status, row_index);
-- Drives the image rehost phase: committed rows whose images aren't rehosted yet.
create index if not exists product_import_rows_images_idx
  on public.product_import_rows (import_id, row_index)
  where images_done = false;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- Owners read their own jobs/rows (for the wizard + history). All writes and the
-- heavy processing go through the service role, which bypasses RLS (as elsewhere).
alter table public.product_imports     enable row level security;
alter table public.product_import_rows enable row level security;

drop policy if exists "Owners read own imports" on public.product_imports;
create policy "Owners read own imports" on public.product_imports
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "Owners read own import rows" on public.product_import_rows;
create policy "Owners read own import rows" on public.product_import_rows
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- ── Verification ─────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'products' and column_name in ('source','external_id');  -- expect 2 rows
-- select tablename from pg_tables where tablename like 'product_import%';        -- expect 2 rows
