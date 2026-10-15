/**
 * Macheta animată a celui de-al treilea card din „Soluția”: documentele unei comenzi, generate
 * singure. Patru carduri stau într-o grilă 2×2 și se măresc pe rând: factura SmartBill, eticheta
 * AWB FAN Courier care iese din imprimantă, e-mailul de confirmare în Gmail și SMS-ul pe iPhone.
 * Bucla are 20 de secunde.
 *
 * ═══ DE UNDE VINE ═══
 *
 * Macheta a făcut-o clientul (cu Claude), ca pagină de sine stătătoare:
 * `edinio-automatizari-preview.html` („varianta 6”), 14.10.2026. CRONOLOGIA de aici e a ei,
 * neatinsă: când se mărește fiecare card, ce apare în el și când, textele. Și codul de bare, și
 * codul 2D de pe etichetă sunt ai ei: aceeași secvență pseudo-aleatoare, cu aceeași sămânță.
 *
 * ═══ CE S-A SCHIMBAT: CUM SE MIȘCĂ ═══
 *
 * Ca la celelalte două machete (motorul în `animatie-bucla.ts`): tot ce se mișcă merge pe
 * compozitor, iar JavaScript-ul scrie doar textele și ordinea cardurilor, în clipele în care se
 * schimbă. Ce nu se putea traduce direct:
 *
 *   1. CHENARUL VERDE al cardului mărit era un `box-shadow` schimbat prin clasă (`act`); aici
 *      cardul are două umbre, cea obișnuită și cea verde, și se schimbă opacitatea lor.
 *   2. LEDUL IMPRIMANTEI își schimba `background` și `box-shadow`; aici ledul aprins e un strat
 *      peste cel stins.
 *   3. RÂNDURILE din Gmail se mutau fiecare în parte; aici cele vechi stau într-un singur
 *      container care coboară, iar fondul galben al celui nou e un strat care se aprinde.
 *   4. TOTALUL facturii, care crește de la 0 la 189, se scria la fiecare cadru; aici se scrie
 *      de 60 de ori pe secundă, cât ține creșterea (jumătate de secundă), adică la fel.
 *   5. PUNCTELE din bula „scrie...” pulsează doar cât se vede bula, nu toată bucla: în rest sunt
 *      stinse oricum, iar o pulsație pe 20 de secunde ar fi umplut cadrele-cheie degeaba.
 */

import { clamp, eio, eo, lerp, opac, pr, procent, spr, treapta, type Pista } from "./animatie-bucla";

/** Lungimea buclei, în secunde. */
export const BUCLA_S = 20;
/** Când începe să se stingă totul, la capătul buclei. */
const IESIRE = 19;
/** Primul card se mărește la `PRIMUL`, următoarele la câte `PAS` secunde. */
const PRIMUL = 1;
const PAS = 4;

/** Clipa pe care o arată HTML-ul și de la care pornește bucla: grila intrată, nimic generat. */
export const PORNIRE_S = 0.5;
/** Cadrul static pentru „mișcare redusă”: toate patru generate, comanda procesată. */
export const STATIC_S = 17.6;

/* ─── Geometria (în sutimi din lățimea scenei, ca în machetă) ─────────────── */

/** Cardul mărit: stânga, sus, lățime, înălțime. */
export const CARD = { x: 5, y: 15, latime: 90, inaltime: 56 } as const;
/** Colțul stânga-sus al fiecărui card în grilă, și scara lui acolo. */
export const CELULE: ReadonlyArray<readonly [number, number]> = [
  [5, 15],
  [51.5, 15],
  [5, 43.95],
  [51.5, 43.95],
];
export const SCARA_GRILA = 43.5 / 90;
/** Desenul din card e făcut pe o pânză de 1200 × 746 px, micșorată cât cardul (90). */
export const PANZA = { latime: 1200, inaltime: 746 } as const;

const CARDURI = [0, 1, 2, 3] as const;

/** Intrarea a tot, la începutul buclei, și stingerea de la capăt (1 = aprins). */
const intrare = (t: number) => eo(pr(t, 0, 0.5));
export const iesire = (t: number) => 1 - pr(t, IESIRE, IESIRE + 0.5);

/** Când începe să se mărească cardul `i`. */
export const inceputCard = (i: number) => PRIMUL + i * PAS;
/** Cât e de mărit cardul `i` la `t`: 0 în grilă, 1 mărit de tot. */
export function marire(i: number, t: number): number {
  const s = inceputCard(i);
  return eio(pr(t, s, s + 0.55)) * (1 - eio(pr(t, s + 3.3, s + 3.85)));
}
/** Secundele de la capătul măririi cardului `i`: de aici își desenează conținutul. */
export const local = (i: number, t: number) => t - (inceputCard(i) + 0.55);

/** O „bulă” care confirmă un pas (`chip` în machetă): apare din dreapta. */
const bula = (q: number): number[] => [clamp(q * 2.5), (1 - eo(q)) * 18];

/* ─── Eticheta AWB: codul de bare și codul 2D, din secvența machetei ──────── */

/**
 * Codul de bare și codul 2D al etichetei, exact cum le genera macheta: un generator liniar
 * congruențial cu sămânța 7, întâi barele, apoi pătrățelele, din ACEEAȘI secvență.
 */
export const ETICHETA = (() => {
  let samanta = 7;
  const urmator = () => {
    samanta = (samanta * 9301 + 49297) % 233280;
    return samanta / 233280;
  };
  const bare: Array<[number, number]> = [];
  let x = 0;
  while (x < 100) {
    const latime = 0.28 + Math.floor(urmator() * 4) * 0.3;
    bare.push([Number(x.toFixed(2)), Number(latime.toFixed(2))]);
    x += latime + 0.3 + Math.floor(urmator() * 3) * 0.3;
  }
  const patrate: Array<[number, number]> = [];
  for (let r = 0; r < 26; r++) {
    for (let c = 0; c < 26; c++) {
      const plin =
        c === 0 || r === 25 || (r === 0 && c % 2 === 0) || (c === 25 && r % 2 === 1) || (r > 0 && r < 25 && c > 0 && c < 25 && urmator() < 0.5);
      if (plin) patrate.push([c, r]);
    }
  }
  return { bare, patrate };
})();

/** Marginea zimțată a hârtiei, la ieșirea din imprimantă (din bucla machetei). */
export const ZIMTI = (() => {
  let d = "M0 0H568V5";
  for (let x = 568; x >= 0; x -= 8) d += `L${x} ${x % 16 ? 11 : 5}`;
  return `${d}Z`;
})();

/** Avansul hârtiei: în trepte (46), ușor netezite, ca la o imprimantă termică. */
function avans(u: number): { f: number; afisat: number } {
  const f = pr(u, 0.25, 2.1);
  const treaptaAvans = Math.floor(f * 46) / 46;
  return { f, afisat: lerp(treaptaAvans, f, 0.35) };
}
/** Scara etichetei în fereastra ei. */
const SCARA_ETICHETA = 568 / 614;

/* ─── Pistele ──────────────────────────────────────────────────────────────── */

/** 0,01 din lățimea scenei; în pânza cardului (px), o zecime de pixel de pânză. */
const TOL = 0.01;
const TOL_PANZA = 0.1;

const translatieY = (y: number) => ({ transform: `translateY(${y.toFixed(2)}px)` });
const translatieX = (x: number) => ({ transform: `translateX(${x.toFixed(2)}px)` });

/** Bulele de confirmare ale unui card: [card, câte, de când (local), pas]. */
const BULE: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 4, 0.3, 0.55],
  [1, 2, 2.0, 0.35],
  [3, 2, 1.5, 0.35],
];

export const PISTE: readonly Pista[] = [
  /* Comanda de sus: intră, pulsează o dată când apare, se stinge la capăt. */
  {
    tinta: "comanda",
    valori: (t) => [1 + 0.04 * Math.sin(pr(t, 0.3, 0.8) * Math.PI), intrare(t) * iesire(t)],
    scrie: ([s, o]) => ({ transform: `scale(${s.toFixed(4)})`, opacity: opac(o) }),
    toleranta: [0.0005, 0.004],
  },

  ...CARDURI.flatMap((i): Pista[] => [
    /* Cardul: din celula lui din grilă, mărit până acoperă grila, apoi înapoi. */
    {
      tinta: `card-${i}`,
      valori: (t) => {
        const e = marire(i, t);
        const [cx, cy] = CELULE[i];
        return [(cx - CARD.x) * (1 - e), (cy - CARD.y) * (1 - e), lerp(SCARA_GRILA, 1, e), intrare(t) * iesire(t)];
      },
      scrie: ([x, y, s, o]) => ({
        transform: `translate(${procent(x, CARD.latime)}%, ${procent(y, CARD.inaltime)}%) scale(${s.toFixed(5)})`,
        opacity: opac(o),
      }),
      toleranta: [TOL, TOL, TOL / CARD.latime, 0.004],
    },
    /* Umbra obișnuită și cea cu chenar verde, cât e cardul mărit. */
    {
      tinta: `umbra-${i}`,
      valori: (t) => [treapta(!(marire(i, t) > 0.02))],
      scrie: ([o]) => ({ opacity: o }),
      toleranta: [0.004],
    },
    {
      tinta: `chenar-${i}`,
      valori: (t) => [treapta(marire(i, t) > 0.02)],
      scrie: ([o]) => ({ opacity: o }),
      toleranta: [0.004],
    },
  ]),

  /* ── 1. Factura: pagina urcă, blocurile și rândurile apar pe rând. ── */
  {
    tinta: "factura",
    valori: (t) => {
      const q = eo(pr(local(0, t), 0, 0.6));
      return [(1 - q) * 260, clamp(q * 2)];
    },
    scrie: ([y, o]) => ({ transform: `translateY(${y.toFixed(2)}px) scale(0.78)`, opacity: opac(o) }),
    toleranta: [TOL_PANZA, 0.004],
  },
  ...[0, 1].map(
    (j): Pista => ({
      tinta: `factura-bloc-${j}`,
      valori: (t) => {
        const w = pr(local(0, t), 0.35 + j * 0.25, 0.75 + j * 0.25);
        return [w, (1 - eo(w)) * 10];
      },
      scrie: ([o, y]) => ({ opacity: opac(o), ...translatieY(y) }),
      toleranta: [0.004, TOL_PANZA],
    }),
  ),
  ...[0, 1].map(
    (j): Pista => ({
      tinta: `factura-rand-${j}`,
      valori: (t) => {
        const w = pr(local(0, t), 0.9 + j * 0.25, 1.2 + j * 0.25);
        return [w, (1 - eo(w)) * -14];
      },
      scrie: ([o, x]) => ({ opacity: opac(o), ...translatieX(x) }),
      toleranta: [0.004, TOL_PANZA],
    }),
  ),
  {
    tinta: "factura-total",
    valori: (t) => [pr(local(0, t), 1.4, 1.7)],
    scrie: ([o]) => ({ opacity: opac(o) }),
    toleranta: [0.004],
  },

  /* ── 2. AWB: eticheta iese în trepte din imprimantă, care vibrează cât tipărește. ── */
  {
    tinta: "eticheta",
    valori: (t) => {
      const { afisat } = avans(local(1, t));
      return [(afisat - 1) * 445 * SCARA_ETICHETA + 16 * afisat];
    },
    scrie: ([y]) => ({ transform: `translateY(${y.toFixed(2)}px) scale(${SCARA_ETICHETA.toFixed(4)})` }),
    toleranta: [TOL_PANZA],
  },
  {
    tinta: "imprimanta",
    valori: (t) => {
      const u = local(1, t);
      const { f } = avans(u);
      return [f > 0 && f < 1 ? Math.sin(u * 90) * 0.8 : 0];
    },
    scrie: ([x]) => translatieX(x),
    toleranta: [0.02],
  },
  {
    tinta: "led",
    valori: (t) => {
      const u = local(1, t);
      const { f } = avans(u);
      return [treapta(f > 0 && f < 1 ? Math.floor(u * 8) % 2 === 1 : u >= 2.1)];
    },
    scrie: ([o]) => ({ opacity: o }),
    toleranta: [0.004],
  },

  /* ── 3. Gmail: e-mailul nou intră sus, apoi se deschide. ── */
  {
    tinta: "mail-nou",
    valori: (t) => {
      const nq = eio(pr(local(2, t), 0.3, 0.75));
      return [nq];
    },
    scrie: ([o]) => ({ opacity: opac(o) }),
    toleranta: [0.004],
  },
  {
    tinta: "mail-nou-fond",
    valori: (t) => {
      const nq = eio(pr(local(2, t), 0.3, 0.75));
      return [treapta(nq > 0 && nq < 1)];
    },
    scrie: ([o]) => ({ opacity: o }),
    toleranta: [0.004],
  },
  {
    tinta: "mail-vechi",
    valori: (t) => [eio(pr(local(2, t), 0.3, 0.75)) * 42],
    scrie: ([y]) => translatieY(y),
    toleranta: [TOL_PANZA],
  },
  {
    tinta: "mail-lista",
    valori: (t) => [1 - eio(pr(local(2, t), 1.35, 1.75))],
    scrie: ([o]) => ({ opacity: opac(o) }),
    toleranta: [0.004],
  },
  {
    tinta: "mail-citit",
    valori: (t) => {
      const oq = eio(pr(local(2, t), 1.35, 1.75));
      return [oq, (1 - oq) * 24];
    },
    scrie: ([o, x]) => ({ opacity: opac(o), ...translatieX(x) }),
    toleranta: [0.004, TOL_PANZA],
  },
  {
    tinta: "mail-atasament",
    valori: (t) => [pr(local(2, t), 1.8, 2.1)],
    scrie: ([o]) => ({ opacity: opac(o) }),
    toleranta: [0.004],
  },

  /* ── 4. SMS: bula „scrie...”, apoi mesajul. ── */
  {
    tinta: "sms-scrie",
    valori: (t) => {
      const u = local(3, t);
      const ty = u >= 0.2 && u < 1.1;
      return [treapta(ty), ty ? 0.6 + 0.4 * spr(pr(u, 0.2, 0.5)) : 1];
    },
    scrie: ([o, s]) => ({ opacity: o, transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.004, 0.001],
  },
  ...[0, 1, 2].map(
    (j): Pista => ({
      tinta: `sms-punct-${j}`,
      valori: (t) => {
        const u = local(3, t);
        /* Pulsează doar cât se vede bula (0,2-1,1); în rest stă pe valoarea de la marginea ei. */
        const v = clamp(u, 0.2, 1.1);
        return [0.35 + 0.65 * Math.max(0, Math.sin(v * 7 - j * 0.9))];
      },
      scrie: ([o]) => ({ opacity: opac(o) }),
      toleranta: [0.004],
    }),
  ),
  {
    tinta: "sms-mesaj",
    valori: (t) => {
      const bq = pr(local(3, t), 1.1, 1.45);
      return [clamp(bq * 3), 0.7 + 0.3 * spr(bq)];
    },
    scrie: ([o, s]) => ({ opacity: opac(o), transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.004, 0.001],
  },

  /* Bulele de confirmare, pe fiecare card. */
  ...BULE.flatMap(([card, cate, de, pas]) =>
    Array.from(
      { length: cate },
      (_, j): Pista => ({
        tinta: `bula-${card}-${j}`,
        valori: (t) => bula(pr(local(card, t), de + j * pas, de + 0.35 + j * pas)),
        scrie: ([o, x]) => ({ opacity: opac(o), ...translatieX(x) }),
        toleranta: [0.004, TOL_PANZA],
      }),
    ),
  ),
];

/* ─── Partea scrisă din JavaScript: textele și ordinea cardurilor ──────────── */

export interface StareDiscreta {
  /** Starea fiecărui card, cum o scrie eticheta lui, și culoarea (`run` portocaliu, `on` verde). */
  stari: string[];
  generare: boolean[];
  gata: boolean[];
  /** Cardul care e mărit (sau se mărește) stă deasupra celorlalte. */
  deasupra: boolean[];
  /** Comanda de sus. */
  comanda: string;
  procesata: boolean;
  stareComanda: string;
  /** Totalul facturii, care crește de la 0 la 189. */
  total: string;
  /** Câte e-mailuri necitite. */
  necitite: string;
}

/** Totalul facturii la `t`, pe grila de 60 pe secundă pe care o scrie motorul (vezi nota 4). */
function totalul(t: number): string {
  const de = inceputCard(0) + 0.55 + 1.4;
  const pas = Math.min(30, Math.max(0, Math.floor((t - de) * 60 + 1e-9)));
  const tGrila = t < de ? t : de + pas / 60;
  return (189 * eio(pr(local(0, tGrila), 1.4, 1.9))).toFixed(2);
}

/** Textele și clasele la clipa `t` din bucla a `iteratie`-a. Exact regula machetei. */
export function stareaDiscreta(t: number, iteratie: number): StareDiscreta {
  const aprins = iesire(t) > 0.5;
  const generare = CARDURI.map((i) => {
    const u = local(i, t);
    return u >= 0 && u < 2.6;
  });
  const gata = CARDURI.map((i) => local(i, t) >= 2.6 && aprins);
  const procesata = t >= PRIMUL + 4 * PAS - 0.3 && aprins;
  const numar = 10481 + (iteratie % 400);
  return {
    stari: CARDURI.map((i) => (gata[i] ? "Gata" : generare[i] ? "Se generează" : "În așteptare")),
    generare,
    gata,
    deasupra: CARDURI.map((i) => marire(i, t) > 0),
    comanda: `${procesata ? "Comanda #" : "Comandă nouă #"}${numar}`,
    procesata,
    stareComanda: procesata ? "Procesată automat" : "Se procesează",
    total: totalul(t),
    necitite: local(2, t) >= 0.75 ? "3" : "2",
  };
}

/**
 * Clipele în care se schimbă ceva din `stareaDiscreta`, în ordine: începutul și capătul măririi
 * fiecărui card (ordinea lor), pornirea și capătul generării, totalul facturii (60 pe secundă cât
 * crește), e-mailul nou, comanda procesată și jumătatea stingerii de la capăt.
 */
export const MOMENTE_DISCRETE: readonly number[] = (() => {
  const m = new Set<number>([0]);
  for (const i of CARDURI) {
    const s = inceputCard(i);
    m.add(s);
    m.add(s + 3.85);
    m.add(s + 0.55);
    m.add(s + 0.55 + 2.6);
  }
  const de = inceputCard(0) + 0.55 + 1.4;
  for (let k = 0; k <= 30; k++) m.add(de + k / 60);
  m.add(inceputCard(2) + 0.55 + 0.75);
  m.add(PRIMUL + 4 * PAS - 0.3);
  m.add(IESIRE + 0.25);
  return [...m].sort((a, b) => a - b);
})();
