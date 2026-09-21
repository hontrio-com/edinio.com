-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, etapa A: cifrele spun ce masoara            (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA GRESIT, in trei feluri deodata:
--
-- 1. `paid_order_count` NU numara comenzi platite. Scotea doar anulatele si
--    rambursatele, deci inauntru ramaneau cele in asteptare, neplatite, in
--    procesare si refuzate-dar-neanulate. Numele promitea bani.
--
-- 2. `total_spent` („Total cheltuit") era tot pe aceeasi regula: valoarea
--    comenzilor care n-au cazut, nu banii intrati.
--
-- 3. `order_count` numara TOT, inclusiv anulatele, iar suma de langa el le
--    scotea. In lista scria „5 comenzi · 1.240 lei cheltuit" despre doua
--    multimi diferite.
--
-- ⚠⚠ SI DE CE „INCASAT" NU E `payment_status = 'paid'`. Masurat aici, in
-- productie: 88 de comenzi sunt `delivered` cu `payment_status = 'unpaid'`,
-- toate cu ramburs, insumand 7.693,43 lei. Curierul ia banii la usa, dar nimeni
-- nu intoarce campul dupa livrare. Cu regula simpla, banii aia dispareau, si
-- fiecare comerciant cu ramburs — adica majoritatea — vedea clienti care „n-au
-- platit niciodata", desi au platit de fiecare data.
--
-- ⚠ REGULA E ACEEASI CU CEA DIN `src/lib/customers/bani.ts`, si o proba le pune
-- fata in fata. Doua scrieri ale aceleiasi reguli se despart la prima reparatie
-- facuta intr-un singur loc.

-- ── Banii chiar intrati, pe o comanda ──────────────────────────────────────
--
-- ⚠ Ordinea conditiilor apara: anulata sau rambursata iese prima, orice ar
-- scrie in rest. Pe productie sunt 13 comenzi `cancelled` cu plata facuta si 4
-- `refunded` cu plata facuta: banii aia se intorc.
--
-- ⚠ Metodele „la usa" se tin ca LISTA, nu ca „orice nu e card": o metoda noua,
-- necunoscuta, trebuie sa cada pe drumul prudent (neincasat), nu sa fie
-- declarata incasata fiindca n-o recunoastem.
create or replace function public.comanda_incasata(
  p_status text, p_payment_status text, p_payment_method text
)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when p_status in ('cancelled', 'refunded') then false
    when p_payment_status = 'refunded' then false
    when p_payment_status = 'paid' then true
    when p_payment_method in ('cash_on_delivery', 'cod', 'ramburs')
      then p_status = 'delivered'
    else false
  end
$$;

revoke all on function public.comanda_incasata(text, text, text) from public;
revoke all on function public.comanda_incasata(text, text, text) from anon;
grant execute on function public.comanda_incasata(text, text, text) to authenticated;

-- ── Lista de clienti ───────────────────────────────────────────────────────
--
-- ⚠ Se sterge si se recreeaza: se schimba coloanele de intoarcere, iar
-- `create or replace` nu poate schimba semnatura de iesire.
drop function if exists public.customers_aggregate(uuid, text, text, integer, integer);

create function public.customers_aggregate(
  bid uuid,
  search text default null,
  sort_key text default 'recent',
  page_limit integer default 50,
  page_offset integer default 0
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
    where coalesce(search, '') = ''
       or m.name ilike '%' || search || '%' escape '\'
       or coalesce(m.email, '') ilike '%' || search || '%' escape '\'
       or (length(public.normalize_phone(search)) >= 3
           and public.normalize_phone(m.phone) like '%' || public.normalize_phone(search) || '%')
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

revoke all on function public.customers_aggregate(uuid, text, text, integer, integer) from public;
revoke all on function public.customers_aggregate(uuid, text, text, integer, integer) from anon;
grant execute on function public.customers_aggregate(uuid, text, text, integer, integer) to authenticated;

-- ── Cifrele din capul paginii ──────────────────────────────────────────────
--
-- ⚠ CUMPARATORII SE DESPART DE CONTACTELE IMPORTATE. Cardul „Clienti" ii numara
-- la un loc, deci „2.000 de clienti" putea insemna 250 de cumparatori si 1.750
-- de contacte aduse dintr-un fisier. Cifra din card ramane TOTALUL (hotararea
-- proprietarului), dar acum se poate spune si din ce e facut.
--
-- ⚠ Pe productie, la 21.09.2026, contactele importate sunt ZERO in toate
-- magazinele. Deci drumul asta n-are trafic si nu se poate dovedi pe date
-- adevarate; se probeaza pe demo.
drop function if exists public.customers_summary(uuid);

create function public.customers_summary(bid uuid)
returns table (
  total_contacts bigint,
  buyers bigint,
  imported_contacts bigint,
  returning_customers bigint,
  return_rate integer,
  orders_value numeric,
  collected_total numeric,
  value_per_customer numeric
)
language sql
stable
security invoker
set search_path to ''
as $$
  with ord as (
    select
      public.order_customer_key(o.customer_phone, o.customer_email, o.id) as key,
      count(*) filter (where o.status not in ('cancelled', 'refunded')) as valid_cnt,
      coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0) as value,
      coalesce(sum(o.total) filter (
        where public.comanda_incasata(o.status, o.payment_status, o.payment_method)
      ), 0) as collected
    from public.orders o
    where o.business_id = bid
    group by 1
  ),
  toti as (
    select o.key, o.valid_cnt, o.value, o.collected, true as cumparator from ord o
    union all
    select c.key, 0::bigint, 0::numeric, 0::numeric, false
    from public.customers c
    where c.business_id = bid
      and not exists (select 1 from ord o2 where o2.key = c.key)
  )
  select
    count(*)::bigint,
    (count(*) filter (where cumparator))::bigint,
    (count(*) filter (where not cumparator))::bigint,
    (count(*) filter (where valid_cnt > 1))::bigint,
    /*
      ⚠ Rata de revenire se socoteste din CUMPARATORI, nu din toate contactele:
      un contact importat care n-a comandat niciodata n-avea cum sa „revina",
      iar pus la numitor ar trage rata in jos cu cat importa comerciantul mai
      mult. Adica un magazin ar parea ca merge mai prost fiindca si-a urcat
      lista de contacte.
    */
    case when count(*) filter (where cumparator) > 0
         then round(100.0 * count(*) filter (where valid_cnt > 1)
                    / count(*) filter (where cumparator))::integer
         else 0 end,
    round(coalesce(sum(value), 0), 2),
    round(coalesce(sum(collected), 0), 2),
    /*
      ⚠ „Valoare medie per CLIENT", nu per comanda: media pe comenzi sta deja la
      Statistici. Aici intereseaza cat aduce un om, nu cat aduce o comanda —
      altfel pagina ar repeta o cifra care exista in alta parte.
    */
    case when count(*) filter (where cumparator) > 0
         then round(coalesce(sum(value), 0) / count(*) filter (where cumparator), 2)
         else 0 end
  from toti
$$;

revoke all on function public.customers_summary(uuid) from public;
revoke all on function public.customers_summary(uuid) from anon;
grant execute on function public.customers_summary(uuid) to authenticated;

notify pgrst, 'reload schema';
