import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/*
 * Lista „Comenzi” are cate o coloana de AWB pentru fiecare curier conectat.
 *
 * Cerut de el pe 29.09.2026: butonul de AWB pe fiecare rand, la TOTI curierii conectati, ca
 * sa nu intre in fiecare comanda. Pana atunci il aveau doar cei 9 vechi; Curiera, Posta,
 * Packeta, SmartShip, Shipo, FedEx, UPS, DHL si Innoship se emiteau numai din comanda sau
 * pe lot. Nimic nu observa lipsa: curierul aparea in meniul lotului, deci parea complet.
 */
const sursa = readFileSync("src/components/dashboard/OrdersClient.tsx", "utf8");

function steaguri(bucata: string): string[] {
  return [...bucata.matchAll(/\{(\w+)Enabled && \(/g)].map((m) => m[1]);
}

const cap = steaguri(sursa.slice(sursa.indexOf("<thead"), sursa.indexOf("</thead>")));
const randuri = steaguri(sursa.slice(sursa.indexOf("comenzi.map((order)"), sursa.indexOf("</tbody>")));

test("⚠ capul tabelului si randurile au coloanele in ACEEASI ordine", () => {
  /* Gardate de acelasi steag dar asezate altfel, tabelul se decaleaza pe latime: butonul unui
     curier ajunge sub numele altuia, si nimic nu semnaleaza asta. */
  assert.ok(cap.length > 0 && randuri.length > 0, "n-am gasit coloanele: s-a schimbat forma fisierului");
  assert.deepEqual(randuri, cap);
});

test("fiecare curier din emiterea pe lot are si butonul lui pe rand", () => {
  const lot = sursa.slice(sursa.indexOf("const awbCouriers = useMemo"), sursa.indexOf("const anyAwb"));
  const dinLot = [...lot.matchAll(/if \((\w+)Enabled\) list\.push/g)].map((m) => m[1]);
  assert.ok(dinLot.length >= 15, `doar ${dinLot.length} curieri in lot: s-a schimbat forma meniului`);
  for (const c of dinLot) {
    assert.ok(cap.includes(c), `${c} se emite pe lot, dar n-are coloana in lista`);
  }
});
