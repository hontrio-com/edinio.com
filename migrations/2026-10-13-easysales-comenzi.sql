-- easySales, COMENZILE (E2) - 13.10.2026. Dupa `2026-10-13-easysales-fundatia.sql`.
--
-- Comenzile vitrinei pleaca in easySales si se proceseaza acolo (AWB, factura); starea, AWB-ul si
-- factura se intorc in Edinio si in contul cumparatorului. Planul: `docs/marketplace/EASYSALES-PLAN.md`, §5.1-5.3.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY: pagina comenzii si contul cumparatorului citesc `easysales_comenzi`.
--
-- Ce atinge:
--   1. `easysales_comenzi`, legatura comanda Edinio <-> comanda lor, cu starea trimiterii;
--   2. STAMPILA, BEFORE INSERT pe `orders`: `order_source.easysales` fixeaza un singur emitent de
--      factura si AWB, chiar din clipa inserarii;
--   3. COADA, AFTER INSERT OR UPDATE OF status, payment_status: randul de legatura si trimiterea;
--   4. `cont_comanda_mea`: AWB-ul easySales in contul cumparatorului, cu curierul real;
--   5. `cont_anuleaza_comanda`: refuzul `procesata-extern` pentru comenzile procesate la ei;
--   6. `easysales_schimba_stapanul`: „Preia in Edinio", cu `jsonb_set`, nu cu rescrierea lui `order_source`;
--   7. `easysales_plasa_legaturilor`: comenzile stampilate fara rand de legatura (declansatorul cozii a
--      cazut) primesc randul si trimiterea, cu aceeasi regula ca declansatorul;
--   8. `easysales_stampileaza_existenta`: comenzile deschise dinaintea activarii, la cererea omului, cu
--      ACEEASI regula ca stampila (`easysales_se_stampileaza`, folosita de amandoua).
--
-- Nicio coloana noua pe `orders`.

-- ---------------------------------------------------------------------------
-- 1. Legatura comenzilor
-- ---------------------------------------------------------------------------
-- `directie`: `iesire` = comanda vitrinei trimisa la ei; `intrare` = comanda altui canal adusa
-- de la ei (E4). `es_order_id` e INGHETAT inaintea primului apel: din `easysales_id_seq`, unic intre
-- magazine. `stapan` spune cine proceseaza comanda; `edinio` dupa „Preia in Edinio".
-- ⚠ `raspuns_brut` tine numai cheile structurale ale unui raspuns-problema (mesaj, erori), NICIODATA
-- datele cumparatorului: stergerea datelor la cerere n-are ce cauta aici.

create table if not exists public.easysales_comenzi (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  order_uuid uuid,
  directie text not null default 'iesire',
  es_order_id text not null,
  es_internal_id text,
  es_display_id text,
  stapan text not null default 'easysales',
  stare text not null default 'de_trimis',
  motiv text,
  incercari integer not null default 0,
  next_retry_at timestamptz,
  es_status_cod integer,
  es_status_text text,
  es_custom_status jsonb,
  es_livrare_cod integer,
  es_updated_at timestamptz,
  es_anulata_la timestamptz,
  awb jsonb,
  awb_viu text,
  awb_la timestamptz,
  awb_curier text,
  facturi jsonb,
  erori jsonb,
  cancel_request text,
  canal text,
  efect text,
  raspuns_brut jsonb,
  trimisa_la timestamptz,
  citita_la timestamptz,
  ultima_veste_la timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint easysales_comenzi_cheie unique (business_id, directie, es_order_id),
  constraint easysales_comenzi_directie_check check (directie = any (array['iesire', 'intrare']::text[])),
  constraint easysales_comenzi_stapan_check check (stapan = any (array['easysales', 'edinio']::text[])),
  constraint easysales_comenzi_stare_check check (stare = any (array[
    'asteapta_plata', 'de_trimis', 'trimisa', 'necunoscuta', 'refuzata', 'respinsa_local',
    'blocata_plafon', 'abandonata', 'anulata_inainte', 'preluata_edinio', 'conflict',
    'externa', 'consumata', 'neconsumata'
  ]::text[])),
  constraint easysales_comenzi_efect_check check (efect is null or efect = any (array['umbra', 'aplicat']::text[]))
);

comment on table public.easysales_comenzi is
  'Legatura comenzilor Edinio cu easySales. iesire = comanda vitrinei trimisa la ei; intrare = comanda '
  'altui canal (E4). es_order_id e inghetat inaintea primului apel. Fara date personale: raspuns_brut '
  'tine numai mesajul si erorile unui raspuns-problema.';

-- O singura legatura de iesire pe comanda.
create unique index if not exists easysales_comenzi_iesire_idx
  on public.easysales_comenzi (order_uuid)
  where directie = 'iesire';
create unique index if not exists easysales_comenzi_internal_idx
  on public.easysales_comenzi (business_id, es_internal_id)
  where es_internal_id is not null;
create index if not exists easysales_comenzi_order_idx
  on public.easysales_comenzi (order_id);
create index if not exists easysales_comenzi_display_idx
  on public.easysales_comenzi (business_id, es_display_id)
  where es_display_id is not null;
create index if not exists easysales_comenzi_stare_idx
  on public.easysales_comenzi (business_id, stare);

create trigger set_easysales_comenzi_updated_at
  before update on public.easysales_comenzi
  for each row execute function public.set_updated_at();

alter table public.easysales_comenzi enable row level security;
create policy owner_select_easysales_comenzi on public.easysales_comenzi for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));
revoke insert, update, delete, truncate, references, trigger on table public.easysales_comenzi from anon, authenticated;
grant select on table public.easysales_comenzi to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. STAMPILA, BEFORE INSERT pe `orders`
-- ---------------------------------------------------------------------------
-- Scrie `order_source.easysales = {stapan, factura, awb, v}`, fara sa atinga celelalte chei. Cheia o
-- scrie NUMAI declansatorul: venita din afara la inserare, se scoate. Nu se stampileaza:
--   - comenzile de marketplace (un sir nevid in `marketplace`, ca `email_marketing_pune_la_coada`),
--     deci nici comenzile „ES-..." aduse de E4 (`marketplace = 'easysales'`): altfel ar face o bucla;
--   - cand magazinul n-are integrarea conectata cu comenzile pornite;
--   - moneda alta decat RON (`orders` n-are coloana de moneda: se citeste `store_settings.currency`);
--   - fara curier ales; ridicarea personala (`courier = 'pickup'`, unde `address` e a OMULUI);
--     curierul propriu (`courier = 'own'`); punctul de ridicare (`delivery_type = 'locker'`);
--   - livrarea in afara Romaniei;
--   - comenzile cu FISIERE de personalizare: operatorul easySales n-ar avea fisierele de productie.
-- ⚠ Blocul de exceptie e obligatoriu: un declansator stricat pe `orders` ar opri vanzarea.

-- Regula, intr-un singur loc: o folosesc declansatorul (la inserare) si `easysales_stampileaza_existenta`
-- (comenzile deschise trimise anume de om). Doua copii s-ar fi despartit.
create or replace function public.easysales_se_stampileaza(
  p_business uuid, p_order_source jsonb, p_shipping jsonb, p_items jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
declare
  v_cfg    jsonb;
  v_moneda text;
  v_sa     jsonb;
  v_curier text;
  v_fel    text;
  v_tara   text;
begin
  if jsonb_typeof(p_order_source -> 'marketplace') = 'string'
     and btrim(p_order_source ->> 'marketplace') <> '' then
    return false;
  end if;

  select s.easysales_config, s.currency into v_cfg, v_moneda
    from privat.store_settings s
   where s.business_id = p_business;
  if not found then
    return false;
  end if;
  if coalesce(v_cfg ->> 'connected', '') <> 'true' or coalesce(v_cfg ->> 'comenzi_active', '') <> 'true' then
    return false;
  end if;
  if upper(btrim(coalesce(v_moneda, 'RON'))) <> 'RON' then
    return false;
  end if;

  v_sa := case when jsonb_typeof(p_shipping) = 'object' then p_shipping else '{}'::jsonb end;
  v_curier := lower(btrim(coalesce(v_sa ->> 'courier', '')));
  v_fel := lower(btrim(coalesce(v_sa ->> 'delivery_type', '')));
  v_tara := upper(btrim(coalesce(v_sa ->> 'country', '')));
  if v_curier = '' or v_curier in ('pickup', 'own') then
    return false;
  end if;
  if v_fel = 'locker' then
    return false;
  end if;
  if v_tara not in ('', 'RO', 'ROU', 'ROMANIA', 'ROMÂNIA') then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) li(linie)
     cross join lateral jsonb_each(case when jsonb_typeof(li.linie -> 'customization') = 'object'
                                        then li.linie -> 'customization' else '{}'::jsonb end) e(cheie, intrare)
     where jsonb_typeof(e.intrare) = 'object'
       and (coalesce(e.intrare ->> 'type', '') in ('image', 'fisier')
            or jsonb_typeof(e.intrare -> 'value') = 'array'
            or coalesce(e.intrare ->> 'value', '') ~* '^(https?://|products/customizations/)')
  ) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.easysales_stampileaza_comanda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
begin
  if new.order_source is not null and jsonb_typeof(new.order_source) = 'object' and new.order_source ? 'easysales' then
    new.order_source := new.order_source - 'easysales';
  end if;

  if public.easysales_se_stampileaza(new.business_id, new.order_source, new.shipping_address, new.items) then
    new.order_source := coalesce(case when jsonb_typeof(new.order_source) = 'object' then new.order_source end, '{}'::jsonb)
      || jsonb_build_object('easysales', jsonb_build_object(
           'stapan', 'easysales', 'factura', 'easysales', 'awb', 'easysales', 'v', 1));
  end if;
  return new;
exception when others then
  raise warning 'easysales_stampileaza_comanda: %', sqlerrm;
  return new;
end;
$$;

create trigger easysales_stampileaza_comanda
  before insert on public.orders
  for each row execute function public.easysales_stampileaza_comanda();

-- ---------------------------------------------------------------------------
-- 3. COADA, AFTER INSERT OR UPDATE OF status, payment_status
-- ---------------------------------------------------------------------------
-- Lucreaza NUMAI pe comenzile stampilate cu `stapan = easysales` si citeste stampila din randul nou.
--   - la inserare: randul de legatura, cu `es_order_id` inghetat; `de_trimis` (ramburs) sau
--     `asteapta_plata` (plata online si transfer: pleaca dupa incasare, ca o automatizare a lor sa
--     nu emita AWB sau factura pe bani neincasati);
--   - la `payment_status -> paid`: `de_trimis`;
--   - la anulare inainte de trimitere: `anulata_inainte`; dupa trimitere, pe un drum care a ocolit
--     portile: operatia `comanda_anuleaza` in coada.
-- ⚠ O cadere aici nu opreste comanda: plasa de la 10 minute gaseste comenzile stampilate fara rand.

create or replace function public.easysales_marcheaza_comanda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_st      jsonb;
  v_ramburs boolean;
  v_id      uuid;
  v_stare   text;
  v_anulata timestamptz;
begin
  v_st := case when jsonb_typeof(new.order_source) = 'object' then new.order_source -> 'easysales' end;
  if v_st is null or jsonb_typeof(v_st) <> 'object' or coalesce(v_st ->> 'stapan', '') <> 'easysales' then
    return null;
  end if;
  v_ramburs := coalesce(nullif(lower(btrim(new.payment_method)), ''), 'cash_on_delivery') in ('cash_on_delivery', 'ramburs');

  if tg_op = 'INSERT' then
    insert into public.easysales_comenzi (business_id, order_id, order_uuid, directie, es_order_id, stare)
    values (
      new.business_id, new.id, new.id, 'iesire', nextval('public.easysales_id_seq')::text,
      case
        when new.status = 'cancelled' then 'anulata_inainte'
        when not v_ramburs and coalesce(new.payment_status, '') <> 'paid' then 'asteapta_plata'
        else 'de_trimis'
      end
    )
    on conflict do nothing;
    if new.status <> 'cancelled' and (v_ramburs or new.payment_status = 'paid') then
      perform public.easysales_pune_in_coada(new.business_id, 'comanda_trimite', new.id::text, 1);
    end if;
    return null;
  end if;

  select x.id, x.stare, x.es_anulata_la into v_id, v_stare, v_anulata
    from public.easysales_comenzi x
   where x.order_uuid = new.id and x.directie = 'iesire';
  if v_id is null then
    return null;
  end if;

  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and v_stare = 'asteapta_plata'
     and new.status <> 'cancelled' then
    update public.easysales_comenzi set stare = 'de_trimis' where id = v_id;
    perform public.easysales_pune_in_coada(new.business_id, 'comanda_trimite', new.id::text, 1);
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if v_stare in ('asteapta_plata', 'de_trimis') then
      update public.easysales_comenzi set stare = 'anulata_inainte' where id = v_id;
    elsif v_stare in ('trimisa', 'necunoscuta') and v_anulata is null then
      perform public.easysales_pune_in_coada(new.business_id, 'comanda_anuleaza', new.id::text, 1);
    end if;
  end if;
  return null;
exception when others then
  raise warning 'easysales_marcheaza_comanda: %', sqlerrm;
  return null;
end;
$$;

create trigger easysales_marcheaza_comanda
  after insert or update of status, payment_status on public.orders
  for each row execute function public.easysales_marcheaza_comanda();

-- ---------------------------------------------------------------------------
-- 4. Contul cumparatorului: AWB-ul easySales
-- ---------------------------------------------------------------------------
-- Corpul e cel din PRODUCTIE (schema de referinta, 13.10.2026: `--check` = identica; md5 de dinainte
-- in REGISTRU), cu doua adaosuri: legatura laterala `es` si randul `easysales` in VALUES, in ordinea
-- alfabetica. Tipul intors e acelasi, deci `create or replace` ajunge.

CREATE OR REPLACE FUNCTION public.cont_comanda_mea(p_business uuid, p_cont uuid, p_order uuid)
 RETURNS TABLE(order_id uuid, numar text, creata_la timestamp with time zone, stare text, incasata boolean, metoda_plata text, subtotal numeric, transport numeric, reducere numeric, taxa_ramburs numeric, total numeric, linii jsonb, livrare jsonb, firma jsonb, factura jsonb, curier text, awb text, urmarire text, vedere text, reducere_card numeric, reducere_ramburs numeric, cod_reducere text, tva numeric, cota_tva numeric, regim_tva boolean, stare_plata text, economie_oferte numeric, detalii text, awb_emis_la timestamp with time zone, curier_real text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  /* easySales: AWB-ul viu al comenzii procesate la ei (cel mai nou, neanulat), cu curierul REAL
     din harta pe `courier.id`. Numai cat comanda e a lor (`stapan`). */
  left join lateral (
    select x.awb_viu, x.awb_la, x.awb_curier
      from public.easysales_comenzi x
     where x.order_uuid = o.id and x.business_id = o.business_id
       and x.directie = 'iesire' and x.stapan = 'easysales'
     limit 1
  ) es on true
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
        ('easysales', es.awb_viu, null::text, es.awb_la, es.awb_curier),
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
$$;

revoke all on function public.cont_comanda_mea(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cont_comanda_mea(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Anularea din contul cumparatorului: refuzata pe comenzile procesate in easySales
-- ---------------------------------------------------------------------------
-- Corpul e cel din PRODUCTIE, cu o singura ramura noua, langa refuzul `marketplace`. Comerciantul e
-- anuntat de apelant (`src/lib/cont/anulare.ts`), care stie sa traduca motivul nou.

create or replace function public.cont_anuleaza_comanda(p_business uuid, p_cont uuid, p_order uuid)
 returns table(ok boolean, motiv text)
 language plpgsql
 security definer
 set search_path to ''
as $$
declare v_o record; v_rez jsonb;
begin
  if not exists (
    select 1 from privat.cont_comanda l
     where l.business_id = p_business and l.cont_id = p_cont
       and l.order_id = p_order and l.vedere = 'intreaga'
  ) then
    return query select false, 'negasita';
    return;
  end if;

  /* ⚠⚠ Blocata INAINTE de citire: altfel comerciantul sau un webhook de plata
     puteau muta comanda intre verificare si anulare, iar anularea castiga. */
  select o.status, o.payment_status, o.payment_method,
         coalesce(o.order_source ? 'marketplace', false) as mk,
         coalesce((o.order_source -> 'easysales' ->> 'stapan') = 'easysales', false) as es
    into v_o
    from public.orders o where o.id = p_order and o.business_id = p_business
     for update;

  if v_o.status is null then
    return query select false, 'negasita';
    return;
  end if;
  if v_o.mk then
    return query select false, 'marketplace';
    return;
  end if;
  /* easySales: comanda se proceseaza acolo (factura, AWB). Anularea o face comerciantul, din
     easySales sau cu butonul din Edinio, care anuleaza intai la ei. */
  if v_o.es then
    return query select false, 'procesata-extern';
    return;
  end if;
  if v_o.status <> 'pending' then
    return query select false, 'prea-tarziu';
    return;
  end if;
  /* ⚠⚠ Numai neplatita si cu plata care nu poate fi in curs: la card, banii pot
     intra chiar acum, iar o comanda anulata si platita e bani de intors de mana. */
  if coalesce(v_o.payment_status, 'unpaid') <> 'unpaid' then
    return query select false, 'platita';
    return;
  end if;
  if coalesce(v_o.payment_method, '') not in ('cash_on_delivery', 'ramburs', 'bank_transfer') then
    return query select false, 'plata-online';
    return;
  end if;

  v_rez := public.aplica_tranzitia_comenzii(p_order, 'cancelled', null, p_business, true);
  if coalesce((v_rez->>'gasit')::boolean, false) = false then
    return query select false, 'negasita';
    return;
  end if;

  insert into privat.cont_jurnal (business_id, cont_id, fapta, detalii)
  values (p_business, p_cont, 'anulare-comanda', jsonb_build_object('comanda', p_order));

  return query select true, 'anulata';
end $$;

revoke all on function public.cont_anuleaza_comanda(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cont_anuleaza_comanda(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Schimbarea stapanului: „Preia in Edinio" si intoarcerea la Edinio
-- ---------------------------------------------------------------------------
-- ⚠ `order_source` NU se rescrie intreg din cod niciodata: poarta atribuirea (utm, consimtamant),
-- iar 64 de comenzi au `order_source` NULL. Cheia `easysales` se IMBINA aici, cu `jsonb_set`, si
-- legatura se muta in aceeasi tranzactie. Intoarce `false` cand comanda nu e stampilata.

create or replace function public.easysales_schimba_stapanul(p_business uuid, p_order uuid, p_stapan text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  n integer;
begin
  if p_stapan is null or p_stapan not in ('easysales', 'edinio') then
    raise exception 'easysales_schimba_stapanul: stapan invalid %', p_stapan;
  end if;
  update public.orders
     set order_source = jsonb_set(
           coalesce(order_source, '{}'::jsonb), '{easysales}',
           coalesce(order_source -> 'easysales', '{}'::jsonb)
             || jsonb_build_object('stapan', p_stapan, 'factura', p_stapan, 'awb', p_stapan),
           true)
   where id = p_order and business_id = p_business
     and jsonb_typeof(order_source -> 'easysales') = 'object';
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  update public.easysales_comenzi
     set stapan = p_stapan,
         stare = case when p_stapan = 'edinio' and stare in ('asteapta_plata', 'de_trimis', 'refuzata', 'respinsa_local', 'blocata_plafon', 'abandonata')
                      then 'preluata_edinio' else stare end
   where order_uuid = p_order and business_id = p_business and directie = 'iesire';
  return true;
end;
$$;

revoke all on function public.easysales_schimba_stapanul(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.easysales_schimba_stapanul(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Plasa legaturilor: declansatorul cozii are bloc de exceptie, deci poate tacea
-- ---------------------------------------------------------------------------
-- Chemata de cron la 10 minute. Gaseste comenzile stampilate cu `stapan = easysales`, mai vechi de
-- 5 minute (si din ultimele 30 de zile), fara rand de legatura, si le da randul si trimiterea, cu
-- ACEEASI regula ca `easysales_marcheaza_comanda`. Intoarce cate a reparat.

create or replace function public.easysales_plasa_legaturilor(p_business uuid, p_limita integer default 50)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r         record;
  n         integer := 0;
  v_ramburs boolean;
begin
  for r in
    select o.id, o.business_id, o.status, o.payment_status, o.payment_method
      from public.orders o
     where o.business_id = p_business
       and o.created_at < now() - interval '5 minutes'
       and o.created_at > now() - interval '30 days'
       and jsonb_typeof(o.order_source -> 'easysales') = 'object'
       and coalesce(o.order_source -> 'easysales' ->> 'stapan', '') = 'easysales'
       and not exists (
         select 1 from public.easysales_comenzi x where x.order_uuid = o.id and x.directie = 'iesire'
       )
     order by o.created_at
     limit greatest(1, least(coalesce(p_limita, 50), 500))
  loop
    v_ramburs := coalesce(nullif(lower(btrim(r.payment_method)), ''), 'cash_on_delivery') in ('cash_on_delivery', 'ramburs');
    insert into public.easysales_comenzi (business_id, order_id, order_uuid, directie, es_order_id, stare)
    values (
      r.business_id, r.id, r.id, 'iesire', nextval('public.easysales_id_seq')::text,
      case
        when r.status in ('cancelled', 'refunded') then 'anulata_inainte'
        when not v_ramburs and coalesce(r.payment_status, '') <> 'paid' then 'asteapta_plata'
        else 'de_trimis'
      end
    )
    on conflict do nothing;
    if found then
      n := n + 1;
      if r.status not in ('cancelled', 'refunded') and (v_ramburs or r.payment_status = 'paid') then
        perform public.easysales_pune_in_coada(r.business_id, 'comanda_trimite', r.id::text, 1);
      end if;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.easysales_plasa_legaturilor(uuid, integer) from public, anon, authenticated;
grant execute on function public.easysales_plasa_legaturilor(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Comenzile DINAINTEA activarii: pleaca numai la cererea omului, una cate una
-- ---------------------------------------------------------------------------
-- Actiunea „Trimite comenzile deschise" (planul, §5.1.1) alege in TypeScript comenzile fara factura
-- si fara AWB Edinio (lista curierilor sta acolo), apoi o cheama pe aceasta pentru fiecare. Aici se
-- reverifica TOT sub `for update`: starea (`pending`, `confirmed`, `processing`), stampila lipsa si
-- regula comuna `easysales_se_stampileaza`. Stampila se IMBINA (`jsonb_set`), iar legatura si coada
-- urmeaza regula declansatorului. Intoarce: `stampilata`, `deja`, `neeligibila`, `stare`, `negasita`.

create or replace function public.easysales_stampileaza_existenta(p_business uuid, p_order uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  o         record;
  v_ramburs boolean;
begin
  select x.id, x.business_id, x.status, x.payment_status, x.payment_method, x.order_source, x.shipping_address, x.items
    into o
    from public.orders x
   where x.id = p_order and x.business_id = p_business
     for update;
  if not found then
    return 'negasita';
  end if;
  if o.status not in ('pending', 'confirmed', 'processing') then
    return 'stare';
  end if;
  if jsonb_typeof(o.order_source) = 'object' and o.order_source ? 'easysales' then
    return 'deja';
  end if;
  if not public.easysales_se_stampileaza(o.business_id, o.order_source, o.shipping_address, o.items) then
    return 'neeligibila';
  end if;

  update public.orders
     set order_source = jsonb_set(coalesce(case when jsonb_typeof(order_source) = 'object' then order_source end, '{}'::jsonb), '{easysales}',
           jsonb_build_object('stapan', 'easysales', 'factura', 'easysales', 'awb', 'easysales', 'v', 1), true)
   where id = o.id;

  v_ramburs := coalesce(nullif(lower(btrim(o.payment_method)), ''), 'cash_on_delivery') in ('cash_on_delivery', 'ramburs');
  insert into public.easysales_comenzi (business_id, order_id, order_uuid, directie, es_order_id, stare)
  values (
    o.business_id, o.id, o.id, 'iesire', nextval('public.easysales_id_seq')::text,
    case when not v_ramburs and coalesce(o.payment_status, '') <> 'paid' then 'asteapta_plata' else 'de_trimis' end
  )
  on conflict do nothing;
  if v_ramburs or o.payment_status = 'paid' then
    perform public.easysales_pune_in_coada(o.business_id, 'comanda_trimite', o.id::text, 1);
  end if;
  return 'stampilata';
end;
$$;

revoke all on function public.easysales_stampileaza_existenta(uuid, uuid) from public, anon, authenticated;
grant execute on function public.easysales_stampileaza_existenta(uuid, uuid) to service_role;
revoke all on function public.easysales_se_stampileaza(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.easysales_se_stampileaza(uuid, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.easysales_stampileaza_comanda() from public, anon, authenticated;
revoke all on function public.easysales_marcheaza_comanda() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verificarile stau IN migratie.
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  if not exists (select 1 from pg_trigger where tgname = 'easysales_stampileaza_comanda' and tgrelid = 'public.orders'::regclass) then
    raise exception 'lipseste declansatorul de stampila pe orders';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'easysales_marcheaza_comanda' and tgrelid = 'public.orders'::regclass) then
    raise exception 'lipseste declansatorul cozii pe orders';
  end if;
  if position('easysales_comenzi' in pg_get_functiondef('public.cont_comanda_mea(uuid, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'cont_comanda_mea nu citeste easysales_comenzi';
  end if;
  if position('procesata-extern' in pg_get_functiondef('public.cont_anuleaza_comanda(uuid, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'cont_anuleaza_comanda nu refuza comenzile procesate in easySales';
  end if;
  foreach f in array array[
    'public.cont_comanda_mea(uuid, uuid, uuid)',
    'public.cont_anuleaza_comanda(uuid, uuid, uuid)',
    'public.easysales_schimba_stapanul(uuid, uuid, text)',
    'public.easysales_plasa_legaturilor(uuid, integer)',
    'public.easysales_stampileaza_existenta(uuid, uuid)',
    'public.easysales_se_stampileaza(uuid, jsonb, jsonb, jsonb)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.easysales_comenzi', 'UPDATE') then
    raise exception 'easysales_comenzi se poate scrie din browser';
  end if;
end $$;

notify pgrst, 'reload schema';
