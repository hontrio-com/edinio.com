/**
 * Macheta animată a celui de-al patrulea card din „Soluția”: telefonul clientului. Pe ecranul de
 * blocare vin, pe rând, trei notificări ale campaniilor automate (SMS, e-mail, SMS de ziua lui), iar
 * în panoul „Comenzi noi” intră comenzile pe care le aduc, cu sursa lor și cu veniturile din
 * marketing, care cresc. Bucla are 12,5 secunde.
 *
 * ═══ DE UNDE VINE ═══
 *
 * Macheta a făcut-o clientul (cu Claude), ca pagină de sine stătătoare:
 * `edinio-vanzari-preview.html` („varianta 5: telefonul clientului”), 15.10.2026. CRONOLOGIA de
 * aici e a ei, neatinsă: când vine fiecare notificare și fiecare comandă, cum se mișcă, textele.
 *
 * ═══ CE S-A SCHIMBAT: CUM SE MIȘCĂ ═══
 *
 * Ca la celelalte machete (motorul în `animatie-bucla.ts`): tot ce se mișcă merge pe compozitor, iar
 * JavaScript-ul scrie doar textele, în clipele în care se schimbă. Ce nu se putea traduce direct:
 *
 *   1. ÎNĂLȚIMEA NOTIFICĂRILOR. O notificare nouă le împinge pe cele vechi cu înălțimea ei, iar
 *      înălțimea depinde de fontul sistemului (SF pe Mac, Segoe pe Windows). Macheta o măsura la
 *      fiecare cadru; aici o măsoară componenta o dată, înainte de pornire, iar pistele se fac din
 *      ea (`pisteCuInaltimi`). `PISTE` folosește înălțimile măsurate pe Windows, pentru HTML.
 *   2. Notificările se mută printr-un PURTĂTOR cât zona lor (procentele lui sunt unități de scenă),
 *      iar scara și opacitatea stau pe notificarea însăși, ca la macheta (centrul ei).
 *   3. FONDUL VERDE al comenzii noi era o culoare schimbată la fiecare cadru; aici e un strat a
 *      cărui opacitate se stinge.
 *   4. TOTALUL, care crește la fiecare comandă, se scria ca text la fiecare cadru. ⚠ MĂSURAT: scris
 *      din JavaScript de 60 de ori pe secundă cât crește, fiecare scriere cerea un cadru întreg pe
 *      firul principal (Chrome reîmprospăta și cele ~30 de elemente animate), iar pe un telefon
 *      încetinit de 4 ori cardul ajungea mai scump decât macheta (297 față de 211 ms/s). Aici e un
 *      contor cu ROLE, tot pe compozitor: fiecare cifră e o bandă 0-9 mutată în TREPTE (pistele cu
 *      `trepte`), cu aceleași valori, pe aceeași grilă de 60 pe secundă. Rândul stă aliniat la
 *      stânga ca textul machetei: cu câte o cifră mai puțin, se mută cu o cifră spre stânga, iar
 *      cifra din față se stinge.
 */

import { clamp, eio, eo, opac, pr, procent, spr, treapta, type Pista } from "./animatie-bucla";

/** Lungimea buclei, în secunde. */
export const BUCLA_S = 12.5;
/** Când începe să se stingă totul, la capătul buclei. */
const IESIRE = 11.6;

/** Clipa pe care o arată HTML-ul și de la care pornește bucla: telefonul și panoul intrate, nimic venit. */
export const PORNIRE_S = 0.5;
/** Cadrul static pentru „mișcare redusă”: toate notificările și toate comenzile venite. */
export const STATIC_S = 10.5;

/* ─── Geometria (în sutimi din lățimea scenei, ca în machetă) ─────────────── */

/** Telefonul: lățimea (pentru tremurul lui, în procente din ea). */
export const TELEFON = { latime: 32.4 } as const;
/** Purtătorul notificărilor: cât zona lor, de la `top: 28.6` până jos în ecran (procentele lui). */
export const PURTATOR_NOTIFICARI = { inaltime: 40 } as const;
/** Un rând de comandă: lățimea și înălțimea lui, și pasul dintre rânduri. */
export const RAND = { latime: 47.2, inaltime: 6.6, pas: 6.9 } as const;

/* ─── Ce vine, și când ────────────────────────────────────────────────────── */

export type SursaNotificare = "sms" | "email";
export interface Notificare {
  la: number;
  sursa: SursaNotificare;
  subiect: string;
  text: string;
}
/** Notificările, în ordinea în care vin. */
export const NOTIFICARI: readonly Notificare[] = [
  { la: 1.0, sursa: "sms", subiect: "", text: "Ultimele 3 bucăți din Vesta Hi-Vis la -15%. Comandă acum: esafe.ro/v" },
  { la: 4.0, sursa: "email", subiect: "Coșul tău te așteaptă", text: "Folosește codul REVINO10 și primești 10% reducere la comandă." },
  { la: 7.0, sursa: "sms", subiect: "", text: "La mulți ani, Andrei! Ai un cupon de 15% valabil azi: ZIUA15" },
];

/**
 * Înălțimea fiecărei notificări, în unități de scenă, plus distanța de 0,7 dintre ele: cu atât le
 * împinge una nouă pe cele vechi. Măsurate pe Windows (Segoe UI); componenta le măsoară din nou.
 */
export const INALTIMI_IMPLICITE: readonly number[] = [6.842 + 0.7, 8.421 + 0.7, 6.842 + 0.7];

/** Sursa unei comenzi: 0 SMS, 1 e-mail, 2 cuponul. */
export type SursaComanda = 0 | 1 | 2;
export interface Comanda {
  la: number;
  nume: string;
  initiale: string;
  culoare: string;
  suma: number;
  sursa: SursaComanda;
  /** Avatarul, în `public/features/vanzari-animat/`. */
  avatar: string;
}
/** Comenzile, în ordinea în care intră. Numărul fiecăreia e 10483 + poziția ei. */
export const COMENZI: readonly Comanda[] = [
  { la: 2.3, nume: "Maria Ionescu", initiale: "MI", culoare: "#7C3AED", suma: 149, sursa: 0, avatar: "av-maria" },
  { la: 3.0, nume: "Vlad Petrescu", initiale: "VP", culoare: "#2563EB", suma: 87, sursa: 0, avatar: "av-vlad" },
  { la: 5.3, nume: "Andrei Popescu", initiale: "AP", culoare: "#F56A52", suma: 280.8, sursa: 1, avatar: "av-andrei" },
  { la: 6.0, nume: "Ioana Marin", initiale: "IM", culoare: "#0EA5E9", suma: 132.3, sursa: 1, avatar: "av-ioana" },
  { la: 8.3, nume: "Elena Stan", initiale: "ES", culoare: "#D97706", suma: 212.5, sursa: 2, avatar: "av-elena" },
  { la: 9.0, nume: "Radu Matei", initiale: "RM", culoare: "#059669", suma: 96.9, sursa: 0, avatar: "av-radu" },
];
export const NUMAR_PRIMA_COMANDA = 10483;

/** Suma unei comenzi, scrisă ca în machetă: `149,00 lei`. */
export const sumaComenzii = (v: number) => `${v.toFixed(2).replace(".", ",")} lei`;
/** Totalul, cu puncte la mii: `1.157,58 lei`. */
export function totalScris(v: number): string {
  const [intreg, zecimale] = v.toFixed(2).split(".");
  return `${intreg.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${zecimale} lei`;
}

/* ─── Pistele ──────────────────────────────────────────────────────────────── */

/** Intrarea a tot, la începutul buclei, și stingerea de la capăt (1 = aprins). */
const intrare = (t: number) => eo(pr(t, 0, 0.5));
export const iesire = (t: number) => 1 - pr(t, IESIRE, IESIRE + 0.6);

/** 0,01 din lățimea scenei. */
const TOL = 0.01;

/** Tremurul telefonului la fiecare notificare (0,3 s), în unități de scenă. */
export function tremur(t: number): number {
  let vib = 0;
  for (const n of NOTIFICARI) {
    const v = pr(t, n.la, n.la + 0.3);
    if (v > 0 && v < 1) vib = v;
  }
  return vib ? Math.sin(vib * Math.PI * 8) * 0.22 * (1 - vib) : 0;
}

/** Cât o împing pe notificarea `i` cele venite după ea, plus alunecarea ei de la intrare. */
export function deplasareNotificare(i: number, t: number, inaltimi: readonly number[]): number {
  let y = 0;
  for (let j = i + 1; j < NOTIFICARI.length; j++) y += eio(pr(t, NOTIFICARI[j].la, NOTIFICARI[j].la + 0.45)) * (inaltimi[j] ?? 10);
  const q = pr(t, NOTIFICARI[i].la, NOTIFICARI[i].la + 0.5);
  return y + (1 - spr(q)) * -4;
}

/** Cât o împing pe comanda `i` cele intrate după ea. */
export function deplasareComanda(i: number, t: number): number {
  let y = 0;
  for (let j = i + 1; j < COMENZI.length; j++) y += eio(pr(t, COMENZI[j].la, COMENZI[j].la + 0.4)) * RAND.pas;
  return y;
}

/** Pistele, cu înălțimile notificărilor date (unități de scenă, cu tot cu distanța dintre ele). */
export function pisteCuInaltimi(inaltimi: readonly number[]): Pista[] {
  return [
    /* Telefonul: intră, tremură la fiecare notificare, se stinge la capăt. */
    {
      tinta: "telefon",
      valori: (t) => [tremur(t), intrare(t) * iesire(t)],
      scrie: ([x, o]) => ({ transform: `translateX(${procent(x, TELEFON.latime)}%)`, opacity: opac(o) }),
      toleranta: [TOL, 0.004],
    },
    {
      tinta: "panou",
      valori: (t) => [intrare(t) * iesire(t)],
      scrie: ([o]) => ({ opacity: opac(o) }),
      toleranta: [0.004],
    },

    /* Notificările: purtătorul le mută, iar ele își schimbă scara și opacitatea. */
    ...NOTIFICARI.flatMap((n, i): Pista[] => [
      {
        tinta: `notificare-loc-${i}`,
        valori: (t) => [deplasareNotificare(i, t, inaltimi)],
        scrie: ([y]) => ({ transform: `translateY(${procent(y, PURTATOR_NOTIFICARI.inaltime)}%)` }),
        toleranta: [TOL],
      },
      {
        tinta: `notificare-${i}`,
        valori: (t) => {
          const q = pr(t, n.la, n.la + 0.5);
          return [clamp(q * 2.2) * iesire(t), 0.9 + 0.1 * spr(q)];
        },
        scrie: ([o, s]) => ({ opacity: opac(o), transform: `scale(${s.toFixed(4)})` }),
        toleranta: [0.004, 0.0005],
      },
    ]),

    /* Comenzile: intră din stânga, coboară când vine una nouă, iar fondul verde se stinge. */
    ...pisteleContorului(),

    ...COMENZI.flatMap((c, i): Pista[] => [
      {
        tinta: `comanda-${i}`,
        valori: (t) => {
          const q = pr(t, c.la, c.la + 0.4);
          return [(1 - eo(q)) * -2, deplasareComanda(i, t), clamp(q * 2.5) * iesire(t)];
        },
        scrie: ([x, y, o]) => ({
          transform: `translate(${procent(x, RAND.latime)}%, ${procent(y, RAND.inaltime)}%)`,
          opacity: opac(o),
        }),
        toleranta: [TOL, TOL, 0.004],
      },
      {
        tinta: `comanda-fond-${i}`,
        valori: (t) => {
          const h = pr(t, c.la, c.la + 1.6);
          return [h > 0 && h < 1 ? 1 - h : 0];
        },
        scrie: ([o]) => ({ opacity: opac(o) }),
        toleranta: [0.004],
      },
    ]),
  ];
}

export const PISTE: readonly Pista[] = pisteCuInaltimi(INALTIMI_IMPLICITE);

/* ─── Partea scrisă din JavaScript: totalul și numărătorile pe surse ───────── */

export interface StareDiscreta {
  /** „Venituri din marketing azi”. */
  total: string;
  /** Câte comenzi din SMS, din e-mail și cu cuponul. */
  surse: [number, number, number];
}

/** Cât crește totalul la o comandă: 0,6 s, scris de 60 de ori pe secundă (vezi nota 4). */
const CRESTERE = 0.6;
const PE_SECUNDA = 60;

/** Clipa de pe grila de 60 pe secundă a creșterii în curs (sau `t`, dacă nu crește nimic). */
function clipaGrilei(t: number): number {
  for (const c of COMENZI) {
    if (t >= c.la && t < c.la + CRESTERE) return c.la + Math.floor((t - c.la) * PE_SECUNDA + 1e-9) / PE_SECUNDA;
  }
  return t;
}

/** Totalul la clipa `t`, pe grila de 60 pe secundă a creșterii în curs. Exact regula machetei. */
export function totalLa(t: number): number {
  const tg = clipaGrilei(t);
  let total = 0;
  for (const c of COMENZI) if (tg >= c.la) total += c.suma * eio(pr(tg, c.la, c.la + CRESTERE));
  return total;
}

/** Totalul și numărătorile la clipa `t`. Exact regula machetei. */
export function stareaDiscreta(t: number): StareDiscreta {
  const surse: [number, number, number] = [0, 0, 0];
  for (const c of COMENZI) if (t >= c.la) surse[c.sursa]++;
  return { total: totalScris(totalLa(t)), surse };
}

/**
 * Cifrele contorului la `t`, din chiar textul machetei (`toFixed(2)`): câte cifre are partea întreagă
 * (1-3) și cele cinci cifre, sute-zeci-unități și cele două zecimale (cele din față, 0 când lipsesc).
 */
export function cifreleTotalului(t: number): { intregi: number; cifre: number[] } {
  const [intreg, zecimale] = totalLa(t).toFixed(2).split(".");
  const plin = intreg.padStart(3, "0").slice(-3);
  return { intregi: Math.min(3, intreg.length), cifre: [...plin, ...zecimale].map(Number) };
}

/** Pistele contorului: rândul (aliniat la stânga), cele două cifre din față, cele cinci benzi. */
function pisteleContorului(): Pista[] {
  const trepte = { trepte: true as const, toleranta: [0] };
  return [
    {
      tinta: "total-loc",
      valori: (t) => [cifreleTotalului(t).intregi],
      /* Purtătorul e lat cât o cifră: cu `n` cifre întregi, rândul se mută cu 3 - n cifre. */
      scrie: ([n]) => ({ transform: `translateX(${-(3 - n) * 100}%)` }),
      ...trepte,
    },
    ...[0, 1].map((k): Pista => ({
      tinta: `total-cifra-${k}`,
      valori: (t) => [treapta(cifreleTotalului(t).intregi >= 3 - k)],
      scrie: ([o]) => ({ opacity: o }),
      ...trepte,
    })),
    ...[0, 1, 2, 3, 4].map((k): Pista => ({
      tinta: `total-banda-${k}`,
      valori: (t) => [cifreleTotalului(t).cifre[k]],
      /* Banda are zece rânduri: o cifră e o zecime din ea. */
      scrie: ([d]) => ({ transform: `translateY(${-d * 10}%)` }),
      ...trepte,
    })),
  ];
}

/** Clipele în care se schimbă numărătorile pe surse: începutul buclei și intrarea fiecărei comenzi. */
export const MOMENTE_DISCRETE: readonly number[] = [0, ...COMENZI.map((c) => c.la)];
