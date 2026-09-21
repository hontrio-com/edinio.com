import { raspundeCuFeed } from "@/lib/pepita/ruta-feed";

/**
 * Feedul de produse pentru o TARA anume: `/api/pepita/produse/<cheie>/<tara>.xml`.
 *
 * ⚠ DE CE O RUTA APARTE, si nu un parametru de interogare. Pepita cere feeduri
 * separate pe fiecare tara („avem nevoie de fluxuri specifice fiecarei tari",
 * din emailul lor), iar adresa data lor trebuie sa arate limpede ce contine.
 * Un `?tara=hu` s-ar fi putut pierde la o copiere sau la o redirectare.
 *
 * ⚠ ADRESA FARA TARA RAMANE SI EA, si raspunde pentru piata de baza a
 * magazinului: e adresa pe care comerciantii au trimis-o deja la Pepita, si ea
 * nu are voie sa moara. Vezi `chei.ts`.
 *
 * Restul notelor (flux, durata, domeniu) sunt aceleasi ca la ruta fara tara.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ cheie: string; piata: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { cheie, piata } = await ctx.params;
  return raspundeCuFeed(req, cheie, "produse", piata);
}

export async function HEAD(req: Request, ctx: Ctx) {
  const { cheie, piata } = await ctx.params;
  return raspundeCuFeed(req, cheie, "produse", piata);
}
