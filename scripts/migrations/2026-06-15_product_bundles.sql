-- Product bundles ("Pachete de produse"). A bundle is a normal product row with
-- is_bundle = true, whose component products + quantities live in
-- page_sections.bundle. The bundle's own `price` is the sell price and
-- `compare_at_price` is the sum of component prices (so the storefront shows the
-- saving automatically). Stock is NOT stored on the bundle — it is derived from
-- the components, and ordering a bundle decrements the components' stock.

alter table public.products
  add column if not exists is_bundle boolean not null default false;

-- Bundles are filtered out of the normal product list and queried on their own.
create index if not exists products_business_is_bundle_idx
  on public.products (business_id) where is_bundle;
