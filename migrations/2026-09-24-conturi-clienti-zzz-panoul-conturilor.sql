-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 16: PANOUL CONTURILOR, la comerciant (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Numele are `zzz-` ca sa vina, ordonat dupa nume, DUPA 50, 51 si 52 din
-- aceeasi zi: redefineste `cont_verifica_provocare` (din 50).
--
-- Cerut de proprietar: „si comerciantul poate vedea toate conturile create in
-- magazinul lui si detalii despre fiecare cont in parte?". Pana azi vedea numai
-- CATE sunt, intr-o fraza din Setari. Acum:
--
--  1. o lista a conturilor (cautare, filtre, ordine, paginare), in Clienti;
--  2. fisa unui cont: contacte, comenzi legate, securitate, preferinte, istoric;
--  3. actiuni: iesirea de pe toate dispozitivele, SUSPENDAREA si reactivarea,
--     stergerea la cererea omului, legarea si dezlegarea unei comenzi de mana;
--  4. legatura dintre un client din lista si contul lui (eticheta si filtrul).
--
-- ⚠⚠ NIMIC DIN CE E SECRET NU IESE CATRE PANOU: nici amprenta parolei, nici
-- jetoanele sesiunilor sau ale dispozitivelor, nici codurile. Iar IP-urile din
-- istoric ies ASCUNSE pe jumatate (`86.124.x.x`): comerciantului ii ajung ca sa
-- vada de unde s-a intrat, iar restul nu-i trebuie.
--
-- ⚠⚠ Toate functiile de panou sunt numai pentru `service_role`. Proprietarul
-- magazinului se verifica in actiunile de server (`conturi-panou.actions.ts`)
-- inainte de orice apel; fiecare functie cere si magazinul, si contul, deci un
-- cont al altui magazin nu se gaseste.

-- ═══ 1. Suspendarea: o coloana ═══════════════════════════════════════════════
--
-- ⚠ „Suspendat”, nu „blocat”: `blocat_ip`/`blocat_cont` sunt deja plafoanele
-- temporare de dupa parolele gresite. Suspendarea o pune comerciantul si tine
-- pana o scoate tot el.
--
-- ⚠⚠ INVARIANTUL: suspendarea RIDICA EPOCA. Deci orice sesiune deschisa inainte
-- moare la urmatoarea verificare, fara sa se atinga `cont_sesiune_verifica` (care
-- ruleaza la fiecare pagina de cont). Singura usa prin care s-ar putea deschide
-- o sesiune NOUA e `cont_sesiune_creeaza`, si ea refuza de acum contul suspendat.
-- Motivul scris de comerciant NU sta pe rand: sta in jurnal, care se sterge odata
-- cu contul si la anonimizare.

alter table privat.cont_cumparator add column if not exists suspendat_la timestamptz;

-- ═══ 2. IP-ul, ascuns pe jumatate ══════════════════════════════════════════

create or replace function privat.cont_ip_ascuns(p inet)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null then null
    when family(p) = 4 then
      split_part(host(p), '.', 1) || '.' || split_part(host(p), '.', 2) || '.x.x'
    else
      host(network(set_masklen(p, 32))) || 'x'
  end;
$$;

-- ═══ 3. Intrarea pe un cont suspendat ══════════════════════════════════════
--
-- Se cheama DUPA ce parola s-a dovedit buna: abia atunci omul e chiar el, deci
-- i se poate spune adevarul. Inainte, raspunsul ar fi spus cuiva cu parola
-- gresita ca adresa are cont.

create or replace function public.cont_verifica_suspendarea(
  p_business uuid,
  p_cont uuid,
  p_ip text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from privat.cont_cumparator c
     where c.id = p_cont and c.business_id = p_business
       and c.sters_la is null and c.suspendat_la is not null
  ) then
    return false;
  end if;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
  values (p_business, p_cont, 'intrare-refuzata', jsonb_build_object('motiv', 'suspendat', 'prin', 'parola'),
          privat.cont_ip_sigur(p_ip));
  return true;
end $$;

-- ═══ 4. Singura usa a sesiunilor noi ═══════════════════════════════════════
--
-- Identica cu cea din migratia 3, plus `suspendat_la is null`.

create or replace function public.cont_sesiune_creeaza(
  p_business uuid,
  p_cont uuid,
  p_jeton_hash text,
  p_ip inet default null
) returns table (sesiune_id uuid, expira_la timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_epoca integer;
begin
  select * into r from privat.cont_reguli_sesiune();
  select c.epoca_sesiunii into v_epoca
    from privat.cont_cumparator c
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null
     /* ⚠⚠ Un cont suspendat nu primeste sesiune, pe niciun drum. */
     and c.suspendat_la is null;
  if v_epoca is null then
    return;
  end if;
  return query
  insert into privat.cont_sesiune (cont_id, business_id, jeton_hash, epoca, inactiva_dupa, expira_la, ip)
  values (p_cont, p_business, p_jeton_hash, v_epoca, now() + r.inactivitate, now() + r.viata_absoluta, p_ip)
  returning privat.cont_sesiune.id, privat.cont_sesiune.expira_la;
end $$;

-- ═══ 5. Codul pasului al doilea, al contului nou si al resetarii ════════════
--
-- Identica cu cea din migratia 13 (`...-parola.sql`), plus trei opriri: pe un
-- cont suspendat, codul (care dovedeste ca adresa e a omului) nu mai deschide
-- nimic si nu mai schimba parola; raspunsul e `suspendat`, iar ecranul spune
-- omului sa scrie magazinului.

create or replace function public.cont_verifica_provocare(
  p_business uuid,
  p_provocare_hash text,
  p_cod_hash text,
  p_parola_hash text default null,
  p_ip text default null
) returns table (ok boolean, motiv text, cont_id uuid, scop text, cont_nou boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_meta record;
  v_incercari integer;
  v_zi integer;
  v_cod record;
  v_contact_id uuid;
  v_contact_cont uuid;
  v_cont uuid;
  v_ip inet := privat.cont_ip_sigur(p_ip);
begin
  if p_provocare_hash is null or p_cod_hash is null then
    return query select false, 'fara-cod', null::uuid, null::text, false;
    return;
  end if;

  select x.fel, x.destinatie, x.scop into v_meta
    from privat.cont_cod x
   where x.business_id = p_business and x.provocare_hash = p_provocare_hash
   order by x.creat_la desc
   limit 1;
  if v_meta.destinatie is null then
    return query select false, 'fara-cod', null::uuid, null::text, false;
    return;
  end if;

  /* ⚠⚠ Numaratoarea si scrierea sub ACEEASI incuietoare ca cererea codului: ghicirile
     trimise deodata nu mai trec toate de plafon inainte ca vreuna sa-l ridice. */
  perform pg_advisory_xact_lock(hashtextextended(p_business::text || ':' || v_meta.fel || ':' || v_meta.destinatie, 0));

  /* Cinci incercari pe provocare, adunate peste toate codurile ei vii. */
  select coalesce(sum(x.incercari), 0) into v_incercari
    from privat.cont_cod x
   where x.business_id = p_business and x.provocare_hash = p_provocare_hash
     and x.folosit_la is null and x.expira_la > now();
  if v_incercari >= 5 then
    return query select false, 'prea-multe-incercari', null::uuid, null::text, false;
    return;
  end if;

  /*
    ⚠⚠ Si ZECE pe zi pe adresa, peste toate provocarile ei: altfel fiecare cont nou
    sau resetare cerute din nou aduceau cinci incercari proaspete, adica zeci de
    ghiciri pe ora pentru un cod care, la o adresa cu cont, schimba parola.
    Pasul doi se numara separat: el se deschide numai cu parola.
  */
  select coalesce(sum(x.incercari), 0) into v_zi
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = v_meta.fel and x.destinatie = v_meta.destinatie
     and ((x.scop = 'doi-pasi') = (v_meta.scop = 'doi-pasi'))
     and x.creat_la > now() - interval '24 hours';
  if v_zi >= 10 then
    return query select false, 'prea-multe-incercari', null::uuid, null::text, false;
    return;
  end if;

  select * into v_cod
    from privat.cont_cod x
   where x.business_id = p_business and x.provocare_hash = p_provocare_hash
     and x.folosit_la is null and x.expira_la > now()
     and x.cod_hash = p_cod_hash
   order by x.creat_la desc
   limit 1
   for update;

  if v_cod.id is null then
    update privat.cont_cod c
       set incercari = c.incercari + 1
     where c.id = (
       select x.id from privat.cont_cod x
        where x.business_id = p_business and x.provocare_hash = p_provocare_hash
          and x.folosit_la is null and x.expira_la > now()
        order by x.creat_la desc limit 1
     );
    if not found then
      return query select false, 'fara-cod', null::uuid, null::text, false;
      return;
    end if;
    return query select false, 'gresit', null::uuid, null::text, false;
    return;
  end if;

  /* ⚠ Parola noua lipsa la resetare: codul NU se consuma, omul o poate trimite. */
  if v_cod.scop = 'resetare-parola' and (p_parola_hash is null or p_parola_hash not like 'scrypt$%') then
    return query select false, 'fara-parola', null::uuid, v_cod.scop, false;
    return;
  end if;

  update privat.cont_cod c
     set folosit_la = now()
   where c.business_id = p_business and c.provocare_hash = p_provocare_hash
     and c.folosit_la is null;

  -- ── al doilea pas al intrarii ──
  if v_cod.scop = 'doi-pasi' then
    select c.id into v_cont
      from privat.cont_cumparator c
     where c.id = v_cod.cont_id and c.business_id = p_business and c.sters_la is null
       /* ⚠ O parola schimbata DUPA ce a inceput provocarea o inchide. */
       and (c.parola_schimbata_la is null or c.parola_schimbata_la <= (
             select min(x.creat_la) from privat.cont_cod x
              where x.business_id = p_business and x.provocare_hash = p_provocare_hash));
    if v_cont is null then
      return query select false, 'fara-cod', null::uuid, v_cod.scop, false;
      return;
    end if;
    /* ⚠⚠ Contul suspendat de magazin: codul dovedeste adresa, dar nu deschide nimic. */
    if exists (select 1 from privat.cont_cumparator c
                where c.id = v_cont and c.business_id = p_business and c.suspendat_la is not null) then
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
      values (p_business, v_cont, 'intrare-refuzata', jsonb_build_object('motiv', 'suspendat', 'prin', 'doi-pasi'), v_ip);
      return query select false, 'suspendat', null::uuid, v_cod.scop, false;
      return;
    end if;
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'intrare', jsonb_build_object('fel', 'email', 'prin', 'parola-si-cod'), v_ip);
    return query select true, 'intrat', v_cont, v_cod.scop, false;
    return;
  end if;

  select x.id, x.cont_id into v_contact_id, v_contact_cont
    from privat.cont_contact x
   where x.business_id = p_business and x.fel = v_cod.fel and x.valoare = v_cod.destinatie;

  /*
    ⚠ UN CONT STERS NU SE REINVIE: contactul se desprinde de el, iar omul primeste
    un cont nou, curat. Aceeasi regula ca la intrarea veche.
  */
  if v_contact_id is not null and exists (
    select 1 from privat.cont_cumparator c where c.id = v_contact_cont and c.sters_la is not null
  ) then
    delete from privat.cont_contact where id = v_contact_id;
    v_contact_id := null;
    v_contact_cont := null;
  end if;

  -- ── crearea contului ──
  if v_cod.scop = 'inregistrare' then
    if v_contact_id is not null then
      /*
        ⚠ Adresa are deja un cont viu. Codul dovedeste ca e a lui, deci parola
        aleasa acum devine parola contului: e o resetare, cu tot ce cere una
        (sesiunile vechi, dispozitivele de incredere si codurile inca vii cad).
      */
      v_cont := v_contact_cont;
      /* ⚠⚠ Contul suspendat de magazin: codul dovedeste adresa, dar nu deschide nimic. */
      if exists (select 1 from privat.cont_cumparator c
                  where c.id = v_cont and c.business_id = p_business and c.suspendat_la is not null) then
        insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
        values (p_business, v_cont, 'intrare-refuzata', jsonb_build_object('motiv', 'suspendat', 'prin', 'inregistrare'), v_ip);
        return query select false, 'suspendat', null::uuid, v_cod.scop, false;
        return;
      end if;
      update privat.cont_cumparator c
         set parola_hash = v_cod.parola_hash, parola_schimbata_la = now(),
             epoca_sesiunii = c.epoca_sesiunii + 1
       where c.id = v_cont and c.business_id = p_business;
      delete from privat.cont_dispozitiv d where d.cont_id = v_cont and d.business_id = p_business;
      update privat.cont_cod c
         set folosit_la = now()
       where c.business_id = p_business and c.folosit_la is null
         and (c.cont_id = v_cont or exists (
               select 1 from privat.cont_contact k
                where k.business_id = p_business and k.cont_id = v_cont
                  and k.fel = c.fel and k.valoare = c.destinatie));
      update privat.cont_contact set verificat_la = coalesce(verificat_la, now()) where id = v_contact_id;
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
      values (p_business, v_cont, 'parola-setata', jsonb_build_object('prin', 'inregistrare'), v_ip);
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
      values (p_business, v_cont, 'intrare', jsonb_build_object('fel', 'email', 'prin', 'inregistrare'), v_ip);
      return query select true, 'intrat', v_cont, v_cod.scop, false;
      return;
    end if;

    insert into privat.cont_cumparator (business_id, parola_hash, parola_schimbata_la)
    values (p_business, v_cod.parola_hash, now())
    returning id into v_cont;
    insert into privat.cont_contact (cont_id, business_id, fel, valoare_bruta, valoare, verificat_la)
    values (v_cont, p_business, v_cod.fel, v_cod.destinatie, v_cod.destinatie, now());
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'cont-creat', jsonb_build_object('fel', v_cod.fel), v_ip);
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'intrare', jsonb_build_object('fel', 'email', 'prin', 'inregistrare'), v_ip);
    return query select true, 'intrat', v_cont, v_cod.scop, true;
    return;
  end if;

  -- ── resetarea parolei ──
  if v_cod.scop = 'resetare-parola' then
    v_cont := v_cod.cont_id;
    if v_cont is null or v_contact_cont is distinct from v_cont or not exists (
      select 1 from privat.cont_cumparator c
       where c.id = v_cont and c.business_id = p_business and c.sters_la is null
    ) then
      return query select false, 'fara-cont', null::uuid, v_cod.scop, false;
      return;
    end if;
    /* ⚠⚠ Contul suspendat de magazin: codul dovedeste adresa, dar nu deschide nimic. */
    if exists (select 1 from privat.cont_cumparator c
                where c.id = v_cont and c.business_id = p_business and c.suspendat_la is not null) then
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
      values (p_business, v_cont, 'intrare-refuzata', jsonb_build_object('motiv', 'suspendat', 'prin', 'resetare'), v_ip);
      return query select false, 'suspendat', null::uuid, v_cod.scop, false;
      return;
    end if;
    update privat.cont_cumparator c
       set parola_hash = p_parola_hash, parola_schimbata_la = now(),
           epoca_sesiunii = c.epoca_sesiunii + 1
     where c.id = v_cont and c.business_id = p_business;
    delete from privat.cont_dispozitiv d where d.cont_id = v_cont and d.business_id = p_business;
    update privat.cont_cod c
       set folosit_la = now()
     where c.business_id = p_business and c.folosit_la is null
       and (c.cont_id = v_cont or exists (
             select 1 from privat.cont_contact k
              where k.business_id = p_business and k.cont_id = v_cont
                and k.fel = c.fel and k.valoare = c.destinatie));
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'parola-resetata', '{}'::jsonb, v_ip);
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'intrare', jsonb_build_object('fel', 'email', 'prin', 'resetare'), v_ip);
    return query select true, 'intrat', v_cont, v_cod.scop, false;
    return;
  end if;

  return query select false, 'scop-gresit', null::uuid, v_cod.scop, false;
end $$;

-- ═══ 6. Lista conturilor ═══════════════════════════════════════════════════
--
-- ⚠ Numele nu se cere la cont nou (omul da numai emailul si parola), deci
-- `nume` e gol la aproape toti. Pe ecran iese numele de pe ultima comanda legata;
-- fara comenzi, nimic (ecranul scrie atunci emailul).
-- ⚠ Cautarea merge pe nume, pe orice contact (email sau telefon), pe telefonul
-- comenzilor legate si pe numarul lor: comerciantul cauta cum il stie pe om.
-- ⚠ `%` si `_` din cautare se scapa AICI, nu la apelant: altfel „ana_” ar fi
-- gasit si „anaX”.

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
      c.id,
      coalesce(
        nullif(btrim(c.nume), ''),
        (select nullif(btrim(o.customer_name), '')
           from privat.cont_comanda l join public.orders o on o.id = l.order_id
          where l.business_id = p_business and l.cont_id = c.id
          order by o.created_at desc limit 1)
      ) as nume,
      (select k.valoare_bruta from privat.cont_contact k
        where k.business_id = p_business and k.cont_id = c.id and k.fel = 'email'
        order by k.verificat_la nulls last, k.creat_la limit 1) as email,
      exists (select 1 from privat.cont_contact k
               where k.business_id = p_business and k.cont_id = c.id and k.fel = 'email'
                 and k.verificat_la is not null) as email_confirmat,
      coalesce(
        (select k.valoare_bruta from privat.cont_contact k
          where k.business_id = p_business and k.cont_id = c.id and k.fel = 'telefon'
          order by k.verificat_la nulls last, k.creat_la limit 1),
        (select nullif(btrim(o.customer_phone), '')
           from privat.cont_comanda l join public.orders o on o.id = l.order_id
          where l.business_id = p_business and l.cont_id = c.id
          order by o.created_at desc limit 1)
      ) as telefon,
      c.creat_la,
      (select max(j.creat_la) from privat.cont_jurnal j
        where j.business_id = p_business and j.cont_id = c.id and j.fapta = 'intrare') as ultima_intrare,
      (select count(*) from privat.cont_comanda l
        where l.business_id = p_business and l.cont_id = c.id) as comenzi,
      c.parola_hash is not null as are_parola,
      c.suspendat_la
    from privat.cont_cumparator c
   where c.business_id = p_business and c.sters_la is null
  ),
  filtrate as (
    select b.*
      from baza b, cautare q
     where (q.tipar is null
            or lower(coalesce(b.nume, '')) like q.tipar escape '\'
            or exists (select 1 from privat.cont_contact k
                        where k.business_id = p_business and k.cont_id = b.id
                          and (k.valoare like q.tipar escape '\'
                               or (q.tipar_tel is not null and k.fel = 'telefon' and k.valoare like q.tipar_tel)))
            or exists (select 1 from privat.cont_comanda l join public.orders o on o.id = l.order_id
                        where l.business_id = p_business and l.cont_id = b.id
                          and (lower(o.order_number) like q.tipar escape '\'
                               or (q.tipar_tel is not null
                                   and public.normalize_phone(o.customer_phone) like q.tipar_tel))))
       and case coalesce(p_stare, 'toate')
             when 'active' then b.suspendat_la is null
             when 'suspendate' then b.suspendat_la is not null
             when 'fara-comenzi' then b.comenzi = 0
             else true
           end
  )
  select f.id, f.nume, f.email, f.email_confirmat, f.telefon, f.creat_la, f.ultima_intrare, f.comenzi,
         f.are_parola, f.suspendat_la,
         coalesce((select p.primeste_email from public.cont_preferinte(p_business, f.id) p), true),
         count(*) over ()
    from filtrate f
   order by
     case when p_ordine = 'activi' then f.ultima_intrare end desc nulls last,
     case when p_ordine = 'comenzi' then f.comenzi end desc nulls last,
     f.creat_la desc,
     f.id
   limit greatest(1, least(100, coalesce(p_limita, 50)))
  offset greatest(0, least(2000000, coalesce(p_decalaj, 0)));
$$;

-- ═══ 7. Cifrele de sus ═════════════════════════════════════════════════════

create or replace function public.cont_panou_sumar(p_business uuid)
returns table (conturi bigint, activi_30_zile bigint, cu_comenzi bigint, suspendate bigint)
language sql stable security definer set search_path = '' as $$
  select
    count(*),
    count(*) filter (where exists (
      select 1 from privat.cont_jurnal j
       where j.business_id = p_business and j.cont_id = c.id and j.fapta = 'intrare'
         and j.creat_la > now() - interval '30 days')),
    count(*) filter (where exists (
      select 1 from privat.cont_comanda l where l.business_id = p_business and l.cont_id = c.id)),
    count(*) filter (where c.suspendat_la is not null)
  from privat.cont_cumparator c
  where c.business_id = p_business and c.sters_la is null;
$$;

-- ═══ 8. Fisa unui cont ═════════════════════════════════════════════════════
--
-- ⚠⚠ Fiecare camp se scrie de mana, niciodata `to_jsonb` pe un rand din
-- `privat`: `cont_cumparator` poarta amprenta parolei, `cont_sesiune` si
-- `cont_dispozitiv` poarta jetoane. Din sesiuni si dispozitive ies numai NUMERE.
-- ⚠ Comenzile: cel mult 200, cu numarul total alaturi (ecranul spune cate lipsesc).
-- ⚠ Istoricul: ultimele 100 de fapte, cu IP-ul ascuns.

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
          where l.business_id = p_business and l.cont_id = c.id
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

-- ═══ 9. Actiunile comerciantului ═══════════════════════════════════════════
--
-- ⚠ Fiecare lasa un rand in jurnal, cu `de: magazin`, ca omul (in exportul lui)
-- si comerciantul (in fisa) sa vada cine a facut ce.

create or replace function public.cont_panou_suspenda(p_business uuid, p_cont uuid, p_motiv text default null)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from privat.cont_cumparator c
                  where c.id = p_cont and c.business_id = p_business and c.sters_la is null) then
    return 'negasit';
  end if;
  /* ⚠⚠ Epoca urca: toate sesiunile deschise cad la urmatoarea verificare. */
  update privat.cont_cumparator c
     set suspendat_la = now(), epoca_sesiunii = c.epoca_sesiunii + 1
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null and c.suspendat_la is null;
  if not found then
    return 'deja-suspendat';
  end if;
  delete from privat.cont_dispozitiv d where d.cont_id = p_cont and d.business_id = p_business;
  /* Si codurile inca vii: un pas doi inceput inainte nu mai are voie sa se incheie. */
  update privat.cont_cod x
     set folosit_la = now()
   where x.business_id = p_business and x.folosit_la is null
     and (x.cont_id = p_cont or exists (
           select 1 from privat.cont_contact k
            where k.business_id = p_business and k.cont_id = p_cont
              and k.fel = x.fel and k.valoare = x.destinatie));
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'suspendat-de-magazin',
          jsonb_strip_nulls(jsonb_build_object('de', 'magazin',
            'motiv', nullif(left(btrim(coalesce(p_motiv, '')), 200), ''))));
  return 'suspendat';
end $$;

create or replace function public.cont_panou_reactiveaza(p_business uuid, p_cont uuid)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from privat.cont_cumparator c
                  where c.id = p_cont and c.business_id = p_business and c.sters_la is null) then
    return 'negasit';
  end if;
  /* ⚠ Epoca NU coboara: sesiunile de dinainte raman moarte, omul intra din nou. */
  update privat.cont_cumparator c
     set suspendat_la = null
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null and c.suspendat_la is not null;
  if not found then
    return 'nu-era-suspendat';
  end if;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'reactivat-de-magazin', jsonb_build_object('de', 'magazin'));
  return 'reactivat';
end $$;

create or replace function public.cont_panou_iesire(p_business uuid, p_cont uuid)
returns table (ok boolean, sesiuni bigint)
language plpgsql security definer set search_path = '' as $$
declare v_epoca integer; v_cate bigint;
begin
  select c.epoca_sesiunii into v_epoca
    from privat.cont_cumparator c
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null
   for update;
  if v_epoca is null then
    return query select false, 0::bigint;
    return;
  end if;
  select count(*) into v_cate
    from privat.cont_sesiune s
   where s.business_id = p_business and s.cont_id = p_cont and s.incheiata_la is null
     and s.epoca = v_epoca and s.expira_la > now() and s.inactiva_dupa > now();
  update privat.cont_cumparator c set epoca_sesiunii = c.epoca_sesiunii + 1
   where c.id = p_cont and c.business_id = p_business;
  delete from privat.cont_dispozitiv d where d.cont_id = p_cont and d.business_id = p_business;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'iesire-de-peste-tot', jsonb_build_object('de', 'magazin'));
  return query select true, v_cate;
end $$;

create or replace function public.cont_panou_sterge(p_business uuid, p_cont uuid)
returns table (ok boolean, comenzi_ramase bigint)
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not exists (select 1 from privat.cont_cumparator c
                  where c.id = p_cont and c.business_id = p_business and c.sters_la is null) then
    return query select false, 0::bigint;
    return;
  end if;
  /* ⚠ Aceeasi stergere ca atunci cand o cere omul din contul lui: un singur drum. */
  select * into r from public.cont_sterge(p_business, p_cont);
  update privat.cont_jurnal j
     set detalii = jsonb_build_object('de', 'magazin')
   where j.business_id = p_business and j.cont_id = p_cont and j.fapta = 'cont-sters';
  return query select r.ok, r.comenzi_ramase;
end $$;

-- ═══ 10. O comanda legata de mana ═════════════════════════════════════════
--
-- ⚠⚠ Intai se ARATA comanda gasita (cine a comandat, pe ce adresa si ce telefon),
-- si abia apoi se leaga: un numar tastat gresit ar fi pus adresa si factura altui
-- om in contul asta. `se_potriveste` spune daca emailul sau telefonul comenzii e
-- chiar al contului.
-- ⚠ Comenzile de marketplace NU se leaga, ca la legarea automata.
-- ⚠ Vederea e INTREAGA: comerciantul raspunde de legatura pe care o face.

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
  with n as (select nullif(ltrim(btrim(coalesce(p_numar, '')), '#'), '') as v)
  select o.id, o.order_number, o.created_at, o.total, o.status,
         o.customer_name, o.customer_email, o.customer_phone,
         coalesce(o.order_source ? 'marketplace', false),
         (select l.cont_id from privat.cont_comanda l where l.order_id = o.id),
         exists (select 1 from privat.cont_contact k
                  where k.business_id = p_business and k.cont_id = p_cont
                    and ((k.fel = 'email' and k.valoare = lower(btrim(coalesce(o.customer_email, ''))))
                      or (k.fel = 'telefon' and k.valoare = public.normalize_phone(o.customer_phone))))
    from public.orders o, n
   where n.v is not null and o.business_id = p_business
     and o.order_number in (n.v, '#' || n.v)
   order by o.created_at desc
   limit 1;
$$;

create or replace function public.cont_panou_leaga_comanda(p_business uuid, p_cont uuid, p_order uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_o record; v_are uuid;
begin
  if not exists (select 1 from privat.cont_cumparator c
                  where c.id = p_cont and c.business_id = p_business and c.sters_la is null) then
    return 'cont-negasit';
  end if;
  select o.id, o.order_number, coalesce(o.order_source ? 'marketplace', false) as mk into v_o
    from public.orders o where o.id = p_order and o.business_id = p_business;
  if v_o.id is null then
    return 'negasita';
  end if;
  if v_o.mk then
    return 'marketplace';
  end if;
  select l.cont_id into v_are from privat.cont_comanda l where l.order_id = p_order;
  if v_are = p_cont then
    return 'deja-legata';
  end if;
  if v_are is not null then
    return 'legata-de-alt-cont';
  end if;
  insert into privat.cont_comanda (order_id, business_id, cont_id, temei, vedere)
  values (p_order, p_business, p_cont, 'legat-de-comerciant', 'intreaga')
  on conflict (order_id) do nothing;
  if not found then
    return 'legata-de-alt-cont';
  end if;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'comanda-legata-de-magazin', jsonb_build_object('de', 'magazin', 'numar', v_o.order_number));
  return 'legata';
end $$;

-- ⚠ Se dezleaga NUMAI ce a legat comerciantul. O comanda venita pe adresa
-- confirmata a omului s-ar fi legat la loc la urmatoarea intrare, iar una plasata
-- din cont e a lui fara discutie.

create or replace function public.cont_panou_dezleaga_comanda(p_business uuid, p_cont uuid, p_order uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_numar text;
begin
  delete from privat.cont_comanda l
   where l.order_id = p_order and l.business_id = p_business and l.cont_id = p_cont
     and l.temei = 'legat-de-comerciant';
  if not found then
    if exists (select 1 from privat.cont_comanda l
                where l.order_id = p_order and l.business_id = p_business and l.cont_id = p_cont) then
      return 'nu-e-legata-de-magazin';
    end if;
    return 'negasita';
  end if;
  select o.order_number into v_numar from public.orders o where o.id = p_order;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'comanda-dezlegata-de-magazin', jsonb_build_object('de', 'magazin', 'numar', v_numar));
  return 'dezlegata';
end $$;

-- ═══ 11. Clientul din lista si contul lui ════════════════════════════════
--
-- ⚠⚠ CHEIA SE SCRIE CU ACELEASI FUNCTII CA LISTA DE CLIENTI
-- (`order_customer_key`, `discount_customer_key`), nu cu o copie: altfel
-- eticheta „Are cont” si grupa din lista s-ar fi putut desparti fara zgomot.
-- Doua izvoare: comenzile legate de cont (cheia fiecarei comenzi) si contactele
-- CONFIRMATE ale contului. La o cheie cu doua conturi, castiga cel legat prin
-- comenzi, apoi cel mai recent.
-- ⚠⚠ Comenzile legate DE MANA (`legat-de-comerciant`) nu dau eticheta: pot fi ale
-- altui om (comanda facuta de sotie, legata in contul sotului), iar clientul acela
-- ar fi aparut „cu cont", cu o legatura spre contul altcuiva.
-- `p_chei` nul = toate cheile (pentru filtrul „cu cont”).

create or replace function public.cont_panou_chei(p_business uuid, p_chei text[] default null)
returns table (cheie text, cont_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct on (u.cheie) u.cheie, u.cont_id
    from (
      select public.order_customer_key(o.customer_phone, o.customer_email, o.id) as cheie,
             l.cont_id, 1 as rang, l.revendicat_la as cand
        from privat.cont_comanda l
        join public.orders o on o.id = l.order_id
        join privat.cont_cumparator c on c.id = l.cont_id and c.business_id = l.business_id and c.sters_la is null
       where l.business_id = p_business and l.temei <> 'legat-de-comerciant'
         /* ⚠ Si numai cand emailul sau telefonul comenzii e al contului: o comanda
            plasata din cont ca un cadou, pe datele destinatarului, nu-i da lui eticheta. */
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
   where u.cheie is not null and (p_chei is null or u.cheie = any(p_chei))
   order by u.cheie, u.rang, u.cand desc nulls last;
$$;

-- ═══ Drepturile ═══════════════════════════════════════════════════════════

revoke all on function privat.cont_ip_ascuns(inet) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_verifica_suspendarea(uuid, uuid, text)',
    'public.cont_sesiune_creeaza(uuid, uuid, text, inet)',
    'public.cont_verifica_provocare(uuid, text, text, text, text)',
    'public.cont_panou_lista(uuid, text, text, text, integer, integer)',
    'public.cont_panou_sumar(uuid)',
    'public.cont_panou_fisa(uuid, uuid)',
    'public.cont_panou_suspenda(uuid, uuid, text)',
    'public.cont_panou_reactiveaza(uuid, uuid)',
    'public.cont_panou_iesire(uuid, uuid)',
    'public.cont_panou_sterge(uuid, uuid)',
    'public.cont_panou_comanda_de_legat(uuid, uuid, text)',
    'public.cont_panou_leaga_comanda(uuid, uuid, uuid)',
    'public.cont_panou_dezleaga_comanda(uuid, uuid, uuid)',
    'public.cont_panou_chei(uuid, text[])'
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
