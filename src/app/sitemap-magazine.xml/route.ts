import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * INDEX de sitemap-uri: cate unul pentru fiecare magazin al platformei.
 *
 * ═══ DE CE ASA, SI NU CU PRODUSE IN SITEMAP-UL PLATFORMEI ═══
 *
 * Fiecare magazin ARE deja sitemap propriu, la `/{slug}/sitemap.xml`, cu
 * produsele, categoriile si paginile lui. Sitemap-ul platformei enumera pe
 * deasupra toate produsele tuturor magazinelor — aceleasi adrese, a doua oara,
 * dintr-o interogare care creste cu intreg catalogul platformei.
 *
 * Un index nu enumera nimic: spune doar unde sa se uite crawlerul. Costul lui
 * creste cu numarul de MAGAZINE (cateva mii, la tinta), nu cu numarul de produse
 * (milioane) — si fiecare magazin isi plateste singur enumerarea, cand chiar e
 * cerut. Asta e diferenta care conteaza la scara.
 *
 * ═══ MAGAZINELE CU DOMENIU PROPRIU NU SUNT AICI ═══
 *
 * Ele isi anunta sitemap-ul din `robots.txt`-ul PROPRIULUI domeniu (`robots.ts` e
 * host-aware), iar `sitemap.ts` il serveste acolo. Trecute si in indexul asta,
 * ar fi fost adrese pe alt domeniu intr-un index de pe edinio.com — ceea ce
 * Google accepta doar cu verificare incrucisata, si oricum ar fi insemnat sa
 * ceara aceleasi pagini pe doua cai.
 *
 * Mutarea la conectarea unui domeniu se face SINGURA: `/{slug}/sitemap.xml` de pe
 * platforma raspunde deja 307 catre domeniul propriu (verificat), iar magazinul
 * iese din interogarea de mai jos in aceeasi clipa.
 */

export const dynamic = "force-dynamic";

function xmlSafe(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const admin = createAdminClient();

  /*
   * O citire peste MAGAZINE, nu peste produse — asta e tot rostul fisierului.
   * `fetchAllRows` fiindca plafonul PostgREST de 1000 taie silentios, iar la
   * peste o mie de magazine indexul ar fi pierdut restul fara sa spuna nimic.
   */
  const magazine = await fetchAllRows("sitemapIndex.magazine", (from, to) =>
    admin
      .from("businesses")
      .select("slug, updated_at")
      .eq("is_published", true)
      .is("custom_domain", null)
      .order("id")
      .range(from, to));

  const corp = magazine
    .filter((b) => b.slug)
    .map((b) => {
      const lastmod = b.updated_at ? `\n    <lastmod>${new Date(b.updated_at).toISOString()}</lastmod>` : "";
      return `  <sitemap>\n    <loc>${xmlSafe(`${PLATFORM_ORIGIN}/${b.slug}/sitemap.xml`)}</loc>${lastmod}\n  </sitemap>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${corp}\n</sitemapindex>\n`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Indexul se schimba doar cand apare sau se publica un magazin. O ora e
      // destul de scurt pentru un magazin nou si destul de lung cat sa nu coste.
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
