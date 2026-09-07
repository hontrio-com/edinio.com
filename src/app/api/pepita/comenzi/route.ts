import { metodaGresita, primesteComanda } from "@/lib/pepita/ruta-comenzi";

/**
 * Aceeasi adresa de comenzi, in forma din exemplul lor: `?apikey=...`.
 *
 * ⚠ EXISTA CA SA NU BLOCAM INTEGRAREA. Noi dam adresa cu cheia in cale, dar
 * documentatia lor arata `https://api.partneraruhaz.hu/order/store?apikey=qwerty`,
 * deci e cu putinta sa ne ceara forma aceea. Amandoua duc in aceeasi functie: doua
 * prelucrari s-ar fi departat, si atunci una dintre ele ar fi ramas fara vreo
 * reparatie facuta celeilalte.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return primesteComanda(req, null);
}

export function GET() { return metodaGresita(); }
export function PUT() { return metodaGresita(); }
export function DELETE() { return metodaGresita(); }
