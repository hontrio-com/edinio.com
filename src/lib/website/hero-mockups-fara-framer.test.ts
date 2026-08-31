import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ANIMAȚIA SCRISĂ DE MÂNĂ TREBUIE SĂ RĂMÂNĂ CEA PE CARE A ÎNLOCUIT-O
  ═══════════════════════════════════════════════════════════════════════════

  `HeroMockups` era singurul motiv pentru care `/start` încărca `framer-motion`:
  42.617 de octeți gzip pentru UN `motion.div`. Măsurat după înlocuire:
  231.018 → 188.900 gzip pe pagină.

  ⚠ CE APĂRĂ PROBA ASTA. Nu că animația „arată bine" — asta n-o poate spune un
  fișier. Apără cele trei lucruri care făceau înlocuirea EXACTĂ, și pe care le-ar
  strica o mână neatentă fără să cadă nimic altceva:

    1. ordinea transformărilor (`framer-motion` are o ordine anume, iar
       `scale` înaintea lui `translate` mută placa în alt loc);
    2. durata și curba de accelerare;
    3. faptul că `framer-motion` chiar a plecat de acolo.

  Fiecare din cele trei se poate strica tăcut: pagina se randează, animația
  rulează, doar că altfel decât înainte.
*/

const RAD = process.cwd();
const SURSA = join(RAD, "src/components/website/HeroMockups.tsx");
const CSS = join(RAD, "src/app/stil-comun.css");

const sursa = readFileSync(SURSA, "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(CSS, "utf8").replace(/\r\n/g, "\n");

test("`HeroMockups` nu mai importă `framer-motion`", () => {
  const fara = sursa.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    fara,
    /from\s+["']framer-motion["']/,
    "s-a întors `framer-motion` în `HeroMockups` — 42.617 octeți gzip pe /start, " +
      "pagina pe care cad vizitatorii din reclame plătite",
  );
  assert.doesNotMatch(fara, /<motion\./, "a rămas un element `motion.` în `HeroMockups`");
});

test("ordinea transformărilor e cea pe care o producea `framer-motion`", () => {
  /*
    ⚠ SE CITEȘTE DIN PACHET, NU DIN MEMORIA MEA. `motion-dom` are `transformPropOrder`
    — `transformPerspective, x, y, z, translateX…, scale…, rotate, rotateX, rotateY…`.
    Dacă un `npm update` schimbă vreodată ordinea aia, proba asta cade și
    întreabă dacă mai e adevărat ce scrie în componentă. Fără citirea din pachet,
    ar apăra doar ce am crezut eu într-o zi de august.
  */
  const pachet = join(RAD, "node_modules/motion-dom/dist/cjs/index.js");
  if (existsSync(pachet)) {
    const p = readFileSync(pachet, "utf8");
    const m = p.match(/const transformPropOrder = \[([\s\S]*?)\]/);
    assert.ok(m, "nu mai găsesc `transformPropOrder` în `motion-dom` — s-a schimbat pachetul");
    const ordine = [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]);
    const i = (n: string) => ordine.indexOf(n);
    assert.ok(i("x") < i("scale"), "în `motion-dom`, `x` nu mai vine înaintea lui `scale`");
    assert.ok(i("z") < i("scale"), "în `motion-dom`, `z` nu mai vine înaintea lui `scale`");
    assert.ok(i("scale") < i("rotateY"), "în `motion-dom`, `scale` nu mai vine înaintea lui `rotateY`");
  }

  const m = sursa.match(/transform:\s*`([^`]+)`/);
  assert.ok(m, "nu mai găsesc șirul `transform` din `HeroMockups`");
  const t = m[1];

  const poz = ["translateX", "translateZ", "scale", "rotateY"].map((n) => t.indexOf(n));
  assert.ok(
    poz.every((p) => p >= 0),
    `șirul \`transform\` nu mai are toate cele patru: ${t}`,
  );
  assert.deepEqual(
    [...poz].sort((a, b) => a - b),
    poz,
    "ordinea transformărilor s-a schimbat. `framer-motion` le compunea " +
      `translateX → translateZ → scale → rotateY; acum sunt: ${t}`,
  );
});

test("durata și curba sunt cele din `transition`-ul vechi", () => {
  const regula = css.match(/\.mockup-hero\s*\{([^}]*)\}/);
  assert.ok(regula, "`.mockup-hero` a dispărut din `stil-comun.css` — animația nu mai rulează deloc");

  const corp = regula[1];
  assert.match(corp, /0\.8s/, "durata nu mai e 0,8 s, cât era `duration: 0.8` la `framer-motion`");
  assert.match(
    corp.replace(/\s+/g, ""),
    /cubic-bezier\(0\.25,0\.1,0\.25,1\)/,
    "curba nu mai e cea din `ease: [0.25, 0.1, 0.25, 1]`",
  );

  /*
    ⚠ Doar `transform` și `opacity`. Orice altă proprietate în tranziție scoate
    animația de pe placa video: cele două se compun fără recalcularea aspectului,
    restul nu.
  */
  const proprietati = [...corp.matchAll(/^\s*(transform|opacity|[a-z-]+)\s+0\.8s/gm)].map((x) => x[1]);
  assert.deepEqual(
    [...new Set(proprietati)].sort(),
    ["opacity", "transform"],
    `în tranziție sunt și alte proprietăți: ${proprietati.join(", ")}`,
  );
});

test("se respectă `prefers-reduced-motion`, ceea ce înainte nu se întâmpla", () => {
  /*
    ⚠ ĂSTA E UN CÂȘTIG, NU O PĂSTRARE. `framer-motion` nu oprea singur animația,
    deci plăcile se roteau la nesfârșit și pentru cine ceruse mai puțină mișcare
    din sistem. Dacă rândurile astea dispar, se pierde ceva ce n-a existat
    înainte de 31.08.2026 și nimeni n-ar băga de seamă.
  */
  const bloc = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.mockup-hero[^}]*\}/);
  assert.ok(
    bloc,
    "`.mockup-hero` nu mai are ramura pentru `prefers-reduced-motion: reduce` — " +
      "plăcile se rotesc și pentru cine a cerut mai puțină mișcare",
  );
});
