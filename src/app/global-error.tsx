"use client";

import { useEffect } from "react";
import { STIL_PAGINA_SIMPLA as S } from "@/lib/stil-pagina-simpla";
import { raporteazaEroarea } from "@/lib/sentry/raporteaza";

/*
  ⚠ AICI STILURILE ÎN LINIE NU SUNT DOAR O ECONOMIE, SUNT SINGURA CALE.
  `global-error` înlocuiește tot documentul, inclusiv `app/layout.tsx` — își
  randează propriile `<html>` și `<body>`. Deci nici măcar nu moștenește foaia
  aspectului rădăcină: fără stilurile astea, pagina ar fi text negru pe alb,
  nearanjat, exact în clipa în care ceva s-a rupt urât.

  Restul motivelor sunt în `lib/stil-pagina-simpla.ts`.
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Pana la 18.09.2026 eroarea se pierdea aici: pagina o primea si n-o spunea nimanui.
  useEffect(() => {
    raporteazaEroarea(error);
  }, [error]);

  return (
    <html lang="ro">
      <body style={{ ...S.pagina, margin: 0 }}>
        <h1 style={S.numar}>500</h1>
        <p style={S.titlu}>Eroare critica</p>
        <p style={S.explicatie}>A aparut o eroare neasteptata. Te rugam sa incerci din nou.</p>
        <button onClick={reset} style={S.buton}>
          Incearca din nou
        </button>
      </body>
    </html>
  );
}
