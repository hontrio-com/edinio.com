// Custom Next/Image loader.
//
// Our images live on R2 (the default *.r2.dev domain), which can't use Cloudflare
// or Vercel image optimization for free. So we route them through our own
// optimizer at /api/img, which resizes to the requested width + converts to WebP
// once, caches the variant back on R2, and serves it cached. Non-R2 images (rare)
// pass through untouched.
export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const marker = ".r2.dev/";
  const i = src.indexOf(marker);
  if (i !== -1 && !src.includes("/api/img")) {
    const key = src.slice(i + marker.length);
    return `/api/img?p=${encodeURIComponent(key)}&w=${width}&q=${quality ?? 75}`;
  }
  return src;
}
