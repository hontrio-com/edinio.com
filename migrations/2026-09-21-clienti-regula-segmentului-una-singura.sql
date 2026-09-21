-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, etapa F: regula segmentului, intr-un singur loc     (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fila „Segmente" are nevoie sa spuna CATI oameni sunt in fiecare segment. Cel
-- mai la indemana ar fi fost o a doua interogare cu acelasi `case`, copiat.
--
-- ⚠⚠ DOUA COPII ALE ACELEIASI REGULI NU RAMAN NICIODATA LA FEL. Ziua in care
-- cineva ar fi mutat pragul lui „inactiv" de la 90 la 60 in lista, fila ar fi
-- spus mai departe cifra veche — iar cifra si lista ar fi aratat amandoua a
-- adevar, fiecare altul. Un comerciant care vede „98 de inactivi" si deschide o
-- lista cu 140 nu are cum sa afle care dintre ele minte.
--
-- Deci regula se MUTA, nu se copiaza:
--
--   `customers_merged(bid)`       cine sunt clientii si cifrele lor;
--   `customer_in_segment(...)`    intra omul asta in segmentul asta? Un singur loc.
--   `customers_aggregate(...)`    lista, ca pana acum — dar cheama cele doua;
--   `customer_segment_counts(...)` numaratoarea, care cheama tot pe ele.
--
-- ⚠ NIMIC DIN CE SE VEDE NU SE SCHIMBA. Masurat pe demo INAINTE de migratie:
--     toti 358 · noi 88 · recurenti 22 · vip 25 · fara-comenzi 20
--     inactivi-30 234 · inactivi-90 98 · inactivi-180 0
--     cu-retururi 14 · cu-anulari 44
-- Aceleasi zece cifre se cer si DUPA. Daca una singura se misca, mutarea a
-- schimbat intelesul si nu e o mutare.

-- ── 1. Cine sunt clientii ──────────────────────────────────────────────────
--
-- Chiar corpul care era pana acum in CTE-urile `ord`, `imp` si `merged` din
-- `customers_aggregate`, scos afara neatins.
--
-- ⚠ `language sql` + `stable`, ca sa poata fi INCLUSA de planificator in
-- interogarea care o cheama. Scrisa in plpgsql, ar fi fost o cutie inchisa:
-- filtrele de dinafara n-ar mai fi coborat inauntru, si lista ar fi inceput sa
-- adune tot istoricul la fiecare deschidere.

create or replace function public.customers_merged(bid uuid)
returns table (
  key text, name text, phone text, email text, city text, county text, address text,
  order_count bigint, valid_order_count bigint, cancelled_count bigint, refunded_count bigint,
  orders_value numeric, collected_total numeric,
  first_order_at timestamptz, last_order_at timestamptz, last_status text
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
    o.first_order_at, o.last_order_at, o.last_status
  from ord o
  full outer join imp i on i.key = o.key
$$;

revoke all on function public.customers_merged(uuid) from public;
revoke all on function public.customers_merged(uuid) from anon;
grant execute on function public.customers_merged(uuid) to authenticated;

-- ── 2. Regula segmentului ──────────────────────────────────────────────────
--
-- ⚠ ARGUMENTELE SUNT CIFRELE CLIENTULUI, nu un rand intreg si nu `bid`: asa
-- functia nu stie de unde vin datele, nu poate citi din alt magazin si se poate
-- proba cu numere scrise de mana.
--
-- ⚠ `stable`, nu `immutable`: patru dintre segmente se judeca fata de `now()`.
-- Marcata `immutable`, Postgres ar fi avut voie sa ingheteze raspunsul, si
-- „inactivi de 90 de zile" ar fi ramas multimea de la prima chemare.
--
-- ⚠ Un segment NECUNOSCUT da `true`, adica lista intreaga — nu o pagina goala.
-- Pastrat din functia dinainte: o adresa veche sau un segment salvat si scos
-- intre timp arata tot magazinul, nu un ecran gol care pare stricat.

create or replace function public.customer_in_segment(
  seg text,
  order_count bigint,
  valid_order_count bigint,
  cancelled_count bigint,
  refunded_count bigint,
  orders_value numeric,
  first_order_at timestamptz,
  last_order_at timestamptz,
  vip_comenzi integer default 3,
  vip_lei numeric default 1000
)
returns boolean
language sql
stable
security invoker
set search_path to ''
as $$
  select case coalesce(seg, 'toti')
    when 'toti' then true
    when 'noi' then valid_order_count <= 1 and first_order_at >= now() - interval '30 days'
    when 'recurenti' then valid_order_count > 1
    when 'vip' then valid_order_count >= vip_comenzi or orders_value >= vip_lei
    when 'fara-comenzi' then order_count = 0
    when 'inactivi-30' then last_order_at is not null and last_order_at < now() - interval '30 days'
    when 'inactivi-90' then last_order_at is not null and last_order_at < now() - interval '90 days'
    when 'inactivi-180' then last_order_at is not null and last_order_at < now() - interval '180 days'
    when 'cu-retururi' then refunded_count > 0
    when 'cu-anulari' then cancelled_count > 0
    else true
  end
$$;

revoke all on function public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, integer, numeric) from public;
revoke all on function public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, integer, numeric) from anon;
grant execute on function public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, integer, numeric) to authenticated;

-- ── 3. Lista, rescrisa peste cele doua ─────────────────────────────────────
--
-- Semnatura si coloanele raman EXACT cele de pana acum: pagina nu se atinge.

create or replace function public.customers_aggregate(
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
  order_count bigint, valid_order_count bigint, cancelled_count bigint, refunded_count bigint,
  orders_value numeric, collected_total numeric, aov numeric,
  first_order_at timestamptz, last_order_at timestamptz, last_status text,
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
    /*
      ⚠ CAUTAREA E IN PARANTEZE. Fara ele, `or`-urile ei s-ar lipi de conditiile
      de mai jos si orice rand potrivit la nume ar trece de TOATE filtrele.
    */
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

-- ── 4. Numaratoarea pe segmente ────────────────────────────────────────────
--
-- ⚠ O SINGURA TRECERE PRIN CLIENTI, nu zece. Chemata o data pe segment, fila ar
-- fi parcurs tot istoricul de comenzi de zece ori la fiecare deschidere —
-- exact defectul pe care etapa H il are de reparat, facut de zece ori mai rau.
--
-- ⚠ Segmentele sunt luate dintr-o lista scrisa AICI, in aceeasi ordine ca in
-- `lib/customers/filtre.ts`. O proba tine cele doua liste lipite.

create or replace function public.customer_segment_counts(
  bid uuid,
  p_vip_comenzi integer default 3,
  p_vip_lei numeric default 1000
)
returns table (segment text, cati bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  select s.seg, count(*) filter (
    where public.customer_in_segment(
      s.seg, m.order_count, m.valid_order_count, m.cancelled_count, m.refunded_count,
      m.orders_value, m.first_order_at, m.last_order_at, p_vip_comenzi, p_vip_lei)
  )
  from unnest(array[
    'toti', 'noi', 'recurenti', 'vip', 'fara-comenzi',
    'inactivi-30', 'inactivi-90', 'inactivi-180', 'cu-retururi', 'cu-anulari'
  ]) with ordinality as s(seg, rang)
  cross join public.customers_merged(bid) m
  group by s.seg, s.rang
  order by s.rang
$$;

revoke all on function public.customer_segment_counts(uuid, integer, numeric) from public;
revoke all on function public.customer_segment_counts(uuid, integer, numeric) from anon;
grant execute on function public.customer_segment_counts(uuid, integer, numeric) to authenticated;

notify pgrst, 'reload schema';
