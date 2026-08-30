-- ═══════════════════════════════════════════════════════════════════════════
-- Fara starea liniei nu se repune nimic in stoc
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ NECUNOSCUTUL SE OPRESTE, CA PESTE TOT (26.08.2026)
--
-- Pana acum, o linie cu `claim_item_status` gol cadea pe starea ADUNATA a cererii, iar daca si
-- aceea era goala, repunerea mergea mai departe. Adica: nu stim daca marfa a ajuns, si totusi
-- crestem stocul.
--
-- ⚠ CELE DOUA GRESELI NU SE PLATESC LA FEL. Un „nu" gresit e vizibil si se repara singur: omul
-- vede motivul si incearca dupa urmatoarea sincronizare. Un „da" gresit umfla stocul TACUT, iar
-- pretul lui il plateste un client care cumpara ce nu exista.
--
-- ⚠ SI PLASA PE CERERE IESE CU TOTUL. Operatia e pe `claim_item_id`; daca starea LINIEI nu se
-- stie, n-avem nicio dovada despre bucata aceea, oricat ar spune starea adunata a cererii.
-- Aceeasi cerere poate avea o linie sosita si una nesosita — chiar cazul reparat cu doua ore in
-- urma, doar ca in cealalta directie.
--
-- ⚠ E ACEEASI ALEGERE CA LA APROBARE/RESPINGERE, unde necunoscutul se opreste deja. Doua
-- raspunsuri diferite la aceeasi intrebare ar fi fost ele insele un defect.

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

  -- Fara starea LINIEI n-avem nicio dovada ca marfa a ajuns. Se opreste, si se spune de ce.
  if v_linie.claim_item_status is null then
    return jsonb_build_object('stare', 'status-necunoscut', 'pus', 0);
  end if;

  -- `Created` = clientul abia a apasat butonul de retur; coletul e inca la el.
  if v_linie.claim_item_status = 'Created' then
    return jsonb_build_object('stare', 'marfa-n-a-ajuns', 'pus', 0);
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
