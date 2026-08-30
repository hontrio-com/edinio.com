-- ═══════════════════════════════════════════════════════════════════════════
-- „DE CE NU APARE PRODUSUL MEU PE OLX?" — SI CATI S-AU UITAT LA EL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Doua lucruri pe care OLX ni le spune de mult si pe care nu le ceream.
--
-- ⚠ 1. MOTIVUL MODERARII. Pana azi, comerciantul vedea „Moderat" sau „Eroare" si atat. OLX are o
-- ruta separata care spune EXACT ce n-a mers: categoria nu se potriveste, lipseste un atribut,
-- continutul nu e permis. Fara ea, singurul drum al omului e sa intrebe suportul — iar suportul nu
-- stie nici el, fiindca nici Edinio n-a intrebat.
--
-- Se pastreaza si CLIPA cererii, nu doar raspunsul: fara ea n-am sti sa deosebim „am intrebat si
-- n-au avut ce spune" de „n-am intrebat inca", si am reintreba la fiecare sondare.
--
-- ⚠ 2. STATISTICILE. `advert_views`, `phone_views`, `users_observing`. Ultima valoare sta pe rand,
-- ca sa se poata arata langa produs fara alta cerere. Istoricul sta separat, o linie pe zi:
-- diferenta dintre „1.842 de vizualizari" si „+320 fata de saptamana trecuta" e chiar ce-l ajuta
-- pe om sa hotarasca daca merita sa promoveze.
--
-- ⚠ O LINIE PE ZI, NU PE CERERE. Cronul poate trece de mai multe ori pe zi peste acelasi anunt;
-- cheia primara pe (magazin, anunt, zi) face din a doua trecere o actualizare, nu inca un rand.

alter table public.olx_adverts
  add column if not exists moderation_cod   text,
  add column if not exists moderation_text  text,
  add column if not exists moderation_la    timestamptz,
  add column if not exists stat_vizualizari integer,
  add column if not exists stat_telefon     integer,
  add column if not exists stat_urmaritori  integer,
  add column if not exists stat_la          timestamptz;

comment on column public.olx_adverts.moderation_text is
  'Motivul respingerii, asa cum l-au spus ei. Se arata omului ca atare: reformulat, ar deveni o presupunere.';
comment on column public.olx_adverts.moderation_la is
  'Cand am intrebat ultima oara. Deosebeste „am intrebat si n-au avut ce spune" de „n-am intrebat inca".';
comment on column public.olx_adverts.stat_la is
  'Cand s-au cerut ultima oara statisticile. Marcajul de rotatie: cele mai vechi se cer primele.';

-- Cronul cere statisticile pentru anunturile ACTIVE cu marcajul cel mai vechi.
create index if not exists olx_adverts_stat_la_idx
  on public.olx_adverts (business_id, stat_la nulls first)
  where olx_advert_id is not null;

-- ── Istoricul, o linie pe zi ────────────────────────────────────────────────
create table if not exists public.olx_statistici_zilnice (
  business_id    uuid        not null references public.businesses(id) on delete cascade,
  olx_advert_id  bigint      not null,
  zi             date        not null,
  vizualizari    integer,
  telefon        integer,
  urmaritori     integer,
  actualizat_la  timestamptz not null default now(),
  primary key (business_id, olx_advert_id, zi)
);

comment on table public.olx_statistici_zilnice is
  'Cate vizualizari a avut un anunt, zi de zi. Cheia primara pe (magazin, anunt, zi) face din a '
  'doua trecere a cronului o actualizare, nu inca un rand.';

create index if not exists olx_statistici_zilnice_zi_idx
  on public.olx_statistici_zilnice (business_id, zi desc);

alter table public.olx_statistici_zilnice enable row level security;

-- Citire numai pentru proprietar; scrierile raman ale rolului de sistem.
drop policy if exists owner_select_olx_statistici on public.olx_statistici_zilnice;
create policy owner_select_olx_statistici on public.olx_statistici_zilnice
  for select to authenticated
  using (exists (
    select 1 from public.businesses b
     where b.id = olx_statistici_zilnice.business_id
       and b.user_id = auth.uid()
  ));

notify pgrst, 'reload schema';
