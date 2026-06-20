// Server-only helpers for the Media Library: deep-scan arbitrary JSON for R2 URLs
// and classify media. Importing r2KeyFromUrl pulls in the R2 module (server-side
// env), so do NOT import this from client components.
import { r2KeyFromUrl } from "@/lib/r2";

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogv", "ogg"]);

/**
 * Recursively walk any JSON value and collect every string that is one of our R2
 * URLs. Block shapes vary (hero.bgImage, image.src, gallery.items[].src,
 * columns.items[].image, video.src/poster, product page_sections variants, …) —
 * walking generically catches them all and stays correct as shapes evolve.
 */
export function collectR2Urls(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (value == null) return out;
  if (typeof value === "string") {
    if (r2KeyFromUrl(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectR2Urls(v, out);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectR2Urls(v, out);
  }
  return out;
}

/** image vs video, inferred from the URL/key extension. */
export function inferMediaType(urlOrKey: string): "image" | "video" {
  const clean = urlOrKey.split("?")[0];
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXT.has(ext) ? "video" : "image";
}

/** Origin grouping used for the library filter (products|logos|covers|gallery|avatars|pages). */
export function inferFolder(key: string): string {
  if (key.includes("/pages/")) return "pages";
  const first = key.split("/")[0];
  return first || "other";
}
