// Server-only helpers for the Media Library: classify media URLs and deep-scan
// arbitrary JSON for them. The store has TWO storage backends: Cloudflare R2 (new
// uploads) and legacy Supabase Storage (older images, still referenced by many
// products). The library must catalog both. Do NOT import from client components.
import { r2KeyFromUrl } from "@/lib/r2";

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogv", "ogg"]);

export type StorageProvider = "r2" | "supabase";
export interface ParsedMedia {
  provider: StorageProvider;
  /** Object key: R2 key, or `bucket/path` for Supabase Storage. */
  key: string;
}

function supabasePublicPrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/` : null;
}

/**
 * Identify a media URL as one of our storage objects (R2 or Supabase Storage) and
 * extract its key. Returns null for anything else (external URLs, data URIs, …).
 */
export function parseMediaUrl(url: string): ParsedMedia | null {
  if (typeof url !== "string" || !url) return null;
  const r2 = r2KeyFromUrl(url);
  if (r2) return { provider: "r2", key: r2 };
  const sb = supabasePublicPrefix();
  if (sb && url.startsWith(sb)) {
    // Strip any querystring; the key is `bucket/path/to/file.ext`.
    return { provider: "supabase", key: url.slice(sb.length).split("?")[0] };
  }
  return null;
}

/**
 * Recursively walk any JSON value and collect every string that is one of our
 * storage URLs (R2 or Supabase). Block/variant shapes vary wildly — walking
 * generically catches them all and stays correct as shapes evolve.
 */
export function collectMediaUrls(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (value == null) return out;
  if (typeof value === "string") {
    if (parseMediaUrl(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectMediaUrls(v, out);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectMediaUrls(v, out);
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
