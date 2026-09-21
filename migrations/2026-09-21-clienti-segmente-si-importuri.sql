-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, etapa F: segmente salvate si istoric de importuri   (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- „Segmentele ar aduce cea mai mare valoare comerciala" (analiza proprietarului).
--
-- ⚠ UN SEGMENT PASTREAZA CRITERIILE, NU REZULTATELE. Salvat ca lista de clienti,
-- ar fi inghetat: cine intra maine in „Inactivi de 90 de zile" n-ar mai aparea
-- acolo, iar comerciantul ar fi trimis campanii unei liste moarte. Salvate ca
-- criterii, segmentele se recalculeaza la fiecare deschidere.
--
-- ⚠ SI DE-AIA NU ATARNA DE ETAPA H (profilul persistent). Am spus la un moment
-- dat ca H trebuie hotarata inaintea segmentelor; uitandu-ma mai atent, nu e
-- adevarat: criteriile nu stiu nimic despre CUM se citesc clientii. Filtrele,
-- care chiar ar fi atarnat, sunt deja scrise si merg.

create table if not exists public.customer_segments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  nume text not null,
  /*
    Criteriile, exact cum le stie pagina: segment, treapta de valoare, cautare.
    ⚠ JSONB, nu coloane: filtrele vor mai creste (judet, canal, tag), iar o
    coloana noua la fiecare filtru ar fi insemnat o migratie la fiecare.
  */
  criterii jsonb not null default '{}'::jsonb,
  creat_la timestamptz not null default now(),
  creat_de uuid references auth.users(id) on delete set null
);

/*
  ⚠ Doua segmente cu acelasi nume in acelasi magazin nu se pot deosebi pe ecran.

  ⚠⚠ SI NUMELE SE NORMALIZEAZA IN INDEX, nu doar in cod. Prima scriere era pe
  `lower(nume)` simplu, iar curatarea spatiilor statea numai in `numeValid` din
  TypeScript. Probat: „  vip DE valoare Medie  " intra linistit pe langa „VIP de
  valoare medie". Prin pagina n-ar fi trecut, fiindca pagina curata intai — dar
  atunci unicitatea din baza atarna de o functie din alt limbaj, si ar fi cazut la
  primul import, la prima actiune noua sau la prima reparatie facuta de mana.
  Baza isi apara singura regula.
*/
create unique index if not exists customer_segments_nume_uidx
  on public.customer_segments (business_id, lower(btrim(regexp_replace(nume, '\s+', ' ', 'g'))));

create index if not exists customer_segments_business_idx
  on public.customer_segments (business_id, creat_la desc);

/* ⚠ Cheia straina spre `auth.users` are nevoie de index: altfel stergerea unui
   utilizator scaneaza toata tabela. Vezi `chei-straine-indexate.test.ts`. */
create index if not exists customer_segments_creat_de_idx
  on public.customer_segments (creat_de);

alter table public.customer_segments enable row level security;

/*
  ⚠ SI DREPTUL DE SELECT SE IA DE LA `anon`, nu doar RLS-ul. Supabase da implicit
  toate drepturile pe o tabela noua din `public`; toate tabelele surori
  (`abandoned_carts`, `orders`, `recovery_optout`) au `anon` FARA select. Lectia
  de azi, de la `recovery_sends`.
*/
revoke all on public.customer_segments from anon;

drop policy if exists "owner_all_customer_segments" on public.customer_segments;
create policy "owner_all_customer_segments" on public.customer_segments
  for all using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  ) with check (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- ── Istoricul importurilor ─────────────────────────────────────────────────
--
-- ⚠ Pana acum importul de clienti nu lasa nicio urma: se termina cu un mesaj pe
-- ecran, iar peste o saptamana nimeni nu mai stia cand s-a facut, din ce fisier
-- si cati au intrat. Iar cand cineva intreaba „de unde e clientul asta?", nu era
-- nimic de citit.

create table if not exists public.customer_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  fisier text,
  /* Cati au intrat ca randuri noi, si cati existau si li s-au completat campuri. */
  adaugati integer not null default 0,
  completati integer not null default 0,
  sarite integer not null default 0,
  creat_la timestamptz not null default now(),
  creat_de uuid references auth.users(id) on delete set null
);

create index if not exists customer_imports_business_idx
  on public.customer_imports (business_id, creat_la desc);

create index if not exists customer_imports_creat_de_idx
  on public.customer_imports (creat_de);

alter table public.customer_imports enable row level security;
revoke all on public.customer_imports from anon;

drop policy if exists "owner_select_customer_imports" on public.customer_imports;
create policy "owner_select_customer_imports" on public.customer_imports
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

notify pgrst, 'reload schema';
