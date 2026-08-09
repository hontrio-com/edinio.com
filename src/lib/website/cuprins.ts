/**
 * Regula după care cuprinsul unui document lung știe unde ai ajuns.
 *
 * ═══ DE CE E AICI, ȘI NU ÎN COMPONENTĂ ═══
 *
 * Ca să poată fi PROBATĂ. `IntersectionObserver` nu livrează nimic într-o filă
 * de fundal, exact ca `requestAnimationFrame` — măsurat pe pagina asta:
 * `visibilityState` „hidden", zero cadre, iar observatorul nu și-a chemat
 * funcția nici măcar o dată la pornire. Comportamentul nu se poate deci verifica
 * apăsând pe ceva în browser.
 *
 * ⚠ Fișier `.ts`, nu `.tsx`, și nu întâmplător: probele rulează pe Node, care
 * dezbracă tipurile dar NU știe JSX. O funcție pură lăsată lângă componentă e o
 * funcție pe care nimeni n-o mai poate proba.
 */

export interface IntrareCuprins {
  id: string;
  nr: number;
  titlu: string;
}

/**
 * Care articol se aprinde, dintre cele aflate în dreptul ecranului.
 *
 * Se ia primul din ORDINEA DOCUMENTULUI, nu primul care a raportat: observatorul
 * își cheamă funcția cu articolele în ordinea în care le-a văzut el, care n-are
 * legătură cu ordinea de pe pagină. Fără asta, cuprinsul aprinde când un
 * articol, când altul, la aceeași poziție de derulare.
 *
 * `null` înseamnă „nu schimba nimic", nu „stinge tot": la un articol mai înalt
 * decât banda de observare nu e nimeni în bandă, iar dacă am stinge, cuprinsul
 * s-ar goli fix în mijlocul celui mai lung articol.
 */
export function articolulActiv(
  intrari: IntrareCuprins[],
  vizibile: ReadonlySet<string>,
): string | null {
  return intrari.find((i) => vizibile.has(i.id))?.id ?? null;
}
