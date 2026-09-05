/**
 * Regulile: „cand se intampla asta, fa asta".
 *
 * ═══ ⚠ REGULILE SE INTORC UNA PESTE ALTA ═══
 *
 * O regula poate ascunde un camp. Un camp ascuns isi PIERDE valoarea. Valoarea pierduta poate
 * stinge conditia altei reguli, care descopera alt camp, care la randul lui... Deci nu e o
 * lista de aplicat o data, ci un punct fix de atins.
 *
 * Se rotesc pana cand nimic nu se mai schimba, cu un plafon de treceri. Cand plafonul se
 * atinge, starea NU se arunca — se intoarce cea de la ultima trecere, insotita de semnul
 * `neasezat`. Motivul: o definitie care oscileaza e o gresala a comerciantului, si validatorul
 * de publicare o refuza; dar un cumparator aflat deja pe pagina merita sa vada ceva coerent, nu
 * un ecran gol.
 *
 * ═══ ⚠ CONFLICTELE NU SE REZOLVA DUPA ORDINEA DIN LISTA ═══
 *
 * Doua reguli care spun despre acelasi camp una „arata" si alta „ascunde" nu se departajeaza
 * dupa care a fost scrisa a doua — ordinea aia n-are niciun inteles pentru comerciant, si s-ar
 * schimba la o simpla reasezare in interfata.
 *
 * Castiga MEREU cea mai stransa: ascunde bate arata, dezactiveaza bate activeaza, obligatoriu
 * bate optional. E determinist, nu depinde de ordine, si greseste in partea sigura — un camp
 * ascuns din greseala se vede imediat, unul aratat din greseala poate lasa sa treaca o comanda
 * pe care comerciantul n-o poate onora. Conflictul se si RAPORTEAZA, ca validatorul de
 * publicare sa-l poata arata inainte ca cineva sa cumpere.
 *
 * ═══ ⚠ CAMPUL ASCUNS NU BLOCHEAZA ═══
 *
 * Un camp obligatoriu pe care regulile l-au ascuns nu opreste comanda: cumparatorul n-are cum
 * sa-l completeze. La fel cel dezactivat. Altfel un magazin s-ar putea inchide singur dintr-o
 * regula scrisa gresit.
 */

import {
  type Definitie, type Nod, harta, toateNodurile, producesValoare, areOptiuni, optiuneActiva,
} from "./definitie";
import { normalizeazaValoare, type Valoare, type Valori } from "./valori";
import { eNumarBun } from "./unitati";

/** Cate treceri se fac pana se declara ca definitia oscileaza. */
export const MAX_TRECERI = 12;
export const MAX_REGULI = 500;

/* ═══════════════════════════════════════════════════════════════════════════
   CONDITII
   ═══════════════════════════════════════════════════════════════════════════ */

export type Conditie =
  | { c: "este"; nod: string; v: string }
  | { c: "nu_este"; nod: string; v: string }
  | { c: "una_din"; nod: string; v: string[] }
  | { c: "niciuna_din"; nod: string; v: string[] }
  /** Are orice valoare. Merge pe orice fel de nod. */
  | { c: "completat"; nod: string }
  | { c: "necompletat"; nod: string }
  | { c: "cmp"; nod: string; op: "=" | "!=" | ">" | ">=" | "<" | "<="; v: number }
  | { c: "intre"; nod: string; min: number; max: number }
  | { c: "nu_intre"; nod: string; min: number; max: number }
  | { c: "contine"; nod: string; v: string }
  | { c: "incepe_cu"; nod: string; v: string }
  | { c: "termina_cu"; nod: string; v: string }
  | { c: "pornit"; nod: string }
  | { c: "oprit"; nod: string }
  | { c: "si"; din: Conditie[] }
  | { c: "sau"; din: Conditie[] };

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIUNI
   ═══════════════════════════════════════════════════════════════════════════ */

export type NivelMesaj = "info" | "atentie" | "eroare";

export type Actiune =
  | { a: "arata"; tinta: string }
  | { a: "ascunde"; tinta: string }
  | { a: "activeaza"; tinta: string }
  | { a: "dezactiveaza"; tinta: string }
  | { a: "obligatoriu"; tinta: string }
  | { a: "optional"; tinta: string }
  /** Doar optiunile astea se pot alege. Se INTERSECTEAZA cand mai multe reguli o cer. */
  | { a: "doar_optiunile"; tinta: string; optiuni: string[] }
  | { a: "fara_optiunile"; tinta: string; optiuni: string[] }
  | { a: "min"; tinta: string; v: number }
  | { a: "max"; tinta: string; v: number }
  | { a: "pas"; tinta: string; v: number }
  | { a: "pune"; tinta: string; v: Valoare }
  | { a: "goleste"; tinta: string }
  | { a: "mesaj"; nivel: NivelMesaj; text: string; tinta?: string }
  /** Opreste inaintarea, cu motivul scris. Nu ascunde nimic. */
  | { a: "opreste"; text: string };

export interface Regula {
  id: string;
  /** Stinsa din interfata: se pastreaza, dar nu se aplica. */
  activa?: boolean;
  cand: Conditie;
  atunci: Actiune[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Mesaj { nivel: NivelMesaj; text: string; tinta?: string }

export interface Conflict {
  tinta: string;
  fel: "vizibilitate" | "activare" | "obligativitate";
  /** Ce a castigat, dupa regula „cea mai stransa". */
  castigator: string;
}

export interface Stare {
  /** Id-uri de nod, grup sau pas care nu se vad. */
  ascunse: Set<string>;
  dezactivate: Set<string>;
  /** Peste `obligatoriu` din definitie. Un id aici e cerut chiar daca definitia nu-l cere. */
  obligatorii: Set<string>;
  optionale: Set<string>;
  /** Ingustare: doar astea se pot alege. Lipsa = nicio ingustare. */
  optiuniPermise: Map<string, Set<string>>;
  /** Scoatere: astea NU se pot alege, oricare ar fi ingustarea. */
  optiuniScoase: Map<string, Set<string>>;
  limite: Map<string, { min?: number; max?: number; pas?: number }>;
  mesaje: Mesaj[];
  /** Motivele pentru care nu se poate inainta. Gol = se poate. */
  opriri: string[];
  conflicte: Conflict[];
  /** Valorile dupa golirea celor ascunse. */
  valori: Valori;
  /** Regulile n-au ajuns la o stare stabila in `MAX_TRECERI`. Definitia oscileaza. */
  neasezat: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVALUAREA CONDITIILOR
   ═══════════════════════════════════════════════════════════════════════════ */

/** Textul unei valori, pentru conditiile de text. `null` cand nodul n-are text. */
function textul(v: Valoare | undefined): string | null {
  return v?.f === "text" ? v.v : null;
}

/** Numarul unei valori. Un comutator aprins valoreaza 1, ca in formule. */
function numarul(v: Valoare | undefined): number | null {
  if (v?.f === "numar") return v.v;
  if (v?.f === "comutator") return 1;
  return null;
}

/** Id-urile alese, fie ca nodul tine una sau mai multe. */
function alesele(v: Valoare | undefined): string[] {
  if (v?.f === "alegere") return [v.v];
  if (v?.f === "alegeri") return v.v;
  return [];
}

function areValoare(v: Valoare | undefined): boolean {
  if (!v) return false;
  if (v.f === "alegeri") return v.v.length > 0;
  if (v.f === "fisiere") return v.v.length > 0;
  if (v.f === "text") return v.v.length > 0;
  return true;
}

/**
 * Se aprinde conditia?
 *
 * ⚠ Un nod care nu exista, sau o valoare de alt fel decat cere conditia, dau MEREU `false` —
 * niciodata `true` din lipsa de date. O regula care ascunde ceva „fiindca nu stim" ar fi ascuns
 * campuri la intamplare pe o definitie in lucru.
 */
export function seAprinde(c: Conditie, valori: Valori, adancime = 1): boolean {
  if (adancime > 8) return false; // conditii imbricate la nesfarsit: se refuza, nu se cade
  switch (c.c) {
    case "si": return (c.din ?? []).every((x) => seAprinde(x, valori, adancime + 1));
    case "sau": return (c.din ?? []).some((x) => seAprinde(x, valori, adancime + 1));
    case "este": return alesele(valori[c.nod]).includes(c.v);
    case "nu_este": return !alesele(valori[c.nod]).includes(c.v);
    case "una_din": return alesele(valori[c.nod]).some((x) => (c.v ?? []).includes(x));
    case "niciuna_din": return !alesele(valori[c.nod]).some((x) => (c.v ?? []).includes(x));
    case "completat": return areValoare(valori[c.nod]);
    case "necompletat": return !areValoare(valori[c.nod]);
    case "pornit": return valori[c.nod]?.f === "comutator";
    case "oprit": return valori[c.nod]?.f !== "comutator";
    case "cmp": {
      const n = numarul(valori[c.nod]);
      if (n === null || !eNumarBun(c.v)) return false;
      switch (c.op) {
        case "=": return n === c.v;
        case "!=": return n !== c.v;
        case ">": return n > c.v;
        case ">=": return n >= c.v;
        case "<": return n < c.v;
        case "<=": return n <= c.v;
        default: return false;
      }
    }
    case "intre": {
      const n = numarul(valori[c.nod]);
      return n !== null && eNumarBun(c.min) && eNumarBun(c.max) && n >= c.min && n <= c.max;
    }
    case "nu_intre": {
      const n = numarul(valori[c.nod]);
      // ⚠ Fara valoare NU inseamna „in afara intervalului": inseamna ca nu stim. Deci `false`.
      return n !== null && eNumarBun(c.min) && eNumarBun(c.max) && (n < c.min || n > c.max);
    }
    case "contine": {
      const t = textul(valori[c.nod]);
      return t !== null && typeof c.v === "string" && t.includes(c.v);
    }
    case "incepe_cu": {
      const t = textul(valori[c.nod]);
      return t !== null && typeof c.v === "string" && t.startsWith(c.v);
    }
    case "termina_cu": {
      const t = textul(valori[c.nod]);
      return t !== null && typeof c.v === "string" && t.endsWith(c.v);
    }
    default:
      // Un fel de conditie mai nou decat codul care o citeste: nu se ghiceste.
      return false;
  }
}

/** Id-urile de nod pe care le citeste conditia. Le trebuie grafului de dependente. */
export function nodurileCerute(c: Conditie, out = new Set<string>(), adancime = 1): Set<string> {
  if (adancime > 8) return out;
  if (c.c === "si" || c.c === "sau") {
    for (const x of c.din ?? []) nodurileCerute(x, out, adancime + 1);
  } else if ("nod" in c && typeof c.nod === "string") {
    out.add(c.nod);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   APLICAREA
   ═══════════════════════════════════════════════════════════════════════════ */

function stareGoala(valori: Valori): Stare {
  return {
    ascunse: new Set(), dezactivate: new Set(), obligatorii: new Set(), optionale: new Set(),
    optiuniPermise: new Map(), optiuniScoase: new Map(),
    limite: new Map(), mesaje: [], opriri: [], conflicte: [],
    valori, neasezat: false,
  };
}

/** O trecere: se aprind regulile pe valorile date si se strang efectele. */
function oTrecere(reguli: Regula[], valori: Valori): Stare {
  const s = stareGoala(valori);
  const cerute = { arata: new Set<string>(), activa: new Set<string>(), optional: new Set<string>() };

  for (const r of (reguli ?? []).slice(0, MAX_REGULI)) {
    if (r?.activa === false) continue;
    if (!r?.cand || !seAprinde(r.cand, valori)) continue;
    for (const act of r.atunci ?? []) {
      switch (act.a) {
        case "arata": cerute.arata.add(act.tinta); break;
        case "ascunde": s.ascunse.add(act.tinta); break;
        case "activeaza": cerute.activa.add(act.tinta); break;
        case "dezactiveaza": s.dezactivate.add(act.tinta); break;
        case "obligatoriu": s.obligatorii.add(act.tinta); break;
        case "optional": cerute.optional.add(act.tinta); break;
        case "doar_optiunile": {
          // ⚠ Se INTERSECTEAZA: doua reguli care ingusteaza acelasi nod lasa ce accepta AMANDOUA.
          // Reuniunea ar fi facut ca a doua regula sa largeasca ce a strans prima.
          const acum = s.optiuniPermise.get(act.tinta);
          const cerut = new Set(act.optiuni ?? []);
          s.optiuniPermise.set(act.tinta, acum ? new Set([...acum].filter((x) => cerut.has(x))) : cerut);
          break;
        }
        case "fara_optiunile": {
          // ⚠ Se ADUNA, spre deosebire de ingustare: doua reguli care scot cate ceva scot
          // amandoua. Tot „cea mai stransa castiga".
          const acum = s.optiuniScoase.get(act.tinta) ?? new Set<string>();
          for (const id of act.optiuni ?? []) acum.add(id);
          s.optiuniScoase.set(act.tinta, acum);
          break;
        }
        case "min": case "max": case "pas": {
          if (!eNumarBun(act.v)) break;
          const l = s.limite.get(act.tinta) ?? {};
          // ⚠ Cea mai STRANSA castiga si aici: un `min` mai mare si un `max` mai mic.
          if (act.a === "min") l.min = l.min === undefined ? act.v : Math.max(l.min, act.v);
          if (act.a === "max") l.max = l.max === undefined ? act.v : Math.min(l.max, act.v);
          if (act.a === "pas") l.pas = l.pas === undefined ? act.v : Math.max(l.pas, act.v);
          s.limite.set(act.tinta, l);
          break;
        }
        case "pune": {
          const v = normalizeazaValoare(act.v);
          if (v) s.valori = { ...s.valori, [act.tinta]: v };
          break;
        }
        case "goleste": {
          if (s.valori[act.tinta]) {
            const copie = { ...s.valori };
            delete copie[act.tinta];
            s.valori = copie;
          }
          break;
        }
        case "mesaj":
          if (typeof act.text === "string" && act.text) {
            s.mesaje.push({ nivel: act.nivel ?? "info", text: act.text, ...(act.tinta ? { tinta: act.tinta } : {}) });
          }
          break;
        case "opreste":
          if (typeof act.text === "string" && act.text) s.opriri.push(act.text);
          break;
      }
    }
  }

  // Conflictele: cea mai stransa castiga, si se scrie ca s-a intamplat.
  for (const t of cerute.arata) {
    if (s.ascunse.has(t)) s.conflicte.push({ tinta: t, fel: "vizibilitate", castigator: "ascunde" });
  }
  for (const t of cerute.activa) {
    if (s.dezactivate.has(t)) s.conflicte.push({ tinta: t, fel: "activare", castigator: "dezactiveaza" });
  }
  for (const t of cerute.optional) {
    if (s.obligatorii.has(t)) s.conflicte.push({ tinta: t, fel: "obligativitate", castigator: "obligatoriu" });
    else s.optionale.add(t);
  }
  return s;
}

/**
 * Ce se vede cu adevarat, dupa ce se tine cont si de grupul si pasul in care sta nodul.
 *
 * Un nod dintr-un grup ascuns e si el ascuns, chiar daca nicio regula nu l-a numit — altfel
 * ascunderea unui grup i-ar fi lasat campurile la vedere si obligatorii.
 */
export function esteAscuns(d: Definitie, s: Stare, idNod: string): boolean {
  if (s.ascunse.has(idNod)) return true;
  const loc = harta(d).get(idNod);
  if (!loc) return false;
  return s.ascunse.has(loc.grup.id) || s.ascunse.has(loc.pas.id);
}

/**
 * Aplica regulile pana la punct fix.
 *
 * Dupa fiecare trecere, valorile campurilor ASCUNSE se sterg — implicit, si dinadins: o valoare
 * ramasa in urma unui camp pe care cumparatorul nu-l mai vede ar fi intrat in amprenta, in pret
 * si in comanda, ca o alegere pe care n-a facut-o nimeni.
 */
export function aplicaRegulile(d: Definitie, reguli: Regula[], valoriInitiale: Valori): Stare {
  let valori = valoriInitiale;
  let s = oTrecere(reguli, valori);

  for (let trecere = 0; trecere < MAX_TRECERI; trecere++) {
    const dupa = golesteAscunse(d, s, s.valori);
    const laFel = aceleasiValori(dupa, valori) && aceleasiValori(s.valori, valori);
    if (laFel) return { ...s, valori: dupa };
    valori = dupa;
    s = oTrecere(reguli, valori);
  }

  // N-a stat locului. Se intoarce ultima stare, spusa pe fata.
  return { ...s, valori: golesteAscunse(d, s, s.valori), neasezat: true };
}

/** Sterge valorile campurilor ascunse. Intoarce un obiect nou doar cand chiar s-a schimbat ceva. */
function golesteAscunse(d: Definitie, s: Stare, valori: Valori): Valori {
  const deSters: string[] = [];
  for (const nod of toateNodurile(d)) {
    if (!producesValoare(nod)) continue;
    if (valori[nod.id] !== undefined && esteAscuns(d, s, nod.id)) deSters.push(nod.id);
  }
  if (deSters.length === 0) return valori;
  const out = { ...valori };
  for (const id of deSters) delete out[id];
  return out;
}

function aceleasiValori(a: Valori, b: Valori): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE SE POATE ALEGE, DUPA REGULI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Optiunile care raman de ales pe un nod: cele ACTIVE din definitie, ingustate de reguli.
 *
 * ⚠ O optiune stinsa din definitie nu poate fi reaprinsa de o regula. Comerciantul a scos-o din
 * vanzare; o regula care o readuce ar fi vandut ce nu mai exista.
 */
export function optiuniDeAles(nod: Nod, s: Stare): string[] {
  if (!areOptiuni(nod)) return [];
  const active = (nod.optiuni ?? []).filter(optiuneActiva).map((o) => o.id);
  const permise = s.optiuniPermise.get(nod.id);
  const scoase = s.optiuniScoase.get(nod.id);
  return active.filter((id) => !scoase?.has(id) && (!permise || permise.has(id)));
}

/**
 * Campul e cerut ACUM?
 *
 * ⚠ Ascuns sau dezactivat inseamna NU, oricat ar spune definitia. Cumparatorul n-are cum sa-l
 * completeze, deci n-are voie sa fie oprit de el.
 */
export function esteCerut(d: Definitie, nod: Nod, s: Stare): boolean {
  if (esteAscuns(d, s, nod.id) || s.dezactivate.has(nod.id)) return false;
  if (s.obligatorii.has(nod.id)) return true;
  if (s.optionale.has(nod.id)) return false;
  return nod.obligatoriu === true;
}
