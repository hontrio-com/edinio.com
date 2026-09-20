-- ═══════════════════════════════════════════════════════════════════════════
-- PALNIA PE PERIOADE SI VENITUL PE SURSA (20.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE NU AJUNGE CE AVEM.
--
-- 1. Palnia (vizita -> produs vazut -> cos -> checkout -> comanda) se poate
--    socoti din randurile brute, dar acelea se sterg dupa 8 zile. Pe „30 de
--    zile" ar fi aratat trei praguri goale si unul plin, adica o minciuna.
-- 2. „Venit pe sursa" cere ca fiecare cumparare sa stie CAT a valorat. Pana
--    acum, evenimentul de cumparare nu purta nicio suma, deci se putea spune
--    cate comenzi vin din Facebook, dar nu si cati lei.
--
-- ⚠ VENITUL SE ATRIBUIE PRIMEI SURSE A SESIUNII, nu sursei evenimentului de
-- cumparare. Cine intra din Google, se intoarce a doua zi din Facebook si
-- cumpara, are o singura sesiune de cumparare; numarata la sursa evenimentului,
-- fiecare canal ar fi primit intreaga comanda si suma surselor ar fi depasit
-- vanzarile magazinului.

-- ── 1. Cumpararea isi poarta valoarea ───────────────────────────────────────
alter table public.site_analytics
  add column if not exists valoare numeric;

comment on column public.site_analytics.valoare is
  'Cat a valorat comanda, doar pe evenimentele `purchase`. Pentru venitul pe sursa.';

-- ── 2. Pragurile palniei, stranse zilnic ────────────────────────────────────
alter table public.analitice_zilnic
  add column if not exists sesiuni_cu_produs   integer not null default 0,
  add column if not exists sesiuni_cu_cos      integer not null default 0,
  add column if not exists sesiuni_cu_checkout integer not null default 0;

alter table public.analitice_zilnic_sursa
  add column if not exists vanzari numeric not null default 0;

-- ── 3. Agregarea le umple pe toate ──────────────────────────────────────────
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
     and exists (select 1 from public.businesses b where b.id = a.business_id)
   group by 1, 2, 3, 4, 5;

  get diagnostics v_scrise = row_count;

  -- Sesiuni, vizitatori si pragurile palniei
  delete from public.analitice_zilnic where zi >= v_de_la;

  insert into public.analitice_zilnic (
    business_id, zi, vizitatori, sesiuni, afisari, sesiuni_cu_comanda,
    sesiuni_cu_produs, sesiuni_cu_cos, sesiuni_cu_checkout)
  select a.business_id,
         (a.created_at at time zone 'Europe/Bucharest')::date as zi,
         count(distinct a.visitor_id),
         count(distinct a.session_id),
         count(*) filter (where a.event_type = 'visit'),
         count(distinct a.session_id) filter (where a.event_type = 'purchase'),
         count(distinct a.session_id) filter (where a.event_type = 'product_view'),
         count(distinct a.session_id) filter (where a.event_type = 'add_to_cart'),
         count(distinct a.session_id) filter (where a.event_type = 'begin_checkout')
    from public.site_analytics a
   where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
     and a.session_id is not null
     and exists (select 1 from public.businesses b where b.id = a.business_id)
   group by 1, 2;

  -- Sesiuni, comenzi si VENIT pe sursa, dupa prima sursa a sesiunii
  delete from public.analitice_zilnic_sursa where zi >= v_de_la;

  insert into public.analitice_zilnic_sursa (business_id, zi, source, device, sesiuni, sesiuni_cu_comanda, vanzari)
  with prima as (
    select distinct on (a.business_id, a.session_id)
           a.business_id, a.session_id,
           (a.created_at at time zone 'Europe/Bucharest')::date as zi,
           coalesce(a.source, '') as source,
           coalesce(a.device, '') as device
      from public.site_analytics a
     where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
       and a.session_id is not null
       and exists (select 1 from public.businesses b where b.id = a.business_id)
     order by a.business_id, a.session_id, a.created_at
  ),
  cumparaturi as (
    select business_id, session_id, sum(coalesce(valoare, 0)) as valoare, count(*) as cate
      from public.site_analytics
     where event_type = 'purchase'
       and (created_at at time zone 'Europe/Bucharest')::date >= v_de_la
       and session_id is not null
     group by 1, 2
  )
  select p.business_id, p.zi, p.source, p.device,
         count(*),
         count(*) filter (where c.session_id is not null),
         round(coalesce(sum(c.valoare), 0), 2)
    from prima p
    left join cumparaturi c on c.business_id = p.business_id and c.session_id = p.session_id
   group by 1, 2, 3, 4;

  return v_scrise;
end;
$$;

revoke all on function public.agregeaza_analitice(int) from public, anon, authenticated;
grant execute on function public.agregeaza_analitice(int) to service_role;

-- ── 4. Palnia, pentru o perioada ────────────────────────────────────────────
/*
  Cele cinci praguri, ca sesiuni.

  ⚠ NU SUNT NEAPARAT DESCRESCATOARE, si e bine sa se stie inainte de a se
  mira cineva: o sesiune poate adauga in cos fara sa fi deschis pagina de
  produs (din grila magazinului, cu „adauga rapid"). Pragurile spun „cate
  sesiuni au facut pasul asta", nu „cate au trecut prin toti pasii de dinainte".
*/
create or replace function public.palnia_panou(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null
)
returns table (sesiuni integer, cu_produs integer, cu_cos integer, cu_checkout integer, cu_comanda integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la))
  select coalesce(sum(z.sesiuni), 0)::int,
         coalesce(sum(z.sesiuni_cu_produs), 0)::int,
         coalesce(sum(z.sesiuni_cu_cos), 0)::int,
         coalesce(sum(z.sesiuni_cu_checkout), 0)::int,
         coalesce(sum(z.sesiuni_cu_comanda), 0)::int
    from public.analitice_zilnic z, f
   where z.business_id = p_business
     and z.zi between f.de_la and f.pana_la
$$;

-- Sursele intorc si venitul acum.
create or replace function public.trafic_pe_sursa(
  p_business uuid,
  p_fel text default '30z',
  p_de_la date default null,
  p_pana_la date default null
)
returns table (sursa text, dispozitiv text, sesiuni integer, sesiuni_cu_comanda integer, vanzari numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with f as (select * from public.fereastra_vanzari(p_fel, p_de_la, p_pana_la))
  select coalesce(nullif(s.source, ''), 'direct') as sursa,
         coalesce(nullif(s.device, ''), 'necunoscut') as dispozitiv,
         sum(s.sesiuni)::int,
         sum(s.sesiuni_cu_comanda)::int,
         round(sum(s.vanzari), 2)
    from public.analitice_zilnic_sursa s, f
   where s.business_id = p_business
     and s.zi between f.de_la and f.pana_la
   group by 1, 2
   order by 3 desc
$$;

revoke execute on function public.palnia_panou(uuid, text, date, date) from public, anon;
revoke execute on function public.trafic_pe_sursa(uuid, text, date, date) from public, anon;
grant execute on function public.palnia_panou(uuid, text, date, date) to authenticated, service_role;
grant execute on function public.trafic_pe_sursa(uuid, text, date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
