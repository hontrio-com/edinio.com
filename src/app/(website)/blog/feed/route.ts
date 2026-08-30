import { articolePentruFeed } from "@/lib/blog/citire";
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
  /*
    ⚠ CITIRE PROPRIE, NU `paginaDeArticole`.

    Aceea ordonează `is_pinned` întâi — bun pentru `/blog`, unde un ghid de
    pornire trebuie să rămână sus. Într-un feed e greșit: un feed e un flux
    cronologic, nu o copie a așezării de pe pagină. Pe feedul de dinainte, un
    articol fixat din ianuarie stătea primul, iar cel de ieri al doilea.
  */
  const articole = await articolePentruFeed(CATE);

  const elemente = articole
    .map((a) => {
      const adresa = `${PLATFORM_ORIGIN}/blog/${a.slug}`;
      return `    <item>
      <title>${xml(a.title)}</title>
      <link>${xml(adresa)}</link>
      <guid isPermaLink="true">${xml(adresa)}</guid>
      ${a.published_at ? `<pubDate>${new Date(a.published_at).toUTCString()}</pubDate>` : ""}
      ${a.autor ? `<dc:creator>${xml(a.autor)}</dc:creator>` : ""}
      ${a.categorie ? `<category>${xml(a.categorie)}</category>` : ""}
      <description>${xml(a.excerpt)}</description>
    </item>`;
    })
    .join("\n");

  /*
    `lastBuildDate` e data celui mai proaspăt lucru din feed, nu `new Date()`.
    Aceeași regulă ca la `lastModified` din sitemap: un feed care spune „s-a
    schimbat chiar acum" la fiecare cerere nu mai spune nimic, iar cititorul
    învață să nu se mai uite la câmp.

    ⚠ SE IA MAXIMUL, NU PRIMUL ELEMENT. Înainte era `articole.find(...)` — adică
    data primului din listă. Cât timp lista era ordonată cu articolele fixate în
    față, primul putea fi un articol din ianuarie, deci `lastBuildDate` ieșea mai
    VECHE decât alte articole din același feed. Un cititor care se uită la data
    aceea crede că n-are ce prelua.

    ⚠ Și se ține seama și de `content_updated_at`: un articol vechi rescris azi
    chiar înseamnă că feedul s-a schimbat azi.
  */
  const ceaMaiNoua = articole.reduce<number>((max, a) => {
    for (const d of [a.published_at, a.content_updated_at]) {
      const t = d ? new Date(d).getTime() : NaN;
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max;
  }, 0);

  const corp = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Blogul Edinio</title>
    <link>${PLATFORM_ORIGIN}/blog</link>
    <atom:link href="${PLATFORM_ORIGIN}/blog/feed" rel="self" type="application/rss+xml" />
    <description>Cum vinzi online din România: livrare, plăți, marketplace-uri, facturare.</description>
    <language>ro-RO</language>
    ${ceaMaiNoua > 0 ? `<lastBuildDate>${new Date(ceaMaiNoua).toUTCString()}</lastBuildDate>` : ""}
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
