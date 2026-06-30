import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN, isPlatformHost, parseStoreSeo } from "@/lib/seo";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";

/** Whether a store's homepage opted out of indexing (Settings > SEO > noindex).
 *  Reads the nested store_settings(page_content) selected on a businesses row. */
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
      .select("id, updated_at, store_settings(page_content)")
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

    // One Product Store: the homepage already represents the single product, so
    // skip the individual /product/* URLs (the main one 301s to the homepage; the
    // rest are noindex). Custom pages below still get listed.
    if (parseStoreModeFromSettings(biz.store_settings).mode !== "one_product") {
      const { data: products } = await supabase
        .from("products")
        .select("slug, updated_at")
        .eq("business_id", biz.id)
        .eq("is_active", true)
        .not("slug", "is", null);

      for (const p of products ?? []) {
        if (!p.slug) continue;
        entries.push({
          url: `${base}/product/${p.slug}`,
          lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }

    const { data: pages } = await supabase
      .from("custom_pages")
      .select("slug, updated_at, seo")
      .eq("business_id", biz.id)
      .eq("is_published", true);
    for (const pg of pages ?? []) {
      if ((pg.seo as { noindex?: boolean } | null)?.noindex) continue;
      entries.push({
        url: `${base}/${pg.slug}`,
        lastModified: pg.updated_at ? new Date(pg.updated_at) : new Date(),
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
    return entries;
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

  const { data: businesses } = await createAdminClient()
    .from("businesses")
    .select("slug, updated_at, custom_domain, store_settings(page_content)")
    .eq("is_published", true);

  const businessPages: MetadataRoute.Sitemap = (businesses ?? [])
    .filter((b) => !b.custom_domain && !homepageNoindex(b))
    .map((b) => ({
      url: `${PLATFORM_ORIGIN}/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  // One Product Store homepages represent their single product, so their
  // /product/* URLs are excluded below (the main one 301s to the homepage; the
  // rest are noindex).
  const opsSlugs = new Set(
    (businesses ?? [])
      .filter((b) => parseStoreModeFromSettings(b.store_settings).mode === "one_product")
      .map((b) => b.slug),
  );

  const { data: products } = await supabase
    .from("products")
    .select("slug, updated_at, businesses!inner(slug, is_published, custom_domain)")
    .eq("is_active", true)
    .eq("businesses.is_published", true);

  const productPages: MetadataRoute.Sitemap = (products ?? [])
    .filter((p) => {
      const biz = p.businesses as unknown as { slug: string; custom_domain: string | null };
      return p.slug && !biz.custom_domain && !opsSlugs.has(biz.slug);
    })
    .map((p) => {
      const biz = p.businesses as unknown as { slug: string };
      return {
        url: `${PLATFORM_ORIGIN}/${biz.slug}/product/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      };
    });

  const { data: pages } = await supabase
    .from("custom_pages")
    .select("slug, updated_at, seo, businesses!inner(slug, is_published, custom_domain)")
    .eq("is_published", true)
    .eq("businesses.is_published", true);

  const customPagePages: MetadataRoute.Sitemap = (pages ?? [])
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

  return [...staticPages, ...businessPages, ...productPages, ...customPagePages];
}
