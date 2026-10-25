"use client";

import { useMemo, useState } from "react";
import { FolderTree, GalleryHorizontal, LayoutGrid, MousePointerClick, Package, Trash2 } from "lucide-react";
import { ProductPicker } from "@/components/pages/ProductPicker";
import { SECTION_MAX, type ProductSection, type SectionMode } from "@/lib/store-sections";
import { cn } from "@/lib/utils/cn";
import type { ContinutMagazin } from "../useContinutMagazin";
import { Grup, Nota, inputCls } from "./ui";

/**
 * Un singur rand de produse, sub nodul lui din arbore.
 *
 * In editorul vechi, randurile erau o lista intr-un panou, cu propriile sageti
 * de ordine si propriul comutator; in arborele unic fiecare rand e o sectiune,
 * deci ordinea si vizibilitatea le dau tragerea si ochiul, ca la orice sectiune.
 * Aici ramane ce e al randului: titlul, de unde vin produsele, asezarea.
 *
 * Randul traieste in `page_content.product_sections`, deci stergerea lui e o modificare de
 * continut: se cere o confirmare, apoi intra in ciorna (etapa 6), ca orice alta; Anuleaza il aduce
 * inapoi, iar din magazin dispare la „Publică”.
 */

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

const SURSE: { id: SectionMode; eticheta: string; icon: typeof Package; ajutor: string }[] = [
  { id: "selected", eticheta: "Manual", icon: MousePointerClick, ajutor: "Alegi tu produsele, unul câte unul." },
  { id: "category", eticheta: "Categorie", icon: FolderTree, ajutor: "Toate produsele dintr-o categorie." },
  { id: "bundles", eticheta: "Pachete", icon: Package, ajutor: "Pachetele tale de produse." },
];

/** Arborele de categorii, intins intr-o lista cu adancime, pentru o lista derulanta indentata. */
function inOrdine(categorii: Cat[]): { name: string; adancime: number }[] {
  const pePărinte = new Map<string | null, Cat[]>();
  for (const c of categorii) {
    const k = c.parent_id ?? null;
    pePărinte.set(k, [...(pePărinte.get(k) ?? []), c]);
  }
  for (const l of pePărinte.values()) l.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  const out: { name: string; adancime: number }[] = [];
  const umbla = (parinte: string | null, adancime: number) => {
    for (const c of pePărinte.get(parinte) ?? []) {
      out.push({ name: c.name, adancime });
      umbla(c.id, adancime + 1);
    }
  };
  umbla(null, 0);
  return out;
}

export function ContinutRand({ continut, idRand, businessId, categorii, onSters }: {
  continut: ContinutMagazin;
  /** Id-ul randului din `page_content.product_sections` (`settings.sectionRef` al sectiunii). */
  idRand: string;
  businessId: string;
  categorii: Cat[];
  /** Dupa stergere: nodul nu mai exista, arborele trebuie sa se intoarca. */
  onSters: () => void;
}) {
  const { pc, seteaza } = continut;
  const rand = (pc.product_sections ?? []).find((r) => r.id === idRand);
  const ordonate = useMemo(() => inOrdine(categorii), [categorii]);
  const [confirmaStergerea, setConfirmaStergerea] = useState(false);
  const [sterge, setSterge] = useState(false);

  if (!rand) {
    return <Nota>Rândul nu mai există. Poate a fost șters din altă filă; reîncarcă pagina.</Nota>;
  }

  const pune = (patch: Partial<ProductSection>) =>
    seteaza("rand", (p) => ({ ...p, product_sections: (p.product_sections ?? []).map((r) => (r.id === idRand ? { ...r, ...patch } : r)) }));
  const sursa = SURSE.find((s) => s.id === rand.mode) ?? SURSE[0];

  async function stergeRandul() {
    setSterge(true);
    const ok = await continut.seteazaSiSalveaza("rand", (p) => ({
      ...p, product_sections: (p.product_sections ?? []).filter((r) => r.id !== idRand),
    }));
    setSterge(false);
    if (ok) onSters();
  }

  return (
    <div className="space-y-5">
      <Grup titlu="Titlul rândului">
        <input type="text" value={rand.title} className={inputCls} aria-label="Titlul rândului"
          placeholder={rand.mode === "bundles" ? "Pachete" : "Titlul rândului"} onChange={(e) => pune({ title: e.target.value })} />
      </Grup>

      <Grup titlu="De unde vin produsele">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="De unde vin produsele">
          {SURSE.map((s) => {
            const Icon = s.icon;
            const activ = rand.mode === s.id;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={activ} onClick={() => pune({ mode: s.id })}
                className={cn("flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-all",
                  activ ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                <Icon className="h-4 w-4" />
                {s.eticheta}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">{sursa.ajutor}</p>

        {rand.mode === "selected" && (
          <ProductPicker businessId={businessId} selectedIds={rand.productIds ?? []} onChange={(ids) => pune({ productIds: ids })} />
        )}
        {rand.mode === "category" && (
          ordonate.length === 0 ? (
            <Nota href="/dashboard/products/categories" eticheta="Produse > Categorii">Nu ai încă nicio categorie.</Nota>
          ) : (
            <div className="space-y-2">
              <select value={rand.category ?? ""} className={inputCls} aria-label="Categoria rândului"
                onChange={(e) => pune({ category: e.target.value || undefined })}>
                <option value="">Alege categoria...</option>
                {ordonate.map((c) => <option key={c.name} value={c.name}>{`${"  ".repeat(c.adancime)}${c.name}`}</option>)}
              </select>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={rand.includeSubcategories !== false} className="rounded border-border accent-primary"
                  onChange={(e) => pune({ includeSubcategories: e.target.checked })} />
                Include și subcategoriile
              </label>
            </div>
          )
        )}
        {rand.mode === "bundles" && (
          <Nota href="/dashboard/products/bundles" eticheta="Produse > Pachete">Rândul arată singur pachetele tale de produse.</Nota>
        )}
      </Grup>

      <Grup titlu="Așezarea">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-1" role="radiogroup" aria-label="Așezarea rândului">
            {([["grid", LayoutGrid, "Grilă"], ["carousel", GalleryHorizontal, "Carusel"]] as const).map(([id, Icon, eticheta]) => {
              const activ = (rand.layout ?? "grid") === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={activ} onClick={() => pune({ layout: id })}
                  className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
                    activ ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                  <Icon className="h-3.5 w-3.5" /> {eticheta}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Maximum
            <input type="number" min={1} max={SECTION_MAX} value={rand.limit ?? 8} aria-label="Câte produse cel mult"
              onChange={(e) => pune({ limit: Math.min(Math.max(parseInt(e.target.value) || 1, 1), SECTION_MAX) })}
              className="w-16 px-2 py-1.5 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary" />
          </label>
        </div>
      </Grup>

      <div className="rounded-lg border border-border p-3 space-y-2">
        {confirmaStergerea ? (
          <>
            <p className="text-xs text-foreground">Ștergi rândul „{rand.title || "fără titlu"}”? Dispare din magazin la „Publică”; până atunci îl aduci înapoi cu Anulează.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void stergeRandul()} disabled={sterge}
                className="h-8 px-3 rounded-lg bg-destructive text-white text-xs font-semibold disabled:opacity-60">
                {sterge ? "Se șterge..." : "Da, șterge rândul"}
              </button>
              <button type="button" onClick={() => setConfirmaStergerea(false)} disabled={sterge}
                className="h-8 px-3 rounded-lg border border-border text-xs">Nu</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmaStergerea(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline">
            <Trash2 className="h-3.5 w-3.5" /> Șterge rândul
          </button>
        )}
      </div>
    </div>
  );
}
