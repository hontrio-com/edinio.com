import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { hontrioConfigurat } from "@/lib/hontrio/config";
import { conexiuneaJetonului, revocaConexiunea } from "@/lib/hontrio/conexiuni";
import { eroare, jetonulDinCerere, mesajul, raspuns } from "@/lib/hontrio/api";
import { formaJetonuluiValida } from "@/lib/hontrio/jetoane";

/**
 * Deconectarea facuta din Hontrio: jetonul cererii se revoca pe loc.
 *
 * ⚠ 200 SI PENTRU UN JETON NECUNOSCUT SAU DEJA REVOCAT (RFC 7009, 2.2). Ce voia apelantul, un jeton
 * care nu mai deschide nimic, e adevarat in ambele cazuri; un raspuns diferit ar spune doar cuiva
 * care incearca jetoane care dintre ele au fost bune.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!rateLimit(`hontrio:revocare:${clientIp(req)}`, 30, 60_000)) {
    return eroare(429, "prea_multe_cereri", "Prea multe cereri.", { "retry-after": "60" });
  }
  if (!hontrioConfigurat()) return eroare(503, "indisponibil", "Legătura cu Hontrio este oprită momentan.");

  const jeton = jetonulDinCerere(req);
  if (!jeton || !formaJetonuluiValida(jeton)) return raspuns({ revocat: true });

  const admin = createAdminClient();
  try {
    const c = await conexiuneaJetonului(admin, jeton);
    if (c) await revocaConexiunea(admin, c.id, "hontrio");
  } catch (e) {
    /* ⚠ 503, nu 200: aici „revocat" ar fi o minciuna, iar Hontrio ar sterge jetonul crezand ca a murit. */
    await logError({ action: "hontrio/revocare", message: mesajul(e), severity: "error" });
    return eroare(503, "indisponibil", "Revocarea nu s-a putut face. Reîncearcă.", { "retry-after": "30" });
  }
  return raspuns({ revocat: true });
}
