import { test } from "node:test";
import assert from "node:assert/strict";
import { awbViu, awburile, codulLivrarii, codulStarii, decide } from "./stari";
import { CURIERI_EASYSALES, curierulDupaId } from "./curieri";
import { NUME_CURIER } from "@/lib/orders/awb-propriu";
import type { ComandaEasySales } from "./tipuri";

const AWB = (numar: string, livrare: number | null, curier = 4) =>
  ({ awb_id: [numar], courier: { id: curier, name: "FanCourier" }, delivery_status: livrare === null ? null : { value: livrare } });

const C = (p: Partial<ComandaEasySales>): ComandaEasySales => ({ status: 1, total_value: "100.00", shipments: [], ...p });

test("codul starii: numar, text si forma „0 -> Canceled”; necunoscutul da null", () => {
  assert.equal(codulStarii(4), 4);
  assert.equal(codulStarii("4"), 4);
  assert.equal(codulStarii("Canceled"), 0);
  assert.equal(codulStarii("Cancelled"), 0);
  assert.equal(codulStarii("0 -> Canceled"), 0);
  assert.equal(codulStarii("6 -> Return"), 6);
  assert.equal(codulStarii("Returned"), 6);
  assert.equal(codulStarii(9), null);
  assert.equal(codulStarii("Altceva"), null);
  assert.equal(codulStarii(null), null);
});

test("codul livrarii: din `{value}`, din text sau direct", () => {
  assert.equal(codulLivrarii({ value: 4, description: "Delivered" }), 4);
  assert.equal(codulLivrarii({ value: "2" }), 2);
  assert.equal(codulLivrarii({ description: "On Route" }), 2);
  assert.equal(codulLivrarii(7), 7);
  assert.equal(codulLivrarii({ value: 9 }), null);
  assert.equal(codulLivrarii(null), null);
});

test("AWB-ul viu e cel mai nou neanulat; numerele se citesc si ca scalar", () => {
  const a = awburile(C({ shipments: [AWB("111", 2), { awb_id: "222", courier: { id: 2 }, delivery_status: { value: 7 } }] }));
  assert.equal(a.length, 2);
  assert.deepEqual(a[1].numere, ["222"]);
  assert.equal(a[1].curier, "dpd");
  assert.deepEqual(awbViu(a)?.numere, ["111"]);
  assert.equal(awbViu([]), null);
});

test("harta starilor, inainte", () => {
  assert.equal(decide(C({ status: 4 }), "pending", 100).tinta, "processing");
  assert.equal(decide(C({ status: 4 }), "confirmed", 100).tinta, "processing");
  assert.equal(decide(C({ status: 2, shipments: [AWB("1", 1)] }), "pending", 100).tinta, "processing");
  assert.equal(decide(C({ status: 2, shipments: [AWB("1", 6)] }), "pending", 100).tinta, "processing");
  assert.equal(decide(C({ status: 4, shipments: [AWB("1", 2)] }), "processing", 100).tinta, "shipped");
  assert.equal(decide(C({ status: 4, shipments: [AWB("1", 3)] }), "processing", 100).tinta, "shipped");
  assert.equal(decide(C({ status: 3, shipments: [AWB("1", 1)] }), "processing", 100).tinta, "shipped", "Completed cu AWB = predata");
  assert.equal(decide(C({ status: 3, shipments: [AWB("1", 4)] }), "shipped", 100).tinta, "delivered");
  for (const s of [1, 2, 5]) assert.equal(decide(C({ status: s }), "pending", 100).tinta, null, `stare ${s}`);
});

test("⚠ niciodata inapoi: livrata ramane livrata, anulata nu reinvie", () => {
  assert.equal(decide(C({ status: 4, shipments: [AWB("1", 2)] }), "delivered", 100).tinta, null);
  assert.equal(decide(C({ status: 4 }), "shipped", 100).tinta, null);
  assert.equal(decide(C({ status: 4, shipments: [AWB("1", 4)] }), "cancelled", 100).tinta, null);
  assert.equal(decide(C({ status: 0 }), "refunded", 100).tinta, null);
});

test("Completed FARA niciun AWB: `processing` cu steag, niciodata `shipped`", () => {
  const d = decide(C({ status: 3 }), "pending", 100);
  assert.equal(d.tinta, "processing");
  assert.ok(d.steaguri.includes("fara_awb_finalizata"));
  const anulat = decide(C({ status: 3, shipments: [AWB("1", 7)] }), "pending", 100);
  assert.equal(anulat.tinta, "processing", "un AWB anulat nu e colet predat");
});

test("anularea: fara colet elibereaza stocul; cu colet sau dupa predare e „probabil retur”", () => {
  const a = decide(C({ status: 0 }), "processing", 100);
  assert.deepEqual([a.tinta, a.elibereazaStoc], ["cancelled", true]);
  const b = decide(C({ status: 0, shipments: [AWB("1", 2)] }), "processing", 100);
  assert.equal(b.tinta, null);
  assert.ok(b.steaguri.includes("probabil_retur"));
  const c = decide(C({ status: 0 }), "shipped", 100);
  assert.equal(c.tinta, null);
  assert.ok(c.steaguri.includes("probabil_retur"));
  const d = decide(C({ status: 0, shipments: [AWB("1", 7)] }), "pending", 100);
  assert.equal(d.tinta, "cancelled", "AWB-ul anulat nu tine comanda");
});

test("returul NU devine `refunded`, iar stocul nu se elibereaza", () => {
  const a = decide(C({ status: 6 }), "delivered", 100);
  assert.deepEqual([a.tinta, a.elibereazaStoc], [null, false]);
  assert.ok(a.steaguri.includes("retur"));
  const b = decide(C({ status: 4, shipments: [AWB("1", 5)] }), "shipped", 100);
  assert.equal(b.tinta, null);
  assert.ok(b.steaguri.includes("retur"));
});

test("steagurile: cererea de anulare, erorile, totalul schimbat la ei, starea necunoscuta", () => {
  const d = decide(C({ status: 1, cancel_request: { reason: "x" }, errors: [{ action: "create_awb", message: "x" }], total_value: "120.50" }), "pending", 100);
  assert.deepEqual(d.steaguri.sort(), ["cerere_anulare", "erori", "total_diferit"]);
  assert.equal(d.tinta, null);
  assert.deepEqual(decide(C({ status: 1, total_value: 100.004 }), "pending", 100).steaguri, []);
  const n = decide(C({ status: "Ciudat" }), "pending", 100);
  assert.deepEqual([n.tinta, n.steaguri], [null, ["stare_necunoscuta"]]);
});

test("curierii, pe id: harta intreaga, Manual (13) si necunoscutul fara legatura", () => {
  assert.equal(curierulDupaId(2), "dpd");
  assert.equal(curierulDupaId("3"), "cargus");
  assert.equal(curierulDupaId(4), "fancourier");
  assert.equal(curierulDupaId(5), "sameday");
  assert.equal(curierulDupaId(6), "gls");
  assert.equal(curierulDupaId(18), "dhl");
  assert.equal(curierulDupaId(23), "packeta");
  assert.equal(curierulDupaId(26), "ups");
  assert.equal(curierulDupaId(13), null);
  assert.equal(curierulDupaId("constructor"), null);
  for (const c of CURIERI_EASYSALES) assert.ok(Object.hasOwn(NUME_CURIER, c), `${c} are nume in panou`);
});
