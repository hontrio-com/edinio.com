import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveActions } from "./actions";

const TOATE = ["cautare", "telefon", "whatsapp", "cos"] as const;

test("fara setare salvata pastreaza ordinea implicita", () => {
  assert.deepEqual(resolveActions(undefined, TOATE, TOATE), ["cautare", "telefon", "whatsapp", "cos"]);
});

test("respecta ordinea si actiunile stinse", () => {
  const salvat = [
    { key: "cos", on: true },
    { key: "telefon", on: false },
    { key: "cautare", on: true },
  ];
  assert.deepEqual(resolveActions(salvat, TOATE, TOATE), ["cos", "cautare", "whatsapp"]);
});

test("actiunile fara date in magazin dispar, oricat ar fi de aprinse", () => {
  // Telefon aprins in setari, dar necompletat in magazin: iconita ar duce nicaieri.
  const salvat = [{ key: "telefon", on: true }, { key: "cos", on: true }];
  assert.deepEqual(resolveActions(salvat, ["cos"], TOATE), ["cos"]);
});

test("o actiune noua apare la coada, nu dispare", () => {
  // Setare salvata inainte ca „cautare" sa existe.
  const salvat = [{ key: "cos", on: true }, { key: "whatsapp", on: true }];
  assert.deepEqual(resolveActions(salvat, TOATE, TOATE), ["cos", "whatsapp", "cautare", "telefon"]);
});

test("intrarile stricate sau duplicate se ignora", () => {
  const salvat = [{ key: "cos", on: true }, { key: "cos", on: true }, { key: "inexistent", on: true }, null, 7];
  assert.deepEqual(resolveActions(salvat, ["cos", "telefon"], ["cos", "telefon"]), ["cos", "telefon"]);
});
