-- ═══════════════════════════════════════════════════════════════════════════
-- A2: un mesaj de recuperare pleaca O SINGURA DATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE LIPSEA. Pana acum nu exista nicaieri urma ca „mesajul asta a plecat".
-- Cosul tinea minte doar `recovery_count` si doua date („ultimul email",
-- „ultimul SMS"), care nu pot raspunde la intrebarea „a mai plecat exact
-- acesta?".
--
-- Automatizarile erau deja aparate: cronul ia pasul cu un compare-and-swap pe
-- `automation_step` inainte sa trimita, deci doua rulari suprapuse nu pot
-- trimite acelasi pas de doua ori. Gaura era la trimiterea DE MANA: butonul e
-- stins cat tine cererea, dar asta nu acopera o reincarcare, doua file
-- deschise, doi oameni din aceeasi echipa, sau o cerere care a picat pe retea
-- DUPA ce serverul trimisese deja.
--
-- ⚠ CHEIA NU E „COS + CANAL". Ar fi insemnat un singur email pe cos, vreodata -
-- si comerciantul are voie sa trimita un al doilea mesaj, peste o saptamana,
-- cu alt text. Cheia e `cos + canal + cheia cererii`: o apasare = o cheie.
-- Retrimisa aceeasi apasare, randul exista deja si nu mai pleaca nimic; o
-- apasare noua e o intentie noua si trece.
create table if not exists public.recovery_sends (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  cart_id uuid not null references public.abandoned_carts(id) on delete cascade,
  canal text not null check (canal in ('email', 'sms')),
  sursa text not null check (sursa in ('manual', 'automatizare')),
  -- Cheia cererii pentru manual; `pas:<n>` pentru automatizari.
  cheie text not null,
  pas integer,
  trimis_la timestamptz not null default now(),
  -- ⚠ Randul se scrie INAINTE de trimitere, ca revendicarea pasului din cron.
  -- Cat timp e `false`, mesajul e revendicat dar neconfirmat.
  confirmat boolean not null default false
);

-- ⚠ ASTA E TOATA APARAREA. Fara indexul unic, tabela e doar un jurnal.
create unique index if not exists recovery_sends_cheie_uidx
  on public.recovery_sends (cart_id, canal, cheie);

create index if not exists recovery_sends_business_trimis_idx
  on public.recovery_sends (business_id, trimis_la desc);

alter table public.recovery_sends enable row level security;

-- ⚠⚠ SI DREPTUL DE SELECT SE IA DE LA `anon`, NU DOAR RLS-UL.
--
-- Supabase da implicit TOATE drepturile lui `anon` pe o tabela noua din `public`.
-- RLS chiar apara randurile (singura politica e a proprietarului, iar `anon` n-are
-- `auth.uid()`), dar asta e UN singur strat, si toate tabelele surori au doua:
-- `abandoned_carts`, `orders` si `recovery_optout` au toate `anon` FARA select.
--
-- ⚠ Lipsa asta a fost gasita pe 21.09.2026, la aplicarea in productie, comparand
-- tabela noua cu surorile ei. Nu curgea nimic - dar o a doua politica permisiva
-- adaugata candva peste ar fi deschis-o, si nimeni n-ar mai fi cautat aici.
-- Aceeasi lectie ca la copiile de siguranta din 20.09, unde `create table as`
-- n-a mostenit nici RLS, nici granturile.
--
-- ⚠ Se ia de la `anon`, nu de la `public`: dreptul e dat DIRECT rolului (verificat
-- in `role_table_grants`), deci un `revoke from public` n-ar fi atins nimic.
revoke select on public.recovery_sends from anon;

-- Numai citire pentru comerciant: scrierile vin prin clientul de serviciu, ca
-- la `abandoned_carts`.
drop policy if exists "owner_select_recovery_sends" on public.recovery_sends;
create policy "owner_select_recovery_sends" on public.recovery_sends
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );

notify pgrst, 'reload schema';
