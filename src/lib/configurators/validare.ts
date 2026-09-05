/**
 * Ce se verifica INAINTE ca un configurator sa ajunga in fata cumparatorilor.
 *
 * ═══ ⚠ VALIDATORUL RULEAZA MOTORUL, NU DOAR CITESTE DEFINITIA ═══
 *
 * O verificare pur statica ar fi spus „regulile A si B se trimit una la alta, deci s-ar putea
 * invarti". „S-ar putea" nu e destul in nicio directie: blocheaza publicari bune si lasa sa
 * treaca oscilatii adevarate care ies din alt drum.
 *
 * Aici se compune configuratia IMPLICITA — ce vede cumparatorul cand deschide pagina — si se
 * dau pe ea chiar motorul de reguli si chiar motorul de pret. Ce iese e ce s-ar fi intamplat
 * cu adevarat. Analiza statica ramane, dar ca AVERTISMENT, langa proba adevarata.
 *
 * ═══ DOUA TREPTE, SI NUMAI UNA OPRESTE ═══
 *
 * `critic` opreste publicarea: fara reparatie, magazinul ar vinde gresit.
 * `atentie` nu opreste: comerciantul o vede, si hotaraste el.
 *
 * ⚠ Treapta se alege dupa CE PATESTE CUMPARATORUL, nu dupa cat de urata e greseala. Un
 * configurator fara nicio optiune e `critic` (n-are ce configura nimeni). Un pas fara niciun
 * camp vizibil e doar `atentie` — se sare singur la randare, si poate fi chiar ce a vrut omul.
 */

import {
  type Definitie, type Nod, MAX_NODURI, areOptiuni, optiuneActiva,
  producesValoare, toateIdurile, toateNodurile,
} from "./definitie";
import { adancimea, numaraNoduri, referinteleDin, MAX_ADANCIME, MAX_NODURI as MAX_NODURI_EXPR } from "./expresii";
import { aplicaRegulile, nodurileCerute, type Regula } from "./reguli";
import { calculeazaPretul, type Pretuire } from "./pret";
import { normalizeazaValoare, type Valoare, type Valori } from "./valori";
import { eNumarBun } from "./unitati";

export type Treapta = "critic" | "atentie";

export interface Constatare {
  treapta: Treapta;
  cod: string;
  /** Ce se spune comerciantului. In romana, si numind lucrul de reparat. */
  mesaj: string;
  /** Unde sa-l duca interfata cand apasa pe constatare. */
  tinta?: string;
}

export interface RezultatValidare {
  sePoatePublica: boolean;
  constatari: Constatare[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURATIA IMPLICITA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce are cumparatorul pe ecran cand deschide pagina, inainte sa atinga ceva.
 *
 * ⚠ Un implicit STINS nu se alege. Comerciantul a scos optiunea din vanzare; pusa ca implicit,
 * primul cumparator ar fi comandat ce nu mai exista.
 */
export function configuratiaImplicita(d: Definitie): Valori {
  const out: Valori = {};
  for (const nod of toateNodurile(d)) {
    if (!producesValoare(nod)) continue;
    const v = implicitulNodului(nod);
    if (v) out[nod.id] = v;
  }
  return out;
}

function implicitulNodului(nod: Nod): Valoare | null {
  switch (nod.fel) {
    case "text":
      return nod.implicit ? normalizeazaValoare({ f: "text", v: nod.implicit }) : null;
    case "numar":
      return eNumarBun(nod.implicit) ? { f: "numar", v: nod.implicit } : null;
    case "comutator":
      return nod.implicit === true ? { f: "comutator", v: true } : null;
    case "alegere": {
      const o = (nod.optiuni ?? []).find((x) => x.id === nod.implicit && optiuneActiva(x));
      return o ? { f: "alegere", v: o.id } : null;
    }
    case "alegeri": {
      const ids = (nod.implicit ?? []).filter((id) =>
        (nod.optiuni ?? []).some((x) => x.id === id && optiuneActiva(x)));
      return ids.length ? normalizeazaValoare({ f: "alegeri", v: ids }) : null;
    }
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface IntrareValidare {
  definitie: Definitie;
  reguli: Regula[];
  pretuire: Pretuire;
  /** Pretul produsului pe care ar sta configuratorul. Ii trebuie probei de pret. */
  pretProdus?: number;
  /** Semne lasate de sablon, care NU au voie sa ajunga in vanzare. */
  marcajeDemo?: string[];
}

export function valideaza(intrare: IntrareValidare): RezultatValidare {
  const { definitie: d, reguli, pretuire } = intrare;
  const c: Constatare[] = [];
  const adauga = (treapta: Treapta, cod: string, mesaj: string, tinta?: string) =>
    c.push({ treapta, cod, mesaj, ...(tinta ? { tinta } : {}) });

  /* ── Structura ───────────────────────────────────────────────────────── */

  const noduri = toateNodurile(d);
  const cuValoare = noduri.filter(producesValoare);

  if (cuValoare.length === 0) {
    adauga("critic", "fara_optiuni",
      "Configuratorul nu are nicio optiune pe care cumparatorul sa o completeze.");
  }
  if (noduri.length >= MAX_NODURI) {
    adauga("critic", "prea_multe_noduri",
      `Configuratorul are prea multe optiuni (plafonul este ${MAX_NODURI}).`);
  }

  // ⚠ Id-urile repetate sunt cea mai rea greseala de structura: formulele si regulile trimit la
  // ele, iar `harta` ia PRIMUL — deci o regula ar lovi cine se nimereste.
  const vazute = new Set<string>();
  for (const id of toateIdurile(d)) {
    if (vazute.has(id)) {
      adauga("critic", "id_repetat", `Identificatorul „${id}" apare de mai multe ori.`, id);
    }
    vazute.add(id);
  }

  for (const pas of d.pasi ?? []) {
    const cateNoduri = (pas.grupuri ?? []).reduce((s, g) => s + (g.noduri ?? []).length, 0);
    if (cateNoduri === 0) {
      adauga("atentie", "pas_gol",
        `Pasul „${pas.eticheta || pas.id}" nu are nicio optiune si va fi sarit.`, pas.id);
    }
  }

  for (const nod of noduri) {
    if (!nod.eticheta || !nod.eticheta.trim()) {
      adauga("critic", "fara_eticheta", `O optiune nu are nume (${nod.id}).`, nod.id);
    }
    if (areOptiuni(nod)) {
      const active = (nod.optiuni ?? []).filter(optiuneActiva);
      if (active.length === 0) {
        adauga("critic", "alegere_fara_optiuni",
          `„${nod.eticheta}" nu are nicio optiune activa de ales.`, nod.id);
      }
      for (const o of nod.optiuni ?? []) {
        if (!o.eticheta || !o.eticheta.trim()) {
          adauga("critic", "optiune_fara_eticheta",
            `O optiune din „${nod.eticheta}" nu are nume.`, nod.id);
        }
        if (o.pret !== undefined && !eNumarBun(o.pret)) {
          adauga("critic", "pret_optiune_nevalid",
            `Optiunea „${o.eticheta}" din „${nod.eticheta}" are un pret care nu e un numar.`, nod.id);
        }
      }
    }
    if (nod.fel === "numar" && eNumarBun(nod.min) && eNumarBun(nod.max) && nod.min > nod.max) {
      adauga("critic", "limite_pe_dos",
        `„${nod.eticheta}": minimul este mai mare decat maximul.`, nod.id);
    }
  }

  /* ── Formule: referinte, marime, cicluri ─────────────────────────────── */

  const idNoduri = new Set(noduri.map((n) => n.id));
  const idCalcule = new Set(Object.keys(d.calcule ?? {}));
  const cunoscute = new Set([...idNoduri, ...idCalcule]);

  const formule: { unde: string; tinta: string; e: Parameters<typeof referinteleDin>[0] }[] = [];
  for (const [id, e] of Object.entries(d.calcule ?? {})) formule.push({ unde: `calculul „${id}"`, tinta: id, e });
  if (pretuire.formula) formule.push({ unde: "formula de pret", tinta: "pret", e: pretuire.formula });
  for (const m of pretuire.modificatori ?? []) {
    if (m.formula) formule.push({ unde: `modificatorul „${m.eticheta ?? m.id}"`, tinta: m.id, e: m.formula });
  }

  for (const f of formule) {
    for (const r of referinteleDin(f.e)) {
      if (!cunoscute.has(r)) {
        adauga("critic", "referinta_lipsa",
          `In ${f.unde} se foloseste ceva care nu mai exista (${r}).`, f.tinta);
      }
    }
    if (numaraNoduri(f.e) > MAX_NODURI_EXPR) {
      adauga("critic", "formula_prea_mare", `${f.unde} este prea complicata.`, f.tinta);
    }
    if (adancimea(f.e) > MAX_ADANCIME) {
      adauga("critic", "formula_prea_adanca", `${f.unde} are prea multe niveluri.`, f.tinta);
    }
  }

  for (const id of ciclurileDintreCalcule(d)) {
    adauga("critic", "ciclu_calcule",
      `Calculul „${id}" se cere pe sine, direct sau prin altele.`, id);
  }

  /* ── Reguli: tinte, si oscilatie ─────────────────────────────────────── */

  const idStructura = new Set<string>();
  for (const pas of d.pasi ?? []) {
    idStructura.add(pas.id);
    for (const g of pas.grupuri ?? []) idStructura.add(g.id);
  }
  const tinteBune = new Set([...idNoduri, ...idStructura]);

  for (const r of reguli ?? []) {
    for (const n of nodurileCerute(r.cand)) {
      if (!cunoscute.has(n)) {
        adauga("critic", "regula_conditie_lipsa",
          `O regula se uita la o optiune care nu mai exista (${n}).`, r.id);
      }
    }
    for (const a of r.atunci ?? []) {
      if ("tinta" in a && a.tinta && !tinteBune.has(a.tinta)) {
        adauga("critic", "regula_tinta_lipsa",
          `O regula incearca sa schimbe ceva care nu mai exista (${a.tinta}).`, r.id);
      }
      if ((a.a === "doar_optiunile" || a.a === "fara_optiunile")) {
        const nod = noduri.find((n) => n.id === a.tinta);
        if (nod && areOptiuni(nod)) {
          for (const o of a.optiuni ?? []) {
            if (!(nod.optiuni ?? []).some((x) => x.id === o)) {
              adauga("critic", "regula_optiune_lipsa",
                `O regula trimite la o optiune care nu mai exista in „${nod.eticheta}".`, r.id);
            }
          }
        }
      }
    }
  }

  /* ── Proba adevarata: se ruleaza motorul pe configuratia implicita ───── */

  const implicit = configuratiaImplicita(d);
  const stare = aplicaRegulile(d, reguli ?? [], implicit);

  if (stare.neasezat) {
    adauga("critic", "reguli_oscileaza",
      "Regulile se bat cap in cap: aratand si ascunzand la nesfarsit, configuratorul nu ajunge "
      + "niciodata intr-o stare stabila.");
  }
  for (const conflict of stare.conflicte) {
    adauga("atentie", "conflict_reguli",
      `Doua reguli spun lucruri diferite despre „${conflict.tinta}"; a castigat `
      + `„${conflict.castigator}", fiindca e cea mai stransa.`, conflict.tinta);
  }

  const rezultatPret = calculeazaPretul({
    definitie: d, pretuire, stare, pretProdus: intrare.pretProdus ?? 0,
  });
  if (!rezultatPret.ok) {
    adauga("critic", `pret_${rezultatPret.cod}`,
      mesajPret(rezultatPret.cod), rezultatPret.id);
  }

  /* ── Limite si semne de sablon ───────────────────────────────────────── */

  if (eNumarBun(pretuire.minim) && eNumarBun(pretuire.maxim) && pretuire.minim > pretuire.maxim) {
    adauga("critic", "limite_pret_pe_dos", "Pretul minim este mai mare decat cel maxim.");
  }
  if (pretuire.rotunjire && (!eNumarBun(pretuire.rotunjire.pas) || pretuire.rotunjire.pas < 0)) {
    adauga("critic", "rotunjire_nevalida", "Pasul de rotunjire a pretului nu e un numar bun.");
  }

  /*
   * ⚠ Valorile de demonstratie ale sablonului NU au voie sa ajunga in vanzare.
   *
   * Un sablon porneste cu „89 lei/m²" ca sa se vada cum arata. Publicat asa, primul cumparator
   * plateste un numar pe care comerciantul nu l-a ales niciodata.
   */
  for (const marcaj of intrare.marcajeDemo ?? []) {
    adauga("critic", "valoare_demo",
      `„${marcaj}" a ramas cu valoarea din sablon. Pune-o pe a ta inainte de publicare.`, marcaj);
  }

  return { sePoatePublica: !c.some((x) => x.treapta === "critic"), constatari: c };
}

function mesajPret(cod: string): string {
  switch (cod) {
    case "impartire_la_zero": return "Formula de pret imparte la zero.";
    case "referinta_lipsa": return "Formula de pret foloseste ceva care nu mai exista.";
    case "ciclu": return "Formula de pret se cere pe sine.";
    case "pret_negativ": return "Pe configuratia implicita, pretul iese negativ.";
    case "limite_pe_dos": return "Pretul minim este mai mare decat cel maxim.";
    case "rezultat_nefinit": return "Formula de pret da un numar pe care nu-l putem folosi.";
    default: return "Pretul nu se poate calcula pe configuratia implicita.";
  }
}

/**
 * Calculele care se cer pe ele insele, direct sau prin altele.
 *
 * ⚠ Iterativ, cu culori: o definitie stricata n-are voie sa doboare stiva chiar in pasul care
 * incearca s-o refuze.
 */
export function ciclurileDintreCalcule(d: Definitie): string[] {
  const calcule = d.calcule ?? {};
  const ids = Object.keys(calcule);
  const stare = new Map<string, 0 | 1 | 2>(); // 0 neatins, 1 pe drum, 2 gata
  const gasite: string[] = [];

  for (const start of ids) {
    if (stare.get(start) === 2) continue;
    // Parcurgere in adancime, cu stiva proprie. `intra` marcheaza intrarea, `iese` iesirea.
    const stiva: { id: string; intra: boolean }[] = [{ id: start, intra: true }];
    while (stiva.length) {
      const pas = stiva.pop()!;
      if (!pas.intra) { stare.set(pas.id, 2); continue; }
      const s = stare.get(pas.id) ?? 0;
      if (s === 2) continue;
      if (s === 1) { if (!gasite.includes(pas.id)) gasite.push(pas.id); continue; }
      stare.set(pas.id, 1);
      stiva.push({ id: pas.id, intra: false });
      const e = calcule[pas.id];
      if (e) {
        for (const r of referinteleDin(e)) {
          if (calcule[r] !== undefined) stiva.push({ id: r, intra: true });
        }
      }
    }
  }
  return gasite;
}
