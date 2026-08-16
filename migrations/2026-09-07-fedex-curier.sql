-- FedEx, al paisprezecelea transportator (si primul care NU accepta ramburs).
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `fedex_config` e ceruta in ACELASI select cu
-- restul setarilor de livrare, iar PostgREST respinge INTREAGA interogare cand o
-- coloana lipseste — deci codul pusat inaintea migratiei ar rupe „Setari →
-- Livrare" si checkout-ul pe TOATE magazinele, nu doar pe cele cu FedEx.
-- (Incident 2026-09-03, cu Posta si Innoship. Vezi `npm run verifica:coloane`.)
--
-- Ce atinge:
--   1. `public.orders`: coloanele expedierii;
--   2. `public.fedex_etichete`: eticheta pastrata de NOI (vezi motivul la sectiune);
--   3. `privat.store_settings`: `fedex_config`;
--   4. `privat.campuri_secrete`: cheia secreta OAuth;
--   5. registrul de operatii externe: furnizorul `fedex`;
--   6. indexul partial al cronului de urmarire.

-- ---------------------------------------------------------------------------
-- 1. Coloanele expedierii
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists fedex_awb_number text;
comment on column public.orders.fedex_awb_number is
  'FedEx: `masterTrackingNumber` din `POST /ship/v1/shipments`. Se pastreaza cel de '
  'EXPEDIERE, nu cel de colet: la un singur colet sunt egale, iar anularea '
  '(`PUT /ship/v1/shipments/cancel`) lucreaza pe el.';

-- ⚠ TEXT, nu integer, si SET DESCHIS. `latestStatusDetail.derivedCode` NU are enum
-- publicat in OpenAPI-ul FedEx — doar exemple (`PU`, `DE`, `DP`, `HL`, `OC`), iar
-- `HL` nici macar nu apare in tabelul lor oficial de `eventType`. Colectia lor de
-- teste mai contine `AD`, `AP`, `ED`, `FD`. Orice `switch` pe coloana asta trebuie
-- sa aiba `default` care pastreaza valoarea bruta.
alter table public.orders
  add column if not exists fedex_status_code text;
comment on column public.orders.fedex_status_code is
  'FedEx: ultimul `latestStatusDetail.derivedCode` vazut (OC, PU, IT, OD, DL, DE, '
  'CA, RS…). TEXT si SET DESCHIS: FedEx nu publica enumerarea, doar exemple.';

alter table public.orders
  add column if not exists fedex_status_checked_at timestamptz;
comment on column public.orders.fedex_status_checked_at is
  'FedEx: cand a intrebat cronul ultima data. Da ORDINEA de lucru a cronului '
  '(cele mai vechi primele), deci se scrie SI cand statusul n-a schimbat nimic.';

alter table public.orders
  add column if not exists fedex_awb_at timestamptz;
comment on column public.orders.fedex_awb_at is
  'FedEx: cand s-a emis AWB-ul. Ancoreaza fereastra cronului de urmarire SI '
  'fereastra `shipDateBegin`/`shipDateEnd` a cautarii dupa referinta — la ei '
  'intervalul e obligatoriu si nu poate depasi 30 de zile.';

alter table public.orders
  add column if not exists fedex_service_type text;
comment on column public.orders.fedex_service_type is
  'FedEx: serviciul ales de client (`FEDEX_PRIORITY`, `FEDEX_PRIORITY_EXPRESS`, '
  '`FEDEX_FIRST`, `FEDEX_INTERNATIONAL_PRIORITY`…). E CHEIA ofertei: acelasi curier '
  'intoarce mai multe servicii la preturi diferite, deci fara el o reemitere ar '
  'putea pleca pe alt serviciu decat cel platit de cumparator.';

alter table public.orders
  add column if not exists fedex_service_name text;
comment on column public.orders.fedex_service_name is
  'FedEx: `serviceName` din cotare, pentru panou si pentru emailul catre client. '
  'Fara el randul ar arata enumerarea cu majuscule si underscore.';

alter table public.orders
  add column if not exists fedex_cost numeric(10,2);
comment on column public.orders.fedex_cost is
  'FedEx: `ratedShipmentDetails[].totalNetCharge` de pe oferta aleasa. ⚠ FedEx NU '
  'documenteaza daca include TVA-ul romanesc: `totalNetFedExCharge` e explicit fara '
  'taxe, iar `totalVatCharge` exista separat. Se pastreaza numarul lor asa cum vine, '
  'fara niciun adaos inventat — la fel ca `shipo_cost`.';

-- ⚠ FARA COLOANA ASTA, UN PRET IN EURO S-AR CITI CA LEI.
alter table public.orders
  add column if not exists fedex_currency text;
comment on column public.orders.fedex_currency is
  'FedEx: `shipmentRateDetail.currency` de pe oferta aleasa. ⚠ Exista dinadins: '
  'contul poate cota in EUR sau USD, iar un numar de 12 (euro) scris pe o comanda '
  'in lei ar subfactura transportul de cinci ori, tacut. Checkout-ul refuza orice '
  'oferta care nu vine in RON; coloana pastreaza dovada.';

alter table public.orders
  add column if not exists fedex_tracking_url text;
comment on column public.orders.fedex_tracking_url is
  'FedEx: pagina publica de urmarire (fedex.com/fedextrack). ⚠ NU se salveaza URL-ul '
  'de eticheta din raspunsul lor: expira in cel mult 12 ore (documentatia lor se '
  'contrazice, 12 vs 24), iar despre autentificare nu spune nimic. Vezi fedex_etichete.';

-- ⚠ Referinta NOASTRA, si singura cale inapoi cand raspunsul se pierde.
alter table public.orders
  add column if not exists fedex_reference text;
comment on column public.orders.fedex_reference is
  'FedEx: sirul trimis ca `customerReferences[].value` cu tipul `CUSTOMER_REFERENCE`, '
  'de forma `EDN-<4 caractere din business_id>-<order_number>`. ⚠ Cele patru caractere '
  'nu sunt ornament: `order_number` reporneste la #0001 pe fiecare magazin, iar FedEx '
  'cauta pe CONT — doua magazine cu acelasi cont si-ar citi comenzile unul altuia '
  '(aceeasi lectie ca la SmartShip si BT iPay). Cu el, `POST /track/v1/referencenumbers` '
  'inchide fereastra „am trimis si n-am primit raspuns" printr-o CITIRE.';

-- ---------------------------------------------------------------------------
-- 2. Eticheta, pastrata de NOI
--
-- ⚠ FEDEX NU ARE ENDPOINT DE REIMPRIMARE. Cautat in ambele specificatii OpenAPI
-- (`Shipment-Resource.json`, `Tag-Resource.json`) si in ghidul narativ: nu exista.
-- Documentatia lor spune verbatim ca eticheta „may be reprinted by sending the
-- ORIGINAL thermal label buffer to the printer" — adica bufferul il tii TU.
-- Iar `labelResponseOptions: URL_ONLY` da un link care expira („12 hours" scrie la
-- campul de cerere, „24 hours" la campul de raspuns, in ACELASI fisier).
--
-- Deci: se cere `LABEL` (base64), si se pastreaza aici. La toti ceilalti
-- treisprezece curieri eticheta se re-cere de la ei la fiecare descarcare; FedEx e
-- singurul la care o pierdere de-a noastra e definitiva.
--
-- Tabel separat, nu coloana pe `orders`: un PDF de 4x6 inch face zeci de kilooctdeti
-- in base64, iar `orders` se citeste pe liste de sute de randuri.
-- ---------------------------------------------------------------------------
create table if not exists public.fedex_etichete (
  order_id     uuid primary key references public.orders(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  awb_number   text not null,
  /* `PDF` | `PNG` | `ZPLII` — ce s-a cerut la `labelSpecification.imageType`. */
  format       text not null,
  /* `PAPER_4X6`, `PAPER_85X11_TOP_HALF_LABEL`, `STOCK_4X6`… */
  stoc         text,
  continut     text not null,
  creat_la     timestamptz not null default now()
);

comment on table public.fedex_etichete is
  'Eticheta FedEx in base64, pastrata de noi fiindca FedEx NU are endpoint de '
  'reimprimare si linkul din raspuns expira. Se scrie o singura data, la emitere.';
comment on column public.fedex_etichete.continut is
  '`shipmentDocuments[].encodedLabel` sau `pieceResponses[].packageDocuments[].encodedLabel`, '
  'exact cum vine de la ei (base64). Nu se transforma: orice re-codare ar putea strica un ZPL.';

create index if not exists fedex_etichete_business_idx
  on public.fedex_etichete (business_id, creat_la desc);

-- ⚠ RLS PORNIT, FARA NICIO POLITICA — dinadins.
--
-- O eticheta AWB poarta numele, telefonul si adresa cumparatorului. Nimeni nu are
-- ce citi de aici cu clientul lui: descarcarea trece prin `getFedexEtichetaAction`,
-- care verifica intai proprietatea magazinului si abia apoi citeste cu service role.
-- (`service_role` ocoleste RLS din oficiu, deci nu are nevoie de politica.)
alter table public.fedex_etichete enable row level security;

-- ⚠ `revoke ... from anon` singur NU face nimic: EXECUTE/SELECT sunt ale lui PUBLIC
-- din oficiu. Se revoca de la PUBLIC, apoi se dau inapoi doar cui trebuie.
revoke all on public.fedex_etichete from public;
revoke all on public.fedex_etichete from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists fedex_config jsonb;

comment on column privat.store_settings.fedex_config is
  'FedEx: {enabled, client_id, client_secret, account_number, mediu, expeditor{…}, '
  'servicii_permise[], pickup_type, format_eticheta, stoc_eticheta, lungime_cm, '
  'latime_cm, inaltime_cm, continut_implicit, valoare_declarata}. '
  '⚠ `mediu` alege gazda: `test` → apis-sandbox.fedex.com (raspunsuri VIRTUALE, '
  'preturi predefinite), `productie` → apis.fedex.com. '
  '⚠ RAMBURSUL NU EXISTA la FedEx: retras prin anuntul lor din 31.07.2023 peste tot '
  'in afara de FedEx Ground in/spre Canada. Nu adauga niciun camp de ramburs aici. '
  'Doar `client_secret` se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 4. Cheia secreta, criptata in repaus
--
-- ⚠ Numele campului trebuie sa fie IDENTIC in trei locuri: in `FedexConfig`
-- (lib/fedex/client.ts), in `CAMPURI_SECRETE` (lib/integrari/secrete.ts) si aici.
-- Nimic nu verifica potrivirea — nici tsc, nici probele, nici build-ul — iar o
-- nepotrivire taie TOT stratul de secrete in tacere: mascarea nu mascheaza,
-- declansatorul nu cripteaza, pastrarea nu pastreaza.
--
-- ⚠ `client_id` NU intra aici, desi FedEx il numeste „API Key": singur nu deschide
-- nimic (OAuth-ul lor cere si secretul), iar comerciantul trebuie sa-l poata reciti
-- ca sa stie CE PROIECT din portalul FedEx a legat. Acelasi rationament ca la
-- `oblio_config.client_id`. Nici `account_number` nu e credentiala — el se tipareste
-- pe fiecare factura FedEx pe care o primeste comerciantul.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('fedex_config', 'client_secret')
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
-- ⚠ La FedEx registrul e cu atat mai important: `POST /ship/v1/shipments` NU are
-- niciun mecanism de idempotenta (cautat `idempot*` si `Idempotency-Key` in ambele
-- specificatii — zero potriviri), iar `x-customer-transaction-id` e, prin propria
-- lor descriere, doar corelare cerere↔raspuns. O reincercare oarba emite al doilea
-- AWB, taxabil — exact defectul „emite AL DOILEA COLET" de la GLS.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'posta'::text, 'innoship'::text, 'packeta'::text, 'smartship'::text,
    'shipo'::text, 'fedex'::text,
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
-- ⚠ La FedEx cronul e SINGURA cale de urmarire, si nu din lipsa de webhook: ei au
-- webhook (Advanced Integrated Visibility), dar e produs cu plata (199-1499 $/luna)
-- si, verbatim din documentatia lor, „we do not offer webhooks for customers outside
-- the United States". Deci nu ne e disponibil, si nu are rost sa fie asteptat.
-- ---------------------------------------------------------------------------
create index if not exists orders_fedex_urmarire_idx
  on public.orders (fedex_status_checked_at asc nulls first)
  where fedex_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 7. PostgREST trebuie sa afle de coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
