/**
 * ═══ RETRAS PE 03.09.2026. NU SE REINTRODUCE. ═══
 *
 * Aici era un INDEX de sitemapuri: cate o intrare `/{slug}/sitemap.xml` pentru
 * fiecare magazin al platformei fara domeniu propriu, ca Google sa le indexeze
 * produsele sub www.edinio.com. Politica s-a schimbat:
 *
 *   Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
 *   sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
 *
 * Un index care trimite crawlerul la adrese `noindex` ar fi o contradictie pe
 * care Search Console o raporteaza ca eroare si pe care Google o numara la
 * sanatatea site-ului. Deci indexul nu mai are ce enumera, si nu e „gol", e DUS.
 *
 * ═══ DE CE 410, SI NU ALTCEVA ═══
 *
 *   - NU redirect catre `/sitemap.xml`: ar spune „acelasi lucru s-a mutat", iar
 *     sitemapul platformei nu e acelasi lucru — nu contine niciun magazin.
 *   - NU 200 cu un `<sitemapindex>` gol: e chiar forma pe care Google a citit-o
 *     doua saptamani in august ca „am hotarat sa nu mai am nicio adresa", si o
 *     pastreaza tacut. Un raspuns valid si gol e cel mai rau raspuns posibil aici.
 *   - NU 404: 404 inseamna „poate revine". 410 inseamna „a fost, nu mai e" —
 *     Google scoate adresa din index mai repede si nu mai revine sa incerce.
 *
 * `Cache-Control: no-store`, ca niciun CDN sa nu tina raspunsul, si
 * `X-Robots-Tag: noindex`, ca adresa insasi sa nu ramana in index.
 *
 * ⚠ Proba din `route.test.ts` cade daca ruta raspunde cu altceva decat 410.
 * Cine vrea inapoi un index de magazine pe www.edinio.com contrazice invarianta
 * de mai sus si trebuie sa o schimbe intai pe ea, in
 * `src/lib/storefront/indexare-pe-platforma.ts`.
 */

export const dynamic = "force-dynamic";

/** Corpul si antetele, intr-un singur loc, ca ruta si proba sa citeasca acelasi raspuns. */
export function raspunsRetras(): Response {
  return new Response("Gone: indexul de sitemapuri al magazinelor a fost retras.", {
    status: 410,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export async function GET() {
  return raspunsRetras();
}
