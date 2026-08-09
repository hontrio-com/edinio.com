/**
 * Regula după care cuprinsul unui document lung știe unde ai ajuns.
 *
 * ═══ DE CE E AICI, ȘI NU ÎN COMPONENTĂ ═══
 *
 * Ca să poată fi PROBATĂ. Într-o filă de fundal, Chrome nu rulează
 * `requestAnimationFrame`, nu avansează tranzițiile CSS și nu mai livrează
 * `IntersectionObserver` după încărcare — măsurat pe paginile astea:
 * `visibilityState` „hidden", zero cadre, iar un observator pornit DUPĂ
 * încărcare n-a fost chemat niciodată.
 *
 * La încărcare el chiar se declanșează o dată — cuprinsul aprinde corect
 * articolul din adresă, verificat pe `/confidentialitate#...` — dar nu se mai
 * actualizează când derulezi. Deci comportamentul la derulare nu se poate
 * verifica apăsând pe ceva din unealta de browser.
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
