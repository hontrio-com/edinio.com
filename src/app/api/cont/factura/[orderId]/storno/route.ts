import type { NextRequest } from "next/server";
import { servesteDocumentul } from "@/lib/cont/ruta-document";

/**
 * Nota de stornare a facturii unei comenzi, pentru CUMPARATOR.
 *
 * ⚠ Pe SEGMENT de cale, nu `?doc=storno`: in zona de cont parametrii de cerere nu
 * se citesc deloc (`regulile-contului.test.ts`), fiindca sunt locul pe unde se
 * strecoara identitati. Poarta e aceeasi ca la factura.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  return servesteDocumentul(req, orderId, "storno");
}
