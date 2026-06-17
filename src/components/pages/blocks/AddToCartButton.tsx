"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";

interface CartItem { productId: string; name: string; price: number; imageUrl: string | null; quantity: number }

/**
 * Adds a product to the store cart from a custom page. Writes to the same
 * localStorage key (`cart_${slug}`) the storefront reads, so the item appears in
 * the cart when the visitor opens the shop. No CartProvider needed here.
 */
export function AddToCartButton({ product, storeSlug, color }: {
  product: { id: string; name: string; price: number; image: string | null };
  storeSlug: string;
  color: string;
}) {
  const [added, setAdded] = useState(false);

  function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const key = `cart_${storeSlug}`;
      const items = JSON.parse(localStorage.getItem(key) || "[]") as CartItem[];
      const existing = items.find((i) => i.productId === product.id);
      if (existing) existing.quantity += 1;
      else items.push({ productId: product.id, name: product.name, price: product.price, imageUrl: product.image, quantity: 1 });
      localStorage.setItem(key, JSON.stringify(items));
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } catch {}
  }

  return (
    <button type="button" onClick={add}
      className="w-full mt-2 py-2 text-xs font-bold text-white rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
      style={{ backgroundColor: added ? "#16a34a" : color }}>
      {added ? <><Check className="h-3.5 w-3.5" strokeWidth={3} /> Adaugat</> : <><ShoppingCart className="h-3.5 w-3.5" /> In cos</>}
    </button>
  );
}
