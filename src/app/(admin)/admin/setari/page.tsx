import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPlatformSettingsClient } from "@/components/admin/AdminPlatformSettingsClient";

export const metadata = { title: "Setari platforma" };

export default async function AdminSettingsPage() {
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
