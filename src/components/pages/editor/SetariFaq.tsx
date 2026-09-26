"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { BlockStyle, FaqBlock } from "@/lib/pages/blocks.types";
import { CampCuloare } from "./CampCuloare";
import { ControaleAspect } from "./ControaleAspect";
import { AlegeFont, Grup, Segmentat, Text, Toggle, inputCls } from "./campuri";

type Varianta = NonNullable<FaqBlock["variant"]>;

const VARIANTE: { cheie: Varianta; nume: string }[] = [
  { cheie: "classic", nume: "Clasic" },
  { cheie: "cards", nume: "Carduri" },
  { cheie: "minimal", nume: "Minimal" },
  { cheie: "bordered", nume: "Contur" },
  { cheie: "filled", nume: "Colorat" },
];

/** O miniatura a fiecarui stil, ca omul sa aleaga vazand, nu citind un nume. */
function Miniatura({ v }: { v: Varianta }) {
  const rand = (k: number) => {
    const cls: Record<Varianta, string> = {
      classic: cn("h-2.5 border-b border-foreground/15", k === 2 && "border-0"),
      cards: "h-2.5 rounded-[3px] bg-background shadow-sm ring-1 ring-foreground/10",
      minimal: "h-2.5 border-b border-foreground/20",
      bordered: "h-2.5 rounded-[3px] border border-foreground/30",
      filled: "h-2.5 rounded-[3px] bg-foreground/10",
    };
    return <div key={k} className={cls[v]} />;
  };
  return (
    <div className={cn("flex w-full flex-col gap-1", v === "classic" && "rounded-[4px] border border-foreground/15 px-1 py-0.5 gap-0.5")}>
      {[0, 1, 2].map(rand)}
    </div>
  );
}

export function SetariFaq({ block: b, patch, setStyle }: {
  block: FaqBlock;
  patch: (p: Partial<FaqBlock>) => void;
  setStyle: (s: BlockStyle) => void;
}) {
  const items = b.items ?? [];
  const setItem = (i: number, p: Partial<{ q: string; a: string }>) => patch({ items: items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
  const muta = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    patch({ items: n });
  };
  const varianta = b.variant ?? "classic";

  return (
    <div className="space-y-4">
      <Text label="Titlu" value={b.title} onChange={(v) => patch({ title: v })} />
      <Text label="Subtitlu (opțional)" value={b.subtitle} onChange={(v) => patch({ subtitle: v })} placeholder="Nu găsești răspunsul? Scrie-ne." />

      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground">Întrebarea {i + 1}</p>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => muta(i, -1)} disabled={i === 0} aria-label="Mută sus" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => muta(i, 1)} disabled={i === items.length - 1} aria-label="Mută jos" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => patch({ items: items.filter((_, k) => k !== i) })} aria-label="Șterge întrebarea" className="rounded p-1"><X className="h-3.5 w-3.5 text-red-500" /></button>
              </div>
            </div>
            <input value={it.q} onChange={(e) => setItem(i, { q: e.target.value })} placeholder="Întrebarea" className={inputCls} />
            <textarea value={it.a} onChange={(e) => setItem(i, { a: e.target.value })} placeholder="Răspunsul" rows={3} className={`${inputCls} resize-y`} />
          </div>
        ))}
        <button type="button" onClick={() => patch({ items: [...items, { q: "", a: "" }] })} className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Plus className="h-3.5 w-3.5" /> Adaugă întrebare
        </button>
      </div>

      <Grup titlu="Stil și așezare" deschisImplicit>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-foreground">Stil</p>
          <div className="grid grid-cols-3 gap-2">
            {VARIANTE.map((v) => (
              <button key={v.cheie} type="button" onClick={() => patch({ variant: v.cheie })} aria-pressed={varianta === v.cheie}
                className={cn("flex min-h-[64px] flex-col items-center justify-between gap-1.5 rounded-lg border p-2 transition-colors",
                  varianta === v.cheie ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                <Miniatura v={v.cheie} />
                <span className="text-[10px] text-muted-foreground">{v.nume}</span>
              </button>
            ))}
          </div>
        </div>
        <Segmentat label="Coloane" value={String(b.columns ?? 1) as "1" | "2"} onChange={(v) => patch({ columns: Number(v) as 1 | 2 })}
          options={[{ value: "1", label: "Una" }, { value: "2", label: "Două" }]} />
        <Toggle label="Titlul în stânga, întrebările în dreapta" checked={!!b.sideTitle} onChange={(v) => patch({ sideTitle: v })} />
        {!b.sideTitle && (
          <Segmentat label="Titlul aliniat" value={b.titleAlign ?? "center"} onChange={(v) => patch({ titleAlign: v })}
            options={[{ value: "left", label: "Stânga" }, { value: "center", label: "Centru" }]} />
        )}
        <Segmentat label="Iconița" value={b.icon ?? "plus"} onChange={(v) => patch({ icon: v })}
          options={[{ value: "plus", label: "+ / −" }, { value: "chevron", label: "⌄" }, { value: "arrow", label: "→" }, { value: "none", label: "Fără" }]} />
        {b.icon !== "none" && (
          <Segmentat label="Iconița stă" value={b.iconPos ?? "left"} onChange={(v) => patch({ iconPos: v })}
            options={[{ value: "left", label: "În stânga" }, { value: "right", label: "În dreapta" }]} />
        )}
        <Toggle label="Numerotează întrebările (01, 02…)" checked={!!b.numbered} onChange={(v) => patch({ numbered: v })} />
      </Grup>

      <Grup titlu="Tipografie">
        <AlegeFont label="Fontul titlului" value={b.titleFont ?? null} onChange={(v) => patch({ titleFont: v })} gol="Fontul magazinului" />
        <AlegeFont label="Fontul întrebărilor" value={b.questionFont ?? null} onChange={(v) => patch({ questionFont: v })} gol="Fontul magazinului" />
        <AlegeFont label="Fontul răspunsurilor" value={b.answerFont ?? null} onChange={(v) => patch({ answerFont: v })} gol="Fontul magazinului" />
      </Grup>

      <Grup titlu="Deschidere">
        <Toggle label="Prima întrebare pornește deschisă" checked={b.openFirst !== false} onChange={(v) => patch({ openFirst: v })} />
        <Toggle label="Se pot deschide mai multe deodată" checked={!!b.multiOpen} onChange={(v) => patch({ multiOpen: v })} />
      </Grup>

      <Grup titlu="Culori">
        <CampCuloare eticheta="Accent (iconița și întrebarea deschisă)" valoare={b.accent} onChange={(v) => patch({ accent: v })} poateFiGol />
        <CampCuloare eticheta="Întrebările" valoare={b.questionColor} onChange={(v) => patch({ questionColor: v })} poateFiGol />
        <CampCuloare eticheta="Răspunsurile" valoare={b.answerColor} onChange={(v) => patch({ answerColor: v })} poateFiGol />
        {(varianta === "cards" || varianta === "filled") && (
          <CampCuloare eticheta="Fundalul întrebărilor" valoare={b.cardBg} onChange={(v) => patch({ cardBg: v })} poateFiGol />
        )}
      </Grup>

      <ControaleAspect style={b.style} onChange={setStyle} hide={["align"]} />
    </div>
  );
}
