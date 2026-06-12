import { requireAdmin } from "@/lib/admin-guard";
import { listAnnouncements } from "@/lib/actions/announcement.actions";
import { AdminAnnouncementsClient } from "@/components/admin/AdminAnnouncementsClient";

export const metadata = { title: "Noutati" };

export default async function AdminNoutatiPage() {
  await requireAdmin();
  const announcements = await listAnnouncements();
  return <AdminAnnouncementsClient initial={announcements} />;
}
