import { requireAdmin } from "@/lib/admin-guard";
import { listeazaAbonati } from "@/lib/actions/blog-abonati.actions";
import { AdminBlogAbonatiClient } from "@/components/admin/AdminBlogAbonatiClient";

export const metadata = { title: "Abonati blog" };

/**
 * ⚠ ADMIN, NU REDACTOR.
 *
 * Pagina cerea `requireBlogEditor`, dar `listeazaAbonati` cere admin. Un
 * redactor intra deci pe ecran și vedea „Niciun abonat încă" — o minciună
 * liniștită, care l-ar fi pus să caute defectul într-un loc unde nu era.
 *
 * Adresele de email ale oamenilor sunt date personale și n-au nicio legătură cu
 * scrisul articolelor. Poarta se pune aici, unde se vede, nu se lasă pe seama
 * faptului că întâmplător acțiunea returnează gol.
 */
export default async function AdminBlogAbonatiPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireAdmin();
  const { p } = await searchParams;
  const cerut = /^\d+$/.test((p ?? "").trim()) ? Number.parseInt(p as string, 10) : 1;
  const pagina = await listeazaAbonati(cerut);
  return <AdminBlogAbonatiClient pagina={pagina} />;
}
