-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI, D2: cronologia unui client                         (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fila „Activitate" din fisa: ce s-a intamplat cu omul asta, in ordine.
--
-- ⚠ PE CE STA, MASURAT INAINTE (productie, 21.09.2026):
--     comenzi ................ 537
--     cosuri abandonate ...... 390, in 10 magazine
--     SMS-uri trimise ........ 463, in 3 magazine
--     mesaje de recuperare ... 0  (tabela a plecat in productie CHIAR AZI)
--     coada de email ......... 0
--
-- Deci fila NU e goala: trei din cinci izvoare au deja trafic real. Ultimele
-- doua se umplu singure pe masura ce vine; pana atunci pur si simplu nu apar
-- randuri de felul lor, ceea ce e adevarat, nu stricat.
--
-- ⚠⚠ LEGAREA DE CLIENT SE FACE PE ACEEASI CHEIE CA RESTUL PAGINII, si asta e
-- partea delicata: clientul nu are id, are o cheie in cascada (telefon normalizat
-- → `email:<adresa>`). Fiecare izvor trebuie adus la ea:
--
--   comenzi  `order_customer_key(...)`, chiar functia care face gruparea;
--   cosuri   telefonul normalizat SAU `email:` + adresa, exact ca in cascada;
--   SMS      numai telefonul normalizat (jurnalul n-are email);
--   recuperari  prin cosul de care atarna.
--
-- ⚠ O cheie compusa altfel intr-un singur izvor ar fi dat o cronologie care
-- SARE peste jumatate din ce s-a intamplat, fara sa dea nicio eroare. De aceea
-- nicaieri nu se compara telefonul brut: numai trecut prin `normalize_phone`.
--
-- ⚠ SI SE SAR RANDURILE FARA NICIUN CONTACT. Un cos fara telefon si fara email
-- ar avea cheia goala, iar `'' = ''` e adevarat: s-ar fi lipit de orice client
-- care are, la randul lui, cheia goala. Conditia de la sfarsitul fiecarui izvor
-- opreste exact asta.

create or replace function public.customer_activity(
  bid uuid,
  cust_key text,
  page_limit integer default 60
)
returns table (
  fel text,
  cand timestamptz,
  titlu text,
  detaliu text,
  suma numeric,
  legatura_id uuid
)
language sql
stable
security invoker
set search_path to ''
as $$
  with comenzi as (
    select
      'comanda'::text as fel,
      o.created_at as cand,
      o.order_number as titlu,
      o.status as detaliu,
      o.total as suma,
      o.id as legatura_id
    from public.orders o
    where o.business_id = bid
      and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = cust_key
  ),
  cosuri as (
    select
      'cos'::text,
      c.created_at,
      null::text,
      c.status,
      c.subtotal,
      c.id
    from public.abandoned_carts c
    where c.business_id = bid
      and (
        public.normalize_phone(c.phone) = cust_key
        or ('email:' || lower(trim(c.email))) = cust_key
      )
      and coalesce(nullif(public.normalize_phone(c.phone), ''), nullif(lower(trim(c.email)), '')) is not null
  ),
  mesaje as (
    select
      'sms'::text,
      s.created_at,
      s.trigger_key,
      case when s.success then coalesce(s.delivery_status, 'trimis') else coalesce(s.error, 'esuat') end,
      null::numeric,
      s.order_id
    from public.notice_sms_log s
    where s.business_id = bid
      and public.normalize_phone(s.phone) = cust_key
      and nullif(public.normalize_phone(s.phone), '') is not null
  ),
  recuperari as (
    /*
      ⚠ Mesajul DESCHIS e alt fel decat cel doar trimis, si se aseaza dupa clipa
      deschiderii: „a deschis linkul" e fapta lui, „i s-a trimis" e fapta noastra.
      Puse la fel, cronologia ar fi spus ca omul a facut ceva atunci cand, de
      fapt, i-am scris noi.
    */
    select
      case when r.deschis_la is not null then 'recuperare-deschisa' else 'recuperare' end::text,
      coalesce(r.deschis_la, r.trimis_la),
      r.canal,
      r.sursa,
      null::numeric,
      r.cart_id
    from public.recovery_sends r
    join public.abandoned_carts c on c.id = r.cart_id
    where r.business_id = bid
      and (
        public.normalize_phone(c.phone) = cust_key
        or ('email:' || lower(trim(c.email))) = cust_key
      )
  )
  select * from (
    select * from comenzi
    union all select * from cosuri
    union all select * from mesaje
    union all select * from recuperari
  ) t
  order by t.cand desc
  limit page_limit
$$;

revoke all on function public.customer_activity(uuid, text, integer) from public;
revoke all on function public.customer_activity(uuid, text, integer) from anon;
grant execute on function public.customer_activity(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
