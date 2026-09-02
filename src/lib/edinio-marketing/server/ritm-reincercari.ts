/*
  ═══════════════════════════════════════════════════════════════════════════════
  CAND SE REINCEARCA O CONVERSIE, SI CAND SE RENUNTA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E UN MODUL PROPRIU, PUR. Ritmul reincercarilor e locul unde se ascund
  doua defecte care nu cad niciodata la probe si se vad abia in productie:

    1. reincercare prea deasa  -> furnizorul ne limiteaza, si atunci pica si ce
                                  ar fi mers
    2. reincercare la nesfarsit -> un rand stricat e incercat de mii de ori, iar
                                  coada nu se goleste niciodata

  Aici se poate chema si proba fara nicio baza si fara nicio retea.
*/

/**
 * Pauzele dintre incercari, in minute.
 *
 * ⚠ CRESC, DAR NU LA NESFARSIT. Primele doua sunt scurte fiindca cele mai multe
 * esecuri sunt trecatoare (o retea care clipeste, un 503). De la a treia incolo
 * se rareste: daca n-a mers in douazeci de minute, nu e o pana de o clipa.
 *
 * ⚠ SI DE CE SE OPRESTE LA SASE. O conversie veche de o zi nu mai foloseste la
 * nimic: furnizorii oricum resping evenimentele mai vechi de sapte zile, iar
 * optimizarea invata din ce e proaspat. Dupa ultima incercare randul se abandoneaza
 * — se pastreaza, cu motivul scris, dar nu se mai atinge.
 */
export const PAUZE_MINUTE: readonly number[] = [1, 5, 20, 60, 240, 720];

/*
  ⚠ CU UNU MAI MULT DECAT PAUZELE, si asta nu e o scapare: intre sase incercari
  sunt sase asteptari doar daca ultima e urmata de o a saptea incercare. Scris
  `= PAUZE_MINUTE.length`, ultima pauza n-ar fi asteptata niciodata de nimeni.
*/
export const MAX_INCERCARI = PAUZE_MINUTE.length + 1;

export type Hotarare =
  | { fel: "reincearca"; pesteMinute: number }
  | { fel: "abandoneaza" };

/**
 * Ce se face dupa un esec, stiind cate incercari s-au facut deja.
 *
 * ⚠ `incercari` E NUMARUL DE DUPA esecul curent. Adica dupa primul esec se
 * cheama cu 1, si se primeste PRIMA pauza — deci indicele e `incercari - 1`.
 *
 * ⚠ AICI A FOST UN DEFECT, PANA PE 02.09.2026. Se citea `PAUZE_MINUTE[incercari]`,
 * deci sirul trait era [5, 20, 60, 240, 720]: pauza de un minut nu se folosea
 * NICIODATA, si se faceau cinci reincercari in loc de sase. Nu se vedea in cod —
 * tabloul era corect, indicele era gresit — si nicio proba care se uita la tablou
 * n-ar fi prins-o. A cazut abia la o proba care JOACA esecurile unul dupa altul si
 * compara sirul trait cu cel declarat.
 */
export function dupaEsec(incercari: number): Hotarare {
  if (!Number.isFinite(incercari) || incercari < 1) return { fel: "reincearca", pesteMinute: PAUZE_MINUTE[0] };
  if (incercari >= MAX_INCERCARI) return { fel: "abandoneaza" };
  return { fel: "reincearca", pesteMinute: PAUZE_MINUTE[incercari - 1] };
}

/** Clipa urmatoarei incercari, ca sir ISO pentru baza. */
export function candSeReincearca(acum: Date, pesteMinute: number): string {
  return new Date(acum.getTime() + pesteMinute * 60_000).toISOString();
}
