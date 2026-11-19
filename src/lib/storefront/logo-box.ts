/**
 * Cutia siglei magazinului, in antete si subsoluri.
 *
 * Regula e aceeasi peste tot: inaltimea o alege comerciantul din cursor, iar
 * latimea urmeaza proportiile fisierului, pana la de cinci ori inaltimea. Un
 * plafon exista pentru ca proportiile nu sunt ale noastre: o sigla lunga si
 * joasa (o semnatura, un cuvant scris de mana) ar fi cerut si de zece ori
 * inaltimea si ar fi impins restul randului.
 *
 * De ce nu mai e scrisa la fata locului: plafonul era `maxWidth: logoSize * 5`
 * in stilul incorporat, iar limitarea la latimea parintelui statea alaturi, in
 * clasa `max-w-full`. Stilul incorporat bate insa foaia de stiluri, deci
 * `max-width` era MEREU cele cinci inaltimi si `max-w-full` nu se aplica
 * niciodata. Ancora siglei se stramta cum trebuie — masurat 194px la o fereastra
 * de 320 — dar imaginea din ea ramanea la 280 si iesea cu 86px peste ea: intra
 * peste iconita de cos si impingea toata pagina in derulare laterala. Se vedea
 * de la 430px in jos, adica pe aproape orice telefon, si la fel in toate cele
 * sapte antete si in cele doua subsoluri cu sigla, fiindca marcajul era copiat.
 *
 * `min()` pune amandoua plafoanele in aceeasi declaratie, deci nu se mai pot
 * desparti: sigla creste pana la de cinci ori inaltimea, dar niciodata peste
 * locul pe care il are. Cand locul e mai mic, `object-contain` o micsoreaza
 * intreaga, nu o taie.
 *
 * ⚠ PLAFONUL `100%` TINE DOAR DACA ANCORA SIGLEI SE POATE STRAMTA (19.11.2026).
 * Procentul se masoara fata de ancora; o ancora cu `shrink-0` ramane cat sigla
 * si atunci `100%` nu mai plafoneaza nimic. Asa a ramas un antet adaugat mai
 * tarziu (`HeaderHipermarket`): pe un magazin real, sigla de 1600x289 la
 * inaltimea 56 cerea 310 px si scotea iconita cosului din ecran la 390 px
 * latime (pagina se derula lateral cu 47 px). Acolo `shrink-0` a ramas doar de
 * la `lg` in sus.
 *
 * `HeaderClassic` nu trece pe aici: isi tine plafonul in pixeli (4,2 inaltimi),
 * ca latimea randului de pe ecranele mari sa nu se schimbe. Acolo imaginea avea
 * `flex-shrink-0` si iesea din ancora ei pe telefoanele inguste; acum are
 * `min-w-0`, deci se stramta odata cu ancora.
 *
 * `sigla-se-stramta.test.ts` tine regula pe toate antetele.
 */
export function stilSigla(logoSize: number): { height: number; maxWidth: string } {
  return { height: logoSize, maxWidth: `min(${logoSize * 5}px, 100%)` };
}
