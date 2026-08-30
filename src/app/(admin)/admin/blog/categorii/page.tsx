import { requireAdmin } from "@/lib/admin-guard";
import { listeazaCategorii } from "@/lib/actions/blog.actions";
import { AdminBlogCategoriesClient } from "@/components/admin/AdminBlogCategoriesClient";

export const metadata = { title: "Categorii blog" };

export default async function AdminBlogCategoriiPage() {
  await requireAdmin();
  const categorii = await listeazaCategorii();
  return <AdminBlogCategoriesClient categorii={categorii} />;
}
