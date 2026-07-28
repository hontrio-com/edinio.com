"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";
import {
  getTrendyolAttributeValues, getTrendyolCategoryAttributes, getTrendyolListingEditor,
  saveTrendyolListing, searchTrendyolBrands, suggestTrendyolAttributes, syncTrendyolProduct,
  type TrendyolEditorData, type TrendyolEditorVariant,
} from "@/lib/actions/trendyol.actions";
import type { TrendyolBrand, TrendyolCategoryAttribute, TrendyolProductAttribute, TrendyolStoreFront } from "@/lib/trendyol/types";
import { coteTvaVitrina, infoVitrina, tvaImplicitVitrina } from "@/lib/trendyol/types";

type AttrSel = { valueId?: number; custom?: string };
type AttrValue = { attributeValueId: number; attributeValue: string };

function toProductAttribute(attributeId: number, sel: AttrSel | undefined): TrendyolProductAttribute | null {
  if (!sel) return null;
  if (sel.custom && sel.custom.trim()) return { attributeId, customAttributeValue: sel.custom.trim() };
  if (sel.valueId) return { attributeId, attributeValueId: sel.valueId };
  return null;
}

export function TrendyolListingEditor({
  businessId, productId, storefront, onClose, onSaved,
}: {
  businessId: string; productId: string; storefront: TrendyolStoreFront;
  onClose: () => void;
  /** Lista de deasupra isi reimprospateaza randul, ca starea sa nu ramana veche. */
  onSaved?: () => void | Promise<void>;
}) {
  // Moneda si cotele de TVA nu sunt alegerea noastra: le impune vitrina pe care
  // vinde comerciantul. Preturile trimise sunt citite in moneda ei.
  const moneda = infoVitrina(storefront).moneda;
  const coteTva = coteTvaVitrina(storefront);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TrendyolEditorData | null>(null);
  const [groups, setGroups] = useState<TrendyolCategoryAttribute[]>([]);
  const [attrValues, setAttrValues] = useState<Record<number, AttrValue[]>>({});

  const [brandId, setBrandId] = useState<number | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [brandResults, setBrandResults] = useState<TrendyolBrand[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [dimWeight, setDimWeight] = useState("");
  const [listingAttrSel, setListingAttrSel] = useState<Record<number, AttrSel>>({});
  // Ce a fost completat automat, ca sa i se spuna comerciantului de unde vine.
  const [completate, setCompletate] = useState<Record<number, "firma" | "produs">>({});
  const [salveazaImplicite, setSalveazaImplicite] = useState(false);
  const [completeaza, startCompletare] = useTransition();
  const [variantAttrSel, setVariantAttrSel] = useState<Record<string, Record<number, AttrSel>>>({});
  const [variants, setVariants] = useState<TrendyolEditorVariant[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ed = await getTrendyolListingEditor(businessId, productId);
      if (!alive) return;
      if ("error" in ed) { toast.error(ed.error); onClose(); return; }
      setData(ed);
      setBrandId(ed.listing?.brand_id ?? ed.mappedBrandId ?? null);
      setBrandName(ed.mappedBrandName ?? "");
      setCategoryId(ed.listing?.category_id ?? ed.mappedCategoryId ?? null);
      // Valorile deja salvate: intai cele ale produsului, altfel implicitele
      // categoriei — munca facuta pe un produs se vede pe urmatoarele.
      const salvate = ed.listing?.attributes?.length ? ed.listing.attributes : ed.mappedAttributes;
      if (salvate?.length) {
        const sel: Record<number, AttrSel> = {};
        for (const a of salvate) sel[a.attributeId] = { valueId: a.attributeValueId, custom: a.customAttributeValue };
        setListingAttrSel(sel);
      }
      setDimWeight(ed.listing?.dimensional_weight != null ? String(ed.listing.dimensional_weight) : "");
      setVariants(ed.variants);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [businessId, productId, onClose]);

  // Load category attributes + their selectable values when the category is known.
  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    (async () => {
      const res = await getTrendyolCategoryAttributes(businessId, categoryId);
      if (!alive) return;
      if ("error" in res) { setGroups([]); return; }
      const gs = res.attributes.slice(0, 20);
      setGroups(gs);
      // Fetch values for attributes that use predefined values (not freetext-only).
      const withValues = gs.filter((g) => !(g.allowCustom && (!g.attributeValues || g.attributeValues.length === 0)));
      const map: Record<number, AttrValue[]> = {};
      for (const g of withValues) {
        const v = await getTrendyolAttributeValues(businessId, categoryId, g.attribute.id);
        if (!alive) return;
        if (!("error" in v)) map[g.attribute.id] = v.values;
      }
      setAttrValues(map);
    })();
    return () => { alive = false; };
  }, [businessId, categoryId]);

  /**
   * Completeaza atributele goale.
   *
   * `doarGoale` la incarcare: nu calcam peste ce a scris comerciantul. Butonul
   * „Completeaza automat" trece peste tot, ca sa poata reface dupa ce si-a
   * schimbat datele firmei.
   */
  const completeazaAutomat = (doarGoale: boolean) => {
    if (!categoryId) return;
    startCompletare(async () => {
      const res = await suggestTrendyolAttributes(businessId, productId, categoryId);
      if ("error" in res) { if (!doarGoale) toast.error(res.error); return; }
      if (res.sugestii.length === 0) { if (!doarGoale) toast.info("Nu am găsit ce completa automat."); return; }

      let puse = 0;
      setListingAttrSel((prev) => {
        const next = { ...prev };
        for (const s of res.sugestii) {
          const acum = next[s.attributeId];
          const gol = !acum || (!acum.valueId && !acum.custom?.trim());
          if (doarGoale && !gol) continue;
          next[s.attributeId] = { valueId: s.attributeValueId, custom: s.customAttributeValue };
          puse++;
        }
        return next;
      });
      setCompletate((prev) => {
        const next = { ...prev };
        for (const s of res.sugestii) next[s.attributeId] = s.sursa;
        return next;
      });
      if (!doarGoale) toast.success(`${puse} ${puse === 1 ? "câmp completat" : "câmpuri completate"}.`);
    });
  };

  // La deschidere, campurile goale se umplu singure. Datele de conformitate
  // (producator, importatori) sunt aceleasi pe tot catalogul: cerute produs cu
  // produs, ar insemna mii de completari identice.
  const autoRulat = useRef(false);
  useEffect(() => {
    if (!categoryId || groups.length === 0 || autoRulat.current) return;
    autoRulat.current = true;
    completeazaAutomat(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, groups.length]);

  const productAttrs = useMemo(() => groups.filter((g) => !g.varianter), [groups]);
  const varianterAttrs = useMemo(() => groups.filter((g) => g.varianter), [groups]);

  const setVariant = (key: string, patch: Partial<TrendyolEditorVariant>) =>
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  // Daca produsul are marca (din atributele Google), o cautam la Trendyol si o
  // alegem cand se potriveste exact — un click in minus pe fiecare produs.
  useEffect(() => {
    const marca = data?.productBrand?.trim();
    if (!marca || brandId) return;
    let alive = true;
    (async () => {
      const res = await searchTrendyolBrands(businessId, marca);
      if (!alive || "error" in res) return;
      const exact = res.brands.find((b) => b.name.trim().toLowerCase() === marca.toLowerCase());
      if (exact) { setBrandId(exact.id); setBrandName(exact.name); }
    })();
    return () => { alive = false; };
  }, [businessId, data?.productBrand, brandId]);

  const searchBrand = (q: string) => {
    setBrandQuery(q);
    if (q.trim().length < 2) { setBrandResults([]); return; }
    startTransition(async () => {
      const res = await searchTrendyolBrands(businessId, q);
      if (!("error" in res)) setBrandResults(res.brands);
    });
  };

  const buildInput = () => {
    const listingAttributes = productAttrs
      .map((g) => toProductAttribute(g.attribute.id, listingAttrSel[g.attribute.id]))
      .filter((x): x is TrendyolProductAttribute => x !== null);
    return {
      brand_id: brandId,
      brand_name: brandName || null,
      category_id: categoryId,
      attributes: listingAttributes,
      save_as_category_defaults: salveazaImplicite,
      dimensional_weight: dimWeight.trim() === "" ? null : Number(dimWeight),
      // Curierul nu face parte din produs pe marketplace-ul international; se
      // declara la expediere, o data cu AWB-ul.
      cargo_company_id: null,
      variants: variants.map((v) => {
        const sel = variantAttrSel[v.key] ?? {};
        const variantAttributes = varianterAttrs
          .map((g) => toProductAttribute(g.attribute.id, sel[g.attribute.id]))
          .filter((x): x is TrendyolProductAttribute => x !== null);
        return {
          barcode: v.barcode, stock_code: v.stock_code, attributes: variantAttributes,
          quantity: v.quantity, list_price: v.list_price, sale_price: v.sale_price, vat_rate: v.vat_rate, enabled: v.enabled,
        };
      }),
    };
  };

  const save = (then?: "sync") => {
    if (!categoryId) { toast.error("Mapează categoria produsului mai întâi."); return; }
    if (!brandId) { toast.error("Alege brandul."); return; }
    startTransition(async () => {
      const res = await saveTrendyolListing(businessId, productId, buildInput());
      if ("error" in res) { toast.error(res.error); return; }
      if (then === "sync") {
        const s = await syncTrendyolProduct(businessId, productId);
        if ("error" in s) { toast.error(s.error); return; }
        toast.success("Trimis pe Trendyol.");
        await onSaved?.();
        router.refresh(); onClose(); return;
      }
      toast.success("Listare salvată.");
      await onSaved?.();
      router.refresh();
    });
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Se încarcă...</div>;
  }
  if (!data) return null;

  const renderAttrSelect = (g: TrendyolCategoryAttribute, sel: AttrSel | undefined, onChange: (s: AttrSel) => void) => {
    const values = attrValues[g.attribute.id] ?? [];
    if (values.length === 0 && g.allowCustom) {
      return <input value={sel?.custom ?? ""} onChange={(e) => onChange({ custom: e.target.value })}
        placeholder="valoare" className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />;
    }
    return (
      <select value={sel?.valueId ?? ""} onChange={(e) => onChange({ valueId: e.target.value ? Number(e.target.value) : undefined })}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
        <option value="">{g.required ? "Alege" : "-"}</option>
        {values.map((v) => <option key={v.attributeValueId} value={v.attributeValueId}>{v.attributeValue}</option>)}
      </select>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-4">
      {!categoryId && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Categoria acestui produs nu este mapată. Mapeaz-o în secțiunea de mapare categorii, apoi revino.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Brand</label>
          <input value={brandId ? (brandName || `#${brandId}`) : brandQuery}
            onChange={(e) => { setBrandId(null); setBrandName(""); searchBrand(e.target.value); }}
            placeholder="caută brand" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          {!brandId && brandResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border shadow">
              {brandResults.map((b) => (
                <button key={b.id} onClick={() => { setBrandId(b.id); setBrandName(b.name); setBrandResults([]); setBrandQuery(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted">{b.name}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Greutate (desi/kg, opțional)</label>
          <input type="number" step="0.1" min="0" value={dimWeight} onChange={(e) => setDimWeight(e.target.value)}
            placeholder="auto din greutatea produsului" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      {productAttrs.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-xs font-semibold text-foreground">Atribute produs</p>
            <button type="button" onClick={() => completeazaAutomat(false)} disabled={completeaza}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60">
              {completeaza ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
              Completează automat
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Datele de conformitate (producător, importatori) se iau din datele firmei tale, din Setări. Restul se
            deduc din produs, doar când sunt fără dubiu — verifică-le înainte de trimitere.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {productAttrs.map((g) => {
              const sursa = completate[g.attribute.id];
              const sel = listingAttrSel[g.attribute.id];
              const areValoare = !!sel && (!!sel.valueId || !!sel.custom?.trim());
              return (
                <div key={g.attribute.id}>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
                    <span>{g.attribute.name}{g.required ? " *" : ""}</span>
                    {sursa && areValoare && (
                      <span className="text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-1 py-px rounded">
                        {sursa === "firma" ? "din datele firmei" : "din produs"}
                      </span>
                    )}
                  </label>
                  {renderAttrSelect(g, sel, (s) => {
                    setListingAttrSel((p) => ({ ...p, [g.attribute.id]: s }));
                    // Odata schimbat de om, nu mai e „completat automat".
                    setCompletate((p) => { const n = { ...p }; delete n[g.attribute.id]; return n; });
                  })}
                </div>
              );
            })}
          </div>
          {data?.category && (
            <label className="mt-3 flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={salveazaImplicite} onChange={(e) => setSalveazaImplicite(e.target.checked)}
                className="mt-0.5 rounded" />
              <span>
                Salvează brandul și aceste atribute ca implicite pentru categoria „{data.category}”
                <span className="block text-[11px] text-muted-foreground">
                  Următoarele produse din aceeași categorie vor porni completate.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      {/* Variants */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Variante ({variants.length})</p>
        <div className="space-y-2">
          {variants.map((v) => (
            <div key={v.key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{v.label}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={v.enabled} onChange={(e) => setVariant(v.key, { enabled: e.target.checked })} /> Activă
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Barcode</label>
                  <input value={v.barcode} onChange={(e) => setVariant(v.key, { barcode: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Stoc</label>
                  <input type="number" min="0" value={v.quantity ?? ""} onChange={(e) => setVariant(v.key, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Preț vânzare ({moneda})</label>
                  <input type="number" step="0.01" min="0" value={v.sale_price ?? ""} onChange={(e) => setVariant(v.key, { sale_price: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder={String(v.ron_price)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Preț listă ({moneda})</label>
                  <input type="number" step="0.01" min="0" value={v.list_price ?? ""} onChange={(e) => setVariant(v.key, { list_price: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">TVA</label>
                  <select value={v.vat_rate ?? tvaImplicitVitrina(storefront)}
                    onChange={(e) => setVariant(v.key, { vat_rate: Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                    {coteTva.map((c) => <option key={c} value={c}>{c}%</option>)}
                  </select>
                </div>
                {varianterAttrs.map((g) => (
                  <div key={g.attribute.id}>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{g.attribute.name}{g.required ? " *" : ""}</label>
                    {renderAttrSelect(g, variantAttrSel[v.key]?.[g.attribute.id], (s) =>
                      setVariantAttrSel((p) => ({ ...p, [v.key]: { ...(p[v.key] ?? {}), [g.attribute.id]: s } })))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => save()} disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">Salvează</button>
        <button onClick={() => save("sync")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> Salvează și trimite
        </button>
        <button onClick={onClose} disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">Închide</button>
      </div>
    </div>
  );
}
