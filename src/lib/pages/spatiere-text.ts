import type { CSSProperties } from "react";

/*
  Spatiul intre litere si intre randuri, aceleasi cifre in toate blocurile de
  pagina (07.10.2026): Hero, Titlu, Text, Buton, Intrebari frecvente.

  ⚠ „normal” aleasa anume se scrie in stil (`letter-spacing: normal`): bate
  `tracking-tight` din clasa titlurilor. Lipsa campului nu scrie nimic, deci un
  bloc salvat inainte arata ca pana acum.
*/

export const SPATIERE_LITERE: Record<string, string> = { tight: "-0.03em", normal: "normal", wide: "0.04em", wider: "0.12em" };

/** Inaltimea randului la text (blocul de text, subtitluri, raspunsuri). */
export const INALTIME_RAND: Record<string, number> = { tight: 1.3, normal: 1.6, relaxed: 1.8, loose: 2.1 };

/** Inaltimea randului la titluri; „normal” = `leading-tight`, cel de pana acum din hero. */
export const INALTIME_TITLU: Record<string, number> = { tight: 1.05, normal: 1.25, relaxed: 1.4, loose: 1.6 };

/** Stilul pentru o pereche aleasa; campurile lipsa sau necunoscute nu scriu nimic. */
export function spatiere(litere?: string | null, rand?: string | null, randuri: Record<string, number> = INALTIME_RAND): CSSProperties {
  const s: CSSProperties = {};
  /* `Object.hasOwn`: o valoare ca „constructor” ar lua altfel o functie din prototip. */
  if (litere && Object.hasOwn(SPATIERE_LITERE, litere)) s.letterSpacing = SPATIERE_LITERE[litere];
  if (rand && Object.hasOwn(randuri, rand)) s.lineHeight = randuri[rand];
  return s;
}
