-- ═══════════════════════════════════════════════════════════════════════════
-- ANALITICE: SESIUNI SI VIZITATORI, FARA COOKIE (20.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA GRESIT, SI DE CE NU SE PUTEA REPARA DIN ECRAN.
--
-- `site_analytics` avea un singur fel de eveniment, `visit`, scris la FIECARE
-- randare a paginii. Fara sesiune si fara vizitator:
--   * „Vizitatori activi" numara afisari. Cine reincarca de cinci ori e cinci.
--   * „Rata de conversie" imparte comenzi la afisari: la 100 de oameni cu cate
--     4 pagini si 5 comenzi, adevarul e 5%, iar cifra aratata 1,25%.
-- Nicio schimbare de interfata nu repara asta; lipsea masuratoarea.
--
-- ⚠ FARA COOKIE, DINADINS.
-- Un cookie de analitica ar fi cerut acordul din bannerul de cookie-uri, iar in
-- panou nu exista banner (hotararea proprietarului). Sesiunea si vizitatorul se
-- deduc din amprenta cererii (adresa IP + browser + magazin), trecuta printr-o
-- functie de dispersie cu SARE care se schimba in fiecare zi.
--
-- ⚠ AMPRENTA NU SE PASTREAZA NICAIERI. In rand ajung doar rezultatele dispersiei.
-- Sarea zilei se sterge dupa 7 zile, deci nici cu baza in mana nu se mai poate
-- afla, peste doua saptamani, de la ce adresa a venit cineva.

-- ── 1. Coloanele noi ────────────────────────────────────────────────────────
alter table public.site_analytics
  add column if not exists session_id text,
  add column if not exists visitor_id text,
  add column if not exists path       text,
  add column if not exists product_id uuid;

comment on column public.site_analytics.session_id is
  'Sesiune dedusa din amprenta cererii + fereastra de 30 de minute. Nereversibila.';
comment on column public.site_analytics.visitor_id is
  'Vizitator dedus din aceeasi amprenta, pe ZIUA romaneasca. Nereversibil.';
comment on column public.site_analytics.path is
  'Ce pagina a fost deschisa, pentru palnie si pentru pagini pe sesiune.';
comment on column public.site_analytics.product_id is
  'Produsul vazut sau adaugat in cos, cand evenimentul e despre unul anume.';

-- ⚠ Indexul poarta si `event_type`: toate socotelile noi filtreaza dupa el
-- („cate sesiuni cu `purchase`"), iar fara el fiecare card ar fi citit tabela
-- intreaga a magazinului.
create index if not exists site_analytics_biz_zi_fel
  on public.site_analytics (business_id, created_at desc, event_type);

create index if not exists site_analytics_sesiune
  on public.site_analytics (business_id, session_id)
  where session_id is not null;

-- ── 2. Sarea zilei ──────────────────────────────────────────────────────────
-- ⚠ IN BAZA, nu intr-o variabila de mediu: se schimba singura la miezul noptii,
-- nu trebuie tinuta minte de nimeni, si se poate sterge. O variabila ar fi fost
-- aceeasi luni intregi, iar amprentele ar fi ramas comparabile intre ele oricat.
create table if not exists public.analitice_sare (
  zi   date primary key,
  sare text not null default encode(gen_random_bytes(32), 'hex'),
  creat_la timestamptz not null default now()
);

alter table public.analitice_sare enable row level security;
-- Nicio politica: doar `service_role` (care ocoleste RLS) o citeste, de pe server.
-- Sarea in mainile cuiva ar face amprentele reconstruibile prin incercari.

revoke all on table public.analitice_sare from anon, authenticated;

/*
  Sarea de azi, creata la prima cerere a zilei si stearsa dupa o saptamana.

  ⚠ `security definer` fiindca tabela n-are nicio politica: functia e singura
  usa, si ea da doar sarea zilei curente, niciodata pe cele vechi.
*/
create or replace function public.analitice_sarea_zilei()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_zi date := (now() at time zone 'Europe/Bucharest')::date;
  v_sare text;
begin
  insert into public.analitice_sare (zi) values (v_zi)
  on conflict (zi) do nothing;

  select sare into v_sare from public.analitice_sare where zi = v_zi;

  /* Curatenie oportunista: mai veche de 7 zile nu mai are pentru ce sa existe. */
  delete from public.analitice_sare where zi < v_zi - 7;

  return v_sare;
end;
$$;

revoke execute on function public.analitice_sarea_zilei() from public, anon, authenticated;
grant execute on function public.analitice_sarea_zilei() to service_role;

notify pgrst, 'reload schema';

-- ⚠ Indexul pe VIZITATOR, cerut de sesiunea alunecatoare.
-- Sesiunea nu e o fereastra fixa de 30 de minute, ci 30 de minute de
-- INACTIVITATE: la fiecare eveniment se cauta ultimul eveniment al aceluiasi
-- vizitator. O fereastra fixa ar fi taiat in doua pe oricine navigheaza peste
-- un sfert de ora rotund, si ar fi umflat numarul de sesiuni fix la magazinele
-- unde oamenii stau mult.
create index if not exists site_analytics_vizitator
  on public.site_analytics (business_id, visitor_id, created_at desc)
  where visitor_id is not null;
