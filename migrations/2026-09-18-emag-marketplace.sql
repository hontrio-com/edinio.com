-- eMAG Marketplace: al cincilea canal de vanzare, si cel mai mare din Romania.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `emag_config` intra in acelasi `select` cu restul
-- setarilor magazinului, iar PostgREST respinge INTREAGA interogare cand o coloana
-- lipseste — deci codul pusat inaintea migratiei ar rupe pagini care n-au nicio
-- treaba cu eMAG, pe TOATE magazinele. (Incident 2026-09-03, cu Posta si Innoship.
-- Vezi `npm run verifica:coloane`.)
--
-- ═══ DE UNDE VIN AFIRMATIILE DE MAI JOS ═══
--
-- O singura sursa, dar completa: OpenAPI 3.0 oficial, „eMAG & FD Marketplace API",
-- `info.version: 4.5.1`, 37 de rute, publicat la https://marketplace-api.emag.ro/api-doc.
-- Fiecare nota marcata ⚠ citeaza documentatia lor, nu o presupune.
--
-- Ce atinge migratia:
--   1. `privat.store_settings`: `emag_config`;
--   2. `privat.campuri_secrete`: parola de API;
--   3. `public.emag_offers`: ofertele, cu id-ul pe care il tinem NOI;
--   4. `public.emag_sync_queue`: coada, cu cele cinci feluri de lucrare;
--   5. `public.emag_orders`, `public.emag_rma`, `public.emag_awb`;
--   6. lista alba din `revendica_din_coada`;
--   7. registrul de operatii externe: furnizorul `emag`;
--   8. RLS si indexuri.

-- ---------------------------------------------------------------------------
-- 1. Configurarea, pe tabelul PRIVAT
--
-- ⚠ Pe `privat.store_settings`, nu pe vederea publica: vederea e GENERATA din
-- tabel de `reconstruieste_store_settings()`, deci o coloana pusa direct pe ea ar
-- disparea la prima regenerare.
-- ---------------------------------------------------------------------------
alter table privat.store_settings
  add column if not exists emag_config jsonb default '{}'::jsonb not null;

comment on column privat.store_settings.emag_config is
  'eMAG Marketplace API v4.5.1: {connected, username, password, tara, vendor_name, '
  'needs_reconnect, auto_sync, auto_publish, category_map{}, vat_id, handling_time, '
  'warranty_default, warehouse_id, gpsr{}, price_band_pct, orders_synced_at, '
  'rma_synced_at, reconcile_page, pickup_address_id, return_address_id, courier_account_id}. '
  '⚠ `tara` alege gazda: ro | bg | hu (`marketplace-api.emag.<tara>`). Fashion Days e in '
  'afara acoperirii, dinadins. '
  '⚠ `username` NU e criptat, desi la Basic Auth pleaca chiar ca prima jumatate a '
  'acreditarii: singur nu deschide nimic, iar comerciantul trebuie sa-l poata reciti ca '
  'sa stie CE CONT a legat. Acelasi rationament ca la `posta_config.username`, '
  '`pallex_config.username`, `dhl_config.username`. Doar `password` se cripteaza. '
  '⚠ `category_map` e cheiat pe NUMELE categoriei Edinio, nu pe un id: `products.category` '
  'e un text, nu o cheie straina. Acelasi tipar ca `trendyol_config.category_map`. '
  '⚠ `warehouse_id` e 1 cand exista un singur depozit — asa cere documentatia lor, nu e '
  'o valoare inventata de noi.';

-- ---------------------------------------------------------------------------
-- 2. Secretul, criptat in repaus
--
-- ⚠ Numele campului trebuie sa fie IDENTIC in trei locuri: in `EmagConfig`
-- (src/lib/emag/types.ts), in `CAMPURI_SECRETE` (src/lib/integrari/secrete.ts) si
-- aici. Nimic nu verifica potrivirea — nici tsc, nici probele, nici build-ul — iar o
-- nepotrivire taie TOT stratul de secrete in tacere: mascarea nu mascheaza,
-- declansatorul nu cripteaza, pastrarea nu pastreaza. (Defectul camelCase/snake_case
-- de la Packeta, 15.08.2026.)
-- ---------------------------------------------------------------------------
insert into privat.campuri_secrete (coloana, cale) values
  ('emag_config', 'password')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
-- Prima regenereaza SELECT-ul vederii publice, a doua corpul declansatorului
-- INSTEAD OF UPDATE — si fara a doua, salvarea configului nu scrie nimic, tacut.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 3. Ofertele
--
-- ═══ ⚠ O OFERTA NU E UN PRODUS. E UN PRODUS SAU O COMBINATIE ═══
--
-- eMAG NU ARE VARIANTE IMBRICATE. Fiecare marime sau culoare e o oferta separata, cu
-- `id` propriu, legata de surorile ei printr-o FAMILIE (`family {id, name,
-- family_type_id}`). Un produs Edinio cu patru combinatii inseamna PATRU randuri aici
-- plus un `family_id` comun.
--
-- E cel mai mare salt de model din toata integrarea, si de aceea tabelul se cheama
-- `emag_offers`, nu `emag_listings`: la Trendyol exista `trendyol_listings` (produs) SI
-- `trendyol_variants` (combinatie), fiindca acolo un produs cu variante e UN obiect la
-- ei. Aici n-are ce sa stea in tabelul de produs — nu exista niciun obiect „produs" la
-- eMAG care sa fie al nostru.
--
-- ═══ ⚠ `emag_id` E AL NOSTRU, NU AL LOR ═══
--
-- `ProductOfferSave.id` din documentatia lor e „Seller internal product id. Primary key
-- for identifying a product offer." Adica eMAG identifica oferta dupa un numar pe care
-- il alegem NOI, si care trebuie sa fie stabil pe veci: schimbat, oferta veche ramane
-- acolo orfana si se creeaza una noua.
--
-- Produsele noastre au `uuid`, deci trebuie un intreg. Un singur sir GLOBAL, nu unul pe
-- magazin: id-urile trebuie sa fie unice doar in contul vanzatorului, iar global unic e
-- un caz particular al lui — si scapa de cursele unui contor per magazin.
-- ---------------------------------------------------------------------------
create table if not exists public.emag_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  /* ⚠ `on delete set null`, nu cascade: un produs sters din Edinio NU sterge oferta de
     la eMAG. Randul ramane ca sa se poata trimite `status = 0` (inactiv) — eMAG nu are
     stergere de oferta, exact ca Trendyol. */
  product_id uuid references public.products(id) on delete set null,

  emag_id bigint generated by default as identity,

  /* ⚠ Legatura inapoi la `page_sections.variants.combinations[].title`. Fara ea, o
     vanzare de pe eMAG scade stocul produsului in loc de al marimii vandute — exact
     defectul reparat retroactiv la Trendyol si About You prin
     `migrations/2026-08-19-stoc-marketplace.sql`. Nul la produsele simple. */
  variant_title text,

  /* Familia: comuna tuturor combinatiilor aceluiasi produs. `family_type_id` vine din
     `family_types` al categoriei, deci depinde de categoria aleasa. */
  family_id bigint,
  family_type_id integer,

  /* ⚠ eMAG STERGE AUTOMAT spatiile, virgula si punctul-virgula din `part_number`
     („part number;" se salveaza ca „partnumber"). Pastram forma NORMALIZATA, ca sa
     putem potrivi inapoi ce ne intoarce `order/read` in `ext_part_number`. */
  part_number text,
  /* Cheia produsului eMAG la care e atasata oferta. Prezenta = oferta sta pe un produs
     care exista deja la ei; absenta = produsul e al nostru. */
  part_number_key text,
  ean text,
  category_id integer,
  brand text,

  status text not null default 'draft',

  /* ═══ Cele trei stari de validare, si de ce sunt trei coloane ═══
     Documentatia: o oferta e vandabila DOAR cand `stock > 0` SI `status = 1` SI
     `offer_validation_status = 1` SI `validation_status` e 3, 9, 11 sau 12.
     ⚠ Plus `translation_validation_status`: „automatically translated products may not
     be published even with validation_status 9/11". Deci 9 singur NU inseamna „e sus". */
  validation_status integer,
  offer_validation_status integer,
  translation_validation_status integer,

  /* ⚠ `doc_errors` vine ne-nul pentru produsele respinse din cauza documentatiei, si e
     SINGURUL loc din care afla comerciantul ce sa repare. La Trendyol motivul
     respingerii n-a fost aratat si produsele au stat „in aprobare" la nesfarsit. */
  doc_errors jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  error text,

  /* Ce ne spun ei despre concurenta pe acelasi produs. Se arata, nu se foloseste in
     nicio decizie automata. */
  ownership integer,
  number_of_offers integer,
  buy_button_rank integer,
  best_offer_sale_price numeric(12,4),

  /* ⚠ `false` inseamna OFERTA PRELUATA: exista la eMAG dinainte, adusa de import, si
     nu-i rescriem noi pretul si stocul. Aceeasi deosebire ca `trendyol_listings.
     auto_inventory`. Fara ea, primul import ar suprascrie preturile pe care
     comerciantul le-a pus de mana in panoul eMAG. */
  auto_sync boolean not null default true,
  /* „Am creat-o noi?" e ALTA intrebare decat „exista la ei?" — vezi
     `existaLaTrendyol` vs `putemSuprascrieContinutul` din src/lib/trendyol/sync.ts. */
  creat_de_edinio boolean not null default false,

  last_synced_at timestamptz,
  last_status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint emag_offers_emag_id_key unique (emag_id)
);

comment on table public.emag_offers is
  'O oferta eMAG = un produs simplu SAU o combinatie de variante. eMAG nu are variante '
  'imbricate: fiecare marime e o oferta cu id propriu, grupata prin `family_id`.';
comment on column public.emag_offers.emag_id is
  '⚠ Id-ul dupa care eMAG identifica oferta, si e AL NOSTRU: documentatia lor il numeste '
  '„Seller internal product id. Primary key for identifying a product offer." Trebuie sa '
  'fie stabil pe veci — schimbat, oferta veche ramane orfana la ei si se creeaza alta.';
comment on column public.emag_offers.variant_title is
  'Titlul combinatiei din `page_sections.variants.combinations[].title`. ⚠ Fara el, o '
  'vanzare de pe eMAG scade stocul produsului, nu al marimii vandute.';
comment on column public.emag_offers.auto_sync is
  'false = oferta PRELUATA din eMAG la import. Nu-i rescriem pretul si stocul automat; '
  'numai la apasare explicita. Altfel primul import ar sterge preturile puse de mana.';

/* ═══ ⚠ UNICUL SE SCRIE PE EXPRESIE, NU CA `unique (…, variant_title)` ═══

   La produsele SIMPLE, `variant_title` e NULL. In Postgres `NULL <> NULL`, deci o
   constrangere `unique` obisnuita nu prinde nimic acolo: s-ar fi putut crea oricate
   randuri pentru acelasi produs simplu, fiecare cu alt `emag_id`, si fiecare ar fi
   trimis alta oferta la eMAG pentru acelasi produs.

   Nu e o presupunere: exact gaura asta a fost inchisa la registrul de operatii externe
   (`migrations/2026-08-24-registru-operatii-de-platforma.sql`), unde indexul unic e tot
   pe expresie cu `coalesce`, tocmai fiindca `NULL != NULL` deschidea o gaura tacuta
   chiar acolo unde se emit documentele fiscale.

   `product_id` poate fi si el NULL (produs sters din Edinio, oferta ramasa la eMAG),
   deci intra si el sub `coalesce`. */
create unique index if not exists emag_offers_produs_varianta_uidx
  on public.emag_offers (
    business_id,
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(variant_title, '')
  );

create index if not exists emag_offers_business_status_idx
  on public.emag_offers (business_id, status);
create index if not exists emag_offers_product_idx
  on public.emag_offers (product_id);
/* Pentru reconciliere: cele mai demult verificate, primele. `nulls first` nu e ornament —
   implicitul lui Postgres la `asc` e `nulls last`, iar ofertele NEVERIFICATE VREODATA ar
   iesi ultimele si, sub plafon, niciodata. Aceeasi lectie ca la cronurile de urmarire. */
create index if not exists emag_offers_reconciliere_idx
  on public.emag_offers (business_id, last_status_at asc nulls first);
create index if not exists emag_offers_pnk_idx
  on public.emag_offers (business_id, part_number_key)
  where part_number_key is not null;

-- ---------------------------------------------------------------------------
-- 4. Coada
--
-- Aceeasi forma cu celelalte patru cozi de marketplace, ca sa mearga cu
-- `revendica_din_coada` fara nicio adaptare.
--
-- ═══ ⚠ CELE CINCI FELURI DE LUCRARE, SI DE CE NU SUNT DOUA ═══
--
-- eMAG are TREI rute de scriere, de greutati foarte diferite:
--   `PATCH /offer_stock/{id}`   numai stocul
--   `POST /offer/save`          pret, stoc, timp de pregatire, TVA, stare. Max 50.
--   `POST /product_offer/save`  produs + oferta, cu documentatie. SINGURA care creeaza.
--
-- ⚠ ASTA E LECTIA TRENDYOL FACUTA STRUCTURALA. Acolo, `op: 'upsert'` pe un produs deja
-- aprobat trimitea CONTINUT, nu pret: 1051 de produse VetDepo au raportat succes cu
-- preturile neschimbate, si s-a aflat abia cand a intrebat comerciantul. Aici felul
-- lucrarii ALEGE ruta, iar o schimbare de pret nu are cum sa ajunga pe ruta grea.
-- ---------------------------------------------------------------------------
create table if not exists public.emag_sync_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  offer_id text not null,
  op text not null default 'oferta',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  /* Lacatul de inchiriere. Vezi `revendica_din_coada`. */
  revendicat_pana timestamptz,

  constraint emag_sync_queue_business_offer_op_key unique (business_id, offer_id, op),
  constraint emag_sync_queue_op_check check (op = any (array[
    'oferta'::text,      -- product_offer/save: creare sau documentatie
    'pret'::text,        -- offer/save: pret, TVA, timp de pregatire, stare
    'stoc'::text,        -- offer_stock: numai cantitatea
    'retragere'::text,   -- offer/save cu status 0. eMAG NU are stergere de oferta.
    'masuratori'::text   -- measurements/save: dimensiuni si greutate
  ]))
);

comment on column public.emag_sync_queue.op is
  'Felul lucrarii ALEGE ruta eMAG. `stoc` merge pe `PATCH /offer_stock` (cea mai usoara), '
  '`pret` pe `offer/save` (light API), `oferta` pe `product_offer/save` (singura care '
  'creeaza). ⚠ O schimbare de pret nu are voie sa atinga `product_offer/save`: la Trendyol '
  'exact confuzia asta a raportat succes pe 1051 de produse fara sa schimbe niciun pret.';

create index if not exists emag_sync_queue_created_idx
  on public.emag_sync_queue (created_at);
create index if not exists emag_sync_queue_product_idx
  on public.emag_sync_queue (product_id);
create index if not exists emag_sync_queue_revendicat_idx
  on public.emag_sync_queue (revendicat_pana, created_at);

-- ---------------------------------------------------------------------------
-- 5. Comenzi, retururi, AWB
-- ---------------------------------------------------------------------------
create table if not exists public.emag_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,

  emag_order_id bigint not null,
  /* 1 noua · 2 in procesare · 3 pregatita · 4 finalizata · 0 anulata · 5 returnata */
  order_status integer,
  /* ⚠ 2 = onorata de eMAG (FBE), 3 = onorata de vanzator. NUMAI 3 se poate edita; pe 2
     se pot incarca doar atasamente. Coloana exista ca sa nu se incerce editari care
     oricum ar fi refuzate. */
  order_type integer,
  /* 1 ramburs · 2 transfer bancar · 3 card online */
  payment_mode_id integer,
  is_complete integer,

  /* ⚠ Cand am confirmat primirea. `order/acknowledge` e SINGURA cale de a trece comanda
     in „in procesare" SI singurul lucru care opreste notificarile lor. Se cheama DUPA ce
     comanda a intrat cu bine la noi: data prea devreme, o scriere locala picata inseamna
     o comanda pe care n-o mai anunta nimeni. Coloana e dovada ca s-a facut. */
  acknowledged_at timestamptz,

  lines jsonb not null default '[]'::jsonb,
  /* ⚠ Voucherele se pastreaza INTREGI. Documentatia lor: pe acelasi produs pot cadea mai
     multe vouchere, CU COTE DE TVA DIFERITE, si cere explicit sa se citeasca toti
     parametrii. Un singur camp „reducere" ar fi pierdut TVA-ul. */
  vouchers jsonb not null default '[]'::jsonb,
  raw jsonb,

  last_modified timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint emag_orders_business_order_key unique (business_id, emag_order_id)
);

comment on column public.emag_orders.raw is
  'Comanda intreaga, asa cum a venit. ⚠ `order/save` cere sa se retrimita TOATE campurile '
  'citite initial, nu doar cele schimbate — fara copia asta, o editare ar sterge tacut '
  'campurile pe care nu le modelam noi.';

create index if not exists emag_orders_business_status_idx
  on public.emag_orders (business_id, order_status);
create index if not exists emag_orders_order_idx
  on public.emag_orders (order_id);

create table if not exists public.emag_rma (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,

  emag_rma_id bigint not null,
  emag_order_id bigint,
  /* 1 incomplet · 2 nou · 3 confirmat · 4 refuzat · 5 anulat · 6 primit · 7 finalizat.
     ⚠ Trecerile ingaduite sunt un TABEL, nu o scara: din „primit" se poate merge inapoi
     la „refuzat". Vezi `EMAG_TRECERI_RETUR` din src/lib/emag/types.ts. */
  request_status integer,
  return_type integer,
  return_reason integer,

  products jsonb not null default '[]'::jsonb,
  awbs jsonb not null default '[]'::jsonb,
  raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint emag_rma_business_rma_key unique (business_id, emag_rma_id)
);

create index if not exists emag_rma_business_status_idx
  on public.emag_rma (business_id, request_status);

create table if not exists public.emag_awb (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,

  /* Id-ul AWB-ului la ei. ⚠ Se poate citi PDF-ul (`awb/read_pdf`) NUMAI pentru AWB-urile
     emise prin API — doar pentru ele primim `emag_id`, si el e obligatoriu acolo. */
  emag_id bigint,
  awb_number text,
  courier_account_id integer,
  cash_on_delivery numeric(12,2),
  status jsonb,
  created_at timestamptz not null default now()
);

create index if not exists emag_awb_order_idx
  on public.emag_awb (order_id);

-- ---------------------------------------------------------------------------
-- 6. Coada noua intra in lista alba a revendicarii
--
-- ⚠ FARA ASTA, CRONUL PRIMESTE „coada necunoscuta: emag_sync_queue" LA FIECARE
-- TRECERE. E o lista PERMISA dinadins — numele tabelei se compune dinamic, iar fara
-- lista o coada noua ar fi fost acceptata din prima zi fara sa se uite nimeni la ea.
--
-- ⚠⚠ `AS MATERIALIZED` NU E DECOR, si se pastreaza intocmai. Masurat pe o coada de 6
-- randuri cu `limit 3`: forma cu subinterogarea inline revendica TOATE SASE, fiindca
-- Postgres o re-evalueaza in planul de semi-join si `LIMIT` isi pierde intelesul. Adica
-- un singur lucrator ar inhata toata coada si ar tine-o cinci minute.
-- (migrations/2026-08-19-lease-cozi-marketplace.sql)
-- ---------------------------------------------------------------------------
create or replace function public.revendica_din_coada(
  p_coada text,
  p_limita int default 50,
  p_lease interval default interval '5 minutes'
) returns setof jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_permise constant text[] := array[
    'gmc_sync_queue', 'olx_sync_queue', 'trendyol_sync_queue', 'aboutyou_sync_queue',
    'emag_sync_queue'];
begin
  if not (p_coada = any(v_permise)) then
    raise exception 'coada necunoscuta: %', p_coada;
  end if;

  return query execute format($f$
    with alese as materialized (
      select c.id from public.%I c
       where c.revendicat_pana is null or c.revendicat_pana < now()
       order by c.created_at
       limit $2
       for update skip locked)
    update public.%I q
       set revendicat_pana = now() + $1
      from alese a
     where q.id = a.id
    returning to_jsonb(q.*)
  $f$, p_coada, p_coada) using p_lease, p_limita;
end;
$$;

revoke all on function public.revendica_din_coada(text, int, interval) from public, anon, authenticated;
grant execute on function public.revendica_din_coada(text, int, interval) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Registrul de operatii externe cunoaste furnizorul nou
--
-- ⚠ Fara asta, `rezerva_operatie_externa` cade pe constrangere INAINTE de orice apel.
-- Trebuie sa ramana in pas cu `FurnizorOperatie` din src/lib/operatii/registru.ts.
--
-- ⚠ La eMAG registrul se foloseste pentru AWB, factura si `acknowledge` — efecte cu un
-- singur foc. NU pentru publicarea unei oferte: la OLX, o cheie pe produs intorcea
-- `deja` la a doua trecere si ingheta pretul (revenit in commit a0724b3).
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
    'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text, 'emag'::text,
    'proba'::text
  ]));

-- ---------------------------------------------------------------------------
-- 8. RLS
--
-- Numai CITIRE, si numai proprietarul magazinului. Scrierile se fac cu service role,
-- care ocoleste RLS din oficiu — deci nu are nevoie de politica.
-- Acelasi tipar ca `owner_select_trendyol_*`.
-- ---------------------------------------------------------------------------
alter table public.emag_offers     enable row level security;
alter table public.emag_sync_queue enable row level security;
alter table public.emag_orders     enable row level security;
alter table public.emag_rma        enable row level security;
alter table public.emag_awb        enable row level security;

drop policy if exists owner_select_emag_offers on public.emag_offers;
create policy owner_select_emag_offers on public.emag_offers for select
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

drop policy if exists owner_select_emag_sync_queue on public.emag_sync_queue;
create policy owner_select_emag_sync_queue on public.emag_sync_queue for select
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

drop policy if exists owner_select_emag_orders on public.emag_orders;
create policy owner_select_emag_orders on public.emag_orders for select
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

drop policy if exists owner_select_emag_rma on public.emag_rma;
create policy owner_select_emag_rma on public.emag_rma for select
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

/* ⚠ AWB-ul poarta numele, telefonul si adresa cumparatorului. RLS pornit, o singura
   politica de citire pentru proprietar — la fel ca la tabelele de etichete ale
   curierilor, unde descarcarea trece oricum printr-o actiune care verifica intai
   proprietatea. */
drop policy if exists owner_select_emag_awb on public.emag_awb;
create policy owner_select_emag_awb on public.emag_awb for select
  using (business_id in (select id from public.businesses where user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 9. `updated_at`
-- ---------------------------------------------------------------------------
drop trigger if exists set_emag_offers_updated_at on public.emag_offers;
create trigger set_emag_offers_updated_at
  before update on public.emag_offers
  for each row execute function public.set_updated_at();

drop trigger if exists set_emag_orders_updated_at on public.emag_orders;
create trigger set_emag_orders_updated_at
  before update on public.emag_orders
  for each row execute function public.set_updated_at();

drop trigger if exists set_emag_rma_updated_at on public.emag_rma;
create trigger set_emag_rma_updated_at
  before update on public.emag_rma
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. PostgREST trebuie sa afle de tabelele si coloanele noi
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
