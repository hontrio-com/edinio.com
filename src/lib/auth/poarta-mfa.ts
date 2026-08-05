import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";
import { claimuriDinToken } from "./mfa";
import { MESAJ_REFUZ, sesiuneNeconfirmataPentru } from "./stare-mfa";

/**
 * Poarta MFA aplicata pe cererea BRUTA, din `src/proxy.ts`.
 *
 * E A DOUA plasa, nu apararea principala: din 05.08.2026 sesiunea nici nu se mai
 * emite inainte de al doilea factor (src/lib/auth/sesiune-asteptare.ts), deci in
 * mod normal nu exista sesiuni neconfirmate pe care sa le opreasca. Rostul ei e
 * sa prinda doua lucruri: sesiunile deschise INAINTE de aceasta schimbare, si
 * orice regresie viitoare care ar reintroduce o sesiune inainte de cod.
 *
 * Doua suprafete treceau complet pe langa vechea poarta (care statea in
 * layout-ul de /dashboard): rutele /api/** — scoase explicit din `config.matcher`
 * — si actiunile de server, inaintea carora niciun layout nu se randeaza.
 * Proxy-ul e singurul loc prin care trec amandoua.
 *
 * Fisierul asta NU importa `next/headers`: e impachetat impreuna cu proxy-ul.
 * Pentru cod care ruleaza in interiorul unei cereri Next.js exista `./cere-mfa.ts`.
 */

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
 * Raspunsul de refuz, potrivit cu ce a cerut clientul.
 *
 * O redirectare pentru navigatiile de browser (aterizarile de la Stripe, un
 * formular trimis fara JS): altfel omul ar vedea un JSON crud in pagina. JSON
 * pentru tot restul — actiuni de server si apeluri `fetch` — fiindca acolo un
 * 303 catre HTML ar produce o eroare de parsare fara niciun inteles.
 */
function refuz(request: NextRequest): NextResponse {
  const accepta = request.headers.get("accept") ?? "";
  const eNavigare =
    request.headers.get("sec-fetch-mode") === "navigate" ||
    (accepta.includes("text/html") && !request.headers.has("next-action"));

  if (eNavigare) {
    const url = request.nextUrl.clone();
    url.pathname = "/login/mfa";
    url.search = "";
    // 303: chiar si dupa un POST, browserul continua cu GET.
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ error: MESAJ_REFUZ, mfa: "neconfirmat" }, { status: 403 });
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

  return { refuz: refuz(request), trecere };
}

/**
 * Prefixele de sub /api care NU trec prin poarta.
 *
 * Doua feluri de rute, cu acelasi lucru in comun — apelantul NU e un comerciant
 * cu sesiune de confirmat:
 *
 *   - webhook-uri (Stripe, Netopia, Revolut, Klarna, Notice, Brevo, Mailchimp,
 *     Google Merchant, AboutYou, Trendyol) — vin de la furnizor, cu semnatura
 *     proprie; cronuri — vin de la Vercel, cu secretul lor; pornirea si
 *     intoarcerea de la plata — le foloseste CUMPARATORUL, care nu are cont;
 *     /api/img, personalizarile si dezabonarea — publice prin natura lor;
 *   - /api/auth/** — chiar pasii care SCOT omul dintr-o sesiune neconfirmata:
 *     verificarea codului, retrimiterea lui si iesirea din cont. Fara ei ar
 *     exista o fundatura perfecta: poarta ar bloca inclusiv singurul lucru care
 *     o poate deschide.
 *
 * CE NU MAI E PE LISTA, si de ce: `/api/stripe/connect/refresh` si
 * `/api/stripe/connect/return` fusesera trecute drept „aterizari de redirectare".
 * Nu sunt: amandoua cer sesiune, verifica proprietatea magazinului si intorc,
 * respectiv, un link de onboarding Stripe. Sunt navigatii de browser cu cookie
 * de sesiune, adica exact ce trebuie sa treaca prin poarta.
 *
 * Callback-urile OAuth au ramas: sunt aterizari dintr-un flux inceput DIN panou
 * (deci dintr-o sesiune deja confirmata), iar un refuz acolo ar lasa integrarea
 * pe jumatate conectata, cu tokenul pierdut.
 *
 * O ruta noua uitata de pe lista NU se rupe: fara cookie de sesiune poarta iese
 * imediat. Uitarea greseste, deci, in directia buna.
 */
const API_FARA_POARTA = [
  "/api/auth/",
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
 * pui o singura verificare pentru cele ~86 de rute. Acum exista.
 */
export async function poartaMfaApi(request: NextRequest): Promise<NextResponse> {
  if (apiFaraPoarta(request.nextUrl.pathname)) return NextResponse.next({ request });
  const { refuz: r, trecere } = await evalueazaCerere(request);
  return r ?? trecere;
}

/**
 * Poarta pentru actiunile de server.
 *
 * DE CE ORICE POST, si nu doar cererile cu antetul `Next-Action`: Next.js are
 * TREI feluri de a invoca o actiune, si numai unul poarta antetul. Calea MPA
 * (`<form action>` fara JS) trimite identificatorul in CORPUL multipart, ca
 * `$ACTION_REF_n` / `$ACTION_ID_<id>`; exista si o forma urlencoded. Verificat in
 * node_modules/next/dist/server/lib/server-action-request-meta.js:
 *   isPossibleServerAction = POST && (antet Next-Action || multipart || urlencoded)
 * O poarta pe antet lasa deci deschisa calea multipart: un POST multipart catre
 * /dashboard/settings ajungea la `deleteAccount`. Iar actiunea ruleaza INAINTE de
 * orice randare, deci nici poarta din layout nu apuca sa existe.
 *
 * Regula „orice POST catre o cale de pagina" nu depinde de forma cererii, deci nu
 * se poate ocoli schimband codificarea si nu se strica la urmatoarea versiune de
 * Next.
 *
 * DE CE NU EXISTA NICIO SCUTIRE DE CALE (nici macar /login/mfa): id-ul actiunii
 * se rezolva dintr-un manifest GLOBAL, nu unul pe pagina
 * (action-handler.js:1027, `serverModuleMap[actionId]`). Adica un POST catre o
 * cale scutita, cu id-ul oricarei alte actiuni din aplicatie, ar fi executat-o.
 * O scutire de cale ar fi fost o usa lasata deschisa cu numele scris pe ea.
 * Pasii care TREBUIE sa mearga cu sesiunea neconfirmata sunt de aceea rute
 * /api/auth/**, nu actiuni de server.
 *
 * Cererile fara sesiune (cumparatorul anonim care plaseaza o comanda, formularul
 * de contact, autentificarea insasi) ies din `evalueazaCerere` pe prima linie.
 */
export async function poartaMfaActiuneServer(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "POST") return null;
  const { refuz: r } = await evalueazaCerere(request);
  return r;
}
