import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaEtichete } from "@/lib/actions/blog.actions";
import { AdminBlogTagsClient } from "@/components/admin/AdminBlogTagsClient";

export const metadata = { title: "Etichete blog" };

/**
 * ⚠ PAGINATĂ, ca și lista de articole.
 *
 * Numărătoarea se făcea deja în bază, dar lista întreagă venea la ecran. La
 * peste o mie de etichete, PostgREST taie tăcut și unele pur și simplu nu mai
 * apar în admin — iar o etichetă pe care n-o mai vezi n-o mai poți nici șterge.
 */
export default async function AdminBlogEtichetePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; q?: string }>;
}) {
  const { rol } = await requireBlogEditor();
  const { p, q } = await searchParams;
  const pagina = /^\d+$/.test((p ?? "").trim()) ? Number.parseInt(p as string, 10) : 1;

  const rezultat = await listeazaEtichete(pagina, q);
  return <AdminBlogTagsClient rezultat={rezultat} rol={rol} cautat={q ?? ""} />;
}
