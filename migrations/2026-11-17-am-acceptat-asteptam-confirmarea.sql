-- ═══════════════════════════════════════════════════════════════════════════
-- „L-ai acceptat, asteptam confirmarea lor" nu e acelasi lucru cu „nu l-ai hotarat"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ FEREASTRA DINTRE APASARE SI CONFIRMARE (26.08.2026)
--
-- `hotarasteRetur` scrie `decizie = 'accepted'` dupa ce Trendyol raspunde, dar NU scrie
-- `claim_item_status`: acela vine numai din raspunsul LOR, la reconciliere. Intre cele doua trec
-- pana la cinci minute.
--
-- In fereastra aia, omul care tocmai a apasat „Acceptă returul" si apoi „Am primit marfa și e
-- bună" primea „Returul nu e încă hotărât. Pui marfa înapoi după ce îl accepți." — adica i se
-- cerea sa faca ce tocmai facuse. Un ecran care nu tine minte ce-a apasat omul acum un minut il
-- invata sa nu-l creada.
--
-- ⚠ SI TOTUSI NU SE REPUNE STOCUL PE `decizie`. Ghidul lor spune ca rezultatul unei hotarari se
-- urmareste ABIA pe urma, pe `claimItemStatus` — deci un `200` la apel nu dovedeste ca hotararea
-- a prins. Acelasi rationament ca la `sePoateHotari`: pe o cale care misca stocul nu se pariaza
-- pe o confirmare pe care n-o avem.
--
-- ⚠ DECI SE SCHIMBA DOAR CE SE SPUNE, nu ce se face. O stare deosebita, `asteapta-confirmarea`,
-- ca ecranul sa poata zice adevarul: „am trimis acceptarea, asteptam confirmarea lor".

CREATE OR REPLACE FUNCTION public.trendyol_repune_stoc_retur(p_business_id uuid, p_claim_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_linie public.trendyol_claim_items%rowtype;
  v_listing_id uuid;
  v_variant_title text;
  v_product_id uuid;
begin
  -- for update: fara el, doua apasari citesc amandoua un marcaj gol si aduna amandoua.
  select * into v_linie
    from public.trendyol_claim_items
   where business_id = p_business_id
     and claim_item_id = p_claim_item_id
   for update;

  if not found then
    return jsonb_build_object('stare', 'lipsa', 'pus', 0);
  end if;

  if v_linie.repus_in_stoc_la is not null then
    return jsonb_build_object('stare', 'deja', 'pus', 0);
  end if;

  if v_linie.claim_item_status is null then
    return jsonb_build_object('stare', 'status-necunoscut', 'pus', 0);
  end if;

  if v_linie.claim_item_status = 'Created' then
    return jsonb_build_object('stare', 'marfa-n-a-ajuns', 'pus', 0);
  end if;

  -- Tot ce nu e `Accepted` inseamna ca marfa nu e (inca) a comerciantului. `Rejected` cu
  -- dontShipBack=false trebuie sa plece INAPOI la client: repusa, ar fi stoc fantoma.
  if v_linie.claim_item_status <> 'Accepted' then
    return jsonb_build_object(
      'stare',
      case
        -- I-am trimis acceptarea; asteptam sa ne-o confirme ei. Nu se repune, dar se spune altfel.
        when v_linie.decizie = 'accepted' then 'asteapta-confirmarea'
        when v_linie.claim_item_status in ('Rejected', 'Cancelled') then 'retur-incheiat-altfel'
        else 'retur-nehotarat'
      end,
      'pus', 0);
  end if;

  if coalesce(v_linie.barcode, '') = '' then
    return jsonb_build_object('stare', 'fara-cod', 'pus', 0);
  end if;

  select v.listing_id, v.variant_title into v_listing_id, v_variant_title
    from public.trendyol_variants v
   where v.business_id = p_business_id
     and v.barcode = v_linie.barcode
   limit 1;

  if v_listing_id is null then
    return jsonb_build_object('stare', 'cod-nelegat', 'pus', 0);
  end if;

  select l.product_id into v_product_id
    from public.trendyol_listings l
   where l.id = v_listing_id;

  if v_product_id is null then
    return jsonb_build_object('stare', 'fara-produs', 'pus', 0);
  end if;

  if coalesce(v_variant_title, '') <> '' then
    perform public.elibereaza_stoc_complet(
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'product_id', v_product_id, 'variant_title', v_variant_title, 'quantity', v_linie.quantity)));
  else
    perform public.elibereaza_stoc_complet(
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', v_linie.quantity)),
      '[]'::jsonb);
  end if;

  update public.trendyol_claim_items
     set repus_in_stoc_la = now(), updated_at = now()
   where id = v_linie.id;

  return jsonb_build_object('stare', 'pus', 'pus', v_linie.quantity);
end;
$function$;

notify pgrst, 'reload schema';
