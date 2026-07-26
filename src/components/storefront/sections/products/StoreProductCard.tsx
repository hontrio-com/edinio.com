"use client";

import { ProductCard } from "@/components/storefront/product/ProductCard";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Cardul de produs legat de contextul magazinului.
 *
 * `ProductCard` ramane pur, cu props: il folosesc si suprafete care nu au
 * contextul (paginile custom, dupa unificare). Wrapper-ul asta exista pentru ca
 * pagina de magazin il randa in trei locuri cu exact aceleasi noua props, iar
 * fiecare varianta noua de rand ar fi repetat aceeasi lista.
 */
export function StoreProductCard({
  product,
  priority = false,
}: {
  product: StorefrontProduct;
  priority?: boolean;
}) {
  const {
    color,
    basePath,
    addToCart,
    addedId,
    newBadgeDays,
    isProductOutOfStock,
    showCategoryBadges,
    priceLowestOnly,
  } = useStorefront();

  return (
    <ProductCard
      product={product}
      color={color}
      basePath={basePath}
      onAddToCart={() => addToCart(product)}
      isAdded={addedId === product.id}
      newBadgeDays={newBadgeDays}
      outOfStock={isProductOutOfStock(product)}
      showCategoryBadge={showCategoryBadges}
      priceLowestOnly={priceLowestOnly}
      priority={priority}
    />
  );
}
