-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 10: toti banii comenzii, pe nume  (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `cont_comanda_mea` intorcea subtotalul, transportul, reducerea de cupon si
-- taxa de ramburs, dar NU si reducerea pentru plata cu cardul, reducerea pentru
-- ramburs, TVA-ul si regimul de pret inghetat pe comanda. Ecranul punea ce nu se
-- explica pe un rand „Alte ajustari”, deci coloana se aduna, dar banii erau fara
-- nume.
--
-- Masurat pe PRODUCTIE, doar citire: din 344 de comenzi de vitrina, 41 ar fi
-- aparut in cont cu „Alte ajustari”. 38 sunt reduceri pentru plata cu cardul (la
-- trei magazine), una e TVA adaugat peste pret (regim inghetat `false`), iar
-- doua sunt comenzile Medclean din 9 iunie, cu TVA-ul adunat de doua ori in
-- total (defectul vechi, scris in `src/lib/orders/totals-box.ts`). Pe demo, trei
-- din cele sase comenzi ale contului de proba aveau reducere pentru card.
--
-- Acelasi cumparator primise emailul de confirmare cu „Reducere plata cu
-- cardul", adica acelasi ban cu alt nume. Acum ecranul face randurile cu chiar
-- functia emailului (`randuriDeBani`), si are ce sa-i dea.
--
-- ⚠ Campurile noi stau la COADA listei si sunt toate imbracate in
-- `case when l.vedere = 'intreaga'`: vederea redusa ramane numar, data, linii,
-- total, stare. `regulile-contului.test.ts` citeste ULTIMA definitie a functiei
-- si cere asta pentru fiecare camp de bani.
--
-- ⚠ `offer_discount_amount` NU intra: reducerea din oferta e deja scazuta in
-- pretul liniilor (masurat pe demo, #1356: liniile dau exact subtotalul, iar
-- totalul e subtotal plus taxa de ramburs). Nici caseta din panou nu o scade.
--
-- ⚠ `drop` + `create`, nu `create or replace`: lista de coloane intoarse s-a
-- schimbat, deci Postgres ar da `42P13`. Dupa `drop` ACL-ul dispare, deci
-- granturile se refac de mana si se verifica la final.

drop function if exists public.cont_comanda_mea(uuid, uuid, uuid);

create function public.cont_comanda_mea(
  p_business uuid, p_cont uuid, p_order uuid
) returns table (
  order_id uuid, numar text, creata_la timestamptz, stare text, incasata boolean,
  metoda_plata text, subtotal numeric, transport numeric, reducere numeric,
  taxa_ramburs numeric, total numeric, linii jsonb, livrare jsonb,
  firma jsonb, factura jsonb, curier text, awb text, urmarire text, vedere text,
  reducere_card numeric, reducere_ramburs numeric, cod_reducere text,
  tva numeric, cota_tva numeric, regim_tva boolean
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
      select coalesce(jsonb_agg(jsonb_build_object(
        'nume', li->>'name', 'cantitate', li->>'quantity',
        'pret', li->>'price', 'produs_id', li->>'product_id'
      ) order by ord), '[]'::jsonb)
      from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as t(li, ord)
    ),
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'nume', o.customer_name, 'telefon', o.customer_phone, 'email', o.customer_email,
      'adresa', o.shipping_address->>'address',
      'adresa_acasa', o.shipping_address->>'home_address',
      'oras', o.shipping_address->>'city', 'judet', o.shipping_address->>'county',
      'cod_postal', o.shipping_address->>'postcode',
      'fel_livrare', o.shipping_address->>'delivery_type',
      'punct', o.shipping_address->>'locker_name'
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'denumire', o.billing_company->>'company_name',
      'cui', o.billing_company->>'cui',
      'reg_com', o.billing_company->>'reg_com'
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then (
      case
        when o.smartbill_invoice_number is not null then jsonb_build_object('casa','smartbill','serie',o.smartbill_invoice_series,'numar',o.smartbill_invoice_number)
        when o.oblio_invoice_number is not null    then jsonb_build_object('casa','oblio','serie',o.oblio_invoice_series,'numar',o.oblio_invoice_number)
        when o.fgo_invoice_number is not null      then jsonb_build_object('casa','fgo','serie',o.fgo_invoice_series,'numar',o.fgo_invoice_number)
        else null
      end
    ) else null::jsonb end,
    case when l.vedere = 'intreaga' then awb.curier else null end,
    case when l.vedere = 'intreaga' then awb.awb else null end,
    case when l.vedere = 'intreaga' then awb.url else null end,
    l.vedere,
    case when l.vedere = 'intreaga' then o.card_discount_amount else null end,
    case when l.vedere = 'intreaga' then o.cod_discount_amount else null end,
    case when l.vedere = 'intreaga' then o.discount_code else null end,
    case when l.vedere = 'intreaga' then o.vat_amount else null end,
    case when l.vedere = 'intreaga' then o.vat_rate else null end,
    /* ⚠ Regimul INGHETAT pe comanda, nu setarea de azi a magazinului. NULL la
       comenzile de dinainte de coloana; atunci ecranul cade pe setarea de azi,
       exact ordinea din `invoiceVat`. */
    case when l.vedere = 'intreaga' then o.prices_include_vat else null end
  from privat.cont_comanda l
  join public.orders o on o.id = l.order_id and o.business_id = l.business_id
  left join lateral (
    select v.curier, v.awb, v.url
      from (values
        ('cargus', o.cargus_awb_number, null::text),
        ('colete', o.colete_awb_number, null::text),
        ('dhl', o.dhl_awb_number, o.dhl_tracking_url),
        ('dpd', o.dpd_awb_number, case when o.dpd_awb_number is not null then 'https://tracking.dpd.ro/?shipmentNumber=' || o.dpd_awb_number else null end),
        ('ecolet', o.ecolet_awb_number, null::text),
        ('fancourier', o.fan_courier_awb_number, null::text),
        ('fedex', o.fedex_awb_number, o.fedex_tracking_url),
        ('gls', o.gls_awb_number, null::text),
        ('innoship', o.innoship_awb_number, o.innoship_track_url),
        ('packeta', o.packeta_packet_id, null::text),
        ('pallex', o.pallex_awb_number, null::text),
        ('posta', o.posta_awb_number, null::text),
        ('sameday', o.sameday_awb_number, null::text),
        ('shipo', o.shipo_awb_number, o.shipo_tracking_url),
        ('smartship', o.smartship_awb_number, o.smartship_tracking_url),
        ('ups', o.ups_awb_number, o.ups_tracking_url),
        ('woot', o.woot_awb_number, null::text)
      ) as v(curier, awb, url)
     where v.awb is not null
     limit 1
  ) awb on true
  where l.business_id = p_business and l.cont_id = p_cont and l.order_id = p_order;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE, refacute dupa `drop`
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.cont_comanda_mea(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cont_comanda_mea(uuid, uuid, uuid) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.cont_comanda_mea(uuid, uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cont_comanda_mea(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'anon sau authenticated poate chema cont_comanda_mea';
  end if;
  if not has_function_privilege('service_role', 'public.cont_comanda_mea(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'service_role NU poate chema cont_comanda_mea';
  end if;
end $$;

notify pgrst, 'reload schema';
