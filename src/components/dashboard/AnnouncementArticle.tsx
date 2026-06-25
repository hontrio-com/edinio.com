"use client";

import { Pin } from "lucide-react";
import { toEmbedUrl, isDirectVideo, type AnnouncementBlock } from "@/lib/announcements";
import { formatDate } from "@/lib/utils/format";

export type ArticleData = {
  title: string;
  excerpt?: string | null;
  cover_url?: string | null;
  blocks: AnnouncementBlock[];
  is_pinned?: boolean;
  published_at?: string | null;
};

function Blocks({ blocks }: { blocks: AnnouncementBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return <h3 key={i} className="text-lg font-bold text-foreground mt-2">{b.text}</h3>;
          case "text":
            // From the dashboard this html is sanitized server-side; from the admin
            // preview it is the admin's own freshly-typed content.
            return (
              <div key={i} className="policy-content text-sm text-muted-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: b.html }} />
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
                  <iframe src={embed} className="w-full h-full" title="Video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              );
            }
            if (isDirectVideo(b.url)) return <video key={i} src={b.url} controls className="w-full rounded-xl border border-border" />;
            return b.url ? <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm break-all">{b.url}</a> : null;
          }
          case "button":
            return b.label ? (
              <a key={i} href={b.url || "#"} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
                {b.label}
              </a>
            ) : null;
          case "divider":
            return <hr key={i} className="border-border my-2" />;
          default:
            return null;
        }
      })}
    </div>
  );
}

export function AnnouncementArticle({ data, dateLabel }: { data: ArticleData; dateLabel?: string }) {
  return (
    <article className="bg-surface border border-border rounded-2xl overflow-hidden">
      {data.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.cover_url} alt="" className="w-full aspect-[16/9] object-cover" />
      )}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {data.is_pinned && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full">
              <Pin className="h-3 w-3" /> Important
            </span>
          )}
          {(dateLabel || data.published_at) && (
            <span className="text-xs text-muted-foreground">{dateLabel ?? formatDate(data.published_at!)}</span>
          )}
        </div>
        <h2 className="text-xl font-bold text-foreground break-words">{data.title || "Titlu anunt"}</h2>
        {data.excerpt && <p className="text-sm text-muted-foreground">{data.excerpt}</p>}
        <Blocks blocks={Array.isArray(data.blocks) ? data.blocks : []} />
      </div>
    </article>
  );
}
