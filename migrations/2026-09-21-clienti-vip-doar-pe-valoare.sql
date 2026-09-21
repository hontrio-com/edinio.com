-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI: VIP se judeca NUMAI pe valoare, de la 10.000 lei   (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar: „eticheta VIP sa se puna doar daca a comandat de peste
-- 10.000 lei".
--
-- ⚠⚠ „DOAR DACA" INSEAMNA CA NUMARUL DE COMENZI IESE CU TOTUL DIN REGULA, nu ca
-- i se urca pragul. Pana acum era `valid_order_count >= 3 OR orders_value >=
-- 1000`, si ajungea oricare dintre ele — masurat, aproape toti VIP-ii ajungeau
-- acolo prin NUMARUL de comenzi: cinci comenzi de cincizeci de lei faceau un VIP.
--
-- ⚠⚠ SI SE SCHIMBA IN AMANDOUA LOCURILE ODATA. Eticheta de pe rand o pune
-- `lib/customers/etichete.ts`, iar segmentul „Clienți VIP" din bara de filtre il
-- pune `customer_in_segment`. Schimbata doar una, placa din fila „Segmente" ar fi
-- numarat 25 de oameni pe care lista nu i-ar mai fi aratat cu eticheta — si
-- invers. Aceeasi regula, doua scrieri, exact capcana de care ne-am ferit azi.
--
-- ⚠ CE INSEAMNA CIFRA, masurat INAINTE de schimbare:
--
--     PRODUCTIE   494 de clienti, cel mai mare a cumparat vreodata de 699 lei.
--                 Peste 1.000 lei: ZERO. Peste 10.000: ZERO.
--     DEMO        358 de clienti, cel mai mare 3.294,29 lei.
--                 Peste 1.000: 21. Peste 10.000: ZERO.
--
-- Adica segmentul „Clienți VIP" va da ZERO in toate magazinele, pana cand cineva
-- cumpara de zece mii de lei. E hotararea lui, luata cu cifrele la vedere. Scris
-- aici ca sa nu para mai tarziu un defect: cand cineva intreaba „de ce n-am
-- niciun VIP?", raspunsul e asta, nu cod stricat.
--
-- ⚠ Argumentul `p_vip_comenzi` IESE din semnatura, nu ramane neintrebuintat. Un
-- argument pe care nu-l mai citeste nimeni e o capcana: urmatorul care il vede il
-- trimite cu o valoare si crede ca schimba ceva.

/*
  ⚠ Ordinea caderilor: intai cele care CHEAMA regula, apoi regula. Altfel raman
  functii care arata catre o semnatura care nu mai exista.
*/
drop function if exists public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text, text[]);
drop function if exists public.customer_segment_counts(uuid, integer, numeric);
drop function if exists public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, integer, numeric);

create function public.customer_in_segment(
  seg text,
  order_count bigint,
  valid_order_count bigint,
  cancelled_count bigint,
  refunded_count bigint,
  orders_value numeric,
  first_order_at timestamptz,
  last_order_at timestamptz,
  vip_lei numeric default 10000
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
    /* ⚠ NUMAI VALOAREA. Vezi capul fisierului. */
    when 'vip' then orders_value >= vip_lei
    when 'fara-comenzi' then order_count = 0
    when 'inactivi-30' then last_order_at is not null and last_order_at < now() - interval '30 days'
    when 'inactivi-90' then last_order_at is not null and last_order_at < now() - interval '90 days'
    when 'inactivi-180' then last_order_at is not null and last_order_at < now() - interval '180 days'
    when 'cu-retururi' then refunded_count > 0
    when 'cu-anulari' then cancelled_count > 0
    else true
  end
$$;

revoke all on function public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, numeric) from public;
revoke all on function public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, numeric) from anon;
grant execute on function public.customer_in_segment(text, bigint, bigint, bigint, bigint, numeric, timestamptz, timestamptz, numeric) to authenticated;

create function public.customer_segment_counts(
  bid uuid,
  p_vip_lei numeric default 10000
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
      m.orders_value, m.first_order_at, m.last_order_at, p_vip_lei)
  )
  from unnest(array[
    'toti', 'noi', 'recurenti', 'vip', 'fara-comenzi',
    'inactivi-30', 'inactivi-90', 'inactivi-180', 'cu-retururi', 'cu-anulari'
  ]) with ordinality as s(seg, rang)
  cross join public.customers_merged(bid) m
  group by s.seg, s.rang
  order by s.rang
$$;

revoke all on function public.customer_segment_counts(uuid, numeric) from public;
revoke all on function public.customer_segment_counts(uuid, numeric) from anon;
grant execute on function public.customer_segment_counts(uuid, numeric) to authenticated;

create function public.customers_aggregate(
  bid uuid,
  search text default null,
  sort_key text default 'recent',
  page_limit integer default 50,
  page_offset integer default 0,
  p_segment text default 'toti',
  p_valoare_min numeric default null,
  p_valoare_max numeric default null,
  p_vip_lei numeric default 10000,
  p_judet text default null,
  p_canal text default null,
  p_chei text[] default null
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
            p_vip_lei)
      and (p_valoare_min is null or m.orders_value >= p_valoare_min)
      and (p_valoare_max is null or m.orders_value < p_valoare_max)
      and (p_judet is null or m.county = p_judet)
      and (p_canal is null or m.canal = p_canal)
      and (p_chei is null or m.key = any(p_chei))
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

revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, numeric, text, text, text[]) from public;
revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, numeric, text, text, text[]) from anon;
grant execute on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, numeric, text, text, text[]) to authenticated;

notify pgrst, 'reload schema';
