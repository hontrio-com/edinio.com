"use client";

import type { ComponentProps } from "react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { ProductPageSection } from "./ProductPageSection";

/**
 * Pagina de produs, cu varianta si reglajele luate din designul VIU.
 *
 * ⚠ Exista pentru previzualizarea din editorul de design. Varianta se citea din
 * designul rezolvat pe server, deci in iframe se schimba doar la o reincarcare
 * completa — iar pentru magazinele „un singur produs" pagina asta ESTE pagina
 * principala, adica exact ce se vede in editor. Alegeai alt design de pagina de
 * produs si nu se schimba nimic.
 *
 * `StorePageShell` pune in context designul dupa ce a trecut prin
 * `useDesignPreview`, deci aici ajunge deja cel trimis live de editor. In afara
 * previzualizarii e chiar designul salvat, si nu se schimba nimic fata de
 * inainte.
 */
export function ProductPageDinDesign(
  props: Omit<ComponentProps<typeof ProductPageSection>, "variant" | "setari">
    & { variantImplicita: string; setariImplicite: Record<string, unknown> },
) {
  const { variantImplicita, setariImplicite, ...restul } = props;
  const { design } = useStoreChrome();
  const pagina = design?.product.page;

  return (
    <ProductPageSection
      variant={pagina?.variant ?? variantImplicita}
      setari={pagina?.settings ?? setariImplicite}
      {...restul}
    />
  );
}
