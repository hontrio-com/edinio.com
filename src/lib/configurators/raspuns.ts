/**
 * Raspunsul cumparatorului: e bun, si cat costa?
 *
 * ═══ ⚠ DE CE E UN SINGUR LOC, PENTRU AMANDOUA PARTILE ═══
 *
 * Browserul intreaba ca sa stie daca poate aprinde butonul si ce pret sa arate. Serverul intreaba
 * ca sa stie ce incaseaza. Scrise separat, cele doua ar fi divergit la prima schimbare, iar
 * divergenta s-ar fi vazut ca „pretul din cos nu e cel de pe pagina" — adica exact clasa de
 * defect pe care auditul de preturi al proiectului a inchis-o de patruzeci de ori.
 *
 * ⚠ AUTORITATEA RAMANE A SERVERULUI. Faptul ca e acelasi cod nu inseamna ca browserul e crezut:
 * el trimite numai VALORI, iar serverul le normalizeaza si le socoteste el insusi. Nu se
 * primeste de la client nici pretul, nici amprenta, nici versiunea.
 *
 * ═══ ⚠ CE SE VERIFICA, SI DE CE FIECARE ═══
 *
 * Motorul de reguli si cel de pret raspund la „ce se vede" si „cat face". Niciunul nu raspunde la
 * „are voie asta sa fie asa" — si tocmai acolo intra un cumparator care si-a scris singur cererea:
 *
 *   - un camp care nu exista in definitie          → se ARUNCA (o fila veche, un camp scos);
 *   - o valoare de alt fel decat nodul             → se ARUNCA (text pe un camp de numar);
 *   - o optiune care nu exista sau nu se poate alege → REFUZ (altfel se cumpara „aurit" gratis);
 *   - un camp obligatoriu necompletat              → REFUZ;
 *   - un numar in afara limitelor comerciantului   → REFUZ (o rama de 90 de metri nu se face);
 *   - prea multe sau prea putine bifate            → REFUZ;
 *   - un text mai lung decat s-a spus              → REFUZ (gravura nu incape);
 *   - regulile nu s-au asezat                      → REFUZ (nu se serveste un pret dintr-o stare care oscileaza);
 *   - regulile spun ele insele ca nu se poate      → REFUZ.
 *
 * ⚠ ARUNCAREA e alegerea sigura pentru ce nu recunoastem, REFUZUL pentru ce recunoastem si e
 * gresit. O valoare necunoscuta pastrata ar fi intrat in amprenta si in comanda fara sa fi fost
 * platita; una gresita trecuta cu vederea ar fi fost vanduta pe degeaba.
 */

import type { Compilat } from "./compileaza";
import { producesValoare, type Nod, type Definitie } from "./definitie";
import { aplicaRegulile, esteCerut, optiuniDeAles, type Stare } from "./reguli";
import { calculeazaPretul, type Descompunere } from "./pret";
import { normalizeazaValori, type Valori } from "./valori";
import { amprentaConfiguratiei } from "./amprenta";
import { eNumarBun } from "./unitati";

export interface Motiv {
  /** Nodul de vina, cand se stie. Ecranul il poate lumina. */
  idNod?: string;
  text: string;
}

export type Verdict =
  | {
      ok: true;
      /** Valorile curatate — numai campuri cunoscute, de felul potrivit, si vizibile. */
      valori: Valori;
      amprenta: string;
      stare: Stare;
      /** Pretul unitar, NEROTUNJIT. Vezi nota de pe `Descompunere.unitar`. */
      unitar: number;
      descompunere: Descompunere;
    }
  | {
      ok: false;
      motive: Motiv[];
      /** ⚠ Mereu prezenta: ecranul are nevoie de ea ca sa stie ce campuri sa deseneze. */
      stare: Stare;
    };

/**
 * Verdictul intreg, pentru o bucata.
 *
 * `pretProdus` e pretul din CATALOG al produsului sau al variantei alese. Serverul il aduce el;
 * browserul il are din pagina. Nu vine niciodata din cererea cumparatorului.
 */
export function verificaRaspunsul(
  compilat: Compilat,
  brut: unknown,
  pretProdus: number,
): Verdict {
  const { definitie, reguli, pretuire } = compilat;

  /*
   * ⚠ Se curata INAINTE de reguli. O valoare pusa pe un camp care nu exista ar fi ajuns intacta
   * pana in amprenta si in instantaneul comenzii: doua comenzi identice ar fi aratat diferit, si
   * nimeni n-ar fi avut de unde sti de ce.
   */
  const valori = doarCampurileCunoscute(definitie, normalizeazaValori(brut));
  const stare = aplicaRegulile(definitie, reguli, valori);

  const motive: Motiv[] = [];

  /*
   * ⚠ O definitie care OSCILEAZA nu se vinde.
   *
   * `aplicaRegulile` se opreste dupa `MAX_TRECERI` si spune ca n-a ajuns la o stare stabila. Ce
   * iese atunci e o fotografie a unei stari intermediare: alt camp vizibil, alt pret, de la o
   * rulare la alta. Servit, browserul si serverul ar fi putut ajunge la numere diferite pentru
   * exact aceleasi alegeri.
   */
  if (stare.neasezat) {
    motive.push({ text: "Configuratorul are reguli care se bat cap in cap. Anunta magazinul." });
    return { ok: false, motive, stare };
  }

  /*
   * ⚠ AICI NU SE MAI VERIFICA DACA NODUL E ASCUNS, si e o alegere, nu o scapare.
   *
   * `aplicaRegulile` goleste valorile campurilor ascunse, iar `esteCerut` raspunde NU pentru ele.
   * Deci un camp ascuns nici nu plateste, nici nu blocheaza — de doua ori, in `reguli.ts`. O a
   * treia paza aici ar fi fost una pe care nicio schimbare n-o poate face sa cada, adica un rand
   * care linisteste fara sa apere. Cele doua probe de mai jos raman, si prind regresia acolo unde
   * chiar poate aparea.
   */
  for (const nod of nodurile(definitie)) {
    if (!producesValoare(nod)) continue;
    verificaNodul(definitie, nod, stare, motive);
  }

  // Opririle puse chiar de comerciant, prin reguli. Sunt scrise de el, deci se arata ca atare.
  for (const oprire of stare.opriri) motive.push({ text: oprire });

  if (motive.length > 0) return { ok: false, motive, stare };

  const pret = calculeazaPretul({ definitie, pretuire, stare, pretProdus });
  if (!pret.ok) {
    /*
     * ⚠ NU se cade pe pretul de baza. Un calcul care n-a iesit inseamna ca nu stim cat costa, iar
     * vandut la pretul de baza ar fi insemnat sa dam gratis tot ce a configurat omul.
     */
    motive.push({ text: "Nu am putut calcula pretul acestei configuratii.", idNod: pret.id });
    return { ok: false, motive, stare };
  }

  return {
    ok: true,
    valori: stare.valori,
    amprenta: amprentaConfiguratiei(stare.valori),
    stare,
    unitar: pret.d.unitar,
    descompunere: pret.d,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CURATAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Toate nodurile definitiei, in ordine. */
export function nodurile(d: Definitie): Nod[] {
  const out: Nod[] = [];
  for (const pas of d.pasi ?? []) {
    for (const grup of pas.grupuri ?? []) {
      for (const nod of grup.noduri ?? []) out.push(nod);
    }
  }
  return out;
}

/**
 * Numai campurile care exista in definitie SI au felul potrivit.
 *
 * ⚠ Felul se verifica, nu se presupune. `normalizeazaValori` garanteaza ca fiecare valoare are o
 * forma buna, dar nu ca e forma pe care o astepta CHIAR nodul acela: un `{f:"numar"}" trimis pe
 * un camp de alegere ar fi trecut de normalizare, n-ar fi platit nimic, si ar fi intrat in
 * amprenta — adica in identitatea liniei de cos.
 */
function doarCampurileCunoscute(d: Definitie, valori: Valori): Valori {
  const cunoscute = new Map(nodurile(d).map((n) => [n.id, n]));
  const out: Valori = {};
  for (const [id, v] of Object.entries(valori)) {
    const nod = cunoscute.get(id);
    if (!nod || !producesValoare(nod)) continue;
    if (v.f !== nod.fel) continue;
    out[id] = v;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   VERIFICAREA UNUI NOD
   ═══════════════════════════════════════════════════════════════════════════ */

function verificaNodul(d: Definitie, nod: Nod, stare: Stare, motive: Motiv[]): void {
  const v = stare.valori[nod.id];

  /*
   * ⚠ Un camp OBLIGATORIU necompletat opreste comanda. Nu e o formalitate: fara gravura, un
   * produs personalizat pleaca in productie fara sa se stie ce se scrie pe el, si abia atelierul
   * afla. `esteCerut` tine seama si de regulile care fac un camp obligatoriu abia in anumite
   * conditii, si de cele care il fac optional inapoi.
   */
  if (v === undefined) {
    if (esteCerut(d, nod, stare)) {
      motive.push({ idNod: nod.id, text: `Completeaza „${nod.eticheta}”.` });
    }
    return;
  }

  switch (nod.fel) {
    case "text": {
      if (v.f !== "text") return;
      const n = v.v.length;
      if (nod.maxCaractere !== undefined && n > nod.maxCaractere) {
        motive.push({ idNod: nod.id, text: `„${nod.eticheta}” poate avea cel mult ${nod.maxCaractere} caractere.` });
      }
      if (nod.minCaractere !== undefined && n < nod.minCaractere) {
        motive.push({ idNod: nod.id, text: `„${nod.eticheta}” cere cel putin ${nod.minCaractere} caractere.` });
      }
      return;
    }

    case "numar": {
      if (v.f !== "numar") return;
      if (!eNumarBun(v.v)) {
        motive.push({ idNod: nod.id, text: `„${nod.eticheta}” nu e un numar bun.` });
        return;
      }
      /*
       * ⚠ Limitele din REGULI bat pe cele din definitie, si tot ele se verifica.
       * Verificate numai cele din definitie, o regula care stramteaza intervalul („la materialul
       * subtire, cel mult 2 m") ar fi fost doar un text pe ecran, nu o margine.
       */
      const lim = stare.limite.get(nod.id);
      const min = lim?.min ?? nod.min;
      const max = lim?.max ?? nod.max;
      if (min !== undefined && v.v < min) {
        motive.push({ idNod: nod.id, text: `„${nod.eticheta}” e sub minimul cerut.` });
      }
      if (max !== undefined && v.v > max) {
        motive.push({ idNod: nod.id, text: `„${nod.eticheta}” trece peste maximul cerut.` });
      }
      return;
    }

    case "alegere": {
      if (v.f !== "alegere") return;
      const permise = optiuniDeAles(nod, stare);
      if (!permise.includes(v.v)) {
        /*
         * ⚠ Aici e portita cea mai scumpa din toata functia. `optiuniDeAles` stie si ce optiuni a
         * stins comerciantul, si ce au scos regulile. Fara verificarea asta, un cumparator care
         * trimite chiar id-ul unei optiuni scoase primeste pretul ei — sau, daca optiunea a fost
         * stearsa, nu primeste niciun spor de pret si ia varianta scumpa pe gratis.
         */
        motive.push({ idNod: nod.id, text: `Alegerea de la „${nod.eticheta}” nu se poate face.` });
      }
      return;
    }

    case "alegeri": {
      if (v.f !== "alegeri") return;
      const permise = new Set(optiuniDeAles(nod, stare));
      for (const ales of v.v) {
        if (!permise.has(ales)) {
          motive.push({ idNod: nod.id, text: `O alegere de la „${nod.eticheta}” nu se poate face.` });
          break;
        }
      }
      if (nod.maxAlese !== undefined && v.v.length > nod.maxAlese) {
        motive.push({ idNod: nod.id, text: `La „${nod.eticheta}” poti alege cel mult ${nod.maxAlese}.` });
      }
      /*
       * ⚠ Minimul se verifica numai cand s-a ales CEVA. Un camp neobligatoriu cu „cel putin
       * doua" inseamna „daca alegi, alege cel putin doua", nu „esti obligat sa alegi". Ce e cu
       * adevarat obligatoriu spune `obligatoriu`, si se verifica mai sus.
       */
      if (nod.minAlese !== undefined && v.v.length < nod.minAlese) {
        motive.push({ idNod: nod.id, text: `La „${nod.eticheta}” trebuie alese cel putin ${nod.minAlese}.` });
      }
      return;
    }

    case "fisiere": {
      if (v.f !== "fisiere") return;
      if (nod.maxFisiere !== undefined && v.v.length > nod.maxFisiere) {
        motive.push({ idNod: nod.id, text: `La „${nod.eticheta}” poti incarca cel mult ${nod.maxFisiere} fisiere.` });
      }
      return;
    }

    default:
      return;
  }
}

