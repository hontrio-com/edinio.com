import { requireAdmin } from "@/lib/admin-guard";
import { listAnnouncements } from "@/lib/actions/announcement.actions";
import { AdminAnnouncementsClient } from "@/components/admin/AdminAnnouncementsClient";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Noutati" };

export default async function AdminNoutatiPage() {
  await requireAdmin();
  const announcements = await listAnnouncements();
  return <AdminAnnouncementsClient initial={announcements} />;
}
