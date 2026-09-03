/**
 * ═══ RETRAS PE 03.09.2026. NU SE REINTRODUCE. ═══
 *
 * Aici era sitemapul FIECARUI magazin fara domeniu propriu, servit la
 * `www.edinio.com/{slug}/sitemap.xml`, ca sa poata fi trimis in Search Console.
 * Politica s-a schimbat:
 *
 *   Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
 *   sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
 *
 * Un magazin fara domeniu propriu NU MAI ARE sitemap SEO. Nu are ce anunta:
 * toate paginile lui de pe platforma poarta `X-Robots-Tag: noindex` (pus de
 * `src/proxy.ts`), iar un sitemap care anunta adrese `noindex` e o contradictie
 * pe care Google o numara la sanatatea site-ului.
 *
 * Magazinul cu domeniu propriu isi are sitemapul la RADACINA domeniului lui —
 * `https://magazin-client.ro/sitemap.xml`, servit de `src/app/sitemap.ts`, care
 * stie de gazda — si robots.txt-ul lui il anunta. Cererea catre adresa veche de
 * pe platforma, pentru un asemenea magazin, e trimisa de proxy cu 307 catre
 * domeniul lui inainte sa ajunga aici, ca orice alta cale de sub `/{slug}`.
 *
 * ═══ DE CE 410 ═══
 *
 *   - NU 200 cu un `<urlset>` gol: un sitemap valid si gol ii spune lui Google
 *     „am hotarat sa nu mai am nicio adresa" si e pastrat tacut.
 *   - NU 404: ar insemna „poate revine". 410 inseamna „a fost, nu mai e".
 *   - Fara nicio citire din baza: ruta raspunde la fel pentru orice slug, deci
 *     nu mai are nici clasa de defecte „sitemap gol cu 200 cand cade o citire".
 *
 * `no-store`, ca niciun CDN sa nu-l tina, si `X-Robots-Tag: noindex`, ca adresa
 * insasi sa iasa din index.
 *
 * ⚠ Proba din `route.test.ts` cade daca ruta raspunde cu altceva decat 410.
 */

export const dynamic = "force-dynamic";

/** Corpul si antetele, intr-un singur loc, ca ruta si proba sa citeasca acelasi raspuns. */
export function raspunsRetras(): Response {
  return new Response(
    "Gone: magazinele de pe www.edinio.com nu mai au sitemap; sitemapul unui magazin traieste pe domeniul lui propriu.",
    {
      status: 410,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    },
  );
}

export async function GET() {
  return raspunsRetras();
}
