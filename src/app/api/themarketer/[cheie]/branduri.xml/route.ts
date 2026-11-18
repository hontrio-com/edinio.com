import { raspundeCuFeed } from "@/lib/themarketer/ruta";

/**
 * Feedul theMarketer de branduri: `/api/themarketer/<cheie>/branduri.xml`. Vezi `lib/themarketer/ruta.ts`.
 *
 * ⚠ PE DOMENIUL PLATFORMEI, nu pe cel al magazinului: adresa lipita in theMarketer nu trebuie sa moara
 * cand comerciantul isi schimba domeniul.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* Un catalog mare se citeste pagina cu pagina; o taiere la mijloc ar da un feed rupt. */
export const maxDuration = 300;

export async function GET(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "branduri");
}

export async function HEAD(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "branduri");
}
