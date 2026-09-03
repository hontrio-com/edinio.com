-- ============================================================================
-- SCAZUT / NEGLIJABIL (constatarile 16 si 26) — coloane interne citibile anonim
-- din `public.businesses`
--
-- PROBLEMA: politica `Public can view published businesses` e `USING (is_published
-- = true)` fara nicio restrictie de coloane, iar `anon` are SELECT pe toate cele
-- 34. Cu cheia anon din pachetul public, oricine cere intr-o singura cerere
-- registrul complet al magazinelor publicate, cu tot cu campuri care nu se
-- randeaza nicaieri.
--
-- ---------------------------------------------------------------------------
-- CE NU SE POATE FACE, desi auditul o cere. Citeste inainte sa incerci.
--
-- Auditul propune revocarea lui `user_id` si `suspended_until`, pe care le
-- numeste „doua campuri pur interne". NU se poate: amandoua sunt citite de codul
-- de SERVER al paginilor publice, care ruleaza cu clientul vizitatorului, adica
-- tot ca `anon`:
--   user_id         -> `isOwner`, deci previzualizarea proprietarului pe magazinul
--                      nepublicat, si citirea profilului lui
--                      ((public)/[slug]/page.tsx, checkout, cos)
--   suspended_until -> decizia „magazinul e suspendat"
--                      ((public)/[slug]/page.tsx, [pageSlug], checkout, cos,
--                       catalog/pagina-magazin.tsx — `grep -n suspended_until`;
--                       numerele de linie s-au mutat de mult, de aceea lipsesc)
--   updated_at      -> `lastmod` in sitemapul magazinului (app/sitemap.ts, ramura domeniului
--                      propriu; ruta (public)/[slug]/sitemap.xml a fost retrasa pe 03.09.2026)
-- O revocare ar fi rupt exact aplicarea suspendarii pe vitrine. Cele trei sunt
-- scoase in schimb la GRANITA CU BROWSERUL, in `pentruBrowser`
-- (src/lib/storefront/business-public.ts), deci nu mai ajung in HTML.
--
-- Nici agregarea — „registrul complet intr-o singura cerere", partea cu adevarat
-- suparatoare din constatarea 16 — nu se inchide cu granturi pe coloane: exact
-- coloanele cautate (`email`, `phone`, `address`, `cui`, `reg_com`) se afiseaza
-- deliberat in subsolul fiecarui magazin, ca cerinta ANPC/Netopia. Ar cere o
-- restrictie pe RANDURI, iar politica publica exista tocmai ca vitrinele sa fie
-- citibile de oricine. E o consecinta a modelului, nu un defect de reparat aici.
--
-- ---------------------------------------------------------------------------
-- CE RAMANE, si chiar se poate: cele patru coloane care nu se citesc NICAIERI pe
-- calea publica.
--
-- ORDINEA E OBLIGATORIE. Cu granturi pe coloane, un `select("*")` cere toate
-- coloanele si pica INTREG cu „permission denied", nu doar pentru cele revocate.
-- Cele patru `select("*")` de pe calea publica au fost inlocuite cu
-- `COLOANE_BUSINESS_PUBLIC` in acelasi commit cu fisierul de fata:
--   (public)/[slug]/page.tsx, (public)/[slug]/[pageSlug]/page.tsx,
--   (public)/preview-sectiune/[slug]/page.tsx, lib/storefront/catalog/pagina-magazin.tsx
-- APLICA DUPA ce acel cod e in productie. Invers = magazinele publice dau eroare
-- pentru vizitatorii anonimi. Vezi 04.08.2026 (migratii-si-cod-impreuna).
--
-- `authenticated` NU e atins: panoul si `(dashboard)/layout.tsx` citesc in
-- continuare randul intreg cu `select("*")`, si nu e nimic de aparat acolo —
-- randul e al lui.
-- ============================================================================

begin;

-- ATENTIE LA FORMA. Prima varianta era:
--
--     revoke select (lat, lng, niche_id, created_at) on public.businesses from anon;
--
-- si NU a scazut nimic. Pe `businesses`, `anon` avea SELECT la nivel de TABEL
-- (`relacl` = `anon=ardDxtm/postgres`), iar un revoke pe COLOANE nu poate scadea
-- dintr-un grant pe TABEL — aplicata, migratia a raportat succes si a lasat
-- coloanele citibile mai departe. Aceeasi capcana ca pe 04.08.2026
-- (rls-privilegii-pe-coloane): „GRANT pe tabel anuleaza REVOKE pe coloana".
--
-- Forma care functioneaza e cea folosita si la `users_profile`: se ia grantul de
-- pe TABEL si se re-acorda o LISTA ALBA. Are si un avantaj: o coloana adaugata
-- in viitor ramane inaccesibila pana cand cineva o pune explicit pe lista.
--
-- Lista de mai jos trebuie sa ramana in oglinda cu `COLOANE_BUSINESS_PUBLIC` din
-- src/lib/storefront/business-public.ts.
revoke select on table public.businesses from anon;

grant select (
  id, user_id, slug, business_name, store_name, tagline, description,
  phone, whatsapp, email, website, address, city, county, cui, reg_com,
  store_address, store_city, store_county, logo_url, cover_url, gallery,
  primary_color, is_published, suspended_until, custom_domain, social,
  features, type, updated_at
) on table public.businesses to anon;

commit;

-- Obligatoriu dupa orice GRANT/REVOKE pe coloane: PostgREST tine privilegiile in
-- cache si ar continua sa raspunda dupa harta veche.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICARE DUPA APLICARE:
--
--   -- 1. Coloanele interne nu se mai citesc anonim:
--   DO $t$
--   BEGIN
--     SET LOCAL ROLE anon;
--     PERFORM lat FROM public.businesses WHERE is_published LIMIT 1;
--     RAISE EXCEPTION '>>> DESCHIS (de reparat): lat inca se citeste';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION '>>> BLOCAT, cum trebuie';
--   END $t$;
--
--   -- 2. Vitrina inca merge (ASTA e pasul care prinde greseala):
--   DO $t$
--   DECLARE n int;
--   BEGIN
--     SET LOCAL ROLE anon;
--     SELECT count(*) INTO n FROM public.businesses WHERE is_published = true;
--     RAISE EXCEPTION '>>> % magazine vizibile anonim', n;
--   END $t$;
--
--   -- 3. Deschide un magazin publicat in fereastra incognito. Daca da 404 sau
--   --    eroare, a ramas undeva un select("*") — cauta-l inainte de a reveni.
-- ============================================================================

-- APLICATA in productie pe 05.08.2026, dupa deploy, cu verificarea de mai sus rulata.
