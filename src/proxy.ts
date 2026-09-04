import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Gazdele platformei traiesc intr-un modul comun, ca sa fie ACEEASI lista si
// aici (rutare) si in /api/domains/connect (refuzul revendicarii). Vezi
// src/lib/platform-hosts.ts.
import { isPlatformHost, esteGazdaDeDesfasurare, bareHost as gazdaFaraPort } from "@/lib/platform-hosts";
import { CacheScurt } from "@/lib/utils/cache-scurt";
import { poartaMfaApi, poartaMfaActiuneServer } from "@/lib/auth/poarta-mfa";
import { EXTENSII_STATICE, NON_STORE_SEGMENTS, primulSegment } from "@/lib/segmente-rezervate";
import {
  ANTET_ROBOTS,
  NOINDEX_DESFASURARE,
  NOINDEX_VITRINA,
  TTL_REZOLVARE,
  hotarasteVitrinaPePlatforma,
  rezolvaSlugPlatforma,
  type HotarareVitrina,
  type RandMagazinPentruProxy,
  type RezolvareSlugPlatforma,
} from "@/lib/storefront/indexare-pe-platforma";

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
// Aceleasi doua numere pentru ambele cache-uri; sursa lor e in
// `indexare-pe-platforma.ts`, langa regula care le foloseste si proba ei.
// ⚠ Se citesc de acolo DIRECT, nu prin nume locale: doua constante locale s-ar
// putea inversa fara ca vreo proba sa vada (nicio proba nu masoara timpul).
type RandDomeniu = { slug: string; custom_domain: string | null; is_published: boolean };
const cacheDomenii = new CacheScurt<RandDomeniu[]>(TTL_REZOLVARE.gasit);
/**
 * Ce stim despre primul segment al unei cai de pe gazda platformei: e magazin
 * publicat? are domeniu propriu, si e sanatos?
 *
 * ⚠ Pana pe 03.09.2026 aici statea doar `TintaProprie | null`, iar `null`
 * insemna deopotriva „magazin fara domeniu" si „nu e magazin". Pentru
 * `X-Robots-Tag: noindex` cele doua trebuie deosebite SI la un raspuns din
 * cache — vezi `RezolvareSlugPlatforma` in `indexare-pe-platforma.ts`.
 */
const cacheRezolvariSlug = new CacheScurt<RezolvareSlugPlatforma>(TTL_REZOLVARE.gasit);

function clientAnonim() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return []; }, setAll() {} } },
  );
}

/*
 * Primele segmente care sunt rute ale aplicatiei sau ale site-ului, nu sluguri
 * de magazin (`NON_STORE_SEGMENTS`), au stat aici pana pe 03.09.2026. S-au
 * mutat in `src/lib/segmente-rezervate.ts`, ca sitemapul si probele sa le
 * poata importa fara sa traga dupa ele tot proxy-ul. Aceeasi lista ramane si
 * lista de adrese REZERVATE la crearea magazinului.
 */

/**
 * Citirea din baza pentru un slug de pe gazda platformei. Doar magazinele
 * PUBLICATE: un slug nepublicat e, pentru vizitator si pentru Google, tot „nu e
 * magazin" (pagina lui e deja `noindex` din metadata, vezi `[slug]/page.tsx`).
 */
async function cautaMagazinDupaSlug(slug: string): Promise<{ data: RandMagazinPentruProxy; error: unknown }> {
  const { data, error } = await clientAnonim()
    .from("businesses")
    .select("custom_domain, custom_domain_healthy")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  return { data: data ?? null, error };
}

/**
 * Ce se intampla cu o cerere de pe gazda platformei, dupa primul ei segment.
 *
 * ═══ INVARIANTA SEO (03.09.2026) ═══
 *
 * Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
 * sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
 *
 * De aici ies trei hotarari (vezi `hotarasteVitrinaPePlatforma`):
 *   - „nimic": nu e magazin — pagina platformei sau 404;
 *   - „redirect": magazin cu domeniu propriu sanatos — 307 acolo, ca inainte;
 *   - „noindex": magazin servit CHIAR pe platforma (fara domeniu, cu domeniul
 *     dovedit stricat, sau in previzualizare) — raspunsul primeste
 *     `X-Robots-Tag: noindex, follow`.
 *
 * ⚠ SE INTREABA BAZA, NU DOAR `NON_STORE_SEGMENTS`. „Nu e in lista de rute" nu
 * inseamna „e magazin": o adresa gresita e 404, iar un 404 al platformei nu
 * poarta antetul. Antetul se pune numai cand slug-ul e al unui magazin PUBLICAT
 * — iar asta se stie si la a doua cerere, din cache, fiindca cache-ul tine acum
 * `esteMagazin` separat de domeniu.
 *
 * `localhost` si gazdele de desfasurare (`*.vercel.app`) nu cauta magazine: pe
 * ele nu se redirecteaza nimic catre domeniile clientilor, iar pe `*.vercel.app`
 * TOT raspunsul primeste oricum `noindex` (mai jos, in `proxy`).
 */
async function hotararePentruGazdaPlatformei(
  bare: string,
  firstSeg: string,
  previzualizare: boolean,
): Promise<HotarareVitrina> {
  if (bare === "localhost" || esteGazdaDeDesfasurare(bare)) return { fel: "nimic" };
  if (!firstSeg || NON_STORE_SEGMENTS.has(firstSeg)) return { fel: "nimic" };
  // Esecul citirii nu se tine minte si nu se preface in raspuns: `null` → 503.
  const rezolvare = await rezolvaSlugPlatforma(firstSeg, cacheRezolvariSlug, cautaMagazinDupaSlug, TTL_REZOLVARE);
  return hotarasteVitrinaPePlatforma(rezolvare, previzualizare);
}

/**
 * Raspunsul cand baza nu poate fi citita: 503, „reveniti", fara cache.
 *
 * Acelasi raspuns pe ambele ramuri (domeniu propriu si `/{slug}` pe platforma),
 * din acelasi motiv: o pana de o clipa NU inseamna „magazinul nu exista" (care
 * ar fi un 404 indexabil) si nici „nu e magazin" (care ar fi o vitrina servita
 * fara `noindex`). 503 nu se indexeaza si nu se tine in niciun cache.
 */
function serviciuIndisponibil(): NextResponse {
  return new NextResponse("Serviciu indisponibil temporar", {
    status: 503,
    headers: { "Retry-After": "30", "Cache-Control": "no-store" },
  });
}

/*
 * `EXTENSII_STATICE` — extensiile care inseamna „nu e o pagina" — erau in
 * `config.matcher`, apoi aici. Au fost mutate in `src/lib/segmente-rezervate.ts`
 * (04.09.2026), ca proba listei rezervate sa le poata citi fara `next/server`.
 * Motivul pentru care nu mai stau in matcher ramane: matcher-ul nu vede
 * METODA, iar `GET /logo.svg` e un fisier din `public/`, pe cand `POST /logo.svg`
 * e o cerere pe care Next o poate trata ca actiune de server (id-ul actiunii
 * vine din antet sau din corp, nu din cale). Filtrul se aplica deci numai la
 * cererile care NU sunt POST.
 */

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

  /*
   * ═══ O SINGURA GAZDA PENTRU SITE: www.edinio.com ═══
   *
   * `edinio.com` (varful) si `ajutor.edinio.com` servesc AMANDOUA acelasi site.
   * Fara randurile de mai jos, aceeasi pagina traieste la trei adrese, iar
   * consolidarea depinde numai de canonical — care e un indiciu, nu o hotarare.
   *
   * ⚠ VARFUL: ramura asta e o PLASA, nu calea reala. Masurat pe 04.09.2026,
   * `https://edinio.com/...` primeste `307` de la stratul de domeniu al lui
   * Vercel, INAINTE sa ajunga aici (raspunsul n-are antetele noastre de
   * securitate). Codul de 308 de mai jos ar lucra doar daca redirectarea din
   * panou ar fi scoasa. Permanentul adevarat se alege in Vercel → Domains →
   * edinio.com → Redirect to www.edinio.com, 308.
   *
   * ⚠ `ajutor.edinio.com`: aici ramura CHIAR ruleaza — Vercel n-are nicio
   * redirectare pe subdomeniu, iar `isPlatformHost` il accepta prin sufixul
   * `.edinio.com`, deci pana azi servea tot site-ul cu 200 (verificat: `/`,
   * `/preturi`, `/ajutor`, cu robots.txt si sitemap.xml identice cu ale www).
   * Subdomeniul a fost pastrat cand mutarea centrului de ajutor s-a anulat
   * (vezi `lib/website/ajutor.ts`), iar nota de acolo cerea de mult exact asta.
   *
   * 308, nu 301: pastreaza metoda si corpul, si e permanentul pe care il
   * foloseste tot restul aplicatiei (`next.config.ts`, www→apex pe domenii).
   */
  if ((bare === "edinio.com" || bare === "ajutor.edinio.com") && !isPreview) {
    const url = request.nextUrl.clone();
    url.host = "www.edinio.com";
    /* Portul mostenit de la gazda de dezvoltare n-are ce cauta pe adresa reala. */
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  // Custom domain routing: rewrite to /{slug} for public site
  if (!isPlatformHost(hostname)) {
    const bareHost = gazdaFaraPort(hostname);

    const { pathname } = request.nextUrl;

    // Look up business by custom_domain. A visitor may arrive on the "www."
    // twin, whose canonical is the apex — match both and redirect www → apex so
    // the store resolves regardless of which the customer typed.
    const isWww = bareHost.startsWith("www.");
    const apexHost = isWww ? bareHost.slice(4) : bareHost;
    const candidates = isWww ? [bareHost, apexHost] : [bareHost];

    /*
     * Rutele de metadate se servesc de handlerele de radacina, care stiu de host
     * (sitemap.ts / robots.ts), deci nu se rescriu pe /{slug}.
     *
     * DAR normalizarea www -> apex trebuie sa se intample INAINTE. `sitemap.ts`
     * cauta `custom_domain` dupa hostul brut, iar in baza domeniul e stocat
     * canonic, ca apex: pe `www.magazin.ro` interogarea nu gasea nimic si iesea
     * un sitemap GOL, cu 200 — adica exact forma pe care motoarele de cautare o
     * accepta tacut si o tin minte. Iesirea de aici era plasata inaintea
     * blocului de normalizare, deci le sarea pe amandoua.
     *
     * ⚠ SI NUMAI DUPA CE STIM CA DOMENIUL E AL UNUI MAGAZIN PUBLICAT (04.09.2026).
     * Pana atunci `/sitemap.xml` iesea de aici INAINTE de cautarea domeniului,
     * deci pe un domeniu strain indreptat catre noi, sau pe unul legat de un
     * magazin nepublicat, `sitemap.ts` raspundea cu un `<urlset>` GOL si 200 —
     * chiar forma de mai sus — iar `robots.txt` il anunta. Acum cele doua adrese
     * trec prin aceeasi cautare ca orice pagina: domeniu necunoscut → 404, baza
     * picata → 503, si abia un magazin publicat le primeste servite.
     */
    const eRutaDeMetadate = pathname === "/sitemap.xml" || pathname === "/robots.txt";
    if (eRutaDeMetadate && isWww) {
      const target = new URL(`https://${apexHost}${pathname}`);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }

    // `error` se trateaza SEPARAT de „nu s-a gasit". Daca am cacha si esecul,
    // o pana de o clipa a bazei s-ar transforma in 15 secunde de 404 pe domeniul
    // respectiv, desi magazinul exista. La eroare raspundem ca inainte, dar NU
    // retinem nimic — cererea urmatoare reincearca.
    const cheieDomeniu = candidates.join("|");
    let rows = cacheDomenii.get(cheieDomeniu);
    if (rows === undefined) {
      /*
       * ⚠ `is_published` SE CITESTE, NU SE FILTREAZA (24.08.2026)
       *
       * Forma dinainte punea `.eq("is_published", true)` in interogare. Deci un magazin
       * cu domeniul legat corect, dar inca nepublicat, iesea de aici EXACT ca un domeniu
       * strain indreptat catre noi — si primea mesajul „nu este conectat la niciun
       * magazin".
       *
       * ⚠ CE A COSTAT: pe `okxi.ro`, cu domeniul asezat corect si sanatos in Vercel,
       * mesajul a trimis pe toata lumea sa caute o legatura rupta care nu exista. Cautat
       * si in `businesses`, si in `domains`: domeniul era pe magazinul potrivit, singur.
       * Lipsea o singura apasare, in cu totul alta parte a panoului.
       *
       * Adus aici, steagul lasa raspunsul sa spuna CARE din cele doua e cazul. Vizitatorul
       * primeste 404 la fel — dar cel care se uita afla adevarul.
       */
      const { data, error } = await clientAnonim()
        .from("businesses")
        .select("slug, custom_domain, is_published")
        .in("custom_domain", candidates);

      /*
       * O interogare PICATA nu inseamna „domeniul nu exista".
       *
       * `rows = data ?? []` trimitea mai departe o lista goala, care cadea pe
       * ramura de 404 de la finalul blocului: o pana de o clipa a bazei
       * transforma FIECARE magazin pe domeniu propriu intr-un 404 — si un 404
       * pe care Google il poate indexa, deci cu efect mult mai lung decat pana.
       * 503 spune adevarul („reveniti"), nu se indexeaza si nu se cacheaza.
       */
      if (error) {
        /*
         * ⚠ `robots.txt` se serveste si fara baza. `robots.ts` e pur (decide doar
         * dupa gazda), iar un robots.txt cu 5xx il face pe Google sa trateze TOT
         * hostul ca interzis la crawlare pana la un raspuns bun — pe domeniul
         * unui comerciant, exact paguba pe care lista rezervata o evita pe
         * platforma. Pe un domeniu strain, in timpul penei, un robots.txt care
         * anunta un sitemap ce da oricum 503 e inofensiv. Sitemapul, care chiar
         * are nevoie de baza, ramane pe 503.
         */
        if (pathname === "/robots.txt") return NextResponse.next();
        return serviciuIndisponibil();
      }
      rows = data ?? [];
      /*
       * ⚠ „Gasit dar nepublicat" se retine SCURT, ca si „negasit".
       *
       * Cu TTL-ul lung, apasarea pe „Publica" n-ar fi avut efect pe domeniul propriu
       * decat peste un minut — iar omul, care tocmai a apasat si vede tot 404, apasa din
       * nou sau cheama pe cineva. Un rand nepublicat nu e un raspuns asezat, e o stare
       * care se schimba chiar acum.
       */
      const seServeste = rows.some((r) => r.is_published === true);
      cacheDomenii.set(cheieDomeniu, rows, seServeste ? undefined : TTL_REZOLVARE.negasit);
    }

    /* ⚠ Numai magazinele PUBLICATE se servesc. Steagul se citeste aici, nu in
       interogare, ca sa se poata deosebi „nepublicat" de „domeniu necunoscut". */
    const publicate = (rows ?? []).filter((r) => r.is_published === true);
    const exact = publicate.find((r) => r.custom_domain === bareHost) ?? null;
    const apexMatch = publicate.find((r) => r.custom_domain === apexHost) ?? null;

    // www is not itself the stored canonical → redirect to the apex, keeping path.
    if (!exact && isWww && apexMatch) {
      const target = new URL(`https://${apexHost}${pathname}`);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }

    const biz = exact ?? apexMatch;
    if (biz?.slug) {
      // Sitemapul si robots-ul domeniului se servesc de handlerele de radacina,
      // nu de vitrina: fara rescriere, pe hostul deja normalizat la apex.
      if (eRutaDeMetadate) return NextResponse.next();
      // Rewrite: custom-domain.ro/ → /slug, custom-domain.ro/produse → /slug/produse
      const rewritePath = pathname === "/" ? `/${biz.slug}` : `/${biz.slug}${pathname}`;
      const url = request.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url);
    }

    /*
     * Domeniu necunoscut.
     *
     * `/404` NU e o cale rezervata: e in acelasi spatiu cu `/[slug]`, deci un
     * magazin publicat cu slug-ul „404" ar fi servit, cu HTTP 200, pentru ORICE
     * domeniu strain indreptat catre noi. Azi nu exista un asemenea magazin, dar
     * nimic nu impiedica pe cineva sa il ceara maine.
     *
     * `NextResponse.rewrite(url, { status })` NU merge: in Next 16 statusul e
     * pastrat doar pe `redirect` si pe `x-middleware-refresh`, iar randarea il
     * suprascrie oricum (verificat in next/dist/server/lib/router-server si
     * base-server). Deci raspundem direct, cu statusul pe care il vrem.
     */
    /*
     * ⚠ DOUA CAZURI DIFERITE, DOUA MESAJE. Amandoua raspund 404 — vizitatorului nu i se
     * arata un magazin care nu e gata — dar cel care CAUTA de ce afla care e situatia.
     * Un singur mesaj pentru amandoua a costat o dupa-amiaza de cautat o legatura rupta
     * care nu exista.
     */
    const nepublicat = (rows ?? []).length > 0;
    return new NextResponse(
      "<!doctype html><meta charset=utf-8><title>Domeniu neconfigurat</title>" +
        (nepublicat
          ? "<p>Domeniul e legat de un magazin, dar magazinul nu e încă publicat."
            + "<p>Publică-l din panou, la Setări, și adresa începe să funcționeze imediat."
          : "<p>Acest domeniu nu este conectat la niciun magazin."),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  /*
   * ═══ GAZDA PLATFORMEI: /{slug} ═══
   *
   * Magazin cu domeniu propriu sanatos → 307 catre domeniul lui (adresa lui
   * canonica), pastrand calea. Magazin servit aici → `X-Robots-Tag: noindex`.
   * Vezi `hotararePentruGazdaPlatformei` si `indexare-pe-platforma.ts`.
   *
   * ═══ REDIRECTUL NU SE FACE CATRE UN DOMENIU DOVEDIT MORT. ═══
   *
   * Pana pe 10.08.2026 singura conditie era „coloana e nenula". Masurat atunci:
   * `okai.ro` era cazut (ECONNREFUSED), iar magazinul `okxishop` — publicat si
   * platit — devenea COMPLET inaccesibil, fiindca proxy-ul trimitea activ
   * vizitatorii catre domeniul mort si le lua si ultima cale de acces, adresa
   * de platforma. Pe `alexshop.ro` era si mai rau: domeniul servea un site
   * WordPress strain, deci clientii plecau de la magazinul Edinio la altceva.
   *
   * `null` (neverificat inca) ramane redirect: un domeniu tocmai conectat nu
   * asteapta cronul. Doar `false`, adica masurat si cazut, opreste — si atunci
   * vitrina servita pe platforma primeste `noindex`, ca oricare alta.
   *
   * Previzualizarea (`?preview=1`) nu se redirecteaza — editorul o incarca
   * intr-un cadru de pe aceeasi origine — dar e tot o vitrina pe platforma,
   * deci primeste si ea `noindex`.
   */
  const { pathname } = request.nextUrl;
  const firstSeg = primulSegment(pathname);
  const hotarare = await hotararePentruGazdaPlatformei(bare, firstSeg, isPreview);
  if (hotarare.fel === "indisponibil") return serviciuIndisponibil();
  if (hotarare.fel === "redirect") {
    /*
     * Restul caii se taie dupa segmentul BRUT, nu dupa cel decodificat:
     * `firstSeg` e „cu-domeniu" si pentru `/cu%2Ddomeniu/product/x`, iar taiat
     * dupa lungimea lui ar fi ramas „iu/product/x". Prins de proba.
     */
    const segmentBrut = pathname.split("/")[1] ?? "";
    const target = new URL(`https://${hotarare.tinta.domeniu}${pathname.slice(segmentBrut.length + 1) || "/"}`);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 307);
  }

  // Platform host — normal auth middleware
  const raspuns = await updateSession(request);

  /*
   * Antetul se pune pe RASPUNSUL proxy-ului, iar Next il duce mai departe pe
   * raspunsul paginii — asa ajunge pe orice ruta de sub `/{slug}`, inclusiv pe
   * cele scrise maine. `follow` ramane pornit: linkurile spre domeniul propriu
   * si spre restul vitrinei merita urmate, doar indexarea e oprita.
   *
   * ⚠ NU se pune pe paginile platformei (`hotarare.fel === "nimic"`): `/`,
   * `/preturi`, `/blog`, `/ajutor`, `/vs`, `/industrii` sunt chiar ce vrem in
   * Google. Proba din `src/proxy.test.ts` cade daca vreuna il primeste.
   */
  if (hotarare.fel === "noindex") raspuns.headers.set(ANTET_ROBOTS, NOINDEX_VITRINA);

  /*
   * Gazdele de desfasurare (`*.vercel.app`) sunt copii ale site-ului la adrese
   * pe care nu le vrem indexate deloc — nici site-ul, nici vreo vitrina. Nu
   * atinge `www.edinio.com` si nici domeniile clientilor: acelea nu se termina
   * in `.vercel.app`.
   */
  if (esteGazdaDeDesfasurare(bare)) raspuns.headers.set(ANTET_ROBOTS, NOINDEX_DESFASURARE);

  return raspuns;
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
