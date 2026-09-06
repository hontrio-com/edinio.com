/**
 * Granita dintre `jsonb` si motor.
 *
 * ═══ ⚠ CE VINE DIN BAZA NU E DATELE NOASTRE ═══
 *
 * Coloana e `jsonb` fara nicio schema. Acolo poate ajunge: o definitie scrisa de o versiune mai
 * VECHE a codului, una scrisa de una mai NOUA, ceva dintr-o consola SQL, sau o migratie care a
 * mers pe jumatate. `as Definitie` ar fi facut TypeScript sa taca exact acolo unde e nevoie de
 * el cel mai mult.
 *
 * Se citeste deci defensiv, ca peste tot in proiect unde se citeste `jsonb`: `parseVariants`,
 * `parseOfferConfig`, `normalizeazaCos`. Ce nu se incadreaza se ARUNCA, si niciodata nu se
 * repara pe jumatate.
 *
 * ⚠ DE CE NU `zod`, desi e in proiect. E folosit la formulare, cu `react-hook-form`, si nicaieri
 * in actiuni sau peste `jsonb`. Tiparul casei pentru `jsonb` e parsarea care INTOARCE o valoare
 * curatata, nu una care spune doar da/nu — si tocmai valoarea curatata e ce ii trebuie motorului.
 * O a doua scoala de validare in acelasi proiect ar fi insemnat doua locuri de citit cand ceva
 * nu se potriveste.
 *
 * ⚠ CE SE INTAMPLA CU CE NU SE INTELEGE. Se scoate. Un nod de un fel necunoscut — scris de o
 * versiune mai noua a panoului — dispare din definitia citita de codul vechi. Alternativa ar fi
 * fost sa se pastreze si sa se randeze gol, adica un camp pe care cumparatorul il vede si nu-l
 * poate completa. Publicarea are oricum grija ca versiunea servita sa fi fost scrisa de codul
 * care o serveste.
 */

import {
  type Definitie, type Grup, type ModAfisare, type Nod, type Optiune, type Pas,
  MAX_GRUPURI_PE_PAS, MAX_NODURI, MAX_NODURI_PE_GRUP, MAX_OPTIUNI_PE_NOD, MAX_PASI,
  VERSIUNE_SCHEMA,
} from "./definitie";
import { type Expresie, type OperatieBinara, type OperatieRotunjire, MAX_ADANCIME } from "./expresii";
import type { Actiune, Conditie, NivelMesaj, Regula } from "./reguli";
import type { BazaProcent, FelBaza, Modificator, Pretuire } from "./pret";
import { normalizeazaValoare } from "./valori";
import { eNumarBun } from "./unitati";

/* ═══════════════════════════════════════════════════════════════════════════
   AJUTOARE
   ═══════════════════════════════════════════════════════════════════════════ */

const obiect = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const sir = (v: unknown, maxim = 400): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, maxim) : null;
};

const numar = (v: unknown): number | null => (eNumarBun(v) ? v : null);

const dinLista = <T extends string>(v: unknown, permise: readonly T[]): T | null =>
  typeof v === "string" && (permise as readonly string[]).includes(v) ? (v as T) : null;

const listaDeSiruri = (v: unknown, maxim: number): string[] =>
  Array.isArray(v) ? v.map((x) => sir(x)).filter((x): x is string => !!x).slice(0, maxim) : [];

/* ═══════════════════════════════════════════════════════════════════════════
   EXPRESII
   ═══════════════════════════════════════════════════════════════════════════ */

const BINARE: readonly OperatieBinara[] = ["adun", "scad", "inmultesc", "impart", "minim", "maxim"];
const ROTUNJIRI: readonly OperatieRotunjire[] = ["rotunjesc", "insus", "injos"];

/**
 * O formula, citita din `jsonb`.
 *
 * ⚠ Plafonul de adancime se verifica AICI, la citire, nu doar la evaluare. Un arbore de zece mii
 * de niveluri ar fi doborat stiva chiar in functia care incearca sa-l refuze.
 */
export function citesteExpresie(brut: unknown, adancime = 1): Expresie | null {
  if (adancime > MAX_ADANCIME) return null;
  const o = obiect(brut);
  if (!o) return null;

  switch (o.k) {
    case "numar": {
      const v = numar(o.v);
      return v === null ? null : { k: "numar", v };
    }
    case "ref": {
      const id = sir(o.id, 64);
      return id ? { k: "ref", id } : null;
    }
    case "bin": {
      const op = dinLista(o.op, BINARE);
      const a = citesteExpresie(o.a, adancime + 1);
      const b = citesteExpresie(o.b, adancime + 1);
      return op && a && b ? { k: "bin", op, a, b } : null;
    }
    case "neg": {
      const a = citesteExpresie(o.a, adancime + 1);
      return a ? { k: "neg", a } : null;
    }
    case "abs": {
      const a = citesteExpresie(o.a, adancime + 1);
      return a ? { k: "abs", a } : null;
    }
    case "rot": {
      const op = dinLista(o.op, ROTUNJIRI);
      const a = citesteExpresie(o.a, adancime + 1);
      if (!op || !a) return null;
      const pas = o.pas === undefined ? undefined : citesteExpresie(o.pas, adancime + 1);
      // ⚠ Un pas prezent DAR nevalid nu se ignora: ar fi schimbat tacit intelesul formulei
      // dintr-o rotunjire la 5 lei intr-una la intreg.
      if (o.pas !== undefined && !pas) return null;
      return pas ? { k: "rot", op, a, pas } : { k: "rot", op, a };
    }
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   NODURI
   ═══════════════════════════════════════════════════════════════════════════ */

const CONTROALE: Record<string, readonly string[]> = {
  text: ["scurt", "lung"],
  numar: ["camp", "glisor"],
  alegere: ["lista", "butoane", "radio", "carduri", "culori", "imagini", "font", "simbol"],
  alegeri: ["bifare", "carduri", "imagini"],
  comutator: ["comutator", "bifa"],
  fisiere: ["imagine", "document"],
  afisaj: ["text", "titlu", "separator", "rezumat", "pret", "previzualizare"],
};

/*
 * ⚠ O ETICHETA GOALA NU STERGE NIMIC, SI ASTA E O REPARATIE, NU O SLABIRE.
 *
 * Cititorul intorcea `null` pentru un nod sau o optiune fara nume, iar `salveazaCiorna` scrie
 * CE A CITIT. Deci comerciantul care sterge numele ca sa-l rescrie pierdea, dupa 1,2 secunde de
 * autosalvare, tot nodul: felul lui, pretul, optiunile, limitele si regulile care trimiteau la
 * el. Sub degete, in timp ce tasta, si fara niciun mesaj.
 *
 * Identitatea unui nod e `id`, nu numele. Fara `id` nu se poate pastra nimic — acolo aruncarea
 * ramane. Iar publicarea REFUZA deja un nume gol (`fara_eticheta` si `optiune_fara_eticheta`,
 * amandoua critice), deci nimic gol nu ajunge in vanzare. Impartirea muncii e cea a casei:
 * cititorul pastreaza, validatorul refuza.
 */
function citesteOptiune(brut: unknown): Optiune | null {
  const o = obiect(brut);
  if (!o) return null;
  const id = sir(o.id, 64);
  if (!id) return null;
  const out: Optiune = { id, eticheta: sir(o.eticheta, 200) ?? "" };
  const d = sir(o.descriere, 500); if (d) out.descriere = d;
  const c = sir(o.culoare, 32); if (c) out.culoare = c;
  const im = sir(o.imagine, 500); if (im) out.imagine = im;
  const p = numar(o.pret); if (p !== null) out.pret = p;
  const g = numar(o.grame); if (g !== null) out.grame = g;
  const comp = obiect(o.componenta);
  if (comp) {
    const cid = sir(comp.id, 64); const buc = numar(comp.bucati);
    /*
     * ⚠ SE CITESC DOAR `id` SI `bucati`, SI E O PAZA, NU O LIPSA.
     *
     * `produsId`, `pretBucata` si `nume` de pe o componenta se scriu NUMAI la publicare, de
     * `compileaza`, din randul din `configurator_componente`. Aici se citeste CIORNA, adica un
     * `jsonb` pe care il scrie panoul — deci si oricine ajunge la actiunea de salvare. Citite si
     * ele, un `pretBucata` pus de mana in ciorna ar fi trecut prin publicare neatins si ar fi
     * devenit chiar pretul dupa care se incaseaza; iar un `produsId` strain ar fi scazut stocul
     * unui produs care nu are nicio treaba cu configuratorul.
     */
    if (cid && buc !== null && buc > 0) out.componenta = { id: cid, bucati: buc };
  }
  if (o.activa === false) out.activa = false;
  return out;
}

export function citesteNod(brut: unknown): Nod | null {
  const o = obiect(brut);
  if (!o) return null;
  const fel = typeof o.fel === "string" ? o.fel : "";
  const id = sir(o.id, 64);
  // ⚠ Vezi nota de la `citesteOptiune`: numele gol se pastreaza, publicarea il refuza.
  if (!id) return null;

  const comun = {
    id, eticheta: sir(o.eticheta, 200) ?? "",
    ...(sir(o.ajutor, 500) ? { ajutor: sir(o.ajutor, 500)! } : {}),
    ...(o.obligatoriu === true ? { obligatoriu: true } : {}),
    ...(o.inRezumat === true ? { inRezumat: true } : {}),
    ...(numar(o.latime) !== null ? { latime: numar(o.latime)! } : {}),
  };

  const control = dinLista(o.control, CONTROALE[fel] ?? []);
  if (fel !== "calcul" && !control) return null;

  switch (fel) {
    case "text": {
      const n = { ...comun, fel: "text", control } as Nod & { fel: "text" };
      const s = sir(o.substituent, 200); if (s) n.substituent = s;
      for (const k of ["minCaractere", "maxCaractere", "maxRanduri"] as const) {
        const v = numar(o[k]); if (v !== null) n[k] = v;
      }
      if (o.majuscule === true) n.majuscule = true;
      const im = sir(o.implicit, 2000); if (im) n.implicit = im;
      const p = obiect(o.pret);
      if (p) {
        const pret: NonNullable<(Nod & { fel: "text" })["pret"]> = {};
        for (const k of ["fix", "peCaracter", "caractereIncluse"] as const) {
          const v = numar(p[k]); if (v !== null) pret[k] = v;
        }
        if (Object.keys(pret).length) n.pret = pret;
      }
      return n;
    }
    case "numar": {
      const n = { ...comun, fel: "numar", control } as Nod & { fel: "numar" };
      const u = sir(o.unitate, 8);
      if (u && ["mm", "cm", "m", "g", "kg", "buc"].includes(u)) n.unitate = u as never;
      for (const k of ["min", "max", "pas", "implicit", "zecimale"] as const) {
        const v = numar(o[k]); if (v !== null) n[k] = v;
      }
      return n;
    }
    case "alegere": {
      const optiuni = (Array.isArray(o.optiuni) ? o.optiuni : [])
        .map(citesteOptiune).filter((x): x is Optiune => !!x).slice(0, MAX_OPTIUNI_PE_NOD);
      const n = { ...comun, fel: "alegere", control, optiuni } as Nod & { fel: "alegere" };
      const im = sir(o.implicit, 64); if (im) n.implicit = im;
      if (o.cautare === true) n.cautare = true;
      return n;
    }
    case "alegeri": {
      const optiuni = (Array.isArray(o.optiuni) ? o.optiuni : [])
        .map(citesteOptiune).filter((x): x is Optiune => !!x).slice(0, MAX_OPTIUNI_PE_NOD);
      const n = { ...comun, fel: "alegeri", control, optiuni } as Nod & { fel: "alegeri" };
      for (const k of ["minAlese", "maxAlese"] as const) {
        const v = numar(o[k]); if (v !== null) n[k] = v;
      }
      const im = listaDeSiruri(o.implicit, MAX_OPTIUNI_PE_NOD);
      if (im.length) n.implicit = im;
      return n;
    }
    case "comutator": {
      const n = { ...comun, fel: "comutator", control } as Nod & { fel: "comutator" };
      if (o.implicit === true) n.implicit = true;
      const p = numar(o.pret); if (p !== null) n.pret = p;
      return n;
    }
    case "fisiere": {
      const n = { ...comun, fel: "fisiere", control } as Nod & { fel: "fisiere" };
      for (const k of ["maxFisiere", "maxMb", "minLatimePx", "minInaltimePx", "dpiRecomandat", "dpiMinim"] as const) {
        const v = numar(o[k]); if (v !== null) n[k] = v;
      }
      const t = listaDeSiruri(o.tipuri, 20); if (t.length) n.tipuri = t;
      return n;
    }
    case "calcul": {
      const formula = citesteExpresie(o.formula);
      if (!formula) return null;
      const n = { ...comun, fel: "calcul", formula } as Nod & { fel: "calcul" };
      const a = obiect(o.arata);
      const unitate = a ? sir(a.unitate, 16) : null;
      if (unitate) {
        n.arata = { unitate, ...(numar(a!.zecimale) !== null ? { zecimale: numar(a!.zecimale)! } : {}) };
      }
      return n;
    }
    case "afisaj": {
      const n = { ...comun, fel: "afisaj", control } as Nod & { fel: "afisaj" };
      const c = sir(o.continut, 2000); if (c) n.continut = c;
      return n;
    }
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEFINITIA
   ═══════════════════════════════════════════════════════════════════════════ */

const MODURI: readonly ModAfisare[] = ["auto", "simplu", "pasi", "acordeon"];

export function citesteDefinitie(brut: unknown): Definitie {
  const o = obiect(brut) ?? {};
  const pasi: Pas[] = [];
  let cateNoduri = 0;

  for (const brutPas of (Array.isArray(o.pasi) ? o.pasi : []).slice(0, MAX_PASI)) {
    const p = obiect(brutPas);
    const idPas = p ? sir(p.id, 64) : null;
    if (!p || !idPas) continue;
    const grupuri: Grup[] = [];
    for (const brutGrup of (Array.isArray(p.grupuri) ? p.grupuri : []).slice(0, MAX_GRUPURI_PE_PAS)) {
      const g = obiect(brutGrup);
      const idGrup = g ? sir(g.id, 64) : null;
      if (!g || !idGrup) continue;
      const noduri: Nod[] = [];
      for (const brutNod of (Array.isArray(g.noduri) ? g.noduri : []).slice(0, MAX_NODURI_PE_GRUP)) {
        if (cateNoduri >= MAX_NODURI) break;
        const n = citesteNod(brutNod);
        if (n) { noduri.push(n); cateNoduri++; }
      }
      const grup: Grup = { id: idGrup, noduri };
      const et = sir(g.eticheta, 200); if (et) grup.eticheta = et;
      if (g.rol === "dimensiuni") grup.rol = "dimensiuni";
      if (g.proportieLegata === true) grup.proportieLegata = true;
      if (Array.isArray(g.asezari)) {
        const asezari = g.asezari.map((a) => {
          const x = obiect(a);
          const et2 = x ? sir(x.eticheta, 100) : null;
          const vals = obiect(x?.valori);
          if (!et2 || !vals) return null;
          const valori: Record<string, number> = {};
          for (const [k, v] of Object.entries(vals)) { const nn = numar(v); if (nn !== null) valori[k] = nn; }
          return Object.keys(valori).length ? { eticheta: et2, valori } : null;
        }).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 20);
        if (asezari.length) grup.asezari = asezari;
      }
      grupuri.push(grup);
    }
    pasi.push({
      id: idPas,
      eticheta: sir(p.eticheta, 200) ?? "",
      ...(sir(p.descriere, 500) ? { descriere: sir(p.descriere, 500)! } : {}),
      grupuri,
    });
  }

  const calcule: Record<string, Expresie> = {};
  const brutCalcule = obiect(o.calcule);
  if (brutCalcule) {
    for (const [id, e] of Object.entries(brutCalcule).slice(0, MAX_NODURI)) {
      const parsat = citesteExpresie(e);
      if (parsat && sir(id, 64)) calcule[id] = parsat;
    }
  }

  return {
    // ⚠ Versiunea NU se ia de bun ce scrie in coloana: un numar mai mare decat il stie codul ar
    // insemna ca citim o definitie scrisa de un panou mai nou. Se pastreaza ce s-a citit, dar
    // plafonat la ce intelegem.
    versiuneSchema: Math.min(numar(o.versiuneSchema) ?? VERSIUNE_SCHEMA, VERSIUNE_SCHEMA),
    mod: dinLista(o.mod, MODURI) ?? "auto",
    pasi,
    ...(Object.keys(calcule).length ? { calcule } : {}),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGULI
   ═══════════════════════════════════════════════════════════════════════════ */

const CONDITII_CU_NOD = [
  "este", "nu_este", "una_din", "niciuna_din", "completat", "necompletat",
  "cmp", "intre", "nu_intre", "contine", "incepe_cu", "termina_cu", "pornit", "oprit",
] as const;
const OPERATORI_CMP = ["=", "!=", ">", ">=", "<", "<="] as const;

export function citesteConditie(brut: unknown, adancime = 1): Conditie | null {
  if (adancime > 8) return null;
  const o = obiect(brut);
  if (!o) return null;

  if (o.c === "si" || o.c === "sau") {
    const din = (Array.isArray(o.din) ? o.din : [])
      .map((x) => citesteConditie(x, adancime + 1))
      .filter((x): x is Conditie => !!x)
      .slice(0, 20);
    // ⚠ O grupare GOALA nu se pastreaza: `si` peste nimic e adevarat si ar fi aprins regula
    // mereu, iar `sau` peste nimic e fals si ar fi stins-o. Amandoua tacut.
    return din.length ? ({ c: o.c, din } as Conditie) : null;
  }

  const c = dinLista(o.c, CONDITII_CU_NOD);
  const nod = sir(o.nod, 64);
  if (!c || !nod) return null;

  switch (c) {
    case "completat": case "necompletat": case "pornit": case "oprit":
      return { c, nod };
    case "este": case "nu_este": case "contine": case "incepe_cu": case "termina_cu": {
      const v = typeof o.v === "string" ? o.v.slice(0, 400) : null;
      return v === null ? null : ({ c, nod, v } as Conditie);
    }
    case "una_din": case "niciuna_din": {
      const v = listaDeSiruri(o.v, 100);
      return v.length ? ({ c, nod, v } as Conditie) : null;
    }
    case "cmp": {
      const op = dinLista(o.op, OPERATORI_CMP);
      const v = numar(o.v);
      return op && v !== null ? { c, nod, op, v } : null;
    }
    case "intre": case "nu_intre": {
      const min = numar(o.min); const max = numar(o.max);
      return min !== null && max !== null ? ({ c, nod, min, max } as Conditie) : null;
    }
    default:
      return null;
  }
}

const NIVELE: readonly NivelMesaj[] = ["info", "atentie", "eroare"];
const ACTIUNI_TINTA = ["arata", "ascunde", "activeaza", "dezactiveaza", "obligatoriu", "optional", "goleste"] as const;

export function citesteActiune(brut: unknown): Actiune | null {
  const o = obiect(brut);
  if (!o) return null;
  const a = typeof o.a === "string" ? o.a : "";
  const tinta = sir(o.tinta, 64);

  if ((ACTIUNI_TINTA as readonly string[]).includes(a)) {
    return tinta ? ({ a, tinta } as Actiune) : null;
  }
  switch (a) {
    case "doar_optiunile": case "fara_optiunile": {
      const optiuni = listaDeSiruri(o.optiuni, MAX_OPTIUNI_PE_NOD);
      return tinta && optiuni.length ? ({ a, tinta, optiuni } as Actiune) : null;
    }
    case "min": case "max": case "pas": {
      const v = numar(o.v);
      return tinta && v !== null ? ({ a, tinta, v } as Actiune) : null;
    }
    case "pune": {
      const v = normalizeazaValoare(o.v);
      return tinta && v ? { a, tinta, v } : null;
    }
    case "mesaj": {
      const text = sir(o.text, 500);
      const nivel = dinLista(o.nivel, NIVELE) ?? "info";
      return text ? { a, nivel, text, ...(tinta ? { tinta } : {}) } : null;
    }
    case "opreste": {
      const text = sir(o.text, 500);
      return text ? { a, text } : null;
    }
    default:
      return null;
  }
}

export function citesteReguli(brut: unknown): Regula[] {
  if (!Array.isArray(brut)) return [];
  const out: Regula[] = [];
  for (const b of brut.slice(0, 500)) {
    const o = obiect(b);
    const id = o ? sir(o.id, 64) : null;
    const cand = o ? citesteConditie(o.cand) : null;
    if (!o || !id || !cand) continue;
    const atunci = (Array.isArray(o.atunci) ? o.atunci : [])
      .map(citesteActiune).filter((x): x is Actiune => !!x).slice(0, 20);
    // ⚠ O regula fara nicio actiune valida se scoate: pastrata, ar fi aparut in lista din panou
    // ca o regula care „exista si nu face nimic", si nimeni n-ar fi stiut de ce.
    if (!atunci.length) continue;
    out.push({ id, cand, atunci, ...(o.activa === false ? { activa: false } : {}) });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUIREA
   ═══════════════════════════════════════════════════════════════════════════ */

const BAZE: readonly FelBaza[] = ["produs", "fara", "taxa"];
const BAZE_PROCENT: readonly BazaProcent[] = ["baza", "calcul", "subtotal"];
const FELURI_MOD = ["fix", "procent", "inmultire"] as const;
const FELURI_ROT = ["aproape", "insus", "injos"] as const;

export function citestePretuire(brut: unknown): Pretuire {
  const o = obiect(brut) ?? {};
  const out: Pretuire = { baza: dinLista(o.baza, BAZE) ?? "produs" };

  const taxa = numar(o.taxaInitiala); if (taxa !== null) out.taxaInitiala = taxa;
  const formula = citesteExpresie(o.formula); if (formula) out.formula = formula;
  const min = numar(o.minim); if (min !== null) out.minim = min;
  const max = numar(o.maxim); if (max !== null) out.maxim = max;

  const rot = obiect(o.rotunjire);
  if (rot) {
    const fel = dinLista(rot.fel, FELURI_ROT);
    const pas = numar(rot.pas);
    if (fel && pas !== null && pas > 0) out.rotunjire = { fel, pas };
  }

  const mods: Modificator[] = [];
  for (const b of (Array.isArray(o.modificatori) ? o.modificatori : []).slice(0, 100)) {
    const m = obiect(b);
    const id = m ? sir(m.id, 64) : null;
    const fel = m ? dinLista(m.fel, FELURI_MOD) : null;
    if (!m || !id || !fel) continue;
    const mod: Modificator = { id, fel };
    const et = sir(m.eticheta, 200); if (et) mod.eticheta = et;
    const v = numar(m.valoare); if (v !== null) mod.valoare = v;
    const f = citesteExpresie(m.formula); if (f) mod.formula = f;
    const bp = dinLista(m.baza, BAZE_PROCENT); if (bp) mod.baza = bp;
    const cand = citesteConditie(m.cand); if (cand) mod.cand = cand;
    /*
     * ⚠ Un modificator fara NICIO sursa de suma se scoate. Pastrat, ar fi valorat zero — adica
     * ar fi aratat in descompunere ca „se aplica" fara sa schimbe nimic, iar comerciantul ar fi
     * cautat greseala in alta parte.
     */
    if (mod.valoare === undefined && !mod.formula) continue;
    mods.push(mod);
  }
  if (mods.length) out.modificatori = mods;

  return out;
}

/** Ciorna intreaga, asa cum sta in coloana `configuratoare.ciorna`. */
export interface Continut {
  definitie: Definitie;
  reguli: Regula[];
  pretuire: Pretuire;
}

export function citesteContinut(brut: unknown): Continut {
  const o = obiect(brut) ?? {};
  return {
    definitie: citesteDefinitie(o.definitie),
    reguli: citesteReguli(o.reguli),
    pretuire: citestePretuire(o.pretuire),
  };
}
