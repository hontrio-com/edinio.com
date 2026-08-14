-- ═══════════════════════════════════════════════════════════════════════════
-- Innoship: al zecelea transportator, si al patrulea BROKER
--
-- CE ADAUGA
--
--   1. Douasprezece coloane pe `orders` — motivul fiecareia mai jos.
--   2. `store_settings.innoship_config` — cheia de API si datele de contract.
--   3. `privat.campuri_secrete`: `api_key` SI `webhook_secret`.
--   4. `'innoship'` in constrangerea de furnizor a registrului.
--   5. Un index partial pentru cronul de urmarire.
--
-- ═══ CE E INNOSHIP, SI DE CE E ALTFEL DECAT CEILALTI TREI BROKERI ═══
--
--   Woot, Colete Online si eColet agrega cativa curieri romanesti. Innoship
--   agrega ~230, din 20+ tari — si ii CUPRINDE PE TOTI cei noua pe care ii avem
--   deja integrati direct, inclusiv Posta Romana.
--
--   Consecinta, hotarata cu clientul (varianta B): amandoua caile raman
--   disponibile, dar panoul avertizeaza cand acelasi curier e activ si direct, si
--   prin Innoship. Contractul direct e adesea mai ieftin, deci nu se ascunde.
--
-- ═══ ⚠ CHEIA OFERTEI E COMPUSA, NU UN SINGUR ID ═══
--
--   La ceilalti brokeri alegerea cumparatorului incape intr-un camp:
--     Woot   -> `woot_service_id`   (numar)
--     Colete -> `colete_service_id` (numar)
--     eColet -> `ecolet_service_slug` (sir)
--
--   La Innoship o oferta se identifica prin TREI: `courierId` (care curier real),
--   `serviceId` (ce fel de livrare) si `optionId` (care varianta a serviciului).
--   Pastrat doar curierul, reemiterea dupa corectarea adresei ar pleca pe alt
--   serviciu si alt pret — iar diferenta o suporta comerciantul.
--
--   ⚠ Si `serviceId` NU e decor: 1 = domiciliu, 3 = locker, 4 = PUDO. Gresit, nu
--   dai alt pret, dai alt TIP de livrare.
--
-- Aditiva: coloane noi nullable, o constrangere largita. Codul vechi nu le
-- atinge, deci se poate aplica INAINTE de deploy. Invers NU: `innoship_config` e
-- ceruta in acelasi SELECT cu tot restul setarilor de livrare, deci codul fara
-- migratie lasa checkout-ul INTREGII platforme fara nicio optiune.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Identificatorii expedierii
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists innoship_awb_number text;

comment on column public.orders.innoship_awb_number is
  'AWB-ul curierului real, din `courierShipmentId` (POST /api/Order). E numarul '
  'pe care il vede clientul si cu care se cer eticheta si anularea.';

alter table public.orders
  add column if not exists innoship_order_id bigint;

comment on column public.orders.innoship_order_id is
  'Id-ul intern Innoship (`clientOrderId`). Nu se foloseste la emitere, dar e '
  'referinta pe care o cere suportul lor.';

alter table public.orders
  add column if not exists innoship_courier_id integer;

comment on column public.orders.innoship_courier_id is
  '⚠ OBLIGATORIU pentru eticheta si anulare: ambele cai il cer in ADRESA — '
  'GET /api/Label/by-courier/{courierId}/awb/{awb} si '
  'DELETE /api/Order/{courierId}/awb/{awbNo}. Fara el, o comanda emisa nu se '
  'mai poate nici tipari, nici anula.';

alter table public.orders
  add column if not exists innoship_courier_name text;

comment on column public.orders.innoship_courier_name is
  'Numele curierului real („Cargus"), pentru panou. Se pastreaza ca sa nu fie '
  'nevoie de o citire in nomenclator ca sa se poata arata un rand. Acelasi '
  'rationament ca la woot_service_name.';

-- ---------------------------------------------------------------------------
-- 2. Serviciul ales — cele trei parti ale cheii
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists innoship_service_id integer;

comment on column public.orders.innoship_service_id is
  'Serviciul din tabelul lor: 1 Domestic Standard, 3 Domestic Lockers, '
  '4 Domestic PUDO, 6 SameDay, 11 Cargo, 12 Pallet, 5/51 International. '
  '⚠ NU e decor: schimba TIPUL livrarii, nu doar pretul.';

alter table public.orders
  add column if not exists innoship_option_id text;

comment on column public.orders.innoship_option_id is
  'Varianta serviciului, din `rates[].optionId` (POST /api/Price). A treia parte '
  'a cheii ofertei alese de cumparator.';

alter table public.orders
  add column if not exists innoship_service_name text;

comment on column public.orders.innoship_service_name is
  'Numele de aratat, compus din curierul real si serviciu. Echivalentul lui '
  'ecolet_service_name.';

-- ---------------------------------------------------------------------------
-- 3. Ancora si urmarirea
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists innoship_awb_at timestamptz;

comment on column public.orders.innoship_awb_at is
  'Cand s-a emis AWB-ul. Fereastra cronului se ancoreaza pe EL, nu pe created_at '
  '(o comanda veche careia i se emite AWB tarziu ar ramane in afara ferestrei) si '
  'nu pe updated_at (pe care declansatorul il improspateaza la fiecare trecere a '
  'cronului, tinand coletul in fereastra la nesfarsit).';

alter table public.orders
  add column if not exists innoship_status_code text;

comment on column public.orders.innoship_status_code is
  'Ultimul `clientStatusId` prelucrat, exact cum a venit. Statusurile Innoship '
  'sunt NORMALIZATE peste toti cei ~230 de curieri (tabelul lor: 1 New … '
  '100 Delivered … 110 Return Confirmed), deci harta se face pe numar, nu pe '
  'cuvinte ca la eColet si Pall-Ex. `text`, nu `integer`, din acelasi motiv ca la '
  'gls_status_code: un cod nou se scrie asa cum a venit, in loc sa cada.';

alter table public.orders
  add column if not exists innoship_cod_status_code text;

comment on column public.orders.innoship_cod_status_code is
  'Ultimul status al RAMBURSULUI (`cashOnDeliveryHistory`): 1 New, 2 Collected, '
  '3 Paid, 99 Untrackable. ⚠ Niciun alt curier nu ne da asta. In faza asta se '
  'DOAR ARATA si se semnaleaza — mutarea automata a lui `payment_status` cere '
  'date reale mai intai. Vezi lectia din cronul de reconciliere, care incasa pe '
  'comenzi anulate.';

alter table public.orders
  add column if not exists innoship_status_checked_at timestamptz;

comment on column public.orders.innoship_status_checked_at is
  'Cand a intrebat cronul ultima oara — NU data evenimentului. Da rotatia: se iau '
  'intotdeauna comenzile neintrebate de cel mai mult timp. ⚠ Se scrie SI de '
  'webhook, ca o comanda care primeste push sa nu mai consume un loc in cron.';

alter table public.orders
  add column if not exists innoship_track_url text;

comment on column public.orders.innoship_track_url is
  'Pagina de urmarire a Innoship (`trackPageUrl`), gata marcata. Se pastreaza ca '
  'sa poata fi data clientului fara sa mai fie ceruta.';

-- ---------------------------------------------------------------------------
-- 4. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists innoship_config jsonb;

comment on column privat.store_settings.innoship_config is
  'Innoship: {enabled, api_key, external_client_location, webhook_secret, '
  'curieri_permisi[], serviciu_domiciliu, serviciu_locker, serviciu_pudo, '
  'format_eticheta, tip_eticheta, servicii{...}}. `api_key` si `webhook_secret` '
  'se cripteaza — vezi privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 5. Ce se cripteaza, si diferenta dintre cele doua
--
-- ⚠ AMANDOUA se cripteaza in repaus, dar NUMAI `api_key` se MASCHEAZA in
-- formular.
--
-- `webhook_secret` e partea secreta din URL-ul pe care comerciantul TREBUIE sa-l
-- citeasca si sa-l lipeasca in portalul Innoship. Mascat, formularul n-ar mai
-- avea ce afisa si integrarea ar deveni imposibil de configurat — iar expunerea
-- ar fi oricum aceeasi, fiindca scopul campului e chiar sa fie aratat
-- proprietarului. Exact cazul `notice_config.webhook_secret`, si cu aceeasi
-- consecinta: `innoship_config` se citeste cu `createAdminClient()` in pagina de
-- configurare, altfel omului i-ar sosi `enc.v1.…` in loc de URL.
--
-- Trebuie sa ramana in pas cu `CAMPURI_SECRETE` din src/lib/integrari/secrete.ts,
-- unde intra DOAR `api_key`.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('innoship_config', 'api_key'),
  ('innoship_config', 'webhook_secret')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 6. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA emitere Innoship cade pe constrangere DUPA ce expedierea a
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
    'posta'::text, 'innoship'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 7. Indexul cronului
--
-- ⚠ PARTIAL, si cu STATUSUL in predicat, exact ca la ceilalti.
--
-- Comenzile incheiate isi pastreaza numarul AWB, deci ar ramane in index cu
-- marcajul inghetat la ultima verificare — adica in CAPUL lui, fiindca acolo
-- sorteaza cele mai vechi. Cu vremea, primele randuri citite ar fi numai comenzi
-- moarte, iar cele vii n-ar mai ajunge la rand.
--
-- `nulls first` nu e ornament: e chiar ordinea ceruta de cron, iar implicitul lui
-- Postgres la `asc` e `nulls last`. Scris invers, coletele NEINTREBATE VREODATA —
-- exact cele mai importante — ar fi iesit ultimele si, sub plafon, niciodata.
--
-- ⚠ Cronul e aici PLASA DE SIGURANTA, nu calea principala: urmarirea vine din
-- „Track push", webhookul lor. Indexul ramane necesar tocmai fiindca plasa
-- trebuie sa fie ieftina — ea culege doar comenzile pe care pushul le-a ratat.
-- ---------------------------------------------------------------------------
create index if not exists orders_innoship_urmarire_idx
  on public.orders (innoship_status_checked_at asc nulls first)
  where innoship_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 8. PostgREST trebuie sa afle de coloanele noi
--
-- ⚠ Fara asta, aplicatia primeste „column does not exist" pe `innoship_config`
-- pana la urmatoarea repornire a PostgREST. Si nu cade doar Innoship: coloana e
-- ceruta in acelasi SELECT cu tot restul setarilor de livrare, deci ar cadea
-- checkout-ul tuturor magazinelor.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
