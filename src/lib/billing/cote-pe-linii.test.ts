import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  coteleLiniilor, cotaDeFacturare, grupePeCota, imparteProportional, planulCotelor, tvaContinut,
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

/* ══════════════════════════════════════════════════════════════════════════
   FIECARE LINIE ISI POARTA COTA EI — PE TOATE CELE TREI CASE
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE STATEA AICI PANA PE 09.09.2026, si de ce nu mai sta. Trei probe pazeau o POARTA: comanda
   cu cote diferite pe linii nu se factura deloc. Poarta a fost buna exact cat a durat — cat timp
   casa punea o singura cota pe toate liniile, un document cu jumatate din linii la cota gresita
   era mai rau decat unul neemis. De cand fiecare linie isi poarta cota ei, poarta n-ar mai apara
   nimic; ar opri chiar documentul corect.

   ⚠ CE APARA PLASA DE ACUM: ca nicio casa nu se intoarce la „o cota peste tot". Scaneaza sursa,
   deci spune ca socoteala e chemata, nu ca e buna — purtarea e probata pe VALORI mai jos, pe
   `planulCotelor`, si in `invoice-vat.test.ts`, pe `numePeCote`. Ce apara aici e ziua in care
   cineva adauga a patra casa de facturare si o scrie dupa tiparul vechi.
*/

const AUTO = readFileSync("src/lib/actions/invoice-auto.actions.ts", "utf8");

test("⚠ facturarea automata chiar CERE `items`, altfel n-ar sti niciodata ce cote are comanda", () => {
  /*
   * Ce nu se cere in `select` vine `undefined`, iar `coteleLiniilor` ar raspunde „uniforma" pe o
   * lista goala. Pana pe 09.09.2026 asta ar fi TACUT o poarta; azi tace o insemnare in jurnal —
   * dar lectia e aceeasi, si e aceeasi cu cea de la coloanele de AWB din generarea in masa: o
   * coloana necerută nu e o coloana goala, e o intrebare care nu s-a pus.
   */
  const i = AUTO.indexOf('.select("smartbill_invoice_number');
  assert.ok(i > 0, "nu s-a gasit citirea comenzii");
  const linia = AUTO.slice(i, AUTO.indexOf("\n", i));
  assert.match(linia, /\bitems\b/);
  assert.match(linia, /order_source/);
});

test("⚠ prima comanda cu doua cote emisa automat lasa o urma", () => {
  /*
   * Poarta a fost ridicata, dar nu in tacere. Cand cotele difera, calea automata scrie o insemnare
   * si emite mai departe — ca ziua in care se intampla prima oara sa fie una pe care o gasim noi,
   * nu una pe care ne-o spune clientul.
   */
  const linii = AUTO.replace(/\/\*[\s\S]*?\*\//g, " ").split(/\r?\n/);
  const i = linii.findIndex((l) => l.includes("coteleLiniilor(o.items)"));
  assert.ok(i >= 0, "calea automata nu se mai uita deloc la cotele liniilor");
  const dupa = linii.slice(i, i + 10).join(" ");
  assert.match(dupa, /logError/, "nu ramane nicio urma");
  assert.doesNotMatch(dupa, /return;/, "poarta s-a intors: calea automata se opreste din nou");
});

const CASE_DE_FACTURARE = readdirSync("src/lib/actions")
  .filter((n) => n.endsWith(".actions.ts"))
  .map((n) => `src/lib/actions/${n}`)
  .filter((f) => readFileSync(f, "utf8").includes("invoiceVat("));

test("⚠ plasa chiar are pe cine cadea", () => {
  assert.ok(CASE_DE_FACTURARE.length >= 3, `gasite doar ${CASE_DE_FACTURARE.length} case de facturare`);
});

test("⚠ orice casa care emite un document cere cota FIECAREI linii", () => {
  for (const f of CASE_DE_FACTURARE) {
    const s = readFileSync(f, "utf8");
    /*
     * `order.actions.ts` cheama `invoiceVat` ca sa AFISEZE o cota si `maybeAutoInvoice` ca sa dea
     * drumul altei actiuni: el nu construieste niciun document, deci n-are ce pazi.
     */
    if (!/export async function generate\w*(Invoice|Estimate|Proforma)/.test(s)) continue;

    assert.match(
      s, /cotaLiniei\(/,
      `${f}: pune cota documentului pe linii, in loc sa ceara cota fiecarei linii`,
    );
    assert.match(
      s, /planulCotelor\(/,
      `${f}: transportul, reducerile si taxele nu se mai impart intre grupele de cota`,
    );
  }
});

test("⚠ cota cu care se SOCOTESTE linia e chiar cea pe care o DECLARA", () => {
  /*
   * ═══ ⚠ PROBA SCRISA DUPA UN MUTANT CARE A SCAPAT ═══
   *
   * `unitPrice: toNet(item.price, effectiveVat)` langa `vatRate: cota`. Doua randuri alaturate,
   * amandoua arata corect, si impreuna scriu pe factura un pret net calculat la 21% sub o cota
   * declarata de 11%. Nicio proba de pana acum nu sufla o vorba: `cotaDeFacturare` e chemata,
   * `planulCotelor` e chemat, transportul se imparte — totul e la locul lui, in afara de rezultat.
   *
   * ⚠ SI NU SE VEDE NICI DIN AFARA: garda de reconciliere lucreaza tot pe baza neta la fGO, deci
   * certifica documentul gresit. Adica exact tiparul de care ne temem cel mai mult.
   *
   * ⚠ CE APARA, EXACT: ca acelasi nume sta in amandoua locurile. Nu ca numele acela tine cota
   * buna — aia se probeaza pe valori, pe `planulCotelor`. Ce apara e ziua in care cineva schimba
   * unul dintre cele doua randuri si nu si pe celalalt.
   */
  const fgo = readFileSync("src/lib/actions/fgo.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  const perechi = [...fgo.matchAll(/unitPrice: toNet\([^,]+, (\w[\w.]*)\),[\s\S]{0,200}?vatRate: (\w[\w.]*),/g)];
  assert.ok(perechi.length >= 5, `gasite doar ${perechi.length} linii fGO cu net + cota`);
  for (const [, socotita, declarata] of perechi) {
    assert.equal(
      socotita, declarata,
      `fGO scoate netul la ${socotita} si declara ${declarata}: pretul de pe factura nu se potriveste cu cota de pe ea`,
    );
  }

  /*
   * SmartBill si Oblio scriu cota o SINGURA data pe linie (`campuriTva` pune si numele, si
   * procentul), deci acolo nu exista doua randuri care sa se poata desparti. Ce se cere e ca
   * linia de MARFA sa-si ia cota din linie, nu din document.
   */
  for (const cale of ["src/lib/actions/smartbill.actions.ts", "src/lib/actions/oblio.actions.ts"]) {
    assert.match(
      readFileSync(cale, "utf8"), /\.\.\.campuriTva\(cotaLiniei\(item\)\)/,
      `${cale}: linia de marfa nu-si mai ia cota din linie`,
    );
  }
});

test("⚠ transportul si taxa de ramburs NU raman pe cota documentului", () => {
  /*
   * ⚠ CE A SCAPAT O RUNDA INTREAGA. La Oblio, reducerea de plata online, cea de ramburs si taxa de
   * ramburs ramasesera pe `vatFields` — cota documentului — desi liniile de marfa se despartisera
   * deja pe cote. Adica exact greseala pe care runda o repara, ramasa in trei locuri din patru:
   * o reducere scazuta cu TVA de 21% dintr-o baza care are si 11%.
   *
   * ⚠ SI DE CE E O PROBA DE FORMA, DESI ASTA E O SLABICIUNE: liniile se construiesc in module
   * `"use server"`, unde functiile nu se pot exporta ca sa fie probate (fiecare export e o adresa
   * publica). Socoteala pe care o fac a fost mutata in `planulCotelor` si e probata pe valori mai
   * jos; ce ramane aici e legatura dintre ele.
   */
  const perechi: [string, RegExp[]][] = [
    ["src/lib/actions/smartbill.actions.ts", [/"Transport"/, /"Taxa plata ramburs"/, /"Reducere plata online"/, /"Reducere plata ramburs"/]],
    ["src/lib/actions/oblio.actions.ts", [/"Transport"/, /"Taxa plata ramburs"/, /"Reducere plata online"/, /"Reducere plata ramburs"/]],
    ["src/lib/actions/fgo.actions.ts", [/"Transport"/, /"Taxa plata ramburs"/, /"Reducere plata online"/, /"Reducere plata ramburs"/]],
  ];

  for (const [cale, nume] of perechi) {
    const linii = readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").split(/\r?\n/);
    for (const n of nume) {
      const i = linii.findIndex((l) => n.test(l) && l.includes("name:"));
      assert.ok(i > 0, `${cale}: n-am gasit linia ${n}`);
      /* Linia se scrie INTR-O bucla peste grupele de cota: bucla incepe cu cel mult 4 randuri mai sus. */
      const inainte = linii.slice(Math.max(0, i - 4), i).join(" ");
      assert.match(
        inainte, /peGrupe\(/,
        `${cale}: linia ${n} pleaca pe cota documentului, nu pe cotele marfii pe care o insoteste`,
      );
    }
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

/* ══════════════════════════════════════════════════════════════════════════
   PLANUL COTELOR: SOCOTEALA PE CARE CELE TREI CASE O FACEAU FIECARE PE CONT PROPRIU
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DE CE E O PROBA IMPORTANTA, SI NU UNA DE FORMA. Scrisa in trei fisiere `"use server"`,
   socoteala asta nu se putea proba pe VALORI: raman doar probe care citesc sursa si spun ca
   „s-a chemat o functie". Mutata aici, fiecare numar care ajunge pe un document fiscal are un
   numar asteptat langa el.
*/

test("⚠ o singura cota: NU se imparte nimic, si nici nu se rotunjeste inainte de vreme", () => {
  /*
   * ⚠ CE APARA. Prima varianta trecea si drumul cu o singura cota prin `imparteProportional`.
   * Doua pagube, amandoua tacute:
   *
   *   1. o comanda FARA linii (`grupe` gol) isi pierdea transportul cu totul — impartirea n-avea
   *      intre cine sa imparta si intorcea o lista goala, deci linia nici nu se mai scria;
   *   2. suma se rotunjea la doi bani INAINTE ca fGO sa-i scoata netul, desi pretul de pachet
   *      chiar are mai mult de doi bani.
   */
  const p = planulCotelor([{ price: 100, quantity: 1, vat_rate: 21 }], 21);
  assert.equal(p.amestecate, false);
  assert.deepEqual(p.peGrupe(19.995), [[21, 19.995]], "suma a fost impartita sau rotunjita");
  assert.equal(p.numeCuCota("Transport", 21), "Transport", "numele a capatat coada fara nevoie");
  assert.equal(p.codCuCota("transport", 21), "transport", "codul s-a schimbat fara nevoie");

  /* ⚠ SI FARA NICIO LINIE: transportul TOT trebuie sa plece. */
  const gol = planulCotelor([], 21);
  assert.deepEqual(gol.peGrupe(15), [[21, 15]], "comanda fara linii si-a pierdut transportul");
});

test("⚠ cote amestecate: suma se imparte proportional, iar numele si codul se despart", () => {
  const p = planulCotelor([
    { price: 100, quantity: 1, vat_rate: 11 },
    { price: 150, quantity: 2, vat_rate: 21 },
  ], 21);

  assert.equal(p.amestecate, true);
  assert.deepEqual(p.grupe, [{ cota: 11, valoare: 100 }, { cota: 21, valoare: 300 }]);
  assert.deepEqual(p.peGrupe(100), [[11, 25], [21, 75]]);

  /* ⚠ Doua linii cu acelasi nume pe aceeasi factura n-ar spune nimanui de ce sunt doua. */
  assert.equal(p.numeCuCota("Transport", 11), "Transport (11%)");
  /*
   * ⚠ SI CODUL. Pe conturile cu gestiune codul identifica ARTICOLUL, iar un articol are o singura
   * cota: „transport" cerut deodata cu 11% si cu 21% e chiar randul pe care documentul cade.
   */
  assert.equal(p.codCuCota("transport", 11), "transport-11");
  assert.equal(p.codCuCota("transport", 21), "transport-21");
  assert.equal(p.codCuCota("transport", 9.5), "transport-9-5", "punctul din cota strica codul");
});

test("⚠ cota ZERO pe document inseamna zero pe TOATE liniile, oricat ar scrie marketplace-ul", () => {
  /*
   * ═══ ⚠ O REGRESIE A MEA, PRINSA LA RECITIRE SI NU DE VREO PROBA ═══
   *
   * Prima varianta punea in cele trei case `cotaDeFacturare(item, effectiveVat)`. Corect pentru un
   * platitor, si gresit pentru cine nu e: `cotaDeFacturare` intoarce cota SCRISA PE LINIE, iar
   * liniile de marketplace o poarta mereu. Un comerciant NEPLATITOR de TVA cu o comanda Pepita ar
   * fi trimis spre fGO linii de 11% si 21% — pe factura unui om care n-are voie sa arate TVA.
   *
   * ⚠ SI N-AR FI SUNAT NICIO ALARMA: garda de reconciliere lucreaza la fGO pe baza NETA, iar
   * netul iese acelasi indiferent de ce cota se declara langa el.
   *
   * Regula sta acum intr-un singur loc, si e chiar asta: fara cota pe document, nicio linie n-are
   * cota. Iar grupele nici nu se mai fac, ca sa nu se imparta transportul intre cote fantoma.
   */
  const neplatitor = planulCotelor([
    { price: 100, quantity: 1, vat_rate: 11 },
    { price: 100, quantity: 1, vat_rate: 21 },
  ], 0);

  assert.equal(neplatitor.cotaLiniei({ vat_rate: 11 }), 0, "linia si-a pastrat cota de la marketplace");
  assert.equal(neplatitor.amestecate, false, "un neplatitor n-are cote amestecate");
  assert.deepEqual(neplatitor.grupe, [], "s-au facut grupe de cota pe o factura fara TVA");
  assert.deepEqual(neplatitor.peGrupe(20), [[0, 20]], "transportul s-a impartit intre cote fantoma");

  /* ⚠ Iar la un platitor, aceleasi linii isi pastreaza cotele. Fara asta, proba ar trece si daca
     `cotaLiniei` ar intoarce mereu zero. */
  const platitor = planulCotelor([{ price: 100, quantity: 1, vat_rate: 11 }], 21);
  assert.equal(platitor.cotaLiniei({ vat_rate: 11 }), 11);
  assert.equal(platitor.cotaLiniei({}), 21, "linia fara cota proprie n-a luat-o pe a documentului");
  /* ⚠ Si zero SCRIS pe linie, la un platitor, ramane zero: un produs scutit nu se taxeaza. */
  assert.equal(platitor.cotaLiniei({ vat_rate: 0 }), 0);
});

test("⚠ 21% + 0%: linia scutita ramane scutita, si transportul se imparte si cu ea", () => {
  /*
   * ⚠ ZERO E O COTA, NU O LIPSA, si perechea asta e cea in care greseala nu se vede: o carte la
   * 0% langa un produs la 21%. Pusa toata comanda pe 21, cartea ar fi fost taxata; pusa pe 0, s-ar
   * fi sub-declarat TVA pentru celalalt produs.
   */
  const p = planulCotelor([
    { price: 100, quantity: 1, vat_rate: 0 },
    { price: 100, quantity: 1, vat_rate: 21 },
  ], 21);

  assert.equal(p.amestecate, true);
  assert.deepEqual(p.grupe, [{ cota: 0, valoare: 100 }, { cota: 21, valoare: 100 }]);
  assert.deepEqual(p.peGrupe(20), [[0, 10], [21, 10]], "transportul n-a atins grupa scutita");
  /* Doar jumatatea taxabila poarta TVA: 110 × 21/121 = 19,090… → 19,09. */
  assert.equal(p.tvaDinTotal({ transport: 20 }), 19.09);
});

test("⚠ 11% + 11%: comanda e UNIFORMA, iar transportul urmeaza liniile, nu documentul", () => {
  /*
   * ⚠ CAZUL CARE SE DESPARTE DE CE PARE. Toate liniile la 11%, dar `orders.vat_rate` a ramas 21 —
   * asa arata comenzile de marketplace intrate inainte ca ingestul sa scrie cota dominanta. Daca
   * transportul ar lua cota DOCUMENTULUI, ar pleca cu 21% peste marfa de 11%, pe o comanda pe care
   * nimic n-o socoteste „amestecata" si pe care deci nimic n-o mai priveste a doua oara.
   */
  const p = planulCotelor([
    { price: 100, quantity: 1, vat_rate: 11 },
    { price: 50, quantity: 2, vat_rate: 11 },
  ], 21);

  assert.equal(p.amestecate, false, "aceeasi cota pe toate liniile nu e un amestec");
  assert.deepEqual(p.grupe, [{ cota: 11, valoare: 200 }]);
  assert.deepEqual(p.peGrupe(20), [[11, 20]], "transportul a plecat pe cota documentului");
  assert.equal(p.numeCuCota("Transport", 11), "Transport", "numele a capatat coada fara nevoie");

  /* ⚠ Iar la o comanda din magazin, unde nicio linie nu poarta cota, grupa SE FACE pe cota
     documentului si nimic nu se schimba fata de cum era. */
  const magazin = planulCotelor([{ price: 100, quantity: 1 }], 21);
  assert.deepEqual(magazin.peGrupe(20), [[21, 20]]);
});

test("⚠ o parte care se rotunjeste la zero se ARUNCA, dar suma partilor ramane intreaga", () => {
  /*
   * O linie de zero lei pe o factura nu inseamna nimic pentru nimeni, dar aruncata gresit ar
   * insemna bani pierduti. Aici se cere si una, si alta.
   */
  const p = planulCotelor([
    { price: 0.01, quantity: 1, vat_rate: 11 },
    { price: 1000, quantity: 1, vat_rate: 21 },
  ], 21);
  const parti = p.peGrupe(0.02);
  assert.deepEqual(parti, [[21, 0.02]], "partea nula n-a fost aruncata");
  assert.equal(parti.reduce((a, [, v]) => a + v, 0), 0.02, "impartirea a pierdut bani");
});

test("⚠ TVA-ul din total cuprinde SI transportul, SI reducerile, nu doar marfa", () => {
  /*
   * ⚠ CE APARA. Garda de reconciliere compara acest numar cu `orders.total`. Socotit doar pe
   * marfa, ar fi fost pus langa un total care contine si transportul si taxa de ramburs — doua
   * numere socotite dupa reguli diferite, si un refuz pe o comanda perfect corecta.
   *
   * Marfa 100 la 11% si 100 la 21%; transport 20 si reducere 40, amandoua impartite pe jumatate.
   * Fiecare grupa ajunge la 100 + 10 − 20 = 90.
   *
   *   90 × 11/111 = 8,918918…
   *   90 × 21/121 = 15,619834…
   *                 ─────────
   *                 24,538752… → 24,54
   */
  const p = planulCotelor([
    { price: 100, quantity: 1, vat_rate: 11 },
    { price: 100, quantity: 1, vat_rate: 21 },
  ], 21);
  assert.equal(p.tvaDinTotal({ transport: 20, reduceri: [40] }), 24.54);

  /* ⚠ Fara transport si fara reducere, doar marfa: 9,9099 + 17,3553 = 27,2652 → 27,27. */
  assert.equal(p.tvaDinTotal({}), 27.27);

  /* ⚠ Si cu o singura cota: 100 + 20 − 40 = 80; 80 × 21/121 = 13,884… → 13,88. */
  const unic = planulCotelor([{ price: 100, quantity: 1, vat_rate: 21 }], 21);
  assert.equal(unic.tvaDinTotal({ transport: 20, reduceri: [40] }), 13.88);
});

test("⚠ planul si garda de reconciliere se potrivesc, cap la cap", () => {
  /*
   * ═══ ⚠ PROBA CARE LEAGA CELE DOUA JUMATATI ═══
   *
   * Fiecare a fost probata separat mai sus. Ce lipsea era chiar imbinarea: liniile construite CU
   * planul, puse in fata garzii care le certifica. Daca cele doua ar socoti dupa reguli diferite,
   * niciuna dintre probele de mai sus n-ar sufla o vorba — si comanda ar fi refuzata in productie.
   *
   * Comanda: 100 lei la 11%, 100 lei la 21%, transport 20, total 220. Casa cere preturi NETE (fGO).
   */
  const p = planulCotelor([
    { price: 100, quantity: 1, vat_rate: 11 },
    { price: 100, quantity: 1, vat_rate: 21 },
  ], 21);

  const net = (brut: number, cota: number) => Math.round((brut / (1 + cota / 100)) * 100) / 100;
  const linii = [
    { cantitate: 1, pretUnitar: net(100, 11) },
    { cantitate: 1, pretUnitar: net(100, 21) },
    ...p.peGrupe(20).map(([cota, valoare]) => ({ cantitate: 1, pretUnitar: net(valoare, cota) })),
  ];

  const r = reconciliazaFactura({
    linii, totalComenzii: 220, liniiNete: true,
    regim: { rate: 21, taxIncluded: true, fallback: false },
    tvaContinutInTotal: p.tvaDinTotal({ transport: 20 }),
  });
  assert.notEqual(r.fel, "refuz", `garda a refuzat un document construit cu propriul plan: ${JSON.stringify(r)}`);
});
