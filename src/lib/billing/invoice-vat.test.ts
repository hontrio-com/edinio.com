import assert from "node:assert/strict";
import { test } from "node:test";
import { cereNumeleCotei, invoiceVat, numeCota, numePeCote } from "./invoice-vat";
import { readFileSync } from "node:fs";
import { liniiFgo, liniiOblio, liniiSmartbill, reconciliazaComanda } from "./reconcile";

/**
 * Aceeasi intrebare — ce cota poarta factura — avea trei raspunsuri, cate unul pe
 * casa de facturare. Doar SmartBill se uita la comanda; Oblio lua un numar din
 * propria configurare, iar fGO setarile magazinului citite AZI.
 */

const BRUT = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const NET = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };

test("cota se ia de pe COMANDA, nu din setarile de azi", () => {
  // Cazul care se va intampla: magazinul a trecut de la 19 la 21, iar o comanda
  // veche se factureaza acum. Ea a fost incasata cu 19, deci 19 scrie pe factura.
  assert.deepEqual(invoiceVat({ vat_rate: 19 }, BRUT), { rate: 19, taxIncluded: true, fallback: false });
  assert.deepEqual(invoiceVat({ vat_rate: 21 }, BRUT), { rate: 21, taxIncluded: true, fallback: false });
  // Cota redusa, ceruta de interfata ca presetare.
  assert.equal(invoiceVat({ vat_rate: 9 }, BRUT).rate, 9);
});

test("comanda de dinainte de TVA se factureaza cu cota magazinului, pe sumele platite", () => {
  // Cele 39 de comenzi din productie cu vat_rate 0 la magazine care au pornit
  // TVA-ul intre timp: 36 sunt deja facturate asa.
  assert.deepEqual(invoiceVat({ vat_rate: 0 }, BRUT), { rate: 21, taxIncluded: true, fallback: true });
});

test("rezerva forteaza regimul cu TVA inclus — aici era toata diferenta", () => {
  // La un magazin cu preturi NETE, o comanda veche pretuita fara TVA ar fi primit
  // TVA PESTE sumele incasate: 545 lei facturati ca 659,45. SmartBill avea regula,
  // Oblio si fGO nu — si niciunul din cei doi nu se uita macar la comanda.
  assert.deepEqual(invoiceVat({ vat_rate: 0 }, NET), { rate: 21, taxIncluded: true, fallback: true });
  // Cu cota proprie, aceeasi comanda ramane pe regimul magazinului.
  assert.equal(invoiceVat({ vat_rate: 21 }, NET).taxIncluded, false);
});

test("magazinul neplatitor nu capata TVA din nicio rezerva", () => {
  const neplatitor = { vat_enabled: false, vat_rate: 21, prices_include_vat: true };
  assert.deepEqual(invoiceVat({ vat_rate: 21 }, neplatitor), { rate: 0, taxIncluded: true, fallback: false });
  assert.deepEqual(invoiceVat({ vat_rate: 0 }, neplatitor), { rate: 0, taxIncluded: true, fallback: false });
});

test("casa de facturare fara identitate fiscala configurata emite fara TVA", () => {
  // SmartBill fara numele cotei, Oblio fara `vat_name`: comerciantul n-a terminat
  // configurarea, deci nu se inventeaza o cota in locul lui.
  assert.equal(invoiceVat({ vat_rate: 21 }, BRUT, false).rate, 0);
});

test("magazin platitor fara cota completata: factura fara TVA, nu 19 din senin", () => {
  const faraCota = { vat_enabled: true, vat_rate: 0, prices_include_vat: true };
  assert.equal(invoiceVat({ vat_rate: 0 }, faraCota).rate, 0);
  assert.equal(invoiceVat({ vat_rate: 0 }, faraCota).fallback, false);
});

test("cotele venite ca sir din baza sunt tot numere", () => {
  // Garda, nu incident dovedit: `numeric` din Postgres poate ajunge ca sir, iar
  // fGO nu trecea cota prin `Number()` nicaieri pe drumul ei catre `CotaTVA`.
  assert.equal(invoiceVat({ vat_rate: "19.00" }, BRUT).rate, 19);
  assert.equal(invoiceVat({ vat_rate: null }, { ...BRUT, vat_rate: "21.00" }).rate, 21);
  assert.equal(invoiceVat({}, BRUT).rate, 21);
});

/* ─── Numele cotei ────────────────────────────────────────────────────────── */

/**
 * SmartBill si Oblio cer NUMELE cotei, nu procentul, iar comerciantul alege o
 * PERECHE nume+procent din nomenclatorul contului. Cand cota facturii nu mai e
 * cea aleasa atunci, numele configurat descrie alt procent decat cel trimis.
 */

const COTE = [{ name: "Normala", percentage: 21 }, { name: "Redusa", percentage: 9 }, { name: "SFDD", percentage: 0 }];

test("numele configurat se pastreaza cat timp descrie chiar cota trimisa", () => {
  assert.equal(numeCota(21, { name: "Normala", percentage: 21 }, COTE), "Normala");
});

test("cand cota difera, numele se cauta dupa PROCENT", () => {
  // Un magazin din productie si-a numit cota chiar dupa procent: pe o comanda
  // veche la 19 ar fi plecat numele acela langa procentul 19.
  assert.equal(numeCota(9, { name: "Normala", percentage: 21 }, COTE), "Redusa");
  assert.equal(numeCota(19, { name: "cota 21", percentage: 21 }, COTE), "cota 21",
    "fara o cota de 19 in cont, ramane numele configurat: mai bine aproximativ decat neemisa");
});

test("fara nomenclator, factura pleaca tot cu numele configurat", () => {
  assert.equal(numeCota(9, { name: "Normala", percentage: 21 }), "Normala");
  assert.equal(numeCota(9, { name: "Normala", percentage: 21 }, []), "Normala");
});

test("nomenclatorul se reciteste doar cand numele nu se mai potriveste", () => {
  // Un apel de retea in plus inseamna un mod de esec in plus pe un drum care azi
  // merge fara el: in productie configurarea Oblio e sincrona cu magazinul.
  assert.equal(cereNumeleCotei(21, 21), false);
  assert.equal(cereNumeleCotei(19, 21), true);
  assert.equal(cereNumeleCotei(0, 21), false, "factura fara TVA n-are nevoie de nume");
});

/* ══════════════════════════════════════════════════════════════════════════
   UN NUME PENTRU FIECARE COTA (09.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   SmartBill si Oblio primesc PERECHEA nume+procent, iar in nomenclatorul contului numele e cel
   legat de procent. Cat timp documentul avea o singura cota, un nume aproximativ era doar
   aproximativ. Cu doua cote pe acelasi document, acelasi nume ar pleca langa amandoua.
*/

const NOMENCLATOR = [
  { name: "Normala", percentage: 21 },
  { name: "Redusa", percentage: 11 },
  { name: "Scutit", percentage: 0 },
];
const CONFIGURAT = { name: "Normala", percentage: 21 };

test("⚠ fiecare cota isi ia numele ei din nomenclator", () => {
  const r = numePeCote([21, 11, 0], CONFIGURAT, NOMENCLATOR);
  assert.equal(r.nume.get(21), "Normala");
  assert.equal(r.nume.get(11), "Redusa");
  /* ⚠ ZERO E O COTA, nu o lipsa: are si el nume, si el trebuie gasit. */
  assert.equal(r.nume.get(0), "Scutit");
  assert.deepEqual(r.faraNume, []);
});

test("⚠ o cota care nu exista in cont se SPUNE, nu se acopera cu numele configurat", () => {
  /*
   * ⚠ CE APARA. `numeCota` cade pe numele configurat cand nu gaseste nimic — purtare buna pentru
   * un document cu o singura cota, si o minciuna pe hartie pentru unul cu doua: „Normala" ar fi
   * plecat scris langa 11%. Apelantul trebuie sa poata deosebi „am gasit" de „am cazut inapoi".
   */
  const doar21 = [{ name: "Normala", percentage: 21 }];
  const r = numePeCote([21, 11], CONFIGURAT, doar21);
  assert.equal(r.nume.get(11), "Normala", "caderea inapoi a disparut, si ea e purtarea buna la o cota");
  assert.deepEqual(r.faraNume, [11], "cota fara pereche adevarata n-a fost semnalata");
});

test("⚠ fara nomenclator, singura pereche cunoscuta e cea CONFIGURATA", () => {
  /*
   * Reteaua cazuta nu opreste o factura cu o singura cota: perechea configurata e chiar cea a
   * comerciantului. Dar nu poate acoperi si celelalte cote, si nici nu pretinde ca poate.
   */
  const r = numePeCote([21, 11], CONFIGURAT, undefined);
  assert.equal(r.nume.get(21), "Normala");
  assert.deepEqual(r.faraNume, [11]);
});

test("⚠ numele configurat care nu e in cont nu tine loc de pereche", () => {
  /*
   * SmartBill trimite `percentage: -1` cand numele din configurare nu se gaseste in cont: nu i se
   * cunoaste procentul, deci nu poate pretinde ca descrie vreo cota. Cu nomenclatorul citit, cota
   * se gaseste dupa PROCENT si perechea iese adevarata.
   */
  const necunoscut = { name: "Normala", percentage: -1 };
  assert.deepEqual(numePeCote([21], necunoscut, NOMENCLATOR).faraNume, []);
  assert.equal(numePeCote([21], necunoscut, NOMENCLATOR).nume.get(21), "Normala");
  /* Fara nomenclator insa, nimic nu confirma perechea. */
  assert.deepEqual(numePeCote([21], necunoscut, undefined).faraNume, [21]);
});

test("⚠ cotele repetate nu se socotesc de doua ori", () => {
  const r = numePeCote([21, 21, 11, 11], CONFIGURAT, [{ name: "Normala", percentage: 21 }]);
  assert.equal(r.nume.size, 2);
  assert.deepEqual(r.faraNume, [11], "aceeasi cota a fost raportata de doua ori");
});

/* ══════════════════════════════════════════════════════════════════════════
   REGIMUL DE PRET, INGHETAT PE COMANDA (09.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE A FOST GRESIT. Cota era inghetata de mult; regimul — „sumele contin deja TVA?" — se lua
   de fiecare data din setarea de AZI a magazinului. Iar toate cele patru marketplace-uri scriu in
   comanda sume BRUTE, fiindca asa lucreaza ele. Pe un magazin cu preturi FARA TVA, facturarea le
   citea ca nete.

   ⚠ SI CE NU S-A INTAMPLAT, ca sa fie spus drept: garda de reconciliere prindea nepotrivirea si
   REFUZA documentul. N-a plecat nicio factura umflata. Paguba adevarata era ca o comanda de
   marketplace nu se putea factura DELOC pe un asemenea magazin, iar mesajul de refuz il trimitea
   pe comerciant sa „editeze si sa salveze" — adica sa-si umfle chiar el totalul cu cota TVA.
*/

const MAGAZIN_NET = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };
const MAGAZIN_BRUT = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };

test("⚠ regimul INGHETAT pe comanda bate si setarea magazinului, si rezerva", () => {
  /* Comanda spune „brut"; magazinul de azi zice „net". Comanda are dreptate: cifrele sunt ale ei. */
  assert.equal(invoiceVat({ vat_rate: 21, prices_include_vat: true }, MAGAZIN_NET).taxIncluded, true);
  /* Si invers, ca proba sa nu treaca doar fiindca raspunde mereu `true`. */
  assert.equal(invoiceVat({ vat_rate: 21, prices_include_vat: false }, MAGAZIN_BRUT).taxIncluded, false);

  /*
   * ⚠ `false` E UN RASPUNS, nu o lipsa. Citit cu `||` sau cu un `??` pus peste o valoare falsa,
   * ar fi fost trecut cu vederea si s-ar fi intrebat mai departe magazinul. Aceeasi capcana ca la
   * cota zero pe o linie.
   */
  assert.equal(invoiceVat({ vat_rate: 21, prices_include_vat: false }, MAGAZIN_BRUT).taxIncluded, false);
});

test("⚠ comanda VECHE, fara regim scris, se poarta exact ca pana acum", () => {
  /*
   * 245 de comenzi din productie n-au coloana scrisa, si regimul de atunci chiar nu se mai poate
   * afla. Ele cad pe setarea magazinului — adica pe purtarea de dinainte, bit cu bit.
   */
  assert.equal(invoiceVat({ vat_rate: 21 }, MAGAZIN_NET).taxIncluded, false);
  assert.equal(invoiceVat({ vat_rate: 21 }, MAGAZIN_BRUT).taxIncluded, true);
  assert.equal(invoiceVat({ vat_rate: 21, prices_include_vat: null }, MAGAZIN_NET).taxIncluded, false);
  /* Si rezerva pentru comenzile de dinainte de pornirea TVA-ului ramane si ea neatinsa. */
  const rezerva = invoiceVat({ vat_rate: 0 }, MAGAZIN_NET);
  assert.equal(rezerva.fallback, true);
  assert.equal(rezerva.taxIncluded, true, "rezerva nu mai forteaza regimul cu TVA inclus");
});

test("⚠ comanda de marketplace pe un magazin cu preturi FARA TVA se factureaza acum, la toate trei casele", () => {
  /*
   * ═══ ⚠ CHIAR DRUMUL CARE CADEA ═══
   *
   * Magazin: 100 lei NET, cota 21%. Feedul trimite la Pepita 121 (vezi `pretBrut`). Comanda se
   * intoarce cu 121, si tot 121 se scrie in `orders.total`; `vat_amount` = 21, adica TVA-ul
   * CONTINUT in ei.
   *
   * Fara regimul inghetat, `taxIncluded` iesea `false`, garda socotea baza 121 − 21 = 100 si o
   * punea langa linii care insumeaza 121: refuz, cu 21 de lei diferenta.
   */
  const comanda = { total: 121, vat_amount: 21, vat_rate: 21, prices_include_vat: true };
  const regim = invoiceVat(comanda, MAGAZIN_NET);
  /* ⚠ `vat_rate` E SCRIS PE COMANDA, si trebuie sa fie si aici: fara el proba ar cadea pe rezerva
     („comanda de dinainte de TVA"), care forteaza oricum `taxIncluded`, si ar fi trecut verde si
     peste codul nereparat. Ingestul scrie chiar cota dominanta. */
  assert.equal(regim.taxIncluded, true);

  /* SmartBill si Oblio trimit preturi BRUTE: linia e chiar 121. */
  assert.equal(reconciliazaComanda(liniiSmartbill([{ quantity: 1, price: 121 }]), comanda, regim).fel, "exact");
  assert.equal(reconciliazaComanda(liniiOblio([{ quantity: 1, price: 121 }]), comanda, regim).fel, "exact");

  /* fGO cere pretul NET, si atunci garda converteste ea totalul: 121 / 1,21 = 100. */
  assert.equal(
    reconciliazaComanda(liniiFgo([{ quantity: 1, unitPrice: 100 }]), comanda, regim, { liniiNete: true }).fel,
    "exact",
  );

  /* ⚠ Iar fara regimul inghetat, aceeasi comanda era REFUZATA. Asta e ce s-a reparat. */
  /* ⚠ Aceeasi comanda, DOAR fara regimul scris — adica exact ce era in baza pana azi. */
  const { prices_include_vat: _regim, ...faraRegim } = comanda;
  const vechi = invoiceVat(faraRegim, MAGAZIN_NET);
  assert.equal(vechi.fallback, false, "proba ar masura rezerva, nu regimul");
  const refuz = reconciliazaComanda(liniiSmartbill([{ quantity: 1, price: 121 }]), comanda, vechi);
  assert.equal(refuz.fel, "refuz");
  if (refuz.fel === "refuz") assert.equal(refuz.delta, -21);
});

test("⚠ pe un magazin cu preturi CU TVA nimic nu se schimba", () => {
  const comanda = { total: 121, vat_amount: 21, vat_rate: 21, prices_include_vat: true };
  assert.equal(invoiceVat(comanda, MAGAZIN_BRUT).taxIncluded, true);
  assert.equal(
    reconciliazaComanda(liniiSmartbill([{ quantity: 1, price: 121 }]), comanda, invoiceVat(comanda, MAGAZIN_BRUT)).fel,
    "exact",
  );
});

test("⚠ comerciantul schimba setarea magazinului: comanda VECHE nu-si schimba factura", () => {
  /*
   * ⚠ ASTA E JUMATATEA CARE NU TINE DE NICIUN MARKETPLACE. Comanda plasata cand magazinul tinea
   * preturi FARA TVA, facturata dupa ce a trecut pe preturi CU TVA: aceleasi cifre, alt inteles,
   * si nimic nu spunea nimanui. Aceeasi paguba pentru care cota era deja inghetata.
   */
  const comanda = { total: 100, vat_amount: 21, vat_rate: 21, prices_include_vat: false };
  const inainte = invoiceVat(comanda, MAGAZIN_NET);
  const dupaSchimbare = invoiceVat(comanda, MAGAZIN_BRUT);
  assert.deepEqual(dupaSchimbare, inainte, "schimbarea setarii a rescris intelesul unei comenzi vechi");

  /* Si garda vede aceleasi numere in amandoua clipele: 100 − 21 = 79 de baza neta. */
  const linii = liniiSmartbill([{ quantity: 1, price: 79 }]);
  assert.equal(reconciliazaComanda(linii, comanda, inainte).fel, "exact");
  assert.equal(reconciliazaComanda(linii, comanda, dupaSchimbare).fel, "exact");
});

test("⚠ toate cele patru ingesturi de marketplace SCRIU regimul, nu-l lasa pe seama magazinului", () => {
  /*
   * ⚠ CE APARA. Sumele lor sunt brute prin constructie — la toate patru, nu doar la Pepita. Un
   * ingest care uita randul asta trimite comanda in exact defectul reparat aici, si n-o vede
   * nimeni pana cand primul magazin cu preturi fara TVA porneste marketplace-ul acela.
   */
  const ingesturi = [
    "src/lib/pepita/ingest.ts",
    "src/lib/emag/orders.ts",
    "src/lib/trendyol/orders.ts",
    "src/lib/aboutyou/orders.ts",
  ];
  for (const cale of ingesturi) {
    const sursa = readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.match(
      sursa, /prices_include_vat: true/,
      `${cale}: comanda pleaca fara regimul de pret, deci facturarea il va ghici din setarea magazinului`,
    );
  }
});
