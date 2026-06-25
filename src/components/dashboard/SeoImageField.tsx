"use client";

import { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Reusable OG / social-share image picker. Uploads to the "covers" bucket under
 * the given folder and returns the public URL (or null when cleared); also
 * accepts a pasted URL. Shared by the page builder and the store SEO settings.
 */
export function SeoImageField({
  value,
  onChange,
  folder = "og",
  hint = "Incarca imagine (rec. 1200×630px)",
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  folder?: string;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function onFile(file: File) {
    setBusy(true);
    const { uploadImage } = await import("@/lib/upload");
    const res = await uploadImage(file, "covers", folder);
    setBusy(false);
    if ("url" in res) onChange(res.url);
  }
  return (
    <div>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full max-h-32 object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-border flex items-center justify-center"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <label className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 py-4 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
          <span className="text-[11px] text-muted-foreground">{busy ? "Se incarca..." : hint}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
      )}
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder="sau lipeste un URL" className={`${inputCls} mt-2 text-xs`} />
    </div>
  );
}
