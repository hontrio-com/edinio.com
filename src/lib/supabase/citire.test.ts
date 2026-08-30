import assert from "node:assert/strict";
import { test } from "node:test";
import { citireCazuta, intrebareFaraSens } from "./citire";

test("fara eroare nu e cadere, oricare ar fi randul", () => {
  assert.equal(citireCazuta(null, null), false);
  assert.equal(citireCazuta(undefined, { id: "x" }), false);
});

test("o eroare adevarata cu rand null E cadere", () => {
  assert.equal(citireCazuta({ code: "57014", message: "statement timeout" } as never, null), true);
});

/*
 * ⚠ Cele doua coduri care NU au voie sa treaca drept cadere.
 *
 * Rutele care folosesc poarta asta sunt PUBLICE si nesemnate, iar poarta produce
 * 5xx si alarme critice. Daca „nu exista randul" sau „id-ul nu e uuid" ar intra
 * pe ea, orice strain ar putea cere in bucla si ar obtine reincercari la
 * procesator plus un flux de alarme care ingroapa incidentele adevarate.
 */
test("PGRST116 (zero randuri pe .single()) NU e cadere", () => {
  assert.equal(citireCazuta({ code: "PGRST116", message: "no rows" } as never, null), false);
});

test("22P02 (id care nu e uuid) NU e cadere", () => {
  assert.equal(citireCazuta({ code: "22P02", message: "invalid input syntax for type uuid" } as never, null), false);
  assert.equal(intrebareFaraSens({ code: "22P02" } as never), true);
  assert.equal(intrebareFaraSens({ code: "57014" } as never), false);
  assert.equal(intrebareFaraSens(null), false);
});

test("eroare reala dar cu rand prezent nu blocheaza", () => {
  // Nu se cunoaste caz real, dar regula e explicita: fara rand lipsa, nu e cadere.
  assert.equal(citireCazuta({ code: "57014", message: "x" } as never, { id: "a" }), false);
});
