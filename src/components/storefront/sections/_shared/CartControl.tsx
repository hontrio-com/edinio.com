"use client";

import type { CSSProperties, ReactNode } from "react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { radacinaMagazin } from "@/lib/storefront/category-href";

/**
 * Ce face butonul de cos dintr-un header, decis o singura data.
 *
 * Cele opt variante de header arata diferit, dar raspund la aceeasi intrebare:
 * cosul se deschide ca sertar, duce la o pagina de cos, duce inapoi la magazin
 * sau nu exista deloc. Pana acum fiecare header avea propria ramificatie, iar la
 * adaugarea modului „pagina" era garantat ca una dintre cele opt copii ramane in
 * urma si trimite clientul in alta parte decat celelalte sapte.
 *
 * Aspectul ramane al fiecarei variante: de aici vine doar tinta si eticheta.
 */

export type TintaCos =
  | { fel: "ascuns" }
  | { fel: "buton"; onClick: () => void; eticheta: string; textFaraProduse: string }
  | { fel: "link"; href: string; eticheta: string; textFaraProduse: string };

export function useCartTarget(): TintaCos {
  const { cartMode, cartHref, basePath, catalogRoot, openCart } = useStoreChrome();

  if (cartMode === "hidden") return { fel: "ascuns" };
  if (cartMode === "drawer") {
    return { fel: "buton", onClick: openCart, eticheta: "Deschide cosul de cumparaturi", textFaraProduse: "Cos" };
  }
  if (cartMode === "page") {
    // `cartHref` vine din configuratia de design; daca lipseste, cade pe
    // segmentul standard, ca butonul sa nu ramana fara tinta.
    return { fel: "link", href: cartHref ?? `${basePath}/cos`, eticheta: "Mergi la cos", textFaraProduse: "Cos" };
  }
  /*
   * „link": ultimul refugiu, cand sertarul nu se poate monta pe pagina asta.
   *
   * De cand `StoreCartPanels` monteaza sertarul si pe paginile fara catalog,
   * cazul ramane doar acolo unde lipsesc datele lui — transportul si pragurile —
   * adica in miniaturile din editor. Butonul duce la catalog CU SERTARUL DESCHIS
   * (`?cos=1`), nu pur si simplu „la magazin": clientul care a adaugat un produs
   * si apasa pe cos trebuie sa vada ce a adaugat, nu prima pagina.
   *
   * Tinta e `catalogRoot`, nu radacina magazinului: sertarul se monteaza langa
   * catalog, iar `?cos=1` e citit de pagina care il gazduieste.
   */
  return {
    fel: "link",
    href: `${radacinaMagazin(catalogRoot)}?cos=1`,
    eticheta: "Mergi la cos",
    textFaraProduse: "Cos",
  };
}

/**
 * Invelisul butonului de cos: buton sau legatura, dupa mod, cu acelasi aspect.
 * Randeaza `null` cand magazinul n-are cos (modul „un singur produs").
 */
export function CartControl({
  className,
  style,
  children,
}: {
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const tinta = useCartTarget();
  if (tinta.fel === "ascuns") return null;

  return tinta.fel === "buton" ? (
    <button type="button" aria-label={tinta.eticheta} onClick={tinta.onClick} className={className} style={style}>
      {children}
    </button>
  ) : (
    <a href={tinta.href} aria-label={tinta.eticheta} className={className} style={style}>
      {children}
    </a>
  );
}
