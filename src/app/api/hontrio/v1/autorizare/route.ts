import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { adreseleDeIntoarcere, hontrioConfigurat } from "@/lib/hontrio/config";
import { COOKIE_CERERE, DURATA_CERERE_MS, citesteCererea, serializeazaCererea } from "@/lib/hontrio/cerere";
import { ecranEroareAutorizare } from "@/lib/hontrio/ecran";

/**
 * Intrarea in autorizarea Hontrio (RFC 6749, 4.1.1): aici trimite Hontrio comerciantul.
 *
 * Ruta doar verifica cererea si o tine minte, apoi duce omul la ecranul de aprobare din panou. Nu
 * scrie nimic in baza: un cod se naste abia cand comerciantul apasa „Permite accesul".
 *
 * ⚠ DE CE O RUTA SI NU DIRECT PAGINA DIN PANOU: un om nelogat ar fi fost trimis de proxy la
 * `/login`, iar parametrii cererii s-ar fi pierdut pe drum (logarea se termina mereu in
 * `/dashboard`). Cookie-ul pus aici trece prin logare; vezi `cerere.ts`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ecran(motiv: Parameters<typeof ecranEroareAutorizare>[0], status: number): Response {
  return new Response(ecranEroareAutorizare(motiv), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`hontrio:autorizare:${clientIp(req)}`, 30, 60_000)) return ecran("prea_multe", 429);

  const rez = citesteCererea(req.nextUrl.searchParams, adreseleDeIntoarcere(), hontrioConfigurat(), Date.now());
  if (rez.fel === "oprita") return ecran(rez.motiv, rez.motiv === "neconfigurat" ? 503 : 400);
  if (rez.fel === "intoarsa") return NextResponse.redirect(rez.catre, 303);

  const res = NextResponse.redirect(new URL("/dashboard/features/hontrio/autorizare", req.nextUrl.origin), 303);
  res.cookies.set(COOKIE_CERERE, serializeazaCererea(rez.cerere), {
    httpOnly: true,
    /*
     * ⚠ `lax`, NU `strict`: omul vine de pe hontrio.com, deci prima navigare e intre site-uri. Cu
     * `strict`, cookie-ul nu s-ar fi trimis nici dupa redirectarea de aici, si cererea s-ar fi pierdut.
     */
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: Math.floor(DURATA_CERERE_MS / 1000),
  });
  return res;
}
