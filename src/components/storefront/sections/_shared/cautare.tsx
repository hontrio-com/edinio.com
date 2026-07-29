"use client";

import { useState } from "react";
import { hrefCatalog } from "@/lib/storefront/category-href";
import { useCatalogCautabil, useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { RezultateCautare } from "./RezultateCautare";

/**
 * Cautarea din header, la fel in toate variantele.
 *
 * Fiecare dintre cele sapte headere isi scria singur caseta de cautare: aceeasi
 * stare locala, aceeasi legare de catalog, aceeasi compunere de adresa la Enter.
 * Sapte copii inseamna sapte comportamente care se despart la prima schimbare, si
 * chiar asa s-a intamplat: panoul cu produse gasite a ajuns intr-una singura, iar
 * la celelalte cautarea ramanea o caseta care nu raspunde pana la Enter.
 *
 * Ce ramane al fiecarui header e doar felul in care arata caseta. Ce face —
 * scrie, cauta, arata rezultatele, le inchide — vine de aici.
 */
export function useCautareHeader(optiuni?: {
  /** Categoria aleasa, la barele care au selector. Intra in adresa la Enter. */
  categorie?: string;
  /**
   * Se cheama dupa ce cautarea s-a aplicat pe loc, fara navigare.
   *
   * Panourile care se deschid peste header (lupa) se inchid atunci: filtrarea s-a
   * intamplat deja la fiecare tasta, iar panoul ar sta degeaba peste rezultate.
   */
  laAplicare?: () => void;
}) {
  const { catalogRoot, basePath } = useStoreChrome();
  const catalog = useCatalogCautabil();
  const [local, setLocal] = useState("");
  const [deschise, setDeschise] = useState(false);

  // Pe pagina cu catalog, campul e chiar starea catalogului: ce scrii aici
  // filtreaza grila de dedesubt. In rest e o stare locala care ajunge in adresa.
  const valoare = catalog ? catalog.search : local;

  function scrie(v: string) {
    setDeschise(v.trim().length > 0);
    if (!catalog) {
      setLocal(v);
      return;
    }
    // O cautare noua porneste inapoi pe ordonarea dupa relevanta.
    if (catalog.search === "" && v !== "") catalog.setSortTouched(false);
    catalog.setSearch(v);
  }

  function trimite(e: React.FormEvent) {
    e.preventDefault();
    setDeschise(false);
    if (catalog) {
      optiuni?.laAplicare?.();
      return;
    }
    const p = new URLSearchParams();
    if (valoare.trim()) p.set("q", valoare.trim());
    if (optiuni?.categorie && optiuni.categorie !== "toate") p.set("cat", optiuni.categorie);
    window.location.href = hrefCatalog(catalogRoot, p.toString());
  }

  /**
   * Se pun pe FORMULAR, nu pe camp: panoul se inchide cand focusul paraseste
   * bara intreaga. Pe camp, trecerea la butonul de cautare sau la selectorul de
   * categorie l-ar fi inchis sub degetul vizitatorului.
   */
  const propsForm = {
    role: "search",
    onSubmit: trimite,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") setDeschise(false);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDeschise(false);
    },
  } as const;

  return {
    valoare,
    scrie,
    trimite,
    propsForm,
    /**
     * Panoul cu produse gasite. Se randeaza INTR-UN element pozitionat — de obicei
     * chiar formularul — fiindca se aseaza absolut sub el.
     */
    rezultate: deschise
      ? <RezultateCautare text={valoare} basePath={basePath} onAlege={() => setDeschise(false)} />
      : null,
    /** Aceleasi rezultate, dar in flux: pentru panourile care au loc dedesubt. */
    rezultateInFlux: deschise
      ? <RezultateCautare inFlux text={valoare} basePath={basePath} onAlege={() => setDeschise(false)} />
      : null,
  };
}
