-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 17: reparatiile AUDITULUI de dinaintea unirii
--                                                               (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `zzzz-`: vine dupa 50-53 si in ordinea numelor. Redefineste functii din
-- 40/43 (sesiunea), 42 (maturarea), 45 (anularea), 50 (codul, stergerea),
-- 52 (contactul, exportul) si 53 (panoul). Pentru fiecare, definitia de aici e
-- cea VIE; restul corpului e copiat intocmai din cea de dinainte.
--
-- Cerut de proprietar: „mai fa un audit complet la tot sistemul asta si daca e
-- totul perfect 10/10 din toate punctele de vedere...". Cinci auditori
-- independenti (securitate, SQL, performanta, functii, unire). Reparat aici:
--
--  1. Anularea din cont: comanda se BLOCHEAZA (`for update`) inainte de citirea
--     starii, si se anuleaza numai neplatita si cu plata la livrare sau prin
--     transfer. O plata online in curs putea fi anulata chiar cand banii intrau.
--  2. Bugetul zilnic de coduri: o valoare stricata in setari (scrisa direct)
--     arunca 22P02 si oprea contul nou si resetarea. Acum cade pe implicit.
--  3. „Ultimul email confirmat": numaratoarea si stergerea sub incuietoarea
--     contului; doua cereri deodata puteau lasa contul fara nicio adresa.
--  4. Maturarea (la fiecare intrare): pe doua brate, pe indexurile de telefon si
--     de email; inainte parcurgea toate comenzile magazinului. Numele se ia numai
--     din comenzile omului, nu din cele legate de mana.
--  5. Adresa noua in cont: 10 incercari pe zi pe adresa, codul se potriveste
--     NUMAI cu cele cerute de chiar contul asta, si o ghicire straina nu mai arde
--     codurile omului.
--  6. Sesiunea: in cele 30 de secunde de gratie dupa rotire, jetonul vechi tine
--     omul in cont (inainte il trimitea la intrare); inactivitatea se prelungeste
--     cel mult o data pe ora (inainte, o scriere la fiecare pagina).
--  7. Parola gresita: incercarea se REZERVA sub incuietoare, inaintea comparatiei
--     (inainte, 40 de ghiciri trimise deodata treceau toate de pragul de 5);
--     cat contul e blocat, incercarile nu mai prelungesc blocajul.
--  8. Stergerea contului scoate si adresele lui din lista de blocate.
--  9. Exportul: IP-urile incercarilor STRAINE (parola gresita, intrare refuzata)
--     ies ascunse; sunt ale altcuiva.
-- 10. Panoul: lista pagineaza INAINTE de a imbogati randurile; numele si telefonul
--     nu se iau din comenzile legate de mana; previzualizarea legarii se uita
--     numai la contactele confirmate; eticheta „are cont" citeste pe indexul
--     cheii clientului.
-- 11. Index pe `cont_instiintare(business_id)` (cheia straina spre magazin).

-- ═══ 1. Anularea din cont ══════════════════════════════════════════════════

create or replace function public.cont_anuleaza_comanda(p_business uuid, p_cont uuid, p_order uuid)
returns table (ok boolean, motiv text)
language plpgsql security definer set search_path = '' as $$
declare v_o record; v_rez jsonb;
begin
  if not exists (
    select 1 from privat.cont_comanda l
     where l.business_id = p_business and l.cont_id = p_cont
       and l.order_id = p_order and l.vedere = 'intreaga'
  ) then
    return query select false, 'negasita';
    return;
  end if;

  /* ⚠⚠ Blocata INAINTE de citire: altfel comerciantul sau un webhook de plata
     puteau muta comanda intre verificare si anulare, iar anularea castiga. */
  select o.status, o.payment_status, o.payment_method,
         coalesce(o.order_source ? 'marketplace', false) as mk
    into v_o
    from public.orders o where o.id = p_order and o.business_id = p_business
     for update;

  if v_o.status is null then
    return query select false, 'negasita';
    return;
  end if;
  if v_o.mk then
    return query select false, 'marketplace';
    return;
  end if;
  if v_o.status <> 'pending' then
    return query select false, 'prea-tarziu';
    return;
  end if;
  /* ⚠⚠ Numai neplatita si cu plata care nu poate fi in curs: la card, banii pot
     intra chiar acum, iar o comanda anulata si platita e bani de intors de mana. */
  if coalesce(v_o.payment_status, 'unpaid') <> 'unpaid' then
    return query select false, 'platita';
    return;
  end if;
  if coalesce(v_o.payment_method, '') not in ('cash_on_delivery', 'ramburs', 'bank_transfer') then
    return query select false, 'plata-online';
    return;
  end if;

  v_rez := public.aplica_tranzitia_comenzii(p_order, 'cancelled', null, p_business, true);
  if coalesce((v_rez->>'gasit')::boolean, false) = false then
    return query select false, 'negasita';
    return;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'anulare-comanda', jsonb_build_object('comanda', p_order));

  return query select true, 'anulata';
end $$;

-- ═══ 4. Maturarea ══════════════════════════════════════════════════════════

create or replace function public.cont_maturare(p_business uuid, p_cont uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_cate integer;
begin
  /* ⚠ Doua brate, fiecare pe indexul lui (`idx_orders_business_normphone`,
     `idx_orders_business_email`). Cu SAU intr-un singur brat, planificatorul
     parcurgea toate comenzile magazinului, la fiecare intrare. */
  with potrivite as (
    select o.id
      from privat.cont_contact c
      join public.orders o
        on o.business_id = p_business
       and public.normalize_phone(o.customer_phone) = c.valoare
     where c.business_id = p_business and c.cont_id = p_cont
       and c.verificat_la is not null and c.fel = 'telefon'
       and not coalesce(o.order_source ? 'marketplace', false)
    union
    select o.id
      from privat.cont_contact c
      join public.orders o
        on o.business_id = p_business
       and lower(btrim(o.customer_email)) = c.valoare
     where c.business_id = p_business and c.cont_id = p_cont
       and c.verificat_la is not null and c.fel = 'email'
       and not coalesce(o.order_source ? 'marketplace', false)
  ), scrise as (
    insert into privat.cont_comanda (order_id, business_id, cont_id, temei, vedere)
    select p.id, p_business, p_cont, 'contact-verificat', 'intreaga'
      from potrivite p
    on conflict (order_id) do nothing
    returning 1
  )
  select count(*) into v_cate from scrise;

  /* Numele, din comenzile OMULUI: una legata de mana poate fi a altcuiva. */
  update privat.cont_cumparator c
     set nume = coalesce((
           select btrim(o.customer_name)
             from privat.cont_comanda l
             join public.orders o on o.id = l.order_id
            where l.cont_id = p_cont and l.business_id = p_business
              and l.temei <> 'legat-de-comerciant'
            order by o.created_at desc
            limit 1
         ), '')
   where c.id = p_cont and c.business_id = p_business and btrim(c.nume) = '';

  return coalesce(v_cate, 0);
end $$;

-- ═══ 6. Sesiunea ═══════════════════════════════════════════════════════════

create or replace function public.cont_sesiune_verifica(p_business uuid, p_jeton_hash text)
returns table (cont_id uuid, nume text, trebuie_rotit boolean)
language plpgsql security definer set search_path = '' as $$
declare r record; s record; c record; pornit boolean;
begin
  select * into r from privat.cont_reguli_sesiune();
  select * into s from privat.cont_sesiune x
   where x.business_id = p_business and x.jeton_hash = p_jeton_hash;
  if s.id is null then return; end if;

  if s.incheiata_la is not null then
    if s.motiv_incheiere = 'rotire' and s.incheiata_la > now() - r.gratie_rotire then
      /* ⚠ Gratia rotirii: cereri plecate deodata cu jetonul vechi raman in cont,
         cu aceleasi conditii ca sesiunea vie (cont viu, nesuspendat, aceeasi epoca). */
      select * into c from privat.cont_cumparator x
       where x.id = s.cont_id and x.business_id = s.business_id;
      if c.id is null or c.sters_la is not null or c.suspendat_la is not null
         or c.epoca_sesiunii <> s.epoca then
        return;
      end if;
      select (st.cont_client_config->'enabled') = 'true'::jsonb into pornit
        from privat.store_settings st where st.business_id = p_business;
      if pornit is not true then return; end if;
      return query select c.id, c.nume, false;
      return;
    end if;
    if s.motiv_incheiere = 'rotire' then
      update privat.cont_cumparator set epoca_sesiunii = epoca_sesiunii + 1
       where id = s.cont_id and business_id = s.business_id;
      update privat.cont_sesiune set motiv_incheiere = 'refolosire' where id = s.id;
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
      values (s.business_id, s.cont_id, 'jeton-refolosit', jsonb_build_object('sesiune', s.id));
    end if;
    return;
  end if;

  if s.expira_la <= now() then
    update privat.cont_sesiune set incheiata_la = now(), motiv_incheiere = 'expirare' where id = s.id;
    return;
  end if;
  if s.inactiva_dupa <= now() then
    update privat.cont_sesiune set incheiata_la = now(), motiv_incheiere = 'inactivitate' where id = s.id;
    return;
  end if;

  select * into c from privat.cont_cumparator x
   where x.id = s.cont_id and x.business_id = s.business_id;

  if c.id is null or c.sters_la is not null or c.epoca_sesiunii <> s.epoca then
    update privat.cont_sesiune
       set incheiata_la = now(),
           motiv_incheiere = case when c.sters_la is not null then 'stergere' else 'epoca' end
     where id = s.id;
    return;
  end if;

  select (st.cont_client_config->'enabled') = 'true'::jsonb into pornit
    from privat.store_settings st where st.business_id = p_business;
  if pornit is not true then return; end if;

  /* ⚠ Prelungirea se scrie cel mult o data pe ora: fiecare pagina de cont o
     scria, adica o scriere (si un rand mort) la fiecare clic. */
  if s.inactiva_dupa < least(now() + r.inactivitate, s.expira_la) - interval '1 hour' then
    update privat.cont_sesiune
       set inactiva_dupa = least(now() + r.inactivitate, s.expira_la)
     where id = s.id;
  end if;

  return query select c.id, c.nume, (s.creata_la < now() - r.rotire_dupa);
end $$;

-- ═══ 7. Parola gresita: incercarea se rezerva sub incuietoare ══════════════
--
-- Se cheama DUPA `cont_parola_pentru_intrare`, cand exista cont si amprenta,
-- INAINTEA comparatiei. Numara la fel ca ea (de la ultima intrare reusita sau
-- schimbare de parola, cel mult 15 minute) si, sub aceeasi incuietoare, scrie
-- incercarea ca „parola-gresita". O comparatie reusita o sterge
-- (`cont_incercare_reusita`). Cat contul e blocat, nu se mai scrie nimic.

create or replace function public.cont_incercare_parola(p_business uuid, p_cont uuid, p_ip text default null)
returns table (id bigint, blocat boolean)
language plpgsql security definer set search_path = '' as $$
declare v_schimbata timestamptz; v_de_la timestamptz; v_cate integer; v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('parola:' || p_business::text || ':' || p_cont::text, 0));
  select c.parola_schimbata_la into v_schimbata
    from privat.cont_cumparator c
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null;
  select greatest(
           now() - interval '15 minutes',
           coalesce(v_schimbata, '-infinity'::timestamptz),
           coalesce((select max(j.creat_la) from privat.cont_jurnal j
                      where j.business_id = p_business and j.cont_id = p_cont and j.fapta = 'intrare'),
                    '-infinity'::timestamptz))
    into v_de_la;
  select count(*) into v_cate
    from privat.cont_jurnal j
   where j.business_id = p_business and j.cont_id = p_cont and j.fapta = 'parola-gresita'
     and j.creat_la > v_de_la;
  if v_cate >= 5 then
    return query select null::bigint, true;
    return;
  end if;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, ip)
  values (p_business, p_cont, 'parola-gresita', privat.cont_ip_sigur(p_ip))
  returning privat.cont_jurnal.id into v_id;
  return query select v_id, false;
end $$;

create or replace function public.cont_incercare_reusita(p_business uuid, p_id bigint)
returns void
language sql security definer set search_path = '' as $$
  delete from privat.cont_jurnal j
   where j.id = p_id and j.business_id = p_business and j.fapta = 'parola-gresita';
$$;

-- ═══ 10. Panoul ════════════════════════════════════════════════════════════

-- ⚠ Pagina se alege INTAI, pe coloane ieftine (data, suspendarea, ultima intrare
-- si numarul de comenzi, fiecare pe indexul ei), si abia cele cel mult 100 de
-- randuri alese se imbogatesc (nume, email, telefon, preferinte). Inainte, toate
-- conturile magazinului erau imbogatite la fiecare pagina.

create or replace function public.cont_panou_lista(
  p_business uuid,
  p_cautare text default null,
  p_stare text default 'toate',
  p_ordine text default 'noi',
  p_limita integer default 50,
  p_decalaj integer default 0
) returns table (
  cont_id uuid,
  nume text,
  email text,
  email_confirmat boolean,
  telefon text,
  creat_la timestamptz,
  ultima_intrare timestamptz,
  comenzi bigint,
  are_parola boolean,
  suspendat_la timestamptz,
  primeste_email boolean,
  total_randuri bigint
)
language sql stable security definer set search_path = '' as $$
  with cautare as (
    select
      case when nullif(btrim(coalesce(p_cautare, '')), '') is null then null
           else '%' || replace(replace(replace(lower(btrim(p_cautare)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as tipar,
      case when length(public.normalize_phone(coalesce(p_cautare, ''))) >= 3
           then '%' || public.normalize_phone(p_cautare) || '%'
      end as tipar_tel
  ),
  baza as (
    select
      c.id, c.nume as nume_cont, c.creat_la, c.parola_hash is not null as are_parola, c.suspendat_la,
      (select max(j.creat_la) from privat.cont_jurnal j
        where j.business_id = p_business and j.cont_id = c.id and j.fapta = 'intrare') as ultima_intrare,
      (select count(*) from privat.cont_comanda l
        where l.business_id = p_business and l.cont_id = c.id) as comenzi
    from privat.cont_cumparator c
   where c.business_id = p_business and c.sters_la is null
  ),
  filtrate as (
    select b.*
      from baza b, cautare q
     where (q.tipar is null
            or lower(coalesce(b.nume_cont, '')) like q.tipar escape '\'
            or exists (select 1 from privat.cont_contact k
                        where k.business_id = p_business and k.cont_id = b.id
                          and (k.valoare like q.tipar escape '\'
                               or (q.tipar_tel is not null and k.fel = 'telefon' and k.valoare like q.tipar_tel)))
            or exists (select 1 from privat.cont_comanda l join public.orders o on o.id = l.order_id
                        where l.business_id = p_business and l.cont_id = b.id
                          and (lower(o.order_number) like q.tipar escape '\'
                               or (l.temei <> 'legat-de-comerciant' and lower(coalesce(o.customer_name, '')) like q.tipar escape '\')
                               or (q.tipar_tel is not null
                                   and public.normalize_phone(o.customer_phone) like q.tipar_tel))))
       and case coalesce(p_stare, 'toate')
             when 'active' then b.suspendat_la is null
             when 'suspendate' then b.suspendat_la is not null
             when 'fara-comenzi' then b.comenzi = 0
             else true
           end
  ),
  pagina as (
    select f.*, count(*) over () as total_randuri
      from filtrate f
     order by
       case when p_ordine = 'activi' then f.ultima_intrare end desc nulls last,
       case when p_ordine = 'comenzi' then f.comenzi end desc nulls last,
       f.creat_la desc,
       f.id
     limit greatest(1, least(100, coalesce(p_limita, 50)))
    offset greatest(0, least(2000000, coalesce(p_decalaj, 0)))
  )
  select p.id,
         coalesce(
           nullif(btrim(p.nume_cont), ''),
           (select nullif(btrim(o.customer_name), '')
              from privat.cont_comanda l join public.orders o on o.id = l.order_id
             where l.business_id = p_business and l.cont_id = p.id and l.temei <> 'legat-de-comerciant'
             order by o.created_at desc limit 1)),
         (select k.valoare_bruta from privat.cont_contact k
           where k.business_id = p_business and k.cont_id = p.id and k.fel = 'email'
           order by k.verificat_la nulls last, k.creat_la limit 1),
         exists (select 1 from privat.cont_contact k
                  where k.business_id = p_business and k.cont_id = p.id and k.fel = 'email'
                    and k.verificat_la is not null),
         coalesce(
           (select k.valoare_bruta from privat.cont_contact k
             where k.business_id = p_business and k.cont_id = p.id and k.fel = 'telefon'
             order by k.verificat_la nulls last, k.creat_la limit 1),
           (select nullif(btrim(o.customer_phone), '')
              from privat.cont_comanda l join public.orders o on o.id = l.order_id
             where l.business_id = p_business and l.cont_id = p.id and l.temei <> 'legat-de-comerciant'
             order by o.created_at desc limit 1)),
         p.creat_la, p.ultima_intrare, p.comenzi, p.are_parola, p.suspendat_la,
         coalesce((select pr.primeste_email from public.cont_preferinte(p_business, p.id) pr), true),
         p.total_randuri
    from pagina p
   order by
     case when p_ordine = 'activi' then p.ultima_intrare end desc nulls last,
     case when p_ordine = 'comenzi' then p.comenzi end desc nulls last,
     p.creat_la desc,
     p.id;
$$;

create or replace function public.cont_panou_comanda_de_legat(p_business uuid, p_cont uuid, p_numar text)
returns table (
  order_id uuid,
  numar text,
  creata_la timestamptz,
  total numeric,
  stare text,
  nume_client text,
  email_client text,
  telefon_client text,
  marketplace boolean,
  legata_de uuid,
  se_potriveste boolean
)
language sql stable security definer set search_path = '' as $$
  with n as (select nullif(lower(ltrim(btrim(coalesce(p_numar, '')), '#')), '') as v)
  select o.id, o.order_number, o.created_at, o.total, o.status,
         o.customer_name, o.customer_email, o.customer_phone,
         coalesce(o.order_source ? 'marketplace', false),
         (select l.cont_id from privat.cont_comanda l where l.order_id = o.id),
         /* Numai contactele CONFIRMATE ale contului spun „e al lui". */
         exists (select 1 from privat.cont_contact k
                  where k.business_id = p_business and k.cont_id = p_cont and k.verificat_la is not null
                    and ((k.fel = 'email' and k.valoare = lower(btrim(coalesce(o.customer_email, ''))))
                      or (k.fel = 'telefon' and k.valoare = public.normalize_phone(o.customer_phone))))
    from public.orders o, n
   where n.v is not null and o.business_id = p_business
     and lower(o.order_number) in (n.v, '#' || n.v)
   order by o.created_at desc
   limit 1;
$$;

-- ⚠ Cu chei date (pagina de clienti, cel mult 50), bratul comenzilor porneste de
-- la indexul cheii clientului (`idx_orders_business_customer_key`); fara chei
-- (filtrul „cu cont"), de la legaturile contului. Apelantul pagineaza al doilea
-- caz (PostgREST taie la 1000 de randuri).

create or replace function public.cont_panou_chei(p_business uuid, p_chei text[] default null)
returns table (cheie text, cont_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_chei is not null then
    return query
    select distinct on (u.cheie) u.cheie, u.cont_id
      from (
        select public.order_customer_key(o.customer_phone, o.customer_email, o.id) as cheie,
               l.cont_id, 1 as rang, l.revendicat_la as cand
          from public.orders o
          join privat.cont_comanda l on l.order_id = o.id and l.business_id = o.business_id
          join privat.cont_cumparator c on c.id = l.cont_id and c.business_id = l.business_id and c.sters_la is null
         where o.business_id = p_business
           and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = any(p_chei)
           and l.temei <> 'legat-de-comerciant'
           and exists (select 1 from privat.cont_contact k
                        where k.business_id = l.business_id and k.cont_id = l.cont_id and k.verificat_la is not null
                          and ((k.fel = 'email' and k.valoare = lower(btrim(coalesce(o.customer_email, ''))))
                            or (k.fel = 'telefon' and k.valoare = public.normalize_phone(o.customer_phone))))
        union all
        select public.discount_customer_key(case when k.fel = 'telefon' then k.valoare end,
                                            case when k.fel = 'email' then k.valoare end),
               k.cont_id, 2, k.verificat_la
          from privat.cont_contact k
          join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id and c.sters_la is null
         where k.business_id = p_business and k.verificat_la is not null
           and public.discount_customer_key(case when k.fel = 'telefon' then k.valoare end,
                                            case when k.fel = 'email' then k.valoare end) = any(p_chei)
      ) u
     where u.cheie is not null
     order by u.cheie, u.rang, u.cand desc nulls last;
    return;
  end if;

  return query
  select distinct on (u.cheie) u.cheie, u.cont_id
    from (
      select public.order_customer_key(o.customer_phone, o.customer_email, o.id) as cheie,
             l.cont_id, 1 as rang, l.revendicat_la as cand
        from privat.cont_comanda l
        join public.orders o on o.id = l.order_id
        join privat.cont_cumparator c on c.id = l.cont_id and c.business_id = l.business_id and c.sters_la is null
       where l.business_id = p_business and l.temei <> 'legat-de-comerciant'
         and exists (select 1 from privat.cont_contact k
                      where k.business_id = l.business_id and k.cont_id = l.cont_id and k.verificat_la is not null
                        and ((k.fel = 'email' and k.valoare = lower(btrim(coalesce(o.customer_email, ''))))
                          or (k.fel = 'telefon' and k.valoare = public.normalize_phone(o.customer_phone))))
      union all
      select public.discount_customer_key(case when k.fel = 'telefon' then k.valoare end,
                                          case when k.fel = 'email' then k.valoare end),
             k.cont_id, 2, k.verificat_la
        from privat.cont_contact k
        join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id and c.sters_la is null
       where k.business_id = p_business and k.verificat_la is not null
    ) u
   where u.cheie is not null
   order by u.cheie, u.rang, u.cand desc nulls last;
end $$;

-- ═══ 11. Index ═════════════════════════════════════════════════════════════

create index if not exists idx_cont_instiintare_magazin on privat.cont_instiintare (business_id);

-- ═══ 2. Bugetul zilnic de coduri, fara aruncare ════════════════════════════
--
-- Identica cu cea din migratia 13, cu bugetul citit prin garda de cifre.

create or replace function public.cont_cere_cod(
  p_business uuid,
  p_scop text,
  p_fel text,
  p_destinatie_bruta text,
  p_cod_hash text,
  p_cont uuid default null,
  p_minute integer default 10,
  p_ip text default null,
  p_provocare_hash text default null,
  p_parola_hash text default null
) returns table (ok boolean, motiv text, destinatie text)
language plpgsql security definer set search_path = '' as $$
declare
  v_dest text; v_vii integer; v_cate integer; v_buget integer; v_azi integer;
  v_cont uuid := p_cont;
  v_existent boolean := false;
begin
  /* ⚠⚠ Intrarea numai cu cod e INCHISA: cu parole, ar fi ocolit parola. */
  if p_scop is null or p_scop not in ('adaugare-contact', 'inregistrare', 'resetare-parola', 'doi-pasi') then
    return query select false, 'scop-inchis', null::text;
    return;
  end if;
  if p_scop = 'adaugare-contact' and p_cont is null then
    return query select false, 'alt-cont', null::text;
    return;
  end if;
  if p_scop <> 'adaugare-contact' and (p_provocare_hash is null or p_fel <> 'email') then
    return query select false, 'fara-provocare', null::text;
    return;
  end if;
  if p_scop = 'inregistrare' and (p_parola_hash is null or p_parola_hash not like 'scrypt$%') then
    return query select false, 'fara-parola', null::text;
    return;
  end if;

  v_dest := privat.cont_normalizeaza(p_fel, p_destinatie_bruta);
  /* ⚠ Aceeasi forma ca `cont_cod_destinatie_are_forma`: altfel insertul ar fi
     aruncat, iar ruta ar fi raspuns 500 in loc de un refuz. */
  if v_dest is null
     or (p_fel = 'email' and (v_dest !~ '^[^@[:space:],;<>"\\]+@[^@[:space:],;<>"\\]+\.[a-z]{2,}$' or length(v_dest) > 254))
     or (p_fel = 'telefon' and length(v_dest) < 9) then
    return query select false, 'contact-nevalid', null::text;
    return;
  end if;

  /*
    ⚠⚠ PLAFOANELE SE NUMARA SI CODUL SE SCRIE SUB ACEEASI INCUIETOARE, pe
    destinatie. Fara ea, cereri trimise deodata treceau toate de numaratoare
    inainte ca vreuna sa scrie.
  */
  perform pg_advisory_xact_lock(hashtextextended(p_business::text || ':' || p_fel || ':' || v_dest, 0));

  if exists (
    select 1 from privat.cont_contact_blocat x
     where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest
       and x.expira_la > now()
  ) then
    return query select false, 'blocat', v_dest;
    return;
  end if;

  /*
    ⚠ Resetarea: contul se cauta ACUM, dar lipsa lui nu iese inca; iese abia dupa
    plafoane, cu un rand-momeala, ca adresa fara cont sa arate din afara exact ca
    una cu cont (aceleasi plafoane, un cod „viu", aceleasi raspunsuri la verificare
    si la retrimitere).
    ⚠ Al doilea pas se trimite numai pe o adresa a CHIAR contului care a trecut
    de parola.
  */
  if p_scop = 'resetare-parola' then
    select k.cont_id into v_cont
      from privat.cont_contact k
      join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id
     where k.business_id = p_business and k.fel = p_fel and k.valoare = v_dest
       and c.sters_la is null;
  elsif p_scop = 'doi-pasi' then
    if p_cont is null or not exists (
      select 1 from privat.cont_contact k
        join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id
       where k.business_id = p_business and k.cont_id = p_cont
         and k.fel = p_fel and k.valoare = v_dest and c.sters_la is null
    ) then
      return query select false, 'alt-cont', v_dest;
      return;
    end if;
  elsif p_scop = 'inregistrare' then
    v_cont := null;
    v_existent := exists (
      select 1 from privat.cont_contact k
        join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id
       where k.business_id = p_business and k.fel = p_fel and k.valoare = v_dest and c.sters_la is null
    );
  end if;

  if p_ip is not null then
    select count(*) into v_cate
      from privat.cont_cod x
     where x.business_id = p_business and x.ip = p_ip
       and x.creat_la > now() - interval '1 hour';
    if v_cate >= 15 then
      return query select false, 'prea-multe-de-aici', v_dest;
      return;
    end if;
  end if;

  select count(*) into v_vii
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel and x.destinatie = v_dest
     and x.scop = p_scop and x.folosit_la is null and x.expira_la > now();
  if v_vii >= 3 then
    return query select false, 'are-cod-viu', v_dest;
    return;
  end if;

  /*
    ⚠⚠ Codurile pasului doi se numara SEPARAT de cele cerute de oricine (cont nou,
    resetare): altfel un strain care cere coduri pe adresa omului i-ar fi blocat
    intrarea, desi pasul doi se deschide numai cu parola lui.
  */
  select count(*) into v_cate
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel and x.destinatie = v_dest
     and ((x.scop = 'doi-pasi') = (p_scop = 'doi-pasi'))
     and x.creat_la > now() - interval '15 minutes';
  if v_cate >= 4 then
    return query select false, 'prea-multe', v_dest;
    return;
  end if;

  /* ⚠ Tot de aceea, plafonul zilnic al magazinului nu opreste pasul doi. */
  if p_scop <> 'doi-pasi' then
    /* ⚠ Garda de cifre: setarea se poate scrie direct din browser, iar un „abc" sau
       „300.5" ar fi aruncat aici 22P02 si ar fi oprit contul nou si resetarea. */
    select coalesce(case when (st.cont_client_config->>(case when p_fel = 'telefon' then 'buget_sms_zilnic' else 'buget_email_zilnic' end)) ~ '^[0-9]{1,5}$'
                         then (st.cont_client_config->>(case when p_fel = 'telefon' then 'buget_sms_zilnic' else 'buget_email_zilnic' end))::integer end,
                    case when p_fel = 'telefon' then 100 else 300 end)
      into v_buget
      from privat.store_settings st where st.business_id = p_business;

    select count(*) into v_azi
      from privat.cont_cod x
     where x.business_id = p_business and x.fel = p_fel
       and x.creat_la >= privat.cont_inceputul_zilei();
    if v_azi >= coalesce(v_buget, case when p_fel = 'telefon' then 100 else 300 end) then
      return query select false, 'buget-epuizat', v_dest;
      return;
    end if;
  end if;

  /* Resetare pe o adresa fara cont: un rand-momeala, cu un cod pe care nu-l poate
     potrivi nimic (nu e amprenta unui cod de sase cifre), si nimic nu pleaca. */
  if p_scop = 'resetare-parola' and v_cont is null then
    insert into privat.cont_cod (business_id, cont_id, scop, fel, destinatie, cod_hash, expira_la, ip, provocare_hash)
    values (p_business, null, p_scop, p_fel, v_dest, 'momeala:' || gen_random_uuid()::text,
            now() + make_interval(mins => greatest(1, least(60, p_minute))), p_ip, p_provocare_hash);
    return query select false, 'fara-cont', v_dest;
    return;
  end if;

  insert into privat.cont_cod (business_id, cont_id, scop, fel, destinatie, cod_hash, expira_la, ip, provocare_hash, parola_hash)
  values (p_business, v_cont, p_scop, p_fel, v_dest, p_cod_hash,
          now() + make_interval(mins => greatest(1, least(60, p_minute))), p_ip,
          p_provocare_hash, case when p_scop = 'inregistrare' then p_parola_hash end);

  /* Pentru textul emailului, nu pentru raspunsul rutei. */
  return query select true, case when v_existent then 'trimis-cont-existent' else 'trimis' end, v_dest;
end $$;

-- ═══ 3. Ultimul email confirmat, sub incuietoarea contului ═════════════════

create or replace function public.cont_sterge_contact(p_business uuid, p_cont uuid, p_fel text, p_valoare text)
returns table (ok boolean, motiv text)
language plpgsql security definer set search_path = '' as $$
declare v_dest text; v_ramase integer;
begin
  /* ⚠ Doua cereri deodata, pe doua adrese diferite, ar fi vazut fiecare „mai ramane
     una" si ar fi lasat contul fara nicio adresa. Randul contului se blocheaza intai. */
  perform 1 from privat.cont_cumparator c where c.id = p_cont and c.business_id = p_business for update;
  v_dest := privat.cont_normalizeaza(p_fel, p_valoare);
  if v_dest is null then
    return query select false, 'contact-nevalid';
    return;
  end if;

  /* ⚠ Intrarea, resetarea parolei si pasul doi merg NUMAI pe email: ultimul email
     confirmat nu se poate scoate, oricate telefoane ar mai avea contul. */
  select count(*) into v_ramase
    from privat.cont_contact x
   where x.business_id = p_business and x.cont_id = p_cont
     and x.fel = 'email' and x.verificat_la is not null
     and not (x.fel = p_fel and x.valoare = v_dest);

  if v_ramase = 0 then
    return query select false, 'ultimul-contact';
    return;
  end if;

  delete from privat.cont_contact x
   where x.business_id = p_business and x.cont_id = p_cont
     and x.fel = p_fel and x.valoare = v_dest;
  if not found then
    return query select false, 'negasit';
    return;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'contact-scos', jsonb_build_object('fel', p_fel));

  return query select true, 'sters';
end $$;

-- ═══ 5. Adresa noua in cont ════════════════════════════════════════════════

create or replace function public.cont_verifica_cod(
  p_business uuid,
  p_scop text,
  p_fel text,
  p_destinatie_bruta text,
  p_cod_hash text,
  p_cont uuid default null
) returns table (ok boolean, motiv text, cont_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_dest text; v_cod record; v_contact record; v_incercari integer;
begin
  if p_scop is distinct from 'adaugare-contact' or p_cont is null then
    return query select false, 'scop-inchis', null::uuid;
    return;
  end if;

  v_dest := privat.cont_normalizeaza(p_fel, p_destinatie_bruta);
  if v_dest is null then
    return query select false, 'contact-nevalid', null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business::text || ':' || p_fel || ':' || v_dest, 0));

  /* ⚠ Numai codurile cerute de CHIAR contul asta: o ghicire straina nu le mai arde. */
  select coalesce(sum(x.incercari), 0) into v_incercari
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest and x.cont_id = p_cont
     and x.folosit_la is null and x.expira_la > now();
  if v_incercari >= 5 then
    return query select false, 'prea-multe-incercari', null::uuid;
    return;
  end if;

  /* ⚠⚠ Si ZECE pe zi pe adresa, ca la celelalte coduri: altfel cererea si ghicirea
     reluate la nesfarsit ajungeau, in timp, la codul potrivit. Tot numai ale
     acestui cont: codul se potriveste doar cu contul care l-a cerut, deci ghicirile
     altui cont nu-l apropie de nimic, iar numarate aici l-ar fi tinut pe om afara
     o zi intreaga. */
  select coalesce(sum(x.incercari), 0) into v_incercari
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest and x.cont_id = p_cont
     and x.creat_la > now() - interval '24 hours';
  if v_incercari >= 10 then
    return query select false, 'prea-multe-incercari', null::uuid;
    return;
  end if;

  select * into v_cod
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest
     and x.folosit_la is null and x.expira_la > now()
     and x.cod_hash = p_cod_hash and x.cont_id = p_cont
   order by x.creat_la desc
   limit 1
   for update;

  if v_cod.id is null then
    update privat.cont_cod c
       set incercari = c.incercari + 1
     where c.id = (
       select x.id from privat.cont_cod x
        where x.business_id = p_business and x.scop = p_scop
          and x.fel = p_fel and x.destinatie = v_dest and x.cont_id = p_cont
          and x.folosit_la is null and x.expira_la > now()
        order by x.creat_la desc limit 1
     );
    if not found then
      return query select false, 'fara-cod', null::uuid;
      return;
    end if;
    return query select false, 'gresit', null::uuid;
    return;
  end if;

  update privat.cont_cod c
     set folosit_la = now()
   where c.business_id = p_business and c.scop = p_scop
     and c.fel = p_fel and c.destinatie = v_dest and c.folosit_la is null
     and c.cont_id = p_cont;

  /* ⚠⚠ Codul trebuie sa fi fost cerut de CHIAR contul asta. */
  if v_cod.cont_id is distinct from p_cont then
    return query select false, 'alt-cont', null::uuid;
    return;
  end if;

  select * into v_contact
    from privat.cont_contact x
   where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest;

  /* ⚠ Un contact care e deja al altcuiva NU se muta tacit. */
  if v_contact.id is not null and v_contact.cont_id <> p_cont then
    return query select false, 'contact-la-alt-cont', null::uuid;
    return;
  end if;

  if v_contact.id is null then
    insert into privat.cont_contact (cont_id, business_id, fel, valoare_bruta, valoare, verificat_la)
    values (p_cont, p_business, p_fel, p_destinatie_bruta, v_dest, now());
  else
    update privat.cont_contact set verificat_la = now(), valoare_bruta = p_destinatie_bruta
     where id = v_contact.id;
  end if;

  /*
    ⚠ Omul care a oprit emailurile din Preferinte vede tot „oprit" dupa ce adauga o
    adresa noua (preferinta se citeste peste TOATE adresele lui). Fara randul de mai
    jos, adresa noua ar fi primit totusi mesaje.
  */
  if p_fel = 'email' and exists (
    select 1 from public.recovery_optout o
      join privat.cont_contact k on lower(btrim(o.email)) = k.valoare
     where o.business_id = p_business and o.email is not null
       and k.business_id = p_business and k.cont_id = p_cont and k.fel = 'email'
       and k.verificat_la is not null and k.valoare <> v_dest
  ) and not exists (
    select 1 from public.recovery_optout o
     where o.business_id = p_business and lower(btrim(coalesce(o.email, ''))) = v_dest
  ) then
    insert into public.recovery_optout (business_id, email, motiv)
    values (p_business, v_dest, 'dezabonare');
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'contact-adaugat', jsonb_build_object('fel', p_fel));

  return query select true, 'adaugat', p_cont;
end $$;

-- ═══ 8. Stergerea scoate si adresele din lista de blocate ═══════════════════

create or replace function public.cont_sterge(p_business uuid, p_cont uuid)
returns table (ok boolean, comenzi_ramase bigint)
language plpgsql security definer set search_path = '' as $$
declare v_comenzi bigint;
begin
  select count(*) into v_comenzi
    from privat.cont_comanda l where l.business_id = p_business and l.cont_id = p_cont;

  /* ⚠ Codurile se sterg si dupa ADRESA, nu doar dupa cont: codurile de cont nou
     n-au cont (`cont_id` nul) si poarta emailul, IP-ul si amprenta parolei. */
  delete from privat.cont_cod c
   where c.business_id = p_business
     and (c.cont_id = p_cont or exists (
           select 1 from privat.cont_contact k
            where k.business_id = p_business and k.cont_id = p_cont
              and k.fel = c.fel and k.valoare = c.destinatie));
  /* Si blocajele temporare pe adresele contului: poarta adresa omului. */
  delete from privat.cont_contact_blocat b
   where b.business_id = p_business
     and exists (select 1 from privat.cont_contact k
                  where k.business_id = p_business and k.cont_id = p_cont
                    and k.fel = b.fel and k.valoare = b.valoare);
  delete from privat.cont_contact x where x.business_id = p_business and x.cont_id = p_cont;
  delete from privat.cont_comanda l where l.business_id = p_business and l.cont_id = p_cont;
  delete from privat.cont_dispozitiv d where d.business_id = p_business and d.cont_id = p_cont;
  /* ⚠ Sesiunile si jurnalul poarta IP-uri: se sterg acum, nu la curatenie. Ramane
     un singur rand, fara IP, care spune ce s-a intamplat. */
  delete from privat.cont_sesiune s where s.business_id = p_business and s.cont_id = p_cont;
  delete from privat.cont_instiintare i where i.business_id = p_business and i.cont_id = p_cont;
  delete from privat.cont_jurnal j where j.business_id = p_business and j.cont_id = p_cont;

  update privat.cont_cumparator c
     set sters_la = now(), nume = '', parola_hash = null, parola_schimbata_la = null,
         epoca_sesiunii = epoca_sesiunii + 1
   where c.id = p_cont and c.business_id = p_business;

  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'cont-sters');

  return query select true, v_comenzi;
end $$;

-- ═══ 9. Exportul: IP-urile incercarilor straine, ascunse ════════════════════

create or replace function public.cont_export(p_business uuid, p_cont uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cont', (select jsonb_build_object('nume', c.nume, 'creat_la', c.creat_la,
                                       'are_parola', c.parola_hash is not null,
                                       'parola_schimbata_la', c.parola_schimbata_la)
               from privat.cont_cumparator c where c.id = p_cont and c.business_id = p_business),
    'contacte', (select coalesce(jsonb_agg(jsonb_build_object(
        'fel', x.fel, 'valoare', x.valoare_bruta, 'verificat_la', x.verificat_la, 'creat_la', x.creat_la)), '[]'::jsonb)
      from privat.cont_contact x where x.business_id = p_business and x.cont_id = p_cont),
    'comenzi', (select coalesce(jsonb_agg(to_jsonb(d) order by d.creata_la desc), '[]'::jsonb)
      from privat.cont_comanda l
      cross join lateral public.cont_comanda_mea(p_business, p_cont, l.order_id) d
     where l.business_id = p_business and l.cont_id = p_cont),
    'retururi', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.cont_retururile_mele(p_business, p_cont) r),
    'preferinte', (select to_jsonb(p) from public.cont_preferinte(p_business, p_cont) p),
    'dispozitive_tinute_minte', (select coalesce(jsonb_agg(jsonb_build_object(
        'creat_la', d.creat_la, 'folosit_la', d.folosit_la, 'expira_la', d.expira_la) order by d.creat_la), '[]'::jsonb)
      from privat.cont_dispozitiv d where d.business_id = p_business and d.cont_id = p_cont),
    'jurnal', (select coalesce(jsonb_agg(jsonb_build_object(
        'fapta', j.fapta, 'detalii', j.detalii,
        'ip', case when j.fapta in ('parola-gresita', 'intrare-refuzata') then privat.cont_ip_ascuns(j.ip) else host(j.ip) end,
        'creat_la', j.creat_la) order by j.creat_la), '[]'::jsonb)
      from privat.cont_jurnal j where j.business_id = p_business and j.cont_id = p_cont)
  );
$$;

-- ═══ 10. Fisa din panou: numele nu vine din comenzile legate de mana ═══════

create or replace function public.cont_panou_fisa(p_business uuid, p_cont uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when c.id is null then null else jsonb_build_object(
    'cont', jsonb_build_object(
      'id', c.id,
      'nume', coalesce(
        nullif(btrim(c.nume), ''),
        (select nullif(btrim(o.customer_name), '')
           from privat.cont_comanda l join public.orders o on o.id = l.order_id
          where l.business_id = p_business and l.cont_id = c.id and l.temei <> 'legat-de-comerciant'
          order by o.created_at desc limit 1)),
      'creat_la', c.creat_la,
      'are_parola', c.parola_hash is not null,
      'parola_schimbata_la', c.parola_schimbata_la,
      'suspendat_la', c.suspendat_la,
      'motiv_suspendare', case when c.suspendat_la is null then null else (
        select j.detalii->>'motiv' from privat.cont_jurnal j
         where j.business_id = p_business and j.cont_id = c.id and j.fapta = 'suspendat-de-magazin'
         order by j.creat_la desc limit 1) end,
      'ultima_intrare', (select max(j.creat_la) from privat.cont_jurnal j
                          where j.business_id = p_business and j.cont_id = c.id and j.fapta = 'intrare')
    ),
    'contacte', (select coalesce(jsonb_agg(jsonb_build_object(
        'fel', k.fel, 'valoare', k.valoare_bruta, 'verificat_la', k.verificat_la, 'creat_la', k.creat_la)
        order by k.fel, k.verificat_la nulls last, k.creat_la), '[]'::jsonb)
      from privat.cont_contact k where k.business_id = p_business and k.cont_id = c.id),
    'comenzi', (select coalesce(jsonb_agg(x.rand order by x.cand desc), '[]'::jsonb) from (
        select o.created_at as cand, jsonb_build_object(
          'order_id', o.id, 'numar', o.order_number, 'creata_la', o.created_at, 'total', o.total,
          'stare', o.status, 'stare_plata', o.payment_status, 'nume_client', o.customer_name,
          'temei', l.temei, 'vedere', l.vedere, 'legata_la', l.revendicat_la) as rand
          from privat.cont_comanda l join public.orders o on o.id = l.order_id
         where l.business_id = p_business and l.cont_id = c.id
         order by o.created_at desc
         limit 200) x),
    'comenzi_total', (select count(*) from privat.cont_comanda l
                       where l.business_id = p_business and l.cont_id = c.id),
    'jurnal', (select coalesce(jsonb_agg(x.rand order by x.cand desc, x.id desc), '[]'::jsonb) from (
        select j.creat_la as cand, j.id, jsonb_build_object(
          'fapta', j.fapta, 'detalii', coalesce(j.detalii, '{}'::jsonb),
          'ip', privat.cont_ip_ascuns(j.ip), 'creat_la', j.creat_la) as rand
          from privat.cont_jurnal j
         where j.business_id = p_business and j.cont_id = c.id
         order by j.creat_la desc, j.id desc
         limit 100) x),
    'sesiuni_deschise', (select count(*) from privat.cont_sesiune s
       where s.business_id = p_business and s.cont_id = c.id and s.incheiata_la is null
         and s.epoca = c.epoca_sesiunii and s.expira_la > now() and s.inactiva_dupa > now()),
    'dispozitive', (select count(*) from privat.cont_dispozitiv d
       where d.business_id = p_business and d.cont_id = c.id and d.expira_la > now()),
    'parole_gresite_24h', (select count(*) from privat.cont_jurnal j
       where j.business_id = p_business and j.cont_id = c.id and j.fapta = 'parola-gresita'
         and j.creat_la > now() - interval '24 hours'),
    'preferinte', (select to_jsonb(p) from public.cont_preferinte(p_business, c.id) p)
  ) end
  from (select 1) unu
  left join privat.cont_cumparator c
    on c.id = p_cont and c.business_id = p_business and c.sters_la is null;
$$;

-- ═══ Drepturile ═══════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_anuleaza_comanda(uuid, uuid, uuid)',
    'public.cont_maturare(uuid, uuid)',
    'public.cont_sesiune_verifica(uuid, text)',
    'public.cont_incercare_parola(uuid, uuid, text)',
    'public.cont_incercare_reusita(uuid, bigint)',
    'public.cont_panou_lista(uuid, text, text, text, integer, integer)',
    'public.cont_panou_comanda_de_legat(uuid, uuid, text)',
    'public.cont_panou_chei(uuid, text[])',
    'public.cont_cere_cod(uuid, text, text, text, text, uuid, integer, text, text, text)',
    'public.cont_sterge_contact(uuid, uuid, text, text)',
    'public.cont_verifica_cod(uuid, text, text, text, text, uuid)',
    'public.cont_sterge(uuid, uuid)',
    'public.cont_export(uuid, uuid)',
    'public.cont_panou_fisa(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon/authenticated pot chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
