/**
 * Macheta animată a celui de-al cincilea card din „Soluția”: asistența Edinio, ca o conversație pe
 * WhatsApp. Elena întreabă cum pornește facturarea automată cu SmartBill; asistența îi răspunde și îi
 * trimite captura integrării, pe care i-a pornit-o chiar ea (comutatorul trece pe verde, „Inactiv”
 * devine „Conectat”), iar Elena mulțumește. Bucla are 16,5 secunde.
 *
 * ═══ DE UNDE VINE ═══
 *
 * Macheta a făcut-o clientul (cu Claude), ca pagină de sine stătătoare:
 * `edinio-tehnic-preview.html` („Partea tehnică, varianta 3: chat de suport non-stop”), 16.10.2026.
 * CRONOLOGIA de aici e a ei, neatinsă: când vine fiecare mesaj, cum se mișcă, textele.
 *
 * ═══ CE S-A SCHIMBAT: CUM SE MIȘCĂ ═══
 *
 * Ca la celelalte machete (motorul în `animatie-bucla.ts`): tot ce se mișcă merge pe compozitor. Aici
 * nici textele nu se mai scriu din JavaScript. Ce nu se putea traduce direct:
 *
 *   1. ÎNĂLȚIMEA MESAJELOR. Locul fiecărui mesaj și cât urcă firul ca să-l arate pe ultimul depind de
 *      înălțimea bulelor, iar ea de fontul sistemului (SF pe Mac, Segoe pe Windows): un rând în plus
 *      lungește o bulă cu 21 px. Macheta le măsura în pagină la fiecare cadru; aici le măsoară
 *      componenta o dată, înainte de pornire (`masuratoriDinPagina`), iar pistele se fac din ele
 *      (`pisteCuMasuratori`). `PISTE` folosește măsurătorile de pe Windows, pentru HTML. Odată e
 *      destul: textul e așezat în pixelii pânzei, nu ai ecranului. MĂSURAT în Chrome, 16.10.2026: la
 *      densitățile 1-3 și la patru lățimi (32 de cazuri), bulele au aceleași înălțimi.
 *   2. CE SE SCHIMBA PRIN CLASE ȘI TEXTE (starea „online”/„scrie…”, bifele, „Inactiv”/„Conectat”,
 *      culoarea comutatorului): fiecare variantă e desenată dinainte, una peste alta, iar o pistă în
 *      TREPTE o aprinde pe cea de acum. ⚠ MĂSURAT la cardul cu vânzări: un text scris din JavaScript
 *      cere un cadru întreg pe firul principal și reîmprospătarea tuturor elementelor animate.
 *   3. FONDUL VERDE al rândului SmartBill era o culoare schimbată la fiecare cadru; aici e un strat a
 *      cărui opacitate se stinge.
 *
 * Conversația e desenată, ca în machetă, pe o pânză de 720 × 524 px micșorată cât cardul: pistele sunt
 * în pixelii pânzei, deci nu depind de ecran.
 */

import { clamp, eio, eo, lerp, opac, pr, spr, treapta, type Pista } from "./animatie-bucla";

/** Lungimea buclei, în secunde. */
export const BUCLA_S = 16.5;
/** Când începe să se stingă cardul, la capătul buclei. */
const IESIRE = 15.6;

/** Clipa pe care o arată HTML-ul și de la care pornește bucla: cardul intrat, niciun mesaj. */
export const PORNIRE_S = 0.5;
/** Cadrul static pentru „mișcare redusă”: toată conversația, cu facturarea pornită. */
export const STATIC_S = 12;

/** Pânza conversației, în pixeli; se micșorează cât cardul (92 din 100 de unități de scenă). */
export const PANZA = { latime: 720, inaltime: 524, cat: 92 } as const;

/* ─── Mesajele ────────────────────────────────────────────────────────────── */

export interface Mesaj {
  la: number;
  /** `client`: Elena, în dreapta, pe verde; `asistenta`: noi, în stânga, pe alb. */
  de: "client" | "asistenta";
}

/** Mesajele, în ordinea în care vin. Al treilea e captura integrării. */
export const MESAJE: readonly Mesaj[] = [
  { la: 1.2, de: "client" },
  { la: 4.0, de: "asistenta" },
  { la: 5.7, de: "asistenta" },
  { la: 8.6, de: "asistenta" },
  { la: 10.2, de: "client" },
];

/** Când scrie asistența („scrie…” în locul lui „online”): de la, până la. */
export const SCRIE: ReadonlyArray<readonly [number, number]> = [
  [2.5, 3.9],
  [4.4, 5.6],
  [7.4, 8.5],
];

/**
 * Bifele mesajelor Elenei: una gri cât pleacă (0,35 s), apoi două gri, apoi două albastre (citit),
 * la `citit` secunde după ce a venit mesajul.
 */
export const BIFE: ReadonlyArray<{ mesaj: number; citit: number }> = [
  { mesaj: 0, citit: 1.3 },
  { mesaj: 4, citit: 0.9 },
];

/* ─── Geometria firului (măsurată) ─────────────────────────────────────────── */

export interface Masuratori {
  /** Locul fiecărui mesaj în fir, în pixeli de pânză. */
  y: readonly number[];
  /** Înălțimea fiecărui mesaj. */
  h: readonly number[];
  /** Cât se vede din fir: înălțimea panoului dintre bara de sus și cea de jos. */
  vedere: number;
}

/**
 * Locurile mesajelor, din locul unde se termină antetul firului („Azi” și nota despre contul de
 * business) și din înălțimile lor. Exact regula machetei: 12 px după antet, 3 între mesaje și încă
 * 8 când se schimbă cine scrie.
 */
export function masuratori(capatAntet: number, h: readonly number[], vedere: number): Masuratori {
  const y: number[] = [];
  let unde = capatAntet + 12;
  MESAJE.forEach((m, i) => {
    if (i > 0 && MESAJE[i - 1].de !== m.de) unde += 8;
    y.push(unde);
    unde += h[i] + 3;
  });
  return { y, h, vedere };
}

/**
 * Măsurătorile de pe Windows (Segoe UI), cu fontul site-ului în captură: antetul se termină la 70 px,
 * bulele au 56, 77, 189, 77 și 56 px, panoul are 406. Componenta le măsoară din nou.
 */
export const MASURATORI_IMPLICITE: Masuratori = masuratori(70, [56, 77, 189, 77, 56], 406);

/**
 * Geometria firului din ce măsoară componenta în pagină: antetul („Azi” și nota despre contul de
 * business), bulele în ordinea din `MESAJE` și panoul. `offsetTop`/`offsetHeight` nu văd micșorarea
 * pânzei, deci ies în pixelii ei. `null` cât firul nu e așezat (lipsește ceva sau are înălțimea 0):
 * atunci rămân `MASURATORI_IMPLICITE`.
 */
export function masuratoriDinPagina(
  antet: { offsetTop: number; offsetHeight: number } | null,
  bule: ReadonlyArray<{ offsetHeight: number } | null>,
  panou: { clientHeight: number } | null,
): Masuratori | null {
  const h = bule.map((b) => b?.offsetHeight ?? 0);
  if (!antet || !panou || !(panou.clientHeight > 0) || h.length !== MESAJE.length || h.some((x) => !(x > 0))) return null;
  return masuratori(antet.offsetTop + antet.offsetHeight, h, panou.clientHeight);
}

/** Cât a urcat firul la `t`: fiecare mesaj nou îl urcă, dacă e nevoie, cât să se vadă cu 14 px sub el. */
export function derulare(t: number, m: Masuratori): number {
  let s = 0;
  MESAJE.forEach((x, i) => {
    const nevoie = Math.max(0, m.y[i] + m.h[i] + 14 - m.vedere);
    s = lerp(s, Math.max(s, nevoie), eio(pr(t, x.la, x.la + 0.35)));
  });
  return s;
}

/* ─── Stările care sar ─────────────────────────────────────────────────────── */

/** Asistența scrie la `t`? */
export const scrie = (t: number) => SCRIE.some(([a, b]) => t >= a && t < b);

/** Bifa `j` la `t`: 0 = una gri, 1 = două gri, 2 = două albastre. */
export function bifa(j: number, t: number): 0 | 1 | 2 {
  const { mesaj, citit } = BIFE[j];
  const la = MESAJE[mesaj].la;
  if (t < la + 0.35) return 0;
  return t >= la + citit ? 2 : 1;
}

/** Facturarea e pornită la `t` (comutatorul verde, „Conectat”)? */
export const pornita = (t: number) => t >= 6.6;

/** Cât a mers comutatorul (0-1), de la 6,5 la 6,8 s. */
const pasComutator = (t: number) => pr(t, 6.5, 6.8);

/* ─── Pistele ──────────────────────────────────────────────────────────────── */

/** Intrarea cardului, la începutul buclei, și stingerea de la capăt (1 = aprins). */
const intrare = (t: number) => eo(pr(t, 0, 0.5));
const iesire = (t: number) => 1 - pr(t, IESIRE, IESIRE + 0.6);

/** 0,075 px de pânză: cât 0,01 din lățimea scenei, toleranța celorlalte machete. */
const TOL = 0.075;
const TOL_OPACITATE = 0.004;
const TREPTE = { trepte: true as const, toleranta: [0] };

const opacitate = (tinta: string, f: (t: number) => number, toleranta = TOL_OPACITATE): Pista => ({
  tinta,
  valori: (t) => [f(t)],
  scrie: ([o]) => ({ opacity: opac(o) }),
  toleranta: [toleranta],
});

/** O variantă desenată dinainte, aprinsă cât e adevărat `cand`. */
const aprinsa = (tinta: string, cand: (t: number) => boolean): Pista => ({
  tinta,
  valori: (t) => [treapta(cand(t))],
  scrie: ([o]) => ({ opacity: o }),
  ...TREPTE,
});

/** Pistele, cu geometria firului dată. */
export function pisteCuMasuratori(m: Masuratori): Pista[] {
  return [
    opacitate("card", (t) => intrare(t) * iesire(t)),
    {
      tinta: "fir",
      valori: (t) => [derulare(t, m)],
      scrie: ([y]) => ({ transform: `translateY(${(-y).toFixed(2)}px)` }),
      toleranta: [TOL],
    },

    /* Mesajele: fiecare urcă 10 px pe locul lui și se aprinde în prima treime din 0,28 s. */
    ...MESAJE.map((x, i): Pista => ({
      tinta: `mesaj-${i}`,
      valori: (t) => {
        const q = pr(t, x.la, x.la + 0.28);
        return [m.y[i] + (1 - eo(q)) * 10, clamp(q * 3)];
      },
      scrie: ([y, o]) => ({ transform: `translateY(${y.toFixed(2)}px)`, opacity: opac(o) }),
      toleranta: [TOL, TOL_OPACITATE],
    })),

    /* Starea din bara de sus. */
    aprinsa("stare-online", (t) => !scrie(t)),
    aprinsa("stare-scrie", scrie),

    /* Bifele, câte trei variante pe mesaj; ținta poartă numărul mesajului. */
    ...BIFE.flatMap(({ mesaj }, j): Pista[] => [
      aprinsa(`bifa-una-${mesaj}`, (t) => bifa(j, t) === 0),
      aprinsa(`bifa-doua-${mesaj}`, (t) => bifa(j, t) === 1),
      aprinsa(`bifa-citit-${mesaj}`, (t) => bifa(j, t) === 2),
    ]),

    /* Captura: comutatorul (butonul sare cu un arc, fondul se face verde), eticheta, opțiunile,
       banda „activă” și fondul verde al rândului, care se stinge. */
    {
      tinta: "comutator-buton",
      valori: (t) => [14 * spr(pasComutator(t))],
      scrie: ([x]) => ({ transform: `translateX(${x.toFixed(2)}px)` }),
      toleranta: [0.03],
    },
    aprinsa("comutator-gri", (t) => !pornita(t)),
    aprinsa("comutator-verde", pornita),
    aprinsa("insigna-inactiv", (t) => !pornita(t)),
    aprinsa("insigna-conectat", pornita),
    opacitate("optiuni", (t) => 0.35 + 0.65 * pr(t, 6.7, 7.1)),
    opacitate("activ", (t) => pr(t, 7.0, 7.3)),
    opacitate("rand-fond", (t) => (pasComutator(t) > 0 && t < 7.6 ? 1 - pr(t, 6.8, 7.6) : 0)),
  ];
}

export const PISTE: readonly Pista[] = pisteCuMasuratori(MASURATORI_IMPLICITE);

/** Nimic nu se scrie din JavaScript (nota 2); bucla cere totuși clipa de început. */
export const MOMENTE_DISCRETE: readonly number[] = [0];
