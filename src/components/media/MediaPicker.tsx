"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Upload, Search, X, Loader2, Film, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { listMedia, type MediaRow } from "@/lib/actions/media.actions";

export interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen public URLs when the user confirms. */
  onSelect: (urls: string[]) => void;
  /** Allow choosing more than one file. Default false. */
  multiple?: boolean;
  /** Restrict to images, videos, or both. Default "image". */
  accept?: "image" | "video" | "all";
  /** R2 bucket used for new uploads from the "Incarca" tab. Default "gallery". */
  bucket?: string;
  /** URLs already in use — shown checked and not re-addable. */
  excludeUrls?: string[];
}

/**
 * Shared media chooser used everywhere an upload happens. Two tabs: upload new
 * file(s) (which auto-register in the library) or pick existing file(s) so the
 * same asset is never uploaded twice.
 */
export function MediaPicker({
  open, onClose, onSelect, multiple = false, accept = "image", bucket = "gallery", excludeUrls = [],
}: MediaPickerProps) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const excluded = useMemo(() => new Set(excludeUrls), [excludeUrls]);

  async function load() {
    setLoading(true);
    const res = await listMedia();
    if ("rows" in res) setRows(res.rows); else toast.error(res.error);
    setLoading(false);
  }

  useEffect(() => {
    if (open) { setSelected(new Set()); setSearch(""); setTab("library"); void load(); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (accept !== "all" && r.type !== accept) return false;
      if (q) {
        const hay = [r.file_name, r.title, r.alt_text, ...(r.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, accept]);

  function pick(url: string) {
    if (excluded.has(url)) return;
    setSelected((prev) => {
      const next = new Set(multiple ? prev : []);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    const { uploadImage, uploadVideo } = await import("@/lib/upload");
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      if (accept === "image" && isVideo) { toast.error("Acceptam doar imagini aici."); continue; }
      if (accept === "video" && !isVideo) { toast.error("Acceptam doar videoclipuri aici."); continue; }
      const res = isVideo ? await uploadVideo(file) : await uploadImage(file, bucket);
      if ("url" in res) newUrls.push(res.url); else toast.error(res.error);
    }
    setUploading(false);
    if (newUrls.length) {
      await load();
      setTab("library");
      setSelected((prev) => {
        const next = new Set(multiple ? prev : []);
        for (const u of newUrls) next.add(u);
        return next;
      });
    }
  }

  function confirm() {
    const urls = [...selected].filter((u) => !excluded.has(u));
    if (urls.length === 0) { onClose(); return; }
    onSelect(urls);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header + tabs */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-1">
            {(["library", "upload"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {t === "library" ? "Biblioteca" : "Incarca"}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        {tab === "library" ? (
          <>
            <div className="px-5 pt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cauta..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  Niciun fisier. Treci la tab-ul „Incarca" pentru a adauga.
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {filtered.map((r) => {
                    const isExcluded = excluded.has(r.url);
                    const isSel = selected.has(r.url);
                    return (
                      <button key={r.id} type="button" onClick={() => pick(r.url)} disabled={isExcluded}
                        className={cn("relative aspect-square rounded-xl overflow-hidden border bg-muted/30",
                          isSel ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40",
                          isExcluded && "opacity-40 cursor-not-allowed")}>
                        {r.type === "video"
                          ? <div className="absolute inset-0 flex items-center justify-center bg-black/80"><Film className="h-6 w-6 text-white/80" /></div>
                          : <Image src={r.url} alt={r.alt_text ?? ""} fill sizes="120px" className="object-contain p-1" />}
                        {(isSel || isExcluded) && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-5 overflow-y-auto flex-1">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full aspect-[2/1] max-h-64 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50">
              {uploading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
              <span className="text-sm text-muted-foreground font-medium">
                {uploading ? "Se incarca..." : "Apasa pentru a incarca fisiere"}
              </span>
            </button>
            <input ref={fileRef} type="file" multiple
              accept={accept === "video" ? "video/*" : accept === "all" ? "image/*,video/*" : "image/*"}
              className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">{selected.size} selectat(e)</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent">Anuleaza</button>
            <button type="button" onClick={confirm} disabled={selected.size === 0}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
              Adauga {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
