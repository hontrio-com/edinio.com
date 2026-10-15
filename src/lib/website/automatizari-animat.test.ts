import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUCLA_S,
  CARD,
  CELULE,
  ETICHETA,
  MOMENTE_DISCRETE,
  PISTE,
  PORNIRE_S,
  SCARA_GRILA,
  STATIC_S,
  ZIMTI,
  stareaDiscreta,
} from "./automatizari-animat";

/*
  ═══ ORACOLUL: socoteala machetei, copiată aproape literă cu literă ═══

  Macheta clientului (`edinio-automatizari-preview.html`, „varianta 6”, 14.10.2026) scria totul din
  JavaScript, la fiecare cadru (`render(T)`), cu translațiile cardurilor în pixeli (`k` = o sutime din
  lățime). Aici aceeași funcție, cu `k = 1`, deci în unitățile scenei. Proba cere ca fiecare pistă și
  fiecare text să cadă pe valorile ei, la 120 de puncte pe secundă.
*/
function macheta(t: number, n = 0) {
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const pr = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
  const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eo = (x: number) => 1 - Math.pow(1 - x, 3);
  const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
  const spr = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(8 * x));
  const S0 = 1.0, SD = 4.0, OUT = 19.0;
  const CELL = [[5, 15], [51.5, 15], [5, 43.95], [51.5, 43.95]], SM = 43.5 / 90;
  const k = 1;

  /* Macheta descompunea timpul ei (`T`) in bucla `n` si secunda `t` din bucla, cu un modulo care
     adauga zgomot de virgula mobila exact pe praguri (4,15 iese 4,1499...). Aici le primeste deja
     descompuse, cum le da si ceasul animatiilor (`acum()` in `useAnimatieInBucla`). */
  const fo = 1 - pr(t, OUT, OUT + 0.5), fi = eo(pr(t, 0, 0.5));
  const no = 10481 + (n % 400);
  const carduri = [0, 1, 2, 3].map((i) => {
    const s = S0 + i * SD, e = eio(pr(t, s, s + 0.55)) * (1 - eio(pr(t, s + 3.3, s + 3.85))), cl = CELL[i];
    const u = t - (s + 0.55), run = u >= 0 && u < 2.6, dn = u >= 2.6 && fo > 0.5;
    return {
      x: lerp(cl[0] - 5, 0, e) * k, y: lerp(cl[1] - 15, 0, e) * k, scara: lerp(SM, 1, e), z: e > 0 ? 10 : 1, opacitate: fi * fo,
      act: e > 0.02, run, on: dn, text: dn ? "Gata" : run ? "Se generează" : "În așteptare", u,
    };
  });
  const fin = t >= S0 + 4 * SD - 0.3 && fo > 0.5;
  const chip = (q: number) => [clamp(q * 2.5), (1 - eo(q)) * 18];

  let u = carduri[0].u;
  const q = eo(pr(u, 0, 0.6));
  const factura = [(1 - q) * 260, clamp(q * 2)];
  const blocuri = [0, 1].map((j) => { const w = pr(u, 0.35 + j * 0.25, 0.75 + j * 0.25); return [w, (1 - eo(w)) * 10]; });
  const randuri = [0, 1].map((j) => { const w = pr(u, 0.9 + j * 0.25, 1.2 + j * 0.25); return [w, (1 - eo(w)) * -14]; });
  const total = pr(u, 1.4, 1.7);
  const totalText = (189 * eio(pr(u, 1.4, 1.9))).toFixed(2);
  const bule0 = [0, 1, 2, 3].map((j) => chip(pr(u, 0.3 + j * 0.55, 0.65 + j * 0.55)));

  u = carduri[1].u;
  const f = pr(u, 0.25, 2.1), stp = Math.floor(f * 46) / 46, fl = lerp(stp, f, 0.35), sc = 568 / 614;
  const eticheta = (fl - 1) * 445 * sc + 16 * fl;
  const feeding = f > 0 && f < 1, lit = feeding ? Math.floor(u * 8) % 2 === 1 : u >= 2.1;
  const imprimanta = feeding ? Math.sin(u * 90) * 0.8 : 0;
  const bule1 = [0, 1].map((j) => chip(pr(u, 2.0 + j * 0.35, 2.35 + j * 0.35)));

  u = carduri[2].u;
  const nq = eio(pr(u, 0.3, 0.75));
  const randuriMail = Array.from({ length: 12 }, (_, j) => (j === 0 ? 0 : (j - 1 + nq) * 42));
  const galben = nq > 0 && nq < 1;
  const necitite = u >= 0.75 ? "3" : "2";
  const oq = eio(pr(u, 1.35, 1.75));
  const lista = 1 - oq, citit = [oq, (1 - oq) * 24], atasament = pr(u, 1.8, 2.1);

  u = carduri[3].u;
  const ty = u >= 0.2 && u < 1.1;
  const scrie = [ty ? 1 : 0, ty ? 0.6 + 0.4 * spr(pr(u, 0.2, 0.5)) : 1];
  const puncte = [0, 1, 2].map((j) => 0.35 + 0.65 * Math.max(0, Math.sin(u * 7 - j * 0.9)));
  const bq = pr(u, 1.1, 1.45);
  const mesaj = [clamp(bq * 3), 0.7 + 0.3 * spr(bq)];
  const bule3 = [0, 1].map((j) => chip(pr(u, 1.5 + j * 0.35, 1.85 + j * 0.35)));

  return {
    comanda: [1 + 0.04 * Math.sin(pr(t, 0.3, 0.8) * Math.PI), fi * fo],
    numar: (fin ? "Comanda #" : "Comandă nouă #") + no, procesata: fin, stare: fin ? "Procesată automat" : "Se procesează",
    carduri, factura, blocuri, randuri, total, totalText, bule0, eticheta, lit, imprimanta, bule1,
    randuriMail, galben, necitite, lista, citit, atasament, ty, scrie, puncte, mesaj, bule3,
  };
}

const pista = (tinta: string) => {
  const p = PISTE.find((x) => x.tinta === tinta);
  assert.ok(p, `lipsește pista ${tinta}`);
  return p;
};
const aproape = (a: number, b: number, eps: number, ce: string) => assert.ok(Math.abs(a - b) <= eps, `${ce}: ${a} în loc de ${b}`);
const TIMPI = Array.from({ length: BUCLA_S * 120 }, (_, i) => i / 120);

test("comanda de sus și cardurile: locul, scara, opacitatea, chenarul și ordinea, la fiecare 1/120 s", () => {
  for (const t of TIMPI) {
    const m = macheta(t);
    const [s, o] = pista("comanda").valori(t);
    aproape(s, m.comanda[0], 1e-9, `comanda.scara la ${t}`);
    aproape(o, m.comanda[1], 1e-9, `comanda.opacitate la ${t}`);
    const d = stareaDiscreta(t, 0);
    for (let i = 0; i < 4; i++) {
      const c = m.carduri[i];
      const [x, y, sc, op] = pista(`card-${i}`).valori(t);
      aproape(x, c.x, 1e-9, `card-${i}.x la ${t}`);
      aproape(y, c.y, 1e-9, `card-${i}.y la ${t}`);
      aproape(sc, c.scara, 1e-9, `card-${i}.scara la ${t}`);
      aproape(op, c.opacitate, 1e-9, `card-${i}.opacitate la ${t}`);
      assert.equal(pista(`chenar-${i}`).valori(t)[0] === 1, c.act, `chenarul cardului ${i} la ${t}`);
      assert.equal(pista(`umbra-${i}`).valori(t)[0] === 1, !c.act, `umbra cardului ${i} la ${t}`);
      assert.equal(d.deasupra[i], c.z === 10, `cardul ${i} deasupra la ${t}`);
      assert.equal(d.stari[i], c.text, `eticheta cardului ${i} la ${t}`);
      assert.equal(d.generare[i] && !d.gata[i], c.run, `„run” al cardului ${i} la ${t}`);
      assert.equal(d.gata[i], c.on, `„on” al cardului ${i} la ${t}`);
    }
    assert.equal(d.necitite, m.necitite, `necitite la ${t}`);
    assert.equal(d.procesata, m.procesata, `procesată la ${t}`);
  }
});

test("textele comenzii și numărul ei, pe mai multe bucle", () => {
  for (const iteratie of [0, 1, 7, 399, 400, 401]) {
    for (const t of TIMPI.filter((_, i) => i % 6 === 0)) {
      const m = macheta(t, iteratie);
      const d = stareaDiscreta(t, iteratie);
      assert.equal(d.comanda, m.numar, `numărul la ${t} în bucla ${iteratie}`);
      assert.equal(d.procesata, m.procesata, `procesată la ${t}`);
      assert.equal(d.stareComanda, m.stare, `starea comenzii la ${t}`);
      assert.equal(d.necitite, m.necitite, `necitite la ${t}`);
    }
  }
});

test("factura: pagina, blocurile, rândurile, totalul și bulele", () => {
  for (const t of TIMPI) {
    const m = macheta(t);
    const [y, o] = pista("factura").valori(t);
    aproape(y, m.factura[0], 1e-9, `factura.y la ${t}`);
    aproape(o, m.factura[1], 1e-9, `factura.opacitate la ${t}`);
    for (let j = 0; j < 2; j++) {
      const [bo, by] = pista(`factura-bloc-${j}`).valori(t);
      aproape(bo, m.blocuri[j][0], 1e-9, `bloc ${j}.opacitate la ${t}`);
      aproape(by, m.blocuri[j][1], 1e-9, `bloc ${j}.y la ${t}`);
      const [ro, rx] = pista(`factura-rand-${j}`).valori(t);
      aproape(ro, m.randuri[j][0], 1e-9, `rând ${j}.opacitate la ${t}`);
      aproape(rx, m.randuri[j][1], 1e-9, `rând ${j}.x la ${t}`);
    }
    aproape(pista("factura-total").valori(t)[0], m.total, 1e-9, `total.opacitate la ${t}`);
    for (let j = 0; j < 4; j++) {
      const [bo, bx] = pista(`bula-0-${j}`).valori(t);
      aproape(bo, m.bule0[j][0], 1e-9, `bula 0-${j}.opacitate la ${t}`);
      aproape(bx, m.bule0[j][1], 1e-9, `bula 0-${j}.x la ${t}`);
    }
  }
});

test("totalul facturii: pe grila de 60 pe secundă, valoarea machetei din clipa grilei", () => {
  /* Macheta îl scria la fiecare cadru; aici, de 60 de ori pe secundă cât crește (nota 4 din fișier). */
  const de = 1 + 0.55 + 1.4;
  for (let k = 0; k <= 30; k++) {
    const t = de + k / 60;
    assert.equal(stareaDiscreta(t, 0).total, macheta(t).totalText, `pasul ${k}`);
    assert.equal(stareaDiscreta(t + 1 / 120, 0).total, macheta(t).totalText, `între pași, ${k}`);
    assert.ok(MOMENTE_DISCRETE.some((x) => Math.abs(x - t) < 1e-9), `clipa pasului ${k} e programată`);
  }
  assert.equal(stareaDiscreta(0, 0).total, "0.00");
  assert.equal(stareaDiscreta(STATIC_S, 0).total, "189.00");
});

test("AWB-ul: eticheta în trepte, imprimanta care vibrează, ledul, bulele", () => {
  for (const t of TIMPI) {
    const m = macheta(t);
    aproape(pista("eticheta").valori(t)[0], m.eticheta, 1e-9, `eticheta.y la ${t}`);
    aproape(pista("imprimanta").valori(t)[0], m.imprimanta, 1e-9, `imprimanta.x la ${t}`);
    assert.equal(pista("led").valori(t)[0] === 1, m.lit, `ledul la ${t}`);
    for (let j = 0; j < 2; j++) {
      const [bo, bx] = pista(`bula-1-${j}`).valori(t);
      aproape(bo, m.bule1[j][0], 1e-9, `bula 1-${j}.opacitate la ${t}`);
      aproape(bx, m.bule1[j][1], 1e-9, `bula 1-${j}.x la ${t}`);
    }
  }
});

test("Gmail: e-mailul nou, rândurile vechi, fondul galben, deschiderea, atașamentul", () => {
  for (const t of TIMPI) {
    const m = macheta(t);
    const nou = pista("mail-nou").valori(t)[0];
    const vechi = pista("mail-vechi").valori(t)[0];
    /* Macheta muta fiecare rând vechi; aici se mută containerul lor, iar rândul j stă la (j-1)*42 în el. */
    for (let j = 1; j < 12; j++) aproape(vechi + (j - 1) * 42, m.randuriMail[j], 1e-9, `rândul ${j}.y la ${t}`);
    aproape(nou, m.randuriMail[1] / 42, 1e-9, `rândul nou.opacitate la ${t}`);
    assert.equal(pista("mail-nou-fond").valori(t)[0] === 1, m.galben, `fondul galben la ${t}`);
    aproape(pista("mail-lista").valori(t)[0], m.lista, 1e-9, `lista la ${t}`);
    const [co, cx] = pista("mail-citit").valori(t);
    aproape(co, m.citit[0], 1e-9, `citit.opacitate la ${t}`);
    aproape(cx, m.citit[1], 1e-9, `citit.x la ${t}`);
    aproape(pista("mail-atasament").valori(t)[0], m.atasament, 1e-9, `atașamentul la ${t}`);
  }
});

test("SMS: bula „scrie...” cu punctele ei, mesajul, bulele", () => {
  for (const t of TIMPI) {
    const m = macheta(t);
    const [so, ss] = pista("sms-scrie").valori(t);
    aproape(so, m.scrie[0], 1e-9, `scrie.opacitate la ${t}`);
    aproape(ss, m.scrie[1], 1e-9, `scrie.scara la ${t}`);
    /* Punctele pulsează numai cât se vede bula (nota 5 din fișier); altfel bula le ascunde oricum. */
    if (m.ty) for (let j = 0; j < 3; j++) aproape(pista(`sms-punct-${j}`).valori(t)[0], m.puncte[j], 1e-9, `punctul ${j} la ${t}`);
    const [mo, ms] = pista("sms-mesaj").valori(t);
    aproape(mo, m.mesaj[0], 1e-9, `mesaj.opacitate la ${t}`);
    aproape(ms, m.mesaj[1], 1e-9, `mesaj.scara la ${t}`);
    for (let j = 0; j < 2; j++) {
      const [bo, bx] = pista(`bula-3-${j}`).valori(t);
      aproape(bo, m.bule3[j][0], 1e-9, `bula 3-${j}.opacitate la ${t}`);
      aproape(bx, m.bule3[j][1], 1e-9, `bula 3-${j}.x la ${t}`);
    }
  }
});

test("clipa din HTML și cadrul static: grila intrată, nimic generat; apoi toate generate", () => {
  const d0 = stareaDiscreta(PORNIRE_S, 0);
  assert.deepEqual(d0.stari, ["În așteptare", "În așteptare", "În așteptare", "În așteptare"]);
  assert.ok(d0.deasupra.every((x) => !x), "niciun card mărit");
  assert.equal(pista("card-0").valori(PORNIRE_S)[3], 1, "intrarea s-a încheiat");
  const ds = stareaDiscreta(STATIC_S, 0);
  assert.deepEqual(ds.stari, ["Gata", "Gata", "Gata", "Gata"]);
  assert.equal(ds.stareComanda, "Procesată automat");
  assert.ok(ds.deasupra.every((x) => !x), "în cadrul static toate stau în grilă");
});

test("geometria grilei e a machetei", () => {
  assert.deepEqual(CARD, { x: 5, y: 15, latime: 90, inaltime: 56 });
  assert.deepEqual(CELULE, [[5, 15], [51.5, 15], [5, 43.95], [51.5, 43.95]]);
  assert.equal(SCARA_GRILA, 43.5 / 90);
});

test("codul de bare și codul 2D: aceeași secvență ca în machetă (sămânța 7)", () => {
  let sd = 7;
  const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
  const bare: string[] = [];
  let x = 0;
  while (x < 100) {
    const w = 0.28 + Math.floor(rnd() * 4) * 0.3;
    bare.push(`${x.toFixed(2)}|${w.toFixed(2)}`);
    x += w + 0.3 + Math.floor(rnd() * 3) * 0.3;
  }
  assert.deepEqual(ETICHETA.bare.map(([a, b]) => `${a.toFixed(2)}|${b.toFixed(2)}`), bare);
  const patrate: string[] = [];
  for (let r = 0; r < 26; r++) for (let c = 0; c < 26; c++) {
    const on = c === 0 || r === 25 || (r === 0 && c % 2 === 0) || (c === 25 && r % 2 === 1) || (r > 0 && r < 25 && c > 0 && c < 25 && rnd() < 0.5);
    if (on) patrate.push(`${c},${r}`);
  }
  assert.deepEqual(ETICHETA.patrate.map(([c, r]) => `${c},${r}`), patrate);
  let zimti = "M0 0H568V5";
  for (let z = 568; z >= 0; z -= 8) zimti += `L${z} ${z % 16 ? 11 : 5}`;
  assert.equal(ZIMTI, `${zimti}Z`);
});

test("imaginile cardului există, iar cele vechi nu mai sunt cerute de nimeni", () => {
  const sursa = readFileSync(join(process.cwd(), "src/components/website/sections/AutomatizariAnimat.tsx"), "utf8");
  const cai = [...sursa.matchAll(/"(\/[a-z0-9/_.-]+\.(?:svg|webp))"/g)].map((m) => m[1]);
  assert.ok(cai.length >= 6, `${cai.length} imagini găsite în componentă`);
  for (const c of cai) assert.ok(existsSync(join(process.cwd(), "public", c)), `lipsește ${c}`);
  for (const v of ["720", "1080", "1440"]) assert.ok(!existsSync(join(process.cwd(), "public/features", `automatizari-${v}.webp`)), `automatizari-${v}.webp a rămas`);
});
