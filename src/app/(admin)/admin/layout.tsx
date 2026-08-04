import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { requireAdmin } from "@/lib/admin-guard";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: { template: "%s | Admin Edinio", default: "Admin Edinio" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireAdmin();
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AdminSidebar adminName={profile.full_name} adminEmail={user.email ?? ""} />
      {/* Desktop: offset by sidebar width. Mobile: add top padding for hamburger button */}
      <div className="lg:pl-[var(--admin-sidebar-width,240px)] pt-14 lg:pt-0">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
