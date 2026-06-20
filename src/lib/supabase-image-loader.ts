// Custom Next/Image loader.
//
// Default: returns the original URL (no Vercel Image Optimization, no cost).
//
// When NEXT_PUBLIC_CF_IMAGE_RESIZE="true", images on the Cloudflare CDN
// (cdn.edinio.com — an R2 custom domain) are resized + converted to WebP/AVIF at
// the edge via Cloudflare Image Resizing (/cdn-cgi/image/...). This serves each
// grid card a thumbnail instead of the full-size original — the big speed win.
// Enable "Transformations" (Image Resizing) in the Cloudflare dashboard first,
// otherwise leave the flag off.
export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (
    process.env.NEXT_PUBLIC_CF_IMAGE_RESIZE === "true" &&
    src.includes("cdn.edinio.com") &&
    !src.includes("/cdn-cgi/")
  ) {
    try {
      const u = new URL(src);
      const opts = `width=${width},quality=${quality ?? 75},format=auto,fit=scale-down`;
      return `${u.origin}/cdn-cgi/image/${opts}${u.pathname}`;
    } catch {
      return src;
    }
  }
  return src;
}
