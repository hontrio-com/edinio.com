"use client";

import { useState } from "react";
import Link from "next/link";
import { COOKIE_AJUTOR_ASCUNS } from "@/lib/dashboard/ajutor-configurare";

/*
  Oferta de ajutor la configurarea initiala, pentru conturile noi.

  ⚠ In limba panoului, nu ca o reclama lipita deasupra lui: fara fundal
  intunecat, fara degrade, fara eticheta-pastila si fara pictograma in patrat.
  Butoanele sunt cele din bara de stare („Copiaza link"), textul e cel din
  lista de configurare.

  ⚠ Ascunderea se tine intr-un COOKIE, nu in localStorage: pagina il citeste pe
  server si nu mai trimite cardul deloc. Din localStorage, cardul ar fi aparut
  o clipa la fiecare deschidere a panoului si abia apoi ar fi disparut.
*/

const TITLU = "Vrei sa configuram noi magazinul? Gratuit.";
const TEXT = "Ne ocupam de setarile magazinului tau online, ca tu sa te concentrezi pe vanzari si pe cresterea afacerii.";
const LINK = "/dashboard/suport?nou=store_design";

const clasaSecundar = "inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";
const clasaPrincipal = "inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-muted transition-colors";

function ascundeInCookie() {
  document.cookie = `${COOKIE_AJUTOR_ASCUNS}=1; path=/dashboard; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Card separat, sub lista de configurare. ⚠ Ramane si dupa ce toti pasii sunt
 * bifati: hotarat de el pe 29.09.2026, oferta e valabila toate cele 30 de zile.
 */
export function AjutorConfigurare() {
  const [ascuns, setAscuns] = useState(false);
  if (ascuns) return null;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{TITLU}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{TEXT}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <button type="button" onClick={() => { ascundeInCookie(); setAscuns(true); }} className={clasaSecundar}>
          Nu acum
        </button>
        <Link href={LINK} className={clasaPrincipal}>Scrie-ne</Link>
      </div>
    </div>
  );
}

