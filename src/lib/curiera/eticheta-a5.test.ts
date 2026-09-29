import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { A5_PT, etichetaPeA5, potrivirePeA5 } from "./eticheta-a5";

/* Pagina A6 pe care o da Curiera, masurata pe 29.09.2026 (si pentru `format=a5`). */
const A6_CURIERA = { latime: 295.2, inaltime: 417.6 };

test("eticheta A6 incape pe A5, marita cu proportia pastrata si centrata", () => {
  const { scara, x, y } = potrivirePeA5(A6_CURIERA.latime, A6_CURIERA.inaltime);
  assert.ok(scara > 1.41 && scara < 1.43, `scara ${scara}`);
  assert.ok(x >= 0 && y >= 0, "iese din pagina");
  assert.ok(A6_CURIERA.latime * scara + 2 * x <= A5_PT.latime + 0.01);
  assert.ok(A6_CURIERA.inaltime * scara + 2 * y <= A5_PT.inaltime + 0.01);
  /* Latura care hotaraste scara umple pagina; nu ramane o margine pe toate patru. */
  assert.ok(Math.min(x, y) < 0.01);
});

test("fiecare pagina (un colet) iese pe o pagina A5, in aceeasi ordine", async () => {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const d = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    d.addPage([A6_CURIERA.latime, A6_CURIERA.inaltime])
      .drawRectangle({ x: 20, y: 20, width: 100, height: 30, color: rgb(0, 0, 0) });
  }
  const iesire = await etichetaPeA5(await d.save());
  assert.equal(iesire.subarray(0, 5).toString("latin1"), "%PDF-");

  const citit = await PDFDocument.load(iesire);
  assert.equal(citit.getPageCount(), 2);
  for (const p of citit.getPages()) {
    assert.equal(Math.round(p.getWidth()), Math.round(A5_PT.latime));
    assert.equal(Math.round(p.getHeight()), Math.round(A5_PT.inaltime));
  }
});

test("un PDF care nu se poate citi arunca, nu da o pagina goala", async () => {
  await assert.rejects(etichetaPeA5(new TextEncoder().encode("Shipment is canceled:1")));
});

test("⚠ pdf-lib se incarca LA CERERE, ca in lipeste-pdf.ts", () => {
  const sursa = readFileSync("src/lib/curiera/eticheta-a5.ts", "utf8");
  assert.ok(/await import\("pdf-lib"\)/.test(sursa));
  assert.ok(!/^import .*from "pdf-lib"/m.test(sursa));
});
