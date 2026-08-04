-- ============================================================================
-- ULTIMA migratie restrictiva. DE APLICAT **DUPA** deploy-ul commitului cefe19d.
--
-- CE INCHIDE: `mfa_otp` e hash-ul codului MFA in curs. Citibil de proprietarul
-- randului, devenea unealta pentru chiar atacul de care MFA apara: cine are
-- parola primeste deja o sesiune valida (al doilea factor doar intarzie
-- redirectarea), isi citeste hash-ul si sparge 6 cifre offline in sub o secunda.
--
-- PRERECHIZITA DE COD, livrata in cefe19d: toate cele cinci citiri au trecut pe
-- service role — `citesteCampuriMfa` din auth.actions.ts (4 apelanti) si
-- layout-ul de dashboard, care citeste provocarea doar cand `mfa_email_enabled`
-- e adevarat. Verificat prin grep: nicio citire cu clientul utilizatorului.
--
-- ATENTIE la mecanica, greseala facuta o data azi: revocarea pe COLOANA nu are
-- efect cat timp exista grantul pe TABEL. Se revoca tabelul si se re-acorda
-- coloanele permise — de aceea lista de mai jos e completa si trebuie sa ramana
-- sincronizata cu ce citeste codul.
-- ============================================================================

begin;

revoke select on table public.users_profile from authenticated;

-- Tot ce citeste codul cu clientul utilizatorului. FARA admin_notes (revocat deja
-- azi), FARA mfa_otp si mfa_otp_expires_at (obiectul acestei migratii).
grant select (
  id, full_name, avatar_url, created_at, updated_at,
  plan, plan_interval, plan_expires_at, payment_failed_at, stripe_customer_id,
  role, suspended_until,
  onboarding_completed, onboarding_step,
  announcements_seen_at, orders_seen_at,
  mfa_email_enabled
) on table public.users_profile to authenticated;

commit;

-- ============================================================================
-- VERIFICARE (atacul trebuie sa PICE, autentificarea sa MEARGA):
--
--   DO $t$
--   DECLARE uid uuid; rez text := '';
--   BEGIN
--     SELECT id INTO uid FROM public.users_profile WHERE role <> 'admin' LIMIT 1;
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
--     BEGIN PERFORM mfa_otp FROM public.users_profile WHERE id=uid;
--       rez := rez || 'mfa_otp=CITIBIL(GRAV) ';
--     EXCEPTION WHEN others THEN rez := rez || 'mfa_otp=BLOCAT '; END;
--     BEGIN PERFORM admin_notes FROM public.users_profile WHERE id=uid;
--       rez := rez || 'admin_notes=CITIBIL(GRAV) ';
--     EXCEPTION WHEN others THEN rez := rez || 'admin_notes=BLOCAT '; END;
--     BEGIN PERFORM full_name, plan, role, onboarding_completed, plan_expires_at,
--                   orders_seen_at, payment_failed_at, mfa_email_enabled, stripe_customer_id
--             FROM public.users_profile WHERE id=uid;
--       rez := rez || 'dashboard+setari+stripe=OK';
--     EXCEPTION WHEN others THEN rez := rez || 'ECRANE=RUPTE(GRAV)'; END;
--     RAISE EXCEPTION '>>> %', rez;
--   END $t$;
--
-- Asteptat: mfa_otp=BLOCAT admin_notes=BLOCAT dashboard+setari+stripe=OK
--
-- SI, MANUAL: porneste MFA pe un cont de test, deconecteaza-te si reconecteaza-te.
-- Codul pe email trebuie sa ajunga si sa fie acceptat.
-- ============================================================================
