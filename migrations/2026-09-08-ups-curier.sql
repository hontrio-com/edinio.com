-- UPS, al cincisprezecelea transportator (si primul TRANSPORTATOR GLOBAL CU RAMBURS).
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `ups_config` e ceruta in ACELASI select cu
-- restul setarilor de livrare, iar PostgREST respinge INTREAGA interogare cand o
-- coloana lipseste — deci codul pusat inaintea migratiei ar rupe „Setari →
-- Livrare" si checkout-ul pe TOATE magazinele, nu doar pe cele cu UPS.
-- (Incident 2026-09-03, cu Posta si Innoship. Vezi `npm run verifica:coloane`.)
--
-- Ce atinge:
--   1. `public.orders`: coloanele expedierii;
--   2. `public.ups_etichete`: eticheta pastrata de NOI (vezi motivul la sectiune);
--   3. `privat.store_settings`: `ups_config`;
--   4. `privat.campuri_secrete`: secretul OAuth;
--   5. registrul de operatii externe: furnizorul `ups`;
--   6. indexul partial al cronului de urmarire.

-- ---------------------------------------------------------------------------
-- 1. Coloanele expedierii
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists ups_awb_number text;
comment on column public.orders.ups_awb_number is
  'UPS: `ShipmentResults.ShipmentIdentificationNumber` din `POST /api/shipments/v2409/ship`. '
  'Descrierea LOR: „1Z Number of the first package in the shipment" — deci la un singur '
  'colet e chiar numarul de urmarire al coletului, si se foloseste in AMANDOUA sensurile: '
  'anularea (`DELETE /api/shipments/v2409/void/cancel/{id}`) il cere ca segment de cale, '
  'iar urmarirea (`GET /api/track/v1/details/{inquiryNumber}`) il accepta ca numar de colet.';

-- ⚠ DOUA coloane de status, si nu din belsug: la UPS cele doua niveluri au
-- documentatie DIFERITA ca putere.
--
-- `status.type` are enumerare publicata (in `UPSTrackAlert.yaml`, sase valori:
-- D, I, M, MV, U, X) si e singurul semnal stabil.
-- `status.code` NU are enumerare publicata nicaieri. Tabelul „EXCEPTION CODE" de
-- pe developer.ups.com (687 de coduri) e ALT VOCABULAR: `FS` — codul pe care UPS
-- il da ei insisi ca exemplu pentru „Delivered" — nu apare deloc in el, iar `OT`
-- inseamna „Out for Delivery" in API si „am contactat expeditorul pentru vamuire"
-- in tabel. Deci codul se pastreaza BRUT si se creste din traficul real.
alter table public.orders
  add column if not exists ups_status_type text;
comment on column public.orders.ups_status_type is
  'UPS: `package.currentStatus.type`. SINGURA enumerare pe care o publica: '
  'D=Delivery, I=On the Way, M=Manifest, MV=Manifest Void, U=Updated, X=Exception. '
  '⚠ D NU inseamna „livrat": descrierea lor e „loaded on delivery vehicle, out for '
  'delivery, delivered". Livrarea se dovedeste cu `deliveryDate[type=DEL]` sau cu '
  'prezenta lui `deliveryInformation`, nu cu tipul singur.';

alter table public.orders
  add column if not exists ups_status_code text;
comment on column public.orders.ups_status_code is
  'UPS: `package.currentStatus.code` (`FS`, `OT`, `MP`…). TEXT si SET DESCHIS: UPS '
  'NU publica enumerarea pentru API-ul REST. Singurele doua confirmate verbatim de '
  'ei sunt `FS`=Delivered si `OT`=Out for Delivery, din exemplele de webhook. '
  'Orice `switch` pe coloana asta trebuie sa aiba `default` care pastreaza valoarea bruta.';

alter table public.orders
  add column if not exists ups_status_checked_at timestamptz;
comment on column public.orders.ups_status_checked_at is
  'UPS: cand a intrebat cronul ultima data. Da ORDINEA de lucru a cronului '
  '(cele mai vechi primele), deci se scrie SI cand statusul n-a schimbat nimic.';

alter table public.orders
  add column if not exists ups_awb_at timestamptz;
comment on column public.orders.ups_awb_at is
  'UPS: cand s-a emis AWB-ul. Ancoreaza fereastra cronului de urmarire SI parametrul '
  '`fromPickUpDate` al cautarii dupa referinta — care, LIPSA, se pune implicit pe '
  '`currentDate-14` si face ca orice expediere mai veche de doua saptamani sa iasa '
  '„negasita" fara nicio eroare.';

alter table public.orders
  add column if not exists ups_service_code text;
comment on column public.orders.ups_service_code is
  'UPS: codul serviciului ales de client (`11`=UPS Standard, `07`=Express, `65`=Saver, '
  '`54`=Express Plus, `74`=Express 12:00, `70`=Access Point Economy). E CHEIA ofertei: '
  'aceeasi cotare intoarce mai multe servicii la preturi diferite, deci fara el o '
  'reemitere ar putea pleca pe alt serviciu decat cel platit de cumparator. '
  '⚠ TEXT, nu integer: codurile lor au si litere (`M2`, `T0`) si zerouri in fata (`07`).';

alter table public.orders
  add column if not exists ups_service_name text;
comment on column public.orders.ups_service_name is
  'UPS: `RatedShipment.Service.Description` din cotare, pentru panou si pentru emailul '
  'catre client. Fara el randul ar arata un numar de doua cifre.';

alter table public.orders
  add column if not exists ups_cost numeric(10,2);
comment on column public.orders.ups_cost is
  'UPS: totalul de pe oferta aleasa. ⚠ Se ia `NegotiatedRateCharges.TotalCharge` cand '
  'exista (tariful contractului, ce se factureaza), altfel `TotalCharges` (pretul de '
  'lista). Se pastreaza numarul lor asa cum vine, fara niciun adaos inventat.';

-- ⚠ FARA COLOANA ASTA, UN PRET IN EURO S-AR CITI CA LEI.
alter table public.orders
  add column if not exists ups_currency text;
comment on column public.orders.ups_currency is
  'UPS: `CurrencyCode` de pe suma aleasa. ⚠ Exista dinadins, si la UPS cu atat mai mult '
  'cu cat ei NU AU niciun camp prin care sa ceri valuta raspunsului — cautat in tot '
  '`Rating.yaml`, nu exista. Contul poate cota in EUR, iar un numar de 12 (euro) scris '
  'pe o comanda in lei ar subfactura transportul de cinci ori, tacut. Checkout-ul refuza '
  'orice oferta care nu vine in RON; coloana pastreaza dovada.';

alter table public.orders
  add column if not exists ups_tracking_url text;
comment on column public.orders.ups_tracking_url is
  'UPS: pagina publica de urmarire (ups.com/track). Se COMPUNE, nu se citeste din '
  'raspuns: `ShipmentResults.LabelURL` exista, dar se intoarce numai daca s-a cerut '
  '`LabelDelivery.LabelLinksIndicator`, si e link de ETICHETA, nu de urmarire.';

-- ⚠ Referinta NOASTRA, si drumul inapoi cand raspunsul se pierde.
alter table public.orders
  add column if not exists ups_reference text;
comment on column public.orders.ups_reference is
  'UPS: sirul trimis ca `Shipment.ReferenceNumber[].Value`, de forma '
  '`EDN-<4 caractere din business_id>-<order_number>`. ⚠ Cele patru caractere nu sunt '
  'ornament: `order_number` reporneste la #0001 pe fiecare magazin, iar '
  '`GET /api/track/v1/reference/details/{ref}` cauta pe CONT — doua magazine cu acelasi '
  'cont UPS si-ar citi comenzile unul altuia (aceeasi lectie ca la FedEx, SmartShip si '
  'BT iPay). '
  '⚠⚠ SI SE TRIMITE LA NIVEL DE EXPEDIERE, NU DE COLET: `Package.ReferenceNumber` e '
  'documentat „Valid if the origin/destination pair is US/US or PR/PR", iar '
  '`Shipment.ReferenceNumber` „Valid if the origin/destination pair is NOT US/US or '
  'PR/PR". Pentru Romania e exact INVERS fata de o integrare americana.';

-- ---------------------------------------------------------------------------
-- 2. Eticheta, pastrata de NOI
--
-- ⚠ UPS ARE endpoint de reimprimare (`POST /api/labels/v1/recovery`) — si totusi
-- eticheta se pastreaza, ca la FedEx. Motivul e ca propria lor documentatie se
-- contrazice pe fata:
--
--   * OpenAPI-ul de azi: „The Label Shipping API allows us to retrieve forward
--     and return labels."
--   * Ghidul lor „Shipping Package Web Service Developer Guide", capitolul 7:
--     „ONLY Return Shipments support Label Recovery." + „For up to 30 days after
--     customers schedule RETURN shipments, UPS maintains a copy of the shipping
--     labels."
--
-- Iar codurile lor de eroare confirma ca reimprimarea chiar poate sa nu mearga:
-- `9800020 Label is unavailable -- the label is expired`, `9801028 Label is
-- unavailable -- the package has been sent to the destination address`,
-- `9801041 the shipment has not been processed`.
--
-- Deci reimprimarea RAMANE cablata (e o plasa reala si e singura cale catre PDF —
-- vezi mai jos), dar sursa de adevar e copia noastra.
--
-- ⚠ SI MAI E CEVA, care nu se vede din OpenAPI: la EMITERE, `LabelImageFormat.Code`
-- accepta doar `GIF`, `ZPL`, `EPL`, `SPL`. **PDF NU EXISTA la emitere** — apare
-- numai la reimprimare. Un comerciant fara imprimanta termica primeste deci un GIF.
--
-- Tabel separat, nu coloana pe `orders`: o eticheta face zeci de kilooctdeti in
-- base64, iar `orders` se citeste pe liste de sute de randuri.
-- ---------------------------------------------------------------------------
create table if not exists public.ups_etichete (
  order_id     uuid primary key references public.orders(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  awb_number   text not null,
  /* `GIF` | `ZPL` | `EPL` | `SPL` — ce a intors `ShippingLabel.ImageFormat.Code`.
     ⚠ Se scrie ce a INTORS, nu ce s-a cerut: la expedierile cu ramburs pe mai multe
     colete, documentatia lor spune ca eticheta primului colet vine MEREU `GIF`,
     „for any form of label requested". */
  format       text not null,
  continut     text not null,
  /* ⚠ A DOUA imagine, si numai la expedierile din afara Statelor Unite.
     `InternationalSignatureGraphicImage` = „the Warsaw text and signature box …
     The image will be returned for non-US based shipments." Romania e non-US, deci
     ea EXISTA la fiecare AWB si trebuie tiparita odata cu eticheta. Pierduta, coletul
     pleaca fara caseta de semnatura ceruta de Conventia de la Varsovia. */
  semnatura    text,
  /* ⚠ A TREIA hartie, si numai la comenzile cu RAMBURS: `ShipmentResults.CODTurnInPage`.
     E documentul pe care soferul il ia odata cu banii, si vine in HTML — enumerarea
     lor are o singura valoare: „Only HTML format is supported for COD Turn In Page."
     Nu e eticheta si nu tine locul ei. Netiparit, curierul poate refuza preluarea unei
     comenzi cu plata la livrare.
     ⚠ Si documentatia lor NU spune cand se intoarce („The container of the COD Turn In
     Page." si atat), iar la REIMPRIMARE dispare tacut daca ceri versiunea `v1`:
     „v1 … No support for CODTurn-inPage". De aia se pastreaza la emitere. */
  document_ramburs text,
  creat_la     timestamptz not null default now()
);

comment on table public.ups_etichete is
  'Eticheta UPS in base64, pastrata de noi. UPS ARE reimprimare, dar ghidul lor spune '
  '„only Return Shipments support Label Recovery", iar codurile lor de eroare includ '
  '„the label is expired". Se scrie o singura data, la emitere.';
comment on column public.ups_etichete.continut is
  '`PackageResults[].ShippingLabel.GraphicImage`, exact cum vine de la ei (base64). '
  'Nu se transforma: orice re-codare ar putea strica un ZPL.';

create index if not exists ups_etichete_business_idx
  on public.ups_etichete (business_id, creat_la desc);

-- ⚠ RLS PORNIT, FARA NICIO POLITICA — dinadins.
--
-- O eticheta AWB poarta numele, telefonul si adresa cumparatorului. Nimeni nu are
-- ce citi de aici cu clientul lui: descarcarea trece prin `getUpsEtichetaAction`,
-- care verifica intai proprietatea magazinului si abia apoi citeste cu service role.
-- (`service_role` ocoleste RLS din oficiu, deci nu are nevoie de politica.)
alter table public.ups_etichete enable row level security;

-- ⚠ `revoke ... from anon` singur NU face nimic: EXECUTE/SELECT sunt ale lui PUBLIC
-- din oficiu. Se revoca de la PUBLIC, apoi se dau inapoi doar cui trebuie.
revoke all on public.ups_etichete from public;
revoke all on public.ups_etichete from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists ups_config jsonb;

comment on column privat.store_settings.ups_config is
  'UPS: {enabled, client_id, client_secret, account_number, mediu, expeditor{…}, '
  'servicii_permise[], format_eticheta, lungime_cm, latime_cm, inaltime_cm, '
  'continut_implicit, valoare_declarata, tarife_negociate, ramburs_activ, '
  'cod_funds_code, puncte_activate}. '
  '⚠ `mediu` alege gazda: `test` → wwwcie.ups.com (etichete cu filigran „Sample", '
  'tarife negociate falsificate la 1% sub cele de lista), `productie` → onlinetools.ups.com. '
  '⚠ `account_number` e „Shipper Number"-ul lor, de EXACT 6 caractere alfanumerice — '
  'NU cele 9 cifre ale FedEx si nu clientul OAuth. '
  '⚠ RAMBURSUL EXISTA, spre deosebire de FedEx, dar numai la NIVEL DE EXPEDIERE si '
  'numai pe conturi „Daily Pickup" sau „Drop Shipping" (verbatim din schema lor). '
  'Doar `client_secret` se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 4. Secretul, criptat in repaus
--
-- ⚠ Numele campului trebuie sa fie IDENTIC in trei locuri: in `UpsConfig`
-- (lib/ups/client.ts), in `CAMPURI_SECRETE` (lib/integrari/secrete.ts) si aici.
-- Nimic nu verifica potrivirea — nici tsc, nici probele, nici build-ul — iar o
-- nepotrivire taie TOT stratul de secrete in tacere: mascarea nu mascheaza,
-- declansatorul nu cripteaza, pastrarea nu pastreaza.
--
-- ⚠ `client_id` NU intra aici: la UPS el pleaca ca NUME DE UTILIZATOR intr-un
-- antet `Authorization: Basic`, deci singur nu deschide nimic, iar comerciantul
-- trebuie sa-l poata reciti ca sa stie CE APLICATIE din portalul UPS a legat.
-- Acelasi rationament ca la `fedex_config.client_id` si `oblio_config.client_id`.
-- Nici `account_number` nu e credentiala — el se tipareste pe fiecare eticheta si
-- pe fiecare factura UPS pe care o primeste comerciantul.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('ups_config', 'client_secret')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
-- Prima regenereaza SELECT-ul vederii publice, a doua corpul declansatorului
-- INSTEAD OF UPDATE — si fara a doua salvarea configului nu scrie nimic, tacut.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 5. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, `rezerva_operatie_externa` cade pe constrangere INAINTE de orice
-- apel, iar comerciantul primeste la nesfarsit „Nu am putut porni operatia in
-- siguranta" fara sa afle de ce.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
--
-- ⚠ La UPS registrul e la fel de necesar ca la FedEx: `idempot*` are ZERO potriviri
-- in `Shipping.yaml`, iar `transId` e, prin propria lor descriere, doar „an
-- identifier unique to the request" — nimic despre deduplicare. O reincercare oarba
-- emite al doilea AWB, taxabil.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'posta'::text, 'innoship'::text, 'packeta'::text, 'smartship'::text,
    'shipo'::text, 'fedex'::text, 'ups'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 6. Indexul cronului
--
-- ⚠ PARTIAL, si cu STATUSUL in predicat, exact ca la ceilalti: comenzile incheiate
-- isi pastreaza numarul AWB, deci ar ramane in index cu marcajul inghetat la
-- ultima verificare — adica in CAPUL lui, unde sorteaza cele mai vechi. Cu vremea,
-- primele randuri citite ar fi numai comenzi moarte.
--
-- `nulls first` nu e ornament: implicitul lui Postgres la `asc` e `nulls last`, iar
-- scris invers expedierile NEINTREBATE VREODATA ar iesi ultimele si, sub plafon,
-- niciodata.
--
-- ⚠ La UPS cronul e SINGURA cale practica de urmarire, si nu din lipsa de webhook.
-- „UPS Track Alert API v2" exista si nu cere contract separat — dar:
--   * abonamentul pe COLET expira in 14 zile („you must resubscribe"), iar un retur
--     din vama trece usor de doua saptamani;
--   * in v2 adresa de webhook si credentiala NU se mai trimit prin API, ci se
--     configureaza DE MANA in portalul lor („Manage Webhook Credentials") — deci nu
--     se pot da pe magazin, iar mesajul lor nu poarta niciun numar de cont;
--   * mediul CIE „will not create any subscription", deci bucla nu se poate proba;
--   * `activityLocation.postalCode` are `pattern: ^\d{5}(?:[-\s]\d{4})?$`, adica
--     forma AMERICANA — un cod postal romanesc de 6 cifre nici nu trece.
-- ---------------------------------------------------------------------------
create index if not exists orders_ups_urmarire_idx
  on public.orders (ups_status_checked_at asc nulls first)
  where ups_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 7. PostgREST trebuie sa afle de coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
