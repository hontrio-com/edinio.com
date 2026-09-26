"use client";

import { useState } from "react";
import { Film, ImagePlus, Link2, RefreshCw, X } from "lucide-react";
import { MediaPicker } from "@/components/media/MediaPicker";

/*
  ═══════════════════════════════════════════════════════════════════════════
  IMAGINEA SI VIDEOUL SE ALEG DIN BIBLIOTECA MEDIA                (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: sa aleaga din Biblioteca Media, nu sa i se ceara sa incarce direct.
  Campul vechi avea trei drumuri deodata (incarca, biblioteca, lipeste un link),
  iar incarcarea directa punea fisierul pe disc FARA sa-l treaca in biblioteca:
  aceeasi poza urcata de trei ori, pe trei pagini, si nicaieri de unde s-o mai
  refolosesti.

  Acum apasarea deschide biblioteca. Un fisier nou se urca tot de acolo (fila
  „Incarca" a bibliotecii), deci ajunge in biblioteca si se poate refolosi.
  Linkul extern ramane, dar ascuns sub o legatura mica: e cazul rar.
*/
export function CampImagine({
  eticheta, valoare, onChange, fel = "image", ajutor,
}: {
  eticheta: string;
  valoare?: string | null;
  onChange: (v: string | null) => void;
  fel?: "image" | "video";
  ajutor?: string;
}) {
  const [biblioteca, setBiblioteca] = useState(false);
  const [link, setLink] = useState(false);
  const Icon = fel === "video" ? Film : ImagePlus;

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-foreground">{eticheta}</span>
      {valoare ? (
        <div className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
          {fel === "video" ? (
            <video src={valoare} controls preload="metadata" className="max-h-44 w-full bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valoare} alt="" className="max-h-40 w-full object-cover" />
          )}
          <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
            <button
              type="button"
              onClick={() => setBiblioteca(true)}
              title="Schimbă"
              aria-label="Schimbă"
              className="grid h-7 w-7 place-items-center rounded-full border border-border bg-white/95 text-foreground shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              title="Scoate"
              aria-label="Scoate"
              className="grid h-7 w-7 place-items-center rounded-full border border-border bg-white/95 text-foreground shadow-sm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBiblioteca(true)}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border py-5 transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-xs font-medium text-foreground">Alege din Biblioteca Media</span>
          <span className="text-[11px] text-muted-foreground">sau urcă un fișier nou în bibliotecă</span>
        </button>
      )}

      {ajutor && <p className="mt-1.5 text-[11px] text-muted-foreground">{ajutor}</p>}

      {link ? (
        <input
          value={valoare ?? ""}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          placeholder="https://…"
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setLink(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Link2 className="h-3 w-3" /> Folosește un link extern
        </button>
      )}

      <MediaPicker
        open={biblioteca}
        onClose={() => setBiblioteca(false)}
        accept={fel}
        bucket="gallery"
        onSelect={(urls) => urls[0] && onChange(urls[0])}
      />
    </div>
  );
}
