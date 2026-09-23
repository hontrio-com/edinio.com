-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 7: preferintele de comunicare     (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ ECRANUL ASTA NU ADAUGA O PROMISIUNE, O FACE ADEVARATA PE CEA DEJA
-- PUBLICATA. `src/lib/policy-templates.ts` scrie, pe pagina de confidentialitate
-- a FIECARUI magazin, dreptul de opozitie si retragerea consimtamantului. Pana
-- acum omul n-avea de unde sa le exercite: singurul drum era linkul de
-- dezabonare dintr-un email pe care putea sa nu-l mai aiba.
--
-- ⚠ Si e cel mai ieftin ecran din tot valul: datele exista deja, in
-- `recovery_optout` si `sms_optout`, cheiate pe EXACT contactele pe care contul
-- le verifica.
--
-- ⚠⚠ SE LUCREAZA NUMAI PE CONTACTELE VERIFICATE. Un contact adaugat si
-- neconfirmat nu poate dezabona pe nimeni: altfel cineva si-ar fi putut scrie in
-- cont adresa altui om si i-ar fi oprit mesajele.

create or replace function public.cont_preferinte(
  p_business uuid, p_cont uuid
) returns table (primeste_email boolean, primeste_sms boolean, are_email boolean, are_telefon boolean)
language sql stable security definer set search_path = '' as $fn$
  with c as (
    select x.fel, x.valoare
      from privat.cont_contact x
     where x.business_id = p_business and x.cont_id = p_cont and x.verificat_la is not null
  )
  select
    not exists (
      select 1 from public.recovery_optout o
       where o.business_id = p_business
         and o.email is not null
         and lower(btrim(o.email)) in (select valoare from c where fel = 'email')
    ),
    /* ⚠ Comparatia trece prin `normalize_phone` pe AMANDOUA partile: randurile
       vechi din `sms_optout` pot fi scrise in alta forma decat cea normalizata,
       iar o potrivire pe sirul brut ar fi spus „primesti SMS-uri" unui om care
       raspunsese STOP. */
    not exists (
      select 1 from public.sms_optout o
       where o.business_id = p_business
         and public.normalize_phone(o.phone) in (select valoare from c where fel = 'telefon')
    ),
    exists (select 1 from c where fel = 'email'),
    exists (select 1 from c where fel = 'telefon');
$fn$;

create or replace function public.cont_preferinte_schimba(
  p_business uuid, p_cont uuid, p_canal text, p_vrea boolean
) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if p_canal = 'email' then
    if p_vrea then
      delete from public.recovery_optout o
       where o.business_id = p_business
         and o.email is not null
         and lower(btrim(o.email)) in (
           select x.valoare from privat.cont_contact x
            where x.business_id = p_business and x.cont_id = p_cont
              and x.fel = 'email' and x.verificat_la is not null
         );
    else
      insert into public.recovery_optout (business_id, email, motiv)
      select p_business, x.valoare, 'dezabonare'
        from privat.cont_contact x
       where x.business_id = p_business and x.cont_id = p_cont
         and x.fel = 'email' and x.verificat_la is not null
         and not exists (
           select 1 from public.recovery_optout o
            where o.business_id = p_business and lower(btrim(coalesce(o.email,''))) = x.valoare
         );
    end if;
  elsif p_canal = 'sms' then
    if p_vrea then
      delete from public.sms_optout o
       where o.business_id = p_business
         and public.normalize_phone(o.phone) in (
           select x.valoare from privat.cont_contact x
            where x.business_id = p_business and x.cont_id = p_cont
              and x.fel = 'telefon' and x.verificat_la is not null
         );
    else
      insert into public.sms_optout (business_id, phone, sursa)
      select p_business, x.valoare, 'cerere din cont'
        from privat.cont_contact x
       where x.business_id = p_business and x.cont_id = p_cont
         and x.fel = 'telefon' and x.verificat_la is not null
         and not exists (
           select 1 from public.sms_optout o
            where o.business_id = p_business and public.normalize_phone(o.phone) = x.valoare
         );
    end if;
  else
    raise exception 'canal necunoscut: %', p_canal;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'preferinte', jsonb_build_object('canal', p_canal, 'vrea', p_vrea));
end $fn$;

revoke all on function public.cont_preferinte(uuid, uuid)                     from public, anon, authenticated;
revoke all on function public.cont_preferinte_schimba(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cont_preferinte(uuid, uuid)                     to service_role;
grant execute on function public.cont_preferinte_schimba(uuid, uuid, text, boolean) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_preferinte(uuid, uuid)',
    'public.cont_preferinte_schimba(uuid, uuid, text, boolean)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
