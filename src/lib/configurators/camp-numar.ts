/**
 * Dus-intorsul dintre ce tasteaza omul si numarul pe care il tine motorul.
 *
 * ═══ ⚠ DE CE E UN FISIER APARTE, SI NU IN COMPONENTA ═══
 *
 * Aici e singura bucata din campul de numar care poate gresi tacut, si e chiar bucata pe care o
 * componenta `.tsx` n-o poate proba: harnasamentul ruleaza `node --test` peste TypeScript curat,
 * fara JSX. Scrisa inauntru, ar fi ramas neverificata — exact drumul pe care au plecat si alte
 * logici din proiect.
 *
 * ═══ ⚠ CE PAZESTE, EXACT ═══
 *
 * Motorul tine numerele in unitatea de BAZA (mm, g), iar campul le arata in unitatea aleasa de
 * comerciant. Intre tastatura si motor e deci un drum dus-intors: text → numar → baza → numar →
 * text.
 *
 * Facut naiv, drumul asta MANANCA tastarea. Cine scrie „1,5" apasa intai virgula: „1," nu e un
 * numar, valoarea se goleste, campul se redeseneaza cu „1" — si virgula dispare de sub degete.
 * Aceeasi paguba la „0,30": zeroul de la coada e mancat inainte sa se poata scrie „0,305".
 *
 * Regula de aici: textul tastat ramane pe ecran cat timp INSEAMNA acelasi lucru cu valoarea din
 * motor. Cand valoarea vine din alta parte — o regula care limiteaza, o resetare — castiga
 * motorul.
 */

import {
  esteUnitateLungime, esteUnitateMasa, inGrame, inLungime, inMasa, inMilimetri,
} from "./unitati";
import type { NodNumar } from "./definitie";

export interface Conversie {
  /** Din unitatea de baza a motorului in cea de pe ecran. */
  dinBaza: (baza: number) => number;
  /** Invers. */
  catreBaza: (valoare: number) => number;
}

/**
 * Conversia potrivita unitatii nodului.
 *
 * ⚠ SI MASA, NU DOAR LUNGIMEA. Prima forma stia doar de lungimi, deci un camp in `kg` scria
 * kilogramele de-a dreptul acolo unde motorul astepta grame: o greutate de o mie de ori mai mica,
 * fara nicio eroare pe ecran si fara ca cineva sa aiba de unde afla.
 */
export function conversia(unitate: NodNumar["unitate"]): Conversie {
  if (esteUnitateLungime(unitate)) {
    return { dinBaza: (mm) => inLungime(mm, unitate), catreBaza: (v) => inMilimetri(v, unitate) };
  }
  if (esteUnitateMasa(unitate)) {
    return { dinBaza: (g) => inMasa(g, unitate), catreBaza: (v) => inGrame(v, unitate) };
  }
  // „buc" si campurile fara unitate n-au ce converti: baza lor E numarul scris.
  return { dinBaza: (n) => n, catreBaza: (n) => n };
}

/** O valoare de baza, scrisa asa cum se vede pe ecran. `undefined` da sirul gol. */
export function afisat(baza: number | undefined, c: Conversie): string {
  return baza === undefined ? "" : String(c.dinBaza(baza));
}

/**
 * Textul de pe ecran, adus in unitatea de baza.
 *
 * `undefined` cand nu iese niciun numar din el — sir gol, spatii, sau litere. ⚠ Virgula se
 * primeste la fel ca punctul: in Romania asa se scriu zecimalele, iar un camp care le refuza
 * arata „gresit" pentru cine tasteaza corect.
 */
export function dinText(text: string, c: Conversie): number | undefined {
  const t = text.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return c.catreBaza(n);
}

/**
 * Ce sir se arata in camp: ce a tastat omul, sau ce spune motorul.
 *
 * ⚠ Comparatia se face pe INTELES, nu pe litere. „1,50" si 15 mm inseamna acelasi lucru intr-un
 * camp in centimetri, deci textul ramane neatins si se poate tasta mai departe. Dar cand o regula
 * a limitat valoarea la 10 cm, intelesurile difera si pe ecran apare ce a hotarat motorul.
 */
export function textulDeAratat(text: string, curent: number | undefined, c: Conversie): string {
  const canonic = afisat(curent, c);
  const alNostru = afisat(dinText(text, c), c);
  return alNostru === canonic ? text : canonic;
}

/** Sirul are ceva scris in el, dar nu un numar. Se spune pe fata, nu se sterge pe tacute. */
export function eStricat(text: string, c: Conversie): boolean {
  return text.trim() !== "" && dinText(text, c) === undefined;
}

/**
 * „Intre 10 si 300 cm", cand se stie.
 *
 * ⚠ Se scrie fiindca campul e `type="text"`, deci n-are `min`/`max` native. Altfel cumparatorul
 * ar fi aflat ca a depasit abia din mesajul de eroare, dupa ce completa tot.
 */
export function descrieIntervalul(
  min: number | undefined,
  max: number | undefined,
  c: Conversie,
  unitate: NodNumar["unitate"],
): string | null {
  const u = unitate ? ` ${unitate}` : "";
  if (min !== undefined && max !== undefined) {
    return `Intre ${c.dinBaza(min)} si ${c.dinBaza(max)}${u}`;
  }
  if (min !== undefined) return `Cel putin ${c.dinBaza(min)}${u}`;
  if (max !== undefined) return `Cel mult ${c.dinBaza(max)}${u}`;
  return null;
}
