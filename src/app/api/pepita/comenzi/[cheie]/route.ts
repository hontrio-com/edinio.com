import { metodaGresita, primesteComanda } from "@/lib/pepita/ruta-comenzi";

/**
 * Adresa pe care Pepita impinge comenzile: `/api/pepita/comenzi/<cheie>`.
 *
 * ⚠ CHEIA IN CALE, nu in interogare. Sirurile de interogare ajung mai usor in
 * jurnale de server, in `referrer` si in unelte de urmarire. Forma `?apikey=` din
 * exemplul lor e acceptata de ruta frate, ca sa nu blocam integrarea daca o cer asa.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ cheie: string }> }) {
  const { cheie } = await ctx.params;
  return primesteComanda(req, cheie);
}

/* ⚠ Metodele nepotrivite primesc 405, nu o pagina si nu un redirect catre login. */
export function GET() { return metodaGresita(); }
export function PUT() { return metodaGresita(); }
export function DELETE() { return metodaGresita(); }
