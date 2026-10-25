"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { discardDesignDraft, publishDesign, saveDesignDraft } from "@/lib/actions/store-design.actions";
import { anuleaza, istoricGol, noteaza, reface, type Istoric } from "@/lib/editor-magazin/istoric";
import { rederiva } from "@/lib/editor-magazin/derivare";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Ciorna de design a editorului unic: ce sectiuni apar, in ce ordine, cu ce
 * varianta si ce setari.
 *
 * Mutata din editorul de design (`StoreDesignEditor`, scos in etapa 2), cu tot
 * ce se invatase acolo: salvarea amanata, baza pentru garda de concurenta,
 * „epoca” pentru Publica si Renunta. Plus doua lucruri noi: istoricul pentru
 * Anuleaza / Refa si re-derivarea dupa o salvare de continut.
 */

type Stare = { design: StoreDesign; istoric: Istoric<StoreDesign> };

type Actiune =
  | { tip: "aplica"; urmatorul: StoreDesign | ((d: StoreDesign) => StoreDesign); cheie?: string | null; acum: number }
  | { tip: "anuleaza" }
  | { tip: "reface" }
  | { tip: "inlocuieste"; design: StoreDesign }
  | { tip: "rederiva"; ctx: DesignContext };

function reductor(stare: Stare, a: Actiune): Stare {
  switch (a.tip) {
    case "aplica": {
      const urmatorul = typeof a.urmatorul === "function" ? a.urmatorul(stare.design) : a.urmatorul;
      // Operatiile intorc ACELASI obiect cand n-au ce face (`edit.ts`): nu e un pas.
      if (urmatorul === stare.design) return stare;
      return { design: urmatorul, istoric: noteaza(stare.istoric, stare.design, { cheie: a.cheie ?? null, acum: a.acum }) };
    }
    case "anuleaza": {
      const pas = anuleaza(stare.istoric, stare.design);
      return pas ? { design: pas.stare, istoric: pas.istoric } : stare;
    }
    case "reface": {
      const pas = reface(stare.istoric, stare.design);
      return pas ? { design: pas.stare, istoric: pas.istoric } : stare;
    }
    case "inlocuieste":
      return { design: a.design, istoric: istoricGol() };
    case "rederiva":
      // Si istoricul: un pas inapoi nu are voie sa readuca derivarea veche.
      return {
        design: rederiva(stare.design, a.ctx),
        istoric: {
          ...stare.istoric,
          trecut: stare.istoric.trecut.map((d) => rederiva(d, a.ctx)),
          viitor: stare.istoric.viitor.map((d) => rederiva(d, a.ctx)),
        },
      };
  }
}

const amprenta = (d: StoreDesign) => JSON.stringify(d);

export function useCiornaDesign({
  businessId,
  designInitial,
  publicatInitial,
  cioarnaInitiala,
}: {
  businessId: string;
  /** Ciorna daca exista, altfel designul publicat: de unde reia comerciantul. */
  designInitial: StoreDesign;
  /** Ce vad clientii acum. */
  publicatInitial: StoreDesign;
  /** Ce scrie ACUM in coloana de ciorna: `null` cand coloana e goala. */
  cioarnaInitiala: StoreDesign | null;
}) {
  const [{ design, istoric }, despacha] = useReducer(reductor, { design: designInitial, istoric: istoricGol<StoreDesign>() });
  const [publicat, setPublicat] = useState<StoreDesign>(publicatInitial);
  const [salvez, setSalvez] = useState(false);
  const [publicaInCurs, setPublicaInCurs] = useState(false);

  /** Designul de pe ecran, citibil dupa un `await`. */
  const designAcum = useRef(design);
  useEffect(() => { designAcum.current = design; }, [design]);

  /**
   * Amprenta ultimului design pe care nu mai are rost sa-l salvam.
   *
   * Pe continut, nu pe identitate: re-derivarea produce un obiect nou chiar cand
   * ciorna era deja salvata, iar o scriere doar pentru asta ar crea o ciorna acolo
   * unde n-a existat niciuna.
   */
  const salvatAmprenta = useRef(amprenta(designInitial));
  /**
   * Ce scrie ACUM in coloana de ciorna; `null` cand e goala.
   *
   * ⚠ Separat de amprenta de mai sus. La prima intrare ecranul arata designul
   * PUBLICAT, nu o ciorna, iar garda de concurenta compara cu COLOANA: trimis
   * designul de pe ecran ca „baza”, prima salvare ar fi cazut la nesfarsit cu
   * „modificat in alta fila”. Coloana redevine `NULL` dupa fiecare Publica si
   * Renunta. Vezi `draft-guard.ts`.
   */
  const cioarnaInBaza = useRef<StoreDesign | null>(cioarnaInitiala);
  /**
   * Fiecare Publica sau Renunta incepe o „epoca” noua: o salvare pornita inainte
   * de ele si ajunsa in baza DUPA ar fi reinviat ciorna tocmai golita.
   */
  const epoca = useRef(0);

  /** Comparatie pe continut: fiecare editare produce un obiect nou. */
  const areModificari = useMemo(() => amprenta(design) !== amprenta(publicat), [design, publicat]);

  /*
   * Salvarea ciornei, amanata: tragerea unei sectiuni produce zeci de schimbari
   * pe secunda. Efectul depinde DOAR de `design`; indicatorul pe care il scrie
   * sta in afara dependentelor, altfel s-ar re-declansa singur.
   */
  useEffect(() => {
    if (amprenta(design) === salvatAmprenta.current) return;
    const gen = epoca.current;
    const baza = cioarnaInBaza.current;
    const id = setTimeout(async () => {
      if (gen !== epoca.current) return;
      setSalvez(true);
      let res: Awaited<ReturnType<typeof saveDesignDraft>>;
      try {
        res = await saveDesignDraft(businessId, design, baza);
      } catch {
        setSalvez(false);
        toast.error("Nu am putut salva ciorna. Verifică legătura la internet; încercăm din nou la următoarea modificare.");
        return;
      }
      setSalvez(false);
      if (gen !== epoca.current) return;
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      salvatAmprenta.current = amprenta(design);
      cioarnaInBaza.current = design;
    }, 1200);
    return () => clearTimeout(id);
  }, [design, businessId]);

  // Iesirea cu modificari nepublicate merita un avertisment.
  useEffect(() => {
    if (!areModificari) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [areModificari]);

  /**
   * Aplica o modificare de design. `cheie` spune ce s-a modificat, ca tastarea
   * intr-un camp sa fie un singur pas la Anuleaza (vezi `istoric.ts`).
   */
  const aplica = useCallback(
    (urmatorul: StoreDesign | ((d: StoreDesign) => StoreDesign), cheie?: string) =>
      despacha({ tip: "aplica", urmatorul, cheie, acum: Date.now() }),
    [],
  );
  const anuleazaPas = useCallback(() => despacha({ tip: "anuleaza" }), []);
  const refaPas = useCallback(() => despacha({ tip: "reface" }), []);

  /**
   * Re-deriva ciorna, istoricul si designul publicat dupa o salvare de continut.
   *
   * Se cheama dupa un `await`, deci citeste designul din ref, nu dintr-o
   * inchidere facuta inainte de salvare.
   */
  const rederivaDupaContinut = useCallback((ctx: DesignContext) => {
    /*
     * Ciorna din ecran era deja salvata? Atunci si forma ei re-derivata se
     * socoteste salvata: amprenta noua se pune AICI, calculata pe loc, nu printr-un
     * semn citit de efect. Un semn ar fi acoperit si o modificare facuta de om in
     * aceeasi clipa, care n-ar mai fi plecat niciodata in baza.
     */
    const actual = designAcum.current;
    if (amprenta(actual) === salvatAmprenta.current) salvatAmprenta.current = amprenta(rederiva(actual, ctx));
    despacha({ tip: "rederiva", ctx });
    setPublicat((p) => rederiva(p, ctx));
  }, []);

  const publica = useCallback(async () => {
    epoca.current += 1;
    const dePublicat = designAcum.current;
    setPublicaInCurs(true);
    let res: Awaited<ReturnType<typeof publishDesign>>;
    try {
      res = await publishDesign(businessId, dePublicat);
    } catch {
      setPublicaInCurs(false);
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă s-a publicat. Reîncarcă pagina înainte să încerci din nou.");
      return;
    }
    setPublicaInCurs(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setPublicat(dePublicat);
    salvatAmprenta.current = amprenta(dePublicat);
    // Publicarea goleste coloana de ciorna; urmatoarea salvare porneste de la `null`.
    cioarnaInBaza.current = null;
    toast.success("Modificările sunt acum în magazin.");
  }, [businessId]);

  const renunta = useCallback(async () => {
    epoca.current += 1;
    let res: Awaited<ReturnType<typeof discardDesignDraft>>;
    try {
      res = await discardDesignDraft(businessId);
    } catch {
      toast.error("Nu am primit răspuns de la server. Reîncarcă pagina ca să vezi ce a rămas.");
      return;
    }
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    despacha({ tip: "inlocuieste", design: publicat });
    salvatAmprenta.current = amprenta(publicat);
    cioarnaInBaza.current = null;
    toast.success("Ai renunțat la modificările nepublicate.");
  }, [businessId, publicat]);

  return {
    design,
    publicat,
    areModificari,
    salvez,
    publicaInCurs,
    aplica,
    poateAnula: istoric.trecut.length > 0,
    poateReface: istoric.viitor.length > 0,
    anuleaza: anuleazaPas,
    reface: refaPas,
    rederivaDupaContinut,
    publica,
    renunta,
  };
}

export type CiornaDesign = ReturnType<typeof useCiornaDesign>;
