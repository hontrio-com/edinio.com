/**
 * Eticheta de deasupra titlului unei secțiuni: un cuvânt scris mărunt, cu
 * majuscule și litere depărtate.
 *
 * Stă într-un fișier al ei pentru că e o PERECHE, nu un ornament repetat.
 * „Problema" deasupra unei secțiuni, „Soluția" deasupra celei următoare — și
 * numai fiindcă arată identic se citește că a doua răspunde la prima. Dacă
 * fiecare secțiune și-ar fi desenat-o pe a ei, s-ar fi despărțit la prima
 * retușare a uneia dintre ele.
 *
 * ═══ CE A FOST ÎNAINTE ═══
 *
 * O pastilă cu chenar, iconiță și inel colorat — roșie la „Problema", verde la
 * „Soluția". Scoasă la cererea clientului (2026-08-06): „nu mai pune pill verde
 * și roșu, pune un text normal cu majuscule, e mai simplist și premium așa".
 *
 * Odată cu pastila a plecat și diferența de culoare dintre cele două. Nu e o
 * pierdere: perechea se citea din formă, nu din ton, iar acum sunt literalmente
 * identice.
 *
 * Desenul e cel de la titlurile de coloană din mega menu (`ColumnHeading` din
 * `site-header/MenuPieces.tsx`), cerut explicit ca reper.
 *
 * Două valori sunt însă ALTELE decât acolo, dinadins (2026-08-06: „mărește puțin
 * mai mult, sunt mult prea mici, și fă o spațiere între litere"):
 *
 * - **13px, nu 11.** În mega menu, titlul stă lipit deasupra unei liste, într-un
 *   panou îngust, și are lângă el la ce se raporta. Aici stă singur peste o
 *   coloană de 720px, sub un titlu de 44px — la 11px arăta a scăpare, nu a
 *   decizie.
 * - **`tracking` 0.18em, nu 0.08.** Depărtarea literelor e ce face un cuvânt
 *   scurt cu majuscule să se citească drept etichetă și nu drept text strigat.
 *   Cu cât cuvântul e mai scurt, cu atât are nevoie de mai multă.
 *
 * `pe-[0.18em]` compensează spațierea de după ULTIMA literă. `letter-spacing` o
 * adaugă și acolo unde nu urmează nimic, iar la un rând centrat asta împinge tot
 * cuvântul cu o jumătate de spațiere spre stânga. La 0.08em nu se vedea; la
 * 0.18em, da.
 */
export function SectionEyebrow({ label }: { label: string }) {
  return (
    <p className="pe-[0.18em] text-[13px] font-semibold uppercase tracking-[0.18em] text-ink-3">
      {label}
    </p>
  );
}
