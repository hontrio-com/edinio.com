"use client";

import { useState, useTransition, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, X, Pencil, Loader2, Upload, Star, ArrowLeft, Trash2,
  Globe, BarChart2, Check, Ruler, ChevronDown, ImageIcon,
} from "lucide-react";
import { createProduct, updateProduct, deleteProduct } from "@/lib/actions/product.actions";
import { createCategory } from "@/lib/actions/category.actions";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Database } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
}

interface SpecRow { label: string; value: string; }

interface QuantityTiers {
  enabled: boolean;
  mode: "fixed" | "percent";
  tier2_price: string;
  tier2_percent: string;
  tier2_badge: string;
  tier3_price: string;
  tier3_percent: string;
  tier3_badge: string;
}

interface VariantOption {
  id: string;
  name: string;
  values: string[];
  inputValue: string;
}

interface VariantCombination {
  id: string;
  title: string;
  price: string;
  compare_at_price: string;
  sku: string;
  stock_quantity: string;
  image: string;
  enabled: boolean;
}

interface VariantsState {
  enabled: boolean;
  options: VariantOption[];
  combinations: VariantCombination[];
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  price: string;
  compare_at_price: string;
  category: string;
  sku: string;
  images: string[];
  track_inventory: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  stock_status: "in_stock" | "out_of_stock" | "preorder";
  is_featured: boolean;
  is_active: boolean;
  specifications: SpecRow[];
  quantity_tiers: QuantityTiers;
  weight_grams: string;
  dimensions: { length: string; width: string; height: string };
  seo_title: string;
  seo_description: string;
  variants: VariantsState;
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateCombinations(options: VariantOption[], existing: VariantCombination[]): VariantCombination[] {
  const filled = options.filter(o => o.values.length > 0);
  if (!filled.length) return [];
  const cartesian = (arrays: string[][]): string[][] =>
    arrays.reduce(
      (acc, cur) => acc.flatMap(x => cur.map(y => [...x, y])),
      [[]] as string[][]
    );
  return cartesian(filled.map(o => o.values)).map(combo => {
    const title = combo.join(" / ");
    return existing.find(e => e.title === title) ?? {
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      price: "",
      compare_at_price: "",
      sku: "",
      stock_quantity: "",
      image: "",
      enabled: true,
    };
  });
}

function computeSeoScore(form: FormState): number {
  let score = 0;
  if (form.seo_title.trim()) {
    score += 25;
    const l = form.seo_title.trim().length;
    if (l >= 50 && l <= 60) score += 10;
  }
  if (form.seo_description.trim()) {
    score += 25;
    const l = form.seo_description.trim().length;
    if (l >= 140 && l <= 160) score += 10;
  }
  if (form.images.length > 0) score += 15;
  if (form.category.trim()) score += 10;
  if (form.sku.trim()) score += 5;
  return Math.min(score, 100);
}

const EMPTY_TIERS: QuantityTiers = {
  enabled: false,
  mode: "fixed",
  tier2_price: "",
  tier2_percent: "",
  tier2_badge: "Cel mai bun pret",
  tier3_price: "",
  tier3_percent: "",
  tier3_badge: "Oferta speciala",
};

const EMPTY_FORM: FormState = {
  name: "", slug: "", description: "", price: "", compare_at_price: "",
  category: "", sku: "", images: [],
  track_inventory: false, stock_quantity: "", low_stock_threshold: "",
  stock_status: "in_stock",
  is_featured: false, is_active: true,
  specifications: [],
  quantity_tiers: { ...EMPTY_TIERS },
  weight_grams: "",
  dimensions: { length: "", width: "", height: "" },
  seo_title: "", seo_description: "",
  variants: { enabled: false, options: [], combinations: [] },
};

type PageSections = {
  specifications?: SpecRow[];
  quantity_tiers?: { enabled: boolean; mode?: string; tier2_price: number; tier2_percent?: number; tier2_badge: string; tier3_price: number; tier3_percent?: number; tier3_badge: string };
  stock_status?: string;
  low_stock_threshold?: number;
  dimensions?: { length: number; width: number; height: number };
  seo?: { title: string; description: string };
  variants?: { enabled: boolean; options: Omit<VariantOption, "inputValue">[]; combinations: VariantCombination[] };
};

function productToForm(p: Product): FormState {
  const ps = (p.page_sections ?? {}) as PageSections;
  const qt = ps.quantity_tiers;
  const dims = ps.dimensions;
  const vars = ps.variants;
  return {
    name: p.name,
    slug: p.slug ?? "",
    description: p.description ?? "",
    price: String(p.price),
    compare_at_price: p.compare_at_price ? String(p.compare_at_price) : "",
    category: p.category ?? "",
    sku: p.sku ?? "",
    images: Array.isArray(p.images) ? p.images.map(String) : [],
    track_inventory: p.track_inventory,
    stock_quantity: p.stock_quantity !== null ? String(p.stock_quantity) : "",
    low_stock_threshold: ps.low_stock_threshold !== undefined ? String(ps.low_stock_threshold) : "",
    stock_status: (ps.stock_status as FormState["stock_status"]) ?? "in_stock",
    is_featured: p.is_featured,
    is_active: p.is_active,
    specifications: ps.specifications ?? [],
    quantity_tiers: qt
      ? {
          enabled: qt.enabled,
          mode: (qt.mode as "fixed" | "percent") ?? "fixed",
          tier2_price: qt.tier2_price ? String(qt.tier2_price) : "",
          tier2_percent: qt.tier2_percent ? String(qt.tier2_percent) : "",
          tier2_badge: qt.tier2_badge,
          tier3_price: qt.tier3_price ? String(qt.tier3_price) : "",
          tier3_percent: qt.tier3_percent ? String(qt.tier3_percent) : "",
          tier3_badge: qt.tier3_badge,
        }
      : { ...EMPTY_TIERS },
    weight_grams: p.weight_grams !== null ? String(p.weight_grams) : "",
    dimensions: {
      length: dims?.length !== undefined ? String(dims.length) : "",
      width: dims?.width !== undefined ? String(dims.width) : "",
      height: dims?.height !== undefined ? String(dims.height) : "",
    },
    seo_title: ps.seo?.title ?? "",
    seo_description: ps.seo?.description ?? "",
    variants: vars
      ? {
          enabled: vars.enabled,
          options: vars.options.map(o => ({ ...o, inputValue: "" })),
          combinations: vars.combinations,
        }
      : { enabled: false, options: [], combinations: [] },
  };
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )} />
      </button>
    </label>
  );
}

function ImageUploader({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("products").upload(path, file, { upsert: true });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from("products").getPublicUrl(path);
        urls.push(publicUrl);
      }
    }
    onChange([...images, ...urls]);
    setUploading(false);
  }

  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-2">
        {images.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-border group bg-muted/30">
            <img src={url} alt={`Imagine ${i + 1}`} className="w-full h-full object-contain p-1" />
            <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="h-3 w-3" />
            </button>
            {i === 0 && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-semibold rounded">
                Principal
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50">
          {uploading
            ? <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            : (
              <>
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium">Adauga</span>
              </>
            )}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      <p className="text-xs text-muted-foreground">Prima imagine va fi afisata pe card. Accepta JPG, PNG, WebP.</p>
    </div>
  );
}

function VariantImagePicker({ images, selected, onSelect }: { images: string[]; selected: string; onSelect: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!images.length) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-lg border border-border overflow-hidden flex-shrink-0 hover:border-primary transition-colors bg-muted/30">
        {selected
          ? <img src={selected} alt="" className="w-full h-full object-contain p-0.5" />
          : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
        }
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-14 z-20 bg-surface border border-border rounded-xl shadow-lg p-2 grid grid-cols-4 gap-1.5 w-52">
            {selected && (
              <button type="button" onClick={() => { onSelect(""); setOpen(false); }}
                className="col-span-4 text-[11px] text-muted-foreground hover:text-destructive text-left px-1 mb-1">
                Sterge imaginea variantei
              </button>
            )}
            {images.map((url, i) => (
              <button key={i} type="button" onClick={() => { onSelect(url); setOpen(false); }}
                className={cn("aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-muted/30",
                  selected === url ? "border-primary" : "border-transparent hover:border-border")}>
                <img src={url} alt="" className="w-full h-full object-contain p-0.5" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";
const smallInputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";
const sectionCls = "bg-surface border border-border rounded-xl overflow-hidden";

interface Props {
  businessId: string;
  product?: Product;
  categories: CategoryOption[];
}

export function ProductForm({ businessId, product, categories }: Props) {
  const router = useRouter();
  const isEditing = !!product;
  const [form, setForm] = useState<FormState>(product ? productToForm(product) : EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEditing && !!product.slug);

  // Inline category creation
  const [localCategories, setLocalCategories] = useState(categories);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatParentId, setNewCatParentId] = useState<string | null>(null);
  const [isCreatingCat, startCatTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleNameChange(name: string) {
    setForm(prev => ({
      ...prev,
      name,
      slug: slugManuallyEdited ? prev.slug : toSlug(name),
    }));
  }

  // Variants helpers
  function addOption() {
    if (form.variants.options.length >= 3) return;
    const newOpt: VariantOption = { id: crypto.randomUUID(), name: "", values: [], inputValue: "" };
    const newOptions = [...form.variants.options, newOpt];
    set("variants", { ...form.variants, options: newOptions, combinations: generateCombinations(newOptions, form.variants.combinations) });
  }

  function removeOption(idx: number) {
    const newOptions = form.variants.options.filter((_, i) => i !== idx);
    set("variants", { ...form.variants, options: newOptions, combinations: generateCombinations(newOptions, form.variants.combinations) });
  }

  function updateOptionField(idx: number, field: "name" | "inputValue", val: string) {
    set("variants", {
      ...form.variants,
      options: form.variants.options.map((o, i) => i === idx ? { ...o, [field]: val } : o),
    });
  }

  function addOptionValue(idx: number) {
    const opt = form.variants.options[idx];
    const val = opt.inputValue.trim();
    if (!val || opt.values.includes(val)) return;
    const newOptions = form.variants.options.map((o, i) =>
      i === idx ? { ...o, values: [...o.values, val], inputValue: "" } : o
    );
    set("variants", { ...form.variants, options: newOptions, combinations: generateCombinations(newOptions, form.variants.combinations) });
  }

  function removeOptionValue(idx: number, vi: number) {
    const newOptions = form.variants.options.map((o, i) =>
      i === idx ? { ...o, values: o.values.filter((_, j) => j !== vi) } : o
    );
    set("variants", { ...form.variants, options: newOptions, combinations: generateCombinations(newOptions, form.variants.combinations) });
  }

  function updateCombo(idx: number, field: keyof VariantCombination, val: string | boolean) {
    set("variants", {
      ...form.variants,
      combinations: form.variants.combinations.map((c, i) => i === idx ? { ...c, [field]: val } : c),
    });
  }

  function toggleCombo(idx: number) {
    set("variants", {
      ...form.variants,
      combinations: form.variants.combinations.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c),
    });
  }

  function handleCreateCategory() {
    if (!newCatName.trim()) return;
    startCatTransition(async () => {
      const result = await createCategory({ name: newCatName.trim(), parent_id: newCatParentId });
      if ("error" in result) { toast.error(result.error); return; }
      const newCat: CategoryOption = { id: result.id, name: newCatName.trim(), parent_id: newCatParentId };
      setLocalCategories(prev => [...prev, newCat]);
      set("category", newCatName.trim());
      setNewCatName("");
      setNewCatParentId(null);
      setShowAddCategory(false);
      toast.success("Categorie creata!");
    });
  }

  const seoScore = computeSeoScore(form);
  const seoColor = seoScore >= 81 ? "text-green-600" : seoScore >= 61 ? "text-blue-600" : seoScore >= 31 ? "text-amber-600" : "text-red-600";
  const seoBg = seoScore >= 81 ? "bg-green-50 border-green-200" : seoScore >= 61 ? "bg-blue-50 border-blue-200" : seoScore >= 31 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const seoLabel = seoScore >= 81 ? "Excelent" : seoScore >= 61 ? "Bun" : seoScore >= 31 ? "Mediu" : "Slab";
  const seoBarColor = seoScore >= 81 ? "bg-green-500" : seoScore >= 61 ? "bg-blue-500" : seoScore >= 31 ? "bg-amber-500" : "bg-red-500";

  const serp = {
    url: `edinio.com/magazin/${form.slug || "produs"}`,
    title: (form.seo_title.trim() || form.name || "Titlu produs").slice(0, 60),
    desc: (form.seo_description.trim() || form.description.replace(/<[^>]+>/g, "").slice(0, 160) || "Fara descriere.").slice(0, 160),
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.price.replace(",", "."));
    if (!form.name.trim()) { toast.error("Numele produsului este obligatoriu."); return; }
    if (isNaN(price) || price <= 0) { toast.error("Pretul trebuie sa fie un numar pozitiv."); return; }

    const slug = form.slug.trim() || toSlug(form.name);

    const payload = {
      name: form.name.trim(),
      slug,
      description: form.description,
      price,
      compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price.replace(",", ".")) : null,
      category: form.category,
      sku: form.sku,
      images: form.images,
      track_inventory: form.track_inventory,
      stock_quantity: form.track_inventory ? (parseInt(form.stock_quantity) || 0) : null,
      is_featured: form.is_featured,
      is_active: form.is_active,
      weight_grams: form.weight_grams ? parseInt(form.weight_grams) : null,
      page_sections: {
        specifications: form.specifications.filter(s => s.label.trim() && s.value.trim()),
        quantity_tiers: {
          enabled: form.quantity_tiers.enabled,
          mode: form.quantity_tiers.mode,
          tier2_price: parseFloat(form.quantity_tiers.tier2_price) || 0,
          tier2_percent: parseFloat(form.quantity_tiers.tier2_percent) || 0,
          tier2_badge: form.quantity_tiers.tier2_badge,
          tier3_price: parseFloat(form.quantity_tiers.tier3_price) || 0,
          tier3_percent: parseFloat(form.quantity_tiers.tier3_percent) || 0,
          tier3_badge: form.quantity_tiers.tier3_badge,
        },
        stock_status: form.stock_status,
        low_stock_threshold: form.track_inventory && form.low_stock_threshold ? parseInt(form.low_stock_threshold) : null,
        dimensions: {
          length: parseFloat(form.dimensions.length) || 0,
          width: parseFloat(form.dimensions.width) || 0,
          height: parseFloat(form.dimensions.height) || 0,
        },
        seo: { title: form.seo_title, description: form.seo_description },
        variants: {
          enabled: form.variants.enabled,
          options: form.variants.options.map(({ inputValue: _iv, ...o }) => o),
          combinations: form.variants.combinations,
        },
      },
    };

    startTransition(async () => {
      const result = isEditing
        ? await updateProduct(product.id, businessId, payload)
        : await createProduct(businessId, payload);
      if (result.error) { toast.error(result.error); return; }
      toast.success(isEditing ? "Produs actualizat!" : "Produs adaugat!");
      router.push("/dashboard/products");
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteProduct(product!.id, businessId);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Produs sters!");
      router.push("/dashboard/products");
    });
  }

  const previewPrice = form.price ? formatPrice(parseFloat(form.price.replace(",", ".")) || 0) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button type="button" onClick={() => router.push("/dashboard/products")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Produse
        </button>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-lg font-semibold text-foreground">
          {isEditing ? (
            <span className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              {product.name}
            </span>
          ) : "Produs nou"}
        </h1>
      </div>

      <form id="product-form" onSubmit={handleSubmit}>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ── Main column ── */}
          <div className="w-full lg:flex-1 lg:min-w-0 space-y-5">

            {/* Images */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Imagini produs</p>
              </div>
              <div className="px-5 py-5">
                <ImageUploader images={form.images} onChange={(imgs) => set("images", imgs)} />
              </div>
            </div>

            {/* Basic info */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Informatii generale</p>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Nume produs <span className="text-destructive">*</span>
                  </label>
                  <input type="text" value={form.name} onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="ex: Geanta din piele naturala" className={inputCls} required />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    Slug URL
                  </label>
                  <div className="flex items-center gap-0 border border-border rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-colors bg-surface">
                    <span className="px-3 text-sm text-muted-foreground bg-muted/50 border-r border-border py-2.5 whitespace-nowrap hidden sm:inline">
                      edinio.com/magazin/
                    </span>
                    <input type="text" value={form.slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/--+/g, "-"));
                      }}
                      placeholder="slug-produs"
                      className="flex-1 px-3 py-2.5 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Generat automat din nume. Poti modifica manual.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Descriere</label>
                  <RichTextEditor content={form.description} onChange={(html) => set("description", html)}
                    placeholder="Descrie produsul tau..." />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Pret</p>
              </div>
              <div className="px-5 py-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Pret (lei) <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)}
                        placeholder="0.00" min="0" step="0.01" className={inputCls + " pr-10"} required />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">lei</span>
                    </div>
                    {previewPrice && <p className="text-xs text-muted-foreground mt-1">Afisat: {previewPrice}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Pret initial (optional)</label>
                    <div className="relative">
                      <input type="number" value={form.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)}
                        placeholder="0.00" min="0" step="0.01" className={inputCls + " pr-10"} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">lei</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Afisat taiat pentru discount</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Organization */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Organizare</p>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Categorie</label>
                    <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                      <option value="">Fara categorie</option>
                      {localCategories.filter(c => !c.parent_id).map(parent => {
                        const children = localCategories.filter(c => c.parent_id === parent.id);
                        return children.length > 0 ? (
                          <optgroup key={parent.id} label={parent.name}>
                            <option value={parent.name}>{parent.name}</option>
                            {children.map(child => (
                              <option key={child.id} value={child.name}>{child.name}</option>
                            ))}
                          </optgroup>
                        ) : (
                          <option key={parent.id} value={parent.name}>{parent.name}</option>
                        );
                      })}
                    </select>
                    {!showAddCategory ? (
                      <button type="button" onClick={() => setShowAddCategory(true)}
                        className="mt-1.5 text-xs text-primary hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Categorie noua
                      </button>
                    ) : (
                      <div className="mt-2 p-3 border border-border rounded-xl bg-muted/30 space-y-2">
                        <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                          placeholder="Nume categorie" autoFocus className={smallInputCls}
                          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleCreateCategory())} />
                        <select value={newCatParentId ?? ""} onChange={e => setNewCatParentId(e.target.value || null)}
                          className={smallInputCls}>
                          <option value="">Categorie principala</option>
                          {localCategories.filter(c => !c.parent_id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateCategory} disabled={isCreatingCat || !newCatName.trim()}
                            className="flex-1 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center">
                            {isCreatingCat ? <Loader2 className="h-3 w-3 animate-spin" /> : "Creeaza"}
                          </button>
                          <button type="button" onClick={() => { setShowAddCategory(false); setNewCatName(""); setNewCatParentId(null); }}
                            className="flex-1 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
                            Anuleaza
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">SKU</label>
                    <input type="text" value={form.sku} onChange={(e) => set("sku", e.target.value)}
                      placeholder="ex: GNT-001" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Stare stoc</label>
                  <div className="relative">
                    <select value={form.stock_status}
                      onChange={(e) => set("stock_status", e.target.value as FormState["stock_status"])}
                      className={inputCls + " appearance-none pr-10"}>
                      <option value="in_stock">In stoc</option>
                      <option value="out_of_stock">In afara stocului</option>
                      <option value="preorder">Precomanda</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Variants */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Produse variabile</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Culori, marimi, materiale etc.</p>
                </div>
                <button type="button"
                  onClick={() => set("variants", { ...form.variants, enabled: !form.variants.enabled })}
                  className={cn("relative w-10 h-6 rounded-full transition-colors focus:outline-none flex-shrink-0",
                    form.variants.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                  <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                    form.variants.enabled ? "translate-x-4" : "translate-x-0")} />
                </button>
              </div>
              {form.variants.enabled && (
                <div className="px-5 py-4 space-y-4">
                  {form.variants.options.map((option, idx) => (
                    <div key={option.id} className="border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <input type="text" value={option.name}
                          onChange={e => updateOptionField(idx, "name", e.target.value)}
                          placeholder="Optiune (ex: Culoare, Marime)"
                          className={smallInputCls + " flex-1"} />
                        <button type="button" onClick={() => removeOption(idx)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {option.values.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {option.values.map((val, vi) => (
                            <span key={vi} className="flex items-center gap-1 px-2 py-1 bg-muted rounded-lg text-xs font-medium text-foreground">
                              {val}
                              <button type="button" onClick={() => removeOptionValue(idx, vi)}
                                className="text-muted-foreground hover:text-foreground transition-colors ml-0.5">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input type="text" value={option.inputValue}
                          onChange={e => updateOptionField(idx, "inputValue", e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOptionValue(idx); } }}
                          placeholder="Adauga valoare (Enter sau click)"
                          className={smallInputCls + " flex-1"} />
                        <button type="button" onClick={() => addOptionValue(idx)}
                          className="px-3 py-2 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors whitespace-nowrap">
                          Adauga
                        </button>
                      </div>
                    </div>
                  ))}

                  {form.variants.options.length < 3 && (
                    <button type="button" onClick={addOption}
                      className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                      <Plus className="h-4 w-4" /> Adauga optiune
                    </button>
                  )}

                  {form.variants.combinations.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Variante ({form.variants.combinations.length})
                      </p>
                      <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                        {form.variants.combinations.map((combo, idx) => (
                          <div key={combo.id} className={cn(
                            "p-4 transition-colors",
                            combo.enabled ? "bg-surface" : "bg-muted/20 opacity-70"
                          )}>
                            {/* Row header */}
                            <div className="flex items-center gap-3 mb-3">
                              <button type="button" onClick={() => toggleCombo(idx)}
                                className={cn(
                                  "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                                  combo.enabled ? "bg-primary border-primary" : "border-muted-foreground/30"
                                )}>
                                {combo.enabled && <Check className="h-2.5 w-2.5 text-white" />}
                              </button>
                              <span className="text-sm font-medium text-foreground">{combo.title}</span>
                            </div>
                            {/* Fields grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-7">
                              {/* Image */}
                              <div className="col-span-2 sm:col-span-1 flex items-end gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Imagine varianta</label>
                                  <VariantImagePicker
                                    images={form.images}
                                    selected={combo.image}
                                    onSelect={(url) => updateCombo(idx, "image", url)}
                                  />
                                </div>
                                {combo.image && (
                                  <p className="text-[11px] text-muted-foreground pb-1">Personalizata</p>
                                )}
                              </div>
                              {/* Price */}
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pret (lei)</label>
                                <div className="relative">
                                  <input type="number" value={combo.price}
                                    onChange={e => updateCombo(idx, "price", e.target.value)}
                                    placeholder={form.price || "0.00"} min="0" step="0.01"
                                    className={smallInputCls + " pr-8"} />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">lei</span>
                                </div>
                              </div>
                              {/* Compare price */}
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pret initial (lei)</label>
                                <div className="relative">
                                  <input type="number" value={combo.compare_at_price}
                                    onChange={e => updateCombo(idx, "compare_at_price", e.target.value)}
                                    placeholder="0.00" min="0" step="0.01"
                                    className={smallInputCls + " pr-8"} />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">lei</span>
                                </div>
                              </div>
                              {/* Stock (only when tracking) */}
                              {form.track_inventory && (
                                <div>
                                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Stoc (buc)</label>
                                  <input type="number" value={combo.stock_quantity}
                                    onChange={e => updateCombo(idx, "stock_quantity", e.target.value)}
                                    placeholder="0" min="0"
                                    className={smallInputCls} />
                                </div>
                              )}
                              {/* SKU */}
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">SKU</label>
                                <input type="text" value={combo.sku}
                                  onChange={e => updateCombo(idx, "sku", e.target.value)}
                                  placeholder="ex: GNT-ROS-M"
                                  className={smallInputCls} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Pret gol = foloseste pretul de baza al produsului. Stocul se gestioneaza per varianta.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Specifications */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Specificatii produs</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Apar in tabelul de pe pagina produsului</p>
                </div>
                <button type="button" onClick={() => set("specifications", [...form.specifications, { label: "", value: "" }])}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Adauga rand
                </button>
              </div>
              <div className="px-5 py-4 space-y-2">
                {form.specifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                    Nicio specificatie adaugata
                  </p>
                ) : (
                  form.specifications.map((spec, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={spec.label}
                        onChange={(e) => { const next = [...form.specifications]; next[i] = { ...next[i], label: e.target.value }; set("specifications", next); }}
                        placeholder="Proprietate (ex: Material)"
                        className={smallInputCls + " flex-1"} />
                      <input type="text" value={spec.value}
                        onChange={(e) => { const next = [...form.specifications]; next[i] = { ...next[i], value: e.target.value }; set("specifications", next); }}
                        placeholder="Valoare (ex: Piele naturala)"
                        className={smallInputCls + " flex-1"} />
                      <button type="button" onClick={() => set("specifications", form.specifications.filter((_, j) => j !== i))}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Dimensions + Weight */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  Dimensiuni si greutate
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Util pentru calculul costurilor de livrare</p>
              </div>
              <div className="px-5 py-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["length", "width", "height"] as const).map((dim) => (
                    <div key={dim}>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        {dim === "length" ? "Lungime" : dim === "width" ? "Latime" : "Inaltime"} (cm)
                      </label>
                      <input type="number" value={form.dimensions[dim]}
                        onChange={(e) => set("dimensions", { ...form.dimensions, [dim]: e.target.value })}
                        placeholder="0" min="0" step="0.1" className={inputCls} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Greutate (g)</label>
                    <input type="number" value={form.weight_grams} onChange={(e) => set("weight_grams", e.target.value)}
                      placeholder="0" min="0" className={inputCls} />
                  </div>
                </div>
              </div>
            </div>

            {/* Quantity tiers */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Upsell cantitate</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ofera pret mai bun la 2 sau 3 bucati</p>
                </div>
                <button type="button"
                  onClick={() => set("quantity_tiers", { ...form.quantity_tiers, enabled: !form.quantity_tiers.enabled })}
                  className={cn("relative w-10 h-6 rounded-full transition-colors focus:outline-none flex-shrink-0",
                    form.quantity_tiers.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                  <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                    form.quantity_tiers.enabled ? "translate-x-4" : "translate-x-0")} />
                </button>
              </div>
              {form.quantity_tiers.enabled && (
                <div className="px-5 py-4 space-y-4">
                  {/* Mode selector */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Tip reducere</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["fixed", "percent"] as const).map(m => (
                        <button key={m} type="button"
                          onClick={() => set("quantity_tiers", { ...form.quantity_tiers, mode: m })}
                          className={cn(
                            "py-2 px-3 text-xs font-semibold rounded-lg border transition-colors",
                            form.quantity_tiers.mode === m
                              ? "bg-primary text-white border-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          )}>
                          {m === "fixed" ? "Suma fixa (lei)" : "Procent (%)"}
                        </button>
                      ))}
                    </div>
                    {form.quantity_tiers.mode === "percent" && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Reducerea se calculeaza din pretul produsului (sau al variantei selectate).
                      </p>
                    )}
                  </div>

                  <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">1 bucata</span> - pretul de baza al produsului (automat)
                    </p>
                  </div>

                  {([
                    { qty: "2", priceKey: "tier2_price" as const, percentKey: "tier2_percent" as const, badgeKey: "tier2_badge" as const },
                    { qty: "3", priceKey: "tier3_price" as const, percentKey: "tier3_percent" as const, badgeKey: "tier3_badge" as const },
                  ]).map(({ qty, priceKey, percentKey, badgeKey }) => (
                    <div key={qty}>
                      <p className="text-xs font-semibold text-foreground mb-1.5">{qty} bucati</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          {form.quantity_tiers.mode === "percent" ? (
                            <>
                              <label className="text-xs text-muted-foreground mb-1 block">Reducere</label>
                              <div className="relative">
                                <input type="number" min="0" max="80" step="1" placeholder="ex: 10"
                                  value={form.quantity_tiers[percentKey]}
                                  onChange={e => set("quantity_tiers", { ...form.quantity_tiers, [percentKey]: e.target.value })}
                                  className={smallInputCls + " pr-7"} />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">%</span>
                              </div>
                              {form.quantity_tiers[percentKey] && form.price && (
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  Ex: {Number(qty)} × {formatPrice(parseFloat(form.price) * (1 - parseFloat(form.quantity_tiers[percentKey]) / 100))} /buc
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <label className="text-xs text-muted-foreground mb-1 block">Pret total (lei)</label>
                              <input type="number" min="0" placeholder="ex: 179"
                                value={form.quantity_tiers[priceKey]}
                                onChange={e => set("quantity_tiers", { ...form.quantity_tiers, [priceKey]: e.target.value })}
                                className={smallInputCls} />
                            </>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Badge</label>
                          <input type="text" value={form.quantity_tiers[badgeKey]}
                            onChange={e => set("quantity_tiers", { ...form.quantity_tiers, [badgeKey]: e.target.value })}
                            className={smallInputCls} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEO */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-muted-foreground" />
                    SEO
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Optimizare pentru motoarele de cautare</p>
                </div>
                <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold flex-shrink-0", seoBg, seoColor)}>
                  {seoScore}/100 {seoLabel}
                </div>
              </div>
              <div className="px-5 py-5 space-y-4">
                {/* Progress bar */}
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-500", seoBarColor)}
                    style={{ width: `${seoScore}%` }} />
                </div>

                {/* SERP preview */}
                <div className="border border-border rounded-xl p-4 bg-white dark:bg-surface">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Preview Google</p>
                  <div className="text-xs text-green-700 mb-0.5 truncate">{serp.url}</div>
                  <div className="text-[15px] font-normal text-blue-700 hover:underline cursor-pointer truncate leading-snug">{serp.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{serp.desc}</div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Titlu SEO</label>
                    <span className={cn("text-xs font-medium tabular-nums",
                      form.seo_title.length > 60 ? "text-destructive" : form.seo_title.length >= 50 ? "text-green-600" : "text-muted-foreground")}>
                      {form.seo_title.length}/60
                    </span>
                  </div>
                  <input type="text" value={form.seo_title} onChange={e => set("seo_title", e.target.value)}
                    placeholder={form.name || "Titlu pentru Google"} maxLength={70} className={inputCls} />
                  <p className="text-xs text-muted-foreground mt-1">Ideal: 50-60 caractere</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Descriere SEO</label>
                    <span className={cn("text-xs font-medium tabular-nums",
                      form.seo_description.length > 160 ? "text-destructive" : form.seo_description.length >= 140 ? "text-green-600" : "text-muted-foreground")}>
                      {form.seo_description.length}/160
                    </span>
                  </div>
                  <textarea value={form.seo_description} onChange={e => set("seo_description", e.target.value)}
                    placeholder="Descriere scurta pentru rezultatele Google..."
                    maxLength={180} rows={3} className={inputCls + " resize-none"} />
                  <p className="text-xs text-muted-foreground mt-1">Ideal: 140-160 caractere</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="w-full lg:w-72 lg:flex-shrink-0 space-y-4 lg:sticky lg:top-6">
            {/* Status */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Status</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <Toggle checked={form.is_active} onChange={(v) => set("is_active", v)} label="Activ (vizibil in magazin)" />
                <Toggle checked={form.is_featured} onChange={(v) => set("is_featured", v)}
                  label={<span className="flex items-center gap-1.5">Recomandat <Star className="h-3 w-3 text-amber-400 fill-amber-400" /></span>}
                />
              </div>
            </div>

            {/* Inventory */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Stoc</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <Toggle checked={form.track_inventory} onChange={(v) => set("track_inventory", v)} label="Urmareste stocul" />
                {form.track_inventory && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Cantitate in stoc</label>
                      <input type="number" value={form.stock_quantity}
                        onChange={(e) => set("stock_quantity", e.target.value)}
                        placeholder="0" min="0" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Notifica la stoc mic</label>
                      <div className="relative">
                        <input type="number" value={form.low_stock_threshold}
                          onChange={(e) => set("low_stock_threshold", e.target.value)}
                          placeholder="ex: 5" min="0" className={inputCls + " pr-12"} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">buc</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Notifica-ma cand stocul scade sub aceasta valoare</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className={sectionCls}>
              <div className="px-5 py-4 space-y-2.5">
                <button type="submit" disabled={isPending}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-xl bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isPending ? "Se salveaza..." : isEditing ? "Salveaza modificarile" : "Adauga produs"}
                </button>
                <button type="button" onClick={() => router.push("/dashboard/products")}
                  className="w-full py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors text-foreground">
                  Anuleaza
                </button>
              </div>
            </div>

            {/* Delete */}
            {isEditing && (
              <div className={sectionCls}>
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-destructive">Sterge produsul</p>
                </div>
                <div className="px-5 py-4">
                  {confirmDelete ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Esti sigur? Actiunea este ireversibila.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleDelete} disabled={isDeleting}
                          className="flex-1 py-2 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Sterge
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(false)}
                          className="flex-1 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
                          Anuleaza
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)}
                      className="w-full py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Sterge produsul
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Mobile sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface/95 backdrop-blur-sm border-t border-border px-4 py-3 flex gap-3 lg:hidden">
        <button type="button" onClick={() => router.push("/dashboard/products")}
          className="flex-1 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors text-foreground">
          Anuleaza
        </button>
        <button type="submit" form="product-form" disabled={isPending}
          className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Se salveaza..." : isEditing ? "Salveaza" : "Adauga produs"}
        </button>
      </div>
    </div>
  );
}
