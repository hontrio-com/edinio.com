import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AMPLASARI, DESPRE_AMPLASARE, esteCrossSellDesenabil, esteFbtDesenabil,
  imparteOferteleDupaAmplasare, parseAmplasare, type OfertaDeAsezat,
} from "./amplasare";
import { parseOfferDisplay } from "./offer.types";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SETUL SE AȘAZĂ ȘI SE NUMĂRĂ DUPĂ ACEEAȘI REGULĂ                (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de el: „Cumpărate împreună” să se poată pune și **lângă preț, sub
 * butoane**, nu doar în banda lată de sub produs.
 *
 * ⚠⚠ PARTEA GREA NU E DESENUL, E BALIZA. Setul mutat sus și recomandările
 * rămase jos sunt două bucăți de ecran, deci două baleze. Dacă lista care se
 * desenează și lista care se numără nu sunt aceeași, o ofertă e numărată de
 * două ori, sau deloc — exact defectul închis azi în contorul de afișări.
 *
 * ⚠ Și e o afișare FANTOMĂ dacă învelișul cu `ref` nu desenează nimic: un
 * `<div>` de zero pixeli pe care observatorul îl poate socoti intrat în ecran.
 */

const of = (x: Partial<OfertaDeAsezat> & { type: string }): OfertaDeAsezat => ({
  amplasare: "sub_produs",
  products: [{}],
  pricing: { price: 1, compareAt: 2, savings: 1 },
  ...x,
});

/* ── Implicita e cea de azi ─────────────────────────────────────────────── */

test("⚠⚠ un rând vechi de `display` înseamnă „sub produs”, adică unde e azi", () => {
  /*
   * Singura ofertă `frequently_bought` de pe producție n-are cheia asta. Dacă
   * lipsa ei ar însemna altceva, s-ar fi mutat singură la primul deploy.
   */
  assert.equal(parseAmplasare(undefined, true), "sub_produs");
  assert.equal(parseAmplasare(null, true), "sub_produs");
  assert.equal(parseOfferDisplay({}, "frequently_bought").amplasare, "sub_produs");
  assert.equal(parseOfferDisplay({ surfaces: ["product_page"] }, "frequently_bought").amplasare, "sub_produs");
});

test("o valoare necunoscută cade tot pe „sub produs”, nu aruncă", () => {
  for (const gunoi of ["langa-pret", "LANGA_PRET", 7, {}, [], true]) {
    assert.equal(parseAmplasare(gunoi, true), "sub_produs");
  }
});

test("⚠⚠ `parseOfferDisplay` NU aruncă pe un tip nerecunoscut", () => {
  /*
   * DEFECTUL DE CARE NE APĂRĂM, prins de adversar la proiectare: o scriere de
   * forma `TABEL[type].sePoateAsezaLangaPret` ar fi aruncat pe un tip scos din
   * tabel — iar funcția asta e chemată din `loadActiveOffers`, adică pe drumul
   * FIECĂREI încărcări de pagină de produs a fiecărui magazin. Vitrina ar fi
   * ieșit albă.
   */
  // @ts-expect-error — chiar asta se probează: un tip care nu e în tabel.
  const d = parseOfferDisplay({ amplasare: "langa_pret" }, "un_tip_care_nu_exista");
  assert.equal(d.amplasare, "sub_produs");
});

/* ── Poarta pe tip ──────────────────────────────────────────────────────── */

test("⚠⚠ numai setul poate sta lângă preț, oricât ar cere jsonb-ul", () => {
  /*
   * O grilă de patru carduri de recomandări n-are ce căuta în coloana de
   * cumpărare. Și `cross_sell` se vede pe DOUĂ suprafețe (pagina și coșul), deci
   * „lângă preț” nici n-ar avea un înțeles limpede acolo.
   */
  assert.equal(parseAmplasare("langa_pret", true), "langa_pret");
  assert.equal(parseAmplasare("langa_pret", false), "sub_produs");
  assert.equal(parseOfferDisplay({ amplasare: "langa_pret" }, "frequently_bought").amplasare, "langa_pret");
  assert.equal(parseOfferDisplay({ amplasare: "langa_pret" }, "cross_sell").amplasare, "sub_produs");
  assert.equal(parseOfferDisplay({ amplasare: "langa_pret" }, "order_bump").amplasare, "sub_produs");
});

/* ── Împărțirea, care e și cea a balizelor ──────────────────────────────── */

test("setul cerut lângă preț urcă, restul rămâne jos", () => {
  const sus = of({ type: "frequently_bought", amplasare: "langa_pret" });
  const jos = of({ type: "frequently_bought", amplasare: "sub_produs" });
  const reco = of({ type: "cross_sell", pricing: undefined });
  const r = imparteOferteleDupaAmplasare([sus, jos, reco]);
  assert.deepEqual(r.langaPret, [sus]);
  assert.deepEqual(r.subProdus, [jos, reco]);
});

test("⚠ recomandările rămân MEREU jos, chiar dacă rândul cere altceva", () => {
  const reco = of({ type: "cross_sell", amplasare: "langa_pret", pricing: undefined });
  const r = imparteOferteleDupaAmplasare([reco]);
  assert.deepEqual(r.langaPret, []);
  assert.deepEqual(r.subProdus, [reco]);
});

test("⚠⚠ ce NU se desenează nu intră în nicio listă, deci nu ține nicio baliză", () => {
  /*
   * Afișarea fantomă: un înveliș cu `ref` care nu desenează nimic e un `<div>`
   * de zero pixeli, iar observatorul îl poate socoti intrat în ecran. Contorul
   * ar fi crescut pentru o ofertă pe care n-a văzut-o nimeni.
   */
  const fbtFaraPret = of({ type: "frequently_bought", amplasare: "langa_pret", pricing: undefined });
  const fbtFaraProduse = of({ type: "frequently_bought", amplasare: "langa_pret", products: [] });
  const recoGoala = of({ type: "cross_sell", products: [], pricing: undefined });
  const altTip = of({ type: "order_bump" });
  const r = imparteOferteleDupaAmplasare([fbtFaraPret, fbtFaraProduse, recoGoala, altTip]);
  assert.deepEqual(r.langaPret, []);
  assert.deepEqual(r.subProdus, []);
});

test("predicatele spun același lucru ca împărțirea", () => {
  assert.equal(esteFbtDesenabil(of({ type: "frequently_bought" })), true);
  assert.equal(esteFbtDesenabil(of({ type: "frequently_bought", pricing: undefined })), false);
  assert.equal(esteCrossSellDesenabil(of({ type: "cross_sell", pricing: undefined })), true);
  assert.equal(esteCrossSellDesenabil(of({ type: "cross_sell", products: [] })), false);
});

/* ── Plasa: desenul și numărătoarea nu se pot despărți ──────────────────── */

test("⚠⚠ cine DESENEAZĂ și cine ÎMPARTE folosesc ACELAȘI predicat", () => {
  /*
   * Erau două filtre scrise de mână. Cu setul mutat sus, al doilea ar fi numărat
   * o afișare pentru o ofertă pe care primul o arunca.
   */
  const deseneaza = readFileSync("src/components/ministore/ProductOffers.tsx", "utf8");
  assert.match(deseneaza, /offers\.filter\(esteFbtDesenabil\)/);
  assert.match(deseneaza, /offers\.filter\(esteCrossSellDesenabil\)/);
  /* ⚠ Și nu și-a păstrat pe lângă ele filtrul vechi, scris de mână. */
  assert.ok(
    !/o\.type === "frequently_bought" && o\.products\.length/.test(deseneaza),
    "filtrul scris de mână a rămas pe lângă predicatul comun",
  );
});

test("⚠⚠ amândouă paginile de produs au DOUĂ balize, nu una", () => {
  for (const f of [
    "src/components/storefront/sections/product/ProductPageClassic.tsx",
    "src/components/storefront/sections/product/ProductPageDetailed.tsx",
  ]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /imparteOferteleDupaAmplasare\(productOffers\)/, `${f}: nu împarte ofertele`);
    assert.match(s, /refSetSus = useAfisariOferte\(business\.id, aseza\.langaPret/, `${f}: setul de sus nu se numără`);
    assert.match(s, /refOferteJos = useAfisariOferte\(business\.id, aseza\.subProdus/, `${f}: banda de jos nu se numără`);
    /* ⚠ Baliza veche, pe toată lista, ar fi numărat ambele bucăți deodată. */
    assert.ok(!/useAfisariOferte\(business\.id, productOffers/.test(s), `${f}: baliza veche a rămas`);
    /* ⚠ Și fiecare înveliș primește CHIAR lista lui, nu lista întreagă. */
    assert.match(s, /<ProductOffers offers=\{aseza\.subProdus\}/, `${f}: banda de jos primește toată lista`);
    assert.match(s, /oferte=\{aseza\.langaPret\}/, `${f}: setul de sus primește altceva`);
    /* ⚠ Învelișul de sus se desenează doar când are ce: altfel, `<div>` gol cu ref. */
    assert.match(s, /aseza\.langaPret\.length > 0 && \(/, `${f}: învelișul de sus nu se gâtuie pe listă`);
  }
});

test("⚠ motivul indisponibilității e scris o dată, nu de două ori", () => {
  /*
   * Îl cer acum DOUĂ locuri: setul de lângă preț și banda de jos. Scris de două
   * ori, butonul de sus ar fi putut rămâne aprins când cel de jos era stins.
   */
  for (const f of [
    "src/components/storefront/sections/product/ProductPageClassic.tsx",
    "src/components/storefront/sections/product/ProductPageDetailed.tsx",
  ]) {
    const s = readFileSync(f, "utf8");
    const cate = s.split('motiv: "Stoc epuizat"').length - 1;
    assert.equal(cate, 1, `${f}: motivul e scris de ${cate} ori`);
  }
});

test("⚠ prețul setului rămâne o singură socoteală, și la cardul îngust", () => {
  /*
   * `ingust` comută NUMAI șiruri de clase. Scris pe ramuri, cardul lat și cel
   * îngust ar fi putut ajunge la două prețuri — iar pe unul dintre ele scrie
   * butonul de cumpărat.
   */
  const s = readFileSync("src/components/ministore/ProductOffers.tsx", "utf8");
  assert.equal(s.split("distributeFbtSavings(").length - 1, 1, "socoteala setului s-a dublat");
});

test("fiecare așezare are un nume și o explicație pe ecran", () => {
  assert.deepEqual(Object.keys(DESPRE_AMPLASARE).sort(), [...AMPLASARI].sort());
  for (const a of AMPLASARI) {
    assert.ok(DESPRE_AMPLASARE[a].eticheta.length > 0);
    assert.ok(DESPRE_AMPLASARE[a].explicatie.length > 10);
  }
});
