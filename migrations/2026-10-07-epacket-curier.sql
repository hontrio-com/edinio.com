-- e-packet, al nouasprezecelea transportator - 07.10.2026.
--
-- e-packet e un BROKER: un cont, un credit, sase curieri dedesubt (DPD, Sameday, Cargus, FAN
-- Courier, Dragon Star, TCE). AWB-ul intors e al curierului de dedesubt.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `epacket_config` e ceruta in ACELASI select cu restul
-- setarilor de livrare (checkout, Setari, pagina comenzii), iar `epacket_awb_number` in
-- selectul portii de AWB, al stergerii si al lotului. PostgREST respinge INTREAGA interogare
-- cand o coloana lipseste: codul pusat inaintea migratiei ar rupe checkoutul si emiterea la
-- TOTI curierii, pe toate magazinele (incidentul din 03.09, cu Posta si Innoship).
--
-- Ce atinge:
--   1. `public.orders`: coloanele expedierii si ale urmaririi;
--   2. `privat.store_settings`: `epacket_config`, cu `api_key` criptata;
--   3. registrul de operatii externe: furnizorul `epacket`;
--   4. indexul partial al cronului de urmarire;
--   5. `public.cont_comanda_mea`: AWB-ul e-packet in contul cumparatorului, cu curierul REAL.
--
-- Nu se creeaza niciun tabel: eticheta se cere de la ei la fiecare descarcare (citire pura).
-- Documentatia si ce s-a masurat pe fir: `docs/curieri/EPACKET.md`.

-- ---------------------------------------------------------------------------
-- 1. Coloanele expedierii
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists epacket_awb_number text,
  add column if not exists epacket_awb_at timestamptz,
  add column if not exists epacket_reference text,
  add column if not exists epacket_curier text,
  add column if not exists epacket_tip_livrare text,
  add column if not exists epacket_test boolean,
  add column if not exists epacket_status_code text,
  add column if not exists epacket_status_label text,
  add column if not exists epacket_status_at timestamptz,
  add column if not exists epacket_status_checked_at timestamptz;

comment on column public.orders.epacket_awb_number is
  'AWB-ul e-packet (`awb_number` din POST /awb). E numarul CURIERULUI de dedesubt (DPD, Sameday...). '
  'Identitatea expedierii pentru poarta, cron si etichete.';
comment on column public.orders.epacket_awb_at is
  'Clipa emiterii. Ancora ferestrei cronului si a contului cumparatorului. NU se umple din created_at.';
comment on column public.orders.epacket_reference is
  '`reference` trimis la emitere (EDN-<4 din magazin>-<numar comanda>). Doar evidenta: e-packet nu '
  'cauta dupa ea si nu previne dublurile cu ea.';
comment on column public.orders.epacket_curier is
  'Curierul de dedesubt, codul LOR: DPD, SDY, CGS, FCR, DSC, TCE. Fara check: lista e a lor si poate creste.';
comment on column public.orders.epacket_tip_livrare is
  '`D2D` (la adresa) sau `D2L` (la punct), cum a intors e-packet.';
comment on column public.orders.epacket_test is
  'Emis cu o cheie de TEST (`epk_test_`): sandboxul curierului, nu pleaca la nimeni si nu se taxeaza. '
  'O cheie live nu vede AWB-urile de test, si invers.';
comment on column public.orders.epacket_status_code is
  'Codul ultimei stari citite (`in_tranzit`, `livrat`...; 19 publicate de ei). Text, FARA check.';
comment on column public.orders.epacket_status_label is
  'Starea in cuvinte (`label` de la ei), pentru pagina comenzii.';
comment on column public.orders.epacket_status_at is
  'Ceasul LOR la ultima stare (`status_at`).';
comment on column public.orders.epacket_status_checked_at is
  'Ceasul NOSTRU: ultima trecere a cronului. Rotatia cozii; se scrie pe ORICE drum.';

-- ---------------------------------------------------------------------------
-- 2. Configurarea, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------

alter table privat.store_settings
  add column if not exists epacket_config jsonb;

comment on column privat.store_settings.epacket_config is
  'e-packet: {enabled, api_key, expeditor{prenume, nume, firma, telefon, email, localitate_id, '
  'localitate_nume, cod_postal, strada, numar, bloc, scara, etaj, apartament}, ramburs{titular, iban, '
  'banca}, curier_adresa, lockere, curier_puncte, dimensiuni_implicite, asigurare, deschidere_colet, '
  'dimensiune_eticheta, continut_implicit}. Doar `api_key` se cripteaza.';

insert into privat.campuri_secrete (coloana, cale) values
  ('epacket_config', 'api_key')
on conflict do nothing;

select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 3. Registrul de operatii externe
-- ---------------------------------------------------------------------------
-- ⚠ Lista e COPIATA din forma de productie (schema de referinta, 07.10.2026), cu 'emag' si
-- 'curiera'. Copiata dintr-o migratie mai veche, ar fi scos un furnizor din registru.

alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;
alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor = any (array[
    'cargus', 'sameday', 'fancourier', 'dpd', 'woot', 'colete', 'gls', 'pallex', 'ecolet',
    'posta', 'innoship', 'packeta', 'smartship', 'shipo', 'fedex', 'ups', 'dhl', 'curiera', 'epacket',
    'smartbill', 'oblio', 'fgo', 'stripe', 'netopia', 'ipay', 'klarna', 'revolut',
    'trendyol', 'aboutyou', 'olx', 'gmc', 'emag', 'proba'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 4. Indexul cronului de urmarire
-- ---------------------------------------------------------------------------

create index if not exists orders_epacket_urmarire_idx
  on public.orders using btree (epacket_status_checked_at nulls first)
  where epacket_awb_number is not null
    and status = any (array['pending', 'confirmed', 'processing', 'shipped']);

-- ---------------------------------------------------------------------------
-- 5. Contul cumparatorului: AWB-ul e-packet, cu curierul REAL (si Curiera: numarul partenerului)
-- ---------------------------------------------------------------------------
-- Corpul e cel din productie (schema de referinta, 07.10.2026), cu UN rand nou in VALUES. Tipul
-- intors e acelasi, deci `create or replace` ajunge. ⚠ `curier_real` poarta NUMELE curierului de
-- dedesubt („DPD", „Sameday"...): cumparatorul primeste coletul si SMS-ul de la DPD, iar adresa
-- publica de urmarire e a lui (`src/lib/cont/urmarire.ts`).

create or replace function public.cont_comanda_mea(
  p_business uuid, p_cont uuid, p_order uuid
)
returns table (
  order_id uuid, numar text, creata_la timestamp with time zone, stare text, incasata boolean,
  metoda_plata text, subtotal numeric, transport numeric, reducere numeric, taxa_ramburs numeric,
  total numeric, linii jsonb, livrare jsonb, firma jsonb, factura jsonb, curier text, awb text,
  urmarire text, vedere text, reducere_card numeric, reducere_ramburs numeric, cod_reducere text,
  tva numeric, cota_tva numeric, regim_tva boolean, stare_plata text, economie_oferte numeric,
  detalii text, awb_emis_la timestamp with time zone, curier_real text
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id, o.order_number, o.created_at, o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    case when l.vedere = 'intreaga' then o.payment_method else null end,
    case when l.vedere = 'intreaga' then o.subtotal else null end,
    case when l.vedere = 'intreaga' then o.shipping_cost else null end,
    case when l.vedere = 'intreaga' then o.discount_amount else null end,
    case when l.vedere = 'intreaga' then o.cod_fee_amount else null end,
    o.total,
    (
      /*
        ⚠ Imaginea si legatura vin din catalogul de AZI, nu din clipa comenzii:
        produsul poate fi sters (27 de linii pe productie) sau dezactivat. Join-ul
        poarta si magazinul. `product_id` e text in jsonb si poate fi `extra_...`,
        deci se transforma in uuid numai cand chiar arata a uuid.
      */
      select coalesce(jsonb_agg(jsonb_build_object(
               'nume', t.li->>'name', 'cantitate', t.li->>'quantity',
               'pret', t.li->>'price', 'produs_id', t.li->>'product_id',
               'extra', coalesce(t.li->>'product_id', '') like 'extra\_%',
               'imagine', case when jsonb_typeof(p.images->0) = 'string' then p.images->>0 end,
               'slug', case when p.is_active then p.slug end,
               'personalizare', case when l.vedere = 'intreaga' then privat.cont_personalizarea_liniei(t.li) else null end,
               'defalcare', case when l.vedere = 'intreaga' then privat.cont_defalcarea_liniei(t.li) else null end
             ) order by t.ord), '[]'::jsonb)
        from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as t(li, ord)
        left join public.products p
          on p.business_id = o.business_id
         and p.id = case
                      when coalesce(t.li->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (t.li->>'product_id')::uuid
                    end
    ),
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'nume', o.customer_name, 'telefon', o.customer_phone, 'email', o.customer_email,
      'adresa', o.shipping_address->>'address',
      'adresa_acasa', o.shipping_address->>'home_address',
      'oras', o.shipping_address->>'city', 'judet', o.shipping_address->>'county',
      /* ⚠ `postal_code` (checkout de azi) sau `postalCode` (mai vechi). NU `postcode`. */
      'cod_postal', coalesce(
        nullif(btrim(coalesce(o.shipping_address->>'postal_code', '')), ''),
        nullif(btrim(coalesce(o.shipping_address->>'postalCode', '')), '')
      ),
      'tara', o.shipping_address->>'country',
      'fel_livrare', o.shipping_address->>'delivery_type',
      /* ⚠ Ridicarea personala are `delivery_type = 'address'` si `courier = 'pickup'`:
         felul se hotaraste si dupa curierul ales, nu numai dupa `delivery_type`. */
      'curier_ales', o.shipping_address->>'courier',
      'eticheta_livrare', o.shipping_address->>'courier_label',
      'punct', o.shipping_address->>'locker_name',
      'punct_adresa', o.shipping_address->>'locker_address',
      'punct_oras', o.shipping_address->>'locker_city',
      'punct_judet', o.shipping_address->>'locker_county'
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'denumire', o.billing_company->>'company_name',
      'cui', o.billing_company->>'cui',
      'reg_com', o.billing_company->>'reg_com',
      'adresa', o.billing_company->>'address',
      'oras', o.billing_company->>'city',
      'judet', o.billing_company->>'county',
      'platitor_tva', case when jsonb_typeof(o.billing_company->'vat_payer') = 'boolean'
                           then o.billing_company->'vat_payer' end
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) else null::jsonb end,
    case when l.vedere = 'intreaga' then awb.curier else null end,
    case when l.vedere = 'intreaga' then awb.awb else null end,
    case when l.vedere = 'intreaga' then awb.url else null end,
    l.vedere,
    case when l.vedere = 'intreaga' then o.card_discount_amount else null end,
    case when l.vedere = 'intreaga' then o.cod_discount_amount else null end,
    case when l.vedere = 'intreaga' then o.discount_code else null end,
    case when l.vedere = 'intreaga' then o.vat_amount else null end,
    case when l.vedere = 'intreaga' then o.vat_rate else null end,
    case when l.vedere = 'intreaga' then o.prices_include_vat else null end,
    /* ⚠ Starea BRUTA a platii, numai ca sa se poata spune „suma a fost returnata".
       Ecranul nu o citeste niciodata singura: la ramburs, o comanda livrata ramane
       `unpaid` si e totusi incasata (regula e `comanda_incasata`). */
    case when l.vedere = 'intreaga' then o.payment_status else null end,
    /* ⚠ INFORMATIV: reducerea din oferte e deja scazuta in pretul liniilor. */
    case when l.vedere = 'intreaga' then o.offer_discount_amount else null end,
    /* Campurile completate de om la checkout; JSON cheiat pe id-ul campului sau
       text simplu. Se parseaza in TypeScript, cu `try`: un cast gresit aici ar
       rupe toata citirea. */
    case when l.vedere = 'intreaga' then o.notes else null end,
    case when l.vedere = 'intreaga' then awb.emis_la else null end,
    case when l.vedere = 'intreaga' then awb.curier_real else null end
  from privat.cont_comanda l
  join public.orders o on o.id = l.order_id and o.business_id = l.business_id
  left join lateral (
    select v.curier, v.awb, v.url, v.emis_la, v.curier_real
      from (values
        ('cargus', o.cargus_awb_number, null::text, o.cargus_awb_at, null::text),
        ('colete', o.colete_awb_number, null::text, o.colete_awb_at, null::text),
        -- Curiera e broker: cumparatorul primeste numarul PARTENERULUI (DPD), cu care il cauta
        -- curierul care chiar livreaza; fara el, numarul Curiera, ca pana acum.
        ('curiera',
          coalesce(nullif(btrim(o.curiera_partener_awb), ''), o.curiera_awb_number), null::text, o.curiera_awb_at,
          case when nullif(btrim(o.curiera_partener_awb), '') is not null then nullif(btrim(o.curiera_partener), '') end),
        ('dhl', o.dhl_awb_number, o.dhl_tracking_url, o.dhl_awb_at, null::text),
        ('dpd', o.dpd_awb_number, null::text, o.dpd_awb_at, null::text),
        ('ecolet', o.ecolet_awb_number, null::text, o.ecolet_awb_at, null::text),
        /* Numele curierului de dedesubt, din codul LOR. Un cod nou iese null (fara legatura). */
        ('epacket', o.epacket_awb_number, null::text, o.epacket_awb_at,
          case o.epacket_curier
            when 'DPD' then 'DPD' when 'SDY' then 'Sameday' when 'CGS' then 'Cargus'
            when 'FCR' then 'FAN Courier' when 'DSC' then 'Dragon Star' when 'TCE' then 'TCE'
          end),
        ('fancourier', o.fan_courier_awb_number, null::text, o.fan_courier_awb_at, null::text),
        ('fedex', o.fedex_awb_number, o.fedex_tracking_url, o.fedex_awb_at, null::text),
        ('gls', o.gls_awb_number, null::text, o.gls_awb_at, null::text),
        ('innoship', o.innoship_awb_number, o.innoship_track_url, o.innoship_awb_at, o.innoship_courier_name),
        ('packeta', o.packeta_packet_id, null::text, o.packeta_awb_at, null::text),
        ('pallex', o.pallex_awb_number, null::text, o.pallex_awb_at, null::text),
        ('posta', o.posta_awb_number, null::text, o.posta_awb_at, null::text),
        ('sameday', o.sameday_awb_number, null::text, o.sameday_awb_at, null::text),
        ('shipo', o.shipo_awb_number, o.shipo_tracking_url, o.shipo_awb_at, o.shipo_courier_slug),
        ('smartship', o.smartship_awb_number, o.smartship_tracking_url, o.smartship_awb_at, o.smartship_courier_name),
        ('ups', o.ups_awb_number, o.ups_tracking_url, o.ups_awb_at, null::text),
        ('woot', o.woot_awb_number, null::text, o.woot_awb_at, nullif(btrim(split_part(replace(coalesce(o.woot_service_name, ''), chr(8212), chr(183)), chr(183), 1)), ''))
      ) as v(curier, awb, url, emis_la, curier_real)
     where v.awb is not null
     limit 1
  ) awb on true
  where l.business_id = p_business and l.cont_id = p_cont and l.order_id = p_order;
$fn$;

-- `create or replace` pastreaza drepturile, dar se refac si se VERIFICA, stilul casei: o
-- functie SECURITY DEFINER deschisa lui `anon` ar da oricui comanda oricui.
revoke all on function public.cont_comanda_mea(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cont_comanda_mea(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Verificarile stau IN migratie: daca una pica, nimic din fisier nu ramane aplicat.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'store_settings' and column_name = 'epacket_config'
  ) then
    raise exception 'vederea public.store_settings nu are epacket_config';
  end if;

  if position('epacket_config' in pg_get_functiondef('privat.store_settings_upd()'::regprocedure)) = 0 then
    raise exception 'declansatorul store_settings_upd nu scrie epacket_config';
  end if;

  if not exists (
    select 1 from privat.campuri_secrete where coloana = 'epacket_config' and cale = 'api_key'
  ) then
    raise exception 'api_key din epacket_config nu e trecuta la secrete';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'orders' and column_name like 'epacket\_%') <> 10 then
    raise exception 'coloanele e-packet de pe orders nu sunt toate zece';
  end if;

  if has_function_privilege('anon', 'public.cont_comanda_mea(uuid, uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cont_comanda_mea(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'anon sau authenticated poate chema cont_comanda_mea';
  end if;
  if not has_function_privilege('service_role', 'public.cont_comanda_mea(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'service_role NU poate chema cont_comanda_mea';
  end if;
end $$;

notify pgrst, 'reload schema';
