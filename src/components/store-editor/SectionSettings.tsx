"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { variantMeta, type Field } from "@/lib/storefront/design/registry";
import type { SectionInstance } from "@/lib/storefront/design/types";

/**
 * Setarile sectiunii selectate, generate din descriptorii `fields` ai variantei.
 *
 * Nu exista formulare scrise de mana per varianta: fiecare isi declara campurile
 * in registry, iar aici se transforma in controale. Cu zeci de variante in plan,
 * un formular scris manual pentru fiecare ar fi insemnat de doua ori mai mult cod
 * si de doua ori mai multe locuri in care se poate uita ceva.
 *
 * Tipurile de camp neacoperite inca nu randeaza nimic, in loc sa arunce: o
 * varianta viitoare poate cere un tip nou fara sa strice editorul intre timp.
 */
export function SectionSettings({
  section,
  onChange,
  /** In panoul dedicat, titlul e deja in capul lui. */
  cuTitlu = true,
}: {
  section: SectionInstance;
  onChange: (settings: Record<string, unknown>) => void;
  cuTitlu?: boolean;
}) {
  const fields = variantMeta(section.kind, section.variant)?.fields ?? [];
  if (fields.length === 0) return null;

  const valoare = (f: Field) => section.settings[f.key];
  const seteaza = (key: string, v: unknown) => onChange({ ...section.settings, [key]: v });

  // Un camp cu `showIf` apare doar cand campul de care depinde are valoarea
  // ceruta — ex. textul butonului dispare cand butonul e stins.
  const vizibil = (f: Field) =>
    !f.showIf || section.settings[f.showIf.key] === f.showIf.equals;

  return (
    <div className={cuTitlu ? "mt-4 pt-3 border-t border-border space-y-3" : "pt-4 space-y-4"}>
      {cuTitlu && <p className="text-xs font-semibold text-foreground">Setari</p>}
      {fields.filter(vizibil).map((f) => (
        <Control key={f.key} field={f} value={valoare(f)} onChange={(v) => seteaza(f.key, v)} />
      ))}
    </div>
  );
}

const INPUT =
  "w-full h-10 px-3 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors";

function Control({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const eticheta = (
    <span className="block">
      <span className="text-xs font-medium text-foreground">{field.label}</span>
      {field.help && <span className="block text-[11px] text-muted-foreground mt-0.5">{field.help}</span>}
    </span>
  );

  switch (field.type) {
    case "toggle": {
      const pornit = value === true;
      return (
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          {eticheta}
          <button type="button" role="switch" aria-checked={pornit} onClick={() => onChange(!pornit)}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${pornit ? "bg-primary" : "bg-border"}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${pornit ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </label>
      );
    }

    case "text":
    case "link":
      return (
        <label className="block space-y-1.5">
          {eticheta}
          <input type="text" className={INPUT}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            maxLength={field.type === "text" ? field.maxLength : undefined}
            onChange={(e) => onChange(e.target.value)} />
        </label>
      );

    case "textarea":
      return (
        <label className="block space-y-1.5">
          {eticheta}
          <textarea rows={3} className={`${INPUT} h-auto py-2 resize-y`}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </label>
      );

    case "select":
      return (
        <label className="block space-y-1.5">
          {eticheta}
          <select className={`${INPUT} cursor-pointer`}
            value={typeof value === "string" ? value : field.options[0]?.value}
            onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );

    case "color":
      return (
        <label className="flex items-center justify-between gap-3">
          {eticheta}
          <input type="color" className="shrink-0 w-11 h-9 rounded-lg border border-border cursor-pointer bg-surface"
            value={typeof value === "string" && value.startsWith("#") ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)} />
        </label>
      );

    case "range":
      return (
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between">
            {eticheta}
            <span className="text-xs text-muted-foreground tabular-nums">
              {typeof value === "number" ? value : field.min}{field.unit ?? ""}
            </span>
          </span>
          <input type="range" className="w-full accent-primary cursor-pointer"
            min={field.min} max={field.max} step={field.step ?? 1}
            value={typeof value === "number" ? value : field.min}
            onChange={(e) => onChange(Number(e.target.value))} />
        </label>
      );

    case "actions":
      return <ListaActiuni field={field} value={value} onChange={onChange} eticheta={eticheta} />;

    default:
      // Tip de camp inca neimplementat (imagine, iconita, produse, repetor).
      return null;
  }
}

/**
 * Lista de actiuni reordonabila, cu comutator pe fiecare rand.
 *
 * Reordonarea se face cu sageti, nu prin tragere: sunt trei-patru randuri
 * intr-un panou ingust, iar sagetile merg si cu tastatura si pe telefon, unde
 * tragerea intr-o zona care se poate si derula e neplacuta.
 */
function ListaActiuni({
  field,
  value,
  onChange,
  eticheta,
}: {
  field: Extract<Field, { type: "actions" }>;
  value: unknown;
  onChange: (v: unknown) => void;
  eticheta: React.ReactNode;
}) {
  // Valoarea salvata poate fi partiala sau lipsa; lista afisata e mereu
  // completa, in ordinea salvata, cu actiunile noi la coada.
  const salvat = Array.isArray(value) ? (value as { key?: unknown; on?: unknown }[]) : [];
  const cunoscute = new Map(field.options.map((o) => [o.value, o.label]));
  const randuri: { key: string; on: boolean }[] = [];
  const vazute = new Set<string>();
  for (const item of salvat) {
    const key = typeof item?.key === "string" ? item.key : "";
    if (!cunoscute.has(key) || vazute.has(key)) continue;
    vazute.add(key);
    randuri.push({ key, on: item.on !== false });
  }
  for (const o of field.options) {
    if (!vazute.has(o.value)) randuri.push({ key: o.value, on: true });
  }

  const muta = (de: number, la: number) => {
    if (la < 0 || la >= randuri.length) return;
    const next = [...randuri];
    [next[de], next[la]] = [next[la], next[de]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {eticheta}
      <ul className="space-y-1">
        {randuri.map((r, i) => (
          <li key={r.key} className="flex items-center gap-1 h-10 pl-3 pr-1 rounded-xl border border-border bg-surface">
            <span className={`flex-1 text-xs truncate ${r.on ? "text-foreground" : "text-muted-foreground line-through"}`}>
              {cunoscute.get(r.key)}
            </span>
            <button type="button" onClick={() => muta(i, i - 1)} disabled={i === 0}
              aria-label={`Muta ${cunoscute.get(r.key)} mai sus`}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => muta(i, i + 1)} disabled={i === randuri.length - 1}
              aria-label={`Muta ${cunoscute.get(r.key)} mai jos`}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" role="switch" aria-checked={r.on}
              aria-label={`${r.on ? "Ascunde" : "Arata"} ${cunoscute.get(r.key)}`}
              onClick={() => onChange(randuri.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
              className={`ml-1 mr-1 shrink-0 w-9 h-5 rounded-full transition-colors relative ${r.on ? "bg-primary" : "bg-border"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${r.on ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
