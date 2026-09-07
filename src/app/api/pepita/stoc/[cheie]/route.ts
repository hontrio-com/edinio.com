import { raspundeCuFeed } from "@/lib/pepita/ruta-feed";

/**
 * Feedul de stoc Pepita: `/api/pepita/stoc/<cheie>.xml`.
 *
 * Acelasi continut ca feedul de produse, dar numai `<Id>` si `<Availability>`.
 * Documentatia lor spune ca stocul se preia „minden órában", in fiecare ora, iar
 * pretul si descrierea o data pe zi. Un feed scurt inseamna deci de douazeci si
 * patru de ori mai putina munca pentru aceeasi informatie proaspata.
 *
 * ⚠ ACELEASI PRODUSE ca in feedul de produse, si nu din intamplare: bucla e chiar
 * aceeasi functie. Doua bucle s-ar fi departat, iar atunci stocul s-ar fi
 * actualizat pentru articole care la ei nu exista si n-ar fi ajuns la cele care
 * exista.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "stoc");
}

export async function HEAD(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "stoc");
}
