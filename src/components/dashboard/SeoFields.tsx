"use client";

import { Globe } from "lucide-react";

// Google's own link blue — intentional: this mimics a Google result, not the app UI.
const SEO_BLUE = "#1a0dab";

/**
 * Live, Google-style SERP snippet so merchants see their title/description as
 * they type. Shared by the store SEO settings, the product editor and the page
 * editor so the preview looks identical everywhere.
 */
export function GooglePreview({ title, description, url }: { title: string; description: string; url: string }) {
  const display = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const host = display.split("/")[0];
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[12px] text-[#202124] truncate">{host}</div>
          <div className="text-[12px] text-[#5f6368] truncate">{display}</div>
        </div>
      </div>
      <div className="text-[18px] leading-snug truncate" style={{ color: SEO_BLUE }}>{title}</div>
      {description && <p className="text-[13px] text-[#4d5156] leading-snug mt-0.5 line-clamp-2">{description}</p>}
    </div>
  );
}

/**
 * Character counter that turns green only inside the ideal range [idealMin, max]
 * and red once it exceeds max (Google truncates past it).
 */
export function CharCounter({ len, idealMin, max }: { len: number; idealMin: number; max: number }) {
  const cls =
    len === 0 ? "text-muted-foreground"
    : len > max ? "text-destructive"
    : len >= idealMin ? "text-success"
    : "text-muted-foreground";
  return <span className={`text-[11px] font-medium tabular-nums ${cls}`}>{len}/{max}</span>;
}
