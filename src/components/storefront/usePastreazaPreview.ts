"use client";

import { useEffect } from "react";
import { cuSemnePastrate } from "@/lib/storefront/preview-sticky";

/**
 * Linkurile din previzualizare raman in previzualizare.
 *
 * ⚠ FARA ASTA, PRIMUL CLICK PE UN LINK FACE CADRUL ALB.
 *
 * Toti constructorii de adrese ai magazinului scriu adrese curate, ceea ce e
 * corect pentru un vizitator si gresit pentru iframe-ul editorului: o adresa
 * fara `preview=1` cade in redirectarile din `proxy.ts`, iar acelea sunt
 * cross-origin, deci `X-Frame-Options` le refuza.
 *
 * Hook-ul isi afla singur starea din adresa, si nu primeste niciun prop. Legat
 * de un prop, ar fi trebuit dus prin sapte pagini publice care randeaza
 * `StorePageShell`, iar prima uitata ar fi fost invizibila pana cand cineva ar
 * fi apasat exact acolo. In afara previzualizarii `cuSemnePastrate` intoarce
 * adresa neatinsa, deci hook-ul nu face nimic.
 *
 * In faza de bulversare, nu de captare: asa handlerele React apuca sa ruleze si
 * sa-si anuleze singure evenimentul, iar `defaultPrevented` ne spune sa nu ne
 * bagam. Clicurile cu modificator si `target="_blank"` trec neatinse:
 * „deschide in tab nou" trebuie sa duca la magazinul REAL, nu la o
 * previzualizare orfana.
 */
export function usePastreazaPreview() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      const href = link.getAttribute("href") ?? "";
      const cuSemne = cuSemnePastrate(href, window.location.search);
      if (cuSemne === href) return;
      event.preventDefault();
      window.location.href = cuSemne;
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
