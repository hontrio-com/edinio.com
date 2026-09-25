"use client";

import { createContext, useContext, type ReactNode } from "react";
import { PERMALINKURI_IMPLICITE, type Permalinkuri } from "@/lib/storefront/permalinkuri";

/**
 * Prefixele alese de magazin (Setari > Permalink-uri), pentru componentele de
 * client care leaga produse, catalogul sau branduri.
 *
 * ⚠ Se calculeaza in layoutul magazinului din randul pe care il citeste deja
 * (`incarcaAntetMagazin`): nicio cerere in plus.
 * ⚠ In afara providerului (previzualizarea din editor, mini-vitrinele din panou)
 * valoarea e cea IMPLICITA, deci adresele sunt exact cele de dinainte.
 */
const Context = createContext<Permalinkuri>(PERMALINKURI_IMPLICITE);

export function PermalinkuriProvider({ valoare, children }: { valoare: Permalinkuri; children: ReactNode }) {
  return <Context.Provider value={valoare}>{children}</Context.Provider>;
}

export function usePermalinkuri(): Permalinkuri {
  return useContext(Context);
}
