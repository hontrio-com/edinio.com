-- ============================================================================
-- MEDIU (constatarea 5) — vederea public.store_settings decripteaza credentialele
-- si oricine are o sesiune de comerciant le poate citi IN CLAR din browser
--
-- PROBLEMA: `public.store_settings` nu mai e tabel, e o VEDERE cu
-- `security_invoker = true` peste `privat.store_settings`, iar definitia ei
-- aplica `privat.decripteaza_config(...)` pe fiecare coloana `*_config`. Grantul
-- de SELECT catre `anon, authenticated` a fost mostenit de la vechiul tabel.
-- Deci, cu cheia publica din pachetul JS:
--
--     supabase.from('store_settings').select('*')
--
-- intoarce IN CLAR parolele de curier (FAN/DPD/Cargus/Sameday), `netopia_config
-- .api_key` + `pos_signature`, `ipay_config.password`, `klarna_config.password`,
-- `revolut_config.secret_key`, `smartbill_config.token`, `oblio_config
-- .client_secret`, `fgo_config.private_key`, `smso_config.api_key`,
-- `notice_config.api_token`, `email_config.smtp.pass`, cheile Mailchimp/Brevo/
-- Klaviyo si `refresh_token`-urile Google/OLX.
--
-- Politica de pe tabelul din spate e owner-only, deci NU e scurgere intre
-- chiriasi. Dar criptarea la repaus (9bdeaa8) si mascarea write-only (b1d6102) au
-- fost construite EXACT pentru amenintarea pe care o numesc in propriile lor
-- comentarii — „orice XSS pe dashboard, orice extensie de browser, o sesiune
-- imprumutata" — si pe drumul asta nu blocheaza nimic. Cu credentialele scoase,
-- se emit AWB-uri, se trimit facturi si se citeste posta comerciantului fara sa
-- se mai treaca vreodata prin Edinio.
--
-- ---------------------------------------------------------------------------
-- DE CE ASA, si nu cum propune auditul
--
-- Auditul cere `revoke select` pe coloanele `*_config` pentru `anon` si
-- `authenticated`. Nu se poate aplica asa: cu granturi pe coloane, orice
-- `select("*")` pe store_settings pica INTREG cu „permission denied", iar in cod
-- exista zeci de citiri cu clientul utilizatorului, inclusiv `select("*")`
-- (media.actions.ts) si toate paginile de panou. Ar fi fost 04.08.2026 din nou,
-- pe o suprafata de zece ori mai mare.
--
-- Solutia de aici muta decizia in FUNCTIA DE DECRIPTARE: pentru rolurile de
-- client, `decripteaza_config` nu mai decripteaza, ci intoarce valoarea asa cum e
-- in baza. Consecinte:
--
--   - NICIO interogare nu se rupe. Forma raspunsului e identica, `select("*")`
--     merge, coloanele exista, tipurile sunt aceleasi.
--   - Ce primeste browserul in loc de parola e sirul `enc.v1.…`: NEGOL, deci
--     verificarile de tipul „e configurat?" din interfata raspund in continuare
--     corect, si INUTILIZABIL, fiindca cheia sta in Vault.
--   - Service role — adica `createAdminClient()` — primeste in continuare valorile
--     in clar. Acolo se muta tot codul care chiar are nevoie de secret.
--
-- Verificarea se face pe `current_user in ('anon','authenticated')`, nu pe
-- `= 'service_role'`, ca migratiile si consola SQL (rulate ca `postgres`) sa
-- vada in continuare datele. Aceeasi conventie ca in triggerul
-- `blocheaza_escaladare_users_profile`.
--
-- ---------------------------------------------------------------------------
-- DE CE „DUPA DEPLOY". OBLIGATORIU IN ORDINEA ASTA.
--
-- Codul care foloseste efectiv secretele trebuie sa treaca INTAI pe
-- `createAdminClient()`. Aplicata inainte, migratia nu da erori de permisiune —
-- da ceva mai rau: apeluri catre furnizori facute cu sirul `enc.v1.…` pe post de
-- parola, adica AWB-uri, SMS-uri si facturi respinse de partener, cu mesaje care
-- nu spun nimic despre cauza.
--
-- Locurile care citesc credentiale cu clientul utilizatorului si au fost mutate
-- pe service role sunt enumerate in commit-ul care insoteste fisierul asta.
-- ============================================================================

begin;

create or replace function privat.decripteaza_config(p_cfg jsonb, p_cai text[])
returns jsonb
language plpgsql
stable
set search_path to 'extensions', 'public', 'pg_temp'
as $function$
declare cale text; parti text[]; v text; d text; r jsonb := p_cfg;
begin
  /*
   * Rolurile de client NU primesc valorile in clar.
   *
   * Vederea `public.store_settings` e `security_invoker`, deci functia asta
   * ruleaza cu rolul apelantului: `anon`/`authenticated` cand cererea vine din
   * browser SAU de pe server cu clientul utilizatorului, `service_role` cand vine
   * prin `createAdminClient()`. Iesirea devreme de aici e singurul loc in care se
   * ia decizia, si de aceea nu se rupe nicio interogare: forma raspunsului ramane
   * neschimbata, doar continutul campurilor secrete ramane cifrat.
   */
  if current_user in ('anon', 'authenticated') then return p_cfg; end if;

  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then return p_cfg; end if;
  foreach cale in array p_cai loop
    parti := string_to_array(cale, '.');
    if jsonb_typeof(r #> parti) = 'string' then
      v := r #>> parti;
      if v like 'enc.v1.%' then
        d := privat.decripteaza(v);
        r := jsonb_set(r, parti, to_jsonb(coalesce(d, '')));
      end if;
    end if;
  end loop;
  return r;
end $function$;

commit;

-- Vederea nu se schimba, deci PostgREST nu are ce reincarca la nivel de schema;
-- reincarcam totusi, ca planurile pregatite sa nu ramana pe corpul vechi.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICARE DUPA APLICARE — ambele jumatati, nu doar prima:
--
--   -- 1. Clientul NU mai vede secretul (inlocuieste uid cu un proprietar real):
--   DO $t$
--   DECLARE uid uuid; v text;
--   BEGIN
--     SELECT b.user_id INTO uid FROM public.businesses b
--       JOIN privat.store_settings s ON s.business_id = b.id
--      WHERE s.fan_courier_config->>'password' LIKE 'enc.v1.%' LIMIT 1;
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims',
--             json_build_object('sub',uid,'role','authenticated')::text, true);
--     SELECT fan_courier_config->>'password' INTO v FROM public.store_settings LIMIT 1;
--     IF v LIKE 'enc.v1.%' THEN RAISE EXCEPTION '>>> BLOCAT, cum trebuie';
--     ELSE RAISE EXCEPTION '>>> DESCHIS (GRAV): a iesit in clar';
--     END IF;
--   END $t$;
--
--   -- 2. Service role vede in continuare in clar (ASTA prinde ruperea):
--   DO $t$
--   DECLARE v text;
--   BEGIN
--     SET LOCAL ROLE service_role;
--     SELECT fan_courier_config->>'password' INTO v FROM public.store_settings
--      WHERE fan_courier_config ? 'password' LIMIT 1;
--     IF v LIKE 'enc.v1.%' THEN RAISE EXCEPTION '>>> RUPT: nici service role nu mai decripteaza';
--     ELSE RAISE EXCEPTION '>>> OK: service role decripteaza';
--     END IF;
--   END $t$;
--
--   -- 3. Emite un AWB real pe un magazin de test. Daca partenerul raspunde
--   --    „credentiale invalide", a ramas o citire pe clientul utilizatorului.
-- ============================================================================

-- APLICATA in productie pe 05.08.2026, dupa deploy, cu verificarea de mai sus rulata.
