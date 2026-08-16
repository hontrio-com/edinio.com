-- Shipo.ro, al treisprezecelea transportator (si al saselea broker).
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `shipo_config` e ceruta in ACELASI select cu
-- restul setarilor de livrare, iar PostgREST respinge INTREAGA interogare cand o
-- coloana lipseste — deci codul pusat inaintea migratiei ar rupe „Setari →
-- Livrare" si checkout-ul pe TOATE magazinele, nu doar pe cele cu Shipo.
-- (Incident 2026-09-03, cu Posta si Innoship. Vezi `npm run verifica:coloane`.)
--
-- Ce atinge:
--   1. `public.orders`: coloanele expedierii;
--   2. `privat.store_settings`: `shipo_config`;
--   3. `privat.campuri_secrete`: cheia de API;
--   4. registrul de operatii externe: furnizorul `shipo`;
--   5. indexul partial al cronului de urmarire.

-- ---------------------------------------------------------------------------
-- 1. Coloanele expedierii
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists shipo_awb_number text;
comment on column public.orders.shipo_awb_number is
  'Shipo: numarul AWB al curierului din spate (ex. „2150012345678"). TEXT, fiindca '
  'fiecare dintre cei sapte curieri revanduti are formatul lui.';

-- ⚠ ID-ul EXPEDIERII la ei, nu al AWB-ului. Exista fiindca `POST /shipment/send/{id}`
-- si eventualele reluari lucreaza pe el, iar numarul AWB nu-l inlocuieste: sunt doi
-- identificatori diferiti in acelasi raspuns (`expedition` si `awb`).
alter table public.orders
  add column if not exists shipo_expedition_id integer;
comment on column public.orders.shipo_expedition_id is
  'Shipo: id-ul expedierii in platforma lor (campul `expedition`). Necesar pentru '
  '`POST /shipment/send/{id}` cand crearea intoarce expedierea fara AWB.';

alter table public.orders
  add column if not exists shipo_rate_id integer;
comment on column public.orders.shipo_rate_id is
  'Shipo: serviciul de curierat ales (`rate_id`). E CHEIA ofertei alese de client: '
  'acelasi curier apare cu mai multe servicii (la adresa, in locker, PUDO) la preturi '
  'diferite, deci fara el o reemitere ar putea pleca pe alt serviciu decat cel platit.';

alter table public.orders
  add column if not exists shipo_courier_slug text;
comment on column public.orders.shipo_courier_slug is
  'Shipo: curierul real din spate (`courier_slug`: fancourier, cargus, dpd, gls, '
  'sameday, posta, fedex). TEXT — la ei curierii se identifica prin slug, nu prin numar.';

alter table public.orders
  add column if not exists shipo_courier_name text;
comment on column public.orders.shipo_courier_name is
  'Shipo: numele curierului, pentru panou. Fara el randul ar fi gol pana la o '
  'citire in nomenclator.';

alter table public.orders
  add column if not exists shipo_cost numeric(10,2);
comment on column public.orders.shipo_cost is
  'Shipo: costul expedierii asa cum l-a cotat brokerul (`total_fee`).';

alter table public.orders
  add column if not exists shipo_tracking_url text;
comment on column public.orders.shipo_tracking_url is
  'Shipo: pagina publica de urmarire. ⚠ NU se salveaza `label_a4`/`label_a6`: sunt '
  'linkuri catre PDF-uri de pe shipo.ro despre care NU stim daca sunt semnate sau '
  'publice, iar o eticheta AWB poarta numele, telefonul si adresa cumparatorului. '
  'Eticheta se aduce prin serverul nostru, cu token in antet — vezi lib/shipo/client.ts.';

alter table public.orders
  add column if not exists shipo_awb_at timestamptz;
comment on column public.orders.shipo_awb_at is
  'Shipo: cand s-a emis AWB-ul. Ancoreaza fereastra cronului de urmarire.';

-- ⚠ TEXT, nu integer. Statusurile lor sunt SIRURI („in_transit", „delivered",
-- „return_to_sender"), spre deosebire de SmartShip unde sunt numere. Coloana
-- copiata mecanic ca `integer` ar fi devenit inutilizabila dupa primele date.
alter table public.orders
  add column if not exists shipo_status_code text;
comment on column public.orders.shipo_status_code is
  'Shipo: ultimul `status_delivery` vazut (order_placed, collected, in_transit, '
  'out_for_delivery, delivered, canceled, dropoff_locker, dropoff_pudo, loaded_locker, '
  'loaded_pudo, return_to_sender). TEXT: la ei statusurile sunt siruri, nu coduri.';

alter table public.orders
  add column if not exists shipo_status_checked_at timestamptz;
comment on column public.orders.shipo_status_checked_at is
  'Shipo: cand a intrebat cronul ultima data. Da ORDINEA de lucru a cronului '
  '(cele mai vechi primele), deci se scrie SI cand statusul n-a schimbat nimic.';

-- Punctul de ridicare, cand livrarea e in locker sau PUDO.
alter table public.orders
  add column if not exists shipo_point_id integer;
comment on column public.orders.shipo_point_id is
  'Shipo: id-ul punctului din `GET /points`, cand serviciul livreaza in locker sau '
  'PUDO. ⚠ Se trimite in ACELASI camp (`recipient_address_id`) in care serviciile la '
  'adresa asteapta id-ul unei adrese SALVATE — doua feluri de id in acelasi camp, '
  'documentatia lor o spune apasat. De aia se tine separat de orice id de adresa.';

alter table public.orders
  add column if not exists shipo_point_name text;
comment on column public.orders.shipo_point_name is
  'Shipo: numele punctului ales, pentru panou si pentru emailul catre client.';

-- ---------------------------------------------------------------------------
-- 2. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists shipo_config jsonb;

comment on column privat.store_settings.shipo_config is
  'Shipo: {enabled, api_key, sender_address_id, sender_address_label, '
  'curieri_permisi[], foloseste_lockere, deschidere_la_livrare, asigura_coletul, '
  'notifica_destinatarul, ramburs_turbo, lungime_cm, latime_cm, inaltime_cm, '
  'continut_implicit, format_eticheta}. '
  '⚠ `sender_address_id` NU e un oras: e id-ul adresei de ridicare din '
  '`GET /client/address_list`, si tot el se trimite ca `sender_city` la `POST /rates`. '
  'Doar `api_key` se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 3. Cheia de API, criptata in repaus
--
-- ⚠ O SINGURA credentiala, si numele ei trebuie sa fie IDENTIC in trei locuri:
-- in `ShipoConfig` (client.ts), in `CAMPURI_SECRETE` (secrete.ts) si aici.
-- Nimic nu verifica potrivirea — nici tsc, nici probele, nici build-ul — iar o
-- nepotrivire taie TOT stratul de secrete in tacere: mascarea nu mascheaza,
-- declansatorul nu cripteaza, pastrarea nu pastreaza.
--
-- ⚠ `sender_address_id` NU intra aici, desi vine din contul lor: nu e credentiala,
-- iar comerciantul trebuie sa-l vada ca sa stie de unde pleaca marfa. Acelasi
-- rationament ca la `smartship_config.iban` si `posta_config.cod_trimitere`.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('shipo_config', 'api_key')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
-- Prima regenereaza SELECT-ul vederii publice, a doua corpul declansatorului
-- INSTEAD OF UPDATE — si fara a doua salvarea configului nu scrie nimic, tacut.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 4. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, `rezerva_operatie_externa` cade pe constrangere INAINTE de orice
-- apel, iar comerciantul primeste la nesfarsit „Nu am putut porni operatia in
-- siguranta" fara sa afle de ce.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'posta'::text, 'innoship'::text, 'packeta'::text, 'smartship'::text,
    'shipo'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 5. Indexul cronului
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
-- ⚠ La Shipo cronul e SINGURA cale de urmarire: documentatia lor nu descrie niciun
-- webhook. Mai mult, spre deosebire de SmartShip si Innoship, la ei NU exista camp
-- pentru referinta NOASTRA de comanda (`order_id` din raspunsurile lor e id-ul de
-- ridicare atribuit de curier), deci nu se poate cauta inapoi dupa numarul comenzii:
-- fereastra „nu stiu daca s-a creat" se inchide DOAR cu registrul local.
-- ---------------------------------------------------------------------------
create index if not exists orders_shipo_urmarire_idx
  on public.orders (shipo_status_checked_at asc nulls first)
  where shipo_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 6. PostgREST trebuie sa afle de coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
