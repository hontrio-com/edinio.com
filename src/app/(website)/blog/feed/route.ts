import { paginaDeArticole } from "@/lib/blog/citire";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * Feedul blogului, RSS 2.0.
 *
 * ⚠ NU E O MOFTURĂ DE MODĂ VECHE. Trei feluri de cititori îl folosesc și azi:
 * oamenii care își strâng lecturile într-un cititor de feeduri, uneltele care
 * duc articolele mai departe (Slack, Teams, automatizări), și — pentru noi, cel
 * mai important — crawlerele, care iau feedul ca listă de noutăți și se întorc
 * la el mai des decât la sitemap.
 *
 * ⚠ DOAR ARTICOLELE, NU ȘI PAGINILE DE RUBRICĂ. Un feed e un flux de lucruri
 * noi. Paginile de rubrică nu sunt lucruri noi, sunt liste.
 *
 * ⚠ SE TRIMITE REZUMATUL, NU ARTICOLUL ÎNTREG. Un feed cu tot textul înseamnă
 * că articolul se citește oriunde altundeva decât la noi — deci nimeni nu vede
 * îndemnul din el, iar Google poate găsi același text pe zece site-uri care ne
 * republică.
 */

/** Câte articole intră în feed. */
const CATE = 30;

/**
 * ⚠ SE SCAPĂ TOT CE INTRĂ ÎN XML.
 *
 * Un titlu care conține `&` sau `<` — „Livrare & retur", „Sub 24<h>" — face
 * feedul nevalid, iar un feed nevalid nu se strică pe jumătate: cititorul îl
 * refuză întreg. Iar textul vine din ce scrie un om în admin, deci se va
 * întâmpla.
 */
function xml(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    /* ⚠ Scris cu \u..., nu cu caracterele in sine: scrise ca atare sunt
       invizibile in fisier, si primul copy-paste le pierde. Tab, LF si CR
       raman, fiindca XML 1.0 le ingaduie. */
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export const revalidate = 3600;

export async function GET() {
  const { articole } = await paginaDeArticole(1, CATE);

  const elemente = articole
    .map((a) => {
      const adresa = `${PLATFORM_ORIGIN}/blog/${a.slug}`;
      return `    <item>
      <title>${xml(a.title)}</title>
      <link>${xml(adresa)}</link>
      <guid isPermaLink="true">${xml(adresa)}</guid>
      ${a.published_at ? `<pubDate>${new Date(a.published_at).toUTCString()}</pubDate>` : ""}
      ${a.autor?.name ? `<dc:creator>${xml(a.autor.name)}</dc:creator>` : ""}
      ${a.categorie?.name ? `<category>${xml(a.categorie.name)}</category>` : ""}
      <description>${xml(a.excerpt)}</description>
    </item>`;
    })
    .join("\n");

  /*
    `lastBuildDate` e data celui mai proaspăt articol, nu `new Date()`. Aceeași
    regulă ca la `lastModified` din sitemap: un feed care spune „s-a schimbat
    chiar acum" la fiecare cerere nu mai spune nimic, iar cititorul învață să nu
    se mai uite la câmp.
  */
  const ceaMaiNoua = articole.find((a) => a.published_at)?.published_at;

  const corp = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Blogul Edinio</title>
    <link>${PLATFORM_ORIGIN}/blog</link>
    <atom:link href="${PLATFORM_ORIGIN}/blog/feed" rel="self" type="application/rss+xml" />
    <description>Cum vinzi online din România: livrare, plăți, marketplace-uri, facturare.</description>
    <language>ro-RO</language>
    ${ceaMaiNoua ? `<lastBuildDate>${new Date(ceaMaiNoua).toUTCString()}</lastBuildDate>` : ""}
${elemente}
  </channel>
</rss>
`;

  return new Response(corp, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      /* Un ceas mai mult decât `revalidate`, ca marginea CDN-ului să nu ceară
         mai des decât se reface pagina. */
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
