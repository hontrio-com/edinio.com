-- Oferte — hub unificat (upsell / cross-sell / "cumparate impreuna" (FBT) / order bump /
-- upsell post-cumparare / reguli: volume, BOGO, cadou, spend&save).
--
-- Fiecare rand = o "oferta" cu: TIP + DECLANSATOR (pe ce produs/categorie se activeaza,
-- in `trigger`) + AFISARE (unde apare, in `display`) + REDUCERE/config (in `config`).
-- Pachetele raman produse (products.is_bundle) — NU sunt migrate aici; hub-ul doar le
-- afiseaza si linkeaza la builder-ul existent.
--
-- MODEL DE ACCES (defensiv, identic cu abandoned_carts / return_requests):
--   * RLS pornit; DOAR proprietarul (rol `authenticated`) face CRUD pe randurile
--     magazinului sau — dashboard-ul citeste/scrie ca utilizator autentificat prin RLS.
--   * Storefront-ul (clienti ANONIMI) NU citeste tabelul direct. Ofertele active sunt
--     rezolvate SERVER-SIDE cu admin client (service_role, bypass RLS), exact ca la
--     citirea comenzilor pe pagina de confirmare. De aceea revocam `anon SELECT` — scoate
--     tabelul din suprafata REST/GraphQL anonima (ca orders/abandoned_carts in hardening).
--
-- SIGURANTA: totul e strict ADITIV. Niciun tabel, policy, functie sau coloana existenta
-- nu e modificata. Tabelul nou nu e citit de niciun cod inca. Coloana pe `orders` are
-- default constant (adaugare metadata-only in PG15 — fara rescriere, fara lock lung).

-- ============================================================================
-- 1. Tabelul `offers`
-- ============================================================================
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 'frequently_bought' | 'cross_sell' | 'order_bump' | 'post_purchase'
  -- | 'volume' | 'bogo' | 'gift' | 'spend_reward'
  type text not null,
  name text not null,                              -- nume intern (ex. "Cadou la 200 lei")
  is_active boolean not null default true,
  priority integer not null default 0,             -- ordine afisare + rezolvare conflicte
  trigger jsonb not null default '{}'::jsonb,       -- {scope, productIds[], categories[], conditions{...}}
  config jsonb not null default '{}'::jsonb,        -- specific pe tip: produse oferite, reducere, texte
  display jsonb not null default '{}'::jsonb,       -- {surfaces[], title, style}
  starts_at timestamptz,                            -- programare (null = mereu activ)
  ends_at timestamptz,
  impressions bigint not null default 0,            -- contoare (incrementate atomic via RPC)
  conversions bigint not null default 0,
  revenue_added numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index principal: rezolvarea ofertelor active per magazin (+ filtrare pe tip).
create index if not exists offers_business_active_idx
  on public.offers (business_id, is_active);
create index if not exists offers_business_type_idx
  on public.offers (business_id, type);

-- ============================================================================
-- 2. RLS — DOAR proprietarul. Storefront-ul citeste server-side cu service_role.
-- ============================================================================
alter table public.offers enable row level security;

drop policy if exists "owner_select_offers" on public.offers;
create policy "owner_select_offers" on public.offers
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_insert_offers" on public.offers;
create policy "owner_insert_offers" on public.offers
  for insert with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_update_offers" on public.offers;
create policy "owner_update_offers" on public.offers
  for update using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_delete_offers" on public.offers;
create policy "owner_delete_offers" on public.offers
  for delete using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- Scoate tabelul din suprafata anonima REST/GraphQL (ca orders/abandoned_carts in
-- security-hardening-2026-06-22). Nu afecteaza dashboard-ul (owner citeste ca
-- `authenticated` prin RLS) si nici storefront-ul (citeste ca `service_role`).
revoke select on table public.offers from anon;

-- ============================================================================
-- 3. Coloana pe `orders` — reducere din oferte, oglinda lui card_discount_amount.
--    Calculata SERVER-SIDE si coapta in orders.total (sub-etapa 1B o scrie). Ramane
--    0 pentru toate comenzile existente si noi pana atunci. Adaugare pur aditiva.
-- ============================================================================
alter table public.orders
  add column if not exists offer_discount_amount numeric not null default 0;

-- ============================================================================
-- 4. RPC contor atomic — evita race-urile read-modify-write cand mai multi vizitatori
--    vad oferta simultan. Apelat DOAR server-side prin admin client (service_role).
--    search_path fixat (hardening). NU atinge updated_at (o impresie nu e o "editare").
-- ============================================================================
create or replace function public.increment_offer_stats(
  p_offer_id uuid,
  p_impressions integer default 0,
  p_conversions integer default 0,
  p_revenue numeric default 0
) returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.offers
     set impressions   = impressions   + coalesce(p_impressions, 0),
         conversions   = conversions   + coalesce(p_conversions, 0),
         revenue_added = revenue_added + coalesce(p_revenue, 0)
   where id = p_offer_id;
$$;

-- Doar service_role (admin client) poate incrementa. Supabase acorda EXECUTE direct
-- rolurilor anon/authenticated prin default privileges, deci revocam explicit de la
-- ele (nu doar de la public — vezi lectia din security-hardening-2026-06-22, Tier A2).
revoke execute on function public.increment_offer_stats(uuid, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.increment_offer_stats(uuid, integer, integer, numeric) to service_role;
