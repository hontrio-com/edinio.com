"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCartSessionId } from "@/lib/cart-session";

/**
 * Cosul storefrontului: stare in memorie oglindita in localStorage, per magazin.
 *
 * Extras din `MiniStoreRenderer` fara nicio schimbare de comportament, ca
 * sectiunile si variantele de design sa poata consuma cosul fara sa importe
 * fisierul de 2900 de linii.
 */

export interface CartItem {
  productId: string;
  slug?: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  /** Combinatia de varianta aleasa („S / Rosu") — lipseste la produsele simple. */
  variantTitle?: string;
  variantSku?: string;
}

/**
 * O linie de cos e identificata prin produs + varianta aleasa, ca doua variante
 * ale aceluiasi produs (marimea S si marimea L) sa fie linii distincte, nu una
 * singura. Produsele simple cad pe id-ul produsului, ceea ce pastreaza
 * compatibilitatea cu cosurile salvate in localStorage inainte de variante.
 */
export function lineKey(item: Pick<CartItem, "productId" | "variantTitle">): string {
  return item.variantTitle ? `${item.productId}::${item.variantTitle}` : item.productId;
}

export interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  total: number;
  count: number;
  clear: () => void;
  restoreCart: (items: CartItem[]) => void;
  sessionId: string;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}

export function CartProvider({ children, slug }: { children: ReactNode; slug: string }) {
  const STORAGE_KEY = `cart_${slug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [sessionId, setSessionId] = useState("");

  // Cosul se citeste din localStorage DUPA montare, nu la initializarea starii:
  // pe server nu exista localStorage, iar o stare initiala diferita intre server
  // si client ar produce eroare de hidratare. Regula de lint care interzice
  // setState in efect nu are cum sa acopere cazul asta.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setItems(JSON.parse(stored));
    } catch {}
    setSessionId(getCartSessionId(slug));
  }, [STORAGE_KEY, slug]);

  function save(next: CartItem[]) {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function addItem(item: Omit<CartItem, "quantity">) {
    setItems((prev) => {
      const key = lineKey(item);
      const exists = prev.find((i) => lineKey(i) === key);
      const next = exists
        ? prev.map((i) => (lineKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i))
        : [...prev, { ...item, quantity: 1 }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeItem(key: string) {
    save(items.filter((i) => lineKey(i) !== key));
  }

  function updateQty(key: string, qty: number) {
    if (qty <= 0) {
      removeItem(key);
      return;
    }
    save(items.map((i) => (lineKey(i) === key ? { ...i, quantity: qty } : i)));
  }

  function clear() {
    save([]);
  }

  function restoreCart(next: CartItem[]) {
    save(next);
  }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQty, total, count, clear, restoreCart, sessionId }}
    >
      {children}
    </CartContext.Provider>
  );
}
