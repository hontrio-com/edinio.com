-- ═══════════════════════════════════════════════════════════════════════════
-- eColet: al optulea curier, si al treilea BROKER
--
-- CE ADAUGA
--
--   1. Zece coloane pe `orders` — mai multe decat la oricare curier de pana
--      acum, si fiecare cu motivul scris mai jos.
--   2. `store_settings.ecolet_config` — tokenul de acces.
--   3. `privat.campuri_secrete` — tokenul se cripteaza in repaus.
--   4. `'ecolet'` in constrangerea de furnizor a registrului de operatii externe.
--   5. DOUA indexuri partiale: unul pentru urmarire, unul pentru emiterile
--      ramase neterminate.
--
-- ═══ ⚠ DE CE ATATEA COLOANE: EMITEREA E ASINCRONA ═══
--
--   La ceilalti sapte curieri, „am emis" si „am AWB-ul" sunt acelasi moment. La
--   eColet nu:
--
--     POST /add-parcel/send-order   ->  { order_to_send_id }        ATAT.
--     GET  /order-to-send/{id}      ->  status: new | ordered | error
--     GET  /order/{id}              ->  abia aici apare `awb`
--
--   Intre prima si a treia linie exista o fereastra in care expedierea EXISTA la
--   ei si noi nu avem niciun numar. Coloanele de mai jos sunt exact ce trebuie ca
--   fereastra aia sa nu piarda nimic si sa nu produca nimic de doua ori.
--
--   ⚠ CONSECINTA CEA MAI IMPORTANTA: garda de idempotenta se pune pe
--   `ecolet_order_to_send_id`, NU pe `ecolet_awb_number`. O garda pe AWB ar fi
--   goala tocmai in fereastra aceea, iar a doua apasare pe buton ar crea a doua
--   expediere REALA, facturata.
--
-- ═══ ⚠ DE CE `ecolet_awb_number` RAMANE NULL, SI NU PRIMESTE UN SUROGAT ═══
--
--   La Pall-Ex, `pallex_awb_number` poarta la inceput ID-ul intern, fiindca acolo
--   codul adevarat vine mai tarziu si coloana trebuia sa aiba ce arata. Aici NU se
--   face asa: AWB-ul eColet e cheia cu care se cer statusurile IN LOT
--   (`POST /order/get-statuses-for-many-orders` primeste `{awbs: [...]}`), iar un
--   surogat ar otravi lotul cu chei pe care eColet nu le cunoaste — si atunci
--   raspunsul le omite, marcajul nu se scrie, si comenzile alea raman vesnic in
--   capul cozii.
--
-- Aditiva: coloane noi nullable si o constrangere largita. Codul vechi nu le
-- atinge, deci se poate aplica INAINTE de deploy. Invers nu: `ecolet_config` e
-- cerut in acelasi SELECT cu tot restul setarilor de livrare, deci codul fara
-- migratie lasa checkout-ul INTREGII platforme fara nicio optiune.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Identificatorii, in ordinea in care ii aflam
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists ecolet_order_to_send_id bigint;

comment on column public.orders.ecolet_order_to_send_id is
  'Ce intoarce POST /add-parcel/send-order, si SINGURUL lucru pe care il avem '
  'imediat dupa emitere. Serveste la GET /order-to-send/{id} si e GARDA DE '
  'IDEMPOTENTA din registru — nu AWB-ul, care e inca null in fereastra aceea.';

alter table public.orders
  add column if not exists ecolet_order_id bigint;

comment on column public.orders.ecolet_order_id is
  'ID-ul comenzii la eColet, aflat din GET /order-to-send/{id} cand starea devine '
  '„ordered". Cheia pentru GET /order/{id}, DELETE /order/{id} si '
  '/order/{id}/download-waybill. Fara ea nu exista nici eticheta, nici anulare.';

alter table public.orders
  add column if not exists ecolet_awb_number text;

comment on column public.orders.ecolet_awb_number is
  'AWB-ul curierului real. Apare abia dupa „ordered", deci RAMANE NULL pana '
  'atunci — fara surogat, fiindca e cheia lotului de statusuri si un numar '
  'necunoscut de eColet ar iesi din raspuns fara sa lase urma.';

-- ---------------------------------------------------------------------------
-- 2. Starea emiterii asincrone
--
-- ⚠ Fara ele nu se deosebeste „inca se emite" de „a esuat la broker" de „n-a
-- fost incercat". Toate trei arata la fel pe o comanda fara AWB, si numai prima
-- merita reincercata de cron.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists ecolet_send_state text;

comment on column public.orders.ecolet_send_state is
  'Starea emiterii: „new" (eColet inca lucreaza), „ordered" (gata, avem AWB), '
  '„error" (brokerul a refuzat). E chiar predicatul cronului de finalizare. '
  'Text, nu enum: o stare noua la ei se scrie asa cum a venit, in loc sa cada.';

alter table public.orders
  add column if not exists ecolet_send_error text;

comment on column public.orders.ecolet_send_error is
  'Campul `error` din GET /order-to-send/{id}. Sta pe comanda, nu doar in '
  'registrul de operatii, ca modalul sa-l poata arata fara inca o citire — '
  'omul trebuie sa vada DE CE nu s-a emis, chiar acolo unde apasa din nou.';

-- ---------------------------------------------------------------------------
-- 3. Serviciul ales
--
-- ⚠ La Woot si la Colete, id-ul serviciului ales de client sta doar in
-- `shipping_address`, iar pe comanda ajunge numai numele. La eColet slug-ul e
-- CHEIE DE API — `reload-form` si `send-order` sunt indexate pe el — deci o
-- reemitere dupa corectarea adresei are nevoie de el fara sa scormone in jsonb.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists ecolet_service_slug text;

comment on column public.orders.ecolet_service_slug is
  'Slug-ul serviciului eColet („dpd_standard"). La broker nu e decor, e cheia de '
  'API: cotarea si emiterea sunt indexate pe el.';

alter table public.orders
  add column if not exists ecolet_service_name text;

comment on column public.orders.ecolet_service_name is
  'Numele de aratat („DPD Standard"), compus din curierul real si serviciu. '
  'Echivalentul lui woot_service_name.';

-- ---------------------------------------------------------------------------
-- 4. Ancora si memoria urmaririi
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists ecolet_awb_at timestamptz;

comment on column public.orders.ecolet_awb_at is
  '⚠ Cand s-a TRIMIS expedierea (send-order), nu cand a aparut AWB-ul. Altfel '
  'emiterile blocate in „new" n-ar avea ancora, n-ar intra niciodata in fereastra '
  'cronului, si nimeni nu le-ar mai finaliza — fara nicio eroare undeva.';

alter table public.orders
  add column if not exists ecolet_status_code text;

comment on column public.orders.ecolet_status_code is
  'Ultimul status eColet prelucrat (`name`, ex. „new", „delivered"), exact cum a '
  'venit. Serveste la a nu semnala de doua ori acelasi eveniment.';

alter table public.orders
  add column if not exists ecolet_status_checked_at timestamptz;

comment on column public.orders.ecolet_status_checked_at is
  'Cand a intrebat cronul ultima oara — NU data evenimentului. Da rotatia: se iau '
  'intotdeauna comenzile neintrebate de cel mai mult timp.';

-- ---------------------------------------------------------------------------
-- 5. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists ecolet_config jsonb;

comment on column privat.store_settings.ecolet_config is
  'eColet: {enabled, api_token, expeditor:{...}, servicii_permise[], '
  'ramburs_implicit, ...}. `api_token` se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 6. Tokenul intra sub criptare
--
-- ⚠ Trebuie sa ramana in pas cu `CAMPURI_SECRETE` din src/lib/integrari/secrete.ts.
-- Omisiunea din partea de TypeScript nu lasa tokenul in clar (vederea nu
-- decripteaza pentru `authenticated`), dar strica `secretulEsteSalvat`:
-- formularul nu mai stie ca exista un token, iar prima salvare il STERGE.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('ecolet_config', 'api_token')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 7. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA emitere eColet cade pe constrangere DUPA ce expedierea a
-- fost deja creata la ei — adica exact cazul in care nu stim daca s-a intamplat.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 8. DOUA indexuri, fiindca sunt doua intrebari diferite
--
-- ⚠ Predicatul fiecaruia e scris pe chiar coloana pe care filtreaza interogarea
-- lui, altfel planificatorul nu poate dovedi implicatia si indexul nu se
-- foloseste.
--
--   a) URMARIREA merge pe AWB-uri (lotul de statusuri primeste `{awbs: [...]}`),
--      deci predicatul e pe `ecolet_awb_number is not null`.
--   b) FINALIZAREA emiterilor atarnate cauta exact opusul: expedieri trimise
--      care inca n-au AWB. Fara indexul asta, cautarea lor ar fi o parcurgere a
--      intregului `orders` la fiecare rulare, pentru o multime de obicei goala.
-- ---------------------------------------------------------------------------
create index if not exists orders_ecolet_urmarire_idx
  on public.orders (ecolet_status_checked_at asc nulls first)
  where ecolet_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

create index if not exists orders_ecolet_emitere_idx
  on public.orders (ecolet_status_checked_at asc nulls first)
  where ecolet_order_to_send_id is not null
    and ecolet_awb_number is null;

-- ---------------------------------------------------------------------------
-- 9. PostgREST trebuie sa afle de coloanele noi
--
-- ⚠ Fara asta, aplicatia primeste „column does not exist" pe `ecolet_config` pana
-- la urmatoarea repornire a PostgREST. Si nu cade doar eColet: coloana e ceruta
-- in acelasi SELECT cu tot restul setarilor de livrare, deci ar cadea checkout-ul
-- tuturor magazinelor.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
