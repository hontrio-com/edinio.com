import { autentifica, citestePaginarea, eroare, picat, raspuns } from "@/lib/hontrio/api";
import { paginaComenzi } from "@/lib/hontrio/comenzi";

/**
 * Comenzile magazinului, pe pagini, fara date personale: `?actualizate_dupa=<ISO>&dupa=<id>&limita=<1-200>`.
 * Forma: `{ comenzi: ComandaHontrio[], urmatorul: string | null }`, vezi docs/hontrio/CONECTOR.md.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const a = await autentifica(req, "comenzi");
  if (a instanceof Response) return a;
  const p = citestePaginarea(new URL(req.url).searchParams, { implicit: 100, maxim: 200 });
  if ("eroare" in p) return eroare(400, "parametri_invalizi", p.eroare);
  try {
    return raspuns(await paginaComenzi(a.admin, a.businessId, p));
  } catch (e) {
    return picat("comenzi", a.businessId, e);
  }
}
