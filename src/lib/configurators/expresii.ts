/**
 * Formulele configuratorului: arborele de expresii si evaluatorul lui.
 *
 * ═══ COMERCIANTUL NU SCRIE COD ═══
 *
 * Interfata construieste un ARBORE, nu un sir de caractere. Nu exista `eval`, nu exista
 * `new Function`, nu exista niciun sir care sa fie vreodata interpretat ca program. Ce se
 * salveaza in baza e chiar structura de mai jos, si tot ce poate ea sa exprime e aritmetica
 * din lista inchisa de mai jos — atat.
 *
 * ═══ ⚠ LISTA DE OPERATORI E INCHISA DINADINS ═══
 *
 * `+ - * /`, negarea, `min`, `max`, `round`, `ceil`, `floor`, `abs`. Nimic altceva.
 *
 * Motivul nu e prudenta, ci DETERMINISMUL. Pretul se calculeaza si in browser (ca sa se vada
 * pe ecran) si pe server (ca sa se incaseze), din ACELASI fisier. Cele patru operatii si
 * functiile de mai sus sunt exact specificate in IEEE-754 si in ECMAScript, deci dau bit cu
 * bit acelasi rezultat pe orice masina. `Math.pow`, radicalul si trigonometria NU sunt: acolo
 * standardul lasa precizia la voia implementarii, iar doua motoare JavaScript au voie sa
 * raspunda diferit. O diferenta de un bit intre ecran si casa de marcat inseamna un client
 * caruia i se cere alt pret decat cel promis.
 *
 * ⚠ Deci: cine adauga un operator nou trebuie sa dovedeasca intai ca e exact specificat.
 *
 * ═══ CE NU POATE SA IASA DE AICI ═══
 *
 * Niciodata `NaN`, niciodata `±Infinity`, niciodata un rezultat dintr-o impartire la zero.
 * Toate trei se intorc ca EROARE, nu ca numar. Motivul e scris in `unitati.ts`: `round2`
 * inghite gunoiul in zero, iar zero la pret inseamna marfa data pe gratis.
 */

import { eNumarBun } from "./unitati";

/* ═══════════════════════════════════════════════════════════════════════════
   ARBORELE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Operatiile cu doi operanzi. */
export type OperatieBinara = "adun" | "scad" | "inmultesc" | "impart" | "minim" | "maxim";

/** Operatiile cu un operand si un pas optional de rotunjire. */
export type OperatieRotunjire = "rotunjesc" | "insus" | "injos";

export type Expresie =
  /** Un numar scris de comerciant. In unitatea de baza — vezi `unitati.ts`. */
  | { k: "numar"; v: number }
  /**
   * Valoarea unui camp sau a unui calcul intermediar, dupa ID-UL LUI STABIL.
   *
   * ⚠ Niciodata dupa eticheta. Comerciantul poate redenumi „Latime" in „Latimea panoului"
   * oricand, iar formulele trebuie sa mearga mai departe.
   */
  | { k: "ref"; id: string }
  | { k: "bin"; op: OperatieBinara; a: Expresie; b: Expresie }
  | { k: "neg"; a: Expresie }
  | { k: "abs"; a: Expresie }
  /**
   * Rotunjire, optional la un PAS.
   *
   * Fara `pas`, se rotunjeste la intreg. Cu `pas`, la cel mai apropiat multiplu al lui —
   * asa se exprima „suprafata facturata se rotunjeste la 0,5 m²" sau „pretul se rotunjeste
   * la 5 lei", fara ca cineva sa scrie de mana `round(x / 5) * 5`.
   */
  | { k: "rot"; op: OperatieRotunjire; a: Expresie; pas?: Expresie };

/* ═══════════════════════════════════════════════════════════════════════════
   LIMITE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Plafoane de SIGURANTA, nu de abonament.
 *
 * Definitia vine din baza si trece prin `zod`, dar un arbore adanc de zece mii de noduri ar
 * putea ajunge acolo si dintr-o migratie, si dintr-o scriere gresita. Evaluatorul le verifica
 * el insusi, ca sa nu se bizuie pe faptul ca altcineva a validat inainte.
 */
export const MAX_ADANCIME = 32;
export const MAX_NODURI = 512;

/* ═══════════════════════════════════════════════════════════════════════════
   REZULTATUL
   ═══════════════════════════════════════════════════════════════════════════ */

export type CodEroareExpresie =
  | "impartire_la_zero"
  | "rezultat_nefinit"
  | "referinta_lipsa"
  | "ciclu"
  | "prea_adanc"
  | "prea_multe_noduri"
  | "nod_necunoscut"
  | "pas_nevalid";

export type RezultatExpresie =
  | { ok: true; v: number }
  | { ok: false; cod: CodEroareExpresie; /** Id-ul care a produs eroarea, cand exista unul. */ id?: string };

/** Ce vede evaluatorul: valorile campurilor, si calculele intermediare pe care le poate desface. */
export interface ContextExpresie {
  /** Valorile deja stiute, dupa id stabil. Campurile completate de cumparator ajung aici. */
  valori: ReadonlyMap<string, number>;
  /** Calcule intermediare, tot dupa id stabil. Se evalueaza la cerere, cu paza de ciclu. */
  calcule?: ReadonlyMap<string, Expresie>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MASURATORI (le foloseste si validatorul de publicare)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cate noduri are arborele. Iterativ, ca un arbore stricat sa nu doboare stiva. */
export function numaraNoduri(e: Expresie): number {
  let n = 0;
  const stiva: Expresie[] = [e];
  while (stiva.length) {
    const nod = stiva.pop()!;
    n++;
    // Plafon dur chiar aici: un arbore inventat cu un milion de noduri n-are voie sa ne tina
    // in bucla doar ca sa aflam cat de mare e.
    if (n > MAX_NODURI) return n;
    for (const copil of copiii(nod)) stiva.push(copil);
  }
  return n;
}

/** Cat de adanc e arborele. Tot iterativ. */
export function adancimea(e: Expresie): number {
  let max = 0;
  const stiva: { nod: Expresie; d: number }[] = [{ nod: e, d: 1 }];
  let pasi = 0;
  while (stiva.length) {
    const { nod, d } = stiva.pop()!;
    if (d > max) max = d;
    if (max > MAX_ADANCIME || ++pasi > MAX_NODURI) return max;
    for (const copil of copiii(nod)) stiva.push({ nod: copil, d: d + 1 });
  }
  return max;
}

/** Id-urile pe care le cere arborele. Le foloseste graful de dependente. */
export function referinteleDin(e: Expresie): Set<string> {
  const out = new Set<string>();
  const stiva: Expresie[] = [e];
  let pasi = 0;
  while (stiva.length && ++pasi <= MAX_NODURI) {
    const nod = stiva.pop()!;
    if (nod.k === "ref") out.add(nod.id);
    for (const copil of copiii(nod)) stiva.push(copil);
  }
  return out;
}

function copiii(e: Expresie): Expresie[] {
  switch (e.k) {
    case "numar":
    case "ref": return [];
    case "bin": return [e.a, e.b];
    case "neg":
    case "abs": return [e.a];
    case "rot": return e.pas ? [e.a, e.pas] : [e.a];
    default: return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVALUAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Calculeaza arborele.
 *
 * ⚠ Nu arunca NICIODATA. Orice necaz iese ca `{ ok: false, cod }`, ca apelantul sa poata
 * spune omului ce s-a intamplat si sa NU duca mai departe un pret inventat.
 */
export function evalueaza(e: Expresie, ctx: ContextExpresie): RezultatExpresie {
  return calc(e, ctx, 1, new Set<string>());
}

function calc(
  e: Expresie,
  ctx: ContextExpresie,
  adancime: number,
  inCurs: Set<string>,
): RezultatExpresie {
  // Recursivitatea de aici e MARGINITA de plafonul asta, deci stiva nu poate creste la
  // nesfarsit nici pe un arbore venit stricat din baza.
  if (adancime > MAX_ADANCIME) return { ok: false, cod: "prea_adanc" };

  switch (e.k) {
    case "numar":
      // ⚠ Si numarul scris de comerciant se verifica: in `jsonb` poate ajunge orice.
      return eNumarBun(e.v) ? { ok: true, v: e.v } : { ok: false, cod: "rezultat_nefinit" };

    case "ref": {
      const gata = ctx.valori.get(e.id);
      if (gata !== undefined) {
        return eNumarBun(gata) ? { ok: true, v: gata } : { ok: false, cod: "rezultat_nefinit", id: e.id };
      }
      const formula = ctx.calcule?.get(e.id);
      if (!formula) return { ok: false, cod: "referinta_lipsa", id: e.id };
      /*
       * ⚠ PAZA DE CICLU. „Suprafata" poate cere „Latime", dar daca „Latime" ajunge sa ceara
       * inapoi „Suprafata", desfacerea n-ar avea capat. Se opreste la a doua intrare in
       * acelasi id, pe DRUMUL curent — nu global, fiindca acelasi calcul poate fi cerut
       * legitim de doua ramuri diferite.
       */
      if (inCurs.has(e.id)) return { ok: false, cod: "ciclu", id: e.id };
      inCurs.add(e.id);
      const r = calc(formula, ctx, adancime + 1, inCurs);
      inCurs.delete(e.id);
      return r;
    }

    case "neg": {
      const a = calc(e.a, ctx, adancime + 1, inCurs);
      if (!a.ok) return a;
      return incheie(-a.v);
    }

    case "abs": {
      const a = calc(e.a, ctx, adancime + 1, inCurs);
      if (!a.ok) return a;
      return incheie(Math.abs(a.v));
    }

    case "bin": {
      const a = calc(e.a, ctx, adancime + 1, inCurs);
      if (!a.ok) return a;
      const b = calc(e.b, ctx, adancime + 1, inCurs);
      if (!b.ok) return b;
      switch (e.op) {
        case "adun": return incheie(a.v + b.v);
        case "scad": return incheie(a.v - b.v);
        case "inmultesc": return incheie(a.v * b.v);
        case "impart":
          /*
           * ⚠ Zero se prinde INAINTE de impartire, nu dupa.
           *
           * `1/0` da `Infinity`, iar `0/0` da `NaN`; amandoua ar fi fost prinse si de garda
           * de la capat, dar codul de eroare ar fi fost „rezultat nefinit", adica un mesaj
           * din care comerciantul n-ar fi inteles ce are de reparat in formula lui.
           *
           * ⚠ Si `-0` e zero. `Object.is(-0, 0)` e fals, deci comparatia se face cu `===`,
           * care le socoteste egale.
           */
          if (b.v === 0) return { ok: false, cod: "impartire_la_zero" };
          return incheie(a.v / b.v);
        case "minim": return incheie(Math.min(a.v, b.v));
        case "maxim": return incheie(Math.max(a.v, b.v));
        default: return { ok: false, cod: "nod_necunoscut" };
      }
    }

    case "rot": {
      const a = calc(e.a, ctx, adancime + 1, inCurs);
      if (!a.ok) return a;
      let pas = 1;
      if (e.pas) {
        const p = calc(e.pas, ctx, adancime + 1, inCurs);
        if (!p.ok) return p;
        /*
         * ⚠ Un pas de zero sau negativ NU e o rotunjire, e o impartire la zero deghizata sau
         * o rasturnare de sens. Se refuza pe fata, cu cod propriu.
         */
        if (!(p.v > 0)) return { ok: false, cod: "pas_nevalid" };
        pas = p.v;
      }
      /*
       * ⚠ `Math.round` rotunjeste catre PLUS INFINIT la egalitate: `round(2,5)` da 3, dar
       * `round(-2,5)` da -2, nu -3. Se lasa asa dinadins — e purtarea specificata, deci si
       * cea deterministica — si e scrisa aici ca sa n-o „repare" nimeni mai tarziu.
       */
      const impartit = a.v / pas;
      if (!eNumarBun(impartit)) return { ok: false, cod: "rezultat_nefinit" };
      const dus =
        e.op === "rotunjesc" ? Math.round(impartit)
          : e.op === "insus" ? Math.ceil(impartit)
            : Math.floor(impartit);
      return incheie(dus * pas);
    }

    default:
      // Un `k` necunoscut inseamna o definitie mai noua decat codul care o citeste. Se
      // opreste; nu se ghiceste.
      return { ok: false, cod: "nod_necunoscut" };
  }
}

/** Ultima poarta: nimic nefinit nu iese din motor ca numar. */
function incheie(v: number): RezultatExpresie {
  return eNumarBun(v) ? { ok: true, v } : { ok: false, cod: "rezultat_nefinit" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AJUTOARE DE CONSTRUIRE (le foloseste interfata si sabloanele)
   ═══════════════════════════════════════════════════════════════════════════ */

export const num = (v: number): Expresie => ({ k: "numar", v });
export const ref = (id: string): Expresie => ({ k: "ref", id });
export const bin = (op: OperatieBinara, a: Expresie, b: Expresie): Expresie => ({ k: "bin", op, a, b });
export const rot = (op: OperatieRotunjire, a: Expresie, pas?: Expresie): Expresie =>
  pas ? { k: "rot", op, a, pas } : { k: "rot", op, a };
