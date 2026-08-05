import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Gazdele platformei traiesc intr-un modul comun, ca sa fie ACEEASI lista si
// aici (rutare) si in /api/domains/connect (refuzul revendicarii). Vezi
// src/lib/platform-hosts.ts.
import { isPlatformHost, bareHost as gazdaFaraPort } from "@/lib/platform-hosts";
import { CacheScurt } from "@/lib/utils/cache-scurt";
import { poartaMfaApi, poartaMfaActiuneServer } from "@/lib/auth/poarta-mfa";

/*
 * Proxy-ul ruleaza la FIECARE cerere, iar cele doua cautari de mai jos intrebau
 * baza de fiecare data: 2.268.466 de apeluri pentru rezolvarea domeniului si
 * 1.029.090 pentru redirectarea de pe gazda platformei (masurat in productie).
 * Legatura slug <-> domeniu se schimba insa foarte rar.
 *
 * Un minut de prospetime e sub timpul de propagare DNS al oricarei schimbari de
 * domeniu, deci invechirea e invizibila pentru comerciant. Raspunsurile
 * NEGATIVE se tin doar 15 secunde: altfel un domeniu tocmai conectat ar da 404
 * un minut intreg, exact in clipa in care omul se uita daca a mers.
 */
const TTL_GASIT = 60_000;
const TTL_NEGASIT = 15_000;
type RandDomeniu = { slug: string; custom_domain: string | null };
const cacheDomenii = new CacheScurt<RandDomeniu[]>(TTL_GASIT);
const cacheSlugCatreDomeniu = new CacheScurt<string | null>(TTL_GASIT);

function clientAnonim() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return []; }, setAll() {} } },
  );
}

// First path segments on the platform host that are app/website routes (not
// storefront slugs). The custom-domain redirect below skips these.
//
// EXPORTAT dinadins: aceeasi lista e si lista de adrese REZERVATE la crearea
// magazinului (createBusiness, src/lib/actions/business.actions.ts). O copie a
// ei acolo s-ar fi despartit de asta la prima ruta noua de aplicatie, iar un
// magazin cu slug egal cu o ruta a platformei e un magazin la care nu se poate
// ajunge niciodata: ruta aplicatiei castiga.
//
// „migrare" a fost scos pe 05.08.2026 odata cu restul paginii /migrare, care nu
// mai exista de mult.
export const NON_STORE_SEGMENTS = new Set([
  "dashboard", "login", "register", "forgot-password", "reset-password",
  "onboarding", "admin",
  "despre", "preturi", "contact", "termeni", "cookies", "gdpr",
  "confidentialitate", "start", "demo",
]);

/**
 * Extensiile de fisier care, pe o cerere OBISNUITA, inseamna „nu e o pagina".
 *
 * Erau in `config.matcher`. Au fost mutate aici fiindca matcher-ul nu vede
 * METODA, iar diferenta conteaza: `GET /logo.svg` e un fisier din `public/`, dar
 * `POST /logo.svg` e o cerere pe care Next o poate trata ca actiune de server
 * (id-ul actiunii vine din antet sau din corp, nu din cale). Filtrul se aplica
 * deci numai la cererile care NU sunt POST — pentru ele, comportamentul ramane
 * exact cel de dinainte.
 */
const EXTENSII_STATICE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|css|js)$/i;

export async function proxy(request: NextRequest) {
  // Fisierele statice din `public/` nu au nevoie de nimic din proxy. Un POST
  // catre aceeasi cale, insa, nu e un fisier — vezi comentariul de la
  // `EXTENSII_STATICE` si pe cel de la `config` din coada fisierului.
  if (request.method !== "POST" && EXTENSII_STATICE.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  /*
   * POARTA CELUI DE-AL DOILEA FACTOR — inaintea oricarei alte logici.
   *
   * Pana la 05.08.2026 singura poarta MFA reala statea in layout-ul de
   * /dashboard. Doua suprafete intregi treceau pe langa ea:
   *
   *   1. /api/** — `config.matcher` de la finalul fisierului EXCLUDEA `api/`,
   *      deci rutele REST nu ajungeau nici macar aici. Cu doar parola:
   *      GET /api/products/export dadea tot catalogul, /api/smartbill/pdf
   *      dadea facturile, POST /api/domains/connect muta magazinul.
   *   2. Actiunile de server — un POST catre o cale de pagina. Layout-ul NU se
   *      randeaza inaintea actiunii, deci `updateOrder`, `deleteProduct`,
   *      `getCustomerOrders` s.a.m.d. rulau nestingherite.
   *
   * Aici e singurul loc din aplicatie prin care trec AMANDOUA. Pretul e mic si
   * platit doar de cine trebuie: fara cookie de sesiune Supabase poarta iese
   * imediat, deci webhook-urile, cronurile si vizitatorii anonimi nu ating nici
   * serverul de autentificare, nici baza.
   *
   * De retinut ca e a DOUA plasa: reparatia de fond e ca sesiunea nu se mai
   * emite deloc inainte de cod (src/lib/auth/sesiune-asteptare.ts).
   */
  const { pathname: caleCerere } = request.nextUrl;

  if (caleCerere.startsWith("/api/")) {
    // Iesire DEVREME, dinadins: rutele API nu au ce cauta nici in redirectarea
    // catre domeniul propriu, nici in rescrierea /{slug} de mai jos. Inainte
    // erau scoase din matcher; acum intra, dar se opresc aici.
    return await poartaMfaApi(request);
  }

  const refuzActiune = await poartaMfaActiuneServer(request);
  if (refuzActiune) return refuzActiune;

  const hostname = request.headers.get("host") ?? "";
  // Normalizat (fara port, minuscule): antetul Host vine de la client si poate
  // sosi cu majuscule, caz in care comparatiile exacte de mai jos ratau.
  const bare = gazdaFaraPort(hostname);

  // Editor live-preview loads /{slug}?preview=1 inside a same-origin iframe.
  // Both the www and custom-domain redirects below would send it cross-origin,
  // which X-Frame-Options: SAMEORIGIN then blocks ("refused to connect"). Keep
  // the preview on the current origin so it can be framed by the dashboard.
  const isPreview = request.nextUrl.searchParams.get("preview") === "1";

  // SEO: redirect non-www to www (permanent 301)
  if (bare === "edinio.com" && !isPreview) {
    const url = request.nextUrl.clone();
    url.host = "www.edinio.com";
    return NextResponse.redirect(url, 301);
  }

  // Custom domain routing: rewrite to /{slug} for public site
  if (!isPlatformHost(hostname)) {
    const bareHost = gazdaFaraPort(hostname);

    const { pathname } = request.nextUrl;

    // Metadata routes are served by the host-aware root handlers (sitemap.ts /
    // robots.ts), so don't rewrite them onto /{slug}.
    if (pathname === "/sitemap.xml" || pathname === "/robots.txt") {
      return NextResponse.next();
    }

    // Look up business by custom_domain. A visitor may arrive on the "www."
    // twin, whose canonical is the apex — match both and redirect www → apex so
    // the store resolves regardless of which the customer typed.
    const isWww = bareHost.startsWith("www.");
    const apexHost = isWww ? bareHost.slice(4) : bareHost;
    const candidates = isWww ? [bareHost, apexHost] : [bareHost];

    // `error` se trateaza SEPARAT de „nu s-a gasit". Daca am cacha si esecul,
    // o pana de o clipa a bazei s-ar transforma in 15 secunde de 404 pe domeniul
    // respectiv, desi magazinul exista. La eroare raspundem ca inainte, dar NU
    // retinem nimic — cererea urmatoare reincearca.
    const cheieDomeniu = candidates.join("|");
    let rows = cacheDomenii.get(cheieDomeniu);
    if (rows === undefined) {
      const { data, error } = await clientAnonim()
        .from("businesses")
        .select("slug, custom_domain")
        .in("custom_domain", candidates)
        .eq("is_published", true);
      rows = data ?? [];
      if (!error) cacheDomenii.set(cheieDomeniu, rows, rows.length === 0 ? TTL_NEGASIT : undefined);
    }

    const exact = rows?.find((r) => r.custom_domain === bareHost) ?? null;
    const apexMatch = rows?.find((r) => r.custom_domain === apexHost) ?? null;

    // www is not itself the stored canonical → redirect to the apex, keeping path.
    if (!exact && isWww && apexMatch) {
      const target = new URL(`https://${apexHost}${pathname}`);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }

    const biz = exact ?? apexMatch;
    if (biz?.slug) {
      // Rewrite: custom-domain.ro/ → /slug, custom-domain.ro/produse → /slug/produse
      const rewritePath = pathname === "/" ? `/${biz.slug}` : `/${biz.slug}${pathname}`;
      const url = request.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url);
    }

    // Domain not found — show 404
    const url = request.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url);
  }

  // Platform host: if /{slug} is a published store with an active custom domain,
  // redirect visitors to that domain instead (its canonical home), keeping the path.
  if (bare !== "localhost" && !bare.endsWith(".vercel.app") && !isPreview) {
    const { pathname } = request.nextUrl;
    const firstSeg = pathname.split("/")[1] ?? "";
    if (firstSeg && !NON_STORE_SEGMENTS.has(firstSeg)) {
      // Acelasi rationament ca mai sus: esecul nu se cacheaza.
      let domeniu = cacheSlugCatreDomeniu.get(firstSeg);
      if (domeniu === undefined) {
        const { data, error } = await clientAnonim()
          .from("businesses")
          .select("custom_domain")
          .eq("slug", firstSeg)
          .eq("is_published", true)
          .maybeSingle();
        domeniu = data?.custom_domain ?? null;
        if (!error) cacheSlugCatreDomeniu.set(firstSeg, domeniu, domeniu === null ? TTL_NEGASIT : undefined);
      }
      if (domeniu) {
        const target = new URL(`https://${domeniu}${pathname.slice(firstSeg.length + 1) || "/"}`);
        target.search = request.nextUrl.search;
        return NextResponse.redirect(target, 307);
      }
    }
  }

  // Platform host — normal auth middleware
  return await updateSession(request);
}

/*
 * NICI `api/`, NICI EXTENSIILE nu mai sunt excluse. Ambele erau gauri, din
 * acelasi motiv: matcher-ul decide ce ajunge sa fie verificat, iar ce nu ajunge
 * nu poate fi aparat.
 *
 * `api/`: excluderea lui era cauza structurala a constatarii 2 — nicio cerere
 * catre /api/** nu ajungea in proxy, deci nu exista niciun punct comun in care
 * sa pui o verificare pentru cele ~86 de rute.
 *
 * EXTENSIILE: `.*\.(svg|png|…|css|js)$` scotea din matcher orice cale terminata
 * asa. Dar `/x.js` E o cale de PAGINA valida — `src/app/(public)/[slug]/page.tsx`
 * o prinde cu slug-ul `x.js` — iar o actiune de server ruleaza INAINTE de
 * randare si isi rezolva id-ul dintr-un manifest GLOBAL. Deci
 * `POST /orice.js` cu id-ul ORICAREI actiuni o executa, si `poartaMfaActiuneServer`
 * nu era chemata niciodata. Exact clasa de ocolire pe care o inchidem, intrata
 * pe alta usa.
 *
 * Excluderea utila (sa nu platim proxy pentru fisiere statice) s-a mutat in
 * `proxy()`, unde se poate uita la METODA cererii — lucru pe care `config.matcher`
 * nu-l poate face. Vezi `pareFisierStatic`.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
