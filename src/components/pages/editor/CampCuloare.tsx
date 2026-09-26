"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CULOAREA, CU ROATA DE CULORI                                    (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el cu o captura: ultimul patrat din rand era `<input type="color">`
  gol, un dreptunghi negru care nu spunea nimanui ca de acolo se alege orice
  culoare. Acum e roata de culori (gradient conic), semnul pe care il recunoaste
  oricine, iar dupa alegere arata chiar culoarea aleasa, cu o bifa.

  ⚠ Codul hex se poate si SCRIE, nu doar alege: comerciantul are de obicei
  culoarea brandului ca text („#1E3A5F"), iar pipeta nativa nu-l lasa s-o
  lipeasca pe Windows.
*/

export const CULORI_RAPIDE = ["#07c527", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2", "#000000", "#ffffff"];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function CampCuloare({
  eticheta, valoare, onChange, poateFiGol,
}: {
  eticheta: string;
  valoare?: string | null;
  onChange: (v: string | null) => void;
  poateFiGol?: boolean;
}) {
  const id = useId();
  const nativ = useRef<HTMLInputElement>(null);
  const [deschis, setDeschis] = useState(false);
  /* Ce scrie omul in campul hex, cat timp scrie; altfel se arata valoarea. */
  const [editare, setEditare] = useState<string | null>(null);
  const scris = editare ?? valoare ?? "";
  const cutie = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deschis) return;
    const inchide = (e: MouseEvent) => { if (!cutie.current?.contains(e.target as Node)) setDeschis(false); };
    document.addEventListener("mousedown", inchide);
    return () => document.removeEventListener("mousedown", inchide);
  }, [deschis]);

  const personalizata = !!valoare && !CULORI_RAPIDE.some((c) => c.toLowerCase() === valoare.toLowerCase());

  return (
    /* ⚠ Fereastra se aseaza fata de TOT campul, nu fata de roata: roata sta la
       stanga randului, iar ancorata de ea fereastra iesea din panou si se taia. */
    <div ref={cutie} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-foreground">{eticheta}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {poateFiGol && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Fără culoare"
            aria-label="Fără culoare"
            aria-pressed={!valoare}
            className={cn("grid h-7 w-7 place-items-center rounded-md border", !valoare ? "border-primary ring-2 ring-primary/30" : "border-border")}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        {CULORI_RAPIDE.map((c) => {
          const ales = valoare?.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              aria-label={`Culoarea ${c}`}
              aria-pressed={ales}
              className={cn("h-7 w-7 rounded-md border border-foreground/10", ales && "ring-2 ring-primary ring-offset-1")}
              style={{ backgroundColor: c }}
            />
          );
        })}

        <div>
          <button
            type="button"
            onClick={() => setDeschis((d) => !d)}
            title="Alege orice culoare"
            aria-label="Alege orice culoare"
            aria-expanded={deschis}
            className={cn(
              "relative grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-foreground/10",
              personalizata && "ring-2 ring-primary ring-offset-1",
            )}
            style={{ background: "conic-gradient(from 90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
          >
            {personalizata && (
              <span className="grid h-4 w-4 place-items-center rounded-full border border-white shadow" style={{ backgroundColor: valoare! }}>
                <Check className="h-2.5 w-2.5 text-white mix-blend-difference" strokeWidth={3} />
              </span>
            )}
          </button>

          {deschis && (
            <div className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-border bg-background p-3 shadow-xl">
              <button
                type="button"
                onClick={() => nativ.current?.click()}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border p-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span className="h-8 w-8 flex-shrink-0 rounded-md border border-foreground/10" style={{ backgroundColor: HEX.test(scris) ? scris : "#ffffff" }} />
                Deschide paleta de culori
              </button>
              <input
                ref={nativ}
                type="color"
                value={HEX.test(valoare ?? "") && (valoare ?? "").length === 7 ? valoare! : "#000000"}
                onChange={(e) => onChange(e.target.value)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
              <label htmlFor={id} className="mb-1 mt-3 block text-[11px] font-medium text-muted-foreground">Cod hex</label>
              <input
                id={id}
                value={scris}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setEditare(v);
                  const cu = v.startsWith("#") ? v : `#${v}`;
                  if (HEX.test(cu)) onChange(cu.toLowerCase());
                }}
                onBlur={() => setEditare(null)}
                placeholder="#1E3A5F"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-xs uppercase text-foreground outline-none focus:border-primary"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
