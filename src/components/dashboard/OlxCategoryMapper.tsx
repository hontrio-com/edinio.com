"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2, Search, ChevronRight, Check, X, FolderTree, Sparkles, Pencil } from "lucide-react";
import {
  getOlxCategoryChildren, suggestOlxCategory, getOlxCategoryAttributes, saveOlxCategoryMapEntry,
} from "@/lib/actions/olx.actions";
import type { OlxAttributeDef, OlxCategory, OlxCategoryMapEntry, OlxCategorySuggestion } from "@/lib/olx/types";
import { categoriaNuPrimesteProduse, atributeObligatoriiLipsa } from "@/lib/olx/mapping";
import { legatoriDeAtribute, type OlxMaparecAtribut, type OlxLegaturaAtribut } from "@/lib/olx/atribute";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/lib/ui";

export function OlxCategoryMapper({ businessId, categories, initialMap }: {
  businessId: string; categories: string[]; initialMap: Record<string, OlxCategoryMapEntry>;
}) {
  const [map, setMap] = useState<Record<string, OlxCategoryMapEntry>>(initialMap);
  const [editing, setEditing] = useState<string | null>(null);

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Mapare categorii</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Adaugă categorii produselor tale ca să le poți mapa la categoriile OLX.</p>
      </div>
    );
  }

  const mapped = categories.filter((c) => map[c]).length;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Mapare categorii</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Asociază fiecare categorie a ta cu o categorie OLX și completează atributele cerute ({mapped}/{categories.length} mapate).
          Produsele din categoriile nemapate nu se publică.
        </p>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {categories.map((cat) => {
          const entry = map[cat];
          return (
            <div key={cat} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
              <span className="w-1/3 min-w-0 truncate text-sm font-medium text-foreground" title={cat}>{cat}</span>
              <div className="min-w-0 flex-1">
                {entry ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                    <span className="truncate" title={entry.label}>{entry.label}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Nemapată</span>
                )}
              </div>
              <Button variant={entry ? "outline" : "default"} size="sm" onClick={() => setEditing(cat)}>
                <Pencil className="h-3.5 w-3.5" /> {entry ? "Editează" : "Mapează"}
              </Button>
            </div>
          );
        })}
      </div>

      {editing && (
        <CategoryModal
          businessId={businessId}
          edinioCategory={editing}
          initial={map[editing] ?? null}
          onClose={() => setEditing(null)}
          onSaved={(entry) => {
            setMap((m) => {
              const next = { ...m };
              if (entry) next[editing] = entry; else delete next[editing];
              return next;
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface Crumb { id: number; name: string }

function CategoryModal({ businessId, edinioCategory, initial, onClose, onSaved }: {
  businessId: string;
  edinioCategory: string;
  initial: OlxCategoryMapEntry | null;
  onClose: () => void;
  onSaved: (entry: OlxCategoryMapEntry | null) => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Two-phase: pick a leaf category, then fill its attributes.
  const [leaf, setLeaf] = useState<{ id: number; label: string; photos_limit?: number } | null>(
    initial ? { id: initial.category_id, label: initial.label, photos_limit: initial.photos_limit } : null,
  );
  const [attributes, setAttributes] = useState<OlxAttributeDef[] | null>(null);
  const [attrValues, setAttrValues] = useState<Record<string, OlxMaparecAtribut>>(initial?.attributes ?? {});
  const [saving, startSave] = useTransition();
  // Derived: while a leaf is chosen but its attribute defs haven't loaded yet.
  const loadingAttrs = leaf !== null && attributes === null;

  // Switch (or clear) the chosen OLX category, resetting the attribute state.
  function chooseLeaf(next: { id: number; label: string; photos_limit?: number } | null) {
    setLeaf(next);
    setAttributes(null);
    setAttrValues(next && initial && next.id === initial.category_id ? (initial.attributes ?? {}) : {});
  }

  useEffect(() => {
    if (!leaf) return;
    let cancelled = false;
    getOlxCategoryAttributes(businessId, leaf.id).then((r) => {
      if (cancelled) return;
      setAttributes("error" in r ? [] : r.attributes);
      if ("error" in r) toast.error(r.error);
    });
    return () => { cancelled = true; };
  }, [businessId, leaf]);

  function save() {
    if (!leaf) return;
    /*
      ⚠ ACEEAȘI regulă ca pe server, nu o copie a ei. Scrisă de două ori, s-ar fi despărțit la
      prima schimbare — iar ecranul ar fi lăsat să treacă exact ce serverul refuză, sau invers.
      Aici e doar ca omul să afle ÎNAINTE de o cerere dus-întors.
    */
    const nepotrivita = categoriaNuPrimesteProduse(attributes ?? []);
    if (nepotrivita) { toast.error(nepotrivita); return; }
    const missing = atributeObligatoriiLipsa(attributes ?? [], legatoriDeAtribute(attrValues));
    if (missing.length > 0) {
      toast.error(`Completează atributele obligatorii: ${missing.join(", ")}`);
      return;
    }
    // Keep only attribute-type values (price/salary are derived from the product).
    const clean: Record<string, OlxMaparecAtribut> = {};
    for (const a of attributes ?? []) {
      if (a.validation?.type && a.validation.type !== "attribute") continue;
      const v = attrValues[a.code];
      if (v === undefined) continue;
      if (typeof v === "string") { if (v.trim()) clean[a.code] = v; continue; }
      if (Array.isArray(v) && v.length > 0) { clean[a.code] = v; continue; }
      if (!Array.isArray(v) && typeof v === "object") clean[a.code] = v;
    }
    const entry: OlxCategoryMapEntry = { category_id: leaf.id, label: leaf.label, photos_limit: leaf.photos_limit, attributes: clean };
    startSave(async () => {
      const res = await saveOlxCategoryMapEntry(businessId, edinioCategory, entry);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mapare salvată.");
      router.refresh();
      onSaved(entry);
    });
  }

  /*
    ⚠ O MAPARE SCOASĂ LASĂ ANUNȚURI CARE SE VÂND MAI DEPARTE (01.09.2026)

    Fără mapare, sincronizarea nu mai poate construi corpul cererii — dar anunțurile RĂMÂN la OLX,
    cu prețul și stocul de atunci:

        Edinio: preț 200 lei
        OLX:    preț 150 lei, ACTIV, se vinde

    ⚠ Nu hotărâm noi. Sunt comercianți care scot maparea tocmai ca să oprească sincronizarea și să
    lase anunțurile în pace — o alegere legitimă. Întrebarea li se pune o dată, cu numărul în față.
  */
  const [intrebare, setIntrebare] = useState<number | null>(null);

  function removeMapping(politica?: "pastreaza" | "dezactiveaza") {
    startSave(async () => {
      const res = await saveOlxCategoryMapEntry(businessId, edinioCategory, null, politica);
      if ("intreaba" in res) { setIntrebare(res.intreaba.cate); return; }
      if ("error" in res) { toast.error(res.error); return; }
      setIntrebare(null);
      toast.success(politica === "dezactiveaza"
        ? "Mapare ștearsă. Anunțurile se dezactivează în câteva minute."
        : "Mapare ștearsă. Anunțurile rămân active pe OLX.");
      router.refresh();
      onSaved(null);
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">Mapează „{edinioCategory}”</h3>
            <p className="text-xs text-muted-foreground">Alege categoria OLX și completează atributele.</p>
          </div>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!leaf ? (
            <CategoryPicker businessId={businessId} defaultQuery={edinioCategory} onPick={(id, label, photos_limit) => chooseLeaf({ id, label, photos_limit })} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Categorie OLX aleasă</p>
                  <p className="truncate text-sm font-semibold text-foreground" title={leaf.label}>{leaf.label}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => chooseLeaf(null)}>Schimbă</Button>
              </div>

              {loadingAttrs ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <AttributeFields attributes={attributes ?? []} values={attrValues} onChange={setAttrValues} />
              )}
            </div>
          )}
        </div>

        {intrebare !== null && (
          <div className="w-full rounded-xl border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm font-medium text-foreground">
              {intrebare === 1
                ? "Un produs din această categorie are un anunț activ pe OLX."
                : `${intrebare} produse din această categorie au anunțuri active pe OLX.`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fără mapare, prețul și stocul nu mai ajung la OLX — anunțurile rămân la vânzare cu
              valorile de acum. Ce vrei să faci cu ele?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={saving}
                onClick={() => removeMapping("pastreaza")}>
                Păstrează anunțurile, oprește sincronizarea
              </Button>
              <Button size="sm" variant="destructive" disabled={saving}
                onClick={() => removeMapping("dezactiveaza")}>
                Dezactivează anunțurile
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setIntrebare(null)}>
                Anulează
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
          {initial ? (
            <Button variant="destructive" size="sm" onClick={() => removeMapping()} disabled={saving}>Șterge maparea</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Anulează</Button>
            <Button onClick={save} disabled={saving || !leaf}>
              {saving ? <><Loader2 className="animate-spin" /> Se salvează...</> : "Salvează maparea"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CategoryPicker({ businessId, defaultQuery, onPick }: {
  businessId: string; defaultQuery: string; onPick: (id: number, label: string, photosLimit?: number) => void;
}) {
  const [mode, setMode] = useState<"suggest" | "browse">("suggest");
  const [query, setQuery] = useState(defaultQuery);
  const [suggestions, setSuggestions] = useState<OlxCategorySuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse state
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [children, setChildren] = useState<OlxCategory[] | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(false);

  function runSuggest(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setSuggestions(null); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await suggestOlxCategory(businessId, q);
      setSuggestions("error" in res ? [] : res.suggestions);
      setSearching(false);
    }, 350);
  }

  // Auto-run the first suggestion using the Edinio category name (deferred out of
  // the effect body so it doesn't trip the sync-setState-in-effect rule).
  useEffect(() => {
    const id = requestAnimationFrame(() => runSuggest(defaultQuery));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadChildren(parentId: number | undefined, newCrumbs: Crumb[]) {
    setLoadingChildren(true);
    setCrumbs(newCrumbs);
    const res = await getOlxCategoryChildren(businessId, parentId);
    setChildren("error" in res ? [] : res.categories);
    setLoadingChildren(false);
  }

  useEffect(() => {
    if (mode !== "browse" || children !== null) return;
    const id = requestAnimationFrame(() => loadChildren(undefined, []));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function pickBrowse(cat: OlxCategory) {
    const path = [...crumbs, { id: cat.id, name: cat.name }];
    if (cat.is_leaf) {
      onPick(cat.id, path.map((c) => c.name).join(" > "), cat.photos_limit);
    } else {
      loadChildren(cat.id, path);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button onClick={() => setMode("suggest")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === "suggest" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
          <Sparkles className="h-3.5 w-3.5" /> Sugestii
        </button>
        <button onClick={() => setMode("browse")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === "browse" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
          <FolderTree className="h-3.5 w-3.5" /> Răsfoiește
        </button>
      </div>

      {mode === "suggest" ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" value={query} onChange={(e) => runSuggest(e.target.value)} placeholder="Ex: telefon, rochie, bicicletă..." />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <div className="space-y-1.5">
            {suggestions === null ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Scrie cel puțin 3 litere pentru sugestii.</p>
            ) : suggestions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Nicio sugestie. Încearcă „Răsfoiește”.</p>
            ) : suggestions.map((s) => {
              const label = [...(s.path ?? []).map((p) => p.name), s.name].join(" > ");
              return (
                <button key={s.id} onClick={() => onPick(s.id, label)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5">
                  <span className="min-w-0"><span className="block truncate text-sm text-foreground">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{label}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <button onClick={() => loadChildren(undefined, [])} className="hover:text-foreground">Toate</button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button onClick={() => loadChildren(c.id, crumbs.slice(0, i + 1))} className="hover:text-foreground">{c.name}</button>
              </span>
            ))}
          </div>
          {loadingChildren ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {(children ?? []).map((cat) => (
                <button key={cat.id} onClick={() => pickBrowse(cat)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5">
                  <span className="truncate text-sm text-foreground">{cat.name}</span>
                  {cat.is_leaf ? <Check className="h-4 w-4 shrink-0 text-success" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/*
  ⚠ DE UNDE VINE VALOAREA, NU DOAR CARE E (01.09.2026)

  Până azi fiecare atribut OLX primea o valoare fixă pe categorie — deci toți pantofii magazinului
  plecau cu același brand. Pentru un catalog adevărat nu ajunge: brandul e al produsului, mărimea
  e a variantei, iar „Stare: nou" chiar e o constantă.

  ⚠ Mapările vechi rămân valabile și se văd aici ca „Valoare fixă": un șir înseamnă, ca până acum,
  o constantă. Nicio migrație, nicio zi în care maparea cuiva nu mai înseamnă nimic.
*/

type Sursa = "constanta" | "camp" | "specificatie" | "varianta";

const CAMPURI: { valoare: "brand" | "sku" | "gtin" | "nume"; eticheta: string }[] = [
  { valoare: "brand", eticheta: "Brand" },
  { valoare: "nume", eticheta: "Nume produs" },
  { valoare: "sku", eticheta: "SKU" },
  { valoare: "gtin", eticheta: "Cod de bare (GTIN)" },
];

function sursaLui(v: OlxMaparecAtribut | undefined): Sursa {
  if (v === undefined) return "constanta";
  if (typeof v === "string" || (Array.isArray(v) && (v.length === 0 || typeof v[0] === "string"))) return "constanta";
  const l = (Array.isArray(v) ? v[0] : v) as OlxLegaturaAtribut;
  return l.sursa;
}

function AttributeFields({ attributes, values, onChange }: {
  attributes: OlxAttributeDef[];
  values: Record<string, OlxMaparecAtribut>;
  onChange: (v: Record<string, OlxMaparecAtribut>) => void;
}) {
  const editable = attributes.filter((a) => !a.validation?.type || a.validation.type === "attribute");
  if (editable.length === 0) {
    return <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">Această categorie nu cere atribute suplimentare.</p>;
  }

  function pune(code: string, v: OlxMaparecAtribut | undefined) {
    const next = { ...values };
    if (v === undefined) delete next[code];
    else next[code] = v;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {editable.map((a) => {
        const v = values[a.code];
        const sursa = sursaLui(v);
        const legatura = (typeof v === "object" && !Array.isArray(v) ? v : Array.isArray(v) && typeof v[0] === "object" ? v[0] : null) as OlxLegaturaAtribut | null;
        return (
          <div key={a.code} className="rounded-xl border border-border p-3">
            <label className="text-xs font-medium text-foreground">
              {a.label}
              {a.validation?.required && <span className="ml-1 text-destructive">*</span>}
              {a.unit && <span className="ml-1 text-muted-foreground">({a.unit})</span>}
            </label>

            <div className="mt-2 flex flex-wrap gap-2">
              <select
                className={selectCls}
                value={sursa}
                onChange={(e) => {
                  const s = e.target.value as Sursa;
                  if (s === "constanta") pune(a.code, "");
                  else if (s === "camp") pune(a.code, { sursa: "camp", camp: "brand" });
                  else if (s === "specificatie") pune(a.code, { sursa: "specificatie", eticheta: "" });
                  else pune(a.code, { sursa: "varianta", optiune: "" });
                }}
              >
                <option value="constanta">Valoare fixă</option>
                <option value="camp">Câmp din produs</option>
                <option value="specificatie">Specificație produs</option>
                <option value="varianta">Opțiune de variantă</option>
              </select>

              {sursa === "constanta" && (
                Array.isArray(a.values) && a.values.length > 0 ? (
                  <select
                    className={selectCls}
                    value={typeof v === "string" ? v : ""}
                    onChange={(e) => pune(a.code, e.target.value)}
                  >
                    <option value="">— alege —</option>
                    {a.values.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input
                    className="max-w-xs"
                    value={typeof v === "string" ? v : ""}
                    placeholder={a.validation?.numeric ? "număr" : "valoare"}
                    onChange={(e) => pune(a.code, e.target.value)}
                  />
                )
              )}

              {sursa === "camp" && (
                <select
                  className={selectCls}
                  value={legatura?.sursa === "camp" ? legatura.camp : "brand"}
                  onChange={(e) => pune(a.code, { sursa: "camp", camp: e.target.value as "brand" })}
                >
                  {CAMPURI.map((c) => <option key={c.valoare} value={c.valoare}>{c.eticheta}</option>)}
                </select>
              )}

              {sursa === "specificatie" && (
                <Input
                  className="max-w-xs"
                  value={legatura?.sursa === "specificatie" ? legatura.eticheta : ""}
                  placeholder="Eticheta specificației, ex. Culoare"
                  onChange={(e) => pune(a.code, { sursa: "specificatie", eticheta: e.target.value })}
                />
              )}

              {sursa === "varianta" && (
                <Input
                  className="max-w-xs"
                  value={legatura?.sursa === "varianta" ? legatura.optiune : ""}
                  placeholder="Numele opțiunii, ex. Mărime"
                  onChange={(e) => pune(a.code, { sursa: "varianta", optiune: e.target.value })}
                />
              )}
            </div>

            {sursa !== "constanta" && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Dacă produsul nu are valoarea asta, atributul nu se trimite. Pentru categoriile unde
                OLX îl cere, adaugă și o valoare fixă de rezervă din ecranul produsului.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

