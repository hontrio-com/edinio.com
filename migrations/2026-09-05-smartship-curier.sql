-- SmartShip.ro, al doisprezecelea transportator (si al cincilea broker).
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `smartship_config` e ceruta in ACELASI select cu
-- restul setarilor de livrare, iar PostgREST respinge INTREAGA interogare cand o
-- coloana lipseste — deci codul pusat inaintea migratiei ar rupe „Setari →
-- Livrare" si checkout-ul pe TOATE magazinele, nu doar pe cele cu SmartShip.
-- (Incident 2026-09-03, cu Posta si Innoship. Vezi `npm run verifica:coloane`.)
--
-- Ce atinge:
--   1. `public.orders`: coloanele expedierii;
--   2. `privat.store_settings`: `smartship_config`;
--   3. `privat.campuri_secrete`: cheia de API;
--   4. registrul de operatii externe: furnizorul `smartship`;
--   5. indexul partial al cronului de urmarire.

-- ---------------------------------------------------------------------------
-- 1. Coloanele expedierii
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists smartship_awb_number text;
comment on column public.orders.smartship_awb_number is
  'SmartShip: numarul AWB. TEXT — la ei e un sir de cifre lung (874156063265) si '
  'poate purta si prefixe de curier („SMA3170895" la ofertele de transport).';

alter table public.orders
  add column if not exists smartship_courier_id integer;
comment on column public.orders.smartship_courier_id is
  'SmartShip: curierul real ales (courier_id). Tabelul lor e generat automat din '
  'platforma, deci NU exista o constrangere de valori aici.';

alter table public.orders
  add column if not exists smartship_courier_name text;
comment on column public.orders.smartship_courier_name is
  'SmartShip: numele curierului, pentru panou. Fara el randul ar fi gol pana la o '
  'citire in nomenclator.';

-- ⚠ A DOUA PARTE A CHEII UNEI OFERTE. Cu `show_byoc: 1` acelasi curier apare de
-- doua ori — o data pe contractul comerciantului, o data pe al SmartShip, la
-- preturi diferite. Fara coloana asta, o reemitere dupa corectarea adresei ar
-- putea pleca pe celalalt contract, la alt pret.
alter table public.orders
  add column if not exists smartship_own_contract boolean;
comment on column public.orders.smartship_own_contract is
  'SmartShip: expedierea a plecat pe contractul propriu al comerciantului (BYOC)?';

alter table public.orders
  add column if not exists smartship_cost numeric(10,2);
comment on column public.orders.smartship_cost is
  'SmartShip: costul incasat de ei, CU TVA (campul `cost`).';

alter table public.orders
  add column if not exists smartship_tracking_url text;
comment on column public.orders.smartship_tracking_url is
  'SmartShip: pagina publica de urmarire (smartship.ro/t/...). '
  '⚠ NU se salveaza `pdf_link` din raspunsul lor: acela contine CHEIA DE API in cale.';

alter table public.orders
  add column if not exists smartship_awb_at timestamptz;
comment on column public.orders.smartship_awb_at is
  'SmartShip: cand s-a emis AWB-ul. Ancoreaza fereastra cronului de urmarire.';

-- ⚠ ZERO E UN STATUS VALID la ei („0 = emis, neridicat"), spre deosebire de toti
-- ceilalti curieri unde codurile incep de la 1. Deci codul se citeste MEREU cu
-- `is not null`, niciodata cu adevar-fals.
alter table public.orders
  add column if not exists smartship_status_code integer;
comment on column public.orders.smartship_status_code is
  'SmartShip: ultimul `awb_status` (0 emis, 1 in tranzit, 2 livrat, 5 refuz, 6 retur, 10 anulat). '
  '⚠ 0 e o valoare VALIDA, nu o lipsa.';

alter table public.orders
  add column if not exists smartship_status_checked_at timestamptz;
comment on column public.orders.smartship_status_checked_at is
  'SmartShip: cand a intrebat ultima data cronul. Ordinea de lucru a cronului.';

-- Ridicarea FedEx: una singura pe AWB (codul lor 305).
alter table public.orders
  add column if not exists smartship_pickup_code text;
comment on column public.orders.smartship_pickup_code is
  'SmartShip: codul de confirmare al ridicarii FedEx. Una singura pe AWB.';

-- ⚠ Oferta de transport pentru marfa grea: raspunsul vine de la un OM, peste ore
-- sau zile. Referinta TREBUIE sa stea pe comanda — altfel solicitarea se pierde
-- in clipa in care comerciantul inchide pagina, si nimeni nu mai poate accepta
-- oferta cand aceasta soseste.
alter table public.orders
  add column if not exists smartship_offer_ref text;
comment on column public.orders.smartship_offer_ref is
  'SmartShip: referinta solicitarii de oferta de transport (OFT-2026-00123).';

alter table public.orders
  add column if not exists smartship_offer_status text;
comment on column public.orders.smartship_offer_status is
  'SmartShip: starea ofertei (new, in_review, offered, accepted, rejected, declined, '
  'cancelled, expired, completed). Fara constrangere: lista e a lor si poate creste.';

-- ---------------------------------------------------------------------------
-- 2. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists smartship_config jsonb;

comment on column privat.store_settings.smartship_config is
  'SmartShip: {enabled, api_key, expeditor{name,address,email,city,phone,country,sector}, '
  'iban, curieri_permisi[], contract_propriu, arata_contract_propriu, foloseste_easybox, '
  'foloseste_fanbox, deschidere_la_livrare, asigura_coletul, fara_ridicare_automata, '
  'lungime_cm, latime_cm, inaltime_cm, continut_implicit, format_eticheta}. '
  'Doar `api_key` se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 3. Cheia de API, criptata in repaus
--
-- ⚠ O SINGURA credentiala, si numele ei trebuie sa fie IDENTIC in trei locuri:
-- in `SmartshipConfig` (client.ts), in `CAMPURI_SECRETE` (secrete.ts) si aici.
-- Nimic nu verifica potrivirea — nici tsc, nici probele, nici build-ul — iar o
-- nepotrivire taie TOT stratul de secrete in tacere: mascarea nu mascheaza,
-- declansatorul nu cripteaza, pastrarea nu pastreaza. Vezi [[packeta-integrare]],
-- unde camelCase contra snake_case a produs exact patru defecte deodata.
--
-- ⚠ `iban` NU intra aici, desi arata a date bancare: comerciantul trebuie sa-l
-- poata reciti ca sa verifice ca banii ajung unde trebuie, iar mascat ar deveni
-- imposibil de verificat. Acelasi rationament ca la `posta_config.cod_trimitere`
-- si `innoship_config.webhook_secret`.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('smartship_config', 'api_key')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 4. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA emitere SmartShip cade pe constrangere DUPA ce AWB-ul a fost
-- deja creat si platit la ei.
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
-- ⚠ La SmartShip cronul e SINGURA cale de urmarire: documentatia lor nu descrie
-- niciun webhook si niciun mecanism de notificare. Deci aici nu e plasa de
-- siguranta, ci drumul principal.
-- ---------------------------------------------------------------------------
create index if not exists orders_smartship_urmarire_idx
  on public.orders (smartship_status_checked_at asc nulls first)
  where smartship_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 6. PostgREST trebuie sa afle de coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
