import { strict as assert } from "node:assert";
import { test } from "node:test";

import { CONTACT_EPACKET, hotarareaDezlegarii } from "./dezlegare";

test("anulat la ei: singurul drum spus drept reusita", () => {
  const h = hotarareaDezlegarii("813", { fel: "stare", status: "anulat", eticheta: "Anulat" });
  assert.equal(h.anulatLaCurier, true);
});

test("⚠ viu la ei: se spune ca ramane platit si viu, cu contactul lor", () => {
  const h = hotarareaDezlegarii("813", { fel: "stare", status: "creat", eticheta: "Creat" });
  assert.equal(h.anulatLaCurier, false);
  assert.match(h.despreCurier, /inca viu/);
  assert.ok(h.despreCurier.includes(CONTACT_EPACKET));
});

test("fara cheie, negasit, sau citire picata: NICIODATA „anulat”", () => {
  for (const c of [{ fel: "fara_config" }, { fel: "negasit" }, { fel: "eroare", mesaj: "500" }] as const) {
    const h = hotarareaDezlegarii("813", c);
    assert.equal(h.anulatLaCurier, false, c.fel);
    assert.ok(h.despreCurier.includes(CONTACT_EPACKET), c.fel);
  }
  assert.match(hotarareaDezlegarii("813", { fel: "negasit" }).despreCurier, /test fata de live/);
});

test("o stare necunoscuta nu e anulare", () => {
  assert.equal(hotarareaDezlegarii("813", { fel: "stare", status: "anulat_partial", eticheta: "" }).anulatLaCurier, false);
});
