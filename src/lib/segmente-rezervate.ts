/**
 * Primele segmente de cale de pe gazda platformei care sunt rute ale
 * APLICATIEI sau ale site-ului de prezentare, nu sluguri de magazin.
 *
 * O singura lista, citita din trei locuri cu scopuri diferite, si de aceea
 * trebuie sa fie una singura:
 *   - `src/proxy.ts` sare peste ele cand cauta un magazin dupa primul segment
 *     (altfel fiecare cerere spre /integrari ar face o interogare degeaba, iar
 *     un magazin cu slug-ul „curieri" si domeniu propriu ar fura pagina);
 *   - `createBusiness` (src/lib/actions/business.actions.ts) le REFUZA ca slug
 *     de magazin: un magazin cu slug egal cu o ruta a platformei e un magazin
 *     la care nu se poate ajunge niciodata, fiindca ruta aplicatiei castiga;
 *   - proba sitemapului platformei (src/app/sitemap.test.ts) si santinela le
 *     folosesc pe dos: o adresa al carei prim segment e aici NU POATE fi o
 *     vitrina, deci „toate adresele din sitemapul platformei incep cu un segment
 *     de aici" e chiar invarianta „sitemapul platformei nu anunta niciun
 *     magazin". Sitemapul insusi NU filtreaza dupa lista (ar scoate tacut pagini
 *     noi); proba cade zgomotos, iar santinela masoara pe productie.
 *
 * A stat in `src/proxy.ts` pana pe 03.09.2026. S-a mutat aici ca sa poata fi
 * importata fara sa traga dupa ea `next/server`, clientul Supabase si poarta
 * MFA — de care nici sitemapul, nici probele n-au nevoie.
 *
 * ⚠ LISTA SE VERIFICA IMPOTRIVA DISCULUI: proba din `segmente-rezervate.test.ts`
 * parcurge `src/app` (inclusiv grupurile de rute `(website)`, `(auth)`...) si
 * cade daca o ruta de nivel intai lipseste de aici. Pana pe 04.09.2026 lipseau
 * `auth`, `reactivare` si `preview-sectiune`: un magazin cu unul din slugurile
 * astea si domeniu propriu ar fi trimis vizitatorii rutei aplicatiei cu 307 pe
 * domeniul lui, iar proxy-ul intreba baza degeaba la fiecare cerere.
 *
 * „migrare" a fost scos pe 05.08.2026 odata cu pagina /migrare, si s-a intors pe
 * 30.08.2026, cand pagina a fost refacuta ca pagina de prezentare. Randul de mai
 * jos e adevarul; nota asta e doar ca sa nu para o scapare.
 *
 * Tinut in acord cu `src/lib/website/nav.ts`: un segment NOU de nivel intai
 * adaugat in meniu se adauga si aici.
 */
export const NON_STORE_SEGMENTS: ReadonlySet<string> = new Set([
  // Aplicatia: panou, autentificare, onboarding, admin, API.
  "dashboard", "login", "register", "forgot-password", "reset-password",
  "onboarding", "admin", "api", "auth", "reactivare",
  // Previzualizarea unei sectiuni din editorul de design (src/app/(public)/preview-sectiune).
  "preview-sectiune",
  // Site de prezentare si paginile juridice.
  "despre", "preturi", "contact", "termeni", "cookies", "gdpr",
  "confidentialitate", "start", "migrare", "demo",
  // Site de prezentare — paginile din mega menu.
  "magazin-online", "integrari", "optimizare",
  "mentenanta-gratuita", "industrii", "vs", "ajutor", "blog",
  "intrebari-frecvente",
  /*
   * Fisierele platformei servite de la radacina. Niciunul nu poate fi slug de
   * magazin (slugul nu accepta puncte), dar fara ele aici proxy-ul intreba baza
   * la fiecare cerere de robots.txt sau sitemap.xml — si, de pe 04.09.2026, o
   * pana a bazei le-ar fi facut sa raspunda 503 in loc sa fie servite, fiindca
   * un prim segment necunoscut se rezolva acum cu esec inchis (vezi
   * `indexare-pe-platforma.ts`). Un robots.txt cu 5xx il face pe Google sa
   * opreasca crawlarea intregului site pana la 30 de zile.
   */
  "sitemap.xml", "robots.txt", "llms.txt", "sitemap-magazine.xml",
  "site.webmanifest", "indice-ajutor.json",
]);

/**
 * Extensiile de fisier care, pe o cerere OBISNUITA, inseamna „nu e o pagina".
 *
 * Le citeste proxy-ul (`GET /logo.svg` e un fisier din `public/` si nu are
 * nevoie de nimic din proxy; un POST catre aceeasi cale e insa o actiune de
 * server, deci filtrul se aplica numai la ce nu e POST) si proba listei de mai
 * sus: orice fisier din radacina lui `public/` sau orice ruta de metadate din
 * `src/app` care NU se termina cu una din extensiile astea ajunge la cautarea
 * de slug, deci trebuie sa fie rezervat aici (vezi `sitemap.xml`,
 * `site.webmanifest`). Sta aici, nu in proxy, ca proba sa o poata importa fara
 * `next/server`.
 */
export const EXTENSII_STATICE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|css|js)$/i;

/**
 * Primul segment al unei cai („/floraria-mea/product/x" → „floraria-mea";
 * „/" → „"), DECODIFICAT.
 *
 * ⚠ DECODIFICAT, si iata de ce (04.09.2026). `request.nextUrl.pathname` pastreaza
 * codificarea procentuala asa cum a venit: pentru `/floraria%2Dmea` segmentul
 * brut e `floraria%2Dmea`, care nu e in baza, deci proxy-ul l-ar fi luat drept
 * „nu e magazin" — in timp ce Next decodifica parametrul rutei si serveste
 * vitrina `floraria-mea`, FARA `X-Robots-Tag`. Adica o adresa scrisa altfel
 * ocolea invarianta. Decodificarea aduce segmentul la forma in care il vede si
 * ruta, si baza.
 *
 * O secventa invalida (`%E0%A4%A`) arunca la decodificare; atunci se pastreaza
 * bruta — nici ruta nu ar putea-o potrivi cu un slug.
 */
export function primulSegment(pathname: string): string {
  const brut = pathname.split("/")[1] ?? "";
  if (!brut.includes("%")) return brut;
  try {
    return decodeURIComponent(brut);
  } catch {
    return brut;
  }
}
