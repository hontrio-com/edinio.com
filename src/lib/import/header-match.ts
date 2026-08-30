/**
 * Ghicirea coloanelor dintr-un antet de fisier.
 *
 * Extras din feedul de stocuri cand a aparut al doilea importator (clienti), ca
 * regula sa fie una singura. Cele doua liste de indicii difera, purtarea nu.
 */

/** Antetul, adus la o forma comparabila: fara spatii, minuscule, fara diacritice. */
export function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/**
 * Prima coloana al carei antet seamana cu unul din indicii, sarind peste cele
 * deja luate de alt camp.
 *
 * Intai potrivire EXACTA pe toata lista de indicii, abia apoi una partiala. Fara
 * ordinea asta, un antet „Cod produs" ar fi furat de indiciul „cod" chiar si cand
 * exista o coloana numita exact „Cod".
 */
export function pick(headers: string[], hints: string[], taken: Set<string>): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, norm: normHeader(h) }));

  for (const hint of hints) {
    const exact = normalized.find((h) => h.norm === hint && !taken.has(h.raw));
    if (exact) return exact.raw;
  }
  for (const hint of hints) {
    const partial = normalized.find((h) => h.norm.includes(hint) && !taken.has(h.raw));
    if (partial) return partial.raw;
  }
  return undefined;
}

/** `pick` plus marcarea coloanei ca luata. Intoarce `undefined` daca n-a gasit. */
export function take(headers: string[], hints: string[], taken: Set<string>): string | undefined {
  const found = pick(headers, hints, taken);
  if (found) taken.add(found);
  return found;
}
