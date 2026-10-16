import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  Regulile animațiilor de pe pagina de start care nu țin de o singură machetă (luminile din ramă, petele
  primului ecran, benzile de sigle), MĂSURATE pe 16.10.2026:
  1. NICIO lumină care se mișcă nu poartă `filter: blur()`: estomparea se refăcea la fiecare cadru, pe
     placa grafică (la carduri 15-35% din munca procesului grafic și cadrele pierdute; sus, jumătate);
  2. animațiile fără sfârșit ale paginii stau cât nu se văd (`data-in-afara`).
*/
const citeste = (cale: string) => readFileSync(join(process.cwd(), cale), "utf8").replace(/\r\n/g, "\n");
const regula = (css: string, sel: string) => {
  const inceput = css.indexOf(`\n${sel} {`);
  assert.ok(inceput >= 0, `lipsește regula ${sel}`);
  return css.slice(inceput, css.indexOf("\n}", inceput));
};
const unitati = (bloc: string, prop: string) => {
  const rand = bloc.split("\n").map((r) => r.trim()).find((r) => r.startsWith(`${prop}: `));
  assert.ok(rand && rand.endsWith("cqw;"), `lipsește ${prop} în cqw`);
  return Number(rand.slice(prop.length + 2, -"cqw;".length));
};

test("luminile din rama cardurilor: fără filter, iar centrul discului machetei rămâne pe loc", () => {
  const css = citeste("src/app/animatii-carduri.css");
  for (const sel of [".anim-blob", ".anim-b1", ".anim-b2"]) {
    assert.ok(!/\bfilter\s*:/.test(regula(css, sel)), `${sel} are filter`);
  }
  /* Macheta: b1 avea 60, la (-18, -22) => centrul (12, 8); b2 avea 52, la dreapta -18 și jos -20 => 8 și 6 înăuntru. */
  const b1 = regula(css, ".anim-b1");
  assert.equal(unitati(b1, "left") + unitati(b1, "width") / 2, 12);
  assert.equal(unitati(b1, "top") + unitati(b1, "height") / 2, 8);
  const b2 = regula(css, ".anim-b2");
  assert.equal(unitati(b2, "right") + unitati(b2, "width") / 2, 8);
  assert.equal(unitati(b2, "bottom") + unitati(b2, "height") / 2, 6);
});

test("petele primului ecran: fără filter, lumina estompată stă pe ::before", () => {
  const sursa = citeste("src/components/website/sections/hero-backgrounds.tsx");
  const fara = sursa.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/\bfilter\s*:/.test(fara), "o pată primește din nou `filter`");
  assert.ok(fara.includes('"--mesh-lumina"') && fara.includes('"--mesh-intindere"'), "petele nu-și mai scriu lumina");
  const css = citeste("src/app/stil-comun.css");
  assert.ok(!/\bfilter\s*:/.test(regula(css, ".hero-mesh-blob")), ".hero-mesh-blob are filter");
  const inainte = regula(css, ".hero-mesh-blob::before");
  assert.ok(inainte.includes("background: var(--mesh-lumina);") && inainte.includes("var(--mesh-intindere)"));
});

test("animațiile paginii stau cât nu se văd: regula de pauză și componenta în ambele secțiuni", () => {
  const css = citeste("src/app/stil-comun.css");
  const i = css.indexOf("[data-in-afara] .hero-mesh-blob,\n[data-in-afara] .banda {");
  assert.ok(i >= 0, "lipsește regula de pauză (două clase: prescurtarea `animation` repune `running`)");
  assert.ok(css.slice(i, css.indexOf("}", i)).includes("animation-play-state: paused;"));
  for (const f of ["src/components/website/sections/hero-backgrounds.tsx", "src/components/website/sections/integrations/IntegrationsBenzi.tsx"]) {
    assert.ok(citeste(f).includes("<OprireInAfaraEcranului />"), `${f} nu-și mai oprește animațiile în afara ecranului`);
  }
});
