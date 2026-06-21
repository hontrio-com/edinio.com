-- ============================================================================
-- Security hardening migration — PREPARED 2026-06-22 (REVIEW BEFORE APPLYING)
--
-- Source: full security audit (Supabase advisor + manual review). These are
-- defense-in-depth / hardening changes. NONE fixes an active data leak — RLS
-- was verified to gate every table correctly. Apply in tiers; test after each.
--
-- HOW TO APPLY: review each tier, then run via Supabase SQL editor or
-- `apply_migration`. Tiers A and B are low risk. Tier C needs app testing.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- TIER A — Function hardening (LOW RISK, recommended)
-- ----------------------------------------------------------------------------

-- A1. Pin search_path on trigger functions (advisor: function_search_path_mutable).
-- A mutable search_path on a function lets a caller-controlled schema shadow
-- unqualified object names. Pinning to a fixed value removes that vector while
-- preserving behaviour (these only touch NEW.* and now()).
alter function public.set_updated_at()              set search_path = public, pg_temp;
alter function public.update_domain_orders_updated_at() set search_path = public, pg_temp;
alter function public.handle_updated_at()           set search_path = public, pg_temp;
alter function public.update_tool_avg_rating()      set search_path = public, pg_temp;
alter function public.update_updated_at_column()    set search_path = public, pg_temp;

-- A2. Stop trigger/internal SECURITY DEFINER functions from being callable as RPC
-- by untrusted roles (advisor: anon/authenticated_security_definer_function_executable).
-- These fire from triggers regardless of EXECUTE grant, so revoking is safe.
-- NOTE: is_admin() is DELIBERATELY EXCLUDED — it is called inside RLS policies
-- (e.g. admins_read_all_profiles), so `authenticated` MUST keep EXECUTE on it.
revoke execute on function public.handle_new_user()                from anon, authenticated;
revoke execute on function public.handle_support_message_insert()  from anon, authenticated;
revoke execute on function public.update_support_ticket_updated_at() from anon, authenticated;


-- ----------------------------------------------------------------------------
-- TIER B — Revoke anon SELECT on backend-only tables (LOW RISK, defense-in-depth)
-- ----------------------------------------------------------------------------
-- RLS already returns 0 rows to anon for these, but revoking the table-level
-- grant also removes them from the auto-generated GraphQL/REST schema, shrinking
-- the discovery surface (advisor: pg_graphql_anon_table_exposed).
--
-- KEPT WITH anon SELECT ON PURPOSE (storefront/public reads them anonymously):
--   businesses, products, categories, custom_pages, store_settings, discounts,
--   forms, announcements, site_analytics, error_logs (anon also INSERTs the last two).
-- If you later confirm any of those are only read server-side (admin client),
-- they can be added here too.

revoke select on table public.abandoned_carts        from anon;
revoke select on table public.admin_audit_log         from anon;
revoke select on table public.domain_orders           from anon;
revoke select on table public.domains                 from anon;
revoke select on table public.email_automations       from anon;
revoke select on table public.gmc_products            from anon;
revoke select on table public.gmc_sync_queue          from anon;
revoke select on table public.invoices                from anon;
revoke select on table public.notifications           from anon;
revoke select on table public.orders                  from anon;
revoke select on table public.page_form_submissions   from anon;
revoke select on table public.platform_settings       from anon;
revoke select on table public.product_import_rows     from anon;
revoke select on table public.product_imports         from anon;
revoke select on table public.recovery_optout         from anon;
revoke select on table public.sms_campaigns           from anon;
revoke select on table public.sms_templates           from anon;
revoke select on table public.support_messages        from anon;
revoke select on table public.support_tickets         from anon;
revoke select on table public.users_profile           from anon;

-- After applying, regenerate DB types if anything in the dashboard reads these
-- as anon (it should not). Smoke-test: open a storefront in an incognito window
-- and confirm products/pages/checkout still load.


-- ----------------------------------------------------------------------------
-- TIER C — Storage bucket listing (REVIEW + TEST — do NOT apply blindly)
-- ----------------------------------------------------------------------------
-- Advisor: public_bucket_allows_listing on `images`, `business-images`,
-- `support-attachments`. The SELECT policies below let clients LIST every object
-- in the bucket. Public buckets serve objects by direct URL WITHOUT a SELECT
-- policy, so dropping these stops enumeration without breaking public image URLs.
--
-- AUDIT FINDING (2026-06-22): the app has ZERO `.storage.from(...).list()` or
-- `.download()` calls, and does not reference these buckets by name in src/ —
-- images are served purely by public URL. So C1 and C2 are SAFE to apply (public
-- URL access is unaffected). Still smoke-test the dashboard once after applying.

-- C1. `images` + `business-images` are public, served by URL — listing not needed.
-- drop policy "Public read access for images" on storage.objects;       -- bucket: images
-- drop policy "business_images_public_read" on storage.objects;          -- bucket: business-images

-- C2. legacy public image buckets (logos/covers/gallery/products/avatars).
-- Mostly superseded by R2. If nothing lists them, drop the broad read policy too:
-- drop policy "Anyone can view public images" on storage.objects;

-- C3. `support-attachments` (LIKELY LEGACY — bucket is not referenced anywhere in
-- src/; support attachments now flow through R2). Current policy still lets ANY
-- authenticated user read/list ALL users' attachments (no owner scoping):
--     auth_read_support_attachments: SELECT to authenticated USING (bucket_id='support-attachments')
-- Proper fix depends on the key layout. If attachments are stored under the
-- uploader's uid prefix (e.g. support-attachments/{uid}/...), scope by owner:
--
--   drop policy "auth_read_support_attachments" on storage.objects;
--   create policy "support_attachments_owner_read" on storage.objects
--     for select to authenticated
--     using (bucket_id = 'support-attachments'
--            and (storage.foldername(name))[1] = auth.uid()::text);
--
-- If they are NOT keyed by uid, the support UI likely serves them via the admin
-- client / signed URLs — verify how the support thread renders attachments, then
-- either re-key uploads under {uid}/ or serve via signed URLs and drop the broad
-- read policy entirely. DO NOT apply C3 until this is confirmed.


-- ----------------------------------------------------------------------------
-- NOT IN SQL (do these elsewhere):
--   * Enable "Leaked Password Protection" — Supabase Dashboard > Authentication >
--     Policies/Passwords (HaveIBeenPwned check). One toggle.
--   * Rotate any API keys ever committed to git history (operational).
--   * `authenticated` GraphQL-exposed warnings are intentionally NOT revoked here:
--     merchants need table-level SELECT to read their OWN rows (RLS-filtered).
-- ----------------------------------------------------------------------------
