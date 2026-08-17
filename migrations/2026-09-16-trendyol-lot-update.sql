-- Actualizarea produce si ea un lot.
--
-- Fara `update` in constrangere, insertul cade si urma se pierde TACIT: nu s-ar
-- mai sti daca reparatia unui produs respins a ajuns la ei sau nu.
alter table public.trendyol_batches
  drop constraint if exists trendyol_batches_kind_check;

alter table public.trendyol_batches
  add constraint trendyol_batches_kind_check
  check (kind = any (array['product'::text, 'inventory'::text, 'archive'::text, 'update'::text]));

notify pgrst, 'reload schema';
