-- ═══════════════════════════════════════════════════════════════════════════
-- COMENZILE DE MARKETPLACE INTRA IN ACELASI MOTOR DE STOC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La o comanda noua de pe Trendyol sau About You se facea:
--
--     try { await admin.rpc("decrement_stock_batch", ...) } catch { /* best-effort */ }
--
-- Doua lucruri gresite intr-un rand:
--
-- 1. `catch` NU PRINDE NIMIC. Clientul Supabase nu arunca la eroare de SQL —
--    intoarce `{ error }`. Deci comanda se crea, stocul ramanea neatins, si nimic
--    nu se vedea nicaieri. Un `try/catch` care arata a precautie si nu e.
--
-- 2. Se scadea DOAR stocul de produs, niciodata al marimii — fiindca
--    `trendyol_variants` retinea `barcode` si `product_id`, nu si combinatia.
--    Iar pe un produs guvernat de declansatorul de insumare, scaderea aia se
--    STERGE la prima editare de variante: `products.stock_quantity` se recalculeaza
--    din suma combinatiilor, care n-au fost atinse. Adica vanzarea de pe
--    marketplace dispare din stoc.
--
-- Legatura exista si se pierdea degeaba: `deriveVariantSlots` intoarce `label`
-- (chiar titlul combinatiei) la publicare, dar la scriere se pastra doar
-- `barcode`.

alter table public.trendyol_variants add column if not exists variant_title text;
alter table public.aboutyou_variants  add column if not exists variant_title text;

comment on column public.trendyol_variants.variant_title is
  'Titlul combinatiei din page_sections.variants (ex. "verde / XL"). NULL = produs fara variante, sau listare veche: atunci scaderea ramane la nivel de produs.';

-- ── Backfill: se recupereaza din SKU-ul combinatiei ──────────────────────────
--
-- `deriveVariantSlots` foloseste `c.sku` drept barcode, deci listarile facute
-- pana acum se pot lega inapoi fara sa GHICIM nimic. Ce nu se potriveste ramane
-- NULL, si atunci purtarea e cea de azi (doar produs) — o potrivire inventata ar
-- pune stoc inapoi pe marimea gresita, ceea ce e mai rau decat sa nu pui deloc.
update public.trendyol_variants tv
   set variant_title = c.titlu
  from (
    select p.id as product_id, c->>'sku' as sku, c->>'title' as titlu
      from public.products p,
           lateral jsonb_array_elements(p.page_sections->'variants'->'combinations') c
     where jsonb_typeof(p.page_sections->'variants'->'combinations') = 'array'
       and nullif(c->>'sku', '') is not null
  ) c
 where tv.product_id = c.product_id
   and tv.barcode = c.sku
   and tv.variant_title is null;

update public.aboutyou_variants av
   set variant_title = c.titlu
  from (
    select p.id as product_id, c->>'sku' as sku, c->>'title' as titlu
      from public.products p,
           lateral jsonb_array_elements(p.page_sections->'variants'->'combinations') c
     where jsonb_typeof(p.page_sections->'variants'->'combinations') = 'array'
       and nullif(c->>'sku', '') is not null
  ) c
 where av.product_id = c.product_id
   and av.sku = c.sku
   and av.variant_title is null;

-- ── Consumul de stoc pentru o vanzare care S-A INTAMPLAT DEJA ────────────────
--
-- ⚠ NU se refuza, si asta e deliberat.
--
-- La checkout-ul propriu, `revendica_stoc_complet` REFUZA cand nu e marfa: acolo
-- inca putem opri vanzarea. Aici vanzarea s-a facut deja pe marketplace, iar
-- clientul are confirmarea lor. Un refuz n-ar da marfa inapoi, ar produce doar o
-- comanda pe care Edinio o ignora.
--
-- Deci se scade cat se poate SI SE RAPORTEAZA ce n-a incaput. Plafonarea e
-- purtarea corecta; tacerea nu era. Acelasi rationament ca la reactivarea unei
-- comenzi anulate (`scade_variante_raportat`).
-- ⚠ Intoarce si CE S-A CONSUMAT CU ADEVARAT, nu doar ce s-a cerut.
--
-- Dovedit pe date sintetice inainte de reparatie: o marime cu 1 bucata, comanda
-- de marketplace de 2, `stoc_rezervat` scris cu CEREREA — iar la anulare se punea
-- inapoi 2. Adica sistemul INVENTA o bucata la fiecare anulare de comanda
-- plafonata. La checkout-ul propriu problema nu exista, fiindca acolo se REFUZA:
-- cerut si luat sunt mereu egale. Aici, nu.
--
-- Din acelasi motiv `scade_variante_raportat` intoarce acum `{lipsa, consumat}`
-- in loc de un array, iar `revendica_stoc_comanda` citeste noua forma. Corpurile
-- lor exacte, ca in productie, sunt in `migrations/000-schema-baseline.sql`;
-- aici e doar ce s-a schimbat la data asta.
create or replace function public.consuma_stoc_marketplace(
  p_produse  jsonb,
  p_variante jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record; v_vechi int; v_luat int;
  v_lipsa jsonb := '[]'::jsonb; v_prod_consumat jsonb := '[]'::jsonb; v_v jsonb;
begin
  for r in
    select (e->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse, '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
    having sum(greatest(0, coalesce((e->>'quantity')::int, 0))) > 0
     order by 1   -- ordine determinista: doua sincronizari deodata nu se incuie
  loop
    select stock_quantity into v_vechi from products
     where id = r.pid and track_inventory = true and stock_quantity is not null
     for update;
    if v_vechi is null then continue; end if;

    v_luat := least(r.qty, greatest(0, v_vechi));
    if v_vechi < r.qty then
      v_lipsa := v_lipsa || jsonb_build_object('product_id', r.pid, 'cerut', r.qty, 'disponibil', v_vechi);
    end if;
    if v_luat > 0 then
      v_prod_consumat := v_prod_consumat || jsonb_build_object('product_id', r.pid, 'quantity', v_luat);
    end if;

    update products set stock_quantity = greatest(0, stock_quantity - r.qty) where id = r.pid;
  end loop;

  v_v := public.scade_variante_raportat(coalesce(p_variante, '[]'::jsonb));
  return jsonb_build_object(
    'ok', true,
    'lipsa', v_lipsa || coalesce(v_v->'lipsa', '[]'::jsonb),
    'consumat', jsonb_build_object(
      'produse',  v_prod_consumat,
      'variante', coalesce(v_v->'consumat', '[]'::jsonb)));
end;
$$;

revoke all on function public.consuma_stoc_marketplace(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.consuma_stoc_marketplace(jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
