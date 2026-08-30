-- About You: retragerea variantelor devine verificabilă, iar corelarea comenzilor
-- pe articol devine indexată.
--
-- ═══ 1. `stock_removal` ca tip de lot ═══
--
-- `reconciliazaVariante` duce stocul la 0 pentru variantele retrase și apoi le
-- marchează local „removed". Marcajul se punea pe simplul fapt că cererea a fost
-- ACCEPTATĂ (HTTP 2xx) — dar loturile sunt asincrone, iar documentația lor spune
-- explicit că „un lot cu `status: completed` poate conține items cu
-- `success: false`". Deci un zero neaplicat rămânea nevăzut, iar rândul marcat nu
-- se mai întorcea niciodată: varianta rămânea vandabilă pe About You.
--
-- Lotul de retragere are nevoie de un tip PROPRIU, ca să fie deosebit de o
-- împingere obișnuită de stoc: la el `related_ids` conține id-urile rândurilor din
-- `aboutyou_variants`, nu `style_key`, iar rezolvarea lui marchează exact acele
-- rânduri.
--
-- ═══ 2. Index GIN pe `aboutyou_orders.items` ═══
--
-- Anulările și returnările pe ARTICOL vin fără numărul comenzii: se caută comanda
-- după `order_item_id`. Căutarea se făcea prin ultimele 200 de comenzi în memorie
-- (peste atât, evenimentul se pierdea definitiv), iar înlocuirea cu un containment
-- jsonb (`items @> '[{"order_item_id":N}]'`) fără index ar face scanare completă.

alter table public.aboutyou_batches
  drop constraint if exists aboutyou_batches_kind_check;

-- `removal` = retragerea unui PRODUS întreg, cerută de comerciant. Are nevoie de
-- tip propriu pentru că rezolvarea lui ȘTERGE rândul local, spre deosebire de un
-- `status` obișnuit care doar reflectă starea.
alter table public.aboutyou_batches
  add constraint aboutyou_batches_kind_check
  check (kind = any (array['product'::text, 'stock'::text, 'stock_removal'::text, 'price'::text,
                          'status'::text, 'removal'::text, 'ship'::text, 'cancel'::text, 'return'::text]));

create index if not exists idx_aboutyou_orders_items_gin
  on public.aboutyou_orders using gin (items jsonb_path_ops);

comment on index public.idx_aboutyou_orders_items_gin is
  'Pentru corelarea evenimentelor de webhook pe articol: items @> ''[{"order_item_id":N}]''.';

-- PostgREST își ține schema în cache; fără reîncărcare, constrângerea nouă nu e
-- vizibilă pentru el.
notify pgrst, 'reload schema';
