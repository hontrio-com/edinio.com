"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageIcon, PAGE_ICON_NAMES } from "../icon-registry";
import { FAMILII_FONT, FONTURI_PAGINA, NUMELE_FAMILIEI, stivaFont, type CheieFont } from "@/lib/pages/fonturi";

/*
  Controalele comune ale editorului de pagini. Stateau toate in `BlockSettings`,
  langa cele 17 blocuri; mutate aici ca sa poata fi folosite si de setarile
  paginii si de fereastra „Pagina noua”, fara sa se copieze.
*/

export const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

export function Field({ label, children, ajutor }: { label: string; children: ReactNode; ajutor?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-foreground">{label}</label>
      {children}
      {ajutor && <p className="mt-1 text-[11px] text-muted-foreground">{ajutor}</p>}
    </div>
  );
}

export function Text({ label, value, onChange, placeholder, ajutor }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; ajutor?: string }) {
  return <Field label={label} ajutor={ajutor}><input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} /></Field>;
}

export function Area({ label, value, onChange, placeholder, mono, rows = 4 }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; rows?: number }) {
  return <Field label={label}><textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`${inputCls} resize-y ${mono ? "font-mono text-xs" : ""}`} /></Field>;
}

export function Select<T extends string>({ label, value, options, onChange, ajutor }: { label: string; value?: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ajutor?: string }) {
  return (
    <Field label={label} ajutor={ajutor}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange, ajutor }: { label: string; checked: boolean; onChange: (v: boolean) => void; ajutor?: string }) {
  return (
    <div>
      <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-foreground">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-green-600" />
        {label}
      </label>
      {ajutor && <p className="ml-6 mt-0.5 text-[11px] text-muted-foreground">{ajutor}</p>}
    </div>
  );
}

export function Range({ label, value, onChange, min, max, step = 1, unit = "px" }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return (
    <Field label={`${label}: ${value}${unit}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full cursor-pointer accent-green-600" />
    </Field>
  );
}

/** Butoane alaturate, pentru alegeri scurte (2-5 variante). */
export function Segmentat<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: ReactNode; titlu?: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.titlu}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
              value === o.value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Un grup de setari pliabil. „Continut" sta deschis; „Aspect" si „Animatie" pornesc inchise. */
export function Grup({ titlu, children, deschisImplicit = false, insigna }: { titlu: string; children: ReactNode; deschisImplicit?: boolean; insigna?: string }) {
  const [deschis, setDeschis] = useState(deschisImplicit);
  return (
    <div className="border-t border-border pt-3">
      <button type="button" onClick={() => setDeschis((d) => !d)} aria-expanded={deschis}
        className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-2">
          {titlu}
          {insigna && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-primary">{insigna}</span>}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", deschis && "rotate-180")} />
      </button>
      {deschis && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}

export function IconPicker({ value, onChange, label = "Pictograma", poateFiGol }: { value?: string | null; onChange: (v: string | null) => void; label?: string; poateFiGol?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = q ? PAGE_ICON_NAMES.filter((n) => n.toLowerCase().includes(q.toLowerCase())) : PAGE_ICON_NAMES;
  return (
    <Field label={label}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${inputCls} flex items-center gap-2 text-left`}>
        {value ? <PageIcon name={value} className="h-4 w-4 text-foreground" /> : null}
        <span className="truncate text-muted-foreground">{value || "Alege o pictogramă"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută…" className={`${inputCls} py-1.5 pl-7 text-xs`} />
          </div>
          {poateFiGol && (
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="mb-1.5 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted">
              Fără pictogramă
            </button>
          )}
          <div className="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto">
            {list.map((n) => (
              <button key={n} type="button" onClick={() => { onChange(n); setOpen(false); }} title={n}
                className={`flex h-9 w-9 items-center justify-center rounded-md border ${value === n ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}>
                <PageIcon name={n} className="h-4 w-4 text-foreground" />
              </button>
            ))}
            {list.length === 0 && <p className="col-span-6 p-2 text-xs text-muted-foreground">Nimic găsit.</p>}
          </div>
        </div>
      )}
    </Field>
  );
}

/**
 * Alegerea fontului, cu fiecare nume scris in fontul lui.
 *
 * ⚠ Previzualizarea merge fiindca editorul are pe radacina TOATE clasele de
 * font (`toateClaseleDeFont`): fara ele, `stivaFont` ar cadea pe rezerva si
 * lista ar arata 33 de randuri identice.
 */
export function AlegeFont({ label, value, onChange, gol = "Fontul magazinului" }: { label: string; value?: CheieFont | null; onChange: (v: CheieFont | null) => void; gol?: string }) {
  const [open, setOpen] = useState(false);
  const cutie = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const inchide = (e: MouseEvent) => { if (!cutie.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", inchide);
    return () => document.removeEventListener("mousedown", inchide);
  }, [open]);
  const ales = value ? FONTURI_PAGINA.find((f) => f.cheie === value) : null;
  return (
    <div ref={cutie} className="relative">
      <Field label={label}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`${inputCls} flex items-center justify-between gap-2 text-left`}>
          <span className="truncate" style={ales ? { fontFamily: stivaFont(ales.cheie) } : undefined}>{ales ? ales.nume : gol}</span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </button>
      </Field>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-xl">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted">
            {gol}
            {!value && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
          {FAMILII_FONT.map((fam) => (
            <div key={fam} className="pt-1">
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{NUMELE_FAMILIEI[fam]}</p>
              {FONTURI_PAGINA.filter((f) => f.familie === fam).map((f) => (
                <button key={f.cheie} type="button" onClick={() => { onChange(f.cheie); setOpen(false); }}
                  className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-muted", value === f.cheie && "bg-muted")}>
                  <span className="text-[17px] leading-tight text-foreground" style={{ fontFamily: stivaFont(f.cheie) }}>{f.nume}</span>
                  {value === f.cheie && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
