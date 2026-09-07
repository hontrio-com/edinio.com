// Loaderul de imagini al lui `next/image`.
//
// Imaginile stau in R2. UN SINGUR DRUM: `/api/img`, optimizatorul nostru, care taie o data cu
// `sharp`, pastreaza varianta in depozit si de-atunci arata drumul catre ea printr-o redirectare
// `immutable`. Octetii vin de pe domeniul CDN, unde egressul e zero.
//
// ⚠ ERAU DOUA MODURI pana pe 07.09.2026, alese dupa `NEXT_PUBLIC_CDN_URL`: al doilea trecea prin
// `/cdn-cgi/image/`, redimensionatorul Cloudflare. A fost scos fiindca se plateste IN FIECARE
// LUNA — vezi motivarea intreaga la `imageLoader`, mai jos.
//
// Din cheia obiectului se citeste in continuare AMANDOUA formele de adresa stocata: domeniul
// public `*.r2.dev` (randurile vechi) si domeniul CDN (incarcarile noi). Deci nu e nevoie de
// nicio migrare de date, nici acum, nici cand s-a pornit CDN-ul.

import { CALITATE, cheieVarianta } from "./latimi-imagini";

const CDN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, "") || "";

/**
 * Cere browserul varianta DIRECT de pe domeniul CDN, sarind peste `/api/img`?
 *
 * ⚠ SE APRINDE NUMAI CU WORKERUL VIU. Vezi `infra/cloudflare/worker-variante-imagini.js`:
 * fara el, o varianta nefacuta inca da 404, adica o poza rupta pe vitrina.
 */
const DIRECT = process.env.NEXT_PUBLIC_IMAGINI_DIRECT === "1";

/** The object key (e.g. "products/uid/file.webp") if src is one of our R2 origins. */
function extractR2Key(src: string): string | null {
  const marker = ".r2.dev/";
  const i = src.indexOf(marker);
  if (i !== -1) return src.slice(i + marker.length);
  if (CDN && src.startsWith(CDN + "/")) {
    const rest = src.slice(CDN.length + 1);
    // Already a transformed URL — leave it alone.
    if (rest.startsWith("cdn-cgi/")) return null;
    return rest;
  }
  return null;
}

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // Don't re-wrap an already-optimized URL (our route or a CF transform).
  if (src.includes("/api/img") || src.includes("/cdn-cgi/image/")) return src;

  const key = extractR2Key(src);
  if (!key) return src; // non-R2 image (external/local) — pass through untouched

  const q = quality ?? CALITATE;

  /*
   * ═══ ⚠ UN SINGUR DRUM, SI DE CE NU MAI E CEL DE LA CLOUDFLARE ═══
   *
   * Aici se compunea `${CDN}/cdn-cgi/image/width=…/<cheie>`, adica redimensionatorul de la
   * marginea Cloudflare. Mergea bine si era rapid, dar se plateste IN FIECARE LUNA: Cloudflare
   * factureaza transformari UNICE (imagine × set de parametri) si reseteaza contorul lunar.
   * Rezultatul ramane in cache, dar in ciclul urmator se numara din nou — inchiriezi taietorul,
   * nu poza taiata. Masurat pe 07.09.2026: 8,50 $ dupa noua zile, proiectie 29,28 $ pe ciclu, pe
   * un catalog in care se crease-ra 79 de produse noi.
   *
   * `/api/img` face acelasi lucru O SINGURA DATA: taie cu `sharp`, PASTREAZA varianta in depozit
   * (`_optim/w<W>q<Q>/<cheie>.webp`) si de-atunci inainte doar arata drumul catre ea, cu o
   * redirectare `immutable`. Octetii vin tot de pe domeniul CDN, unde egressul e zero — deci nu
   * schimbam un cost pe altul.
   *
   * ⚠ MASURAT PE PRODUCTIE INAINTE DE COMUTARE, pe aceeasi poza si aceeasi latime: varianta
   * noastra 28.506 octeti (WebP), Cloudflare 29.263 (AVIF). Nu se plateste in greutate.
   *
   * ⚠ `NEXT_PUBLIC_CDN_URL` RAMANE FOLOSITOR, doar isi schimba rostul: nu mai alege calea de
   * aici, ci e gazda catre care redirecteaza `/api/img`. De-aia `extractR2Key` il citeste in
   * continuare — adresele noi sunt scrise pe domeniul CDN.
   *
   * ═══ ⚠ SI CALEA DIRECTA, CAT TIMP E APARATA DE WORKER ═══
   *
   * Redirectarea costa un salt: masurat din Romania, pe conexiune calda, 62 ms pana la marginea
   * Vercel plus 14 ms pana la Cloudflare — fata de 24 ms cat lua drumul de dinainte. Cerut direct,
   * obiectul vine in 14 ms, adica MAI REPEDE decat inainte de toata lucrarea.
   *
   * ⚠ DAR ASA O VARIANTA NEFACUTA INCA DA 404, adica o POZA RUPTA. De-aia calea directa se
   * aprinde numai dupa ce Workerul din `infra/cloudflare/worker-variante-imagini.js` e viu pe
   * `edinio-cdn.com/_optim/*`: el prinde 404-ul, cere originii sa faca varianta, si o serveste.
   *
   * ⚠ STEAGUL E STINS DIN OFICIU, si asta e chiar rostul lui: codul poate pleca in productie
   * inaintea Workerului fara sa schimbe nimic. Se aprinde cand Cloudflare e gata, se stinge daca
   * ceva scartaie — si se stinge INTAI el, si abia apoi se scoate Workerul.
   */
  if (DIRECT && CDN) return `${CDN}/${cheieVarianta(key, width, q)}`;

  return `/api/img?p=${encodeURIComponent(key)}&w=${width}&q=${q}`;
}
