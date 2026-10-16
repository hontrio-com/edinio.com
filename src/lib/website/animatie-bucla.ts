/**
 * Motorul comun al machetelor animate din cardurile „Soluția” (`magazin-animat.ts`,
 * `integrari-animat.ts`, `automatizari-animat.ts`, `vanzari-animat.ts`, `tehnic-animat.ts`): o buclă
 * descrisă ca funcții de timp, tradusă o singură dată în cadre-cheie pentru Web Animations.
 *
 * ═══ DE CE AȘA ═══
 *
 * Machetele clientului mișcau totul dintr-o funcție chemată la FIECARE cadru: zeci de scrieri de
 * stil pe firul principal, de 60 de ori pe secundă. Pe un telefon, la derulare, firul ăla e ocupat
 * cu teancul de carduri, deci animația s-ar fi poticnit exact când omul derulează.
 *
 * Aici fiecare element care se mișcă e o PISTĂ: valorile lui ca funcție de timp. Se eșantionează
 * o dată, la 60 de puncte pe secundă, și se păstrează doar cadrele de care o interpolare liniară
 * chiar are nevoie. Browserul le rulează pe COMPOZITOR, în afara JavaScript-ului: nu se oprește
 * când pagina are altceva de lucru. Ce nu se poate anima așa (textele, clasele) se scrie din
 * JavaScript numai în clipele în care se schimbă (`urmatorulMoment`).
 *
 * ⚠ În cadre intră NUMAI `transform` și `opacity`: o singură proprietate care nu merge pe
 * compozitor scoate toată animația elementului de pe el. Măsurat la primul card, 14.10.2026.
 *
 * Totul e PUR aici (fără DOM), ca să se poată proba. Partea de DOM e `useAnimatieInBucla`.
 */

/* ─── Curbe (aceleași ca în machete) ──────────────────────────────────────── */

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** Progresul lui `t` între `a` și `b`, tăiat la [0, 1]. */
export const pr = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** Ease-in-out cubic. */
export const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Ease-out cubic. */
export const eo = (x: number) => 1 - Math.pow(1 - x, 3);
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** Un arc amortizat (bulinele, bifele). */
export const spr = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(8 * x));

/** Perechea de chei între care cade `t` (ultima pereche rămâne până la capăt). Cheia începe cu timpul. */
export function cheile<K extends readonly [number, ...unknown[]]>(chei: ReadonlyArray<K>, t: number): [K, K] {
  let i = 0;
  while (i < chei.length - 2 && t >= chei[i + 1][0]) i++;
  return [chei[i], chei[i + 1]];
}

/** 1 cât e adevărat, 0 altfel: o opacitate care sare. */
export const treapta = (pornit: boolean) => (pornit ? 1 : 0);
/** Opacitatea, rotunjită la miime: mai multe zecimale nu se văd, dar umflă cadrele. */
export const opac = (v: number) => Math.round(v * 1000) / 1000;

/* ─── Pistele ──────────────────────────────────────────────────────────────── */

/**
 * O pistă: ce element, ce valori numerice are la `t`, cum se scriu ele în CSS și cât de mult
 * poate greși o interpolare liniară între două cadre-cheie fără să se vadă.
 */
export interface Pista {
  /** Valoarea atributului `data-*` al elementului (atributul îl alege fiecare machetă). */
  tinta: string;
  valori: (t: number) => number[];
  scrie: (v: number[]) => Keyframe;
  /** Abaterea admisă, pe fiecare componentă, în unitățile ei. */
  toleranta: number[];
  /**
   * Valori care SAR, fără trecere între ele (cifrele unui contor): cadrele-cheie se păstrează exact
   * unde se schimbă valoarea și țin fiecare până la următorul (`easing: step-end`).
   */
  trepte?: boolean;
}

/**
 * Păstrează din eșantioane doar cele de care o interpolare LINIARĂ chiar are nevoie.
 *
 * Întâi se strâng porțiunile constante la capetele lor: în buclă, cele mai multe piste stau
 * nemișcate secunde întregi, iar fără pasul ăsta verificarea de mai jos le-ar parcurge pătratic.
 * Strângerea nu strică nimic: pe o porțiune constantă, abaterea față de orice dreaptă e liniară
 * în timp, deci maximul ei cade chiar într-unul din capetele păstrate.
 *
 * Apoi, lacom: de la ultimul cadru păstrat, se întinde dreapta cât timp TOATE punctele dintre
 * capete rămân în toleranță. Rezultatul: puține cadre pe porțiunile drepte, dese pe curbe.
 */
export function simplifica(ts: readonly number[], vs: readonly number[][], toleranta: readonly number[]): number[] {
  const egal = (a: number[], b: number[]) => a.every((x, d) => x === b[d]);
  const candidati: number[] = [];
  for (let k = 0; k < ts.length; k++) {
    const interior = k > 0 && k < ts.length - 1 && egal(vs[k], vs[k - 1]) && egal(vs[k], vs[k + 1]);
    if (!interior) candidati.push(k);
  }

  /* Dreapta dintre candidații `a` și `b` trece prin toți cei de la mijloc, în toleranță? */
  const seInterpoleaza = (a: number, b: number): boolean => {
    const ka = candidati[a];
    const kb = candidati[b];
    for (let j = a + 1; j < b; j++) {
      const k = candidati[j];
      const f = (ts[k] - ts[ka]) / (ts[kb] - ts[ka]);
      for (let d = 0; d < toleranta.length; d++) {
        const v = vs[ka][d] + (vs[kb][d] - vs[ka][d]) * f;
        if (Math.abs(v - vs[k][d]) > toleranta[d]) return false;
      }
    }
    return true;
  };

  const pastrate = [candidati[0]];
  let i = 0;
  while (i < candidati.length - 1) {
    let j = i + 1;
    while (j + 1 < candidati.length && seInterpoleaza(i, j + 1)) j++;
    pastrate.push(candidati[j]);
    i = j;
  }
  return pastrate;
}

/** Eșantioane pe secundă. La 60, o săritură devine o trecere de 16 ms, sub un cadru. */
export const ESANTIOANE_PE_SECUNDA = 60;

/**
 * Eșantioanele unei piste pe o buclă de `buclaS` secunde și care dintre ele rămân cadre-cheie.
 * Separat de `cadrePista` ca proba să poată verifica NUMERIC ce interpolează browserul între
 * cadre, fără să citească înapoi CSS.
 */
export function esantioanePista(
  p: Pista,
  buclaS: number,
  pePeSecunda = ESANTIOANE_PE_SECUNDA,
): { ts: number[]; vs: number[][]; pastrate: number[] } {
  /* Bucla nu e neapărat un număr întreg de eșantioane (20,6 s); ultimul pas e doar mai scurt. */
  const n = Math.ceil(buclaS * pePeSecunda - 1e-9);
  const ts: number[] = [];
  const vs: number[][] = [];
  for (let k = 0; k <= n; k++) {
    /* Ultimul eșantion e limita din stânga a capătului buclei, nu începutul următoarei. */
    const t = k === n ? buclaS - 1e-6 : k / pePeSecunda;
    ts.push(t);
    vs.push(p.valori(t));
  }
  return { ts, vs, pastrate: p.trepte ? schimbari(vs) : simplifica(ts, vs, p.toleranta) };
}

/** O pistă în trepte: primul eșantion, fiecare schimbare de valoare și ultimul. */
function schimbari(vs: readonly number[][]): number[] {
  const out = [0];
  for (let k = 1; k < vs.length - 1; k++) if (vs[k].some((x, d) => x !== vs[k - 1][d])) out.push(k);
  out.push(vs.length - 1);
  return out;
}

/** Cadrele-cheie ale unei piste, gata pentru `element.animate`. */
export function cadrePista(p: Pista, buclaS: number, pePeSecunda = ESANTIOANE_PE_SECUNDA): Keyframe[] {
  const { ts, vs, pastrate } = esantioanePista(p, buclaS, pePeSecunda);
  return pastrate.map((k, idx) => ({
    ...p.scrie(vs[k]),
    offset: idx === 0 ? 0 : idx === pastrate.length - 1 ? 1 : ts[k] / buclaS,
    ...(p.trepte ? { easing: "step-end" } : {}),
  }));
}

/* ─── Partea scrisă din JavaScript ─────────────────────────────────────────── */

/**
 * Următoarea clipă de după `t` din `momente` (în ordine); după ultima, începutul buclei
 * următoare (`buclaS`).
 */
export function urmatorulMoment(momente: readonly number[], t: number, buclaS: number): number {
  for (const m of momente) if (m > t + 1e-4) return m;
  return buclaS;
}

/**
 * O deplasare în unitățile scenei (sutimi din lățimea ei), ca procent din mărimea elementului
 * care se mișcă: așa o cere `translate`. Procentele le rezolvă browserul pe orice ecran, deci
 * cadrele nu se refac la redimensionare.
 */
export const procent = (deplasare: number, marime: number) => ((deplasare / marime) * 100).toFixed(3);
