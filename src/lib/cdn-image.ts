// CDN transform for plain <img> tags (logo, cover/hero banners) that intentionally
// don't use next/image. Mirrors the next/image custom loader
// (src/lib/supabase-image-loader.ts): when NEXT_PUBLIC_CDN_URL is set and the URL
// is one of our R2 objects, return the Cloudflare edge-resized URL; otherwise
// return the URL untouched. Safe by construction — with no CDN env, or for any
// non-R2 / already-transformed URL, the original string is returned unchanged.

const CDN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, "") || "";

function extractR2Key(src: string): string | null {
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
export function cdnImage(url: string, width: number, quality = 75): string {
  if (!url || !CDN || url.includes("/cdn-cgi/image/")) return url;
  const key = extractR2Key(url);
  if (!key) return url;
  return `${CDN}/cdn-cgi/image/width=${width},quality=${quality},format=auto/${key}`;
}
