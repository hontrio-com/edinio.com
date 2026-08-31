"use client";

import { STIL_PAGINA_SIMPLA as S } from "@/lib/stil-pagina-simpla";

/*
  ⚠ FĂRĂ CLASE TAILWIND ȘI FĂRĂ IMPORT DE CSS — DINADINS. Motivul întreg e în
  `lib/stil-pagina-simpla.ts`: fișierul stă la rădăcina lui `app/`, deci orice
  foaie importată aici se leagă pe fiecare pagină a platformei.
*/
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={S.pagina}>
      <h1 style={S.numar}>500</h1>
      <p style={S.titlu}>Ceva nu a functionat corect</p>
      <p style={S.explicatie}>A aparut o eroare neasteptata. Te rugam sa incerci din nou.</p>
      <button onClick={reset} style={S.buton}>
        Incearca din nou
      </button>
    </div>
  );
}
