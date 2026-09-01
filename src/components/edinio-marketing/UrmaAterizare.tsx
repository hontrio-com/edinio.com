"use client";

import { useEffect, useRef } from "react";
import { urmareste } from "@/lib/edinio-marketing/magistrala";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PAGINA DE ATERIZARE, PENTRU AUDIENTELE DE RETARGETARE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE NUMEA `PlatformEvent` si primea numele evenimentului ca text:
  `<PlatformEvent event="ViewContent" … />`. Doua lucruri gresite acolo:

  1. NUMELE ERA AL META. O componenta de pagina scria in clar un nume din
     vocabularul unui furnizor — adica pagina stia cui ii vorbeste. Cand TikTok
     va numi altfel acelasi lucru, sau cand se adauga un al treilea furnizor,
     s-ar fi umblat in fiecare pagina.
  2. TEXT LIBER. `event="ViewContnet"` scris gresit ar fi trecut de compilator si
     ar fi plecat catre Meta ca eveniment personalizat, tacut.

  Acum pagina spune ce ESTE ea, iar cartografierea sta in adaptoare.

  ⚠ SI NU MERGE IN GA4. Acolo pagina e deja numarata de `page_view`, cu
  `page_type` si `page_group`. Vezi `numeGa4`.
*/

export function UrmaAterizare({
  nume,
  categorie,
}: {
  nume: string;
  categorie: string;
}) {
  const tras = useRef(false);

  useEffect(() => {
    /* ⚠ O singura data pe montare: efectul se poate relua, iar audienta s-ar
       umple de duplicate. */
    if (tras.current) return;
    tras.current = true;
    urmareste({ name: "landing_view", content_name: nume, content_category: categorie });
  }, [nume, categorie]);

  return null;
}
