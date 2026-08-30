import { requireAdmin } from "@/lib/admin-guard";
import { listeazaEtichete } from "@/lib/actions/blog.actions";
import { AdminBlogTagsClient } from "@/components/admin/AdminBlogTagsClient";

export const metadata = { title: "Etichete blog" };

export default async function AdminBlogEtichetePage() {
  await requireAdmin();
  const etichete = await listeazaEtichete();
  return <AdminBlogTagsClient etichete={etichete} />;
}
