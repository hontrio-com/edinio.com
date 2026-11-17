-- Factureaza.ro, easybill si SAGA - 17.11.2026.
--
-- Doua case de facturare noi (Factureaza.ro, easybill) si exportul catre contabilitate (SAGA).
-- Fisele: `docs/facturare/FACTUREAZA.md`, `EASYBILL.md`, `SAGA.md`.
--
-- ⚠ SE APLICA DUPA `2027-02-05-facturis.sql` SI INAINTE DE DEPLOY. Coloanele noi intra in selecturi
-- IMPARTITE cu celelalte case (pagina comenzii, lista, facturarea automata si in lot, urcarea facturii
-- la eMAG si Trendyol, contul cumparatorului): PostgREST respinge INTREAGA interogare cand o coloana
-- lipseste.
--
-- Aditiva: coloane nullable, valori noi in listele registrului, o tabela noua (jurnalul SAGA) si doua
-- functii rescrise cu ramuri in plus. Codul vechi nu le atinge.

-- ---------------------------------------------------------------------------
-- 1. Configurarile, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------
-- ── Factureaza.ro: o singura credentiala, cheia API (Basic, in antet). `mediu` alege productia sau
-- sandbox-ul lor oficial; documentele din sandbox poarta pe comanda cheia `test:<id>`.
alter table privat.store_settings
  add column if not exists factureaza_config jsonb;

comment on column privat.store_settings.factureaza_config is
  'Factureaza.ro: {enabled, api_key (secret), mediu (productie|test), serie (PREFIXUL seriei: la ei seria e pe an), '
  'serie_storno, due_days, auto_invoice, auto_invoice_trigger, mark_paid_online, cont_firma, cont_cif}. '
  'Vezi src/lib/factureaza/config.ts.';

-- ⚠ Numele e IDENTIC in `CAMPURI_SECRETE_FACTUREAZA` (src/lib/factureaza/config.ts), in `FactureazaConfig`
-- si (dupa legare) in `CAMPURI_SECRETE` (src/lib/integrari/secrete.ts). `factureaza-legat.test.ts` le compara.
insert into privat.campuri_secrete (coloana, cale) values
  ('factureaza_config', 'api_key')
on conflict do nothing;

-- ── easybill.ro: utilizatorul de tip API (vizibil) si parola lui (secret). Sesiune pe server.
alter table privat.store_settings
  add column if not exists easybill_config jsonb;

comment on column privat.store_settings.easybill_config is
  'easybill.ro: {enabled, username, password (secret), serie, due_days, auto_invoice, '
  'auto_invoice_trigger, mark_paid_online, firma_nume, firma_cui, anaf_url}. '
  'Autentificare pe sesiune (authenticateUser_fct) cu utilizatorul de tip API. Vezi src/lib/easybill/config.ts.';

insert into privat.campuri_secrete (coloana, cale) values
  ('easybill_config', 'password')
on conflict do nothing;

-- ── SAGA Web: codul fiscal (vizibil) si cheia de acces (secret, se ROTESTE la raspunsuri).
alter table privat.store_settings
  add column if not exists saga_config jsonb;

comment on column privat.store_settings.saga_config is
  'SAGA Web: {enabled, cod_fiscal, api_key (secret, se ROTESTE: X-Saga-Refresh-Token), import_automat, '
  'trimite_stornari, trimitere_automata, trimitere_automata_de_la, clienti_pf (fiecare|generic), '
  'nume_client_generic, tva_la_incasare, gestiune}. cod_fiscal NU e secret: omul trebuie sa vada ce firma '
  'a legat. Vezi src/lib/saga/config.ts.';

-- ⚠ Numele e IDENTIC in `CAMPURI_SECRETE_SAGA` (src/lib/saga/config.ts), in `SagaConfig` si, la legare,
-- in `CAMPURI_SECRETE` (src/lib/integrari/secrete.ts). `xml.test.ts` compara fragmentul cu codul.
insert into privat.campuri_secrete (coloana, cale) values
  ('saga_config', 'api_key')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 2. Documentele pe comanda (Factureaza.ro si easybill, ca la Facturis)
-- ---------------------------------------------------------------------------
-- ⚠ CHEIA (id-ul documentului la ei) spune ca documentul exista; seria si numarul pot veni dupa.

alter table public.orders
  add column if not exists factureaza_invoice_key text,
  add column if not exists factureaza_invoice_series text,
  add column if not exists factureaza_invoice_number text,
  add column if not exists factureaza_storno_key text,
  add column if not exists factureaza_storno_series text,
  add column if not exists factureaza_storno_number text,
  add column if not exists easybill_invoice_key text,
  add column if not exists easybill_invoice_series text,
  add column if not exists easybill_invoice_number text,
  add column if not exists easybill_storno_key text,
  add column if not exists easybill_storno_series text,
  add column if not exists easybill_storno_number text;

comment on column public.orders.factureaza_invoice_key is
  'Id-ul facturii in Factureaza.ro. Pus = factura EXISTA, chiar daca seria si numarul inca nu s-au citit.';
comment on column public.orders.easybill_invoice_key is
  'Id-ul facturii in easybill.ro. Pus = factura EXISTA, chiar daca seria si numarul inca nu s-au citit.';

-- ---------------------------------------------------------------------------
-- 3. Registrul de operatii externe
-- ---------------------------------------------------------------------------
-- ⚠ Listele sunt COPIATE din forma de dupa `2027-02-05-facturis.sql`. Copiate dintr-o migratie mai
-- veche, ar fi scos un furnizor din registru.
-- `export` = trimiterea unui document DEJA emis catre contabilitate (SAGA). Nu emite nimic fiscal.

alter table public.operatii_externe
  drop constraint if exists operatii_externe_fel_check;
alter table public.operatii_externe
  add constraint operatii_externe_fel_check check (fel = any (array[
    'awb', 'anulare_awb', 'ridicare', 'factura', 'proforma', 'storno', 'anulare_document',
    'plata', 'incasare', 'rambursare', 'publicare', 'retragere', 'expediere', 'export', 'proba'
  ]::text[]));

alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;
alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus', 'sameday', 'fancourier', 'dpd', 'woot', 'colete', 'gls', 'pallex', 'ecolet',
    'posta', 'innoship', 'packeta', 'smartship', 'shipo', 'fedex', 'ups', 'dhl', 'curiera', 'epacket',
    'smartbill', 'oblio', 'fgo', 'facturis', 'factureaza', 'easybill', 'saga',
    'stripe', 'netopia', 'ipay', 'klarna', 'revolut',
    'trendyol', 'aboutyou', 'olx', 'gmc', 'emag', 'proba'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 4. Contul cumparatorului: documentul comenzii
-- ---------------------------------------------------------------------------
-- Corpul e cel de dupa `2027-02-05-facturis.sql`, cu DOUA ramuri noi, dupa Facturis: ordinea caselor
-- e aceeasi ca in dispecerul de facturare automata.

CREATE OR REPLACE FUNCTION privat.cont_documentul_comenzii(o anyelement)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when nullif(btrim(coalesce(o.smartbill_invoice_number, '')), '') is not null
     and not privat.cont_e_document_de_test(o.smartbill_invoice_url) then
      jsonb_build_object(
        'casa', 'smartbill',
        'serie', o.smartbill_invoice_series,
        'numar', o.smartbill_invoice_number,
        'stornata', nullif(btrim(coalesce(o.smartbill_storno_number, '')), '') is not null,
        'storno_serie', o.smartbill_storno_series,
        'storno_numar', o.smartbill_storno_number,
        /* SmartBill da PDF-ul stornarii prin acelasi /invoice/pdf, cu seria ei. */
        'storno_descarcabil', nullif(btrim(coalesce(o.smartbill_storno_number, '')), '') is not null,
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'smartbill' and x.stare = 'reusit'
             and x.referinta_externa = o.smartbill_invoice_number
        )
      )
    when nullif(btrim(coalesce(o.oblio_invoice_number, '')), '') is not null
     and not privat.cont_e_document_de_test(o.oblio_invoice_link) then
      jsonb_build_object(
        'casa', 'oblio',
        'serie', o.oblio_invoice_series,
        'numar', o.oblio_invoice_number,
        'stornata', nullif(btrim(coalesce(o.oblio_storno_number, '')), '') is not null,
        'storno_serie', o.oblio_storno_series,
        'storno_numar', o.oblio_storno_number,
        /* Oblio da stornarea ca document cu link propriu; fara link, nu se poate aduce. */
        'storno_descarcabil', nullif(btrim(coalesce(o.oblio_storno_number, '')), '') is not null
                              and nullif(btrim(coalesce(o.oblio_storno_link, '')), '') is not null
                              and not privat.cont_e_document_de_test(o.oblio_storno_link),
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'oblio' and x.stare = 'reusit'
             and x.referinta_externa = o.oblio_invoice_number
        )
      )
    when nullif(btrim(coalesce(o.fgo_invoice_number, '')), '') is not null
     and not privat.cont_e_document_de_test(o.fgo_invoice_link) then
      jsonb_build_object(
        'casa', 'fgo',
        'serie', o.fgo_invoice_series,
        'numar', o.fgo_invoice_number,
        'stornata', nullif(btrim(coalesce(o.fgo_storno_number, '')), '') is not null,
        'storno_serie', o.fgo_storno_series,
        'storno_numar', o.fgo_storno_number,
        /* fGO nu pastreaza niciun link pentru stornare. */
        'storno_descarcabil', false,
        'emisa_la', null
      )
    when nullif(btrim(coalesce(o.facturis_invoice_key, '')), '') is not null
     and nullif(btrim(coalesce(o.facturis_invoice_number, '')), '') is not null then
      jsonb_build_object(
        'casa', 'facturis',
        'serie', o.facturis_invoice_series,
        'numar', o.facturis_invoice_number,
        'stornata', nullif(btrim(coalesce(o.facturis_storno_key, '')), '') is not null,
        'storno_serie', o.facturis_storno_series,
        'storno_numar', o.facturis_storno_number,
        /* Facturis da PDF-ul stornarii prin acelasi FacturiHtml, dupa id-ul ei. */
        'storno_descarcabil', nullif(btrim(coalesce(o.facturis_storno_key, '')), '') is not null
                              and nullif(btrim(coalesce(o.facturis_storno_number, '')), '') is not null,
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'facturis' and x.stare = 'reusit'
             and x.referinta_externa = o.facturis_invoice_key
        )
      )
    when nullif(btrim(coalesce(o.factureaza_invoice_key, '')), '') is not null
     and nullif(btrim(coalesce(o.factureaza_invoice_number, '')), '') is not null
     /* Cheia `test:<id>` = document din sandbox-ul lor: nu e fiscal, deci nu e documentul comenzii. */
     and o.factureaza_invoice_key not like 'test:%' then
      jsonb_build_object(
        'casa', 'factureaza',
        'serie', o.factureaza_invoice_series,
        'numar', o.factureaza_invoice_number,
        'stornata', nullif(btrim(coalesce(o.factureaza_storno_key, '')), '') is not null,
        'storno_serie', o.factureaza_storno_series,
        'storno_numar', o.factureaza_storno_number,
        /* Factureaza.ro: PDF-ul stornarii se cere prin API, dupa id-ul ei, ca al facturii. */
        'storno_descarcabil', nullif(btrim(coalesce(o.factureaza_storno_key, '')), '') is not null
                              and nullif(btrim(coalesce(o.factureaza_storno_number, '')), '') is not null,
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'factureaza' and x.stare = 'reusit'
             and x.referinta_externa = o.factureaza_invoice_key
        )
      )
    when nullif(btrim(coalesce(o.easybill_invoice_key, '')), '') is not null
     and nullif(btrim(coalesce(o.easybill_invoice_number, '')), '') is not null then
      jsonb_build_object(
        'casa', 'easybill',
        'serie', o.easybill_invoice_series,
        'numar', o.easybill_invoice_number,
        'stornata', nullif(btrim(coalesce(o.easybill_storno_key, '')), '') is not null,
        'storno_serie', o.easybill_storno_series,
        'storno_numar', o.easybill_storno_number,
        /* easybill: PDF-ul stornarii se cere prin API, dupa id-ul ei, ca al facturii. */
        'storno_descarcabil', nullif(btrim(coalesce(o.easybill_storno_key, '')), '') is not null
                              and nullif(btrim(coalesce(o.easybill_storno_number, '')), '') is not null,
        'emisa_la', (
          select (min(x.creat_la) at time zone 'UTC')::date
            from public.operatii_externe x
           where x.business_id = o.business_id and x.order_id = o.id
             and x.fel = 'factura' and x.furnizor = 'easybill' and x.stare = 'reusit'
             and x.referinta_externa = o.easybill_invoice_key
        )
      )
    else null
  end;
$function$
;


revoke execute on function privat.cont_documentul_comenzii(o anyelement) from public;

-- ---------------------------------------------------------------------------
-- 5. Trendyol: comenzile cu factura de urcat
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trendyol_comenzi_de_facturat(p_business_id uuid, p_limita integer DEFAULT 10, p_de_la integer DEFAULT 0)
 RETURNS TABLE(order_id uuid, shipment_package_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.order_id, t.shipment_package_id
    from public.trendyol_orders t
    join public.orders o on o.id = t.order_id and o.business_id = t.business_id
   where t.business_id = p_business_id
     and t.order_id is not null
     and t.invoice_uploaded_at is null
     -- Numai cele care CHIAR au factura emisa. Fara filtrul asta, comenzile fara factura
     -- ocupau fereastra la nesfarsit si o factura emisa mai tarziu nu mai ajungea niciodata.
     and (
       (o.smartbill_invoice_number is not null and o.smartbill_invoice_url is not null)
       or (o.oblio_invoice_number is not null and o.oblio_invoice_link is not null)
       or (o.fgo_invoice_number is not null and o.fgo_invoice_link is not null)
       -- Facturis n-are link: PDF-ul se cere prin API, dupa cheie. Numarul trebuie sa fie citit.
       or (o.facturis_invoice_key is not null and o.facturis_invoice_number is not null)
       -- La fel Factureaza.ro si easybill. ⚠ Documentul din sandbox-ul Factureaza.ro (cheia `test:`)
       -- RAMANE in lista, dinadins: garda din cod (`facturaDeTest`) il opreste cu un mesaj in jurnal,
       -- ca la fGO. Scos de aici, comanda ar fi asteptat in tacere, fara ca omul sa afle de ce.
       or (o.factureaza_invoice_key is not null and o.factureaza_invoice_number is not null)
       or (o.easybill_invoice_key is not null and o.easybill_invoice_number is not null)
     )
     -- Nu se factureaza in lei o comanda care n-a fost in lei.
     and coalesce(o.order_source->>'currency', 'RON') = 'RON'
   order by t.order_id
   offset greatest(0, p_de_la)
   limit greatest(1, least(coalesce(p_limita, 10), 100));
$function$
;

revoke execute on function public.trendyol_comenzi_de_facturat(p_business_id uuid, p_limita integer, p_de_la integer) from public, anon, authenticated;
grant execute on function public.trendyol_comenzi_de_facturat(p_business_id uuid, p_limita integer, p_de_la integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. SAGA: jurnalul exporturilor
-- ---------------------------------------------------------------------------
-- Fisa: `docs/facturare/SAGA.md`. SAGA nu emite nimic: primeste documentele DEJA emise de oricare din
-- cele sase case. O cheie de registru pe DOCUMENT (`export:saga:<tip>:<casa>:<serie>#<numar>`):
-- indexul unic existent (`operatii_externe_cheie_activa_idx`) opreste duplicatul in contabilitate.
--
-- 6.1 Registrul: felul `export` si furnizorul `saga` sunt deja in listele din sectiunea 3.
-- Cronul cauta documentele emise de curand ale unui magazin: fara index, ar citi tot registrul.
create index if not exists operatii_externe_documente_emise_idx
  on public.operatii_externe (business_id, creat_la desc)
  where fel = any (array['factura', 'storno']::text[]) and stare = 'reusit';

-- ---------------------------------------------------------------------------
-- 6.2 Jurnalul trimiterilor in SAGA
-- ---------------------------------------------------------------------------
-- Cate un rand pe INCERCARE, cu ce a raspuns SAGA. NU e registrul (acela opreste duplicatul); jurnalul
-- doar povesteste, pentru panoul comenzii si pentru cron.
--
-- ⚠ FARA DATE PERSONALE IN PLUS: nu se pastreaza XML-ul (are numele si adresa clientului), ci doar
-- identitatea documentului (casa, tip, serie, numar), starea, codul HTTP si raportul SAGA, taiat la
-- 4000 de caractere. Raportul poate pomeni clientul: e al magazinului si numai el il vede (RLS).
-- Pastrare: 24 de luni (cronul `saga-export` sterge, la fiecare trecere, ce a imbatranit).

create table if not exists public.saga_exporturi (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  cheie text not null,
  casa text not null,
  tip text not null,
  serie text not null default '',
  numar text not null,
  data_document date,
  total numeric(12,2),
  stare text not null,
  cod_http integer,
  import_automat boolean not null default false,
  sursa text not null,
  fisier text,
  mesaj text,
  raport text,
  creat_la timestamptz not null default now(),
  constraint saga_exporturi_casa_check check (casa = any (array[
    'smartbill', 'oblio', 'fgo', 'facturis', 'factureaza', 'easybill'
  ]::text[])),
  constraint saga_exporturi_tip_check check (tip = any (array['factura', 'storno']::text[])),
  constraint saga_exporturi_stare_check check (stare = any (array[
    'importat', 'incarcat', 'avertismente', 'respins', 'refuzat', 'necunoscut', 'nepregatit'
  ]::text[])),
  constraint saga_exporturi_sursa_check check (sursa = any (array['manual', 'lot', 'automat']::text[])),
  constraint saga_exporturi_cheie_check check (char_length(cheie) between 1 and 200),
  constraint saga_exporturi_mesaj_check check (mesaj is null or char_length(mesaj) <= 1000),
  constraint saga_exporturi_raport_check check (raport is null or char_length(raport) <= 4000),
  constraint saga_exporturi_fisier_check check (fisier is null or char_length(fisier) <= 200)
);

comment on table public.saga_exporturi is
  'Trimiterile in SAGA, cate una pe incercare. cheie = tip:casa:serie#numar (aceeasi ca in registru, '
  'fara prefixul export:saga:). stare: importat | incarcat (asteapta contabilul in Diverse, Import date) '
  '| avertismente (207) | respins (422) | refuzat (cerere sau acces) | necunoscut | nepregatit. '
  'Fara XML si fara date personale in plus. Vezi src/lib/saga/jurnal.ts.';

-- Panoul comenzii, decizia cronului pe document, ultima incercare a magazinului.
create index if not exists saga_exporturi_comanda_idx
  on public.saga_exporturi (business_id, order_id, creat_la desc);
create index if not exists saga_exporturi_cheie_idx
  on public.saga_exporturi (business_id, cheie, creat_la desc);
create index if not exists saga_exporturi_magazin_idx
  on public.saga_exporturi (business_id, creat_la desc);
-- Pastrarea: cronul `saga-export` sterge randurile mai vechi de 24 de luni, dupa `creat_la`.
create index if not exists saga_exporturi_creat_la_idx
  on public.saga_exporturi (creat_la);
-- Cheia straina `on delete set null` cauta dupa `order_id` singur.
create index if not exists saga_exporturi_order_idx
  on public.saga_exporturi (order_id) where order_id is not null;
-- Golirea rapoartelor comenzilor sterse (`golesteRapoarteleComenzilorSterse`, la fiecare trecere a
-- cronului): indexul tine numai randurile de golit, deci de obicei e gol, iar cautarea nu scaneaza tabela.
create index if not exists saga_exporturi_de_golit_idx
  on public.saga_exporturi (id) where order_id is null and (raport is not null or mesaj is not null);

-- Comerciantul isi citeste randurile; scrie numai serverul (service role).
alter table public.saga_exporturi enable row level security;
drop policy if exists owner_select_saga_exporturi on public.saga_exporturi;
create policy owner_select_saga_exporturi on public.saga_exporturi for select to authenticated
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));
revoke all on table public.saga_exporturi from anon;
revoke insert, update, delete, truncate, references, trigger on table public.saga_exporturi from authenticated;
grant select on table public.saga_exporturi to authenticated;
grant select, insert, update, delete on table public.saga_exporturi to service_role;

-- ---------------------------------------------------------------------------
-- 6.3 Lacatul: un singur apel SAGA odata, pe magazin
-- ---------------------------------------------------------------------------
-- ⚠ DE CE. SAGA poate raspunde cu o cheie NOUA (`X-Saga-Refresh-Token`) care trebuie folosita la
-- apelul urmator, „in caz contrar, cheia de acces va fi blocata". Doua apeluri simultane pe acelasi
-- magazin (cronul si un buton) ar pleca amandoua cu aceeasi cheie: al doilea ar folosi o cheie deja
-- veche. Lacatul le pune in sir: se ia INAINTE de citirea cheii, se elibereaza DUPA scrierea celei noi.
--
-- De ce nu `pg_advisory_lock`: prin PostgREST fiecare apel e o tranzactie separata, iar lacatul de
-- sesiune nu tine intre doua cereri HTTP. De aceea un rand cu termen: un proces taiat de platforma nu-si
-- poate elibera lacatul, deci il elibereaza termenul (120 s, mult peste un apel: importul are 30 s).

create table if not exists privat.saga_apel_in_curs (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  detinator uuid not null,
  pana_la timestamptz not null
);
alter table privat.saga_apel_in_curs enable row level security;
revoke all on table privat.saga_apel_in_curs from public, anon, authenticated;

comment on table privat.saga_apel_in_curs is
  'Lacatul apelurilor SAGA, cate unul pe magazin. Se ia cu public.saga_ocupa_apelul, se elibereaza cu '
  'public.saga_elibereaza_apelul; expira singur la pana_la. Vezi src/lib/saga/server.ts.';

-- `true` = lacatul e al apelantului. Un lacat expirat se preia; unul viu, al altcuiva, nu.
create or replace function public.saga_ocupa_apelul(p_business_id uuid, p_detinator uuid, p_secunde integer default 120)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ocupat boolean;
begin
  if p_business_id is null or p_detinator is null then
    return false;
  end if;
  insert into privat.saga_apel_in_curs as a (business_id, detinator, pana_la)
  values (p_business_id, p_detinator,
          now() + make_interval(secs => greatest(10, least(coalesce(p_secunde, 120), 600))))
  on conflict (business_id) do update
     set detinator = excluded.detinator,
         pana_la   = excluded.pana_la
   where a.pana_la < now()
      or a.detinator = excluded.detinator
  returning true into v_ocupat;
  return coalesce(v_ocupat, false);
end;
$function$;

-- Elibereaza numai lacatul TAU: un apelant intarziat nu-l poate elibera pe al urmatorului.
create or replace function public.saga_elibereaza_apelul(p_business_id uuid, p_detinator uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  delete from privat.saga_apel_in_curs
   where business_id = p_business_id
     and detinator = p_detinator;
$function$;

-- ---------------------------------------------------------------------------
-- 6.4 Cheia rotita: scriere atomica, conditionata
-- ---------------------------------------------------------------------------
-- Pune cheia noua NUMAI daca baza tine inca cheia cu care a plecat apelul. Daca intre timp
-- comerciantul a salvat alta cheie (sau s-a deconectat), a lui castiga si se intoarce `false`.
-- ⚠ Atinge DOAR `api_key`, nu rescrie tot JSON-ul configurarii: o citire cazuta in cod n-ar avea ce
-- sa stearga (lectia `citirea-cazuta-rescrie-tot-jsonul`). Cheia se cripteaza aici, ca prin vedere.

create or replace function public.saga_roteste_cheia(p_business_id uuid, p_cheie_veche text, p_cheie_noua text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_n integer;
begin
  if coalesce(p_cheie_noua, '') = '' or coalesce(p_cheie_veche, '') = '' then
    return false;
  end if;
  update privat.store_settings s
     set saga_config = jsonb_set(s.saga_config, '{api_key}', to_jsonb(privat.cripteaza(p_cheie_noua)))
   where s.business_id = p_business_id
     and jsonb_typeof(s.saga_config) = 'object'
     and privat.decripteaza(s.saga_config ->> 'api_key') = p_cheie_veche;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$function$;

-- Numai serverul (cheia de serviciu) le cheama.
revoke execute on function public.saga_ocupa_apelul(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.saga_elibereaza_apelul(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.saga_roteste_cheia(uuid, text, text) from public, anon, authenticated;
grant execute on function public.saga_ocupa_apelul(uuid, uuid, integer) to service_role;
grant execute on function public.saga_elibereaza_apelul(uuid, uuid) to service_role;
grant execute on function public.saga_roteste_cheia(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
