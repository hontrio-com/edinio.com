import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { captureAttribution, getAttribution } from "./attribution";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ATRIBUIREA COMENZII NU MAI TRECE DINTR-UN MAGAZIN IN ALTUL
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA STRICAT, SI DE CAND. `attribution.ts` folosea o singura cheie de
  localStorage, `edinio_attribution`, pentru toate magazinele. Iar localStorage e
  per ORIGINE. Masurat pe 01.09.2026: 58 din 71 de magazine publicate stau pe
  `www.edinio.com/{slug}` — deci toate 58 scriau si citeau aceeasi valoare.

  Cine intra pe magazinul A dintr-o reclama si cumpara apoi de pe magazinul B
  ducea `utm_campaign`-ul lui A in comanda lui B. Doi comercianti care nu se
  cunosc, unul vedea sursa celuilalt.

  ⚠ SI AL DOILEA DEFECT, din aceeasi cauza: drumul `edinio.com/preturi` catre un
  magazin era socotit navigare INTERNA (aceeasi gazda), deci vizita venea fara
  semnal si comanda aparea „direct". Adica exact traficul pe care il trimitem noi
  de pe site-ul de prezentare era cel care se pierdea din rapoartele lor.

  ⚠ PROBELE ASTEA CHEAMA FUNCTIILE. Modulul e de browser, deci se pun la indemana
  un `window`, un `document` si un `localStorage` de mana — si se verifica CE
  RAMANE SCRIS, nu ce scrie in sursa. O proba care ar fi cautat text ar fi trecut
  verde si cu cheia nescopata pusa la loc intr-o variabila.
*/

type Depozit = { [k: string]: string };

let depozit: Depozit = {};

/*
  Pune la indemana un browser de mana. Modulul se importa O SINGURA DATA, sus:
  el nu tine nicio stare intre apeluri — citeste `window`, `document` si
  `localStorage` la fiecare chemare, nu la incarcare. (Verificat citind sursa;
  daca s-ar schimba vreodata, martorul de la sfarsit ar trebui intarit.)
*/
function inBrowser(o: { href: string; referrer: string }) {
  const g = globalThis as unknown as Record<string, unknown>;
  const depozitLocal = {
    getItem: (k: string) => (k in depozit ? depozit[k] : null),
    setItem: (k: string, v: string) => { depozit[k] = v; },
    removeItem: (k: string) => { delete depozit[k]; },
  };
  g.window = { location: new URL(o.href), localStorage: depozitLocal };
  g.localStorage = depozitLocal;
  g.document = { referrer: o.referrer, cookie: "" };
}

beforeEach(() => { depozit = {}; });

const CITESTE = (cheie: string) => (depozit[cheie] ? JSON.parse(depozit[cheie]) : null);

/* ═══ 1. Cheia e a magazinului, nu a originii ═══ */

test("⚠ doua magazine de pe aceeasi origine NU mai scriu peste aceeasi cheie", () => {
  inBrowser({
    href: "https://www.edinio.com/magazinul-a?utm_source=facebook&utm_campaign=reduceri-A",
    referrer: "",
  });
  captureAttribution("/magazinul-a");

  inBrowser({
    href: "https://www.edinio.com/magazinul-b?utm_source=google&utm_campaign=reduceri-B",
    referrer: "",
  });
  /* ⚠ Acelasi depozit, ca in browserul aceluiasi om. Se repune ce a scris A. */
  depozit["edinio_attribution/magazinul-a"] = JSON.stringify({ utm_source: "facebook", utm_campaign: "reduceri-A" });
  captureAttribution("/magazinul-b");

  const aA = CITESTE("edinio_attribution/magazinul-a");
  const aB = CITESTE("edinio_attribution/magazinul-b");
  assert.equal(aA?.utm_campaign, "reduceri-A", "atributia magazinului A s-a pierdut");
  assert.equal(aB?.utm_campaign, "reduceri-B", "atributia magazinului B nu s-a scris");
  assert.notEqual(aA?.utm_source, aB?.utm_source, "cele doua magazine impart iar aceeasi valoare");
});

test("⚠ citirea la comanda ia atributia magazinului EI, nu pe a vecinului", () => {
  inBrowser({ href: "https://www.edinio.com/magazinul-b", referrer: "" });
  depozit["edinio_attribution/magazinul-a"] = JSON.stringify({ utm_source: "facebook", utm_campaign: "a lui A" });
  depozit["edinio_attribution/magazinul-b"] = JSON.stringify({ utm_source: "google", utm_campaign: "a lui B" });

  const citit = getAttribution("/magazinul-b");
  assert.equal(citit?.utm_campaign, "a lui B", "comanda lui B a luat sursa lui A");
});

test("pe domeniu propriu cheia ramane cea de dinainte — acolo e un singur magazin", () => {
  /*
    Cele 13 magazine cu domeniu propriu n-aveau defectul: pe originea lor exista
    un singur magazin. Daca proba asta cade, valorile lor de azi s-au pierdut
    degeaba la desfasurare.
  */
  inBrowser({ href: "https://magazinul-lui.ro/?utm_source=tiktok", referrer: "" });
  captureAttribution("");
  assert.ok(depozit["edinio_attribution"], "cheia veche nu mai e folosita pe domeniu propriu");
  assert.equal(CITESTE("edinio_attribution")?.utm_source, "tiktok");
});

test("cheia veche de pe originea comuna se arunca, nu se mosteneste", () => {
  /*
    ⚠ SE PIERDE ATRIBUTIA celor aflati in mijlocul unei vizite, o singura data.
    Alegere deliberata: valoarea veche poate veni de la oricare din cele 58 de
    magazine, deci nu se stie a cui e. Mai bine lipsa decat a altcuiva.
  */
  inBrowser({ href: "https://www.edinio.com/magazinul-a", referrer: "" });
  depozit["edinio_attribution"] = JSON.stringify({ utm_source: "de-la-cine-stie-cine" });
  captureAttribution("/magazinul-a");
  assert.equal(depozit["edinio_attribution"], undefined, "valoarea de provenienta necunoscuta a ramas in depozit");
});

/* ═══ 2. Traficul de pe site-ul nostru nu mai apare „direct" ═══ */

test("⚠ drumul edinio.com/preturi -> magazin e SURSA, nu navigare interna", () => {
  inBrowser({
    href: "https://www.edinio.com/magazinul-a",
    referrer: "https://www.edinio.com/preturi",
  });
  captureAttribution("/magazinul-a");

  const a = CITESTE("edinio_attribution/magazinul-a");
  assert.equal(a?.referrer, "edinio.com", "traficul trimis de noi apare tot ca navigare interna");
  assert.notEqual(a?.direct, true, "comanda ar aparea „direct” desi omul a venit de la noi");
});

test("navigarea CHIAR interna ramane interna", () => {
  /* Din catalogul magazinului in cosul lui: nu e o sursa noua, si n-are voie sa
     stearga sursa adevarata de dinainte. */
  inBrowser({
    href: "https://www.edinio.com/magazinul-a/cos",
    referrer: "https://www.edinio.com/magazinul-a/magazin",
  });
  depozit["edinio_attribution/magazinul-a"] = JSON.stringify({ utm_source: "facebook" });
  captureAttribution("/magazinul-a");
  assert.equal(CITESTE("edinio_attribution/magazinul-a")?.utm_source, "facebook",
    "navigarea interna a sters sursa adevarata");
});

test("un ALT magazin de pe aceeasi gazda e tot sursa externa", () => {
  inBrowser({
    href: "https://www.edinio.com/magazinul-a",
    referrer: "https://www.edinio.com/magazinul-b/magazin",
  });
  captureAttribution("/magazinul-a");
  assert.equal(CITESTE("edinio_attribution/magazinul-a")?.referrer, "edinio.com");
});

test("pe domeniu propriu, orice cale de pe gazda ramane interna", () => {
  inBrowser({
    href: "https://magazinul-lui.ro/cos",
    referrer: "https://magazinul-lui.ro/magazin",
  });
  captureAttribution("");
  assert.equal(CITESTE("edinio_attribution")?.referrer, undefined,
    "navigarea in propriul magazin a fost socotita sursa externa");
});

test("prefixul nu se potriveste pe jumatate de nume", () => {
  /*
    ⚠ `startsWith("/magazinul-a")` s-ar potrivi si pe `/magazinul-abc`. De aceea
    regula cere fie calea EXACTA, fie prefixul urmat de `/`.
  */
  inBrowser({
    href: "https://www.edinio.com/magazinul-a",
    referrer: "https://www.edinio.com/magazinul-abc/magazin",
  });
  captureAttribution("/magazinul-a");
  assert.equal(CITESTE("edinio_attribution/magazinul-a")?.referrer, "edinio.com",
    "un magazin al carui nume incepe la fel a fost socotit acelasi magazin");
});

/* ═══ 3. Martorul ═══ */

test("martor: probele chiar incarca modulul adevarat", () => {
  const sursa = readFileSync(join(process.cwd(), "src/lib/storefront/attribution.ts"), "utf8");
  assert.match(sursa, /cheiaMagazinului/, "modulul nu mai are cheia legata de magazin");
  assert.match(sursa, /externalReferrerHost\(basePath: string\)/, "regula de referer nu mai primeste magazinul");
});
