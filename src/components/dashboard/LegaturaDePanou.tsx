"use client";

import Link, { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils/cn";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LEGATURA CARE RASPUNDE PE LOC LA APASARE                      (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Semnalat de el: „cand dau de la o integrare la alta sau daca dau de pe o
 * integrare pe sageata aia de inapoi se blocheaza putin, se misca greu".
 *
 * ═══ ⚠⚠ CE S-A MASURAT PE PRODUCTIE, PE VETDEPO ═══
 *
 * Nu e reincarcare de pagina: navigarea chiar e pe client (martorul pus in
 * `window` supravietuieste clicului). Dar ecranul statea NEMISCAT:
 *
 *   Integrari -> GLS ............... 312 ms
 *   Integrari -> Cargus ............ 411 ms
 *   Cargus -> Integrari (sageata) .. 498 ms
 *   a doua oara pe Cargus, in 30 s . 1094 ms
 *
 * ⚠ SI NU SE PRELUA NIMIC DINAINTE: 41 de carduri pe ecran, ZERO cereri, nici
 * la intrarea in ecran, nici la trecerea cu mausul.
 *
 * Cauza: raspunsurile RSC ale panoului vin cu
 * `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, adica
 * implicitul lui Next pentru o pagina randata la cerere, fiindca citeste
 * cookieuri. Cu `no-store`, routerul nu are voie nici sa preia dinainte, nici sa
 * tina minte. Dovada: a doua vizita pe aceeasi pagina, in 30 de secunde, nu e mai
 * rapida, ci mai lenta.
 *
 * ⚠ DE-AIA `loading.tsx` SINGUR NU AJUTA. Cargus are unul, GLS n-are, si stau la
 * fel: fara o preluare, clientul nici nu stie ca exista o schita acolo, deci
 * asteapta oricum primii octeti.
 *
 * ═══ ⚠⚠ CE AM INCERCAT SI AM SCOS: PRELUAREA LA HOVER ═══
 *
 * Prima scriere chema `router.prefetch(href)` pe `mouseenter`, ca drumul la server
 * sa se faca in timp ce muti mana spre clic. Parea evident ca ajuta. Masurat pe
 * productie, DUPA ce a urcat: hover pe un card, sase secunde de asteptare, ZERO
 * cereri. Nici pe o ruta cu `loading.tsx` (Cargus), nici pe una fara (GLS).
 *
 * `router.prefetch` se supune aceleiasi reguli ca preluarea automata: pe un
 * raspuns `no-store` nu are ce sa tina, deci nu cere nimic. Ramasa in cod, ar fi
 * fost un apel care nu face nimic, cu un comentariu care spune ca face ceva —
 * adica fix genul de minciuna care se descopera peste un an. Scoasa.
 *
 * ⚠ CE RAMANE, SI CHIAR SE VEDE IN CIFRE. `useLinkStatus` da starea „in curs" a
 * chiar acestei legaturi, iar bara de deasupra ei se aprinde imediat. Masurat pe
 * productie, pe acelasi drum ca mai sus:
 *
 *   Integrari -> GLS ............... bara la  79 ms (inainte: nimic pana la 312)
 *   GLS -> Integrari (sageata) ..... bara la  67 ms (inainte: nimic pana la 498)
 *
 * Drumul la server ramane cat era; ce dispare e senzatia ca apasarea n-a fost
 * auzita. Pentru scurtarea lui chiar trebuie umblat la ce face pagina pe server,
 * nu la legatura.
 *
 * ⚠ Daca ruta a fost totusi preluata cumva, starea „in curs" e SARITA de Next
 * (scrie in documentatia lor). Bara care nu se aprinde inseamna „a fost instant",
 * nu „s-a stricat".
 */
export function LegaturaDePanou({
  href,
  className,
  clasaInAsteptare,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Cum se deseneaza bara, unde asezarea implicita nu se potriveste. */
  clasaInAsteptare?: string;
}) {
  return (
    <Link href={href} className={className} {...props}>
      <StareaLegaturii clasa={clasaInAsteptare} />
      {children}
    </Link>
  );
}

/**
 * Bara care se umple cat timp navigarea e in curs.
 *
 * ⚠ TREBUIE SA FIE COPIL AL LUI `<Link>`: `useLinkStatus` citeste contextul pe
 * care il deschide legatura. Chemat in aceeasi componenta cu `<Link>`, intoarce
 * mereu `pending: false` si nu se plange nimeni.
 *
 * ⚠ SI NU SE VERIFICA CU `setInterval`. Cu sondare la 8 ms parea ca nu se aprinde
 * niciodata: in timpul tranzitiei firul e ocupat si cronometrele nu apuca sa
 * ruleze. Un `MutationObserver` pe atribute a prins `data-pending` din prima.
 */
function StareaLegaturii({ clasa }: { clasa?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending ? "" : undefined}
      className={cn(
        /*
          Bara subtire in verdele casei, nu un spinner: la 300 ms un spinner abia
          apuca sa se invarta o data, iar o miscare care incepe imediat spune
          „te-am auzit" mai bine decat una care se termina inainte sa fie vazuta.
        */
        "pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 rounded-t-xl bg-primary transition-transform duration-[400ms] ease-out",
        pending && "scale-x-100",
        clasa,
      )}
    />
  );
}
