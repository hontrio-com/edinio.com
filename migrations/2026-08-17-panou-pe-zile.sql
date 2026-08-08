-- Panoul de analitice citeste AGREGATUL, si tabela bruta capata retentie.
--
-- ═══ DECIZIA, si de ce ═══
--
-- `business_daily_stats` exista de la `2026-08-16-analitice-zilnice.sql`, dar
-- nu-l citea nimeni: panoul cerea „de acum minus 30 de zile", CU ORA, iar un
-- agregat pe zile nu poate raspunde la asta — prima zi ar fi intrat intreaga.
--
-- Ferestrele trec pe ZILE CALENDARISTICE. Trei motive:
--   1. Asta si scrie pe ecran. Butoanele spun „7 / 30 / 90 zile" si graficul
--      „Vanzari zilnice - ultimele 30 zile"; o fereastra care taie la 14:37 nu e
--      ce intelege nimeni din eticheta aia.
--   2. Cifrele devin STABILE. Pana acum, reincarcarea paginii la 15:00 dadea alt
--      numar decat la 14:00, fiindca fereastra aluneca — iar comparatia cu
--      perioada precedenta aluneca si ea, decalata cu ore.
--   3. E singurul mod in care tabela bruta poate inceta sa creasca. Cu fereastra
--      alunecatoare, orice interogare pe 90 de zile are nevoie de randuri brute
--      de acum 90 de zile, deci nu se poate sterge nimic, niciodata.
--
-- Ziua e a ROMANIEI, nu UTC: pe UTC, traficul de seara al unui magazin ar fi
-- raportat pe ziua urmatoare.
--
-- Fereastra se calculeaza INTR-UN SINGUR LOC (`inceput_fereastra_ro`) si o
-- folosesc si analiticele, si comenzile. Calculate separat, rata de conversie ar
-- fi impartit vizite dintr-o fereastra la comenzi din alta — un procent gresit
-- care arata perfect plauzibil.
--
-- Si NU se calculeaza in browser: acolo ar fi trebuit dedusa trecerea la ora de
-- vara din `Intl`, adica exact codul care se strica de doua ori pe an. Postgres
-- are baza de fusuri; o foloseste.

/*
 * Miezul noptii, ora Romaniei, de la care incepe fereastra.
 *
 * `p_deplasare = 0` da fereastra curenta (ultimele `p_zile` zile, cu azi cu tot),
 * `1` da perioada precedenta de aceeasi lungime, care se termina exact unde
 * incepe cea curenta.
 */
create or replace function public.inceput_fereastra_ro(p_zile int, p_deplasare int default 0)
returns timestamptz
language sql
stable
set search_path to ''
as $$
  select ((((now() at time zone 'Europe/Bucharest')::date
            - (greatest(coalesce(p_zile, 30), 1) * (coalesce(p_deplasare, 0) + 1) - 1))::timestamp)
          at time zone 'Europe/Bucharest')
$$;

/*
 * Defalcarea vizitelor pe fereastra de zile.
 *
 * Zilele INCHEIATE vin din agregat (33,8 randuri stranse in unul), iar ziua de AZI
 * din tabela bruta — fiindca agregarea ruleaza orar, deci pentru azi ar fi mereu
 * in urma cu pana la o ora. Asa numarul de azi e la zi la secunda, iar restul
 * ferestrei e ieftin oricat de lunga ar fi.
 *
 * `device` si `source` se normalizeaza la sirul gol in agregat (cheia primara nu
 * suporta NULL), deci si ramura bruta face la fel: altfel aceeasi vizita ar iesi
 * pe doua randuri diferite, unul cu NULL si unul cu ''.
 */
create or replace function public.site_analytics_breakdown_zile(bid uuid, p_zile int)
returns table (event_type text, device text, source text, cnt bigint)
language sql
stable
set search_path to ''
as $$
  with fereastra as (
    select ((now() at time zone 'Europe/Bucharest')::date
            - (greatest(coalesce(p_zile, 30), 1) - 1)) as de_la,
           (now() at time zone 'Europe/Bucharest')::date as azi
  ),
  toate as (
    select s.event_type, s.device, s.source, s.nr::bigint as cnt
      from public.business_daily_stats s, fereastra f
     where s.business_id = bid and s.zi >= f.de_la and s.zi < f.azi
    union all
    select a.event_type, coalesce(a.device, ''), coalesce(a.source, ''), 1::bigint
      from public.site_analytics a, fereastra f
     where a.business_id = bid
       and (a.created_at at time zone 'Europe/Bucharest')::date = f.azi
  )
  select t.event_type, t.device, t.source, sum(t.cnt)::bigint
    from toate t
   group by 1, 2, 3
$$;

/*
 * Venitul zilnic pe aceeasi fereastra, ca sa nu se compare mere cu pere.
 *
 * Nu reface socoteala: cheama chiar `orders_daily_revenue`, care exista si e
 * corecta. Ce adauga e DOAR fereastra, luata din acelasi loc ca analiticele.
 */
create or replace function public.orders_venit_zilnic(bid uuid, p_zile int, p_deplasare int default 0)
returns table (day date, revenue numeric, order_count bigint)
language sql
stable
set search_path to ''
as $$
  select * from public.orders_daily_revenue(
    bid,
    public.inceput_fereastra_ro(p_zile, coalesce(p_deplasare, 0)),
    case when coalesce(p_deplasare, 0) = 0 then null
         else public.inceput_fereastra_ro(p_zile, coalesce(p_deplasare, 0) - 1) end
  )
$$;

grant execute on function public.inceput_fereastra_ro(int, int) to anon, authenticated, service_role;
grant execute on function public.site_analytics_breakdown_zile(uuid, int) to anon, authenticated, service_role;
grant execute on function public.orders_venit_zilnic(uuid, int, int) to anon, authenticated, service_role;

/*
 * RETENTIA. Se poate abia acum, cand agregatul e citit si acopera tot istoricul.
 *
 * Se pastreaza 8 zile de randuri brute, nu 7: agregarea reface ultimele DOUA zile
 * la fiecare rulare, iar panoul citeste brut doar ziua de azi. Opt lasa o margine
 * confortabila peste amandoua, ca o rulare de cron sarita sa nu taie o zi care nu
 * fusese inca agregata.
 *
 * Sterge in transe: un `delete` peste zeci de mii de randuri tine un lock lung
 * chiar pe tabela in care scrie fiecare vizita.
 */
create or replace function public.curata_analitice_brute(p_pastreaza_zile int default 8, p_max int default 5000)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_sterse int;
begin
  with vechi as (
    select a.id from public.site_analytics a
     where (a.created_at at time zone 'Europe/Bucharest')::date
           < (now() at time zone 'Europe/Bucharest')::date - greatest(coalesce(p_pastreaza_zile, 8), 3)
     limit greatest(coalesce(p_max, 5000), 1)
  )
  delete from public.site_analytics a using vechi v where a.id = v.id;
  get diagnostics v_sterse = row_count;
  return v_sterse;
end;
$$;

revoke all on function public.curata_analitice_brute(int, int) from public, anon, authenticated;
grant execute on function public.curata_analitice_brute(int, int) to service_role;

notify pgrst, 'reload schema';
