import { requireAdmin } from "@/lib/admin-guard";
import { listeazaRedactori } from "@/lib/actions/blog-redactori.actions";
import { AdminBlogRedactoriClient } from "@/components/admin/AdminBlogRedactoriClient";

export const metadata = { title: "Cine scrie pe blog" };

/**
 * ⚠ `requireAdmin`, NU `requireBlogEditor`, spre deosebire de restul paginilor de
 * blog. Un redactor care si-ar putea face colegi ar putea la fel de bine sa-si
 * faca si un al doilea cont.
 */
export default async function AdminBlogRedactoriPage() {
  await requireAdmin();
  const redactori = await listeazaRedactori();
  return <AdminBlogRedactoriClient redactori={redactori} />;
}
