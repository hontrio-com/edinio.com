// Custom loader — bypasses Vercel Image Optimization (no cost).
// Images served directly from Supabase Storage CDN + Cloudflare cache.
// To enable server-side resizing/WebP, turn on Image Transformations
// in Supabase Dashboard > Storage > Settings, then switch to /render/image/ endpoint.
export default function supabaseLoader({
  src,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  return src;
}
