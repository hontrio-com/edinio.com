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
 * Valorile sunt cele de la titlurile de coloană din mega menu (`ColumnHeading`
 * din `site-header/MenuPieces.tsx`), cerute explicit ca reper: 11px, semibold,
 * majuscule, `tracking` 0.08em, `text-ink-3`. Când se schimbă acolo, se schimbă
 * și aici — altfel site-ul are două feluri de supratitlu.
 */
export function SectionEyebrow({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
      {label}
    </p>
  );
}
