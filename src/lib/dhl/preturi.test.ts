import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { cheiaOfertei, etichetaOferta, explicatieTva, ofertePosibile, VALUTA } from "./preturi";
import { numeProdus } from "./servicii";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Aici se hotaraste ce vede cumparatorul in checkout si pe ce plateste comerciantul.
 * Cinci lucruri pot merge prost tacut, si patru dintre ele nu se vad decat pe factura
 * DHL de luna urmatoare:
 *
 *  1. PRETUL CITIT DIN ALT PRET. `totalPrice[]` e un TABLOU si poarta ACELASI transport
 *     de trei ori, in trei valute, in acelasi raspuns: `BILLC` (valuta de facturare a
 *     contului), `PULCL` (tariful PUBLIC al tarii) si `BASEC` (valuta de baza a retelei
 *     lor, „either USD or EUR", deci niciodata RON). Un `totalPrice[0]` luat la
 *     intamplare da cand tariful de lista, cand euro scrisi ca lei. De aceea fabrica de
 *     mai jos pune `BILLC` DINADINS pe ultima pozitie: o proba care nu poate cadea nu
 *     apara nimic.
 *
 *  2. `SPRQT` CONFUNDAT CU TOTALUL. In devizul lor `SPRQT` e „Net shipment / weight
 *     charge" — transportul gol, fara suprataxe. In exemplul lor oficial `SPRQT = 130`
 *     iar totalul e `157,95`. Cine afiseaza `SPRQT` pierde 17,7% pe FIECARE comanda.
 *
 *  3. TVA-UL PRESUPUS. DHL n-are echivalentul lui `TotalChargesWithTaxes` de la UPS: are
 *     un singur numar, `STTXA`, si nu spune daca e deja inauntrul totalului. In exemplul
 *     lor oficial `STTXA` e ZERO pe toate cele trei valute. Un „fara TVA" afirmat gresit
 *     ii calculeaza comerciantului marja pe un pret cu o cincime mai mic decat il costa.
 *
 *  4. O OFERTA ASCUNSA DE NOI. `POST /rates` primeste contul real si intoarce ce se poate
 *     vinde pe contractul ala. Filtrata dupa tabelul nostru comercial, oferta ieftina ar
 *     disparea si cumparatorul ar plati varianta scumpa. Aceeasi lectie ca la UPS, unde
 *     prima varianta a trebuit intoarsa.
 *
 *  5. `QDDF` PREZENTAT CA TERMEN GARANTAT. Implicitul lor de estimare e `QDDF`, despre
 *     care ei insisi scriu ca „does not constitute DHL's service commitment". Un termen
 *     scris ca promisiune devine o reclamatie pe care o plateste magazinul, nu DHL.
 */

/* ═══ Navigare prin JSON-ul lor, ca la UPS ═══ */

function drum(o: unknown, cai: string[]): unknown {
  let curent: unknown = o;
  for (const cheie of cai) {
    assert.ok(curent !== null && typeof curent === "object", `lipseste calea ${cai.join(".")}`);
    curent = (curent as Record<string, unknown>)[cheie];
  }
  return curent;
}

function nod(o: unknown, ...cai: string[]): Record<string, unknown> {
  const v = drum(o, cai);
  assert.ok(v !== null && typeof v === "object" && !Array.isArray(v), `${cai.join(".")} nu e obiect`);
  return v as Record<string, unknown>;
}

function lista(o: unknown, ...cai: string[]): Record<string, unknown>[] {
  const v = drum(o, cai);
  assert.ok(Array.isArray(v), `${cai.join(".")} nu e tablou`);
  return v as Record<string, unknown>[];
}

/* ═══ Fabrica de oferte, in gramatica LOR ═══ */

/** O linie din `detailedPriceBreakdown[].breakdown[]`. Fara `pret` = linie de CATALOG. */
type Linie = {
  nume?: string;
  serviciu?: string;
  tip?: string;
  pret?: number;
  contract?: boolean;
};

type Optiuni = {
  /** Pretul din `BILLC`, adica singurul care se citeste. */
  pret?: number;
  valuta?: string;
  /** Tariful public (`PULCL`), momeala pentru cine ia `totalPrice[0]`. */
  public?: number;
  /** Valuta de baza (`BASEC`), momeala pentru cine ia primul element gasit. */
  baza?: number;
  /** Raspuns FARA `BILLC` deloc. */
  faraFacturare?: boolean;
  /** `BILLC` fara `priceCurrency` — camp care NU e in lista lor `required`. */
  faraValuta?: boolean;
  /** `STTXA` in blocul `BILLC`. */
  tva?: number;
  /** `STTXA` in blocul `PULCL` — momeala pentru cine citeste primul bloc. */
  tvaPublic?: number;
  /** Blocul `BILLC` declarat in ALTA valuta decat pretul. */
  tvaInAltaValuta?: boolean;
  linii?: Linie[];
  /** `detailedPriceBreakdown` doar cu blocul public. */
  detaliatDoarPublic?: boolean;
  local?: string | null;
  nume?: string;
  contract?: boolean;
  zile?: number;
  livrare?: string;
  estimare?: string;
};

function linieDhl(l: Linie): Record<string, unknown> {
  const r: Record<string, unknown> = { name: l.nume ?? "" };
  if (l.serviciu !== undefined) {
    r.serviceCode = l.serviciu;
    r.localServiceCode = l.serviciu;
  }
  if (l.tip !== undefined) r.serviceTypeCode = l.tip;
  if (l.pret !== undefined) r.price = l.pret;
  if (l.contract !== undefined) r.isCustomerAgreement = l.contract;
  return r;
}

/** Un `products[]` in forma lor, cu toate cele trei valute deodata. */
function oferta(cod: string, o: Optiuni = {}): Record<string, unknown> {
  const valuta = (o.valuta ?? VALUTA).toUpperCase();
  const pret = o.pret ?? 100;
  /* Devizul implicit se inchide exact pe pret, ca la ei: transport + combustibil. */
  const transport = Math.round(pret * 80) / 100;
  const combustibil = Math.round((pret - transport) * 100) / 100;

  const liniile: Linie[] = o.linii ?? [
    /* ⚠ Prima linie e PRODUSUL, nu un serviciu: „name within the first occurrence of
       breakdown will be the Global Product Name" — si nu are `serviceCode`. */
    { nume: "EXPRESS WORLDWIDE", pret: transport },
    { nume: "FUEL SURCHARGE", serviciu: "FF", tip: "SCH", pret: combustibil },
    /* Catalogul serviciilor doar DISPONIBILE pe ruta: vine fara `price`. */
    { nume: "SATURDAY DELIVERY", serviciu: "AA", tip: "XCH" },
  ];

  /* ⚠ `BILLC` PUS ULTIMUL, DINADINS. Vezi antetul. */
  const totalPrice: Record<string, unknown>[] = [
    { currencyType: "PULCL", priceCurrency: valuta, price: o.public ?? Math.round(pret * 140) / 100 },
    { currencyType: "BASEC", priceCurrency: "EUR", price: o.baza ?? Math.round(pret * 20) / 100 },
  ];
  if (!o.faraFacturare) {
    const facturare: Record<string, unknown> = { currencyType: "BILLC", price: pret };
    if (!o.faraValuta) facturare.priceCurrency = valuta;
    totalPrice.push(facturare);
  }

  const taxaBillc: Record<string, unknown>[] = [];
  if (o.tva !== undefined) taxaBillc.push({ typeCode: "STTXA", price: o.tva });
  /* ⚠ `SPRQT` e transportul gol, nu totalul. Sta aici tocmai ca sa poata fi citit gresit. */
  taxaBillc.push({ typeCode: "SPRQT", price: transport });

  const totalPriceBreakdown: Record<string, unknown>[] = [
    {
      currencyType: "PULCL",
      priceCurrency: valuta,
      priceBreakdown: [
        { typeCode: "STTXA", price: o.tvaPublic ?? 999 },
        { typeCode: "SPRQT", price: Math.round(pret * 112) / 100 },
      ],
    },
    {
      currencyType: "BILLC",
      priceCurrency: o.tvaInAltaValuta ? "EUR" : valuta,
      priceBreakdown: taxaBillc,
    },
  ];

  const detailedPriceBreakdown: Record<string, unknown>[] = [
    {
      currencyType: "PULCL",
      priceCurrency: valuta,
      breakdown: liniile.map((l) =>
        linieDhl(l.pret === undefined ? l : { ...l, pret: Math.round(l.pret * 140) / 100 }),
      ),
    },
  ];
  if (!o.detaliatDoarPublic) {
    detailedPriceBreakdown.push({
      currencyType: "BILLC",
      priceCurrency: valuta,
      breakdown: liniile.map(linieDhl),
    });
  }

  /* ⚠ Implicitul e `QDDF`, cel care NU e angajament. Asa vine si de la ei. */
  const deliveryCapabilities: Record<string, unknown> = { deliveryTypeCode: o.estimare ?? "QDDF" };
  if (o.zile !== undefined) deliveryCapabilities.totalTransitDays = o.zile;
  if (o.livrare !== undefined) deliveryCapabilities.estimatedDeliveryDateAndTime = o.livrare;

  const produs: Record<string, unknown> = {
    productName: o.nume ?? "",
    productCode: cod,
    networkTypeCode: "TD",
    weight: { volumetric: 1.2, provided: 1.5, unitOfMeasurement: "metric" },
    totalPrice,
    totalPriceBreakdown,
    detailedPriceBreakdown,
    deliveryCapabilities,
  };
  const local = o.local === undefined ? cod : o.local;
  if (local !== null) produs.localProductCode = local;
  if (o.contract !== undefined) produs.isCustomerAgreement = o.contract;
  return produs;
}

describe("DHL: momelile din fabrica sunt chiar acolo", () => {
  /*
   * ⚠ Probele de mai jos au valoare numai daca raspunsul fals seamana cu cel adevarat.
   * Daca fabrica ar trimite un singur pret, „se ia BILLC" ar trece si cu `[0]`.
   */
  test("un raspuns are trei preturi, doua blocuri de deviz si o momeala in fiecare", () => {
    const brut = oferta("P", { pret: 157.95, tva: 30 });

    const preturi = lista(brut, "totalPrice");
    assert.deepEqual(preturi.map((p) => p.currencyType), ["PULCL", "BASEC", "BILLC"]);
    assert.equal(preturi[0].price, 221.13);
    assert.equal(preturi[1].priceCurrency, "EUR");
    assert.equal(preturi[2].price, 157.95);

    const total = lista(brut, "totalPriceBreakdown");
    assert.deepEqual(total.map((b) => b.currencyType), ["PULCL", "BILLC"]);
    assert.equal(lista(total[0], "priceBreakdown")[0].price, 999);
    assert.equal(lista(total[1], "priceBreakdown")[0].price, 30);
    /* `SPRQT` mai mic decat totalul, exact ca la ei. */
    assert.equal(lista(total[1], "priceBreakdown")[1].price, 126.36);

    const detaliat = lista(brut, "detailedPriceBreakdown");
    assert.deepEqual(detaliat.map((b) => b.currencyType), ["PULCL", "BILLC"]);
    assert.equal(nod(lista(detaliat[1], "breakdown")[0]).serviceCode, undefined);
  });
});

describe("DHL: trei preturi in acelasi raspuns, unul singur e al nostru", () => {
  test("⚠ pretul se ia din `BILLC`, nu din `totalPrice[0]`", () => {
    const r = ofertePosibile([oferta("P", { pret: 157.95, public: 220.4, baza: 31.6 })]);
    assert.equal(r.oferte.length, 1);
    /* `[0]` ar fi dat 220,40: tariful PUBLIC, in aceeasi valuta, deci nedetectabil. */
    assert.equal(r.oferte[0].pret, 157.95);
    assert.equal(r.oferte[0].valuta, VALUTA);
  });

  test("⚠ nici ultimul: `BILLC` se cauta dupa `currencyType`, nu dupa pozitie", () => {
    const brut = oferta("P", { pret: 90 });
    const preturi = lista(brut, "totalPrice");
    brut.totalPrice = [preturi[0], preturi[2], preturi[1]];
    assert.equal(ofertePosibile([brut]).oferte[0].pret, 90);
  });

  test("⚠ `SPRQT` e transportul gol, nu totalul", () => {
    const r = ofertePosibile([oferta("P", { pret: 157.95 })]);
    /* `SPRQT` din acelasi raspuns e 126,36. Citit ca pret, 17,7% pleaca din marja. */
    assert.equal(r.oferte[0].pret, 157.95);
  });

  test("⚠ o oferta care nu vine in lei se ARUNCA, nu se converteste", () => {
    const r = ofertePosibile([oferta("P", { pret: 12, valuta: "EUR" })]);
    assert.deepEqual(r.oferte, []);
    assert.deepEqual(r.valuteRefuzate, ["EUR"]);
  });

  test("⚠ fara `BILLC` oferta se pierde cu totul, si se spune de ce", () => {
    const r = ofertePosibile([oferta("P", { pret: 100, faraFacturare: true })]);
    assert.deepEqual(r.oferte, []);
    assert.deepEqual(r.valuteRefuzate, ["necunoscuta"]);
  });

  test("⚠ `BILLC` fara `priceCurrency` nu se citeste ca „probabil lei”", () => {
    const r = ofertePosibile([oferta("P", { pret: 100, faraValuta: true })]);
    assert.deepEqual(r.oferte, []);
    assert.deepEqual(r.valuteRefuzate, ["necunoscuta"]);
  });

  test("motivele nu se pierd cand sunt mai multe", () => {
    const r = ofertePosibile([
      oferta("P", { pret: 12, valuta: "EUR" }),
      oferta("H", { pret: 40, valuta: "USD" }),
      oferta("D", { pret: 30, faraFacturare: true }),
    ]);
    assert.deepEqual([...r.valuteRefuzate].sort(), ["EUR", "USD", "necunoscuta"]);
  });

  test("`price` ca sir se citeste; `price` care nu e numar pierde oferta", () => {
    const brut = oferta("P", { pret: 100 });
    const preturi = lista(brut, "totalPrice");
    /* Schema lor il da `number`, exemplele lor il scriu si ca sir. */
    preturi[2].price = "157.95";
    assert.equal(ofertePosibile([brut]).oferte[0].pret, 157.95);

    preturi[2].price = "gratis";
    const stricat = ofertePosibile([brut]);
    assert.deepEqual(stricat.oferte, []);
    assert.deepEqual(stricat.valuteRefuzate, ["necunoscuta"]);
  });
});

describe("DHL: ce oferte se arata, si in ce ordine", () => {
  /*
   * ⚠⚠ TABELUL NOSTRU DE PRODUSE NU E O POARTA.
   *
   * `POST /rates` primeste `accounts[]` cu contul real al comerciantului si intoarce
   * produsele pentru care „the delivery is feasible respecting the input data from the
   * request". Ce a intors DHL, DHL vinde. Ascunse pe temeiul unui PDF comercial din care
   * am citit sase randuri din doua sute treizeci si patru, ofertele bune ar disparea si
   * cumparatorul ar plati varianta scumpa fara sa afle nimeni de ce.
   */
  test("⚠ produsul pe care documentele lor nu-l dau pe ruta asta se SEMNALEAZA, nu se scoate", () => {
    const r = ofertePosibile(
      [oferta("N", { pret: 40 }), oferta("H", { pret: 120 })],
      undefined,
      { taraExpeditor: "RO", taraDestinatar: "RO" },
    );
    assert.deepEqual(r.oferte.map((o) => o.productCode), ["N", "H"]);
    /* `H` (Economy Select) e produs international; intern nu-l da nicio pagina a lor. */
    assert.deepEqual(r.neVanduteInRomania, [numeProdus("H")]);
  });

  test("aceeasi pereche pe o ruta externa nu mai semnaleaza nimic", () => {
    const r = ofertePosibile([oferta("H", { pret: 120 })], undefined, {
      taraExpeditor: "RO",
      taraDestinatar: "DE",
    });
    assert.equal(r.oferte.length, 1);
    assert.deepEqual(r.neVanduteInRomania, []);
  });

  test("⚠ `isCustomerAgreement` se SPUNE, nu ascunde oferta", () => {
    /* E o insusire a PRODUSULUI, nu un raspuns despre contul asta. Fara acord, emiterea
       cade zgomotos cu 8003 — o comanda blocata, nu un cost tacut. Merita spus inainte. */
    const r = ofertePosibile([oferta("H", { pret: 120, contract: true }), oferta("P", { pret: 90 })]);
    assert.equal(r.oferte.length, 2);
    assert.equal(r.oferte.find((o) => o.productCode === "H")?.cereContract, true);
    assert.equal(r.oferte.find((o) => o.productCode === "P")?.cereContract, false);
    assert.deepEqual(r.cerContract, [numeProdus("H")]);
  });

  test("⚠ ordinea e a PRETULUI, nu a presupunerii „economy = ieftin”", () => {
    /* Tabelele lor pentru Romania, Zona 1, la 1 kg: Express Worldwide 452,50 lei,
       Economy Select 473,00. Economy Select e mai SCUMP pe coletul tipic al unui magazin. */
    const r = ofertePosibile([
      oferta("H", { pret: 473.0, local: "ESI" }),
      oferta("P", { pret: 452.5, local: "WPX" }),
    ]);
    assert.deepEqual(r.oferte.map((o) => o.productCode), ["P", "H"]);
    assert.deepEqual(r.oferte.map((o) => o.pret), [452.5, 473]);
  });

  test("la 2 kg se inverseaza, si ordinea il urmeaza pe DHL, nu pe noi", () => {
    const r = ofertePosibile([
      oferta("P", { pret: 659.26, local: "WPX" }),
      oferta("H", { pret: 625.0, local: "ESI" }),
    ]);
    assert.deepEqual(r.oferte.map((o) => o.productCode), ["H", "P"]);
  });

  test("filtrul comerciantului: gol inseamna TOATE, nu niciunul", () => {
    const brute = [oferta("P", { pret: 90 }), oferta("H", { pret: 120 })];
    assert.equal(ofertePosibile(brute, { produse_permise: [] }).oferte.length, 2);
    assert.equal(ofertePosibile(brute, {}).oferte.length, 2);
    /* Codul din configurare se normalizeaza: „h" scris de mana e tot `H`. */
    assert.deepEqual(
      ofertePosibile(brute, { produse_permise: ["h"] }).oferte.map((o) => o.productCode),
      ["H"],
    );
  });

  test("⚠ paletii nu apar la un colet de 2 kg, dar apar la 900", () => {
    const brute = [oferta("F", { pret: 900 }), oferta("P", { pret: 90 })];
    assert.deepEqual(
      ofertePosibile(brute, undefined, { greutateKg: 2 }).oferte.map((o) => o.productCode),
      ["P"],
    );
    assert.deepEqual(
      ofertePosibile(brute, undefined, { greutateKg: 900 }).oferte.map((o) => o.productCode),
      ["P", "F"],
    );
  });

  test("un cod NECUNOSCUT trece si primeste un nume citibil, nu o litera", () => {
    const r = ofertePosibile([oferta("ZZ", { pret: 90, nume: "EXPRESS WORLDWIDE NONDOC" })]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].productName, "DHL Express worldwide nondoc");
    /* Necunoscut nu inseamna „nu exista": nu se semnaleaza ca nevandut. */
    assert.deepEqual(r.neVanduteInRomania, []);
  });

  test("`document` se citeste din nomenclatorul lor, nu se decide de noi", () => {
    const r = ofertePosibile([oferta("D", { pret: 90 }), oferta("P", { pret: 100 })]);
    assert.equal(r.oferte.find((o) => o.productCode === "D")?.document, true);
    assert.equal(r.oferte.find((o) => o.productCode === "P")?.document, false);
  });

  test("`warnings[]` de pe un 200 ajung la comerciant, o singura data", () => {
    const r = ofertePosibile([oferta("P", { pret: 90 })], undefined, undefined, [
      "  Price can't be calculated  ",
      "Price can't be calculated",
      "",
    ]);
    assert.deepEqual(r.alerte, ["Price can't be calculated"]);
  });
});

describe("DHL: cheia unei oferte are DOUA parti", () => {
  /*
   * ⚠ La UPS cheia era `Service.Code` si era de ajuns. Aici reemiterea trebuie sa plece pe
   * EXACT produsul pentru care a platit cumparatorul, iar `POST /shipments` primeste si
   * `productCode`, si `localProductCode`. De aceea baza are doua coloane, nu una.
   */
  test("acelasi produs cu ACELASI cod local vine o data; prima aparitie castiga", () => {
    const r = ofertePosibile([
      oferta("P", { pret: 452.5, local: "P" }),
      oferta("P", { pret: 999, local: "P" }),
    ]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 452.5);
  });

  test("⚠ acelasi `productCode` cu coduri locale DIFERITE sunt DOUA produse", () => {
    const r = ofertePosibile([
      oferta("P", { pret: 452.5, local: "P" }),
      oferta("P", { pret: 470, local: "WPX" }),
    ]);
    assert.equal(r.oferte.length, 2);
    assert.deepEqual(r.oferte.map((o) => cheiaOfertei(o)), ["P|P", "P|WPX"]);
  });

  test("un produs fara cod local nu e acelasi cu unul care are", () => {
    const r = ofertePosibile([
      oferta("P", { pret: 400, local: null }),
      oferta("P", { pret: 420, local: "P" }),
    ]);
    assert.deepEqual(r.oferte.map((o) => cheiaOfertei(o)), ["P", "P|P"]);
  });

  test("⚠ un cod local imposibil nu se scurteaza si nu se inventeaza", () => {
    /* Schema lor da `maxLength: 3`. Peste atat, campul nu se poate citi in nicio lectura
       a documentatiei lor, deci ramane `null` — nu se taie la trei caractere. */
    const r = ofertePosibile([oferta("P", { pret: 90, local: "WPXPX" })]);
    assert.equal(r.oferte[0].localProductCode, null);
    assert.equal(cheiaOfertei(r.oferte[0]), "P");
  });
});

describe("DHL: TVA-ul se reconstituie din deviz, niciodata nu se presupune", () => {
  test("⚠ `STTXA` se ia din blocul cu ACELASI `currencyType`, nu din primul", () => {
    const r = ofertePosibile([oferta("P", { pret: 100, tva: 19, tvaPublic: 999 })]);
    /* Blocul `PULCL` vine PRIMUL si are 999. Citit de acolo, taxa ar fi a altei valute. */
    assert.equal(r.oferte[0].tva, 19);
  });

  test("⚠ un bloc `BILLC` declarat in ALTA valuta decat pretul nu se citeste", () => {
    const r = ofertePosibile([oferta("P", { pret: 100, tva: 19, tvaInAltaValuta: true })]);
    assert.equal(r.oferte[0].tva, null);
    assert.equal(r.oferte[0].cuTva, null);
  });

  test("⚠ `STTXA` zero inseamna „nu l-au calculat”, nu „fara TVA”", () => {
    /* In exemplul lor oficial `STTXA` e ZERO pe toate cele trei valute, iar ghidul lor de
       tarife pentru Romania scrie de patru ori „Rates ... exclude VAT and all surcharges". */
    const r = ofertePosibile([oferta("P", { pret: 100, tva: 0 })]);
    assert.equal(r.oferte[0].tva, null);
    assert.equal(r.oferte[0].cuTva, null);
    assert.match(explicatieTva(r.oferte[0]) ?? "", /nu l-au calculat/);
  });

  test("`STTXA` lipsa spune acelasi lucru, si nu tace", () => {
    const r = ofertePosibile([oferta("P", { pret: 100 })]);
    assert.equal(r.oferte[0].tva, null);
    assert.match(explicatieTva(r.oferte[0]) ?? "", /^DHL n-a raportat TVA/);
  });

  test("taxa PE DEASUPRA: suma liniilor da chiar totalul", () => {
    const r = ofertePosibile([
      oferta("P", {
        pret: 125,
        tva: 23.75,
        linii: [
          { nume: "EXPRESS WORLDWIDE", pret: 100 },
          { nume: "FUEL SURCHARGE", serviciu: "FF", tip: "SCH", pret: 20 },
          { nume: "EMERGENCY SITUATION", serviciu: "CR", tip: "SCH", pret: 5 },
        ],
      }),
    ]);
    assert.equal(r.oferte[0].cuTva, 148.75);
    assert.equal(explicatieTva(r.oferte[0]), "+ TVA 23.75 lei (total cu TVA 148.75 lei)");
  });

  test("taxa DEJA INAUNTRU: suma liniilor plus taxa da totalul", () => {
    const r = ofertePosibile([
      oferta("P", {
        pret: 125,
        tva: 20,
        linii: [
          { nume: "EXPRESS WORLDWIDE", pret: 100 },
          { nume: "FUEL SURCHARGE", serviciu: "FF", tip: "SCH", pret: 5 },
        ],
      }),
    ]);
    assert.equal(r.oferte[0].cuTva, 125);
    assert.equal(explicatieTva(r.oferte[0]), "Pretul include deja TVA 20.00 lei.");
  });

  test("⚠ cand devizul nu se inchide, raspunsul e „nu stim”, nu o presupunere", () => {
    const r = ofertePosibile([
      oferta("P", { pret: 125, tva: 20, linii: [{ nume: "EXPRESS WORLDWIDE", pret: 50 }] }),
    ]);
    assert.equal(r.oferte[0].tva, 20);
    assert.equal(r.oferte[0].cuTva, null);
    assert.equal(
      explicatieTva(r.oferte[0]),
      "DHL a raportat TVA 20.00 lei, dar devizul nu spune daca e deja in pret. Verifica pe prima factura.",
    );
  });

  test("rotunjirile lor incap in toleranta, o diferenta adevarata nu", () => {
    const aproape = ofertePosibile([
      oferta("P", { pret: 125, tva: 10, linii: [{ nume: "EXPRESS WORLDWIDE", pret: 124.97 }] }),
    ]);
    assert.equal(aproape.oferte[0].cuTva, 135);

    const departe = ofertePosibile([
      oferta("P", { pret: 125, tva: 10, linii: [{ nume: "EXPRESS WORLDWIDE", pret: 124.9 }] }),
    ]);
    assert.equal(departe.oferte[0].cuTva, null);
  });

  test("⚠ un deviz format DOAR din catalogul de servicii nu e o suma", () => {
    /* Liniile fara `price` sunt serviciile DISPONIBILE pe ruta, nu bani facturati. Adunate,
       ar inchide aritmetica degeaba si ar afirma un TVA care nu s-a dovedit. */
    const r = ofertePosibile([
      oferta("P", {
        pret: 125,
        tva: 20,
        linii: [
          { nume: "SATURDAY DELIVERY", serviciu: "AA", tip: "XCH" },
          { nume: "GOGREEN PLUS", serviciu: "FT", tip: "XCH" },
        ],
      }),
    ]);
    assert.equal(r.oferte[0].cuTva, null);
  });

  test("fara deviz detaliat in valuta noastra, TVA-ul ramane nedovedit", () => {
    /* ⚠ Blocul ramas e cel PUBLIC, cu alte cifre. Nimic din el nu poate dovedi in ce
       tabara sta taxa din blocul de facturare. */
    const r = ofertePosibile([oferta("P", { pret: 125, tva: 20, detaliatDoarPublic: true })]);
    assert.equal(r.oferte[0].tva, 20);
    assert.equal(r.oferte[0].cuTva, null);
  });
});

describe("DHL: devizul de servicii", () => {
  test("⚠ prima linie e PRODUSUL, nu un serviciu", () => {
    const r = ofertePosibile([oferta("P", { pret: 100 })]);
    assert.deepEqual(r.oferte[0].servicii.map((s) => s.cod), ["FF", "AA"]);
    /* „EXPRESS WORLDWIDE" poarta chiar transportul. Aratat ca serviciu optional in panou,
       ar fi cerut inapoi la emitere si platit a doua oara. */
    assert.equal(
      r.oferte[0].servicii.some((s) => s.nume.toUpperCase().includes("WORLDWIDE")),
      false,
    );
  });

  test("numele se traduc, tipul lor se pastreaza", () => {
    const servicii = ofertePosibile([oferta("P", { pret: 100 })]).oferte[0].servicii;
    assert.deepEqual(servicii[0], {
      cod: "FF",
      nume: "Suprataxa de combustibil",
      tip: "SCH",
      cereContract: false,
    });
    assert.equal(servicii[1].nume, "Livrare sambata");
    assert.equal(servicii[1].tip, "XCH");
  });

  test("⚠ `serviceTypeCode` din raspunsul lor bate tabelul nostru", () => {
    /* Tipul e al CONTULUI si al RUTEI; tabelul nostru e o transcriere globala. In el `II`
       e `XCH`; daca pe contul asta vine ca suprataxa, asa se arata. */
    const r = ofertePosibile([
      oferta("P", {
        pret: 100,
        linii: [{ nume: "SHIPMENT INSURANCE", serviciu: "II", tip: "SCH", pret: 100 }],
      }),
    ]);
    assert.equal(r.oferte[0].servicii[0].tip, "SCH");
  });

  test("fara tipul lor se cade pe tabel, si numai pe el", () => {
    const r = ofertePosibile([
      oferta("P", {
        pret: 100,
        linii: [
          { nume: "SHIPMENT INSURANCE", serviciu: "II", pret: 100 },
          { nume: "CEVA NOU", serviciu: "ZZ" },
        ],
      }),
    ]);
    assert.equal(r.oferte[0].servicii[0].tip, "XCH");
    /* Un cod pe care nu-l stim nu primeste un tip inventat: ar aparea in panou ca optiune
       care se poate cere, iar `FF` cerut inapoi inseamna 17,5% platiti de doua ori. */
    assert.equal(r.oferte[0].servicii[1].tip, "");
    assert.equal(r.oferte[0].servicii[1].nume, "Ceva nou");
  });

  test("acelasi cod de doua ori pastreaza PRIMA aparitie", () => {
    const r = ofertePosibile([
      oferta("P", {
        pret: 100,
        linii: [
          { nume: "FUEL SURCHARGE", serviciu: "FF", tip: "SCH", pret: 100 },
          { nume: "FUEL SURCHARGE", serviciu: "FF", tip: "XCH" },
        ],
      }),
    ]);
    assert.equal(r.oferte[0].servicii.length, 1);
    /* Linia FACTURATA vine inaintea catalogului, deci ea poarta tipul real al platii. */
    assert.equal(r.oferte[0].servicii[0].tip, "SCH");
  });

  test("`isCustomerAgreement` de pe linie calatoreste pe serviciu", () => {
    const r = ofertePosibile([
      oferta("P", {
        pret: 100,
        linii: [{ nume: "DANGEROUS GOODS", serviciu: "HE", tip: "XCH", contract: true, pret: 100 }],
      }),
    ]);
    assert.equal(r.oferte[0].servicii[0].cereContract, true);
  });
});

describe("DHL: termenul de livrare nu se prezinta ca o promisiune", () => {
  test("⚠ `QDDF` nu e angajament, si eticheta nu-l ridica la unul", () => {
    const o = ofertePosibile([
      oferta("P", { pret: 100, zile: 3, estimare: "QDDF", livrare: "2026-09-20T12:00:00" }),
    ]).oferte[0];
    assert.equal(o.tipEstimare, "QDDF");
    const eticheta = etichetaOferta(o);
    assert.equal(eticheta, `${numeProdus("P")} (estimativ 3 zile lucratoare)`);
    for (const cuvant of ["garantat", "garantie", "cel tarziu"]) {
      assert.equal(eticheta.toLowerCase().includes(cuvant), false, cuvant);
    }
  });

  test("nici `QDDC` nu schimba eticheta: angajamentul lor nu se scrie in checkout", () => {
    const cuAngajament = ofertePosibile([oferta("P", { pret: 100, zile: 3, estimare: "QDDC" })])
      .oferte[0];
    assert.equal(cuAngajament.tipEstimare, "QDDC");
    assert.equal(
      etichetaOferta(cuAngajament),
      etichetaOferta({ productName: numeProdus("P"), tranzit: 3 }),
    );
  });

  test("o zi se scrie „o zi”, nu „1 zile”", () => {
    assert.equal(
      etichetaOferta({ productName: "DHL Express", tranzit: 1 }),
      "DHL Express (estimativ o zi lucratoare)",
    );
  });

  test("⚠ zero zile de tranzit nu inseamna „azi”, inseamna necunoscut", () => {
    const o = ofertePosibile([oferta("P", { pret: 100, zile: 0 })]).oferte[0];
    assert.equal(o.tranzit, null);
    assert.equal(etichetaOferta(o), numeProdus("P"));
  });

  test("⚠ ora estimata pleaca BRUTA: e ora locala a DESTINATIEI, si vine fara fus", () => {
    /* Citita ca UTC sau ca ora magazinului, da alta zi pe rutele externe. Se formateaza
       acolo unde se stie tara, nu aici. */
    const o = ofertePosibile([oferta("P", { pret: 100, livrare: "2026-09-20T12:00:00" })]).oferte[0];
    assert.equal(o.livrareEstimata, "2026-09-20T12:00:00");
  });

  test("fara nume de produs eticheta ramane „DHL”, nu goala", () => {
    assert.equal(etichetaOferta({ productName: "  ", tranzit: null }), "DHL");
  });
});

describe("DHL: intrari murdare si raspunsuri goale", () => {
  test("un raspuns gol nu crapa si nu inventeaza nimic", () => {
    const r = ofertePosibile([]);
    assert.deepEqual(r.oferte, []);
    assert.deepEqual(r.valuteRefuzate, []);
    assert.deepEqual(r.alerte, []);
    assert.deepEqual(r.neVanduteInRomania, []);
    assert.deepEqual(r.cerContract, []);
  });

  test("null, siruri, numere si obiecte fara cod se sar", () => {
    const r = ofertePosibile([
      null,
      "P",
      7,
      {},
      { productCode: "" },
      { productCode: "   " },
      oferta("P", { pret: 45 }),
    ] as unknown[]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 45);
  });

  test("⚠ un transport de 0 lei nu e o oferta, si nici o problema de valuta", () => {
    /* Zeroul apare tocmai cand ei nu stiu sa coteze — avertismentul lor propriu e „Price
       can't be calculated", si vine pe un 200. Ales de fiecare cumparator, l-ar plati
       magazinul. Dar nu e o valuta refuzata, deci nu trimite comerciantul la banca. */
    const r = ofertePosibile([oferta("P", { pret: 0 }), oferta("H", { pret: -5 })]);
    assert.deepEqual(r.oferte, []);
    assert.deepEqual(r.valuteRefuzate, []);
  });

  test("un produs fara niciun deviz ramane o oferta valida", () => {
    const brut = oferta("P", { pret: 90 });
    delete brut.totalPriceBreakdown;
    delete brut.detailedPriceBreakdown;
    delete brut.deliveryCapabilities;
    const r = ofertePosibile([brut]);
    assert.equal(r.oferte.length, 1);
    assert.equal(r.oferte[0].pret, 90);
    assert.equal(r.oferte[0].tva, null);
    assert.equal(r.oferte[0].tranzit, null);
    assert.deepEqual(r.oferte[0].servicii, []);
  });
});
