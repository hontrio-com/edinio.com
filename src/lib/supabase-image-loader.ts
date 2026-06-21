// Custom Next/Image loader.
//
// Our images live on Cloudflare R2. There are two serving modes, chosen at build
// time by whether NEXT_PUBLIC_CDN_URL is set:
//
// 1. CDN mode (NEXT_PUBLIC_CDN_URL set) — the R2 bucket is connected to a
//    Cloudflare custom domain with Image Transformations enabled. We serve through
//    Cloudflare's edge resizer:
//      <cdn>/cdn-cgi/image/width=W,quality=Q,format=auto/<key>
//    Resize + webp/avif happen at the edge, globally cached → effectively instant.
//
// 2. Fallback mode (no CDN env) — route through our self-hosted /api/img optimizer.
//    This is the current production behaviour, kept so the loader is safe to deploy
//    before the CDN domain exists and so flipping the env is fully reversible.
//
// In BOTH modes we extract the R2 object key from the stored URL — which may live on
// the public *.r2.dev domain (existing rows) or on the CDN domain (new uploads) — so
// no data migration is needed when the CDN is turned on.

const CDN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, "") || "";

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

  const q = quality ?? 75;
  if (CDN) {
    // Keys contain only [\w./-]; safe as a path segment, no encoding needed.
    return `${CDN}/cdn-cgi/image/width=${width},quality=${q},format=auto/${key}`;
  }
  return `/api/img?p=${encodeURIComponent(key)}&w=${width}&q=${q}`;
}
