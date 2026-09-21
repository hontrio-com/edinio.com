-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, etapa B: cifrele capata o fereastra de timp        (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE LIPSEA. `customers_summary` nici nu primea o perioada: toate cifrele erau
-- pe tot istoricul. Pe Statistici si pe Cosuri abandonate exista selector de
-- perioada; aici „Venit total" nu se putea pune langa nimic.
--
-- ⚠ CE RAMANE PE TOT ISTORICUL, DINADINS:
--
--   `total_contacts`     hotararea proprietarului: „numarul total de clienti".
--   `imported_contacts`  un contact importat n-a comandat NICIODATA, deci n-are
--                        cum sa apartina unei ferestre de timp.
--   lista de clienti     „Lista poate ramane all-time, dar sumarul trebuie sa
--                        precizeze perioada" (analiza lui).
--
-- ⚠⚠ CE INSEAMNA `buyers` PE O FEREASTRA: cine are cel putin o comanda VALIDA in
-- rastimpul ales. Nu „cine exista" si nu „cine a comandat vreodata".
--
-- ⚠⚠ DECI CELE TREI CIFRE NU SE ADUNA, si asta TREBUIE spus pe ecran. Masurat pe
-- demo: 358 de contacte = 338 care au comandat vreodata + 20 importate; dar dintre
-- cele 338, doar 292 au macar o comanda valida. Restul de 46 au comandat, si totul
-- le-a fost anulat sau rambursat. Un ecran care scrie „292 cumparatori si 20
-- importate" langa „358" se contrazice singur, iar cine observa nu mai crede
-- niciuna dintre cifre.
--
-- ⚠ Argumentele de perioada sunt OPTIONALE si implicit `null` = tot istoricul.
-- Asa apelantii vechi (daca mai apare vreunul) primesc exact ce primeau.

drop function if exists public.customers_summary(uuid);
drop function if exists public.customers_summary(uuid, timestamptz, timestamptz);

create function public.customers_summary(
  bid uuid,
  p_de_la timestamptz default null,
  p_pana timestamptz default null
)
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
      count(*) filter (
        where o.status not in ('cancelled', 'refunded')
          and (p_de_la is null or o.created_at >= p_de_la)
          and (p_pana is null or o.created_at < p_pana)
      ) as valid_cnt,
      coalesce(sum(o.total) filter (
        where o.status not in ('cancelled', 'refunded')
          and (p_de_la is null or o.created_at >= p_de_la)
          and (p_pana is null or o.created_at < p_pana)
      ), 0) as value,
      coalesce(sum(o.total) filter (
        where public.comanda_incasata(o.status, o.payment_status, o.payment_method)
          and (p_de_la is null or o.created_at >= p_de_la)
          and (p_pana is null or o.created_at < p_pana)
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
    (count(*) filter (where cumparator and valid_cnt > 0))::bigint,
    (count(*) filter (where not cumparator))::bigint,
    (count(*) filter (where valid_cnt > 1))::bigint,
    /*
      ⚠ Numitorul e numarul de cumparatori DIN PERIOADA, nu totalul contactelor:
      un contact importat n-avea cum sa „revina", iar pus la numitor ar trage rata
      in jos cu cat importa comerciantul mai mult. Un magazin ar parea ca merge mai
      prost fiindca si-a urcat lista de contacte.
    */
    case when count(*) filter (where cumparator and valid_cnt > 0) > 0
         then round(100.0 * count(*) filter (where valid_cnt > 1)
                    / count(*) filter (where cumparator and valid_cnt > 0))::integer
         else 0 end,
    round(coalesce(sum(value), 0), 2),
    round(coalesce(sum(collected), 0), 2),
    case when count(*) filter (where cumparator and valid_cnt > 0) > 0
         then round(coalesce(sum(value), 0) / count(*) filter (where cumparator and valid_cnt > 0), 2)
         else 0 end
  from toti
$$;

revoke all on function public.customers_summary(uuid, timestamptz, timestamptz) from public;
revoke all on function public.customers_summary(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.customers_summary(uuid, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
