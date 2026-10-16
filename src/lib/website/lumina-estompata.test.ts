import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEVIATII_DINCOLO, acoperireEstompata, opririEstompate } from "./lumina-estompata";

/*
  Profilul socotit trebuie să fie cel pe care îl desena Chrome cu `filter: blur()`. Valorile de mai jos
  sunt MĂSURATE (16.10.2026): forma desenată în negru pe alb, fără opacitate, rândul de pixeli prin centru
  citit ca acoperire = 1 - valoare/255. Petele sunt cele din `hero-backgrounds.tsx`, la 1440 px.
*/

/** Forma unei pete din primul ecran: `radial-gradient(circle, 1 0%, 0.38 48%, transparent 72%)`, tăiată rotund la latura/2. */
function formaPetei(marime: number) {
  const r100 = (marime / 2) * Math.SQRT2;
  return (r: number) => {
    const p = r / r100;
    if (p <= 0.48) return 1 + (0.38 - 1) * (p / 0.48);
    if (p <= 0.72) return 0.38 * (1 - (p - 0.48) / 0.24);
    return 0;
  };
}

const MASURATE: Array<{ marime: number; blur: number; centru: number; la25: number; la50: number }> = [
  /* `la25`/`la50`: acoperirea la 25% și 50% din raza formei + 3,5 deviații (caseta măsurării). */
  { marime: 640, blur: 84, centru: 0.694, la25: 0.475, la50: 0.122 },
  { marime: 560, blur: 74, centru: 0.694, la25: 0.475, la50: 0.122 },
  { marime: 480, blur: 66, centru: 0.682, la25: 0.463, la50: 0.114 },
  { marime: 520, blur: 78, centru: 0.651, la25: 0.435, la50: 0.098 },
  { marime: 420, blur: 62, centru: 0.659, la25: 0.435, la50: 0.098 },
  { marime: 380, blur: 56, centru: 0.659, la25: 0.435, la50: 0.102 },
];

test("profilul socotit e cel pe care îl desena Chrome cu filter: blur, pe toate cele șase pete", () => {
  for (const m of MASURATE) {
    const raza = m.marime / 2;
    const H = Math.ceil(raza + 3.5 * m.blur);
    const f = formaPetei(m.marime);
    const ce = `pata ${m.marime}/${m.blur}`;
    assert.ok(Math.abs(acoperireEstompata(f, raza, m.blur, 0) - m.centru) <= 0.01, `${ce}: centrul`);
    assert.ok(Math.abs(acoperireEstompata(f, raza, m.blur, 0.25 * H) - m.la25) <= 0.01, `${ce}: la 25%`);
    assert.ok(Math.abs(acoperireEstompata(f, raza, m.blur, 0.5 * H) - m.la50) <= 0.01, `${ce}: la 50%`);
  }
});

test("discul plin: centrul e exact 1 - e^(-R²/2s²), iar dincolo de 3 deviații lumina e stinsă", () => {
  for (const [R, s] of [[30, 10], [26, 10], [150, 50]]) {
    const centru = acoperireEstompata(() => 1, R, s, 0);
    assert.ok(Math.abs(centru - (1 - Math.exp(-(R * R) / (2 * s * s)))) < 1e-3, `disc ${R}/${s}: centrul ${centru}`);
    assert.ok(acoperireEstompata(() => 1, R, s, R + DEVIATII_DINCOLO * s) < 0.005, `disc ${R}/${s}: marginea casetei`);
  }
});

test("opririle: de la centru la 0, descrescătoare, procentele din 1/24 în 1/24", () => {
  const o = opririEstompate(formaPetei(640), 320, 84);
  assert.equal(o.length, 25);
  assert.equal(o[0][0], 0);
  assert.equal(o[24][0], 100);
  assert.equal(o[24][1], 0);
  for (let i = 1; i < o.length; i++) assert.ok(o[i][1] <= o[i - 1][1] + 1e-9, `oprirea ${i} crește`);
});
