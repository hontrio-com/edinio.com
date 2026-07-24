"use client";

import { useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, X, Pencil, Loader2, Upload, Star, ArrowLeft, Trash2,
  Globe, BarChart2, Check, Ruler, ChevronDown, ImageIcon, Info, ExternalLink,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaPicker } from "@/components/media/MediaPicker";
import { createProduct, updateProduct, deleteProduct } from "@/lib/actions/product.actions";
import { publishOlxProduct } from "@/lib/actions/olx.actions";
import { createCategory } from "@/lib/actions/category.actions";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { GooglePreview, CharCounter } from "@/components/dashboard/SeoFields";
import { SEO_TITLE_IDEAL_MIN, SEO_TITLE_MAX, SEO_DESCRIPTION_IDEAL_MIN, SEO_DESCRIPTION_MAX } from "@/lib/seo";
import type { Database } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
}

interface SpecRow { label: string; value: string; }

export interface CustomizationField {
  id: string;
  type: "text" | "textarea" | "image" | "select" | "color";
  label: string;
  placeholder: string;
  required: boolean;
  max_length?: number;
  max_files?: number;
  max_file_size_mb?: number;
  options?: string[];
  default_color?: string;
  helper_text?: string;
}

interface CustomizationState {
  enabled: boolean;
  fields: CustomizationField[];
}

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
  short_description: string;
  price: string;
  compare_at_price: string;
  category: string;
  shipping_class: string;
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
  customization: CustomizationState;
  google: GoogleShoppingState;
}

interface GoogleShoppingState {
  gtin: string;
  brand: string;
  mpn: string;
  google_product_category: string;
  condition: "" | "new" | "refurbished" | "used";
  gender: "" | "male" | "female" | "unisex";
  age_group: "" | "adult" | "kids" | "toddler" | "infant" | "newborn";
  color: string;
  size: string;
  material: string;
  custom_label_0: string;
  custom_label_1: string;
  custom_label_2: string;
  custom_label_3: string;
  custom_label_4: string;
}

// True daca produsul are deja macar un atribut Google Shopping completat — folosit
// ca sa deschidem sectiunea din start la editare (altfel ar ascunde date existente).
function hasGoogleData(g: GoogleShoppingState): boolean {
  return Object.values(g).some((v) => typeof v === "string" && v.trim() !== "");
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
  name: "", slug: "", description: "", short_description: "", price: "", compare_at_price: "",
  category: "", shipping_class: "", sku: "", images: [],
  track_inventory: false, stock_quantity: "", low_stock_threshold: "",
  stock_status: "in_stock",
  is_featured: false, is_active: true,
  specifications: [],
  quantity_tiers: { ...EMPTY_TIERS },
  weight_grams: "",
  dimensions: { length: "", width: "", height: "" },
  seo_title: "", seo_description: "",
  variants: { enabled: false, options: [], combinations: [] },
  customization: { enabled: false, fields: [] },
  google: { gtin: "", brand: "", mpn: "", google_product_category: "", condition: "", gender: "", age_group: "", color: "", size: "", material: "", custom_label_0: "", custom_label_1: "", custom_label_2: "", custom_label_3: "", custom_label_4: "" },
};

type PageSections = {
  specifications?: SpecRow[];
  quantity_tiers?: { enabled: boolean; mode?: string; tier2_price: number; tier2_percent?: number; tier2_badge: string; tier3_price: number; tier3_percent?: number; tier3_badge: string };
  stock_status?: string;
  low_stock_threshold?: number;
  dimensions?: { length: number; width: number; height: number };
  short_description?: string;
  seo?: { title: string; description: string };
  variants?: { enabled: boolean; options: Omit<VariantOption, "inputValue">[]; combinations: VariantCombination[] };
  customization?: { enabled: boolean; fields: CustomizationField[] };
  google?: {
    gtin?: string; brand?: string; mpn?: string; google_product_category?: string;
    condition?: string; gender?: string; age_group?: string;
    color?: string; size?: string; material?: string;
    custom_label_0?: string; custom_label_1?: string; custom_label_2?: string; custom_label_3?: string; custom_label_4?: string;
  };
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
    short_description: ps.short_description ?? "",
    price: String(p.price),
    compare_at_price: p.compare_at_price ? String(p.compare_at_price) : "",
    category: p.category ?? "",
    shipping_class: p.shipping_class ?? "",
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
    customization: ps.customization
      ? { enabled: ps.customization.enabled, fields: ps.customization.fields }
      : { enabled: false, fields: [] },
    google: {
      gtin: ps.google?.gtin ?? "",
      brand: ps.google?.brand ?? "",
      mpn: ps.google?.mpn ?? "",
      google_product_category: ps.google?.google_product_category ?? "",
      condition: (ps.google?.condition as FormState["google"]["condition"]) ?? "",
      gender: (ps.google?.gender as FormState["google"]["gender"]) ?? "",
      age_group: (ps.google?.age_group as FormState["google"]["age_group"]) ?? "",
      color: ps.google?.color ?? "",
      size: ps.google?.size ?? "",
      material: ps.google?.material ?? "",
      custom_label_0: ps.google?.custom_label_0 ?? "",
      custom_label_1: ps.google?.custom_label_1 ?? "",
      custom_label_2: ps.google?.custom_label_2 ?? "",
      custom_label_3: ps.google?.custom_label_3 ?? "",
      custom_label_4: ps.google?.custom_label_4 ?? "",
    },
  };
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </label>
  );
}

function SortableImage({ url, index, onRemove, onMakeMain }: {
  url: string; index: number; onRemove: () => void; onMakeMain: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const isMain = index === 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative aspect-square rounded-xl overflow-hidden border border-border group bg-muted/30 touch-none cursor-grab active:cursor-grabbing",
        isDragging && "z-10 shadow-lg ring-2 ring-primary/40 opacity-90",
      )}
      {...attributes}
      {...listeners}
    >
      <Image src={url} alt={`Imagine ${index + 1}`} fill sizes="(max-width: 640px) 33vw, 120px" className="object-contain p-1 pointer-events-none" />
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="h-3 w-3" />
      </button>
      {isMain ? (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-semibold rounded flex items-center gap-1">
          <Star className="h-2.5 w-2.5 fill-current" />
          Principal
        </div>
      ) : (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onMakeMain}
          title="Fa principala"
          className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-semibold rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
          <Star className="h-2.5 w-2.5" />
          Fa principala
        </button>
      )}
    </div>
  );
}

function ImageUploader({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Small drag threshold so a tap on the delete / "make main" buttons still registers as a click.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = images.indexOf(String(active.id));
    const to = images.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(arrayMove(images, from, to));
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={images} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-2">
            {images.map((url, i) => (
              <SortableImage
                key={url}
                url={url}
                index={i}
                onRemove={() => onChange(images.filter((u) => u !== url))}
                onMakeMain={() => onChange([url, ...images.filter((u) => u !== url)])}
              />
            ))}
            <button type="button" onClick={() => setPickerOpen(true)}
              className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">Adauga</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>
      <p className="text-xs text-muted-foreground">Trage imaginile ca sa schimbi ordinea. Prima (Principal) e cea afisata pe card. Incarci sau alegi din Biblioteca Media.</p>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        accept="image"
        bucket="products"
        excludeUrls={images}
        onSelect={(urls) => onChange([...images, ...urls.filter((u) => !images.includes(u))])}
      />
    </div>
  );
}

function VariantImagePicker({ images, selected, onSelect }: { images: string[]; selected: string; onSelect: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!images.length) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="relative w-12 h-12 rounded-lg border border-border overflow-hidden flex-shrink-0 hover:border-primary transition-colors bg-muted/30">
        {selected
          ? <Image src={selected} alt="" fill sizes="48px" className="object-contain p-0.5" />
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
                className={cn("relative aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-muted/30",
                  selected === url ? "border-primary" : "border-transparent hover:border-border")}>
                <Image src={url} alt="" fill sizes="48px" className="object-contain p-0.5" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Mirror the <Input> primitive (border-input, transparent bg, focus-visible ring)
// so every native field in the form matches the rest of the dashboard.
const inputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const smallInputCls = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const sectionCls = "bg-surface border border-border rounded-xl overflow-hidden";

// Small "( i )" toggle next to a section title; opens an inline explanatory card.
function InfoBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cum functioneaza?"
      className={cn(
        "inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border transition-colors flex-shrink-0",
        open ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-primary hover:border-primary",
      )}
    >
      <Info className="h-3 w-3" />
    </button>
  );
}

function HelpCard({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-4 bg-primary/5 border-b border-border">
      <div className="text-xs text-foreground/80 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

interface Props {
  businessId: string;
  product?: Product;
  categories: CategoryOption[];
  backHref?: string;
  // Store slug + publish status, so we can show "Vezi produsul" only when the
  // public product page is actually live (active product + published store).
  business?: { slug: string; is_published: boolean };
  olxConnected?: boolean;
  // Sectiunea Google Shopping se afiseaza doar cand contul are Google Merchant conectat.
  gmcConnected?: boolean;
  // Clasele de transport definite in Setari > Livrare (pentru selectorul de pe produs).
  shippingClasses?: { id: string; name: string }[];
}

export function ProductForm({ businessId, product, categories, backHref = "/dashboard/products", business, olxConnected = false, gmcConnected = false, shippingClasses = [] }: Props) {
  const router = useRouter();
  const isEditing = !!product;
  const [olxPublishing, startOlxPublish] = useTransition();

  function handlePublishOlx() {
    if (!product) return;
    startOlxPublish(async () => {
      const res = await publishOlxProduct(businessId, product.id);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(
        res.status === "active" ? "Anunț activ pe OLX."
        : res.status === "limited" ? "Publicat, dar categoria a atins limita gratuită. Cumpără un pachet în Integrări > OLX."
        : "Trimis pe OLX. Intră în moderare (câteva minute).",
      );
    });
  }
  const [form, setForm] = useState<FormState>(product ? productToForm(product) : EMPTY_FORM);
  // Toggle vizual pentru sectiunea Google Shopping: inchis implicit, dar deschis
  // din start daca produsul editat are deja atribute completate.
  const [showGoogle, setShowGoogle] = useState(() => hasGoogleData(form.google));
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  const toggleHelp = (k: string) => setHelpOpen((p) => (p === k ? null : k));
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
  const seoColor = seoScore >= 81 ? "text-success" : seoScore >= 61 ? "text-info" : seoScore >= 31 ? "text-warning" : "text-destructive";
  const seoBg = seoScore >= 81 ? "border-success/20 bg-success/5" : seoScore >= 61 ? "border-info/20 bg-info/5" : seoScore >= 31 ? "border-warning/20 bg-warning/5" : "border-destructive/20 bg-destructive/5";
  const seoLabel = seoScore >= 81 ? "Excelent" : seoScore >= 61 ? "Bun" : seoScore >= 31 ? "Mediu" : "Slab";
  const seoBarColor = seoScore >= 81 ? "bg-success" : seoScore >= 61 ? "bg-info" : seoScore >= 31 ? "bg-warning" : "bg-destructive";

  // Auto-fill SEO from the product title + (short, then long) description.
  function autofillSeo() {
    const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    set("seo_title", (form.name || "").trim().slice(0, 60));
    set("seo_description", (plain(form.short_description) || plain(form.description)).slice(0, 160));
  }

  const serp = {
    url: `edinio.com/magazin/${form.slug || "produs"}`,
    title: (form.seo_title.trim() || form.name || "Titlu produs").slice(0, 60),
    desc: (form.seo_description.trim() || form.short_description.replace(/<[^>]+>/g, "").trim() || form.description.replace(/<[^>]+>/g, "").slice(0, 160) || "Fara descriere.").slice(0, 160),
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
      shipping_class: form.shipping_class || null,
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
        short_description: form.short_description,
        seo: { title: form.seo_title, description: form.seo_description },
        variants: {
          enabled: form.variants.enabled,
          options: form.variants.options.map(({ inputValue: _iv, ...o }) => o),
          combinations: form.variants.combinations,
        },
        customization: {
          enabled: form.customization.enabled,
          fields: form.customization.fields,
        },
        google: {
          gtin: form.google.gtin.trim(),
          brand: form.google.brand.trim(),
          mpn: form.google.mpn.trim(),
          google_product_category: form.google.google_product_category.trim(),
          condition: form.google.condition,
          gender: form.google.gender,
          age_group: form.google.age_group,
          color: form.google.color.trim(),
          size: form.google.size.trim(),
          material: form.google.material.trim(),
          custom_label_0: form.google.custom_label_0.trim(),
          custom_label_1: form.google.custom_label_1.trim(),
          custom_label_2: form.google.custom_label_2.trim(),
          custom_label_3: form.google.custom_label_3.trim(),
          custom_label_4: form.google.custom_label_4.trim(),
        },
      },
    };

    startTransition(async () => {
      const result = isEditing
        ? await updateProduct(product.id, businessId, payload)
        : await createProduct(businessId, payload);
      if (result.error) { toast.error(result.error); return; }
      toast.success(isEditing ? "Produs actualizat!" : "Produs adaugat!");
      router.push(backHref);
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteProduct(product!.id, businessId);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Produs sters!");
      router.push(backHref);
    });
  }

  const previewPrice = form.price ? formatPrice(parseFloat(form.price.replace(",", ".")) || 0) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button type="button" onClick={() => router.push(backHref)}
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
        {isEditing && (olxConnected || (product?.is_active && product?.slug && business?.is_published)) && (
          <div className="ml-auto flex items-center gap-2">
            {olxConnected && (
              <button type="button" onClick={handlePublishOlx} disabled={olxPublishing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground disabled:opacity-50">
                {olxPublishing
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Image src="/integrations/olx.svg" alt="" width={16} height={16} className="h-4 w-4 rounded-[3px]" />}
                Postează pe OLX
              </button>
            )}
            {/* Live only when the product is active AND the store is published — otherwise the page 404s. */}
            {product?.is_active && product?.slug && business?.is_published && (
              <a href={`/${business.slug}/product/${product.slug}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors text-foreground">
                <ExternalLink className="h-4 w-4" />
                Vezi produsul
              </a>
            )}
          </div>
        )}
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
                  <label className="block text-sm font-medium text-foreground mb-1">Descriere scurta</label>
                  <p className="text-xs text-muted-foreground mb-1.5">Apare sub titlul produsului si ca descriere in Google (meta). Tine-o concisa, 1-2 fraze.</p>
                  <RichTextEditor content={form.short_description} onChange={(html) => set("short_description", html)}
                    placeholder="Pe scurt, de ce sa cumpere acest produs..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Descriere lunga</label>
                  <p className="text-xs text-muted-foreground mb-1.5">Apare in sectiunea de detalii a paginii de produs. Descrie produsul pe larg.</p>
                  <RichTextEditor content={form.description} onChange={(html) => set("description", html)}
                    placeholder="Descrie produsul tau in detaliu..." />
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
                            <option value={parent.name}>{parent.name} (toate)</option>
                            {children.map(child => (
                              <option key={child.id} value={child.name}>{`  ↳ ${child.name}`}</option>
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
                          <Button type="button" size="sm" onClick={handleCreateCategory} disabled={isCreatingCat || !newCatName.trim()} className="flex-1">
                            {isCreatingCat ? <Loader2 className="animate-spin" /> : "Creeaza"}
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddCategory(false); setNewCatName(""); setNewCatParentId(null); }} className="flex-1">
                            Anuleaza
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">SKU</label>
                    <input type="text" value={form.sku} onChange={(e) => set("sku", e.target.value)}
                      placeholder="ex: GNT-001" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Cod EAN / Cod de bare</label>
                    <input type="text" inputMode="numeric" value={form.google.gtin}
                      onChange={(e) => set("google", { ...form.google, gtin: e.target.value })}
                      placeholder="ex: 5941234567890" className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-1">GTIN / EAN / UPC. Recomandat pentru Google Shopping si marketplace-uri.</p>
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
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">Produse variabile</p>
                    <InfoBtn open={helpOpen === "variants"} onClick={() => toggleHelp("variants")} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Culori, marimi, materiale etc.</p>
                </div>
                <Switch checked={form.variants.enabled} onCheckedChange={(v) => set("variants", { ...form.variants, enabled: v })} className="shrink-0" />
              </div>
              {helpOpen === "variants" && (
                <HelpCard>
                  <p><strong className="text-foreground">Optiune</strong> = o caracteristica a produsului. Ex: Marime, Culoare, Material.</p>
                  <p><strong className="text-foreground">Valoare</strong> = optiunile concrete ale unei caracteristici. Ex: la Marime &rarr; S, M, L; la Culoare &rarr; Rosu, Albastru.</p>
                  <p><strong className="text-foreground">Varianta</strong> = combinatia rezultata din optiuni, fiecare cu pretul, codul (SKU) si stocul ei. Ex: &laquo;M / Rosu&raquo;.</p>
                  <div className="rounded-lg bg-surface border border-border p-2.5 mt-1">
                    <p className="font-medium text-foreground mb-1">Exemplu</p>
                    <p>Un tricou cu Marime (S, M, L) si Culoare (Rosu, Albastru) genereaza 6 variante: S/Rosu, S/Albastru, M/Rosu, M/Albastru, L/Rosu, L/Albastru. Clientul alege marimea si culoarea, iar tu poti pune pret si stoc diferit pentru fiecare combinatie.</p>
                  </div>
                </HelpCard>
              )}
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

            {/* Customization */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">Personalizare produs</p>
                    <InfoBtn open={helpOpen === "customization"} onClick={() => toggleHelp("customization")} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Clientii pot incarca imagini, text etc.</p>
                </div>
                <Switch checked={form.customization.enabled} onCheckedChange={(v) => set("customization", { ...form.customization, enabled: v })} className="shrink-0" />
              </div>
              {helpOpen === "customization" && (
                <HelpCard>
                  <p>Permiti clientului sa-ti trimita informatii sau personalizari direct la comanda. Adaugi campuri pe care le completeaza el:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li><strong className="text-foreground">Text</strong> &rarr; un rand scurt (ex: numele de gravat).</li>
                    <li><strong className="text-foreground">Paragraf</strong> &rarr; text mai lung (ex: un mesaj).</li>
                    <li><strong className="text-foreground">Alegere</strong> &rarr; o lista de optiuni (ex: font Clasic / Modern).</li>
                    <li><strong className="text-foreground">Culoare</strong> &rarr; clientul alege o culoare.</li>
                    <li><strong className="text-foreground">Imagine</strong> &rarr; clientul incarca un fisier (ex: un logo de printat).</li>
                  </ul>
                  <p>Poti marca un camp drept obligatoriu. Ce completeaza clientul apare la tine in detaliile comenzii.</p>
                  <div className="rounded-lg bg-surface border border-border p-2.5 mt-1">
                    <p className="font-medium text-foreground mb-1">Exemplu</p>
                    <p>Cana personalizata: un camp Text &laquo;Numele de gravat&raquo; (obligatoriu) si un camp Imagine &laquo;Incarca logo&raquo;.</p>
                  </div>
                </HelpCard>
              )}
              {form.customization.enabled && (
                <div className="px-5 py-4 space-y-4">
                  {form.customization.fields.map((field, idx) => (
                    <div key={field.id} className="border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Camp {idx + 1}
                        </span>
                        <button type="button" onClick={() => {
                          set("customization", {
                            ...form.customization,
                            fields: form.customization.fields.filter((_, i) => i !== idx),
                          });
                        }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Tip camp</label>
                          <select value={field.type} onChange={e => {
                            const fields = [...form.customization.fields];
                            fields[idx] = { ...fields[idx], type: e.target.value as CustomizationField["type"] };
                            set("customization", { ...form.customization, fields });
                          }} className={smallInputCls}>
                            <option value="text">Text scurt</option>
                            <option value="textarea">Text lung</option>
                            <option value="image">Imagine (upload)</option>
                            <option value="select">Selectie (lista)</option>
                            <option value="color">Culoare</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Obligatoriu</label>
                          <button type="button" onClick={() => {
                            const fields = [...form.customization.fields];
                            fields[idx] = { ...fields[idx], required: !fields[idx].required };
                            set("customization", { ...form.customization, fields });
                          }}
                            className={cn("w-full py-2 text-xs font-semibold rounded-lg border transition-colors",
                              field.required
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/30")}>
                            {field.required ? "Da, obligatoriu" : "Nu, optional"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Eticheta</label>
                        <input type="text" value={field.label} onChange={e => {
                          const fields = [...form.customization.fields];
                          fields[idx] = { ...fields[idx], label: e.target.value };
                          set("customization", { ...form.customization, fields });
                        }} placeholder="ex: Textul de gravat" className={smallInputCls} />
                      </div>

                      {(field.type === "text" || field.type === "textarea") && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Placeholder</label>
                            <input type="text" value={field.placeholder} onChange={e => {
                              const fields = [...form.customization.fields];
                              fields[idx] = { ...fields[idx], placeholder: e.target.value };
                              set("customization", { ...form.customization, fields });
                            }} placeholder="ex: Scrie textul aici..." className={smallInputCls} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Caractere max</label>
                            <input type="number" value={field.max_length ?? ""} onChange={e => {
                              const fields = [...form.customization.fields];
                              fields[idx] = { ...fields[idx], max_length: e.target.value ? parseInt(e.target.value) : undefined };
                              set("customization", { ...form.customization, fields });
                            }} placeholder="100" min="1" className={smallInputCls} />
                          </div>
                        </div>
                      )}

                      {field.type === "image" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Nr. max imagini</label>
                            <input type="number" value={field.max_files ?? ""} onChange={e => {
                              const fields = [...form.customization.fields];
                              fields[idx] = { ...fields[idx], max_files: e.target.value ? parseInt(e.target.value) : undefined };
                              set("customization", { ...form.customization, fields });
                            }} placeholder="5" min="1" max="10" className={smallInputCls} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Max MB/fisier</label>
                            <input type="number" value={field.max_file_size_mb ?? ""} onChange={e => {
                              const fields = [...form.customization.fields];
                              fields[idx] = { ...fields[idx], max_file_size_mb: e.target.value ? parseInt(e.target.value) : undefined };
                              set("customization", { ...form.customization, fields });
                            }} placeholder="10" min="1" max="25" className={smallInputCls} />
                          </div>
                        </div>
                      )}

                      {field.type === "select" && (
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Optiuni (cate una pe linie)</label>
                          <textarea value={(field.options ?? []).join("\n")} onChange={e => {
                            const fields = [...form.customization.fields];
                            fields[idx] = { ...fields[idx], options: e.target.value.split("\n").filter(Boolean) };
                            set("customization", { ...form.customization, fields });
                          }} rows={3} placeholder={"Script\nSans-serif\nHandwriting"} className={smallInputCls + " resize-none"} />
                        </div>
                      )}

                      {field.type === "color" && (
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Culoare implicita</label>
                          <input type="color" value={field.default_color ?? "#000000"} onChange={e => {
                            const fields = [...form.customization.fields];
                            fields[idx] = { ...fields[idx], default_color: e.target.value };
                            set("customization", { ...form.customization, fields });
                          }} className="w-10 h-8 rounded border border-border cursor-pointer" />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Text ajutator (optional)</label>
                        <input type="text" value={field.helper_text ?? ""} onChange={e => {
                          const fields = [...form.customization.fields];
                          fields[idx] = { ...fields[idx], helper_text: e.target.value || undefined };
                          set("customization", { ...form.customization, fields });
                        }} placeholder="ex: Minim 300x300px, format PNG/JPG" className={smallInputCls} />
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={() => {
                    const newField: CustomizationField = {
                      id: crypto.randomUUID(),
                      type: "text",
                      label: "",
                      placeholder: "",
                      required: false,
                    };
                    set("customization", {
                      ...form.customization,
                      fields: [...form.customization.fields, newField],
                    });
                  }}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                    <Plus className="h-4 w-4" /> Adauga camp de personalizare
                  </button>

                  {form.customization.fields.length === 0 && (
                    <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                      Adauga campuri pe care clientii le vor completa la comanda
                    </p>
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
                {shippingClasses.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Clasa de transport</label>
                    <select value={form.shipping_class} onChange={(e) => set("shipping_class", e.target.value)} className={inputCls}>
                      <option value="">Standard (implicit)</option>
                      {shippingClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">Regulile din Setari &gt; Livrare pot aplica preturi diferite in functie de clasa.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quantity tiers */}
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">Upsell cantitate</p>
                    <InfoBtn open={helpOpen === "tiers"} onClick={() => toggleHelp("tiers")} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Ofera pret mai bun la 2 sau 3 bucati</p>
                </div>
                <Switch checked={form.quantity_tiers.enabled} onCheckedChange={(v) => set("quantity_tiers", { ...form.quantity_tiers, enabled: v })} className="shrink-0" />
              </div>
              {helpOpen === "tiers" && (
                <HelpCard>
                  <p>Oferi un pret mai mic cand clientul cumpara mai multe bucati din acelasi produs, ca sa-l incurajezi sa comande mai mult.</p>
                  <p>Setezi pana la 2 praguri (la 2 buc. si la 3 buc.), fie ca pret fix pe bucata, fie ca procent de reducere. Poti adauga si o eticheta (ex: &laquo;Cel mai bun pret&raquo;).</p>
                  <div className="rounded-lg bg-surface border border-border p-2.5 mt-1">
                    <p className="font-medium text-foreground mb-1">Exemplu</p>
                    <p>Pret normal 50 lei/buc. La 2 buc. &rarr; 45 lei/buc, la 3 buc. &rarr; 40 lei/buc. Clientul vede economia pe pagina produsului si e tentat sa ia mai multe.</p>
                  </div>
                </HelpCard>
              )}
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
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Preview Google</p>
                  <GooglePreview title={serp.title} description={serp.desc} url={serp.url} />
                </div>

                <button type="button" onClick={autofillSeo}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  <BarChart2 className="h-3.5 w-3.5" />
                  Auto-completeaza din titlu si descriere
                </button>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Titlu SEO</label>
                    <CharCounter len={form.seo_title.length} idealMin={SEO_TITLE_IDEAL_MIN} max={SEO_TITLE_MAX} />
                  </div>
                  <input type="text" value={form.seo_title} onChange={e => set("seo_title", e.target.value)}
                    placeholder={form.name || "Titlu pentru Google"} maxLength={70} className={inputCls} />
                  <p className="text-xs text-muted-foreground mt-1">Ideal: 50-60 caractere</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Descriere SEO</label>
                    <CharCounter len={form.seo_description.length} idealMin={SEO_DESCRIPTION_IDEAL_MIN} max={SEO_DESCRIPTION_MAX} />
                  </div>
                  <textarea value={form.seo_description} onChange={e => set("seo_description", e.target.value)}
                    placeholder="Descriere scurta pentru rezultatele Google..."
                    maxLength={180} rows={3} className={inputCls + " resize-none"} />
                  <p className="text-xs text-muted-foreground mt-1">Ideal: 140-160 caractere</p>
                </div>
              </div>
            </div>

            {/* ── Google Shopping / Merchant Center (doar cand GMC e conectat) ── */}
            {gmcConnected && (
            <div className={sectionCls}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Google Shopping</p>
                    <p className="text-xs text-muted-foreground">Atribute pentru feed-ul Google Merchant Center (optionale, dar imbunatatesc reclamele si vizibilitatea)</p>
                  </div>
                </div>
                <Switch checked={showGoogle} onCheckedChange={setShowGoogle} className="shrink-0" />
              </div>
              {showGoogle && (
              <div className="px-5 py-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Codul de bare (GTIN/EAN) se completeaza in sectiunea <span className="font-medium text-foreground">Organizare</span>, mai sus.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Brand</label>
                    <input type="text" value={form.google.brand} onChange={e => set("google", { ...form.google, brand: e.target.value })}
                      placeholder="Marca produsului" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">MPN (cod producator)</label>
                    <input type="text" value={form.google.mpn} onChange={e => set("google", { ...form.google, mpn: e.target.value })}
                      placeholder="ex: ABC-123" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Categorie Google</label>
                    <input type="text" value={form.google.google_product_category} onChange={e => set("google", { ...form.google, google_product_category: e.target.value })}
                      placeholder="ID sau lasa gol pentru maparea magazinului" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Stare</label>
                    <select value={form.google.condition} onChange={e => set("google", { ...form.google, condition: e.target.value as FormState["google"]["condition"] })} className={inputCls}>
                      <option value="">Automat (nou)</option>
                      <option value="new">Nou</option>
                      <option value="refurbished">Resigilat</option>
                      <option value="used">Folosit</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Gen</label>
                    <select value={form.google.gender} onChange={e => set("google", { ...form.google, gender: e.target.value as FormState["google"]["gender"] })} className={inputCls}>
                      <option value="">-</option>
                      <option value="male">Barbati</option>
                      <option value="female">Femei</option>
                      <option value="unisex">Unisex</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Grupa de varsta</label>
                    <select value={form.google.age_group} onChange={e => set("google", { ...form.google, age_group: e.target.value as FormState["google"]["age_group"] })} className={inputCls}>
                      <option value="">-</option>
                      <option value="adult">Adulti</option>
                      <option value="kids">Copii</option>
                      <option value="toddler">Prescolari</option>
                      <option value="infant">Bebelusi</option>
                      <option value="newborn">Nou-nascuti</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Culoare</label>
                    <input type="text" value={form.google.color} onChange={e => set("google", { ...form.google, color: e.target.value })}
                      placeholder="ex: Rosu" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Marime</label>
                    <input type="text" value={form.google.size} onChange={e => set("google", { ...form.google, size: e.target.value })}
                      placeholder="ex: M" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Material</label>
                    <input type="text" value={form.google.material} onChange={e => set("google", { ...form.google, material: e.target.value })}
                      placeholder="ex: Bumbac" className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Etichete personalizate (campanii Google Ads)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" value={form.google.custom_label_0} onChange={e => set("google", { ...form.google, custom_label_0: e.target.value })} placeholder="Eticheta 0" className={inputCls} />
                    <input type="text" value={form.google.custom_label_1} onChange={e => set("google", { ...form.google, custom_label_1: e.target.value })} placeholder="Eticheta 1" className={inputCls} />
                    <input type="text" value={form.google.custom_label_2} onChange={e => set("google", { ...form.google, custom_label_2: e.target.value })} placeholder="Eticheta 2" className={inputCls} />
                    <input type="text" value={form.google.custom_label_3} onChange={e => set("google", { ...form.google, custom_label_3: e.target.value })} placeholder="Eticheta 3" className={inputCls} />
                    <input type="text" value={form.google.custom_label_4} onChange={e => set("google", { ...form.google, custom_label_4: e.target.value })} placeholder="Eticheta 4" className={inputCls} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Ex: sezon, marja, best-seller. Le folosesti pentru a segmenta produsele in campanii.</p>
                </div>
              </div>
              )}
            </div>
            )}
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
                <Button type="submit" size="lg" disabled={isPending} className="w-full">
                  {isPending && <Loader2 className="animate-spin" />}
                  {isPending ? "Se salveaza..." : isEditing ? "Salveaza modificarile" : "Adauga produs"}
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={() => router.push(backHref)} className="w-full">
                  Anuleaza
                </Button>
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
                        <Button type="button" size="sm" onClick={handleDelete} disabled={isDeleting} className="flex-1 bg-destructive text-white hover:bg-destructive/90">
                          {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                          Sterge
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)} className="flex-1">
                          Anuleaza
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)} className="w-full">
                      <Trash2 />
                      Sterge produsul
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Mobile sticky save bar — sits at the very bottom (the global bottom nav is hidden on this screen) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-3 lg:hidden">
        <Button type="button" variant="outline" size="lg" onClick={() => router.push(backHref)} className="flex-1">
          Anuleaza
        </Button>
        <Button type="submit" form="product-form" size="lg" disabled={isPending} className="flex-1">
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "Se salveaza..." : isEditing ? "Salveaza" : "Adauga produs"}
        </Button>
      </div>
    </div>
  );
}
