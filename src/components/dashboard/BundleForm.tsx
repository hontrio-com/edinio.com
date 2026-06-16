"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {
  Upload, Loader2, X, Plus, Minus, Search, Package, Trash2, Save, ChevronLeft, Sparkles,
} from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { createBundle, updateBundle, type BundleFormData } from "@/lib/actions/bundle.actions";
import { computeBundlePricing, bundleAvailability, type BundlePricingMode } from "@/lib/bundles";

export interface EligibleProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
}

interface ExistingBundle {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  images: string[];
  category: string | null;
  is_active: boolean;
  is_featured: boolean;
  items: { product_id: string; quantity: number }[];
  pricing_mode: BundlePricingMode;
  discount_percent?: number;
  discount_amount?: number;
}

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function BundleForm({ businessId, eligibleProducts, categories, bundle }: {
  businessId: string;
  eligibleProducts: EligibleProduct[];
  categories: { id: string; name: string }[];
  bundle?: ExistingBundle;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();

  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [images, setImages] = useState<string[]>(bundle?.images ?? []);
  const [category, setCategory] = useState(bundle?.category ?? "");
  const [isActive, setIsActive] = useState(bundle?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(bundle?.is_featured ?? false);

  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>(
    () => (bundle?.items ?? []).filter((i) => eligibleProducts.some((p) => p.id === i.product_id)),
  );
  const [pricingMode, setPricingMode] = useState<BundlePricingMode>(bundle?.pricing_mode ?? "discount_percent");
  const [fixedPrice, setFixedPrice] = useState(bundle?.pricing_mode === "fixed" ? "" : "");
  const [discountPercent, setDiscountPercent] = useState(bundle?.discount_percent != null ? String(bundle.discount_percent) : "10");
  const [discountAmount, setDiscountAmount] = useState(bundle?.discount_amount != null ? String(bundle.discount_amount) : "");

  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(eligibleProducts.map((p) => [p.id, p])), [eligibleProducts]);

  const components = useMemo(
    () => items
      .map((it) => {
        const p = byId.get(it.product_id);
        return p ? { ...p, quantity: it.quantity, product_id: p.id } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
    [items, byId],
  );

  const pricing = useMemo(
    () => computeBundlePricing(components, pricingMode, {
      fixedPrice: parseFloat(fixedPrice) || 0,
      discountPercent: parseFloat(discountPercent) || 0,
      discountAmount: parseFloat(discountAmount) || 0,
    }),
    [components, pricingMode, fixedPrice, discountPercent, discountAmount],
  );

  const availability = useMemo(() => bundleAvailability(components), [components]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligibleProducts
      .filter((p) => !items.some((i) => i.product_id === p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [eligibleProducts, items, search]);

  function addItem(id: string) {
    setItems((prev) => prev.some((i) => i.product_id === id) ? prev : [...prev, { product_id: id, quantity: 1 }]);
    setSearch("");
  }
  function setQty(id: string, qty: number) {
    if (qty <= 0) { setItems((prev) => prev.filter((i) => i.product_id !== id)); return; }
    setItems((prev) => prev.map((i) => i.product_id === id ? { ...i, quantity: qty } : i));
  }

  async function handleFiles(files: FileList) {
    // Capture synchronously — the input value is cleared right after this call,
    // which would otherwise empty the live FileList before we read it.
    const selected = Array.from(files);
    if (!selected.length) return;
    setUploading(true);
    const { uploadImage } = await import("@/lib/upload");
    const urls: string[] = [];
    let failed = 0;
    for (const file of selected) {
      const result = await uploadImage(file, "products");
      if ("url" in result) urls.push(result.url);
      else failed++;
    }
    if (urls.length) setImages((prev) => [...prev, ...urls]);
    if (failed) toast.error(`${failed} ${failed === 1 ? "imagine nu a putut fi încărcată" : "imagini nu au putut fi încărcate"}.`);
    setUploading(false);
  }

  function save() {
    if (!name.trim()) { toast.error("Pachetul are nevoie de un nume."); return; }
    if (items.length < 2) { toast.error("Adauga cel putin 2 produse in pachet."); return; }
    if (pricingMode === "fixed" && !(parseFloat(fixedPrice) > 0)) { toast.error("Seteaza un pret fix valid."); return; }

    const payload: BundleFormData = {
      name,
      slug: slugify(name) || null,
      description,
      images,
      category: category || undefined,
      is_active: isActive,
      is_featured: isFeatured,
      items,
      pricing_mode: pricingMode,
      fixed_price: pricingMode === "fixed" ? parseFloat(fixedPrice) || 0 : undefined,
      discount_percent: pricingMode === "discount_percent" ? parseFloat(discountPercent) || 0 : undefined,
      discount_amount: pricingMode === "discount_amount" ? parseFloat(discountAmount) || 0 : undefined,
    };

    startSave(async () => {
      const res = bundle
        ? await updateBundle(bundle.id, businessId, payload)
        : await createBundle(businessId, payload);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(bundle ? "Pachet actualizat." : "Pachet creat.");
      router.push("/dashboard/products/bundles");
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/products/bundles")}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">{bundle ? "Editează pachetul" : "Pachet nou"}</h1>
      </div>

      {/* Basic info */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nume pachet</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Pachet Îngrijire Completă" className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Imagini</label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {images.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-border group bg-muted/30">
                <Image src={url} alt={`Imagine ${i + 1}`} fill sizes="120px" className="object-contain p-1" />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-3 w-3" />
                </button>
                {i === 0 && <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-semibold rounded">Principal</div>}
              </div>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50">
              {uploading ? <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" /> : <><Upload className="h-5 w-5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground font-medium">Adaugă</span></>}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Descriere</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="Descrie pachetul..." className={`${inputCls} resize-none`} />
        </div>

        {categories.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Categorie (opțional)</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} bg-background`}>
              <option value="">Fără categorie</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Components */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Produse în pachet</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Adaugă cel puțin 2 produse. Stocul pachetului e derivat din ele.</p>
        </div>

        {/* Picker */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută un produs..." className={`${inputCls} pl-9`} />
          {search.trim() && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Niciun produs găsit.</p>
              ) : searchResults.map((p) => (
                <button key={p.id} type="button" onClick={() => addItem(p.id)}
                  className="flex items-center gap-3 w-full px-3 py-2 hover:bg-muted transition-colors text-left">
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                    {p.image_url ? <Image src={p.image_url} alt={p.name} fill sizes="36px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                  </div>
                  <span className="text-sm text-foreground flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{formatPrice(p.price)}</span>
                  <Plus className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected */}
        {components.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">Niciun produs adăugat încă.</p>
        ) : (
          <div className="space-y-2">
            {components.map((c) => (
              <div key={c.product_id} className="flex items-center gap-3 p-2 rounded-xl border border-border">
                <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                  {c.image_url ? <Image src={c.image_url} alt={c.name} fill sizes="44px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{formatPrice(c.price)} / buc{c.track_inventory ? ` · stoc ${c.stock_quantity ?? 0}` : ""}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => setQty(c.product_id, c.quantity - 1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                  <span className="text-sm font-semibold w-6 text-center tabular-nums">{c.quantity}</span>
                  <button type="button" onClick={() => setQty(c.product_id, c.quantity + 1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3" /></button>
                  <button type="button" onClick={() => setQty(c.product_id, 0)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive ml-1"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-1">
              <span className="text-muted-foreground">Valoare produse</span>
              <span className="font-semibold text-foreground">{formatPrice(pricing.compareAt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Preț pachet</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {([
            { mode: "discount_percent", label: "Reducere %" },
            { mode: "discount_amount", label: "Reducere sumă" },
            { mode: "fixed", label: "Preț fix" },
          ] as const).map((o) => (
            <button key={o.mode} type="button" onClick={() => setPricingMode(o.mode)}
              className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${pricingMode === o.mode ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {pricingMode === "fixed" && (
            <><input type="number" min="0" step="0.01" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} placeholder="ex: 149" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">lei</span></>
          )}
          {pricingMode === "discount_percent" && (
            <><input type="number" min="0" max="100" step="1" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="ex: 10" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">% reducere</span></>
          )}
          {pricingMode === "discount_amount" && (
            <><input type="number" min="0" step="1" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="ex: 50" className={`${inputCls} w-40`} /><span className="text-sm text-muted-foreground">lei reducere</span></>
          )}
        </div>

        {/* Live preview */}
        <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Preț pachet: <span className="text-lg font-bold text-primary">{formatPrice(pricing.price)}</span>
            {pricing.compareAt > pricing.price && <span className="text-xs text-muted-foreground line-through">{formatPrice(pricing.compareAt)}</span>}
          </div>
          {pricing.savings > 0 && (
            <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-950/40 px-2 py-1 rounded-full">
              Economie {formatPrice(pricing.savings)}
            </span>
          )}
        </div>

        {components.length >= 2 && !availability.inStock && (
          <p className="text-xs text-amber-600">Atenție: pachetul e momentan indisponibil (un produs e epuizat).</p>
        )}
      </div>

      {/* Toggles + save */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-foreground">Activ (vizibil în magazin)</span>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-foreground">Recomandat</span>
          <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => router.push("/dashboard/products/bundles")} className="px-5 py-2.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors">Anulează</button>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg transition-all hover:opacity-90 disabled:opacity-60">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Se salvează...</> : <><Save className="h-4 w-4" /> {bundle ? "Salvează" : "Creează pachetul"}</>}
        </button>
      </div>
    </div>
  );
}
