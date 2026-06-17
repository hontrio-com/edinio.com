/** Convert a YouTube/Vimeo watch URL into a privacy-friendly embed URL. */
export function videoEmbedUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
  );
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

/** Google Maps embed for an address or "lat,lng" — no API key required. */
export function mapEmbedUrl(query: string | undefined | null): string | null {
  const q = (query ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}
