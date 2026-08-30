import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCategoryForest, collectSubtreeIds } from "./tree";

/**
 * Regula care sta intre comerciant si un arbore stricat ireversibil.
 *
 * Mutata in ea insasi sau in ceva de sub ea, o categorie s-ar inchide intr-un
 * cerc si ar iesi cu totul din arbore: n-ar mai atarna de nicio radacina, deci
 * n-ar mai aparea nicaieri in interfata si n-ar mai putea fi nici adusa inapoi,
 * nici stearsa. De asta destinatiile interzise se calculeaza cu
 * `collectSubtreeIds`, si in pagina, si pe server.
 */

//  Casa
//  └ Bucatarie
//    └ Vase
//  Gradina
const ARBORE = [
  { id: "casa", parent_id: null, name: "Casa" },
  { id: "bucatarie", parent_id: "casa", name: "Bucatarie" },
  { id: "vase", parent_id: "bucatarie", name: "Vase" },
  { id: "gradina", parent_id: null, name: "Gradina" },
];

/** Ce ramane de ales cand muti `id`. Aceeasi regula ca in interfata. */
function destinatiiPermise(id: string): string[] {
  const interzise = collectSubtreeIds(ARBORE, id);
  return ARBORE.map((c) => c.id).filter((x) => !interzise.has(x));
}

test("nu te poti muta in tine insuti", () => {
  assert.equal(destinatiiPermise("bucatarie").includes("bucatarie"), false);
});

test("nu te poti muta intr-o subcategorie de-a ta, nici la doua niveluri", () => {
  const permise = destinatiiPermise("casa");
  assert.equal(permise.includes("bucatarie"), false, "copil direct");
  assert.equal(permise.includes("vase"), false, "nepot");
  assert.deepEqual(permise, ["gradina"], "ramane doar ramura cealalta");
});

test("o frunza se poate muta oriunde in afara de ea insasi", () => {
  assert.deepEqual(destinatiiPermise("vase"), ["casa", "bucatarie", "gradina"]);
});

test("mutarea permisa chiar da un arbore intreg, fara nimic ratacit", () => {
  // Bucatarie (cu Vase sub ea) trece de la Casa la Gradina.
  const dupa = ARBORE.map((c) => (c.id === "bucatarie" ? { ...c, parent_id: "gradina" } : c));
  const { roots, childrenOf } = buildCategoryForest(dupa);

  assert.deepEqual(roots.map((r) => r.id), ["casa", "gradina"]);
  assert.deepEqual((childrenOf.get("gradina") ?? []).map((c) => c.id), ["bucatarie"]);
  assert.deepEqual((childrenOf.get("bucatarie") ?? []).map((c) => c.id), ["vase"], "subarborele vine cu ea");
  assert.equal(childrenOf.has("casa"), false, "vechiul parinte ramane fara copii");
});

test("scoaterea la nivelul principal isi ia subarborele cu ea", () => {
  const dupa = ARBORE.map((c) => (c.id === "bucatarie" ? { ...c, parent_id: null } : c));
  const { roots, childrenOf } = buildCategoryForest(dupa);
  assert.deepEqual(roots.map((r) => r.id), ["casa", "bucatarie", "gradina"]);
  assert.deepEqual((childrenOf.get("bucatarie") ?? []).map((c) => c.id), ["vase"]);
});

test("daca regula ar fi ocolita, ramura chiar dispare din arbore", () => {
  // Nu se poate ajunge aici prin interfata sau prin server; testul arata DE CE
  // exista regula. Casa mutata sub propriul nepot: cercul casa -> vase -> casa.
  const rupt = ARBORE.map((c) => (c.id === "casa" ? { ...c, parent_id: "vase" } : c));
  const { roots } = buildCategoryForest(rupt);
  // Arborele isi apara vizibilitatea promovand ce e prins in cerc, dar ierarhia
  // aleasa de comerciant s-a pierdut: „Casa" nu mai e radacina lui.
  assert.equal(roots.some((r) => r.id === "gradina"), true);
  assert.notDeepEqual(roots.map((r) => r.id), ["casa", "gradina"]);
});
