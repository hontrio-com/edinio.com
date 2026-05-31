import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/editor/",
          "/store/",
          "/bookings/",
          "/orders/",
          "/products/",
          "/analytics/",
          "/settings/",
          "/onboarding/",
          "/api/",
        ],
      },
    ],
    sitemap: "https://edinio.com/sitemap.xml",
  };
}
