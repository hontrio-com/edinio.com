"use client";

import { useState, type CSSProperties } from "react";
import { ArrowRight, ChevronDown, Minus, Plus } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { cuTransparenta } from "@/lib/pages/culori";
import { esteFontPagina, stivaFont } from "@/lib/pages/fonturi";

const font = (f?: string | null): CSSProperties | undefined => (f && esteFontPagina(f) ? { fontFamily: stivaFont(f) } : undefined);
import type { FaqBlock } from "@/lib/pages/blocks.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  INTREBARI FRECVENTE                                             (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: mai personalizabil ca design si asezare. Cinci stiluri, una sau
  doua coloane, titlul deasupra sau in stanga, trei feluri de iconita (sau
  niciuna), stanga ori dreapta, numerotare, culori pe intrebare, raspuns si
  accent, si comportamentul la deschidere.

  ⚠ Un bloc salvat inainte, fara niciun camp nou, arata EXACT ca pana acum:
  `classic`, plus/minus in stanga, prima intrebare deschisa, una singura.

  ⚠⚠ RASPUNSUL RAMANE IN PAGINA SI CAND E INCHIS (ascuns cu `hidden`). Pana
  acum raspunsul inchis nu era deloc in HTML, deci un crawler care nu apasa
  vedea doar intrebarile. Datele structurate (FAQPage) le au oricum pe toate.
*/

export function FaqBlockView({ block }: { block: FaqBlock }) {
  const items = block.items ?? [];
  const multi = !!block.multiOpen;
  const [deschise, setDeschise] = useState<Set<number>>(() => new Set(block.openFirst === false ? [] : [0]));
  if (items.length === 0) return null;

  const variant = block.variant ?? "classic";
  const iconita = block.icon ?? "plus";
  const dreapta = block.iconPos === "right";
  const doua = block.columns === 2;
  const accent = block.accent ?? undefined;
  const titluStanga = !!block.sideTitle;
  const aliniere = titluStanga || block.titleAlign === "left" ? "text-left" : "text-center";

  function comuta(i: number) {
    setDeschise((prev) => {
      const next = new Set(multi ? prev : []);
      if (prev.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  const listaCls: Record<string, string> = {
    classic: "rounded-2xl border border-border bg-surface px-4 pg-sm:px-8",
    cards: "space-y-3",
    minimal: "",
    bordered: "space-y-3",
    filled: "space-y-2",
  };
  const RAND_JUMATATI: Record<string, string> = { classic: "gap-y-3", cards: "gap-y-3", minimal: "", bordered: "gap-y-3", filled: "gap-y-2" };
  const itemCls: Record<string, string> = {
    classic: "border-b border-border last:border-0",
    cards: "rounded-2xl bg-surface px-5 shadow-[0_6px_24px_-14px_rgba(0,0,0,0.25)] ring-1 ring-foreground/5",
    minimal: "border-b border-border",
    bordered: "rounded-xl border-2 px-5",
    filled: "rounded-xl px-5",
  };

  const Iconita = ({ deschis }: { deschis: boolean }) => {
    if (iconita === "none") return null;
    const c: CSSProperties = accent ? { color: accent, borderColor: cuTransparenta(accent, 0.35) } : {};
    if (iconita === "chevron") {
      return <ChevronDown size={18} className={`mt-0.5 shrink-0 transition-transform duration-200 ${deschis ? "rotate-180" : ""}`} style={c} />;
    }
    if (iconita === "arrow") {
      return <ArrowRight size={16} className={`mt-1 shrink-0 transition-transform duration-200 ${deschis ? "rotate-90" : ""}`} style={c} />;
    }
    return (
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border" style={c}>
        {deschis ? <Minus size={12} /> : <Plus size={12} />}
      </span>
    );
  };

  const titlu = (block.title || block.subtitle) && (
    <div className={`${aliniere} ${titluStanga ? "" : "mb-8"}`}>
      {block.title && <h2 className="pg-titlu text-2xl pg-sm:text-3xl font-black tracking-tight text-foreground" style={font(block.titleFont)}>{block.title}</h2>}
      {block.subtitle && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{block.subtitle}</p>}
    </div>
  );

  const lista = (
    /* Pe doua coloane, pe telefon cele doua jumatati stau una sub alta: intre ele, acelasi spatiu ca intre intrebari. */
    <div className={`${doua ? `grid gap-x-8 ${RAND_JUMATATI[variant] ?? ""} pg-md:grid-cols-2` : ""} ${doua ? "" : listaCls[variant]}`}>
      {(doua ? [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))] : [items]).map((grup, gi) => (
        <div key={gi} className={doua ? listaCls[variant] : "contents"}>
          {grup.map((faq, k) => {
            const i = gi === 0 ? k : Math.ceil(items.length / 2) + k;
            const deschis = deschise.has(i);
            const stil: CSSProperties = {};
            if (variant === "filled") stil.backgroundColor = block.cardBg ?? (accent ? cuTransparenta(accent, 0.07) : "var(--color-muted)");
            else if (variant === "cards" && block.cardBg) stil.backgroundColor = block.cardBg;
            if (variant === "bordered") stil.borderColor = deschis && accent ? accent : "var(--color-border)";
            return (
              <div key={i} className={itemCls[variant]} style={stil}>
                <button type="button" onClick={() => comuta(i)} aria-expanded={deschis} aria-controls={`faq-${block.id}-${i}`}
                  className={`flex w-full items-start gap-4 py-5 text-left transition-opacity hover:opacity-80 ${dreapta ? "flex-row-reverse justify-between" : ""}`}>
                  <Iconita deschis={deschis} />
                  <span className="flex-1 pr-2 text-base font-semibold" style={{ color: (deschis && accent) || block.questionColor || undefined, ...font(block.questionFont) }}>
                    {block.numbered && <span className="mr-2 tabular-nums opacity-50">{String(i + 1).padStart(2, "0")}</span>}
                    {faq.q}
                  </span>
                </button>
                <div id={`faq-${block.id}-${i}`} hidden={!deschis}>
                  <p className={`whitespace-pre-line pb-5 text-sm leading-relaxed ${iconita === "none" || dreapta ? "" : "pl-10"} pr-4 ${block.answerColor ? "" : "text-muted-foreground"}`}
                    style={{ ...(block.answerColor ? { color: block.answerColor } : {}), ...font(block.answerFont) }}>
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <BlockShell style={{ width: doua || titluStanga ? "container" : "narrow", ...block.style }}>
      {titluStanga ? (
        <div className="grid gap-8 pg-md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] pg-md:gap-14">
          <div>{titlu}</div>
          {lista}
        </div>
      ) : (
        <>
          {titlu}
          {lista}
        </>
      )}
    </BlockShell>
  );
}
