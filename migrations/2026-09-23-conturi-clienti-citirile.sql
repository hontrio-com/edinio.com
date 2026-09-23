-- ═══════════════════════════════════════════════════════════════════════════
-- CONTURI DE CLIENT, migratia 5: legarea comenzilor si citirile  (23.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ TREI REGULI CARE SE APLICA LA FIECARE FUNCTIE DE MAI JOS.
--
-- 1. LISTA ALBA DE COLOANE, scrisa in `returns table`. `public.orders` are 225 de
--    coloane si NICIUN grant pe coloana, deci ce nu e numit aici nu iese. Printre
--    cele nenumite: `internal_notes`, costurile de curier ale comerciantului, si
--    `order_source`, care poarta `gclid`, `fbclid`, `client_ip` si `user_agent`.
--    ⚠ Si lista alba COBOARA IN `items`: liniile se reconstruiesc camp cu camp,
--    fiindca `items[].customization.value` tine CHEI R2, iar fisierele urcate
--    inainte de 07.09.2026 stau in galeata publica, unde cheia E adresa.
--
-- 2. FIECARE `where` POARTA SI `business_id`, SI `cont_id`. Nu exista nicio
--    citire care se sprijine numai pe id-ul comenzii.
--
-- 3. REGULA DE MARKETPLACE SE SCRIE INTR-O SINGURA FORMA, si aceea e cea tare:
--
--        not coalesce(o.order_source ? 'marketplace', false)
--
--    ⚠⚠ `not (o.order_source ? 'marketplace')` PARE acelasi lucru si NU e: pentru
--    un `order_source` NULL intoarce NULL, iar `where` nu trece randul. Masurat pe
--    productie pe 23.09.2026: 64 de comenzi au `order_source` NULL, la 15 magazine,
--    pana pe 16.09. Forma fara `coalesce` intoarce 279 de comenzi in loc de 343,
--    adica unul din cinci cumparatori si-ar fi vazut contul fara comenzile lui,
--    fara nicio eroare.

-- ── Legarea comenzilor de cont ─────────────────────────────────────────────

create or replace function public.cont_maturare(
  p_business uuid,
  p_cont uuid
) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  v_cate integer;
begin
  /*
    Leaga de cont comenzile magazinului care se potrivesc pe un contact VERIFICAT
    al lui. Se cheama dupa fiecare intrare reusita.

    ⚠ CELE DOUA RAMURI SE UNESC PRIN SAU, nu in cascada. `customer_orders`, functia
    care pare gata de refolosit, cere pe ramura de email ca telefonul comenzii sa
    LIPSEASCA, iar `orders.customer_phone` e `not null`: masurat, din 359 de
    emailuri distincte, 358 intorc zero comenzi. De-aia nu se refoloseste.

    ⚠ `on conflict do nothing` pe cheia primara `order_id`: o comanda are cel mult
    UN proprietar, si daca e deja a altcuiva nu i se ia.
  */
  with potrivite as (
    select distinct o.id
      from public.orders o
      join privat.cont_contact c
        on c.business_id = p_business
       and c.cont_id = p_cont
       and c.verificat_la is not null
     where o.business_id = p_business
       and not coalesce(o.order_source ? 'marketplace', false)
       and (
         (c.fel = 'telefon' and public.normalize_phone(o.customer_phone) = c.valoare)
         or (c.fel = 'email' and nullif(lower(btrim(coalesce(o.customer_email, ''))), '') = c.valoare)
       )
  ), scrise as (
    insert into privat.cont_comanda (order_id, business_id, cont_id, temei, vedere)
    select p.id, p_business, p_cont, 'contact-verificat', 'intreaga'
      from potrivite p
    on conflict (order_id) do nothing
    returning 1
  )
  select count(*) into v_cate from scrise;

  /*
    ⚠ Numele contului se ia din cea mai recenta comanda legata, si NUMAI daca e
    inca gol. `customer_name` e INTOTDEAUNA persoana de contact, nu denumirea
    firmei de pe factura (aceea sta in `billing_company`), deci e bun pentru salut.
    ⚠ Nu se rescrie la fiecare intrare: omul isi poate schimba numele in cont, iar
    o comanda veche nu are de ce sa i-l dea inapoi.
  */
  update privat.cont_cumparator c
     set nume = coalesce((
           select btrim(o.customer_name)
             from privat.cont_comanda l
             join public.orders o on o.id = l.order_id
            where l.cont_id = p_cont and l.business_id = p_business
            order by o.created_at desc
            limit 1
         ), '')
   where c.id = p_cont and c.business_id = p_business and btrim(c.nume) = '';

  return coalesce(v_cate, 0);
end $fn$;

-- ── Lista comenzilor ───────────────────────────────────────────────────────

create or replace function public.cont_comenzile_mele(
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
  total_randuri bigint
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id,
    o.order_number,
    o.created_at,
    o.status,
    /*
      ⚠⚠ „INCASAT" NU E `payment_status = 'paid'`, si regula e una singura in toata
      casa: la ramburs curierul ia banii la usa si nimeni nu intoarce campul.
      Masurat: 88 de comenzi `delivered` + `unpaid` + ramburs, adica 7.693,43 lei
      care SUNT incasati desi plata scrie „neplatit". Aici se cheama CHIAR functia
      care tine regula, nu o copie a ei.
    */
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    o.total,
    (select count(*) from jsonb_array_elements(coalesce(o.items, '[]'::jsonb))),
    l.vedere,
    count(*) over ()
  from privat.cont_comanda l
  join public.orders o
    on o.id = l.order_id
   and o.business_id = l.business_id
  where l.business_id = p_business
    and l.cont_id = p_cont
  /* ⚠ Departajator pe `id`: fara el, doua comenzi din aceeasi secunda pot aparea
     pe doua pagini deodata si alta poate lipsi. */
  order by o.created_at desc, o.id desc
  limit greatest(1, least(100, coalesce(p_limita, 20)))
  offset greatest(0, coalesce(p_decalaj, 0));
$fn$;

-- ── O comanda ──────────────────────────────────────────────────────────────

/*
  ⚠ `drop` inainte de `create`, nu `create or replace`: lista de coloane intoarse
  s-a schimbat (a intrat `urmarire`), iar Postgres refuza asta cu
  `42P13: cannot change return type of existing function`. Si dupa `drop`
  ACL-ul dispare, deci granturile se refac de mana, la finalul fisierului.
*/
drop function if exists public.cont_comanda_mea(uuid, uuid, uuid);

create function public.cont_comanda_mea(
  p_business uuid,
  p_cont uuid,
  p_order uuid
) returns table (
  order_id uuid,
  numar text,
  creata_la timestamptz,
  stare text,
  incasata boolean,
  metoda_plata text,
  subtotal numeric,
  transport numeric,
  reducere numeric,
  taxa_ramburs numeric,
  total numeric,
  linii jsonb,
  livrare jsonb,
  firma jsonb,
  factura jsonb,
  curier text,
  awb text,
  urmarire text,
  vedere text
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id,
    o.order_number,
    o.created_at,
    o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    o.payment_method,
    o.subtotal,
    o.shipping_cost,
    o.discount_amount,
    o.cod_fee_amount,
    o.total,
    /*
      ⚠⚠ LINIILE SE RECONSTRUIESC CAMP CU CAMP. `items` e jsonb scris de checkout
      si poarta, printre altele, `customization[].value`, care e o CHEIE de
      depozit, nu un nume de fisier. Intors brut, ar fi scos cheile R2 in pagina
      cumparatorului, iar pentru fisierele de dinainte de 07.09.2026 cheia e chiar
      adresa publica. Lista alba de aici creste numai cand o creste un om.
      ⚠ `variant_title` NU se ia: la comenzile de vitrina nu exista, marimea e
      coapta in `name` (masurat: 0 linii de vitrina o au, 91 de eMAG).
    */
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nume', li->>'name',
        'cantitate', li->>'quantity',
        'pret', li->>'price',
        'produs_id', li->>'product_id'
      ) order by ord), '[]'::jsonb)
      from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as t(li, ord)
    ),
    /*
      ⚠⚠ `shipping_address` NU E O ADRESA, E UN DOSAR DE EXPEDIERE: poarta si
      curierul, si tipul livrarii, si punctul de ridicare cu cele sase campuri ale
      lui, si cheia serviciului cotat pentru fiecare din cei 17 curieri, citita de
      cele 17 ferestre de AWB. Intors intreg, ar fi scos in pagina cumparatorului
      configurari care nu sunt ale lui.
      ⚠ Si la livrarea in punct, `address` e adresa PUNCTULUI, nu a omului: a lui
      sta in `home_address`. Se intorc amandoua, numite pe fata.
    */
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'nume', o.customer_name,
      'telefon', o.customer_phone,
      'email', o.customer_email,
      'adresa', o.shipping_address->>'address',
      'adresa_acasa', o.shipping_address->>'home_address',
      'oras', o.shipping_address->>'city',
      'judet', o.shipping_address->>'county',
      'cod_postal', o.shipping_address->>'postcode',
      'fel_livrare', o.shipping_address->>'delivery_type',
      'punct', o.shipping_address->>'locker_name'
    ) else null::jsonb end,
    /* Firma de pe factura, cand comanda a fost pusa pe firma (H4). */
    case when l.vedere = 'intreaga' then jsonb_build_object(
      'denumire', o.billing_company->>'company_name',
      'cui', o.billing_company->>'cui',
      'reg_com', o.billing_company->>'reg_com'
    ) else null::jsonb end,
    /*
      ⚠⚠ NUMAI SERIA SI NUMARUL, NICIODATA ADRESA FURNIZORULUI. SmartBill intoarce
      doua adrese cu regimuri opuse si cea de editare e o pagina de login; fGO are
      un mediu de sandbox ale carui PDF-uri arata identic cu cele adevarate; iar
      `smartbill_invoice_url` e gol la toate cele 286 de facturi emise vreodata.
      PDF-ul se aduce viu, pe server, de o ruta care verifica sesiunea.
    */
    case when l.vedere = 'intreaga' then (
      case
        when o.smartbill_invoice_number is not null then jsonb_build_object('casa','smartbill','serie',o.smartbill_invoice_series,'numar',o.smartbill_invoice_number)
        when o.oblio_invoice_number is not null    then jsonb_build_object('casa','oblio','serie',o.oblio_invoice_series,'numar',o.oblio_invoice_number)
        when o.fgo_invoice_number is not null      then jsonb_build_object('casa','fgo','serie',o.fgo_invoice_series,'numar',o.fgo_invoice_number)
        else null
      end
    ) else null::jsonb end,
    awb.curier,
    case when l.vedere = 'intreaga' then awb.awb else null end,
    /*
      ⚠⚠ ADRESA DE URMARIRE SE DA NUMAI CAND O AVEM CU ADEVARAT.
      Din 17 curieri, doar SASE scriu o adresa pe comanda (DHL, FedEx, UPS,
      Innoship, Shipo, SmartShip), iar DPD are un tipar deja folosit in panou.
      Pentru ceilalti zece se intoarce NULL, si ecranul arata numarul AWB fara
      buton, in loc de un buton mort. A inventa adrese de urmarire din capul meu
      ar fi insemnat legaturi rupte tocmai la curierii cu care se livreaza cel
      mai mult in Romania. Ramane de cercetat in documentatia lor, cu masuratoare.
    */
    case when l.vedere = 'intreaga' then awb.url else null end,
    l.vedere
  from privat.cont_comanda l
  join public.orders o
    on o.id = l.order_id
   and o.business_id = l.business_id
  /*
    ⚠⚠ PERECHEA CURIER-AWB SE SCRIE O SINGURA DATA. Un `case` care alege curierul
    si un `coalesce` separat care alege numarul sunt DOUA liste care trebuie tinute
    in aceeasi ordine de un om: despartite fie si cu un rand, ar fi aratat numarul
    unui curier sub numele altuia, si nimic n-ar fi dat eroare.
    ⚠ Ordinea de mai jos e si ordinea de precedenta cand, din greseala, exista doua
    AWB-uri pe aceeasi comanda. Poarta de AWB spune ca se poate intampla.
  */
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
  where l.business_id = p_business
    and l.cont_id = p_cont
    and l.order_id = p_order;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DREPTURILE
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.cont_maturare(uuid, uuid)                          from public, anon, authenticated;
revoke all on function public.cont_comenzile_mele(uuid, uuid, integer, integer)  from public, anon, authenticated;
revoke all on function public.cont_comanda_mea(uuid, uuid, uuid)                 from public, anon, authenticated;

grant execute on function public.cont_maturare(uuid, uuid)                         to service_role;
grant execute on function public.cont_comenzile_mele(uuid, uuid, integer, integer) to service_role;
grant execute on function public.cont_comanda_mea(uuid, uuid, uuid)                to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.cont_maturare(uuid, uuid)',
    'public.cont_comenzile_mele(uuid, uuid, integer, integer)',
    'public.cont_comanda_mea(uuid, uuid, uuid)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'anon poate chema %', f;
    end if;
    if has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
