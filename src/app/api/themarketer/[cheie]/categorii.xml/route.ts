import { raspundeCuFeed } from "@/lib/themarketer/ruta";

/**
 * Feedul theMarketer de categorii: `/api/themarketer/<cheie>/categorii.xml`. Vezi `lib/themarketer/ruta.ts`.
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
  return raspundeCuFeed(req, cheie, "categorii");
}

export async function HEAD(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "categorii");
}
