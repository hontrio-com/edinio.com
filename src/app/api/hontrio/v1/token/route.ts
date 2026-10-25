import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { HONTRIO_CLIENT_ID, hontrioConfigurat, secretulEsteCorect } from "@/lib/hontrio/config";
import { schimbaCodul } from "@/lib/hontrio/conexiuni";
import { citesteMagazinul, type MagazinHontrio } from "@/lib/hontrio/magazin";
import { mesajul } from "@/lib/hontrio/api";

/**
 * Schimbul codului pe jeton (RFC 6749, 4.1.3 si 5; RFC 7636, 4.5).
 *
 * Il cheama numai serverul lui Hontrio, niciodata un browser: cere secretul clientului, care nu
 * paraseste niciodata serverele lui. Raspunsurile au forma din RFC (`error`, `error_description`),
 * fiindca acolo le asteapta orice biblioteca OAuth.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** RFC 6749 (5.1): raspunsul cu jeton nu se pastreaza nicaieri. */
const ANTETE = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache" };

function json(corp: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corp), { status, headers: { ...ANTETE, ...extra } });
}

function eroareOAuth(status: number, error: string, descriere: string, extra: Record<string, string> = {}): Response {
  return json({ error, error_description: descriere }, status, extra);
}

/**
 * Clientul si secretul, din antetul `Basic` sau din corp (RFC 6749, 2.3.1).
 *
 * ⚠ NU AMANDOUA odata: „The client MUST NOT use more than one authentication method in each
 * request". Doua seturi de credentiale in aceeasi cerere ar lasa deschisa intrebarea care conteaza.
 */
function credentiale(req: Request, corp: URLSearchParams): { id: string | null; secret: string | null; basic: boolean } | null {
  const antet = req.headers.get("authorization") ?? "";
  const dinCorp = corp.has("client_secret");
  if (/^Basic\s+/i.test(antet)) {
    if (dinCorp) return null;
    try {
      const decodat = Buffer.from(antet.replace(/^Basic\s+/i, "").trim(), "base64").toString("utf8");
      const i = decodat.indexOf(":");
      if (i < 0) return null;
      /* RFC 6749 (2.3.1): id-ul si secretul se codeaza `application/x-www-form-urlencoded` inainte. */
      return { id: decodeURIComponent(decodat.slice(0, i)), secret: decodeURIComponent(decodat.slice(i + 1)), basic: true };
    } catch {
      return null;
    }
  }
  return { id: corp.get("client_id"), secret: corp.get("client_secret"), basic: false };
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`hontrio:token:${clientIp(req)}`, 30, 60_000)) {
    return eroareOAuth(429, "invalid_request", "Prea multe cereri.", { "retry-after": "60" });
  }
  if (!hontrioConfigurat()) {
    return eroareOAuth(503, "temporarily_unavailable", "Legătura cu Hontrio este oprită momentan.");
  }

  const tip = req.headers.get("content-type") ?? "";
  if (!tip.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return eroareOAuth(400, "invalid_request", "Corpul trebuie trimis ca application/x-www-form-urlencoded.");
  }
  const text = await req.text();
  if (text.length > 4096) return eroareOAuth(400, "invalid_request", "Cerere prea mare.");
  const corp = new URLSearchParams(text);

  const cred = credentiale(req, corp);
  if (!cred) return eroareOAuth(400, "invalid_request", "Autentificarea clientului nu este validă.");
  if (cred.id !== HONTRIO_CLIENT_ID || !secretulEsteCorect(cred.secret)) {
    return eroareOAuth(401, "invalid_client", "Clientul nu a putut fi autentificat.",
      cred.basic ? { "www-authenticate": 'Basic realm="edinio"' } : {});
  }

  if (corp.get("grant_type") !== "authorization_code") {
    return eroareOAuth(400, "unsupported_grant_type", "Se acceptă doar authorization_code.");
  }
  const cod = corp.get("code");
  const redirectUri = corp.get("redirect_uri");
  const verificator = corp.get("code_verifier");
  if (!cod || !redirectUri || !verificator) {
    return eroareOAuth(400, "invalid_request", "Lipsesc code, redirect_uri sau code_verifier.");
  }

  const admin = createAdminClient();
  let rez: Awaited<ReturnType<typeof schimbaCodul>>;
  try {
    rez = await schimbaCodul(admin, { cod, redirectUri, verificator });
  } catch (e) {
    await logError({ action: "hontrio/token", message: `schimbul codului a cazut: ${mesajul(e)}`, severity: "error" });
    return eroareOAuth(503, "temporarily_unavailable", "Schimbul nu s-a putut face. Reîncearcă.");
  }
  if (rez.fel === "refuzat") {
    return eroareOAuth(400, "invalid_grant", "Codul nu este valid, a expirat sau a fost deja folosit.");
  }

  /*
   * ⚠ JETONUL PLEACA SI DACA MAGAZINUL NU SE POATE CITI ACUM. Conexiunea exista deja; daca am raspunde
   * cu eroare, Hontrio n-ar mai primi niciodata jetonul ei (codul e ars), iar comerciantul ar trebui
   * sa o ia de la capat pentru o pana de o clipa. Datele magazinului le poate citi si separat.
   */
  let magazin: MagazinHontrio | null = null;
  try {
    magazin = await citesteMagazinul(admin, rez.businessId);
  } catch {
    magazin = null;
  }

  return json({ access_token: rez.jeton, token_type: "Bearer", magazin }, 200);
}
