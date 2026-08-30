import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaEtichete } from "@/lib/actions/blog.actions";
import { AdminBlogTagsClient } from "@/components/admin/AdminBlogTagsClient";

export const metadata = { title: "Etichete blog" };

export default async function AdminBlogEtichetePage() {
  const { rol } = await requireBlogEditor();
  const etichete = await listeazaEtichete();
  return <AdminBlogTagsClient etichete={etichete} rol={rol} />;
}
