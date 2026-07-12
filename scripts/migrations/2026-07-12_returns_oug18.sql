-- Retururi / dreptul de retragere online — conform OUG 18/2026 (modifică OUG 34/2014,
-- art. 11^1): comerciantul trebuie să pună la dispoziție o funcție de retragere din
-- contract direct în interfața magazinului. Această tabelă stochează declarațiile de
-- retragere trimise de clienți (anonimi) prin storefront, iar comerciantul le vede în
-- /dashboard/returns.
--
-- Feature built-in, activ pentru TOATE magazinele fără configurare (obligație legală,
-- nu opțiune). Scrierea din storefront se face cu service-role (client anonim), exact
-- ca la crearea comenzilor / abandoned_carts. Citire/administrare = doar proprietarul.

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  order_number text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,   -- [{product_id,name,quantity,price}] — subsetul returnat (retur parțial)
  reason text,                                -- opțional: legea NU cere motiv
  refund_method text,                         -- 'iban' | 'card' | 'original' (informativ)
  refund_iban text,                           -- pt. rambursare la comenzi ramburs
  status text not null default 'nou',         -- nou | aprobat | respins | rambursat
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists return_requests_business_created_idx
  on public.return_requests (business_id, created_at desc);
create index if not exists return_requests_business_unread_idx
  on public.return_requests (business_id, is_read);
create index if not exists return_requests_order_idx
  on public.return_requests (order_id);

alter table public.return_requests enable row level security;

-- Owner-only access. Storefront submissions use the service role (admin client), which
-- bypasses RLS — exactly like order creation for anonymous customers. No public policy.
drop policy if exists "owner_select_return_requests" on public.return_requests;
create policy "owner_select_return_requests" on public.return_requests
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_update_return_requests" on public.return_requests;
create policy "owner_update_return_requests" on public.return_requests
  for update using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

drop policy if exists "owner_delete_return_requests" on public.return_requests;
create policy "owner_delete_return_requests" on public.return_requests
  for delete using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- Configurare opțională per magazin (adresă retur, instrucțiuni, email notificare).
-- Totul are fallback-uri — funcția de retragere e conformă și fără nicio setare.
alter table public.store_settings
  add column if not exists returns_config jsonb not null default '{}'::jsonb;
