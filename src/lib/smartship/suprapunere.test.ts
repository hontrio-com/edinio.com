import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { curierulNostru, suprapuneri, textSuprapunere } from "./suprapunere";

const CURIERI = [
  { id: 1, nume: "Cargus" },
  { id: 2, nume: "SameDay" },
  { id: 12, nume: "SameDay EasyBox" },
  { id: 5, nume: "DragonStar" },
  { id: 19, nume: "FedEx" },
];

describe("SmartShip: cine se suprapune cu integrarile directe", () => {
  test("recunoaste curierii nostri dupa nume, nu dupa id", () => {
    assert.equal(curierulNostru("Cargus")?.id, "cargus");
    assert.equal(curierulNostru("SameDay EasyBox")?.id, "sameday");
    assert.equal(curierulNostru("FanCourier")?.id, "fan-courier");
    assert.equal(curierulNostru("FAN Courier")?.id, "fan-courier");
    assert.equal(curierulNostru("DragonStar"), null);
    /* ⚠ Din 16.08.2026 FedEx E integrare directa, deci SE suprapune. Pana atunci
       randul asta astepta `null` — iar lasat asa, avertismentul de dublura n-ar mai
       fi aparut niciodata pentru singurul curier care tocmai devenise dublura. */
    assert.equal(curierulNostru("FedEx")?.id, "fedex");
    assert.equal(curierulNostru(""), null);
  });

  test("semnaleaza doar curierii pe care ii avem si direct", () => {
    const s = suprapuneri(CURIERI, ["cargus", "dpd"]);
    assert.deepEqual(s.map((x) => x.id), ["cargus"]);
  });

  test("acelasi curier de-al nostru nu apare de doua ori", () => {
    /* SameDay si SameDay EasyBox sunt acelasi curier pentru noi. */
    const s = suprapuneri(CURIERI, ["sameday"]);
    assert.equal(s.length, 1);
    assert.equal(s[0].id, "sameday");
  });

  /*
   * ⚠ Un avertisment care apare cand problema e deja rezolvata il invata pe om
   * sa nu se mai uite la avertismente.
   */
  test("un curier scos din lista comerciantului nu mai e o suprapunere", () => {
    assert.equal(suprapuneri(CURIERI, ["cargus"], [2, 12]).length, 0);
    assert.equal(suprapuneri(CURIERI, ["cargus"], [1]).length, 1);
  });

  test("fara nimic activ direct, nu e nicio suprapunere", () => {
    assert.equal(suprapuneri(CURIERI, []).length, 0);
    assert.equal(textSuprapunere([]), null);
  });
});

describe("SmartShip: textul avertismentului", () => {
  test("enumera curierii si nu pomeneste un numar de cai", () => {
    const text = textSuprapunere(suprapuneri(CURIERI, ["cargus", "sameday"]))!;
    assert.ok(text.includes("Cargus"));
    assert.ok(text.includes("Sameday"));
    /* La SmartShip caile pot fi patru; un numar scris ar fi o minciuna comoda. */
    assert.equal(text.includes("de doua ori"), false);
  });

  test("acordul se schimba la un singur curier", () => {
    const unul = textSuprapunere(suprapuneri(CURIERI, ["cargus"]))!;
    assert.ok(unul.includes("apare si pe contractul"));
    assert.ok(unul.includes("scoate-l"));

    const doi = textSuprapunere(suprapuneri(CURIERI, ["cargus", "sameday"]))!;
    assert.ok(doi.includes("apar si pe contractul"));
    assert.ok(doi.includes("scoate-i"));
  });
});
