import { cache } from "react";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { incarcaAntetMagazin, setarileDin } from "@/lib/storefront/antet-magazin";
import { esteDomeniulPropriu } from "@/lib/platform-hosts";
import {
  PERMALINKURI_IMPLICITE, setareaPermalinkurilor,
  type FelPermalink, type SetarePermalinkuri,
} from "@/lib/storefront/permalinkuri";

/**
 * Prefixele magazinului, pe server.
 *
 * ⚠ NICIO INTEROGARE IN PLUS: `incarcaAntetMagazin` e deja cerut de layoutul
 * vitrinei in aceeasi randare (`cache` pe cerere) si aduce `page_content`.
 */
export const setareaPermalinkurilorMagazinului = cache(async (slug: string): Promise<SetarePermalinkuri> => {
  const rand = await incarcaAntetMagazin(slug);
  return setareaPermalinkurilor(setarileDin<{ page_content: unknown }>(rand)?.page_content);
});

type Interogare = Record<string, string | string[] | undefined>;

/**
 * Interogarea, scrisa cu `encodeURIComponent` (spatiul = `%20`), nu cu
 * `URLSearchParams` (spatiul = `+`): la fel ca `scrieFiltre` si canonicalele, ca
 * redirectionarea sa nu produca a doua adresa pentru acelasi continut.
 */
export function sirInterogare(sp: Interogare | undefined): string {
  if (!sp) return "";
  const parti: string[] = [];
  for (const [cheie, valoare] of Object.entries(sp)) {
    if (valoare === undefined) continue;
    for (const v of Array.isArray(valoare) ? valoare : [valoare]) {
      parti.push(`${encodeURIComponent(cheie)}=${encodeURIComponent(v)}`);
    }
  }
  return parti.length ? `?${parti.join("&")}` : "";
}

/**
 * Adresa CURENTA pentru un fel de pagina, pe gazda cererii: pe domeniul propriu
 * fara slug-ul magazinului, pe platforma cu el.
 */
export async function adresaCurenta(
  slug: string, fel: FelPermalink, restul: string[], sp?: Interogare,
): Promise<string> {
  const [rand, s, h] = await Promise.all([
    incarcaAntetMagazin(slug), setareaPermalinkurilorMagazinului(slug), headers(),
  ]);
  const basePath = esteDomeniulPropriu(h.get("host"), rand?.custom_domain ?? null) ? "" : `/${slug}`;
  const coada = restul.map((x) => `/${encodeURIComponent(x)}`).join("");
  return `${basePath}/${s[fel]}${coada}${sirInterogare(sp)}`;
}

/**
 * Pe rutele cu segmentul IMPLICIT (`/product/...`, `/magazin/...`, `/brand/...`):
 * daca magazinul si-a ales alt prefix, redirectionare permanenta (308) spre el.
 * Fara setare nu face nimic, deci magazinele de azi merg exact ca inainte.
 */
export async function redirectioneazaDacaPrefixulEAltul(
  slug: string, fel: FelPermalink, restul: string[], sp?: Interogare,
): Promise<void> {
  const s = await setareaPermalinkurilorMagazinului(slug);
  if (s[fel] === PERMALINKURI_IMPLICITE[fel]) return;
  permanentRedirect(await adresaCurenta(slug, fel, restul, sp));
}
