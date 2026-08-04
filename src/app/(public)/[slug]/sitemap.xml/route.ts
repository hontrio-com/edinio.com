import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PLATFORM_ORIGIN, parseStoreSeo } from "@/lib/seo";
import { politiciIndexabile } from "@/lib/storefront/policy-index";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { SEGMENT_MAGAZIN, shopOnPage } from "@/lib/storefront/design/commerce";
import { slugCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";

import { connection } from "next/server";

// Max URLs per sitemap file (Google limit) — over it, the whole file is rejected.
const SITEMAP_URL_LIMIT = 50000;

// Per-store sitemap for stores WITHOUT a custom domain, served at
// edinio.com/{slug}/sitemap.xml, so the merchant can submit a clean, store-only
// sitemap in Google Search Console. Custom-domain stores are covered by the
// host-aware root app/sitemap.ts (proxy.ts serves /sitemap.xml directly on the
// domain, and redirects edinio.com/{slug}/sitemap.xml -> their domain for them).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Ruta citeste date la fiecare cerere — ca pana acum. `connection()` spune
  // asta explicit, ca prerandarea sa nu o execute in timpul build-ului.
  await connection();
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: biz } = await admin
    .from("businesses")
    .select("id, slug, updated_at, is_published, store_settings(page_content, storefront_design, store_policies)")
    .eq("slug", slug)
    .maybeSingle();
  if (!biz || !biz.is_published) {
    return new Response("Not found", { status: 404 });
  }

  const base = `${PLATFORM_ORIGIN}/${biz.slug}`;
  const entries: { loc: string; lastmod?: string }[] = [];

  // Homepage (skipped when the merchant set the store to noindex).
  if (parseStoreSeo(pageContent(biz.store_settings)).noindex !== true) {
    entries.push({ loc: base, lastmod: iso(biz.updated_at) });
  }

  /*
   * Pagina de catalog, cand magazinul si-a ales-o.
   *
   * E prima ruta-sectiune INDEXABILA: cosul si finalizarea sunt deliberat
   * noindex, fiindca sunt pasi ai cumpararii, dar asta e chiar catalogul
   * magazinului. Fara intrarea de aici, indexarea ei ar fi depins exclusiv de
   * linkuri interne.
   */
  if (shopOnPage(designPublicat(biz.store_settings))) {
    entries.push({ loc: `${base}/${SEGMENT_MAGAZIN}`, lastmod: iso(biz.updated_at) });
    /*
     * Si cate o intrare pentru fiecare categorie.
     *
     * De cand categoriile au pagini proprii, ele sunt cele mai valoroase adrese
     * ale magazinului dupa produse: „bocanci de protectie" e o cautare reala, iar
     * pagina care ii raspunde exista abia acum. Fara sitemap, ar fi depins de
     * cate linkuri interne apuca crawlerul sa urmeze prin meniuri.
     *
     * Categoriile fara produse intra si ele: sitemapul se genereaza dintr-o
     * singura interogare, iar numararea produselor pe categorie ar fi insemnat
     * citit catalogul intreg la fiecare cerere. O categorie goala e o pagina
     * corecta, doar goala.
     */
    const categorii = await fetchAllRows("slugSitemap.categories", (from, to) =>
      admin.from("categories").select("name").eq("business_id", biz.id).order("id").range(from, to),
    );
    const vazute = new Set<string>();
    for (const c of categorii) {
      const seg = slugCategorie(c.name ?? "");
      // Doua categorii pot da acelasi segment (diferenta e doar la diacritice):
      // in sitemap intra o singura data, fiindca e o singura pagina.
      if (!seg || vazute.has(seg)) continue;
      vazute.add(seg);
      entries.push({ loc: `${base}/${SEGMENT_MAGAZIN}/${seg}`, lastmod: iso(biz.updated_at) });
    }
  }

  // One Product Store: the homepage already represents the single product, so
  // its /product/* URLs are excluded (they 301 to the homepage / are noindex).
  if (parseStoreModeFromSettings(biz.store_settings).mode !== "one_product") {
    const products = await fetchAllRows("slugSitemap.products", (from, to) =>
      admin.from("products").select("slug, updated_at").eq("business_id", biz.id).eq("is_active", true).not("slug", "is", null).order("id").range(from, to),
    );
    for (const p of products) {
      if (!p.slug) continue;
      entries.push({ loc: `${base}/product/${encodeURIComponent(p.slug)}`, lastmod: iso(p.updated_at) });
    }
  }

  /*
   * Paginile de politici indexabile.
   *
   * Lipseau din sitemap fiindca erau `noindex`. Google Merchant Center cere retur
   * si termeni indexabili ca sa valideze contul, deci lipsa lor bloca reclama la
   * produse. Aceeasi functie decide si eticheta `robots` a paginii: doua reguli
   * scrise separat ar fi produs o pagina `noindex` listata in sitemap.
   */
  for (const tip of politiciIndexabile(pageContent(biz.store_settings), politici(biz.store_settings))) {
    entries.push({ loc: `${base}/politici/${tip}`, lastmod: iso(biz.updated_at) });
  }

  const pages = await fetchAllRows("slugSitemap.pages", (from, to) =>
    admin.from("custom_pages").select("slug, updated_at, seo").eq("business_id", biz.id).eq("is_published", true).order("id").range(from, to),
  );
  for (const pg of pages) {
    if (!pg.slug || (pg.seo as { noindex?: boolean } | null)?.noindex) continue;
    entries.push({ loc: `${base}/${encodeURIComponent(pg.slug)}`, lastmod: iso(pg.updated_at) });
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .slice(0, SITEMAP_URL_LIMIT)
      .map((e) => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`)
      .join("\n") +
    `\n</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function iso(d: string | null): string | undefined {
  return d ? new Date(d).toISOString() : undefined;
}

/**
 * Designul PUBLICAT al magazinului, din randul deja adus.
 *
 * Contextul e minimal: singura intrebare de aici e daca exista pagina de
 * catalog, iar aceea nu depinde de culori, de bannere sau de flagurile paginii
 * principale.
 */
function designPublicat(storeSettings: unknown) {
  const ss = storeSettings as { storefront_design?: unknown } | { storefront_design?: unknown }[] | null;
  const brut = ss ? (Array.isArray(ss) ? ss[0] : ss)?.storefront_design : null;
  return parseStoreDesign(brut, { primaryColor: "#1AB554", pageContent: {}, features: {} });
}

function politici(storeSettings: unknown): unknown {
  const ss = storeSettings as { store_policies?: unknown } | { store_policies?: unknown }[] | null;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.store_policies ?? null;
}

function pageContent(storeSettings: unknown): unknown {
  const ss = storeSettings as { page_content?: unknown } | { page_content?: unknown }[] | null;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
}
