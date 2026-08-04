-- ============================================================================
-- DE APLICAT **DUPA** CE CODUL AJUNGE IN PRODUCTIE. NU INAINTE.
--
-- CE S-A INTAMPLAT: migratiile de securitate au fost aplicate pe baza de date de
-- productie in timp ce jumatatea de cod care le insoteste statea in commituri
-- LOCALE, nepusate. Codul vechi scria cu clientul utilizatorului in coloane
-- tocmai revocate, deci s-au rupt trei fluxuri:
--     createBusiness (onboarding)   -> users_profile.plan / plan_expires_at
--     login cu MFA                  -> users_profile.mfa_*
--     conectare domeniu propriu     -> businesses.custom_domain
--   plus inregistrarea vizitelor    -> site_analytics INSERT
--
-- S-a aplicat un strat de compatibilitate care a redat exact acele coloane, ca
-- productia sa mearga. Gaura CRITICA (users_profile.role -> admin) a ramas
-- inchisa tot timpul, la fel si preluarea domeniului platformei (trigger nou).
--
-- Fisierul asta inchide la loc ce a fost redeschis temporar. Conditia:
--   git push  ->  deploy Vercel terminat  ->  abia apoi rulezi asta.
--
-- LECTIA: schema si codul sunt UN SINGUR lucru. Se livreaza impreuna.
-- ============================================================================

begin;

-- 1. Coloanele privilegiate, revocate la loc -------------------------------
revoke update (onboarding_completed, plan, plan_expires_at,
               mfa_otp, mfa_otp_expires_at, mfa_email_enabled)
  on table public.users_profile from authenticated, anon;

revoke update (custom_domain) on table public.businesses from authenticated, anon;

-- 2. Triggerul revine la lista completa ------------------------------------
create or replace function public.blocheaza_escaladare_users_profile()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('anon','authenticated') then return new; end if;
  if new.role is distinct from old.role
  or new.plan is distinct from old.plan
  or new.plan_interval is distinct from old.plan_interval
  or new.plan_expires_at is distinct from old.plan_expires_at
  or new.suspended_until is distinct from old.suspended_until
  or new.payment_failed_at is distinct from old.payment_failed_at
  or new.stripe_customer_id is distinct from old.stripe_customer_id
  or new.admin_notes is distinct from old.admin_notes
  or new.onboarding_completed is distinct from old.onboarding_completed
  or new.mfa_otp is distinct from old.mfa_otp
  or new.mfa_otp_expires_at is distinct from old.mfa_otp_expires_at
  or new.mfa_email_enabled is distinct from old.mfa_email_enabled
  or new.id is distinct from old.id then
    raise exception 'Camp privilegiat modificat din client (rol/plan/suspendare/facturare/MFA). Operatiune respinsa.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 3. Vizitele se scriu de pe server (service role), nu de vizitator ---------
drop policy if exists "Vizite doar pentru magazine publicate" on public.site_analytics;
revoke insert on table public.site_analytics from anon, authenticated;

commit;

-- ============================================================================
-- VERIFICARE DUPA APLICARE — atacurile trebuie sa PICE, fluxurile sa mearga:
--
--   DO $t$
--   DECLARE uid uuid; bid uuid; rez text := '';
--   BEGIN
--     SELECT b.user_id, b.id INTO uid, bid FROM public.businesses b
--      JOIN public.users_profile p ON p.id=b.user_id WHERE p.role <> 'admin' LIMIT 1;
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
--     BEGIN UPDATE public.users_profile SET role='admin' WHERE id=uid;
--       rez:=rez||'rol=DESCHIS(GRAV) '; EXCEPTION WHEN others THEN rez:=rez||'rol=BLOCAT '; END;
--     BEGIN UPDATE public.users_profile SET plan='ultra' WHERE id=uid;
--       rez:=rez||'plan=DESCHIS(GRAV) '; EXCEPTION WHEN others THEN rez:=rez||'plan=BLOCAT '; END;
--     BEGIN UPDATE public.users_profile SET mfa_email_enabled=false WHERE id=uid;
--       rez:=rez||'mfa=DESCHIS(GRAV) '; EXCEPTION WHEN others THEN rez:=rez||'mfa=BLOCAT '; END;
--     BEGIN UPDATE public.store_settings SET updated_at=now() WHERE business_id=bid;
--       rez:=rez||'setari=OK'; EXCEPTION WHEN others THEN rez:=rez||'setari=RUPT(GRAV)'; END;
--     RAISE EXCEPTION '>>> %', rez;
--   END $t$;
--
-- Asteptat: rol=BLOCAT plan=BLOCAT mfa=BLOCAT setari=OK
-- ============================================================================
