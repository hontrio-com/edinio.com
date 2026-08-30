-- ═══════════════════════════════════════════════════════════════════════════
-- Facebook Catalog: feeduri SEGMENTATE (pe categorie, pe selectie, pe conditii)
--
-- ═══ CE REZOLVA ═══
--
--   Pana acum exista un singur feed pe magazin, cu toate produsele active, la
--   `{magazin}/facebook-catalog.xml`. Comerciantii cer cataloage separate: pe o
--   categorie, pe o selectie de produse, sau pe conditii (doar in stoc).
--
--   ⚠ Atentie la ce NU e asta. Pentru RECLAME, Meta are Product Sets —
--   submultimi definite prin filtre intr-un singur catalog, care se actualizeaza
--   singure. Feedul nostru trimite deja `product_type` (categoria), `brand` si
--   `custom_label_0..4`, iar 92,8% din produsele active au categoria completata,
--   deci filtrele alea au pe ce lucra fara nicio linie de cod.
--
--   Un feed separat e pentru cazurile in care chiar ai nevoie de un CATALOG
--   separat: alta agentie cu acces la o parte din sortiment, alt brand cu cont
--   propriu, o campanie curata, sau produse scoase din reclame fara sa fie
--   dezactivate in magazin.
--
-- ═══ ⚠ DE CE PE TABELUL PRIVAT, NU PE VEDERE ═══
--
--   `public.store_settings` e o VEDERE generata din `privat.store_settings` de
--   `reconstruieste_store_settings()`. O coloana pusa direct pe vedere ar
--   disparea la prima regenerare.
--
--   ⚠ Coloana NU intra in `privat.campuri_secrete`: nu contine nimic secret, iar
--   panoul chiar trebuie s-o poata citi ca sa arate feedurile. Trecuta ca secreta,
--   ecranul ar fi primit-o mascata si prima salvare ar fi sters toate feedurile.
--
-- Forma: tablou JSON de reguli. Fiecare regula:
--   { cheie, nume, categorii[], produse[], excluse[], doarInStoc, pretMin, pretMax }
-- `categorii` tine ID-URI, nu nume, ca redenumirea unei categorii sa nu goleasca
-- tacut catalogul cuiva. Vezi src/lib/facebook/feeduri.ts.
--
-- Aditiva: o coloana nullable. Codul vechi n-o atinge, iar ruta publica fara
-- `?feed=` raspunde exact ca pana acum. Se poate aplica INAINTE de deploy.
-- ═══════════════════════════════════════════════════════════════════════════

alter table privat.store_settings
  add column if not exists facebook_feeds jsonb;

comment on column privat.store_settings.facebook_feeds is
  'Feeduri Meta segmentate: tablou de reguli '
  '{cheie, nume, categorii[], produse[], excluse[], doarInStoc, pretMin, pretMax}. '
  'Se cer la {magazin}/facebook-catalog.xml?feed=<cheie>; fara parametru se '
  'raspunde cu tot catalogul, ca pana acum. `categorii` tine ID-uri, nu nume. '
  'NU e camp secret. Vezi src/lib/facebook/feeduri.ts.';

-- ⚠ OBLIGATORIU dupa orice modificare de coloane: vederea publica si declansatorul
-- de UPDATE se regenereaza din tabel.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ⚠ Fara asta, panoul si ruta publica primesc „column does not exist" pana la
-- urmatoarea repornire a PostgREST, care poate veni peste ore.
notify pgrst, 'reload schema';
