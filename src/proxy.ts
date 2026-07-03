import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Hostnames that belong to the platform itself (not custom domains)
const PLATFORM_HOSTS = new Set([
  "localhost",
  "edinio.com",
  "www.edinio.com",
  "edinio.com",
  "www.edinio.com",
]);

function isPlatformHost(hostname: string): boolean {
  // Strip port for localhost:3000
  const bare = hostname.split(":")[0];
  if (PLATFORM_HOSTS.has(bare)) return true;
  // Vercel preview deploys
  if (bare.endsWith(".vercel.app")) return true;
  return false;
}

// First path segments on the platform host that are app/website routes (not
// storefront slugs). The custom-domain redirect below skips these.
const NON_STORE_SEGMENTS = new Set([
  "dashboard", "login", "register", "forgot-password", "reset-password",
  "onboarding", "admin",
  "despre", "preturi", "contact", "termeni", "cookies", "gdpr",
  "confidentialitate", "start", "migrare", "demo",
]);

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const bare = hostname.split(":")[0];

  // Editor live-preview loads /{slug}?preview=1 inside a same-origin iframe.
  // Both the www and custom-domain redirects below would send it cross-origin,
  // which X-Frame-Options: SAMEORIGIN then blocks ("refused to connect"). Keep
  // the preview on the current origin so it can be framed by the dashboard.
  const isPreview = request.nextUrl.searchParams.get("preview") === "1";

  // SEO: redirect non-www to www (permanent 301)
  if (bare === "edinio.com" && !isPreview) {
    const url = request.nextUrl.clone();
    url.host = "www.edinio.com";
    return NextResponse.redirect(url, 301);
  }

  // Custom domain routing: rewrite to /{slug} for public site
  if (!isPlatformHost(hostname)) {
    const bareHost = hostname.split(":")[0].toLowerCase();

    const { pathname } = request.nextUrl;

    // Metadata routes are served by the host-aware root handlers (sitemap.ts /
    // robots.ts), so don't rewrite them onto /{slug}.
    if (pathname === "/sitemap.xml" || pathname === "/robots.txt") {
      return NextResponse.next();
    }

    // Look up business by custom_domain. A visitor may arrive on the "www."
    // twin, whose canonical is the apex — match both and redirect www → apex so
    // the store resolves regardless of which the customer typed.
    const isWww = bareHost.startsWith("www.");
    const apexHost = isWww ? bareHost.slice(4) : bareHost;
    const candidates = isWww ? [bareHost, apexHost] : [bareHost];

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return []; }, setAll() {} } }
    );

    const { data: rows } = await supabase
      .from("businesses")
      .select("slug, custom_domain")
      .in("custom_domain", candidates)
      .eq("is_published", true);

    const exact = rows?.find((r) => r.custom_domain === bareHost) ?? null;
    const apexMatch = rows?.find((r) => r.custom_domain === apexHost) ?? null;

    // www is not itself the stored canonical → redirect to the apex, keeping path.
    if (!exact && isWww && apexMatch) {
      const target = new URL(`https://${apexHost}${pathname}`);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }

    const biz = exact ?? apexMatch;
    if (biz?.slug) {
      // Rewrite: custom-domain.ro/ → /slug, custom-domain.ro/produse → /slug/produse
      const rewritePath = pathname === "/" ? `/${biz.slug}` : `/${biz.slug}${pathname}`;
      const url = request.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url);
    }

    // Domain not found — show 404
    const url = request.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url);
  }

  // Platform host: if /{slug} is a published store with an active custom domain,
  // redirect visitors to that domain instead (its canonical home), keeping the path.
  if (bare !== "localhost" && !bare.endsWith(".vercel.app") && !isPreview) {
    const { pathname } = request.nextUrl;
    const firstSeg = pathname.split("/")[1] ?? "";
    if (firstSeg && !NON_STORE_SEGMENTS.has(firstSeg)) {
      const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return []; }, setAll() {} } },
      );
      const { data: store } = await supabase
        .from("businesses")
        .select("custom_domain")
        .eq("slug", firstSeg)
        .eq("is_published", true)
        .maybeSingle();
      if (store?.custom_domain) {
        const target = new URL(`https://${store.custom_domain}${pathname.slice(firstSeg.length + 1) || "/"}`);
        target.search = request.nextUrl.search;
        return NextResponse.redirect(target, 307);
      }
    }
  }

  // Platform host — normal auth middleware
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|css|js)$).*)",
  ],
};
