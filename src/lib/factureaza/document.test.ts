import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  alegeSeria, anulDocumentului, cantitateText, CLIENT_DE_TEST, clientPotrivit, clientulFacturii, CNP_NECUNOSCUT,
  codTara, compuneFactura, compuneStornarea, dataDocumentului, dataValida, facturaExistenta, marcajEmitere,
  MENTIUNE_TEST, rotunjit, stornareExistenta, sumaDeIncasat, totalulPozitiilor, verificaSeriaLaSalvare,
  type ComandaDeFacturat, type FacturaCompusa,
} from "./document";
import type { ClientCitit, DocumentCitit, PozitieNoua } from "./client";
import type { SerieFactura } from "./config";

/*
 * Factureaza.ro, pe valori. Ce se poate dovedi fara fir se dovedeste aici: data fiscala in ora
 * Romaniei, totalul care trebuie sa fie chiar `orders.total`, semnul reducerilor (pret unitar
 * pozitiv), clientul (si cel inventat din modul de test), seria anului, si stornarea care anuleaza
 * factura pana la ban.
 *
 * ⚠ Forma liniilor (totalul cu TVA, cantitate -1 la reduceri) si stornarea copiata din factura au
 * fost trimise CHIAR asa pe sandbox-ul lor pe 17.11.2026 si primite: vezi `FACTUREAZA.md`.
 */

const magazinCuTva = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const ACUM = new Date("2026-11-17T10:00:00Z");
const SLOT = { poateEmite: true } as const;

function comanda(extra: Partial<ComandaDeFacturat> = {}): ComandaDeFacturat {
  return {
    order_number: "0012",
    customer_name: "Ion Popescu",
    shipping_address: { address: "Str. Lunga 5", city: "Brasov", county: "Brasov" },
    items: [
      { name: "Cana", price: 49.9, quantity: 2, product_id: "11111111-1111-4111-8111-111111111111" },
      { name: "Farfurie", price: 19.99, quantity: 3 },
    ],
    shipping_cost: 15,
    discount_amount: 10,
    discount_code: "TOAMNA",
    card_discount_amount: 5,
    total: 49.9 * 2 + 19.99 * 3 + 15 - 10 - 5,
    vat_rate: 21,
    prices_include_vat: true,
    payment_status: "paid",
    ...extra,
  };
}

function compune(extra: Partial<ComandaDeFacturat> = {}, p: Partial<Parameters<typeof compuneFactura>[0]> = {}) {
  return compuneFactura({
    comanda: comanda(extra), magazin: magazinCuTva, skus: new Map(), slot: SLOT,
    etichetaPlata: "Card online (Netopia)", acum: ACUM, mediu: "productie", ...p,
  });
}

function reusita(f: ReturnType<typeof compuneFactura>): FacturaCompusa {
  assert.ok(!("error" in f), "error" in f ? f.error : "");
  return f as FacturaCompusa;
}

/** ⚠ Regula semnului: cantitatea si totalul au acelasi semn, deci pretul unitar scos de ei e pozitiv (BR-27). */
function semneleSuntBune(pozitii: PozitieNoua[]) {
  for (const p of pozitii) {
    const q = Number(p.unitCount);
    const t = Number(p.total);
    assert.ok(q !== 0, `${p.description}: cantitate zero`);
    assert.ok(t === 0 || Math.sign(q) === Math.sign(t), `${p.description}: ${q} buc. cu totalul ${t} ar da pret negativ`);
  }
}

describe("datele, in ora Romaniei", () => {
  test("⚠ dupa miezul noptii in Romania, factura poarta ziua de AZI, nu pe a UTC", () => {
    assert.equal(dataDocumentului(new Date("2026-11-16T23:30:00Z")), "2026-11-17");
    assert.equal(dataDocumentului(new Date("2026-07-01T21:30:00Z")), "2026-07-02", "vara, UTC+3");
  });
  test("⚠ si ANUL (deci seria) se schimba la miezul noptii din Romania, nu din UTC", () => {
    assert.equal(anulDocumentului(new Date("2026-12-31T22:30:00Z")), "2027");
    assert.equal(anulDocumentului(new Date("2026-12-31T21:30:00Z")), "2026");
  });
});

describe("cifrele", () => {
  test("rotunjirea la doi bani nu cade in capcana virgulei mobile, si e simetrica", () => {
    assert.equal(rotunjit(1.005), 1.01);
    assert.equal(rotunjit(-1.005), -1.01);
    assert.equal(rotunjit(2.675), 2.68);
    assert.equal(rotunjit(6.705 * 2), 13.41);
    assert.equal(rotunjit(0), 0);
  });
  test("cantitatea ca text, cel mult trei zecimale", () => {
    assert.equal(cantitateText(3), "3");
    assert.equal(cantitateText(2.5), "2.5");
    assert.equal(cantitateText(-1), "-1");
    assert.equal(cantitateText(1 / 3), "0.333");
  });
});

describe("factura comenzii", () => {
  test("liniile dau CHIAR totalul comenzii, iar reducerile sunt linii negative cu pret pozitiv", () => {
    const c = comanda();
    const f = reusita(compune({}, { skus: new Map([["11111111-1111-4111-8111-111111111111", "CANA-01"]]) }));
    assert.equal(f.total, rotunjit(Number(c.total)));
    assert.equal(totalulPozitiilor(f.pozitii), f.total);
    assert.deepEqual(f.pozitii.map((p) => [p.description, p.unitCount, p.total, p.vat]), [
      ["Cana", "2", "99.80", "21"],
      ["Farfurie", "3", "59.97", "21"],
      ["Transport", "1", "15.00", "21"],
      ["Discount (TOAMNA)", "-1", "-10.00", "21"],
      ["Reducere plată online", "-1", "-5.00", "21"],
    ]);
    semneleSuntBune(f.pozitii);
    assert.equal(f.pozitii[0].productCode, "CANA-01");
    assert.equal(f.pozitii[1].productCode, undefined, "fara SKU, fara cod");
    assert.deepEqual(f.pozitii.map((p) => p.position), ["0", "1", "2", "3", "4"]);
    assert.ok(f.pozitii.every((p) => p.unit === "buc"));
  });
  test("pretul de pachet nerotunjit (6,705 x 2) intra exact, fara linie de ajustare", () => {
    const f = reusita(compune({
      items: [{ name: "Pachet", price: 6.705, quantity: 2 }],
      shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 13.41,
    }));
    assert.equal(f.total, 13.41);
    assert.deepEqual(f.pozitii.map((p) => p.total), ["13.41"]);
  });
  test("diferenta de rotunjire legitima se absoarbe intr-o linie, iar documentul iese pe fix", () => {
    const f = reusita(compune({
      items: [1, 2, 3].map((i) => ({ name: `Bucata ${i}`, price: 33.333, quantity: 1 })),
      shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 100,
    }));
    assert.equal(f.total, 100);
    const ajustare = f.pozitii.find((p) => p.description === "Ajustare rotunjire");
    assert.ok(ajustare, "lipseste linia de ajustare");
    assert.equal(ajustare.total, "0.01");
    assert.equal(ajustare.unitCount, "1");
    const minus = reusita(compune({
      items: [1, 2, 3].map((i) => ({ name: `Bucata ${i}`, price: 33.336, quantity: 1 })),
      shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 100,
    }));
    const a2 = minus.pozitii.find((p) => p.description === "Ajustare rotunjire");
    assert.deepEqual([a2?.unitCount, a2?.total], ["-1", "-0.02"], "ajustarea in minus: cantitate -1, total negativ");
    assert.equal(minus.total, 100);
    semneleSuntBune(minus.pozitii);
  });
  test("⚠ o comanda ale carei linii nu dau totalul NU se factureaza", () => {
    const f = compune({ total: 50 });
    assert.ok("error" in f);
    assert.match(f.error, /nu se poate factura/);
  });
  test("cote amestecate: fiecare linie cu cota ei, transportul si reducerea impartite, totalul exact", () => {
    const f = reusita(compune({
      items: [
        { name: "Carte", price: 50, quantity: 1, vat_rate: 11 } as never,
        { name: "Joc", price: 100, quantity: 1, vat_rate: 21 } as never,
      ],
      shipping_cost: 15, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 165,
    }));
    assert.equal(f.total, 165);
    assert.equal(f.pozitii.find((p) => p.description === "Carte")?.vat, "11");
    assert.equal(f.pozitii.find((p) => p.description === "Joc")?.vat, "21");
    assert.deepEqual(
      f.pozitii.filter((p) => p.description.startsWith("Transport")).map((p) => [p.description, p.total, p.vat]),
      [["Transport (11%)", "5.00", "11"], ["Transport (21%)", "10.00", "21"]],
    );
  });
  test("neplatitor de TVA: totul pe 0%, totalul tot exact", () => {
    const f = reusita(compune({ vat_rate: 0 }, { magazin: { vat_enabled: false, vat_rate: 0, prices_include_vat: true } }));
    assert.ok(f.pozitii.every((p) => p.vat === "0"));
    assert.equal(f.total, 159.77);
  });
  test("⚠ preturi FARA TVA: totalul liniei primeste TVA-ul ei, iar documentul da tot `orders.total`", () => {
    const f = reusita(compune({
      items: [{ name: "Serviciu", price: 100, quantity: 1 }, { name: "Piesa", price: 9.99, quantity: 3 }],
      shipping_cost: 10, discount_amount: 0, card_discount_amount: 0, discount_code: null,
      prices_include_vat: false, vat_amount: 21 + 6.29 + 2.1,
      total: 100 + 29.97 + 10 + 21 + 6.29 + 2.1,
    }));
    assert.deepEqual(f.pozitii.map((p) => p.total), ["121.00", "36.26", "12.10"]);
    assert.equal(f.total, 169.36);
  });
  test("⚠ un produs cu pret negativ nu ajunge pe factura (BR-27)", () => {
    const f = compune({ items: [{ name: "Retur", price: -5, quantity: 1 }], total: -5 });
    assert.ok("error" in f);
    assert.match(f.error, /preț negativ/);
  });
  test("o comanda fara nicio linie nu se factureaza", () => {
    const f = compune({ items: [], shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, total: 0 });
    assert.ok("error" in f);
  });
  test("antetul: data si anul din Romania, observatiile cu comanda si plata", () => {
    const f = reusita(compune({}, { acum: new Date("2026-12-31T22:30:00Z") }));
    assert.equal(f.data, "2027-01-01");
    assert.equal(f.an, "2027");
    assert.equal(f.mentiune, "Comanda #0012 - plata: Card online (Netopia)");
  });
  test("reemiterea dupa storno spune pe document ce inlocuieste", () => {
    const f = reusita(compune({}, { slot: { poateEmite: true, inlocuieste: { factura: "SRV 7", storno: "SRV 9" } } }));
    assert.match(f.mentiune, /inlocuieste factura SRV 7, stornata prin SRV 9/);
  });
});

describe("clientul", () => {
  test("persoana fizica: numele, adresa de livrare, CNP-ul necunoscut, Romania", () => {
    assert.deepEqual(clientulFacturii(comanda(), "productie"), {
      nume: "Ion Popescu", adresa: "Str. Lunga 5", oras: "Brasov", judet: "Brasov", tara: "RO",
      cif: CNP_NECUNOSCUT, esteFirma: false, regCom: "", codTva: "", platitorTva: null,
    });
  });
  test("firma platitoare: CIF FARA „RO”, „RO” separat (asa tiparesc ei „RO 14399840”), registrul comertului", () => {
    const c = clientulFacturii(comanda({
      billing_company: {
        company_name: "Firma SRL", cui: "14399840", reg_com: "J08/1/2020", vat_payer: true,
        address: "Str. Scurta 1", city: "Brasov", county: "Brasov", verified: true, inactive: false,
      },
    }), "productie");
    assert.deepEqual(c, {
      nume: "Firma SRL", adresa: "Str. Scurta 1", oras: "Brasov", judet: "Brasov", tara: "RO",
      cif: "14399840", esteFirma: true, regCom: "J08/1/2020", codTva: "RO", platitorTva: "vat_payer",
    });
  });
  test("firma neplatitoare: fara „RO”", () => {
    const c = clientulFacturii(comanda({
      billing_company: { company_name: "Firma SRL", cui: "14399840", reg_com: "", vat_payer: false, address: "", city: "", county: "" },
    }), "productie");
    assert.equal(c.codTva, "");
    assert.equal(c.platitorTva, "no_vat_payer");
    assert.equal(c.adresa, "Str. Lunga 5", "fara sediu, cade pe adresa de livrare");
  });
  test("tara: codul ISO-2, cu litere mari; lipsa = Romania", () => {
    assert.equal(codTara("de"), "DE");
    assert.equal(codTara(null), "RO");
    assert.equal(clientulFacturii(comanda({ shipping_address: { address: "Hauptstr. 1", city: "Berlin", country: "de" } }), "productie").tara, "DE");
  });
  test("⚠⚠ in modul de test NU pleaca nicio data a cumparatorului (sandbox-ul lor e un cont public)", () => {
    const real = comanda({
      customer_name: "Maria Ionescu",
      shipping_address: { address: "Bd. Secret 7", city: "Iasi", county: "Iasi" },
      billing_company: { company_name: "Afacere Privata SRL", cui: "14399840", reg_com: "J22/9/2020", vat_payer: true, address: "Str. Privata 3", city: "Iasi", county: "Iasi" },
    });
    const f = reusita(compuneFactura({
      comanda: real, magazin: magazinCuTva, skus: new Map(), slot: SLOT, etichetaPlata: "", acum: ACUM, mediu: "test",
    }));
    assert.deepEqual(f.client, CLIENT_DE_TEST);
    const tot = JSON.stringify(f);
    for (const scapat of ["Maria", "Ionescu", "Secret", "Afacere", "14399840", "J22", "Iasi"]) {
      assert.ok(!tot.includes(scapat), `„${scapat}” ar fi ajuns in sandbox-ul public`);
    }
    assert.ok(f.mentiune.startsWith(MENTIUNE_TEST), "documentul de test o spune pe el");
    assert.equal(f.total, rotunjit(Number(real.total)), "liniile si totalul raman ale comenzii");
  });
});

describe("refolosirea clientului din nomenclatorul lor", () => {
  const dorit = clientulFacturii(comanda(), "productie");
  const citit = (extra: Partial<ClientCitit> = {}): ClientCitit => ({
    id: "77", nume: "Ion Popescu", cif: CNP_NECUNOSCUT, esteFirma: false, adresa: "Str. Lunga 5", oras: "Brasov",
    judet: "Brasov", tara: "RO", regCom: "", codTva: "", ...extra,
  });
  test("se refoloseste doar fisa cu EXACT datele de pe factura (ei copiaza fisa pe document)", () => {
    assert.equal(clientPotrivit([citit()], dorit), "77");
    assert.equal(clientPotrivit([citit({ nume: " Ion   Popescu " })], dorit), "77", "spatiile nu conteaza");
    assert.equal(clientPotrivit([citit({ tara: "ro" })], dorit), "77");
  });
  test("⚠ orice camp tiparit diferit = fisa noua, nu factura cu adresa veche", () => {
    for (const diferit of [
      { adresa: "Str. Alta 1" }, { oras: "Cluj" }, { judet: "Cluj" }, { nume: "Ion Pop" }, { cif: "1234567890123" },
      { tara: "MD" }, { esteFirma: true },
    ] as Partial<ClientCitit>[]) {
      assert.equal(clientPotrivit([citit(diferit)], dorit), null, JSON.stringify(diferit));
    }
  });
  test("la firma conteaza si registrul comertului si „RO”-ul", () => {
    const firma = { ...dorit, esteFirma: true, cif: "14399840", regCom: "J08/1/2020", codTva: "RO" };
    const fisa = citit({ esteFirma: true, cif: "14399840", regCom: "J08/1/2020", codTva: "RO" });
    assert.equal(clientPotrivit([fisa], firma), "77");
    assert.equal(clientPotrivit([{ ...fisa, regCom: "J08/2/2020" }], firma), null);
    assert.equal(clientPotrivit([{ ...fisa, codTva: "" }], firma), null);
  });
  test("din mai multe fise cu acelasi nume, se ia cea potrivita", () => {
    assert.equal(clientPotrivit([citit({ id: "1", adresa: "Alta" }), citit({ id: "2" })], dorit), "2");
  });
});

describe("seria anului", () => {
  const serie = (id: string, prefix: string, an: string): SerieFactura => ({ id, prefix, an, separator: "-", sufix: "", ultimulNumar: 1 });
  const serii = [serie("1", "SRV", "2026"), serie("2", "SRV", "2027"), serie("3", "HOS", "2026")];
  test("prefixul si anul documentului aleg seria", () => {
    assert.deepEqual(alegeSeria(serii, " SRV ", "2026"), { id: "1" });
    assert.deepEqual(alegeSeria(serii, "SRV", "2027"), { id: "2" });
  });
  test("⚠ fara serie pe anul documentului: refuz cu pasul urmator, nu seria altui an", () => {
    const r = alegeSeria(serii, "HOS", "2027");
    assert.ok("error" in r);
    assert.match(r.error, /nu are seria „HOS” pe anul 2027/);
  });
  test("doua serii cu acelasi prefix pe acelasi an: refuz, nu ghicit", () => {
    const r = alegeSeria([...serii, serie("4", "SRV", "2026")], "SRV", "2026");
    assert.ok("error" in r);
    assert.match(r.error, /mai multe serii/);
  });
});

describe("marcajul emiterii", () => {
  test("e determinist (reincercarea il gaseste) si poarta cheia registrului", () => {
    const k = "factura:factureaza:6f1c2d3e-0000-4000-8000-000000000000";
    assert.equal(marcajEmitere(k), marcajEmitere(k));
    assert.ok(marcajEmitere(k).includes(k));
    assert.notEqual(marcajEmitere(k), marcajEmitere(`${k}-R55`), "reemiterea dupa storno are alt marcaj");
  });
});

/** Factura asa cum a citit-o sandbox-ul lor pe 17.11.2026 (liniile, exact). */
function facturaCitita(extra: Partial<DocumentCitit> = {}): DocumentCitit {
  const l = (descriere: string, cantitate: number, pret: number, total: number, cota: number) => ({
    descriere, unitate: "buc", cantitate, pret, total, cota, cod: "", tip: "InvoicePosition", reducere: null,
  });
  return {
    id: "1065257891", eticheta: "openapi-12", contor: 12, stare: "open", data: "2026-11-17", total: 168.41,
    dePlata: 0, clientId: "1064116440", stornataId: null, valoareStornata: 0, nota: "",
    pozitii: [
      l("Pachet de proba", 2, 5.5413, 13.41, 21),
      l("Carte de proba", 1, 45.045, 50, 11),
      l("Joc de proba", 1, 82.6446, 100, 21),
      l("Transport (11%)", 1, 4.1351, 4.59, 11),
      l("Transport (21%)", 1, 8.6033, 10.41, 21),
      l("Discount (PROBA) (11%)", -1, 2.7568, -3.06, 11),
      l("Discount (PROBA) (21%)", -1, 5.7355, -6.94, 21),
    ],
    ...extra,
  };
}

describe("stornarea", () => {
  const storneaza = (o: DocumentCitit) => compuneStornarea({ original: o, orderNumber: "PROBA-E2E-1", acum: ACUM, mediu: "productie" });

  test("copiaza liniile facturii LOR, cu cantitatile si totalurile cu semn schimbat", () => {
    const s = storneaza(facturaCitita());
    assert.ok(!("error" in s), "error" in s ? s.error : "");
    assert.deepEqual(s.pozitii.map((p) => [p.description, p.unitCount, p.total, p.vat]), [
      ["Pachet de proba", "-2", "-13.41", "21"],
      ["Carte de proba", "-1", "-50.00", "11"],
      ["Joc de proba", "-1", "-100.00", "21"],
      ["Transport (11%)", "-1", "-4.59", "11"],
      ["Transport (21%)", "-1", "-10.41", "21"],
      ["Discount (PROBA) (11%)", "1", "3.06", "11"],
      ["Discount (PROBA) (21%)", "1", "6.94", "21"],
    ]);
    semneleSuntBune(s.pozitii);
    assert.equal(s.total, -168.41, "anuleaza factura pana la ban");
    assert.equal(s.valoare, "168.41", "„Total stornat” pozitiv, cerut de ei");
    assert.equal(s.mentiune, "Stornare factura openapi-12 din 17.11.2026 (comanda #PROBA-E2E-1)");
  });
  test("factura si stornarea ei, compuse aici, dau exact aceleasi cifre cu semn schimbat", () => {
    const f = reusita(compune());
    const citita = facturaCitita({
      total: f.total,
      pozitii: f.pozitii.map((p) => ({
        descriere: p.description, unitate: p.unit, cantitate: Number(p.unitCount), pret: null,
        total: Number(p.total), cota: Number(p.vat), cod: p.productCode ?? "", tip: "InvoicePosition", reducere: null,
      })),
    });
    const s = storneaza(citita);
    assert.ok(!("error" in s));
    s.pozitii.forEach((p, i) => {
      assert.equal(Number(p.total), -Number(f.pozitii[i].total));
      assert.equal(Number(p.unitCount), -Number(f.pozitii[i].unitCount));
    });
    assert.equal(s.total, -f.total);
  });
  test("⚠ ce nu se poate storna corect de aici se refuza, nu pleaca o nota partiala", () => {
    const cazuri: [string, Partial<DocumentCitit>, RegExp][] = [
      ["anulata", { stare: "cancelled" }, /anulată/],
      ["ciorna", { stare: "draft" }, /ciornă/],
      ["e ea insasi stornare", { stornataId: "1" }, /însuși o stornare/],
      ["fara linii", { pozitii: [] }, /nu are linii/],
      ["fara total", { total: null }, /total pozitiv/],
    ];
    for (const [nume, extra, mesaj] of cazuri) {
      const s = storneaza(facturaCitita(extra));
      assert.ok("error" in s, nume);
      assert.match(s.error, mesaj, nume);
    }
    const cuLinie = (schimba: Partial<DocumentCitit["pozitii"][number]>) => {
      const o = facturaCitita();
      o.pozitii[0] = { ...o.pozitii[0], ...schimba };
      return storneaza(o);
    };
    assert.ok("error" in cuLinie({ tip: "DiscountPosition" }));
    assert.ok("error" in cuLinie({ reducere: 10 }));
    assert.ok("error" in cuLinie({ cantitate: null }));
    assert.ok("error" in cuLinie({ total: null }));
    assert.ok(!("error" in cuLinie({ reducere: 0 })), "o reducere zero nu e o reducere");
  });
  test("⚠ cota necitita NU e 0%: stornarea se opreste (altfel TVA-ul nu s-ar anula cu al facturii)", () => {
    const o = facturaCitita();
    o.pozitii[1] = { ...o.pozitii[1], cota: null };
    const s = storneaza(o);
    assert.ok("error" in s);
    assert.match(s.error, /cota TVA/);
    const zero = facturaCitita();
    zero.pozitii[1] = { ...zero.pozitii[1], cota: 0 };
    const s0 = storneaza({ ...zero, total: zero.total });
    assert.ok(!("error" in s0), "0% citit e o cota, nu o lipsa");
    assert.equal(s0.pozitii[1].vat, "0");
  });
  test("⚠ liniile care nu dau totalul facturii opresc stornarea (ceva de pe document nu se vede)", () => {
    const s = storneaza(facturaCitita({ total: 200 }));
    assert.ok("error" in s);
    assert.match(s.error, /Liniile facturii/);
  });
  test("in modul de test, stornarea o spune si ea", () => {
    const s = compuneStornarea({ original: facturaCitita(), orderNumber: "1", acum: ACUM, mediu: "test" });
    assert.ok(!("error" in s));
    assert.ok(s.mentiune.startsWith(MENTIUNE_TEST));
  });
});

describe("stornarea deja emisa", () => {
  const storno = (extra: Partial<DocumentCitit> = {}): DocumentCitit => ({
    ...facturaCitita(), id: "1065257892", eticheta: "openapi-13", total: -168.41, stornataId: "1065257891",
    valoareStornata: 168.41, pozitii: [], ...extra,
  });
  const adoptata = (g: ReturnType<typeof stornareExistenta>) => (g.fel === "adopta" ? g.doc.id : g.fel);
  test("se adopta stornarea COMPLETA si EMISA („open” sau „closed”) a CHIAR acestei facturi", () => {
    assert.equal(adoptata(stornareExistenta(facturaCitita(), [storno()])), "1065257892");
    assert.equal(adoptata(stornareExistenta(facturaCitita(), [storno({ stare: "closed" })])), "1065257892");
    assert.equal(adoptata(stornareExistenta(facturaCitita(), [storno({ valoareStornata: null })])), "1065257892", "dupa total, daca valoarea lipseste");
  });
  test("⚠⚠ o stornare CIORNA nu se adopta drept emisa: oprire, cu pasul urmator", () => {
    const g = stornareExistenta(facturaCitita(), [storno({ stare: "draft" })]);
    assert.equal(g.fel, "refuz");
    assert.match(g.fel === "refuz" ? g.mesaj : "", /ciornă\. Emite-o sau șterge-o din contul Factureaza\.ro/);
  });
  test("⚠ partiala sau intr-o stare necunoscuta: oprire; anulata sau a altei facturi: ignorata", () => {
    const partiala = stornareExistenta(facturaCitita(), [storno({ valoareStornata: 50, total: -50 })]);
    assert.equal(partiala.fel, "refuz");
    assert.match(partiala.fel === "refuz" ? partiala.mesaj : "", /parțială/);
    const ciudata = stornareExistenta(facturaCitita(), [storno({ stare: "" })]);
    assert.equal(ciudata.fel, "refuz");
    assert.equal(stornareExistenta(facturaCitita(), [storno({ stare: "cancelled" })]).fel, "niciunul");
    assert.equal(stornareExistenta(facturaCitita(), [storno({ stornataId: "999" })]).fel, "niciunul");
    assert.equal(stornareExistenta(facturaCitita(), []).fel, "niciunul");
  });
  test("o emisa completa castiga si langa o ciorna veche", () => {
    assert.equal(adoptata(stornareExistenta(facturaCitita(), [storno({ id: "1", stare: "draft" }), storno({ id: "2" })])), "2");
  });
});

describe("factura cu marcajul emiterii (adoptarea)", () => {
  const M = "Emis din Edinio. Referinta: factura:factureaza:o1";
  const doc = (extra: Partial<DocumentCitit> = {}): DocumentCitit => ({ ...facturaCitita(), nota: M, ...extra });
  test("se adopta doar factura EMISA cu CHIAR marcajul nostru", () => {
    const g = facturaExistenta([doc()], M);
    assert.equal(g.fel === "adopta" ? g.doc.id : g.fel, "1065257891");
    assert.equal(facturaExistenta([doc({ nota: `${M} ` })], M).fel, "niciunul", "nota se compara exact");
    assert.equal(facturaExistenta([doc({ stornataId: "5" })], M).fel, "niciunul", "o stornare nu e factura");
    assert.equal(facturaExistenta([doc({ stare: "cancelled" })], M).fel, "niciunul");
  });
  test("⚠⚠ o ciorna cu marcajul nostru opreste emiterea (nici adoptata, nici dublata)", () => {
    const g = facturaExistenta([doc({ stare: "draft" })], M);
    assert.equal(g.fel, "refuz");
    assert.match(g.fel === "refuz" ? g.mesaj : "", /ciornă/);
    assert.equal(facturaExistenta([doc({ stare: "xyz" })], M).fel, "refuz");
  });
});

describe("incasarea: restul de plata", () => {
  test("⚠ pe o factura adoptata, partial platita, se incaseaza RESTUL, nu totalul", () => {
    assert.equal(sumaDeIncasat({ total: 168.41, dePlata: 68.41 }, false), 68.41);
    assert.equal(sumaDeIncasat({ total: 168.41, dePlata: 168.41 }, true), 168.41);
  });
  test("platita intreg: nimic; restul necunoscut: totalul doar pe una emisa chiar acum", () => {
    assert.equal(sumaDeIncasat({ total: 168.41, dePlata: 0 }, true), null);
    assert.equal(sumaDeIncasat({ total: 168.41, dePlata: null }, true), 168.41);
    assert.equal(sumaDeIncasat({ total: 168.41, dePlata: null }, false), null, "pe una adoptata nu se ghiceste");
    assert.equal(sumaDeIncasat({ total: 100, dePlata: 250 }, false), 100, "niciodata peste totalul facturii");
  });
});

describe("data pentru registru (SAGA)", () => {
  test("doar „AAAA-LL-ZZ”", () => {
    assert.equal(dataValida("2026-11-17"), "2026-11-17");
    for (const rea of ["17.11.2026", "2026-11-17T10:00:00", "", null, "2026-1-7"]) assert.equal(dataValida(rea), null, String(rea));
  });
});

describe("seria, la salvare", () => {
  const serie = (id: string, prefix: string, an: string): SerieFactura => ({ id, prefix, an, separator: "-", sufix: "", ultimulNumar: 1 });
  test("⚠ in ianuarie (prefixul exista doar pe anul trecut) se SALVEAZA cu avertisment, nu se refuza", () => {
    const r = verificaSeriaLaSalvare([serie("1", "SRV", "2026")], "SRV", "2027");
    assert.equal(r.fel, "avertisment");
    assert.match(r.fel === "avertisment" ? r.mesaj : "", /pe anul 2027.*Setările s-au salvat/);
  });
  test("prefixul inexistent in cont se refuza; cel bun trece; doua pe acelasi an: avertisment", () => {
    assert.equal(verificaSeriaLaSalvare([serie("1", "SRV", "2026")], "FCT", "2026").fel, "refuz");
    assert.equal(verificaSeriaLaSalvare([serie("1", "SRV", "2026")], "SRV", "2026").fel, "ok");
    assert.equal(verificaSeriaLaSalvare([serie("1", "SRV", "2026"), serie("2", "SRV", "2026")], "SRV", "2026").fel, "avertisment");
  });
});
