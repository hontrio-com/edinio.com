-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 11: comanda cu toate detaliile, facturile,
-- rezumatul contului                                            (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar: „comanda sa contina toate detaliile" si „clientul sa vada
-- si factura daca a emis-o proprietarul magazinului prin SmartBill, Oblio etc.".
-- Masurat inainte (demo + productie, doar agregat pe productie):
--
--  1. CODUL POSTAL NU IESEA NICIODATA. Toate trei definitiile de pana acum citeau
--     `shipping_address->>'postcode'`, cheie care nu exista pe niciun rand (0 din
--     550 pe productie, 0 din 540 pe demo). Checkout-ul scrie `postal_code` (189
--     pe productie) si, mai vechi, `postalCode` (74).
--  2. O FACTURA STORNATA APAREA CA VALABILA. Stornarea NU goleste numarul
--     facturii, deci orice regula care judeca dupa `*_invoice_number is not null`
--     arata un document anulat drept factura. Pe productie: 25 SmartBill + 3 fGO
--     pe comenzi de vitrina.
--  3. UN DOCUMENT DE TEST APAREA CA FACTURA. fGO in sandbox emite PDF-uri valide,
--     cu serie si numar, pe `testuat.fgo.ro`; 2 comenzi de vitrina pe productie au
--     numai asa ceva.
--  4. Liniile nu aveau imagine, legatura la produs, personalizare sau defalcarea
--     pretului; livrarea nu deosebea ridicarea personala si nu avea eticheta
--     aleasa la checkout; firma n-avea sediul; plata n-avea starea.
--
-- ⚠⚠ REGULA DOCUMENTULUI E SCRISA O SINGURA DATA, in `privat.cont_documentul_
-- comenzii`, si o folosesc si comanda, si lista, si facturile, si rezumatul. Doua
-- copii ar fi ajuns sa spuna doua lucruri despre aceeasi comanda.
--
-- ⚠⚠ VEDEREA REDUSA ramane numar, data, stare, total si linii. In linii intra si
-- imaginea si legatura produsului (catalogul e public), dar PERSONALIZAREA si
-- DEFALCAREA sunt imbracate in `case when l.vedere = 'intreaga'`: textul poate fi
-- personal (dedicatii, nume). `regulile-contului.test.ts` cere asta pe sursa.
--
-- ⚠ `drop` + `create` pentru cele trei functii al caror tip intors se schimba
-- (Postgres ar da `42P13`), cu granturile refacute si verificate la final.

-- ═══ 1. Documentul de test ════════════════════════════════════════════════

/*
  ⚠ COPIA SQL a lui `GAZDE_DE_TEST` din `src/lib/billing/factura-comenzii.ts`.
  Doua copii ale aceleiasi liste se pot desparti, deci o proba citeste migratia
  si o compara cu constanta (`regulile-contului.test.ts`). Se potriveste ca
  `eDocumentDeTest`: gazda oriunde in adresa, fara majuscule.
*/
create or replace function privat.cont_e_document_de_test(p_adresa text)
returns boolean
language sql immutable set search_path = '' as $fn$
  select exists (
    select 1
      from unnest(array['testuat.fgo.ro']) as g(gazda)
     where position(g.gazda in lower(coalesce(p_adresa, ''))) > 0
  );
$fn$;

-- ═══ 2. Documentul fiscal al comenzii ════════════════════════════════════

/*
  Documentul VIU al comenzii, sau NULL cand nu exista unul fiscal.

  ⚠ Prioritatea e cea din `invoice-auto.actions.ts`: SmartBill, Oblio, fGO. Un
  document de test se SARE, nu opreste cautarea: pe productie exista o comanda cu
  SmartBill viu SI fGO de test stornat, iar acolo trebuie sa iasa SmartBill.

  ⚠ `stornata` vine din prezenta numarului de storno, nu din golirea facturii:
  stornarea lasa numarul facturii pe rand (smartbill.actions.ts, storno), iar
  reemiterea goleste coloanele de storno. Deci randul tine documentul VIU si
  stornarea lui, nu istoria de dinainte de o reemitere; asta nu se promite.

  ⚠ `emisa_la` se ia din registrul de operatii, NUMAI la SmartBill si Oblio: acolo
  data trimisa furnizorului e chiar ziua UTC a crearii randului, deci se potriveste
  cu hartia. La fGO data o pune furnizorul, deci ramane NULL; la fel acolo unde
  registrul n-are rand (el exista abia din 20.08.2026). Ecranul nu ghiceste.

  ⚠ Nu iese NICIO adresa de furnizor: nici `*_url`, nici `*_link`. PDF-ul se aduce
  pe server, prin `/api/cont/factura`.
*/
create or replace function privat.cont_documentul_comenzii(o public.orders)
returns jsonb
language sql stable set search_path = '' as $fn$
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
    else null
  end;
$fn$;

-- ═══ 3. Personalizarea si defalcarea unei linii ══════════════════════════

/*
  Personalizarea unei linii, ca text, pentru ecranul cumparatorului.

  ⚠⚠ NICIO CHEIE DE FISIER NU IESE. `customization.value` tine CHEI R2 la campurile
  de fisier, iar fisierele de dinainte de 07.09.2026 stau in galeata publica, unde
  cheia E adresa. Iese numai NUMARUL fisierelor. Un sir care arata a adresa sau a
  cheie (`http...`, `products/customizations/...`) e tratat tot ca fisier, chiar
  daca tipul campului n-o spune.

  Forma: [{eticheta, valoare, fisiere}], in ordinea din jsonb, aceeasi pe care o
  vede emailul cand parcurge obiectul.
*/
create or replace function privat.cont_personalizarea_liniei(p_linie jsonb)
returns jsonb
language sql immutable set search_path = '' as $fn$
  select case when jsonb_typeof(p_linie->'customization') = 'object' then (
    select jsonb_agg(jsonb_build_object(
             'eticheta', coalesce(nullif(btrim(e.intrare->>'label'), ''), 'Personalizare'),
             'valoare', case when f.fisier then null else f.text end,
             'fisiere', case when f.fisier then f.cate else null end
           ) order by e.ord)
      from jsonb_each(p_linie->'customization') with ordinality as e(cheie, intrare, ord)
      cross join lateral (
        select
          coalesce(e.intrare->>'type', '') in ('image', 'fisier')
            or jsonb_typeof(e.intrare->'value') = 'array'
            or coalesce(e.intrare->>'value', '') ~* '^(https?://|products/customizations/)' as fisier,
          case
            when jsonb_typeof(e.intrare->'value') = 'array' then jsonb_array_length(e.intrare->'value')
            when nullif(btrim(coalesce(e.intrare->>'value', '')), '') is null then 0
            else 1
          end as cate,
          case
            when jsonb_typeof(e.intrare->'value') in ('string', 'number', 'boolean')
              then nullif(btrim(e.intrare->>'value'), '')
          end as text
      ) f
     where jsonb_typeof(e.intrare) = 'object'
       and ((f.fisier and f.cate > 0) or (not f.fisier and f.text is not null))
  ) end;
$fn$;

/*
  Cum s-a facut pretul unei linii personalizate (pret pe suprafata, rama, lac).
  Numai cheile cunoscute, cu `suma` numai cand e numar.
*/
create or replace function privat.cont_defalcarea_liniei(p_linie jsonb)
returns jsonb
language sql immutable set search_path = '' as $fn$
  select case when jsonb_typeof(p_linie->'personalizare'->'defalcare') = 'array' then (
    select jsonb_agg(jsonb_build_object(
             'eticheta', nullif(btrim(d.parte->>'eticheta'), ''),
             'detaliu', nullif(btrim(d.parte->>'detaliu'), ''),
             'suma', case when jsonb_typeof(d.parte->'suma') = 'number' then d.parte->'suma' end
           ) order by d.ord)
      from jsonb_array_elements(p_linie->'personalizare'->'defalcare') with ordinality as d(parte, ord)
     where jsonb_typeof(d.parte) = 'object'
  ) end;
$fn$;

-- ═══ 4. O comanda, cu toate detaliile ════════════════════════════════════

drop function if exists public.cont_comanda_mea(uuid, uuid, uuid);

create function public.cont_comanda_mea(
  p_business uuid, p_cont uuid, p_order uuid
) returns table (
  order_id uuid, numar text, creata_la timestamptz, stare text, incasata boolean,
  metoda_plata text, subtotal numeric, transport numeric, reducere numeric,
  taxa_ramburs numeric, total numeric, linii jsonb, livrare jsonb,
  firma jsonb, factura jsonb, curier text, awb text, urmarire text, vedere text,
  reducere_card numeric, reducere_ramburs numeric, cod_reducere text,
  tva numeric, cota_tva numeric, regim_tva boolean,
  stare_plata text, economie_oferte numeric, detalii text, awb_emis_la timestamptz
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
    case when l.vedere = 'intreaga' then awb.emis_la else null end
  from privat.cont_comanda l
  join public.orders o on o.id = l.order_id and o.business_id = l.business_id
  left join lateral (
    select v.curier, v.awb, v.url, v.emis_la
      from (values
        ('cargus', o.cargus_awb_number, null::text, o.cargus_awb_at),
        ('colete', o.colete_awb_number, null::text, o.colete_awb_at),
        ('dhl', o.dhl_awb_number, o.dhl_tracking_url, o.dhl_awb_at),
        ('dpd', o.dpd_awb_number, case when o.dpd_awb_number is not null then 'https://tracking.dpd.ro/?shipmentNumber=' || o.dpd_awb_number else null end, o.dpd_awb_at),
        ('ecolet', o.ecolet_awb_number, null::text, o.ecolet_awb_at),
        ('fancourier', o.fan_courier_awb_number, null::text, o.fan_courier_awb_at),
        ('fedex', o.fedex_awb_number, o.fedex_tracking_url, o.fedex_awb_at),
        ('gls', o.gls_awb_number, null::text, o.gls_awb_at),
        ('innoship', o.innoship_awb_number, o.innoship_track_url, o.innoship_awb_at),
        ('packeta', o.packeta_packet_id, null::text, o.packeta_awb_at),
        ('pallex', o.pallex_awb_number, null::text, o.pallex_awb_at),
        ('posta', o.posta_awb_number, null::text, o.posta_awb_at),
        ('sameday', o.sameday_awb_number, null::text, o.sameday_awb_at),
        ('shipo', o.shipo_awb_number, o.shipo_tracking_url, o.shipo_awb_at),
        ('smartship', o.smartship_awb_number, o.smartship_tracking_url, o.smartship_awb_at),
        ('ups', o.ups_awb_number, o.ups_tracking_url, o.ups_awb_at),
        ('woot', o.woot_awb_number, null::text, o.woot_awb_at)
      ) as v(curier, awb, url, emis_la)
     where v.awb is not null
     limit 1
  ) awb on true
  where l.business_id = p_business and l.cont_id = p_cont and l.order_id = p_order;
$fn$;

-- ═══ 5. Lista comenzilor ═════════════════════════════════════════════════

drop function if exists public.cont_comenzile_mele(uuid, uuid, integer, integer);

/*
  ⚠ `bucati` era numarul de LINII, cu tot cu extraoptiuni si cadouri, iar ecranul
  scria „N produse". Acum e suma cantitatilor fara extraoptiuni, cu o conversie
  care nu arunca: o cantitate scrisa ciudat ar fi rupt toata lista.

  `miniaturi`: primele patru linii de marfa, cu imaginea din catalog (sau NULL) si
  numele, ca un card sa arate a comanda, nu a numar.
*/
create function public.cont_comenzile_mele(
  p_business uuid,
  p_cont uuid,
  p_limita integer default 20,
  p_decalaj integer default 0
) returns table (
  order_id uuid,
  numar text,
  creata_la timestamptz,
  stare text,
  incasata boolean,
  total numeric,
  bucati bigint,
  vedere text,
  total_randuri bigint,
  miniaturi jsonb,
  produse integer,
  are_factura boolean
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id,
    o.order_number,
    o.created_at,
    o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    o.total,
    m.bucati,
    l.vedere,
    count(*) over (),
    m.miniaturi,
    m.produse,
    case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) is not null else false end
  from privat.cont_comanda l
  join public.orders o
    on o.id = l.order_id
   and o.business_id = l.business_id
  cross join lateral (
    select
      coalesce(sum(
        case when x.li->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' then (x.li->>'quantity')::numeric else 0 end
      ) filter (where not x.extra), 0)::bigint as bucati,
      (count(*) filter (where not x.extra))::integer as produse,
      coalesce((
        select jsonb_agg(jsonb_build_object('nume', y.li->>'name', 'imagine', y.imagine) order by y.ord)
          from (
            select z.li, z.ord,
                   (select case when jsonb_typeof(p.images->0) = 'string' then p.images->>0 end
                      from public.products p
                     where p.business_id = o.business_id
                       and p.id = case
                                    when coalesce(z.li->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                      then (z.li->>'product_id')::uuid
                                  end) as imagine
              from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as z(li, ord)
             where not (coalesce(z.li->>'product_id', '') like 'extra\_%')
             order by z.ord
             limit 4
          ) y
      ), '[]'::jsonb) as miniaturi
    from (
      select t.li, coalesce(t.li->>'product_id', '') like 'extra\_%' as extra
        from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as t(li)
    ) x
  ) m
  where l.business_id = p_business
    and l.cont_id = p_cont
  /* ⚠ Departajator pe `id`: fara el, doua comenzi din aceeasi secunda pot aparea
     pe doua pagini deodata si alta poate lipsi. */
  order by o.created_at desc, o.id desc
  limit greatest(1, least(100, coalesce(p_limita, 20)))
  offset greatest(0, coalesce(p_decalaj, 0));
$fn$;

-- ═══ 6. Facturile ════════════════════════════════════════════════════════

/*
  Facturile cumparatorului, pentru pagina „Facturi".

  ⚠⚠ `l.vedere = 'intreaga'` STA IN WHERE, nu intr-un `case`: o comanda legata
  doar pe numarul ei nu produce deloc rand, deci nu scurge nici numarul facturii.
  ⚠ Regula de marketplace se REPETA aici, in forma cu `coalesce`, desi legarea o
  aplica deja: e aparare pentru usile de revendicare de mai tarziu, iar forma fara
  `coalesce` ar arunca tacut comenzile cu `order_source` NULL.
  ⚠ Suma documentului nu e stocata nicaieri; se da totalul COMENZII, iar ecranul
  il numeste asa.
*/
create or replace function public.cont_facturile_mele(
  p_business uuid,
  p_cont uuid,
  p_limita integer default 20,
  p_decalaj integer default 0
) returns table (
  order_id uuid,
  numar_comanda text,
  comanda_la timestamptz,
  total_comanda numeric,
  stare_comanda text,
  document jsonb,
  firma_denumire text,
  firma_cui text,
  total_randuri bigint
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id,
    o.order_number,
    o.created_at,
    o.total,
    o.status,
    d.doc,
    nullif(btrim(coalesce(o.billing_company->>'company_name', '')), ''),
    nullif(btrim(coalesce(o.billing_company->>'cui', '')), ''),
    count(*) over ()
  from privat.cont_comanda l
  join public.orders o on o.id = l.order_id and o.business_id = l.business_id
  cross join lateral (select privat.cont_documentul_comenzii(o) as doc) d
  where l.business_id = p_business
    and l.cont_id = p_cont
    and l.vedere = 'intreaga'
    and not coalesce(o.order_source ? 'marketplace', false)
    and d.doc is not null
  order by o.created_at desc, o.id desc
  limit greatest(1, least(100, coalesce(p_limita, 20)))
  offset greatest(0, coalesce(p_decalaj, 0));
$fn$;

-- ═══ 7. Rezumatul contului (meniul si pagina de start) ═══════════════════

/*
  Cele patru numere din meniu, intr-un singur drum.

  ⚠ `facturi` foloseste EXACT predicatul lui `cont_facturile_mele`: altfel meniul
  ar spune „3 facturi" peste o pagina cu doua. La fel `retururi` si
  `cont_retururile_mele`.
*/
create or replace function public.cont_rezumat(p_business uuid, p_cont uuid)
returns table (comenzi bigint, in_curs bigint, facturi bigint, retururi bigint)
language sql stable security definer set search_path = '' as $fn$
  select
    (select count(*)
       from privat.cont_comanda l
      where l.business_id = p_business and l.cont_id = p_cont),
    (select count(*)
       from privat.cont_comanda l
       join public.orders o on o.id = l.order_id and o.business_id = l.business_id
      where l.business_id = p_business and l.cont_id = p_cont
        and o.status in ('pending', 'confirmed', 'processing', 'shipped')),
    (select count(*)
       from privat.cont_comanda l
       join public.orders o on o.id = l.order_id and o.business_id = l.business_id
      where l.business_id = p_business and l.cont_id = p_cont
        and l.vedere = 'intreaga'
        and not coalesce(o.order_source ? 'marketplace', false)
        and privat.cont_documentul_comenzii(o) is not null),
    (select count(*)
       from public.return_requests r
       join privat.cont_comanda l on l.order_id = r.order_id and l.business_id = r.business_id
      where r.business_id = p_business and l.cont_id = p_cont and l.vedere = 'intreaga');
$fn$;

-- ═══ 8. Retururile, legate de comanda ════════════════════════════════════

drop function if exists public.cont_retururile_mele(uuid, uuid);

/*
  ⚠ NOU: `l.vedere = 'intreaga'`. Pana acum un retur pe o comanda legata doar pe
  numarul ei aratat motivul si IBAN-ul mascat, adica exact ce vederea redusa
  ascunde. Azi nu exista randuri `redusa`, deci nu s-a scurs nimic; e o usa
  inchisa inainte sa se deschida revendicarea pe numar.
  ⚠ `order_id` iese, ca returul sa duca la comanda lui, iar produsele cu
  cantitatile lor (`return_requests.items`: name, price, product_id, quantity).
*/
create function public.cont_retururile_mele(
  p_business uuid, p_cont uuid
) returns table (
  retur_id uuid, order_id uuid, numar_comanda text, creat_la timestamptz, stare text,
  motiv text, fel_restituire text, iban_mascat text, bucati bigint, produse jsonb
)
language sql stable security definer set search_path = '' as $fn$
  select
    r.id, r.order_id, r.order_number, r.created_at, r.status,
    r.reason, r.refund_method,
    /*
      ⚠⚠ IBAN-UL SE MASCHEAZA IN SQL, NU IN COMPONENTA. O mascare facuta la
      randare se ocoleste de a doua randare, de un export, de o proba scrisa
      grabit sau de urmatorul ecran care citeste aceeasi functie. Aici, valoarea
      intreaga nu iese niciodata din baza.
    */
    case
      when nullif(btrim(coalesce(r.refund_iban, '')), '') is null then null
      else repeat('*', greatest(0, length(btrim(r.refund_iban)) - 4)) || right(btrim(r.refund_iban), 4)
    end,
    coalesce((
      select sum(case when e.x->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' then (e.x->>'quantity')::numeric else 0 end)
        from jsonb_array_elements(case when jsonb_typeof(r.items) = 'array' then r.items else '[]'::jsonb end) as e(x)
    ), 0)::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object('nume', e.x->>'name', 'cantitate', e.x->>'quantity') order by e.ord)
        from jsonb_array_elements(case when jsonb_typeof(r.items) = 'array' then r.items else '[]'::jsonb end)
             with ordinality as e(x, ord)
    ), '[]'::jsonb)
  from public.return_requests r
  join privat.cont_comanda l
    on l.order_id = r.order_id
   and l.business_id = r.business_id
  where r.business_id = p_business
    and l.cont_id = p_cont
    and l.vedere = 'intreaga'
  order by r.created_at desc;
$fn$;

comment on function public.cont_retururile_mele(uuid, uuid) is
  'Retururile cumparatorului, legate prin comanda, numai pe vederea intreaga. ⚠ `return_requests.order_id` e NULABIL si `on delete set null`: un retur a carui comanda a fost STEARSA de comerciant nu mai apare aici, desi cererea lui traieste in panou si poarta IBAN-ul. E o gaura veche a schemei, nu una adusa de conturi, si e scrisa in plan la datorii.';

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE, refacute dupa `drop` si verificate
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function privat.cont_e_document_de_test(text)         from public, anon, authenticated;
revoke all on function privat.cont_documentul_comenzii(public.orders) from public, anon, authenticated;
revoke all on function privat.cont_personalizarea_liniei(jsonb)     from public, anon, authenticated;
revoke all on function privat.cont_defalcarea_liniei(jsonb)         from public, anon, authenticated;

revoke all on function public.cont_comanda_mea(uuid, uuid, uuid)                    from public, anon, authenticated;
revoke all on function public.cont_comenzile_mele(uuid, uuid, integer, integer)     from public, anon, authenticated;
revoke all on function public.cont_facturile_mele(uuid, uuid, integer, integer)     from public, anon, authenticated;
revoke all on function public.cont_rezumat(uuid, uuid)                              from public, anon, authenticated;
revoke all on function public.cont_retururile_mele(uuid, uuid)                      from public, anon, authenticated;

grant execute on function public.cont_comanda_mea(uuid, uuid, uuid)                to service_role;
grant execute on function public.cont_comenzile_mele(uuid, uuid, integer, integer) to service_role;
grant execute on function public.cont_facturile_mele(uuid, uuid, integer, integer) to service_role;
grant execute on function public.cont_rezumat(uuid, uuid)                          to service_role;
grant execute on function public.cont_retururile_mele(uuid, uuid)                  to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_comanda_mea(uuid, uuid, uuid)',
    'public.cont_comenzile_mele(uuid, uuid, integer, integer)',
    'public.cont_facturile_mele(uuid, uuid, integer, integer)',
    'public.cont_rezumat(uuid, uuid)',
    'public.cont_retururile_mele(uuid, uuid)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
  foreach f in array array[
    'privat.cont_e_document_de_test(text)',
    'privat.cont_documentul_comenzii(public.orders)',
    'privat.cont_personalizarea_liniei(jsonb)',
    'privat.cont_defalcarea_liniei(jsonb)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
