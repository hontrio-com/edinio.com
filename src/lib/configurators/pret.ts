/**
 * Cat costa o bucata configurata.
 *
 * ═══ ⚠ ORDINEA E SCRISA, NU „CEA DIN VECTOR" ═══
 *
 * Aceeasi multime de adaosuri aplicata in alta ordine da alt numar: un procent pus inaintea
 * unui adaos fix nu inseamna acelasi lucru cu unul pus dupa. Daca ordinea ar veni din pozitia
 * in lista, o simpla reasezare in interfata ar schimba tacit pretul unui produs deja publicat.
 *
 * Ordinea e asta, si e aceeasi in browser si pe server fiindca amandoua ruleaza CHIAR fisierul
 * asta:
 *
 *   1. BAZA        — pretul produsului sau al variantei, ori zero, ori o taxa de pornire
 *   2. CALCUL      — formula principala (suprafata x pret pe metru patrat, si asa mai departe)
 *   3. OPTIUNI     — ce adauga fiecare alegere: pret de optiune, pret pe caracter, comutatoare
 *   4. FIXE        — adaosurile si scaderile in lei
 *   5. PROPORTIONALE — procentele si inmultirile, fiecare cu BAZA lui scrisa pe fata
 *   6. COMPONENTE  — ce costa piesele consumate
 *   7. LIMITE      — pretul minim si cel maxim ale configuratorului
 *   8. ROTUNJIRE   — la pasul cerut de comerciant
 *
 * ⚠ Pasul 5 vine dupa 4 dinadins: „plus 10% manopera" se socoteste pe tot ce s-a adunat pana
 * atunci, nu doar pe pretul de baza. Comerciantul care vrea altfel isi scrie baza explicit.
 *
 * ═══ ⚠ CE IESE DE AICI NU E INCA PRETUL COMENZII ═══
 *
 * Iese pretul unitar al unei bucati configurate. Peste el vin, cu motoarele care exista deja:
 * treptele de cantitate, ofertele, cupoanele, TVA-ul si transportul. Configuratorul NU-si scrie
 * propriile reduceri si propriul TVA.
 *
 * ═══ ⚠ NIMIC NU CADE PE ZERO ═══
 *
 * Orice necaz — o formula care nu se poate calcula, o referinta lipsa, un numar nefinit — iese
 * ca EROARE, nu ca pret. `round2` inghite gunoiul in zero, iar zero la pret inseamna marfa data
 * pe gratis. Apelantul e obligat sa se uite la `ok` inainte sa citeasca vreo suma.
 */

import { evalueaza, type ContextExpresie, type Expresie, type CodEroareExpresie } from "./expresii";
import { eNumarBun, round2 } from "./unitati";
import {
  type Definitie, type Nod, type Optiune, areOptiuni, optiuneaDupaId, toateNodurile,
} from "./definitie";
import { numereleDin, type Valori } from "./valori";
import { esteAscuns, seAprinde, type Conditie, type Stare } from "./reguli";

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** De unde porneste pretul. */
export type FelBaza =
  /** Pretul produsului, sau al variantei alese. Purtarea obisnuita. */
  | "produs"
  /** Configuratorul calculeaza tot; pretul din catalog nu intra. */
  | "fara"
  /** O taxa de pornire fixa, plus ce calculeaza configuratorul. */
  | "taxa";

/** Pe ce se socoteste un procent. Scris pe fata, ca sa nu ramana ambiguu. */
export type BazaProcent =
  /** Doar pretul de baza (pasul 1). */
  | "baza"
  /** Doar rezultatul formulei principale (pasul 2). */
  | "calcul"
  /** Tot ce s-a adunat pana la pasul 5. */
  | "subtotal";

export interface Modificator {
  id: string;
  eticheta?: string;
  fel: "fix" | "procent" | "inmultire";
  /** In lei pentru `fix`, in procente pentru `procent`, factor pentru `inmultire`. */
  valoare?: number;
  /** Cand e dat, bate `valoare`: suma se calculeaza din formula. */
  formula?: Expresie;
  /** Numai pentru `procent`. */
  baza?: BazaProcent;
  /** Se aplica doar cand conditia se aprinde. Lipsa = mereu. */
  cand?: Conditie;
}

export interface Pretuire {
  baza: FelBaza;
  /** Numai pentru `baza: "taxa"`. */
  taxaInitiala?: number;
  /** Formula principala, in LEI. */
  formula?: Expresie;
  modificatori?: Modificator[];
  minim?: number;
  maxim?: number;
  rotunjire?: { fel: "aproape" | "insus" | "injos"; pas: number };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REZULTATUL
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LinieDescompunere { id: string; eticheta: string; suma: number }

export interface Descompunere {
  /** Pasul 1. */
  baza: number;
  /** Pasul 2. */
  calcul: number;
  /** Pasul 3, desfacut pe optiuni, ca simulatorul din panou sa-l poata arata. */
  optiuni: LinieDescompunere[];
  /** Pasul 4. */
  fixe: LinieDescompunere[];
  /** Pasul 5. */
  proportionale: LinieDescompunere[];
  /** Pasul 6. */
  componente: LinieDescompunere[];
  /** Inainte de limite si rotunjire. */
  brut: number;
  /** Dupa limite. */
  dupaLimite: number;
  /**
   * Pretul unitar final.
   *
   * ⚠ NEROTUNJIT LA BAN dinadins, ca `pret x cantitate` sa dea exact subtotalul liniei —
   * aceeasi regula pe care o tin deja `order.actions.ts` si `quantity-tiers.ts`. Rotunjirea la
   * bani se face la GRANITA, unde pleaca documentul (`billing/reconcile.ts`).
   *
   * `rotunjire` din `Pretuire` e altceva: e o hotarare comerciala a comerciantului („pretul se
   * rotunjeste la 5 lei"), si ea SE aplica aici.
   */
  unitar: number;
}

export type CodEroarePret =
  | CodEroareExpresie
  | "pret_negativ"
  | "limite_pe_dos"
  | "baza_nevalida";

export type RezultatPret =
  | { ok: true; d: Descompunere }
  | { ok: false; cod: CodEroarePret; id?: string };

/* ═══════════════════════════════════════════════════════════════════════════
   CONTRIBUTIILE NODURILOR
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cat adauga un text: pretul fix plus atat pe caracter peste cele incluse. */
export function pretulTextului(nod: Nod, valori: Valori): number {
  if (nod.fel !== "text" || !nod.pret) return 0;
  const v = valori[nod.id];
  if (v?.f !== "text" || !v.v) return 0;
  const { fix = 0, peCaracter = 0, caractereIncluse = 0 } = nod.pret;
  // ⚠ Se numara CARACTERE, nu unitati UTF-16: un emoji sau o litera cu semn diacritic compus
  // ocupa doua unitati, si cumparatorul ar fi platit dublu pentru ea.
  const cate = [...v.v].length;
  const peste = Math.max(0, cate - Math.max(0, caractereIncluse));
  return (eNumarBun(fix) ? fix : 0) + peste * (eNumarBun(peCaracter) ? peCaracter : 0);
}

/** Optiunile alese pe un nod, cu pretul lor. */
function optiunileAlese(nod: Nod, valori: Valori): Optiune[] {
  if (!areOptiuni(nod)) return [];
  const v = valori[nod.id];
  const ids = v?.f === "alegere" ? [v.v] : v?.f === "alegeri" ? v.v : [];
  return ids.map((id) => optiuneaDupaId(nod, id)).filter((o): o is Optiune => !!o);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CALCULUL
   ═══════════════════════════════════════════════════════════════════════════ */

export interface IntrarePret {
  definitie: Definitie;
  pretuire: Pretuire;
  /** Starea data de motorul de reguli. Campurile ascunse NU platesc. */
  stare: Stare;
  /** Pretul produsului sau al variantei alese, in lei. Serverul il aduce din catalog. */
  pretProdus: number;
  /** Ce costa componentele consumate. Le socoteste `componente.ts`; aici doar intra in suma. */
  componente?: LinieDescompunere[];
}

/**
 * Pretul unitar al unei bucati configurate.
 *
 * ⚠ Nu arunca niciodata. Orice necaz iese ca `{ ok: false, cod }`.
 */
export function calculeazaPretul(intrare: IntrarePret): RezultatPret {
  const { definitie, pretuire, stare, pretProdus } = intrare;
  const valori = stare.valori;

  /* ── Pasul 1: baza ───────────────────────────────────────────────────── */
  let baza: number;
  switch (pretuire.baza) {
    case "produs": baza = eNumarBun(pretProdus) ? pretProdus : 0; break;
    case "fara": baza = 0; break;
    case "taxa": baza = eNumarBun(pretuire.taxaInitiala) ? pretuire.taxaInitiala : 0; break;
    default: return { ok: false, cod: "baza_nevalida" };
  }
  if (!eNumarBun(baza)) return { ok: false, cod: "rezultat_nefinit" };

  /* ── Contextul formulelor ────────────────────────────────────────────── */
  const ctx: ContextExpresie = {
    valori: numereleDin(valori),
    calcule: new Map(Object.entries(definitie.calcule ?? {})),
  };

  /* ── Pasul 2: formula principala ─────────────────────────────────────── */
  let calcul = 0;
  if (pretuire.formula) {
    const r = evalueaza(pretuire.formula, ctx);
    if (!r.ok) return { ok: false, cod: r.cod, ...(r.id ? { id: r.id } : {}) };
    calcul = r.v;
  }

  /* ── Pasul 3: ce adauga optiunile ────────────────────────────────────── */
  const optiuni: LinieDescompunere[] = [];
  for (const nod of toateNodurile(definitie)) {
    /*
     * ⚠ Un camp ASCUNS de reguli nu plateste. Altfel cumparatorul ar fi platit pentru o alegere
     * pe care n-o mai vede — si care oricum a fost stearsa din valori. Se verifica totusi si
     * aici, ca pretul sa nu depinda de faptul ca altcineva a golit valorile inainte.
     */
    if (esteAscuns(definitie, stare, nod.id)) continue;

    if (nod.fel === "text") {
      const suma = pretulTextului(nod, valori);
      if (suma) optiuni.push({ id: nod.id, eticheta: nod.eticheta, suma });
    } else if (nod.fel === "comutator") {
      const pornit = valori[nod.id]?.f === "comutator";
      const suma = pornit && eNumarBun(nod.pret) ? nod.pret : 0;
      if (suma) optiuni.push({ id: nod.id, eticheta: nod.eticheta, suma });
    } else if (areOptiuni(nod)) {
      for (const o of optiunileAlese(nod, valori)) {
        const suma = eNumarBun(o.pret) ? o.pret : 0;
        if (suma) optiuni.push({ id: o.id, eticheta: `${nod.eticheta}: ${o.eticheta}`, suma });
      }
    }
  }
  const sumaOptiuni = optiuni.reduce((s, o) => s + o.suma, 0);

  /* ── Pasii 4 si 5: modificatorii ─────────────────────────────────────── */
  const fixe: LinieDescompunere[] = [];
  const proportionale: LinieDescompunere[] = [];
  const toti = (pretuire.modificatori ?? []).filter((m) => !m.cand || seAprinde(m.cand, valori));

  for (const m of toti.filter((x) => x.fel === "fix")) {
    const s = sumaModificatorului(m, ctx);
    if (!s.ok) return s;
    if (s.v) fixe.push({ id: m.id, eticheta: m.eticheta ?? m.id, suma: s.v });
  }
  const sumaFixe = fixe.reduce((s, o) => s + o.suma, 0);

  // Subtotalul pe care se socotesc procentele cu baza `subtotal`.
  let subtotal = baza + calcul + sumaOptiuni + sumaFixe;
  if (!eNumarBun(subtotal)) return { ok: false, cod: "rezultat_nefinit" };

  for (const m of toti.filter((x) => x.fel === "procent" || x.fel === "inmultire")) {
    const s = sumaModificatorului(m, ctx);
    if (!s.ok) return s;
    let suma: number;
    if (m.fel === "inmultire") {
      // Factorul inmulteste subtotalul de pana acum; se scrie DIFERENTA, ca sa se vada in
      // descompunere cat a adaugat, nu cat a devenit totul.
      suma = subtotal * s.v - subtotal;
    } else {
      const pe = m.baza === "baza" ? baza : m.baza === "calcul" ? calcul : subtotal;
      suma = pe * (s.v / 100);
    }
    if (!eNumarBun(suma)) return { ok: false, cod: "rezultat_nefinit", id: m.id };
    if (suma) {
      proportionale.push({ id: m.id, eticheta: m.eticheta ?? m.id, suma });
      subtotal += suma;
    }
  }

  /* ── Pasul 6: componentele ───────────────────────────────────────────── */
  const componente = intrare.componente ?? [];
  const sumaComponente = componente.reduce((s, c) => s + (eNumarBun(c.suma) ? c.suma : 0), 0);

  const brut = subtotal + sumaComponente;
  if (!eNumarBun(brut)) return { ok: false, cod: "rezultat_nefinit" };

  /* ── Pasul 7: limitele ───────────────────────────────────────────────── */
  const min = eNumarBun(pretuire.minim) ? pretuire.minim : undefined;
  const max = eNumarBun(pretuire.maxim) ? pretuire.maxim : undefined;
  if (min !== undefined && max !== undefined && min > max) return { ok: false, cod: "limite_pe_dos" };
  let dupaLimite = brut;
  if (min !== undefined) dupaLimite = Math.max(dupaLimite, min);
  if (max !== undefined) dupaLimite = Math.min(dupaLimite, max);

  /* ── Pasul 8: rotunjirea comerciala ──────────────────────────────────── */
  let unitar = dupaLimite;
  const rot = pretuire.rotunjire;
  if (rot && eNumarBun(rot.pas) && rot.pas > 0) {
    const impartit = unitar / rot.pas;
    if (!eNumarBun(impartit)) return { ok: false, cod: "rezultat_nefinit" };
    const dus = rot.fel === "insus" ? Math.ceil(impartit)
      : rot.fel === "injos" ? Math.floor(impartit)
        : Math.round(impartit);
    unitar = dus * rot.pas;
  }

  /*
   * ⚠ NICIODATA NEGATIV.
   *
   * Un configurator cu reduceri mari si o baza mica poate cobori sub zero. Un pret negativ ar
   * fi mers mai departe prin toate motoarele de dupa — trepte, cupoane, TVA — si ar fi ajuns o
   * comanda din care magazinul plateste cumparatorul. Se refuza, nu se prinde la zero: taiat
   * tacut, comerciantul n-ar afla niciodata ca formula lui e gresita.
   */
  if (unitar < 0) return { ok: false, cod: "pret_negativ" };
  if (!eNumarBun(unitar)) return { ok: false, cod: "rezultat_nefinit" };

  return {
    ok: true,
    d: { baza, calcul, optiuni, fixe, proportionale, componente, brut, dupaLimite, unitar },
  };
}

function sumaModificatorului(m: Modificator, ctx: ContextExpresie): { ok: true; v: number } | { ok: false; cod: CodEroarePret; id?: string } {
  if (m.formula) {
    const r = evalueaza(m.formula, ctx);
    if (!r.ok) return { ok: false, cod: r.cod, ...(r.id ? { id: r.id } : {}) };
    return { ok: true, v: r.v };
  }
  return { ok: true, v: eNumarBun(m.valoare) ? m.valoare : 0 };
}

/**
 * Pretul de afisat, rotunjit la ban.
 *
 * ⚠ Numai pentru ECRAN. Ce pleaca in comanda e `unitar`, nerotunjit — vezi nota de pe camp.
 */
export function pretDeAfisat(d: Descompunere): number {
  return round2(d.unitar);
}
