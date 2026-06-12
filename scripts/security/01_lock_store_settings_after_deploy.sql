-- ============================================================================
-- store_settings secret lockdown — RUN ONLY AFTER the code changes are DEPLOYED.
-- ============================================================================
--
-- WHY THIS IS DEPLOY-COUPLED:
-- The previously-live code read store_settings (including stripe_config,
-- netopia_config, and courier credentials) using the ANON key from:
--   - the checkout modals (OrderModal, MiniStoreRenderer) in the browser
--   - shipping.actions (getShippingOptions/getLockers) for anonymous customers
--   - the public storefront pages ([slug], product, layout, confirm, politici)
-- Dropping the public read policy BEFORE the new code is live would break
-- storefront checkout and shipping. The new code routes every one of these
-- through the service role (getPublicStoreConfig + createAdminClient), so once
-- it is deployed, no anonymous/non-owner path needs base-table access anymore.
--
-- AFTER deploy, run the statement below. It removes the policy that let anyone
-- with the public anon key read every tenant's payment/courier/invoicing secrets.

DROP POLICY IF EXISTS "Public can read store settings" ON public.store_settings;

-- ── Verification (expect anon = 0 readable rows) ────────────────────────────
-- begin;
--   set local role anon;
--   select count(*) as anon_rows from public.store_settings;   -- expect 0
-- rollback;
--
-- Owners still read their own row via "Owners can manage store settings";
-- the service role (server actions / API routes) bypasses RLS as before.
