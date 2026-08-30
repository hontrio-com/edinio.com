import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { eticheteleArticolului, iaArticol, listeazaAutori, listeazaCategorii } from "@/lib/actions/blog.actions";
import { AdminBlogPostEditor } from "@/components/admin/AdminBlogPostEditor";

export const metadata = { title: "Editare articol" };

/**
 * ⚠ Segmentul dinamic sta LANGA `autori` si `categorii`, care sunt statice.
 * Next alege intotdeauna segmentul static inaintea celui dinamic, deci cele
 * doua ecrane nu ajung niciodata aici. Id-urile fiind uuid, nici nu se pot
 * ciocni cu ele.
 */
export default async function AdminBlogArticolPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [articol, autori, categorii, etichete] = await Promise.all([
    iaArticol(id), listeazaAutori(), listeazaCategorii(), eticheteleArticolului(id),
  ]);
  if (!articol) notFound();
  return (
    <AdminBlogPostEditor
      articol={articol}
      autori={autori}
      categorii={categorii}
      etichete={etichete}
    />
  );
}
