import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// Host-aware: each domain (platform or a merchant custom domain) advertises its
// own sitemap, so crawlers fetch the right one. headers() makes this dynamic.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() || "www.edinio.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/admin/",
          "/onboarding/",
          "/api/",
          "/auth/",
          "/login",
          "/register",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `https://${host}/sitemap.xml`,
  };
}
