import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";
import { claimuriDinToken } from "./mfa";
import { MESAJ_REFUZ, sesiuneNeconfirmataPentru } from "./stare-mfa";

/**
 * Poarta MFA aplicata pe cererea BRUTA, din `src/proxy.ts`.
 *
 * Doua suprafete treceau complet pe langa vechea poarta (care statea in
 * layout-ul de /dashboard): rutele /api/** — scoase explicit din `config.matcher`
 * — si actiunile de server, inaintea carora niciun layout nu se randeaza.
 * Proxy-ul e singurul loc prin care trec amandoua.
 *
 * Fisierul asta NU importa `next/headers`: e impachetat impreuna cu proxy-ul.
 * Pentru cod care ruleaza in interiorul unei cereri Next.js exista `./cere-mfa.ts`.
 */

// ---------------------------------------------------------------------------
// Aplicarea pe cereri brute (proxy): rute /api/** si actiuni de server
// ---------------------------------------------------------------------------

function areCookieDeSesiune(request: NextRequest): boolean {
  // Cookie-urile @supabase/ssr se numesc `sb-<ref>-auth-token`, eventual taiate
  // in bucati `.0`, `.1`. Fara niciunul nu exista sesiune de utilizator, deci
  // webhook-urile, cronurile si vizitatorii anonimi ies de aici fara sa atinga
  // nici serverul de autentificare, nici baza.
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

/**
 * Poarta pentru o cerere care are (sau nu) o sesiune in cookie-uri.
 *
 * Intoarce `null` cand cererea poate merge mai departe, sau raspunsul de refuz.
 * Al doilea element din pereche e raspunsul de trecere, care poate purta
 * cookie-uri de sesiune reimprospatate — nu se pierd.
 */
async function evalueazaCerere(
  request: NextRequest,
): Promise<{ refuz: NextResponse | null; trecere: NextResponse }> {
  let trecere = NextResponse.next({ request });

  if (!areCookieDeSesiune(request)) return { refuz: null, trecere };

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          trecere = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => trecere.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { session } } = await supabase.auth.getSession();
  const claimuri = claimuriDinToken(session?.access_token);

  // Fara claimuri lizibile nu avem pe cine verifica. Nu refuzam: cererea nu e
  // autentificata, iar autentificarea propriu-zisa o face tot ruta de dedesubt.
  if (!claimuri) return { refuz: null, trecere };

  if (!(await sesiuneNeconfirmataPentru(claimuri.sub, claimuri.session_id))) {
    return { refuz: null, trecere };
  }

  return {
    refuz: NextResponse.json({ error: MESAJ_REFUZ, mfa: "neconfirmat" }, { status: 403 }),
    trecere,
  };
}

/**
 * Prefixele de sub /api care NU trec prin poarta.
 *
 * Toate au acelasi lucru in comun: apelantul NU e utilizatorul din browser, deci
 * nu exista sesiune de confirmat, iar o poarta acolo ar insemna doar riscul de a
 * rupe incasari sau sincronizari.
 *
 *   - webhook-uri (Stripe, Netopia, Revolut, Klarna, Notice, Brevo, Mailchimp,
 *     Google Merchant, AboutYou, Trendyol) — vin de la furnizor, cu semnatura
 *     proprie;
 *   - cronuri — vin de la Vercel, cu secretul lor;
 *   - pornirea si intoarcerea de la plata — le foloseste CUMPARATORUL, care nu
 *     are cont pe platforma;
 *   - callback-urile OAuth (Google, OLX) si intoarcerile Stripe Connect — sunt
 *     aterizari dintr-un flux inceput DIN panou (deci deja confirmat); un refuz
 *     aici ar lasa integrarea pe jumatate conectata;
 *   - /api/img si dezabonarea — publice prin natura lor.
 *
 * O ruta noua uitata de pe lista NU se rupe: fara cookie de sesiune poarta iese
 * imediat. Uitarea greseste, deci, in directia buna.
 */
const API_FARA_POARTA = [
  "/api/img",
  "/api/cron/",
  "/api/upload-customization",
  "/api/recovery/",
  "/api/woot/cities",
  "/api/woot/counties",
  // plati: pornire, intoarcere, notificare
  "/api/stripe/webhook",
  "/api/stripe/connect/webhook",
  "/api/stripe/order-checkout",
  "/api/stripe/return",
  "/api/stripe/connect/return",
  "/api/stripe/connect/refresh",
  "/api/netopia/start",
  "/api/netopia/notify",
  "/api/ipay/start",
  "/api/ipay/return",
  "/api/klarna/start",
  "/api/klarna/return",
  "/api/klarna/callback",
  "/api/revolut/start",
  "/api/revolut/return",
  "/api/revolut/webhook",
  // webhook-uri de integrari
  "/api/notice/webhook",
  "/api/brevo/webhook",
  "/api/mailchimp/webhook",
  "/api/google-merchant/webhook",
  "/api/aboutyou/webhook",
  "/api/ty/webhook",
  // aterizari OAuth
  "/api/google-analytics/oauth/callback",
  "/api/google-merchant/oauth/callback",
  "/api/olx/oauth/callback",
];

export function apiFaraPoarta(pathname: string): boolean {
  return API_FARA_POARTA.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Poarta pentru rutele /api/**.
 *
 * Asta e „punctul comun" cerut de audit: rutele API nu au layout si nu treceau
 * prin proxy (matcher-ul excludea `api/`), deci nu exista niciun loc in care sa
 * pui o singura verificare. Acum exista.
 */
export async function poartaMfaApi(request: NextRequest): Promise<NextResponse> {
  if (apiFaraPoarta(request.nextUrl.pathname)) return NextResponse.next({ request });
  const { refuz, trecere } = await evalueazaCerere(request);
  return refuz ?? trecere;
}

/**
 * Caile pe care o sesiune NECONFIRMATA are voie sa ruleze actiuni de server.
 *
 * Altfel omul ramane inchis afara: chiar verificarea codului (`verifyMfaLogin`),
 * retrimiterea lui (`sendMfaOtp`) si deconectarea (`logout`) sunt tot actiuni de
 * server, si se apeleaza de pe /login/mfa.
 */
function caleAuth(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/")
  );
}

/**
 * Poarta pentru actiunile de server.
 *
 * O actiune de server e un POST cu antetul `Next-Action` catre o cale de PAGINA.
 * Layout-ul NU se randeaza inaintea ei, deci poarta din layout-ul de dashboard nu
 * o atingea niciodata: cu doar parola se puteau chema `updateOrder`,
 * `deleteProduct`, `getCustomerOrders` s.a.m.d.
 */
export async function poartaMfaActiuneServer(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "POST") return null;
  if (!request.headers.has("next-action")) return null;
  if (caleAuth(request.nextUrl.pathname)) return null;
  const { refuz } = await evalueazaCerere(request);
  return refuz;
}
