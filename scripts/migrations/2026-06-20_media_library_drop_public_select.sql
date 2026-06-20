-- APPLIED 2026-06-20 (via MCP). Security hardening for the Media Library.
--
-- The initial media_library migration shipped with a PUBLIC SELECT policy so public
-- storefront pages could read alt_text/title for SEO. On review this was deemed
-- unnecessary exposure: the anon key could enumerate every published store's media
-- metadata. We instead read those columns server-side via the service role
-- (createAdminClient) in the public product page, so anon never needs row access.
--
-- This drops the public policy. media_library is now OWNER-ONLY (owner_all_media_library).
drop policy if exists "public_read_media_of_published" on public.media_library;
