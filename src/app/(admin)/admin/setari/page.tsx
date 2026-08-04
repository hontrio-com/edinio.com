import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPlatformSettingsClient } from "@/components/admin/AdminPlatformSettingsClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Setari platforma" };

export default async function AdminSettingsPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("platform_settings")
    .select("key, value");

  const settings: Record<string, unknown> = {};
  for (const row of rows ?? []) {
    settings[row.key] = row.value;
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminPlatformSettingsClient settings={settings} />
    </div>
  );
}
