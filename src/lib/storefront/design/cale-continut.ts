/**
 * Calea unui „Conținut liber” in design (etapa 9 din `docs/editor-magazin/PLAN.md`): sectiunea de pe pagina principala
 * (`bloc: null`) sau blocul repetabil al unei pagini (sub produs, pe Pagina Magazin).
 *
 * ⚠ Fisier aparte, fara nicio dependenta (19.11.2026, auditul temelor). Pana atunci stateau in `edit.ts`, langa toate
 * operatiile editorului, iar `ContinutLiber` (care se incarca pe FIECARE magazin) il tragea intreg in pachetul vitrinei
 * doar pentru `caleInText`. `edit.ts` le exporta mai departe, deci restul codului le ia de unde le lua.
 */
export interface CaleContinut {
  sectiune: string;
  bloc: string | null;
}

const ID_CALE = /^[A-Za-z0-9_-]{1,64}$/;

/** Calea in text, cum o poarta blocurile randate in magazin (formularele o trimit serverului): `sectiune` sau `sectiune/bloc`. */
export function caleInText(cale: CaleContinut): string {
  return cale.bloc === null ? cale.sectiune : `${cale.sectiune}/${cale.bloc}`;
}

/** Calea din text, numai din caractere de id; orice altceva (si o cale mai lunga) da `null`. */
export function caleDinText(text: unknown): CaleContinut | null {
  if (typeof text !== "string") return null;
  const [sectiune, bloc, ...rest] = text.split("/");
  if (rest.length > 0 || !ID_CALE.test(sectiune)) return null;
  if (bloc === undefined) return { sectiune, bloc: null };
  return ID_CALE.test(bloc) ? { sectiune, bloc } : null;
}
