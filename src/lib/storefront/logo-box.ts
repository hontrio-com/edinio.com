import type { CSSProperties } from "react";

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
 *
 * ⚠ Din 24.11.2026 forma asta, cu inaltimea scrisa in stilul incorporat, a ramas
 * doar a SUBSOLURILOR. Antetele au `stilSiglaAntet`, mai jos: acolo inaltimea
 * difera intre telefon si calculator, iar un stil incorporat nu poate purta o
 * regula pe latimea ecranului.
 */
export function stilSigla(logoSize: number): { height: number; maxWidth: string } {
  return { height: logoSize, maxWidth: `min(${logoSize * 5}px, 100%)` };
}

/*
 * ═══ SIGLA DIN ANTET: PANA LA 96 PX PE CALCULATOR, CEL MULT 56 PE TELEFON (24.11.2026) ═══
 *
 * DE CE. Cursorul se oprea la 56 px, o limita gandita pentru sigle LATE: un cuvant
 * scris pe un rand (7:1) are la 56 px inaltime 280 px latime si umple antetul. O
 * sigla aproape patrata (un semn rotund, 5:3) are la aceeasi inaltime doar 93 px
 * latime si se pierde intr-un antet de 1440. Gasit pe un magazin real, a carui
 * proprietara dusese cursorul la capat si tot mica o vedea. Marimea fisierului nu
 * ajuta: inaltimea o da cursorul, latimea iese din proportii.
 *
 * CE S-A SCHIMBAT, si ce NU:
 *  - pe ecranele late (de la `lg`, 1024 px) sigla poate avea pana la `SIGLA_MAX`;
 *  - sub `lg` ramane la cel mult `SIGLA_MAX_TELEFON`, adica exact capatul de pana
 *    acum: randul antetului de pe telefon are 64 px (56 la „pana colorata”), iar un
 *    antet lipit de marginea de sus care ar creste cu sigla ar manca din ecranul mic;
 *  - de la `lg` in sus, randul antetului se inalta odata cu sigla (`stilRandAntet`);
 *    inaltimile lui de pana acum (64 pana la 104 px, dupa antet) raman minimul.
 *
 * ⚠ PANA LA 56 PX NIMIC NU SE MISCA, PRIN CONSTRUCTIE: cele doua inaltimi sunt
 * egale, `stilRandAntet` nu intoarce nimic, iar variabilele de latime de mai jos
 * lipsesc. Masurat in productie inainte de schimbare: din 181 de magazine, unul
 * singur avea peste 56 (64, pus de mana), iar la el nimic vizibil nu se schimba
 * (sigla lui lata e limitata de latime pe telefon, iar pe calculator randul de 96 px
 * o incape). Proba tine egalitatea pe fiecare valoare de la 24 la 56, iar
 * masuratoarea din browser a comparat cutiile la pixel: 1440 de perechi, toate egale.
 *
 * ⚠ PESTE 56 PX SIGLA CRESTE IN INALTIME, DAR NU SE MAI LATESTE. Latimea ei se
 * opreste la cat putea avea pana acum la capatul cursorului: 5 x 56 = 280 px (la
 * antetul simplu, 4,2 x 56). Marimile mari sunt pentru siglele patrate sau rotunde;
 * una lata umplea deja antetul.
 *
 *   De ce, masurat intr-un browser, pe toate cele noua antete: lasata sa se lateasca
 *   pana la 5 x 96 = 480 px, o sigla lata scotea pagina din ecran pe calculator.
 *   La 1024 px latime: antetul cu cautare 44 px, cel editorial 56, „market” 28,
 *   „hipermarket” 94 (sigla 7:1) si pana la 581 (sigla 12:1). Cu latimea oprita la
 *   280, niciun antet nu primeste o sigla mai lata decat una pe care o purta deja.
 *
 *   ⚠ Si plafonul de peste 56 e scris in PIXELI, fara `100%` (`--sigla-lat`). Cu un
 *   procent in `max-width`, browserul nu tine cont de plafon cand socoteste cat loc
 *   cere ancora siglei: ii da latimea intreaga a fisierului la inaltimea aceea (o
 *   sigla 12:1 la 96 px „cere” 1152 px), iar cautarea de alaturi ramane fara loc.
 *   Asa se intampla si azi sub 56 px la siglele mai late de 5:1 (ancora e mai lata
 *   decat sigla desenata), dar acolo NU s-a atins nimic: ar fi mutat antetul unor
 *   magazine care merg. Fiindca plafonul in pixeli nu mai urmeaza singur ancora cand
 *   ea se stramta, imaginea primeste si `min-width: 0` (`--sigla-stramta`), ca in
 *   antetul simplu.
 *
 * CUM. Un stil incorporat nu poate depinde de latimea ecranului, deci aici se
 * scriu doar VARIABILE, iar regulile stau in `app/stil-comun.css` (`.st-sigla`,
 * `.st-sigla-clasic`, `.st-rand-sigla`), cu acelasi prag ca `lg`.
 */

/** Capetele cursorului „Mărimea logo-ului” din editor, in pixeli. Cititi de editor si de randare: o singura copie. */
export const SIGLA_MIN = 24;
export const SIGLA_MAX = 96;
/** Sub `lg`, sigla din antet nu trece de atat. E capatul vechi al cursorului, deci pe telefon nimic nu creste. */
export const SIGLA_MAX_TELEFON = 56;
/** Inaltimea cu care porneste un magazin care n-a atins cursorul. */
export const SIGLA_IMPLICITA = 36;
/** De cate ori inaltimea poate fi lata sigla (ca in `stilSigla` si in `.st-sigla`). */
export const PLAFON_LATIME = 5;
/** Cea mai lata sigla pe care o poate purta un antet: cat avea una lata la capatul vechi al cursorului. */
export const SIGLA_LATIME_MAX = SIGLA_MAX_TELEFON * PLAFON_LATIME;

/**
 * Inaltimea ceruta, adusa intr-o forma cu care se poate desena: o valoare stricata
 * (lipsa, zero, text) cade pe cea implicita, iar una peste capat se opreste la capat.
 * Capatul de JOS nu se impune: temele pornesc si de la 30, iar o valoare mica nu strica nimic.
 */
export function inaltimeSigla(logoSize: number): number {
  if (typeof logoSize !== "number" || !Number.isFinite(logoSize) || logoSize <= 0) return SIGLA_IMPLICITA;
  return Math.min(logoSize, SIGLA_MAX);
}

/**
 * Cat de inalt trebuie sa fie randul antetului ca sigla sa aiba aer deasupra si dedesubt.
 *
 * La 56 px raman 4 px sus si 4 jos, cat lasa azi randul de 64 la capatul vechi al
 * cursorului. De acolo aerul creste cu o cincime din ce depaseste 56, pana la 12 px
 * la capatul nou: o sigla de 96 lipita la 4 px de margini arata inghesuita.
 */
export function randAntet(inaltime: number): number {
  return Math.round(inaltime + 8 + Math.max(0, inaltime - SIGLA_MAX_TELEFON) * 0.4);
}

/**
 * Variabilele siglei din antet, puse pe imagine. Regula care le citeste: `.st-sigla` / `.st-sigla-clasic`.
 *
 * Pana la capatul vechi sunt doar cele doua inaltimi, egale. Peste el se adauga plafonul de latime in pixeli si
 * ingaduinta de a se stramta (vezi nota de sus): amandoua lipsesc sub 56 px, deci acolo regula ramane cea de pana acum.
 */
export function stilSiglaAntet(logoSize: number): CSSProperties {
  const inaltime = inaltimeSigla(logoSize);
  const stil: Record<string, string> = {
    "--sigla": `${inaltime}px`,
    "--sigla-tel": `${Math.min(inaltime, SIGLA_MAX_TELEFON)}px`,
  };
  if (inaltime > SIGLA_MAX_TELEFON) {
    stil["--sigla-lat"] = `${SIGLA_LATIME_MAX}px`;
    stil["--sigla-stramta"] = "0px";
  }
  return stil as CSSProperties;
}

/**
 * Variabila randului de antet, pusa pe rand (sau pe un stramos al lui). Regula care o citeste: `.st-rand-sigla`.
 * Pana la capatul vechi nu intoarce nimic: randul ramane la inaltimea lui din clase.
 */
export function stilRandAntet(logoSize: number): CSSProperties {
  const inaltime = inaltimeSigla(logoSize);
  if (inaltime <= SIGLA_MAX_TELEFON) return {};
  return { "--sigla-rand": `${randAntet(inaltime)}px` } as CSSProperties;
}
