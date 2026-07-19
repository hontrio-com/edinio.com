"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Upload } from "lucide-react";
import {
  getAboutYouAttributeGroups, getAboutYouBrands, getAboutYouListingEditor,
  publishAboutYouProduct, saveAboutYouListing, syncAboutYouProduct,
  type AboutYouEditorData, type AboutYouEditorVariant,
} from "@/lib/actions/aboutyou.actions";
import type { AboutYouAttributeGroup, AboutYouBrand } from "@/lib/aboutyou/types";

export interface AboutYouPricing { mode: "fx_from_ron" | "manual_eur"; rate?: number; marginPct?: number }

// Attribute groups do not label color/size explicitly, so detect them by name.
function isColorGroup(g: AboutYouAttributeGroup) { return /colou?r|culoare|farbe/i.test(`${g.name} ${g.frontend_name}`); }
function isSizeGroup(g: AboutYouAttributeGroup) { return /(size|m[aă]rime|gr[oö]sse|größe)/i.test(`${g.name} ${g.frontend_name}`); }

function eurPreview(ron: number, pricing: AboutYouPricing): string {
  if (pricing.mode === "manual_eur" || !pricing.rate || pricing.rate <= 0) return "-";
  const eur = (ron / pricing.rate) * (1 + Math.max(0, pricing.marginPct ?? 0) / 100);
  return `${(Math.round(eur * 100) / 100).toFixed(2)} EUR`;
}

export function AboutYouListingEditor({
  businessId, productId, pricing, onClose,
}: {
  businessId: string; productId: string; pricing: AboutYouPricing; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AboutYouEditorData | null>(null);
  const [brands, setBrands] = useState<AboutYouBrand[]>([]);
  const [groups, setGroups] = useState<AboutYouAttributeGroup[]>([]);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [attrSel, setAttrSel] = useState<Record<number, number>>({});
  const [hsCode, setHsCode] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("RO");
  const [variants, setVariants] = useState<AboutYouEditorVariant[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [ed, br] = await Promise.all([
        getAboutYouListingEditor(businessId, productId),
        getAboutYouBrands(businessId),
      ]);
      if (!alive) return;
      if ("error" in ed) { toast.error(ed.error); onClose(); return; }
      setData(ed);
      setBrandId(ed.listing?.brand_id ?? null);
      setCategoryId(ed.listing?.category_id ?? ed.mappedCategoryId ?? null);
      setColorId(ed.listing?.color_id ?? null);
      setHsCode(ed.listing?.hs_code ?? "");
      setCountryOfOrigin(ed.listing?.country_of_origin ?? "RO");
      setVariants(ed.variants);
      if (!("error" in br)) setBrands(br.brands);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [businessId, productId, onClose]);

  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    (async () => {
      const res = await getAboutYouAttributeGroups(businessId, categoryId);
      if (!alive) return;
      if ("error" in res) { setGroups([]); return; }
      setGroups(res.groups);
      const chosen = new Set(data?.listing?.attributes ?? []);
      if (chosen.size > 0) {
        const sel: Record<number, number> = {};
        for (const g of res.groups) {
          if (isColorGroup(g) || isSizeGroup(g)) continue;
          const hit = g.attributes.find((a) => chosen.has(a.id));
          if (hit) sel[g.id] = hit.id;
        }
        setAttrSel(sel);
      }
    })();
    return () => { alive = false; };
  }, [businessId, categoryId, data]);

  const colorGroup = useMemo(() => groups.find(isColorGroup), [groups]);
  const sizeGroup = useMemo(() => groups.find(isSizeGroup), [groups]);
  const otherGroups = useMemo(() => groups.filter((g) => !isColorGroup(g) && !isSizeGroup(g)), [groups]);

  const setVariant = (key: string, patch: Partial<AboutYouEditorVariant>) =>
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const buildInput = () => ({
    brand_id: brandId,
    category_id: categoryId,
    color_id: colorId,
    attributes: Object.values(attrSel).filter((x): x is number => !!x),
    material: null,
    country_of_origin: countryOfOrigin.trim().toUpperCase() || "RO",
    hs_code: hsCode.trim() || null,
    variants: variants.map((v) => ({
      sku: v.sku, ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
      color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
      sale_price_eur: v.sale_price_eur, enabled: v.enabled,
    })),
  });

  const save = (then?: "sync" | "publish") => {
    if (!categoryId) { toast.error("Mapează categoria produsului mai întâi."); return; }
    if (!brandId) { toast.error("Alege brandul."); return; }
    startTransition(async () => {
      const res = await saveAboutYouListing(businessId, productId, buildInput());
      if ("error" in res) { toast.error(res.error); return; }
      if (then === "sync") {
        const s = await syncAboutYouProduct(businessId, productId);
        if ("error" in s) { toast.error(s.error); return; }
        toast.success("Trimis pe About You.");
      } else if (then === "publish") {
        const p = await publishAboutYouProduct(businessId, productId);
        if ("error" in p) { toast.error(p.error); return; }
        toast.success("Publicat pe About You.");
      } else {
        toast.success("Listare salvată.");
      }
      router.refresh();
      if (then) onClose();
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă...
      </div>
    );
  }
  if (!data) return null;

  const manual = pricing.mode === "manual_eur";

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-4">
      {!categoryId && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Categoria acestui produs nu este mapată. Mapeaz-o în secțiunea de mapare categorii, apoi revino.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Brand</label>
          <select
            value={brandId ?? ""} onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Alege brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {colorGroup && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{colorGroup.frontend_name}</label>
            <select
              value={colorId ?? ""} onChange={(e) => setColorId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Alege culoarea</option>
              {colorGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
            </select>
          </div>
        )}
        {otherGroups.map((g) => (
          <div key={g.id}>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{g.frontend_name}</label>
            <select
              value={attrSel[g.id] ?? ""}
              onChange={(e) => setAttrSel((prev) => ({ ...prev, [g.id]: e.target.value ? Number(e.target.value) : 0 }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">-</option>
              {g.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Cod HS (opțional)</label>
          <input value={hsCode} onChange={(e) => setHsCode(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Țară de origine</label>
          <input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} maxLength={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase" />
        </div>
      </div>

      {/* Variants */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Variante ({variants.length})</p>
        <div className="space-y-2">
          {variants.map((v) => (
            <div key={v.key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{v.label}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={v.enabled} onChange={(e) => setVariant(v.key, { enabled: e.target.checked })} />
                  Activă
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">EAN</label>
                  <input value={v.ean ?? ""} onChange={(e) => setVariant(v.key, { ean: e.target.value || null })}
                    placeholder="cod EAN-13" className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                {sizeGroup && (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{sizeGroup.frontend_name}</label>
                    <select value={v.size_id ?? ""} onChange={(e) => setVariant(v.key, { size_id: e.target.value ? Number(e.target.value) : null })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
                      <option value="">-</option>
                      {sizeGroup.attributes.map((a) => <option key={a.id} value={a.id}>{a.frontend_name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Stoc</label>
                  <input type="number" min="0" value={v.quantity ?? ""} onChange={(e) => setVariant(v.key, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                </div>
                {manual ? (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Preț EUR</label>
                    <input type="number" step="0.01" min="0" value={v.retail_price_eur ?? ""}
                      onChange={(e) => setVariant(v.key, { retail_price_eur: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Preț (auto)</label>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{eurPreview(v.ron_price, pricing)}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => save()} disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">
          Salvează
        </button>
        <button onClick={() => save("sync")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> Salvează și trimite
        </button>
        <button onClick={() => save("publish")} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary text-primary px-3 py-2 text-sm font-semibold hover:bg-primary/10 disabled:opacity-60">
          <Upload className="h-3.5 w-3.5" /> Publică
        </button>
        <button onClick={onClose} disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60">
          Închide
        </button>
      </div>
    </div>
  );
}
