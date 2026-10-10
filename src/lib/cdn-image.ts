// CDN transform for plain <img> tags (logo, cover/hero banners) that intentionally
// don't use next/image. Mirrors the next/image custom loader
// (src/lib/supabase-image-loader.ts): when NEXT_PUBLIC_CDN_URL is set and the URL
// is one of our R2 objects, return the Cloudflare edge-resized URL; otherwise
// return the URL untouched. Safe by construction — with no CDN env, or for any
// non-R2 / already-transformed URL, the original string is returned unchanged.

import { CALITATE, LATIMI_ECRAN, adresaDirectaVariantei, gazdaImaginiDirecte, latimeaDePeScara } from "./latimi-imagini";

const CDN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, "") || "";
/* ⚠ Citit LITERAL: Next inlocuieste in pachetul browserului doar `process.env.NEXT_PUBLIC_…` scris intreg. */
const DIRECTE = gazdaImaginiDirecte(process.env.NEXT_PUBLIC_IMAGINI_DIRECTE);

/** Cheia din depozit a unei adrese de imagine (CDN sau galeata bruta), sau `null`. O citeste si feedul Meta. */
export function extractR2Key(src: string): string | null {
  const marker = ".r2.dev/";
  const i = src.indexOf(marker);
  if (i !== -1) return src.slice(i + marker.length);
  if (CDN && src.startsWith(CDN + "/")) {
    const rest = src.slice(CDN.length + 1);
    if (rest.startsWith("cdn-cgi/")) return null;
    return rest;
  }
  return null;
}

/**
 * Edge-resized URL for an R2 image, at the given render width. Pass the largest
 * size the image is displayed at (account for 2x retina). Falls back to the
 * original URL whenever transformation isn't applicable, so call sites can wrap
 * any `src` without a guard.
 */
export function cdnImage(url: string, width: number, quality = CALITATE): string {
  /*
   * ⚠ NU SE MAI CERE `CDN` CA SA SE COMPUNA ADRESA. Cat timp iesirea era
   * `${CDN}/cdn-cgi/image/…`, fara variabila nu era ce compune, deci se intorcea adresa neatinsa
   * — adica poza INTREAGA, la marimea ei de pe disc. Acum iesirea e `/api/img`, o cale relativa a
   * noastra, care merge in orice mediu. `CDN` a ramas folositor doar ca sa se recunoasca cheia
   * dintr-o adresa scrisa pe domeniul lui.
   *
   * ⚠ Si o adresa deja transformata se lasa in pace: ar fi intrat a doua oara in optimizator.
   */
  if (!url || url.includes("/cdn-cgi/image/")) return url;
  const key = extractR2Key(url);
  if (!key) return url;
  /*
   * ⚠ LATIMEA URCA PE SCARA COMUNA, nu se ia cum a fost ceruta. Vezi `latimi-imagini.ts`: fiecare
   * numar scris de mana intr-o componenta insemna un fisier nou. Erau opt astfel de numere (64,
   * 96, 160, 256, 320, 480, 1600, 2560), niciunul comun cu latimile pe care le cere `next/image`
   * — deci un logo la 480 si un card la 640 erau doua fisiere pentru marimi pe care ochiul nu le
   * deosebeste.
   *
   * Apelantii pot cere in continuare orice numar, si asta e voit: locul de randare stie cat ii
   * trebuie, iar scara are grija sa nu iasa un fisier nou din asta.
   *
   * ⚠ SI SE TRECE PRIN `/api/img`, NU PRIN `/cdn-cgi/image/` — aceeasi hotarare ca in
   * `supabase-image-loader.ts`, unde e scrisa pe larg: redimensionatorul Cloudflare se plateste
   * lunar fiindca reseteaza contorul de transformari unice, pe cand varianta scrisa de noi in
   * depozit se face o data si ramane. Cele doua cai TREBUIE sa ramana la fel: despartite, aceeasi
   * poza s-ar fi facut de doua ori, o data pe fiecare drum.
   *
   * ⚠ CU `NEXT_PUBLIC_IMAGINI_DIRECTE` APRINS, adresa e cea directa a variantei, pe domeniul
   * Workerului — EXACT cea pe care o da si loaderul lui `next/image`. Vezi `adresaDirectaVariantei`.
   */
  const latime = latimeaDePeScara(width);
  const directa = adresaDirectaVariantei(DIRECTE, key, latime, quality);
  if (directa) return directa;
  return `/api/img?p=${encodeURIComponent(key)}&w=${latime}&q=${quality}`;
}

/**
 * `srcset` pe scara comuna pentru o imagine din depozit, sau `undefined` cand adresa nu e a
 * noastra (atunci `<img>` ramane doar cu `src`, ca inainte).
 *
 * ═══ ⚠ DE CE (09.10.2026) ═══
 *
 * Blocurile din editorul de pagini (imagine, galerie, hero, coloane, newsletter, pachete) puneau
 * adresa originalului direct in `<img>`: 200-600 KB pentru o poza aratata la cateva sute de pixeli,
 * pe telefon la fel ca pe desktop. Cu `srcset` + `sizes`, browserul alege singur treapta potrivita
 * ecranului lui, din aceleasi variante pe care le cer si cardurile de produs.
 *
 * ⚠ DOAR TREPTE DE PE SCARA: `latimi` trebuie sa fie din `LATIMI`. O latime din afara ar fi urcat
 * la urmatoarea, iar descriptorul `w` ar fi mintit browserul despre marimea fisierului.
 */
export function cdnSrcSet(url: string, latimi: readonly number[] = LATIMI_ECRAN, quality = CALITATE): string | undefined {
  if (!url || url.includes("/cdn-cgi/image/") || !extractR2Key(url) || esteGif(url)) return undefined;
  return latimi.map((w) => `${cdnImage(url, w, quality)} ${w}w`).join(", ");
}

/** Adresa se termina in `.gif` (fara interogare). */
function esteGif(url: string): boolean {
  return /\.gif$/i.test(url.split(/[?#]/)[0]);
}

/**
 * `cdnImage` pentru pozele puse de comerciant in BLOCURILE DE PAGINA — mai putin GIF-urile.
 *
 * ⚠ UN GIF RAMANE ORIGINALUL. Optimizatorul il face WebP cu `sharp`, care citeste doar PRIMUL
 * CADRU: un banner animat ar fi iesit o poza statica. Pana pe 09.10.2026 blocurile aratau
 * originalul, deci si GIF-ul animat; asa raman. (Pe 09.10.2026: niciun GIF in cele 35 de pagini.)
 */
export function imaginePagina(url: string, width: number): string {
  if (!url || esteGif(url)) return url;
  return cdnImage(url, width);
}
