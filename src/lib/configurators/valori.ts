/**
 * Ce alege cumparatorul: forma valorilor, si normalizarea lor.
 *
 * ═══ DE CE E UN MODUL SEPARAT ═══
 *
 * Valorile sunt singurul lucru care circula pe TOT drumul: de la pagina de produs, prin cos,
 * prin repretuirea de pe server, prin comanda, pana in instantaneul pastrat pe linie. Definitia
 * configuratorului se schimba sub ele — comerciantul publica o versiune noua — dar valorile
 * trebuie sa ramana citibile.
 *
 * De aceea aici NU intra nimic din definitie: nici etichete, nici preturi, nici unitatea pe
 * care si-a ales-o comerciantul in interfata. Doar id-ul stabil al campului si valoarea, in
 * unitatea de baza (vezi `unitati.ts`).
 *
 * ⚠ VALORILE VIN DIN LOCALSTORAGE, DECI SUNT TEXT SCRIS DE ORICINE.
 *
 * `normalizeazaValori` e granita. Ce nu se incadreaza se ARUNCA, nu se repara pe jumatate —
 * aceeasi regula ca la `normalizeazaCos` din cos, si din acelasi motiv: o valoare inventata
 * aici ajunge intr-o comanda.
 */

import { eNumarBun } from "./unitati";

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFOANE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cate campuri poate purta o configuratie. Plafon de siguranta, nu de abonament. */
export const MAX_CAMPURI = 200;
/** Cate caractere poate avea un text al cumparatorului. */
export const MAX_LUNGIME_TEXT = 2000;
/** Cate alegeri poate face un camp cu bifare multipla. */
export const MAX_ALEGERI = 50;
/** Cate fisiere poate purta un camp. */
export const MAX_FISIERE = 10;
/** Cat de lung poate fi un id stabil (uuid = 36). */
const MAX_LUNGIME_ID = 64;

/* ═══════════════════════════════════════════════════════════════════════════
   FORMA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un fisier incarcat de cumparator, asa cum il tine configuratia.
 *
 * ⚠ NU adresa. Adresa unui fisier privat se compune pe server, la cerere, si expira; pastrata
 * aici, ar fi ajuns in localStorage, in `orders.items` si in emailuri, adica exact peste tot
 * unde nu trebuie. Se tine ID-UL, iar transformarile de decupare stau langa el fiindca fac
 * parte din ce a ales omul, nu din fisier.
 */
export interface FisierAles {
  /** Id-ul activului din depozitul nostru. Neghicibil, emis de server. */
  id: string;
  /** Decupare si asezare, in fractiuni din zona de personalizare. Optionale. */
  t?: { x: number; y: number; s: number; r: number };
}

export type Valoare =
  /** In unitatea de BAZA: milimetri, grame, bucati. Niciodata in cea aleasa de comerciant. */
  | { f: "numar"; v: number }
  | { f: "text"; v: string }
  /** Id-ul stabil al optiunii alese. Niciodata eticheta ei. */
  | { f: "alegere"; v: string }
  /** Id-uri stabile, tinute SORTATE — ordinea bifarii nu e o alegere. */
  | { f: "alegeri"; v: string[] }
  | { f: "comutator"; v: boolean }
  | { f: "fisiere"; v: FisierAles[] };

/** Configuratia intreaga: id stabil de camp -> valoare. */
export type Valori = Record<string, Valoare>;

/* ═══════════════════════════════════════════════════════════════════════════
   NORMALIZAREA
   ═══════════════════════════════════════════════════════════════════════════ */

function idBun(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= MAX_LUNGIME_ID;
}

/**
 * Numarul, adus la o forma pe care doua masini o scriu la fel.
 *
 * ⚠ `-0` devine `0`. Altfel aceeasi configuratie ar da doua amprente diferite, dupa cum a
 * ajuns zeroul acolo — iar in cos asta inseamna doua linii in loc de una.
 */
function numarNormalizat(v: unknown): number | null {
  if (!eNumarBun(v)) return null;
  return v === 0 ? 0 : v;
}

/**
 * Textul cumparatorului, curatat.
 *
 * ⚠ Se taie spatiile de la capete si se strang cele dinauntru: „Ana  Maria " si „Ana Maria"
 * sunt acelasi lucru gravat, deci trebuie sa fie aceeasi linie de cos. Se scot si caracterele
 * de control, care n-au ce cauta pe o cana si strica orice randare.
 *
 * ⚠ NU se face `toLowerCase` si NU se scot diacriticele: „ANA" si „Ana" chiar sunt gravuri
 * diferite.
 */
function textNormalizat(v: unknown): string | null {
  if (typeof v !== "string") return null;
  /*
   * ⚠ ORDINEA CONTEAZA: intai se STRANG spatiile, abia apoi se scot caracterele de control.
   *
   * Tabul si saltul de rand sunt SI spatiu alb, SI caractere de control. Scoase primele, ele
   * dispareau cu totul si lipeau cuvintele: un tab intre „Ana" si „Maria" ajungea gravat
   * „AnaMaria". Stranse intai, devin un spatiu obisnuit, iar pasul urmator ia doar ce a mai
   * ramas — octetii de control adevarati, care n-au ce cauta pe o cana.
   *
   * ⚠ Escapate, nu scrise literal: octetii de control pusi direct in fisier il fac binar, iar
   * orice unealta care il citeste ca text (grep, o proba care scaneaza sursa) il sare. Scrise
   * asa, `no-control-regex` nici nu se aprinde, deci nu e nevoie de nicio suprimare.
   */
  const curat = v.replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim();
  return curat.length <= MAX_LUNGIME_TEXT ? curat : curat.slice(0, MAX_LUNGIME_TEXT);
}

function transformNormalizat(t: unknown): FisierAles["t"] | undefined {
  if (!t || typeof t !== "object") return undefined;
  const o = t as Record<string, unknown>;
  const x = numarNormalizat(o.x), y = numarNormalizat(o.y);
  const s = numarNormalizat(o.s), r = numarNormalizat(o.r);
  if (x === null || y === null || s === null || r === null) return undefined;
  // Scara zero sau negativa nu e o asezare, e o imagine disparuta.
  if (!(s > 0)) return undefined;
  return { x, y, s, r };
}

/**
 * Valorile, aduse la forma canonica. Ce nu se incadreaza DISPARE.
 *
 * Intoarce mereu un obiect nou; nu modifica intrarea.
 */
export function normalizeazaValori(brut: unknown): Valori {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return {};
  const out: Valori = {};
  let cate = 0;
  // Cheile se parcurg SORTAT, ca plafonul sa taie mereu aceleasi campuri, nu pe cele care
  // s-au nimerit primele in obiect.
  for (const id of Object.keys(brut as Record<string, unknown>).sort()) {
    if (!idBun(id)) continue;
    if (++cate > MAX_CAMPURI) break;
    const val = normalizeazaValoare((brut as Record<string, unknown>)[id]);
    if (val) out[id] = val;
  }
  return out;
}

/** O singura valoare. `null` cand nu se incadreaza. */
export function normalizeazaValoare(brut: unknown): Valoare | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  switch (o.f) {
    case "numar": {
      const v = numarNormalizat(o.v);
      return v === null ? null : { f: "numar", v };
    }
    case "text": {
      const v = textNormalizat(o.v);
      // Textul GOL nu e o valoare: e un camp necompletat. Lasat, ar fi intrat in amprenta si
      // ar fi facut doua linii din una.
      return v ? { f: "text", v } : null;
    }
    case "alegere":
      return idBun(o.v) ? { f: "alegere", v: o.v } : null;
    case "alegeri": {
      if (!Array.isArray(o.v)) return null;
      // Sortate si fara duplicate: ordinea bifarii nu e o alegere.
      const v = [...new Set(o.v.filter(idBun))].sort().slice(0, MAX_ALEGERI);
      return v.length ? { f: "alegeri", v } : null;
    }
    case "comutator":
      // ⚠ Numai `true` e o valoare. `false` inseamna „n-a bifat", adica lipsa — altfel un
      // comutator stins ar schimba amprenta fata de unul neatins, desi sunt acelasi lucru.
      return o.v === true ? { f: "comutator", v: true } : null;
    case "fisiere": {
      if (!Array.isArray(o.v)) return null;
      const v: FisierAles[] = [];
      const vazute = new Set<string>();
      for (const f of o.v) {
        if (v.length >= MAX_FISIERE) break;
        if (!f || typeof f !== "object") continue;
        const id = (f as Record<string, unknown>).id;
        if (!idBun(id) || vazute.has(id)) continue;
        vazute.add(id);
        const t = transformNormalizat((f as Record<string, unknown>).t);
        v.push(t ? { id, t } : { id });
      }
      // ⚠ Ordinea fisierelor SE PASTREAZA: la un tricou cu doua poze, care e prima conteaza.
      return v.length ? { f: "fisiere", v } : null;
    }
    default:
      return null;
  }
}

/** Valorile numerice, gata de dat motorului de formule. */
export function numereleDin(valori: Valori): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, v] of Object.entries(valori)) {
    if (v.f === "numar") m.set(id, v.v);
    // ⚠ Un comutator aprins valoreaza 1 in formule, ca sa se poata scrie „+ 20 lei daca e bifat"
    // fara un tip de nod separat. Stins, campul lipseste cu totul, deci formula il vede ca
    // referinta lipsa — si atunci trebuie scrisa cu `maxim(ref, 0)`, nu lasata sa cada.
    else if (v.f === "comutator") m.set(id, 1);
  }
  return m;
}
