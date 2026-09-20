-- ═══════════════════════════════════════════════════════════════════════════
-- GRAFICUL DE VANZARI: PERIOADE, CANALE SI COMPARATIA CU PERIOADA PRECEDENTA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Graficul de pana acum arata sapte zile, o singura masura (venitul) si nimic
-- altceva. Acum are nevoie de: trei masuri (vanzari, comenzi, valoare medie),
-- sase perioade, filtru pe canal de vanzare si comparatie cu perioada
-- precedenta. Toate astea inseamna aceeasi socoteala facuta de doua ori, pe
-- ferestre calculate dupa reguli care difera de la o perioada la alta.
--
-- ⚠ DE CE O SINGURA FUNCTIE, CARE INTOARCE TOT.
-- Daca ferestrele s-ar calcula in JavaScript si agregarea in SQL, ar exista doua
-- surse de adevar pentru „ce inseamna ultimele 30 de zile", si s-ar desparti
-- tacut la prima schimbare de ora de vara. Aici intra un magazin si un nume de
-- perioada, si ies seriile, totalurile si intervalele folosite.
--
-- ⚠ ZIUA E CEA ROMANEASCA, nu cea UTC, si asta e o REPARATIE, nu o preferinta.
-- `orders_daily_revenue` (graficul vechi) grupeaza pe `(created_at at time zone
-- 'UTC')::date`. Vara, o comanda plasata la 01:30 noaptea cade in ziua
-- precedenta, iar comerciantul vede vanzarea „ieri". Aici se grupeaza pe ziua
-- din Europe/Bucharest, la fel ca in restul panoului (`site_analytics`).
--
-- ⚠ CE E O VANZARE: acelasi inteles ca peste tot in panou, adica orice comanda
-- care nu e `cancelled` sau `refunded`. Nu se schimba aici.
--
-- ⚠ SECURITY INVOKER (implicit): RLS de pe `orders` ramane poarta. `p_business`
-- e un filtru, nu o permisiune.

-- Ferestrele, intr-un singur loc. Intoarce si perioada precedenta, fiindca
-- „precedenta" inseamna altceva de la un fel la altul:
--   * zile (7/30/90) si personalizat -> fereastra de aceeasi lungime, lipita inainte;
--   * luna aceasta  -> aceleasi zile din luna trecuta (1-20 vs 1-20), nu ultimele 20 de zile;
--   * anul acesta   -> aceeasi perioada din anul trecut.
create or replace function public.fereastra_vanzari(
  p_fel text default '7z',
  p_de_la date default null,
  p_pana_la date default null
)
returns table (
  de_la date, pana_la date,
  de_la_ant date, pana_la_ant date,
  granulatie text
)
language plpgsql
stable
set search_path to 'pg_catalog', 'pg_temp'
as $$
declare
  azi date := (now() at time zone 'Europe/Bucharest')::date;
  s date; e date; sa date; ea date; zile integer; g text;
begin
  case coalesce(p_fel, '7z')
    when '30z'  then s := azi - 29; e := azi;
    when '90z'  then s := azi - 89; e := azi;
    when 'luna' then s := date_trunc('month', azi)::date; e := azi;
    when 'an'   then s := date_trunc('year',  azi)::date; e := azi;
    when 'custom' then
      s := coalesce(p_de_la, azi - 6);
      e := coalesce(p_pana_la, azi);
      if e < s then                      -- intervalul intors pe dos: se indreapta
        declare t date := s; begin s := e; e := t; end;
      end if;
      -- Doi ani e destul pentru orice privire, si tine cererea marginita.
      if e - s > 730 then s := e - 730; end if;
      -- Viitorul n-are vanzari; capatul se opreste azi.
      if e > azi then e := azi; end if;
      if s > e then s := e; end if;
    else s := azi - 6; e := azi;         -- '7z' si orice nume necunoscut
  end case;

  zile := (e - s) + 1;

  if coalesce(p_fel, '7z') = 'luna' then
    sa := (s - interval '1 month')::date;
    ea := (e - interval '1 month')::date;
  elsif coalesce(p_fel, '7z') = 'an' then
    sa := (s - interval '1 year')::date;
    ea := (e - interval '1 year')::date;
  else
    ea := s - 1;
    sa := ea - (zile - 1);
  end if;

  g := case when zile <= 92 then 'zi' when zile <= 400 then 'saptamana' else 'luna' end;

  return query select s, e, sa, ea, g;
end;
$$;

-- Canalele pe care chiar a vandut magazinul. Ecranul arata filtrul doar daca
-- exista mai mult de unul: un magazin fara marketplace n-are de ce sa vada o
-- lista cu o singura optiune.
create or replace function public.canale_vanzare(p_business uuid)
returns table (canal text, comenzi bigint)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(o.order_source ->> 'marketplace', 'magazin') as canal,
         count(*)::bigint
    from public.orders o
   where o.business_id = p_business
     and o.status not in ('cancelled', 'refunded')
   group by 1
   order by 2 desc
$$;

-- Tot ce afiseaza graficul, dintr-o singura cerere.
create or replace function public.vanzari_panou(
  p_business uuid,
  p_fel text default '7z',
  p_de_la date default null,
  p_pana_la date default null,
  p_canal text default null              -- null = toate, 'magazin' = doar magazinul propriu
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f0 as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la)),
  -- Numele romanesc al granulatiei se traduce o singura data in cel al bazei,
  -- impreuna cu pasul potrivit; restul interogarii le citeste de aici.
  f as (
    select de_la, pana_la, de_la_ant, pana_la_ant, granulatie,
           case granulatie when 'zi' then 'day' when 'saptamana' then 'week' else 'month' end as gpg,
           case granulatie when 'zi' then interval '1 day'
                           when 'saptamana' then interval '1 week'
                           else interval '1 month' end as pas
      from f0
  ),
  -- Comenzile din AMANDOUA ferestrele, citite o singura data.
  comenzi as (
    select
      case when (o.created_at at time zone 'Europe/Bucharest')::date >= f.de_la then 'acum' else 'inainte' end as fereastra,
      date_trunc(f.gpg, (o.created_at at time zone 'Europe/Bucharest'))::date as bucata,
      o.total
      from f
      join public.orders o on o.business_id = p_business
       and o.status not in ('cancelled', 'refunded')
       -- Margini pe `created_at` ca sa poata lucra indexul; ziua romaneasca se
       -- verifica separat, mai jos.
       and o.created_at >= ((least(f.de_la, f.de_la_ant))::timestamp at time zone 'Europe/Bucharest')
       and o.created_at <  (((f.pana_la + 1))::timestamp at time zone 'Europe/Bucharest')
       and (
         p_canal is null
         or (p_canal = 'magazin' and o.order_source ->> 'marketplace' is null)
         or (p_canal <> 'magazin' and o.order_source ->> 'marketplace' = p_canal)
       )
       -- Fereastra precedenta poate sta oriunde inainte; ce cade intre ele se ignora.
       and ((o.created_at at time zone 'Europe/Bucharest')::date between f.de_la and f.pana_la
         or (o.created_at at time zone 'Europe/Bucharest')::date between f.de_la_ant and f.pana_la_ant)
  ),
  adunate as (
    select fereastra, bucata, round(coalesce(sum(total), 0), 2) as vanzari, count(*)::int as nr
      from comenzi group by 1, 2
  ),
  -- Bucatile goale trebuie sa existe: un grafic cu zile lipsa minte despre ritm.
  bucati_acum as (
    select generate_series(
             date_trunc((select gpg from f), (select de_la from f)::timestamp),
             (select pana_la from f)::timestamp,
             (select pas from f))::date as bucata
  ),
  bucati_inainte as (
    select generate_series(
             date_trunc((select gpg from f), (select de_la_ant from f)::timestamp),
             (select pana_la_ant from f)::timestamp,
             (select pas from f))::date as bucata
  )
  select jsonb_build_object(
    'granulatie', (select granulatie from f),
    'interval', jsonb_build_object('de_la', (select de_la from f), 'pana_la', (select pana_la from f)),
    'interval_anterior', jsonb_build_object('de_la', (select de_la_ant from f), 'pana_la', (select pana_la_ant from f)),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object(
                       'bucata', b.bucata,
                       'vanzari', coalesce(a.vanzari, 0),
                       'comenzi', coalesce(a.nr, 0)) order by b.bucata), '[]'::jsonb)
                from bucati_acum b
                left join adunate a on a.bucata = b.bucata and a.fereastra = 'acum'),
    'serie_anterioara', (select coalesce(jsonb_agg(jsonb_build_object(
                       'bucata', b.bucata,
                       'vanzari', coalesce(a.vanzari, 0),
                       'comenzi', coalesce(a.nr, 0)) order by b.bucata), '[]'::jsonb)
                from bucati_inainte b
                left join adunate a on a.bucata = b.bucata and a.fereastra = 'inainte'),
    'total', (select jsonb_build_object('vanzari', coalesce(sum(vanzari), 0), 'comenzi', coalesce(sum(nr), 0))
                from adunate where fereastra = 'acum'),
    'total_anterior', (select jsonb_build_object('vanzari', coalesce(sum(vanzari), 0), 'comenzi', coalesce(sum(nr), 0))
                from adunate where fereastra = 'inainte')
  )
$$;

-- ── Drepturi ────────────────────────────────────────────────────────────────
-- ⚠ Si de la `anon`, PE NUME: privilegiile implicite ale proiectului dau grantul
-- pe nume fiecarei functii noi, iar `revoke ... from public` nu-l stinge. Fara
-- randurile astea, oricine cu cheia publica ar putea cere cifra de afaceri a
-- oricarui magazin.
revoke execute on function public.fereastra_vanzari(text, date, date) from public, anon;
revoke execute on function public.canale_vanzare(uuid) from public, anon;
revoke execute on function public.vanzari_panou(uuid, text, date, date, text) from public, anon;

grant execute on function public.fereastra_vanzari(text, date, date) to authenticated, service_role;
grant execute on function public.canale_vanzare(uuid) to authenticated, service_role;
grant execute on function public.vanzari_panou(uuid, text, date, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
