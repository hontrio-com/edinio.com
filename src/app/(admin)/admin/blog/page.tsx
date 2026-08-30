import { requireBlogEditor } from "@/lib/admin-guard";
import { listeazaArticole } from "@/lib/actions/blog.actions";
import { AdminBlogPostsClient } from "@/components/admin/AdminBlogPostsClient";
import type { StareArticol } from "@/lib/blog/types";
import { STARI } from "@/lib/blog/types";

export const metadata = { title: "Blog" };

/**
 * ⚠ CĂUTAREA ȘI FILTRUL STAU ÎN ADRESĂ, NU ÎN MEMORIA ECRANULUI.
 *
 * Trei câștiguri, și primul e cel care contează: ele se fac acum în bază, deci
 * lista nu mai e citită întreagă. Al doilea: o căutare se poate da mai departe
 * cuiva sau pusă la favorite. Al treilea: butonul „înapoi" al browserului chiar
 * duce înapoi la ce se vedea.
 */
export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; q?: string; stare?: string }>;
}) {
  const { rol } = await requireBlogEditor();
  const { p, q, stare } = await searchParams;

  const pagina = /^\d+$/.test((p ?? "").trim()) ? Number.parseInt(p as string, 10) : 1;
  /* Doar o stare pe care o cunoaștem: altfel un parametru scris de mână ar
     filtra după un șir care nu există și ar da o listă goală fără explicație. */
  const stareaCeruta = stare && stare in STARI ? (stare as StareArticol) : undefined;

  const rezultat = await listeazaArticole(pagina, q, stareaCeruta);

  return (
    <AdminBlogPostsClient
      rezultat={rezultat}
      rol={rol}
      cautat={q ?? ""}
      stareaAleasa={stareaCeruta ?? "toate"}
    />
  );
}
