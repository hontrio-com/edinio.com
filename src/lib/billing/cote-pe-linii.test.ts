import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  coteleLiniilor, cotaDeFacturare, grupePeCota, imparteProportional, motivCoteAmestecate,
  tvaContinut,
} from "./cote-pe-linii";
import { reconciliazaFactura } from "./reconcile";

/* ══════════════════════════════════════════════════════════════════════════
   O FACTURA CU O SINGURA COTA PE O COMANDA CU MAI MULTE
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Edinio a facturat dintotdeauna cu o singura cota, si pentru comenzile din magazin asta e
   adevarat prin constructie: cota e a magazinului. Marketplace-urile au schimbat premisa fara
   ca nimic sa spuna ceva: Pepita trimite TVA pe FIECARE linie, iar in Romania cotele chiar
   difera, hrana 11% si restul 21%.

   O factura fiscala gresita nu se retrage, se STORNEAZA. De-aia regula de aici nu aproximeaza.
*/

const linie = (pret: number, cant: number, cota: unknown) => ({ price: pret, quantity: cant, vat_rate: cota });

test("cote egale inseamna comanda uniforma", () => {
  const r = coteleLiniilor([linie(100, 2, 21), linie(50, 1, 21)]);
  assert.deepEqual(r.cote, [21]);
  assert.equal(r.uniforma, true);
  assert.equal(r.cotaDominanta, 21);
});

test("⚠ cote diferite NU sunt uniforme, si se vad amandoua", () => {
  const r = coteleLiniilor([linie(100, 1, 21), linie(30, 1, 11)]);
  assert.deepEqual(r.cote, [11, 21]);
  assert.equal(r.uniforma, false);
});

test("⚠ cand trebuie ales un singur numar, se alege dupa VALOARE, nu cel mai mare", () => {
  /*
   * `max(cote)` era ce faceam pana la auditul din 08.09.2026, si e cea mai proasta alegere:
   * supra-taxeaza TOATE liniile. Aici hrana de 900 de lei cu 11% tine greul, iar jucaria de 20
   * de lei cu 21% n-are de ce sa tarasca toata comanda dupa ea.
   */
  const r = coteleLiniilor([linie(900, 1, 11), linie(20, 1, 21)]);
  assert.equal(r.cotaDominanta, 11);
  assert.notEqual(r.cotaDominanta, Math.max(...r.cote), "nu e maximul");
});

test("cantitatea intra in valoare, nu doar pretul unitar", () => {
  /* Zece bucati de 30 de lei bat una de 100. */
  const r = coteleLiniilor([linie(100, 1, 21), linie(30, 10, 11)]);
  assert.equal(r.cotaDominanta, 11);
});

test("⚠ la valori egale castiga cota MAI MARE, nu prima intalnita", () => {
  /*
   * Ordinea liniilor intr-un `jsonb` nu e hotararea nimanui si se poate schimba la prima
   * rescriere a comenzii. Un rezultat care atarna de ea s-ar schimba singur. Iar dintre doua
   * rele, sub-taxarea aduce control fiscal, supra-taxarea nu.
   */
  assert.equal(coteleLiniilor([linie(100, 1, 11), linie(100, 1, 21)]).cotaDominanta, 21);
  assert.equal(coteleLiniilor([linie(100, 1, 21), linie(100, 1, 11)]).cotaDominanta, 21);
});

test("comanda fara nicio cota scrisa e uniforma si da zero", () => {
  /* Toate comenzile de dinaintea reparatiei, si cele din magazin. */
  for (const items of [[{ price: 10, quantity: 1 }], [], null, undefined, "nu e listă"]) {
    const r = coteleLiniilor(items);
    assert.equal(r.uniforma, true, JSON.stringify(items));
    assert.equal(r.cotaDominanta, 0);
  }
});

test("cotele stricate se sar, nu darama socoteala", () => {
  const r = coteleLiniilor([linie(100, 1, 21), linie(50, 1, "aiurea"), linie(50, 1, -5), linie(50, 1, null)]);
  assert.deepEqual(r.cote, [21], "raman doar cotele care chiar sunt cote");
  assert.equal(r.uniforma, true);
});

test("cota ZERO e o cota, nu o lipsa", () => {
  /* Un magazin neplatitor de TVA trimite 0, si asta chiar inseamna ceva. */
  const r = coteleLiniilor([linie(100, 1, 0), linie(50, 1, 21)]);
  assert.deepEqual(r.cote, [0, 21]);
  assert.equal(r.uniforma, false);
});

test("⚠ motivul spune ce cote sunt SI unde se face factura", () => {
  /* Un „nu se poate" fara urmatoarea miscare l-a pus deja pe comerciant sa apese de 208 ori
     un buton care n-avea cum sa mearga. */
  const m = motivCoteAmestecate([linie(100, 1, 21), linie(30, 1, 11)]);
  assert.ok(m);
  assert.match(m, /11%/);
  assert.match(m, /21%/);
  assert.match(m, /contul tău de facturare/);
  assert.equal(motivCoteAmestecate([linie(100, 1, 21)]), null, "cand e uniforma, nu se spune nimic");
});

/* ══════════════════════════════════════════════════════════════════════════
   POARTA DIN FACTURAREA AUTOMATA
   ══════════════════════════════════════════════════════════════════════════ */

const AUTO = readFileSync("src/lib/actions/invoice-auto.actions.ts", "utf8");

test("⚠ facturarea automata chiar CERE `items`, altfel poarta ar tacea", () => {
  /*
   * Ce nu se cere in `select` vine `undefined`, iar `coteleLiniilor` ar raspunde „uniforma"
   * pe o lista goala: poarta ar fi tacut exact pe comenzile pentru care exista. Aceeasi
   * lectie ca la coloanele de AWB din generarea in masa.
   */
  const i = AUTO.indexOf('.select("smartbill_invoice_number');
  assert.ok(i > 0, "nu s-a gasit citirea comenzii");
  const linia = AUTO.slice(i, AUTO.indexOf("\n", i));
  assert.match(linia, /\bitems\b/);
  assert.match(linia, /order_source/);
});

test("⚠ si opreste emiterea cand cotele difera", () => {
  /*
   * ⚠ PE LINII SI PE REGULA, nu pe forma. Versiunea dinainte cerea litera `!cote.uniforma`
   * intr-o fereastra de 400 de caractere: s-a rupt la prima mutare a socotelii in ajutorul
   * comun, desi regula era neatinsa. Iar fereastra avea 14 caractere de rezerva, deci s-ar fi
   * rupt oricum la primul rand adaugat in jurnal.
   */
  const linii = AUTO.replace(/\/\*[\s\S]*?\*\//g, " ").split(/\r?\n/);
  const i = linii.findIndex((l) => l.includes("motivCoteAmestecate(o.items)"));
  assert.ok(i >= 0, "poarta automata nu mai cheama ajutorul comun");
  const dupa = linii.slice(i, i + 12).join(" ");
  assert.match(dupa, /return;/, "se opreste, nu doar se scrie in jurnal");
});

/* ══════════════════════════════════════════════════════════════════════════
   POARTA E PE TOATE CELE PATRU CAI, NU DOAR PE CEA AUTOMATA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ `invoiceVat` intoarce UN singur numar, iar casa il pune pe TOATE liniile. Cat timp
   `orders.vat_rate` era `max(cote)`, greseala mergea in directia care supra-taxeaza: gresit,
   dar fara pagubă fiscala. De cand e cota liniei celei mai valoroase (08.09.2026), aceeasi
   apasare poate SUB-declara TVA-ul.

   ⚠ CE APARA PLASA, SI CE NU: scaneaza sursa, deci spune ca poarta e chemata, nu ca se poarta
   bine. Purtarea e probata mai sus, pe valori. Ce apara e ziua in care cineva adauga a patra
   casa de facturare si uita poarta.
*/

const CASE_DE_FACTURARE = readdirSync("src/lib/actions")
  .filter((n) => n.endsWith(".actions.ts"))
  .map((n) => `src/lib/actions/${n}`)
  .filter((f) => readFileSync(f, "utf8").includes("invoiceVat("));

test("⚠ plasa chiar are pe cine cadea", () => {
  assert.ok(CASE_DE_FACTURARE.length >= 3, `gasite doar ${CASE_DE_FACTURARE.length} case de facturare`);
});

test("⚠ orice cale care emite o factura trece prin poarta cotelor amestecate", () => {
  for (const f of CASE_DE_FACTURARE) {
    const s = readFileSync(f, "utf8");
    /*
     * `order.actions.ts` cheama `invoiceVat` ca sa AFISEZE o cota si `maybeAutoInvoice` ca sa
     * dea drumul altei actiuni: el nu emite niciun document, deci n-are ce pazi.
     */
    if (!/export async function generate\w*Invoice/.test(s) && !f.endsWith("invoice-auto.actions.ts")) continue;

    /*
     * ⚠ NU E DE AJUNS CA POARTA SA FIE CHEMATA: trebuie sa si OPREASCA. Prima forma a probei
     * cerea doar apelul, iar un mutant care stergea `return` trecea verde.
     */
    const linii = s.split(/\r?\n/);
    const i = linii.findIndex((l) => l.includes("motivCoteAmestecate("));
    assert.ok(i >= 0, `${f}: emite o factura fara sa verifice cotele pe linii`);
    const dupa = linii.slice(i, i + 4).join(" ");
    assert.match(dupa, /if \(coteAmestecate\)/, `${f}: verifica cotele, dar emite oricum`);
    assert.match(linii.slice(i, i + 12).join(" "), /return/, `${f}: nu se opreste`);
  }
});

test("⚠ poarta sta in CONSTRUCTORUL sarcinii utile, nu doar in butoane", () => {
  /*
   * ⚠ CE A SCAPAT PANA PE 08.09.2026. Poarta era chemata din generatoarele de FACTURA, si lipsea
   * din doua drumuri care ajung tot la un document fiscal:
   *
   *   1. PROFORMELE. `generateOrderEstimate` si `generateOblioProforma` construiau liniile prin
   *      aceiasi constructori si nu chemau poarta. Iar `convertEstimateToInvoice` transforma
   *      proforma in FACTURA fara sa reconstruiasca liniile: o cota unica pusa pe proforma trecea
   *      intreaga in documentul fiscal.
   *   2. `maybeAutoGenerateInvoice` (SmartBill), care isi face singura sarcina utila si e un export
   *      dintr-un modul „use server", adica o adresa publica.
   *
   * Mutata in constructor, poarta acopera toate drumurile de azi SI pe cel adaugat maine de cineva
   * care nici nu stie ca exista.
   */
  const perechi: [string, string][] = [
    ["src/lib/actions/smartbill.actions.ts", "async function buildInvoiceParams("],
    ["src/lib/actions/oblio.actions.ts", "async function buildInvoiceData("],
  ];

  for (const [cale, antet] of perechi) {
    const sursa = readFileSync(cale, "utf8");
    const i = sursa.indexOf(antet);
    assert.notEqual(i, -1, `${cale}: n-am gasit ${antet}`);
    const sfarsit = sursa.indexOf(String.fromCharCode(10) + "}", i);
    const corp = sursa.slice(i, sfarsit === -1 ? sursa.length : sfarsit);
    assert.ok(
      corp.includes("motivCoteAmestecate("),
      `${cale}: constructorul nu mai trece prin poarta cotelor amestecate, deci proforma si calea `
      + "automata pot emite un document cu o singura cota peste linii care au cote diferite",
    );
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   COTA PE LINIE: MIEZUL, PROBAT PE CIFRE (09.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ TOATE PROBELE DE AICI SUNT PE VALORI, NU PE FORMA. Ce se apara e un numar care ajunge intr-un
   document fiscal; o proba care verifica doar ca „s-a chemat functia" ar fi trecut peste fiecare
   greseala de aritmetica din lista de mai jos, si fiecare dintre ele s-a intamplat deja undeva.
*/

test("⚠ cota liniei bate cota documentului, iar ZERO e o cota, nu o lipsa", () => {
  /*
   * ⚠ `Number(l.vat_rate) || cotaDocumentului` ar fi dat cota documentului pentru o linie cu 0%
   * ADEVARAT — o carte, un produs scutit — si ar fi taxat-o. Iar `Number(undefined) || 0` ar fi
   * facut pe dos: toate comenzile din magazin, care n-au cota pe linie, ar fi plecat cu 0%.
   */
  assert.equal(cotaDeFacturare({ vat_rate: 11 }, 21), 11, "cota liniei nu a castigat");
  assert.equal(cotaDeFacturare({ vat_rate: 0 }, 21), 0, "0% adevarat a fost inlocuit cu cota documentului");
  assert.equal(cotaDeFacturare({}, 21), 21, "linia fara cota n-a luat-o pe a documentului");
  assert.equal(cotaDeFacturare({ vat_rate: null }, 19), 19);
  assert.equal(cotaDeFacturare({ vat_rate: "" }, 19), 19);
  /* O valoare pe care n-o putem citi nu inseamna zero: inseamna „n-are opinie". */
  assert.equal(cotaDeFacturare({ vat_rate: "ceva" }, 19), 19);
});

test("⚠ TVA-ul CONTINUT se scoate cu c/(100+c), nu cu c/100", () => {
  /*
   * Greseala clasica si tacuta: `brut × 21 / 100` ADAUGA TVA peste o suma care il contine deja.
   * Pe 100 de lei diferenta e 21,00 fata de 17,36 — adica factura ar declara cu o cincime mai
   * mult TVA decat s-a incasat.
   */
  assert.equal(tvaContinut([{ cota: 21, valoare: 100 }]), 17.36);
  assert.equal(tvaContinut([{ cota: 11, valoare: 100 }]), 9.91);
  assert.equal(tvaContinut([{ cota: 0, valoare: 100 }]), 0);
  /* Si pe grupe: 9,9099 + 17,3554 = 27,2652 → 27,27. */
  assert.equal(tvaContinut([{ cota: 11, valoare: 100 }, { cota: 21, valoare: 100 }]), 27.27);
});

test("⚠ liniile se grupeaza pe cote, iar cele fara cota cad pe a documentului", () => {
  const items = [
    { price: 50, quantity: 2, vat_rate: 11 },
    { price: 100, quantity: 1, vat_rate: 21 },
    { price: 30, quantity: 1 },
  ];
  assert.deepEqual(grupePeCota(items, 21), [
    { cota: 11, valoare: 100 },
    { cota: 21, valoare: 130 },
  ]);
  /* Fara linii, nicio grupa: apelantul nu are ce imparti si trebuie sa stie asta. */
  assert.deepEqual(grupePeCota([], 21), []);
  assert.deepEqual(grupePeCota(null, 21), []);
});

test("⚠ o reducere se imparte PROPORTIONAL, iar suma partilor da fix reducerea", () => {
  /*
   * ⚠ CE APARA. O reducere de 100 de lei peste 11% si 21% nu are cota a ei: ea micsoreaza baza
   * fiecarei grupe. Pusa intreaga pe o singura cota, TVA-ul reducerii iese gresit — si cu semn
   * OPUS fata de eroarea de pe linii, deci totalul poate parea corect in timp ce defalcarea de TVA
   * e gresita. Aia nu se vede nici pe ecran, nici la garda de reconciliere.
   */
  const grupe = [{ cota: 11, valoare: 100 }, { cota: 21, valoare: 300 }];
  const parti = imparteProportional(100, grupe);
  assert.equal(parti.get(11), 25);
  assert.equal(parti.get(21), 75);

  /* ⚠ Si cu numere care NU se impart frumos, suma partilor ramane exacta. */
  const urate = imparteProportional(10, [
    { cota: 11, valoare: 33.33 }, { cota: 19, valoare: 33.33 }, { cota: 21, valoare: 33.34 },
  ]);
  const suma = [...urate.values()].reduce((a, b) => a + b, 0);
  assert.equal(Math.round(suma * 100) / 100, 10, "impartirea a pierdut sau a inventat bani");
});

test("garda de reconciliere: cu O SINGURA cota, calea veche e neatinsa", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA CE MERGE AZI. Cele trei case cheama garda de ani de zile pe comenzi
   * cu o singura cota. O formula noua pusa pe drumul lor ar fi mutat rotunjirea cu un ban si ar fi
   * refuzat comenzi bune — pentru un caz care in productie inca nu s-a intamplat.
   */
  const linii = [{ cantitate: 1, pretUnitar: 82.64 }];
  const r = reconciliazaFactura({
    linii, totalComenzii: 100, liniiNete: true,
    regim: { rate: 21, taxIncluded: true, fallback: false },
  });
  /* 100 / 1,21 = 82,6446 → 82,64. Diferenta zero. */
  assert.equal(r.fel, "exact");
});

test("⚠ garda de reconciliere: cu cote AMESTECATE, impartirea la o singura cota minte cu 7,44 lei", () => {
  /*
   * Doua linii de 100 de lei, una la 11% si una la 21%, total 200.
   *
   *   corect:  100/1,11 + 100/1,21 = 90,09 + 82,64 = 172,73
   *   gresit:  200/1,21                            = 165,29
   *
   * Sapte lei si patruzeci si patru de bani pe o comanda de 200. Cu formula veche, garda ar fi
   * REFUZAT documentul corect — sau, si mai rau, l-ar fi certificat pe cel gresit daca liniile ar
   * fi fost construite cu aceeasi formula gresita.
   */
  const linii = [{ cantitate: 1, pretUnitar: 90.09 }, { cantitate: 1, pretUnitar: 82.64 }];
  const regim = { rate: 21, taxIncluded: true, fallback: false } as const;

  const veche = reconciliazaFactura({ linii, totalComenzii: 200, liniiNete: true, regim });
  assert.equal(veche.fel, "refuz", "formula veche ar fi trebuit sa refuze documentul CORECT");
  if (veche.fel === "refuz") assert.equal(Math.abs(veche.delta), 7.44);

  const noua = reconciliazaFactura({
    linii, totalComenzii: 200, liniiNete: true, regim,
    tvaContinutInTotal: tvaContinut([{ cota: 11, valoare: 100 }, { cota: 21, valoare: 100 }]),
  });
  assert.equal(noua.fel, "exact", "documentul corect tot nu trece");
});
