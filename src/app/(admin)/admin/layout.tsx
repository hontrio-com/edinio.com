import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { requireBlogEditor } from "@/lib/admin-guard";

export const metadata = { title: { template: "%s | Admin Edinio", default: "Admin Edinio" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  /* ⚠ PAZA LARGA SI AICI, din acelasi motiv ca in aspectul de deasupra:
     redactorii au treaba la /admin/blog. Fiecare pagina isi pastreaza paza
     ei stransa, deci restul panoului le ramane inchis. */
  const { user, profile, rol } = await requireBlogEditor();
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AdminSidebar adminName={profile?.full_name ?? ""} adminEmail={user.email ?? ""} rol={rol} />
      {/* Desktop: offset by sidebar width. Mobile: add top padding for hamburger button */}
      <div className="lg:pl-[var(--admin-sidebar-width,240px)] pt-14 lg:pt-0">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
