import type { ReactNode, RefObject } from "react";
/* Foaia ramei vine cu componenta, nu prin `website.css`: așa ajunge doar pe paginile care chiar
   au o machetă animată (azi, numai prima), nu pe toate paginile site-ului și ale centrului de
   ajutor. Măsurat la recenzie: 16,5 KB în plus (4 KB comprimat), care blocau desenarea. */
import "@/app/animatii-carduri.css";

/**
 * Rama comună a machetelor animate din „Soluția”: fundalul cu cele două lumini și scena 4:3 din
 * mijloc, în care desenează fiecare machetă. Stilul e în `app/animatii-carduri.css`; ce se mișcă
 * înăuntru pornește `useAnimatieInBucla`, care caută scena după clasa `anim-scena`.
 *
 * Pentru un cititor de ecran e O imagine, cu eticheta ei: tot ce e înăuntru e decor.
 */
export function ScenaAnimata({
  radacina,
  clasa,
  eticheta,
  children,
}: {
  radacina: RefObject<HTMLDivElement | null>;
  /** Clasa machetei (`emx`, `eic`), sub care își scrie foaia de stil desenul. */
  clasa: string;
  eticheta: string;
  children: ReactNode;
}) {
  return (
    <div ref={radacina} className={`anim-card ${clasa}`} role="img" aria-label={eticheta}>
      <div className="anim-blob anim-b1" />
      <div className="anim-blob anim-b2" />
      <div className="anim-scena">{children}</div>
    </div>
  );
}
