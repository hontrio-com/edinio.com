-- Packeta, al unsprezecelea transportator.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `packeta_config` e ceruta in ACELASI select cu
-- restul setarilor de livrare, iar PostgREST respinge INTREAGA interogare cand o
-- coloana lipseste — deci codul pusat inainte de migratie ar rupe „Setari →
-- Livrare" si checkout-ul pe TOATE magazinele, nu doar pe cele cu Packeta.
-- (Incident 2026-09-03, cu Posta si Innoship. Vezi `npm run verifica:coloane`.)
--
-- Ce atinge:
--   1. `public.orders`: coloanele coletului;
--   2. `privat.store_settings`: `packeta_config`;
--   3. `privat.campuri_secrete`: AMBELE credentiale;
--   4. registrul de operatii externe: furnizorul `packeta`;
--   5. indexul partial al cronului de urmarire.

-- ---------------------------------------------------------------------------
-- 1. Coloanele coletului
--
-- ⚠ `packeta_packet_id` e TEXT, nu bigint. Documentatia lor cere anume:
-- „It's crucial to handle packet IDs as a `string`, as the standard `signedInt`
-- may be incapable of holding the value." E `unsignedLong` de zece cifre.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists packeta_packet_id text;
comment on column public.orders.packeta_packet_id is
  'Packeta: id-ul coletului. TEXT dinadins — unsignedLong de 10 cifre, vezi documentatia lor.';

alter table public.orders
  add column if not exists packeta_barcode text;
comment on column public.orders.packeta_barcode is
  'Packeta: codul de bare, „Z" + id. Ce se tipareste si ce urmareste clientul.';

-- ⚠ Cheia care hotaraste TOT: punct Packeta, automat sau curier de livrare la
-- adresa — toate sunt id-uri din acelasi spatiu. Tara si moneda decurg din el,
-- fiindca `PacketAttributes` NU are camp `country`.
alter table public.orders
  add column if not exists packeta_address_id text;
comment on column public.orders.packeta_address_id is
  'Packeta: `addressId` folosit la emitere — punct, automat sau curier. Nu are echivalent la ceilalti.';

-- Codul punctului, cand curierul are retea proprie (`carrierPickupPoint`).
alter table public.orders
  add column if not exists packeta_pickup_point text;
comment on column public.orders.packeta_pickup_point is
  'Packeta: codul punctului de curier, cand curierul ales cere unul.';

-- ⚠ Numarul coletului la CURIERUL REAL. Se obtine cu `packetCourierNumberV2` si e
-- OBLIGATORIU inainte de eticheta de curier: „To print carrier labels, you first
-- have to obtain the courier number."
alter table public.orders
  add column if not exists packeta_courier_number text;
comment on column public.orders.packeta_courier_number is
  'Packeta: numarul coletului la curierul real. Cerut inainte de eticheta de curier.';

-- Numarul cu care clientul urmareste la curierul extern (status 6).
alter table public.orders
  add column if not exists packeta_external_tracking text;
comment on column public.orders.packeta_external_tracking is
  'Packeta: `externalTrackingCode`, aparut la statusul 6 „handed to carrier".';

alter table public.orders
  add column if not exists packeta_awb_at timestamptz;
comment on column public.orders.packeta_awb_at is
  'Packeta: cand s-a creat coletul.';

alter table public.orders
  add column if not exists packeta_status_code integer;
comment on column public.orders.packeta_status_code is
  'Packeta: ultimul cod de status (1-17, 999). Codurile 8 si 13 nu exista la ei.';

alter table public.orders
  add column if not exists packeta_status_checked_at timestamptz;
comment on column public.orders.packeta_status_checked_at is
  'Packeta: cand a intrebat ultima data cronul. Ordinea de lucru a cronului.';

-- ---------------------------------------------------------------------------
-- 2. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Se adauga pe `privat.store_settings`, nu pe vederea publica: vederea e
-- generata din tabel de `reconstruieste_store_settings()`, deci o coloana pusa
-- direct pe ea ar disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists packeta_config jsonb;

comment on column privat.store_settings.packeta_config is
  'Packeta: {enabled, api_password, api_key, eshop, curieri_permisi[], '
  'foloseste_puncte, foloseste_automate, eticheta_format, eticheta_curier, '
  'valoare_implicita}. `api_password` SI `api_key` se cripteaza — vezi '
  'privat.campuri_secrete.';

-- ---------------------------------------------------------------------------
-- 3. ⚠ DOUA CREDENTIALE, si sunt lucruri DIFERITE
--
-- `api_password` (32 hex) e primul argument al fiecarei metode din API-ul XML.
-- `api_key` (16 caractere) circula in CALEA adresei fluxurilor de puncte.
--
-- Amandoua se cripteaza in repaus SI se mascheaza in formular: spre deosebire de
-- `webhook_secret` de la Innoship, niciuna nu trebuie citita vreodata de om — sunt
-- credentiale, nu adrese de lipit undeva.
--
-- Trebuie sa ramana in pas cu `CAMPURI_SECRETE` din src/lib/integrari/secrete.ts.
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('packeta_config', 'api_password'),
  ('packeta_config', 'api_key')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 4. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, PRIMA emitere Packeta cade pe constrangere DUPA ce coletul a fost
-- deja creat la ei — si la Packeta asta e mai grav decat oriunde, fiindca API-ul
-- lor NU ARE metoda de anulare. Coletul ar ramane acolo, si s-ar putea sterge doar
-- de mana din interfata lor.
--
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
-- ---------------------------------------------------------------------------
alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text,
    'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text,
    'posta'::text, 'innoship'::text, 'packeta'::text,
    'smartbill'::text, 'oblio'::text, 'fgo'::text,
    'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text,
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 5. Indexul cronului
--
-- ⚠ PARTIAL, si cu STATUSUL in predicat, exact ca la ceilalti: comenzile incheiate
-- isi pastreaza id-ul coletului, deci ar ramane in index cu marcajul inghetat la
-- ultima verificare — adica in CAPUL lui, unde sorteaza cele mai vechi. Cu vremea,
-- primele randuri citite ar fi numai comenzi moarte.
--
-- `nulls first` nu e ornament: implicitul lui Postgres la `asc` e `nulls last`, iar
-- scris invers coletele NEINTREBATE VREODATA ar iesi ultimele si, sub plafon,
-- niciodata.
--
-- ⚠ La Packeta cronul e SINGURA cale: documentatia publica nu descrie niciun
-- webhook („push tracking" apare in sitemapul lor, dar fisierul nu e sincronizat in
-- repo). Deci aici nu e plasa de siguranta, ci drumul principal.
-- ---------------------------------------------------------------------------
create index if not exists orders_packeta_urmarire_idx
  on public.orders (packeta_status_checked_at asc nulls first)
  where packeta_packet_id is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 6. PostgREST trebuie sa afle de coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
