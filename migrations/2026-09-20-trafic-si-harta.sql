-- ═══════════════════════════════════════════════════════════════════════════
-- CIFRELE DE TRAFIC (pe sesiuni) SI HARTA CARE RESPECTA PERIOADA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE UNDE SE CITESC SESIUNILE: din `analitice_zilnic` pentru zilele incheiate
-- si din randurile brute pentru ZIUA DE AZI. Aceeasi regula ca la vizitele de
-- pana acum (`site_analytics_breakdown_zile`), si din acelasi motiv: ziua in
-- curs nu e inca stransa, iar randurile mai vechi de 8 zile nu mai exista.
--
-- ⚠ „VIZITATORI" INSEAMNA VIZITATORI PE ZI, INSUMATI. Amprenta se schimba in
-- fiecare noapte (sarea e zilnica), deci cine revine maine se numara din nou.
-- Nu e o scapare de socoteala, e pretul masurarii fara cookie, si ecranul o
-- spune in tooltip. Orice alta varianta ar fi cerut un identificator care sa
-- traiasca in browserul omului.

-- ── Cifrele de trafic, pentru o perioada si pentru cea dinainte ─────────────
create or replace function public.trafic_panou(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la)),
  azi as (select (now() at time zone 'Europe/Bucharest')::date as zi),
  -- Zilele incheiate, din agregat.
  strans as (
    select z.zi, z.vizitatori, z.sesiuni, z.afisari, z.sesiuni_cu_comanda
      from public.analitice_zilnic z, azi
     where z.business_id = p_business and z.zi < azi.zi
  ),
  -- Ziua de azi, din randurile brute.
  bruta as (
    select azi.zi,
           count(distinct a.visitor_id)::int as vizitatori,
           count(distinct a.session_id)::int as sesiuni,
           count(*) filter (where a.event_type = 'visit')::int as afisari,
           count(distinct a.session_id) filter (where a.event_type = 'purchase')::int as sesiuni_cu_comanda
      from azi
      left join public.site_analytics a
        on a.business_id = p_business
       and a.session_id is not null
       and (a.created_at at time zone 'Europe/Bucharest')::date = azi.zi
     group by azi.zi
  ),
  toate as (
    select * from strans
    union all
    select * from bruta where sesiuni > 0
  ),
  acum as (
    select coalesce(sum(vizitatori), 0)::int as vizitatori,
           coalesce(sum(sesiuni), 0)::int as sesiuni,
           coalesce(sum(afisari), 0)::int as afisari,
           coalesce(sum(sesiuni_cu_comanda), 0)::int as sesiuni_cu_comanda
      from toate, f where zi between f.de_la and f.pana_la
  ),
  inainte as (
    select coalesce(sum(vizitatori), 0)::int as vizitatori,
           coalesce(sum(sesiuni), 0)::int as sesiuni,
           coalesce(sum(afisari), 0)::int as afisari,
           coalesce(sum(sesiuni_cu_comanda), 0)::int as sesiuni_cu_comanda
      from toate, f where zi between f.de_la_ant and f.pana_la_ant
  )
  select jsonb_build_object(
    'interval', jsonb_build_object('de_la', (select de_la from f), 'pana_la', (select pana_la from f)),
    'interval_anterior', jsonb_build_object('de_la', (select de_la_ant from f), 'pana_la', (select pana_la_ant from f)),
    'total', (select to_jsonb(acum) from acum),
    'total_anterior', (select to_jsonb(inainte) from inainte),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object(
                       'bucata', t.zi, 'sesiuni', t.sesiuni, 'vizitatori', t.vizitatori,
                       'afisari', t.afisari, 'sesiuni_cu_comanda', t.sesiuni_cu_comanda)
                     order by t.zi), '[]'::jsonb)
                from toate t, f where t.zi between f.de_la and f.pana_la)
  )
$$;

-- ── Surse si dispozitive, cu performanta ────────────────────────────────────
-- ⚠ Comenzile NU se iau din `orders`, ci din sesiunile cu `purchase`: doar ele
-- stiu din ce sursa a venit omul. Numarate din `orders`, ar fi trebuit impartite
-- la ceva ce nu se poate sti, si fiecare sursa ar fi primit toate comenzile.
create or replace function public.trafic_pe_sursa(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null
)
returns table (sursa text, dispozitiv text, sesiuni integer, sesiuni_cu_comanda integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la))
  select coalesce(nullif(s.source, ''), 'direct') as sursa,
         coalesce(nullif(s.device, ''), 'necunoscut') as dispozitiv,
         sum(s.sesiuni)::int,
         sum(s.sesiuni_cu_comanda)::int
    from public.analitice_zilnic_sursa s, f
   where s.business_id = p_business
     and s.zi between f.de_la and f.pana_la
   group by 1, 2
   order by 3 desc
$$;

-- ── Harta pe judete, CU perioada ────────────────────────────────────────────
/*
  ⚠ CE ERA GRESIT: `orders_county_counts` intoarce tot istoricul, oricare ar fi
  perioada aleasa. Comerciantul schimba „7 zile" pe „90 de zile" si harta ramane
  identica - deci pare ca raspunde la filtru, fara sa raspunda.

  Aici fereastra e aceeasi cu a graficului de vanzari (`fereastra_vanzari`), si
  se intorc trei masuri: comenzi, vanzari si valoarea medie, ca harta sa poata
  arata oricare dintre ele fara inca o cerere.
*/
create or replace function public.comenzi_pe_judet(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null,
  p_canal text default null
)
returns table (judet text, comenzi integer, vanzari numeric, medie numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la))
  -- ⚠ Judetul sta in `shipping_address`, nu intr-o coloana: la fel ca in
  -- `orders_county_counts`, de care depinde harta de acum. Scris altfel, harta
  -- ar fi ramas goala fara sa dea nicio eroare.
  select coalesce(nullif(btrim(o.shipping_address ->> 'county'), ''), 'Necunoscut') as judet,
         count(*)::int,
         round(coalesce(sum(o.total), 0), 2),
         round(coalesce(sum(o.total), 0) / nullif(count(*), 0), 2)
    from public.orders o, f
   where o.business_id = p_business
     -- Aceeasi definitie a vanzarii ca peste tot in panou.
     and o.status not in ('cancelled', 'refunded')
     and (o.created_at at time zone 'Europe/Bucharest')::date between f.de_la and f.pana_la
     and (
       p_canal is null
       or (p_canal = 'magazin' and o.order_source ->> 'marketplace' is null)
       or (p_canal <> 'magazin' and o.order_source ->> 'marketplace' = p_canal)
     )
   group by 1
   order by 2 desc
$$;

-- ── Drepturi ────────────────────────────────────────────────────────────────
-- ⚠ Si de la `anon`, PE NUME: privilegiile implicite dau grantul pe nume
-- fiecarei functii noi, iar `revoke from public` nu-l stinge.
revoke execute on function public.trafic_panou(uuid, text, date, date) from public, anon;
revoke execute on function public.trafic_pe_sursa(uuid, text, date, date) from public, anon;
revoke execute on function public.comenzi_pe_judet(uuid, text, date, date, text) from public, anon;

grant execute on function public.trafic_panou(uuid, text, date, date) to authenticated, service_role;
grant execute on function public.trafic_pe_sursa(uuid, text, date, date) to authenticated, service_role;
grant execute on function public.comenzi_pe_judet(uuid, text, date, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
