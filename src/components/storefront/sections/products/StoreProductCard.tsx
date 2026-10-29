"use client";

import { ProductCard } from "@/components/storefront/product/ProductCard";
import { ProductCardJupiter } from "@/components/storefront/product/ProductCardJupiter";
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
  varianta,
}: {
  product: StorefrontProduct;
  priority?: boolean;
  /** Varianta ceruta anume: miniatura cardului din galeria „Schimbă designul” (etapa 16.6). Lipsa = cea din design. */
  varianta?: string;
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
    design,
  } = useStorefront();
  // Varianta cardului, din design (etapa 16.3): toate suprafetele magazinului trec pe aici.
  const Card = (varianta ?? design?.commerce.productCard.variant) === "jupiter" ? ProductCardJupiter : ProductCard;

  return (
    <Card
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
