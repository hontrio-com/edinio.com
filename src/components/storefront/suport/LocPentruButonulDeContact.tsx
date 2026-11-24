"use client";

import { useEffect, useRef } from "react";
import { useChatInMagazin } from "./ChatInMagazin";

/*
 * Loc pentru butonul de contact al magazinului (`ButonContact`) deasupra unei bare LIPICIOASE (`sticky bottom-0`),
 * cum e bara de actiune a cosului compact, cu „Finalizeaza comanda” in dreapta.
 *
 * ═══ DE CE NU AJUNGE O REGULA CSS, CA LA BARELE FIXE ═══
 *
 * O bara fixa sta mereu in acelasi loc, deci isi anunta inaltimea printr-o regula (`LocPesteBaraDeJos`). Una
 * lipicioasa sta jos numai cat sectiunea ei trece de marginea ecranului; cand omul deruleaza mai departe, bara se
 * desprinde si urca odata cu pagina. Cu o inaltime fixa, butonul ramanea pe loc, iar bara trecea PRIN el: pe o
 * portiune de 120 px de derulare, butonul de chat statea peste „Finalizeaza comanda” (socotit la 844 px inaltime,
 * 22.11.2026). De aceea locul se masoara:
 *
 *   - bara atinge josul ecranului, sau sub ea nu incape butonul: butonul sta deasupra ei si urca odata cu ea;
 *   - sub bara e loc destul (ori bara nu e in ecran): butonul sta la locul lui, in colt.
 *
 * ═══ FATA DE CE SE MASOARA ═══
 *
 * Fata de locul in care browserul asaza elementele fixe, aflat cu o SONDA: un element fix, fara dimensiuni,
 * lipit de jos. `window.innerHeight` numara si bara de derulare orizontala, iar pe telefon se schimba odata cu
 * barele browserului; `clientHeight` al documentului nu le urmeaza pe acestea din urma. Sonda sta exact unde
 * sta si butonul, in orice browser.
 *
 * ⚠ Numai la magazinele cu chat. La celelalte nu exista buton, deci nu se masoara si nu se asculta nimic.
 * ⚠ Se pune INAUNTRUL barei: ea e masurata, prin parintele reperului.
 */

/** Cat loc ii trebuie butonului sub bara: marginea lui de jos (1,25rem), butonul (3,5rem) si un rost (0,75rem). */
const LOC_SUB_BARA = 88;

export function LocPentruButonulDeContact() {
  const reper = useRef<HTMLSpanElement>(null);
  const chat = useChatInMagazin();

  useEffect(() => {
    if (chat === "fara") return;
    const bara = reper.current?.parentElement;
    if (!bara) return;
    const radacina = document.documentElement;
    const sonda = document.createElement("div");
    sonda.setAttribute("aria-hidden", "true");
    sonda.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(sonda);
    let cadru = 0;
    let scris: string | null = null;

    const masoara = () => {
      cadru = 0;
      const r = bara.getBoundingClientRect();
      const jos = sonda.getBoundingClientRect().bottom;
      const inEcran = r.bottom > 0 && r.top < jos;
      const valoare = !inEcran || jos - r.bottom >= LOC_SUB_BARA ? "0px" : `${Math.ceil(jos - r.top)}px`;
      if (valoare === scris) return;
      scris = valoare;
      radacina.style.setProperty("--bara-de-jos", valoare);
    };
    /* O masuratoare pe cadru, oricate evenimente de derulare ar veni intre doua cadre. */
    const cere = () => { if (!cadru) cadru = window.requestAnimationFrame(masoara); };

    /* Cat butonul urmareste bara, se muta odata cu ea, fara animatie: una de 200 ms l-ar lasa in urma, peste bara. */
    radacina.style.setProperty("--bara-de-jos-durata", "0s");
    masoara();
    window.addEventListener("scroll", cere, { passive: true });
    window.addEventListener("resize", cere);
    /* Un produs scos din cos muta bara fara nicio derulare: se vede pe inaltimea paginii. */
    const observator = typeof ResizeObserver === "function" ? new ResizeObserver(cere) : null;
    observator?.observe(bara);
    observator?.observe(document.body);

    return () => {
      if (cadru) window.cancelAnimationFrame(cadru);
      window.removeEventListener("scroll", cere);
      window.removeEventListener("resize", cere);
      observator?.disconnect();
      sonda.remove();
      radacina.style.removeProperty("--bara-de-jos");
      radacina.style.removeProperty("--bara-de-jos-durata");
    };
  }, [chat]);

  return <span ref={reper} hidden />;
}
