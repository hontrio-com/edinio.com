import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { ADRESA_PRODUCTIE, ADRESA_TEST } from "./config";
import {
  antetAutentificare, citesteDeStornat, citesteDocumentele, citesteRaspunsul, corpulCererii, creeazaClientul,
  DOC_FACTURA, DOC_STORNARE, emiteDocumentul, inregistreazaIncasarea, LIMITA_DEPASITA, mesajFactureaza, pdfFactura,
  pregatesteEmiterea, serieSiNumar, testeazaConexiunea, verdictMutatie, type DocumentNou,
} from "./client";

/*
 * Clientul Factureaza.ro, probat fara fir. Ce conteaza aici e un singur lucru, cu doua fete: un refuz
 * DOVEDIT trebuie sa iasa `esuat` (reincercarea e libera), iar orice „nu stim” de pe o scriere
 * trebuie sa iasa `necunoscut` (reincercarea ar emite a doua factura fiscala).
 *
 * ⚠ RASPUNSURILE `PE_FIR` SUNT BRUTE, culese pe 17.11.2026 de pe sandbox-ul lor public (cheia de
 * proba tiparita in documentatie) si de pe productie cu o cheie INVENTATA. Documentatia nu le arata;
 * o presupunere despre forma lor ar fi fost o proba care apara presupunerea.
 */
const PE_FIR = {
  cheieGresita: "401 not authorized - please provide a valid API key",
  clientLipsa: '{"data":{"createInvoice":null},"errors":[{"message":"Validare nereuşită Client câmp obligatoriu, Client nu este inclus în listă","locations":[{"line":2,"column":3}],"path":["createInvoice"]}]}',
  serieAltAn: '{"data":{"createInvoice":null},"errors":[{"message":"Validare nereuşită Data facturii Anul seriei selectate nu coincide cu data documentului, Anul seriei selectate nu coincide cu data documentului, Serie Anul seriei selectate nu coincide cu data documentului!","locations":[{"line":1,"column":12}],"path":["createInvoice"]}]}',
  serieInexistenta: '{"data":{"createInvoice":null},"errors":[{"message":"Validare nereuşită Număr câmp obligatoriu, Data facturii câmp obligatoriu","locations":[{"line":1,"column":12}],"path":["createInvoice"]}]}',
  stornoFaraLinii: '{"data":{"createInvoice":null},"errors":[{"message":"Validare nereuşită Poziții insuficiente. Trebuie să existe cel puțin o poziție validă per factură., Total stornat trebuie specificată și trebuie să fie diferită de 0.","locations":[{"line":2,"column":3}],"path":["createInvoice"]}]}',
  sintaxa: '{"errors":[{"message":"Parse error on \\"series\\" (IDENTIFIER) at [1, 65]","locations":[{"line":1,"column":65}]}]}',
  argumentNecunoscut: '{"errors":[{"message":"Field \'createInvoice\' doesn\'t accept argument \'campInventat\'","locations":[{"line":1,"column":217}],"path":["mutation","createInvoice","campInventat"],"extensions":{"code":"argumentNotAccepted","name":"createInvoice","typeName":"Field","argumentName":"campInventat"}}]}',
  eroareSql: '{"error":{"message":"Mysql2::Error: Unknown column \'camp_inexistent\' in \'where clause\'"},"data":{}}',
  facturaEmisa: '{"data":{"createInvoice":{"id":"1065257888","series":"openapi-10","documentSeriesId":"1061105667","documentSeriesCounter":10,"documentState":"open","documentDate":"2026-11-17","dueDate":"2026-12-02","dueDays":15,"total":1274.57,"totalNoVat":1057.1,"vat":217.47,"totalDue":1274.57,"clientId":"1064116439","clientName":"Client Proba Edinio","clientAddress":"Strada Exemplu 1","documentPositions":[{"id":"1056083216","description":"Produs de proba mult","unitCount":1000.0,"price":1.0203,"total":1234.57,"vat":21.0,"type":"InvoicePosition","productCode":"PROBA-SKU-1"},{"id":"1056083217","description":"Discount (PROBA)","unitCount":-1.0,"price":8.2645,"total":-10.0,"vat":21.0,"type":"InvoicePosition","productCode":null},{"id":"1056083218","description":"Carte de proba","unitCount":1.0,"price":45.045,"total":50.0,"vat":11.0,"type":"InvoicePosition","productCode":null}]}}}',
  stornoEmis: '{"data":{"createInvoice":{"id":"1065257889","series":"openapi-11","documentSeriesCounter":11,"documentState":"open","total":-1274.57,"totalNoVat":-1057.1,"vat":-217.47,"totalDue":0.0,"reversedDocumentId":"1065257888","inputCurrencyReversing":"1274.57","type":"Invoice","documentPositions":[{"id":"1056083219","description":"Produs de proba mult","unitCount":-1000.0,"price":1.0203,"total":-1234.57,"vat":21.0,"type":"InvoicePosition","productCode":"PROBA-SKU-1"}]}}}',
  clientCreat: '{"data":{"createClient":{"id":"1064116439","name":"Client Proba Edinio","uid":"0000000000000","isCompany":"false","address":"Strada Exemplu 1","city":"Brasov","state":"Brasov","countryIso":"RO","email":"proba-integrare@example.com","createdAt":"2026-11-17T21:35:28+02:00"}}}',
  plataCreata: '{"data":{"createPayment":{"id":"969664141","amount":100.0,"paymentType":"xyz-necunoscut","paymentDate":"2026-11-17","currency":"RON","description":"Plata online, comanda #PROBA-2","invoiceId":"1065257890"}}}',
  contSiSerii: '{"data":{"account":[{"name":"sandbox","companyName":"Test Services SRL","companyUid":"24335356","companyTaxId":"RO"}],"invoiceSeries":[{"id":"1061105673","prefix":"SRV","year":"2027","sepparator":"-","suffix":"","counterCurrent":1000},{"id":"1061105665","prefix":"SRV","year":"2026","sepparator":"-","suffix":"","counterCurrent":1028},{"id":"1061105667","prefix":"openapi","year":"2026","sepparator":"-","suffix":"","counterCurrent":8}]}}',
  operatorNecunoscut: '{"data":{"invoices":null},"errors":[{"message":"Operatorul like nu există.","locations":[{"line":1,"column":21}],"path":["invoices"]}]}',
};

const A = { api_key: " 72543f4dc00474bc ", mediu: "test" as const };
const REAL = { api_key: "cheie-reala", mediu: "productie" as const };

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

type Raspuns = { status?: number; body: string; headers?: Record<string, string> };
type Cerere = { url: string; init: RequestInit; corp: { query: string; variables: Record<string, unknown> } };

/** Inlocuieste `fetch` si tine minte cererile, ca proba sa poata citi ce a plecat. */
function fir(...raspunsuri: (Raspuns | Error)[]) {
  const cereri: Cerere[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    cereri.push({ url: String(url), init: init ?? {}, corp: JSON.parse(String(init?.body ?? "{}")) });
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": "application/json", ...r.headers } });
  }) as typeof fetch;
  return cereri;
}

const ok = (body: string): Raspuns => ({ body });
const refuzaVerdict = (e: unknown) => verdictFurnizor(e) === "esuat";
const nestiutVerdict = (e: unknown) => verdictFurnizor(e) === "necunoscut";

const DOC: DocumentNou = {
  serieId: "1061105667", data: "2026-11-17", clientId: "1064116439", scadentaZile: 15,
  mentiune: "Comanda #0012", nota: "Emis din Edinio. Referinta: factura:factureaza:o1",
  pozitii: [{ description: "Cana", unit: "buc", unitCount: "2", total: "99.80", vat: "21", position: "0" }],
};

describe("cererea", () => {
  test("cheia pleaca in antetul Basic (cheia ca utilizator, parola ignorata), nu in adresa", async () => {
    assert.equal(antetAutentificare(" abc "), `Basic ${Buffer.from("abc:x").toString("base64")}`);
    const cereri = fir(ok(PE_FIR.facturaEmisa));
    await emiteDocumentul(A, DOC);
    assert.equal(cereri[0].url, ADRESA_TEST);
    assert.ok(!cereri[0].url.includes("72543f4dc00474bc"), "cheia nu are ce cauta in adresa");
    const antete = cereri[0].init.headers as Record<string, string>;
    assert.equal(antete.Authorization, antetAutentificare("72543f4dc00474bc"));
    assert.equal(cereri[0].init.redirect, "error", "o redirectare n-are voie sa duca cheia in alta parte");
  });
  test("productia si sandbox-ul au gazde diferite, alese dupa mediu", async () => {
    const cereri = fir(ok(PE_FIR.facturaEmisa));
    await emiteDocumentul(REAL, DOC);
    assert.equal(cereri[0].url, ADRESA_PRODUCTIE);
    assert.equal(ADRESA_PRODUCTIE, "https://factureaza.ro/graphql");
    assert.equal(ADRESA_TEST, "https://sandbox.factureaza.ro/graphql");
  });
  test("⚠ valorile pleaca DOAR in `variables`; textul cererii e constant", async () => {
    const rau = 'Tom & "Jerry" } mutation { deleteInvoice(id: "1") { id } }';
    const cereri = fir(ok(PE_FIR.facturaEmisa));
    await emiteDocumentul(A, { ...DOC, mentiune: rau, pozitii: [{ ...DOC.pozitii[0], description: rau }] });
    assert.equal(cereri[0].corp.query, DOC_FACTURA);
    assert.equal(cereri[0].corp.variables.mentiune, rau);
    assert.ok(!cereri[0].corp.query.includes("Jerry"));
    assert.equal(JSON.parse(corpulCererii("q", { a: 1 })).variables.a, 1);
  });
  test("⚠ factura se emite „open”, nu ciorna (fara stare, ei o fac ciorna)", () => {
    /* Doar argumentele mutatiei: campurile cerute inapoi pot numi orice. */
    const argumente = (doc: string) => {
      const i = doc.indexOf("createInvoice(");
      return doc.slice(i, doc.indexOf(") {", i));
    };
    assert.match(argumente(DOC_FACTURA), /documentState: "open"/);
    assert.match(argumente(DOC_STORNARE), /documentState: "open"/);
    assert.match(argumente(DOC_STORNARE), /reversedDocumentId: \$stornata/);
    assert.match(argumente(DOC_STORNARE), /inputCurrencyReversing: \$valoare/);
    assert.ok(!/reversedDocumentId|inputCurrencyReversing/.test(argumente(DOC_FACTURA)), "factura obisnuita nu poarta campurile stornarii");
  });
  test("scadenta pleaca in zile, ca text, si niciodata negativa", async () => {
    const cereri = fir(ok(PE_FIR.facturaEmisa));
    await emiteDocumentul(A, { ...DOC, scadentaZile: -3 });
    assert.equal(cereri[0].corp.variables.scadenta, "0");
  });
});

describe("raspunsul", () => {
  test("cele trei forme masurate se citesc", () => {
    const v = citesteRaspunsul(PE_FIR.clientLipsa);
    assert.deepEqual(v?.date, { createInvoice: null });
    assert.deepEqual(v?.erori[0].cale, ["createInvoice"]);
    const s = citesteRaspunsul(PE_FIR.sintaxa);
    assert.equal(s?.date, null);
    assert.match(s?.erori[0].mesaj ?? "", /Parse error/);
    const sql = citesteRaspunsul(PE_FIR.eroareSql);
    assert.equal(sql?.erori[0].cod, "eroare_interna", "forma `error` la singular nu se pierde");
  });
  test("⚠ orice alta forma e NECUNOSCUTA, nu reusita si nu refuz", () => {
    for (const t of ["<html>login</html>", "[]", "", "{}", "null", PE_FIR.cheieGresita]) {
      assert.equal(citesteRaspunsul(t), null, t);
    }
  });
});

describe("verdictul unei mutatii", () => {
  const verdict = (t: string) => verdictMutatie(citesteRaspunsul(t)!, "createInvoice");
  test("validarea lor (pe mutatie, `data` nul) e REFUZ", () => {
    for (const t of [PE_FIR.clientLipsa, PE_FIR.serieAltAn, PE_FIR.serieInexistenta, PE_FIR.stornoFaraLinii]) {
      assert.equal(verdict(t).fel, "refuzat");
    }
  });
  test("⚠ eroarea dinainte de executie (fara `data`) e REFUZ, desi calea ei e lunga", () => {
    assert.equal(verdict(PE_FIR.argumentNecunoscut).fel, "refuzat");
    assert.equal(verdict(PE_FIR.sintaxa).fel, "refuzat");
  });
  test("⚠ eroarea pe un SUB-CAMP al rezultatului inseamna ca mutatia a rulat: NU STIM", () => {
    const t = '{"data":{"createInvoice":null},"errors":[{"message":"boom","path":["createInvoice","total"]}]}';
    assert.equal(verdict(t).fel, "nestiut");
  });
  test("eroarea interna, si raspunsul fara rezultat si fara erori: NU STIM", () => {
    assert.equal(verdict(PE_FIR.eroareSql).fel, "nestiut");
    assert.equal(verdict('{"data":{"createInvoice":null}}').fel, "nestiut");
    assert.equal(verdict('{"data":{}}').fel, "nestiut");
  });
  test("limita depasita e refuz, oriunde ar sta eroarea", () => {
    const t = `{"data":{"createInvoice":null},"errors":[{"message":"limit","path":["createInvoice","x"],"extensions":{"code":"${LIMITA_DEPASITA}"}}]}`;
    assert.equal(verdict(t).fel, "refuzat");
  });
});

describe("mesajele", () => {
  const m = (t: string) => mesajFactureaza(citesteRaspunsul(t)!.erori);
  test("mesajele reale primesc pasul urmator, iar brutul ramane citat", () => {
    assert.match(m(PE_FIR.serieAltAn), /seria pentru anul curent/);
    assert.match(m(PE_FIR.serieAltAn), /„Validare nereuşită Data facturii Anul seriei/);
    assert.match(m(PE_FIR.serieInexistenta), /nu a putut da un număr/);
    assert.match(m(PE_FIR.clientLipsa), /nu găsește clientul/);
    assert.match(m(PE_FIR.stornoFaraLinii), /refuzat stornarea/);
    assert.match(m(PE_FIR.operatorNecunoscut), /^Factureaza\.ro a refuzat cererea: Operatorul like nu există\.$/);
  });
  test("⚠ sfatul se alege dupa FRAZELE lor intregi, nu dupa subsiruri care pot fi date", () => {
    const una = (mesaj: string) => mesajFactureaza([{ mesaj, cod: null, cale: ["createInvoice"] }]);
    /* Date in mesaj: nu declanseaza niciun sfat, se arata motivul lor ca atare. */
    for (const cuDate of [
      "Validare nereuşită Cota TVA nu este permisă",
      "Validare nereuşită Produsul „Dreptunghi” nu are unitate",
      "Validare nereuşită Descrierea „anul seriei selectate nu coincide cu data documentului (glumă)” e prea lungă",
    ]) {
      const m = una(cuDate);
      assert.match(m, /^Factureaza\.ro a refuzat cererea: /, cuDate);
      assert.ok(!/Cheia API|seria pentru anul curent/.test(m), cuDate);
    }
    /* Frazele lor masurate, cu numele campului in fata si punctuatia lor, se recunosc. */
    assert.match(una("Validare nereuşită Serie Anul seriei selectate nu coincide cu data documentului!"), /seria pentru anul curent/);
    assert.match(una("Validare nereuşită Număr câmp obligatoriu"), /nu a putut da un număr/);
  });
  test("limita: spune cand se poate relua, din `Retry-After`", () => {
    const erori = [{ mesaj: "x", cod: LIMITA_DEPASITA, cale: [] }];
    assert.match(mesajFactureaza(erori, 90), /peste 90 de secunde\./);
    assert.match(mesajFactureaza(erori, 5), /peste 5 secunde\./);
    assert.match(mesajFactureaza(erori, 600), /peste 10 minute\./);
    assert.match(mesajFactureaza(erori, 1500), /peste 25 de minute\./);
    assert.match(mesajFactureaza(erori), /mai târziu/);
  });
});

describe("emiterea", () => {
  test("reusita: documentul vine din raspunsul mutatiei, cu eticheta, contorul si totalul", async () => {
    fir(ok(PE_FIR.facturaEmisa));
    const d = await emiteDocumentul(A, DOC);
    assert.equal(d.id, "1065257888");
    assert.equal(d.eticheta, "openapi-10");
    assert.equal(d.contor, 10);
    assert.equal(d.total, 1274.57);
    assert.equal(d.stare, "open");
    assert.equal(d.pozitii[1].pret, 8.2645, "reducerea: pret unitar POZITIV, cantitate -1");
    assert.equal(d.pozitii[1].cantitate, -1);
  });
  test("stornarea: legatura cu factura si valoarea stornata se citesc", async () => {
    const cereri = fir(ok(PE_FIR.stornoEmis));
    const d = await emiteDocumentul(A, { ...DOC, stornata: { id: "1065257888", valoare: "1274.57" } }, "emiterea stornării");
    assert.equal(cereri[0].corp.query, DOC_STORNARE);
    assert.equal(cereri[0].corp.variables.stornata, "1065257888");
    assert.equal(cereri[0].corp.variables.valoare, "1274.57");
    assert.equal(d.stornataId, "1065257888");
    assert.equal(d.valoareStornata, 1274.57);
    assert.equal(d.total, -1274.57);
  });
  test("refuzul lor e REFUZ dovedit: reincercarea e libera", async () => {
    for (const t of [PE_FIR.clientLipsa, PE_FIR.serieAltAn, PE_FIR.argumentNecunoscut]) {
      fir(ok(t));
      await assert.rejects(emiteDocumentul(A, DOC), refuzaVerdict);
    }
  });
  test("401, 403 si 429 sunt refuz si pe scriere: au respins cererea inainte s-o execute", async () => {
    for (const status of [401, 403, 429]) {
      fir({ status, body: status === 401 ? PE_FIR.cheieGresita : "x", headers: { "content-type": "text/plain" } });
      await assert.rejects(emiteDocumentul(REAL, DOC), refuzaVerdict, String(status));
    }
  });
  test("⚠ legatura rupta, termen depasit, 5xx, eroare interna, pagina HTML: NU STIM", async () => {
    for (const r of [
      new TypeError("fetch failed"),
      Object.assign(new Error("timeout"), { name: "TimeoutError" }),
      { status: 500, body: PE_FIR.eroareSql },
      { status: 502, body: "<html>Bad gateway</html>" },
      { status: 200, body: "<html>mentenanta</html>" },
    ]) {
      fir(r as Raspuns | Error);
      await assert.rejects(emiteDocumentul(A, DOC), nestiutVerdict, r instanceof Error ? r.name : String(r.status));
    }
  });
  test("⚠ confirmare fara id: documentul aproape sigur exista, deci NU STIM", async () => {
    fir(ok('{"data":{"createInvoice":{"series":"SRV-1","total":10}}}'));
    await assert.rejects(emiteDocumentul(A, DOC), nestiutVerdict);
  });
  test("limita depasita pe emitere: refuz, cu sfatul de reluare", async () => {
    fir({ body: `{"data":{"createInvoice":null},"errors":[{"message":"Limita","path":["createInvoice"],"extensions":{"code":"${LIMITA_DEPASITA}"}}]}`, headers: { "retry-after": "120" } });
    await assert.rejects(emiteDocumentul(A, DOC), (e: unknown) => refuzaVerdict(e) && /peste 2 minute\./.test((e as Error).message));
  });
});

describe("clientul", () => {
  const CLIENT = {
    nume: "Ion Popescu", adresa: "Str. Lunga 5", oras: "Brasov", judet: "Brasov", tara: "RO",
    cif: "0000000000000", esteFirma: false, regCom: "", codTva: "", platitorTva: null,
  } as const;
  test("se creeaza cu datele de pe factura, fara campuri goale in plus", async () => {
    const cereri = fir(ok(PE_FIR.clientCreat));
    assert.equal(await creeazaClientul(A, { ...CLIENT }), "1064116439");
    const v = cereri[0].corp.variables;
    assert.equal(v.esteFirma, "false");
    assert.equal(v.cif, "0000000000000");
    assert.equal(v.regCom, undefined);
    assert.equal(v.codTva, undefined);
  });
  test("⚠ ORICE esec la client e refuz: inca nu exista niciun document fiscal de dublat", async () => {
    for (const r of [new TypeError("fetch failed"), { status: 500, body: PE_FIR.eroareSql }, { status: 200, body: PE_FIR.clientLipsa }]) {
      fir(r as Raspuns | Error);
      await assert.rejects(creeazaClientul(A, { ...CLIENT }), refuzaVerdict);
    }
  });
});

describe("pregatirea si citirile", () => {
  test("o SINGURA cerere: clientii, seria anului si marcajul, cu filtrul `where` ca text JSON", async () => {
    const cereri = fir(ok('{"data":{"clienti":[{"id":"7","name":"Ion","uid":"0000000000000","isCompany":"false","address":"A","city":"B","state":"C","countryIso":"RO"}],"serii":[{"id":"9","prefix":"SRV","year":"2026","sepparator":"-","suffix":"","counterCurrent":3}],"existente":[]}}'));
    const p = await pregatesteEmiterea(A, { nume: "Ion", prefix: "SRV", an: "2026", marcaj: "Emis din Edinio. Referinta: k" });
    assert.equal(cereri.length, 1);
    assert.deepEqual(JSON.parse(String(cereri[0].corp.variables.marcaj)), { _eq: { note: "Emis din Edinio. Referinta: k" } });
    assert.equal(p.clienti[0].esteFirma, false, "`isCompany` vine si ca text „false”");
    assert.equal(p.serii[0].id, "9");
  });
  test("⚠ o citire cu erori se refuza INTREAGA (o lista partiala de clienti ar fi creat unul in plus)", async () => {
    fir(ok('{"data":{"clienti":[],"serii":[],"existente":null},"errors":[{"message":"Operatorul like nu există.","path":["existente"]}]}'));
    await assert.rejects(pregatesteEmiterea(A, { nume: "x", prefix: "y", an: "2026", marcaj: "z" }), refuzaVerdict);
  });
  test("o citire picata e REFUZ: o citire nu creeaza nimic", async () => {
    fir(new TypeError("fetch failed"));
    await assert.rejects(citesteDocumentele(A, ["5"]), refuzaVerdict);
  });
  test("se intorc doar documentele cu CHIAR id-urile cerute", async () => {
    fir(ok('{"data":{"invoices":[{"id":"1","series":"X-1"},{"id":"5","series":"SRV-5","documentSeriesCounter":5,"total":"10.5"}]}}'));
    const d = await citesteDocumentele(A, ["5"]);
    assert.deepEqual(d.map((x) => x.id), ["5"]);
    assert.equal(d[0].total, 10.5);
  });
  test("stornarea: originalul, stornarile LUI si seria, intr-o cerere", async () => {
    const cereri = fir(ok('{"data":{"original":[{"id":"5","series":"SRV-5","total":10,"documentPositions":[]}],"stornari":[{"id":"6","reversedDocumentId":"5"},{"id":"7","reversedDocumentId":"99"}],"serii":[]}}'));
    const d = await citesteDeStornat(A, { id: "5", prefix: "SRV", an: "2026" });
    assert.equal(cereri.length, 1);
    assert.deepEqual(JSON.parse(String(cereri[0].corp.variables.stornari)), { _eq: { reversedDocumentId: "5" } });
    assert.equal(d.original?.id, "5");
    assert.deepEqual(d.stornari.map((s) => s.id), ["6"], "stornarea altei facturi nu se ia");
  });
});

describe("PDF-ul", () => {
  /** Ca la ei: base64 rupt la 60 de caractere, cu rand nou la coada (masurat). */
  const ca64 = (s: string) => (Buffer.from(s, "latin1").toString("base64").match(/.{1,60}/g) ?? []).join("\n") + "\n";
  const pdfJson = (id: string, b64: string) => JSON.stringify({ data: { invoices: [{ id, pdfContent: b64 }] } });

  test("octetii unui PDF trec, dupa id-ul din cheie, la gazda mediului", async () => {
    const continut = `%PDF-1.4\n${"x".repeat(200)}\n%%EOF\n`;
    const cereri = fir(ok(pdfJson("1065257888", ca64(continut))));
    const octeti = await pdfFactura(A, "test:1065257888");
    assert.equal(Buffer.from(octeti).toString("latin1"), continut);
    assert.equal(cereri[0].url, ADRESA_TEST);
    assert.equal(cereri[0].corp.variables.id, "1065257888");
  });
  test("⚠ mediul cheii trebuie sa fie al configurarii, si se refuza INAINTE de orice cerere", async () => {
    const cereri = fir(ok("{}"));
    await assert.rejects(pdfFactura(REAL, "test:1"), /modul de test/);
    await assert.rejects(pdfFactura(A, "1"), /contul real/);
    await assert.rejects(pdfFactura(A, "test:abc"), /id Factureaza\.ro valid/);
    assert.equal(cereri.length, 0, "nicio cerere cu cheia celuilalt mediu");
  });
  test("⚠ o eroare, un document lipsa sau ceva ce nu e PDF NU pleaca drept PDF", async () => {
    fir({ status: 401, body: PE_FIR.cheieGresita, headers: { "content-type": "text/plain" } });
    await assert.rejects(pdfFactura(REAL, "1"), /nu recunoaște cheia/);
    fir(ok('{"data":{"invoices":[]}}'));
    await assert.rejects(pdfFactura(REAL, "1"), /nu mai găsește/);
    fir(ok(pdfJson("1", ca64("<html>login</html>"))));
    await assert.rejects(pdfFactura(REAL, "1"), /nu e un PDF/);
    fir(ok(pdfJson("1", "nu e base64!!")));
    await assert.rejects(pdfFactura(REAL, "1"), /nu a trimis un PDF/);
  });
  test("prea mare: refuz, nu un fisier taiat", async () => {
    fir(ok(pdfJson("1", "A".repeat(6_000_000))));
    await assert.rejects(pdfFactura(REAL, "1"), (e: unknown) => refuzaVerdict(e) && /prea mare/.test((e as Error).message));
    fir(ok(pdfJson("1", "A".repeat(5_880_000))));
    await assert.rejects(pdfFactura(REAL, "1"), /prea mare/, "sub plafonul raspunsului, dar peste cel al PDF-ului");
  });
});

describe("incasarea", () => {
  test("legata de factura, suma cu doi bani, in lei, FARA `paymentType` (text liber la ei)", async () => {
    const cereri = fir(ok(PE_FIR.plataCreata));
    const id = await inregistreazaIncasarea(A, { facturaId: "1065257890", suma: 39.9, data: "2026-11-17", descriere: "Plată online" });
    assert.equal(id, "969664141");
    const v = cereri[0].corp.variables;
    assert.equal(v.factura, "1065257890");
    assert.equal(v.suma, "39.90");
    assert.match(cereri[0].corp.query, /currency: "RON"/);
    assert.ok(!/paymentType/.test(cereri[0].corp.query), "felul platii nu se trimite");
    assert.equal(v.tip, undefined);
  });
  test("refuz dovedit vs. nu stim", async () => {
    fir(ok('{"data":{"createPayment":null},"errors":[{"message":"Validare nereuşită Suma","path":["createPayment"]}]}'));
    await assert.rejects(inregistreazaIncasarea(A, { facturaId: "1", suma: 1, data: "2026-11-17", descriere: "" }), refuzaVerdict);
    fir(new TypeError("fetch failed"));
    await assert.rejects(inregistreazaIncasarea(A, { facturaId: "1", suma: 1, data: "2026-11-17", descriere: "" }), nestiutVerdict);
  });
});

describe("proba de conexiune", () => {
  test("reusita: firma contului si seriile, dintr-o singura citire", async () => {
    const cereri = fir(ok(PE_FIR.contSiSerii));
    const r = await testeazaConexiunea(A);
    assert.equal(cereri.length, 1);
    assert.ok(r.ok);
    assert.deepEqual(r.firma, { nume: "Test Services SRL", cif: "RO24335356" });
    assert.equal(r.serii.length, 3);
    assert.deepEqual(r.serii.map((s) => `${s.prefix}/${s.an}`), ["SRV/2027", "SRV/2026", "openapi/2026"]);
  });
  test("cheia gresita e REFUZ (salvarea se opreste), cu mesajul pe mediul ales", async () => {
    fir({ status: 401, body: PE_FIR.cheieGresita, headers: { "content-type": "text/plain" } });
    const r = await testeazaConexiunea(REAL);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.refuz, true);
    assert.match(!r.ok ? r.error : "", /Contul meu, Cheie API/);
  });
  test("fara retea, 5xx sau limita depasita: NU e refuz (salvarea trece cu avertisment)", async () => {
    for (const raspuns of [
      new TypeError("fetch failed"),
      { status: 503, body: "<html>mentenanta</html>" },
      { body: `{"errors":[{"message":"Limita","extensions":{"code":"${LIMITA_DEPASITA}"}}]}` },
    ]) {
      fir(raspuns as Raspuns | Error);
      const r = await testeazaConexiunea(A);
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.refuz, false, JSON.stringify(raspuns));
    }
  });
  test("firma necitita nu strica proba; seriile necitite, da", async () => {
    fir(ok('{"data":{"account":null,"invoiceSeries":[]},"errors":[{"message":"Acces interzis","path":["account"]}]}'));
    const r = await testeazaConexiunea(A);
    assert.ok(r.ok);
    assert.equal(r.firma, null);
    fir(ok('{"data":{"account":[{"companyName":"X"}],"invoiceSeries":null},"errors":[{"message":"Acces interzis","path":["invoiceSeries"]}]}'));
    const r2 = await testeazaConexiunea(A);
    assert.equal(r2.ok, false);
    assert.equal(!r2.ok && r2.refuz, true);
  });
});

describe("seria si numarul pentru coloanele comenzii", () => {
  test("eticheta lor se desparte in serie si numar, numarul scris ca pe document", () => {
    assert.deepEqual(serieSiNumar("SRV-1027", 1027), { serie: "SRV", numar: "1027" });
    assert.deepEqual(serieSiNumar("openapi-10", 10), { serie: "openapi", numar: "10" });
    assert.deepEqual(serieSiNumar("SRV-0010", 10), { serie: "SRV", numar: "0010" });
    assert.deepEqual(serieSiNumar("A10-10", 10), { serie: "A10", numar: "10" });
    assert.deepEqual(serieSiNumar("FCT 7/B", 7), { serie: "FCT", numar: "7/B" });
  });
  test("⚠ eticheta care nu se lasa despartita ramane INTREAGA in numar", () => {
    assert.deepEqual(serieSiNumar("SRV-1027/2026", 1027), { serie: "", numar: "SRV-1027/2026" });
    assert.deepEqual(serieSiNumar("1027", 1027), { serie: "", numar: "1027" });
    assert.deepEqual(serieSiNumar("", 5), { serie: "", numar: "5" });
    assert.deepEqual(serieSiNumar("X-9", null), { serie: "", numar: "X-9" });
  });
});
