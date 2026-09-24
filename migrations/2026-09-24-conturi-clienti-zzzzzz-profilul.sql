-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 19: PROFILUL (nume, poza, telefon, adresa)
--                                                               (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `zzzzzz-`: vine dupa 55, si in ordinea numelor.
--
-- Cerut de proprietar: „Utilizatorul sa isi poata schimba numele, poza de profil
-- si alte detalii". Contul avea numai `nume` (luat din prima comanda) si
-- contactele confirmate. Acum:
--
--  1. NUMELE se schimba din cont (coloana exista; `cont_maturare` il umple numai
--     cand e gol, deci ce scrie omul ramane).
--  2. TELEFONUL si ADRESA DE LIVRARE, pe cont. Nu sunt contacte (nu se confirma
--     cu cod si nu leaga comenzi); sunt numai ca formularul de comanda sa nu mai
--     ceara de fiecare data aceleasi date.
--  3. POZA DE PROFIL, in baza, nu intr-o galeata de fisiere: un WebP mic (serverul
--     o reduce la 256x256 inainte), in `privat.cont_poza`. Asa pleaca SINGURA
--     odata cu contul: la stergere, la stergerea din panou si la anonimizare nu
--     ramane niciun fisier orfan, fara nicio curatenie separata.
--
-- ⚠⚠ STERGEREA SI ANONIMIZAREA NU SE RESCRIU. Toate trei (`cont_sterge`,
-- `cont_panou_sterge` prin ea, `cont_rupe_legaturile`) pun `sters_la`. Un
-- declansator pe acel moment goleste telefonul, adresa si poza. O regula scrisa in
-- trei locuri s-ar fi despartit la prima schimbare.

-- ═══ 1. Coloanele ═════════════════════════════════════════════════════════════

alter table privat.cont_cumparator add column if not exists telefon text;
alter table privat.cont_cumparator add column if not exists adresa jsonb;

alter table privat.cont_cumparator drop constraint if exists cont_cumparator_telefon_forma;
alter table privat.cont_cumparator add constraint cont_cumparator_telefon_forma
  check (telefon is null or (length(telefon) <= 20 and length(regexp_replace(telefon, '[^0-9]', '', 'g')) between 9 and 15));

alter table privat.cont_cumparator drop constraint if exists cont_cumparator_adresa_forma;
alter table privat.cont_cumparator add constraint cont_cumparator_adresa_forma
  check (adresa is null or (jsonb_typeof(adresa) = 'object' and length(adresa::text) <= 600));

alter table privat.cont_cumparator drop constraint if exists cont_cumparator_nume_lungime;
alter table privat.cont_cumparator add constraint cont_cumparator_nume_lungime
  check (length(nume) <= 120);

-- ═══ 2. Poza ══════════════════════════════════════════════════════════════════

create table if not exists privat.cont_poza (
  cont_id uuid primary key,
  business_id uuid not null,
  /* WebP de cel mult 256x256, facut de server. Plafonul din baza e plasa, nu regula. */
  imagine bytea not null check (octet_length(imagine) between 1 and 200000),
  schimbata_la timestamptz not null default now(),
  foreign key (cont_id, business_id)
    references privat.cont_cumparator (id, business_id) on delete cascade
);

revoke all on privat.cont_poza from anon, authenticated;
grant select, insert, update, delete on privat.cont_poza to service_role;

do $$
begin
  if not has_table_privilege('service_role', 'privat.cont_poza', 'SELECT') then
    raise exception 'service_role nu are drepturi pe privat.cont_poza';
  end if;
  if has_table_privilege('anon', 'privat.cont_poza', 'SELECT')
     or has_table_privilege('authenticated', 'privat.cont_poza', 'SELECT') then
    raise exception 'anon sau authenticated vad privat.cont_poza';
  end if;
end $$;

-- ═══ 3. La stergere, profilul pleaca singur ═══════════════════════════════════

create or replace function privat.cont_goleste_profilul()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.sters_la is not null and old.sters_la is null then
    new.telefon := null;
    new.adresa := null;
    delete from privat.cont_poza p where p.cont_id = new.id and p.business_id = new.business_id;
  end if;
  return new;
end $$;

revoke all on function privat.cont_goleste_profilul() from public, anon, authenticated;

drop trigger if exists cont_goleste_profilul on privat.cont_cumparator;
create trigger cont_goleste_profilul
  before update of sters_la on privat.cont_cumparator
  for each row execute function privat.cont_goleste_profilul();

-- ═══ 4. Citirea si scrierea profilului ════════════════════════════════════════

create or replace function public.cont_profil(p_business uuid, p_cont uuid)
returns table (nume text, telefon text, adresa jsonb, poza_la timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.nume, c.telefon, c.adresa,
         (select p.schimbata_la from privat.cont_poza p where p.cont_id = c.id and p.business_id = c.business_id)
    from privat.cont_cumparator c
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null;
$$;

/*
  ⚠ Validarea fina (judetul din lista, lungimile) o face si ruta; aici e plasa.
  Un camp gol devine NULL, iar o adresa cu toate campurile goale dispare.
*/
create or replace function public.cont_profil_salveaza(
  p_business uuid, p_cont uuid,
  p_nume text, p_telefon text,
  p_judet text, p_localitate text, p_adresa text, p_cod_postal text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_nume text := left(btrim(coalesce(p_nume, '')), 120);
  v_tel text := nullif(btrim(coalesce(p_telefon, '')), '');
  v_adresa jsonb;
begin
  if v_nume = '' then
    return 'nume-lipsa';
  end if;
  if v_tel is not null and (length(v_tel) > 20 or length(regexp_replace(v_tel, '[^0-9]', '', 'g')) not between 9 and 15) then
    return 'telefon-nevalid';
  end if;

  v_adresa := jsonb_strip_nulls(jsonb_build_object(
    'judet', nullif(left(btrim(coalesce(p_judet, '')), 60), ''),
    'localitate', nullif(left(btrim(coalesce(p_localitate, '')), 80), ''),
    'adresa', nullif(left(btrim(coalesce(p_adresa, '')), 200), ''),
    'cod_postal', nullif(left(btrim(coalesce(p_cod_postal, '')), 10), '')));
  if v_adresa = '{}'::jsonb then
    v_adresa := null;
  end if;

  update privat.cont_cumparator c
     set nume = v_nume, telefon = v_tel, adresa = v_adresa
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null;
  if not found then
    return 'negasit';
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'profil-schimbat');
  return 'salvat';
end $$;

/* Poza vine ca base64 (PostgREST nu trimite bytea curat), deja redusa de server. */
create or replace function public.cont_poza_salveaza(p_business uuid, p_cont uuid, p_imagine_b64 text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_img bytea;
begin
  if not exists (select 1 from privat.cont_cumparator c
                  where c.id = p_cont and c.business_id = p_business and c.sters_la is null) then
    return 'negasit';
  end if;
  begin
    v_img := decode(coalesce(p_imagine_b64, ''), 'base64');
  exception when others then
    return 'nevalida';
  end;
  if octet_length(v_img) = 0 or octet_length(v_img) > 200000 then
    return 'nevalida';
  end if;
  insert into privat.cont_poza (cont_id, business_id, imagine, schimbata_la)
  values (p_cont, p_business, v_img, now())
  on conflict (cont_id) do update set imagine = excluded.imagine, schimbata_la = excluded.schimbata_la;
  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'poza-schimbata');
  return 'salvata';
end $$;

create or replace function public.cont_poza(p_business uuid, p_cont uuid)
returns table (imagine_b64 text, schimbata_la timestamptz)
language sql stable security definer set search_path = '' as $$
  select encode(p.imagine, 'base64'), p.schimbata_la
    from privat.cont_poza p
    join privat.cont_cumparator c on c.id = p.cont_id and c.business_id = p.business_id and c.sters_la is null
   where p.cont_id = p_cont and p.business_id = p_business;
$$;

create or replace function public.cont_poza_sterge(p_business uuid, p_cont uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from privat.cont_poza p where p.cont_id = p_cont and p.business_id = p_business;
  if not found then
    return false;
  end if;
  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'poza-stearsa');
  return true;
end $$;

-- ═══ 5. Rezumatul stie si de poza ═════════════════════════════════════════════
--
-- Copiat intocmai din 48, plus `poza_la`: antetul contului (chemat pe FIECARE
-- pagina) afla asa daca are ce poza sa arate, fara inca un drum la baza.
-- ⚠ `drop` + `create`: se schimba coloanele intoarse (altfel `42P13`).

drop function if exists public.cont_rezumat(uuid, uuid);

create function public.cont_rezumat(p_business uuid, p_cont uuid)
returns table (comenzi bigint, in_curs bigint, facturi bigint, retururi bigint, poza_la timestamptz)
language sql stable security definer set search_path = '' as $fn$
  select
    (select count(*)
       from privat.cont_comanda l
      where l.business_id = p_business and l.cont_id = p_cont),
    (select count(*)
       from privat.cont_comanda l
       join public.orders o on o.id = l.order_id and o.business_id = l.business_id
      where l.business_id = p_business and l.cont_id = p_cont
        and o.status in ('pending', 'confirmed', 'processing', 'shipped')),
    (select count(*)
       from privat.cont_comanda l
       join public.orders o on o.id = l.order_id and o.business_id = l.business_id
      where l.business_id = p_business and l.cont_id = p_cont
        and l.vedere = 'intreaga'
        and not coalesce(o.order_source ? 'marketplace', false)
        and privat.cont_documentul_comenzii(o) is not null),
    (select count(*)
       from public.return_requests r
       join privat.cont_comanda l on l.order_id = r.order_id and l.business_id = r.business_id
      where r.business_id = p_business and l.cont_id = p_cont and l.vedere = 'intreaga'),
    (select p.schimbata_la from privat.cont_poza p
      where p.cont_id = p_cont and p.business_id = p_business);
$fn$;

-- ═══ 6. Exportul cuprinde si profilul ════════════════════════════════════════
--
-- Copiat intocmai din 54, plus telefonul, adresa si daca exista o poza (poza
-- insasi nu intra in fisier: se vede si se descarca din cont).

create or replace function public.cont_export(p_business uuid, p_cont uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cont', (select jsonb_build_object('nume', c.nume, 'creat_la', c.creat_la,
                                       'are_parola', c.parola_hash is not null,
                                       'parola_schimbata_la', c.parola_schimbata_la,
                                       'telefon', c.telefon, 'adresa_de_livrare', c.adresa,
                                       'are_poza', exists (select 1 from privat.cont_poza p
                                                           where p.cont_id = c.id and p.business_id = c.business_id))
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

-- ═══ Drepturile ═══════════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_profil(uuid, uuid)',
    'public.cont_profil_salveaza(uuid, uuid, text, text, text, text, text, text)',
    'public.cont_poza_salveaza(uuid, uuid, text)',
    'public.cont_poza(uuid, uuid)',
    'public.cont_poza_sterge(uuid, uuid)',
    'public.cont_rezumat(uuid, uuid)',
    'public.cont_export(uuid, uuid)'
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
