-- ============================================================================
-- CRITIC — Campurile MFA nu mai pot fi scrise din client
--
-- PROBLEMA: `mfa_otp`, `mfa_otp_expires_at` si `mfa_email_enabled` stau pe randul
-- propriu al utilizatorului, iar politica de UPDATE ii da acces la randul lui.
-- Momentul cheie: dupa `signInWithPassword` sesiunea E DEJA VALIDA — al doilea
-- factor doar intarzie redirectarea, nu tine sesiunea inchisa. Deci un atacator
-- care avea NUMAI parola putea, cu cheia anon publica:
--
--   update users_profile set mfa_email_enabled = false where id = <al lui>
--     -> stinge complet al doilea factor
--
--   update users_profile set mfa_otp = <sha256 de "123456">,
--                            mfa_otp_expires_at = <viitor> where id = <al lui>
--     -> isi alege singur codul, apoi il introduce
--
-- Aplicat si verificat in productie 04.08.2026:
--   stinge_mfa=BLOCAT  seteaza_cod=BLOCAT  nume=OK
--
-- Scrierile legitime trec prin service role (vezi `scrieCampuriMfa` din
-- src/lib/actions/auth.actions.ts).
-- ============================================================================

begin;

revoke update (mfa_otp, mfa_otp_expires_at, mfa_email_enabled)
  on table public.users_profile from authenticated, anon;

-- Al doilea strat: acelasi trigger care pazeste rolul si planul.
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

commit;

-- ----------------------------------------------------------------------------
-- OBLIGATORIU dupa orice GRANT/REVOKE pe coloane.
--
-- PostgREST tine in cache privilegiile pe coloane. Fara reincarcare, o cerere
-- care numeste o coloana proaspat re-acordata poate fi respinsa desi in baza
-- dreptul EXISTA — iar supabase-js intoarce `data: null` cu `error` setat, deci
-- codul care nu verifica `error` vede pur si simplu „nu exista nimic".
--
-- Asa s-a rupt autentificarea cu MFA pe 04.08.2026: codul era scris in baza si
-- valabil, dar citirea intorcea gol, iar utilizatorul primea „Codul a expirat".
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

