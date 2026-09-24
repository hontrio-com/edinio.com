-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 15: „Datele mele", reparatiile din verificarea
-- de dinaintea unirii                                           (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Numele are `zz-` ca sa vina, ordonat dupa nume, DUPA migratiile 13 si 14 din
-- aceeasi zi (`...-parola.sql`, `...-z-anonimizarea.sql`): redefineste
-- `cont_verifica_cod`, pe care o defineste si 13.
--
-- Intrebat de proprietar inainte de unire: „Functiile alea de la Datele mele cu
-- SESIUNI, DESCARCA DATELE, ETC... FUNCTIONEAZA CUM TREBUIE?". Trei anchetatori si
-- cate un sceptic pe fiecare problema au gasit, confirmat:
--
--  1. „Iesi de pe toate dispozitivele" nu uita dispozitivele TINUTE MINTE 60 de
--     zile: omul care iese de peste tot fiindca si-a pierdut telefonul lasa pe el
--     intrarea cu parola fara cod.
--  2. Exportul datelor („Descarca datele mele") se oprea la 100 de comenzi si
--     dadea numai rezumatul lor (numar, data, total), fara adresa, plata, factura.
--     Acum da TOATE comenzile, fiecare cu detaliul ei, prin aceeasi functie ca
--     ecranul comenzii (`cont_comanda_mea`), deci cu aceeasi vedere (redusa sau
--     intreaga) pe care o arata si contul.
--  3. Regula „nu poti scoate ultimul contact" numara si telefoanele, desi intrarea,
--     resetarea parolei si pasul doi merg NUMAI pe email. Un cont cu un email si un
--     telefon si-ar fi putut scoate emailul si ar fi ramas fara nicio cale de
--     intrare.
--  4. Omul care a oprit emailurile din Preferinte si apoi adauga o adresa noua:
--     preferinta arata tot „oprit", dar adresa noua primea mesaje. Alegerea se
--     muta acum si pe adresa noua.

-- ═══ 1. Iesirea de peste tot uita si dispozitivele ════════════════════════

create or replace function public.cont_iesi_de_peste_tot(p_business uuid, p_cont uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update privat.cont_cumparator set epoca_sesiunii = epoca_sesiunii + 1
   where id = p_cont and business_id = p_business;
  /* ⚠ Si dispozitivele tinute minte: altfel pe ele se intra mai departe numai cu parola. */
  delete from privat.cont_dispozitiv d where d.cont_id = p_cont and d.business_id = p_business;
  insert into privat.cont_jurnal (business_id, cont_id, fapta)
  values (p_business, p_cont, 'iesire-de-peste-tot');
end $$;

-- ═══ 2. Exportul: toate comenzile, cu detaliul lor ════════════════════════
--
-- ⚠ Fiecare camp se scrie de mana, niciodata `to_jsonb` pe un rand din `privat`:
-- `cont_cumparator` poarta de la migratia 13 si amprenta parolei. Comenzile trec
-- prin `cont_comanda_mea`, deci poarta aceeasi vedere ca pe ecran (o comanda
-- legata doar pe numar ramane REDUSA si in export).

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
        'fapta', j.fapta, 'detalii', j.detalii, 'ip', j.ip, 'creat_la', j.creat_la) order by j.creat_la), '[]'::jsonb)
      from privat.cont_jurnal j where j.business_id = p_business and j.cont_id = p_cont)
  );
$$;

-- ═══ 3. Ultimul contact = ultimul EMAIL confirmat ═════════════════════════

create or replace function public.cont_sterge_contact(p_business uuid, p_cont uuid, p_fel text, p_valoare text)
returns table (ok boolean, motiv text)
language plpgsql security definer set search_path = '' as $$
declare v_dest text; v_ramase integer;
begin
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

-- ═══ 4. Adresa noua mosteneste alegerea „fara emailuri" ════════════════════

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

  select coalesce(sum(x.incercari), 0) into v_incercari
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest
     and x.folosit_la is null and x.expira_la > now();
  if v_incercari >= 5 then
    return query select false, 'prea-multe-incercari', null::uuid;
    return;
  end if;

  select * into v_cod
    from privat.cont_cod x
   where x.business_id = p_business and x.scop = p_scop
     and x.fel = p_fel and x.destinatie = v_dest
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
        where x.business_id = p_business and x.scop = p_scop
          and x.fel = p_fel and x.destinatie = v_dest
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
     and c.fel = p_fel and c.destinatie = v_dest and c.folosit_la is null;

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

-- ═══ Drepturile ═══════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_iesi_de_peste_tot(uuid, uuid)',
    'public.cont_export(uuid, uuid)',
    'public.cont_sterge_contact(uuid, uuid, text, text)',
    'public.cont_verifica_cod(uuid, text, text, text, text, uuid)'
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
