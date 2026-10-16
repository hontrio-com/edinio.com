"use client";

import { useEffect, useRef } from "react";

/**
 * Pune `data-in-afara` pe PĂRINTELE ei cât părintele nu e pe ecran, ca animațiile CSS fără sfârșit de
 * dedesubt să stea (regula e în `stil-comun.css`, la „Animațiile paginii, oprite cât nu se văd”).
 *
 * O insulă de client cât un `<span>` ascuns, ca secțiunile în care stă (petele primului ecran, benzile
 * de sigle) să rămână componente de server. Fără JavaScript sau fără `IntersectionObserver`, atributul
 * nu apare niciodată și animațiile curg ca înainte.
 *
 * MĂSURAT 16.10.2026: în afara ecranului nu se desenează, dar compozitorul tot le avansa la fiecare
 * cadru, iar la orice cadru al firului principal (o derulare, un text schimbat) Chrome le recalcula
 * stilul. Pe un telefon încetinit de 4 ori, la derularea prin carduri: 687 → 364 ms/s pe firul principal.
 */
export function OprireInAfaraEcranului() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const parinte = ref.current?.parentElement;
    if (!parinte || typeof IntersectionObserver === "undefined") return;
    const urmaritor = new IntersectionObserver((intrari) => {
      const pe = intrari[intrari.length - 1];
      parinte.toggleAttribute("data-in-afara", !pe.isIntersecting);
    });
    urmaritor.observe(parinte);
    return () => {
      urmaritor.disconnect();
      parinte.removeAttribute("data-in-afara");
    };
  }, []);

  return <span ref={ref} hidden />;
}
