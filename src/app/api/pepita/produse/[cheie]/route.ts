import { raspundeCuFeed } from "@/lib/pepita/ruta-feed";

/**
 * Feedul de produse Pepita: `/api/pepita/produse/<cheie>.xml`.
 *
 * ⚠ PE DOMENIUL PLATFORMEI, nu pe cel al magazinului. Un comerciant isi poate
 * schimba domeniul propriu, iar adresa data odata catre Pepita ar muri atunci in
 * tacere: feedul ar inceta sa se mai citeasca si nimeni n-ar apasa nimic.
 *
 * ⚠ RASPUNSUL PLEACA IN FLUX. Vercel refuza corpurile peste 4,5 MB, iar un catalog
 * mare trece de prag. Vezi `lib/pepita/feed.ts`.
 */
export const dynamic = "force-dynamic";
/* Fluxul are nevoie de runtime-ul Node: `ReadableStream` cu `pull` asincron si `node:crypto`. */
export const runtime = "nodejs";
/*
 * Un catalog mare se citeste pagina cu pagina, iar fiecare pagina e o cerere spre
 * Supabase. Implicitul de 300 de secunde ajunge cu mult, dar nu e gratis sa fie mai
 * mic decat trebuie: o taiere la mijloc ar da un feed invalid la fiecare citire.
 */
export const maxDuration = 300;

export async function GET(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "produse");
}

export async function HEAD(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return raspundeCuFeed(req, cheie, "produse");
}
