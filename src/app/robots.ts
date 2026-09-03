import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isPlatformHost, bareHost } from "@/lib/platform-hosts";

/**
 * robots.txt, DUPA GAZDA. `headers()` il face dinamic, per cerere:
 *
 *   - pe www.edinio.com anunta sitemapul PLATFORMEI, si numai pe el: pagini de
 *     prezentare, preturi, ajutor, blog. Niciun magazin.
 *   - pe domeniul unui comerciant anunta sitemapul ACELUI magazin, servit tot de
 *     `app/sitemap.ts` la radacina domeniului lui.
 *
 * ═══ INVARIANTA (03.09.2026) ═══
 *
 * Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
 * sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
 *
 * ⚠ `sitemap-magazine.xml` NU SE MAI ANUNTA. Era indexul catre sitemapurile
 * magazinelor fara domeniu propriu; ruta raspunde acum 410 si nu se reintroduce
 * (vezi `app/sitemap-magazine.xml/route.ts`).
 *
 * ⚠ FARA `Disallow` PENTRU VITRINE. Pare mai simplu sa scrii aici
 * `Disallow: /{slug}`, dar ar fi pe dos: `Disallow` ii interzice lui Googlebot
 * sa ceara pagina, deci n-ar vedea niciodata `noindex`, iar o adresa interzisa
 * si linkuita de undeva poate ramane in index fara continut. Vitrinele de pe
 * platforma poarta `X-Robots-Tag: noindex` (pus de `src/proxy.ts`), si pentru
 * ca el sa lucreze pagina trebuie sa poata fi CITITA. Lista de mai jos ramane
 * strict aplicatia: panou, admin, autentificare, API.
 */

/** Caile aplicatiei pe care niciun crawler n-are ce cauta. Doar aplicatia; nicio vitrina. */
export const CAI_INTERZISE: readonly string[] = [
  "/dashboard/",
  "/admin/",
  "/onboarding/",
  "/api/",
  "/auth/",
  "/login",
  "/register",
  "/reset-password",
  "/forgot-password",
];

/**
 * Caile `Disallow:` dintr-un robots.txt SERVIT care NU sunt in `CAI_INTERZISE`.
 *
 * Pentru santinela, care citeste robots.txt-ul din productie si vrea sa stie
 * daca cineva a strecurat un `Disallow` pe o vitrina (`/{slug}`), ceea ce i-ar
 * ascunde lui Googlebot `noindex`-ul. Se compara cu ACEEASI lista care scrie
 * fisierul — prima forma a probei rescria lista intr-un regex si acuza chiar
 * `/login` si `/register`, la fiecare rulare.
 */
export function caiInterziseStraine(textRobots: string): string[] {
  const permise = new Set(CAI_INTERZISE);
  return [...textRobots.matchAll(/^Disallow:[ \t]*(\S+)[ \t]*$/gim)]
    .map((m) => m[1])
    .filter((cale) => !permise.has(cale));
}

/** Continutul lui robots.txt pentru o gazda. Pur, ca sa poata fi probat fara o cerere. */
export function robotsPentru(gazdaBruta: string | null | undefined): MetadataRoute.Robots {
  const host = bareHost(gazdaBruta ?? "") || "www.edinio.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...CAI_INTERZISE] }],
    // Un singur sitemap pe orice gazda: al platformei pe platforma, al
    // magazinului pe domeniul lui. `isPlatformHost` e sursa unica de adevar
    // pentru „a cui e gazda" (src/lib/platform-hosts.ts).
    sitemap: isPlatformHost(host) ? "https://www.edinio.com/sitemap.xml" : `https://${host}/sitemap.xml`,
  };
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsPentru((await headers()).get("host"));
}
