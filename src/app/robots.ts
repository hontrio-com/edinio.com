import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isPlatformHost } from "@/lib/seo";

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
     * Pe platforma se anunta DOUA: sitemap-ul ei (pagini statice + vitrinele
     * magazinelor) si INDEXUL, care trimite la sitemap-ul fiecarui magazin.
     *
     * Produsele nu apar in niciunul dintre ele: fiecare magazin isi enumera
     * singur produsele, in `/{slug}/sitemap.xml`. Un index nu enumera nimic, deci
     * costul lui creste cu numarul de magazine, nu cu numarul de produse.
     *
     * Pe domeniul unui comerciant se anunta doar `sitemap.xml`: acolo el E deja
     * sitemap-ul magazinului, cu produsele lui. Iar cand un magazin isi conecteaza
     * domeniul, iese singur din indexul platformei si intra aici — fara nicio
     * interventie.
     */
    sitemap: isPlatformHost(host)
      ? [`https://${host}/sitemap.xml`, `https://${host}/sitemap-magazine.xml`]
      : `https://${host}/sitemap.xml`,
  };
}
