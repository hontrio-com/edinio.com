-- ============================================================================
-- DE APLICAT **DUPA** CE CODUL AJUNGE IN PRODUCTIE. NU INAINTE.
--
-- Restrictiva (REVOKE SELECT). Vezi incidentul din 04.08.2026: o migratie
-- restrictiva aplicata inaintea codului a oprit onboarding-ul, MFA si domeniile.
--
-- CE REZOLVA: `users_profile` are SELECT deschis pentru `authenticated` pe TOATE
-- coloanele, si politica RLS ii da randul propriu. Deci orice comerciant putea
-- citi, direct din browser cu cheia anon publica:
--
--   supabase.from('users_profile').select('admin_notes, stripe_customer_id, role')
--           .eq('id', <id-ul lui>)
--
-- `admin_notes` sunt notitele INTERNE ale platformei despre acel client — scrise
-- de administratori la suspendari si reclamatii, si nemenite ochilor lui.
-- `mfa_otp` e hash-ul codului in curs. Ingustarea proiectiei din settings/page.tsx
-- a scos datele din payload-ul paginii, dar NU a inchis calea directa; asta o face.
--
-- PRERECHIZITA DE COD (livrata in acelasi lot):
--   src/app/(dashboard)/dashboard/settings/page.tsx nu mai face `select("*")`.
--   Am verificat ca nicio alta interogare cu clientul utilizatorului nu cere
--   coloanele de mai jos: panoul de admin foloseste service role
--   (createAdminClient), care nu e afectat de revocare.
-- ============================================================================

begin;

revoke select (admin_notes, mfa_otp, mfa_otp_expires_at, stripe_customer_id)
  on table public.users_profile from authenticated, anon;

commit;

-- ============================================================================
-- VERIFICARE (atacul trebuie sa PICE, ecranul de setari sa MEARGA):
--
--   DO $t$
--   DECLARE uid uuid; rez text := '';
--   BEGIN
--     SELECT id INTO uid FROM public.users_profile WHERE role <> 'admin' LIMIT 1;
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
--     BEGIN PERFORM admin_notes FROM public.users_profile WHERE id=uid;
--       rez := rez || 'admin_notes=CITIBIL(GRAV) ';
--     EXCEPTION WHEN others THEN rez := rez || 'admin_notes=BLOCAT '; END;
--     BEGIN PERFORM mfa_otp FROM public.users_profile WHERE id=uid;
--       rez := rez || 'mfa_otp=CITIBIL(GRAV) ';
--     EXCEPTION WHEN others THEN rez := rez || 'mfa_otp=BLOCAT '; END;
--     BEGIN PERFORM full_name, plan, plan_expires_at, mfa_email_enabled
--             FROM public.users_profile WHERE id=uid;
--       rez := rez || 'ecran_setari=OK';
--     EXCEPTION WHEN others THEN rez := rez || 'ecran_setari=RUPT(GRAV)'; END;
--     RAISE EXCEPTION '>>> %', rez;
--   END $t$;
--
-- Asteptat: admin_notes=BLOCAT mfa_otp=BLOCAT ecran_setari=OK
-- ============================================================================
