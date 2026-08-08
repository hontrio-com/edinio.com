import assert from "node:assert/strict";
import { test } from "node:test";
import { alegePalier, citesteSteag, PRAG_CATALOG_SERVER } from "./tier";

const p = (pageContent: unknown, totalProduse: number, cauta = false) =>
  alegePalier({ pageContent, totalProduse, cauta });

test("implicit: sub prag ramane in browser, peste prag trece pe server", () => {
  assert.equal(p(null, PRAG_CATALOG_SERVER - 1), "client");
  assert.equal(p(null, PRAG_CATALOG_SERVER), "server");
});

test("steagul bate pragul, in ambele sensuri", () => {
  // „on" pe un magazin mic: asa se testeaza palierul server fara sa astepti sa
  // creasca cineva la 400 de produse.
  assert.equal(p({ catalog_server: "on" }, 3), "server");
  // „off" pe unul mare: asta E butonul de rollback, si trebuie sa tina.
  assert.equal(p({ catalog_server: "off" }, 100000), "client");
});

test("o valoare necunoscuta in steag se citeste ca auto, nu ca on", () => {
  // page_content e jsonb scris de mai multe cai; o valoare stricata n-are voie
  // sa mute un magazin pe o cale noua fara ca nimeni sa fi cerut-o.
  assert.equal(citesteSteag({ catalog_server: "da" }), "auto");
  assert.equal(citesteSteag({ catalog_server: true }), "auto");
  assert.equal(citesteSteag(null), "auto");
  assert.equal(p({ catalog_server: "DA" }, 10), "client");
});

test("cautarea inchide palierul server, chiar si cu steagul pe on", () => {
  // Cautarea e inca in browser si are nevoie de tot catalogul. Conditia asta se
  // STERGE cand cautarea se muta in SQL.
  assert.equal(p({ catalog_server: "on" }, 100000, true), "client");
  assert.equal(p(null, 100000, true), "client");
});

test("un catalog gol nu trece pe server", () => {
  assert.equal(p(null, 0), "client");
});
