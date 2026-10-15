import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUCLA_S,
  COMENZI,
  INALTIMI_IMPLICITE,
  MOMENTE_DISCRETE,
  NOTIFICARI,
  PISTE,
  PORNIRE_S,
  STATIC_S,
  pisteCuInaltimi,
  stareaDiscreta,
  sumaComenzii,
  totalScris,
} from "./vanzari-animat";
import type { Pista } from "./animatie-bucla";

/*
  ═══ ORACOLUL: socoteala machetei, copiată aproape literă cu literă ═══

  Macheta clientului (`edinio-vanzari-preview.html`, „varianta 5”, 15.10.2026) scria totul din
  JavaScript, la fiecare cadru (`render(T)`), în pixeli (`k` = o sutime din lățime). Aici aceeași
  funcție, cu `k = 1`, deci în unitățile scenei, și cu secunda din buclă primită direct (modulo-ul
  machetei adaugă zgomot de virgulă mobilă exact pe praguri). `NH` sunt înălțimile notificărilor pe
  care macheta le măsura în pagină; proba le dă aceleași ca pistelor.
*/
function macheta(t: number, NH: readonly number[]) {
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const pr = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
  const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eo = (x: number) => 1 - Math.pow(1 - x, 3);
  const spr = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(8 * x));
  const NT = [1.0, 4.0, 7.0];
  const OR: Array<[number, number, number]> = [[2.3, 149, 0], [3.0, 87, 0], [5.3, 280.8, 1], [6.0, 132.3, 1], [8.3, 212.5, 2], [9.0, 96.9, 0]];
  const OUT = 11.6;
  const k = 1;
  const fmt = (v: number) => {
    const s = v.toFixed(2).replace(".", ",").split(",");
    return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1] + " lei";
  };
  const fo = 1 - pr(t, OUT, OUT + 0.6), fi = eo(pr(t, 0, 0.5));
  const opacitate = fi * fo;
  const notificari = NT.map((t0, i) => {
    const q = pr(t, t0, t0 + 0.5);
    let y = 0;
    for (let j = i + 1; j < NT.length; j++) y += eio(pr(t, NT[j], NT[j] + 0.45)) * (NH[j] || 10);
    return { opacitate: clamp(q * 2.2) * fo, y: (y + (1 - spr(q)) * -4) * k, scara: 0.9 + 0.1 * spr(q) };
  });
  let vib = 0;
  NT.forEach((t0) => {
    const v = pr(t, t0, t0 + 0.3);
    if (v > 0 && v < 1) vib = v;
  });
  const tremur = vib ? Math.sin(vib * Math.PI * 8) * 0.22 * k * (1 - vib) : 0;
  let tot = 0;
  const c = [0, 0, 0];
  const comenzi = OR.map((o, i) => {
    const q = pr(t, o[0], o[0] + 0.4);
    let y = 0;
    for (let j = i + 1; j < OR.length; j++) y += eio(pr(t, OR[j][0], OR[j][0] + 0.4)) * 6.9;
    if (t >= o[0]) {
      tot += o[1] * eio(pr(t, o[0], o[0] + 0.6));
      c[o[2]]++;
    }
    const h = pr(t, o[0], o[0] + 1.6);
    return { opacitate: clamp(q * 2.5) * fo, x: (1 - eo(q)) * -2 * k, y: y * k, fond: h > 0 && h < 1 ? 1 - h : 0 };
  });
  return { opacitate, tremur, notificari, comenzi, total: fmt(tot), surse: c };
}

const piste = (lista: readonly Pista[]) => (tinta: string) => {
  const p = lista.find((x) => x.tinta === tinta);
  assert.ok(p, `lipsește pista ${tinta}`);
  return p;
};
const aproape = (a: number, b: number, eps: number, ce: string) => assert.ok(Math.abs(a - b) <= eps, `${ce}: ${a} în loc de ${b}`);
const TIMPI = Array.from({ length: BUCLA_S * 120 }, (_, i) => i / 120);

test("telefonul și panoul: intrarea, tremurul la fiecare notificare, stingerea", () => {
  const p = piste(PISTE);
  for (const t of TIMPI) {
    const m = macheta(t, INALTIMI_IMPLICITE);
    const [x, o] = p("telefon").valori(t);
    aproape(x, m.tremur, 1e-9, `tremurul la ${t}`);
    aproape(o, m.opacitate, 1e-9, `telefonul.opacitate la ${t}`);
    aproape(p("panou").valori(t)[0], m.opacitate, 1e-9, `panoul.opacitate la ${t}`);
  }
});

test("notificările: locul, scara, opacitatea, cu înălțimile date (și cu altele decât cele implicite)", () => {
  for (const inaltimi of [INALTIMI_IMPLICITE, [7.3, 9.6, 7.3], [6.1, 7.4, 6.4]]) {
    const p = piste(pisteCuInaltimi(inaltimi));
    for (const t of TIMPI) {
      const m = macheta(t, inaltimi);
      for (let i = 0; i < NOTIFICARI.length; i++) {
        aproape(p(`notificare-loc-${i}`).valori(t)[0], m.notificari[i].y, 1e-9, `notificarea ${i}.y la ${t} (${inaltimi})`);
        const [o, s] = p(`notificare-${i}`).valori(t);
        aproape(o, m.notificari[i].opacitate, 1e-9, `notificarea ${i}.opacitate la ${t}`);
        aproape(s, m.notificari[i].scara, 1e-9, `notificarea ${i}.scara la ${t}`);
      }
    }
  }
});

test("comenzile: intrarea din stânga, coborârea la fiecare comandă nouă, fondul verde care se stinge", () => {
  const p = piste(PISTE);
  for (const t of TIMPI) {
    const m = macheta(t, INALTIMI_IMPLICITE);
    for (let i = 0; i < COMENZI.length; i++) {
      const [x, y, o] = p(`comanda-${i}`).valori(t);
      aproape(x, m.comenzi[i].x, 1e-9, `comanda ${i}.x la ${t}`);
      aproape(y, m.comenzi[i].y, 1e-9, `comanda ${i}.y la ${t}`);
      aproape(o, m.comenzi[i].opacitate, 1e-9, `comanda ${i}.opacitate la ${t}`);
      aproape(p(`comanda-fond-${i}`).valori(t)[0], m.comenzi[i].fond, 1e-9, `fondul comenzii ${i} la ${t}`);
    }
  }
});

test("numărătorile pe surse, la fiecare 1/120 s, scrise la intrarea fiecărei comenzi", () => {
  for (const t of TIMPI) {
    const d = stareaDiscreta(t);
    assert.deepEqual(d.surse, macheta(t, INALTIMI_IMPLICITE).surse, `sursele la ${t}`);
  }
  for (const c of COMENZI) assert.ok(MOMENTE_DISCRETE.includes(c.la), `intrarea comenzii de la ${c.la} e programată`);
});

/** Textul pe care îl arată contorul cu role la `t`, citit din pistele lui (cum le desenează browserul). */
function textulContorului(lista: readonly Pista[], t: number): string {
  const p = piste(lista);
  const n = p("total-loc").valori(t)[0];
  const cifre = [0, 1, 2, 3, 4].map((k) => p(`total-banda-${k}`).valori(t)[0]);
  const aprinse = [p("total-cifra-0").valori(t)[0] === 1, p("total-cifra-1").valori(t)[0] === 1, true];
  /* Rândul se mută cu 3 - n cifre: din cele trei cifre întregi se văd ultimele n, și numai cele aprinse. */
  assert.deepEqual(aprinse.map((a, k) => a === k >= 3 - n), [true, true, true], `cifrele aprinse nu se potrivesc cu locul rândului la ${t}`);
  return `${cifre.slice(3 - n, 3).join("")},${cifre[3]}${cifre[4]} lei`;
}

test("totalul: contorul cu role arată textul machetei, la fiecare 1/120 s (pe grila de 60 a creșterii)", () => {
  for (const t of TIMPI) {
    const tg = COMENZI.reduce((x, c) => (t >= c.la && t < c.la + 0.6 ? c.la + Math.floor((t - c.la) * 60 + 1e-9) / 60 : x), t);
    const asteptat = macheta(tg, INALTIMI_IMPLICITE).total;
    assert.equal(textulContorului(PISTE, t), asteptat, `contorul la ${t}`);
    assert.equal(stareaDiscreta(t).total, asteptat, `totalul socotit la ${t}`);
  }
  for (const c of COMENZI) {
    for (let k = 0; k <= 36; k++) {
      const t = c.la + k / 60;
      assert.equal(textulContorului(PISTE, t), macheta(t, INALTIMI_IMPLICITE).total, `pe grilă, la ${t}`);
    }
  }
  /* În afara creșterilor, totalul e chiar al machetei, la orice clipă. */
  for (const t of TIMPI.filter((x) => !COMENZI.some((c) => x >= c.la && x < c.la + 0.6))) {
    assert.equal(stareaDiscreta(t).total, macheta(t, INALTIMI_IMPLICITE).total, `totalul la ${t}`);
  }
});

test("clipa din HTML și cadrul static", () => {
  assert.equal(stareaDiscreta(PORNIRE_S).total, "0,00 lei");
  assert.deepEqual(stareaDiscreta(PORNIRE_S).surse, [0, 0, 0]);
  const s = stareaDiscreta(STATIC_S);
  assert.equal(s.total, "958,50 lei");
  assert.deepEqual(s.surse, [3, 2, 1]);
  const p = piste(PISTE);
  assert.ok(NOTIFICARI.every((_, i) => p(`notificare-${i}`).valori(PORNIRE_S)[0] === 0), "în HTML nicio notificare");
  assert.ok(COMENZI.every((_, i) => p(`comanda-${i}`).valori(PORNIRE_S)[2] === 0), "în HTML nicio comandă");
  assert.ok(NOTIFICARI.every((_, i) => p(`notificare-${i}`).valori(STATIC_S)[0] === 1), "în cadrul static toate notificările");
});

test("textele scrise ca în machetă", () => {
  assert.equal(sumaComenzii(149), "149,00 lei");
  assert.equal(sumaComenzii(280.8), "280,80 lei");
  assert.equal(totalScris(958.5), "958,50 lei");
  assert.equal(totalScris(1157.584), "1.157,58 lei");
  assert.equal(totalScris(0), "0,00 lei");
});

test("imaginile cardului există, iar cele vechi nu mai sunt cerute de nimeni", () => {
  const sursa = readFileSync(join(process.cwd(), "src/components/website/sections/VanzariAnimat.tsx"), "utf8");
  const cai = [...sursa.matchAll(/"(\/[a-z0-9/_.-]+\.(?:svg|webp))"/g)].map((m) => m[1]);
  for (const c of [...cai, ...COMENZI.map((c) => `/features/vanzari-animat/${c.avatar}.webp`)]) {
    assert.ok(existsSync(join(process.cwd(), "public", c)), `lipsește ${c}`);
  }
  for (const v of ["720", "1080", "1440"]) assert.ok(!existsSync(join(process.cwd(), "public/features", `vanzari-${v}.webp`)), `vanzari-${v}.webp a rămas`);
});

test("contorul se scrie în CSS cum îl citește proba: banda pe zecimi, rândul pe cifre întregi", () => {
  const p = piste(PISTE);
  assert.equal(p("total-banda-0").scrie([7]).transform, "translateY(-70%)");
  assert.equal(p("total-banda-4").scrie([0]).transform, "translateY(0%)");
  assert.equal(p("total-loc").scrie([1]).transform, "translateX(-200%)");
  assert.equal(p("total-loc").scrie([3]).transform, "translateX(0%)");
  assert.equal(p("total-cifra-0").scrie([0]).opacity, 0);
  for (const nume of ["total-loc", "total-cifra-0", "total-cifra-1", ...[0, 1, 2, 3, 4].map((k) => `total-banda-${k}`)]) {
    assert.equal(p(nume).trepte, true, `${nume} sare, nu trece`);
  }
});

test("⚠ purtătorul rândului e lat EXACT cât fereastra unei cifre (altfel mutarea pe cifre nu se nimerește)", () => {
  /* Lățimile sunt ale textului machetei, măsurate în Inter 750 cu cifre tabulare: cifra 0,626em. */
  const css = readFileSync(join(process.cwd(), "src/app/vanzari-animat.css"), "utf8");
  const latime = (sel: string) => {
    const inceput = css.indexOf(`\n${sel} {`);
    assert.ok(inceput >= 0, `lipsește regula ${sel}`);
    const regula = css.slice(inceput, css.indexOf("}", inceput));
    const rand = regula.split("\n").map((r) => r.trim()).find((r) => r.startsWith("width: "));
    assert.ok(rand, `lipsește lățimea lui ${sel}`);
    return rand.slice("width: ".length, -1);
  };
  assert.equal(latime(".evz-tvc"), latime(".evz-cf"));
  assert.equal(latime(".evz-cf"), "0.626em");
});
