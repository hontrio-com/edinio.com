import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPlatformSettingsClient } from "@/components/admin/AdminPlatformSettingsClient";
import { setariPentruBrowser, type PlatformSetting } from "@/lib/setari-platforma";

export const metadata = { title: "Setari platforma" };

export default async function AdminSettingsPage() {
  /* ⚠ Paza pe FIECARE pagina, nu doar in aspect. Vezi nota din layout. */
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("platform_settings")
    .select("key, value");

  /*
    ⚠ TAIEREA SECRETELOR, INAINTE DE ORICE PROPRIETATE CATRE BROWSER.

    `AdminPlatformSettingsClient` e o componenta "use client". Tot ce primeste ca
    proprietate e serializat in raspunsul paginii — deci ajunge in sursa, nu doar
    in memoria unei functii de server.

    Aici statea, pana pe 02.09.2026, o buclase care punea `settings[row.key] =
    row.value` pentru TOATE randurile. Printre ele si `edinio_ga4_admin`, care
    poarta un `refresh_token` Google. Un asemenea jeton NU EXPIRA.

    ⚠ SI DE CE N-A PRINS-O NIMENI. Taierea exista de dimineata, si o proba o
    pazea — dar proba citea o singura usa, `/api/admin/settings`. Pagina asta face
    acelasi lucru pe alt drum. O paza pusa pe UN fisier apara acel fisier, nu
    regula; vezi `setari-platforma.test.ts`, unde acum se cauta TOATE citirile.
  */
  const settings = setariPentruBrowser((rows ?? []) as PlatformSetting[]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminPlatformSettingsClient settings={settings} />
    </div>
  );
}
