import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CNP_NECUNOSCUT, compuneFactura, compuneStornarea, dataFacturii, dataIncasarii, linieFacturis,
  numeleTarii, scadenta, totalulLiniilor, ziuaFacturii, type ComandaDeFacturat,
} from "./document";
import type { FacturaCitita } from "./client";

/*
 * Facturis nu are cont de proba la noi, deci prima factura reala e dovada pe fir. Ce se poate dovedi
 * fara fir se dovedeste aici, pe valori: data fiscala, cifrele fiecarei linii, totalul care trebuie
 * sa fie chiar `orders.total`, si stornarea care anuleaza factura pana la ban.
 */

describe("datele, in ora Romaniei", () => {
  test("⚠ dupa miezul noptii in Romania, factura poarta ziua de AZI, nu pe a UTC", () => {
    /* 23:30 UTC pe 16.11 = 01:30 pe 17.11 la noi (UTC+2 iarna). */
    const acum = new Date("2026-11-16T23:30:00Z");
    assert.equal(dataFacturii(acum), "2026-11-17 01:30:00");
    assert.equal(ziuaFacturii(acum), "2026-11-17");
    assert.equal(dataIncasarii(acum), "17-11-2026 01:30:00");
  });
  test("vara (UTC+3) la fel", () => {
    assert.equal(dataFacturii(new Date("2026-07-01T21:30:00Z")), "2026-07-02 00:30:00");
  });
  test("scadenta se aduna pe ziua din Romania, si 0 inseamna ziua emiterii", () => {
    const acum = new Date("2026-11-16T23:30:00Z");
    assert.equal(scadenta(acum, 0), "2026-11-17");
    assert.equal(scadenta(acum, 30), "2026-12-17");
    assert.equal(scadenta(acum, Number.NaN), "2026-11-17");
    assert.equal(scadenta(new Date("2026-12-31T10:00:00Z"), 1), "2027-01-01");
  });
});

describe("o linie", () => {
  test("pret cu TVA: totalul e chiar ce a platit clientul, baza si TVA-ul se scot din el", () => {
    const l = linieFacturis({ nume: "Produs", cantitate: 1, pret: 100, cota: 21 }, true);
    assert.equal(l.facturi_prod_val_tot, "100.00");
    assert.equal(l.facturi_prod_val, "82.64");
    assert.equal(l.facturi_prod_val_tva, "17.36");
    assert.equal(l.facturi_prod_pretctva, "100.0000");
    assert.equal(l.facturi_prod_pretftva, "82.6446");
    assert.equal(l.facturi_prod_cant, "1.000");
    assert.equal(l.facturi_prod_tva, "21%");
    assert.equal(l.facturi_prod_moneda, "RON");
  });
  test("pret fara TVA: TVA-ul se adauga pe linie", () => {
    const l = linieFacturis({ nume: "Produs", cantitate: 2, pret: 100, cota: 21 }, false);
    assert.equal(l.facturi_prod_val, "200.00");
    assert.equal(l.facturi_prod_val_tva, "42.00");
    assert.equal(l.facturi_prod_val_tot, "242.00");
    assert.equal(l.facturi_prod_pretftva, "100.0000");
    assert.equal(l.facturi_prod_pretctva, "121.0000");
  });
  test("⚠ reducerea: cantitate -1 si PRET POZITIV (BR-27 din e-Factura interzice pretul negativ)", () => {
    const l = linieFacturis({ nume: "Discount", cantitate: -1, pret: 10, cota: 21 }, true);
    assert.equal(l.facturi_prod_cant, "-1.000");
    assert.ok(Number(l.facturi_prod_pretftva) > 0 && Number(l.facturi_prod_pretctva) > 0);
    assert.equal(l.facturi_prod_val_tot, "-10.00");
    assert.equal(l.facturi_prod_val, "-8.26");
    assert.equal(l.facturi_prod_val_tva, "-1.74");
  });
  test("⚠ linia si stornarea ei au EXACT aceleasi cifre, cu semn schimbat", () => {
    for (const [pret, q] of [[19.99, 3], [6.705, 2], [0.05, 7], [1234.565, 1]] as const) {
      const a = linieFacturis({ nume: "x", cantitate: q, pret, cota: 21 }, true);
      const b = linieFacturis({ nume: "x", cantitate: -q, pret, cota: 21 }, true);
      for (const camp of ["facturi_prod_val", "facturi_prod_val_tva", "facturi_prod_val_tot", "facturi_prod_cant"]) {
        assert.equal(Number(a[camp]), -Number(b[camp]), `${camp} la ${pret} x ${q}`);
      }
    }
  });
  test("valoare + TVA = total, pe fiecare linie", () => {
    for (const [pret, q, cota] of [[19.99, 3, 21], [9.99, 7, 11], [0.01, 1, 21], [333.33, 3, 21]] as const) {
      const l = linieFacturis({ nume: "x", cantitate: q, pret, cota }, true);
      const suma = Math.round((Number(l.facturi_prod_val) + Number(l.facturi_prod_val_tva)) * 100) / 100;
      assert.equal(suma, Number(l.facturi_prod_val_tot));
    }
  });
  test("codul de articol pleaca drept SKU, cu cautarea dupa el; fara cod, nimic", () => {
    const cu = linieFacturis({ nume: "x", cantitate: 1, pret: 5, cota: 21, cod: "ABC-1" }, true);
    assert.equal(cu.prod_sku, "ABC-1");
    assert.equal(cu.prod_cod_cautare, "prod_sku");
    const fara = linieFacturis({ nume: "x", cantitate: 1, pret: 5, cota: 21 }, true);
    assert.equal(fara.prod_sku, undefined);
    assert.equal(fara.prod_cod_cautare, undefined);
  });
  test("numele pleaca pe un singur rand", () => {
    assert.equal(linieFacturis({ nume: "  Tricou\n rosu  ", cantitate: 1, pret: 5, cota: 21 }, true).facturi_prod_nume, "Tricou rosu");
  });
});

describe("tara", () => {
  test("Romania se scrie ca la ei, fara diacritice; strainatatea in romana, tot fara", () => {
    assert.equal(numeleTarii(undefined), "Romania");
    assert.equal(numeleTarii("RO"), "Romania");
    assert.equal(numeleTarii("DE"), "Germania");
    assert.ok(!/[ăâîșțşţ]/i.test(numeleTarii("FR")));
  });
});

const magazinCuTva = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const ACUM = new Date("2026-11-17T10:00:00Z");
const SLOT = { poateEmite: true } as const;

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

describe("factura comenzii", () => {
  test("liniile dau CHIAR totalul comenzii, iar reducerile sunt linii negative", () => {
    const c = comanda();
    const f = compuneFactura({
      comanda: c, magazin: magazinCuTva,
      skus: new Map([["11111111-1111-4111-8111-111111111111", "CANA-01"]]),
      config: { serie: "EDN" }, slot: SLOT, etichetaPlata: "Card online (Netopia)", acum: ACUM,
    });
    assert.ok(!("error" in f), "error" in f ? f.error : "");
    assert.equal(f.total, Math.round(Number(c.total) * 100) / 100);
    assert.equal(totalulLiniilor(f.dataProd), f.total);
    const nume = f.dataProd.map((l) => l.facturi_prod_nume);
    assert.deepEqual(nume, ["Cana", "Farfurie", "Transport", "Discount (TOAMNA)", "Reducere plata online"]);
    const discount = f.dataProd[3];
    assert.equal(discount.facturi_prod_cant, "-1.000");
    assert.equal(f.dataProd[0].prod_sku, "CANA-01");
  });
  test("antetul: serie, data, client persoana fizica cu cele 13 zerouri, legatura cu comanda", () => {
    const f = compuneFactura({
      comanda: comanda(), magazin: magazinCuTva, skus: new Map(),
      config: { serie: " EDN ", due_days: 15, gestiune: "Depozit", punct_de_lucru: "" },
      slot: SLOT, etichetaPlata: "Card online (Netopia)", acum: ACUM,
    });
    assert.ok(!("error" in f));
    const d = f.dataFact;
    assert.equal(d.facturi_serie, "EDN");
    assert.equal(d.facturi_numar, "");
    assert.equal(d.facturi_data, "2026-11-17 12:00:00");
    assert.equal(d.facturi_data_scadenta, "2026-12-02");
    assert.equal(d.facturi_tip_persoana, "fizica");
    assert.equal(d.facturi_codf_client, CNP_NECUNOSCUT);
    assert.equal(d.facturi_nume_client, "Ion Popescu");
    assert.equal(d.facturi_tara_client, "Romania");
    assert.equal(d.facturi_moneda, "RON");
    assert.equal(d.facturi_status, "Emisa");
    assert.equal(d.facturi_obs_up, "Comanda #0012 - plata: Card online (Netopia)");
    assert.equal(d.facturi_gestiune, "Depozit");
    assert.equal(d.facturi_punct_de_lucru, undefined, "un punct de lucru gol nu pleaca");
    assert.equal(d.facturi_clienti_adresa_livrare, "Str. Lunga 5");
  });
  test("firma: persoana juridica, cu codul fiscal si registrul comertului", () => {
    const f = compuneFactura({
      comanda: comanda({
        billing_company: {
          company_name: "Firma SRL", cui: "14399840", reg_com: "J08/1/2020", vat_payer: true,
          address: "Str. Scurta 1", city: "Brasov", county: "Brasov", verified: true, inactive: false,
        },
      }),
      magazin: magazinCuTva, skus: new Map(), config: { serie: "EDN" }, slot: SLOT, etichetaPlata: "", acum: ACUM,
    });
    assert.ok(!("error" in f));
    assert.equal(f.dataFact.facturi_tip_persoana, "juridica");
    assert.equal(f.dataFact.facturi_nume_client, "Firma SRL");
    assert.equal(f.dataFact.facturi_codf_client, "RO14399840");
    assert.equal(f.dataFact.facturi_nrreg_client, "J08/1/2020");
    assert.equal(f.dataFact.facturi_sediu_client, "Str. Scurta 1");
  });
  test("⚠ o comanda ale carei linii nu dau totalul NU se factureaza", () => {
    const f = compuneFactura({
      comanda: comanda({ total: 50 }), magazin: magazinCuTva, skus: new Map(),
      config: { serie: "EDN" }, slot: SLOT, etichetaPlata: "", acum: ACUM,
    });
    assert.ok("error" in f);
    assert.match(f.error, /nu se poate factura/);
  });
  test("diferenta de rotunjire legitima se absoarbe intr-o linie, iar documentul iese pe fix", () => {
    /* Pret de pachet nerotunjit: 6,705 x 2 = 13,41 pe comanda, dar documentul scrie 6,71 x 2. */
    const c = comanda({
      items: [{ name: "Pachet", price: 6.705, quantity: 2 }],
      shipping_cost: 0, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 13.41,
    });
    const f = compuneFactura({
      comanda: c, magazin: magazinCuTva, skus: new Map(), config: { serie: "EDN" }, slot: SLOT, etichetaPlata: "", acum: ACUM,
    });
    assert.ok(!("error" in f), "error" in f ? f.error : "");
    assert.equal(f.total, 13.41);
    const ajustare = f.dataProd.find((l) => l.facturi_prod_nume === "Ajustare rotunjire");
    assert.ok(ajustare, "lipseste linia de ajustare");
    assert.equal(ajustare.facturi_prod_cant, "-1.000", "ajustarea in minus e tot cantitate negativa, pret pozitiv");
  });
  test("cote amestecate: fiecare linie cu cota ei, transportul impartit, totalul tot exact", () => {
    const c = comanda({
      items: [
        { name: "Carte", price: 50, quantity: 1, vat_rate: 11 } as never,
        { name: "Joc", price: 100, quantity: 1, vat_rate: 21 } as never,
      ],
      shipping_cost: 15, discount_amount: 0, card_discount_amount: 0, discount_code: null, total: 165,
    });
    const f = compuneFactura({
      comanda: c, magazin: magazinCuTva, skus: new Map(), config: { serie: "EDN" }, slot: SLOT, etichetaPlata: "", acum: ACUM,
    });
    assert.ok(!("error" in f), "error" in f ? f.error : "");
    assert.equal(f.total, 165);
    assert.equal(f.dataProd.find((l) => l.facturi_prod_nume === "Carte")?.facturi_prod_tva, "11%");
    assert.equal(f.dataProd.find((l) => l.facturi_prod_nume === "Joc")?.facturi_prod_tva, "21%");
    const transport = f.dataProd.filter((l) => l.facturi_prod_nume.startsWith("Transport"));
    assert.equal(transport.length, 2, "transportul se imparte pe cele doua cote");
  });
  test("neplatitor de TVA: totul pe 0%", () => {
    const f = compuneFactura({
      comanda: comanda({ vat_rate: 0 }), magazin: { vat_enabled: false, vat_rate: 0, prices_include_vat: true },
      skus: new Map(), config: { serie: "EDN" }, slot: SLOT, etichetaPlata: "", acum: ACUM,
    });
    assert.ok(!("error" in f), "error" in f ? f.error : "");
    assert.ok(f.dataProd.every((l) => l.facturi_prod_tva === "0%" && l.facturi_prod_val_tva.replace("-", "") === "0.00"));
  });
  test("reemiterea dupa storno spune pe document ce inlocuieste", () => {
    const f = compuneFactura({
      comanda: comanda(), magazin: magazinCuTva, skus: new Map(), config: { serie: "EDN" },
      slot: { poateEmite: true, inlocuieste: { factura: "EDN 7", storno: "EDN 9" } },
      etichetaPlata: "", acum: ACUM,
    });
    assert.ok(!("error" in f));
    assert.match(f.dataFact.facturi_obs_up, /inlocuieste factura EDN 7, stornata prin EDN 9/);
  });
});

function facturaCitita(extra: Partial<FacturaCitita> = {}): FacturaCitita {
  return {
    cheie: "92382888", serie: "EDN", numar: "141", data: "11-02-2026 15:30:52", total: 59.5,
    status: "Emisa", statusEfactura: "", clientCheie: "245",
    client: {
      nume: "Ion Popescu", tipPersoana: "fizica", codFiscal: CNP_NECUNOSCUT, nrReg: "", sediu: "Str. Lunga 5",
      judet: "Brasov", oras: "Brasov", tara: "Romania", cont: "", banca: "", telefon: "0712345678", adresaLivrare: "",
    },
    moneda: "RON", cotaDocument: "21%",
    linii: [
      {
        nume: "Cana", pretFaraTva: "41.2397", pretCuTva: "49.9", cantitate: "1.000", valoare: "41.24",
        valoareTva: "8.66", valoareTotala: "49.90", cota: "21%", moneda: "RON",
        codEan: "", codSku: "CANA-01", codAlt: "", codCautare: "prod_sku",
      },
      {
        nume: "Discount", pretFaraTva: "8.2645", pretCuTva: "10", cantitate: "-1.000", valoare: "-8.26",
        valoareTva: "-1.74", valoareTotala: "-10.00", cota: "21%", moneda: "RON",
        codEan: "", codSku: "", codAlt: "", codCautare: "prod_cod",
      },
    ],
    ...extra,
  };
}

describe("stornarea", () => {
  test("copiaza liniile facturii LOR cu cantitatile si valorile cu semn schimbat", () => {
    const s = compuneStornarea({
      original: facturaCitita(), serie: "EDN", orderNumber: "0012", numeClientRezerva: "Ion Popescu",
      config: {}, acum: ACUM,
    });
    assert.ok(!("error" in s), "error" in s ? s.error : "");
    assert.equal(s.dataProd[0].facturi_prod_cant, "-1.000");
    assert.equal(s.dataProd[0].facturi_prod_val_tot, "-49.90");
    assert.equal(s.dataProd[1].facturi_prod_cant, "1.000", "reducerea stornata devine pozitiva");
    assert.equal(s.dataProd[1].facturi_prod_val_tot, "10.00");
    assert.equal(s.total, -39.9);
    assert.equal(s.dataProd[0].prod_sku, "CANA-01");
    assert.equal(s.dataProd[0].prod_cod_cautare, "prod_sku");
    assert.equal(s.dataProd[1].prod_cod_cautare, undefined, "cautarea pe un cod gol nu pleaca");
  });
  test("antetul: clientul facturii originale si legatura cu ea, pe document", () => {
    const s = compuneStornarea({
      original: facturaCitita(), serie: "STO", orderNumber: "0012", numeClientRezerva: "X",
      config: { gestiune: "Depozit" }, acum: ACUM,
    });
    assert.ok(!("error" in s));
    assert.equal(s.dataFact.facturi_serie, "STO");
    assert.equal(s.dataFact.facturi_nume_client, "Ion Popescu");
    assert.equal(s.dataFact.facturi_codf_client, CNP_NECUNOSCUT);
    assert.equal(s.dataFact.facturi_obs_up, "Stornare factura EDN 141 din 11-02-2026 (comanda #0012)");
    assert.equal(s.dataFact.facturi_gestiune, "Depozit");
  });
  test("fara linii citite, stornarea nu se compune (ar fi un document gol)", () => {
    const s = compuneStornarea({
      original: facturaCitita({ linii: [] }), serie: "EDN", orderNumber: "1", numeClientRezerva: "X", config: {}, acum: ACUM,
    });
    assert.ok("error" in s);
  });
  test("o linie cu cifre necitibile opreste stornarea, nu pleaca o nota partiala", () => {
    const o = facturaCitita();
    o.linii[0].valoareTotala = "";
    const s = compuneStornarea({ original: o, serie: "EDN", orderNumber: "1", numeClientRezerva: "X", config: {}, acum: ACUM });
    assert.ok("error" in s);
  });
});
