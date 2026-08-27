-- ═══════════════════════════════════════════════════════════════════════════
-- STERGEREA SI INSERAREA VARIANTELOR ERAU DOUA TRANZACTII
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE PUTEA IESI (27.08.2026, seara)
--
--     delete ... where listing_id = X and sku in (…)   ✅
--     (hop de retea / pana de-o clipa)
--     insert ...                                        ❌
--
-- Randurile vechi sunt deja sterse, iar cele noi n-au ajuns. Se pierd, fara nicio urma:
-- codurile EAN, maparea de marime, maparea de culoare, preturile EUR scrise de mana, comutatoarele
-- `enabled` si titlurile de varianta. Nimic nu le mai reface: sunt date pe care comerciantul le-a
-- introdus de mana, nu date pe care le putem reciti de undeva.
--
-- ⚠ SI E EXACT CALEA CEA MAI FOLOSITA: fiecare apasare pe „Salvează" din editorul de listare.
--
-- ⚠ INTR-UN SINGUR RPC, deci intr-o singura tranzactie: ori se schimba tot, ori nu se schimba
-- nimic. Nu se poate face din PostgREST, care trimite fiecare cerere separat.
--
-- ⚠ SE INLOCUIESC DOAR RANDURILE CARE VIN DIN EDITOR, ca si pana acum. Un `delete` pe toata
-- listarea ar sterge si randurile RETRASE — cele ale variantelor care nu mai exista pe produs —
-- iar randul retras e singura urma a maparii `sku -> product_id + variant_title`: fara el, o
-- comanda About You sosita pe acel SKU intra fara sa scada stoc, tacut.

create or replace function public.aboutyou_salveaza_variante(
  p_business_id uuid, p_listing_id uuid, p_randuri jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_skuri text[];
  v_sterse integer;
  v_scrise integer;
begin
  if p_randuri is null or jsonb_array_length(p_randuri) = 0 then
    return jsonb_build_object('stare', 'nimic', 'scrise', 0);
  end if;

  -- ⚠ Listarea se incuie, ca doua salvari deodata sa nu se calce una pe alta.
  perform 1 from public.aboutyou_listings
   where id = p_listing_id and business_id = p_business_id for update;
  if not found then
    return jsonb_build_object('stare', 'lipsa', 'scrise', 0);
  end if;

  select array_agg(r->>'sku') into v_skuri from jsonb_array_elements(p_randuri) as r;

  delete from public.aboutyou_variants
   where listing_id = p_listing_id and sku = any(v_skuri);
  get diagnostics v_sterse = row_count;

  insert into public.aboutyou_variants (
    listing_id, business_id, product_id, sku, ean, size_id, second_size_id,
    color_id, quantity, retail_price_eur, sale_price_eur, enabled, variant_title)
  select
    p_listing_id, p_business_id, (r->>'product_id')::uuid, r->>'sku', r->>'ean',
    (r->>'size_id')::int, (r->>'second_size_id')::int, (r->>'color_id')::int,
    (r->>'quantity')::int, (r->>'retail_price_eur')::numeric, (r->>'sale_price_eur')::numeric,
    coalesce((r->>'enabled')::boolean, true), r->>'variant_title'
  from jsonb_array_elements(p_randuri) as r;
  get diagnostics v_scrise = row_count;

  return jsonb_build_object('stare', 'scris', 'sterse', v_sterse, 'scrise', v_scrise);
end;
$function$;

revoke all on function public.aboutyou_salveaza_variante(uuid, uuid, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
