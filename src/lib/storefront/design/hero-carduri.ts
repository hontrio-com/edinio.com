/*
  Cardurile de langa bannerul principal, la varianta „carduri” (tema Jupiter, etapa 16.3 din
  `docs/editor-magazin/PLAN.md`). Pure: le citesc si bannerul, si probele.
*/

export interface CardHero {
  titlu: string;
  text: string;
  imagine: string;
  link: string;
}

/** Cate carduri incap langa banner: doua, unul sub altul, ca pe modelul temei. */
export const MAX_CARDURI_HERO = 2;

const sir = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Cardurile din reglaje, in ordine; unul fara titlu nu se arata (n-ar avea ce spune). */
export function cardurileHero(setari: Record<string, unknown> | undefined): CardHero[] {
  const lista = Array.isArray(setari?.carduri) ? setari.carduri : [];
  return lista
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ titlu: sir(c.titlu), text: sir(c.text), imagine: sir(c.imagine), link: sir(c.link) }))
    .filter((c) => c.titlu)
    .slice(0, MAX_CARDURI_HERO);
}
