import type { CSSProperties } from "react";

/**
 * Clasele zonei de cont, scrise o singura data.
 *
 * ⚠⚠ NUMAI TOKENII VITRINEI (`--st-*`), niciodata pe cei ai panoului
 * (`text-foreground`, `bg-primary`, `ring-foreground/10`). Paginile de cont
 * foloseau tokenii panoului si `businesses.primary_color`, deci pe Casa Lumen
 * (teracota, fond crem, titluri Playfair) aratau verde Edinio, cu gri reci si
 * fontul Geist. Tema magazinului vine din `StorefrontThemeScope`.
 *
 * ⚠⚠ PRIMARA NU E CULOARE DE TEXT. Pe productie, la 55 din 71 de magazine textul
 * alb pe culoarea primara cade sub 4,5:1. Primara se foloseste numai ca umplere
 * (cu `--st-primary-contrast`, ales pe contrast) sau ca decor (`--st-primary-soft`).
 *
 * ⚠ Clasele se scriu INTREGI: Tailwind citeste codul ca text si nu gaseste o
 * clasa lipita la rulare.
 */

/** Focalizare vizibila pe orice tema: pe text, nu pe primara (sub 3:1 la 45 de magazine). */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-text)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--st-surface)]";

/**
 * Raza cardurilor, plafonata: la raza „full" (9999px) un card mare ar iesi in
 * forma de stadion.
 */
export const CARD =
  "rounded-[min(var(--st-radius-lg),1.25rem)] border border-[var(--st-border)] bg-[var(--st-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

const BUTON =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--st-radius-btn)] px-5 py-2 text-sm font-semibold transition-[opacity,transform,background-color] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${FOCUS}`;

export const BUTON_PRIMAR = `${BUTON} hover:opacity-90`;
export const STIL_PRIMAR: CSSProperties = { backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" };

export const BUTON_SECUNDAR =
  `${BUTON} border border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text)] hover:bg-[var(--st-primary-soft)]`;

/** Buton mic, fara chenar, pentru actiuni de rand (Scoate, Copiaza). */
export const BUTON_DISCRET =
  `inline-flex min-h-9 items-center gap-1.5 rounded-[var(--st-radius-sm)] px-2.5 text-sm font-medium text-[var(--st-muted)] transition-colors hover:bg-[var(--st-primary-soft)] hover:text-[var(--st-text)] disabled:opacity-50 ${FOCUS}`;

export const LEGATURA =
  `rounded-sm font-medium text-[var(--st-text)] underline decoration-[var(--st-border)] underline-offset-4 transition-colors hover:decoration-[var(--st-text)] ${FOCUS}`;

/** `text-base` pe telefon: la 14px, iOS mareste pagina cand se focalizeaza campul. */
export const CAMP =
  "w-full rounded-[var(--st-radius-sm)] border border-[var(--st-border)] bg-[var(--st-surface)] px-3.5 py-2.5 text-base text-[var(--st-text)] placeholder:text-[var(--st-muted)] transition-shadow focus:border-[var(--st-text)] focus:outline-none focus:ring-2 focus:ring-[var(--st-primary-soft)] sm:text-sm";

export const ETICHETA_CAMP = "mb-1.5 block text-sm font-medium text-[var(--st-text)]";

export const TITLU: CSSProperties = { fontFamily: "var(--st-font-heading)" };

/**
 * Invelisul zonei de cont: fontul textului al magazinului.
 *
 * ⚠ `fontSynthesisWeight: "none"`: Instrument Serif vine intr-o SINGURA greutate
 * (400). Titlul mare trece deja pe `font-normal` la el (`greutateTitlu`), dar
 * titlurile mici din carduri sunt `font-semibold`, iar browserul le-ar fi ingrosat
 * artificial. Fonturile variabile au greutatile adevarate, deci la ele nu schimba nimic.
 */
export const TEXT_CONT: CSSProperties = { fontFamily: "var(--st-font-body)", fontSynthesisWeight: "none" };
