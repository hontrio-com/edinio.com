-- ============================================================================
-- CRITIC — Blocheaza auto-escaladarea de privilegii pe users_profile
--
-- PROBLEMA (dovedita live 2026-08-04, cu ROLLBACK):
--   Politica UPDATE de pe users_profile e `USING (auth.uid() = id)` fara
--   WITH CHECK si fara nicio restrictie de COLOANE, iar rolul `authenticated`
--   are UPDATE pe TOATE coloanele. Postgres verifica DOAR ce randuri poti
--   atinge, nu ce coloane. Deci orice utilizator logat poate rula, direct cu
--   cheia anon publica din frontend:
--
--     supabase.from('users_profile').update({ role: 'admin' }).eq('id', <id-ul lui>)
--
--   => devine admin de platforma (is_admin() = true imediat), ceea ce deschide
--      /admin, /api/admin/impersonate (login ca ORICE user) si toate rutele
--      admin care folosesc service_role peste TOATE magazinele.
--
--   Aceeasi gaura permite si:
--     plan = 'ultra', plan_expires_at = '2099-12-31'  => abonament gratuit
--     suspended_until = NULL                          => auto-desuspendare
--     payment_failed_at = NULL                        => scapa de dunning
--
-- SOLUTIA: doua straturi independente.
--   1) Revoca UPDATE la nivel de COLOANA si re-acorda doar coloanele benigne.
--   2) Un trigger BEFORE UPDATE care refuza orice schimbare a campurilor
--      privilegiate cand cererea NU vine de la service_role.
--   Stratul 2 acopera si cazul in care cineva re-acorda din greseala grantul.
-- ============================================================================

-- ############################################################################
-- PRERECHIZITE DE COD — TOATE APLICATE deja (04.08.2026, acelasi lot):
--
--   a) src/lib/actions/business.actions.ts  (createBusiness)
--      Parametrul `plan` a fost ELIMINAT din semnatura (era vulnerabilitate:
--      oricine trimitea `plan: 'ultra'` si primea planul cel mai scump gratuit).
--      Scrierea `onboarding_completed` / `plan` / `plan_expires_at` trece acum
--      prin createAdminClient(), iar trialul se acorda doar daca nu exista deja
--      un plan (ca sa nu suprascrie ce a scris webhook-ul Stripe).
--
--   b) src/lib/supabase/middleware.ts  (repairOnboardingFlag)
--      Repararea steagului invechit trece prin service role.
--
--   c) src/lib/actions/business.actions.ts  (updateBusiness)
--      Lista alba de coloane aplicata LA RULARE (tipul TypeScript nu proteja
--      nimic: `.update(data as any)` accepta orice cheie trimisa de client).
--
--   d) src/app/api/domains/connect/route.ts
--      Scrierile pe `custom_domain` trec prin service role, dupa validare.
-- ############################################################################

begin;

-- ---------------------------------------------------------------------------
-- 1. Granturi la nivel de coloana
-- ---------------------------------------------------------------------------
revoke update on table public.users_profile from authenticated, anon;

-- Doar campurile pe care utilizatorul are dreptul sa si le schimbe singur.
-- NU sunt incluse: role, plan, plan_interval, plan_expires_at, suspended_until,
-- payment_failed_at, stripe_customer_id, admin_notes, onboarding_completed, id.
grant update (
  full_name,
  avatar_url,
  announcements_seen_at,
  orders_seen_at,
  mfa_email_enabled,
  mfa_otp,
  mfa_otp_expires_at,
  onboarding_step,
  updated_at
) on table public.users_profile to authenticated;

-- anon nu are ce cauta sa scrie in profiluri (contul se creeaza prin auth).
revoke insert on table public.users_profile from anon;

-- ---------------------------------------------------------------------------
-- 2. Trigger de siguranta: campurile privilegiate se schimba DOAR de service_role
-- ---------------------------------------------------------------------------
-- ATENTIE: functia trebuie sa fie SECURITY INVOKER (implicit), NU DEFINER.
-- Intr-o functie SECURITY DEFINER, `current_user` devine PROPRIETARUL functiei,
-- deci verificarea de mai jos ar fi trecut intotdeauna si triggerul n-ar fi
-- blocat niciodata nimic. Cu SECURITY INVOKER, `current_user` este chiar rolul
-- sub care PostgREST executa cererea: `anon` sau `authenticated` pentru cererile
-- venite din browser cu cheia publica, `service_role` pentru createAdminClient(),
-- `postgres` pentru editorul SQL / migratii.
--
-- Blocam pe LISTA NEAGRA (anon + authenticated), nu pe lista alba: orice rol nou
-- de serviciu adaugat in viitor ramane functional, iar cele doua roluri expuse
-- public raman blocate — adica exact invers fata de riscul pe care il vrem.
create or replace function public.blocheaza_escaladare_users_profile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.role              is distinct from old.role
  or new.plan              is distinct from old.plan
  or new.plan_interval     is distinct from old.plan_interval
  or new.plan_expires_at   is distinct from old.plan_expires_at
  or new.suspended_until   is distinct from old.suspended_until
  or new.payment_failed_at is distinct from old.payment_failed_at
  or new.stripe_customer_id is distinct from old.stripe_customer_id
  or new.admin_notes       is distinct from old.admin_notes
  or new.onboarding_completed is distinct from old.onboarding_completed
  or new.id                is distinct from old.id then
    raise exception
      'Camp privilegiat modificat din client (rol/plan/suspendare/facturare). Operatiune respinsa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists users_profile_blocheaza_escaladare on public.users_profile;
create trigger users_profile_blocheaza_escaladare
  before update on public.users_profile
  for each row execute function public.blocheaza_escaladare_users_profile();

-- Functia de trigger nu trebuie apelabila ca RPC.
revoke execute on function public.blocheaza_escaladare_users_profile() from public;

-- ---------------------------------------------------------------------------
-- 2b. Aceeasi clasa de problema pe `businesses`
--
-- Politica e `ALL USING (auth.uid() = user_id)`, deci comerciantul isi atinge
-- doar propriul rand — dar in interiorul lui putea scrie ORICE coloana, iar
-- `updateBusiness` facea `.update(data as any)` cu obiectul primit de la client:
--   suspended_until = NULL  -> isi anula suspendarea / perioada de gratie
--   custom_domain           -> ocolea validarea si sincronizarea cu Vercel
--   slug                    -> isi muta magazinul pe alta adresa publica
-- Codul are acum lista alba la rulare (business.actions.ts); asta e stratul de
-- baza de date, care tine si daca apare maine un alt apelant.
-- ---------------------------------------------------------------------------
revoke update on table public.businesses from authenticated, anon;

grant update (
  business_name, store_name, tagline, description,
  phone, whatsapp, email, website,
  address, city, county,
  store_address, store_city, store_county,
  lat, lng,
  logo_url, cover_url, primary_color,
  social, gallery, features, is_published,
  niche_id, cui, reg_com,
  updated_at
) on table public.businesses to authenticated;

-- ---------------------------------------------------------------------------
-- 3. WITH CHECK explicit pe politica de UPDATE (nu se poate reasigna randul)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can update own profile" on public.users_profile;
create policy "Users can update own profile" on public.users_profile
  for update to authenticated
  using  (auth.uid() = id)
  with check (auth.uid() = id);

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


-- ============================================================================
-- VERIFICARE (ruleaza dupa aplicare — trebuie sa DEA EROARE, nu sa reuseasca):
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<un-user-id>","role":"authenticated"}';
--   update public.users_profile set role='admin' where id='<acelasi-id>';
--   rollback;
--
-- Rezultat asteptat: ERROR 42501 (fie din grantul de coloana, fie din trigger).
--
-- Si verifica sa NU se fi rupt fluxul normal:
--   update public.users_profile set full_name='Test' where id='<acelasi-id>';  -- trebuie sa MEARGA
-- ============================================================================
