"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { datePaginaInEditor } from "@/lib/actions/editor-pagini.actions";
import { updatePage } from "@/lib/actions/page.actions";
import { deSalvat, paginaModificata, reductorPagina, type StarePagina } from "@/lib/editor-magazin/pagina-proprie";

/**
 * Pagina proprie deschisa in editorul unic (etapa 5 din `docs/editor-magazin/PLAN.md`).
 *
 * Datele vin de la server cand se deschide pagina (`datePaginaInEditor`); de acolo pagina se editeaza
 * pe ecran, cu istoricul ei (Anuleaza / Refa), si se salveaza EXPLICIT, cu garda de versiune ca in
 * editorul de pagini de pana acum. Nimic nu pleaca singur: pagina e continut, nu ciorna de design.
 */

export function usePaginaProprie(id: string | null) {
  const [{ deschisa, lipsa }, despacha] = useReducer(reductorPagina, { deschisa: null, lipsa: null });
  const [salvez, setSalvez] = useState(false);

  /** Pagina de pe ecran, citibila dupa un `await`. */
  const acum = useRef(deschisa);
  useEffect(() => { acum.current = deschisa; }, [deschisa]);

  // Pagina se citeste cand se deschide; o alta deschisa inainte de raspuns castiga.
  const idDeschis = deschisa?.id ?? null;
  useEffect(() => {
    if (!id || id === idDeschis) return;
    let anulat = false;
    datePaginaInEditor(id)
      .then((d) => { if (!anulat) despacha(d ? { tip: "incarcata", id, date: d } : { tip: "lipsa", id }); })
      .catch(() => { if (!anulat) toast.error("Nu am putut deschide pagina. Verifică legătura la internet și alege-o din nou."); });
    return () => { anulat = true; };
  }, [id, idDeschis]);

  const pagina = deschisa && deschisa.id === id ? deschisa : null;
  const modificata = pagina ? paginaModificata(pagina.salvata, pagina.curenta) : false;

  // Inchiderea ferestrei cu pagina nesalvata merita un avertisment, ca in editorul de pagini.
  useEffect(() => {
    if (!modificata) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [modificata]);

  const aplica = useCallback(
    (fn: (s: StarePagina) => StarePagina, cheie?: string) => despacha({ tip: "aplica", fn, cheie: cheie ?? null, acum: Date.now() }),
    [],
  );
  /** Uita pagina de pe ecran (editorul trece pe alta pagina); la intoarcere se citeste din nou. */
  const inchide = useCallback(() => despacha({ tip: "inchisa" }), []);
  const anuleazaPas = useCallback(() => despacha({ tip: "anuleaza" }), []);
  const refaPas = useCallback(() => despacha({ tip: "reface" }), []);

  /** Salveaza tot randul; intoarce ce s-a salvat, sau `null` cand n-a ajuns in baza (mesajul l-a spus deja). */
  const salveaza = useCallback(async (): Promise<StarePagina | null> => {
    const d = acum.current;
    if (!d) return null;
    const trimisa = d.curenta;
    setSalvez(true);
    let res: Awaited<ReturnType<typeof updatePage>>;
    try {
      res = await updatePage(d.id, deSalvat(trimisa, d.versiune));
    } catch {
      setSalvez(false);
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă pagina s-a salvat. A rămas marcată ca nesalvată: apasă din nou pe Salvează.", { duration: 12000 });
      return null;
    }
    setSalvez(false);
    if ("error" in res) {
      toast.error(res.error, { duration: res.conflict ? 15000 : 6000 });
      return null;
    }
    despacha({ tip: "salvata", id: d.id, trimisa, slug: res.slug, versiune: res.versiune });
    toast.success("Pagina a fost salvată.");
    return { ...trimisa, slug: res.slug };
  }, []);

  return {
    /** Datele de previzualizare si de setari ale paginii deschise; `null` cat se incarca. */
    date: pagina?.date ?? null,
    stare: pagina?.curenta ?? null,
    /** Pagina ceruta nu e (sau nu mai e) a magazinului. */
    lipseste: !!id && lipsa === id,
    incarc: !!id && !pagina && lipsa !== id,
    modificata,
    salvez,
    aplica,
    poateAnula: (pagina?.istoric.trecut.length ?? 0) > 0,
    poateReface: (pagina?.istoric.viitor.length ?? 0) > 0,
    anuleaza: anuleazaPas,
    reface: refaPas,
    salveaza,
    inchide,
  };
}

export type PaginaDeschisa = ReturnType<typeof usePaginaProprie>;
