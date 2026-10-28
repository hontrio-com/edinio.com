"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MediaPicker } from "@/components/media/MediaPicker";
import { AlegeFont } from "@/components/pages/editor/campuri";
import { toateClaseleDeFont } from "@/components/pages/fonturi-incarcate";
import { NOD_STIL } from "@/lib/editor-magazin/noduri";
import type { ContinutMagazin } from "../useContinutMagazin";
import { ContinutCard } from "./ContinutComert";
import { Grup } from "./ui";

/**
 * Fila „Stil”: ce e comun tuturor paginilor. Logo, favicon, culori, fonturi si
 * cardul de produs.
 *
 * Mutat din „Identitate vizuala” a editorului vechi, fara bannere: bannerele
 * sunt ale hero-ului si stau sub nodul lui. Culoarea si fonturile se vad in
 * previzualizare inainte de salvare, fiindca intra in stilul trimis catre ea.
 */

const CULORI_PRINCIPALE = ["#07c527", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2"];
const CULORI_FUNDAL = ["#FFFFFF", "#FAFAFA", "#F5F5F4", "#F0FDF4", "#FDF2F8", "#FFF7ED", "#F0F9FF", "#FAF5FF"];

/** O imagine aleasa prin incarcare sau din Biblioteca Media, cu miniatura. */
function CampImagine({ eticheta, previzualizare, onFisier, onScoate, onAlege, ajutor }: {
  eticheta: string;
  previzualizare: string | null;
  onFisier: (f: File) => void;
  onScoate: () => void;
  onAlege: (url: string) => void;
  ajutor?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [pickerDeschis, setPickerDeschis] = useState(false);
  return (
    <div>
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{eticheta}</span>
      <div className="max-w-[160px]">
        {previzualizare ? (
          <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previzualizare} alt="" className="w-full h-full object-contain" />
            <button type="button" onClick={onScoate} aria-label={`Scoate ${eticheta.toLowerCase()}`}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-border flex items-center justify-center hover:bg-white">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => ref.current?.click()}
            className="w-full aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 hover:border-primary hover:bg-primary/5 transition-colors">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Încarcă imagine</span>
          </button>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden" aria-label={`Încarcă ${eticheta.toLowerCase()}`}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFisier(f); e.target.value = ""; }} />
      </div>
      <button type="button" onClick={() => setPickerDeschis(true)} className="mt-1.5 text-[11px] font-medium text-primary hover:text-primary/80">
        Alege din Biblioteca Media
      </button>
      <MediaPicker open={pickerDeschis} onClose={() => setPickerDeschis(false)} accept="image" bucket="logos"
        onSelect={(urls) => urls[0] && onAlege(urls[0])} />
      {ajutor && <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{ajutor}</p>}
    </div>
  );
}

export function PanouStil({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza, logo, setLogo, favicon, setFavicon, culoare, setCuloare } = continut;
  /*
   * Textul codului, DOAR cat e scris pe jumatate (`#12`): altfel campul arata culoarea din ciorna.
   * Copia ei locala ramanea in urma la Anuleaza si la Renunta (vazut la proba 6.5, 25.10.2026):
   * bulina era portocalie, campul scria inca verdele renuntat.
   */
  const [hexScris, setHexScris] = useState<string | null>(null);
  const hex = hexScris ?? culoare;
  const fundal = pc.store_bg_color ?? "#FFFFFF";
  const alegeCuloare = (c: string) => { setHexScris(null); setCuloare(c); };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <Grup titlu="Identitate">
          <div className="grid grid-cols-2 gap-4">
            <CampImagine eticheta="Logo" previzualizare={logo.previzualizare}
              onFisier={(f) => setLogo({ previzualizare: URL.createObjectURL(f), fisier: f })}
              onScoate={() => setLogo({ previzualizare: null, fisier: null })}
              onAlege={(url) => setLogo({ previzualizare: url, fisier: null })} />
            <CampImagine eticheta="Favicon" previzualizare={favicon.previzualizare}
              onFisier={(f) => setFavicon({ previzualizare: URL.createObjectURL(f), fisier: f })}
              onScoate={() => setFavicon({ previzualizare: null, fisier: null })}
              onAlege={(url) => setFavicon({ previzualizare: url, fisier: null })}
              ajutor="Iconița din fila browserului. Ideal o imagine pătrată, 512x512. Lipsă, se folosește logo-ul." />
          </div>
        </Grup>

        <Grup titlu="Culoarea principală">
          <div className="flex items-center gap-2 flex-wrap">
            {CULORI_PRINCIPALE.map((c) => (
              <button key={c} type="button" onClick={() => alegeCuloare(c)} aria-label={`Culoarea ${c}`} aria-pressed={culoare === c}
                className="w-7 h-7 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: culoare === c ? "white" : c, boxShadow: culoare === c ? `0 0 0 2px ${c}` : "none", transform: culoare === c ? "scale(1.15)" : "scale(1)" }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(culoare) ? culoare : "#07c527"} aria-label="Alege altă culoare"
              onChange={(e) => alegeCuloare(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
            <input type="text" value={hex} maxLength={7} placeholder="#07c527" aria-label="Codul culorii"
              onChange={(e) => { const v = e.target.value; if (/^#[0-9A-Fa-f]{6}$/.test(v)) alegeCuloare(v); else setHexScris(v); }}
              className="w-28 px-2 py-1.5 text-xs border border-border rounded-lg bg-surface font-mono focus:outline-none focus:border-primary" />
          </div>
        </Grup>

        <Grup titlu="Fundalul magazinului">
          <div className="flex items-center gap-2 flex-wrap">
            {CULORI_FUNDAL.map((c) => (
              <button key={c} type="button" aria-label={`Fundal ${c}`} aria-pressed={fundal === c}
                onClick={() => seteaza(NOD_STIL, (p) => ({ ...p, store_bg_color: c }))}
                className="w-7 h-7 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: fundal === c ? "var(--color-primary)" : "#e5e7eb", boxShadow: fundal === c ? "0 0 0 2px var(--color-primary)" : "none", transform: fundal === c ? "scale(1.15)" : "scale(1)" }} />
            ))}
            <input type="color" value={fundal} aria-label="Alt fundal"
              onChange={(e) => seteaza(NOD_STIL, (p) => ({ ...p, store_bg_color: e.target.value }))}
              className="w-8 h-8 rounded border border-border cursor-pointer" />
          </div>
        </Grup>

        {/*
          Fonturile magazinului, din Geist si fonturile paginilor (etapa 14). Alegatorul paginilor, pe familii, cu
          fiecare nume in fontul lui (de aici `toateClaseleDeFont`); grila de carduri de dinainte ar fi avut 34 de
          randuri, de doua ori. Geist e „gol”: alegerea lui se scrie anume, ca sa bata un font publicat inainte.
        */}
        <Grup titlu="Fonturi">
          <div className={cn("space-y-3", toateClaseleDeFont())}>
            <AlegeFont label="Font titluri" gol="Geist (implicit)"
              value={pc.font_titluri && pc.font_titluri !== "geist" ? pc.font_titluri : null}
              onChange={(v) => seteaza(NOD_STIL, (p) => ({ ...p, font_titluri: v ?? "geist" }))} />
            <AlegeFont label="Font text" gol="Geist (implicit)"
              value={pc.font_text && pc.font_text !== "geist" ? pc.font_text : null}
              onChange={(v) => seteaza(NOD_STIL, (p) => ({ ...p, font_text: v ?? "geist" }))} />
            <p className="text-[11px] text-muted-foreground">
              Se aplică pe tot magazinul. O secțiune cu font ales anume, sau un bloc din Pagini, îl păstrează pe al lui.
            </p>
          </div>
        </Grup>

      </div>

      <div className="space-y-4 pt-2 border-t border-border">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-4">Cardul de produs</p>
        <ContinutCard continut={continut} />
      </div>
    </div>
  );
}
