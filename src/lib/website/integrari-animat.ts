/**
 * Macheta animată a celui de-al doilea card din „Soluția”: panoul de integrări din Edinio. Patru
 * integrări se pornesc dintr-un clic (FAN Courier, NETOPIA, SmartBill, eMAG), panoul se strânge în
 * coloana siglelor, apoi o comandă nouă trece singură prin toate: plata, livrarea, factura,
 * stocul. Bucla are 20,6 secunde.
 *
 * ═══ DE UNDE VINE ═══
 *
 * Macheta a făcut-o clientul (cu Claude), ca pagină de sine stătătoare:
 * `edinio-integrari-preview.html`, 14.10.2026. CRONOLOGIA de aici e a ei, neatinsă: clicurile,
 * drumul cursorului, ordinea pașilor, textele. Siglele sunt cele din catalogul site-ului
 * (`logos.ts`): aceleași fișiere, deja descărcate de prima pagină.
 *
 * ═══ CE S-A SCHIMBAT: CUM SE MIȘCĂ ═══
 *
 * Aceeași poveste ca la primul card (`magazin-animat.ts`, motorul în `animatie-bucla.ts`): în
 * machetă totul se scria din JavaScript la fiecare cadru; aici se mișcă pe compozitor, iar
 * JavaScript-ul scrie doar textele, de 15 ori pe buclă. Trei lucruri nu se puteau traduce direct,
 * fiindcă proprietățile lor nu merg pe compozitor:
 *
 *   1. PANOUL CARE SE STRÂNGE. Macheta îi anima `left` și `width`: așezare și pictură la fiecare
 *      cadru, iar conținutul (pe compozitor) ar fi luat-o înaintea fundalului la prima sacadare.
 *      Aici panoul e din TREI bucăți albe: două capete rotunjite care doar alunecă și un mijloc
 *      drept care se întinde (`panoul`). Umbrele lor stau dedesubt, separat, și adunate dau exact
 *      umbra panoului întreg: estomparea e liniară, deci umbra unei sume e suma umbrelor. La final
 *      apare un panou îngust adevărat, fiindcă umbra mijlocului, întinsă, n-ar mai fi exactă.
 *   2. CULOAREA COMUTATORULUI. Macheta amesteca gri cu verde în `background`; aici un strat verde
 *      peste cel gri își schimbă opacitatea, ceea ce dă exact același amestec.
 *   3. LINIILE ȘI PACHETUL. În machetă se desenau din SVG (`stroke-dashoffset`, `cx`), la fiecare
 *      cadru. Aici linia verde e tot un traseu SVG, întreg, care alunecă dintr-un decupaj; pachetul
 *      e un element care se deplasează.
 *
 * ⚠ Și o abatere VOITĂ, mică: inelul verde din jurul siglei se subțiază prin scară, nu prin
 * `box-shadow` (nota de la `inelul`).
 */

import { clamp, cheile, eio, eo, lerp, opac, pr, procent, spr, treapta, type Pista } from "./animatie-bucla";

/** Lungimea buclei, în secunde. */
export const BUCLA_S = 20.6;
/** Când începe să se stingă totul, la capătul buclei. */
const IESIRE = 19.4;
/** Când începe panoul să se strângă. */
const STRANGERE = 6.4;
/** Când intră comanda. */
const COMANDA = 7.6;
/** Primul pas al comenzii și pasul dintre ei. */
const PROCESARE = 8.9;
const PAS = 1.6;

/** Clicurile pe comutatoare, în ordinea rândurilor. Fiecare integrare e conectată la 0,4 s după. */
export const CLICURI: readonly number[] = [1.4, 2.6, 3.8, 5.0];
export const CONECTARI: readonly number[] = CLICURI.map((c) => c + 0.4);

/**
 * Ordinea în care trece comanda prin integrări: plata, livrarea, factura, stocul. Rândurile sunt
 * FAN, NETOPIA, SmartBill, eMAG; pasul de pe rândul `i` al comenzii e al integrării de pe același
 * rând, deci liniile dintre ele sunt orizontale.
 */
export const ORDINE: readonly number[] = [1, 0, 2, 3];

/** Clipa în care pornește spre siglă linia pasului de pe rândul `rand`. */
export function inceputPas(rand: number): number {
  return PROCESARE + ORDINE.indexOf(rand) * PAS;
}

/** Clipa în care pasul de pe rândul `rand` e gata. */
export const gataPas = (rand: number) => inceputPas(rand) + 0.65;

/** Când devine comanda „Procesată”: după ultimul pas. */
export const PROCESATA = PROCESARE + 3 * PAS + 1.1;

/** Clipa pe care o arată HTML-ul și de la care pornește bucla: panoul intrat, nimic pornit. */
export const PORNIRE_S = 0.5;
/** Cadrul static pentru „mișcare redusă”: toate conectate, comanda procesată. */
export const STATIC_S = 17;

/* ─── Geometria (în sutimi din lățimea scenei, ca în machetă) ─────────────── */

/** Rândul `i` (al panoului și al comenzii) începe la `13,4 + 9,2·i` sub marginea cardului. */
export const RAND_SUS = 13.4;
export const RAND_INALTIME = 9.2;
/** Mijlocul rândului `i`, în scenă: aici stau liniile, pachetul și comutatoarele. */
export const mijlocRand = (i: number) => 10 + RAND_SUS + RAND_INALTIME * i + RAND_INALTIME / 2;

/** Raza colțurilor panoului, deci și lățimea capetelor lui. */
export const RAZA = 2.2;
/** Panoul la început (marginea stângă și lățimea) și strâns în coloana siglelor. */
const STANGA_LARG = 9;
const LATIME_LARG = 82;
const DREAPTA_LARG = STANGA_LARG + LATIME_LARG;
const LATIME_INGUST = 13.4;
/** Lățimea de bază a mijlocului: cea de la început, deci scara lui pleacă de la 1. */
export const MIJLOC = LATIME_LARG - 2 * RAZA;
/** Cât intră mijlocul alb peste capete, ca să nu rămână între ele o cusătură de un pixel. */
export const PESTE = 0.3;
/** Caseta siglei și inelul verde care pulsează în jurul ei, la grosimea lui cea mai mare. */
export const SIGLA = 6.6;
export const INEL = 0.35;
/** Linia verde: de la marginea comenzii (30) la marginea siglei (14), plus capetele rotunjite. */
export const LINIE = 16 + 0.34;
/** Caseta valorii unui pas (AWB-ul, suma), ca deplasarea ei să aibă o mărime fixă. */
export const VALOARE = 20;

/**
 * Panoul la `t`: marginea stângă, lățimea și cât s-a strâns. Socoteala machetei, neatinsă.
 * `stingere` e cât s-au stins textele, care pleacă înaintea strângerii.
 */
export function panoul(t: number): { stanga: number; latime: number; dreapta: number; strangere: number; stingere: number } {
  const strangere = eio(pr(t, STRANGERE + 0.2, STRANGERE + 1.2));
  const stanga = lerp(STANGA_LARG, 4, strangere);
  const latime = lerp(LATIME_LARG, LATIME_INGUST, strangere);
  return { stanga, latime, dreapta: stanga + latime, strangere, stingere: pr(t, STRANGERE, STRANGERE + 0.4) };
}

/** Intrarea panoului, la începutul buclei. */
const intrare = (t: number) => eo(pr(t, 0, 0.6));
/** Stingerea a tot ce e pe ecran, la capătul buclei (1 = aprins). */
export const iesire = (t: number) => 1 - pr(t, IESIRE, IESIRE + 0.6);

/* ─── Cursorul ─────────────────────────────────────────────────────────────── */

const PUNCTE = {
  a: [60, 76],
  b: [68, 80],
  s0: [85, mijlocRand(0)],
  s1: [85, mijlocRand(1)],
  s2: [85, mijlocRand(2)],
  s3: [85, mijlocRand(3)],
} as const;

/** Drumul cursorului: [t, punct]. Pe comutatoare (`s0`–`s3`) e mână, în rest săgeată. */
export const CURSOR: ReadonlyArray<readonly [number, keyof typeof PUNCTE]> = [
  [0, "a"], [0.6, "a"], [1.33, "s0"], [1.6, "s0"], [2.53, "s1"], [2.8, "s1"], [3.73, "s2"], [4.0, "s2"],
  [4.93, "s3"], [5.2, "s3"], [6.0, "b"], [BUCLA_S, "b"],
];

export function cursorul(t: number): { x: number; y: number; mana: boolean } {
  const [c0, c1] = cheile(CURSOR, t);
  const cm = eio(pr(t, c0[0], c1[0]));
  const p0 = PUNCTE[c0[1]];
  const p1 = PUNCTE[c1[1]];
  return { x: lerp(p0[0], p1[0], cm), y: lerp(p0[1], p1[1], cm), mana: (cm > 0.55 ? c1 : c0)[1].length > 1 };
}

/* ─── Rândurile și pașii ───────────────────────────────────────────────────── */

/** Comutatorul rândului `i`: se încarcă între clic și conectare, apoi e pornit. */
function randul(i: number, t: number): { incarca: boolean; conectat: boolean; clic: number; conectare: number } {
  const clic = CLICURI[i];
  const conectare = CONECTARI[i];
  return { incarca: t >= clic && t < conectare, conectat: t >= conectare, clic, conectare };
}

/** Pulsul siglei de pe rândul `i`, când ajunge pachetul la ea (0 înainte, 1 după). */
const puls = (i: number, t: number) => pr(t, inceputPas(i) + 0.55, inceputPas(i) + 0.95);
const inPuls = (i: number, t: number) => {
  const p = puls(i, t);
  return p > 0 && p < 1;
};

/**
 * Pachetul care pleacă de la comandă spre siglă: unde e și dacă se vede. Cât e stins, stă pe locul
 * de unde pornește următorul, ca să nu traverseze ecranul în cadrul în care se aprinde; imediat
 * după o cursă rămâne o clipă unde a ajuns, din același motiv.
 */
export function pachetul(t: number): [x: number, y: number, vizibil: number] {
  const curse = ORDINE.map((rand) => ({ rand, de: inceputPas(rand) + 0.1, pana: inceputPas(rand) + 0.55 }));
  for (const c of curse) {
    if (t > c.de && t < c.pana) return [lerp(30, 14, eio(pr(t, c.de, c.pana))), mijlocRand(c.rand), 1];
    if (t >= c.pana && t < c.pana + 0.1) return [14, mijlocRand(c.rand), 0];
  }
  const urmatoarea = curse.find((c) => c.de >= t) ?? curse[0];
  return [30, mijlocRand(urmatoarea.rand), 0];
}

/** Comanda e „Procesată” după ultimul pas, până la jumătatea stingerii de la capăt. */
const procesata = (t: number) => t >= PROCESATA && iesire(t) > 0.5;

/* ─── Pistele ──────────────────────────────────────────────────────────────── */

const RANDURI = [0, 1, 2, 3] as const;

/** O deplasare pe X, în procente din lățimea elementului. */
const peX = (x: number, marime: number) => ({ transform: `translateX(${procent(x, marime)}%)` });
/** Două piste cu aceleași valori, pe două elemente (umbra și corpul aceleiași bucăți). */
const pereche = (tinte: [string, string], p: Omit<Pista, "tinta">): Pista[] => tinte.map((tinta) => ({ tinta, ...p }));

/** 0,01 din lățimea scenei: o zecime de pixel pe un card de 628 px. */
const TOL = 0.01;

/**
 * Înălțimea scenei, în sutimi din lățimea ei (scena e 4:3).
 *
 * ⚠ DE CE „PURTĂTOR”. `translate` în procente se raportează la mărimea elementului mutat, iar
 * mărimea aia e rotunjită de browser la 1/64 de pixel. Un element mic, mutat departe, înmulțește
 * rotunjirea: cursorul (3,4) dus la 85 o înmulțea de 25 de ori. Măsurat, 0,2 px alături de machetă.
 * Așa că ce traversează scena stă într-un element cât ea, iar procentele lui sunt chiar unități de
 * scenă: rotunjirea nu se mai înmulțește deloc.
 */
const INALTIME_SCENA = 75;
const purtat = (x: number, y: number) => `translate(${procent(x, 100)}%, ${procent(y, INALTIME_SCENA)}%)`;

/**
 * Mijlocul panoului: pleacă de la marginea capătului stâng și se întinde până la cel drept. Umbra
 * lui se oprește exact acolo; corpul alb intră cu `peste` peste fiecare capăt.
 */
function mijlocul(tinta: string, peste: number): Pista {
  return {
    tinta,
    valori: (t) => {
      const p = panoul(t);
      return [p.stanga - STANGA_LARG, (p.latime - 2 * RAZA + 2 * peste) / MIJLOC];
    },
    scrie: ([x, s]) => ({ transform: `translateX(${procent(x, MIJLOC)}%) scaleX(${s.toFixed(5)})` }),
    toleranta: [TOL, TOL / MIJLOC],
  };
}

export const PISTE: readonly Pista[] = [
  /* Panoul întreg: intră de jos la început, se stinge la capăt. */
  {
    tinta: "panou",
    valori: (t) => [intrare(t) * iesire(t), (1 - intrare(t)) * 2],
    scrie: ([o, y]) => ({ opacity: opac(o), transform: `translateY(${procent(y, 51.2)}%)` }),
    toleranta: [0.004, TOL],
  },

  /*
    Panoul care se strânge (cele trei bucăți) și, de la capătul strângerii, cel îngust adevărat.

    ⚠ Bucățile stau în CSS chiar pe locul lor de la început și se deplasează FAȚĂ de el. Măsurat:
    când capătul drept (lat de 2,2) pleca din stânga scenei și se muta cu 88,8, procentul cerut de
    `translate` era 4.036%, iar rotunjirea lățimii lui la 1/64 de pixel se înmulțea de 40 de ori:
    marginea dreaptă stătea cu 0,3 px alături, chiar cu panoul nemișcat. Așa, cât panoul stă pe
    loc deplasarea e zero, iar în timpul strângerii abaterea nu trece de o treime de pixel.
  */
  { tinta: "panou-mobil", valori: (t) => [treapta(t < COMANDA)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  { tinta: "panou-ingust", valori: (t) => [treapta(t >= COMANDA)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  ...pereche(["umbra-stanga", "corp-stanga"], {
    valori: (t) => [panoul(t).stanga - STANGA_LARG],
    scrie: ([x]) => peX(x, RAZA),
    toleranta: [TOL],
  }),
  ...pereche(["umbra-dreapta", "corp-dreapta"], {
    valori: (t) => [panoul(t).dreapta - DREAPTA_LARG],
    scrie: ([x]) => peX(x, RAZA),
    toleranta: [TOL],
  }),
  mijlocul("umbra-mijloc", 0),
  mijlocul("corp-mijloc", PESTE),

  /* Ce e pe panou merge cu marginea lui stângă; textele se sting înainte de strângere. */
  { tinta: "continut", valori: (t) => [panoul(t).stanga - STANGA_LARG], scrie: ([x]) => peX(x, LATIME_LARG), toleranta: [TOL] },
  { tinta: "sigla-edinio", valori: (t) => [panoul(t).strangere * 0.7], scrie: ([x]) => peX(x, 5.2), toleranta: [TOL] },
  { tinta: "texte", valori: (t) => [1 - panoul(t).stingere], scrie: ([o]) => ({ opacity: opac(o) }), toleranta: [0.004] },
  /* Contorul e lipit de marginea DREAPTĂ a panoului, deci merge cu lățimea lui. */
  { tinta: "contor-loc", valori: (t) => [panoul(t).latime - LATIME_LARG], scrie: ([x]) => peX(x, LATIME_LARG), toleranta: [TOL] },

  ...RANDURI.flatMap((i): Pista[] => [
    /* Comutatorul: verdele vine peste gri, butonul alunecă, rotița se învârte cât se conectează. */
    {
      tinta: `comutator-${i}`,
      valori: (t) => [pr(t, CONECTARI[i], CONECTARI[i] + 0.2)],
      scrie: ([o]) => ({ opacity: opac(o) }),
      toleranta: [0.004],
    },
    {
      tinta: `buton-${i}`,
      valori: (t) => {
        const r = randul(i, t);
        return [(r.conectat ? spr(pr(t, r.conectare, r.conectare + 0.5)) : 0) * 2.3, r.incarca ? 0.92 : 1];
      },
      scrie: ([x, s]) => ({ transform: `translateX(${procent(x, 2.3)}%) scale(${s})` }),
      toleranta: [TOL, 0.001],
    },
    {
      tinta: `rotita-${i}`,
      /* Unghiul machetei e `t·720 mod 360`; fără modulo, rotația e o dreaptă și ține două cadre. */
      valori: (t) => {
        const r = randul(i, t);
        return [treapta(r.incarca), clamp(t, r.clic, r.conectare) * 720];
      },
      scrie: ([o, u]) => ({ opacity: o, transform: `rotate(${u.toFixed(1)}deg)` }),
      toleranta: [0.004, 0.5],
    },
    {
      tinta: `punct-${i}`,
      valori: (t) => {
        const r = randul(i, t);
        return [r.conectat ? spr(pr(t, r.conectare, r.conectare + 0.5)) : 0];
      },
      scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
      toleranta: [0.002],
    },

    /* Sigla pulsează când ajunge pachetul la ea. */
    {
      tinta: `sigla-${i}`,
      valori: (t) => [1 + 0.12 * Math.sin(puls(i, t) * Math.PI)],
      scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
      toleranta: [0.0005],
    },
    /*
      ⚠ Inelul verde. Macheta îl desena ca `box-shadow` de `0,35·(1−p)` și îl subția din grosime,
      adică pictură la fiecare cadru. Aici e un dreptunghi verde SUB casetă, cu `0,35` mai mare pe
      fiecare latură, care se micșorează până dispare sub ea: din afara casetei se vede exact un
      inel de aceeași grosime. Singura diferență: colțurile lui sunt cu o idee mai rotunde.
    */
    {
      tinta: `inel-${i}`,
      valori: (t) => {
        const p = puls(i, t);
        const activ = inPuls(i, t);
        return [activ ? (SIGLA + 2 * INEL * (1 - p)) / (SIGLA + 2 * INEL) : 0.9, treapta(activ)];
      },
      scrie: ([s, o]) => ({ transform: `scale(${s.toFixed(4)})`, opacity: o }),
      toleranta: [0.0005, 0.004],
    },
    /* Cât pulsează, macheta înlocuia umbra moale a casetei cu inelul. */
    { tinta: `umbra-sigla-${i}`, valori: (t) => [treapta(!inPuls(i, t))], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },

    /* Linia verde, de la comandă spre siglă: alunecă din decupajul ei. */
    {
      tinta: `linie-${i}`,
      valori: (t) => {
        const d = eio(pr(t, inceputPas(i), inceputPas(i) + 0.35));
        return [(1 - d) * 16, treapta(d > 0) * iesire(t)];
      },
      scrie: ([x, o]) => ({ ...peX(x, LINIE), opacity: opac(o) }),
      toleranta: [TOL, 0.004],
    },

    /* Pasul comenzii: bifa sare, valoarea intră din dreapta. */
    {
      tinta: `bifa-${i}`,
      valori: (t) => [t >= gataPas(i) ? 0.7 + 0.3 * spr(pr(t, gataPas(i), inceputPas(i) + 1.1)) : 1],
      scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
      toleranta: [0.001],
    },
    {
      tinta: `valoare-${i}`,
      valori: (t) => {
        const q = pr(t, gataPas(i), inceputPas(i) + 1.05);
        return [q, (1 - eo(q)) * 1.2];
      },
      scrie: ([o, x]) => ({ opacity: opac(o), ...peX(x, VALOARE) }),
      toleranta: [0.004, TOL],
    },
  ]),

  /* Pachetul și cursorul se mută prin toată scena, deci se mută „purtătorul” lor, cât scena:
     procentele lui sunt chiar unități de scenă (vezi nota „De ce purtător” de la `purtat`). */
  {
    tinta: "pachet-loc",
    valori: (t) => pachetul(t).slice(0, 2),
    scrie: ([x, y]) => ({ transform: purtat(x - 1.4, y - 1.4) }),
    toleranta: [TOL, TOL],
  },
  { tinta: "pachet", valori: (t) => [pachetul(t)[2]], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  /*
    Liniile punctate, câte una pe rând. ⚠ Se sting când linia verde a ajuns la capăt: în machetă
    erau în același SVG cu cea verde, deci acoperite exact; aici linia verde e un strat separat, care
    se așază la pixeli altfel. Măsurat pe telefon (3 pixeli de ecran pe pixel): punctatul ieșea cu
    un pixel deasupra liniei verzi. Stins, nu are ce să iasă, iar până atunci arată la fel.
  */
  ...RANDURI.map(
    (i): Pista => ({
      tinta: `fundal-${i}`,
      valori: (t) => [clamp(pr(t, COMANDA, COMANDA + 0.7) * 2) * iesire(t) * treapta(t < inceputPas(i) + 0.35)],
      scrie: ([o]) => ({ opacity: opac(o) }),
      toleranta: [0.004],
    }),
  ),

  /* Comanda intră din dreapta, după ce s-a strâns panoul. */
  {
    tinta: "comanda",
    valori: (t) => {
      const q = pr(t, COMANDA, COMANDA + 0.7);
      return [clamp(q * 2) * iesire(t), (1 - eo(q)) * 5];
    },
    scrie: ([o, x]) => ({ opacity: opac(o), ...peX(x, 64) }),
    toleranta: [0.004, TOL],
  },
  {
    tinta: "eticheta",
    valori: (t) => [procesata(t) ? 0.85 + 0.15 * spr(pr(t, PROCESATA, PROCESATA + 0.5)) : 1],
    scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.001],
  },
  {
    tinta: "insigna",
    valori: (t) => {
      const q = pr(t, PROCESATA + 0.3, PROCESATA + 0.8);
      return [clamp(q * 3) * iesire(t), (1 - spr(q)) * 1.4];
    },
    scrie: ([o, y]) => ({ opacity: opac(o), transform: `translateY(${procent(y, 4.4)}%)` }),
    toleranta: [0.004, TOL],
  },

  /* Cursorul: poziția, apăsarea și apariția stau pe același element; apoi mâna sau săgeata, și
     cercul clicului. */
  {
    tinta: "cursor-loc",
    valori: (t) => {
      const c = cursorul(t);
      return [c.x, c.y];
    },
    scrie: ([x, y]) => ({ transform: purtat(x, y) }),
    toleranta: [TOL, TOL],
  },
  {
    tinta: "cursor",
    valori: (t) => {
      const apasat = CLICURI.some((k) => t - k > -0.08 && t - k < 0.12);
      return [apasat ? 0.86 : 1, clamp(Math.min((t - 0.5) * 3, (5.9 - t) * 3))];
    },
    scrie: ([s, o]) => ({ transform: `scale(${s})`, opacity: opac(o) }),
    toleranta: [0.002, 0.004],
  },
  { tinta: "cursor-mana", valori: (t) => [treapta(cursorul(t).mana)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  { tinta: "cursor-sageata", valori: (t) => [treapta(!cursorul(t).mana)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  {
    tinta: "clic",
    valori: (t) => {
      let r = -1;
      for (const c of CLICURI) if (t - c >= 0 && t - c < 0.45) r = (t - c) / 0.45;
      return [r < 0 ? 0 : 1 - r, r < 0 ? 0.4 : 0.4 + r * 1.2];
    },
    scrie: ([o, s]) => ({ opacity: opac(o), transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.004, 0.003],
  },
];

/* ─── Partea scrisă din JavaScript: textele și clasele ─────────────────────── */

/**
 * Siglele rândurilor, aceleași fișiere ca în catalogul site-ului (`PROVIDER_LOGOS` din `logos.ts`,
 * deja descărcate de prima pagină). Scrise aici, nu importate: catalogul întreg ar fi intrat în
 * JavaScript-ul trimis browserului doar pentru patru adrese. Proba cere să fie chiar cele din
 * catalog, deci nu se pot despărți. NETOPIA e desenată în alb: componenta o folosește ca mască.
 */
export const SIGLE = [
  "/integrations/fan-courier.svg",
  "/integrations/netopia.svg",
  "/integrations/smartbill-mic.webp",
  "/integrations/emag-mic.webp",
] as const;

/** Integrările de pe panou, în ordinea rândurilor. */
export const INTEGRARI = [
  { nume: "FAN Courier", descriere: "AWB automat, tracking și ramburs" },
  { nume: "NETOPIA Payments", descriere: "Plată cu cardul, Apple Pay și Google Pay" },
  { nume: "SmartBill", descriere: "Facturi și e-Factura emise automat" },
  { nume: "eMAG Marketplace", descriere: "Produse, stoc și comenzi sincronizate" },
] as const;

/** Pașii comenzii, pe aceleași rânduri: ce scrie, ce valoare apare și ce scrie când e gata. */
export const PASI = [
  { nume: "Livrare", valoare: "2401 7739 155", gata: "FAN Courier · AWB generat automat" },
  { nume: "Încasare plată", valoare: "189,00 lei", gata: "NETOPIA · card VISA •••• 4821" },
  { nume: "Factură", valoare: "EDN-0483", gata: "SmartBill · e-Factura trimisă" },
  { nume: "Stoc marketplace", valoare: "24 → 22 buc.", gata: "eMAG · stoc actualizat" },
] as const;

export interface StareDiscreta {
  /** Starea fiecărei integrări, cum o scrie eticheta ei, și dacă e verde. */
  stari: string[];
  conectate: boolean[];
  /** Contorul din colț: câte, și cuvântul potrivit. */
  active: number;
  cuvant: string;
  /** Numărul comenzii: crește cu fiecare buclă, ca în machetă. */
  numar: string;
  pasi: boolean[];
  textePasi: string[];
  procesata: boolean;
  eticheta: string;
}

/** Textele la clipa `t` din bucla a `iteratie`-a. Exact regula machetei. */
export function stareaDiscreta(t: number, iteratie: number): StareDiscreta {
  const randuri = RANDURI.map((i) => randul(i, t));
  const active = randuri.filter((r) => r.conectat).length;
  const pasi = RANDURI.map((i) => t >= gataPas(i));
  const fin = procesata(t);
  return {
    stari: randuri.map((r) => (r.conectat ? "Conectat" : r.incarca ? "Se conectează" : "Inactiv")),
    conectate: randuri.map((r) => r.conectat),
    active,
    cuvant: active === 1 ? "activă" : "active",
    numar: `#${10483 + (iteratie % 400)}`,
    pasi,
    textePasi: RANDURI.map((i) => (pasi[i] ? PASI[i].gata : "În așteptare")),
    procesata: fin,
    eticheta: fin ? "Procesată" : "Comandă nouă",
  };
}

/**
 * Clipele în care se schimbă ceva din `stareaDiscreta`, în ordine: clicurile, conectările, pașii
 * gata, comanda procesată și jumătatea stingerii (acolo eticheta revine la „Comandă nouă”). Plus
 * începutul buclei, unde se pornește totul de la zero.
 */
export const MOMENTE_DISCRETE: readonly number[] = [
  ...new Set([0, ...CLICURI, ...CONECTARI, ...RANDURI.map(gataPas), PROCESATA, IESIRE + 0.3]),
].sort((a, b) => a - b);
