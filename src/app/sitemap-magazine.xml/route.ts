import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { proiectieDb } from "@/lib/storefront/catalog/din-proiectie";
import { logError } from "@/lib/error-logger";

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

/**
 * Ce se raspunde cand baza nu poate fi citita.
 *
 * NU 200 cu index gol. Un `sitemapindex` valid si fara niciun magazin ii spune
 * lui Google „am hotarat sa nu mai am nicio adresa", si asa a si citit-o doua
 * saptamani in august. 503 ii spune „mai incearca", ceea ce e adevarul.
 *
 * Si fara `cache-control`: golul de atunci s-ar fi pus in cache o ora pe CDN,
 * deci o sclipire de o secunda din baza ar fi tinut indexul gol de saizeci de ori
 * mai mult decat a durat defectiunea.
 */
async function indisponibil(e: unknown): Promise<Response> {
  // `await`: vezi nota din celelalte doua sitemapuri.
  await logError({
    action: "sitemapIndex",
    message: e instanceof Error ? e.message : "citirea a esuat",
    severity: "critical",
  });
  return new Response("sitemap temporar indisponibil", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET() {
  try {
    return await construieste();
  } catch (e) {
    return await indisponibil(e);
  }
}

async function construieste(): Promise<Response> {
  const admin = createAdminClient();

  /*
   * O citire peste MAGAZINE, nu peste produse — asta e tot rostul fisierului.
   * `fetchAllRows` fiindca plafonul PostgREST de 1000 taie silentios, iar la
   * peste o mie de magazine indexul ar fi pierdut restul fara sa spuna nimic.
   */
  const magazine = await fetchAllRowsStrict("sitemapIndex.magazine", (from, to) =>
    admin
      .from("businesses")
      .select("id, slug, updated_at")
      .eq("is_published", true)
      .is("custom_domain", null)
      .order("id")
      .range(from, to));

  /*
   * NUMAI magazinele care au ce arata.
   *
   * Masurat: din 57 de magazine publicate fara domeniu propriu, 27 n-au NICIUN
   * produs activ si inca 16 au unul sau doua. Anuntate toate, indexul ar fi trimis
   * Google la zeci de vitrine goale — „thin content" la scara, chiar pe domeniul
   * platformei, si tocmai semnalul care strica increderea in magazinele care chiar
   * au marfa.
   *
   * Numarul vine din `catalog_rezumat` (patru randuri pe magazin), nu dintr-un
   * `count` peste produse: aici trebuie sa ramana o citire care creste cu numarul
   * de MAGAZINE, altfel indexul reintroduce exact problema pe care o repara.
   *
   * Un magazin nou cu produse intra dupa prima trecere a cronului de rezumat,
   * adica in cel mult un minut. Pentru un sitemap, asta nu inseamna nimic.
   *
   * Paginile personalizate ale unui magazin fara produse nu se pierd: sunt deja
   * enumerate in `sitemap.ts`, sectiunea de `custom_pages`.
   */
  // `catalog_rezumat` nu e in tipurile generate, ca si celelalte tabele de
  // proiectie: se citeste prin `proiectieDb()`, tiparul casei.
  const { data: rezumate, error: eRezumat } = await proiectieDb()
    .from("catalog_rezumat")
    .select("business_id, total")
    .eq("fara_imagini", false)
    .eq("fara_stoc_ascuns", false)
    .gt("total", 0);
  /*
   * `error` VERIFICAT, nu `data ?? []`.
   *
   * Asta e chiar forma care a golit sitemapul: la o eroare, `data` e `null`,
   * `?? []` o preface intr-un raspuns valid, si iese un index gol cu cod 200.
   * O interogare care esueaza nu inseamna „niciun magazin n-are produse".
   */
  if (eRezumat) throw new Error(`catalog_rezumat: ${eRezumat.message}`);
  const cuProduse = new Set((rezumate ?? []).map((r) => (r as { business_id: string }).business_id));

  const corp = magazine
    .filter((b) => b.slug && cuProduse.has(b.id))
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
