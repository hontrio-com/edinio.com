/**
 * Macheta animată a primului card din „Soluția”: un iMac pe care rulează un magazin făcut cu
 * Edinio, de la pagina de start până la comanda plasată. Bucla are 24 de secunde.
 *
 * ═══ DE UNDE VINE ═══
 *
 * Macheta a făcut-o clientul (cu Claude), ca pagină de sine stătătoare:
 * `edinio-mockup-preview.html`, 14.10.2026. CRONOLOGIA de aici e a ei, neatinsă: cheile camerei,
 * ale cursorului, clicurile, scrisul din checkout, prețurile din coș. Ecranele magazinului sunt
 * capturi ale unui magazin real de pe platformă (eSAFE), în `public/features/magazin-animat/`.
 *
 * ═══ CE S-A SCHIMBAT: MOTORUL ═══
 *
 * În machetă, totul se mișca dintr-o singură funcție chemată la FIECARE cadru: zeci de scrieri
 * de stil, `querySelector` și `textContent` de 60 de ori pe secundă, pe firul principal. Pe un
 * telefon, la derulare, firul ăla e ocupat cu teancul de carduri, deci animația s-ar fi poticnit
 * exact când omul derulează. Și camera (`will-change: transform` + scară scrisă din JS) ar fi
 * fost rasterizată la scara de start, deci încețoșată la zoom.
 *
 * Aici, aceeași cronologie se traduce o singură dată în cadre-cheie pentru Web Animations:
 *   - tot ce se MIȘCĂ (camera, cursorul, paginile, notificările, cercul clicului) merge pe
 *     COMPOZITOR: rulează în afara JavaScript-ului și nu se oprește când pagina are altceva de
 *     lucru; iar o animație de transformare se rasterizează la scara ei MAXIMĂ, deci zoomul
 *     rămâne clar;
 *   - doar TEXTELE care se schimbă (cantitatea, prețurile, scrisul) se scriu din JavaScript, și
 *     numai în clipele în care chiar se schimbă: ~80 de scrieri pe buclă în loc de 1.440 de cadre.
 *
 * Totul e PUR aici (fără DOM), ca să se poată proba: `magazin-animat.test.ts` compară fiecare
 * pistă cu funcția originală a machetei, pe o grilă de 60 de puncte pe secundă.
 *
 * Motorul (eșantionarea, simplificarea, curbele) e comun cu macheta integrărilor și stă în
 * `animatie-bucla.ts`; aici e doar CRONOLOGIA acestei machete.
 */

import { clamp, cheile, eio, eo, lerp, opac, pr, spr, treapta, type Pista } from "./animatie-bucla";

/** Lungimea buclei, în secunde. */
export const BUCLA_S = 24;
export const BUCLA_MS = BUCLA_S * 1000;

/**
 * Ecranul iMac-ului în scenă, ca fracții din LĂȚIMEA scenei. Scena e 4:3.
 *
 * Nu se măsoară la rulare: vine direct din foaia de stil (`magazin-animat.css`), unde monitorul e
 * la `left 17`, `top 10.5`, `width 66` (în sutimi din lățime), cu rama de `.95` și raportul
 * `66/38.6`. Deci ecranul: x = 17 + .95, y = 10.5 + .95, w = 66 − 1.9, h = 38.6 − 1.9.
 * Dacă se mută monitorul în CSS, se schimbă și aici (proba citește foaia și le compară).
 */
export const ECRAN = { x: 0.1795, y: 0.1145, w: 0.641, h: 0.367 } as const;
/** Înălțimea scenei / lățimea ei. */
export const RAPORT_SCENA = 0.75;
/** Ecranele magazinului sunt capturi de 1920 px lățime; pe ele stau toate coordonatele. */
export const LATIME_PAGINA = 1920;

/* ─── Cronologia machetei (neatinsă) ───────────────────────────────────────── */

/** Camera: [t, zoom (1 = larg, 0 = ecranul pe toată lățimea), fx, fy în pixelii paginii]. */
export const CAMERA: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 960, 760], [1.3, 1, 960, 760], [2.7, 0, 960, 540], [4.7, 0, 960, 540],
  [5.4, 2.2, 1240, 560], [8.5, 2.2, 1240, 560], [9.2, 0, 960, 540], [9.9, 0, 960, 540],
  [10.5, 2.0, 800, 420], [12.3, 2.0, 800, 420], [12.9, 2.0, 1280, 430], [13.5, 1.15, 960, 540],
  [13.9, 1.8, 760, 600], [17.3, 1.8, 760, 600], [17.9, 1.5, 760, 700], [19.2, 0, 960, 540],
  [19.8, 1, 960, 760], [24, 1, 960, 760],
];

/** Cursorul: [t, x, y, mână (1) sau săgeată (0)], în pixelii paginii. */
export const CURSOR: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1500, 820, 0], [2.9, 1500, 820, 0], [3.8, 620, 640, 1], [4.55, 528, 610, 1], [4.8, 528, 610, 1],
  [5.5, 1000, 480, 0], [5.9, 1128, 535, 1], [6.3, 1128, 535, 1], [6.75, 1134, 633, 1], [7.2, 1134, 633, 1],
  [7.9, 1372, 774, 1], [8.4, 1372, 774, 1], [9.3, 1461, 67, 1], [9.75, 1461, 67, 1], [10.3, 900, 300, 0],
  [10.7, 614, 456, 1], [12.4, 614, 456, 1], [13.0, 1332, 523, 1], [13.3, 1332, 523, 1], [13.8, 600, 407, 1],
  [14.9, 600, 489, 1], [15.6, 640, 653, 1], [16.3, 620, 735, 1], [17.0, 620, 817, 1], [17.9, 749, 1005, 1],
  [18.4, 749, 1005, 1], [18.9, 960, 760, 0], [24, 960, 760, 0],
];

/** Primul clic de „+” din coș și pasul dintre ele. Zece clicuri. */
const COS_PRIMUL = 10.75;
const COS_PAS = 0.17;
const COS_CLICURI = 10;

/** Momentele clicurilor: cele opt de pe drum, apoi cele zece de „+” din coș. */
export const CLICURI: readonly number[] = [
  4.55, 5.95, 7.0, 8.15, 9.55, 13.15, 15.6, 18.15,
  ...Array.from({ length: COS_CLICURI }, (_, k) => COS_PRIMUL + k * COS_PAS),
];

/**
 * Paginile, în ordinea din DOM: [pagina, intră, iese].
 *
 * ⚠ Față de machetă, NU se mai schimbă `z-index`-ul la mijlocul trecerii. Acolo pagina care intra
 * sărea deasupra celei care pleca la jumătatea estompării, deci se vedea o mică săritură de
 * culoare. Aici stivuirea e cea din DOM (pagina următoare e mereu deasupra), deci trecerea e o
 * simplă estompare peste pagina opacă de dedesubt. Singura excepție, întoarcerea la „home” la
 * sfârșit, iese tot curat: checkout-ul se stinge și dezvăluie pagina de start de dedesubt.
 */
export const PAGINI: ReadonlyArray<readonly [string, number, number]> = [
  ["home", 0, 4.75], ["prod", 4.75, 9.6], ["cart", 9.6, 13.3], ["chk", 13.3, 22.9], ["home", 22.9, 99],
];

/** Scrisul din checkout: [câmp, text, începe, durată]. */
export const SCRIS: ReadonlyArray<readonly [number, string, number, number]> = [
  [0, "Andrei Popescu", 13.95, 0.75], [1, "0740 555 321", 14.95, 0.6], [2, "Prahova", 15.7, 0.01],
  [3, "Ploiești", 16.35, 0.45], [4, "Str. Republicii nr. 10", 17.05, 0.7],
];

/** Când se sting câmpurile și fereastra „Comanda a fost plasată”. */
const CHK_SFARSIT = 22.9;

/* ─── Camera ───────────────────────────────────────────────────────────────── */

/** Zoomul la care ecranul umple lățimea scenei (cu 2% în plus, ca în machetă). */
const ZOOM_ECRAN = (1 / ECRAN.w) * 1.02;

function zoomul(cod: number): number {
  return cod === 0 ? ZOOM_ECRAN : cod === 1 ? 1 : (cod * ZOOM_ECRAN) / 1.15;
}

/** Cel mai mare zoom din buclă. De el depinde ce mărime de imagine trebuie descărcată. */
export const ZOOM_MAX = Math.max(...CAMERA.map((k) => zoomul(k[1])));

/**
 * Camera la momentul `t`: deplasarea (în procente din scenă, cum o cere `translate`) și zoomul.
 *
 * Aceeași socoteală ca în machetă, doar scrisă în FRACȚII din scenă în loc de pixeli: zoomul se
 * interpolează logaritmic, punctul urmărit merge odată cu el, iar la zoom mare ecranul nu iese
 * din cadru. Fiind în fracții, cadrele-cheie nu depind de mărimea scenei: nu se recalculează la
 * redimensionare, iar `translate` în procente se rezolvă singur pe orice ecran.
 */
export function camera(t: number): { x: number; y: number; z: number } {
  const [a, b] = cheile(CAMERA, t);
  const m = eio(pr(t, a[0], b[0]));
  const za = zoomul(a[1]);
  const zb = zoomul(b[1]);
  const z = Math.exp(lerp(Math.log(za), Math.log(zb), m));
  /* Punctul urmărit, în fracții din LĂȚIMEA scenei (și pe verticală). */
  const ax = ECRAN.x + (a[2] / LATIME_PAGINA) * ECRAN.w;
  const ay = ECRAN.y + (a[3] / 1080) * ECRAN.h;
  const bx = ECRAN.x + (b[2] / LATIME_PAGINA) * ECRAN.w;
  const by = ECRAN.y + (b[3] / 1080) * ECRAN.h;
  const w = za === zb ? m : (z - za) / (zb - za);
  const fx = lerp(ax, bx, w);
  const fy = lerp(ay, by, w);
  let tx = 0.5 - fx * z;
  const ty = RAPORT_SCENA / 2 - fy * z;
  if (z > 1.05) {
    const minx = 1 - (ECRAN.x + ECRAN.w) * z;
    const maxx = -ECRAN.x * z;
    tx = clamp(tx, Math.min(minx, maxx), Math.max(minx, maxx));
  }
  /* `translate` în procente se raportează la cutia elementului: lățimea pe X, înălțimea pe Y. */
  return { x: tx * 100, y: (ty / RAPORT_SCENA) * 100, z };
}

export function transformCamera(t: number): string {
  const c = camera(t);
  return `translate(${c.x.toFixed(3)}%, ${c.y.toFixed(3)}%) scale(${c.z.toFixed(4)})`;
}

/* ─── Pistele: fiecare element care se mișcă, ca funcție de timp ──────────── */

/** Opacitatea unei pagini la `t` (aceeași regulă ca în machetă, fără `z-index`). */
function opacitatePagina(p: string, t: number): number {
  let op = 0;
  for (const [nume, intra, iese] of PAGINI) {
    if (nume !== p) continue;
    if (!(t >= intra - 0.25 && t < iese + 0.25)) continue;
    const q = eo(pr(t, intra - 0.25, intra + 0.25));
    const o = pr(t, iese - 0.05, iese + 0.25);
    op = Math.max(op, intra === 0 ? 1 - o : q * (1 - o));
  }
  return op;
}

/** Cel mai recent clic, dacă a fost în ultimele `cat` secunde: cât a trecut de la el. */
function deLaUltimulClic(t: number, cat: number): number {
  let d = -1;
  for (const c of CLICURI) {
    const x = t - c;
    if (x >= 0 && x < cat && (d < 0 || x < d)) d = x;
  }
  return d;
}

function cursorul(t: number): { x: number; y: number; mana: boolean } {
  const [c0, c1] = cheile(CURSOR, t);
  const cm = eio(pr(t, c0[0], c1[0]));
  const mana = (c1[3] === 1 && cm > 0.55) || (c0[3] === 1 && cm < 0.45);
  return { x: lerp(c0[1], c1[1], cm), y: lerp(c0[2], c1[2], cm), mana };
}

/**
 * O pagină: opacitatea și, la pagina de start, derularea.
 *
 * ⚠ FĂRĂ `visibility` aici, și e MĂSURAT: o singură proprietate care nu merge pe compozitor scoate
 * TOATĂ animația de pe el. Cu `visibility` în cadre, Chrome recalcula stilul celor patru pagini la
 * fiecare cadru (144 de recalculări pe secundă; pe un telefon cu procesorul încetinit de 4 ori,
 * 143 ms din fiecare secundă), mai mult decât macheta originală. Iar `visibility` se moștenește,
 * deci recalculul cuprindea tot conținutul paginilor. Ascunderea paginilor stinse se face acum din
 * JavaScript, la cele câteva clipe în care se schimbă (`paginiVizibile`).
 */
function pistaPagina(p: string, cuDerulare = false): Pista {
  return {
    tinta: `pagina-${p}`,
    valori: (t) => [opacitatePagina(p, t), cuDerulare ? -eio(pr(t, 2.9, 4.2)) * 480 * (t < 20 ? 1 : 0) : 0],
    scrie: ([op, y]) => ({
      opacity: opac(op),
      ...(cuDerulare ? { transform: `translateY(${y.toFixed(1)}px)` } : {}),
    }),
    toleranta: [0.004, 0.3],
  };
}

/**
 * Cu cât înainte de prima ei apariție devine o pagină vizibilă (încă transparentă). În timpul ăsta
 * browserul o rasterizează, deci estomparea începe pe o pagină deja desenată, nu pe una goală.
 */
const AVANS_PAGINA = 0.5;

/** Intervalele în care e vizibilă fiecare pagină (opacitate peste 0, plus avansul). */
const VIZIBILITATE_PAGINI: ReadonlyArray<readonly [string, number, number]> = PAGINI.map(
  ([nume, intra, iese]) => [nume, Math.max(0, intra - 0.25 - (intra === 0 ? 0 : AVANS_PAGINA)), Math.min(BUCLA_S, iese + 0.3)] as const,
);

/**
 * Ce pagini sunt vizibile la `t`. Celelalte primesc `visibility: hidden`: o pagină stinsă, oricât de
 * transparentă, ar ține altfel un strat rasterizat de mărimea ei în memoria plăcii video.
 */
export function paginiVizibile(t: number): Record<string, boolean> {
  const r: Record<string, boolean> = { home: false, prod: false, cart: false, chk: false };
  for (const [nume, de, pana] of VIZIBILITATE_PAGINI) if (t >= de && t < pana) r[nume] = true;
  return r;
}

export const PISTE: readonly Pista[] = [
  {
    tinta: "camera",
    valori: (t) => {
      const c = camera(t);
      return [c.x, c.y, c.z];
    },
    scrie: ([x, y, z]) => ({ transform: `translate(${x.toFixed(3)}%, ${y.toFixed(3)}%) scale(${z.toFixed(4)})` }),
    /* 0,02% din scenă: sub o zecime de pixel pe un card de 600 px, și cel mult o treime de
       pixel chiar la zoomul maxim. */
    toleranta: [0.02, 0.02, 0.0005],
  },
  pistaPagina("home", true),
  pistaPagina("prod"),
  pistaPagina("cart"),
  pistaPagina("chk"),

  /* Pagina de produs: varianta a doua, chenarul variantei alese, bulina coșului, notificarea. */
  { tinta: "varianta-b", valori: (t) => [treapta(t > 7.05)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  { tinta: "chenar-varianta", valori: (t) => [treapta(t > 5.97 && t < 7.05)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  { tinta: "cos-produs", valori: (t) => [treapta(t > 8.2)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  {
    tinta: "cos-produs-bulina",
    valori: (t) => [0.4 + 0.6 * spr(pr(t, 8.2, 8.5))],
    scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.002],
  },
  {
    tinta: "notificare",
    valori: (t) => {
      const tq = pr(t, 8.25, 8.6);
      const tz = pr(t, 9.15, 9.45);
      return [clamp(tq * 3) * (1 - tz), (1 - eo(tq)) * -16];
    },
    scrie: ([o, y]) => ({ opacity: opac(o), transform: `translateY(${y.toFixed(2)}px)` }),
    toleranta: [0.004, 0.15],
  },

  /* Coșul: apăsarea butonului „Finalizează comanda”. */
  {
    tinta: "finalizeaza",
    valori: (t) => [1 - 0.04 * Math.sin(pr(t, 13.1, 13.3) * Math.PI)],
    scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.0005],
  },

  /* Checkout: câmpurile apar pe rând; cursorul de text clipește cât e câmpul în lucru. */
  ...SCRIS.flatMap(([camp, , incepe]): Pista[] => {
    const urmator = SCRIS[camp + 1];
    const sfarsitFocus = urmator ? urmator[2] : 17.9;
    return [
      {
        tinta: `camp-${camp}`,
        valori: (t) => [treapta(t >= incepe && t < CHK_SFARSIT)],
        scrie: ([o]) => ({ opacity: o }),
        toleranta: [0.004],
      },
      {
        tinta: `caret-${camp}`,
        valori: (t) => [treapta(t >= incepe && t < sfarsitFocus && Math.floor(t * 2.4) % 2 === 0)],
        scrie: ([o]) => ({ opacity: o }),
        toleranta: [0.004],
      },
    ];
  }),

  /* „Comanda a fost plasată!” */
  {
    tinta: "plasata",
    valori: (t) => [t < CHK_SFARSIT ? pr(t, 18.3, 18.65) : 0],
    scrie: ([o]) => ({ opacity: opac(o) }),
    toleranta: [0.004],
  },
  {
    tinta: "plasata-card",
    valori: (t) => {
      const oq = pr(t, 18.3, 18.65);
      return [(1 - eo(oq)) * 30, 0.94 + 0.06 * eo(oq)];
    },
    scrie: ([y, s]) => ({ transform: `translateY(${y.toFixed(2)}px) scale(${s.toFixed(4)})` }),
    toleranta: [0.15, 0.0008],
  },
  {
    tinta: "plasata-bifa",
    valori: (t) => [spr(pr(t, 18.45, 19.1))],
    scrie: ([s]) => ({ transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.002],
  },

  /* Cursorul: poziția, apăsarea și apariția stau pe ACELAȘI element, deci într-o singură pistă;
     apoi săgeata sau mâna, și cercul clicului. */
  {
    tinta: "cursor",
    valori: (t) => {
      const c = cursorul(t);
      const apasat = CLICURI.some((k) => t - k > -0.08 && t - k < 0.12);
      const vizibil = t < 1.6 || t > 19.4 ? 0 : clamp(Math.min((t - 1.6) * 3, (19.4 - t) * 3));
      return [c.x, c.y, apasat ? 0.86 : 1, vizibil];
    },
    scrie: ([x, y, s, o]) => ({
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s})`,
      opacity: opac(o),
    }),
    toleranta: [0.4, 0.4, 0.002, 0.004],
  },
  { tinta: "cursor-mana", valori: (t) => [treapta(cursorul(t).mana)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  { tinta: "cursor-sageata", valori: (t) => [treapta(!cursorul(t).mana)], scrie: ([o]) => ({ opacity: o }), toleranta: [0.004] },
  {
    tinta: "clic",
    valori: (t) => {
      const d = deLaUltimulClic(t, 0.45);
      const r = d < 0 ? -1 : d / 0.45;
      return [r < 0 ? 0 : 1 - r, r < 0 ? 0.4 : 0.4 + r * 1.2];
    },
    scrie: ([o, s]) => ({ opacity: opac(o), transform: `scale(${s.toFixed(4)})` }),
    toleranta: [0.004, 0.003],
  },
];

/* ─── Textele care se schimbă (singura parte scrisă din JavaScript) ───────── */

/** Prețul cum îl scrie magazinul: virgulă zecimală, punct la mii, fără „,00”. */
export function fmt(v: number): string {
  const s = v.toFixed(2).replace(".", ",").replace(/,00$/, "");
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} lei`;
}

/** Prețul pe bucată după cantitate (trepte de preț ale produsului). */
export function pretUnitar(q: number): number {
  return q >= 10 ? 17.09 : q >= 5 ? 18.42 : 18.99;
}

export interface StareTexte {
  cantitate: string;
  totalProdus: string;
  pretBucata: string;
  panaLaGratuit: string;
  /** Cât din bara spre livrarea gratuită e plin, între 0 și 1. */
  bara: number;
  subtotal: string;
  tva: string;
  total: string;
  /** Peste comanda minimă: butonul „Finalizează comanda” e activ. */
  activ: boolean;
  bulinaCos: string;
  sumaCos: string;
  /** Ce s-a scris până acum în fiecare câmp din checkout. */
  scris: string[];
}

/** Câte clicuri de „+” au intrat la `t` (fiecare se vede la 40 ms după apăsare). */
function clicuriCos(t: number): number {
  let n = 0;
  for (let k = 0; k < COS_CLICURI; k++) if (t >= COS_PRIMUL + k * COS_PAS + 0.04) n++;
  return n;
}

/** Textele la momentul `t`. Exact regula machetei. */
export function stareaTextelor(t: number): StareTexte {
  const q = 1 + clicuriCos(t);
  const u = pretUnitar(q);
  const sub = q >= 10 ? Math.round(q * u) : Math.round(q * u * 100) / 100;
  const tva = Math.round((sub + 45) * 21) / 100;
  const tot = sub + 45 + tva;
  return {
    cantitate: String(q),
    totalProdus: fmt(sub),
    pretBucata: `${fmt(u)} bucata`,
    panaLaGratuit: fmt(Math.max(0, 999 - sub)),
    bara: Math.max(0.019, sub / 999),
    subtotal: fmt(sub),
    tva: fmt(tva),
    total: fmt(tot),
    activ: sub >= 150,
    bulinaCos: q > 9 ? "9+" : String(q),
    sumaCos: fmt(sub).replace(",00", ""),
    scris: SCRIS.map(([, text, incepe, durata]) => text.slice(0, Math.floor(clamp((t - incepe) / durata) * text.length))),
  };
}

/**
 * Clipele în care se schimbă ceva scris din JavaScript (un text sau vizibilitatea unei pagini),
 * în ordine. Între ele nu se scrie nimic; o singură programare (`setTimeout`) duce de la una la
 * alta. Începutul buclei (0) e și el o clipă: acolo coșul se golește și câmpurile se șterg.
 */
export const MOMENTE_DISCRETE: readonly number[] = (() => {
  const m = new Set<number>([0]);
  for (let k = 0; k < COS_CLICURI; k++) m.add(COS_PRIMUL + k * COS_PAS + 0.04);
  for (const [, text, incepe, durata] of SCRIS) {
    for (let c = 1; c <= text.length; c++) m.add(incepe + (c / text.length) * durata);
  }
  for (const [, de, pana] of VIZIBILITATE_PAGINI) {
    if (de > 0) m.add(de);
    if (pana < BUCLA_S) m.add(pana);
  }
  return [...m].sort((a, b) => a - b);
})();

/* ─── Ce mărime de imagine se descarcă ─────────────────────────────────────── */

export const LATIMI_IMAGINI = [1280, 1920] as const;

/**
 * Lățimea unei capturi pentru un ecran de `latimeEcranCss` pixeli CSS, la zoomul cel mai mare la
 * care se vede pagina ei (`ZOOM_PE_PAGINA`; implicit cel al buclei întregi).
 *
 * Contează zoomul MAXIM, nu cel de start: la produs camera ajunge la `ZOOM_MAX` (~3×), iar acolo o
 * treime din ecran umple cardul. Densitatea se ia cel mult 2: peste ea, diferența nu se vede la o
 * animație, dar memoria crește cu pătratul (un ecran 3× ar cere 1920 pe orice telefon).
 *
 * Telefon de 390 px: ecranul iMac-ului are ~215 px, × 3,04 × 2 = ~1.310 → 1280 (o abatere de 2%
 * nu se vede). Desktop: ~400 px × 3,04 × 2 = ~2.430 → 1920, cel mai mare pe care îl avem.
 */
export function latimeaImaginilor(
  latimeEcranCss: number,
  densitate: number,
  zoom: number = ZOOM_MAX,
): (typeof LATIMI_IMAGINI)[number] {
  const nevoie = latimeEcranCss * zoom * Math.min(Math.max(densitate || 1, 1), 2);
  return nevoie <= LATIMI_IMAGINI[0] * 1.1 ? LATIMI_IMAGINI[0] : LATIMI_IMAGINI[1];
}

/** Capturile, în ordinea în care apar. Numele fișierelor: `<nume>-<lățime>.webp`. */
export const IMAGINI = ["home", "produs-a", "produs-b", "cos", "checkout"] as const;
export const DOSAR_IMAGINI = "/features/magazin-animat";
/** Pagina pe care stă fiecare captură. */
export const PAGINA_IMAGINII: Record<(typeof IMAGINI)[number], string> = {
  home: "home",
  "produs-a": "prod",
  "produs-b": "prod",
  cos: "cart",
  checkout: "chk",
};

/**
 * Zoomul cel mai mare la care se vede limpede fiecare pagină (opacitate peste jumătate), măsurat pe
 * buclă la 60 de puncte pe secundă.
 *
 * ⚠ DE CE PE PAGINĂ. Pagina de start nu trece de zoomul ecranului întreg (~1,6), deci pe un desktop
 * obișnuit îi ajunge captura de 1280: chiar cea pe care o aduce HTML-ul. Cu zoomul buclei întregi
 * (~3) cerea 1920, iar browserul apucase deja s-o descarce pe cea de 1280 (pragul lui pentru
 * imaginile leneșe e mai departe de ecran decât al nostru): două descărcări, 66 KB aruncați la
 * fiecare vizită pe desktop. Găsit la recenzie.
 */
export const ZOOM_PE_PAGINA: Record<string, number> = (() => {
  const z: Record<string, number> = { home: 1, prod: 1, cart: 1, chk: 1 };
  for (let k = 0; k <= BUCLA_S * 60; k++) {
    const t = Math.min(k / 60, BUCLA_S - 1e-6);
    const zoom = camera(t).z;
    for (const p of Object.keys(z)) if (opacitatePagina(p, t) > 0.5) z[p] = Math.max(z[p], zoom);
  }
  return z;
})();
