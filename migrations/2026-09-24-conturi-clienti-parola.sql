-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 13: email si parola, codul pe email la crearea
-- contului, la resetare si la intrarea de pe un dispozitiv nou    (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar pe 24.09.2026: „Vreau ca utilizatorul sa se conecteze cu
-- Email si Parola iar un utilizator care isi face cont la magazinul unui
-- comerciant sa trebuiasca sa isi verifice contul cu 2FA prin eMail."
--
-- Ce se schimba:
--  1. Contul capata PAROLA. In baza ajunge numai amprenta scrypt, calculata in
--     Node (`src/lib/cont/parola.ts`); o constrangere refuza orice alta forma,
--     deci o parola in clar nu poate ajunge intr-o coloana nici din greseala.
--  2. Codul de pe email devine AL DOILEA PAS, legat de browserul care l-a cerut:
--     fiecare cod are o `provocare` (amprenta unui jeton aleator tinut intr-un
--     cookie `httpOnly`). Un cod furat din email nu deschide nimic fara cookie-ul
--     browserului care a trecut de primul pas.
--       - `inregistrare`: contul se creeaza abia dupa cod (emailul e dovedit);
--       - `resetare-parola`: codul plus parola noua;
--       - `doi-pasi`: dupa parola, pe un dispozitiv necunoscut (sau la fiecare
--         intrare, daca asa alege comerciantul).
--  3. Intrarea NUMAI cu cod (`intrare`) se INCHIDE: `cont_cere_cod` nu mai
--     scrie coduri pentru ea. Altfel parola ar fi fost o usa in plus, nu o
--     incuietoare in plus.
--  4. Dispozitivele de incredere: dupa al doilea pas, omul poate cere sa nu mai
--     primeasca un cod pe acel browser 60 de zile. Se pastreaza numai amprenta
--     jetonului, si se sterg TOATE la orice schimbare a parolei.
--  5. Plafoanele parolei stau in baza: 5 greseli in 15 minute pe cont, 20 pe IP
--     la acelasi magazin. Contorul pe cont porneste de la ultima intrare reusita
--     sau de la ultima schimbare a parolei.
--  6. `cont_sterge` goleste si parola, dispozitivele si sesiunile; curatenia
--     sterge si sesiunile expirate de care nu s-a atins nimeni (pastrau IP-ul pe
--     veci: se stergeau numai cele INCHEIATE).

-- ═══ 1. Coloanele ═════════════════════════════════════════════════════════

alter table privat.cont_cumparator add column if not exists parola_hash text;
alter table privat.cont_cumparator add column if not exists parola_schimbata_la timestamptz;

alter table privat.cont_cumparator drop constraint if exists cont_cumparator_parola_forma;
alter table privat.cont_cumparator add constraint cont_cumparator_parola_forma
  check (parola_hash is null or parola_hash like 'scrypt$%');

alter table privat.cont_cod add column if not exists provocare_hash text;
alter table privat.cont_cod add column if not exists parola_hash text;

alter table privat.cont_cod drop constraint if exists cont_cod_scop_check;
alter table privat.cont_cod add constraint cont_cod_scop_check
  check (scop in ('intrare', 'adaugare-contact', 'inregistrare', 'resetare-parola', 'doi-pasi'));

/* Parola asteapta pe cod NUMAI la inregistrare, si numai ca amprenta. */
alter table privat.cont_cod drop constraint if exists cont_cod_parola_forma;
alter table privat.cont_cod add constraint cont_cod_parola_forma
  check (parola_hash is null or (scop = 'inregistrare' and parola_hash like 'scrypt$%'));

create index if not exists idx_cont_cod_provocare
  on privat.cont_cod (business_id, provocare_hash, creat_la desc)
  where provocare_hash is not null;

-- ═══ 2. Dispozitivele de incredere ════════════════════════════════════════

create table if not exists privat.cont_dispozitiv (
  id uuid primary key default gen_random_uuid(),
  cont_id uuid not null,
  business_id uuid not null,
  /* Numai amprenta sha256 a jetonului din cookie-ul `ec_disp`. */
  jeton_hash text not null unique,
  creat_la timestamptz not null default now(),
  folosit_la timestamptz not null default now(),
  expira_la timestamptz not null,
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

create index if not exists idx_cont_dispozitiv_cont
  on privat.cont_dispozitiv (cont_id, business_id, folosit_la desc);

create index if not exists idx_cont_dispozitiv_curatenie
  on privat.cont_dispozitiv (expira_la);

revoke all on privat.cont_dispozitiv from anon, authenticated;
grant select, insert, update, delete on privat.cont_dispozitiv to service_role;

do $$
begin
  if not has_table_privilege('service_role', 'privat.cont_dispozitiv', 'SELECT')
     or not has_table_privilege('service_role', 'privat.cont_dispozitiv', 'INSERT') then
    raise exception 'service_role nu are drepturi pe privat.cont_dispozitiv';
  end if;
  if has_table_privilege('anon', 'privat.cont_dispozitiv', 'SELECT')
     or has_table_privilege('authenticated', 'privat.cont_dispozitiv', 'SELECT') then
    raise exception 'anon sau authenticated vad privat.cont_dispozitiv';
  end if;
end $$;

-- ═══ 3. IP-ul, citit fara sa arunce ═══════════════════════════════════════
--
-- ⚠ `cont_jurnal.ip` e `inet`, iar IP-ul vine ca text din antetul cererii. Un
-- sir stricat nu are voie sa rupa o intrare: devine NULL.

create or replace function privat.cont_ip_sigur(p text) returns inet
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  return p::inet;
exception when others then
  return null;
end $$;

-- ═══ 4. Cererea unui cod ══════════════════════════════════════════════════
--
-- ⚠ `drop` + `create`: lista de parametri se schimba, iar un `create or replace`
-- ar fi lasat alaturi supraincarcarea veche, cu intrarea NUMAI cu cod inca vie.

drop function if exists public.cont_cere_cod(uuid, text, text, text, text, uuid, integer, text);

create function public.cont_cere_cod(
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
begin
  /* ⚠⚠ Intrarea numai cu cod e INCHISA: cu parole, ar fi ocolit parola. */
  if p_scop is null or p_scop not in ('adaugare-contact', 'inregistrare', 'resetare-parola', 'doi-pasi') then
    return query select false, 'scop-inchis', null::text;
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
  if v_dest is null then
    return query select false, 'contact-nevalid', null::text;
    return;
  end if;

  if exists (
    select 1 from privat.cont_contact_blocat x
     where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest
       and x.expira_la > now()
  ) then
    return query select false, 'blocat', v_dest;
    return;
  end if;

  /*
    ⚠ Resetarea se trimite numai unui cont viu cu adresa asta. Pentru o adresa
    necunoscuta nu pleaca nimic, iar ruta raspunde ACELASI lucru (fara oracol).
    ⚠ Al doilea pas se trimite numai pe o adresa a CHIAR contului care a trecut
    de parola.
  */
  if p_scop = 'resetare-parola' then
    select k.cont_id into v_cont
      from privat.cont_contact k
      join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id
     where k.business_id = p_business and k.fel = p_fel and k.valoare = v_dest
       and c.sters_la is null;
    if v_cont is null then
      return query select false, 'fara-cont', v_dest;
      return;
    end if;
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

  select count(*) into v_cate
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel and x.destinatie = v_dest
     and x.creat_la > now() - interval '15 minutes';
  if v_cate >= 4 then
    return query select false, 'prea-multe', v_dest;
    return;
  end if;

  select coalesce((st.cont_client_config->>(case when p_fel = 'telefon' then 'buget_sms_zilnic' else 'buget_email_zilnic' end))::integer,
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

  insert into privat.cont_cod (business_id, cont_id, scop, fel, destinatie, cod_hash, expira_la, ip, provocare_hash, parola_hash)
  values (p_business, v_cont, p_scop, p_fel, v_dest, p_cod_hash,
          now() + make_interval(mins => greatest(1, least(60, p_minute))), p_ip,
          p_provocare_hash, case when p_scop = 'inregistrare' then p_parola_hash end);

  return query select true, 'trimis', v_dest;
end $$;

-- ═══ 5. Retrimiterea, pe aceeasi provocare ════════════════════════════════
--
-- Ruta nu stie adresa si nici parola: are doar cookie-ul provocarii. Codul nou
-- trece prin ACELEASI plafoane (`cont_cere_cod`), deci retrimiterea nu e o usa
-- pe langa ele.

create or replace function public.cont_retrimite_cod(
  p_business uuid,
  p_provocare_hash text,
  p_cod_hash text,
  p_minute integer default 10,
  p_ip text default null
) returns table (ok boolean, motiv text, destinatie text, scop text)
language plpgsql security definer set search_path = '' as $$
declare
  v_cod record;
  r record;
begin
  select * into v_cod
    from privat.cont_cod x
   where x.business_id = p_business and x.provocare_hash = p_provocare_hash
     and x.creat_la > now() - interval '30 minutes'
   order by x.creat_la desc
   limit 1;
  if v_cod.id is null then
    return query select false, 'fara-provocare', null::text, null::text;
    return;
  end if;
  /* O provocare dusa la capat nu mai primeste coduri. */
  if exists (
    select 1 from privat.cont_cod x
     where x.business_id = p_business and x.provocare_hash = p_provocare_hash
       and x.folosit_la is not null
  ) then
    return query select false, 'provocare-incheiata', null::text, v_cod.scop;
    return;
  end if;

  select * into r
    from public.cont_cere_cod(p_business, v_cod.scop, v_cod.fel, v_cod.destinatie, p_cod_hash,
                              v_cod.cont_id, p_minute, p_ip, p_provocare_hash, v_cod.parola_hash);
  return query select r.ok, r.motiv, r.destinatie, v_cod.scop;
end $$;

-- ═══ 6. Verificarea codului unei provocari ════════════════════════════════

create or replace function public.cont_verifica_provocare(
  p_business uuid,
  p_provocare_hash text,
  p_cod_hash text,
  p_parola_hash text default null,
  p_ip text default null
) returns table (ok boolean, motiv text, cont_id uuid, scop text, cont_nou boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_incercari integer;
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

  /* Cinci incercari pe provocare, adunate peste toate codurile ei vii. */
  select coalesce(sum(x.incercari), 0) into v_incercari
    from privat.cont_cod x
   where x.business_id = p_business and x.provocare_hash = p_provocare_hash
     and x.folosit_la is null and x.expira_la > now();
  if v_incercari >= 5 then
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
     where c.id = v_cod.cont_id and c.business_id = p_business and c.sters_la is null;
    if v_cont is null then
      return query select false, 'fara-cont', null::uuid, v_cod.scop, false;
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
        (sesiunile vechi si dispozitivele de incredere cad).
      */
      v_cont := v_contact_cont;
      update privat.cont_cumparator c
         set parola_hash = v_cod.parola_hash, parola_schimbata_la = now(),
             epoca_sesiunii = c.epoca_sesiunii + 1
       where c.id = v_cont and c.business_id = p_business;
      delete from privat.cont_dispozitiv d where d.cont_id = v_cont and d.business_id = p_business;
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
    update privat.cont_cumparator c
       set parola_hash = p_parola_hash, parola_schimbata_la = now(),
           epoca_sesiunii = c.epoca_sesiunii + 1
     where c.id = v_cont and c.business_id = p_business;
    delete from privat.cont_dispozitiv d where d.cont_id = v_cont and d.business_id = p_business;
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'parola-resetata', '{}'::jsonb, v_ip);
    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
    values (p_business, v_cont, 'intrare', jsonb_build_object('fel', 'email', 'prin', 'resetare'), v_ip);
    return query select true, 'intrat', v_cont, v_cod.scop, false;
    return;
  end if;

  return query select false, 'scop-gresit', null::uuid, v_cod.scop, false;
end $$;

-- ═══ 7. Parola, la intrare ════════════════════════════════════════════════
--
-- ⚠ Amprenta pleaca spre Node, unde se compara in timp constant. Plafoanele stau
-- AICI, nu in memorie: pe serverless, un limitator din memorie se inmulteste cu
-- numarul de instante calde si nu limiteaza nimic.

create or replace function public.cont_parola_pentru_intrare(
  p_business uuid,
  p_email text,
  p_ip text default null
) returns table (cont_id uuid, parola_hash text, blocat boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_dest text := privat.cont_normalizeaza('email', p_email);
  v_ip inet := privat.cont_ip_sigur(p_ip);
  v_cont uuid;
  v_hash text;
  v_schimbata timestamptz;
  v_de_la timestamptz;
  v_blocat boolean := false;
  v_cate integer;
begin
  if v_ip is not null then
    select count(*) into v_cate
      from privat.cont_jurnal j
     where j.business_id = p_business and j.fapta = 'parola-gresita' and j.ip = v_ip
       and j.creat_la > now() - interval '15 minutes';
    if v_cate >= 20 then
      v_blocat := true;
    end if;
  end if;

  if v_dest is not null then
    select c.id, c.parola_hash, c.parola_schimbata_la into v_cont, v_hash, v_schimbata
      from privat.cont_contact k
      join privat.cont_cumparator c on c.id = k.cont_id and c.business_id = k.business_id
     where k.business_id = p_business and k.fel = 'email' and k.valoare = v_dest
       and c.sters_la is null;
  end if;

  if v_cont is not null and not v_blocat then
    /* Contorul porneste de la ultima intrare reusita sau schimbare a parolei. */
    select greatest(
             now() - interval '15 minutes',
             coalesce(v_schimbata, '-infinity'::timestamptz),
             coalesce((select max(j.creat_la) from privat.cont_jurnal j
                        where j.business_id = p_business and j.cont_id = v_cont and j.fapta = 'intrare'),
                      '-infinity'::timestamptz))
      into v_de_la;
    select count(*) into v_cate
      from privat.cont_jurnal j
     where j.business_id = p_business and j.cont_id = v_cont and j.fapta = 'parola-gresita'
       and j.creat_la > v_de_la;
    if v_cate >= 5 then
      v_blocat := true;
    end if;
  end if;

  return query select v_cont, v_hash, v_blocat;
end $$;

create or replace function public.cont_intrare_esuata(
  p_business uuid,
  p_cont uuid default null,
  p_ip text default null
) returns void
language sql security definer set search_path = '' as $$
  /* ⚠ Nu se scrie adresa incercata: poate fi a altcuiva. Numai contul (cand
     exista) si IP-ul, pentru plafoane. */
  insert into privat.cont_jurnal (business_id, cont_id, fapta, ip)
  values (p_business, p_cont, 'parola-gresita', privat.cont_ip_sigur(p_ip));
$$;

create or replace function public.cont_intrare_cu_parola(
  p_business uuid,
  p_cont uuid,
  p_ip text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from privat.cont_cumparator c
     where c.id = p_cont and c.business_id = p_business and c.sters_la is null
       and c.parola_hash is not null
  ) then
    return false;
  end if;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii, ip)
  values (p_business, p_cont, 'intrare', jsonb_build_object('fel', 'email', 'prin', 'parola'), privat.cont_ip_sigur(p_ip));
  return true;
end $$;

-- ═══ 8. Dispozitivele de incredere ════════════════════════════════════════

create or replace function public.cont_dispozitiv_cunoscut(
  p_business uuid,
  p_cont uuid,
  p_jeton_hash text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_jeton_hash is null then
    return false;
  end if;
  update privat.cont_dispozitiv d
     set folosit_la = now()
   where d.business_id = p_business and d.cont_id = p_cont
     and d.jeton_hash = p_jeton_hash and d.expira_la > now();
  return found;
end $$;

create or replace function public.cont_dispozitiv_adauga(
  p_business uuid,
  p_cont uuid,
  p_jeton_hash text,
  p_zile integer default 60
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from privat.cont_cumparator c
     where c.id = p_cont and c.business_id = p_business and c.sters_la is null
  ) then
    return false;
  end if;
  insert into privat.cont_dispozitiv (cont_id, business_id, jeton_hash, expira_la)
  values (p_cont, p_business, p_jeton_hash, now() + make_interval(days => greatest(1, least(90, p_zile))));
  /* Cel mult zece pe cont: cele mai vechi ies. */
  delete from privat.cont_dispozitiv d
   where d.cont_id = p_cont and d.business_id = p_business
     and d.id not in (
       select x.id from privat.cont_dispozitiv x
        where x.cont_id = p_cont and x.business_id = p_business
        order by x.folosit_la desc
        limit 10
     );
  return true;
end $$;

-- ═══ 9. Parola, din cont ══════════════════════════════════════════════════

create or replace function public.cont_parola_contului(
  p_business uuid,
  p_cont uuid
) returns table (are_parola boolean, parola_hash text, email text)
language sql stable security definer set search_path = '' as $$
  select c.parola_hash is not null,
         c.parola_hash,
         (select k.valoare_bruta from privat.cont_contact k
           where k.cont_id = c.id and k.business_id = c.business_id and k.fel = 'email'
           order by k.verificat_la nulls last, k.creat_la
           limit 1)
    from privat.cont_cumparator c
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null;
$$;

create or replace function public.cont_schimba_parola(
  p_business uuid,
  p_cont uuid,
  p_parola_hash text,
  p_ip text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_parola_hash is null or p_parola_hash not like 'scrypt$%' then
    return false;
  end if;
  /* ⚠ Epoca urca: TOATE sesiunile cad, si cea curenta; ruta deschide alta. */
  update privat.cont_cumparator c
     set parola_hash = p_parola_hash, parola_schimbata_la = now(),
         epoca_sesiunii = c.epoca_sesiunii + 1
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null;
  if not found then
    return false;
  end if;
  delete from privat.cont_dispozitiv d where d.cont_id = p_cont and d.business_id = p_business;
  insert into privat.cont_jurnal (business_id, cont_id, fapta, ip)
  values (p_business, p_cont, 'parola-schimbata', privat.cont_ip_sigur(p_ip));
  return true;
end $$;

-- ═══ 10. Stergerea contului goleste si parola ═════════════════════════════

create or replace function public.cont_sterge(p_business uuid, p_cont uuid)
returns table (ok boolean, comenzi_ramase bigint)
language plpgsql security definer set search_path = '' as $$
declare v_comenzi bigint;
begin
  select count(*) into v_comenzi
    from privat.cont_comanda l where l.business_id = p_business and l.cont_id = p_cont;

  delete from privat.cont_contact x where x.business_id = p_business and x.cont_id = p_cont;
  delete from privat.cont_comanda l where l.business_id = p_business and l.cont_id = p_cont;
  delete from privat.cont_cod c where c.business_id = p_business and c.cont_id = p_cont;
  delete from privat.cont_dispozitiv d where d.business_id = p_business and d.cont_id = p_cont;
  /* ⚠ Sesiunile poarta IP-uri: se sterg acum, nu la curatenie. */
  delete from privat.cont_sesiune s where s.business_id = p_business and s.cont_id = p_cont;
  delete from privat.cont_instiintare i where i.business_id = p_business and i.cont_id = p_cont;

  update privat.cont_cumparator c
     set sters_la = now(), nume = '', parola_hash = null, parola_schimbata_la = null,
         epoca_sesiunii = epoca_sesiunii + 1
   where c.id = p_cont and c.business_id = p_business;

  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'cont-sters');

  return query select true, v_comenzi;
end $$;

-- ═══ 11. Curatenia ════════════════════════════════════════════════════════
--
-- ⚠ Intoarce o coloana noua, deci `drop` + `create` (altfel `42P13`).

drop function if exists public.cont_curatenie();

create function public.cont_curatenie()
returns table (sesiuni integer, coduri integer, jurnal integer, blocate integer, instiintari integer, dispozitive integer)
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer; d integer; e integer; f integer;
begin
  /* ⚠ Si cele EXPIRATE de care nu s-a mai atins nimeni: nu se inchid singure,
     deci pana acum isi pastrau IP-ul pe veci. */
  delete from privat.cont_sesiune
   where (incheiata_la is not null and incheiata_la < now() - interval '30 days')
      or expira_la < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from privat.cont_cod where expira_la < now() - interval '1 day';
  get diagnostics b = row_count;
  delete from privat.cont_jurnal where creat_la < now() - interval '12 months';
  get diagnostics c = row_count;
  delete from privat.cont_contact_blocat where expira_la < now();
  get diagnostics d = row_count;
  delete from privat.cont_instiintare where trimisa_la is not null and trimisa_la < now() - interval '30 days';
  get diagnostics e = row_count;
  delete from privat.cont_dispozitiv where expira_la < now();
  get diagnostics f = row_count;
  return query select a, b, c, d, e, f;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE, nominal, si verificate
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function privat.cont_ip_sigur(text) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_cere_cod(uuid, text, text, text, text, uuid, integer, text, text, text)',
    'public.cont_retrimite_cod(uuid, text, text, integer, text)',
    'public.cont_verifica_provocare(uuid, text, text, text, text)',
    'public.cont_parola_pentru_intrare(uuid, text, text)',
    'public.cont_intrare_esuata(uuid, uuid, text)',
    'public.cont_intrare_cu_parola(uuid, uuid, text)',
    'public.cont_dispozitiv_cunoscut(uuid, uuid, text)',
    'public.cont_dispozitiv_adauga(uuid, uuid, text, integer)',
    'public.cont_parola_contului(uuid, uuid)',
    'public.cont_schimba_parola(uuid, uuid, text, text)',
    'public.cont_sterge(uuid, uuid)',
    'public.cont_curatenie()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'anon poate chema %', f;
    end if;
    if has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
