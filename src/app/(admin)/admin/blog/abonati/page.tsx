import { requireAdmin } from "@/lib/admin-guard";
import { listeazaAbonati } from "@/lib/actions/blog-abonati.actions";
import { AdminBlogAbonatiClient } from "@/components/admin/AdminBlogAbonatiClient";

export const metadata = { title: "Abonati blog" };

export default async function AdminBlogAbonatiPage() {
  await requireAdmin();
  const abonati = await listeazaAbonati();
  return <AdminBlogAbonatiClient abonati={abonati} />;
}
