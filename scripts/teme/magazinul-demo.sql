-- ═══════════════════════════════════════════════════════════════════════════
-- MAGAZINUL DEMO AL TEMEI JUPITER (etapa 19.3 din `docs/editor-magazin/PLAN.md`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contul tehnic si magazinul `tema-jupiter`, servit pe `jupiter.edinio.com` (`src/proxy.ts`, `lib/teme/gazde-demo.ts`).
-- Pe baza demo exista din etapa 16.1. In PRODUCTIE se ruleaza o singura data, LA PUSH, cu acordul lui (REGISTRU),
-- apoi `scripts/teme/seamana-demo.ts jupiter --productie` il umple: categoriile, produsele, designul temei si semnul
-- `magazin_demo` (fara comenzi, etapa 19.2).
--
-- Se poate rula din nou: ce exista nu se atinge, afara de plan (tinut pe Ultra: un plan expirat ar inchide vitrina).
-- Parola contului e o amprenta pe care n-o stie nimeni, deci in cont nu intra nimeni. Tiparul contului e cel din
-- `demo-seed/00-baza.sql`.
--
-- Declansatoarele, citite in productie pe 29.10.2026: `on_auth_user_created` face profilul; pe `businesses`, doar
-- `updated_at` si paza domeniilor platformei; pe `privat.store_settings`, doar `updated_at`. Niciun email nu pleaca.

do $$
declare
  email_cont constant text := 'teme@edinio-demo.test';
  slug_magazin constant text := 'tema-jupiter';
  cont uuid;
  magazin uuid;
begin
  select id into cont from auth.users where email = email_cont;
  if cont is null then
    cont := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', cont, 'authenticated', 'authenticated', email_cont,
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Teme Edinio"}'::jsonb, now(), now(),
      '', '', '', '', '', '', '', ''
    );
    -- `email` din auth.identities e coloana GENERATA din identity_data.
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (cont::text, cont,
            jsonb_build_object('sub', cont::text, 'email', email_cont, 'email_verified', true, 'phone_verified', false),
            'email', now(), now());
  end if;

  -- Profilul il face declansatorul; aici doar planul.
  update public.users_profile set plan = 'ultra', plan_expires_at = '2099-12-31 00:00:00+00' where id = cont;
  if not found then
    raise exception 'Profilul contului tehnic lipseste: declansatorul on_auth_user_created n-a rulat?';
  end if;

  select id into magazin from public.businesses where slug = slug_magazin;
  if magazin is null then
    insert into public.businesses (
      user_id, slug, type, business_name, store_name, tagline, description, email, phone,
      address, city, county, social, gallery, features, primary_color, is_published
    ) values (
      cont, slug_magazin, 'ministore', 'Jupiter Bricolaj', 'Jupiter Bricolaj', 'Tot ce-ți trebuie pentru casă și grădină',
      'Magazin demonstrativ al temei Jupiter: scule, vopsele, mobilă, grădină, construcții, sanitare și iluminat.',
      'jupiter@edinio-demo.test', '0700 000 000', 'Strada Exemplului 1', 'București', 'București',
      '{}', '[]', '{}', '#215196', true
    ) returning id into magazin;
  elsif not exists (select 1 from public.businesses where id = magazin and user_id = cont) then
    -- Slugurile `tema-*` sunt rezervate din etapa 19, dar unul luat INAINTE n-are voie sa fie preluat.
    raise exception 'Slugul % e al altui cont: nu se atinge nimic.', slug_magazin;
  end if;

  insert into privat.store_settings (business_id) values (magazin) on conflict (business_id) do nothing;
end $$;

-- Verificarea: contul, planul, magazinul publicat, setarile, fara domeniu propriu.
select b.slug, b.is_published, b.custom_domain, up.plan, up.plan_expires_at,
       (select count(*) from privat.store_settings s where s.business_id = b.id) as setari
  from public.businesses b
  join public.users_profile up on up.id = b.user_id
 where b.slug = 'tema-jupiter';
