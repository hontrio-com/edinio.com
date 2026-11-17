import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import {
  cantitate, codulTarii, compuneDinComanda, curataText, dataSaga, escapeazaXml, guidDin, numeleFisierului, pretUnitar, suma,
  xmlFacturi, type ComandaSaga, type FacturaSaga, type FirmaSaga,
} from "./xml";
import {
  CAMPURI_SECRETE_SAGA, CASE_FACTURARE, STARI_EXPORT, cheieValida, codFiscalCurat, configCuImplicite,
  mascheazaConfigSaga, sagaGata, type SagaConfig,
} from "./config";

/*
 * Fisierul de import SAGA, compus din comanda. Ce conteaza: XML-ul e VALID oricare ar fi textele din
 * comanda (escapare), totalul si TVA-ul pe cote sunt ale documentului emis (`orders.total`), iar
 * stornarea e factura cu semn schimbat, pana la ban.
 */

const FIRMA: FirmaSaga = {
  nume: "Magazin & Co SRL", codFiscal: "RO12345678", regCom: "J12/1/2020",
  localitate: "Cluj-Napoca", judet: "Cluj", adresa: "Str. Fabricii 1",
};
const MAGAZIN = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const CONFIG: Pick<SagaConfig, "cod_fiscal" | "clienti_pf" | "nume_client_generic" | "tva_la_incasare" | "gestiune"> = {
  cod_fiscal: "RO12345678", clienti_pf: "fiecare", nume_client_generic: "", tva_la_incasare: false, gestiune: "",
};
const PRODUS = "11111111-1111-4111-8111-111111111111";
const SKUS = new Map([[PRODUS, "CANA-01"]]);

/** Comanda de baza: 2 x 50 lei (21%), transport 15,99, reducere 10 lei; total 105,99. */
function comanda(extra: Partial<ComandaSaga> & Record<string, unknown> = {}): ComandaSaga {
  return {
    order_number: "1042",
    customer_name: "Ion Popescu",
    shipping_address: { address: "Str. Lunga 5", city: "Cluj-Napoca", county: "Cluj", country: "RO" },
    items: [{ name: "Cana „Tom & Jerry” <mare>", price: 50, quantity: 2, product_id: PRODUS }],
    shipping_cost: 15.99,
    discount_amount: 10,
    discount_code: "TOAMNA",
    total: 105.99,
    vat_rate: 21,
    vat_amount: 18.4,
    prices_include_vat: true,
    payment_status: "paid",
    ...extra,
  } as ComandaSaga;
}

function compune(c: ComandaSaga, tip: "factura" | "storno" = "factura", config = CONFIG): FacturaSaga {
  const r = compuneDinComanda({
    comanda: c,
    magazin: MAGAZIN,
    skus: SKUS,
    config,
    firma: FIRMA,
    document: { tip, casa: "smartbill", numarComplet: tip === "factura" ? "EDN0001" : "EDN0002", data: "2026-11-17" },
    facturaStornata: tip === "storno" ? { numarComplet: "EDN0001", data: "2026-11-10" } : null,
  });
  if ("error" in r) throw new Error(r.error);
  return r.factura;
}

/** Continutul tuturor elementelor `<tag>`, in ordine. */
function valori(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => m[1]);
}

/**
 * Un verificator mic de XML bine format, pe forma pe care o scriem (fara atribute): fiecare element se
 * inchide in ordine, iar textul nu contine `<`, `>` sau `&` in afara entitatilor.
 */
function bineFormat(xml: string): void {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'), "lipseste declaratia XML");
  const corp = xml.slice(xml.indexOf("\n") + 1).trim();
  const stiva: string[] = [];
  let i = 0;
  while (i < corp.length) {
    if (corp[i] === "<") {
      const j = corp.indexOf(">", i);
      assert.ok(j > i, "eticheta neinchisa");
      const m = /^<(\/?)([A-Za-z_][\w.-]*)>$/.exec(corp.slice(i, j + 1));
      assert.ok(m, `eticheta nevalida: ${corp.slice(i, j + 1)}`);
      if (m[1]) assert.equal(stiva.pop(), m[2], `</${m[2]}> nu inchide elementul deschis`);
      else stiva.push(m[2]);
      i = j + 1;
    } else {
      const j = corp.indexOf("<", i) === -1 ? corp.length : corp.indexOf("<", i);
      const textul = corp.slice(i, j);
      assert.doesNotMatch(textul, />/, `„>" neescapat in text: ${textul}`);
      assert.doesNotMatch(textul, /&(?!(amp|lt|gt|quot|apos);)/, `„&" neescapat in text: ${textul}`);
      assert.doesNotMatch(textul, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, "caracter de control in text");
      i = j;
    }
  }
  assert.deepEqual(stiva, [], "elemente ramase deschise");
}

describe("textele: escapare si curatare", () => {
  test("toate cele cinci caractere speciale se escapeaza", () => {
    assert.equal(escapeazaXml(`Tom & Jerry <"x"> 'y'`), "Tom &amp; Jerry &lt;&quot;x&quot;&gt; &apos;y&apos;");
  });

  test("⚠ caracterele de control SE SCOT (nici ca entitate nu sunt permise in XML 1.0), randurile noi devin spatii", () => {
    assert.equal(curataText("Cana\u0001 mare\nalba\t\t2"), "Cana mare alba 2");
    assert.equal(curataText("a￾b"), "ab");
  });

  test("jumatatile de surogat singure cad, perechile (emoji) raman", () => {
    assert.equal(curataText("x\uD800y"), "xy");
    assert.equal(curataText("x\uDC00y"), "xy");
    assert.equal(curataText("cadou 🎁"), "cadou 🎁");
  });

  test("diacriticele raman, in forma compusa (NFC)", () => {
    assert.equal(curataText("ș"), "ș");
  });
});

describe("numere, date, nume de fisier", () => {
  test("sume cu doua zecimale, fara „-0.00”", () => {
    assert.equal(suma(82.6446), "82.64");
    assert.equal(suma(-0.004), "0.00");
    assert.equal(suma(-8.26), "-8.26");
    assert.equal(pretUnitar(50 / 1.21), "41.3223");
    assert.equal(cantitate(2), "2");
    assert.equal(cantitate(-1), "-1");
    assert.equal(cantitate(1.5), "1.5");
    assert.equal(cantitate(10), "10");
  });

  test("data: DD-MM-YYYY, dintr-o zi ISO", () => {
    assert.equal(dataSaga("2026-11-17"), "17-11-2026");
    assert.equal(dataSaga("nu e data"), "");
  });

  test("numele fisierului: F_<cod-fiscal>_<numar>_<data>.xml, fara bare, spatii sau puncte in plus", () => {
    assert.equal(numeleFisierului("RO12345678", "EDN0001", "2026-11-17"), "F_RO12345678_EDN0001_17-11-2026.xml");
    assert.equal(numeleFisierului("RO 123", "EDN/2026 1.5", "2026-01-02"), "F_RO123_EDN202615_02-01-2026.xml");
  });

  test("GUID-ul: acelasi text, acelasi GUID; alt text, alt GUID; forma RFC 4122", () => {
    const a = guidDin("edinio-saga:RO1:factura:smartbill:EDN0001");
    assert.equal(a, guidDin("edinio-saga:RO1:factura:smartbill:EDN0001"));
    assert.notEqual(a, guidDin("edinio-saga:RO1:factura:smartbill:EDN0002"));
    assert.notEqual(a, guidDin("edinio-saga:RO1:storno:smartbill:EDN0001"));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("factura compusa din comanda", () => {
  const f = compune(comanda());
  const xml = xmlFacturi([f]);

  test("XML-ul e bine format, chiar cu „&”, „<” si ghilimele in numele produsului", () => {
    bineFormat(xml);
    assert.ok(xml.includes("<Descriere>Cana „Tom &amp; Jerry” &lt;mare&gt;</Descriere>"));
  });

  test("⚠ totalul e chiar totalul comenzii, iar fiecare linie e valoare + TVA din pretul cu TVA", () => {
    assert.equal(f.total, 105.99);
    assert.deepEqual(valori(xml, "Cantitate"), ["2", "1", "-1"]);
    assert.deepEqual(valori(xml, "Pret"), ["41.3223", "13.2149", "8.2645"]);
    assert.deepEqual(valori(xml, "Valoare"), ["82.64", "13.21", "-8.26"]);
    assert.deepEqual(valori(xml, "TVA"), ["17.36", "2.78", "-1.74"]);
    assert.deepEqual(valori(xml, "ProcTVA"), ["21", "21", "21"]);
    const totalXml = valori(xml, "Valoare").concat(valori(xml, "TVA")).reduce((s, v) => s + Number(v), 0);
    assert.equal(Math.round(totalXml * 100) / 100, 105.99);
  });

  test("reducerea e o linie cu cantitate -1 si pret POZITIV (BR-27)", () => {
    const red = f.linii.find((l) => l.descriere.startsWith("Discount"));
    assert.ok(red);
    assert.equal(red.descriere, "Discount (TOAMNA)");
    assert.ok(red.cantitate < 0);
    assert.ok(red.pret > 0);
  });

  test("codul articolului e SKU-ul, numai pe linia de marfa", () => {
    assert.deepEqual(valori(xml, "CodArticolClient"), ["CANA-01"]);
  });

  test("antetul: firma la Furnizor (deci factura intra la Iesiri), clientul cu judetul ca COD", () => {
    assert.deepEqual(valori(xml, "FurnizorCIF"), ["RO12345678"]);
    assert.deepEqual(valori(xml, "FurnizorNume"), ["Magazin &amp; Co SRL"]);
    assert.deepEqual(valori(xml, "FurnizorJudet"), ["CJ"]);
    assert.deepEqual(valori(xml, "ClientNume"), ["Ion Popescu"]);
    assert.deepEqual(valori(xml, "ClientJudet"), ["CJ"]);
    assert.deepEqual(valori(xml, "ClientTara"), ["RO"]);
    assert.deepEqual(valori(xml, "ClientCIF"), [""], "persoana fizica: fara CNP inventat");
    assert.deepEqual(valori(xml, "FacturaNumar"), ["EDN0001"]);
    assert.deepEqual(valori(xml, "FacturaData"), ["17-11-2026"]);
    assert.deepEqual(valori(xml, "FacturaTaxareInversa"), ["Nu"]);
    assert.deepEqual(valori(xml, "FacturaTVAIncasare"), ["Nu"]);
    assert.deepEqual(valori(xml, "FacturaInformatiiSuplimentare"), ["Comanda #1042 (SmartBill)"]);
    assert.equal(valori(xml, "GUID_factura").length, 1);
    assert.equal(valori(xml, "GUID_cod_client").length, 0, "persoana fizica luata una cate una n-are GUID");
  });

  test("⚠ telefonul si emailul clientului NU pleaca (nu-i trebuie contabilitatii)", () => {
    const cu = xmlFacturi([compune(comanda({ customer_phone: "0722111222", customer_email: "ion@exemplu.ro" }))]);
    assert.ok(!cu.includes("0722111222"));
    assert.ok(!cu.includes("ion@exemplu.ro"));
    assert.deepEqual(valori(cu, "ClientTelefon"), [""]);
    assert.deepEqual(valori(cu, "ClientMail"), [""]);
  });

  test("Bucurestiul pleaca drept „B”; o tara straina, fara judet", () => {
    const b = compune(comanda({ shipping_address: { address: "Bd. Unirii 1", city: "Bucuresti", county: "Municipiul Bucuresti" } }));
    assert.equal(b.client.judet, "B");
    const de = compune(comanda({ shipping_address: { address: "Hauptstr. 1", city: "Berlin", county: "Berlin", country: "DE" } }));
    assert.equal(de.client.tara, "DE");
    assert.equal(de.client.judet, "");
  });

  test("⚠ tara scrisa cu numele („Romania”, „România”) pleaca drept cod; una necunoscuta NU pleaca ghicita", () => {
    assert.equal(codulTarii("Romania"), "RO");
    assert.equal(codulTarii("România"), "RO");
    assert.equal(codulTarii(" ro "), "RO");
    assert.equal(codulTarii(""), "RO");
    assert.equal(codulTarii("Germania"), "DE");
    assert.equal(codulTarii("Tara Nimanui"), null);
    const ro = compune(comanda({ shipping_address: { address: "Str. Lunga 5", city: "Cluj-Napoca", county: "Cluj", country: "România" } }));
    assert.equal(ro.client.tara, "RO");
    assert.equal(ro.client.judet, "CJ", "cu tara recunoscuta, judetul pleaca drept cod");
    const r = compuneDinComanda({
      comanda: comanda({ shipping_address: { address: "X 1", city: "Y", county: "Z", country: "Tara Nimanui" } }),
      magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "2026-11-17" },
    });
    assert.ok("error" in r);
    assert.match(r.error, /Țara clientului/);
  });

  test("⚠ judetul nerecunoscut nu pleaca gol TACUT: documentul pleaca, cu avertisment", () => {
    const r = compuneDinComanda({
      comanda: comanda({ shipping_address: { address: "Str. Lunga 5", city: "Oras", county: "Judetul Inventat" } }),
      magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "2026-11-17" },
    });
    if ("error" in r) throw new Error(r.error);
    assert.equal(r.factura.client.judet, "");
    assert.ok(r.avertismente.some((a) => a.includes("Judetul Inventat")), "avertismentul numeste judetul primit");
    const bun = compuneDinComanda({
      comanda: comanda(), magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "2026-11-17" },
    });
    if ("error" in bun) throw new Error(bun.error);
    assert.deepEqual(bun.avertismente, []);
  });

  test("TVA la incasare si gestiunea (doar pe marfa), cand sunt cerute", () => {
    const g = xmlFacturi([compune(comanda(), "factura", { ...CONFIG, tva_la_incasare: true, gestiune: "001" })]);
    assert.deepEqual(valori(g, "FacturaTVAIncasare"), ["Da"]);
    assert.deepEqual(valori(g, "Gestiune"), ["001"], "transportul si reducerea nu poarta gestiune");
  });
});

describe("stornarea: factura cu semn schimbat", () => {
  const f = compune(comanda());
  const s = compune(comanda(), "storno");
  const xml = xmlFacturi([s]);

  test("⚠ fiecare linie e exact linia facturii cu minus; pretul ramane pozitiv", () => {
    assert.equal(s.linii.length, f.linii.length);
    s.linii.forEach((l, i) => {
      assert.equal(l.cantitate, -f.linii[i].cantitate);
      assert.equal(l.valoare, -f.linii[i].valoare);
      assert.equal(l.tva, -f.linii[i].tva);
      assert.equal(l.pret, f.linii[i].pret);
      assert.ok(l.pret > 0);
    });
    assert.equal(s.total, -105.99);
    assert.equal(s.total + f.total, 0, "stornarea trebuie sa anuleze factura pana la ban");
  });

  test("in XML: cantitati, valori si TVA cu minus, mentiunea facturii stornate", () => {
    bineFormat(xml);
    assert.deepEqual(valori(xml, "Cantitate"), ["-2", "-1", "1"]);
    assert.deepEqual(valori(xml, "Valoare"), ["-82.64", "-13.21", "8.26"]);
    assert.deepEqual(valori(xml, "TVA"), ["-17.36", "-2.78", "1.74"]);
    assert.deepEqual(valori(xml, "FacturaNumar"), ["EDN0002"]);
    assert.match(valori(xml, "FacturaInformatiiSuplimentare")[0], /^Stornare EDN0001 din 10\.11\.2026, comanda #1042/);
  });

  test("GUID-ul stornarii difera de al facturii", () => {
    assert.notEqual(s.guid, f.guid);
  });
});

describe("cotele de TVA si garda de total", () => {
  test("⚠ cote amestecate: fiecare linie cu cota ei, transportul impartit pe cote, totalul neschimbat", () => {
    const f = compune(comanda({
      items: [
        { name: "Hrana", price: 111, quantity: 1, vat_rate: 11 },
        { name: "Jucarie", price: 121, quantity: 1, vat_rate: 21 },
      ],
      shipping_cost: 20, discount_amount: 0, discount_code: null, total: 252,
    }));
    const pe = (cota: number) => f.linii.filter((l) => l.cota === cota);
    assert.deepEqual(pe(11).map((l) => [l.descriere, l.valoare, l.tva]), [["Hrana", 100, 11], ["Transport (11%)", 8.62, 0.95]]);
    assert.deepEqual(pe(21).map((l) => [l.descriere, l.valoare, l.tva]), [["Jucarie", 100, 21], ["Transport (21%)", 8.62, 1.81]]);
    assert.equal(f.total, 252);
  });

  test("diferenta de rotunjire legitima intra intr-o linie „Ajustare rotunjire”", () => {
    const f = compune(comanda({
      items: [{ name: "Pix", price: 33.33, quantity: 3 }],
      shipping_cost: 0, discount_amount: 0, discount_code: null, total: 100,
    }));
    const aj = f.linii.find((l) => l.descriere === "Ajustare rotunjire");
    assert.ok(aj, "lipseste linia de ajustare");
    assert.equal(f.total, 100);
  });

  test("⚠ liniile care nu dau totalul comenzii NU pleaca", () => {
    const r = compuneDinComanda({
      comanda: comanda({ items: [{ name: "X", price: 100, quantity: 1 }], shipping_cost: 0, discount_amount: 0, total: 150 }),
      magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "oblio", numarComplet: "OB1", data: "2026-11-17" },
    });
    assert.ok("error" in r);
    assert.match(r.error, /nu pleacă în SAGA/);
    assert.match(r.error, /150,00 lei/);
    /* ⚠ Mesajul emiterii („nu se poate factura... emite factura") l-ar fi trimis pe om sa emita o factura
       care exista deja; si avea liniuta lunga, interzisa in textele SAGA. */
    assert.doesNotMatch(r.error, /factura\b.*emite|nu se poate factura/i);
    assert.ok(!r.error.includes("\u2014"));
  });

  test("⚠ casa care a emis FARA TVA (SmartBill/Oblio fara nume de cota): documentul din SAGA e tot fara TVA", () => {
    const r = compuneDinComanda({
      comanda: comanda(), magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "2026-11-17" },
      tvaFurnizor: false,
    });
    if ("error" in r) throw new Error(r.error);
    assert.ok(r.factura.linii.length >= 2);
    assert.ok(r.factura.linii.every((l) => l.cota === 0 && l.tva === 0), "nicio linie cu TVA");
    assert.equal(r.factura.total, 105.99);
    const cu = compuneDinComanda({
      comanda: comanda(), magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "2026-11-17" },
      tvaFurnizor: true,
    });
    if ("error" in cu) throw new Error(cu.error);
    assert.ok(cu.factura.linii.every((l) => l.cota === 21));
  });

  test("preturi FARA TVA: valoarea e pretul net, TVA-ul se adauga pe linie", () => {
    const f = compune(comanda({
      items: [{ name: "Surub", price: 10, quantity: 2 }],
      shipping_cost: 0, discount_amount: 0, discount_code: null, total: 24.2, vat_amount: 4.2, prices_include_vat: false,
    }));
    assert.deepEqual(f.linii.map((l) => [l.pret, l.valoare, l.tva]), [[10, 20, 4.2]]);
    assert.equal(f.total, 24.2);
  });

  test("magazin neplatitor de TVA: cota 0 pe toate liniile, chiar si pe cele care isi poarta cota", () => {
    const r = compuneDinComanda({
      comanda: comanda({ items: [{ name: "Carte", price: 50, quantity: 1, vat_rate: 11 }], shipping_cost: 0, discount_amount: 0, total: 50, vat_rate: 0 }),
      magazin: { vat_enabled: false, vat_rate: 0, prices_include_vat: true },
      skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "fgo", numarComplet: "FG1", data: "2026-11-17" },
    });
    if ("error" in r) throw new Error(r.error);
    assert.deepEqual(r.factura.linii.map((l) => [l.cota, l.tva]), [[0, 0]]);
  });
});

describe("ce nu pleaca, si clientii", () => {
  test("⚠ o comanda in alta moneda nu pleaca: casele emit de aici doar in lei", () => {
    const r = compuneDinComanda({
      comanda: comanda({ order_source: { currency: "EUR" } }),
      magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA,
      document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "2026-11-17" },
    });
    assert.ok("error" in r);
    assert.match(r.error, /EUR/);
  });

  test("fara data sau fara numar, nu se compune nimic", () => {
    const baza = { comanda: comanda(), magazin: MAGAZIN, skus: SKUS, config: CONFIG, firma: FIRMA };
    assert.ok("error" in compuneDinComanda({ ...baza, document: { tip: "factura", casa: "smartbill", numarComplet: "EDN1", data: "" } }));
    assert.ok("error" in compuneDinComanda({ ...baza, document: { tip: "factura", casa: "smartbill", numarComplet: "", data: "2026-11-17" } }));
  });

  test("firma: codul fiscal cu RO la platitor, Reg. Com., si acelasi GUID de client la fiecare comanda", () => {
    const firma = {
      cui: "14399840", company_name: "Client Firma SRL", reg_com: "J40/372/2002",
      address: "Sos. Virtutii 148", city: "Bucuresti", county: "Municipiul Bucuresti", vat_payer: true,
    };
    const a = compune(comanda({ billing_company: firma }));
    const b = compune(comanda({ billing_company: firma, order_number: "2000" }));
    assert.equal(a.client.nume, "Client Firma SRL");
    assert.equal(a.client.cif, "RO14399840");
    assert.equal(a.client.regCom, "J40/372/2002");
    assert.ok(a.client.guid);
    assert.equal(a.client.guid, b.client.guid, "aceeasi firma trebuie sa fie acelasi partener in SAGA");
  });

  test("clientul generic: acelasi nume si GUID pentru toti, FARA adresa nimanui", () => {
    const cfg = { ...CONFIG, clienti_pf: "generic" as const, nume_client_generic: "Persoane fizice" };
    const a = compune(comanda(), "factura", cfg);
    const b = compune(comanda({ customer_name: "Maria Ionescu", shipping_address: { address: "Alta 9", city: "Iasi", county: "Iasi" } }), "factura", cfg);
    assert.equal(a.client.nume, "Persoane fizice");
    assert.equal(a.client.adresa, "");
    assert.equal(a.client.localitate, "");
    assert.deepEqual(a.client, b.client);
    const xml = xmlFacturi([a]);
    assert.ok(!xml.includes("Ion Popescu"));
    assert.ok(!xml.includes("Str. Lunga"));
  });

  test("clientul generic nu se aplica firmelor", () => {
    const cfg = { ...CONFIG, clienti_pf: "generic" as const };
    const f = compune(comanda({ billing_company: { cui: "14399840", company_name: "Firma SRL", vat_payer: false } }), "factura", cfg);
    assert.equal(f.client.nume, "Firma SRL");
    assert.equal(f.client.cif, "14399840");
  });
});

describe("configurarea", () => {
  test("⚠ masca goleste cheia ORICUM, chiar inainte ca lista comuna de secrete sa stie de SAGA", () => {
    const m = mascheazaConfigSaga({ enabled: true, cod_fiscal: "RO1", api_key: "cheie-secreta-de-proba" });
    assert.equal(m?.api_key, "");
    assert.equal(m?._completate?.api_key, true);
    assert.ok(!JSON.stringify(m).includes("cheie-secreta-de-proba"));
    assert.equal(mascheazaConfigSaga({ enabled: true, cod_fiscal: "RO1", api_key: "" })?._completate?.api_key, false);
    assert.equal(mascheazaConfigSaga(null), null);
  });

  test("⚠ si cand lista comuna de secrete NU stie de SAGA (legare pierduta), cheia nu pleaca in browser", () => {
    const vechi = CAMPURI_SECRETE.saga_config;
    delete CAMPURI_SECRETE.saga_config;
    try {
      const m = mascheazaConfigSaga({ enabled: true, cod_fiscal: "RO1", api_key: "cheie-secreta-de-proba" });
      assert.equal(m?.api_key, "");
      assert.ok(!JSON.stringify(m).includes("cheie-secreta-de-proba"));
    } finally {
      CAMPURI_SECRETE.saga_config = vechi;
    }
  });

  test("gata = pornita, cu cheie si cod fiscal", () => {
    assert.equal(sagaGata({ enabled: true, api_key: "k", cod_fiscal: "RO1" }), true);
    assert.equal(sagaGata({ enabled: false, api_key: "k", cod_fiscal: "RO1" }), false);
    assert.equal(sagaGata({ enabled: true, api_key: " ", cod_fiscal: "RO1" }), false);
    assert.equal(sagaGata({ enabled: true, api_key: "k", cod_fiscal: "" }), false);
    assert.equal(sagaGata(null), false);
  });

  test("⚠ codul fiscal pleaca intr-un ANTET: forma stricta, fara rand nou strecurat", () => {
    assert.equal(codFiscalCurat(" ro 123 456 "), "RO123456");
    assert.equal(codFiscalCurat("12345678"), "12345678");
    assert.equal(codFiscalCurat("RO12345678\r\nX-Altceva: 1"), null);
    assert.equal(codFiscalCurat("Firma SRL"), null);
    assert.equal(codFiscalCurat(""), null);
  });

  test("cheia: ASCII vizibil, fara spatii", () => {
    assert.equal(cheieValida("eyJhbGciOi.abc-DEF_123"), true);
    assert.equal(cheieValida("cu spatiu inauntru"), false);
    assert.equal(cheieValida("cheie\nnoua1"), false);
    assert.equal(cheieValida("scurta"), false);
    assert.equal(cheieValida("diacritică123"), false);
  });

  test("implicit: stornarile PLEACA, restul optiunilor pornesc oprite", () => {
    const c = configCuImplicite({});
    assert.equal(c.trimite_stornari, true);
    assert.equal(c.import_automat, false);
    assert.equal(c.trimitere_automata, false);
    assert.equal(c.clienti_pf, "fiecare");
  });

  /*
   * ⚠ CODUL SI MIGRATIA (`2027-02-06-factureaza-easybill-saga.sql`) SPUN ACELASI LUCRU. Un camp secret lipsa din `privat.campuri_secrete` ar
   * ramane necriptat in baza, in tacere; o stare de jurnal lipsa din constrangere ar face scrierea
   * jurnalului sa cada pe exact starea noua.
   */
  const sql = readFileSync("migrations/2027-02-06-factureaza-easybill-saga.sql", "utf8").replace(/\r\n/g, "\n");
  const lista = (constrangere: string): string[] => {
    const i = sql.indexOf(`constraint ${constrangere} check`);
    assert.ok(i >= 0, `lipseste ${constrangere} din fragment`);
    const bucata = sql.slice(i, sql.indexOf("]::text[]", i));
    return [...bucata.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  test("campurile secrete din cod sunt in `privat.campuri_secrete`", () => {
    for (const camp of CAMPURI_SECRETE_SAGA) {
      assert.match(sql, new RegExp(`\\('saga_config', '${camp}'\\)`), `${camp} nu se cripteaza`);
    }
  });

  test("starile jurnalului si casele sunt aceleasi in cod si in constrangeri", () => {
    assert.deepEqual(lista("saga_exporturi_stare_check"), [...STARI_EXPORT]);
    assert.deepEqual(lista("saga_exporturi_casa_check"), [...CASE_FACTURARE]);
  });

  test("registrul primeste felul `export` si furnizorul `saga`, fara sa piarda vreun furnizor", () => {
    assert.ok(lista("operatii_externe_fel_check").includes("export"));
    const furnizori = lista("operatii_externe_furnizor_check");
    for (const f of ["saga", "smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill", "cargus", "emag", "proba"]) {
      assert.ok(furnizori.includes(f), `${f} lipseste din lista registrului`);
    }
  });
});
