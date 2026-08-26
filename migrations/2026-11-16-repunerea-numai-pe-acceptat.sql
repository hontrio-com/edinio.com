-- ═══════════════════════════════════════════════════════════════════════════
-- Marfa se repune in stoc numai cand returul a fost ACCEPTAT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ „MARFA A AJUNS" NU E ACELASI LUCRU CU „E A TA" (26.08.2026)
--
-- Paza de pana acum oprea `Created` si necunoscutul, si lasa sa treaca tot restul. Intrebarea era
-- unde se afla marfa; intrebarea buna e a cui ramane.
--
--   WaitingInAction   coletul e la comerciant, dar n-a hotarat inca. Poate ajunge si respins.
--   InAnalysis / WaitingFraudCheck / Unresolved   se uita EI; poate iesi oricum.
--   Rejected          si aici e capcana: cu `dontShipBack: false`, marfa trebuie sa plece INAPOI
--                     LA CLIENT. Repusa in stoc, ramane stoc fantoma pe care NIMIC nu-l scade —
--                     si se vinde ce a plecat deja de pe raft.
--   Cancelled         returul s-a anulat; marfa poate nici sa nu fi plecat de la client.
--   Accepted          singura in care banii s-au intors si marfa ramane a comerciantului.
--
-- ⚠ EXCEPTIA NU SE AUTOMATIZEAZA. Un retur respins cu `dontShipBack: true` chiar lasa marfa la
-- comerciant — dar steagul acela e pe CERERE, iar repunerea e pe LINIE, si tocmai s-au reparat
-- azi doua decizii de linie luate cu date de cerere. Cine chiar pastreaza marfa isi corecteaza
-- stocul din fisa produsului, si i se spune asta pe fata in ecran.
--
-- ⚠ TREI RASPUNSURI DEOSEBITE, nu unul: omul trebuie sa stie daca ASTEAPTA ceva, daca n-are ce
-- astepta, sau daca noi n-am putut citi. Vezi `deCeNuSeRepune`.

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

  -- Fara starea LINIEI n-avem nicio dovada. Se opreste, si se spune de ce.
  if v_linie.claim_item_status is null then
    return jsonb_build_object('stare', 'status-necunoscut', 'pus', 0);
  end if;

  -- `Created` = clientul abia a apasat butonul; coletul e inca la el.
  if v_linie.claim_item_status = 'Created' then
    return jsonb_build_object('stare', 'marfa-n-a-ajuns', 'pus', 0);
  end if;

  -- Tot ce nu e `Accepted` inseamna ca marfa nu e (inca) a comerciantului.
  if v_linie.claim_item_status <> 'Accepted' then
    return jsonb_build_object(
      'stare',
      case when v_linie.claim_item_status in ('Rejected', 'Cancelled')
           then 'retur-incheiat-altfel' else 'retur-nehotarat' end,
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
