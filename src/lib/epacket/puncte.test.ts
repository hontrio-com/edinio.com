import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { PunctEpacket } from "./client";
import { codPostalPentru, codulCelMaiDes, kgMaximPunct, puncteDeCheckout } from "./puncte";

/* Puncte REALE din Cluj-Napoca (localitatea 109), citite de la ei pe 07.10.2026. */
const DPD: PunctEpacket[] = [
  { id: "909", nume: "CLUJ", tip: "office", adresa: "or. Cluj-Napoca [400398] str. Orastiei Nr 10", codPostal: "400001", localitateId: 109, lat: 46.779161, lng: 23.659401 },
  { id: "20547", nume: "CLUJ NAPOCA - LUNII (DPD SHOP)", tip: "office", adresa: "or. Cluj-Napoca [400367] str. Lunii Nr 5", codPostal: "400001", localitateId: 109, lat: 46.75142, lng: 23.57964 },
  { id: "28005", nume: "CLUJ-NAPOCA - BACIULUI 15 (OUTDOOR LOCKER)", tip: "locker", adresa: "or. Cluj-Napoca [400277] cal. Baciului Nr 15", codPostal: "400001", localitateId: 109, lat: 46.783043, lng: 23.558524 },
];
const SDY: PunctEpacket[] = [
  { id: "79", nume: "easybox MOL Primaverii", tip: "locker", adresa: "Str. Almasului, Nr. 9", codPostal: "400663", localitateId: 109, lat: 46.758651, lng: 23.558031 },
  { id: "80", nume: "easybox OMV Marasti (Giratoriu)", tip: "locker", adresa: "Piata Marasti, FN", codPostal: "400607", localitateId: 109, lat: 46.777647, lng: 23.615312 },
  { id: "81", nume: "easybox OMV Calea Floresti", tip: "locker", adresa: "Cal. Floresti, Nr. 56", codPostal: "400663", localitateId: 109, lat: 46.758561, lng: 23.549503 },
];
const FAN: PunctEpacket[] = [
  { id: "F1000142", nume: "FANbox Fabricii 89 CJ", tip: "locker", adresa: "Str. Fabricii 89, Cluj-Napoca", codPostal: "400625", localitateId: 109, lat: 46.7877104, lng: 23.615008 },
  { id: "P123", nume: "PayPoint Magazin", tip: "paypoint", adresa: "Str. X 1", codPostal: "400001", localitateId: 109, lat: 46.7, lng: 23.6 },
];

test("codul postal: al comenzii intai, apoi al oficiilor DPD, apoi cel mai des", () => {
  assert.deepEqual(codPostalPentru({ dinComanda: " 400 123", puncteDpd: DPD }), { cod: "400123", sursa: "comanda" });
  assert.deepEqual(codPostalPentru({ dinComanda: "", puncteDpd: DPD, alte: SDY }), { cod: "400001", sursa: "localitate" });
  assert.deepEqual(codPostalPentru({ dinComanda: "4000", puncteDpd: [], alte: SDY }), { cod: "400663", sursa: "localitate" });
  assert.equal(codPostalPentru({ dinComanda: null, puncteDpd: null, alte: null }), null, "fara puncte, il scrie omul");
});

test("cel mai des: la egalitate castiga codul mai mic, ca alegerea sa nu atarne de ordinea lor", () => {
  assert.equal(codulCelMaiDes([SDY[1], SDY[0]]), "400607");
  assert.equal(codulCelMaiDes([{ ...SDY[0], codPostal: "4006" }]), null);
});

test("checkoutul: la FAN doar FANbox, id-ul ramane sir neatins", () => {
  const f = puncteDeCheckout("FCR", FAN, { nume: "Cluj Napoca", judet: "Cluj" });
  assert.deepEqual(f.map((p) => p.id), ["F1000142"]);
  assert.equal(f[0].city, "Cluj Napoca");
  const d = puncteDeCheckout("DPD", DPD, { nume: "Cluj Napoca", judet: "Cluj" });
  assert.equal(d.length, 3, "la DPD si oficiile si lockerele");
});

test("fara coordonate, punctul nu se ofera", () => {
  assert.equal(puncteDeCheckout("SDY", [{ ...SDY[0], lat: null }], { nume: "x", judet: "y" }).length, 0);
});

test("pragurile retelelor, din tabelul lor", () => {
  assert.equal(kgMaximPunct("SDY"), 20);
  assert.equal(kgMaximPunct("DPD"), 15);
  assert.equal(kgMaximPunct("CGS"), 15);
  assert.equal(kgMaximPunct("FCR"), 30);
});
