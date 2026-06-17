-- APPLIED 2026-06-17 (via MCP).
-- Bug: category images did not appear for public/anonymous visitors (e.g. on a
-- phone while logged out), but did for the owner (logged in). Cause: the
-- `categories` table only had an owner policy ("Users manage own categories"),
-- with NO public SELECT policy. Anonymous storefront requests therefore got no
-- category rows (so no image_url reached the page). Category *names* still showed
-- because they are derived from products.category.
--
-- Fix: allow public SELECT of categories belonging to published stores, mirroring
-- the products/businesses public SELECT policies. The owner ALL policy stays.
CREATE POLICY "Public read categories of published businesses"
ON public.categories
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = categories.business_id
      AND b.is_published = true
  )
);
