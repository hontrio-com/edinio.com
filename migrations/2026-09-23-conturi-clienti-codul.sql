-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 4: codul de sase cifre            (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Nu exista parola. Intrarea se face cu un cod trimis pe email sau pe SMS, dupa
-- acelasi tipar cu MFA-ul comerciantilor (`src/lib/auth/flux-mfa.ts`): codul se
-- genereaza si se compara in Node, iar in baza ajunge doar amprenta sha256.
--
-- ⚠⚠ FUNCTIILE SPUN ADEVARUL, RUTA NU.
-- `cont_cere_cod` intoarce cinstit „blocat", „prea-multe" sau „buget-epuizat",
-- fiindca serverul are nevoie de ele ca sa scrie in jurnal si sa nu trimita
-- degeaba. Dar ruta raspunde browserului ACELASI lucru in toate cazurile,
-- inclusiv cand destinatia nu exista: altfel formularul de intrare devine un
-- oracol prin care oricine afla ce emailuri si ce telefoane cunoaste magazinul.
-- Regula asta traieste in ruta si e aparata de o proba.

-- ── Normalizarea, intr-un singur loc ───────────────────────────────────────
--
-- ⚠⚠ In TypeScript exista TREI `normalizePhone` care raspund diferit. Adevarul e
-- `public.normalize_phone`, si nicio cheie de contact nu se calculeaza in afara
-- bazei. Functia de mai jos e singurul drum.

create or replace function privat.cont_normalizeaza(p_fel text, p_valoare text)
returns text language sql immutable set search_path = '' as $$
  select case p_fel
    when 'telefon' then nullif(public.normalize_phone(coalesce(p_valoare, '')), '')
    when 'email'   then nullif(lower(btrim(coalesce(p_valoare, ''))), '')
  end;
$$;

-- ── Ziua romaneasca, pentru bugetul de SMS ─────────────────────────────────
--
-- ⚠ Bugetul e pe ZI, iar ziua e cea romaneasca, nu cea UTC. Socotita in UTC, ar
-- fi inceput la 03:00 dimineata si s-ar fi terminat tot atunci: exact defectul
-- pentru care `orders_daily_revenue` a ramas o capcana in baza.

create or replace function privat.cont_inceputul_zilei()
returns timestamptz language sql stable set search_path = '' as $$
  select date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest';
$$;

-- ── Cere un cod ────────────────────────────────────────────────────────────

create or replace function public.cont_cere_cod(
  p_business uuid,
  p_scop text,
  p_fel text,
  p_destinatie_bruta text,
  p_cod_hash text,
  p_cont uuid default null,
  p_minute integer default 10
) returns table (ok boolean, motiv text, destinatie text)
language plpgsql security definer set search_path = '' as $$
declare
  v_dest text;
  v_cate integer;
  v_buget integer;
  v_trimise integer;
begin
  v_dest := privat.cont_normalizeaza(p_fel, p_destinatie_bruta);
  if v_dest is null then
    return query select false, 'contact-nevalid', null::text;
    return;
  end if;

  /* ⚠ Contactul contestat prin „nu am fost eu" nu mai primeste coduri, dar numai
     pana la termen: `expira_la` se scurge, altfel n-ar fi retentie, ar fi o
     pedeapsa pe viata pusa pe o data personala. */
  if exists (
    select 1 from privat.cont_contact_blocat x
     where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest
       and x.expira_la > now()
  ) then
    return query select false, 'blocat', v_dest;
    return;
  end if;

  /*
    ⚠⚠ PLAFONUL STA IN BAZA, nu numai in `consumaLimita`.
    Limitatorul durabil cade DESCHIS la orice eroare de baza
    (`limita-durabila.ts:111-117` intoarce `permis: true`), iar sub el ramane doar
    plasa din memorie, care pe serverless se inmulteste cu numarul de instante
    calde. Un plafon scris aici nu poate cadea deschis: daca baza nu raspunde, nu
    se scrie nici codul.
    Patru coduri la 15 minute e acelasi numar cu MFA-ul comerciantilor.
  */
  select count(*) into v_cate
    from privat.cont_cod x
   where x.business_id = p_business and x.fel = p_fel and x.destinatie = v_dest
     and x.creat_la > now() - interval '15 minutes';
  if v_cate >= 4 then
    return query select false, 'prea-multe', v_dest;
    return;
  end if;

  /* ⚠ SMS-ul costa banii COMERCIANTULUI, si tinta se alege din cerere. Bugetul
     zilnic e singurul lucru care sta intre un strain si creditul lui. */
  if p_fel = 'telefon' then
    select coalesce((st.cont_client_config->>'buget_sms_zilnic')::integer, 100) into v_buget
      from privat.store_settings st where st.business_id = p_business;
    select count(*) into v_trimise
      from privat.cont_cod x
     where x.business_id = p_business and x.fel = 'telefon'
       and x.creat_la >= privat.cont_inceputul_zilei();
    if v_trimise >= coalesce(v_buget, 100) then
      return query select false, 'buget-epuizat', v_dest;
      return;
    end if;
  end if;

  /* ⚠ Codul vechi moare cand se cere unul nou. Altfel doua coduri vii pentru
     aceeasi destinatie ar fi dublat numarul de incercari ingaduite.
     ⚠⚠ ALIASUL `c` NU E COSMETIC: parametrul de iesire al functiei se cheama tot
     `destinatie`, iar fara alias Postgres refuza instructiunea cu
     `42702: column reference "destinatie" is ambiguous`. Prins la prima proba. */
  update privat.cont_cod c
     set folosit_la = now()
   where c.business_id = p_business and c.fel = p_fel and c.destinatie = v_dest
     and c.scop = p_scop and c.folosit_la is null;

  insert into privat.cont_cod (business_id, cont_id, scop, fel, destinatie, cod_hash, expira_la)
  values (p_business, p_cont, p_scop, p_fel, v_dest, p_cod_hash,
          now() + make_interval(mins => greatest(1, least(60, p_minute))));

  return query select true, 'trimis', v_dest;
end $$;

-- ── Verifica un cod ────────────────────────────────────────────────────────

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
  v_dest text;
  v_cod record;
  v_contact record;
  v_cont uuid;
  v_refolosesc boolean;
begin
  v_dest := privat.cont_normalizeaza(p_fel, p_destinatie_bruta);
  if v_dest is null then
    return query select false, 'contact-nevalid', null::uuid;
    return;
  end if;

  /* ⚠ `for update`: doua incercari trimise deodata nu au voie sa consume
     amandoua acelasi cod, si nici sa scrie amandoua contorul de incercari. */
  select * into v_cod
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest
     and x.folosit_la is null and x.expira_la > now()
   order by x.creat_la desc
   limit 1
   for update;

  if v_cod.id is null then
    return query select false, 'fara-cod', null::uuid;
    return;
  end if;

  /* Cinci incercari pe cod. Al saselea nu mai socoteste nimic. */
  if v_cod.incercari >= 5 then
    return query select false, 'prea-multe-incercari', null::uuid;
    return;
  end if;

  if v_cod.cod_hash <> p_cod_hash then
    update privat.cont_cod set incercari = incercari + 1 where id = v_cod.id;
    return query select false, 'gresit', null::uuid;
    return;
  end if;

  update privat.cont_cod set folosit_la = now() where id = v_cod.id;

  select * into v_contact
    from privat.cont_contact x
   where x.business_id = p_business and x.fel = p_fel and x.valoare = v_dest;

  if p_scop = 'intrare' then
    /*
      ⚠⚠ UN CONT STERS NU SE REINVIE. Omul care si-a sters contul si se intoarce
      maine primeste unul NOU, curat. Contactul se desprinde de cel vechi, ca
      indexul unic sa nu opreasca randul nou.
      ⚠ Si nu se blocheaza: contactul propriu NU intra niciodata in
      `cont_contact_blocat`. Scris acolo la stergere, exercitarea dreptului de
      stergere ar fi creat chiar inregistrarea permanenta a identificatorului
      sters, iar omul n-ar mai fi putut deschide niciodata alt cont cu el.
    */
    if v_contact.id is not null then
      if exists (
        select 1 from privat.cont_cumparator c
         where c.id = v_contact.cont_id and c.sters_la is not null
      ) then
        delete from privat.cont_contact where id = v_contact.id;
        v_refolosesc := false;
      else
        v_refolosesc := true;
      end if;
    else
      v_refolosesc := false;
    end if;

    if v_refolosesc then
      /* Contactul exista si contul lui traieste: codul dovedeste ca e al lui. */
      v_cont := v_contact.cont_id;
      update privat.cont_contact set verificat_la = coalesce(verificat_la, now())
       where id = v_contact.id;
    else
      insert into privat.cont_cumparator (business_id) values (p_business) returning id into v_cont;
      insert into privat.cont_contact (cont_id, business_id, fel, valoare_bruta, valoare, verificat_la)
      values (v_cont, p_business, p_fel, p_destinatie_bruta, v_dest, now());
    end if;

    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
    values (p_business, v_cont, 'intrare', jsonb_build_object('fel', p_fel));

    return query select true, 'intrat', v_cont;
    return;
  end if;

  /*
    Adaugarea unui contact nou la un cont care exista deja.
    ⚠⚠ CODUL TREBUIE SA FI FOST CERUT DE CHIAR CONTUL ASTA. Altfel cineva pacalit
    sa transmita codul primit si-ar fi vazut contactul lipit de contul altcuiva.
  */
  if p_cont is null or v_cod.cont_id is distinct from p_cont then
    return query select false, 'alt-cont', null::uuid;
    return;
  end if;

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

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'contact-adaugat', jsonb_build_object('fel', p_fel));

  return query select true, 'adaugat', p_cont;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function privat.cont_normalizeaza(text, text)   from public, anon, authenticated;
revoke all on function privat.cont_inceputul_zilei()          from public, anon, authenticated;
revoke all on function public.cont_cere_cod(uuid, text, text, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.cont_verifica_cod(uuid, text, text, text, text, uuid)      from public, anon, authenticated;

grant execute on function public.cont_cere_cod(uuid, text, text, text, text, uuid, integer) to service_role;
grant execute on function public.cont_verifica_cod(uuid, text, text, text, text, uuid)      to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_cere_cod(uuid, text, text, text, text, uuid, integer)',
    'public.cont_verifica_cod(uuid, text, text, text, text, uuid)'
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
