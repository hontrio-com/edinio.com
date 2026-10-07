import { strict as assert } from "node:assert";
import { test } from "node:test";

import { livrareaComenzii } from "./livrare";

/*
 * Unde merge coletul e-packet. ⚠ Cazul care a costat: comanda pentru un FANbox prin Curiera,
 * deschisa in fereastra e-packet, pleca LA ADRESA, iar adresa era a FANbox-ului (vezi `livrare.ts`).
 */

const FANBOX = {
  city: "Sector 3", county: "Municipiul Bucuresti",
  address: "Bd. Theodor Pallady 51, Bucuresti",
  courier: "curiera", courier_label: "Curiera: locker sau punct de ridicare",
  delivery_type: "locker", locker_id: "16478", locker_name: "FANbox Kaufland Theodor Pallady",
  locker_address: "Bd. Theodor Pallady 51, Bucuresti",
};

test("livrarea obisnuita: linia de adresa a clientului", () => {
  assert.deepEqual(livrareaComenzii({ address: "Str. Mare 12" }), { fel: "adresa", linie: "Str. Mare 12" });
  assert.deepEqual(livrareaComenzii(null), { fel: "adresa", linie: "" });
});

test("⚠⚠ punctul altui curier: acasa, din `home_address`, NICIODATA din adresa punctului", () => {
  const r = livrareaComenzii({ ...FANBOX, home_address: "Bd. Unirii nr. 5, bl. A1, ap. 12" });
  assert.equal(r.fel, "punct_strain");
  assert.ok(r.fel === "punct_strain");
  assert.equal(r.linieAcasa, "Bd. Unirii nr. 5, bl. A1, ap. 12");
  assert.equal(r.numePunct, "FANbox Kaufland Theodor Pallady");
  assert.equal(r.curierPunct, "Curiera: locker sau punct de ridicare");
});

test("⚠ punctul altui curier FARA adresa de acasa: strada ramane goala, nu se ia a punctului", () => {
  const r = livrareaComenzii(FANBOX);
  assert.ok(r.fel === "punct_strain");
  assert.equal(r.linieAcasa, "");
  assert.notEqual(r.linieAcasa, FANBOX.address, "adresa punctului nu are voie sa ajunga in linia de livrare");
});

test("punctul e-packet: reteaua din id; id-ul strain e semnalat, nu ghicit", () => {
  const r = livrareaComenzii({ courier: "epacket", delivery_type: "locker", locker_id: "SDY:79", locker_name: "easybox X" });
  assert.deepEqual(r, { fel: "punct", punct: { curier: "SDY", id: "79" }, nume: "easybox X" });
  assert.deepEqual(livrareaComenzii({ courier: "epacket", delivery_type: "locker", locker_id: "79" }), { fel: "punct_nevalid" });
  /* Marimea literelor din `courier` nu schimba nimic. */
  assert.equal(livrareaComenzii({ courier: " ePacket ", delivery_type: "locker", locker_id: "DPD:1" }).fel, "punct");
});

test("un curier strain fara nume de punct sau eticheta tot primeste ceva lizibil", () => {
  const r = livrareaComenzii({ courier: "sameday", delivery_type: "locker", locker_id: "5" });
  assert.ok(r.fel === "punct_strain");
  assert.equal(r.numePunct, "un punct de ridicare");
  assert.equal(r.curierPunct, "sameday");
});
