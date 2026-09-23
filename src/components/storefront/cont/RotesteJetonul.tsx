"use client";

import { useEffect, useRef } from "react";

/**
 * Cere rotirea jetonului, o singura data, cand baza a spus ca e vremea.
 *
 * ⚠ Nu randeaza nimic si nu arata nimic omului: rotirea e o treaba a noastra, nu
 * o veste pentru el. Daca esueaza, sesiunea merge mai departe pe jetonul vechi
 * pana la expirare.
 *
 * ⚠ `ruleaza` tine calea inchisa dupa prima chemare: in dezvoltare, React
 * monteaza componentele de doua ori, iar doua rotiri deodata ar fi aratat ca o
 * refolosire de jeton, adica exact plasa pe care o aparam (fereastra de gratie
 * din baza le-ar fi prins, dar nu e un lucru pe care sa-l incercam dinadins).
 */
export function RotesteJetonul({ trebuie }: { trebuie: boolean }) {
  const ruleaza = useRef(false);

  useEffect(() => {
    if (!trebuie || ruleaza.current) return;
    ruleaza.current = true;
    void fetch("/api/cont/atinge", { method: "POST", headers: { "content-type": "application/json" } })
      .catch(() => undefined);
  }, [trebuie]);

  return null;
}
