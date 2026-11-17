-- Facturis Online, a patra casa de facturare - 17.11.2026.
--
-- Facturis are un singur capat (`POST https://api.facturis-online.ro/api/`, campul de formular
-- `json`), autentificare cu patru valori in CORPUL cererii (cheia API, utilizatorul, parola,
-- codul fiscal al firmei) si raspunde la emitere DOAR cu id-ul intern al documentului. Seria si
-- numarul se afla dupa, printr-o citire (`Facturi` / `Get`). De aici forma coloanelor: CHEIA
-- (`*_key`) e dovada ca documentul exista; seria si numarul se scriu cand citirea a raspuns.
-- Fisa completa: `docs/facturare/FACTURIS.md`.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `facturis_config` si coloanele `facturis_*` intra in selecturi
-- IMPARTITE cu celelalte case (pagina comenzii, lista, facturarea automata si in lot, urcarea
-- facturii la eMAG si Trendyol, contul cumparatorului). PostgREST respinge INTREAGA interogare cand
-- o coloana lipseste: codul pusat inaintea migratiei ar rupe facturarea la TOATE casele, pe toate
-- magazinele (incidentul din 03.09, cu Posta si Innoship).
--
-- Aditiva: coloane nullable, un furnizor nou in registru si doua functii rescrise cu o ramura in
-- plus. Codul vechi nu le atinge.
--
-- Ce atinge:
--   1. `privat.store_settings`: `facturis_config`, cu `api_key` si `password` criptate;
--   2. `public.orders`: factura si stornarea Facturis (cheie, serie, numar);
--   3. registrul de operatii externe: furnizorul `facturis`;
--   4. `privat.cont_documentul_comenzii`: factura Facturis in contul cumparatorului;
--   5. `public.trendyol_comenzi_de_facturat`: comenzile cu factura Facturis se urca si la Trendyol.

-- ---------------------------------------------------------------------------
-- 1. Configurarea, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------

alter table privat.store_settings
  add column if not exists facturis_config jsonb;

comment on column privat.store_settings.facturis_config is
  'Facturis Online: {enabled, api_key (secret), username, password (secret), cif, serie, serie_storno, '
  'due_days, auto_invoice, auto_invoice_trigger, mark_paid_online, gestiune, punct_de_lucru}. '
  'username si cif NU sunt secrete: omul trebuie sa vada ce cont a legat. Vezi src/lib/facturis/config.ts.';

-- ⚠ Numele sunt IDENTICE in `CAMPURI_SECRETE` (src/lib/integrari/secrete.ts) si in `FacturisConfig`.
insert into privat.campuri_secrete (coloana, cale) values
  ('facturis_config', 'api_key'),
  ('facturis_config', 'password')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 2. Documentele pe comanda
-- ---------------------------------------------------------------------------
-- ⚠ CHEIA, nu numarul, spune ca factura exista. Emiterea intoarce numai id-ul; daca citirea de
-- dupa nu raspunde, documentul fiscal EXISTA si comanda trebuie sa-l stie, chiar fara numar.

alter table public.orders
  add column if not exists facturis_invoice_key text,
  add column if not exists facturis_invoice_series text,
  add column if not exists facturis_invoice_number text,
  add column if not exists facturis_storno_key text,
  add column if not exists facturis_storno_series text,
  add column if not exists facturis_storno_number text;

comment on column public.orders.facturis_invoice_key is
  'Id-ul facturii in Facturis (facturi_key). Pus = factura EXISTA, chiar daca seria si numarul inca nu s-au citit.';
comment on column public.orders.facturis_storno_key is
  'Id-ul facturii de stornare in Facturis (o factura cu cantitatile negative ale celei originale).';

-- ---------------------------------------------------------------------------
-- 3. Registrul de operatii externe
-- ---------------------------------------------------------------------------
-- ⚠ Lista e COPIATA din forma de productie (schema de referinta, 16.11.2026), cu 'facturis' dupa
-- 'fgo'. Copiata dintr-o migratie mai veche, ar fi scos un furnizor din registru.

alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;
alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus', 'sameday', 'fancourier', 'dpd', 'woot', 'colete', 'gls', 'pallex', 'ecolet',
    'posta', 'innoship', 'packeta', 'smartship', 'shipo', 'fedex', 'ups', 'dhl', 'curiera', 'epacket',
    'smartbill', 'oblio', 'fgo', 'facturis', 'stripe', 'netopia', 'ipay', 'klarna', 'revolut',
    'trendyol', 'aboutyou', 'olx', 'gmc', 'emag', 'proba'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 4. Contul cumparatorului: documentul comenzii
-- ---------------------------------------------------------------------------
-- Corpul e cel din productie (schema de referinta, 16.11.2026), cu O RAMURA noua, a patra, dupa fGO:
-- ordinea caselor e aceeasi ca in dispecerul de facturare automata. Tipul intors e acelasi, deci
-- `create or replace` ajunge si drepturile se pastreaza; revocarea de la final doar le reafirma.
-- ⚠ Se cer CHEIA si NUMARUL: fara numar ecranul n-ar avea ce scrie, iar `documentulFiscal` arunca
-- oricum documentul fara numar. Facturis n-are mediu de test, deci nu e nimic de sarit.

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
    else null
  end;
$function$
;

revoke execute on function privat.cont_documentul_comenzii(o anyelement) from public;

-- ---------------------------------------------------------------------------
-- 5. Trendyol: comenzile cu factura de urcat
-- ---------------------------------------------------------------------------
-- Corpul e cel din productie (schema de referinta, 16.11.2026), cu UN rand nou in conditia facturii.
-- ⚠ Fara el, o comanda Trendyol facturata prin Facturis n-ar intra NICIODATA in fereastra de
-- urcare, iar lipsa nu s-ar vedea nicaieri: cronul ar raporta „nimic de urcat".

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

notify pgrst, 'reload schema';
