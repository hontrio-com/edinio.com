-- ═══════════════════════════════════════════════════════════════════════════
-- Repunerea in stoc se uita la LINIA ei, nu la starea intregii cereri
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ O LINIE NU TREBUIE OPRITA DE ALTA LINIE DIN ACEEASI CERERE (26.08.2026)
--
-- Paza de acum o ora oprea repunerea cand `claim_item_status = 'Created'' SAU cand starea
-- adunata a cererii era `Created`. A doua jumatate e prea larga, si iata cazul:
--
--     linia A -> Accepted        (marfa a ajuns, e buna, se poate pune la loc)
--     linia B -> Created         (clientul abia a cerut returul pe ea)
--
-- `stareaCererii` trage toata cererea catre o stare inca vie, deci poate iesi `Created` — iar
-- linia A, care nu are nicio vina, ramanea blocata pe termen nedefinit.
--
-- ⚠ OPERATIA E PE `claim_item_id`, deci adevarul e al LINIEI. Starea cererii ramane doar ca
-- plasa, pentru cazul in care starea liniei lipseste: atunci n-avem alta sursa, si e mai bine
-- sa oprim decat sa umflam stocul cu marfa care n-a ajuns.
--
-- ⚠ Restul pazei ramane neatins: `Created` pe linia insasi opreste in continuare.

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
  v_stare_cerere text;
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

  -- Marfa trebuie sa fi ajuns. `Created` inseamna, din definitia lor, ca abia clientul a apasat
  -- butonul si coletul e inca la el. Repus atunci, stocul creste pentru marfa care nu e la raft.
  --
  -- ⚠ ADEVARUL E AL LINIEI, nu al cererii: operatia e pe `claim_item_id`. Starea cererii e doar
  -- plasa pentru cazul in care starea liniei lipseste.
  if v_linie.claim_item_status = 'Created' then
    return jsonb_build_object('stare', 'marfa-n-a-ajuns', 'pus', 0);
  end if;

  if v_linie.claim_item_status is null then
    select c.claim_status into v_stare_cerere
      from public.trendyol_claims c
     where c.id = v_linie.claim_row_id;

    if v_stare_cerere = 'Created' then
      return jsonb_build_object('stare', 'marfa-n-a-ajuns', 'pus', 0);
    end if;
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
