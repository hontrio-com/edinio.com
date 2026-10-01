"use client";

import { useEffect, useRef } from "react";
import { pornesteAnimatiile } from "@/lib/pages/animatii";

/**
 * Porneste animatiile cand pagina a sosit FARA reincarcare (un link din meniu,
 * „inapoi” din browser). Atunci scriptul scris in pagina nu ruleaza: React nu
 * executa `<script>`-urile venite prin navigare. La o incarcare obisnuita,
 * scriptul a pornit deja totul si functia vede `data-anim-pornit` si iese.
 *
 * ⚠ Pana porneste, blocurile raman VIZIBILE: ascunderea tine de atributul pus
 * chiar de pornire. Deci cel mult se pierde o animatie, niciodata continutul.
 */
export function PornesteAnimatiile() {
  const semn = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Parintele, ca scriptul din pagina (`SCRIPT_ANIMATII`): pe ruta paginilor e `<main>`,
    // pe pagina principala proprie e invelisul fiecarui grup de blocuri.
    pornesteAnimatiile(semn.current?.parentElement ?? null);
  }, []);
  return <span ref={semn} hidden />;
}
