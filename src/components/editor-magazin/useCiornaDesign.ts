"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { discardDesignDraft, publishDesign, saveDesignDraft } from "@/lib/actions/store-design.actions";
import { creeazaCoadaSalvarii, type CoadaSalvarii } from "@/lib/editor-magazin/coada-salvarii";
import {
  amprentaCiornei,
  dupaPublicare,
  reductorCiorna,
  stareInitiala,
  type Ciorna,
  type ContinutPublicat,
} from "@/lib/editor-magazin/ciorna";
import { contextDesign } from "@/lib/editor-magazin/derivare";
import { CONTINUT_GOL, amprentaContinut, areContinut, ciornaCuContinut, type ContinutCiorna } from "@/lib/storefront/design/continut-ciorna";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Ciorna editorului unic: designul (ce sectiuni apar, in ce ordine, cu ce varianta si ce setari)
 * si, din etapa 6, continutul nepublicat (texte, liste, imagini, logo, culoare, fonturi). Totul
 * ajunge la clienti la „Publică”, iar „Renunță” arunca totul (decizia lui: „Totul la „Publică””).
 *
 * Mutata din editorul de design (`StoreDesignEditor`, scos in etapa 2), cu tot ce se invatase
 * acolo: salvarea amanata, baza pentru garda de concurenta, „epoca” pentru Publica si Renunta.
 * Starea si istoricul sunt in `lib/editor-magazin/ciorna.ts`, fara React.
 */

const amprentaDesign = (d: StoreDesign) => JSON.stringify(d);

export function useCiornaDesign({
  businessId,
  designInitial,
  publicatInitial,
  cioarnaInitiala,
  continutInitial,
  continutPublicatInitial,
  features,
  tagline,
  onContinutInBaza,
}: {
  businessId: string;
  /** Ciorna daca exista, altfel designul publicat: de unde reia comerciantul. */
  designInitial: StoreDesign;
  /** Ce vad clientii acum. */
  publicatInitial: StoreDesign;
  /**
   * Ce scrie ACUM in coloana de ciorna (designul cu `continut` alaturi); `null` cand coloana e
   * goala. E baza garzii de concurenta, deci trebuie sa fie coloana, nu ecranul.
   */
  cioarnaInitiala: unknown;
  /** Continutul nepublicat din ciorna, la intrare. */
  continutInitial: ContinutCiorna;
  /** Ce e publicat acum din continut (`page_content` si coloanele din `businesses`). */
  continutPublicatInitial: ContinutPublicat;
  features: unknown;
  tagline: string | null;
  /**
   * Chemata cand s-a schimbat in baza continutul ciornei (salvare, renuntare): previzualizarea il
   * randeaza pe server, deci se reincarca. Modificarile doar de design ajung prin mesaje.
   */
  onContinutInBaza: () => void;
}) {
  const [{ ciorna, istoric }, despacha] = useReducer(reductorCiorna, { design: designInitial, continut: continutInitial }, stareInitiala);
  const { design, continut } = ciorna;
  const [publicat, setPublicat] = useState<StoreDesign>(publicatInitial);
  const [continutPublicat, setContinutPublicat] = useState<ContinutPublicat>(continutPublicatInitial);
  const [salvez, setSalvez] = useState(false);
  const [publicaInCurs, setPublicaInCurs] = useState(false);

  /** Contextul parserului din ce e PUBLICAT; continutul ciornei se pune peste el. */
  const ctxPublicat = useMemo(() => contextDesign({
    primaryColor: continutPublicat.magazin.primary_color,
    pageContent: continutPublicat.pc,
    features,
    coverUrl: continutPublicat.magazin.cover_url,
    tagline,
  }), [continutPublicat, features, tagline]);
  const ctxPublicatAcum = useRef(ctxPublicat);
  useEffect(() => { ctxPublicatAcum.current = ctxPublicat; }, [ctxPublicat]);

  /** Ciorna de pe ecran, citibila dupa un `await`. */
  const ciornaAcum = useRef(ciorna);
  useEffect(() => { ciornaAcum.current = ciorna; }, [ciorna]);
  const publicatAcum = useRef(publicat);
  useEffect(() => { publicatAcum.current = publicat; }, [publicat]);
  const continutPublicatAcum = useRef(continutPublicat);
  useEffect(() => { continutPublicatAcum.current = continutPublicat; }, [continutPublicat]);
  const laContinutInBaza = useRef(onContinutInBaza);
  useEffect(() => { laContinutInBaza.current = onContinutInBaza; }, [onContinutInBaza]);

  /**
   * Amprenta ultimei cioarne pe care nu mai are rost s-o salvam.
   *
   * Pe continut, nu pe identitate: re-derivarea produce un obiect nou chiar cand ciorna era deja
   * salvata, iar o scriere doar pentru asta ar crea o ciorna acolo unde n-a existat niciuna.
   */
  const salvatAmprenta = useRef(amprentaCiornei({ design: designInitial, continut: continutInitial }));
  /** Amprenta continutului ajuns in baza: cand se schimba, previzualizarea se reincarca. */
  const continutInBaza = useRef(amprentaContinut(continutInitial));
  /**
   * Ce scrie ACUM in coloana de ciorna; `null` cand e goala.
   *
   * ⚠ Separat de amprenta de mai sus. La prima intrare ecranul arata designul PUBLICAT, nu o
   * ciorna, iar garda de concurenta compara cu COLOANA: trimis designul de pe ecran ca „baza”,
   * prima salvare ar fi cazut la nesfarsit cu „modificat in alta fila”. Coloana redevine `NULL`
   * dupa fiecare Publica si Renunta. Vezi `draft-guard.ts`.
   */
  const cioarnaInBaza = useRef<unknown>(cioarnaInitiala);
  /**
   * Fiecare Publica sau Renunta incepe o „epoca” noua: o salvare pornita inainte de ele si ajunsa
   * in baza DUPA ar fi reinviat ciorna tocmai golita.
   */
  const epoca = useRef(0);

  /** Ceva nepublicat: designul altul decat cel publicat, sau continut in ciorna. */
  const areModificari = useMemo(
    () => amprentaDesign(design) !== amprentaDesign(publicat) || areContinut(continut),
    [design, publicat, continut],
  );

  /*
   * Salvarea ciornei, amanata: tragerea unei sectiuni sau tastarea unui text produc zeci de
   * schimbari pe secunda. Coada (`coada-salvarii.ts`) tine o singura scriere pe drum, iar scrierea
   * isi citeste baza si compara cu ce e deja salvat abia cand ii vine randul.
   */
  const coada = useRef<CoadaSalvarii<{ ciorna: Ciorna; gen: number }> | null>(null);
  useEffect(() => {
    const c = creeazaCoadaSalvarii<{ ciorna: Ciorna; gen: number }>({
      intarziere: 1200,
      scrie: async ({ ciorna: deSalvat, gen }) => {
        if (gen !== epoca.current) return true;
        if (amprentaCiornei(deSalvat) === salvatAmprenta.current) return true;
        const coloana = ciornaCuContinut(deSalvat.design, deSalvat.continut);
        setSalvez(true);
        let res: Awaited<ReturnType<typeof saveDesignDraft>>;
        try {
          res = await saveDesignDraft(businessId, coloana, cioarnaInBaza.current);
        } catch {
          setSalvez(false);
          toast.error("Nu am putut salva ciorna. Verifică legătura la internet; încercăm din nou la următoarea modificare.");
          return false;
        }
        setSalvez(false);
        if (gen !== epoca.current) return true;
        if ("error" in res) {
          toast.error(res.error);
          return false;
        }
        salvatAmprenta.current = amprentaCiornei(deSalvat);
        cioarnaInBaza.current = coloana;
        const amprentaNoua = amprentaContinut(deSalvat.continut);
        if (amprentaNoua !== continutInBaza.current) {
          continutInBaza.current = amprentaNoua;
          laContinutInBaza.current();
        }
        return true;
      },
    });
    coada.current = c;
    // Plecarea din editor (orice navigare in aplicatie) trimite pe loc ce mai era programat.
    return () => { void c.goleste(); };
  }, [businessId]);

  useEffect(() => {
    coada.current?.programeaza({ ciorna, gen: epoca.current });
  }, [ciorna]);

  /** Trimite pe loc ciorna programata si asteapta scrierea; `false` = n-a ajuns in baza. Pentru „Ieși”. */
  const salveazaAcum = useCallback(async () => (coada.current ? coada.current.goleste() : true), []);

  // Iesirea cu modificari nepublicate merita un avertisment.
  useEffect(() => {
    if (!areModificari) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [areModificari]);

  /**
   * Aplica o modificare de design. `cheie` spune ce s-a modificat, ca tastarea intr-un camp sa fie
   * un singur pas la Anuleaza (vezi `istoric.ts`).
   */
  const aplica = useCallback(
    (urmatorul: StoreDesign | ((d: StoreDesign) => StoreDesign), cheie?: string) =>
      despacha({ tip: "aplica", urmatorul, cheie: cheie ?? null, acum: Date.now() }),
    [],
  );
  /** Aplica o modificare de continut; designul se re-deriva din el in acelasi pas. */
  const aplicaContinut = useCallback(
    (fn: (c: ContinutCiorna) => ContinutCiorna, cheie?: string) =>
      despacha({ tip: "aplicaContinut", fn, ctxPublicat: ctxPublicatAcum.current, cheie: cheie ?? null, acum: Date.now() }),
    [],
  );
  const anuleazaPas = useCallback(() => despacha({ tip: "anuleaza" }), []);
  const refaPas = useCallback(() => despacha({ tip: "reface" }), []);

  /** `true` cand ciorna (design si continut) a ajuns in magazin („Publică și ieși” pleaca doar atunci). */
  const publica = useCallback(async (): Promise<boolean> => {
    epoca.current += 1;
    const dePublicat = ciornaAcum.current;
    setPublicaInCurs(true);
    // Scrierea de pe drum intai: ajunsa DUPA publicare, ar fi reinviat ciorna golita de ea.
    coada.current?.anuleaza();
    await coada.current?.goleste();
    let res: Awaited<ReturnType<typeof publishDesign>>;
    try {
      res = await publishDesign(businessId, ciornaCuContinut(dePublicat.design, dePublicat.continut));
    } catch {
      setPublicaInCurs(false);
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă s-a publicat. Reîncarcă pagina înainte să încerci din nou.");
      return false;
    }
    setPublicaInCurs(false);
    if ("error" in res) {
      toast.error(res.error);
      return false;
    }
    // Continutul ciornei e acum in magazin: el e noul „publicat”, iar ciorna ramane fara continut.
    const goala: Ciorna = { design: dePublicat.design, continut: CONTINUT_GOL };
    setPublicat(dePublicat.design);
    setContinutPublicat((p) => dupaPublicare(p, dePublicat.continut));
    despacha({ tip: "inlocuieste", ciorna: goala });
    salvatAmprenta.current = amprentaCiornei(goala);
    continutInBaza.current = amprentaContinut(CONTINUT_GOL);
    // Publicarea goleste coloana de ciorna; urmatoarea salvare porneste de la `null`.
    cioarnaInBaza.current = null;
    toast.success("Modificările sunt acum în magazin.");
    return true;
  }, [businessId]);

  const renunta = useCallback(async () => {
    epoca.current += 1;
    // La fel ca la Publica: o scriere ajunsa dupa golire ar fi reinviat ciorna.
    coada.current?.anuleaza();
    await coada.current?.goleste();
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
    const goala: Ciorna = { design: publicatAcum.current, continut: CONTINUT_GOL };
    despacha({ tip: "inlocuieste", ciorna: goala });
    salvatAmprenta.current = amprentaCiornei(goala);
    cioarnaInBaza.current = null;
    if (continutInBaza.current !== amprentaContinut(CONTINUT_GOL)) {
      continutInBaza.current = amprentaContinut(CONTINUT_GOL);
      laContinutInBaza.current();
    }
    toast.success("Ai renunțat la modificările nepublicate.");
  }, [businessId]);

  return {
    design,
    publicat,
    /** Continutul nepublicat din ciorna. */
    continut,
    /** Ce e publicat acum din continut. */
    continutPublicat,
    /** Contextul parserului din ce e publicat. */
    ctxPublicat,
    areModificari,
    salvez,
    publicaInCurs,
    aplica,
    aplicaContinut,
    poateAnula: istoric.trecut.length > 0,
    poateReface: istoric.viitor.length > 0,
    anuleaza: anuleazaPas,
    reface: refaPas,
    publica,
    renunta,
    salveazaAcum,
  };
}

export type CiornaDesign = ReturnType<typeof useCiornaDesign>;
