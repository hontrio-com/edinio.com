-- Analiticele, agregate pe zi.
--
-- `site_analytics` are un rand pe EVENIMENT si creste doar cu traficul: 54.980 de
-- randuri, 12 MB cu tot cu indexuri, si nimic nu le sterge vreodata. Agregarea pe
-- (magazin, zi, tip, dispozitiv, sursa) da 1.627 de randuri — raport 33,8:1 —
-- fiindca panoul nu citeste NICIODATA evenimente individuale pe intervale mari:
-- singura lui intrebare acolo e `site_analytics_breakdown`, adica exact aceasta
-- grupare.
--
-- ═══ CE FACE FISIERUL ASTA SI CE NU FACE ═══
--
-- FACE: tabela, functia de agregare, si backfill-ul. Atat.
--
-- NU FACE, deliberat, doua lucruri care trebuie decise inainte:
--
--   1. NU STERGE NIMIC din `site_analytics`. Regula e „backfill INAINTE de orice
--      stergere", si intre backfill si stergere trebuie sa treaca destul timp cat
--      sa se vada ca agregarea chiar tine pasul. Retentia se pune separat, cand
--      numerele de mai jos se confirma.
--
--   2. NU MUTA `site_analytics_breakdown` pe agregat, fiindca AR SCHIMBA CIFRELE
--      PE CARE LE VEDE COMERCIANTUL. Panoul cere „de acum minus 30 de zile", cu
--      ora cu tot (`AnalyticsClient.tsx:293` — `now - p * 86400000`), iar un
--      agregat pe ZILE nu poate raspunde la asta: prima zi din interval ar intra
--      intreaga, nu de la ora ceruta. Diferenta e mica si mereu in plus, dar e o
--      schimbare de definitie a unei metrici, nu o optimizare — si se decide cu
--      comerciantul, nu intr-o migratie de viteza. Cele doua iesiri sunt: ori
--      panoul cere zile intregi, ori interogarea ramane hibrida (agregat pentru
--      zilele pline, brut pentru capete — dar atunci retentia ii taie capatul de
--      jos si tot aproximeaza).
--
-- Pana atunci tabela se intretine si nu o citeste nimeni. E acelasi tipar ca
-- `catalog_produs` la faza A1: ce se castiga acum e optionalitatea, iar cand se ia
-- decizia de mai sus datele exista deja, in loc sa se astepte inca 76 de zile.

create table if not exists public.business_daily_stats (
  business_id uuid not null references public.businesses(id) on delete cascade,
  zi          date not null,
  event_type  text not null,
  -- `device`, `source` si `country` sunt NULL-abile in `site_analytics`, iar o
  -- cheie primara nu suporta NULL: se normalizeaza la sirul gol, la fel la
  -- scriere si la citire, ca sa nu existe doua randuri pentru acelasi lucru.
  device      text not null default '',
  source      text not null default '',
  nr          integer not null,
  primary key (business_id, zi, event_type, device, source)
);
alter table public.business_daily_stats enable row level security;

comment on table public.business_daily_stats is
  'Analiticele agregate pe zi. Scrisa de agregeaza_analitice(); vezi migratia pentru ce NU citeste inca din ea.';

-- Interogarea panoului e „un magazin, de la o zi incolo", deci asta e ordinea.
create index if not exists bds_biz_zi on public.business_daily_stats (business_id, zi desc);

/*
 * Agregeaza zilele cerute. Implicit ultimele doua, ca rularea orara sa repare si
 * ziua de ieri daca a ratat-o (fus orar, cron sarit, eveniment intarziat).
 *
 * Ziua se taie pe ORA ROMANIEI, nu pe UTC: comerciantul citeste „ieri" ca ziua
 * lui calendaristica. Pe UTC, tot ce se intampla intre miezul noptii si ora 2-3
 * ar fi cazut in ziua precedenta — adica traficul de seara al unui magazin ar fi
 * fost raportat pe alta zi.
 *
 * Se REscrie fiecare zi atinsa, nu se aduna: rulata de doua ori pe aceeasi zi,
 * o adunare ar fi dublat numerele in liniste.
 */
create or replace function public.agregeaza_analitice(p_zile int default 2)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_de_la date := (now() at time zone 'Europe/Bucharest')::date - greatest(coalesce(p_zile, 2), 1) + 1;
  v_scrise int;
begin
  delete from public.business_daily_stats where zi >= v_de_la;

  insert into public.business_daily_stats (business_id, zi, event_type, device, source, nr)
  select a.business_id,
         (a.created_at at time zone 'Europe/Bucharest')::date as zi,
         a.event_type,
         coalesce(a.device, ''),
         coalesce(a.source, ''),
         count(*)
    from public.site_analytics a
   where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
     -- Un eveniment al unui magazin sters n-are unde sa se duca: cheia straina
     -- l-ar respinge si ar opri toata agregarea.
     and exists (select 1 from public.businesses b where b.id = a.business_id)
   group by 1, 2, 3, 4, 5;

  get diagnostics v_scrise = row_count;
  return v_scrise;
end;
$$;

revoke all on function public.agregeaza_analitice(int) from public, anon, authenticated;
grant execute on function public.agregeaza_analitice(int) to service_role;

notify pgrst, 'reload schema';

-- ── BACKFILL, o singura data ────────────────────────────────────────────────
-- Nu prin `agregeaza_analitice`: aceea sterge si rescrie o fereastra recenta, iar
-- aici e nevoie de tot istoricul. Se ruleaza manual, o data.
--
--   insert into public.business_daily_stats (business_id, zi, event_type, device, source, nr)
--   select a.business_id, (a.created_at at time zone 'Europe/Bucharest')::date,
--          a.event_type, coalesce(a.device,''), coalesce(a.source,''), count(*)
--     from public.site_analytics a
--    where exists (select 1 from public.businesses b where b.id = a.business_id)
--    group by 1,2,3,4,5
--   on conflict (business_id, zi, event_type, device, source) do update set nr = excluded.nr;
--
-- VERIFICARE (trebuie sa dea zero pe ambele):
--   select count(*) from (
--     select business_id, (created_at at time zone 'Europe/Bucharest')::date zi, event_type,
--            coalesce(device,'') d, coalesce(source,'') s, count(*) n
--       from site_analytics a
--      where exists (select 1 from businesses b where b.id = a.business_id)
--      group by 1,2,3,4,5) v
--     full join business_daily_stats t
--       on t.business_id=v.business_id and t.zi=v.zi and t.event_type=v.event_type
--      and t.device=v.d and t.source=v.s
--    where t.nr is distinct from v.n;
