import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  INCERCARI_AUTOMATE, ZILE_FEREASTRA, alegeComenzile, candidatiDePlan, decizieReemitere, mesajPentruRegistru,
  motivOprireLot, notaTrimitereAutomata, trebuieProbaInainte, tvaPeCasa, verdictProba, MESAJ_CHEIE_NESALVATA,
  type CandidatPlan, type Oprire,
} from "./reguli";
import { cheiaDocumentului, documenteleComenzii, type EmitereInRegistru, type RandCuDocumente } from "./document-sursa";
import { STARI_EXPORT, mesajStornariLipsa, type StareExport } from "./config";

/*
 * Regulile de hotarare ale exportului SAGA, pe valori. Ce conteaza:
 *   1. garda de reemitere opreste exact cand o stornare s-ar pierde si o miscare din Edinio o poate
 *      trimite, si NU e niciodata o fundatura;
 *   2. planul cronului aplica regula „factura de dinainte de pornire" (citita fara fereastra);
 *   3. ce se spune omului si ce se scrie in registru (fara textul SAGA).
 */

const FACTURA = cheiaDocumentului("factura", "smartbill", "EDN", "0001");
const STORNO = cheiaDocumentului("storno", "smartbill", "EDN", "0002");

const stornata = documenteleComenzii({
  smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
  smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
}).perechi;

const ultima = (stari: Record<string, StareExport>) => new Map(Object.entries(stari).map(([k, stare]) => [k, { stare }]));

const MESAJ_CONTRACT = "Stornarea facturii EDN0001 n-a plecat încă în SAGA. Trimite-o din panoul SAGA al comenzii, apoi emite factura nouă.";

describe("⚠⚠ garda de reemitere (contractul C2)", () => {
  test("factura in SAGA, stornarea netrimisa: NU, cu mesajul din contract", () => {
    for (const intrata of ["importat", "incarcat", "avertismente"] as const) {
      assert.deepEqual(
        decizieReemitere({ perechi: stornata, ultima: ultima({ [FACTURA]: intrata }), trimiteStornari: true }),
        { ok: false, mesaj: MESAJ_CONTRACT },
        intrata,
      );
    }
  });

  test("stornarea REFUZATA (cheia) se poate retrimite: tot NU", () => {
    assert.deepEqual(
      decizieReemitere({ perechi: stornata, ultima: ultima({ [FACTURA]: "importat", [STORNO]: "refuzat" }), trimiteStornari: true }),
      { ok: false, mesaj: MESAJ_CONTRACT },
    );
  });

  test("factura NELAMURITA si stornarea netrimisa: NU, cu drumul de iesire (verifica, apoi trimite sau deblocheaza)", () => {
    const d = decizieReemitere({ perechi: stornata, ultima: ultima({ [FACTURA]: "necunoscut" }), trimiteStornari: true });
    assert.equal(d.ok, false);
    if (d.ok) return;
    assert.match(d.mesaj, /nu știm dacă a intrat/);
    assert.match(d.mesaj, /trimite stornarea din panoul SAGA/);
    assert.match(d.mesaj, /deblochează operația facturii/);
  });

  test("stornarea intrata in SAGA: DA", () => {
    for (const intrata of ["importat", "incarcat", "avertismente"] as const) {
      assert.deepEqual(decizieReemitere({ perechi: stornata, ultima: ultima({ [FACTURA]: "importat", [STORNO]: intrata }), trimiteStornari: true }), { ok: true });
    }
  });

  test("factura care n-a intrat in SAGA: DA (nimic de pierdut)", () => {
    for (const stare of [undefined, "respins", "refuzat", "nepregatit"] as const) {
      const u = stare ? ultima({ [FACTURA]: stare }) : ultima({});
      assert.deepEqual(decizieReemitere({ perechi: stornata, ultima: u, trimiteStornari: true }), { ok: true }, String(stare));
    }
  });

  test("⚠ NICIODATA FUNDATURA: stornarea nelamurita, respinsa sau nepregatita e lasata omului: DA", () => {
    for (const stare of ["necunoscut", "respins", "nepregatit"] as const) {
      assert.deepEqual(
        decizieReemitere({ perechi: stornata, ultima: ultima({ [FACTURA]: "importat", [STORNO]: stare }), trimiteStornari: true }),
        { ok: true }, stare,
      );
    }
  });

  test("⚠ NICIODATA FUNDATURA: stornarea care nu POATE pleca (numarul de rezerva SmartBill): DA", () => {
    const rezerva = documenteleComenzii({
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
      smartbill_storno_series: "EDN", smartbill_storno_number: "0001",
    }).perechi;
    assert.equal(rezerva[0].storno?.motivBlocaj, "necunoscut");
    assert.deepEqual(decizieReemitere({ perechi: rezerva, ultima: ultima({ [FACTURA]: "importat" }), trimiteStornari: true }), { ok: true });
  });

  test("stornarea cu numarul necitit: NU, si spune cum se citeste", () => {
    const facturis = documenteleComenzii({
      facturis_invoice_key: "1", facturis_invoice_series: "EDN", facturis_invoice_number: "0001", facturis_storno_key: "2",
    }).perechi;
    const d = decizieReemitere({
      perechi: facturis, ultima: ultima({ [cheiaDocumentului("factura", "facturis", "EDN", "0001")]: "importat" }), trimiteStornari: true,
    });
    assert.equal(d.ok, false);
    if (!d.ok) assert.match(d.mesaj, /Citește-l din cardul Facturare/);
  });

  test("stornarile oprite din setari (le introduce contabilul): DA", () => {
    assert.deepEqual(decizieReemitere({ perechi: stornata, ultima: ultima({ [FACTURA]: "importat" }), trimiteStornari: false }), { ok: true });
  });

  test("o factura VIE a altei case, nestornata, nu se pierde la reemitere: DA", () => {
    const vie = documenteleComenzii({ oblio_invoice_series: "OB", oblio_invoice_number: "7" }).perechi;
    assert.deepEqual(decizieReemitere({
      perechi: vie, ultima: ultima({ [cheiaDocumentului("factura", "oblio", "OB", "7")]: "importat" }), trimiteStornari: true,
    }), { ok: true });
  });

  test("o pereche buna nu acopera alta pereche care pierde o stornare", () => {
    const doua = documenteleComenzii({
      oblio_invoice_series: "OB", oblio_invoice_number: "7", oblio_storno_series: "OB", oblio_storno_number: "8",
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001",
      smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
    }).perechi;
    const d = decizieReemitere({
      perechi: doua,
      ultima: ultima({
        [cheiaDocumentului("factura", "oblio", "OB", "7")]: "importat", [cheiaDocumentului("storno", "oblio", "OB", "8")]: "importat",
        [FACTURA]: "importat",
      }),
      trimiteStornari: true,
    });
    assert.deepEqual(d, { ok: false, mesaj: MESAJ_CONTRACT });
  });

  test("fara documente: DA", () => {
    assert.deepEqual(decizieReemitere({ perechi: [], ultima: ultima({}), trimiteStornari: true }), { ok: true });
  });
});

describe("⚠ planul cronului", () => {
  const DE_LA = "2026-11-10T00:00:00Z";
  const comanda = (id: string, extra: RandCuDocumente) => ({ id, ...extra }) as RandCuDocumente & { id: string };
  const em = (fel: string, referinta: string, creatLa: string): EmitereInRegistru => ({ fel, furnizor: "smartbill", referinta, creatLa });

  test("⚠ stornarea unei facturi de DINAINTE de pornire pleaca singura (factura citita FARA fereastra)", () => {
    const c = comanda("o1", {
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001", smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
    });
    const candidati = candidatiDePlan({
      comenzi: [c],
      emiteriFereastra: new Map([["o1", [em("storno", "0002", "2026-11-12T08:00:00Z")]]]),
      emiteriFacturi: new Map([["o1", [em("factura", "0001", "2026-10-01T08:00:00Z")]]]),
      deLa: DE_LA,
      trimiteStornari: true,
    });
    assert.deepEqual(candidati.map((x) => [x.cheie, x.facturaDinainte]), [[STORNO, true]]);
    assert.deepEqual(alegeComenzile(candidati, new Map(), new Map(), 10), ["o1"]);

    /* Fara randul facturii (citirea fara fereastra lipsa), regula nu s-ar fi aplicat: stornarea astepta degeaba. */
    const orbi = candidatiDePlan({
      comenzi: [c], emiteriFereastra: new Map([["o1", [em("storno", "0002", "2026-11-12T08:00:00Z")]]]),
      emiteriFacturi: new Map(), deLa: DE_LA, trimiteStornari: true,
    });
    assert.deepEqual(alegeComenzile(orbi, new Map(), new Map(), 10), []);
  });

  test("stornarea unei facturi de DUPA pornire asteapta factura: intra numai cu ea", () => {
    const c = comanda("o1", {
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001", smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
    });
    const fereastra = [em("factura", "0001", "2026-11-11T08:00:00Z"), em("storno", "0002", "2026-11-12T08:00:00Z")];
    const candidati = candidatiDePlan({
      comenzi: [c], emiteriFereastra: new Map([["o1", fereastra]]), emiteriFacturi: new Map(), deLa: DE_LA, trimiteStornari: true,
    });
    assert.deepEqual(alegeComenzile(candidati, new Map(), new Map(), 10), ["o1"], "factura e candidata, deci comanda intra");
    /* Factura oprita pentru cron (respinsa): stornarea singura nu mai ocupa un loc. */
    assert.deepEqual(alegeComenzile(candidati, ultima({ [FACTURA]: "respins" }), new Map(), 10), []);
    /* Factura intrata: stornarea pleaca. */
    const doarStornarea = candidati.filter((x) => x.cheie === STORNO);
    assert.deepEqual(alegeComenzile(doarStornarea, ultima({ [FACTURA]: "importat" }), new Map(), 10), ["o1"]);
  });

  test("documentele emise inainte de pornire (in fereastra) nu sunt candidate", () => {
    const c = comanda("o1", { smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001" });
    assert.deepEqual(candidatiDePlan({
      comenzi: [c], emiteriFereastra: new Map([["o1", [em("factura", "0001", "2026-11-09T08:00:00Z")]]]),
      emiteriFacturi: new Map(), deLa: DE_LA, trimiteStornari: true,
    }), []);
  });

  test("stornarile oprite din setari nu sunt candidate; documentele blocate nici ele", () => {
    const c = comanda("o1", {
      smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001", smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
    });
    const fereastra = new Map([["o1", [em("factura", "0001", "2026-11-11T08:00:00Z"), em("storno", "0002", "2026-11-12T08:00:00Z")]]]);
    assert.deepEqual(
      candidatiDePlan({ comenzi: [c], emiteriFereastra: fereastra, emiteriFacturi: new Map(), deLa: DE_LA, trimiteStornari: false }).map((x) => x.cheie),
      [FACTURA],
    );
    const test = comanda("o2", { fgo_invoice_series: "FG", fgo_invoice_number: "1", fgo_invoice_link: "https://testuat.fgo.ro/x" });
    assert.deepEqual(candidatiDePlan({
      comenzi: [test], emiteriFereastra: new Map([["o2", [{ fel: "factura", furnizor: "fgo", referinta: "1", creatLa: "2026-11-11T08:00:00Z" }]]]),
      emiteriFacturi: new Map(), deLa: DE_LA, trimiteStornari: true,
    }), []);
  });

  test("ordinea emiterii, o comanda o data, plafonul; oprite si incercate de prea multe ori raman pe loc", () => {
    const cand = (orderId: string, cheie: string, emisLa: number): CandidatPlan => ({ orderId, cheie, emisLa, facturaCheie: null, facturaDinainte: false });
    const candidati = [cand("c", "k3", 3), cand("a", "k1", 1), cand("b", "k2", 2), cand("a", "k4", 4)];
    assert.deepEqual(alegeComenzile(candidati, new Map(), new Map(), 10), ["a", "b", "c"]);
    assert.deepEqual(alegeComenzile(candidati, new Map(), new Map(), 2), ["a", "b"]);
    assert.deepEqual(alegeComenzile(candidati, ultima({ k1: "necunoscut", k4: "respins" }), new Map(), 10), ["b", "c"]);
    assert.deepEqual(alegeComenzile(candidati, new Map(), new Map([["k2", INCERCARI_AUTOMATE]]), 10), ["a", "c"]);
    assert.deepEqual(alegeComenzile(candidati, new Map(), new Map([["k2", INCERCARI_AUTOMATE - 1]]), 10), ["a", "b", "c"]);
  });
});

describe("cronul probeaza intai, panoul spune ce nu mai pleaca singur", () => {
  test("⚠ proba inainte dupa REFUZ si dupa NELAMURIT (o pana SAGA nu blocheaza cate un document pe trecere)", () => {
    assert.deepEqual(STARI_EXPORT.filter((s) => trebuieProbaInainte(s)).sort(), ["necunoscut", "refuzat"]);
    assert.equal(trebuieProbaInainte(null), false);
    assert.equal(trebuieProbaInainte(undefined), false);
  });

  const ACUM = Date.parse("2026-11-17T12:00:00Z");
  const zi = 86_400_000;
  test("⚠ fereastra de zece zile nu e tacuta: documentul mai vechi spune ca nu mai pleaca singur", () => {
    const vechi = notaTrimitereAutomata({ trimitereAutomata: true, deLa: "2026-10-01T00:00:00Z", emisLa: new Date(ACUM - (ZILE_FEREASTRA + 1) * zi).toISOString(), acum: ACUM });
    assert.match(vechi ?? "", /mai mult de 10 zile/);
    assert.equal(notaTrimitereAutomata({ trimitereAutomata: true, deLa: "2026-10-01T00:00:00Z", emisLa: new Date(ACUM - (ZILE_FEREASTRA - 1) * zi).toISOString(), acum: ACUM }), null);
  });

  test("documentul de dinainte de pornire spune de ce nu pleaca singur; fara trimitere automata, nimic", () => {
    assert.match(notaTrimitereAutomata({ trimitereAutomata: true, deLa: "2026-11-16T00:00:00Z", emisLa: "2026-11-15T10:00:00Z", acum: ACUM }) ?? "", /înainte de pornirea/);
    assert.equal(notaTrimitereAutomata({ trimitereAutomata: false, deLa: "2026-11-16T00:00:00Z", emisLa: "2026-11-15T10:00:00Z", acum: ACUM }), null);
    assert.equal(notaTrimitereAutomata({ trimitereAutomata: true, deLa: "2026-11-16T00:00:00Z", emisLa: null, acum: ACUM }), null);
  });
});

describe("ce se spune si ce se scrie", () => {
  test("⚠ C3: lotul oprit din alt motiv decat timpul spune DE CE, nu „la timp”", () => {
    const motive: Oprire[] = ["acces", "cheie", "schimbata", "ocupat", "indisponibil"];
    const texte = motive.map((m) => motivOprireLot(m));
    for (const [i, t] of texte.entries()) {
      assert.ok(t && t.length > 20, String(motive[i]));
      assert.doesNotMatch(t ?? "", /la timp/i);
      /* Lista il pune dupa „Lotul s-a oprit: " si inaintea numarului de comenzi neincercate. */
      assert.doesNotMatch(t ?? "", /^Lotul s-a oprit/);
      assert.match(t ?? "", /\.$/, "propozitie incheiata: urmeaza numarul comenzilor neincercate");
    }
    assert.equal(new Set(texte).size, motive.length, "fiecare motiv are textul lui");
    assert.equal(motivOprireLot("timp"), null);
    assert.equal(motivOprireLot(null), null);
  });

  test("⚠ registrul primeste starea si codul, NU textul SAGA (poate numi clientul)", () => {
    const m = mesajPentruRegistru("respins", 422);
    assert.match(m, /respins de SAGA/);
    assert.match(m, /cod 422/);
    assert.equal(mesajPentruRegistru("necunoscut", null).includes("cod"), false);
    assert.match(mesajPentruRegistru("refuzat", 400), /cerere refuzată de SAGA \(cod 400\)/);
  });

  test("⚠ o proba reusita care a PIERDUT cheia rotita nu e reusita (nici refuz)", () => {
    assert.deepEqual(verdictProba({ ok: true, cheieRotita: true, cheieNesalvata: true }), { ok: false, refuz: false, error: MESAJ_CHEIE_NESALVATA });
    assert.deepEqual(verdictProba({ ok: true, cheieRotita: true, cheieNesalvata: false }), { ok: true });
    assert.deepEqual(verdictProba({ ok: false, refuz: true, error: "x", cheieRotita: false, cheieNesalvata: false }), { ok: false, refuz: true, error: "x" });
  });

  test("facturile inlocuite fara stornare: acelasi text peste tot, la singular si la plural", () => {
    assert.match(mesajStornariLipsa(["Factura SmartBill EDN0001"]), /^Factura SmartBill EDN0001 a plecat în SAGA și a fost înlocuită/);
    assert.match(mesajStornariLipsa(["A", "B"]), /^A, B au plecat în SAGA și au fost înlocuite/);
  });

  test("niciun text de aici nu poarta liniuta lunga", () => {
    const texte = [
      ...(["acces", "cheie", "schimbata", "ocupat", "indisponibil"] as Oprire[]).map((m) => motivOprireLot(m) ?? ""),
      MESAJ_CHEIE_NESALVATA, mesajStornariLipsa(["x"]), mesajStornariLipsa(["x", "y"]), mesajPentruRegistru("respins", 422),
      notaTrimitereAutomata({ trimitereAutomata: true, deLa: "2026-11-16T00:00:00Z", emisLa: "2026-11-15T10:00:00Z", acum: Date.parse("2026-11-17T00:00:00Z") }) ?? "",
    ];
    for (const t of texte) assert.ok(!t.includes("\u2014"), t);
  });
});

describe("⚠ TVA-ul casei care a emis", () => {
  test("SmartBill si Oblio fara numele cotei au emis FARA TVA; celelalte case, cu", () => {
    assert.deepEqual(tvaPeCasa({ smartbill_config: { tax_name: "" }, oblio_config: { vat_name: "" } }), {
      smartbill: false, oblio: false, fgo: true, facturis: true, factureaza: true, easybill: true,
    });
    assert.deepEqual(tvaPeCasa({ smartbill_config: { tax_name: "Normala" }, oblio_config: { vat_name: "Normala" } }).smartbill, true);
    assert.equal(tvaPeCasa({ smartbill_config: {} }).smartbill, false, "configurare fara nume = fara TVA, ca la SmartBill");
  });

  test("exact testul caselor (`!!nume`), fara „curatenie”: un nume din spatii e tot cu TVA", () => {
    assert.equal(tvaPeCasa({ smartbill_config: { tax_name: "  " } }).smartbill, true);
  });

  test("configurarea LIPSA (casa deconectata) nu inseamna fara TVA", () => {
    assert.deepEqual(Object.values(tvaPeCasa({})), [true, true, true, true, true, true]);
    assert.equal(tvaPeCasa({ smartbill_config: null, oblio_config: null }).oblio, true);
  });
});
