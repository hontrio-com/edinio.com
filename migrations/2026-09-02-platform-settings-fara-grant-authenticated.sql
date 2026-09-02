-- ═══════════════════════════════════════════════════════════════════════════
-- `platform_settings`: se sting granturile inerte ale utilizatorilor logati
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE E AZI. Tabela are RLS pornit si ZERO politici, deci numai cheia de
-- serviciu trece. Dar rolul `authenticated` are inca sapte granturi pe ea
-- (SELECT, INSERT, UPDATE, DELETE, ...), ramase de la crearea ei.
--
-- ⚠ DE CE CONTEAZA DESI NU SE VEDE NIMIC. Granturile sunt inerte cat timp nu
-- exista nicio politica. In clipa in care cineva adauga PRIMA politica pe tabela
-- — pentru orice motiv, oricat de nevinovat — ele devin vii, si odata cu ele
-- randul `edinio_ga4_admin`, care poarta un `refresh_token` Google ce nu expira.
--
-- Adica paza tabelei ar depinde de ceva ce nimeni nu leaga de ea. Se taie acum,
-- cat timp e ieftin.
--
-- ⚠ SIGURANTA: verificat pe 02.09.2026 ca TOATE cele cinci locuri din cod care
-- citesc tabela folosesc cheia de serviciu:
--   src/app/(admin)/admin/setari/page.tsx      createAdminClient
--   src/app/api/admin/settings/route.ts        createAdminClient
--   src/lib/admin-analytics/conexiune.ts       createAdminClient
--   src/app/api/cron/emag-sync/route.ts        SUPABASE_SERVICE_ROLE_KEY
--   src/app/api/emag/webhook/route.ts          SUPABASE_SERVICE_ROLE_KEY
-- Deci nimic nu se sprijina pe granturile astea.

revoke all on public.platform_settings from authenticated;
revoke all on public.platform_settings from anon;

-- Cheia de serviciu ocoleste RLS oricum, dar grantul se scrie explicit ca sa nu
-- depinda de o mostenire implicita.
grant all on public.platform_settings to service_role;
