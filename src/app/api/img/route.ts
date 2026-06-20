import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getFromR2, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

// Only allow our own upload prefixes + image extensions — the route must not be
// usable to resize arbitrary objects.
const KEY_RE = /^(products|gallery|logos|covers|avatars)\/[\w./-]+\.(webp|jpe?g|png|gif|avif)$/i;

/**
 * Self-hosted image optimizer. Resizes an R2-hosted image to the requested width
 * (WebP) the first time it's requested, caches the variant back on R2, and serves
 * it with an immutable cache header (so Vercel's edge + the browser cache it). If
 * anything fails, it falls back to the original full-size image, so a product
 * image never breaks.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get("p") ?? "";
  const width = Math.min(2048, Math.max(16, parseInt(sp.get("w") ?? "", 10) || 0));
  const quality = Math.min(100, Math.max(1, parseInt(sp.get("q") ?? "", 10) || 75));

  const originalUrl = key && R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : null;
  const fallback = () =>
    originalUrl ? NextResponse.redirect(originalUrl, 302) : new NextResponse("Not found", { status: 404 });

  if (!key || key.includes("..") || !width || !KEY_RE.test(key)) return fallback();

  try {
    const variantKey = `_optim/w${width}q${quality}/${key}.webp`;

    let out = await getFromR2(variantKey);
    if (!out) {
      const original = await getFromR2(key);
      if (!original) return fallback();
      out = await sharp(original)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      try { await uploadToR2(out, variantKey, "image/webp"); } catch { /* caching is best-effort */ }
    }

    return new NextResponse(new Uint8Array(out), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return fallback();
  }
}
