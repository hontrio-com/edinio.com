-- ============================================================================
-- RIDICAT — Al doilea factor devine o proprietate a SESIUNII, nu un cod in curs
--
-- PROBLEMA (audit 05.08.2026, constatarile 1 si 2):
--   `login()` cheama `signInWithPassword` INAINTE de a cere codul, deci
--   cookie-urile de sesiune Supabase sunt deja valide cand omul e trimis la
--   /login/mfa. Singura poarta reala statea in layout-ul de /dashboard si
--   raspundea la intrebarea gresita: „exista o provocare MFA neexpirata?".
--   De aici trei gauri:
--     1. /api/** si actiunile de server nu verificau nimic (proxy-ul excludea
--        `api/` din matcher, iar un layout nu se randeaza la un apel de API);
--     2. dupa 10 minute provocarea expira, iar „expirat" insemna „liber" —
--        atacatorul cu parola astepta si intra;
--     3. /admin e alt grup de rute, unde poarta din layout nu ruleaza deloc.
--
-- SEMANTICA NOUA: „sesiunea ACEASTA a fost confirmata cu al doilea factor?".
--   `mfa_confirmat_la`       — CAND s-a confirmat (urma pentru operatiuni/audit)
--   `mfa_sesiune_confirmata` — CARE sesiune a fost confirmata (`session_id` din
--                              JWT-ul Supabase)
--
-- DE CE DOUA COLOANE, si nu doar data: o data singura raspunde la „s-a confirmat
-- vreodata", nu la „s-a confirmat sesiunea asta". O confirmare veche de trei luni
-- ar valida o sesiune deschisa azi de un atacator cu parola — adica exact atacul
-- pe care MFA il apara. `session_id` e stabil pe toata durata sesiunii (se pastreaza
-- peste reimprospatarile de token), deci leaga confirmarea de sesiunea reala.
--
-- ORDINEA DE LIVRARE: migratia asta e ADITIVA (adauga doua coloane, nu revoca
-- nimic existent), deci se aplica INAINTE de deploy fara sa strice codul vechi —
-- care pur si simplu ignora coloanele noi. Invers NU merge: codul nou citeste
-- coloanele si, cat timp lipsesc, conturile cu MFA raman blocate.
-- Vezi incidentul din 04.08.2026 (migratii-si-cod-impreuna).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Coloanele
-- ---------------------------------------------------------------------------
alter table public.users_profile
  add column if not exists mfa_confirmat_la       timestamptz,
  add column if not exists mfa_sesiune_confirmata text;

comment on column public.users_profile.mfa_confirmat_la is
  'Cand a fost confirmat ultima data al doilea factor. Se pune pe NULL la fiecare login cu MFA pornit si pe now() la verificarea reusita. Scriere DOAR prin service role.';
comment on column public.users_profile.mfa_sesiune_confirmata is
  'session_id-ul (din JWT) sesiunii care a trecut de al doilea factor. Poarta compara aceasta valoare cu sesiunea cererii curente. Scriere DOAR prin service role.';

-- ---------------------------------------------------------------------------
-- 2. Coloane PRIVILEGIATE — clientul nu le scrie si nu le citeste
--
-- Nu e nevoie de niciun `grant` aici, si asta e intentionat: pe users_profile
-- granturile de SELECT si de UPDATE pentru `authenticated` sunt deja pe LISTA
-- ALBA de coloane (2026-08-04-blocare-escaladare-rol.sql pentru UPDATE,
-- 2026-08-04-DUPA-DEPLOY-coloane-profil.sql pentru SELECT), iar grantul pe TABEL
-- a fost revocat. O coloana noua ramane deci inaccesibila din client prin simpla
-- ei absenta din liste — exact ce vrem.
--
-- Revocarile de mai jos sunt, in starea de azi, fara efect practic (nu exista
-- grant de sters). Le pastram fiindca documenteaza intentia si fiindca daca
-- cineva re-acorda vreodata grantul pe TABEL, prezenta lor aici arata clar ca
-- aceste doua coloane nu au voie sa intre in el.
-- ---------------------------------------------------------------------------
revoke select (mfa_confirmat_la, mfa_sesiune_confirmata)
  on table public.users_profile from authenticated, anon;
revoke update (mfa_confirmat_la, mfa_sesiune_confirmata)
  on table public.users_profile from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Al doilea strat: acelasi trigger care pazeste rolul, planul si MFA
--
-- DE CE, desi coloanele nu sunt in lista alba de UPDATE: grantul e un singur
-- strat, si a fost re-acordat din greseala cel putin o data (04.08.2026, stratul
-- de compatibilitate). Fara triggerul asta, o astfel de re-acordare ar da
-- utilizatorului posibilitatea sa-si scrie singur, cu cheia anon din browser:
--     update users_profile
--        set mfa_confirmat_la = now(),
--            mfa_sesiune_confirmata = <session_id-ul lui, citibil din JWT>
-- adica sa-si confirme singur al doilea factor fara sa vada vreun cod.
-- Lista de mai jos e cea din 2026-08-04-DUPA-DEPLOY-restrange.sql plus cele doua
-- coloane noi.
-- ---------------------------------------------------------------------------
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
  or new.mfa_confirmat_la is distinct from old.mfa_confirmat_la
  or new.mfa_sesiune_confirmata is distinct from old.mfa_sesiune_confirmata
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
-- PostgREST tine in cache privilegiile pe coloane SI forma schemei. Fara
-- reincarcare, o cerere care numeste o coloana proaspat adaugata e respinsa desi
-- in baza coloana EXISTA — iar supabase-js intoarce `data: null` cu `error`
-- setat, deci codul care nu verifica `error` vede pur si simplu „nu exista nimic".
--
-- Asa s-a rupt autentificarea cu MFA pe 04.08.2026: codul era scris in baza si
-- valabil, dar citirea intorcea gol, iar utilizatorul primea „Codul a expirat".
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- VERIFICARE DUPA APLICARE — atacul trebuie sa PICE, fluxul normal sa MEARGA:
--
--   DO $t$
--   DECLARE uid uuid; rez text := '';
--   BEGIN
--     SELECT id INTO uid FROM public.users_profile WHERE role <> 'admin' LIMIT 1;
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims',
--             json_build_object('sub',uid,'role','authenticated')::text, true);
--     BEGIN UPDATE public.users_profile SET mfa_confirmat_la = now() WHERE id=uid;
--       rez:=rez||'auto_confirmare=DESCHIS(GRAV) ';
--     EXCEPTION WHEN others THEN rez:=rez||'auto_confirmare=BLOCAT '; END;
--     BEGIN UPDATE public.users_profile SET mfa_sesiune_confirmata='x' WHERE id=uid;
--       rez:=rez||'auto_sesiune=DESCHIS(GRAV) ';
--     EXCEPTION WHEN others THEN rez:=rez||'auto_sesiune=BLOCAT '; END;
--     BEGIN PERFORM mfa_confirmat_la FROM public.users_profile WHERE id=uid;
--       rez:=rez||'citire=DESCHIS(minor) ';
--     EXCEPTION WHEN others THEN rez:=rez||'citire=BLOCAT '; END;
--     BEGIN UPDATE public.users_profile SET full_name='Test' WHERE id=uid;
--       rez:=rez||'nume=OK';
--     EXCEPTION WHEN others THEN rez:=rez||'nume=RUPT(GRAV)'; END;
--     RAISE EXCEPTION '>>> %', rez;
--   END $t$;
--
-- Asteptat: auto_confirmare=BLOCAT auto_sesiune=BLOCAT citire=BLOCAT nume=OK
-- ============================================================================
