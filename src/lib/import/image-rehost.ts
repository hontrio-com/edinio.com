// Download remote product images and re-host them on R2 (edinio-cdn.com), so a
// store stays intact if the source CDN later blocks hotlinking or disappears.
// Server-only. DB iteration lives in the committer; this module is fetch + upload.

import { uploadToR2 } from "@/lib/r2";
import { isOurR2Url } from "@/lib/r2-url";
import { detectImageMime } from "@/lib/utils/file-signature";
import { safeFetchImage } from "./ssrf";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Tipul REAL al fisierului, citit din primii octeti.
 *
 * `detectImageMime` nu cunoaste AVIF (lista lui de marci ISO-BMFF se opreste la
 * HEIC), iar AVIF e in `EXT_BY_TYPE` de la inceput. Fara ramura de mai jos, orice
 * furnizor care serveste .avif ar ramane brusc negazduit — de aceea completarea
 * sta aici, si nu prin schimbarea helperului comun folosit de incarcarile din
 * formular.
 */
function tipRealImagine(buffer: Buffer): string | null {
  const detectat = detectImageMime(buffer);
  if (detectat) return detectat;

  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const marca = buffer.toString("ascii", 8, 12).toLowerCase();
    if (marca === "avif" || marca === "avis") return "image/avif";
  }
  return null;
}

/** True if a URL already points at our own R2 bucket (already rehosted). */
export function isR2Url(url: string): boolean {
  return isOurR2Url(url);
}

/** Does this product still have any externally-hosted image? */
export function needsRehost(images: string[]): boolean {
  return images.some((u) => !isR2Url(u));
}

/**
 * Rehost a single external image URL to R2. Returns the new R2 URL, or the
 * original URL on failure (best-effort: a broken rehost never drops the image).
 * `cache` dedupes identical URLs within one processing chunk.
 */
export async function rehostImageUrl(
  url: string,
  businessId: string,
  importId: string,
  cache: Map<string, string>,
): Promise<{ url: string; ok: boolean }> {
  if (isR2Url(url)) return { url, ok: true };
  const cached = cache.get(url);
  if (cached) return { url: cached, ok: true };

  const result = await safeFetchImage(url);
  if ("error" in result) return { url, ok: false };

  /*
   * Tipul se ia din OCTETI, nu din antetul serverului strain — exact ca la
   * incarcarile prin formular (/api/upload). Antetul e ales de cel care serveste
   * fisierul: cu `Content-Type: image/png` peste orice continut, comerciantul isi
   * putea gazdui octeti arbitrari pe CDN-ul platformei, cu eticheta pusa de el.
   * Tot tipul detectat se scrie si in R2.
   *
   * SVG lipseste dinadins din EXT_BY_TYPE (poate purta scripturi).
   */
  const tipReal = tipRealImagine(result.buffer);
  const ext = tipReal ? EXT_BY_TYPE[tipReal] : undefined;
  if (!tipReal || !ext) return { url, ok: false };

  const key = `products/${businessId}/imported/${importId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}.${ext}`;

  try {
    const r2Url = await uploadToR2(result.buffer, key, tipReal);
    cache.set(url, r2Url);
    return { url: r2Url, ok: true };
  } catch {
    return { url, ok: false };
  }
}

/**
 * Rehost every external image of one product. Returns the rewritten URL list
 * plus how many succeeded/failed (for progress + the error report).
 */
export async function rehostProductImages(
  images: string[],
  businessId: string,
  importId: string,
  cache: Map<string, string>,
): Promise<{ images: string[]; done: number; failed: number }> {
  const out: string[] = [];
  let done = 0;
  let failed = 0;

  for (const url of images) {
    if (isR2Url(url)) {
      out.push(url);
      continue;
    }
    const res = await rehostImageUrl(url, businessId, importId, cache);
    out.push(res.url);
    if (res.ok) done++;
    else failed++;
  }

  return { images: out, done, failed };
}
