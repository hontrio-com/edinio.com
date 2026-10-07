import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { StareEpacket } from "./client";
import { alarmaMagazinului, citesteStarea, galeataGoala, semnalareEpacket } from "./urmarire";

const STARE: StareEpacket = {
  awb: "81382475619", curier: "DPD", status: "in_tranzit", eticheta: "În tranzit", final: false,
  la: "2026-10-05T11:20:00Z", verificatLa: "2026-10-05T12:01:00Z",
};

const PRAGURI = { autentificare: 1, refuz: 1, esecuri: 3, negasite: 1 };

test("citirea: cheia e codul lor, eticheta e a lor, clipa in ISO", () => {
  const c = citesteStarea(STARE, null);
  assert.equal(c.cheie, "in_tranzit");
  assert.equal(c.status, "in_tranzit");
  assert.equal(c.eticheta, "În tranzit");
  assert.equal(c.schimbata, true);
  assert.equal(c.la, "2026-10-05T11:20:00.000Z");
  assert.equal(c.finala, false);
  assert.equal(citesteStarea(STARE, "in_tranzit").schimbata, false, "aceeasi stare nu e schimbare");
});

test("finala: din harta noastra SAU din steagul lor", () => {
  assert.equal(citesteStarea({ ...STARE, status: "livrat" }, null).finala, true);
  assert.equal(citesteStarea({ ...STARE, status: "cod_nou", final: true }, null).finala, true);
  const nou = citesteStarea({ ...STARE, status: "cod_nou" }, null);
  assert.equal(nou.finala, false);
  assert.equal(nou.status, null);
  assert.equal(nou.cheie, "cod_nou", "codul necunoscut se pastreaza brut, ca sa se vada");
});

test("o clipa necitibila nu se scrie ca data", () => {
  assert.equal(citesteStarea({ ...STARE, la: "ieri" }, null).la, null);
  assert.equal(citesteStarea({ ...STARE, la: null }, null).la, null);
});

test("semnalarea spune ce inseamna, si curierul de dedesubt", () => {
  const r = semnalareEpacket({ orderNumber: "#0042", awb: "1", curier: "Sameday", cheie: "returnat", eticheta: "Returnat expeditorului" });
  assert.match(r.titlu, /returnat/i);
  assert.match(r.mesaj, /rambursul NU s-a incasat/);
  assert.match(r.mesaj, /Sameday prin e-packet/);
  const a = semnalareEpacket({ orderNumber: "#0042", awb: "1", curier: "DPD", cheie: "anulat", eticheta: "Anulat" });
  assert.match(a.mesaj, /Detaseaza AWB/);
  const p = semnalareEpacket({ orderNumber: null, awb: "1", curier: "", cheie: "avizat", eticheta: "Avizat" });
  assert.match(p.mesaj, /^O comanda/);
});

test("alarma: niciuna cand macar o citire a reusit", () => {
  assert.equal(alarmaMagazinului({ ...galeataGoala(), reusite: 1, autentificare: 5 }, PRAGURI), null);
});

test("alarma: cheia respinsa e CRITICA si e singura care trimite la cheie", () => {
  const a = alarmaMagazinului({ ...galeataGoala(), autentificare: 1 }, PRAGURI);
  assert.equal(a?.severity, "critical");
  assert.match(a!.mesaj, /Verifica cheia/);
  const b = alarmaMagazinului({ ...galeataGoala(), indisponibil: 3, exemplu: "e-packet status: 500" }, PRAGURI);
  assert.equal(b?.severity, "warning");
  assert.match(b!.mesaj, /Nu schimba cheia/);
  assert.equal(alarmaMagazinului({ ...galeataGoala(), indisponibil: 2 }, PRAGURI), null, "doua caderi trecatoare nu sunt alarma");
});

test("alarma: AWB-urile negasite spun cauza lor, test fata de live", () => {
  const a = alarmaMagazinului({ ...galeataGoala(), negasite: 1 }, PRAGURI);
  assert.match(a!.mesaj, /TEST/);
});
