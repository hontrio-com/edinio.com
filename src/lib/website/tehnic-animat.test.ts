import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIFE,
  BUCLA_S,
  MASURATORI_IMPLICITE,
  MESAJE,
  PANZA,
  PISTE,
  PORNIRE_S,
  STATIC_S,
  masuratori,
  masuratoriDinPagina,
  pisteCuMasuratori,
  type Masuratori,
} from "./tehnic-animat";
import type { Pista } from "./animatie-bucla";

/*
  ═══ ORACOLUL: socoteala machetei, copiată aproape literă cu literă ═══

  Macheta clientului (`edinio-tehnic-preview.html`, „varianta 3: chat de suport non-stop”,
  16.10.2026) scria totul din JavaScript, la fiecare cadru (`render(T)`), în pixelii pânzei de
  720 × 524. Aici aceeași funcție, cu secunda din buclă primită direct (modulo-ul machetei adaugă
  zgomot de virgulă mobilă exact pe praguri). `G` e geometria pe care macheta o măsura în pagină
  (`geo`): locul și înălțimea fiecărui mesaj și înălțimea panoului.
*/
function macheta(t: number, G: Masuratori) {
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const pr = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
  const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eo = (x: number) => 1 - Math.pow(1 - x, 3);
  const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
  const spr = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(8 * x));
  const OUT = 15.6;
  const TYP = [[2.5, 3.9], [4.4, 5.6], [7.4, 8.5]];
  const DT = [1.2, 4.0, 5.7, 8.6, 10.2];
  const fo = 1 - pr(t, OUT, OUT + 0.6), fi = eo(pr(t, 0, 0.5));
  let scroll = 0;
  DT.forEach((s, i) => {
    const need = Math.max(0, G.y[i] + G.h[i] + 14 - G.vedere);
    scroll = lerp(scroll, Math.max(scroll, need), eio(pr(t, s, s + 0.35)));
  });
  const mesaje = DT.map((s, i) => {
    const q = pr(t, s, s + 0.28);
    return { opacitate: clamp(q * 3), y: G.y[i] + (1 - eo(q)) * 10 };
  });
  /* Clasele bifelor: `s` (una gri) și `r` (citit, albastre); fără niciuna, două gri. */
  const bife = [0, 1].map((j) => {
    const s = j ? 10.2 : 1.2;
    return { s: t < s + 0.35, r: t >= s + (j ? 0.9 : 1.3) };
  });
  const typing = TYP.some((w) => t >= w[0] && t < w[1]);
  const sq = pr(t, 6.5, 6.8), on = t >= 6.6;
  return {
    card: fi * fo,
    derulare: scroll,
    mesaje,
    bife,
    stare: typing ? "scrie…" : "online",
    buton: 14 * spr(sq),
    pornit: on,
    optiuni: 0.35 + 0.65 * pr(t, 6.7, 7.1),
    activ: pr(t, 7.0, 7.3),
    /* Alfa fondului verde, împărțită la cea de pe stratul nostru (0,08). */
    randFond: sq > 0 && t < 7.6 ? (0.08 * (1 - pr(t, 6.8, 7.6))) / 0.08 : 0,
  };
}

/** `geo()` din machetă: 12 px după antet, 3 între mesaje, încă 8 când se schimbă cine scrie. */
function geoMacheta(capatAntet: number, h: readonly number[], parti: readonly string[]): number[] {
  let y = capatAntet + 12;
  let prev: string | null = null;
  return h.map((hh, i) => {
    if (prev !== null && prev !== parti[i]) y += 8;
    const r = y;
    y += hh + 3;
    prev = parti[i];
    return r;
  });
}

const piste = (lista: readonly Pista[]) => (tinta: string) => {
  const p = lista.find((x) => x.tinta === tinta);
  assert.ok(p, `lipsește pista ${tinta}`);
  return p;
};
const aproape = (a: number, b: number, eps: number, ce: string) => assert.ok(Math.abs(a - b) <= eps, `${ce}: ${a} în loc de ${b}`);
const TIMPI = Array.from({ length: BUCLA_S * 120 }, (_, i) => i / 120);
const PARTI = MESAJE.map((m) => m.de);

/** Alte geometrii decât cea de pe Windows: rânduri în plus și în minus, alt panou. */
const GEOMETRII: Masuratori[] = [
  MASURATORI_IMPLICITE,
  masuratori(70, [56, 98, 189, 98, 77], 406),
  masuratori(66, [35, 56, 183, 56, 35], 406),
  masuratori(74, [77, 119, 195, 119, 56], 380),
];

test("geometria măsurată în pagină: antetul se termină la offsetTop + offsetHeight; un fir neașezat nu trece drept măsurat", () => {
  /* Valorile citite în macheta deschisă singură: nota „Acesta este un cont de business oficial.” la 42, înaltă de 28. */
  const bule = [56, 77, 189, 77, 56].map((offsetHeight) => ({ offsetHeight }));
  const antet = { offsetTop: 42, offsetHeight: 28 };
  const m = masuratoriDinPagina(antet, bule, { clientHeight: 406 });
  assert.ok(m);
  assert.deepEqual(m.y, [82, 149, 229, 421, 509]);
  assert.deepEqual(m.h, [56, 77, 189, 77, 56]);
  assert.equal(m.vedere, 406);
  assert.equal(masuratoriDinPagina(null, bule, { clientHeight: 406 }), null, "fără antet");
  assert.equal(masuratoriDinPagina(antet, bule, null), null, "fără panou");
  assert.equal(masuratoriDinPagina(antet, bule, { clientHeight: 0 }), null, "panoul neașezat");
  assert.equal(masuratoriDinPagina(antet, [...bule.slice(0, 4), { offsetHeight: 0 }], { clientHeight: 406 }), null, "o bulă ascunsă");
  assert.equal(masuratoriDinPagina(antet, [...bule.slice(0, 4), null], { clientHeight: 406 }), null, "o bulă lipsă");
  assert.equal(masuratoriDinPagina(antet, bule.slice(0, 4), { clientHeight: 406 }), null, "mai puține bule decât mesaje");
});

test("componenta măsoară chiar elementele pe care le desenează", () => {
  /* O clasă redenumită n-ar da nicio eroare: măsurarea ar trece pe tăcute pe numerele de Windows. */
  const sursa = readFileSync(join(process.cwd(), "src/components/website/sections/TehnicAnimat.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "src/app/tehnic-animat.css"), "utf8").replace(/\r\n/g, "\n");
  for (const clasa of ["eth-biz", "eth-pane"]) {
    assert.ok(sursa.includes(`querySelector<HTMLElement>(".${clasa}")`), `măsurarea nu mai citește .${clasa}`);
    assert.ok(sursa.includes(`className="${clasa}"`), `.${clasa} nu mai e desenat`);
    assert.ok(css.includes(`\n.${clasa} {`), `.${clasa} nu mai are regulă în foaie`);
  }
});

test("geometria firului: regula machetei, iar implicita e cea măsurată pe Windows", () => {
  assert.deepEqual(MASURATORI_IMPLICITE.y, [82, 149, 229, 421, 509], "locurile măsurate în macheta deschisă singură");
  for (const [capat, h] of [[70, [56, 77, 189, 77, 56]], [66, [35, 56, 183, 56, 35]], [91, [100, 20, 300, 40, 80]]] as const) {
    assert.deepEqual(masuratori(capat, h, 406).y, geoMacheta(capat, h, PARTI), `antetul la ${capat}, bulele ${h}`);
  }
});

test("cardul și firul: intrarea, stingerea și cât urcă firul la fiecare mesaj, la fiecare 1/120 s", () => {
  for (const G of GEOMETRII) {
    const p = piste(pisteCuMasuratori(G));
    for (const t of TIMPI) {
      const m = macheta(t, G);
      aproape(p("card").valori(t)[0], m.card, 1e-9, `cardul la ${t}`);
      aproape(-p("fir").valori(t)[0], -m.derulare, 1e-9, `firul la ${t} (${G.h})`);
      assert.equal(p("fir").scrie([m.derulare]).transform, `translateY(${(-m.derulare).toFixed(2)}px)`);
    }
  }
});

test("mesajele: locul, urcarea de 10 px și opacitatea, cu orice geometrie", () => {
  for (const G of GEOMETRII) {
    const p = piste(pisteCuMasuratori(G));
    for (const t of TIMPI) {
      const m = macheta(t, G);
      MESAJE.forEach((_, i) => {
        const [y, o] = p(`mesaj-${i}`).valori(t);
        aproape(y, m.mesaje[i].y, 1e-9, `mesajul ${i}.y la ${t}`);
        aproape(o, m.mesaje[i].opacitate, 1e-9, `mesajul ${i}.opacitate la ${t}`);
      });
    }
  }
});

test("starea din bară și bifele: o singură variantă aprinsă, cea a machetei", () => {
  const p = piste(PISTE);
  for (const t of TIMPI) {
    const m = macheta(t, MASURATORI_IMPLICITE);
    const online = p("stare-online").valori(t)[0], scrie = p("stare-scrie").valori(t)[0];
    assert.equal(online + scrie, 1, `o singură stare la ${t}`);
    assert.equal(scrie === 1 ? "scrie…" : "online", m.stare, `starea la ${t}`);
    BIFE.forEach(({ mesaj }, j) => {
      const v = ["una", "doua", "citit"].map((fel) => p(`bifa-${fel}-${mesaj}`).valori(t)[0]);
      assert.equal(v[0] + v[1] + v[2], 1, `o singură bifă pe mesajul ${mesaj} la ${t}`);
      const asteptat = m.bife[j].s ? 0 : m.bife[j].r ? 2 : 1;
      assert.equal(v.indexOf(1), asteptat, `bifa mesajului ${mesaj} la ${t}`);
    });
  }
});

test("captura: comutatorul, eticheta, opțiunile, banda „activă” și fondul verde al rândului", () => {
  const p = piste(PISTE);
  for (const t of TIMPI) {
    const m = macheta(t, MASURATORI_IMPLICITE);
    aproape(p("comutator-buton").valori(t)[0], m.buton, 1e-9, `butonul la ${t}`);
    assert.equal(p("comutator-verde").valori(t)[0], m.pornit ? 1 : 0, `fondul verde al comutatorului la ${t}`);
    assert.equal(p("comutator-gri").valori(t)[0], m.pornit ? 0 : 1, `fondul gri al comutatorului la ${t}`);
    assert.equal(p("insigna-conectat").valori(t)[0], m.pornit ? 1 : 0, `„Conectat” la ${t}`);
    assert.equal(p("insigna-inactiv").valori(t)[0], m.pornit ? 0 : 1, `„Inactiv” la ${t}`);
    aproape(p("optiuni").valori(t)[0], m.optiuni, 1e-9, `opțiunile la ${t}`);
    aproape(p("activ").valori(t)[0], m.activ, 1e-9, `banda „activă” la ${t}`);
    aproape(p("rand-fond").valori(t)[0], m.randFond, 1e-9, `fondul rândului la ${t}`);
  }
});

/**
 * Ce scrie pista în CSS la `t` (cum îl primește browserul): opacitatea și deplasarea, citite din
 * textul cadrului, nu din `valori`.
 */
function desenat(p: Pista, t: number): { opacitate?: number; x?: number; y?: number } {
  const k = p.scrie(p.valori(t));
  const out: { opacitate?: number; x?: number; y?: number } = {};
  if (k.opacity !== undefined && k.opacity !== null) out.opacitate = Number(k.opacity);
  if (typeof k.transform === "string") {
    const tr = k.transform;
    const numar = (prefix: string) => Number(tr.slice(prefix.length, tr.length - "px)".length));
    if (tr.startsWith("translateY(") && tr.endsWith("px)")) out.y = numar("translateY(");
    else if (tr.startsWith("translateX(") && tr.endsWith("px)")) out.x = numar("translateX(");
    else assert.fail(`${p.tinta}: transformare necunoscută ${tr}`);
  }
  return out;
}

test("ce scrie fiecare pistă în CSS e ce desena macheta, la fiecare 1/120 s", () => {
  /* Probele de mai sus apără `valori`; asta apără și drumul până la ecran (`scrie`): o opacitate
     întoarsă sau două valori schimbate între ele ar trece de ele, nu și de asta. */
  const EPS_PX = 0.0051;
  const EPS_O = 0.00051;
  for (const G of [MASURATORI_IMPLICITE, GEOMETRII[1]]) {
    const p = piste(pisteCuMasuratori(G));
    const val = (tinta: string, t: number, ce: "opacitate" | "x" | "y") => {
      const v = desenat(p(tinta), t)[ce];
      assert.ok(v !== undefined && Number.isFinite(v), `${tinta} nu scrie ${ce} la ${t}`);
      return v;
    };
    for (const t of TIMPI) {
      const m = macheta(t, G);
      aproape(val("card", t, "opacitate"), m.card, EPS_O, `cardul la ${t}`);
      aproape(val("fir", t, "y"), -m.derulare, EPS_PX, `firul la ${t}`);
      MESAJE.forEach((_, i) => {
        aproape(val(`mesaj-${i}`, t, "y"), m.mesaje[i].y, EPS_PX, `mesajul ${i}.y la ${t}`);
        aproape(val(`mesaj-${i}`, t, "opacitate"), m.mesaje[i].opacitate, EPS_O, `mesajul ${i}.opacitate la ${t}`);
      });
      assert.equal(val("stare-scrie", t, "opacitate"), m.stare === "scrie…" ? 1 : 0, `„scrie…” la ${t}`);
      assert.equal(val("stare-online", t, "opacitate"), m.stare === "online" ? 1 : 0, `„online” la ${t}`);
      BIFE.forEach(({ mesaj }, j) => {
        const aprinsa = m.bife[j].s ? 0 : m.bife[j].r ? 2 : 1;
        ["una", "doua", "citit"].forEach((fel, k) => {
          assert.equal(val(`bifa-${fel}-${mesaj}`, t, "opacitate"), k === aprinsa ? 1 : 0, `bifa „${fel}” a mesajului ${mesaj} la ${t}`);
        });
      });
      aproape(val("comutator-buton", t, "x"), m.buton, EPS_PX, `butonul la ${t}`);
      assert.equal(val("comutator-verde", t, "opacitate"), m.pornit ? 1 : 0, `fondul verde la ${t}`);
      assert.equal(val("comutator-gri", t, "opacitate"), m.pornit ? 0 : 1, `fondul gri la ${t}`);
      assert.equal(val("insigna-conectat", t, "opacitate"), m.pornit ? 1 : 0, `„Conectat” la ${t}`);
      assert.equal(val("insigna-inactiv", t, "opacitate"), m.pornit ? 0 : 1, `„Inactiv” la ${t}`);
      aproape(val("optiuni", t, "opacitate"), m.optiuni, EPS_O, `opțiunile la ${t}`);
      aproape(val("activ", t, "opacitate"), m.activ, EPS_O, `banda „activă” la ${t}`);
      aproape(val("rand-fond", t, "opacitate"), m.randFond, EPS_O, `fondul rândului la ${t}`);
    }
  }
});

test("variantele care se aprind sar, nu trec una în alta", () => {
  for (const nume of ["stare-online", "stare-scrie", "comutator-gri", "comutator-verde", "insigna-inactiv", "insigna-conectat"]) {
    assert.equal(piste(PISTE)(nume).trepte, true, `${nume} trebuie să sară`);
  }
  for (const { mesaj } of BIFE) {
    for (const fel of ["una", "doua", "citit"]) assert.equal(piste(PISTE)(`bifa-${fel}-${mesaj}`).trepte, true);
  }
});

test("clipa din HTML și cadrul static: conversația goală; apoi toată, cu facturarea pornită", () => {
  const p = piste(PISTE);
  assert.equal(p("card").valori(PORNIRE_S)[0], 1, "în HTML cardul se vede");
  assert.ok(MESAJE.every((_, i) => p(`mesaj-${i}`).valori(PORNIRE_S)[1] === 0), "în HTML niciun mesaj");
  assert.equal(p("fir").valori(PORNIRE_S)[0], 0);
  assert.equal(p("stare-online").valori(PORNIRE_S)[0], 1);
  assert.equal(p("insigna-inactiv").valori(PORNIRE_S)[0], 1);

  assert.ok(MESAJE.every((_, i) => p(`mesaj-${i}`).valori(STATIC_S)[1] === 1), "în cadrul static toate mesajele");
  assert.equal(p("fir").valori(STATIC_S)[0], 173, "firul urcat cât să se vadă ultimul mesaj");
  assert.equal(p("insigna-conectat").valori(STATIC_S)[0], 1);
  assert.equal(p("comutator-verde").valori(STATIC_S)[0], 1);
  assert.equal(p("activ").valori(STATIC_S)[0], 1);
  assert.ok(BIFE.every(({ mesaj }) => p(`bifa-citit-${mesaj}`).valori(STATIC_S)[0] === 1), "în cadrul static mesajele Elenei sunt citite");
  assert.equal(p("card").valori(STATIC_S)[0], 1);
});

test("pânza din cod e cea din foaia de stil: 720 × 524, micșorată la 92 de unități", () => {
  const css = readFileSync(join(process.cwd(), "src/app/tehnic-animat.css"), "utf8").replace(/\r\n/g, "\n");
  const regula = (sel: string) => {
    const inceput = css.indexOf(`\n${sel} {`);
    assert.ok(inceput >= 0, `lipsește regula ${sel}`);
    return css.slice(inceput, css.indexOf("}", inceput)).split("\n").map((r) => r.trim());
  };
  const ui = regula(".eth-ui");
  assert.ok(ui.includes(`width: ${PANZA.latime}px;`), "lățimea pânzei");
  assert.ok(ui.includes(`height: ${PANZA.inaltime}px;`), "înălțimea pânzei");
  assert.ok(ui.includes(`transform: scale(tan(atan2(calc(var(--u) * ${PANZA.cat}), ${PANZA.latime}px)));`), "scara pânzei");
  assert.ok(regula(".eth-card").includes(`width: calc(var(--u) * ${PANZA.cat});`), "lățimea cardului");
  /* Oracolul împarte alfa machetei (0,08 la plin) la alfa stratului: trebuie să fie aceeași. */
  assert.ok(regula(".eth-sbf").includes("background: rgba(7, 197, 39, 0.08);"), "fondul verde al rândului nu mai are alfa machetei");
});

test("imaginile cardului există, iar cele vechi nu mai sunt cerute de nimeni", () => {
  const sursa = readFileSync(join(process.cwd(), "src/components/website/sections/TehnicAnimat.tsx"), "utf8");
  const cai = [...sursa.matchAll(/"(\/[a-z0-9/_.-]+\.(?:svg|webp))"/g)].map((m) => m[1]);
  assert.ok(cai.length >= 4, `doar ${cai.length} imagini găsite în componentă`);
  for (const c of cai) assert.ok(existsSync(join(process.cwd(), "public", c)), `lipsește ${c}`);
  for (const v of ["720", "1080", "1440"]) {
    assert.ok(!existsSync(join(process.cwd(), "public/features", `mentenanta-${v}.webp`)), `mentenanta-${v}.webp a rămas`);
  }
});
