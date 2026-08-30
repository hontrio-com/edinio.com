-- Feed de stocuri citit automat de la o adresa.
--
-- DE CITIT INAINTE DE APLICARE. Nu a fost rulata pe nicio baza.
--
-- Adauga UN tabel nou si nu atinge nimic existent: fara ALTER, fara DROP, fara
-- schimbari de coloane pe products, product_imports sau product_import_rows.
-- Reluarea e ieftina: `drop table stock_feed_sources;` si nu rimane nimic.
--
-- Istoricul rularilor NU se tine aici. Fiecare rulare creeaza un rand normal in
-- `product_imports`, cu `source = 'stock_csv'`, deci apare in acelasi loc ca
-- incarcarile manuale si foloseste acelasi raport de erori.

create table if not exists public.stock_feed_sources (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Cum ii spune comerciantul: "Furnizor Ardon", "Depozit Cluj".
  name text not null default '',
  url text not null,

  -- Aceleasi forme ca la incarcarea manuala: StockFeedMapping si StockFeedOptions.
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,

  enabled boolean not null default true,

  -- Programare. `run_hour` e in UTC, ca sa nu depindem de fusul din browser.
  frequency text not null default 'daily' check (frequency in ('hourly', 'daily')),
  run_hour smallint not null default 4 check (run_hour between 0 and 23),

  -- Ultima rulare, pentru ecranul de administrare.
  last_run_at timestamptz,
  last_status text check (last_status in ('ok', 'error')),
  last_error text,
  last_totals jsonb,
  last_import_id uuid references public.product_imports(id) on delete set null,

  -- Dupa prea multe eșecuri la rand, sursa se dezactiveaza singura: o adresa
  -- moarta nu trebuie sa fie cerută la infinit, in fiecare zi.
  consecutive_failures integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cronul cauta exact asa: active, ordonate dupa cat de demult au rulat.
create index if not exists stock_feed_sources_due_idx
  on public.stock_feed_sources (enabled, last_run_at nulls first);

create index if not exists stock_feed_sources_business_idx
  on public.stock_feed_sources (business_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Doar proprietarul magazinului isi vede si isi schimba sursele. FARA politica
-- publica de SELECT: aici stau adrese de furnizor, uneori cu jeton in URL.
alter table public.stock_feed_sources enable row level security;

drop policy if exists "stock_feed_sources_select_own" on public.stock_feed_sources;
create policy "stock_feed_sources_select_own"
  on public.stock_feed_sources for select
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "stock_feed_sources_insert_own" on public.stock_feed_sources;
create policy "stock_feed_sources_insert_own"
  on public.stock_feed_sources for insert
  with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "stock_feed_sources_update_own" on public.stock_feed_sources;
create policy "stock_feed_sources_update_own"
  on public.stock_feed_sources for update
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "stock_feed_sources_delete_own" on public.stock_feed_sources;
create policy "stock_feed_sources_delete_own"
  on public.stock_feed_sources for delete
  using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- `updated_at` se intretine singur.
create or replace function public.touch_stock_feed_sources()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_feed_sources_touch on public.stock_feed_sources;
create trigger stock_feed_sources_touch
  before update on public.stock_feed_sources
  for each row execute function public.touch_stock_feed_sources();
