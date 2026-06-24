// Pure helpers to recognize our Cloudflare R2 object URLs and extract the object
// key. No AWS SDK or other server-only deps, so every layer (server actions, the
// import pipeline, media scan) shares ONE definition and stays correct no matter
// which of our equivalent origins a stored URL uses.
//
// The same R2 object can be referenced by several origins, all valid:
//   • R2_PUBLIC_URL       — the configured public base. Today the raw *.r2.dev
//                           bucket domain; may be switched to the CDN domain later.
//   • any *.r2.dev        — the raw bucket domain. Existing rows keep this even
//                           after R2_PUBLIC_URL is switched to the CDN domain.
//   • NEXT_PUBLIC_CDN_URL — the CDN custom domain (e.g. https://edinio-cdn.com),
//                           optionally with a Cloudflare "/cdn-cgi/image/<opts>/"
//                           edge-resize prefix (added by the image loader).
//
// Recognizing all of them means flipping R2_PUBLIC_URL to the CDN domain never
// orphans old r2.dev files on delete, nor re-downloads them during import dedupe.

const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
const CDN_URL = (process.env.NEXT_PUBLIC_CDN_URL ?? "").replace(/\/+$/, "");

// "cdn-cgi/image/width=…,quality=…,format=auto/products/x.webp" → "products/x.webp"
function stripEdgeResizePrefix(path: string): string {
  const m = /^cdn-cgi\/image\/[^/]*\/(.+)$/.exec(path);
  return m ? m[1] : path;
}

/**
 * The R2 object key (e.g. "products/uid/file.webp") if `url` points at one of our
 * R2 origins; null for anything else (external/local images, Supabase Storage, …).
 */
export function r2KeyFromUrl(url: string): string | null {
  if (typeof url !== "string" || !url) return null;

  // Raw bucket domain — matches regardless of the configured public base.
  const dev = url.indexOf(".r2.dev/");
  if (dev !== -1) return stripEdgeResizePrefix(url.slice(dev + ".r2.dev/".length)) || null;

  // Configured public base, or the CDN custom domain.
  for (const base of [PUBLIC_URL, CDN_URL]) {
    if (base && url.startsWith(base + "/")) {
      return stripEdgeResizePrefix(url.slice(base.length + 1)) || null;
    }
  }
  return null;
}

/** True if `url` is one of our R2 origins (any of the equivalent domains). */
export function isOurR2Url(url: string): boolean {
  return r2KeyFromUrl(url) !== null;
}
