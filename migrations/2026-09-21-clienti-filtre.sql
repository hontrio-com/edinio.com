-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, etapa C2: filtre, socotite in baza                  (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pana acum lista avea cautare si un singur meniu de sortare. Atat.
--
-- ⚠ FILTRAREA SE FACE IN BAZA, nu in memorie, si nu din cochetarie: numarul
-- total (`total_count`) si paginarea trebuie sa fie ale multimii FILTRATE.
-- Filtrat in JavaScript peste pagina adusa, comerciantul ar fi vazut „50 de
-- clienti" filtrati din 50 adusi, dintr-un magazin cu trei sute — iar paginile
-- de dupa ar fi fost goale, fara sa spuna nimeni de ce.
--
-- ⚠ SEGMENTELE, si cati se aprind pe datele demo:
--     toti 358 · noi 88 · recurenti 22 · VIP 25 · fara comenzi 20
--     inactivi-90 98 · inactivi-180 0 · cu retururi 14 · cu anulari 44
--
-- „inactivi-180" da ZERO fiindca datele demo tin de vreo sase luni. E raspunsul
-- corect, nu un filtru stricat.
--
-- ⚠⚠ PRAGURILE DE VIP VIN CA ARGUMENTE (`p_vip_comenzi`, `p_vip_lei`), nu scrise
-- in functie. Masurat pe productie: cel mai mare client al platformei are 968,99
-- lei in tot istoricul, deci un prag fix de 1.000 n-ar fi aprins segmentul pentru
-- nimeni, in niciun magazin. Hrana pentru animale si mobila nu pot imparti
-- aceeasi cifra. Vezi `lib/customers/etichete.ts`.
--
-- ⚠ Toate argumentele noi au implicit, deci un apelant vechi primeste exact ce
-- primea inainte.
--
-- ⚠ Acelasi text a fost aplicat pe baza demo si verificat acolo, segment cu
-- segment, inainte sa ajunga in fisierul asta.

drop function if exists public.customers_aggregate(uuid, text, text, integer, integer);

create function public.customers_aggregate(
  bid uuid,
  search text default null,
  sort_key text default 'recent',
  page_limit integer default 50,
  page_offset integer default 0,
  p_segment text default 'toti',
  p_valoare_min numeric default null,
  p_valoare_max numeric default null,
  p_vip_comenzi integer default 3,
  p_vip_lei numeric default 1000
)
returns table (
  key text, name text, phone text, email text, city text, county text, address text,
  order_count bigint,
  -- ⚠ `valid_order_count` inlocuieste `paid_order_count`: acelasi numar, nume
  -- care nu mai promite bani. Vezi capul fisierului.
  valid_order_count bigint,
  cancelled_count bigint,
  refunded_count bigint,
  -- ⚠ `orders_value` inlocuieste `total_spent`, din acelasi motiv.
  orders_value numeric,
  collected_total numeric,
  aov numeric,
  first_order_at timestamptz, last_order_at timestamptz, last_status text,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $$
  with ord as (
    select
      public.order_customer_key(o.customer_phone, o.customer_email, o.id) as key,
      (array_agg(nullif(trim(o.customer_name), '') order by o.created_at desc)
        filter (where nullif(trim(o.customer_name), '') is not null))[1] as name,
      (array_agg(nullif(trim(o.customer_phone), '') order by o.created_at desc)
        filter (where nullif(trim(o.customer_phone), '') is not null))[1] as phone,
      (array_agg(nullif(lower(trim(o.customer_email)), '') order by o.created_at desc)
        filter (where nullif(lower(trim(o.customer_email)), '') is not null))[1] as email,
      (array_agg(nullif(trim(o.shipping_address->>'city'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'city'), '') is not null))[1] as city,
      (array_agg(nullif(trim(o.shipping_address->>'county'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'county'), '') is not null))[1] as county,
      (array_agg(nullif(trim(o.shipping_address->>'address'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'address'), '') is not null))[1] as address,
      count(*) as order_count,
      count(*) filter (where o.status not in ('cancelled', 'refunded')) as valid_order_count,
      count(*) filter (where o.status = 'cancelled') as cancelled_count,
      count(*) filter (where o.status = 'refunded') as refunded_count,
      round(coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0), 2) as orders_value,
      round(coalesce(sum(o.total) filter (
        where public.comanda_incasata(o.status, o.payment_status, o.payment_method)
      ), 0), 2) as collected_total,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at,
      (array_agg(o.status order by o.created_at desc))[1] as last_status
    from public.orders o
    where o.business_id = bid
    group by 1
  ),
  imp as (
    select
      c.key,
      nullif(trim(c.name), '') as name,
      nullif(trim(c.phone), '') as phone,
      nullif(lower(trim(c.email)), '') as email,
      nullif(trim(c.city), '') as city,
      nullif(trim(c.county), '') as county,
      nullif(trim(c.address), '') as address
    from public.customers c
    where c.business_id = bid
  ),
  merged as (
    select
      coalesce(o.key, i.key) as key,
      coalesce(o.name, i.name, 'Client') as name,
      coalesce(o.phone, i.phone, '') as phone,
      coalesce(o.email, i.email) as email,
      coalesce(o.city, i.city) as city,
      coalesce(o.county, i.county) as county,
      coalesce(o.address, i.address) as address,
      coalesce(o.order_count, 0) as order_count,
      coalesce(o.valid_order_count, 0) as valid_order_count,
      coalesce(o.cancelled_count, 0) as cancelled_count,
      coalesce(o.refunded_count, 0) as refunded_count,
      coalesce(o.orders_value, 0::numeric) as orders_value,
      coalesce(o.collected_total, 0::numeric) as collected_total,
      o.first_order_at, o.last_order_at, o.last_status
    from ord o
    full outer join imp i on i.key = o.key
  ),
  filtered as (
    select m.*,
      case when m.valid_order_count > 0
           then round(m.orders_value / m.valid_order_count, 2) else 0 end as aov
    from merged m
    /*
      ⚠ CAUTAREA E ACUM IN PARANTEZE. Fara ele, `or`-urile ei s-ar fi lipit de
      conditiile de mai jos, si orice rand care se potrivea la nume ar fi trecut de
      TOATE filtrele. `and` leaga mai strans decat `or`, deci defectul n-ar fi dat
      nicio eroare: pur si simplu filtrele n-ar mai fi filtrat nimic pentru cine
      cauta ceva.
    */
    where (coalesce(search, '') = ''
       or m.name ilike '%' || search || '%' escape '\'
       or coalesce(m.email, '') ilike '%' || search || '%' escape '\'
       or (length(public.normalize_phone(search)) >= 3
           and public.normalize_phone(m.phone) like '%' || public.normalize_phone(search) || '%'))
      and case coalesce(p_segment, 'toti')
        when 'toti' then true
        when 'noi' then m.valid_order_count <= 1 and m.first_order_at >= now() - interval '30 days'
        when 'recurenti' then m.valid_order_count > 1
        when 'vip' then m.valid_order_count >= p_vip_comenzi or m.orders_value >= p_vip_lei
        when 'fara-comenzi' then m.order_count = 0
        when 'inactivi-30' then m.last_order_at is not null and m.last_order_at < now() - interval '30 days'
        when 'inactivi-90' then m.last_order_at is not null and m.last_order_at < now() - interval '90 days'
        when 'inactivi-180' then m.last_order_at is not null and m.last_order_at < now() - interval '180 days'
        when 'cu-retururi' then m.refunded_count > 0
        when 'cu-anulari' then m.cancelled_count > 0
        /* Un segment necunoscut din adresa da lista intreaga, nu o pagina goala. */
        else true
      end
      and (p_valoare_min is null or m.orders_value >= p_valoare_min)
      and (p_valoare_max is null or m.orders_value < p_valoare_max)
  )
  select f.key, f.name, f.phone, f.email, f.city, f.county, f.address,
         f.order_count, f.valid_order_count, f.cancelled_count, f.refunded_count,
         f.orders_value, f.collected_total, f.aov,
         f.first_order_at, f.last_order_at, f.last_status,
         count(*) over () as total_count
  from filtered f
  order by
    case when sort_key = 'spent' then f.orders_value end desc nulls last,
    case when sort_key = 'orders' then f.order_count end desc nulls last,
    case when sort_key = 'name' then f.name end asc nulls last,
    f.last_order_at desc nulls last
  limit page_limit offset page_offset
$$;

revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric) from public;
revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric) from anon;
grant execute on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric) to authenticated;

notify pgrst, 'reload schema';
