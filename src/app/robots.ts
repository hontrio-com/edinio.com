import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
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
    sitemap: "https://www.edinio.com/sitemap.xml",
  };
}
