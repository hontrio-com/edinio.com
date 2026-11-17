import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  UM_MARFA, UM_SERVICIU, ZILE_CAUTARE_ORFANA, codulJudetului, codulTarii, compuneFactura, cuiCurat, dataFacturii,
  linieEasybill, marcaj, totalulLiniilor, zileDeCautat, type ComandaDeFacturat, type FacturaCompusa,
} from "./document";
import { avertismentTva } from "./config";

/*
 * N-avem cont easybill de proba, deci prima factura reala e dovada pe fir. Ce se poate dovedi fara
 * fir se dovedeste aici, pe valori: data fiscala, cifrele fiecarei linii, totalul care trebuie sa fie
 * chiar `orders.total`, clientul (persoana fizica fara cod comun, firma cu CUI), judetul in forma lor
 * si marcajul dupa care se regaseste o factura ramasa.
 */

describe("datele, in ora Romaniei", () => {
  test("⚠ dupa miezul noptii in Romania, factura poarta ziua de AZI, nu pe a UTC", () => {
    /* 23:30 UTC pe 16.11 = 01:30 pe 17.11 la noi (UTC+2 iarna). */
    assert.equal(dataFacturii(new Date("2026-11-16T23:30:00Z")), "2026-11-17");
  });
  test("vara (UTC+3) la fel", () => {
    assert.equal(dataFacturii(new Date("2026-07-01T21:30:00Z")), "2026-07-02");
  });
});

describe("zilele plasei (factura ramasa fara id, cautata dupa marcaj)", () => {
  const ACUM = new Date("2026-11-17T10:00:00Z");
  test("de la ziua primei incercari MINUS o zi pana azi, de la azi inapoi, in ora Romaniei", () => {
    assert.deepEqual(zileDeCautat(ACUM, "2026-11-17T08:00:00Z"), ["2026-11-17", "2026-11-16"]);
    /* 22:30 UTC pe 15.11 = 00:30 pe 16.11 la noi: ziua primei incercari e 16, deci de la 15. */
    assert.deepEqual(zileDeCautat(ACUM, "2026-11-15T22:30:00Z"), ["2026-11-17", "2026-11-16", "2026-11-15"]);
  });
  test("⚠ o incercare de VINERI, deblocata LUNI: fereastra o cuprinde (defectul ferestrei de 4 zile)", () => {
    const luni = new Date("2026-11-23T08:00:00Z");
    const zile = zileDeCautat(luni, "2026-11-20T15:00:00Z");
    assert.ok(zile, "fereastra a iesit goala");
    assert.equal(zile[zile.length - 1], "2026-11-19");
    assert.equal(zile[0], "2026-11-23");
  });
  test("⚠ peste plafon sau fara data citibila: NULL (refuz), nu o fereastra taiata", () => {
    assert.equal(zileDeCautat(ACUM, "2026-10-01T10:00:00Z"), null);
    assert.equal(zileDeCautat(ACUM, null), null);
    assert.equal(zileDeCautat(ACUM, "nu e o data"), null);
  });
  test("chiar la plafon: ultima zi primita, prima in plus refuzata", () => {
    /* Prima incercare pe 18.10: fereastra 17.10 - 17.11 = 32 de zile, peste plafon; pe 19.10: 31. */
    assert.equal(zileDeCautat(ACUM, "2026-10-19T10:00:00Z")?.length, ZILE_CAUTARE_ORFANA);
    assert.equal(zileDeCautat(ACUM, "2026-10-18T10:00:00Z"), null);
  });
  test("peste capat de luna si de an", () => {
    assert.deepEqual(zileDeCautat(new Date("2027-01-01T10:00:00Z"), "2026-12-30T10:00:00Z"), ["2027-01-01", "2026-12-31", "2026-12-30", "2026-12-29"]);
  });
});

describe("marcajul", () => {
  test("forma fixa si acelasi pentru aceeasi cheie", () => {
    const m = marcaj("factura:easybill:11111111-1111-4111-8111-111111111111");
    assert.match(m, /^EDN-[0-9A-F]{12}$/);
    assert.equal(m, marcaj("factura:easybill:11111111-1111-4111-8111-111111111111"));
  });
  test("⚠ reemiterea dupa storno are alt marcaj: factura veche nu poate trece drept „ramasa”", () => {
    const o = "factura:easybill:11111111-1111-4111-8111-111111111111";
    assert.notEqual(marcaj(o), marcaj(`${o}-R92033001`));
    assert.notEqual(marcaj(o), marcaj("factura:easybill:22222222-2222-4222-8222-222222222222"));
  });
});

describe("judetul si tara, in forma lor", () => {
  test("codul ANAF al judetului, si din forme scrise de mana", () => {
    assert.equal(codulJudetului("Brasov"), "BV");
    assert.equal(codulJudetului("Județul Iași"), "IS");
    assert.equal(codulJudetului("Ilfov", "Voluntari"), "IF");
    assert.equal(codulJudetului("ARGES"), "AG");
  });
  test("⚠ Bucurestiul cu sectorul (forma lor: B-SECTOR1), dar sectorul NU se ghiceste", () => {
    assert.equal(codulJudetului("Municipiul Bucuresti", "Sector 3"), "B-SECTOR3");
    assert.equal(codulJudetului("Bucuresti", "Bucuresti", "Str. Lunga 5, sectorul 5"), "B-SECTOR5");
    assert.equal(codulJudetului("", "București"), "B");
    assert.equal(codulJudetului("Bucuresti", "Bucuresti"), "B");
  });
  test("prescurtarile „Jud.” si „Mun.” nu mai lasa judetul necunoscut", () => {
    assert.equal(codulJudetului("Jud. Cluj"), "CJ");
    assert.equal(codulJudetului("jud Iasi"), "IS");
    assert.equal(codulJudetului("Mun. Bucuresti", "Sector 2"), "B-SECTOR2");
  });
  test("un judet necunoscut pleaca asa cum l-a scris omul; unul lipsa iese gol (si factura se opreste)", () => {
    assert.equal(codulJudetului("Bavaria"), "Bavaria");
    assert.equal(codulJudetului("", "Brasov"), "");
  });
  test("tara: cod ISO cu doua litere, Romania implicit", () => {
    assert.equal(codulTarii(undefined), "RO");
    assert.equal(codulTarii("de"), "DE");
    assert.equal(codulTarii("Germania"), "Germania");
  });
  test("CUI-ul se compara fara „RO” si fara spatii", () => {
    assert.equal(cuiCurat("RO 14399840"), "14399840");
    assert.equal(cuiCurat("ro14399840"), "14399840");
  });
});

describe("o linie", () => {
  test("pret cu TVA: pretul brut, steagul „include TVA” si totalul chiar cat a platit clientul", () => {
    const l = linieEasybill({ nume: "Produs", cantitate: 1, pret: 100, cota: 21 }, true);
    assert.equal(l.campuri.productPrice, "100.00");
    assert.equal(l.campuri.productPriceIncludesVat, "1");
    assert.equal(l.campuri.productQuantity, "1");
    assert.equal(l.campuri.productVAT, "21");
    assert.equal(l.campuri.productCurrency, "RON");
    assert.equal(l.campuri.simpleProduct, "1");
    assert.equal(l.campuri.productIsReturned, "0");
    assert.equal(l.campuri.productType, "p");
    assert.equal(l.campuri.productUM, UM_MARFA);
    assert.equal(l.total, 100);
    assert.equal(l.tva, 17.36, "TVA-ul CONTINUT: 100 x 21 / 121");
    assert.equal(l.valoare, 82.64);
  });
  test("pret fara TVA: pretul net, fara steag, iar TVA-ul il pune easybill", () => {
    const l = linieEasybill({ nume: "Produs", cantitate: 2, pret: 100, cota: 21 }, false);
    assert.equal(l.campuri.productPrice, "100.00");
    assert.equal(l.campuri.productPriceIncludesVat, "0");
    assert.equal(l.total, 242);
    assert.equal(l.valoare, 200);
    assert.equal(l.tva, 42, "TVA-ul ADAUGAT: 200 x 21 / 100");
  });
  test("exemplul lor: 200 net x 2 la 19% = 400 + 76", () => {
    assert.equal(linieEasybill({ nume: "Serviciu Simplu 1", cantitate: 2, pret: 200, cota: 19 }, false).total, 476);
  });
  test("⚠ reducerea: cantitate -1 si PRET POZITIV (BR-27 din e-Factura interzice pretul negativ)", () => {
    const l = linieEasybill({ nume: "Discount", cantitate: -1, pret: 10, cota: 21, serviciu: true }, true);
    assert.equal(l.campuri.productQuantity, "-1");
    assert.ok(Number(l.campuri.productPrice) > 0);
    assert.equal(l.total, -10);
  });
  test("⚠ linia si opusul ei au EXACT acelasi total, cu semn schimbat", () => {
    for (const [pret, q] of [[19.99, 3], [6.705, 2], [0.05, 7], [1234.565, 1]] as const) {
      for (const cuTva of [true, false]) {
        const a = linieEasybill({ nume: "x", cantitate: q, pret, cota: 21 }, cuTva);
        const b = linieEasybill({ nume: "x", cantitate: -q, pret, cota: 21 }, cuTva);
        assert.equal(a.total, -b.total, `${pret} x ${q}, cu TVA: ${cuTva}`);
        assert.equal(a.valoare, -b.valoare, `valoarea la ${pret} x ${q}`);
        assert.equal(a.tva, -b.tva, `TVA-ul la ${pret} x ${q}`);
        assert.equal(Math.round((a.valoare + a.tva) * 100) / 100, a.total, "valoare + TVA = total");
      }
    }
  });
  test("serviciile (transport, taxe, extraoptiuni): tip `s`, unitate C62", () => {
    const l = linieEasybill({ nume: "Transport", cantitate: 1, pret: 15, cota: 21, serviciu: true }, true);
    assert.equal(l.campuri.productType, "s");
    assert.equal(l.campuri.productUM, UM_SERVICIU);
  });
  test("codul de articol ajunge in observatia liniei; fara cod, nimic", () => {
    assert.equal(linieEasybill({ nume: "x", cantitate: 1, pret: 5, cota: 21, cod: "ABC-1" }, true).campuri.productComments, "Cod: ABC-1");
    assert.equal(linieEasybill({ nume: "x", cantitate: 1, pret: 5, cota: 21 }, true).campuri.productComments, undefined);
  });
  test("numele pleaca pe un singur rand, si niciodata gol", () => {
    assert.equal(linieEasybill({ nume: "  Tricou\n rosu  ", cantitate: 1, pret: 5, cota: 21 }, true).campuri.productName, "Tricou rosu");
    assert.equal(linieEasybill({ nume: "   ", cantitate: 1, pret: 5, cota: 21 }, true).campuri.productName, "Produs");
  });
});

const magazinCuTva = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const ACUM = new Date("2026-11-17T10:00:00Z");
const SLOT = { poateEmite: true } as const;
const CHEIE = "factura:easybill:11111111-1111-4111-8111-111111111111";

function comanda(extra: Partial<ComandaDeFacturat> = {}): ComandaDeFacturat {
  return {
    order_number: "0012",
    customer_name: "Ion Popescu",
    customer_phone: "0712345678",
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

function compune(c: ComandaDeFacturat, extra: Partial<Parameters<typeof compuneFactura>[0]> = {}): FacturaCompusa {
  const f = compuneFactura({
    comanda: c, magazin: magazinCuTva, skus: new Map(), config: {}, slot: SLOT,
    etichetaPlata: "Card online (Netopia)", cheieRegistru: CHEIE, acum: ACUM, ...extra,
  });
  assert.ok(!("error" in f), "error" in f ? f.error : "");
  return f;
}

describe("factura comenzii", () => {
  test("liniile dau CHIAR totalul comenzii, iar reducerile sunt linii negative", () => {
    const c = comanda();
    const f = compune(c, { skus: new Map([["11111111-1111-4111-8111-111111111111", "CANA-01"]]) });
    assert.equal(f.total, Math.round(Number(c.total) * 100) / 100);
    assert.equal(totalulLiniilor(f.linii), f.total);
    assert.deepEqual(f.linii.map((l) => l.campuri.productName), ["Cana", "Farfurie", "Transport", "Discount (TOAMNA)", "Reducere plata online"]);
    assert.equal(f.linii[3].campuri.productQuantity, "-1");
    assert.equal(f.linii[0].campuri.productComments, "Cod: CANA-01");
    assert.equal(f.linii[0].campuri.productType, "p");
    assert.equal(f.linii[2].campuri.productType, "s", "transportul e serviciu");
  });
  test("persoana fizica: tip PF, FARA cod fiscal comun, judetul ca cod, fara trimiteri automate", () => {
    const { client } = compune(comanda(), { config: { due_days: 15 } });
    const c = client.campuri;
    assert.equal(c.xType, "PF");
    assert.equal(c.clientName, "Ion Popescu");
    assert.equal(c.clientCIF, undefined, "„0000000000000” la toti cumparatorii i-ar putea contopi intr-un singur client");
    assert.equal(client.cuiDeCautat, null, "persoana fizica nu se cauta dupa nume");
    assert.equal(c.clientAddressLine, "Str. Lunga 5");
    assert.equal(c.clientCity, "Brasov");
    assert.equal(c.clientCounty, "BV");
    assert.equal(c.clientCountry, "RO");
    assert.equal(c.clientPhone, "0712345678");
    assert.equal(c.xPaymentTerms, "15");
    assert.equal(c.xSendInvoiceByEmail, "0");
    assert.equal(c.xSendInvoiceBySms, "0");
  });
  test("firma: tip LE, CUI-ul de pe factura, registrul, persoana de contact; se cauta dupa CUI", () => {
    const { client } = compune(comanda({
      billing_company: {
        company_name: "Firma SRL", cui: "14399840", reg_com: "J08/1/2020", vat_payer: true,
        address: "Str. Scurta 1", city: "Bucuresti", county: "Municipiul Bucuresti", verified: true, inactive: false,
      },
    }));
    const c = client.campuri;
    assert.equal(c.xType, "LE");
    assert.equal(c.clientName, "Firma SRL");
    assert.equal(c.clientCIF, "RO14399840");
    assert.equal(c.clientNrRegCom, "J08/1/2020");
    assert.equal(c.clientContactPerson, "Ion Popescu");
    assert.equal(c.clientAddressLine, "Str. Scurta 1");
    assert.equal(c.clientCounty, "B", "sediul fara sector: nu se ghiceste");
    assert.equal(client.cuiDeCautat, "14399840");
  });
  test("adresa din Bucuresti cu sectorul in strada: judetul B-SECTOR2", () => {
    const { client } = compune(comanda({ shipping_address: { address: "Bd. Pache 3, Sector 2", city: "Bucuresti", county: "Bucuresti" } }));
    assert.equal(client.campuri.clientCounty, "B-SECTOR2");
  });
  test("antetul: data, finala, lei, marcajul in id-ul extern si in observatii", () => {
    const f = compune(comanda());
    assert.equal(f.antet.invoiceDate, "2026-11-17");
    assert.equal(f.antet.invoiceStatus, "1");
    assert.equal(f.antet.invoiceCurrency, "RON");
    assert.equal(f.marcaj, marcaj(CHEIE));
    assert.equal(f.antet.invoiceExternalId, f.marcaj);
    assert.equal(f.antet.invoiceComments, `Comanda #0012 - plata: Card online (Netopia) - ref. ${f.marcaj}`);
    assert.equal(f.antet.invoiceSeries, undefined, "fara serie: cea implicita a contului");
    assert.equal(f.antet.clientId, undefined, "clientul vine din pasul lui, nu din compunere");
  });
  test("seria pleaca doar cand e scrisa", () => {
    assert.equal(compune(comanda(), { config: { serie: " EBF " } }).antet.invoiceSeries, "EBF");
  });
  test("⚠ o comanda ale carei linii nu dau totalul NU se factureaza", () => {
    const f = compuneFactura({
      comanda: comanda({ total: 50 }), magazin: magazinCuTva, skus: new Map(), config: {}, slot: SLOT,
      etichetaPlata: "", cheieRegistru: CHEIE, acum: ACUM,
    });
    assert.ok("error" in f);
    assert.match(f.error, /nu se poate factura/);
  });
  test("diferenta de rotunjire legitima se absoarbe intr-o linie, iar documentul iese pe fix", () => {
    /* Pret de pachet nerotunjit: 6,705 x 2 = 13,41 pe comanda, dar documentul scrie 6,70 x 2. */
    const f = compune(comanda({
      items: [{ name: "Pachet", price: 6.705, quantity: 2 }],
      shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 13.41,
    }));
    assert.equal(f.total, 13.41);
    const ajustare = f.linii.find((l) => l.campuri.productName === "Ajustare rotunjire");
    assert.ok(ajustare, "lipseste linia de ajustare");
    assert.ok(Number(ajustare.campuri.productPrice) > 0, "ajustarea are pret pozitiv");
  });
  test("cote amestecate: fiecare linie cu cota ei, transportul impartit, totalul tot exact", () => {
    const f = compune(comanda({
      items: [
        { name: "Carte", price: 50, quantity: 1, vat_rate: 11 } as never,
        { name: "Joc", price: 100, quantity: 1, vat_rate: 21 } as never,
      ],
      shipping_cost: 15, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 165,
    }));
    assert.equal(f.total, 165);
    assert.equal(f.linii.find((l) => l.campuri.productName === "Carte")?.campuri.productVAT, "11");
    assert.equal(f.linii.find((l) => l.campuri.productName === "Joc")?.campuri.productVAT, "21");
    assert.equal(f.linii.filter((l) => l.campuri.productName.startsWith("Transport")).length, 2);
  });
  test("neplatitor de TVA: totul pe 0%", () => {
    const f = compune(comanda({ vat_rate: 0 }), { magazin: { vat_enabled: false, vat_rate: 0, prices_include_vat: true } });
    assert.ok(f.linii.every((l) => l.campuri.productVAT === "0"));
  });
  test("preturi FARA TVA: liniile nete dau totalul cu TVA al comenzii", () => {
    const f = compune(comanda({
      items: [{ name: "Produs", price: 100, quantity: 2 }],
      shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, discount_code: null,
      total: 242, vat_amount: 42, prices_include_vat: false,
    }));
    assert.equal(f.linii[0].campuri.productPriceIncludesVat, "0");
    assert.equal(f.total, 242);
  });
  test("reemiterea dupa storno spune pe document ce inlocuieste, si are alt marcaj", () => {
    const f = compune(comanda(), {
      slot: { poateEmite: true, inlocuieste: { factura: "EBF 7", storno: "EBF 9" } },
      cheieRegistru: `${CHEIE}-R92033001`,
    });
    assert.match(f.antet.invoiceComments, /inlocuieste factura EBF 7, stornata prin EBF 9/);
    assert.notEqual(f.marcaj, marcaj(CHEIE));
    assert.ok(f.antet.invoiceComments.indexOf(f.marcaj) < f.antet.invoiceComments.indexOf("inlocuieste"),
      "marcajul sta inaintea mentiunii: un camp taiat la ei nu-l pierde");
  });
  test("⚠ adresa din Romania FARA judet: nu se emite (e-Factura il cere), nu pleaca gol in tacere", () => {
    const f = compuneFactura({
      comanda: comanda({ shipping_address: { address: "Str. Lunga 5", city: "Brasov", county: "" } }),
      magazin: magazinCuTva, skus: new Map(), config: {}, slot: SLOT, etichetaPlata: "", cheieRegistru: CHEIE, acum: ACUM,
    });
    assert.ok("error" in f);
    assert.match(f.error, /n-are județul/);
  });
  test("adresa din strainatate fara judet trece (multe tari n-au judete)", () => {
    const f = compune(comanda({ shipping_address: { address: "Hauptstr. 1", city: "Berlin", county: "", country: "DE" } }));
    assert.equal(f.client.campuri.clientCountry, "DE");
  });
  test("fara produse si fara transport: nu se emite o factura goala", () => {
    const f = compuneFactura({
      comanda: comanda({ items: [], shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, total: 0 }),
      magazin: magazinCuTva, skus: new Map(), config: {}, slot: SLOT, etichetaPlata: "", cheieRegistru: CHEIE, acum: ACUM,
    });
    assert.ok("error" in f);
  });
});

describe("TVA-ul contului easybill fata de al magazinului", () => {
  test("⚠ in AMBELE sensuri: cont fara TVA + magazin cu TVA, si cont platitor + magazin fara TVA (0%)", () => {
    assert.match(avertismentTva(true, true) ?? "", /neplătitor/);
    assert.match(avertismentTva(false, false) ?? "", /0%/);
  });
  test("cand se potrivesc, sau cand nu stim TVA-ul magazinului: nimic", () => {
    assert.equal(avertismentTva(true, false), null);
    assert.equal(avertismentTva(false, true), null);
    assert.equal(avertismentTva(false, null), null);
  });
});
