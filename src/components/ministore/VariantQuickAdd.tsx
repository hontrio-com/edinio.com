"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ShoppingCart, X, Package } from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import type { PriceRange } from "@/lib/utils/product-price";
import { createClient } from "@/lib/supabase/client";
import {
  parseVariants, comboTitle, findCombo, comboUnitPrice, comboCompareAtPrice,
} from "@/lib/storefront/variants";
import { VariantPicker } from "./VariantPicker";

export interface QuickAddLine {
  productId: string;
  slug?: string;
  name: string;
  price: number;
  imageUrl: string | null;
  variantTitle: string;
  variantSku?: string;
}

interface QuickAddProduct {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  page_sections: unknown;
  /**
   * Intervalul vandabil, calculat pe SERVER. Obligatoriu: cu `deferCombinations`
   * sertarul se deschide inainte sa soseasca combinatiile, deci pana atunci nu
   * are din ce sa-l derive — si pana acum arata pretul de BAZA, care poate sa nu
   * fie de vanzare deloc.
   */
  price_range: PriceRange;
}

/**
 * Small sheet that opens when a customer taps "Alege optiunile" on a variable
 * product card. It reuses the exact selection logic of the product page (title
 * / combination / availability) so price, image and the chosen combination stay
 * in lock-step. On confirm it hands the resolved line to the caller, which is
 * responsible for actually adding it to the cart (storefront context or
 * localStorage on custom pages).
 */
export function VariantQuickAdd({ product, color, open, onClose, onAdd, deferCombinations = false }: {
  product: QuickAddProduct | null;
  color: string;
  open: boolean;
  onClose: () => void;
  onAdd: (line: QuickAddLine) => void;
  /**
   * Catalogul de pe homepage e slimuit: variantele vin FARA combinatii (doar
   * optiunile), ca payload-ul sa nu creasca liniar cu matricile de variante.
   * Cu flag-ul pornit, sheet-ul isi aduce singur page_sections complet la
   * deschidere (RLS: vizitatorii vad doar produse active din magazine
   * publicate; ownerul isi vede produsele lui in preview).
   */
  deferCombinations?: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  // page_sections complet, adus la cerere cand combinatiile sunt amanate.
  const [loadedPs, setLoadedPs] = useState<unknown>(null);

  // Reset the selection when a different product opens the sheet (or it reopens).
  // Adjusting state during render off a "previous value" is the React-recommended
  // alternative to a setState-in-effect (no cascading render).
  const openId = open && product ? product.id : null;
  const [prevOpenId, setPrevOpenId] = useState<string | null>(null);
  if (openId !== prevOpenId) {
    setPrevOpenId(openId);
    setSelected({});
    setLoadedPs(null);
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  // Combinatiile, la cerere: un singur produs per deschidere (~o interogare
  // mica), in loc sa care tot catalogul matricile fiecarui produs.
  const productId = product?.id ?? null;
  useEffect(() => {
    if (!open || !productId || !deferCombinations || loadedPs !== null) return;
    let cancelled = false;
    createClient()
      .from("products")
      .select("page_sections")
      .eq("id", productId)
      .maybeSingle()
      .then(
        ({ data }) => { if (!cancelled) setLoadedPs(data?.page_sections ?? {}); },
        () => { if (!cancelled && product) setLoadedPs(product.page_sections); },
      );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId, deferCombinations, loadedPs]);

  const combosLoading = deferCombinations && open && loadedPs === null;
  const effectivePs = deferCombinations && loadedPs !== null ? loadedPs : product?.page_sections;
  const variants = useMemo(() => (product ? parseVariants(effectivePs) : null), [product, effectivePs]);

  const title = useMemo(
    () => (variants ? comboTitle(variants.options, selected) : null),
    [variants, selected],
  );
  const combo = useMemo(() => (variants ? findCombo(variants, title) : null), [variants, title]);

  if (!open || !product || !variants) return null;

  const basePrice = Number(product.price);
  // Pana la prima bifa nu exista o combinatie aleasa, deci nici un pret unic:
  // se arata intervalul vandabil, nu pretul de baza.
  const displayPrice = comboUnitPrice(combo, basePrice);
  const pretAfisat = combo ? formatPrice(displayPrice) : formatPriceRange(product.price_range.min, product.price_range.max);
  const displayCompare = comboCompareAtPrice(combo, product.compare_at_price);
  const hasDiscount = !!combo && displayCompare != null && displayCompare > displayPrice;
  const image = combo?.image || product.images[0] || null;
  // A full selection was made but it maps to no enabled combination (merchant
  // disabled that exact mix) — block the add and tell the customer. Cat timp
  // combinatiile inca se incarca, nu afisam mesajul (ar fi un fals negativ).
  const titleFormedButUnavailable = !!title && !combo && !combosLoading;
  const canAdd = !!title && !!combo && !combosLoading;

  function handleAdd() {
    if (!product || !title || !combo) return;
    onAdd({
      productId: product.id,
      slug: product.slug ?? undefined,
      name: product.name,
      price: displayPrice,
      imageUrl: image,
      variantTitle: title,
      variantSku: combo.sku || undefined,
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[60] w-full md:max-w-md max-h-[90vh] overflow-y-auto bg-surface"
        style={{ borderRadius: "21px 21px 0 0", boxShadow: "rgba(0,0,0,0.5) 0px 4px 24px", border: `3px solid ${color}` }}
      >
        <div className="md:hidden flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h2 className="text-base font-bold text-foreground tracking-tight pr-3">Alege optiunile</h2>
          <button type="button" aria-label="Inchide" onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0">
            <X className="h-[17px] w-[17px] text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-6 space-y-4">
          {/* Product summary — image + name + live price */}
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted/40 border border-border shrink-0">
              {image ? (
                <Image src={image} alt={product.name} fill sizes="64px" className="object-contain p-1" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground/50" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{product.name}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold" style={{ color }}>{pretAfisat}</span>
                {hasDiscount && (
                  <span className="text-sm text-muted-foreground line-through">{formatPrice(displayCompare!)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Option selectors */}
          <VariantPicker
            variants={variants}
            selected={selected}
            onSelect={(name, value) => setSelected((prev) => ({ ...prev, [name]: value }))}
            color={color}
            assumeAvailable={combosLoading}
          />

          {titleFormedButUnavailable && (
            <p className="text-sm text-red-500 font-medium">Aceasta combinatie nu este disponibila.</p>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="w-full py-3.5 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{ backgroundColor: color, boxShadow: `0 2px 12px ${color}55` }}
          >
            <ShoppingCart className="h-4 w-4" />
            {combosLoading && title ? "Se incarca..." : canAdd ? "Adauga in cos" : "Selecteaza optiunile"}
          </button>
        </div>
      </div>
    </>
  );
}
