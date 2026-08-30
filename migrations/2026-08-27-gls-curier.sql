-- ═══════════════════════════════════════════════════════════════════════════
-- GLS: al saselea curier
--
-- CE ADAUGA
--
--   1. `orders.gls_awb_number`   — fiecare curier are coloana lui de AWB.
--   2. `store_settings.gls_config` — datele de acces MyGLS.
--   3. `privat.campuri_secrete`  — parola MyGLS se cripteaza in repaus.
--   4. `'gls'` in constrangerea de furnizor a registrului de operatii externe.
--
-- ═══ ⚠ CARE GLS ═══
--
--   Integrarea merge pe MyGLS (`api.mygls.ro`), NU pe API-ul din developer
--   portal (`api.gls-group.net`, ShipIT). Sunt doua familii diferite sub acelasi
--   brand: MyGLS e ce primeste un comerciant roman la semnarea contractului, are
--   mediu de test, si acolo rambursul e un camp, nu un serviciu nedocumentat.
--
--   De aia `gls_config` tine `username`/`password`/`client_number`, nu
--   `client_id`/`client_secret`/`contact_id`.
--
-- ═══ ⚠ PAROLA SE CRIPTEAZA, SI NU DIN OFICIU ═══
--
--   Adaugarea coloanei NU e de ajuns. Criptarea in repaus e condusa de tabelul
--   `privat.campuri_secrete`, iar vederea publica `store_settings` decripteaza
--   doar caile inscrise acolo. Fara randul de mai jos, parola MyGLS ar sta in
--   clar in baza — la fel ca la ceilalti sase furnizori inainte de 04.08.
--
--   Si dupa inserare TREBUIE rulat `privat.reconstruieste_store_settings()`,
--   altfel vederea ramane cu lista veche de coloane: coloana ar exista in tabelul
--   privat si ar lipsi din ce vede aplicatia.
--
-- ═══ ⚠ DE CE `client_number` NU E SECRET ═══
--
--   E un identificator de contract, tiparit pe fiecare eticheta si pe facturi.
--   Criptat, ar trebui decriptat la fiecare emitere de AWB fara sa apere nimic —
--   iar cheia de integrari s-ar folosi cu un ordin de marime mai des, degeaba.
--
-- Aditiva: doua coloane noi, nullable, si o constrangere largita. Codul vechi nu
-- le atinge, deci se poate aplica INAINTE de deploy. Invers nu: codul GLS fara
-- migratie scrie intr-o coloana care nu exista.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. AWB-ul pe comanda
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists gls_awb_number text;

comment on column public.orders.gls_awb_number is
  'Numarul de colet MyGLS (ParcelNumber), cel de pe eticheta si din tracking. '
  'NU ParcelId, care e intern la GLS si nu se gaseste in urmarire.';

-- ---------------------------------------------------------------------------
-- 2. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists gls_config jsonb;

comment on column privat.store_settings.gls_config is
  'MyGLS: {enabled, username, password, client_number, tara, sandbox, '
  'tip_imprimanta, pozitie_tiparire, servicii...}. `password` se cripteaza — '
  'vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 3. Parola intra sub criptare
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('gls_config', 'password')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
-- Reconstruieste vederea publica `store_settings` cu lista noua de coloane si cu
-- decriptarea pe caile din `campuri_secrete`.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 4. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA emitere de AWB prin GLS cade pe constrangere — dupa ce
-- coletul a fost deja creat la GLS. Adica exact cazul in care nu stim daca s-a
-- intamplat: colet real, facturat, si niciun rand in registru care sa-l tina
-- minte.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 5. PostgREST trebuie sa afle de coloanele noi
--
-- ⚠ Fara asta, aplicatia primeste „column does not exist" pe `gls_config` si pe
-- `gls_awb_number` pana la urmatoarea repornire a PostgREST — care poate veni
-- peste ore. Lectia e deja platita la granturi.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
