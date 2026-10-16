import { strict as assert } from "node:assert";
import { test } from "node:test";
import { meniulUrmator, type StareMeniu } from "./meniu-stare";
import { TOP_NAV, type MenuId } from "./nav";

const [a, b] = TOP_NAV.map((x) => ("menu" in x ? x.menu : undefined)).filter((x): x is MenuId => !!x);

test("închis și cerut închis: ACELAȘI obiect, ca React să nu redeseneze bara la fiecare atingere", () => {
  const inchis: StareMeniu = { open: null, instant: false };
  assert.equal(meniulUrmator(inchis, null), inchis);
});

test("deschiderea, închiderea și trecerea de la un panou la altul (numai aceasta fără animație)", () => {
  assert.ok(a && b, "trebuie cel puțin două meniuri în bară");
  const inchis: StareMeniu = { open: null, instant: false };
  assert.deepEqual(meniulUrmator(inchis, a), { open: a, instant: false });
  assert.deepEqual(meniulUrmator({ open: a, instant: false }, b), { open: b, instant: true });
  assert.deepEqual(meniulUrmator({ open: b, instant: true }, null), { open: null, instant: false });
  assert.notEqual(meniulUrmator({ open: a, instant: false }, null), inchis);
});
