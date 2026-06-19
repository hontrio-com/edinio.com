export interface VideoEmbedOptions {
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean; // default true; pass false to hide the player chrome
}

/**
 * Convert a YouTube/Vimeo watch URL into a privacy-friendly embed URL, honouring
 * autoplay/loop/mute/controls. Autoplay forces mute (browsers block autoplay with
 * sound), and YouTube loop needs `playlist=<id>` to actually repeat one video.
 */
export function videoEmbedUrl(
  url: string | undefined | null,
  opts: VideoEmbedOptions = {},
): string | null {
  if (!url) return null;
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  if (yt) {
    const id = yt[1];
    const p = new URLSearchParams({ rel: "0" });
    if (opts.autoplay) { p.set("autoplay", "1"); p.set("mute", "1"); }
    else if (opts.muted) p.set("mute", "1");
    if (opts.loop) { p.set("loop", "1"); p.set("playlist", id); }
    if (opts.controls === false) p.set("controls", "0");
    return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
  }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    const p = new URLSearchParams();
    if (opts.autoplay) { p.set("autoplay", "1"); p.set("muted", "1"); }
    else if (opts.muted) p.set("muted", "1");
    if (opts.loop) p.set("loop", "1");
    if (opts.controls === false) p.set("controls", "0");
    const q = p.toString();
    return `https://player.vimeo.com/video/${vm[1]}${q ? `?${q}` : ""}`;
  }
  return null;
}

/** Google Maps embed for an address or "lat,lng" — no API key required. */
export function mapEmbedUrl(query: string | undefined | null): string | null {
  const q = (query ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}
