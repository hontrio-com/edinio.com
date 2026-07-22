"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Tag, Layers, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ROMANIAN_COUNTIES } from "@/lib/validations/business";
import { newShippingId, type ShippingClass, type ShippingRule, type ShippingCondition, type ShippingAction } from "@/lib/shipping/rules";

// Setari > Livrare: manager de clase + reguli condiționale. Faza 1 = scenarii presetate
// (trepte greutate/valoare, supliment pe clasă). Faza 2 = builder custom complet (orice
// condiție + acțiune + curieri + prioritate). Lista de reguli ESTE sursa de adevăr.

const inp =
  "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

const PRESET_KEYS = ["weight_tier", "value_tier", "class_surcharge"] as const;
type PresetKind = (typeof PRESET_KEYS)[number];

const COURIER_OPTIONS = [
  { value: "fan-courier", label: "FAN Courier" },
  { value: "dpd", label: "DPD" },
  { value: "cargus", label: "Cargus" },
  { value: "sameday", label: "Sameday" },
  { value: "woot", label: "Woot" },
  { value: "colete", label: "Colete Online" },
  { value: "own", label: "Curier propriu" },
  { value: "pickup", label: "Ridicare personala" },
];

const CONDITION_LABELS: Record<ShippingCondition["type"], string> = {
  weight: "Greutate (kg)", subtotal: "Valoare cos (lei)", quantity: "Cantitate (buc)",
  class: "Clasa", category: "Categorie", product: "Produs", county: "Judet",
};

function numOrUndef(v: string): number | undefined {
  return v.trim() === "" ? undefined : Math.max(0, Number(v) || 0);
}

function defaultCondition(type: ShippingCondition["type"]): ShippingCondition {
  switch (type) {
    case "weight":   return { type: "weight", min: 0 };
    case "subtotal": return { type: "subtotal", min: 0 };
    case "quantity": return { type: "quantity", min: 1 };
    case "class":    return { type: "class", classIds: [], mode: "any" };
    case "category": return { type: "category", categories: [] };
    case "product":  return { type: "product", productIds: [] };
    case "county":   return { type: "county", counties: [] };
  }
}

function defaultAction(type: ShippingAction["type"]): ShippingAction {
  switch (type) {
    case "surcharge": return { type: "surcharge", amount: 0 };
    case "flat":      return { type: "flat", amount: 0 };
    case "free":      return { type: "free" };
    case "hide":      return { type: "hide" };
  }
}

/* ─── Chips multi-select (clase / categorii / produse / judete / curieri) ───── */

function ChipMultiSelect({ options, selected, onChange, placeholder }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sel = new Set(selected);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const toggle = (v: string) => onChange(sel.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  // Dropdown randat in portal la <body> ca sa nu fie taiat de containerele parinte
  // cu overflow-hidden (cardul de reguli). Repozitionat la scroll/resize; se inchide
  // la click in afara (trigger sau dropdown) — fara backdrop care ar acoperi inputul.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
      setQ("");
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onOutside);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [open]);

  return (
    <div ref={triggerRef} className="min-w-[180px] flex-1">
      <div className="flex flex-wrap gap-1 items-center min-h-[34px] px-2 py-1 border border-border rounded-lg bg-background cursor-text" onClick={() => setOpen(true)}>
        {selected.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs text-foreground">
            {labelOf(v)}
            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} aria-label="Elimina"><X size={11} /></button>
          </span>
        ))}
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={selected.length ? "" : placeholder}
          className="flex-1 min-w-[70px] text-sm bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground" />
      </div>
      {open && rect && createPortal(
        <div ref={dropdownRef} className="fixed z-50 max-h-60 overflow-auto bg-surface border border-border rounded-lg shadow-lg"
          style={{ top: rect.top, left: rect.left, width: rect.width }}>
          {filtered.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">Niciun rezultat</p>
          ) : filtered.map((o) => (
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-muted/50 flex items-center gap-2 text-foreground">
              <span className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                style={sel.has(o.value) ? { backgroundColor: "var(--color-primary)", borderColor: "var(--color-primary)" } : { borderColor: "var(--color-border)" }}>
                {sel.has(o.value) && <span className="text-white text-[9px]">&#10003;</span>}
              </span>
              {o.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ─── Editor de condiție (builder custom) ──────────────────────────────────── */

function ConditionRow({ cond, onChange, onRemove, classes, categories, products }: {
  cond: ShippingCondition;
  onChange: (c: ShippingCondition) => void;
  onRemove: () => void;
  classes: ShippingClass[];
  categories: string[];
  products: { id: string; name: string }[];
}) {
  const unit = cond.type === "weight" ? "kg" : cond.type === "subtotal" ? "lei" : "buc";
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-border bg-background/50">
      <select className={inp} value={cond.type}
        onChange={(e) => onChange(defaultCondition(e.target.value as ShippingCondition["type"]))}>
        {(Object.keys(CONDITION_LABELS) as ShippingCondition["type"][]).map((t) => (
          <option key={t} value={t}>{CONDITION_LABELS[t]}</option>
        ))}
      </select>

      {(cond.type === "weight" || cond.type === "subtotal" || cond.type === "quantity") && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">de la</span>
          <input type="number" min={0} step={cond.type === "quantity" ? "1" : "0.01"} className={`${inp} w-20`}
            value={cond.min ?? ""} onChange={(e) => onChange({ ...cond, min: numOrUndef(e.target.value) })} />
          <span className="text-muted-foreground">pana sub</span>
          <input type="number" min={0} step={cond.type === "quantity" ? "1" : "0.01"} className={`${inp} w-20`}
            value={cond.max ?? ""} onChange={(e) => onChange({ ...cond, max: numOrUndef(e.target.value) })} />
          <span className="text-muted-foreground">{unit}</span>
        </div>
      )}

      {cond.type === "class" && (
        <>
          <ChipMultiSelect placeholder="Alege clase" selected={cond.classIds}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(v) => onChange({ ...cond, classIds: v })} />
          <select className={inp} value={cond.mode} onChange={(e) => onChange({ ...cond, mode: e.target.value === "all" ? "all" : "any" })}>
            <option value="any">oricare</option>
            <option value="all">toate</option>
          </select>
        </>
      )}
      {cond.type === "category" && (
        <ChipMultiSelect placeholder="Alege categorii" selected={cond.categories}
          options={categories.map((c) => ({ value: c, label: c }))}
          onChange={(v) => onChange({ ...cond, categories: v })} />
      )}
      {cond.type === "product" && (
        <ChipMultiSelect placeholder="Cauta produse" selected={cond.productIds}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => onChange({ ...cond, productIds: v })} />
      )}
      {cond.type === "county" && (
        <ChipMultiSelect placeholder="Alege judete" selected={cond.counties}
          options={ROMANIAN_COUNTIES.map((c) => ({ value: c, label: c }))}
          onChange={(v) => onChange({ ...cond, counties: v })} />
      )}

      <button type="button" onClick={onRemove}
        className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors" aria-label="Sterge conditia">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── Component principal ──────────────────────────────────────────────────── */

export function ShippingRulesEditor({
  classes, rules, categories = [], products = [], onClassesChange, onRulesChange,
}: {
  classes: ShippingClass[];
  rules: ShippingRule[];
  categories?: string[];
  products?: { id: string; name: string }[];
  onClassesChange: (c: ShippingClass[]) => void;
  onRulesChange: (r: ShippingRule[]) => void;
}) {
  const [newClass, setNewClass] = useState("");

  function addClass() {
    const name = newClass.trim();
    if (!name) return;
    onClassesChange([...classes, { id: newShippingId("cls"), name }]);
    setNewClass("");
  }

  function updateRule(id: string, patch: Partial<ShippingRule>) {
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function updateCond(id: string, condType: string, patch: Record<string, unknown>) {
    onRulesChange(rules.map((r) =>
      r.id === id ? { ...r, conditions: r.conditions.map((c) => (c.type === condType ? { ...c, ...patch } : c)) } : r));
  }
  function updateAction(id: string, patch: Record<string, unknown>) {
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, action: { ...r.action, ...patch } as ShippingAction } : r)));
  }
  function removeRule(id: string) {
    onRulesChange(rules.filter((r) => r.id !== id));
  }

  function addPreset(kind: PresetKind) {
    const base = { id: newShippingId("r"), enabled: true, couriers: null } as const;
    let rule: ShippingRule;
    if (kind === "weight_tier") {
      rule = { ...base, name: "Treapta de greutate", priority: 10, presetKey: "weight_tier",
        conditions: [{ type: "weight", min: 0, max: 1 }], action: { type: "flat", amount: 0 } };
    } else if (kind === "value_tier") {
      rule = { ...base, name: "Treapta de valoare", priority: 5, presetKey: "value_tier",
        conditions: [{ type: "subtotal", min: 0, max: 100 }], action: { type: "flat", amount: 0 } };
    } else {
      rule = { ...base, name: "Supliment pe clasa", priority: 0, presetKey: "class_surcharge",
        conditions: [{ type: "class", classIds: classes[0] ? [classes[0].id] : [], mode: "any" }], action: { type: "surcharge", amount: 0 } };
    }
    onRulesChange([...rules, rule]);
  }
  function addCustom() {
    onRulesChange([...rules, {
      id: newShippingId("r"), name: "Regula noua", enabled: true, priority: 0,
      conditions: [{ type: "weight", min: 0 }], action: { type: "surcharge", amount: 0 }, couriers: null,
    }]);
  }

  const hasClasses = classes.length > 0;
  const isPreset = (r: ShippingRule) => (PRESET_KEYS as readonly string[]).includes(r.presetKey ?? "");

  return (
    <div className="space-y-5">
      {/* ── Clase de transport ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" /> Clase de transport
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Grupeaza produsele (ex: Voluminos, Fragil) si aplica-le reguli. Alegi clasa pe fiecare produs.
          </p>
        </div>
        <div className="px-5 py-4 space-y-2">
          {classes.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input type="text" value={c.name}
                onChange={(e) => onClassesChange(classes.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                className={`${inp} flex-1`} />
              <button type="button" onClick={() => onClassesChange(classes.filter((x) => x.id !== c.id))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors" aria-label="Sterge clasa">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input type="text" value={newClass} onChange={(e) => setNewClass(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClass(); } }}
              placeholder="Nume clasa noua (ex: Voluminos)" className={`${inp} flex-1`} />
            <button type="button" onClick={addClass} disabled={!newClass.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50">
              <Plus className="h-4 w-4" /> Adauga
            </button>
          </div>
        </div>
      </div>

      {/* ── Reguli condiționale ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" /> Reguli de transport
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Preturi diferite in functie de greutate, valoare, clasa, categorie, produs sau judet. Treptele/pretul fix se aplica
            curierilor cu pret fix (Curier propriu / setat pe &bdquo;Pret fix&rdquo;); suplimentul/gratuit/ascunde se aplica oricarui curier.
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {rules.length === 0 && (
            <p className="text-xs text-muted-foreground">Nicio regula. Adauga un scenariu presetat sau o regula custom mai jos.</p>
          )}

          {rules.map((rule) => (
            <div key={rule.id} className="border border-border rounded-xl p-3 bg-background/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                {isPreset(rule) ? (
                  <span className="text-xs font-semibold text-foreground">
                    {rule.presetKey === "weight_tier" ? "Treapta de greutate"
                      : rule.presetKey === "value_tier" ? "Treapta de valoare" : "Supliment pe clasa"}
                  </span>
                ) : (
                  <input type="text" value={rule.name} onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                    className={`${inp} flex-1 font-semibold`} placeholder="Nume regula" />
                )}
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={rule.enabled} onCheckedChange={(v) => updateRule(rule.id, { enabled: v })} className="scale-90" />
                  <button type="button" onClick={() => removeRule(rule.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors" aria-label="Sterge regula">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Editoare presetate (compacte) */}
              {rule.presetKey === "weight_tier" && rule.conditions[0]?.type === "weight" && rule.action.type === "flat" && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">De la</span>
                  <input type="number" min={0} step="0.1" className={`${inp} w-20`} value={rule.conditions[0].min ?? ""}
                    onChange={(e) => updateCond(rule.id, "weight", { min: numOrUndef(e.target.value) })} />
                  <span className="text-muted-foreground">pana sub</span>
                  <input type="number" min={0} step="0.1" className={`${inp} w-20`} value={rule.conditions[0].max ?? ""}
                    onChange={(e) => updateCond(rule.id, "weight", { max: numOrUndef(e.target.value) })} />
                  <span className="text-muted-foreground">kg &rarr; pret</span>
                  <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.action.amount}
                    onChange={(e) => updateAction(rule.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="text-muted-foreground">lei</span>
                </div>
              )}
              {rule.presetKey === "value_tier" && rule.conditions[0]?.type === "subtotal" && rule.action.type === "flat" && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">De la</span>
                  <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.conditions[0].min ?? ""}
                    onChange={(e) => updateCond(rule.id, "subtotal", { min: numOrUndef(e.target.value) })} />
                  <span className="text-muted-foreground">pana sub</span>
                  <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.conditions[0].max ?? ""}
                    onChange={(e) => updateCond(rule.id, "subtotal", { max: numOrUndef(e.target.value) })} />
                  <span className="text-muted-foreground">lei &rarr; pret</span>
                  <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.action.amount}
                    onChange={(e) => updateAction(rule.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="text-muted-foreground">lei</span>
                </div>
              )}
              {rule.presetKey === "class_surcharge" && rule.conditions[0]?.type === "class" && rule.action.type === "surcharge" && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Daca cosul contine clasa</span>
                  <select className={inp} value={rule.conditions[0].classIds[0] ?? ""}
                    onChange={(e) => updateCond(rule.id, "class", { classIds: e.target.value ? [e.target.value] : [] })}>
                    <option value="">— alege —</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="text-muted-foreground">&rarr; supliment +</span>
                  <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.action.amount}
                    onChange={(e) => updateAction(rule.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="text-muted-foreground">lei</span>
                </div>
              )}

              {/* Editor custom (builder complet) */}
              {!isPreset(rule) && (
                <div className="space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Conditii {rule.conditions.length > 1 ? "(toate trebuie indeplinite)" : ""}
                  </p>
                  {rule.conditions.length === 0 && (
                    <p className="text-xs text-muted-foreground">Fara conditii = se aplica la orice comanda.</p>
                  )}
                  {rule.conditions.map((cond, idx) => (
                    <ConditionRow key={idx} cond={cond} classes={classes} categories={categories} products={products}
                      onChange={(c) => updateRule(rule.id, { conditions: rule.conditions.map((x, i) => (i === idx ? c : x)) })}
                      onRemove={() => updateRule(rule.id, { conditions: rule.conditions.filter((_, i) => i !== idx) })} />
                  ))}
                  <button type="button" onClick={() => updateRule(rule.id, { conditions: [...rule.conditions, defaultCondition("weight")] })}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border border-border rounded-lg text-foreground hover:bg-muted transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Conditie
                  </button>

                  {/* Actiune */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-full">Actiune</span>
                    <select className={inp} value={rule.action.type}
                      onChange={(e) => updateRule(rule.id, { action: defaultAction(e.target.value as ShippingAction["type"]) })}>
                      <option value="surcharge">Supliment</option>
                      <option value="flat">Pret fix (curieri fix)</option>
                      <option value="free">Transport gratuit</option>
                      <option value="hide">Ascunde curierul</option>
                    </select>
                    {rule.action.type === "surcharge" && (
                      <>
                        <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.action.amount}
                          onChange={(e) => updateAction(rule.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                        <select className={inp} value={rule.action.percent ? "pct" : "lei"}
                          onChange={(e) => updateAction(rule.id, { percent: e.target.value === "pct" })}>
                          <option value="lei">lei</option>
                          <option value="pct">%</option>
                        </select>
                      </>
                    )}
                    {rule.action.type === "flat" && (
                      <>
                        <input type="number" min={0} step="0.01" className={`${inp} w-24`} value={rule.action.amount}
                          onChange={(e) => updateAction(rule.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                        <span className="text-muted-foreground">lei</span>
                      </>
                    )}
                  </div>

                  {/* Curieri + prioritate */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">Se aplica la:</span>
                    <ChipMultiSelect placeholder="Toti curierii" selected={rule.couriers ?? []} options={COURIER_OPTIONS}
                      onChange={(v) => updateRule(rule.id, { couriers: v.length ? v : null })} />
                    <span className="text-xs text-muted-foreground shrink-0">Prioritate</span>
                    <input type="number" step="1" className={`${inp} w-20`} value={rule.priority}
                      onChange={(e) => updateRule(rule.id, { priority: Number(e.target.value) || 0 })} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Scenarii presetate + regula custom */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => addPreset("weight_tier")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-foreground hover:bg-muted transition-colors">
              <Plus className="h-3.5 w-3.5" /> Treapta de greutate
            </button>
            <button type="button" onClick={() => addPreset("value_tier")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-foreground hover:bg-muted transition-colors">
              <Plus className="h-3.5 w-3.5" /> Treapta de valoare
            </button>
            <button type="button" onClick={() => addPreset("class_surcharge")} disabled={!hasClasses}
              title={hasClasses ? undefined : "Adauga intai o clasa de transport"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus className="h-3.5 w-3.5" /> Supliment pe clasa
            </button>
            <button type="button" onClick={addCustom}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors">
              <Plus className="h-3.5 w-3.5" /> Regula custom
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
