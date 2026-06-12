import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { toEmbedUrl, isDirectVideo, type AnnouncementBlock } from "@/lib/announcements";

// Server component: renders announcement content blocks safely (text is sanitized,
// images/videos/buttons are rendered by React, not injected as HTML).
export function AnnouncementBlocks({ blocks }: { blocks: AnnouncementBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return <h3 key={i} className="text-lg font-bold text-foreground mt-2">{b.text}</h3>;
          case "text":
            return (
              <div
                key={i}
                className="policy-content text-sm text-muted-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(b.html) }}
              />
            );
          case "image":
            return (
              <figure key={i} className="my-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.url} alt={b.caption ?? ""} className="w-full rounded-xl border border-border" />
                {b.caption && <figcaption className="text-xs text-muted-foreground mt-1.5 text-center">{b.caption}</figcaption>}
              </figure>
            );
          case "video": {
            const embed = toEmbedUrl(b.url);
            if (embed) {
              return (
                <div key={i} className="aspect-video rounded-xl overflow-hidden border border-border bg-black">
                  <iframe
                    src={embed}
                    className="w-full h-full"
                    title="Video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            }
            if (isDirectVideo(b.url)) {
              return <video key={i} src={b.url} controls className="w-full rounded-xl border border-border" />;
            }
            return (
              <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm break-all">
                {b.url}
              </a>
            );
          }
          case "button":
            return (
              <a
                key={i}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                {b.label}
              </a>
            );
          case "divider":
            return <hr key={i} className="border-border my-2" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
