"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { cn } from "@/lib/utils/cn";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LEGATURA CARE RASPUNDE PE LOC SI ISI ADUCE PAGINA DINAINTE   (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Semnalat de el: „cand dau de la o integrare la alta sau daca dau de pe o
 * integrare pe sageata aia de inapoi se blocheaza putin, se misca greu".
 *
 * ═══ ⚠⚠ CE AM MASURAT PE PRODUCTIE, PE VETDEPO ═══
 *
 * Nu e reincarcare de pagina: navigarea chiar e pe client (martorul pus in
 * `window` supravietuieste clicului). Dar ecranul sta NEMISCAT:
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
 * ═══ CE FACE COMPONENTA ASTA ═══
 *
 * 1. `useLinkStatus` da starea „in curs" a chiar acestei legaturi, iar cardul o
 *    poarta prin `data-pending`. Apasarea se vede INSTANT, fara niciun drum la
 *    server.
 * 2. `router.prefetch` la `mouseenter` si la `focus`, o singura data pe card.
 *    Drumul la server se face cat muti mana spre clic, deci la apasare pagina e
 *    deja calda.
 *
 * ⚠ PRELUAREA E DOAR LA HOVER, NU LA INTRAREA IN ECRAN. Lista are 41 de carduri;
 * preluate toate deodata ar fi 41 de randari de server la fiecare deschidere a
 * paginii, ca sa se foloseasca una. `<Link prefetch>` nu are „doar la hover"
 * (`false` inseamna „niciodata, nici la hover"), de-aia se cheama `router.prefetch`
 * de mana.
 *
 * ⚠ SE CHEAMA O SINGURA DATA PE CARD. Fara steagul asta, fiecare intrare a
 * mausului ar fi o cerere noua: pe un card peste care treci de trei ori cautand,
 * trei randari de server degeaba.
 */
export function LegaturaDePanou({
  href,
  className,
  clasaInAsteptare,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: string;
  /** Ce se schimba cat timp navigarea e in curs. */
  clasaInAsteptare?: string;
}) {
  const router = useRouter();
  const preluat = useRef(false);

  const preia = () => {
    if (preluat.current) return;
    preluat.current = true;
    router.prefetch(href);
  };

  return (
    <Link
      href={href}
      onMouseEnter={preia}
      onFocus={preia}
      onTouchStart={preia}
      className={className}
      {...props}
    >
      <StareaLegaturii clasa={clasaInAsteptare} />
      {children}
    </Link>
  );
}

/**
 * Pune `data-pending` pe legatura parinte cat timp navigarea e in curs.
 *
 * ⚠ TREBUIE SA FIE COPIL AL LUI `<Link>`: `useLinkStatus` citeste contextul pe
 * care il deschide legatura. Chemat in aceeasi componenta cu `<Link>`, intoarce
 * mereu `pending: false` si nu se plange nimeni.
 */
function StareaLegaturii({ clasa }: { clasa?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending ? "" : undefined}
      className={cn(
        /*
          Bara subtire care se umple peste card, in verdele casei. Nu e un
          spinner: la 300 ms un spinner abia apuca sa se invarta o data, iar
          o miscare care incepe imediat spune „te-am auzit" mai bine.
        */
        "pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 rounded-t-xl bg-primary transition-transform duration-[400ms] ease-out",
        pending && "scale-x-100",
        clasa,
      )}
    />
  );
}
