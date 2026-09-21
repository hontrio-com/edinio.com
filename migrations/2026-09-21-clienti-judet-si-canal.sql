-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, C2 (restul): filtre pe judet si pe canal             (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ultimele doua filtre din plan care au pe ce sta. Masurat inainte:
--
--   PRODUCTIE (537 de comenzi)   judet scris 516, 56 de valori deosebite
--                                canal: magazin 336, eMAG 128, Trendyol 73
--   DEMO (393 de comenzi)        judet scris 387, 40 de valori deosebite
--                                canal: 38 de comenzi de marketplace, 3 canale
--
-- ⚠⚠ CANALUL NU E `order_source`. Campul acela are 465 de valori deosebite din
-- 537 de comenzi: e un obiect care poarta si numarul comenzii de la marketplace,
-- si identificatorul coletului. Un filtru pe el ar fi avut cate o optiune pe
-- comanda. Canalul adevarat sta in cheia `marketplace` dinauntru, iar lipsa ei
-- inseamna „magazin".
--
-- ⚠⚠ SI OPTIUNILE SE CER DIN BAZA, NU SE SCRIU IN COD. Cele 42 de judete ale
-- tarii intr-un meniu, la un magazin care livreaza in douasprezece, inseamna
-- treizeci de optiuni care dau „niciun client" — exact felul de filtru despre
-- care planul spune ca nu se ofera. `customer_filter_options` intoarce numai ce
-- exista chiar acolo, cu cate randuri are fiecare.
--
-- ⚠ Judetul si canalul sunt insusiri ale unei COMENZI, iar clientul e o grupare
-- peste mai multe. Se ia cea mai recenta, la fel ca orasul si adresa de pe fisa:
-- „unde livreaza omul asta ACUM". Un client mutat anul trecut nu trebuie sa mai
-- apara la judetul vechi.

drop function if exists public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric);
drop function if exists public.customers_merged(uuid);

create function public.customers_merged(bid uuid)
returns table (
  key text, name text, phone text, email text, city text, county text, address text,
  order_count bigint, valid_order_count bigint, cancelled_count bigint, refunded_count bigint,
  orders_value numeric, collected_total numeric,
  first_order_at timestamptz, last_order_at timestamptz, last_status text,
  source text, canal text
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
      /*
        ⚠ Canalul celei mai RECENTE comenzi, nu al primeia si nu „oricare".
        Lipsa cheii `marketplace` inseamna magazinul propriu — asa se numara si
        la Statistici, si cele doua trebuie sa spuna acelasi lucru.
      */
      (array_agg(coalesce(nullif(trim(o.order_source->>'marketplace'), ''), 'magazin')
        order by o.created_at desc))[1] as canal,
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
      nullif(trim(c.address), '') as address,
      c.source
    from public.customers c
    where c.business_id = bid
  )
  select
    coalesce(o.key, i.key),
    coalesce(o.name, i.name, 'Client'),
    coalesce(o.phone, i.phone, ''),
    coalesce(o.email, i.email),
    coalesce(o.city, i.city),
    coalesce(o.county, i.county),
    coalesce(o.address, i.address),
    coalesce(o.order_count, 0),
    coalesce(o.valid_order_count, 0),
    coalesce(o.cancelled_count, 0),
    coalesce(o.refunded_count, 0),
    coalesce(o.orders_value, 0::numeric),
    coalesce(o.collected_total, 0::numeric),
    o.first_order_at, o.last_order_at, o.last_status,
    i.source,
    /* ⚠ Un contact fara comenzi n-are canal — si NU e „magazin". N-a cumparat. */
    o.canal
  from ord o
  full outer join imp i on i.key = o.key
$$;

revoke all on function public.customers_merged(uuid) from public;
revoke all on function public.customers_merged(uuid) from anon;
grant execute on function public.customers_merged(uuid) to authenticated;

-- ── Lista, cu cele doua filtre noi ─────────────────────────────────────────

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
  p_vip_lei numeric default 1000,
  p_judet text default null,
  p_canal text default null
)
returns table (
  key text, name text, phone text, email text, city text, county text, address text,
  order_count bigint, valid_order_count bigint, cancelled_count bigint, refunded_count bigint,
  orders_value numeric, collected_total numeric, aov numeric,
  first_order_at timestamptz, last_order_at timestamptz, last_status text,
  source text, canal text,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $$
  with filtered as (
    select m.*,
      case when m.valid_order_count > 0
           then round(m.orders_value / m.valid_order_count, 2) else 0 end as aov
    from public.customers_merged(bid) m
    where (coalesce(search, '') = ''
       or m.name ilike '%' || search || '%' escape '\'
       or coalesce(m.email, '') ilike '%' || search || '%' escape '\'
       or (length(public.normalize_phone(search)) >= 3
           and public.normalize_phone(m.phone) like '%' || public.normalize_phone(search) || '%'))
      and public.customer_in_segment(
            coalesce(p_segment, 'toti'),
            m.order_count, m.valid_order_count, m.cancelled_count, m.refunded_count,
            m.orders_value, m.first_order_at, m.last_order_at,
            p_vip_comenzi, p_vip_lei)
      and (p_valoare_min is null or m.orders_value >= p_valoare_min)
      and (p_valoare_max is null or m.orders_value < p_valoare_max)
      /*
        ⚠ Se compara EXACT, nu cu `ilike`: valorile vin dintr-un meniu facut chiar
        din ce e in baza, deci se potrivesc pe litera. O potrivire slabita ar fi
        pus „Bucuresti" peste „Sector 3" — si exact acolo platforma are deja TREI
        forme pentru acelasi loc (vezi lectia Sameday).
      */
      and (p_judet is null or m.county = p_judet)
      and (p_canal is null or m.canal = p_canal)
  )
  select f.key, f.name, f.phone, f.email, f.city, f.county, f.address,
         f.order_count, f.valid_order_count, f.cancelled_count, f.refunded_count,
         f.orders_value, f.collected_total, f.aov,
         f.first_order_at, f.last_order_at, f.last_status,
         f.source, f.canal,
         count(*) over () as total_count
  from filtered f
  order by
    case when sort_key = 'spent' then f.orders_value end desc nulls last,
    case when sort_key = 'orders' then f.order_count end desc nulls last,
    case when sort_key = 'name' then f.name end asc nulls last,
    f.last_order_at desc nulls last
  limit page_limit offset page_offset
$$;

revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text) from public;
revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text) from anon;
grant execute on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text) to authenticated;

-- ── Ce se poate alege, chiar in magazinul asta ─────────────────────────────
--
-- ⚠⚠ MENIUL SE FACE DIN DATE, NU DIN COD. Cele 42 de judete ale tarii oferite
-- unui magazin care livreaza in douasprezece inseamna treizeci de optiuni care
-- dau „niciun client". Planul spune limpede: niciun filtru fara date pe care sa
-- cada — iar asta se tine numai cerand optiunile de la baza.
--
-- ⚠ Si vin cu numarul lor, ca sa se poata scrie „Cluj (34)": un meniu cu
-- cincizeci de judete fara cifre il pune pe comerciant sa le incerce pe rand.

create or replace function public.customer_filter_options(bid uuid)
returns table (fel text, valoare text, cati bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  with m as (select * from public.customers_merged(bid))
  select 'judet'::text, m.county, count(*)
  from m where nullif(trim(m.county), '') is not null
  group by m.county
  union all
  select 'canal'::text, m.canal, count(*)
  from m where m.canal is not null
  group by m.canal
  order by 1, 3 desc, 2
$$;

revoke all on function public.customer_filter_options(uuid) from public;
revoke all on function public.customer_filter_options(uuid) from anon;
grant execute on function public.customer_filter_options(uuid) to authenticated;

notify pgrst, 'reload schema';
