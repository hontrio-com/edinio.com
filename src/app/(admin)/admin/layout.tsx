import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { requireAdmin } from "@/lib/admin-guard";

export const metadata = { title: { template: "%s | Admin Edinio", default: "Admin Edinio" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireAdmin();
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AdminSidebar adminName={profile.full_name} adminEmail={user.email ?? ""} />
      <div style={{ paddingLeft: "var(--admin-sidebar-width, 240px)" }}>
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
