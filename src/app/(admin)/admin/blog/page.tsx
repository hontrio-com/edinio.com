import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaArticole } from "@/lib/actions/blog.actions";
import { AdminBlogPostsClient } from "@/components/admin/AdminBlogPostsClient";

export const metadata = { title: "Blog" };

export default async function AdminBlogPage() {
  await requireBlogEditor();
  const articole = await listeazaArticole();
  return <AdminBlogPostsClient articole={articole} />;
}
