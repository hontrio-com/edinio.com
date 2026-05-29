import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Hostnames that belong to the platform itself (not custom domains)
const PLATFORM_HOSTS = new Set([
  "localhost",
  "edinio.ro",
  "www.edinio.ro",
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

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";

  // Custom domain routing: rewrite to /{slug} for public site
  if (!isPlatformHost(hostname)) {
    const bareHost = hostname.split(":")[0].toLowerCase();

    const { pathname } = request.nextUrl;

    // Look up business by custom_domain
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return []; }, setAll() {} } }
    );

    const { data: biz } = await supabase
      .from("businesses")
      .select("slug")
      .eq("custom_domain", bareHost)
      .eq("is_published", true)
      .single();

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

  // Platform host — normal auth middleware
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
