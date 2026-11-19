"use client";

import { useEffect, type RefObject } from "react";

/**
 * Inchide un panou deschis din antet (lista de categorii) la clic in afara lui si la Escape.
 *
 * ⚠ ASCULTA PE DOCUMENT, NU PE FOCUS (19.11.2026, proba de interactiuni pe trei motoare). Listele de categorii din caseta
 * de cautare se inchideau doar la pierderea focusului (`onBlur`), iar Escape era prins pe invelisul lor (`onKeyDown`).
 * Amandoua cer ca focusul sa fie INAUNTRU, dar Safari NU muta focusul pe un buton apasat cu mouse-ul: acolo lista se
 * deschidea si nu se mai inchidea nici la clic in afara, nici la Escape (ramanea peste pagina pana alegeai ceva).
 * In Chrome si Firefox mergea, deci nu se vedea decat pe WebKit.
 *
 * La Escape, focusul se intoarce pe butonul panoului doar daca era in panou: altfel ar sari de unde il lasase omul.
 */
export function useInchidePanoul(deschis: boolean, setDeschis: (deschis: boolean) => void, zona: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!deschis) return;
    const laClic = (e: MouseEvent) => {
      if (!zona.current?.contains(e.target as Node)) setDeschis(false);
    };
    const laTasta = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inPanou = zona.current?.contains(document.activeElement) ?? false;
      setDeschis(false);
      if (inPanou) zona.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", laClic);
    document.addEventListener("keydown", laTasta);
    return () => {
      document.removeEventListener("mousedown", laClic);
      document.removeEventListener("keydown", laTasta);
    };
  }, [deschis, setDeschis, zona]);
}
