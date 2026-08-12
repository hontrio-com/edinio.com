import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN, isPlatformHost, parseStoreSeo } from "@/lib/seo";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { SEGMENT_MAGAZIN, shopOnPage } from "@/lib/storefront/design/commerce";
import { politiciIndexabile } from "@/lib/storefront/policy-index";
import { slugCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { categoriiVizibile } from "@/lib/categories/vizibilitate";

// Un fisier de sitemap accepta maxim 50.000 de URL-uri (limita Google) —
// peste, fisierul intreg e respins. Pastram ordinea de prioritate
// static → magazine → produse → pagini si taiem la limita.
const SITEMAP_URL_LIMIT = 50000;

/** Whether a store's homepage opted out of indexing (Settings > SEO > noindex).
 *  Reads the nested store_settings(page_content) selected on a businesses row. */
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

function pcDinRand(row: { store_settings?: unknown }): unknown {
  const ss = row.store_settings as { page_content?: unknown } | { page_content?: unknown }[] | null | undefined;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
}

function politiciDinRand(row: { store_settings?: unknown }): unknown {
  const ss = row.store_settings as { store_policies?: unknown } | { store_policies?: unknown }[] | null | undefined;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.store_policies ?? null;
}

function homepageNoindex(row: { store_settings?: unknown }): boolean {
  const ss = row.store_settings as { page_content?: unknown } | { page_content?: unknown }[] | null | undefined;
  if (!ss) return false;
  const pc = (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
  return parseStoreSeo(pc).noindex === true;
}

// Host-aware. Using headers() makes this dynamic (per request), so:
//  - a merchant custom domain gets a sitemap of ONLY that store's pages, on its
//    own domain;
//  - the platform sitemap (www.edinio.com) lists marketing pages + stores that
//    do NOT have a custom domain (those live on, and index under, their domain).

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const supabase = await createClient();

  // ── Custom domain: only this store's pages, on its own domain ──────────────
  if (!isPlatformHost(host)) {
    const { data: biz } = await createAdminClient()
      .from("businesses")
      .select("id, updated_at, store_settings(page_content, storefront_design, store_policies)")
      .eq("custom_domain", host)
      .eq("is_published", true)
      .single();
    if (!biz) return [];

    const base = `https://${host}`;
    // Skip the homepage entry when the merchant set it to noindex (Settings > SEO);
    // its products/pages can still be indexable, so they stay below.
    const entries: MetadataRoute.Sitemap = homepageNoindex(biz)
      ? []
      : [{ url: base, lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(), changeFrequency: "weekly", priority: 1 }];

    // Pagina de catalog, cand magazinul si-a ales-o. Prima ruta-sectiune
    // indexabila: cosul si finalizarea sunt deliberat noindex, dar asta e chiar
    // catalogul magazinului.
    if (shopOnPage(designPublicat(biz.store_settings))) {
      entries.push({
        url: `${base}/${SEGMENT_MAGAZIN}`,
        lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(),
        changeFrequency: "daily",
        priority: 0.9,
      });
      // Si paginile de categorie: de cand exista, ele sunt adresele care
      // raspund cautarilor de tip „bocanci de protectie". Cele stinse din panou
      // ies — pagina lor raspunde 404.
      const categorii = categoriiVizibile(await fetchAllRowsStrict("sitemap.store.categories", (from, to) =>
        supabase.from("categories").select("id, name, parent_id, is_active").eq("business_id", biz.id).order("id").range(from, to)
      ));
      const vazute = new Set<string>();
      for (const c of categorii) {
        const seg = slugCategorie(c.name ?? "");
        if (!seg || vazute.has(seg)) continue;
        vazute.add(seg);
        entries.push({
          url: `${base}/${SEGMENT_MAGAZIN}/${seg}`,
          lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(),
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    }

    // One Product Store: the homepage already represents the single product, so
    // skip the individual /product/* URLs (the main one 301s to the homepage; the
    // rest are noindex). Custom pages below still get listed.
    if (parseStoreModeFromSettings(biz.store_settings).mode !== "one_product") {
      const products = await fetchAllRowsStrict("sitemap.store.products", (from, to) =>
        supabase
          .from("products")
          .select("slug, updated_at")
          .eq("business_id", biz.id)
          .eq("is_active", true)
          .not("slug", "is", null)
          .order("id")
          .range(from, to)
      );

      for (const p of products) {
        if (!p.slug) continue;
        entries.push({
          url: `${base}/product/${p.slug}`,
          lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }

    // Paginile de politici indexabile. Vezi `politiciIndexabile`: aceeasi functie
    // decide si eticheta `robots` a paginii, ca sitemapul si pagina sa nu spuna
    // lucruri diferite.
    for (const tip of politiciIndexabile(pcDinRand(biz), politiciDinRand(biz))) {
      entries.push({
        url: `${base}/politici/${tip}`,
        lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(),
        changeFrequency: "yearly",
        priority: 0.3,
      });
    }

    const pages = await fetchAllRowsStrict("sitemap.store.pages", (from, to) =>
      supabase
        .from("custom_pages")
        .select("slug, updated_at, seo")
        .eq("business_id", biz.id)
        .eq("is_published", true)
        .order("id")
        .range(from, to)
    );
    for (const pg of pages) {
      if ((pg.seo as { noindex?: boolean } | null)?.noindex) continue;
      entries.push({
        url: `${base}/${pg.slug}`,
        lastModified: pg.updated_at ? new Date(pg.updated_at) : new Date(),
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
    return entries.slice(0, SITEMAP_URL_LIMIT);
  }

  // ── Platform (www.edinio.com): marketing + stores WITHOUT a custom domain ──
  const staticPages: MetadataRoute.Sitemap = [
    { url: PLATFORM_ORIGIN, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${PLATFORM_ORIGIN}/preturi`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${PLATFORM_ORIGIN}/despre`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${PLATFORM_ORIGIN}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${PLATFORM_ORIGIN}/termeni`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${PLATFORM_ORIGIN}/confidentialitate`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${PLATFORM_ORIGIN}/cookies`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${PLATFORM_ORIGIN}/gdpr`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  const admin = createAdminClient();
  const businesses = await fetchAllRowsStrict("sitemap.platform.businesses", (from, to) =>
    admin
      .from("businesses")
      .select("slug, updated_at, custom_domain, store_settings(page_content, storefront_design)")
      .eq("is_published", true)
      .order("id")
      .range(from, to)
  );

  const businessPages: MetadataRoute.Sitemap = businesses
    .filter((b) => !b.custom_domain && !homepageNoindex(b))
    .map((b) => ({
      url: `${PLATFORM_ORIGIN}/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const paginiDeCatalog: MetadataRoute.Sitemap = businesses
    .filter((b) => !b.custom_domain && !homepageNoindex(b) && shopOnPage(designPublicat(b.store_settings)))
    .map((b) => ({
      url: `${PLATFORM_ORIGIN}/${b.slug}/${SEGMENT_MAGAZIN}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    }));

  // One Product Store homepages represent their single product, so their
  // /product/* URLs are excluded below (the main one 301s to the homepage; the
  // rest are noindex).
  const opsSlugs = new Set(
    businesses
      .filter((b) => parseStoreModeFromSettings(b.store_settings).mode === "one_product")
      .map((b) => b.slug),
  );

  /*
   * PRODUSELE NU MAI SUNT AICI. Vezi `app/produse/sitemap.ts`.
   *
   * Se citeau toate, ale tuturor magazinelor publicate, ca sa se pastreze primele
   * 50.000 — la cinci milioane de produse, cinci milioane de randuri aduse in
   * memoria functiei ca sa se arunce 99%. Si e o ruta PUBLICA, deci oricine o
   * putea declansa.
   *
   * Acum sunt taiate in felii de 45.000 cu `generateSitemaps`, fiecare citindu-si
   * exact fereastra ei. Feliile se anunta din `robots.txt`.
   */
  const pages = await fetchAllRowsStrict("sitemap.platform.pages", (from, to) =>
    supabase
      .from("custom_pages")
      // Relatia numita explicit, ca la sitemap-ul de produse: aici nu e (inca)
      // ambigua, dar o tabela noua cu chei straine catre `custom_pages` si
      // `businesses` ar face-o, iar simptomul ar fi tot un sitemap gol cu 200.
      .select("slug, updated_at, seo, businesses!custom_pages_business_id_fkey!inner(slug, is_published, custom_domain)")
      .eq("is_published", true)
      .eq("businesses.is_published", true)
      .order("id")
      .range(from, to)
  );

  const customPagePages: MetadataRoute.Sitemap = pages
    .filter((p) => !(p.businesses as unknown as { custom_domain: string | null }).custom_domain)
    .filter((p) => !(p.seo as { noindex?: boolean } | null)?.noindex)
    .map((p) => {
      const biz = p.businesses as unknown as { slug: string };
      return {
        url: `${PLATFORM_ORIGIN}/${biz.slug}/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      };
    });

  return [...staticPages, ...businessPages, ...paginiDeCatalog, ...customPagePages].slice(0, SITEMAP_URL_LIMIT);
}
