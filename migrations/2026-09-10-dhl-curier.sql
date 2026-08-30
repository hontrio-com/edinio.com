-- DHL Express (MyDHL API), al saisprezecelea transportator.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `dhl_config` e ceruta in ACELASI select cu restul
-- setarilor de livrare, iar PostgREST respinge INTREAGA interogare cand o coloana
-- lipseste — deci codul pusat inaintea migratiei ar rupe „Setari → Livrare" si
-- checkout-ul pe TOATE magazinele, nu doar pe cele cu DHL.
-- (Incident 2026-09-03, cu Posta si Innoship. Vezi `npm run verifica:coloane`.)
--
-- ═══ DE UNDE VIN AFIRMATIILE DE MAI JOS ═══
--
-- Spre deosebire de UPS (unde apendicele cu codurile nu e publicat nicaieri) si de
-- FedEx (unde schemele sunt ascunse in atribute HTML), DHL publica TREI surse care
-- se verifica una pe alta, toate fara autentificare:
--
--   S1  OpenAPI 3.0 oficial, `info.version: 3.3.1`, `x-release-date: 2026-06-28`:
--       https://developer.dhl.com/sites/default/files/2026-07/dpdhl-express-api-3.3.1.yaml
--       (1,2 MB; nu e linkat vizibil in pagina, e in atributul `SpecFile` din HTML)
--   S2  Datele de referinta, 19 nomenclatoare, ACELEASI numere de versiune si data:
--       https://developer.dhl.com/sites/default/files/2026-06/ExpressReferenceData_3.3.1.zip
--       → `ExpressReferenceData_2026-06-28.xlsx` (foile `productCode`, `serviceCode`,
--       `trackingEventCode`, `returnStatusMessage`, `country`, `countryPostalcodeFormat`,
--       `outputImageTemplate`, `incoterm`, …)
--   S3  „MyDHL API — SOAP Developer Guide v2.37", 473 de pagini. E singurul document
--       in proza care descrie SEMANTICA (obligativitate, unicitate, ce inseamna un
--       camp). ⚠ El insusi spune la pagina 18: „visit developer.dhl.com/express for
--       the REST documentation and discard this document including the endpoints" —
--       deci endpointurile lui NU se folosesc, dar explicatiile lui raman singurele.
--   S4  „Ghidul de Servicii si Tarife DHL Express 2026: Romania" (RO + EN) si pagina
--       „Optional Services" de pe mydhl.express.dhl/ro/…, pentru ce se vinde AICI.
--
-- Ce atinge migratia:
--   1. `public.orders`: coloanele expedierii;
--   2. `public.dhl_etichete`: eticheta si documentele, pastrate de NOI;
--   3. `privat.store_settings`: `dhl_config`;
--   4. `privat.campuri_secrete`: parola MyDHL API;
--   5. registrul de operatii externe: furnizorul `dhl`;
--   6. indexul partial al cronului de urmarire.

-- ---------------------------------------------------------------------------
-- 1. Coloanele expedierii
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists dhl_awb_number text;
comment on column public.orders.dhl_awb_number is
  'DHL: `shipmentTrackingNumber` din `POST /shipments`. E numarul de expediere (10 cifre) si '
  'se foloseste in TOATE celelalte apeluri ca segment de cale: `GET /shipments/{n}/tracking`, '
  '`GET /shipments/{n}/get-image` (reimprimare), `GET /shipments/{n}/proof-of-delivery`. '
  '⚠ NU e acelasi lucru cu `packages[].trackingNumber`, care e per COLET; la o expediere '
  'cu un singur colet ele coincid, la mai multe NU.';

-- ⚠ O SINGURA coloana de status, spre deosebire de UPS (care are `type` si `code`).
--
-- La DHL vocabularul e unul singur si e PUBLICAT INTEGRAL: `trackingEventCode` din
-- datele de referinta are 65 de randuri, cu `eventTypeCode` de doua litere,
-- `eventTypeDescription` si `visibleToCustomer`. Se poate si interoga la rulare:
-- `GET /reference-data?datasetName=trackingEventCode`.
--
-- ⚠ DAR enumerarea e INCHISA CA DATE si DESCHISA CA CONTRACT: in OpenAPI campul e
-- `typeCode: {type: string, example: PU}`, FARA `enum`. Iar DHL a adaugat coduri fara
-- preaviz (`PY` si `SM` pe 4 iunie 2024, apoi `SD`, `EM`, `MF`). Deci se pastreaza
-- BRUT, iar cronul jurnalizeaza codurile necunoscute ca sa creasca tabelul din trafic
-- real — acelasi tipar ca la UPS.
alter table public.orders
  add column if not exists dhl_status_code text;
comment on column public.orders.dhl_status_code is
  'DHL: `shipments[].events[].typeCode`, doua litere. Enumerarea are 65 de valori si e '
  'publicata (`trackingEventCode` in ExpressReferenceData). '
  '⚠ `OK` = „Delivery" si e SINGURUL cod de livrare — ghidul lor il numeste chiar '
  '„final disposition event (such as OK event)". NU confunda cu `WC` „With delivering '
  'courier" (iesit la livrare, echivalentul lui `D` de la UPS). '
  '⚠ `PD` = livrare PARTIALA si `DD` = livrat AVARIAT: amandoua sunt livrari care CER '
  'interventie, nu finalizari. `RT` = returnat expeditorului. '
  '⚠ Set DESCHIS ca si contract: OpenAPI nu are `enum` pe camp, iar DHL a adaugat coduri '
  'fara preaviz. Orice `switch` are nevoie de `default` care pastreaza valoarea bruta.';

alter table public.orders
  add column if not exists dhl_status_checked_at timestamptz;
comment on column public.orders.dhl_status_checked_at is
  'DHL: cand a intrebat cronul ultima data. Da ORDINEA de lucru a cronului (cele mai '
  'vechi primele), deci se scrie SI cand statusul n-a schimbat nimic. '
  '⚠ Ritmul e limitat de ei: „we allow up to 10 fetches per shipment per day". De aceea '
  'cronul ruleaza la 3 ore (8 treceri pe zi), nu la 2 ca la ceilalti.';

alter table public.orders
  add column if not exists dhl_awb_at timestamptz;
comment on column public.orders.dhl_awb_at is
  'DHL: cand s-a emis AWB-ul. Ancoreaza fereastra cronului de urmarire SI intervalul '
  '`dateRangeFrom`/`dateRangeTo` al cautarii dupa referinta — care, la DHL, e '
  'OBLIGATORIU: „When tracking by Shipment reference you need to restrict the search by '
  'timeframe."';

-- ⚠ DOUA coloane de produs, si nu din belsug.
alter table public.orders
  add column if not exists dhl_product_code text;
comment on column public.orders.dhl_product_code is
  'DHL: `productCode` GLOBAL, o singura litera (`N`=Express Domestic, `P`=Express '
  'Worldwide non-doc, `U`=Express Worldwide EU doc, `D`=Express Worldwide doc, '
  '`W`/`H`=Economy Select, `K`/`E`=Express 9:00, `T`/`Y`=Express 12:00). '
  '⚠ E OBLIGATORIU la emitere: `productCode` e in lista `required` a lui `POST /shipments`. '
  'Spre deosebire de UPS — care, fara cod de serviciu, factureaza tacit cel mai scump '
  'produs — DHL REFUZA cererea. Esecul e zgomotos, nu scump. '
  '⚠ TEXT, nu char: schema declara `minLength: 1, maxLength: 6`, desi toate cele 36 de '
  'coduri din nomenclatorul lor au exact un caracter.';

alter table public.orders
  add column if not exists dhl_local_product_code text;
comment on column public.orders.dhl_local_product_code is
  'DHL: `localProductCode`, codul de produs LOCAL al tarii. `maxLength: 3`. '
  'Descrierea lor: „Please enter DHL Express Local Product code. **Important when '
  'shipping domestic products.**" '
  '⚠ NU SE COMPUNE NICIODATA DE NOI. Documentatia lor se contrazice pe latimea lui: '
  'schema zice 1-3 caractere, toate exemplele din OpenAPI si din ghidul SOAP il scriu cu '
  'UN caracter (`localProductCode: P`), iar codurile locale publicate de DHL UK au TREI '
  '(`WPX`, `DOX`, `ECX`, `DOM`). Se copiaza LITERAL din raspunsul `/rates` sau `/products` '
  'pentru ruta respectiva. Nul cand cotarea nu l-a intors.';

alter table public.orders
  add column if not exists dhl_product_name text;
comment on column public.orders.dhl_product_name is
  'DHL: `productName` din cotare („EXPRESS WORLDWIDE NONDOC"), pentru panou si pentru '
  'emailul catre client. Fara el randul ar arata o singura litera.';

alter table public.orders
  add column if not exists dhl_cost numeric(10,2);
comment on column public.orders.dhl_cost is
  'DHL: totalul de pe oferta aleasa, luat din `totalPrice[]` cu `currencyType = BILLC` '
  '(valuta de FACTURARE a contului). Se pastreaza numarul lor asa cum vine, fara niciun '
  'adaos inventat.';

-- ⚠ FARA COLOANA ASTA, UN PRET IN EURO S-AR CITI CA LEI.
alter table public.orders
  add column if not exists dhl_currency text;
comment on column public.orders.dhl_currency is
  'DHL: `priceCurrency` de pe suma aleasa. ⚠ Exista dinadins: `totalPrice[]` vine ca '
  'TABLOU, cu acelasi transport exprimat in MAI MULTE valute deodata (`BILLC` = valuta '
  'de facturare, `PULCL` = valuta tarii de ridicare, `BASEC` = valuta de baza). Citit '
  'primul element la intamplare, acelasi transport iese cand 250 (RON), cand 50 (EUR). '
  'Nomenclatorul lor de tari da `RO → isoCurrency: RON`; checkout-ul refuza orice oferta '
  'care nu vine in RON, iar coloana pastreaza dovada.';

alter table public.orders
  add column if not exists dhl_tracking_url text;
comment on column public.orders.dhl_tracking_url is
  'DHL: pagina publica de urmarire. Se COMPUNE, nu se citeste din raspuns — `trackingUrl` '
  'exista in schema lor, dar nu e garantat pe fiecare raspuns.';

-- ⚠ Referinta NOASTRA, si SINGURUL drum inapoi cand raspunsul se pierde.
alter table public.orders
  add column if not exists dhl_reference text;
comment on column public.orders.dhl_reference is
  'DHL: sirul trimis ca `customerReferences[].value` cu `typeCode = CU` („Consignor '
  'reference number"), de forma `EDN-<4 caractere din business_id>-<order_number>`. '
  '⚠⚠ E SINGURA PLASA DE SIGURANTA A INTEGRARII. `POST /shipments` NU are idempotenta: '
  '„idempot" are ZERO potriviri in tot OpenAPI-ul de 1,2 MB, in ghidul SOAP de 473 de '
  'pagini si in ghidul de date de referinta. Nu exista antet de deduplicare, nu exista '
  'fereastra de detectie, nu exista eroare „shipment already exists". O reincercare oarba '
  'creeaza A DOUA expediere. '
  'Recuperarea se face cu `GET /tracking?shipmentReference=<asta>&shipmentReferenceType=CU'
  '&shipperAccountNumber=…&dateRangeFrom=…&dateRangeTo=…`. '
  '⚠ Cele patru caractere din `business_id` nu sunt ornament: `order_number` reporneste la '
  '#0001 pe fiecare magazin (`UNIQUE (business_id, order_number)`), iar cautarea se face pe '
  'CONT — doua magazine cu acelasi cont DHL si-ar citi comenzile unul altuia. Aceeasi '
  'lectie ca la FedEx, UPS, SmartShip si BT iPay. '
  '⚠ Si mai e ceva: `Message-Reference` (antetul) NU tine loc de asta. Ghidul lor spune '
  'verbatim ca e „not required to be unique between requests", iar cand nu-l trimiti DHL '
  'il genereaza singur — deci nu se poate prezice si nu exista niciun endpoint care sa '
  'caute dupa el.';

-- ⚠ Numarul de ridicare, si de ce e singura „anulare" pe care o avem.
alter table public.orders
  add column if not exists dhl_dispatch_confirmation text;
comment on column public.orders.dhl_dispatch_confirmation is
  'DHL: `dispatchConfirmationNumber` din raspunsul de emitere, cand s-a cerut si ridicare '
  '(`pickup.isRequested: true`). '
  '⚠⚠ EXISTA FIINDCA MyDHL API **NU ARE ANULARE DE EXPEDIERE**. Verificat programatic pe '
  'specificatia oficiala: `delete:` apare O SINGURA data in tot fisierul, si aceea pe '
  '`/pickups/{dispatchConfirmationNumber}`. DHL isi enumera singur serviciul `DeleteShipment` '
  'in lista de mesaje de status a lui `/reference-data`, dar NU expune niciun endpoint '
  'pentru el — a ramas pe SOAP si nu a fost portat. '
  'Deci se poate anula RIDICAREA (`DELETE /pickups/{n}` cu `requestorName` si `reason`, '
  'amandoua obligatorii), nu AWB-ul. DHL e al doilea curier fara anulare de AWB, dupa Packeta. '
  '⚠ Si nu e o lipsa ieftina: conditiile lor legale spun „DHL Express may request that You '
  'compensate it in the event that You do not subsequently tender a shipment for the '
  'shipping orders at the expected pick-up time." Un AWB emis din greseala poate fi FACTURAT.';

-- ---------------------------------------------------------------------------
-- 2. Eticheta si documentele, pastrate de NOI
--
-- ⚠ DHL ARE reimprimare (`GET /shipments/{awb}/get-image`) — si totusi se pastreaza
-- copia noastra, din trei motive independente:
--
--   a) REIMPRIMAREA CERE O CHEIE COMPUSA PE CARE TREBUIE S-O STIM OricUM.
--      `pickupYearAndMonth` e `required: true`, in format `YYYY-MM`. Nu poti reimprima
--      o eticheta stiind doar AWB-ul. Iar campul se numeste „pickup's date" in timp ce
--      singura data pe care o trimitem la creare e `plannedShippingDateAndTime` — deci
--      o expediere planificata pe 31 ianuarie si ridicata pe 1 februarie e cazul care
--      rupe reimprimarea. NEDOCUMENTAT de ei care dintre cele doua e.
--   b) `typeCode` la reimprimare accepta doar `waybill`, `commercial-invoice`,
--      `customs-entry`, `transport-accompanying-document`, `generic-entry-summary`,
--      `dhl-issued-proforma-invoice` — si raspunde `1504 No document images found for
--      the provided search criteria` cand DHL nu mai are ce da.
--   c) O eticheta pierduta de noi nu se mai poate emite din nou fara sa se emita si o
--      a doua expediere, taxabila (vezi lipsa de anulare de mai sus).
--
-- ⚠ VESTEA BUNA, si difera de UPS: **PDF-ul EXISTA la emitere.** Nomenclatorul lor de
-- sabloane (`outputImageTemplate`) da pentru „CreateShipment / transport label":
--   ECOM26_A4_001      PDF               8.27 x 11.69 in (A4 peisaj)
--   ECOM26_84_A4_001   PDF               A4, cu `labelCustomerDataText`
--   ECOM_TC_A4         PDF               A4 cu termeni si conditii
--   ECOM26_84_001      ZPL, LP2, EPL2    8 x 4 in (termica)
--   ECOM26_A6_002      ZPL, LP2, EPL2    A6 termica
-- La UPS, PDF-ul aparea NUMAI la reimprimare, iar comerciantul fara imprimanta termica
-- primea un GIF. Aici implicitul poate fi PDF de la bun inceput.
--
-- Tabel separat, nu coloane pe `orders`: o eticheta face zeci de kiloocteti in base64,
-- iar `orders` se citeste pe liste de sute de randuri.
-- ---------------------------------------------------------------------------
create table if not exists public.dhl_etichete (
  order_id     uuid primary key references public.orders(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  awb_number   text not null,
  /* `PDF` | `ZPL` | `EPL2` | `LP2` — ce a intors `documents[].imageFormat`.
     ⚠ Se scrie ce a INTORS, nu ce s-a cerut. */
  format       text not null,
  continut     text not null,
  /* ⚠ Luna ridicarii, in format `YYYY-MM`, exact cum a plecat
     `plannedShippingDateAndTime`. Fara ea reimprimarea e IMPOSIBILA:
     `pickupYearAndMonth` e parametru OBLIGATORIU la `GET /shipments/{awb}/get-image`.
     Se scrie o data, la emitere, si nu se mai atinge. */
  luna_ridicare text,
  /* ⚠ A DOUA hartie, la expedierile VAMALE (`isCustomsDeclarable: true`, adica RO catre
     afara Uniunii): factura comerciala randata de ei, `documents[].typeCode = invoice`.
     Netiparita si nelipita pe colet, coletul se opreste in vama. */
  factura      text,
  /* ⚠ A TREIA hartie: `waybillDoc` — documentul de transport (arhiva expeditorului).
     Se cere separat prin `outputImageProperties.imageOptions[]` si NU vine din oficiu. */
  document_transport text,
  creat_la     timestamptz not null default now()
);

comment on table public.dhl_etichete is
  'Eticheta DHL in base64, pastrata de noi. DHL ARE reimprimare, dar ea cere `pickupYearAndMonth` '
  '(obligatoriu, `YYYY-MM`) pe langa AWB, iar DHL nu are anulare de expediere — deci o eticheta '
  'pierduta nu se poate reface fara a emite (si a plati) o a doua expediere. Se scrie o singura '
  'data, la emitere.';
comment on column public.dhl_etichete.continut is
  '`documents[]` cu `typeCode = label`, exact cum vine de la ei (base64). Nu se transforma: '
  'orice re-codare ar putea strica un ZPL.';

create index if not exists dhl_etichete_business_idx
  on public.dhl_etichete (business_id, creat_la desc);

-- ⚠ RLS PORNIT, FARA NICIO POLITICA — dinadins.
--
-- O eticheta AWB poarta numele, telefonul si adresa cumparatorului. Nimeni nu are ce
-- citi de aici cu clientul lui: descarcarea trece prin `getDhlEtichetaAction`, care
-- verifica intai proprietatea magazinului si abia apoi citeste cu service role.
-- (`service_role` ocoleste RLS din oficiu, deci nu are nevoie de politica.)
alter table public.dhl_etichete enable row level security;

-- ⚠ `revoke ... from anon` singur NU face nimic: EXECUTE/SELECT sunt ale lui PUBLIC
-- din oficiu. Se revoca de la PUBLIC, apoi se dau inapoi doar cui trebuie.
revoke all on public.dhl_etichete from public;
revoke all on public.dhl_etichete from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e generata
-- din tabel de `reconstruieste_store_settings()`, deci o coloana pusa direct pe ea ar
-- disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists dhl_config jsonb;

comment on column privat.store_settings.dhl_config is
  'DHL Express (MyDHL API): {enabled, username, password, account_number, mediu, expeditor{…}, '
  'produse_permise[], format_eticheta, sablon_eticheta, lungime_cm, latime_cm, inaltime_cm, '
  'continut_implicit, valoare_declarata, asigurare_activa, incoterm, cere_ridicare, '
  'notifica_destinatarul}. '
  '⚠ `mediu` alege gazda, si AICI E O CAPCANA PE CARE CEILALTI CINCISPREZECE N-O AU: '
  'productia e PREFIXUL testului. `https://express.api.dhl.com/mydhlapi/test` (test) fata de '
  '`https://express.api.dhl.com/mydhlapi` (productie). La FedEx si UPS gazdele erau complet '
  'diferite (`apis-sandbox.fedex.com` vs `apis.fedex.com`); aici o singura bucata de cale '
  'lipsa nu da 404 — CREEAZA O EXPEDIERE REALA, FACTURABILA. Codul are garda explicita. '
  '⚠ `username`/`password` sunt credentialele MyDHL API date de consultantul DHL Express, '
  'NU „API Key"/„API Secret" din aplicatia de pe developer.dhl.com (acelea sunt pentru '
  'API-urile unified). Formularul le numeste asa dinadins. '
  '⚠ `account_number` e numarul de cont DHL Express (9 cifre), care pleaca in `accounts[]` '
  'cu `typeCode: shipper`. Nu e credentiala: se tipareste pe fiecare factura DHL. '
  '⚠⚠ NU EXISTA `ramburs_activ`. DHL Express NU ofera plata la livrare cu origine Romania — '
  'vezi nota lunga de la indexul cronului. Codul `KB` („Cash On Delivery") exista in '
  'nomenclatorul lor GLOBAL, dar nu apare in niciuna dintre cele patru surse romanesti. '
  'Doar `password` se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 4. Secretul, criptat in repaus
--
-- ⚠ Numele campului trebuie sa fie IDENTIC in trei locuri: in `DhlConfig`
-- (lib/dhl/client.ts), in `CAMPURI_SECRETE` (lib/integrari/secrete.ts) si aici.
-- Nimic nu verifica potrivirea — nici tsc, nici probele, nici build-ul — iar o
-- nepotrivire taie TOT stratul de secrete in tacere: mascarea nu mascheaza,
-- declansatorul nu cripteaza, pastrarea nu pastreaza. (Defectul camelCase/snake_case
-- de la Packeta, 15.08.2026.)
--
-- ⚠ `username` NU intra aici. La DHL autentificarea e `Authorization: Basic`, deci
-- utilizatorul pleaca chiar ca prima jumatate a acreditarii — dar singur nu deschide
-- nimic, iar comerciantul trebuie sa-l poata reciti ca sa stie CE CONT a legat.
-- Acelasi rationament ca la `ups_config.client_id`, `fedex_config.client_id`,
-- `posta_config.username` si `pallex_config.username`.
-- Nici `account_number` nu e credentiala.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('dhl_config', 'password')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
-- Prima regenereaza SELECT-ul vederii publice, a doua corpul declansatorului
-- INSTEAD OF UPDATE — si fara a doua salvarea configului nu scrie nimic, tacut.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 5. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, `rezerva_operatie_externa` cade pe constrangere INAINTE de orice apel,
-- iar comerciantul primeste la nesfarsit „Nu am putut porni operatia in siguranta"
-- fara sa afle de ce.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
--
-- ⚠⚠ La DHL registrul nu e o masura de prudenta, e SINGURA aparare. La UPS si FedEx
-- lipsa idempotentei era compensata de existenta anularii: un al doilea AWB emis din
-- greseala se putea sterge. Aici NU se poate. Un `POST /shipments` reincercat orbeste
-- produce o a doua expediere care nu se mai poate anula si care poate fi facturata.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'posta'::text, 'innoship'::text, 'packeta'::text, 'smartship'::text,
    'shipo'::text, 'fedex'::text, 'ups'::text, 'dhl'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 6. Indexul cronului
--
-- ⚠ PARTIAL, si cu STATUSUL in predicat, exact ca la ceilalti: comenzile incheiate isi
-- pastreaza numarul AWB, deci ar ramane in index cu marcajul inghetat la ultima
-- verificare — adica in CAPUL lui, unde sorteaza cele mai vechi. Cu vremea, primele
-- randuri citite ar fi numai comenzi moarte.
--
-- `nulls first` nu e ornament: implicitul lui Postgres la `asc` e `nulls last`, iar
-- scris invers expedierile NEINTREBATE VREODATA ar iesi ultimele si, sub plafon,
-- niciodata.
--
-- ⚠ CRONUL E SINGURA CALE, si aici motivul e mai apasat decat la UPS.
-- „Shipment Tracking - Unified - Push" exista, dar DHL EXPRESS NU E SUPORTAT:
-- documentul lor „Push API 101 for Externals" (iunie 2025) scrie in tabelul de
-- disponibilitate „DHL Express — Subscription by shipment ID: No / Subscription by
-- account ID: No", iar articolul lor de suport spune acelasi lucru.
-- ⚠⚠ SI TOTUSI, schema OpenAPI a Push-ului are `express` in `enum` — ba chiar ca
-- `example`. Adica `POST /subscription` cu `service: express` trece de validare si
-- raspunde `201 Created`, dupa care nu soseste nicio notificare. Exact tiparul
-- „integrare care nu face nimic": raspuns de succes, zero efect.
-- Peste asta: abonamentul e de cel mult 10 AWB-uri, cere handshake de secret, cere
-- aprobare manuala de la un administrator DHL pentru abonarea pe cont, si cere raspuns
-- HTTP 200 in 5 secunde altfel se dezactiveaza si anuntul pleaca pe emailul contactului
-- tehnic al contului DHL — nu in aplicatie.
--
-- ⚠ RITMUL: `GET /tracking` accepta pana la 200 de AWB-uri pe cerere („Supports up to
-- 200 tracking numbers"), deci acoperirea e ieftina. Dar DHL scrie „we allow up to 10
-- fetches per shipment per day. We also expect these calls to be done in an even way
-- throughout the day." De aceea cronul ruleaza la 3 ore (8 treceri/zi), nu la 2 ca la
-- ceilalti — un cron la 2 ore ar fi 12/zi, adica peste plafonul declarat de ei.
-- ---------------------------------------------------------------------------
create index if not exists orders_dhl_urmarire_idx
  on public.orders (dhl_status_checked_at asc nulls first)
  where dhl_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 7. PostgREST trebuie sa afle de coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
