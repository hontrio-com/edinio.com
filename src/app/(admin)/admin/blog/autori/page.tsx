import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaRedactori } from "@/lib/actions/blog-redactori.actions";
import { listeazaAutori } from "@/lib/actions/blog.actions";
import { AdminBlogAuthorsClient } from "@/components/admin/AdminBlogAuthorsClient";

export const metadata = { title: "Autori blog" };

export default async function AdminBlogAutoriPage() {
  const { rol } = await requireBlogEditor();
  const [autori, conturi] = await Promise.all([
    listeazaAutori(),
    /* ⚠ Iese lista GOALA pentru un redactor: functia cere admin. Si asa si
       trebuie — cine sunt oamenii cu drept de scriere nu e treaba lui. Caseta de
       legare oricum nu i se arata, fiindca nu poate schimba autori. */
    listeazaRedactori(),
  ]);
  return <AdminBlogAuthorsClient autori={autori} rol={rol} conturi={conturi} />;
}
