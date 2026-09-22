import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cosulDinLinii, deCeNuTrece, numereleCosului, poartaTrece, arePorti } from "./porti";
import { parseOfferTrigger } from "./offer.types";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PORȚILE SE JUDECĂ LA FEL LA AFIȘARE ȘI LA COMANDĂ              (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * „Oferta se arată DOAR dacă coșul trece de 200 de lei.” Patru porți, toate
 * opționale, judecate de O SINGURĂ funcție pe care o cheamă două căi:
 *   1. `resolveCartOffers`  — se vede bump-ul în formular?
 *   2. `refuzaOferta`       — are voie prețul redus la plasare?
 *
 * ⚠⚠ DACĂ CELE DOUĂ SE DESPART, ori clientul vede un bump pe care serverul îl
 * refuză (și atunci comanda CADE, fiindcă orice refuz în afară de „lipsă din
 * comandă” oprește comanda), ori ia unul la care n-avea dreptul — și ăla e bani.
 *
 * ⚠ Măsurat pe producție la 22.09.2026: ZERO din 13 oferte au porți puse. Deci
 * tot ce e aici nu schimbă nimic pentru nimeni până nu bifează cineva ceva.
 */

const cos = (...linii: [string, number, number][]) =>
  cosulDinLinii(linii.map(([productId, quantity, unitPrice]) => ({ productId, quantity, unitPrice })));

/* ── Fără porți, nimic nu se schimbă ────────────────────────────────────── */

test("⚠⚠ o ofertă FĂRĂ porți trece mereu — exact ce fac cele 13 de pe producție", () => {
  const c = cos(["a", 1, 10]);
  assert.equal(deCeNuTrece(undefined, c), null);
  assert.equal(deCeNuTrece(null, c), null);
  assert.equal(deCeNuTrece({}, c), null);
  assert.equal(arePorti(undefined), false);
  assert.equal(arePorti({}), false);
  /* Și pe un coș gol: fără porți nu se întreabă nimic. */
  assert.equal(deCeNuTrece({}, cos()), null);
});

test("⚠ un rând vechi de jsonb nu capătă porți din nimic", () => {
  /*
   * `parseOfferTrigger` e singura poartă între jsonb și regulă. Un rând scris
   * înainte de azi n-are `conditions`, iar parserul nu are voie să inventeze.
   */
  const t = parseOfferTrigger({ scope: "all", productIds: [], categories: [] });
  assert.equal(t.conditions, undefined);
  assert.equal(arePorti(t.conditions), false);
});

/* ── Fiecare poartă, cu numere ──────────────────────────────────────────── */

test("„coșul trece de X lei” se socotește pe ce se ÎNCASEAZĂ", () => {
  const c = cos(["a", 2, 50], ["b", 1, 30]); // 130 lei
  assert.equal(deCeNuTrece({ minValue: 100 }, c), null);
  assert.equal(deCeNuTrece({ minValue: 130 }, c), null, "pragul atins trece, nu cade");
  assert.equal(deCeNuTrece({ minValue: 130.01 }, c), "sub_valoare");
});

test("„cel puțin N bucăți” adună BUCĂȚILE, nu produsele deosebite", () => {
  const c = cos(["a", 3, 10], ["b", 1, 10]); // 4 bucăți, 2 produse
  assert.equal(deCeNuTrece({ minQty: 4 }, c), null);
  assert.equal(deCeNuTrece({ minQty: 5 }, c), "sub_bucati");
});

test("„în coș se află” cere MĂCAR UNUL, nu pe toate", () => {
  /*
   * ⚠ Comerciantul scrie o listă de produse care aprind oferta („dacă ia o
   * imprimantă, oferă-i cerneală”), nu o combinație pe care cumpărătorul
   * trebuie s-o nimerească toată. Cerută ca „toate”, o listă de trei produse
   * n-ar fi căzut aproape niciodată pe nimic.
   */
  const c = cos(["a", 1, 10]);
  assert.equal(deCeNuTrece({ requiredProductIds: ["a", "z"] }, c), null);
  assert.equal(deCeNuTrece({ requiredProductIds: ["y", "z"] }, c), "lipseste_produsul");
  /* O listă goală nu e o cerință: parserul n-o scrie, dar regula nu se bizuie pe el. */
  assert.equal(deCeNuTrece({ requiredProductIds: [] }, c), null);
});

test("„în coș NU se află” cere NICIUNUL — pe dos față de perechea lui", () => {
  const c = cos(["a", 1, 10]);
  assert.equal(deCeNuTrece({ excludedProductIds: ["a", "z"] }, c), "are_produs_exclus");
  assert.equal(deCeNuTrece({ excludedProductIds: ["y", "z"] }, c), null);
});

test("⚠ toate porțile puse trebuie să treacă, nu măcar una", () => {
  const c = cos(["a", 1, 500]);
  /* Valoarea trece, bucățile nu: oferta NU se arată. */
  assert.equal(deCeNuTrece({ minValue: 100, minQty: 5 }, c), "sub_bucati");
});

test("⚠ ordinea motivelor e cea a lucrului de făcut", () => {
  /*
   * Când cad și valoarea, și bucățile, motivul scris în jurnal trebuie să fie
   * cel pe care cumpărătorul îl poate rezolva mai ușor: mai pune în coș.
   */
  const c = cos(["a", 1, 10]);
  assert.equal(deCeNuTrece({ minValue: 100, minQty: 5 }, c), "sub_valoare");
});

/* ── Gaura pe care am găsit-o singur, înainte s-o scriu ─────────────────── */

test("⚠⚠ coșul se judecă FĂRĂ produsele pe care le aduce chiar oferta", () => {
  /*
   * DEFECTUL DE CARE NE APĂRĂM, prins la proiectare, nu în producție:
   *
   * La AFIȘARE, produsul oferit de bump NU e în coș — `resolveCartOffers` îl
   * exclude anume. La COMANDĂ el E deja linie, fiindcă altfel oferta n-ar avea
   * ce revendica.
   *
   * Deci o cerere meșteșugită, cu un coș de 150 de lei și bump-ul de 60, ar fi
   * trecut la plasare o poartă de „peste 200 de lei” — cu CHIAR produsul pe care
   * poarta trebuia să-l păzească.
   */
  const porti = { minValue: 200 };
  const laAfisare = cos(["cos", 1, 150]);
  const laComanda = cos(["cos", 1, 150], ["oferit", 1, 60]); // 210 lei

  assert.equal(deCeNuTrece(porti, laAfisare, ["oferit"]), "sub_valoare");
  assert.equal(
    deCeNuTrece(porti, laComanda, ["oferit"]),
    "sub_valoare",
    "produsul adus de ofertă și-a deschis singur poarta",
  );
  /* Fără scoaterea lui, poarta s-ar fi deschis — asta e chiar defectul: */
  assert.equal(deCeNuTrece(porti, laComanda, []), null);
});

test("scoaterea e pe PRODUS, deci nu atinge celelalte linii", () => {
  const c = cos(["a", 2, 100], ["oferit", 3, 10]);
  const n = numereleCosului(c, ["oferit"]);
  assert.equal(n.lei, 200);
  assert.equal(n.bucati, 2);
  assert.deepEqual([...n.produse], ["a"]);
});

/* ── Curățarea coșului ──────────────────────────────────────────────────── */

test("⚠ cantitățile negative nu scad din numărul de bucăți", () => {
  /* Un „-5” trimis de mână ar fi scăzut din total și ar fi deschis o poartă. */
  const c = cos(["a", -5, 100], ["b", 2, 10]);
  const n = numereleCosului(c);
  assert.equal(n.bucati, 2);
  assert.equal(n.lei, 20);
});

test("⚠ același produs pe două linii se ADUNĂ, nu se înlocuiește", () => {
  /* Două variante ale aceluiași produs sunt două linii cu același `productId`. */
  const c = cos(["a", 1, 100], ["a", 2, 50]);
  const n = numereleCosului(c);
  assert.equal(n.bucati, 3);
  assert.equal(n.lei, 200);
});

test("banii se rotunjesc la doi zecimali, nu se târăsc", () => {
  const c = cos(["a", 3, 0.1]);
  assert.equal(numereleCosului(c).lei, 0.3);
});

/* ── Plasa care ține cele două căi lipite ───────────────────────────────── */

test("⚠⚠ AFIȘAREA și COMANDA cheamă aceeași funcție, nu două copii", () => {
  /*
   * Plasa de temelie. Dacă vreodată una dintre cele două își scrie propria
   * socoteală, cele două se despart fără să dea vreo eroare — iar atunci ori
   * clientul vede un bump pe care serverul îl refuză, ori ia unul la care n-avea
   * dreptul.
   */
  const afisare = readFileSync("src/lib/offers/offers.ts", "utf8");
  const comanda = readFileSync("src/lib/offers/offer-pricing.ts", "utf8");

  assert.match(afisare, /poartaTrece\(o\.trigger\.conditions, cosDePoarta, o\.config\.productIds\)/);
  assert.match(comanda, /deCeNuTrece\(o\.trigger\.conditions, ctx\.cos, o\.config\.productIds\)/);

  /* ⚠ AMÂNDOUĂ trec `o.config.productIds` — fără el, gaura de mai sus se
     redeschide numai pe una dintre căi, adică tocmai pe cea cu bani. */
  for (const [nume, sursa] of [["afișarea", afisare], ["comanda", comanda]] as const) {
    assert.ok(
      /conditions, [\w.]+, o\.config\.productIds\)/.test(sursa),
      `${nume} nu mai scoate din coș produsele pe care le aduce chiar oferta`,
    );
  }

  /*
    ⚠ Și niciuna nu CITEȘTE ea însăși câmpurile porții.

    ⚠⚠ PE CITIREA DE CÂMP (`.minQty`), NU PE NUMELE GOL. Plasa era pe numele
    simplu și a căzut pe propriul meu comentariu: `bucatileDeclansatorului` spune
    în proză că „e altceva decât poarta `minQty`”, iar plasa a citit asta ca pe o
    a doua socoteală. E a cincea oară când un comentariu îmi declanșează propria
    plasă. O proză care numește o regulă nu e o a doua implementare a ei; ce
    trebuie oprit e CITIREA câmpului, fiindcă doar de acolo poate porni o
    comparație scrisă a doua oară.
  */
  for (const [nume, sursa] of [["offers.ts", afisare], ["offer-pricing.ts", comanda]] as const) {
    assert.ok(!/\.minValue\b/.test(sursa), `${nume} judecă singur pragul pe lei`);
    assert.ok(!/\.minQty\b/.test(sursa), `${nume} judecă singur pragul pe bucăți`);
  }
});

test("⚠⚠ un refuz de poartă OPREȘTE comanda, ca orice alt refuz în afară de „lipsă”", () => {
  /*
   * ⚠ E hotărât dinadins așa. Un bump nu promite doar un preț, ci ADAUGĂ UN
   * PRODUS: lăsat în comandă la preț întreg, ecranul ar scrie una și curierul ar
   * încasa alta. De-aia poarta de la AFIȘARE trebuie să fie largă, nu strâmtă.
   */
  const sursa = readFileSync("src/lib/offers/offer-pricing.ts", "utf8");
  const de = sursa.indexOf("export function opresteComanda");
  /* ⚠ Se taie la acolada de pe COLOANA ZERO, nu la prima acoladă: prima e a
     tipului argumentului (`{ motiv: MotivRefuz }`), iar felia se oprea înainte
     de corp și proba cădea pe o bucată goală. */
  const corp = sursa.slice(de, sursa.indexOf("\n}", de));
  assert.match(corp, /r\.motiv !== "lipsa_din_comanda"/);
  assert.ok(!corp.includes("poarta"), "poarta a fost scutită de oprirea comenzii");
});

test("⚠ coșul intră OBLIGATORIU în contextul comenzii", () => {
  /*
   * Lăsat opțional, un apelant care uită să-l dea ar fi trecut toate porțile în
   * tăcere, iar comerciantul ar fi crezut că regula lui merge.
   */
  const sursa = readFileSync("src/lib/offers/offer-pricing.ts", "utf8");
  assert.match(sursa, /^ {2}cos: CosulDeJudecat;$/m);
  assert.ok(!/^ {2}cos\?: /m.test(sursa), "coșul a devenit opțional");
});

test("⚠ ancora intră în coșul de porți, deși nu e linie în `items`", () => {
  /*
   * Pe calea comenzii directe, produsul din formular NU e în `items`: acelea
   * sunt doar liniile purtate din coș. Uitat, „cel puțin 2 bucăți” n-ar fi
   * numărat chiar produsul de pe care se comandă.
   */
  const sursa = readFileSync("src/lib/offers/offers.ts", "utf8");
  assert.match(sursa, /productId: ctx\.anchor\.productId, quantity: ctx\.anchor\.bucati/);
});

test("⚠⚠ ce vine din browser hotărăște doar CE SE ARATĂ, niciodată prețul", () => {
  /*
   * Coșul trimis de browser e o afirmație, nu o dovadă. E în regulă să decidă ce
   * se vede: a arăta o ofertă nu costă niciun ban. Prețul se ia din bază, iar
   * poarta se pune din nou la plasare, pe liniile adevărate.
   */
  const actiuni = readFileSync("src/lib/actions/offer.actions.ts", "utf8");
  assert.match(actiuni, /liniiSpuseDeBrowser/);
  /* Cantitățile și prețurile venite de afară se plafonează înainte de socoteală. */
  assert.match(actiuni, /Math\.max\(0, Math\.min\(10_000/);
  assert.match(actiuni, /Math\.max\(0, Math\.min\(1_000_000/);
});

test("fără coș spus de browser, o poartă pe lei NU se arată", () => {
  /*
   * ⚠ Partea strâmtă a alegerii, scrisă pe față: mai bine o ofertă nearătată
   * decât una arătată și refuzată la plasare, fiindcă refuzul oprește comanda.
   */
  assert.equal(poartaTrece({ minValue: 1 }, cosulDinLinii([])), false);
  /* Dar o ofertă fără porți se arată oricum, ca azi. */
  assert.equal(poartaTrece(undefined, cosulDinLinii([])), true);
});
