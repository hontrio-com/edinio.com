import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROVIDER_LOGOS } from "./logos";
import {
  BUCLA_S,
  INTEGRARI,
  MIJLOC,
  MOMENTE_DISCRETE,
  PASI,
  PESTE,
  PISTE,
  PORNIRE_S,
  RAZA,
  SIGLE,
  STATIC_S,
  inceputPas,
  stareaDiscreta,
} from "./integrari-animat";

/*
  ═══ ORACOLUL: socoteala machetei, copiată aproape literă cu literă ═══

  Macheta clientului (`edinio-integrari-preview.html`, 14.10.2026) scria totul din JavaScript, la
  fiecare cadru, în pixeli (`k` = o sutime din lățime). Aici aceeași funcție, cu `k = 1`, deci în
  unitățile scenei. Proba cere ca fiecare pistă și fiecare text să cadă pe valorile ei, la 120 de
  puncte pe secundă: traducerea pe compozitor n-a schimbat nicio mișcare.
*/
function macheta(t: number) {
  const LOOP = 20.6;
  const OUT = 19.4;
  const M0 = 6.4;
  const C0 = 7.6;
  const T0 = 8.9;
  const ST = 1.6;
  const CL = [1.4, 2.6, 3.8, 5.0];
  const ON = CL.map((c) => c + 0.4);
  const CUR: Array<[number, string]> = [
    [0, "a"], [0.6, "a"], [1.33, "s0"], [1.6, "s0"], [2.53, "s1"], [2.8, "s1"], [3.73, "s2"], [4.0, "s2"],
    [4.93, "s3"], [5.2, "s3"], [6.0, "b"], [LOOP, "b"],
  ];
  const DONE = ["FAN Courier · AWB generat automat", "NETOPIA · card VISA •••• 4821", "SmartBill · e-Factura trimisă", "eMAG · stoc actualizat"];
  const SEQ = [1, 0, 2, 3];
  const G: Record<string, [number, number]> = { a: [60, 76], b: [68, 80] };
  for (let i = 0; i < 4; i++) G["s" + i] = [85, 28 + i * 9.2];
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const pr = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
  const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eo = (x: number) => 1 - Math.pow(1 - x, 3);
  const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
  const spr = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(8 * x));

  const pin = eo(pr(t, 0, 0.6));
  const fo = 1 - pr(t, OUT, OUT + 0.6);
  const tf = pr(t, M0, M0 + 0.4);
  const mw = eio(pr(t, M0 + 0.2, M0 + 1.2));
  const randuri = CL.map((c, i) => {
    const o = ON[i];
    const load = t >= c && t < o;
    const isOn = t >= o;
    return {
      buton: [(isOn ? spr(pr(t, o, o + 0.5)) : 0) * 2.3, load ? 0.92 : 1],
      verde: pr(t, o, o + 0.2),
      rotita: load ? 1 : 0,
      stare: isOn ? "Conectat" : load ? "Se conectează" : "Inactiv",
      conectat: isOn,
      punct: isOn ? spr(pr(t, o, o + 0.5)) : 0,
    };
  });
  const active = randuri.filter((r) => r.conectat).length;
  const cq = pr(t, C0, C0 + 0.7);
  const linii: number[][] = [];
  const pulsuri: Array<{ scara: number; inel: number }> = [];
  const pasi: Array<{ gata: boolean; text: string; bifa: number; valoare: number[] }> = [];
  let pachet: number[] | null = null;
  SEQ.forEach((ri, j) => {
    const a = T0 + j * ST;
    linii[ri] = [1 - eio(pr(t, a, a + 0.35)), fo];
    const pq = pr(t, a + 0.1, a + 0.55);
    if (pq > 0 && pq < 1) pachet = [lerp(30, 14, eio(pq)), 28 + ri * 9.2];
    const lp = pr(t, a + 0.55, a + 0.95);
    pulsuri[ri] = { scara: 1 + 0.12 * Math.sin(lp * Math.PI), inel: lp > 0 && lp < 1 ? 0.35 * (1 - lp) : 0 };
    const dn = t >= a + 0.65;
    const eq = pr(t, a + 0.65, a + 1.05);
    pasi[ri] = { gata: dn, text: dn ? DONE[ri] : "În așteptare", bifa: dn ? 0.7 + 0.3 * spr(pr(t, a + 0.65, a + 1.1)) : 1, valoare: [eq, (1 - eo(eq)) * 1.2] };
  });
  const fz = T0 + 3 * ST + 1.1;
  const fin = t >= fz && fo > 0.5;
  const bq = pr(t, fz + 0.3, fz + 0.8);
  let i = 0;
  while (i < CUR.length - 2 && t >= CUR[i + 1][0]) i++;
  const [c0, c1] = [CUR[i], CUR[i + 1]];
  const cm = eio(pr(t, c0[0], c1[0]));
  const p0 = G[c0[1]];
  const p1 = G[c1[1]];
  let apasat = 0;
  let clic = -1;
  CL.forEach((c) => {
    const d = t - c;
    if (d > -0.08 && d < 0.12) apasat = 1;
    if (d >= 0 && d < 0.45) clic = d / 0.45;
  });
  return {
    panou: { opacitate: pin * fo, y: (1 - pin) * 2, stanga: lerp(9, 4, mw), latime: lerp(82, 13.4, mw), semn: mw * 0.7, texte: 1 - tf },
    randuri,
    contor: `${active} ${active === 1 ? "activă" : "active"}`,
    contorVerde: active > 0,
    comanda: [clamp(cq * 2) * fo, (1 - eo(cq)) * 5],
    fundal: clamp(cq * 2) * fo,
    linii,
    pachet,
    pulsuri,
    pasi,
    eticheta: { aprinsa: fin, text: fin ? "Procesată" : "Comandă nouă", scara: fin ? 0.85 + 0.15 * spr(pr(t, fz, fz + 0.5)) : 1 },
    insigna: [clamp(bq * 3) * fo, (1 - spr(bq)) * 1.4],
    cursor: {
      x: lerp(p0[0], p1[0], cm),
      y: lerp(p0[1], p1[1], cm),
      scara: apasat ? 0.86 : 1,
      opacitate: clamp(Math.min((t - 0.5) * 3, (5.9 - t) * 3)),
      mana: (cm > 0.55 ? c1 : c0)[1].length > 1,
    },
    clic: [clic < 0 ? 0 : 1 - clic, clic < 0 ? 0.4 : 0.4 + clic * 1.2],
  };
}

const pista = (tinta: string) => {
  const p = PISTE.find((x) => x.tinta === tinta);
  assert.ok(p, `lipsește pista ${tinta}`);
  return p;
};
const v = (tinta: string, t: number) => pista(tinta).valori(t);
const aproape = (a: number, b: number, eticheta: string) => assert.ok(Math.abs(a - b) < 1e-9, `${eticheta}: ${a}, macheta ${b}`);

test("fiecare pistă cade pe valorile machetei, la orice moment", () => {
  for (let k = 0; k < BUCLA_S * 120; k++) {
    const t = k / 120;
    const m = macheta(t);
    const la = (s: string) => `${s} la ${t.toFixed(3)}s`;

    aproape(v("panou", t)[0], m.panou.opacitate, la("panou: opacitate"));
    aproape(v("panou", t)[1], m.panou.y, la("panou: y"));
    /* Panoul care se strânge: capetele stau pe marginile machetei, mijlocul între ele. */
    const L = m.panou.stanga;
    const R = m.panou.stanga + m.panou.latime;
    for (const tinta of ["umbra-stanga", "corp-stanga"]) aproape(9 + v(tinta, t)[0], L, la(tinta));
    for (const tinta of ["umbra-dreapta", "corp-dreapta"]) aproape(91 + v(tinta, t)[0], R, la(tinta));
    for (const [tinta, peste] of [["umbra-mijloc", 0], ["corp-mijloc", PESTE]] as const) {
      const [x, s] = v(tinta, t);
      const stanga = 9 + RAZA - peste + x;
      aproape(stanga, L + RAZA - peste, la(`${tinta}: stânga`));
      aproape(stanga + s * MIJLOC, R - RAZA + peste, la(`${tinta}: dreapta`));
    }
    aproape(9 + v("continut", t)[0], L, la("conținut"));
    aproape(v("sigla-edinio", t)[0], m.panou.semn, la("semnul Edinio"));
    aproape(v("texte", t)[0], m.panou.texte, la("texte"));
    aproape(82 + v("contor-loc", t)[0], m.panou.latime, la("contor"));

    m.randuri.forEach((r, i) => {
      aproape(v(`comutator-${i}`, t)[0], r.verde, la(`comutator ${i}`));
      aproape(v(`buton-${i}`, t)[0], r.buton[0], la(`buton ${i}: x`));
      aproape(v(`buton-${i}`, t)[1], r.buton[1], la(`buton ${i}: apăsat`));
      aproape(v(`rotita-${i}`, t)[0], r.rotita, la(`rotiță ${i}`));
      if (r.rotita) aproape(v(`rotita-${i}`, t)[1] % 360, (t * 720) % 360, la(`rotiță ${i}: unghi`));
      aproape(v(`punct-${i}`, t)[0], r.punct, la(`bulină ${i}`));

      const p = m.pulsuri[i];
      aproape(v(`sigla-${i}`, t)[0], p.scara, la(`sigla ${i}: puls`));
      const [scaraInel, inelAprins] = v(`inel-${i}`, t);
      assert.equal(inelAprins, p.inel > 0 ? 1 : 0, la(`inel ${i}: aprins`));
      /* Inelul iese din casetă cu grosimea machetei: (6,6 + 0,7) × scară = 6,6 + 2 × grosime. */
      if (p.inel > 0) aproape((7.3 * scaraInel - 6.6) / 2, p.inel, la(`inel ${i}: grosime`));
      assert.equal(v(`umbra-sigla-${i}`, t)[0], p.inel > 0 ? 0 : 1, la(`umbra siglei ${i}`));

      const [deplasare, opacitate] = v(`linie-${i}`, t);
      const [dashoffset, fo] = m.linii[i];
      aproape(deplasare, 16 * dashoffset, la(`linie ${i}: cât a crescut`));
      aproape(opacitate, dashoffset < 1 ? fo : 0, la(`linie ${i}: opacitate`));

      const pas = m.pasi[i];
      aproape(v(`bifa-${i}`, t)[0], pas.bifa, la(`bifa ${i}`));
      aproape(v(`valoare-${i}`, t)[0], pas.valoare[0], la(`valoare ${i}: opacitate`));
      aproape(v(`valoare-${i}`, t)[1], pas.valoare[1], la(`valoare ${i}: x`));
    });

    const pachet = m.pachet as number[] | null;
    assert.equal(v("pachet", t)[0], pachet ? 1 : 0, la("pachet: vizibil"));
    if (pachet) {
      aproape(v("pachet-loc", t)[0], pachet[0], la("pachet: x"));
      aproape(v("pachet-loc", t)[1], pachet[1], la("pachet: y"));
    }
    aproape(v("comanda", t)[0], m.comanda[0], la("comanda: opacitate"));
    aproape(v("comanda", t)[1], m.comanda[1], la("comanda: x"));
    aproape(v("eticheta", t)[0], m.eticheta.scara, la("eticheta"));
    aproape(v("insigna", t)[0], m.insigna[0], la("insigna: opacitate"));
    aproape(v("insigna", t)[1], m.insigna[1], la("insigna: y"));

    aproape(v("cursor-loc", t)[0], m.cursor.x, la("cursor: x"));
    aproape(v("cursor-loc", t)[1], m.cursor.y, la("cursor: y"));
    aproape(v("cursor", t)[0], m.cursor.scara, la("cursor: apăsare"));
    aproape(v("cursor", t)[1], m.cursor.opacitate, la("cursor: opacitate"));
    assert.equal(v("cursor-mana", t)[0], m.cursor.mana ? 1 : 0, la("mâna"));
    assert.equal(v("cursor-sageata", t)[0], m.cursor.mana ? 0 : 1, la("săgeata"));
    aproape(v("clic", t)[0], m.clic[0], la("clic: opacitate"));
    aproape(v("clic", t)[1], m.clic[1], la("clic: scară"));
  }
});

test("textele și clasele sunt ale machetei, la orice moment", () => {
  for (let k = 0; k < BUCLA_S * 120; k++) {
    const t = k / 120;
    const m = macheta(t);
    const s = stareaDiscreta(t, 0);
    const la = `la ${t.toFixed(3)}s`;
    assert.deepEqual(s.stari, m.randuri.map((r) => r.stare), `stările ${la}`);
    assert.deepEqual(s.conectate, m.randuri.map((r) => r.conectat), `verdele stărilor ${la}`);
    assert.equal(`${s.active} ${s.cuvant}`, m.contor, `contorul ${la}`);
    assert.equal(s.active > 0, m.contorVerde, `bulina contorului ${la}`);
    assert.deepEqual(s.pasi, m.pasi.map((p) => p.gata), `pașii ${la}`);
    assert.deepEqual(s.textePasi, m.pasi.map((p) => p.text), `textele pașilor ${la}`);
    assert.equal(s.procesata, m.eticheta.aprinsa, `eticheta ${la}`);
    assert.equal(s.eticheta, m.eticheta.text, `textul etichetei ${la}`);
  }
  /* Numărul comenzii crește cu fiecare buclă, ca în machetă (`10483 + n % 400`). */
  assert.equal(stareaDiscreta(1, 0).numar, "#10483");
  assert.equal(stareaDiscreta(1, 1).numar, "#10484");
  assert.equal(stareaDiscreta(1, 400).numar, "#10483");
});

test("nicio schimbare de text nu cade între două clipe programate", () => {
  const stare = (t: number) => JSON.stringify(stareaDiscreta(t, 0));
  let anterior = stare(0);
  for (let ms = 1; ms < BUCLA_S * 1000; ms++) {
    const t = ms / 1000;
    const acum = stare(t);
    if (acum !== anterior) {
      const programata = MOMENTE_DISCRETE.some((m) => m > t - 0.001 - 1e-9 && m <= t + 1e-9);
      assert.ok(programata, `textele se schimbă la ${t}s fără clipă programată`);
      anterior = acum;
    }
  }
});

test("linia punctată se stinge abia când linia verde a acoperit-o toată", () => {
  /* Abaterea VOITĂ de la machetă (vezi pistele `fundal-*`): punctatul de sub linia verde se stinge,
     fiindcă acolo, pe telefon, ieșea cu un pixel pe lângă. Proba cere ca asta să nu se vadă: cât e
     stins dar ar fi trebuit să se vadă, linia verde e întreagă și aprinsă deasupra lui. */
  for (let k = 0; k < BUCLA_S * 240; k++) {
    const t = k / 240;
    const m = macheta(t);
    for (let i = 0; i < 4; i++) {
      const fundal = v(`fundal-${i}`, t)[0];
      if (Math.abs(fundal - m.fundal) < 1e-9) continue;
      assert.equal(fundal, 0, `punctatul ${i} la ${t}s`);
      assert.equal(m.linii[i][0], 0, `punctatul ${i} stins la ${t}s, dar linia verde nu e întreagă`);
      aproape(v(`linie-${i}`, t)[1], m.linii[i][1], `linia verde ${i} la ${t}s`);
    }
  }
});

test("panoul îngust adevărat ia locul celor trei bucăți exact la capătul strângerii", () => {
  for (let k = 0; k < BUCLA_S * 240; k++) {
    const t = k / 240;
    const strans = Math.abs(macheta(t).panou.latime - 13.4) < 1e-9;
    const mobil = v("panou-mobil", t)[0];
    const ingust = v("panou-ingust", t)[0];
    assert.equal(mobil + ingust, 1, `la ${t}s se văd ${mobil + ingust} panouri`);
    /* Cât e vizibil cel îngust, panoul machetei chiar e strâns (cu excepția începutului buclei,
       unde totul e stins). */
    if (ingust === 1) assert.ok(strans, `panoul îngust apare la ${t}s, înainte de capătul strângerii`);
  }
});

test("bucla se închide fără săritură: la capete nu se vede nimic din ce sare", () => {
  for (const t of [0, BUCLA_S - 1e-6]) {
    assert.equal(v("panou", t)[0], 0, `panoul la ${t}`);
    assert.equal(v("comanda", t)[0], 0, `comanda la ${t}`);
    assert.equal(v("insigna", t)[0], 0, `insigna la ${t}`);
    assert.equal(v("cursor", t)[1], 0, `cursorul la ${t}`);
    for (let i = 0; i < 4; i++) {
      assert.equal(v(`linie-${i}`, t)[1], 0, `linia ${i} la ${t}`);
      assert.equal(v(`fundal-${i}`, t)[0], 0, `punctatul ${i} la ${t}`);
    }
  }
});

test("HTML-ul arată clipa de pornire: panoul intrat, nimic pornit, cursorul încă stins", () => {
  const s = stareaDiscreta(PORNIRE_S, 0);
  assert.deepEqual(s.stari, ["Inactiv", "Inactiv", "Inactiv", "Inactiv"]);
  assert.equal(`${s.active} ${s.cuvant}`, "0 active");
  assert.equal(s.numar, "#10483");
  assert.equal(s.eticheta, "Comandă nouă");
  assert.ok(v("panou", PORNIRE_S)[0] > 0.99, "panoul e intrat");
  assert.equal(v("cursor", PORNIRE_S)[1], 0, "cursorul nu se vede încă");
  /* Iar cadrul static pentru „mișcare redusă” e cel cu totul făcut. */
  const f = stareaDiscreta(STATIC_S, 0);
  assert.deepEqual([f.active, f.pasi.every(Boolean), f.procesata], [4, true, true]);
});

test("⚠ ce traversează scena nu se mută în procente din propria mărime mică", () => {
  /* MĂSURAT 14.10.2026: capătul drept al panoului (lat de 2,2) mutat cu 88,8 stătea cu 0,3 px
     alături, iar cursorul (3,4) dus la 85, cu 0,2 px: procentele din `translate` înmulțeau
     rotunjirea mărimii elementului. Plasa: cât panoul stă pe loc, capetele lui nu se mișcă deloc,
     iar cursorul și pachetul se mută prin „purtătorul” cât scena (procente = unități de scenă). */
  for (let k = 60; k < 6.5 * 60; k++) {
    for (const tinta of ["umbra-stanga", "corp-stanga", "umbra-dreapta", "corp-dreapta"]) {
      assert.equal(v(tinta, k / 60)[0], 0, `${tinta} se mișcă la ${k / 60}s, cu panoul pe loc`);
    }
  }
  const cursor = pista("cursor-loc").scrie([85, 28]).transform as string;
  assert.equal(cursor, "translate(85.000%, 37.333%)");
  /* Pachetul se centrează pe punct: 1,4 e jumătatea lui. */
  const pachet = pista("pachet-loc").scrie([30, 37.2]).transform as string;
  assert.equal(pachet, "translate(28.600%, 47.733%)");
});

test("geometria panoului din cod e cea din foaia de stil", () => {
  /* Bucățile panoului stau în CSS pe locul lor de la început; pistele le mută FAȚĂ de el. Dacă
     se mută ceva într-o parte și nu în cealaltă, panoul se rupe. Se citesc chiar regulile. */
  const css = readFileSync(join(process.cwd(), "src/app/integrari-animat.css"), "utf8");
  const regula = (sel: string) => {
    /* Regula al cărei selector e EXACT ăsta: începe după un rând gol sau după un comentariu. */
    const m = new RegExp(`(?:^|\\n\\n|\\*\\/\\n)\\${sel}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `lipsește regula ${sel}`);
    return m[1];
  };
  const unitati = (bloc: string, prop: string) => {
    const m = new RegExp(`(?:^|;|\\s)${prop}:\\s*calc\\(var\\(--u\\)\\s*\\*\\s*([0-9.]+)\\)`).exec(bloc);
    assert.ok(m, `lipsește ${prop}`);
    return Number(m[1]);
  };
  assert.equal(unitati(regula(".eic-us,\n.eic-cs"), "left"), 9);
  assert.equal(unitati(regula(".eic-ud,\n.eic-cd"), "left"), 91 - RAZA);
  assert.equal(unitati(regula(".eic-um"), "left"), 9 + RAZA);
  assert.equal(Math.round(unitati(regula(".eic-cm"), "left") * 1000) / 1000, Math.round((9 + RAZA - PESTE) * 1000) / 1000);
  assert.equal(unitati(regula(".eic-um,\n.eic-cm"), "width"), MIJLOC);
  assert.equal(unitati(regula(".eic-us,\n.eic-ud,\n.eic-cs,\n.eic-cd"), "width"), RAZA);
});

test("siglele sunt chiar cele din catalogul site-ului, și există", () => {
  /* Scrise de mână în `SIGLE` (catalogul nu intră în codul trimis browserului), deci proba e
     singura legătură: o siglă schimbată în catalog și uitată aici cade aici. */
  assert.deepEqual(
    [...SIGLE],
    [PROVIDER_LOGOS.fanCourier.src, PROVIDER_LOGOS.netopia.src, PROVIDER_LOGOS.smartbill.src, PROVIDER_LOGOS.emag.src],
  );
  for (const src of SIGLE) assert.ok(existsSync(join(process.cwd(), "public", src)), `lipsește ${src}`);
  const sursa = readFileSync(join(process.cwd(), "src/components/website/sections/IntegrariAnimat.tsx"), "utf8");
  assert.ok(!sursa.includes("lib/website/logos"), "catalogul de sigle nu are ce căuta în componenta de client");
  assert.ok(existsSync(join(process.cwd(), "public/semn.svg")));
  assert.equal(INTEGRARI.length, 4);
  assert.equal(PASI.length, 4);
  /* Pașii se fac în ordinea machetei: plata, livrarea, factura, stocul. */
  [8.9, 10.5, 12.1, 13.7].forEach((t, j) => aproape(inceputPas([1, 0, 2, 3][j]), t, `pasul ${j}`));
});
