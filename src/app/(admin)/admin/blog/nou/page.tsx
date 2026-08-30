import { requireAdmin } from "@/lib/admin-guard";
import { listeazaAutori, listeazaCategorii } from "@/lib/actions/blog.actions";
import { AdminBlogPostEditor } from "@/components/admin/AdminBlogPostEditor";

export const metadata = { title: "Articol nou" };

export default async function AdminBlogArticolNouPage() {
  await requireAdmin();
  const [autori, categorii] = await Promise.all([listeazaAutori(), listeazaCategorii()]);
  return <AdminBlogPostEditor articol={null} autori={autori} categorii={categorii} />;
}
