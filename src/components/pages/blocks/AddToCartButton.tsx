"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";
import { parseVariants } from "@/lib/storefront/variants";
import { VariantQuickAdd, type QuickAddLine } from "@/components/ministore/VariantQuickAdd";

interface CartItem {
  productId: string;
  slug?: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  variantTitle?: string;
  variantSku?: string;
}

/** Same line identity the storefront cart uses: product + chosen variant. */
function lineKey(i: { productId: string; variantTitle?: string }): string {
  return i.variantTitle ? `${i.productId}::${i.variantTitle}` : i.productId;
}

/**
 * Adds a product to the store cart from a custom page. Writes to the same
 * localStorage key (`cart_${slug}`) the storefront reads, so the item appears in
 * the cart when the visitor opens the shop. No CartProvider needed here.
 *
 * Variable products open the option picker first, so the exact variant (title +
 * price) is what gets stored — never a base-price line without a chosen option.
 */
export function AddToCartButton({ product, storeSlug, color }: {
  product: {
    id: string;
    name: string;
    slug?: string | null;
    price: number;
    compareAtPrice?: number | null;
    image: string | null;
    images?: string[];
    pageSections?: unknown;
  };
  storeSlug: string;
  color: string;
}) {
  const [added, setAdded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const variants = parseVariants(product.pageSections);

  function writeLine(line: Omit<CartItem, "quantity">) {
    try {
      const key = `cart_${storeSlug}`;
      const items = JSON.parse(localStorage.getItem(key) || "[]") as CartItem[];
      const lk = lineKey(line);
      const existing = items.find((i) => lineKey(i) === lk);
      if (existing) existing.quantity += 1;
      else items.push({ ...line, quantity: 1 });
      localStorage.setItem(key, JSON.stringify(items));
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } catch {}
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (variants) { setPickerOpen(true); return; }
    writeLine({ productId: product.id, slug: product.slug ?? undefined, name: product.name, price: product.price, imageUrl: product.image });
  }

  return (
    <>
      <button type="button" onClick={handleClick}
        className="w-full mt-2 py-2 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
        style={{ backgroundColor: added ? "#16a34a" : color }}>
        {added
          ? <><Check className="h-3.5 w-3.5" strokeWidth={3} /> Adaugat</>
          : <><ShoppingCart className="h-3.5 w-3.5" /> {variants ? "Alege optiunile" : "In cos"}</>}
      </button>
      {variants && (
        <VariantQuickAdd
          open={pickerOpen}
          product={{
            id: product.id,
            name: product.name,
            slug: product.slug ?? null,
            price: product.price,
            compare_at_price: product.compareAtPrice ?? null,
            images: product.images ?? (product.image ? [product.image] : []),
            page_sections: product.pageSections,
          }}
          color={color}
          onClose={() => setPickerOpen(false)}
          onAdd={(line: QuickAddLine) => writeLine(line)}
        />
      )}
    </>
  );
}
