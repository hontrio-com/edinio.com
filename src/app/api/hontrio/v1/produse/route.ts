import { autentifica, citestePaginarea, eroare, picat, raspuns } from "@/lib/hontrio/api";
import { paginaProduse } from "@/lib/hontrio/produse";

/**
 * Catalogul magazinului, pe pagini: `?actualizate_dupa=<ISO>&dupa=<id>&limita=<1-100>`.
 * Forma: `{ produse: ProdusHontrio[], urmatorul: string | null }`, vezi docs/hontrio/CONECTOR.md.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const a = await autentifica(req, "produse");
  if (a instanceof Response) return a;
  const p = citestePaginarea(new URL(req.url).searchParams, { implicit: 50, maxim: 100 });
  if ("eroare" in p) return eroare(400, "parametri_invalizi", p.eroare);
  try {
    const pagina = await paginaProduse(a.admin, a.businessId, p);
    if (!pagina) return eroare(404, "magazin_inexistent", "Magazinul nu mai există.");
    return raspuns(pagina);
  } catch (e) {
    return picat("produse", a.businessId, e);
  }
}
