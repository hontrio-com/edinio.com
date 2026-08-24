"use client";

import { useState } from "react";
import { hrefCatalog } from "@/lib/storefront/category-href";
import { cuSemnePastrate } from "@/lib/storefront/preview-sticky";
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
    optiuni?.laAplicare?.();

    /*
     * ═══ ⚠ ENTER DUCE MEREU LA PAGINA CU REZULTATE. IN TOATE DESIGN-URILE. ═══
     *
     * Forma dinainte avea doua purtari. Pe o pagina care filtra pe loc chema
     * `catalog.trimiteCautarea()` si se oprea acolo — iar aceea face
     * `if (!peServer) return;`, adica pe palierul CLIENT nu face absolut nimic.
     *
     * Deci vizitatorul scria „bocanci", vedea panoul cu produse gasite, apasa Enter,
     * panoul se inchidea si mai departe nimic: grila era deja filtrata de la tastare,
     * asa ca pe ecran nu se schimba NIMIC. Exact ce a raportat eSAFE.
     *
     * Iar chiar acolo unde filtrarea pe loc chiar lucra, adresa ramanea neschimbata:
     * cautarea nu se putea trimite cuiva, nu se putea pune la favorite, nu se putea
     * intoarce cu butonul „inapoi", si nu ajungea in nicio statistica.
     *
     * Acum e un singur drum: se scrie in adresa si pagina se randeaza cu `?q=`. Merge
     * la fel pe amandoua palierele — `initialSearch` vine din `?q=` si seamana si
     * `search`, si `cautareAplicata` — si la fel in toate cele sapte headere, fiindca
     * toate trec pe aici.
     *
     * ⚠ Filtrarea in timpul tastarii RAMANE. Enter n-o inlocuieste, doar o aseaza in
     * adresa.
     */
    const p = new URLSearchParams();
    if (valoare.trim()) p.set("q", valoare.trim());
    if (optiuni?.categorie && optiuni.categorie !== "toate") p.set("cat", optiuni.categorie);

    /*
     * ⚠ `cuSemnePastrate`, nu `window.location.href` gol.
     *
     * In iframe-ul editorului de design, adresa trebuie sa poarte mai departe
     * `preview=1`: fara el, `proxy.ts` redirecteaza catre `www` sau catre domeniul
     * propriu, amandoua cross-origin, iar `X-Frame-Options` refuza incadrarea —
     * comerciantul cauta ceva si ramane cu un dreptunghi gol.
     *
     * Pana acum ramura asta se atingea rar (doar pe paginile fara grila), deci defectul
     * trecea neobservat. Devenita singurul drum, ar fi lovit de fiecare data.
     *
     * In afara previzualizarii, functia intoarce adresa neatinsa.
     */
    window.location.href = cuSemnePastrate(
      hrefCatalog(catalogRoot, p.toString()),
      window.location.search,
    );
  }

  const propsForm = { role: "search", onSubmit: trimite } as const;

  /**
   * Se pun pe elementul care contine SI campul, SI panoul.
   *
   * Nu pe camp: trecerea la butonul de cautare sau la selectorul de categorie
   * l-ar fi inchis sub degetul vizitatorului. Si nu pe un element care lasa
   * panoul afara: apasarea unui rezultat muta focusul pe legatura, deci panoul
   * s-ar fi inchis intre apasare si ridicarea degetului, iar clicul ar fi cazut
   * in gol. De aceea sunt separate de `propsForm` — la headerele unde panoul sta
   * inauntrul formularului merg amandoua pe el, iar unde nu, pe invelis.
   */
  const propsZona = {
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
    propsZona,
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
