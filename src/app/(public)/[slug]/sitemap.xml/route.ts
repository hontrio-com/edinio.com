import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PLATFORM_ORIGIN, parseStoreSeo } from "@/lib/seo";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";

export const dynamic = "force-dynamic";

// Max URLs per sitemap file (Google limit) — over it, the whole file is rejected.
const SITEMAP_URL_LIMIT = 50000;

// Per-store sitemap for stores WITHOUT a custom domain, served at
// edinio.com/{slug}/sitemap.xml, so the merchant can submit a clean, store-only
// sitemap in Google Search Console. Custom-domain stores are covered by the
// host-aware root app/sitemap.ts (proxy.ts serves /sitemap.xml directly on the
// domain, and redirects edinio.com/{slug}/sitemap.xml -> their domain for them).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: biz } = await admin
    .from("businesses")
    .select("id, slug, updated_at, is_published, store_settings(page_content)")
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

function pageContent(storeSettings: unknown): unknown {
  const ss = storeSettings as { page_content?: unknown } | { page_content?: unknown }[] | null;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
}
