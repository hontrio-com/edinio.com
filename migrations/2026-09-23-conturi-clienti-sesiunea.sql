-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 3: sesiunea                       (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ CAPETELE STAU IN `public`, CORPURILE ATING `privat`.
--
-- PostgREST expune numai `public`, tocmai de aceea tabelele stau in `privat`.
-- Deci o functie scrisa in `privat` n-ar putea fi chemata niciodata din cod.
-- Capetele sunt `security definer`, cu `search_path` gol, si sunt date NUMAI lui
-- `service_role`: nici `anon`, nici `authenticated` nu le pot chema.
--
-- ⚠ `create or replace` REFACE granturile implicite, iar Postgres da EXECUTE lui
-- PUBLIC din oficiu. De-aia blocul de `revoke` sta la FINAL, dupa toate
-- definitiile, si e urmat de o verificare care opreste migratia.
--
-- ═══ CE NU E AICI, SI DE CE ═══
--
-- Suspendarea magazinului NU se verifica in SQL. Regula ei traieste azi in
-- TypeScript, in doua locuri (`/cos` si `/checkout`), si are o ramura care cere
-- profilul proprietarului. Scrisa si aici, ar fi fost a TREIA copie a unei reguli
-- de bani. Ramane in TypeScript, intr-un ajutor comun.
--
-- Ce se verifica aici e numai ce functia are oricum in mana: sesiunea, contul si
-- comutatorul magazinului.

-- ── Cat traieste o sesiune ─────────────────────────────────────────────────
--
-- ⚠ Cele trei numere stau intr-un singur loc, ca sa nu se desparta. Cookie-ul
-- primeste ACELASI `maxAge` ca `viata_absoluta`; scris altfel, browserul ar fi
-- aruncat cookie-ul inaintea bazei, sau invers.

create or replace function privat.cont_reguli_sesiune()
returns table (viata_absoluta interval, inactivitate interval, rotire_dupa interval, gratie_rotire interval)
language sql immutable set search_path = '' as $$
  select interval '30 days', interval '14 days', interval '24 hours', interval '30 seconds';
$$;

-- ── Creeaza ────────────────────────────────────────────────────────────────

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

  /* ⚠ Epoca se ia ACUM, din cont. O sesiune nascuta cu o epoca veche ar fi fost
     valabila desi omul tocmai apasase „iesi de peste tot". */
  select c.epoca_sesiunii into v_epoca
    from privat.cont_cumparator c
   where c.id = p_cont and c.business_id = p_business and c.sters_la is null;

  if v_epoca is null then
    return;
  end if;

  return query
  insert into privat.cont_sesiune (cont_id, business_id, jeton_hash, epoca, inactiva_dupa, expira_la, ip)
  values (p_cont, p_business, p_jeton_hash, v_epoca,
          now() + r.inactivitate, now() + r.viata_absoluta, p_ip)
  returning privat.cont_sesiune.id, privat.cont_sesiune.expira_la;
end $$;

-- ── Verifica ───────────────────────────────────────────────────────────────
--
-- ⚠⚠ ZERO RANDURI INSEAMNA „NU E VALABILA". Functia nu arunca si nu spune de ce:
-- un mesaj deosebit pentru „sesiune expirata" fata de „cont sters" ar fi un
-- oracol. Motivul adevarat se scrie in `cont_sesiune.motiv_incheiere`, unde il
-- vede numai cine are baza.

create or replace function public.cont_sesiune_verifica(
  p_business uuid,
  p_jeton_hash text
) returns table (cont_id uuid, nume text, trebuie_rotit boolean)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s record;
  c record;
  pornit boolean;
begin
  select * into r from privat.cont_reguli_sesiune();

  select * into s
    from privat.cont_sesiune x
   where x.business_id = p_business and x.jeton_hash = p_jeton_hash;

  if s.id is null then
    return;
  end if;

  /*
    ⚠⚠ REFOLOSIREA UNUI JETON DEJA ROTIT INCHIDE TOT.
    Daca cineva prezinta un jeton pe care noi l-am inlocuit deja, ori a fost
    furat, ori a fost copiat. Nu se poate sti care, deci se presupune ce e mai
    rau: se ridica epoca si cad TOATE sesiunile contului.
    ⚠ Fereastra de gratie exista pentru cazul cinstit: doua file care roteau in
    aceeasi clipa, sau o cerere reluata dupa o pana de retea. Fara ea, oamenii
    ar fi fost deconectati la intamplare si nimeni n-ar fi reprodus defectul.
  */
  if s.incheiata_la is not null then
    if s.motiv_incheiere = 'rotire' and s.incheiata_la > now() - r.gratie_rotire then
      return;
    end if;
    if s.motiv_incheiere = 'rotire' then
      update privat.cont_cumparator
         set epoca_sesiunii = epoca_sesiunii + 1
       where id = s.cont_id and business_id = s.business_id;
      insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
      values (s.business_id, s.cont_id, 'jeton-refolosit',
              jsonb_build_object('sesiune', s.id));
    end if;
    return;
  end if;

  if s.expira_la <= now() or s.inactiva_dupa <= now() then
    update privat.cont_sesiune
       set incheiata_la = now(),
           motiv_incheiere = 'epoca'
     where id = s.id;
    return;
  end if;

  select * into c
    from privat.cont_cumparator x
   where x.id = s.cont_id and x.business_id = s.business_id;

  if c.id is null or c.sters_la is not null or c.epoca_sesiunii <> s.epoca then
    update privat.cont_sesiune
       set incheiata_la = now(),
           motiv_incheiere = case when c.sters_la is not null then 'stergere' else 'epoca' end
     where id = s.id;
    return;
  end if;

  /*
    ⚠ COMUTATORUL MAGAZINULUI SE CITESTE LA FIECARE VERIFICARE, nu la intrare.
    H3: cand comerciantul stinge functia, accesul se inchide pe loc, fara sa se
    stearga nimic. Reaprinsa, aceleasi sesiuni redevin valabile.
    ⚠ JOIN interior dinadins: un magazin fara rand in `store_settings` cade
    INCHIS. Masurat pe 23.09.2026: zero magazine sunt in situatia asta, dar unul
    facut maine ar fi fost.
  */
  select coalesce(st.cont_client_config->>'enabled', 'false') = 'true' into pornit
    from privat.store_settings st
   where st.business_id = p_business;

  if pornit is not true then
    return;
  end if;

  /* Fereastra glisanta: fiecare atingere impinge inactivitatea, niciodata marginea absoluta. */
  update privat.cont_sesiune
     set inactiva_dupa = least(now() + r.inactivitate, s.expira_la)
   where id = s.id;

  return query select c.id, c.nume, (s.creata_la < now() - r.rotire_dupa);
end $$;

-- ── Roteste ────────────────────────────────────────────────────────────────

create or replace function public.cont_sesiune_roteste(
  p_business uuid,
  p_jeton_vechi text,
  p_jeton_nou text
) returns table (sesiune_id uuid, expira_la timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s record;
begin
  select * into r from privat.cont_reguli_sesiune();

  /* ⚠ Zavorul e pe randul vechi: doua file care roteau deodata nu pot naste doua sesiuni. */
  select * into s
    from privat.cont_sesiune x
   where x.business_id = p_business and x.jeton_hash = p_jeton_vechi
     and x.incheiata_la is null
   for update;

  if s.id is null then
    return;
  end if;

  update privat.cont_sesiune
     set incheiata_la = now(), motiv_incheiere = 'rotire'
   where id = s.id;

  /* ⚠ Marginea absoluta NU se misca la rotire. Altfel o sesiune rotita la
     nesfarsit ar fi trait la nesfarsit, si cele 30 de zile n-ar mai fi insemnat nimic. */
  return query
  insert into privat.cont_sesiune (cont_id, business_id, jeton_hash, epoca, inactiva_dupa, expira_la, ip)
  values (s.cont_id, s.business_id, p_jeton_nou, s.epoca,
          least(now() + r.inactivitate, s.expira_la), s.expira_la, s.ip)
  returning privat.cont_sesiune.id, privat.cont_sesiune.expira_la;
end $$;

-- ── Incheie ────────────────────────────────────────────────────────────────

create or replace function public.cont_sesiune_incheie(
  p_business uuid,
  p_jeton_hash text
) returns void
language sql security definer set search_path = '' as $$
  update privat.cont_sesiune
     set incheiata_la = now(), motiv_incheiere = 'iesire'
   where business_id = p_business and jeton_hash = p_jeton_hash and incheiata_la is null;
$$;

-- ── Iesi de peste tot ──────────────────────────────────────────────────────
--
-- ⚠ Ridica epoca, nu sterge randuri. O stergere ar fi lasat o cursa cu cererile
-- aflate in zbor, iar jurnalul de sesiuni ar fi devenit inutil chiar in clipa in
-- care cineva ar fi vrut sa se uite in el.

create or replace function public.cont_iesi_de_peste_tot(
  p_business uuid,
  p_cont uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update privat.cont_cumparator
     set epoca_sesiunii = epoca_sesiunii + 1
   where id = p_cont and business_id = p_business;

  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'iesire-de-peste-tot');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE. Dupa definitii, fiindca `create or replace` le reface.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function privat.cont_reguli_sesiune()                    from public, anon, authenticated;
revoke all on function public.cont_sesiune_creeaza(uuid, uuid, text, inet) from public, anon, authenticated;
revoke all on function public.cont_sesiune_verifica(uuid, text)        from public, anon, authenticated;
revoke all on function public.cont_sesiune_roteste(uuid, text, text)   from public, anon, authenticated;
revoke all on function public.cont_sesiune_incheie(uuid, text)         from public, anon, authenticated;
revoke all on function public.cont_iesi_de_peste_tot(uuid, uuid)       from public, anon, authenticated;

grant execute on function public.cont_sesiune_creeaza(uuid, uuid, text, inet) to service_role;
grant execute on function public.cont_sesiune_verifica(uuid, text)        to service_role;
grant execute on function public.cont_sesiune_roteste(uuid, text, text)   to service_role;
grant execute on function public.cont_sesiune_incheie(uuid, text)         to service_role;
grant execute on function public.cont_iesi_de_peste_tot(uuid, uuid)       to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_sesiune_creeaza(uuid, uuid, text, inet)',
    'public.cont_sesiune_verifica(uuid, text)',
    'public.cont_sesiune_roteste(uuid, text, text)',
    'public.cont_sesiune_incheie(uuid, text)',
    'public.cont_iesi_de_peste_tot(uuid, uuid)'
  ] loop
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
