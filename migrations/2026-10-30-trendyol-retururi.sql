-- ══════════════════════════════════════════════════════════════════════════
-- RETURURILE TRENDYOL: PANA AZI STIAM DOAR CA „PACHETUL E RETURNAT" (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Tot ce vedea Edinio despre un retur Trendyol era statusul grosier al pachetului:
-- `Returned`. Din el nu se poate afla nimic din ce conteaza:
--
--   ce articol s-a intors, si cate bucati
--   de ce (motivul ales de client)
--   in ce stare e cererea: acceptata, respinsa, in analiza
--   ce dovezi a incarcat clientul
--   daca e o inlocuire, nu o restituire
--
-- Iar Trendyol are API complet pentru toate astea: citirea cererilor, aprobarea, respingerea
-- cu motiv, si legatura cu pachetul de inlocuire.
--
-- ⚠ CE COSTA LIPSA LOR: comerciantul afla de retur din panoul LOR, nu din al nostru, si
-- decide acolo. Iar noi, care abia am oprit repunerea automata in stoc, nu-i dam nicio cale sa
-- puna marfa inapoi dupa ce o verifica — deci stocul ramane consumat pana o corecteaza de mana.
--
-- ⚠ SI STOCUL NU SE REPUNE AUTOMAT NICI DE AICI. Aceeasi hotarare ca la eMAG: marfa intoarsa
-- nu e mereu vandabila — vine desfacuta, incompleta, ori pur si simplu alta. Un retur „primit"
-- inseamna ca a ajuns coletul, nu ca produsul e bun de pus la loc pe raft. Cine schimba asta
-- trebuie sa stie ca `trendyol_claim_items.quantity` poate fi mai mic decat cantitatea
-- cumparata, si ca se pot intoarce doar unele linii.

create table if not exists public.trendyol_claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  /* ⚠ Comanda noastra, cand o stim. `on delete set null`: un retur ramane o urma adevarata
     chiar daca cineva sterge comanda din Edinio. */
  order_id uuid references public.orders(id) on delete set null,
  /** Id-ul cererii la ei. Cheia dupa care se dedubleaza. */
  claim_id text not null,
  order_number text,
  shipment_package_id bigint,
  /** Created, WaitingInAction, Accepted, Rejected, Cancelled, Unresolved, InAnalysis. */
  claim_status text,
  /* ⚠ Raspunsul lor INTREG. Forma cererilor de retur nu e in schema pe care o avem, iar
     regula casei e sa pastram dovada in loc sa presupunem a doua oara. */
  raw jsonb,
  claim_date timestamptz,
  last_modified timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, claim_id)
);

create table if not exists public.trendyol_claim_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  claim_row_id uuid not null references public.trendyol_claims(id) on delete cascade,
  /** Id-ul liniei la ei; cu el se aproba sau se respinge, bucata cu bucata. */
  claim_item_id text not null,
  barcode text,
  product_name text,
  /* ⚠ POATE FI MAI MIC decat cat s-a cumparat: Trendyol are retururi partiale, pe linie si pe
     cantitate. De-aia stocul NU se repune dintr-un total. */
  quantity int not null default 1,
  reason text,
  customer_note text,
  /** Ce am hotarat noi: `accepted` / `rejected` / null cat timp n-a decis nimeni. */
  decizie text,
  decis_la timestamptz,
  /* ⚠ Marfa pusa inapoi in stoc DE OM, dupa ce a verificat-o. Ne-nul inseamna „s-a facut",
     deci a doua apasare nu mai adauga inca o data. */
  repus_in_stoc_la timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, claim_item_id)
);

create index if not exists trendyol_claims_biz_idx on public.trendyol_claims (business_id, claim_date desc);
-- ⚠ Index partial pe cererile care asteapta o hotarare: alea sunt putine, restul cresc pentru
-- totdeauna.
create index if not exists trendyol_claims_de_hotarat_idx
  on public.trendyol_claims (business_id, last_modified)
  where claim_status in ('Created', 'WaitingInAction', 'InAnalysis');
create index if not exists trendyol_claim_items_claim_idx on public.trendyol_claim_items (claim_row_id);

-- ── RLS: citeste doar proprietarul, scrie doar service_role ───────────────────
alter table public.trendyol_claims enable row level security;
alter table public.trendyol_claim_items enable row level security;

drop policy if exists owner_select_trendyol_claims on public.trendyol_claims;
create policy owner_select_trendyol_claims on public.trendyol_claims
  for select using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

drop policy if exists owner_select_trendyol_claim_items on public.trendyol_claim_items;
create policy owner_select_trendyol_claim_items on public.trendyol_claim_items
  for select using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

grant select on table public.trendyol_claims to authenticated;
grant select on table public.trendyol_claim_items to authenticated;

notify pgrst, 'reload schema';
