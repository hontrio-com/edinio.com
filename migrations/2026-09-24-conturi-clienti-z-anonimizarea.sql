-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 14: anonimizarea ajunge si in conturi, si
-- gaurile ei se inchid                                          (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Numele are `z-` ca sa vina, ordonat dupa nume, DUPA migratia 13
-- (`...-parola.sql`): atinge `cont_dispozitiv` si `parola_hash`, care se nasc
-- acolo. Aceeasi solutie ca la `2026-09-22-discounturi-z-paginare.sql`.
--
-- Planul: docs/redesign/CONTURI-CLIENTI.md, capitolul 10. Cerut de proprietar pe
-- 24.09.2026 („Fa si aia cu stergerea datelor").
--
-- ⚠⚠ ATINGE O FUNCTIE DE PRODUCTIE, `customer_anonymize`, chemata azi de
-- butonul „Anonimizeaza" din panou. Definitia de azi e aceeasi pe productie si
-- pe demo (md5 0867eeff3a8a10652fe8306db7c29192, citit pe 24.09.2026). Semnatura
-- si coloanele intoarse raman NESCHIMBATE, deci apelantul din
-- `customer-manage.actions.ts` nu se atinge.
--
-- Ce repara:
--  1. CONTUL omului: pana azi anonimizarea stergea datele din comenzi si lasa
--     neatins contul lui de cumparator (emailul, telefonul, sesiunile cu IP,
--     parola). `cont_rupe_legaturile` il goleste ca `cont_sterge`.
--  2. `order_source` trecea printr-o lista NEAGRA care stergea `ip`, dar codul
--     scrie `client_ip`; supravietuiau si `fbc`, `ttp`, `mc_tc`, `ga_sesiuni`,
--     `utm_term`, `utm_content` si acordurile. Lista ramane NEAGRA (hotararea din
--     21.09.2026: cheile de BANI se inmultesc cu fiecare marketplace, iar o lista
--     alba le-ar fi aruncat tacut), dar e acum COMPLETA, iar o proba o leaga de
--     `CHEI_ATRIBUIRE` din `order.actions.ts`: o cheie noua de urmarire scrisa
--     la checkout pica proba pana cand e stearsa aici sau lasata anume sa ramana.
--  3. Retururile: `refund_iban` si `reason` (text liber, des cu numele omului)
--     se golesc, dar NUMAI pe cele INCHISE (`rambursat`, `respins`). Pe unul
--     `nou` sau `aprobat` comerciantul are inca obligatia de rambursare si are
--     nevoie de contul in care sa plateasca.
--  4. Contactele pe AMBELE forme: cheia clientului e TELEFON-INTAI, deci pentru
--     un om cu telefon si email emailul nu era in `p_keys`, si cosurile lui
--     abandonate lasate numai cu email supravietuiau.
--  5. SMS-urile: se golea numai telefonul din jurnal; TEXTUL mesajului (sabloanele
--     pot purta numele, emailul si adresa) si raspunsurile primite (`notice_inbox`)
--     ramaneau. Acum se golesc si ele, si dupa telefon, si dupa comanda.
--  6. Anonimizarea IN MASA dadea tuturor clientilor aceeasi adresa anonima (un
--     singur `gen_random_uuid()` pe apel), deci N clienti deveneau unul. Acum
--     fiecare cheie primeste adresa ei.
--  7. Comenzile anonimizate INAINTE de migratie se curata o data (la 24.09.2026
--     erau zero pe productie; randul acopera ce se anonimizeaza pana la unire).

-- ═══ 1. Contul omului ═════════════════════════════════════════════════════
--
-- ⚠⚠ `security definer`, fiindca tabelele din `privat` sunt date NUMAI lui
-- `service_role`, iar `customer_anonymize` e `security invoker`, chemata cu
-- clientul comerciantului ca paza sa fie RLS-ul de pe `orders`. Atinse direct din
-- ea, prima apasare ar fi dat `42501` si s-ar fi oprit toata anonimizarea, pentru
-- toti comerciantii. Paza de aici e ACEEASI conditie ca politica de pe `orders`:
-- magazinul e al celui care cheama.
--
-- ⚠⚠ UN CONT SE GOLESTE NUMAI CAND E, SIGUR, AL OMULUI ANONIMIZAT:
--   - gasit dupa contactele din CHEILE lui (telefonul, `email:...`) sau din randul
--     lui din `customers`; ori
--   - gasit dupa contactele de pe comenzile lui SI fara nicio alta comanda legata.
-- Un cont legat de comenzile lui DOAR prin email, dar cu alte comenzi ale sale (de
-- pilda cine a trimis un cadou pe telefonul omului), NU se goleste: i se desface
-- numai legatura cu comenzile anonimizate. Altfel stergerea datelor unui om ar fi
-- sters contul altuia, fara ca acela sa afle.

create or replace function public.cont_rupe_legaturile(bid uuid, p_keys text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_chei text[] := coalesce(p_keys, '{}');
  v_ids uuid[];
  v_tel_sigure text[];
  v_email_sigure text[];
  v_tel_comenzi text[];
  v_email_comenzi text[];
  v_conturi uuid[];
  v_n integer := 0;
begin
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or exists (select 1 from public.businesses b where b.id = bid and b.user_id = (select auth.uid()))
  ) then
    raise exception 'magazinul nu e al celui care cere anonimizarea' using errcode = '42501';
  end if;

  if array_length(v_chei, 1) is null then
    return 0;
  end if;

  /* Din chei: `email:x` e un email, `order:<id>` nu e un contact, restul e telefon. */
  select coalesce(array_agg(distinct k) filter (where k not like 'email:%' and k not like 'order:%' and k <> ''), '{}'),
         coalesce(array_agg(distinct substr(k, 7)) filter (where k like 'email:%'), '{}')
    into v_tel_sigure, v_email_sigure
    from unnest(v_chei) k;

  select array_cat(v_tel_sigure,
                   coalesce(array_agg(distinct public.normalize_phone(c.phone))
                              filter (where nullif(public.normalize_phone(c.phone), '') is not null), '{}')),
         array_cat(v_email_sigure,
                   coalesce(array_agg(distinct lower(btrim(c.email)))
                              filter (where nullif(btrim(c.email), '') is not null), '{}'))
    into v_tel_sigure, v_email_sigure
    from public.customers c
   where c.business_id = bid and c.key = any(v_chei);

  select array_agg(o.id),
         coalesce(array_agg(distinct public.normalize_phone(o.customer_phone))
                    filter (where nullif(public.normalize_phone(o.customer_phone), '') is not null), '{}'),
         coalesce(array_agg(distinct lower(btrim(o.customer_email)))
                    filter (where nullif(btrim(o.customer_email), '') is not null), '{}')
    into v_ids, v_tel_comenzi, v_email_comenzi
    from public.orders o
   where o.business_id = bid
     and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = any(v_chei);
  v_ids := coalesce(v_ids, '{}');

  select array_agg(distinct x.cont_id) into v_conturi
    from (
      select k.cont_id
        from privat.cont_contact k
       where k.business_id = bid
         and ((k.fel = 'telefon' and k.valoare = any(v_tel_sigure))
           or (k.fel = 'email' and k.valoare = any(v_email_sigure)))
      union
      select k.cont_id
        from privat.cont_contact k
       where k.business_id = bid
         and ((k.fel = 'telefon' and k.valoare = any(v_tel_comenzi))
           or (k.fel = 'email' and k.valoare = any(v_email_comenzi)))
         and not exists (
           select 1 from privat.cont_comanda l
            where l.business_id = bid and l.cont_id = k.cont_id and l.order_id <> all(v_ids))
    ) x;

  /* Celelalte conturi legate de comenzile anonimizate: numai legatura se desface. */
  delete from privat.cont_comanda l
   where l.business_id = bid and l.order_id = any(v_ids)
     and not (l.cont_id = any(coalesce(v_conturi, '{}')));

  if v_conturi is not null then
    delete from privat.cont_cod c
     where c.business_id = bid
       and (c.cont_id = any(v_conturi) or exists (
             select 1 from privat.cont_contact k
              where k.business_id = bid and k.cont_id = any(v_conturi)
                and k.fel = c.fel and k.valoare = c.destinatie));
    delete from privat.cont_contact k where k.business_id = bid and k.cont_id = any(v_conturi);
    delete from privat.cont_comanda l where l.business_id = bid and l.cont_id = any(v_conturi);
    delete from privat.cont_dispozitiv d where d.business_id = bid and d.cont_id = any(v_conturi);
    delete from privat.cont_sesiune s where s.business_id = bid and s.cont_id = any(v_conturi);
    delete from privat.cont_instiintare i where i.business_id = bid and i.cont_id = any(v_conturi);
    /* ⚠ Jurnalul lor poarta IP-uri; ramane un singur rand, fara IP, care spune ce s-a intamplat. */
    delete from privat.cont_jurnal j where j.business_id = bid and j.cont_id = any(v_conturi);

    update privat.cont_cumparator c
       set sters_la = coalesce(c.sters_la, now()), nume = '',
           parola_hash = null, parola_schimbata_la = null,
           epoca_sesiunii = c.epoca_sesiunii + 1
     where c.business_id = bid and c.id = any(v_conturi);
    get diagnostics v_n = row_count;

    insert into privat.cont_jurnal (business_id, cont_id, fapta)
    select bid, u, 'cont-anonimizat-de-magazin' from unnest(v_conturi) u;
  end if;

  /* Si ce nu e legat de niciun cont, pe contactele SIGURE ale omului: coduri
     cerute (o inregistrare neterminata), instiintari, contacte contestate. */
  delete from privat.cont_cod c
   where c.business_id = bid
     and ((c.fel = 'email' and c.destinatie = any(v_email_sigure))
       or (c.fel = 'telefon' and c.destinatie = any(v_tel_sigure)));
  delete from privat.cont_instiintare i
   where i.business_id = bid and (i.destinatie = any(v_email_sigure) or i.destinatie = any(v_tel_sigure));
  delete from privat.cont_contact_blocat b
   where b.business_id = bid
     and ((b.fel = 'email' and b.valoare = any(v_email_sigure))
       or (b.fel = 'telefon' and b.valoare = any(v_tel_sigure)));

  return v_n;
end $$;

revoke all on function public.cont_rupe_legaturile(uuid, text[]) from public, anon;
grant execute on function public.cont_rupe_legaturile(uuid, text[]) to authenticated, service_role;

-- ═══ 2. Sursa comenzii, anonimizata ══════════════════════════════════════
--
-- ⚠ O SINGURA definitie, folosita si de anonimizare, si de curatarea o data a
-- comenzilor anonimizate inainte (sectiunea 4). Pura: nu citeste nimic din baza,
-- deci se poate da si lui `authenticated` (`customer_anonymize` ruleaza cu
-- drepturile comerciantului).

create or replace function privat.sursa_anonimizata(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then p
    else (p
           - 'ga_client_id' - 'ga_sesiuni' - 'fbp' - 'fbc' - 'fbclid' - 'gclid' - 'ttclid'
           - 'ttp' - 'msclkid' - 'mc_tc' - 'user_agent' - 'landing' - 'referrer'
           - 'utm_term' - 'utm_content' - 'ip' - 'client_ip'
           - 'consimtamant_citit' - 'consimtamant_analiza' - 'consimtamant_marketing')
      || jsonb_strip_nulls(jsonb_build_object(
           'gclid', case when nullif(p ->> 'gclid', '') is not null then 'anonimizat' end,
           'fbclid', case when nullif(p ->> 'fbclid', '') is not null then 'anonimizat' end,
           'ttclid', case when nullif(p ->> 'ttclid', '') is not null then 'anonimizat' end,
           'msclkid', case when nullif(p ->> 'msclkid', '') is not null then 'anonimizat' end,
           'referrer', substring(p ->> 'referrer' from '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+')))
  end;
$$;

revoke all on function privat.sursa_anonimizata(jsonb) from public, anon;
grant execute on function privat.sursa_anonimizata(jsonb) to authenticated, service_role;

-- ═══ 3. Anonimizarea ══════════════════════════════════════════════════════

create or replace function public.customer_anonymize(bid uuid, p_keys text[])
returns table (comenzi integer, contacte integer, cosuri integer, retururi integer, mesaje integer)
language plpgsql set search_path = '' as $$
declare
  v_comenzi integer := 0;
  v_contacte integer := 0;
  v_cosuri integer := 0;
  v_retururi integer := 0;
  v_mesaje integer := 0;
  v_chei text[] := coalesce(p_keys, '{}');
  v_ids uuid[];
  v_telefoane text[];
  v_emailuri text[];
begin
  if array_length(v_chei, 1) is null then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  /*
    ⚠⚠ CONTUL INTAI, cat timp comenzile inca poarta emailul si telefonul dupa
    care se gasesc conturile. Dupa anonimizarea de mai jos n-ar mai fi fost nimic
    de potrivit. Cade la fel ca restul: in aceeasi tranzactie, totul sau nimic.
  */
  perform public.cont_rupe_legaturile(bid, v_chei);

  select array_agg(o.id),
         array_agg(distinct public.normalize_phone(o.customer_phone))
           filter (where nullif(public.normalize_phone(o.customer_phone), '') is not null),
         array_agg(distinct lower(btrim(o.customer_email)))
           filter (where nullif(btrim(o.customer_email), '') is not null)
    into v_ids, v_telefoane, v_emailuri
    from public.orders o
   where o.business_id = bid
     and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = any(v_chei);

  select array_cat(coalesce(v_telefoane, '{}'),
                   coalesce(array_agg(distinct public.normalize_phone(c.phone))
                              filter (where nullif(public.normalize_phone(c.phone), '') is not null), '{}')),
         array_cat(coalesce(v_emailuri, '{}'),
                   coalesce(array_agg(distinct lower(btrim(c.email)))
                              filter (where nullif(btrim(c.email), '') is not null), '{}'))
    into v_telefoane, v_emailuri
    from public.customers c
   where c.business_id = bid and c.key = any(v_chei);

  v_telefoane := coalesce(v_telefoane, '{}');
  v_emailuri := coalesce(v_emailuri, '{}');

  /* ⚠ Cosurile, pe AMBELE forme ale contactului, nu doar pe cheie. */
  with sterse as (
    update public.abandoned_carts c
    set customer_name = null, phone = null, email = null
    where c.business_id = bid
      and (
        public.normalize_phone(c.phone) = any(v_chei)
        or ('email:' || lower(trim(c.email))) = any(v_chei)
        or nullif(public.normalize_phone(c.phone), '') = any(v_telefoane)
        or lower(btrim(c.email)) = any(v_emailuri)
      )
      and coalesce(nullif(public.normalize_phone(c.phone), ''), nullif(lower(trim(c.email)), '')) is not null
    returning 1
  )
  select count(*)::integer into v_cosuri from sterse;

  /* ⚠ SMS-urile: telefonul SI textul (sabloanele pot purta numele, emailul si
     adresa), dupa telefon si dupa comanda. */
  with sterse as (
    update public.notice_sms_log s
    set phone = '', message = null
    where s.business_id = bid
      and (public.normalize_phone(s.phone) = any(v_telefoane)
        or s.order_id = any(coalesce(v_ids, '{}')))
    returning 1
  )
  select count(*)::integer into v_mesaje from sterse;

  /* Si raspunsurile primite de la om. */
  update public.notice_inbox n
     set from_number = null, body = null, raw = null
   where n.business_id = bid
     and (n.order_id = any(coalesce(v_ids, '{}'))
       or nullif(public.normalize_phone(n.from_number), '') = any(v_telefoane));

  /*
    ⚠ IBAN-ul si motivul se golesc NUMAI pe retururile INCHISE. Pe unul `nou` sau
    `aprobat`, comerciantul trebuie inca sa ramburseze, si fara IBAN n-ar avea
    unde. Numele si contactele pleaca pe toate, ca inainte.
  */
  if array_length(v_ids, 1) is not null then
    with sterse as (
      update public.return_requests r
      set customer_name = 'Client șters', customer_phone = null, customer_email = null,
          refund_iban = case when r.status in ('rambursat', 'respins') then null else r.refund_iban end,
          reason = case when r.status in ('rambursat', 'respins') then null else r.reason end
      where r.order_id = any(v_ids)
      returning 1
    )
    select count(*)::integer into v_retururi from sterse;
  end if;

  if array_length(v_ids, 1) is not null then
    /* ⚠ O adresa anonima PE CHEIE: anonimizat in masa, fiecare client ramane al lui,
       iar numarul de clienti nu scade. */
    with anonim as (
      select k, 'sters-' || gen_random_uuid()::text || '@anonim.invalid' as adresa
        from unnest(v_chei) k
    ),
    sterse as (
      update public.orders o
      set customer_name = 'Client șters',
          customer_phone = '',
          customer_email = coalesce(
            (select a.adresa from anonim a
              where a.k = public.order_customer_key(o.customer_phone, o.customer_email, o.id)),
            'sters-' || gen_random_uuid()::text || '@anonim.invalid'),
          shipping_address = case
            when o.shipping_address is null or jsonb_typeof(o.shipping_address) <> 'object' then o.shipping_address
            else coalesce(
              (select jsonb_object_agg(k, o.shipping_address -> k)
               from jsonb_object_keys(o.shipping_address) k
               where k in ('county', 'countyName')),
              '{}'::jsonb)
          end,
          notes = null,
          internal_notes = null,
          /*
            ⚠⚠ LISTA NEAGRA, COMPLETA: pleaca tot ce scrie checkout-ul si poate
            arata spre om (IP, agentul, cookie-urile pixelilor, sesiunile GA,
            `utm_term`/`utm_content`, adresa de intrare, acordurile). Raman banii,
            marketplace-urile si canalul la nivel de CAMPANIE (`utm_source`,
            `utm_medium`, `utm_campaign`, `mc_cid`). Identificatorii de clic devin
            `anonimizat`: raman un semn ca vizita a venit dintr-o reclama platita,
            fara sa mai poata fi legati de om. Referrer-ul ramane numai ca origine.
          */
          order_source = privat.sursa_anonimizata(o.order_source)
      where o.id = any(v_ids)
      returning 1
    )
    select count(*)::integer into v_comenzi from sterse;
  end if;

  with sterse as (
    delete from public.customers c
    where c.business_id = bid and c.key = any(v_chei)
    returning 1
  )
  select count(*)::integer into v_contacte from sterse;

  return query select v_comenzi, v_contacte, v_cosuri, v_retururi, v_mesaje;
end
$$;

revoke all on function public.customer_anonymize(uuid, text[]) from public, anon;
grant execute on function public.customer_anonymize(uuid, text[]) to authenticated, service_role;

-- ═══ 4. Comenzile anonimizate INAINTE de migratie ═════════════════════════
--
-- ⚠ Functia veche lasa `client_ip`, cookie-urile pixelilor, `ga_sesiuni`,
-- `utm_term`/`utm_content` si acordurile, iar pe retururile incheiate IBAN-ul si
-- motivul. Cheia lor e acum `email:sters-...@anonim.invalid`, deci nicio
-- anonimizare viitoare nu le-ar mai atinge. Idempotent: o comanda deja curata
-- iese la fel. Masurat pe productie pe 24.09.2026: zero comenzi anonimizate.

update public.orders o
   set order_source = privat.sursa_anonimizata(o.order_source)
 where o.customer_email like 'sters-%@anonim.invalid'
   and jsonb_typeof(o.order_source) = 'object'
   and o.order_source ?| array['ga_client_id', 'ga_sesiuni', 'fbp', 'fbc', 'ttp', 'mc_tc', 'user_agent',
                               'landing', 'utm_term', 'utm_content', 'ip', 'client_ip', 'referrer',
                               'consimtamant_citit', 'consimtamant_analiza', 'consimtamant_marketing'];

update public.return_requests r
   set refund_iban = null, reason = null
 where r.customer_name = 'Client șters'
   and r.status in ('rambursat', 'respins')
   and (r.refund_iban is not null or r.reason is not null);

-- ═══ Drepturile ═══════════════════════════════════════════════════════════

do $$
begin
  if has_function_privilege('anon', 'public.customer_anonymize(uuid, text[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.cont_rupe_legaturile(uuid, text[])', 'EXECUTE') then
    raise exception 'anon poate chema anonimizarea';
  end if;
  if not has_function_privilege('authenticated', 'public.customer_anonymize(uuid, text[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.cont_rupe_legaturile(uuid, text[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'privat.sursa_anonimizata(jsonb)', 'EXECUTE') then
    raise exception 'panoul a pierdut anonimizarea';
  end if;
end $$;

notify pgrst, 'reload schema';
