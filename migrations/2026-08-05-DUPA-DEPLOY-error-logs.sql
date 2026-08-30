-- ============================================================================
-- SCAZUT (constatarea 13) — error_logs: orice comerciant autentificat putea
-- scrie randuri falsificate pe seama altui magazin
--
-- PROBLEMA: politica de INSERT e `TO authenticated WITH CHECK (true)`, iar
-- `GRANT INSERT` exista si pentru `authenticated`. Cine are un cont — se face
-- gratuit — ia cheia anon din pachetul public al oricarui magazin si trimite cu
-- PROPRIUL lui JWT:
--
--   POST /rest/v1/error_logs
--   {"action":"placeOrder","message":"plata respinsa repetat","severity":"critical",
--    "business_id":"<id-ul magazinului B>","user_id":"<user_id-ul lui B>"}
--
-- Randul apare in /admin/logs ca incident CRITIC al magazinului B. Calea fiind
-- directa in baza, ocoleste si `rateLimit`, si `consumaLimita`, si trunchierea
-- MAX_MESAJ/MAX_DETALII din TypeScript — deci si un rand de megaocteti, si sute
-- de mii de randuri.
--
-- IMPACT REAL: mic (insert-only; citirea e is_admin(), UPDATE/DELETE n-au
-- politici, tabelul e citit intr-un singur loc, o pagina de diagnostic fara
-- alertare automata). Dar jurnalul din care adminul platformei decide ce magazin
-- are probleme nu are voie sa fie scriibil de un chirias impotriva altuia.
--
-- ---------------------------------------------------------------------------
-- DE CE E „DUPA DEPLOY", desi auditul spune ca politica nu mai e folosita de cod
--
-- Auditul a verificat doar `src/lib/error-logger.ts` si a conchis ca toate
-- scrierile trec deja prin service role. Nu era adevarat: mai existau TREI
-- inserturi directe care mergeau pe clientul de CERERE — deci prin RLS:
--   src/lib/actions/fgo.actions.ts:330
--   src/lib/actions/oblio.actions.ts:563
--   src/lib/actions/smartbill.actions.ts:827
-- Toate trei in `maybeAutoGenerateInvoice`, unde clientul e cel de sistem doar
-- pe calea automata; pe calea manuala e clientul utilizatorului. Aplicata inainte
-- de deploy, migratia asta le-ar fi rupt IN TACERE (inserturi fire-and-forget,
-- fara verificare de eroare), adica exact incidentul din 04.08.2026.
--
-- Cele trei au fost mutate pe `logError` (service role) in acelasi commit cu
-- fisierul de fata. APLICA DUPA ce acel cod e in productie.
-- ============================================================================

begin;

drop policy if exists "Server actions can insert error logs" on public.error_logs;

revoke insert on public.error_logs from authenticated, anon;

commit;

-- Obligatoriu dupa orice schimbare de granturi sau de politici: PostgREST tine
-- schema si privilegiile in cache. Vezi 04.08.2026 (postgrest-cache-granturi).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICARE DUPA APLICARE:
--
--   -- 1. Falsificarea trebuie sa PICE:
--   DO $t$
--   DECLARE uid uuid;
--   BEGIN
--     SELECT id INTO uid FROM public.users_profile LIMIT 1;
--     SET LOCAL ROLE authenticated;
--     PERFORM set_config('request.jwt.claims',
--             json_build_object('sub',uid,'role','authenticated')::text, true);
--     INSERT INTO public.error_logs(action,message,severity) VALUES ('test','test','critical');
--     RAISE EXCEPTION '>>> DESCHIS (GRAV): insertul a trecut';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION '>>> BLOCAT, cum trebuie';
--   END $t$;
--
--   -- 2. Scrierea legitima trebuie sa MEARGA: declanseaza o eroare pe o cale
--   --    publica (o comanda cu un produs inexistent) si verifica in /admin/logs
--   --    ca randul a aparut. Fara pasul asta nu stii daca ai rupt jurnalul.
-- ============================================================================

-- APLICATA in productie pe 05.08.2026, dupa deploy, cu verificarea de mai sus rulata.
