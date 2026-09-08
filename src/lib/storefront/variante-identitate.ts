import { VARIANT_TITLE_SEP } from "./variants";
import { amprentaCombinatie } from "@/lib/pepita/identitate";

/*
 * ⚠ TIPURILE SUNT STRUCTURALE, NU CELE DIN `variants.ts`, si nu din gust.
 *
 * Formularul de produs are propriile lui forme: optiunea de acolo poarta si `inputValue`, iar
 * combinatia are `gtin` OBLIGATORIU. Legate de tipurile din vitrina, functiile de aici n-ar fi
 * putut fi chemate tocmai din locul in care se face redenumirea. Genericele pastreaza forma
 * apelantului: ce intra, aia iese, cu titlul rescris.
 */
export interface OptiuneCuValori { values: string[] }
export interface CombinatieCuTitlu { title: string; uid?: string }

/* ═══════════════════════════════════════════════════════════════════════════
   IDENTITATEA UNEI COMBINATII, CARE NU SE SCHIMBA CAND II SCHIMBI NUMELE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ CE CERE PEPITA, TEXTUAL: `<Id>` „nem változik", nu se schimba cand se schimba datele
   produsului. Pana azi `<Id>`-ul unei combinatii se deriva din TITLUL ei („S / Roșu"), deci o
   redenumire il schimba — iar la ei apare un articol nou, cu istoricul pierdut.

   ⚠ SI IN EDINIO REDENUMIREA NICI NU EXISTA CA OPERATIE. Valorile se pot doar adauga si sterge,
   iar `generateCombinations` potriveste combinatiile vechi DUPA TITLU: „Roșu" sters si „Roșu
   aprins" adaugat inseamna combinatie ARUNCATA si alta nascuta goala, fara pret, SKU, EAN, stoc si
   imagine. Deci n-avea rost sa dam identitate stabila unui rand care oricum murea.

   ═══ ⚠ CUM SE FACE FARA MIGRATIE, SI FARA SA SE MISTE NICIUN `<Id>` DE AZI ═══

   `uid`-ul unei combinatii se SEMANA din amprenta titlului ei de acum. Amprenta e chiar ce
   folosea `idArticol` pana azi, si are aceeasi forma (16 hexa). Deci:

     * pentru tot ce exista, `<Id>`-ul iese IDENTIC cu cel trimis pana acum — nicio oferta nu se
       naste din nou la Pepita, la Google sau la Meta;
     * din clipa in care combinatia are `uid`, el nu se mai schimba niciodata, oricat i-ai schimba
       numele.

   Nicio migratie peste cele 47.431 de combinatii, niciun `desfaIdArticol` de rescris, si nicio
   fereastra in care doua sisteme spun lucruri diferite.
*/

/** Forma unui `uid` de combinatie: aceeasi cu a amprentei, ca `<Id>`-ul sa nu se schimbe. */
const FORMA_UID = /^[0-9a-f]{16}$/;

/**
 * Identitatea stabila a unei combinatii: `uid`-ul ei, sau amprenta titlului daca inca n-are.
 *
 * ⚠ CADEREA PE TITLU NU E O SLABICIUNE, E MIGRAREA. Combinatiile scrise inainte de 08.09.2026
 * n-au `uid`; pentru ele raspunsul e exact ce era si pana acum, deci nimic nu se muta. Prima
 * salvare a produsului le da unul, semanat din aceeasi amprenta.
 */
export function identitateCombinatie(combo: { title: string; uid?: string }): string {
  return combo.uid && FORMA_UID.test(combo.uid) ? combo.uid : amprentaCombinatie(combo.title);
}

/**
 * Da `uid` combinatiilor care n-au, SEMANAT din titlul lor de acum.
 *
 * ⚠ Se cheama la fiecare regenerare a listei din formular, deci si la simpla deschidere-si-salvare
 * a unui produs vechi. De la momentul acela incolo, identitatea lui e legata de rand, nu de text.
 */
export function cuUid<C extends CombinatieCuTitlu>(combinatii: C[]): C[] {
  return combinatii.map((c) => (c.uid && FORMA_UID.test(c.uid) ? c : { ...c, uid: amprentaCombinatie(c.title) }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   DESPARTIREA UNUI TITLU IN VALORILE LUI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Din „S / Roșu" inapoi in `["S", "Roșu"]`, folosind valorile DECLARATE ale optiunilor.
 *
 * ═══ ⚠ DE CE NU `title.split(" / ")` ═══
 *
 * Fiindca o valoare poate CONTINE chiar separatorul. In productie exista „Alb / Crem" ca valoare
 * de sine statatoare (vezi nota din `variants.ts`), iar un titlu ca „Alb / Crem / XL" s-ar rupe in
 * TREI bucati in loc de doua. O redenumire facuta pe despartirea aia ar lega comanda de alta
 * marime — cea mai scumpa greseala cu putinta aici.
 *
 * Deci nu se ghiceste: se POTRIVESTE, axa cu axa, numai cu valorile pe care produsul le declara,
 * incercandu-le pe cele mai lungi intai. Ce nu se potriveste exact intoarce `null`, si atunci
 * apelantul nu are voie sa presupuna nimic.
 */
export function desparteTitlu(titlu: string, optiuni: OptiuneCuValori[]): string[] | null {
  const axe = optiuni.filter((o) => o.values.length > 0);
  if (axe.length === 0) return null;

  function incearca(rest: string, i: number): string[] | null {
    if (i === axe.length) return rest === "" ? [] : null;
    /* ⚠ Cele mai lungi INTAI: „Alb / Crem" trebuie incercata inaintea lui „Alb". */
    const valori = [...axe[i].values].sort((a, b) => b.length - a.length);
    for (const v of valori) {
      const ultima = i === axe.length - 1;
      const asteptat = ultima ? v : v + VARIANT_TITLE_SEP;
      if (!rest.startsWith(asteptat)) continue;
      const maiDeparte = incearca(rest.slice(asteptat.length), i + 1);
      if (maiDeparte) return [v, ...maiDeparte];
    }
    return null;
  }

  return incearca(titlu, 0);
}

/** Titlul unei combinatii din valorile ei. Perechea lui `desparteTitlu`. */
export function faTitlu(valori: string[]): string {
  return valori.join(VARIANT_TITLE_SEP);
}

/* ═══════════════════════════════════════════════════════════════════════════
   REDENUMIREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Redenumire<O, C> {
  optiuni: O[];
  combinatii: C[];
  /** Cate combinatii n-au putut fi despartite si au ramas neatinse. Se arata omului. */
  neatinse: number;
}

/**
 * Redenumeste o valoare de optiune, PASTRAND randurile.
 *
 * ═══ ⚠ ASTA E PIESA CARE LIPSEA ═══
 *
 * Pana azi singurul fel de a schimba „Roșu" in „Roșu aprins" era sa stergi valoarea si sa adaugi
 * alta — iar asta ARUNCA toate combinatiile care o contineau, cu pretul, SKU-ul, EAN-ul, stocul si
 * imaginea lor. Un `uid` stabil n-ar fi ajutat cu nimic, fiindca randul care il purta murea.
 *
 * ⚠ CE FACE, PE RAND: schimba valoarea in optiune, rescrie titlurile combinatiilor care o contin
 * PE AXA EI (nu oriunde in text), si lasa `uid`-ul neatins. Restul campurilor raman ale randului.
 *
 * ⚠ CE NU FACE: nu atinge combinatiile pe care nu le poate desparti fara ghicit. Ele se numara si
 * se spun. Mai bine o combinatie ramasa cu numele vechi, vizibila, decat una legata gresit.
 */
export function redenumesteValoare<O extends OptiuneCuValori, C extends CombinatieCuTitlu>(
  optiuni: O[],
  combinatii: C[],
  indexOptiune: number,
  valoareNoua: string,
  valoareVeche: string,
): Redenumire<O, C> {
  const nou = valoareNoua.trim();
  if (!nou || nou === valoareVeche) return { optiuni, combinatii, neatinse: 0 };

  const optiuniNoi = optiuni.map((o, i) => (
    i === indexOptiune ? { ...o, values: o.values.map((v) => (v === valoareVeche ? nou : v)) } : o
  ));

  /*
   * ⚠ DESPARTIREA SE FACE CU OPTIUNILE VECHI, nu cu cele noi: titlurile de pe rand sunt scrise cu
   * valorile de dinainte. Cu cele noi, nicio combinatie nu s-ar mai fi potrivit, si toate ar fi
   * iesit „neatinse" — adica reparatia ar fi raportat linistit ca n-a avut ce face.
   */
  const axe = optiuni.filter((o) => o.values.length > 0);
  const axa = axe.findIndex((o) => o === optiuni[indexOptiune]);
  if (axa === -1) return { optiuni: optiuniNoi, combinatii, neatinse: 0 };

  let neatinse = 0;
  const combinatiiNoi = cuUid(combinatii).map((c) => {
    const valori = desparteTitlu(c.title, optiuni);
    if (!valori || valori[axa] !== valoareVeche) {
      if (!valori && c.title.includes(valoareVeche)) neatinse++;
      return c;
    }
    const rescrise = valori.map((v, i) => (i === axa ? nou : v));
    /* ⚠ `uid` ramane. El e chiar lucrul pentru care exista toata functia asta. */
    return { ...c, title: faTitlu(rescrise) };
  });

  return { optiuni: optiuniNoi, combinatii: combinatiiNoi, neatinse };
}
