"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";
import { parseVariants } from "@/lib/storefront/variants";
import { VariantQuickAdd, type QuickAddLine } from "@/components/ministore/VariantQuickAdd";
import { useCartOptional } from "@/components/storefront/cart/CartProvider";
import { lineKey, normalizeazaCos, type CartItem } from "@/lib/storefront/cart/normalize";
import type { PriceRange } from "@/lib/utils/product-price";
import { normalizeazaCantitate } from "@/lib/orders/quantity";

/**
 * Butonul de adaugare in cos de pe blocurile de produse ale paginilor proprii.
 *
 * Trece prin `CartProvider` cand exista unul — de cand paginile proprii au si ele
 * antetul magazinului, exista mereu. Conteaza: scrisa direct in localStorage,
 * adaugarea nu ajungea la insigna din header decat dupa o reincarcare, fiindca
 * evenimentul `storage` nu se declanseaza in fila care scrie. Clientul apasa,
 * cosul din colt ramanea gol, si parea ca nu s-a intamplat nimic.
 *
 * Scrierea directa ramane ca refugiu, pentru randarile fara provider (miniaturi,
 * previzualizari): acolo cosul nu se vede oricum, dar linia nu se pierde.
 *
 * Produsele cu variante deschid intai selectorul de optiuni, ca in cos sa intre
 * varianta aleasa — niciodata o linie la pretul de baza, fara optiune.
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
    /** Intervalul vandabil, de la server: sertarul il arata pana la prima bifa. */
    priceRange: PriceRange;
  };
  storeSlug: string;
  color: string;
}) {
  const [added, setAdded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const variants = parseVariants(product.pageSections);
  const cos = useCartOptional();

  function writeLine(line: Omit<CartItem, "quantity">) {
    try {
      if (cos) {
        cos.addItem(line);
      } else {
        // Al doilea scriitor al aceleiasi chei, pe pagini fara `CartProvider`:
        // trece prin ACEEASI curatare, altfel „o singura granita" ar fi o vorba.
        const key = `cart_${storeSlug}`;
        const items = normalizeazaCos(JSON.parse(localStorage.getItem(key) || "[]"));
        const lk = lineKey(line);
        const existing = items.find((i) => lineKey(i) === lk);
        if (existing) existing.quantity = normalizeazaCantitate(existing.quantity + 1);
        else items.push({ ...line, quantity: 1 });
        localStorage.setItem(key, JSON.stringify(items));
      }
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
        {/*
          „Adauga in cos", ca peste tot in magazin. Scria „In cos", care in
          romana se citeste si ca stare — „produsul e in cos" — asa ca doua
          carduri cu butonul asta pareau doua produse deja adaugate, cu cosul gol
          in coltul din dreapta. Chiar si comutatorul din editor promitea
          „Adauga in cos".
        */}
        {added
          ? <><Check className="h-3.5 w-3.5" strokeWidth={3} /> Adaugat in cos</>
          : <><ShoppingCart className="h-3.5 w-3.5" /> {variants ? "Alege optiunile" : "Adauga in cos"}</>}
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
            price_range: product.priceRange,
          }}
          color={color}
          onClose={() => setPickerOpen(false)}
          onAdd={(line: QuickAddLine) => writeLine(line)}
        />
      )}
    </>
  );
}
