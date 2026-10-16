/**
 * O lumină estompată FĂRĂ `filter: blur()`: degradeul radial care desenează direct ce ar fi ieșit din
 * estompare. Folosit de petele din fundalul primului ecran (`hero-backgrounds.tsx`).
 *
 * ═══ DE CE ═══
 *
 * O pată estompată care se mișcă își reface estomparea la FIECARE cadru, pe placa grafică, chiar dacă se
 * mută doar. MĂSURAT 16.10.2026 pe pagina de start, cu primul ecran pe ecran: estomparea celor șase pete
 * era jumătate din munca procesului grafic (143-165 ms/s față de 65-74 fără ea). Un degrade se desenează
 * o dată, iar compozitorul doar îl mută.
 *
 * ═══ CUM ═══
 *
 * Estomparea gaussiană a unei forme cu simetrie radială e tot radială, deci un `radial-gradient` o poate
 * desena exact. Profilul se socotește aici, ca integrală (convoluția 2D în coordonate polare, cu funcția
 * Bessel I0), la fiecare 1/24 din raza casetei; între opriri, browserul interpolează liniar. Față de ce
 * desenează Chrome cu `filter: blur()`, MĂSURAT pe toate cele șase pete: abaterea e sub 0,008 din
 * acoperire, adică sub o treime de nivel de culoare la opacitățile petelor (0,10-0,17).
 *
 * Caseta trebuie să fie mai mare decât forma: lumina estompată se întinde cam 3 deviații dincolo de ea.
 */

/** I0(x)·e^(-|x|), stabil și pentru x mare (Abramowitz și Stegun, 9.8.1 și 9.8.2). */
function besselI0Scalat(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    return Math.exp(-ax) * (1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813))))));
  }
  const y = 3.75 / ax;
  return (
    (1 / Math.sqrt(ax)) *
    (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))))
  );
}

/**
 * Acoperirea (0-1) la distanța `d` de centru a formei radiale `forma(r)` (0-1, nulă după `razaMax`),
 * estompată gaussian cu deviația `s`. Unități oarecare, aceleași pentru toate trei.
 */
export function acoperireEstompata(forma: (r: number) => number, razaMax: number, s: number, d: number): number {
  const pasi = 600;
  const h = razaMax / pasi;
  let suma = 0;
  for (let k = 0; k <= pasi; k++) {
    const r = k * h;
    const pondere = k === 0 || k === pasi ? 0.5 : 1;
    suma += pondere * forma(r) * (r / (s * s)) * Math.exp(-((d - r) ** 2) / (2 * s * s)) * besselI0Scalat((d * r) / (s * s));
  }
  return suma * h;
}

/** Cât de departe ajunge lumina dincolo de formă, în deviații: după 3, acoperirea e sub 0,005. */
export const DEVIATII_DINCOLO = 3;

/**
 * Opririle degradeului pentru o formă estompată: `[procent din raza casetei, acoperire]`, la fiecare
 * 1/`n` din rază. Caseta are raza `razaMax + DEVIATII_DINCOLO · s`; ultima oprire e 0.
 */
export function opririEstompate(forma: (r: number) => number, razaMax: number, s: number, n = 24): Array<[number, number]> {
  const H = razaMax + DEVIATII_DINCOLO * s;
  const opriri: Array<[number, number]> = [];
  for (let j = 0; j <= n; j++) {
    const procent = Math.round((j / n) * 100 * 1000) / 1000;
    opriri.push([procent, j === n ? 0 : Math.max(0, Math.min(1, acoperireEstompata(forma, razaMax, s, (j / n) * H)))]);
  }
  return opriri;
}
