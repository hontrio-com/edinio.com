// Shared types + helpers for the Noutati (announcements) system.

export type AnnouncementBlock =
  | { type: "heading"; text: string }
  | { type: "text"; html: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "video"; url: string }
  | { type: "button"; label: string; url: string }
  | { type: "divider" };

export type Announcement = {
  id: string;
  title: string;
  excerpt: string | null;
  blocks: AnnouncementBlock[];
  cover_url: string | null;
  is_published: boolean;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Convert a YouTube / Vimeo / Loom watch URL into an embeddable iframe src.
 * Returns null if the URL is not a recognised provider (caller then treats it
 * as a direct video file or a plain link).
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "loom.com" && u.pathname.includes("/share/")) {
      const id = u.pathname.split("/share/")[1]?.split("/")[0];
      if (id) return `https://www.loom.com/embed/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url.trim());
}
