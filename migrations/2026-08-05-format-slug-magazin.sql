-- Format impus pentru `businesses.slug` (constatarea 15 din auditul 05.08.2026).
--
-- NU E APLICATA. Vezi la final ce trebuie rulat inainte.
--
-- Problema: `createBusiness` punea `data.slug` direct in INSERT, iar singura
-- validare (zod + slugify) traia in componenta de onboarding, adica in browser.
-- Pe coloana nu exista niciun CHECK — doar UNIQUE(slug) — iar migratia din
-- 04.08 (blocare-escaladare-rol.sql) a revocat si re-acordat doar UPDATE, deci
-- INSERT(slug) a ramas acordat lui `authenticated` si `anon`. Cu un slug ca
-- „/evil.com", rutele de intoarcere de la plata construiesc
-- `new URL('/' || slug || '/confirm...', baseUrl)`, ceea ce da
-- „https://evil.com/confirm?..." — schimba GAZDA, nu calea. Adica o redirectare
-- deschisa gazduita pe domeniul platformei.
--
-- Reparatia de fond e in cod (src/lib/actions/business.actions.ts,
-- `motivSlugRespins`), pentru ca acolo se poate da un mesaj omului si acolo se
-- poate consulta lista de rute rezervate. Constrangerea de aici e a doua plasa:
-- daca maine apare o a doua cale de scriere (import, unealta de admin, script),
-- baza refuza singura formatul, fara sa depinda de disciplina apelantului.
--
-- Ce NU face constrangerea, dinadins: nu contine lista de segmente rezervate
-- (dashboard, login, admin, ...). Lista aia se schimba odata cu rutele
-- aplicatiei; pusa si in baza, s-ar desparti de `NON_STORE_SEGMENTS` din
-- src/proxy.ts la prima ruta noua, si atunci ar minti unul dintre cele doua
-- locuri. Aici pazim doar forma, care nu se schimba niciodata.

-- Adaugata NOT VALID intentionat: randurile EXISTENTE nu sunt verificate.
-- Constrangerea se aplica de la aplicare incolo tuturor INSERT-urilor si
-- UPDATE-urilor, adica exact gaura pe care o inchidem, fara sa rupa un magazin
-- vechi cu slug neconform (care oricum functioneaza si azi).
alter table public.businesses
  add constraint businesses_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
  not valid;

comment on constraint businesses_slug_format on public.businesses is
  'Adresa magazinului: 3-50 caractere, litere mici/cifre/liniute, fara liniuta la capete. Fara ea, un slug care incepe cu / transforma URL-urile de intoarcere de la plata in redirectare catre alt domeniu. Segmentele rezervate se verifica in cod (NON_STORE_SEGMENTS, src/proxy.ts).';

-- INAINTE de aplicare, ruleaza asta si uita-te la ce iese. Daca nu intoarce
-- niciun rand, poti sterge `not valid` de mai sus (sau rula VALIDATE dupa):
--
--   select id, slug from public.businesses
--   where slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$';
--
-- Daca intoarce randuri, NU le redenumi orbeste: slug-ul e in URL-ul public al
-- magazinului si in linkurile deja trimise clientilor. Intai se decide
-- redirectarea vechii adrese, apoi se schimba.
--
-- DUPA curatare, ca sa acopere si trecutul:
--
--   alter table public.businesses validate constraint businesses_slug_format;

-- APLICATA in productie pe 05.08.2026, dupa deploy, cu verificarea de mai sus rulata.
