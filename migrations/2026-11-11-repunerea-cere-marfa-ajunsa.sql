-- ═══════════════════════════════════════════════════════════════════════════
-- Nu se repune in stoc marfa care n-a ajuns inca
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ BUTONUL SPUNE „AM PRIMIT MARFA SI E BUNA", DAR NIMIC NU VERIFICA ASTA (26.08.2026)
--
-- Din ghidul lor, cuvant cu cuvant:
--   Created         „The first status of the orders returns. This occurs when the customer
--                    presses the return button."
--   WaitingInAction „This statu returns when the returned orders reaches the supplier."
--
-- Deosebirea e FIZICA: pe `Created` clientul abia a apasat butonul si coletul e inca la el.
-- Panoul arata insa butonul de repunere pe orice retur, iar functia asta se uita doar la
-- `repus_in_stoc_la`. Apasat atunci, stocul creste pentru marfa care nu e la raft — si se
-- vinde ce nu exista. Apoi comanda se anuleaza, iar clientul afla ultimul.
--
-- ⚠ SE OPRESTE NUMAI `Created`. Toate celelalte stari vin DUPA ce returul a ajuns la furnizor.
-- Un status pe care nu l-am putut citi TRECE: omul se uita la marfa in clipa in care apasa, iar
-- oprit pe necunoscut n-ar mai putea repune nimic niciodata.
--
-- ⚠ SI PAZA E AICI, NU IN ECRAN. Butonul se poate ocoli cu un POST direct; functia asta nu.

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

  -- ⚠ Marfa trebuie sa fi ajuns. Se citeste si starea LINIEI, si a cererii: pe un retur partial
  -- linia poate fi mai la zi decat cererea, iar cererea mai la zi decat linia. Oricare spune
  -- „Created" opreste — e singura stare in care stim sigur ca nu e nimic in mana omului.
  select c.claim_status into v_stare_cerere
    from public.trendyol_claims c
   where c.id = v_linie.claim_row_id;

  if v_linie.claim_item_status = 'Created' or v_stare_cerere = 'Created' then
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
