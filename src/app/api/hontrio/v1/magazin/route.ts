import { autentifica, eroare, picat, raspuns } from "@/lib/hontrio/api";
import { citesteMagazinul } from "@/lib/hontrio/magazin";

/** Datele magazinului legat de jeton. Forma: `MagazinHontrio`, vezi docs/hontrio/CONECTOR.md. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const a = await autentifica(req, "magazin");
  if (a instanceof Response) return a;
  try {
    const magazin = await citesteMagazinul(a.admin, a.businessId);
    if (!magazin) return eroare(404, "magazin_inexistent", "Magazinul nu mai există.");
    return raspuns(magazin);
  } catch (e) {
    return picat("magazin", a.businessId, e);
  }
}
