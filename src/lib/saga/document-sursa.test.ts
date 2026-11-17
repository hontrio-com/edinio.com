import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cheiaDocumentului, dataDocumentului, documenteleComenzii, emitereaDocumentului, facturiInlocuiteFaraStornare,
  numarComplet, toateDocumentele, ziValida, ziuaInRomania, ziuaUtc,
  type EmitereInRegistru, type IncercareInJurnal, type RandCuDocumente,
} from "./document-sursa";

/*
 * Documentele comenzii, la toate cele sase case. Ce conteaza: ce pleaca in SAGA e exact ce s-a emis
 * (serie, numar, casa, ziua de pe document), de la TOATE casele; ce NU trebuie sa plece (document de
 * test, numar necitit, numarul de rezerva al unei stornari SmartBill) nu pleaca si spune de ce.
 */

const prima = (o: RandCuDocumente) => documenteleComenzii(o).perechi[0];

describe("factura fiecarei case", () => {
  test("SmartBill, Oblio, fGO: dupa NUMAR", () => {
    for (const [casa, rand] of [
      ["smartbill", { smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001", smartbill_invoice_url: "https://ext.smartbill.ro/x" }],
      ["oblio", { oblio_invoice_series: "OB", oblio_invoice_number: "12", oblio_invoice_link: "https://www.oblio.eu/x" }],
      ["fgo", { fgo_invoice_series: "FG", fgo_invoice_number: "7", fgo_invoice_link: "https://www.fgo.ro/x" }],
    ] as const) {
      const p = prima(rand as RandCuDocumente);
      assert.equal(p.casa, casa);
      assert.equal(p.factura.blocaj, null, casa);
      assert.equal(p.factura.tip, "factura");
      const r = rand as Record<string, string>;
      assert.equal(p.factura.numarComplet, `${r[`${casa}_invoice_series`]}${r[`${casa}_invoice_number`]}`);
      assert.equal(p.storno, null);
    }
  });

  test("Facturis, Factureaza.ro, easybill: CHEIA spune ca exista, NUMARUL o lasa sa plece", () => {
    for (const casa of ["facturis", "factureaza", "easybill"] as const) {
      const cuNumar = prima({ [`${casa}_invoice_key`]: "991", [`${casa}_invoice_series`]: "EDN", [`${casa}_invoice_number`]: "141" } as RandCuDocumente);
      assert.equal(cuNumar.casa, casa);
      assert.equal(cuNumar.factura.blocaj, null, `${casa}: cu numar trebuie sa poata pleca`);
      assert.equal(cuNumar.factura.numarComplet, "EDN141");
      assert.equal(cuNumar.factura.cheieCasa, "991");

      const faraNumar = prima({ [`${casa}_invoice_key`]: "991" } as RandCuDocumente);
      assert.equal(faraNumar.casa, casa, `${casa}: cheia singura inseamna ca factura EXISTA`);
      assert.match(faraNumar.factura.blocaj ?? "", /nu s-a citit/, `${casa}: fara numar nu pleaca, si se spune de ce`);
      assert.equal(faraNumar.factura.motivBlocaj, "necitit");
    }
  });

  test("numarul fara cheie, la casele cu cheie, nu e o factura", () => {
    assert.deepEqual(documenteleComenzii({ facturis_invoice_number: "141", facturis_invoice_series: "EDN" }).perechi, []);
  });

  test("fara factura la nicio casa: nimic; un sir doar cu spatii nu e factura", () => {
    assert.deepEqual(documenteleComenzii({}), { perechi: [], nestornate: [] });
    assert.deepEqual(documenteleComenzii(null).perechi, []);
    assert.deepEqual(documenteleComenzii({ smartbill_invoice_number: "   " }).perechi, []);
  });
});

describe("⚠⚠ toate casele, nu doar prima", () => {
  test("stornata la o casa si reemisa la ALTA: pleaca perechea veche SI factura vie", () => {
    const d = documenteleComenzii({
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
      smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
      oblio_invoice_series: "OB", oblio_invoice_number: "7",
    });
    assert.deepEqual(d.perechi.map((p) => [p.casa, p.factura.numarComplet, p.storno?.numarComplet ?? null]), [
      ["smartbill", "EDN0001", "EDN0002"],
      ["oblio", "OB7", null],
    ]);
    assert.deepEqual(d.nestornate, ["oblio"], "factura vie e cea de la Oblio");
    assert.deepEqual(toateDocumentele(d).map((x) => x.eticheta), [
      "Factura SmartBill EDN0001", "Stornarea SmartBill EDN0002", "Factura Oblio OB7",
    ], "fiecare factura inaintea stornarii ei");
  });

  test("doua facturi nestornate la doua case: amandoua sunt emise, amandoua se vad", () => {
    const d = documenteleComenzii({
      oblio_invoice_series: "OB", oblio_invoice_number: "1",
      easybill_invoice_key: "5", easybill_invoice_number: "3",
    });
    assert.deepEqual(d.nestornate, ["oblio", "easybill"]);
  });
});

describe("documentele de test nu pleaca", () => {
  test("⚠ fGO emis in modul de testare: factura SI stornarea ei raman pe loc", () => {
    const p = prima({
      fgo_invoice_series: "FG", fgo_invoice_number: "7", fgo_invoice_link: "https://testuat.fgo.ro/factura/7",
      fgo_storno_series: "FG", fgo_storno_number: "8",
    });
    assert.match(p.factura.blocaj ?? "", /testare/);
    assert.equal(p.factura.motivBlocaj, "test");
    assert.equal(p.storno?.motivBlocaj, "test");
  });

  test("Factureaza.ro din sandbox (cheia `test:`) nu pleaca", () => {
    const p = prima({ factureaza_invoice_key: "test:44", factureaza_invoice_series: "F", factureaza_invoice_number: "1" });
    assert.equal(p.factura.motivBlocaj, "test");
  });

  test("fGO de productie pleaca", () => {
    assert.equal(prima({ fgo_invoice_series: "FG", fgo_invoice_number: "7", fgo_invoice_link: "https://www.fgo.ro/factura/7" }).factura.blocaj, null);
  });
});

describe("stornarea", () => {
  test("stornarea casei care a emis factura, cu numarul ei", () => {
    const p = prima({
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
      smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
    });
    assert.equal(p.storno?.tip, "storno");
    assert.equal(p.storno?.numarComplet, "EDN0002");
    assert.equal(p.storno?.blocaj, null);
  });

  test("⚠ REZERVA SMARTBILL: stornarea care poarta numarul FACTURII nu pleaca (ar dubla numarul in SAGA)", () => {
    const p = prima({
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
      smartbill_storno_series: "EDN", smartbill_storno_number: "0001",
    });
    assert.equal(p.storno?.motivBlocaj, "necunoscut");
    assert.equal(p.factura.blocaj, null, "factura pleaca in continuare");
  });

  test("acelasi NUMAR in alta serie e o stornare legitima, nu rezerva", () => {
    assert.equal(prima({
      oblio_invoice_series: "FCT", oblio_invoice_number: "0001",
      oblio_storno_series: "STO", oblio_storno_number: "0001",
    }).storno?.blocaj, null);
  });

  test("stornarea cu cheie si fara numar exista, dar nu pleaca inca", () => {
    const p = prima({
      facturis_invoice_key: "1", facturis_invoice_series: "EDN", facturis_invoice_number: "5",
      facturis_storno_key: "2",
    });
    assert.equal(p.storno?.motivBlocaj, "necitit");
  });

  test("stornarea altei case nu se lipeste de factura", () => {
    assert.equal(prima({
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
      oblio_storno_series: "OB", oblio_storno_number: "2",
    }).storno, null);
  });
});

describe("cheia documentului", () => {
  test("stabila, cu seria si numarul DESPARTITE", () => {
    assert.equal(cheiaDocumentului("factura", "smartbill", "EDN", "0001"), "factura:smartbill:EDN#0001");
    assert.notEqual(cheiaDocumentului("factura", "smartbill", "EDN1", "23"), cheiaDocumentului("factura", "smartbill", "EDN12", "3"));
  });

  test("tipul si casa fac parte din cheie", () => {
    assert.notEqual(cheiaDocumentului("factura", "oblio", "A", "1"), cheiaDocumentului("storno", "oblio", "A", "1"));
    assert.notEqual(cheiaDocumentului("factura", "oblio", "A", "1"), cheiaDocumentului("factura", "fgo", "A", "1"));
  });

  test("spatiile nu schimba documentul", () => {
    assert.equal(numarComplet("EDN ", " 0001"), "EDN0001");
    assert.equal(cheiaDocumentului("factura", "fgo", " A B", "1 "), cheiaDocumentului("factura", "fgo", "AB", "1"));
  });
});

describe("ziua documentului", () => {
  test("ziua Romaniei si ziua UTC, iarna si vara", () => {
    assert.equal(ziuaInRomania("2026-10-31T23:30:00Z"), "2026-11-01");
    assert.equal(ziuaInRomania("2026-07-14T21:30:00Z"), "2026-07-15");
    assert.equal(ziuaUtc("2026-10-31T23:30:00Z"), "2026-10-31");
    assert.equal(ziuaInRomania("nu e o data"), null);
  });

  test("o zi valida e chiar o zi din calendar", () => {
    assert.equal(ziValida("2026-11-17"), "2026-11-17");
    assert.equal(ziValida("2026-02-30"), null);
    assert.equal(ziValida("17.11.2026"), null);
    assert.equal(ziValida(20261117), null);
  });

  const sb = prima({ smartbill_invoice_series: "EDN", smartbill_invoice_number: "0002" });
  const fr = prima({ facturis_invoice_key: "777", facturis_invoice_series: "EDN", facturis_invoice_number: "9" });
  /* 31 octombrie, 23:30 UTC = 1 noiembrie, 01:30 la noi. */
  const NOAPTEA = "2026-10-31T23:30:00Z";

  test("⚠ SmartBill si Oblio isi dateaza documentele cu ziua UTC: aceea intra in SAGA", () => {
    assert.equal(dataDocumentului(sb.factura, [{ fel: "factura", furnizor: "smartbill", referinta: "0002", creatLa: NOAPTEA }]), "2026-10-31");
    const ob = prima({ oblio_invoice_series: "OB", oblio_invoice_number: "4" });
    assert.equal(dataDocumentului(ob.factura, [{ fel: "factura", furnizor: "oblio", referinta: "4", creatLa: NOAPTEA }]), "2026-10-31");
  });

  test("celelalte case: ziua Romaniei", () => {
    assert.equal(dataDocumentului(fr.factura, [{ fel: "factura", furnizor: "facturis", referinta: "777", creatLa: NOAPTEA }]), "2026-11-01");
  });

  test("⚠ `detalii.data` (contractul C1) bate orice socoteala, cand e o zi valida", () => {
    assert.equal(dataDocumentului(sb.factura, [{ fel: "factura", furnizor: "smartbill", referinta: "0002", creatLa: NOAPTEA, detalii: { data: "2026-11-01" } }]), "2026-11-01");
    assert.equal(dataDocumentului(fr.factura, [{ fel: "factura", furnizor: "facturis", referinta: "777", creatLa: NOAPTEA, detalii: { data: "2026-10-30" } }]), "2026-10-30");
    assert.equal(
      dataDocumentului(sb.factura, [{ fel: "factura", furnizor: "smartbill", referinta: "0002", creatLa: NOAPTEA, detalii: { data: "2026-02-30" } }]),
      "2026-10-31", "o data nevalida nu se crede",
    );
  });

  test("⚠⚠ fara randul CHIAR al documentului: `null`, nu randul cel mai nou al casei", () => {
    const altele: EmitereInRegistru[] = [
      { fel: "factura", furnizor: "smartbill", referinta: "0001", creatLa: "2026-11-01T08:00:00Z" },
      { fel: "factura", furnizor: "smartbill", referinta: null, creatLa: "2026-11-05T08:00:00Z" },
      { fel: "storno", furnizor: "smartbill", referinta: "0002", creatLa: "2026-11-06T08:00:00Z" },
      { fel: "factura", furnizor: "oblio", referinta: "0002", creatLa: "2026-11-07T08:00:00Z" },
    ];
    assert.equal(emitereaDocumentului(sb.factura, altele), null);
    assert.equal(dataDocumentului(sb.factura, altele), null);
    assert.equal(dataDocumentului(sb.factura, []), null);
  });

  test("dintre randurile potrivite, cel mai nou; la casele cu cheie, referinta e cheia", () => {
    const e = emitereaDocumentului(fr.factura, [
      { fel: "factura", furnizor: "facturis", referinta: "777", creatLa: "2026-11-02T10:00:00Z" },
      { fel: "factura", furnizor: "facturis", referinta: "555", creatLa: "2026-11-04T10:00:00Z" },
    ]);
    assert.equal(e?.referinta, "777");
  });
});

describe("⚠⚠ facturile inlocuite fara stornare in SAGA", () => {
  /* Pe comanda: factura noua EDN0003 (SmartBill). Inainte: EDN0001, stornata prin EDN0002, inlocuita. */
  const vii = documenteleComenzii({ smartbill_invoice_series: "EDN", smartbill_invoice_number: "0003" }).perechi;
  const jurnal = (randuri: [string, "factura" | "storno", string, IncercareInJurnal["stare"]][]): IncercareInJurnal[] =>
    randuri.map(([numar, tip, serie, stare]) => ({
      cheie: cheiaDocumentului(tip, "smartbill", serie, numar), casa: "smartbill", tip, serie, numar, stare,
    }));
  const stornataInRegistru: EmitereInRegistru[] = [{ fel: "storno", furnizor: "smartbill", referinta: "0002", creatLa: "2026-11-03T08:00:00Z" }];

  test("factura veche in SAGA, stornarea ei nu: se semnaleaza", () => {
    const r = facturiInlocuiteFaraStornare(vii, jurnal([["0001", "factura", "EDN", "importat"]]), stornataInRegistru);
    assert.deepEqual(r.map((x) => x.eticheta), ["Factura SmartBill EDN0001"]);
  });

  test("si cand factura veche e doar „nelamurita” in SAGA", () => {
    assert.equal(facturiInlocuiteFaraStornare(vii, jurnal([["0001", "factura", "EDN", "necunoscut"]]), stornataInRegistru).length, 1);
  });

  test("stornarea veche intrata in SAGA o inchide", () => {
    assert.deepEqual(facturiInlocuiteFaraStornare(vii, jurnal([
      ["0002", "storno", "EDN", "importat"], ["0001", "factura", "EDN", "importat"],
    ]), stornataInRegistru), []);
  });

  test("o stornare doar refuzata sau nelamurita NU o inchide", () => {
    assert.equal(facturiInlocuiteFaraStornare(vii, jurnal([
      ["0002", "storno", "EDN", "necunoscut"], ["0001", "factura", "EDN", "importat"],
    ]), stornataInRegistru).length, 1);
  });

  test("factura vie nu e „inlocuita”, iar o factura neintrata in SAGA nu cere nimic", () => {
    assert.deepEqual(facturiInlocuiteFaraStornare(vii, jurnal([["0003", "factura", "EDN", "importat"]]), stornataInRegistru), []);
    assert.deepEqual(facturiInlocuiteFaraStornare(vii, jurnal([["0001", "factura", "EDN", "respins"]]), stornataInRegistru), []);
  });

  test("fara stornare reusita in registru nu se semnaleaza (factura n-a fost stornata prin Edinio)", () => {
    assert.deepEqual(facturiInlocuiteFaraStornare(vii, jurnal([["0001", "factura", "EDN", "importat"]]), []), []);
  });

  test("jurnalul vine de la nou la vechi: conteaza ultima incercare a fiecarui document", () => {
    assert.equal(facturiInlocuiteFaraStornare(vii, jurnal([
      ["0002", "storno", "EDN", "importat"], ["0002", "storno", "EDN", "refuzat"], ["0001", "factura", "EDN", "importat"],
    ]), stornataInRegistru).length, 0);
  });
});
