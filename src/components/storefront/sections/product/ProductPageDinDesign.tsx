"use client";

import type { ComponentProps } from "react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { MarcajSectiune } from "@/components/storefront/SectionRenderer";
import { paginaSablonului, sablonulProdusului } from "@/lib/storefront/design/sabloane-produs";
import type { SectionInstance } from "@/lib/storefront/design/types";
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
 *
 * Din etapa 4b tot aici se alege si SABLONUL produsului (`sabloane-produs.ts`): din designul viu,
 * ca o atribuire facuta in editor sa schimbe previzualizarea fara reincarcare. Tot de aceea
 * marcajul sectiunii sta aici, cu id-ul sablonului ales, nu in ruta: acolo ar fi ramas id-ul de
 * la prima randare.
 */
export function ProductPageDinDesign(
  props: Omit<ComponentProps<typeof ProductPageSection>, "variant" | "setari" | "blocuri" | "idPagina">
    & {
      /** Pagina aleasa pe server, pentru cand contextul n-are design. */
      paginaImplicita: SectionInstance;
      /** Categoria produsului si parintii ei (`lantulCategoriei`); goala cand nu trebuie. */
      categoriiProdusului?: readonly string[];
      /** Sablonul impus din editor (`sablon=` in adresa), doar in modul editor. */
      sablonImpus?: string | null;
      /** Magazinul cu un singur produs: pagina lui e pagina principala, deci mereu Implicit. */
      doarImplicit?: boolean;
    },
) {
  const { paginaImplicita, categoriiProdusului = [], sablonImpus = null, doarImplicit = false, ...restul } = props;
  const { design } = useStoreChrome();
  const pagina = !design
    ? paginaImplicita
    : doarImplicit
      ? design.product.page
      : sablonImpus
        ? paginaSablonului(design.product, sablonImpus)
        : sablonulProdusului(design.product, restul.product.id, categoriiProdusului);

  return (
    <MarcajSectiune sectiune={pagina}>
      <ProductPageSection
        variant={pagina.variant}
        setari={pagina.settings}
        // Ordinea si vizibilitatea bucatilor (etapa 4). Lipsa, varianta isi
        // completeaza singura lista implicita.
        blocuri={pagina.blocks}
        idPagina={pagina.id}
        {...restul}
      />
    </MarcajSectiune>
  );
}
