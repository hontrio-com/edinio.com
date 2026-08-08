import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isPlatformHost } from "@/lib/seo";
// Numarul de felii vine de la sursa lui, nu copiat: anuntate mai putine decat se
// randeaza, produsele din ultima felie n-ar fi gasite niciodata de crawler.
import { FELII } from "@/app/produse/sitemap";

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
    /*
     * Pe platforma se anunta SI feliile de produse.
     *
     * `generateSitemaps` le publica la `/produse/sitemap/N.xml`, dar nu le leaga
     * de nicaieri — robots.txt e locul unde un crawler afla ca exista. Fara ele,
     * paginile de produs ale platformei n-ar avea niciun sitemap.
     *
     * Pe domeniul unui comerciant nu se anunta: acolo `sitemap.xml` e deja al
     * magazinului lui, cu produsele lui.
     */
    sitemap: isPlatformHost(host)
      ? [`https://${host}/sitemap.xml`, ...Array.from({ length: FELII }, (_, i) => `https://${host}/produse/sitemap/${i}.xml`)]
      : `https://${host}/sitemap.xml`,
  };
}
