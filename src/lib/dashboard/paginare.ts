/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RĂSFOIREA UNEI LISTE DIN PANOU                                (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ `catePagini` ERA SCRISĂ DE DOUĂ ORI: în `lib/perioade.ts` (Coșuri
 * abandonate) și în `lib/discounts/lista.ts` (Discounturi), cu corpuri
 * DEOSEBITE — cea din `perioade.ts` nu se apăra nici de un total negativ, nici
 * de `pePagina = 0`, și ar fi întors `Infinity`. Când a venit rândul Ofertelor,
 * a treia copie ar fi fost a treia șansă să se despartă.
 *
 * Amândouă cheamă acum funcția de aici, și cea de aici e varianta apărată.
 */

/**
 * Câte pagini are mulțimea filtrată.
 *
 * ⚠ Zero rânduri înseamnă O pagină, nu zero: altfel „pagina 1 din 0” ar fi scris
 * pe ecran, iar butoanele de răsfoire s-ar fi purtat ciudat pe o listă goală.
 */
export function catePagini(cateSunt: number, pePagina: number): number {
  return Math.max(1, Math.ceil(Math.max(0, cateSunt) / Math.max(1, pePagina)));
}

/**
 * Cuvintele cu care se numără lucrul din listă.
 *
 * ⚠ ROMÂNA CERE TREI FORME, nu două: „1 cod”, „11 coduri”, „137 de coduri”.
 * Scrisă cu una singură, fiecare listă din panou ar fi spus „137 coduri”.
 */
export interface CuvinteleListei {
  /** Când nu e niciunul: „Niciun cod”, „Nicio ofertă”. */
  niciunul: string;
  /** Pentru exact unul: „cod”, „ofertă”. */
  unul: string;
  /** Pentru 2–19: „coduri”, „oferte”. */
  putine: string;
  /** De la 20 în sus, cu „de”: „de coduri”, „de oferte”. */
  multe: string;
}

/**
 * Ce scrie sub listă: „1–25 din 137 de coduri”.
 *
 * ⚠ SE SPUNE ȘI CÂT E TOTALUL, nu doar pagina. O listă care arată douăzeci și
 * cinci de rânduri fără să spună câte sunt îl lasă pe comerciant să creadă că
 * atâtea are — exact felul de tăcere pe care îl vânez peste tot.
 */
export function rezumatulPaginii(
  cateSunt: number,
  pagina: number,
  pePagina: number,
  cuvinte: CuvinteleListei,
): string {
  if (cateSunt === 0) return cuvinte.niciunul;
  const de = (pagina - 1) * pePagina + 1;
  const la = Math.min(cateSunt, pagina * pePagina);
  const cuvant = cateSunt === 1 ? cuvinte.unul : cateSunt < 20 ? cuvinte.putine : cuvinte.multe;
  if (cateSunt <= pePagina) return `${cateSunt} ${cuvant}`;
  return `${de}–${la} din ${cateSunt} ${cuvant}`;
}
