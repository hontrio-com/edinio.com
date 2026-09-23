import type { NextRequest } from "next/server";
import { servesteDocumentul } from "@/lib/cont/ruta-document";

/**
 * Factura unei comenzi, pentru CUMPARATOR.
 *
 * Poarta, proprietatea si cele patru garzi pe octeti stau in
 * `src/lib/cont/ruta-document.ts` si `src/lib/cont/pdf-document.ts`, comune cu
 * ruta stornarii (`./storno`), ca sa nu existe doua reguli pentru acelasi lucru.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  return servesteDocumentul(req, orderId, "factura");
}
