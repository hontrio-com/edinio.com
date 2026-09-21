import { PIETE, type PiataPepita } from "./types";
import { rotunjeste2 } from "./pret";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PRETUL CAND PIATA ARE ALTA MONEDA DECAT MAGAZINUL
  ═══════════════════════════════════════════════════════════════════════════

  ⚠⚠ ASTA E LOCUL IN CARE SE POATE FACE CEA MAI SCUMPA GRESEALA DIN TOATA
  INTEGRAREA, si ea nu da nicio eroare.

  Feedul scrie moneda PIETEI in `<Currency>`, iar pretul vine din catalog, care
  e in moneda magazinului. Trimise asa cum sunt, un produs de 500 RON pleaca
  spre Ungaria ca `<Price>500</Price><Currency>HUF</Currency>` - adica vandut
  la aproximativ UN LA SUTA din pretul lui. XML-ul e valid, feedul raspunde 200,
  panoul arata verde, si nimeni nu afla pana cand nu vin comenzile.

  ⚠ ACELASI DEFECT A EXISTAT LA AboutYou si a fost gasit pe 26.08.2026: acelasi
  numar pleca la fiecare tara, iar 20 EUR se citea ca 20 PLN in Polonia. Acolo
  hotararea a fost sa NU convertim, ci sa OPRIM trimiterea, si motivul e scris
  acolo: „un curs, o data de referinta si o rotunjire sunt trei lucruri pe care
  nu le luam in locul comerciantului".

  ⚠ AICI COMERCIANTUL LE IA. El scrie cursul pentru fiecare piata; noi doar
  inmultim si aratam limpede ce iese. Fara curs scris, piata aceea NU trimite
  nimic - nici macar un feed gol, ci niciun feed. Tacerea e singurul raspuns
  cinstit cand nu stim pretul.

  ⚠ SI NU SE MISCA SINGUR. Cursul scris de el nu se actualizeaza de nicaieri:
  altfel preturile de pe marketplace s-ar schimba peste noapte, iar comenzile
  deja luate ar ramane la cursul vechi. Cand vrea altul, il schimba el si vede
  imediat ce preturi ies.
*/

/** Ce a hotarat comerciantul pentru o piata anume. */
export interface SetariPiata {
  /** Trimite feed catre piata asta? */
  activa: boolean;
  /**
   * Cate unitati din moneda pietei face o unitate din moneda magazinului.
   *
   * Pentru un magazin in RON si piata Ungaria: „1 RON = 79 HUF" se scrie `79`.
   * `null` inseamna „nescris", si atunci piata nu trimite.
   *
   * ⚠ Pentru piata cu ACEEASI moneda ca magazinul, cursul nu se cere si nu se
   * foloseste: ar fi un 1 pe care omul l-ar putea scrie gresit.
   */
  curs: number | null;
}

export type SetariPiete = Partial<Record<PiataPepita, SetariPiata>>;

/** De ce nu trimite o piata. `null` inseamna ca trimite. */
export type MotivOprire =
  | { cheie: "neactivata"; text: string }
  | { cheie: "fara-curs"; text: string }
  | { cheie: "curs-nevalid"; text: string };

/**
 * Poate pleca feedul catre piata asta?
 *
 * ⚠ SE CERE `monedaMagazinului` ANUME, nu se presupune RON: platforma are si
 * magazine pe alta moneda, iar pentru unul in EUR piata Germania nu mai are
 * nevoie de niciun curs.
 */
export function opreste(
  piata: PiataPepita, setari: SetariPiata | undefined, monedaMagazinului: string,
): MotivOprire | null {
  const p = PIETE[piata];
  if (!setari?.activa) {
    return { cheie: "neactivata", text: `Piața ${p.eticheta} nu e pornită.` };
  }
  if (aceeasiMoneda(piata, monedaMagazinului)) return null;

  if (setari.curs == null) {
    return {
      cheie: "fara-curs",
      text: `Nu ai scris cursul pentru ${p.eticheta}. Prețurile tale sunt în `
        + `${monedaMagazinului}, iar acolo se vinde în ${p.moneda}: fără curs, feedul ar anunța `
        + `numerele tale cu altă monedă pe ele. Feedul pentru ${p.eticheta} nu pleacă.`,
    };
  }
  if (!(Number.isFinite(setari.curs) && setari.curs > 0)) {
    return {
      cheie: "curs-nevalid",
      text: `Cursul scris pentru ${p.eticheta} nu e un număr mai mare ca zero.`,
    };
  }
  return null;
}

export function aceeasiMoneda(piata: PiataPepita, monedaMagazinului: string): boolean {
  return PIETE[piata].moneda.toUpperCase() === String(monedaMagazinului ?? "").trim().toUpperCase();
}

/**
 * Pretul din catalog, dus in moneda pietei.
 *
 * ⚠ INTOARCE `null` CAND NU SE POATE, nu numarul netrecut prin curs. Un `return
 * pret` pe ramura „fara curs" ar fi tocmai defectul: pretul ar pleca, doar cu
 * alta moneda scrisa langa el.
 */
export function pretulPietei(
  pret: number, piata: PiataPepita, setari: SetariPiata | undefined, monedaMagazinului: string,
): number | null {
  if (opreste(piata, setari, monedaMagazinului)) return null;
  if (aceeasiMoneda(piata, monedaMagazinului)) return rotunjeste2(pret);

  const curs = Number(setari!.curs);
  const rezultat = rotunjeste2(pret * curs);
  /*
    ⚠ Un pret care iese ZERO dupa conversie nu pleaca. Se intampla la monede
    „mari": un produs de 0,30 RON cu cursul catre euro da 0,06, iar cu un curs
    scris gresit ca 0,0001 da zero curat. Pepita respinge zero fara sa spuna de
    ce, deci se opreste aici, unde se poate arata langa produs.
  */
  return rezultat > 0 ? rezultat : null;
}

/** Cate zecimale are moneda pietei, pentru cum se scrie pe ecran. */
export function zecimale(piata: PiataPepita): number {
  /* ⚠ Forintul nu se imparte in subunitati folosite: preturile se scriu intregi. */
  return PIETE[piata].moneda === "HUF" ? 0 : 2;
}

/** „1 RON = 79 HUF", scris pentru om. */
export function scrieCursul(
  piata: PiataPepita, curs: number | null, monedaMagazinului: string,
): string {
  const p = PIETE[piata];
  if (aceeasiMoneda(piata, monedaMagazinului)) return `Aceeași monedă (${p.moneda}), fără curs.`;
  if (curs == null) return `1 ${monedaMagazinului} = ? ${p.moneda}`;
  return `1 ${monedaMagazinului} = ${curs} ${p.moneda}`;
}
