"use client";

import type { CSSProperties, ReactNode } from "react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

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
  const { cartMode, cartHref, basePath, openCart } = useStoreChrome();

  if (cartMode === "hidden") return { fel: "ascuns" };
  if (cartMode === "drawer") {
    return { fel: "buton", onClick: openCart, eticheta: "Deschide cosul de cumparaturi", textFaraProduse: "Cos" };
  }
  if (cartMode === "page") {
    // `cartHref` vine din configuratia de design; daca lipseste, cade pe
    // segmentul standard, ca butonul sa nu ramana fara tinta.
    return { fel: "link", href: cartHref ?? `${basePath}/cos`, eticheta: "Mergi la cos", textFaraProduse: "Cos" };
  }
  // „link": pe paginile fara catalog ale magazinelor ramase pe sertar, cosul nu
  // are unde sa se deschida, deci butonul duce inapoi la magazin.
  return { fel: "link", href: `${basePath}/`, eticheta: "Mergi la magazin", textFaraProduse: "Magazin" };
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
