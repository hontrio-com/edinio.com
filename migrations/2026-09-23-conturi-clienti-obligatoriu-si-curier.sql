-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 12: contul obligatoriu la comanda, legarea la
-- plasare, curierul real al coletului                          (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar pe 23.09.2026, si SCHIMBA H1: comerciantul alege din Setari
-- daca e OBLIGATORIU sa ai cont ca sa comanzi. Plus: „rezolva tot ce mai e de
-- rezolvat".
--
--  1. TEMEI NOU, 'plasata-in-cont'. Pana acum o comanda intra in cont NUMAI la
--     urmatoarea intrare, prin `cont_maturare`, si numai daca emailul ei era un
--     contact verificat. Cu contul obligatoriu, omul ar fi comandat si ar fi gasit
--     contul gol. Niciuna din cele patru valori vechi nu spune adevarul pentru „a
--     plasat-o chiar el, in sesiunea lui".
--  2. `cont_leaga_comanda_plasata`: legarea imediata, dupa insert, cu vedere
--     INTREAGA (omul si-a scris singur datele, deci nu exista oracolul care
--     justifica vederea redusa).
--  3. `cont_buget_email_epuizat`: cu contul obligatoriu, bugetul zilnic de coduri
--     devine intrerupatorul vanzarilor, iar un strain il poate arde de pe cateva
--     IP-uri. Cand e epuizat, poarta de la comanda cade DESCHIS (comanda ca
--     vizitator) pana la miezul noptii. Numaratoarea e EXACT a lui `cont_cere_cod`.
--  4. `cont_intrari_recente`: contul obligatoriu se poate porni numai dupa ce
--     cineva a intrat macar o data in cont pe magazinul asta in ultimele 30 de
--     zile. Asta dovedeste ca domeniul si emailul cu cod chiar merg, inainte ca
--     vanzarile sa atarne de ele.
--  5. `cont_comanda_mea` intoarce `curier_real`. Masurat pe productie: 274 din
--     280 de AWB-uri de vitrina sunt Woot, iar 273 dintre ele sunt DPD dedesubt,
--     cu acelasi numar (11 cifre, prefix 81, ca AWB-urile DPD emise direct).
--     Curierul real vine din prefixul lui `woot_service_name`, pe AMBELE
--     separatoare masurate (semnul lung, 218 randuri, si punctul median, 55).
--     ⚠ Tiparul DPD iese din SQL: statea in doua locuri, iar cel din SQL castiga
--     mereu, deci o corectura in TypeScript nu s-ar fi vazut. Adresa se compune
--     acum NUMAI in `src/lib/cont/urmarire.ts`.

-- ═══ 1. Temeiul nou ═══════════════════════════════════════════════════════

alter table privat.cont_comanda drop constraint if exists cont_comanda_temei_check;
alter table privat.cont_comanda add constraint cont_comanda_temei_check
  check (temei in ('jeton-email', 'contact-verificat', 'numar-plus-contact', 'legat-de-comerciant', 'plasata-in-cont'));

-- ═══ 2. Legarea la plasare ════════════════════════════════════════════════

/*
  Leaga de cont comanda pe care omul logat tocmai a plasat-o.

  ⚠ Se cheama DUPA insert si e best-effort: daca intoarce fals sau cade, comanda
  exista oricum, iar un refuz trimis omului ar fi dus la retrimitere si la dubluri.
  ⚠ Verifica singura ce cheile straine nu verifica: `cont_comanda.business_id` NU e
  legat de `orders.business_id`, deci aici se cere ca amandoua sa fie magazinul
  dat. Plus: comanda e de vitrina (regula de marketplace cu `coalesce`), e
  proaspata (10 minute: o fereastra ingusta, ca functia sa nu devina o usa de
  lipit comenzi vechi), iar contul e viu.
  ⚠ `on conflict do nothing`: o comanda are cel mult UN proprietar.
*/
create or replace function public.cont_leaga_comanda_plasata(
  p_business uuid, p_cont uuid, p_order uuid
) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_scrise integer;
begin
  if not exists (
    select 1 from public.orders o
     where o.id = p_order and o.business_id = p_business
       and not coalesce(o.order_source ? 'marketplace', false)
       and o.created_at > now() - interval '10 minutes'
  ) then
    return false;
  end if;

  if not exists (
    select 1 from privat.cont_cumparator c
     where c.id = p_cont and c.business_id = p_business and c.sters_la is null
  ) then
    return false;
  end if;

  insert into privat.cont_comanda (order_id, business_id, cont_id, temei, vedere)
  values (p_order, p_business, p_cont, 'plasata-in-cont', 'intreaga')
  on conflict (order_id) do nothing;
  get diagnostics v_scrise = row_count;

  if v_scrise > 0 then
    /* Numele contului, din comanda, numai daca e inca gol (ca la maturare). */
    update privat.cont_cumparator c
       set nume = coalesce((select btrim(o.customer_name) from public.orders o where o.id = p_order), '')
     where c.id = p_cont and c.business_id = p_business and btrim(c.nume) = '';

    insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
    values (p_business, p_cont, 'comanda-plasata', jsonb_build_object('comanda', p_order));
  end if;

  return v_scrise > 0;
end $fn$;

-- ═══ 3. Bugetul zilnic de coduri pe email ═════════════════════════════════

/*
  ⚠ Aceeasi numaratoare ca in `cont_cere_cod`: coduri de email ale magazinului,
  de la inceputul zilei ROMANESTI. Plafonul se citeste cu un cast care nu arunca:
  valoarea poate fi scrisa direct de comerciant, iar un sir nenumeric ar fi rupt
  comanda, nu doar intrarea.
*/
create or replace function public.cont_buget_email_epuizat(p_business uuid)
returns boolean
language sql stable security definer set search_path = '' as $fn$
  select coalesce((
           select count(*)
             from privat.cont_cod x
            where x.business_id = p_business and x.fel = 'email'
              and x.creat_la >= privat.cont_inceputul_zilei()
         ), 0)
         >= coalesce((
           select case
                    when (st.cont_client_config->>'buget_email_zilnic') ~ '^[0-9]{1,5}$'
                      then (st.cont_client_config->>'buget_email_zilnic')::integer
                  end
             from privat.store_settings st
            where st.business_id = p_business
         ), 300);
$fn$;

-- ═══ 4. Intrari recente ═══════════════════════════════════════════════════

create or replace function public.cont_intrari_recente(p_business uuid)
returns integer
language sql stable security definer set search_path = '' as $fn$
  select count(*)::integer
    from privat.cont_jurnal j
   where j.business_id = p_business
     and j.fapta = 'intrare'
     and j.creat_la > now() - interval '30 days';
$fn$;

-- ═══ 5. Comanda, cu curierul real ═════════════════════════════════════════

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
  stare_plata text, economie_oferte numeric, detalii text, awb_emis_la timestamptz,
  curier_real text
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
        ('dhl', o.dhl_awb_number, o.dhl_tracking_url, o.dhl_awb_at, null::text),
        ('dpd', o.dpd_awb_number, null::text, o.dpd_awb_at, null::text),
        ('ecolet', o.ecolet_awb_number, null::text, o.ecolet_awb_at, null::text),
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

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE, refacute dupa `drop` si verificate
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.cont_comanda_mea(uuid, uuid, uuid)              from public, anon, authenticated;
revoke all on function public.cont_leaga_comanda_plasata(uuid, uuid, uuid)    from public, anon, authenticated;
revoke all on function public.cont_buget_email_epuizat(uuid)                  from public, anon, authenticated;
revoke all on function public.cont_intrari_recente(uuid)                      from public, anon, authenticated;

grant execute on function public.cont_comanda_mea(uuid, uuid, uuid)           to service_role;
grant execute on function public.cont_leaga_comanda_plasata(uuid, uuid, uuid) to service_role;
grant execute on function public.cont_buget_email_epuizat(uuid)               to service_role;
grant execute on function public.cont_intrari_recente(uuid)                   to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_comanda_mea(uuid, uuid, uuid)',
    'public.cont_leaga_comanda_plasata(uuid, uuid, uuid)',
    'public.cont_buget_email_epuizat(uuid)',
    'public.cont_intrari_recente(uuid)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
end $$;

comment on column privat.store_settings.cont_client_config is
  'Conturile de client ale magazinului. Chei plate: enabled, obligatoriu, buget_email_zilnic, buget_sms_zilnic, buton_antet, buton_afisare, buton_iconita, buton_text, intrare_titlu, intrare_text, intrare_avantaje. Se curata la FIECARE citire (src/lib/cont/config.ts): comerciantul isi poate scrie randul direct, deci valoarea nu e de incredere.';

notify pgrst, 'reload schema';
