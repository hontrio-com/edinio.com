"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CONT_STINS, type ContulMagazinului } from "@/lib/cont/config";

/**
 * Ce stie vitrina despre conturile magazinului, pe cererea curenta: butonul din
 * antet si daca o comanda cere cont.
 *
 * ⚠ Se calculeaza O SINGURA DATA, in layoutul magazinului, din randul pe care il
 * citeste deja (`incarcaAntetMagazin`) si din gazda cererii. Nu se citeste niciun
 * cookie si nu se face nicio cerere noua: anonimul nu plateste nimic, iar
 * butonul e o legatura statica spre `/cont`, care trimite singur la intrare.
 * ⚠ In afara providerului (previzualizarea din editor, mini-vitrinele) valoarea
 * e „stins": acolo contul oricum nu exista.
 */
const Context = createContext<ContulMagazinului>(CONT_STINS);

export function ContulMagazinuluiProvider({ valoare, children }: { valoare: ContulMagazinului; children: ReactNode }) {
  return <Context.Provider value={valoare}>{children}</Context.Provider>;
}

export function useContulMagazinului(): ContulMagazinului {
  return useContext(Context);
}
