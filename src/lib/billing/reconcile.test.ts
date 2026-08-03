import assert from "node:assert/strict";
import { test } from "node:test";
import {
  liniiFgo, liniiOblio, liniiSmartbill, mesajRefuz, pretDeDocument, reconciliazaComanda, reconciliazaFactura,
} from "./reconcile";

/**
 * Nimic nu verifica vreodata ca suma liniilor de pe factura da `orders.total`,
 * desi `paymentAtIssue` trimite totalul comenzii ca INCASARE: pe o comanda
 * stricata, factura pleaca cu o suma si incasarea cu alta.
 */

const BRUT = { rate: 21, taxIncluded: true, fallback: false };
const NET = { rate: 21, taxIncluded: false, fallback: false };

test("comanda sanatoasa trece fara nicio ajustare", () => {
  // #0074 de la suporti-numar: 40 marfa + 20 transport = 60,00.
  const linii = [{ cantitate: 1, pretUnitar: 40 }, { cantitate: 1, pretUnitar: 20 }];
  assert.deepEqual(reconciliazaFactura({ linii, totalComenzii: 60, regim: BRUT }), { fel: "exact" });
});

test("comanda Medclean, cea care chiar exista in productie, se REFUZA", () => {
  // #0002: o linie de 44,00 + transport 19,99 = 63,99, dar totalul e 71,63 —
  // TVA-ul a fost extras din pretul brut SI adunat inca o data deasupra.
  const linii = [{ cantitate: 1, pretUnitar: 44 }, { cantitate: 1, pretUnitar: 19.99 }];
  const r = reconciliazaFactura({ linii, totalComenzii: 71.63, regim: BRUT });
  assert.deepEqual(r, { fel: "refuz", asteptat: 63.99, gasit: 71.63, delta: 7.64, total: 71.63 });
});

test("fGO: liniile NETE nu se compara cu totalul BRUT", () => {
  // Comanda reala CADEBO ORD-MS1WS5QR-09F: magazinul are preturi CU TVA INCLUS,
  // deci regimul e BRUT — dar fGO cere pret fara TVA si converteste el liniile.
  // Comparate cu totalul brut, ele „lipsesc" cu tot TVA-ul: 256,00 fata de 310,00.
  // Asa au fost refuzate, la o proba, 58 de comenzi perfect bune din 96.
  const linii = [{ cantitate: 50, pretUnitar: 6.2 / 1.21 }];
  const gresit = reconciliazaFactura({ linii, totalComenzii: 310, regim: BRUT });
  assert.equal(gresit.fel, "refuz", "asa se comporta daca uiti ca liniile sunt nete");

  // Spunand ca liniile sunt nete, ramane doar rotunjirea adevarata: 50 x 5,12 =
  // 256,00 fata de 256,20, adica 0,20 lei — se absoarbe.
  const bine = reconciliazaFactura({ linii, totalComenzii: 310, regim: BRUT, liniiNete: true });
  assert.equal(bine.fel, "ajustare");
});

test("fGO la un magazin cu preturi NETE: nu se mai converteste inca o data", () => {
  // Acolo `toNet` e identitate, deci liniile sunt deja in unitatea comenzii.
  const linii = [{ cantitate: 1, pretUnitar: 500 }, { cantitate: 1, pretUnitar: 45 }];
  const r = reconciliazaFactura({ linii, totalComenzii: 659.45, regim: NET, vatAddOn: 114.45, liniiNete: true });
  assert.deepEqual(r, { fel: "exact" });
});

test("fGO: o comanda chiar stricata se refuza si pe baza neta", () => {
  // Medclean #0002, vazuta prin fGO: 44,00 + 19,99 brut -> 36,36 + 16,52 net =
  // 52,88, fata de 71,63/1,21 = 59,20.
  const linii = [{ cantitate: 1, pretUnitar: 44 / 1.21 }, { cantitate: 1, pretUnitar: 19.99 / 1.21 }];
  const r = reconciliazaFactura({ linii, totalComenzii: 71.63, regim: BRUT, liniiNete: true });
  assert.equal(r.fel, "refuz");
});

test("pretul unitar se rotunjeste INAINTE de inmultire, ca pe document", () => {
  // Documentul scrie 5,12, nu 5,1239...: garda trebuie sa certifice numarul care
  // chiar va aparea pe factura.
  const linii = [{ cantitate: 50, pretUnitar: 5.1239669 }];
  const r = reconciliazaFactura({ linii, totalComenzii: 256, regim: BRUT });
  assert.deepEqual(r, { fel: "exact" }, "50 x 5,12 = 256,00");
});

test("pretul de pachet, nerotunjit in comanda, iese pe factura cu doi bani", () => {
  // Prosop CAIAN: doua bucati la 13,41, deci `orders.items` tine 6,705 ca
  // `pret x cantitate` sa dea exact subtotalul. Documentul insa scrie 6,71, deci
  // ar insuma 13,42 — un ban peste ce plateste clientul.
  assert.equal(pretDeDocument(13.41 / 2), 6.71);
  const linii = [{ cantitate: 2, pretUnitar: 13.41 / 2 }];
  assert.deepEqual(reconciliazaFactura({ linii, totalComenzii: 13.41, regim: BRUT }), { fel: "ajustare", delta: -0.01 });
});

test("un ban de rotunjire se absoarbe, nu opreste factura", () => {
  const linii = [{ cantitate: 3, pretUnitar: 6.33 }];
  const r = reconciliazaFactura({ linii, totalComenzii: 19, regim: BRUT });
  assert.deepEqual(r, { fel: "ajustare", delta: 0.01 });
});

test("preturile NETE au voie la mai multa rotunjire decat cele cu TVA inclus", () => {
  // La preturi nete furnizorul calculeaza TVA pe FIECARE linie si aduna, in timp
  // ce noi il rotunjim o singura data pe baza — inca o jumatate de ban pe linie.
  const douaLinii = [{ cantitate: 1, pretUnitar: 10 }, { cantitate: 1, pretUnitar: 10 }];
  assert.equal(reconciliazaFactura({ linii: douaLinii, totalComenzii: 20.03, regim: NET, vatAddOn: 0 }).fel, "ajustare");
  assert.equal(reconciliazaFactura({ linii: douaLinii, totalComenzii: 20.03, regim: BRUT }).fel, "refuz");
});

test("plafonul urmareste CANTITATEA, nu numarul de linii", () => {
  // Aceeasi diferenta de 0,20 lei: legitima pe 50 de bucati, imposibila pe una.
  assert.equal(reconciliazaFactura({ linii: [{ cantitate: 50, pretUnitar: 5.12 }], totalComenzii: 256.2, regim: BRUT }).fel, "ajustare");
  assert.equal(reconciliazaFactura({ linii: [{ cantitate: 1, pretUnitar: 5.12 }], totalComenzii: 5.32, regim: BRUT }).fel, "refuz");
});

test("reducerile scad din suma, nu se ignora", () => {
  const linii = [{ cantitate: 1, pretUnitar: 100 }, { cantitate: 1, pretUnitar: -20 }];
  assert.deepEqual(reconciliazaFactura({ linii, totalComenzii: 80, regim: BRUT }), { fel: "exact" });
});

test("la preturi NETE, TVA-ul adaugat deasupra se scoate inainte de comparatie", () => {
  // eSAFE: 500 marfa + 45 transport = 545 net, total 659,45 cu TVA de 114,45.
  const linii = [{ cantitate: 1, pretUnitar: 500 }, { cantitate: 1, pretUnitar: 45 }];
  const r = reconciliazaComanda(linii, { total: 659.45, vat_amount: 114.45 }, NET);
  assert.deepEqual(r, { fel: "exact" });
});

test("la preturi cu TVA inclus, `vat_amount` NU se scade — e deja in linii", () => {
  const linii = [{ cantitate: 1, pretUnitar: 60 }];
  assert.deepEqual(reconciliazaComanda(linii, { total: 60, vat_amount: 10.41 }, BRUT), { fel: "exact" });
});

/* ─── Mesajul catre comerciant ────────────────────────────────────────────── */

test("mesajul citeaza `orders.total`, numarul pe care comerciantul il vede", () => {
  // Pe un magazin cu preturi nete, baza de comparatie NU e totalul comenzii: daca
  // i-am reprosa 545,00 pe o comanda de 659,45, n-ar avea ce verifica.
  const r = { fel: "refuz" as const, asteptat: 500, gasit: 545, delta: 45, total: 659.45 };
  assert.match(mesajRefuz(r, "0001", false), /659,45 lei/);
});

test("refuzul spune numerele SI pasul urmator", () => {
  const r = { fel: "refuz" as const, asteptat: 63.99, gasit: 71.63, delta: 7.64, total: 71.63 };
  const m = mesajRefuz(r, "0002", false);
  assert.match(m, /63,99 lei/);
  assert.match(m, /71,63 lei/);
  assert.match(m, /7,64 lei/);
  assert.match(m, /Editeaza comanda/, "un refuz care nu spune ce sa faci opreste facturarea fara sa o repare");
});

test("pe o comanda PLATITA, indemnul se schimba: banii au intrat deja", () => {
  const r = { fel: "refuz" as const, asteptat: 63.99, gasit: 71.63, delta: 7.64, total: 71.63 };
  const m = mesajRefuz(r, "0002", true);
  assert.match(m, /incasarea/);
  assert.doesNotMatch(m, /Editeaza comanda/, "resalvarea ar cobori totalul sub suma platita");
});

/* ─── Cum se citesc liniile fiecarei case ─────────────────────────────────── */

test("SmartBill: reducerea sta in `discountValue`, nu in `price`", () => {
  assert.deepEqual(
    liniiSmartbill([
      { quantity: 2, price: 19.99 },
      { isDiscount: true, price: 0, discountValue: -10, quantity: 1 },
    ]),
    [{ cantitate: 2, pretUnitar: 19.99 }, { cantitate: 1, pretUnitar: -10 }],
  );
});

test("Oblio: reducerea are valoare POZITIVA si se scade", () => {
  assert.deepEqual(
    liniiOblio([
      { quantity: 1, price: 50 },
      { discount: 10, discountType: "valoric", price: 0 },
    ]),
    [{ cantitate: 1, pretUnitar: 50 }, { cantitate: 1, pretUnitar: -10 }],
  );
});

test("fGO: la fel, reducerea vine pozitiva pe o linie de tip Discount", () => {
  assert.deepEqual(
    liniiFgo([
      { quantity: 3, unitPrice: 8.26 },
      { quantity: 1, unitPrice: 5, isDiscount: true },
    ]),
    [{ cantitate: 3, pretUnitar: 8.26 }, { cantitate: 1, pretUnitar: -5 }],
  );
});

test("o comanda fara linii nu produce o factura de zero lei in tacere", () => {
  const r = reconciliazaFactura({ linii: [], totalComenzii: 65, regim: BRUT });
  assert.equal(r.fel, "refuz");
});
