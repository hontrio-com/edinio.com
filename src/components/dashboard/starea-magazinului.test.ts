import { strict as assert } from "node:assert";
import { test } from "node:test";

import { stareMagazin } from "../../lib/stare-magazin";
import { curataTermen } from "../../lib/cautare-termen";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  BULINA DE LANGA ADRESA MAGAZINULUI
  ═══════════════════════════════════════════════════════════════════════════════

  Pana acum era verde intotdeauna, si nu insemna nimic. Regula ceruta
  (20.09.2026): verde = publicat si domeniu bun, galben = nepublicat, rosu =
  domeniul nu raspunde.
*/

type Magazin = Parameters<typeof stareMagazin>[0];
const magazin = (x: Partial<NonNullable<Magazin>>): Magazin =>
  ({ is_published: true, custom_domain: null, custom_domain_healthy: null, ...x }) as NonNullable<Magazin>;

test("publicat, fara domeniu propriu: verde", () => {
  assert.equal(stareMagazin(magazin({})).culoare, "bg-success");
});

test("nepublicat: galben, chiar daca are domeniu", () => {
  assert.equal(stareMagazin(magazin({ is_published: false })).culoare, "bg-warning");
  assert.equal(
    stareMagazin(magazin({ is_published: false, custom_domain: "exemplu.ro", custom_domain_healthy: true })).culoare,
    "bg-warning",
  );
});

test("publicat, cu domeniu cazut: rosu", () => {
  assert.equal(
    stareMagazin(magazin({ custom_domain: "exemplu.ro", custom_domain_healthy: false })).culoare,
    "bg-destructive",
  );
});

test("⚠ nepublicat SI cu domeniu cazut ramane GALBEN", () => {
  /* Ordinea nu e o scapare: pe un magazin inchis, un domeniu cazut nu e problema
     zilei, iar rosul l-ar fi trimis sa repare DNS pentru un magazin care oricum
     nu e deschis. Intai il publica. */
  assert.equal(
    stareMagazin(magazin({ is_published: false, custom_domain: "exemplu.ro", custom_domain_healthy: false })).culoare,
    "bg-warning",
  );
});

test("⚠ domeniu NEVERIFICAT nu inseamna cazut", () => {
  /* `custom_domain_healthy === null` inseamna „inca nu s-a verificat". Tratat ca
     esec, fiecare domeniu nou ar fi aratat rosu in primele minute dupa adaugare. */
  assert.equal(
    stareMagazin(magazin({ custom_domain: "exemplu.ro", custom_domain_healthy: null })).culoare,
    "bg-success",
  );
});

test("fara magazin, bulina nu minte cu verde", () => {
  assert.equal(stareMagazin(null).culoare, "bg-warning");
});

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TERMENUL DE CAUTARE, INAINTE SA AJUNGA IN FILTRU
  ═══════════════════════════════════════════════════════════════════════════════
*/

test("⚠ virgula si parantezele nu ajung in filtrul PostgREST", () => {
  /* Acolo sunt SINTAXA: un client „Pop, Ion" ar fi rupt lista de conditii in
     doua, iar cautarea ar fi intors ori nimic, ori o eroare. */
  assert.equal(curataTermen("Pop, Ion"), "Pop Ion");
  assert.equal(curataTermen("set (3) pendule"), "set 3 pendule");
});

test("⚠ jokerii nu se strecoara in cautare", () => {
  /* „50%" cu `%` lasat inauntru ar fi potrivit orice. */
  assert.equal(curataTermen("reducere 50%"), "reducere 50");
  assert.equal(curataTermen("a*b_c"), "a b c");
});

test("termenul se scurteaza si se curata de spatii", () => {
  assert.equal(curataTermen("   portofel   premium  "), "portofel premium");
  assert.equal(curataTermen("x".repeat(200)).length, 60);
});
