/**
 * Cotele de TVA ale liniilor unei comenzi, si ce se poate face cu ele.
 *
 * ═══ FIECARE LINIE ISI POARTA COTA EI ═══
 *
 * Pentru o comanda din magazin exista o singura cota, prin constructie: e a magazinului. Pentru
 * una de marketplace nu — Pepita trimite TVA pe FIECARE linie, iar in Romania cotele chiar
 * difera: hrana are 11%, restul 21%.
 *
 * ⚠ TREI ETAPE, IN TREI ZILE, SI MERITA STIUTE TOATE. Pana la 08.09.2026 `orders.vat_rate` era
 * `max(cote)`: cea mai proasta alegere din toate, fiindca supra-taxeaza TOATE liniile si o face
 * tacut. Pe 08.09 a devenit cota liniei celei mai valoroase (`cotaDominanta`) si s-a pus o
 * POARTA: comanda cu cote diferite nu se mai factura deloc. Pe 09.09 poarta a fost ridicata,
 * fiindca liniile au inceput sa-si poarte cotele lor — vezi `cotaDeFacturare` si `planulCotelor`.
 *
 * ⚠ `cotaDominanta` NU A DISPARUT, si nu e o scapare: `orders.vat_rate` ramane UN singur numar,
 * iar el e cel scris acolo. E cota DOCUMENTULUI, cea pe care cade orice linie care nu-si poarta
 * cota proprie, si cea a liniei de ajustare a rotunjirii. Nu mai e insa cota liniilor.
 *
 * ⚠ CE POATE INCA OPRI UN DOCUMENT: o cota pentru care contul de facturare n-are nume in
 * nomenclator. SmartBill si Oblio primesc perechea nume+procent, si acolo greseala ar fi tot o
 * cota scrisa peste alta. Vezi `numePeCote` din `invoice-vat.ts`.
 *
 * Modul e PUR: se cheama si din ingest, si din facturare, si din panou.
 */

export interface LinieCuTva {
  price?: unknown;
  quantity?: unknown;
  vat_rate?: unknown;
}

export interface CoteleLiniilor {
  /** Cotele distincte, crescator. Gol cand nicio linie n-are cota scrisa. */
  cote: number[];
  /** Toate liniile poarta aceeasi cota (sau niciuna n-o poarta). */
  uniforma: boolean;
  /**
   * Cota cu care s-ar factura, daca s-ar factura.
   *
   * La cote uniforme e chiar aceea. La cote diferite e a liniei cu valoarea cea mai mare:
   * nu e corecta, dar e cea mai putin gresita. Se foloseste doar ca sa nu ramana comanda
   * fara nicio cota scrisa; emiterea automata se opreste oricum.
   */
  cotaDominanta: number;
}

function numar(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cota unei linii, sau `null` cand linia n-o poarta.
 *
 * ⚠ LIPSA NU E ZERO, si asta e chiar deosebirea care conteaza. `Number(undefined) || 0` ar fi dat
 * 0%, adica „scutit de TVA" — iar toate comenzile din magazin, care n-au cota pe linie, ar fi
 * plecat cu 0% la facturare. Lipsa inseamna „linia n-are opinie", si atunci hotaraste documentul.
 */
export function cotaLiniei(l: LinieCuTva): number | null {
  if (l?.vat_rate === null || l?.vat_rate === undefined || l.vat_rate === "") return null;
  const n = Number(l.vat_rate);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function coteleLiniilor(items: unknown): CoteleLiniilor {
  const linii = Array.isArray(items) ? (items as LinieCuTva[]) : [];
  const valoarePeCota = new Map<number, number>();

  for (const l of linii) {
    const cota = cotaLiniei(l);
    if (cota === null) continue;
    const valoare = numar(l.price) * (numar(l.quantity) || 1);
    valoarePeCota.set(cota, (valoarePeCota.get(cota) ?? 0) + valoare);
  }

  const cote = [...valoarePeCota.keys()].sort((a, b) => a - b);
  if (cote.length === 0) return { cote: [], uniforma: true, cotaDominanta: 0 };

  /*
   * ⚠ La valori egale castiga cota MAI MARE, nu prima intalnita. Ordinea liniilor intr-un
   * `jsonb` nu e o hotarare a nimanui, iar un rezultat care atarna de ea s-ar schimba singur
   * la prima rescriere a comenzii. Iar dintre doua rele, sub-taxarea e cea care aduce control
   * fiscal, nu supra-taxarea.
   */
  let dominanta = cote[0];
  let maxim = -1;
  for (const c of cote) {
    const v = valoarePeCota.get(c) ?? 0;
    if (v > maxim || (v === maxim && c > dominanta)) { maxim = v; dominanta = c; }
  }

  return { cote, uniforma: cote.length === 1, cotaDominanta: dominanta };
}

/**
 * Cota cu care pleaca ACEASTA linie pe factura: a ei, altfel a documentului.
 *
 * ⚠ REGULA E `cota liniei ?? cota documentului`, si trebuie probata chiar asa. Scrisa
 * `Number(l.vat_rate) || cotaDocumentului`, o linie cu 0% ADEVARAT (o carte, un produs scutit) ar
 * fi capatat tacut cota documentului. Zero e o cota, nu o lipsa.
 */
export function cotaDeFacturare(l: LinieCuTva, cotaDocumentului: number): number {
  const a = cotaLiniei(l);
  return a === null ? cotaDocumentului : a;
}

export interface GrupaDeCota {
  cota: number;
  /** Valoarea liniilor din grupa, in unitatea in care sunt scrise in comanda. */
  valoare: number;
}

/**
 * Liniile comenzii, adunate pe cote.
 *
 * ⚠ DE CE E NEVOIE: cand cotele difera, TVA-ul continut in totalul comenzii nu se mai poate scoate
 * impartind la un singur numar. Se scoate pe grupe, si abia suma lor e adevarul. Vezi
 * `reconciliazaFactura`.
 *
 * ⚠ Transportul, reducerile si taxele NU sunt aici. Ele n-au cota proprie nicaieri in baza, si
 * apelantul trebuie sa hotarasca ce face cu ele — vezi `imparteProportional`.
 */
export function grupePeCota(items: unknown, cotaDocumentului: number): GrupaDeCota[] {
  const linii = Array.isArray(items) ? (items as LinieCuTva[]) : [];
  const peCota = new Map<number, number>();
  for (const l of linii) {
    const cota = cotaDeFacturare(l, cotaDocumentului);
    const valoare = numar(l.price) * (numar(l.quantity) || 1);
    peCota.set(cota, (peCota.get(cota) ?? 0) + valoare);
  }
  return [...peCota.entries()]
    .map(([cota, valoare]) => ({ cota, valoare }))
    .sort((a, b) => a.cota - b.cota);
}

/**
 * TVA-ul CONTINUT intr-o suma bruta, pe grupe de cota.
 *
 * ⚠ `brut × c / (100 + c)`, nu `brut × c / 100`. A doua formula adauga TVA peste o suma care il
 * contine deja, si iese cu vreo cincime mai mare — greseala clasica, si tacuta, fiindca rezultatul
 * arata plauzibil.
 */
export function tvaContinut(grupe: GrupaDeCota[]): number {
  const suma = grupe.reduce((s, g) => s + (g.valoare * g.cota) / (100 + g.cota), 0);
  return Math.round(suma * 100) / 100;
}

/**
 * Imparte o suma (reducere, transport, taxa) intre grupele de cota, PROPORTIONAL cu valoarea lor.
 *
 * ═══ ⚠ DE CE PROPORTIONAL, SI DE CE TREBUIE IMPARTITA ═══
 *
 * O reducere de 100 de lei peste linii de 11% si de 21% nu are o cota a ei: ea micsoreaza baza
 * fiecarei grupe. Pusa intreaga pe o singura cota, TVA-ul reducerii iese gresit — si iese cu semn
 * OPUS fata de eroarea de pe linii, deci totalul poate parea corect in timp ce defalcarea de TVA e
 * gresita. Exact felul de eroare pe care n-o vede nici comerciantul, nici garda de reconciliere.
 *
 * ⚠ ULTIMA GRUPA IA RESTUL. Trei impartiri rotunjite la doi bani nu dau intotdeauna suma de la
 * care s-a plecat; fara randul asta, factura ar fi iesit cu un ban pe langa si garda ar fi
 * absorbit-o printr-o „ajustare de rotunjire" care de fapt ascunde o impartire gresita.
 */
export function imparteProportional(suma: number, grupe: GrupaDeCota[]): Map<number, number> {
  const out = new Map<number, number>();
  if (grupe.length === 0) return out;

  const total = grupe.reduce((s, g) => s + g.valoare, 0);
  if (total <= 0) {
    /* Fara valoare pe care sa se sprijine impartirea, tot pe prima grupa: nu se inventeaza cote. */
    out.set(grupe[0].cota, Math.round(suma * 100) / 100);
    return out;
  }

  let dat = 0;
  grupe.forEach((g, i) => {
    const ultima = i === grupe.length - 1;
    const parte = ultima
      ? Math.round((suma - dat) * 100) / 100
      : Math.round((suma * g.valoare / total) * 100) / 100;
    dat += parte;
    out.set(g.cota, (out.get(g.cota) ?? 0) + parte);
  });
  return out;
}


/**
 * Tot ce trebuie sa stie o casa de facturare despre cotele unei comenzi.
 *
 * ═══ ⚠ DE CE E AICI SI NU DE TREI ORI ═══
 *
 * SmartBill, Oblio si fGO faceau, fiecare, exact aceleasi patru randuri: grupele, „sunt mai multe
 * cote?", impartirea sumelor fara cota proprie, si numele cu procentul in coada. Scrise de trei
 * ori, ele se puteau desparti in trei — si nimic nu le-ar fi comparat vreodata.
 *
 * ⚠ SI, MAI ALES: scrise in `.actions.ts`, adica in module `"use server"`, socoteala nu se putea
 * proba pe VALORI. Ramaneau doar probe care citesc sursa si spun ca s-a chemat o functie — adica
 * exact felul de proba care a lasat cosul sa arate 89 in timp ce serverul incasa 910.
 */
export interface PlanulCotelor {
  /** Grupele de cota ale marfii, crescator. */
  grupe: GrupaDeCota[];
  /** Comanda are mai mult de o cota pe linii. */
  amestecate: boolean;
  /**
   * Cum se imparte o suma care n-are cota proprie nicaieri in baza: transport, reduceri, taxe.
   *
   * ⚠ LA O SINGURA COTA NU SE IMPARTE NIMIC: suma intreaga, pe chiar cota documentului. Trecuta si
   * atunci prin impartire, o comanda FARA linii si-ar fi pierdut tacut transportul, iar preturile
   * s-ar fi rotunjit la doi bani inainte de vreme.
   */
  peGrupe(suma: number): [number, number][];
  /** Numele liniei: cu procentul in coada doar cand chiar sunt mai multe cote. */
  numeCuCota(nume: string, cota: number): string;
  /**
   * Codul de produs al liniei.
   *
   * ⚠ PE CONTURILE CU GESTIUNE, CODUL E ARTICOLUL, iar un articol are o singura cota: doua linii
   * „transport" cu 11% si cu 21% ar fi cerut aceluiasi articol doua cote deodata.
   */
  codCuCota(cod: string, cota: number): string;
  /**
   * Cota cu care pleaca ACEASTA linie: a ei, altfel a documentului.
   *
   * ═══ ⚠ SI ZERO PE DOCUMENT INSEAMNA ZERO PE TOATE LINIILE ═══
   *
   * Aici a fost o regresie a mea, prinsa la recitire si nu de vreo proba. `cotaDeFacturare(item,
   * 0)` intoarce cota SCRISA PE LINIE, iar liniile de marketplace o poarta mereu: la un comerciant
   * NEPLATITOR de TVA, o comanda Pepita ar fi plecat spre fGO cu 11% si 21% pe linii, desi omul nu
   * e platitor si factura lui n-are voie sa arate niciun TVA.
   *
   * Regula sta AICI, nu in cele trei case, tocmai fiindca acolo a fost scrisa gresit de trei ori.
   */
  cotaLiniei(l: LinieCuTva): number;
  /**
   * TVA-ul continut in totalul comenzii, cu tot cu sumele care se impart.
   *
   * ⚠ TRANSPORTUL SI REDUCERILE INTRA SI ELE IN TOTAL. Socotit doar pe marfa, numarul asta ar fi
   * fost comparat de garda de reconciliere cu un total care contine mai mult decat marfa.
   */
  tvaDinTotal(sume: SumeFaraCota): number;
}

/** Sumele comenzii care n-au cota proprie. Pozitive se adauga, reducerile se scad. */
export interface SumeFaraCota {
  transport?: unknown;
  taxaRamburs?: unknown;
  reduceri?: unknown[];
}

export function planulCotelor(items: unknown, cotaDocumentului: number): PlanulCotelor {
  /* ⚠ Cota zero pe document inseamna „nu se taxeaza nimic": nici grupele nu se mai fac, altfel
     s-ar imparti transportul intre cote care nu vor ajunge pe nicio linie. */
  const grupe = cotaDocumentului > 0 ? grupePeCota(items, cotaDocumentului) : [];
  const amestecate = grupe.length > 1;

  /*
   * ⚠ LA O SINGURA GRUPA, SUMA URMEAZA GRUPA — nu cota documentului.
   *
   * De obicei sunt acelasi numar: pentru o comanda din magazin nicio linie nu poarta cota proprie,
   * deci grupa se face chiar pe cota documentului. Se despart pe o comanda de marketplace la care
   * TOATE liniile au 11%, dar `orders.vat_rate` a ramas 21 — asa arata comenzile intrate inainte ca
   * ingestul sa scrie cota dominanta. Transportul ar fi plecat atunci cu 21% peste marfa de 11%.
   *
   * `grupe` gol (comanda fara linii, sau neplatitor) cade inapoi pe cota documentului.
   */
  const peGrupe = (suma: number): [number, number][] => (amestecate
    ? [...imparteProportional(suma, grupe).entries()].filter(([, v]) => Math.abs(v) >= 0.005)
    : [[grupe[0]?.cota ?? cotaDocumentului, suma]]);

  const pozitiv = (v: unknown) => Math.max(0, Number(v) || 0);

  return {
    grupe,
    amestecate,
    peGrupe,
    numeCuCota: (nume, cota) => (amestecate ? `${nume} (${cota}%)` : nume),
    cotaLiniei: (l) => (cotaDocumentului > 0 ? cotaDeFacturare(l, cotaDocumentului) : 0),
    codCuCota: (cod, cota) => (amestecate ? `${cod}-${String(cota).replace(".", "-")}` : cod),
    tvaDinTotal: (sume) => {
      const peCota = new Map(grupe.map((g) => [g.cota, g.valoare]));
      const adauga = (suma: number, semn: number) => {
        if (suma <= 0) return;
        for (const [cota, valoare] of peGrupe(suma)) {
          peCota.set(cota, (peCota.get(cota) ?? 0) + semn * valoare);
        }
      };
      adauga(pozitiv(sume.transport), 1);
      adauga(pozitiv(sume.taxaRamburs), 1);
      for (const r of sume.reduceri ?? []) adauga(pozitiv(r), -1);
      return tvaContinut([...peCota.entries()].map(([cota, valoare]) => ({ cota, valoare })));
    },
  };
}
