"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { salveazaCiorna } from "@/lib/actions/configurator.actions";
import type { Continut } from "@/lib/configurators/citeste";

/**
 * Autosalvarea ciornei.
 *
 * ═══ ⚠ TREI CAPCANE, TOATE VAZUTE DEJA IN EDITORUL DE MAGAZIN ═══
 *
 * 1. **Efectul depinde DOAR de ciorna.** Pus si indicatorul de stare in dependinte, efectul isi
 *    declanseaza propria re-rulare la nesfarsit, fiindca chiar el il schimba.
 *
 * 2. **„Salvat" nu se scrie decat dupa un raspuns bun.** Un indicator care spune „Salvat"
 *    fiindca s-a TRIMIS cererea e mai rau decat niciun indicator: omul inchide fila linistit.
 *
 * 3. **Publicarea si parasirea paginii au nevoie de o EPOCA.** O salvare pornita inainte poate
 *    ateriza dupa ele si invia o ciorna care intre timp a fost publicata. Fiecare salvare isi
 *    tine numarul; cand se intoarce, daca nu mai e a ei, raspunsul se arunca.
 *
 * ═══ ⚠ SI NU SE SALVEAZA LA INCARCARE ═══
 *
 * Prima randare aduce ciorna din baza. Fara paza, efectul ar fi scris-o inapoi imediat — o
 * scriere degeaba la fiecare deschidere, si un `revizie + 1` care ar fi facut ca a doua fila
 * deschisa sa primeasca „modificat de altcineva" fara ca nimeni sa fi modificat nimic.
 */

export type StareSalvare = "curat" | "seSalveaza" | "salvat" | "eroare" | "conflict";

const INTARZIERE_MS = 1200;

export interface Autosalvare {
  stare: StareSalvare;
  /** Mesajul de aratat cand ceva n-a mers. */
  mesaj: string | null;
  /** Revizia de la care porneste urmatoarea scriere. */
  revizie: number;
  /** Cheama-l la fiecare schimbare a ciornei. */
  marcheazaSchimbat: () => void;
  /** Scrie ACUM, fara sa astepte intarzierea. Intoarce `true` cand a reusit. */
  salveazaAcum: () => Promise<boolean>;
}

export function useAutosalvare(
  id: string,
  continut: Continut,
  revizieInitiala: number,
): Autosalvare {
  const [stare, setStare] = useState<StareSalvare>("curat");
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [revizie, setRevizie] = useState(revizieInitiala);

  /*
   * Referinte, nu stare: se citesc din interiorul efectului fara sa-l re-declanseze. Ciorna se
   * tine si ea aici, ca `salveazaAcum` sa scrie ULTIMA forma, nu pe cea din inchiderea in care
   * s-a compus butonul.
   */
  const continutRef = useRef(continut);
  const revizieRef = useRef(revizieInitiala);
  const epocaRef = useRef(0);
  const murdarRef = useRef(false);
  const cronometru = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrie = useCallback(async (): Promise<boolean> => {
    const epocaMea = ++epocaRef.current;
    setStare("seSalveaza");
    setMesaj(null);
    const r = await salveazaCiorna(id, continutRef.current, revizieRef.current);

    /*
     * ⚠ Raspunsul unei salvari care nu mai e cea curenta se ARUNCA. Altfel o cerere lenta ar
     * scrie „Salvat" peste o eroare de acum o clipa, sau ar duce revizia inapoi.
     */
    if (epocaMea !== epocaRef.current) return false;

    if ("error" in r) {
      setStare(r.conflict ? "conflict" : "eroare");
      setMesaj(r.error);
      return false;
    }
    revizieRef.current = r.revizie;
    setRevizie(r.revizie);
    murdarRef.current = false;
    setStare("salvat");
    return true;
  }, [id]);

  const marcheazaSchimbat = useCallback(() => { murdarRef.current = true; }, []);

  /*
   * ⚠ DEPENDINTA E DOAR CIORNA. Nici `stare`, nici `mesaj`: pe amandoua le scrie chiar efectul,
   * deci puse aici ar fi facut o bucla fara capat.
   */
  useEffect(() => {
    /*
     * ⚠ Referinta se aduce la zi AICI, nu in timpul randarii. O scriere in `ref.current` in
     * corpul componentei e chiar ce interzice `react-hooks/refs`: randarea trebuie sa fie fara
     * efecte, altfel React nu mai poate reporni sau relua o randare in siguranta.
     *
     * Efectul ruleaza dupa randare si inaintea oricarei apasari, deci `salveazaAcum` gaseste
     * mereu ultima forma.
     */
    continutRef.current = continut;
    if (!murdarRef.current) return;
    if (cronometru.current) clearTimeout(cronometru.current);
    cronometru.current = setTimeout(() => { void scrie(); }, INTARZIERE_MS);
    return () => { if (cronometru.current) clearTimeout(cronometru.current); };
  }, [continut, scrie]);

  /*
   * ⚠ Se avertizeaza la parasirea paginii DOAR cand chiar e ceva nesalvat.
   *
   * Un avertisment care apare si cand totul e salvat se invata sa fie ignorat, si atunci nu mai
   * apara nimic in ziua in care chiar era ceva de pierdut.
   */
  useEffect(() => {
    function laPlecare(e: BeforeUnloadEvent) {
      if (murdarRef.current || stare === "eroare" || stare === "conflict") e.preventDefault();
    }
    window.addEventListener("beforeunload", laPlecare);
    return () => window.removeEventListener("beforeunload", laPlecare);
  }, [stare]);

  const salveazaAcum = useCallback(async () => {
    if (cronometru.current) clearTimeout(cronometru.current);
    if (!murdarRef.current) return true;
    return scrie();
  }, [scrie]);

  return { stare, mesaj, revizie, marcheazaSchimbat, salveazaAcum };
}
