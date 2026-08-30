import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaAutori } from "@/lib/actions/blog.actions";
import { AdminBlogAuthorsClient } from "@/components/admin/AdminBlogAuthorsClient";

export const metadata = { title: "Autori blog" };

export default async function AdminBlogAutoriPage() {
  await requireBlogEditor();
  const autori = await listeazaAutori();
  return <AdminBlogAuthorsClient autori={autori} />;
}
