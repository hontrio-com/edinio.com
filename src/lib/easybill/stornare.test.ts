import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { LIMITA_LISTA, cautaFacturi, uitaSesiunileEasybill, type FacturaCitita } from "./client";
import {
  ZILE_STORNARE_MAXIM, ZILE_UNA_CATE_UNA, documentulCautat, facturiPomenite, intervaleDeCautare, potrivesteDocumentul,
  stornareaMaiTine, verificaStornarea,
} from "./stornare";

/*
 * Stornarea facuta in easybill si inregistrata in Edinio. Regula de aparat e una: NIMIC PE
 * INCREDERE. O cheie de stornare pusa gresit elibereaza slotul, iar urmatoarea emitere ar factura
 * comanda a doua oara. Deci: negasit, ciorna, anulat, total pozitiv, PARTIAL, alta factura pomenita =
 * refuz; nelegat = se inregistreaza, dar omul afla.
 *
 * Randurile sunt in forma listei lor (`searchInvoices_fct`), ca in exemplele din documentatie.
 */

const ORIGINALA: FacturaCitita = {
  cheie: "92032900", serie: "EBF", numar: "955", data: "2026-11-10", total: 119, rest: 0, stare: "fiscal",
  anulata: false, moneda: "RON", comentarii: "Comanda #0012 - ref. EDN-ABCDEF123456", clientId: "164690",
  clientNume: "Ion Popescu", anaf: "",
};

function storno(extra: Partial<FacturaCitita> = {}): FacturaCitita {
  return {
    cheie: "92033001", serie: "EBF", numar: "961", data: "2026-11-17", total: -119, rest: 0, stare: "fiscal",
    anulata: false, moneda: "RON", comentarii: "Stornare factura EBF 955", clientId: "164690",
    clientNume: "Ion Popescu", anaf: "", ...extra,
  };
}

const CAUTARE = { de_la: "2026-11-10", pana_la: "2026-11-17", plafonata: false };
const ACUM = new Date("2026-11-17T10:00:00Z");
const zi = (s: string) => Date.parse(`${s}T00:00:00Z`);

describe("unde se cauta", () => {
  test("de la AZI inapoi, zi cu zi la inceput, pana la data facturii (nu mai devreme)", () => {
    const { intervale, plafonata } = intervaleDeCautare("2026-11-10", ACUM);
    assert.equal(plafonata, false);
    assert.deepEqual(intervale[0], { start: "2026-11-17", end: "2026-11-17" });
    assert.deepEqual(intervale[intervale.length - 1], { start: "2026-11-10", end: "2026-11-10" });
    assert.equal(intervale.length, 8);
  });
  test("⚠ plafonata la o fereastra fixa, fara gauri si fara suprapuneri, cu cereri putine", () => {
    const { intervale, plafonata } = intervaleDeCautare("2026-08-01", ACUM);
    assert.equal(plafonata, true);
    assert.equal(intervale[intervale.length - 1].start, "2026-09-17", `${ZILE_STORNARE_MAXIM} de zile, cu azi`);
    for (let i = 1; i < intervale.length; i++) {
      assert.equal(zi(intervale[i - 1].start) - zi(intervale[i].end), 86_400_000, `gaura sau suprapunere la ${i}`);
    }
    assert.ok(intervale.slice(0, ZILE_UNA_CATE_UNA).every((iv) => iv.start === iv.end), "primele zile, una cate una");
    assert.ok(intervale.length <= 16, `${intervale.length} cereri`);
  });
  test("fara data facturii: fereastra plafonata; factura „din viitor”: macar azi", () => {
    assert.equal(intervaleDeCautare("", ACUM).plafonata, true);
    assert.deepEqual(intervaleDeCautare("2026-11-20", ACUM).intervale, [{ start: "2026-11-17", end: "2026-11-17" }]);
  });
  test("dupa miezul noptii in Romania, „azi” e ziua noastra, nu a UTC", () => {
    assert.equal(intervaleDeCautare("2026-11-17", new Date("2026-11-16T23:30:00Z")).intervale[0].end, "2026-11-17");
  });
});

describe("ce se potriveste", () => {
  const randuri = [
    storno(), storno({ cheie: "1", serie: "STO", numar: "961" }), storno({ cheie: "2", numar: "9610" }), storno({ cheie: "3", numar: "1961" }),
  ];
  test("seria si numarul EXACT; seria fara majuscule; numarul fara zerourile din fata", () => {
    assert.deepEqual(potrivesteDocumentul(randuri, { serie: "ebf", numar: "961" }).map((f) => f.cheie), ["92033001"]);
    assert.deepEqual(potrivesteDocumentul(randuri, { serie: "EBF", numar: "0961" }).map((f) => f.cheie), ["92033001"]);
  });
  test("fara serie: toate seriile cu acel numar (iar alegerea o cere verificarea)", () => {
    assert.deepEqual(potrivesteDocumentul(randuri, { numar: "961" }).map((f) => f.cheie), ["92033001", "1"]);
  });
  test("seria scrisa in campul de numar („EBF 961”, „EBF-961”) se desparte", () => {
    assert.deepEqual(documentulCautat({ numar: "EBF 961" }), { serie: "EBF", numar: "961" });
    assert.deepEqual(documentulCautat({ serie: "", numar: "EBF-961" }), { serie: "EBF", numar: "961" });
    assert.deepEqual(potrivesteDocumentul(randuri, { numar: "EBF 961" }).map((f) => f.cheie), ["92033001"]);
  });
  test("un numar gol nu potriveste nimic", () => {
    assert.deepEqual(potrivesteDocumentul(randuri, { numar: "  " }), []);
  });
});

describe("e chiar o stornare a facturii?", () => {
  const verifica = (gasite: FacturaCitita[], cautat = { serie: "EBF", numar: "961" }, cautare = CAUTARE) =>
    verificaStornarea({ gasite, originala: ORIGINALA, cautat, cautare });

  test("gasita: finalizata, neanulata, negativa, acelasi client = se inregistreaza, fara avertismente", () => {
    const v = verifica([storno()]);
    assert.ok("ok" in v, "error" in v ? v.error : "");
    assert.equal(v.storno.cheie, "92033001");
    assert.deepEqual(v.avertismente, []);
  });
  test("⚠ NEGASITA: eroare citibila, cu fereastra cautata, si nimic inregistrat", () => {
    const v = verifica([]);
    assert.ok("error" in v);
    assert.match(v.error, /N-am găsit în easybill documentul EBF 961/);
    assert.match(v.error, /2026-11-10 - 2026-11-17/);
    assert.match(v.error, /Nu am înregistrat nimic/);
    const p = verifica([], undefined, { ...CAUTARE, plafonata: true });
    assert.ok("error" in p && p.error.includes(`ultimele ${ZILE_STORNARE_MAXIM} de zile`));
  });
  test("mai multe cu acelasi numar si fara serie: se cere seria", () => {
    const v = verifica([storno(), storno({ cheie: "1", serie: "STO" })], { serie: "", numar: "961" });
    assert.ok("error" in v);
    assert.match(v.error, /Scrie și seria/);
  });
  test("chiar factura comenzii nu e stornarea ei", () => {
    const v = verifica([ORIGINALA], { serie: "EBF", numar: "955" });
    assert.ok("error" in v);
    assert.match(v.error, /chiar factura comenzii/);
  });
  test("⚠ CIORNA: refuz (o ciorna nu storneaza fiscal nimic)", () => {
    const v = verifica([storno({ stare: "draft" })]);
    assert.ok("error" in v);
    assert.match(v.error, /ciornă/);
  });
  test("⚠ ANULATA: refuz", () => {
    const v = verifica([storno({ anulata: true })]);
    assert.ok("error" in v);
    assert.match(v.error, /anulat/);
  });
  test("⚠ TOTAL POZITIV, zero sau necitibil: refuz", () => {
    for (const total of [119, 0, null]) {
      const v = verifica([storno({ total })]);
      assert.ok("error" in v, `total ${total} a trecut`);
    }
  });
  test("⚠ STORNARE PARTIALA: REFUZ (dupa ea, „Emite factură nouă” ar refactura TOT), cu drumul spus", () => {
    const v = verifica([storno({ total: -50 })]);
    assert.ok("error" in v);
    assert.match(v.error, /nu anulează exact factura/);
    assert.match(v.error, /se rezolvă în easybill/);
    assert.match(v.error, /Nu am înregistrat nimic/);
  });
  test("⚠ si stornarea MAI MARE decat factura e refuz (-238 din 119 trecea)", () => {
    assert.ok("error" in verifica([storno({ total: -238 })]));
  });
  test("diferenta de rotunjire de un ban trece; factura fara total citibil nu", () => {
    assert.ok("ok" in verifica([storno({ total: -118.99 })]));
    const v = verificaStornarea({ gasite: [storno()], originala: { ...ORIGINALA, total: null }, cautat: { numar: "961" }, cautare: CAUTARE });
    assert.ok("error" in v);
  });
  test("⚠ observatiile care pomenesc ALTA factura: refuz", () => {
    const v = verifica([storno({ comentarii: "Stornare factura EBF 954" })]);
    assert.ok("error" in v);
    assert.match(v.error, /pomenesc factura EBF 954/);
    const altaSerie = verifica([storno({ comentarii: "Storno factura seria STO nr. 955" })]);
    assert.ok("error" in altaSerie, "aceeasi cifra, alta serie");
    assert.ok("ok" in verifica([storno({ comentarii: "Storno factura seria EBF nr. 955 din 10.11.2026" })]));
  });
  test("ce scriem NOI in observatii (marcajul, mentiunea de refacturare) nu trece drept alta factura", () => {
    const v = verifica([storno({ comentarii: "Comanda #0012 - plata: Card - ref. EDN-ABCDEF123456 (inlocuieste factura EBF 7, stornata prin EBF 9)" })]);
    assert.ok("ok" in v, "error" in v ? v.error : "");
  });
  test("alt client SI observatii care nu pomenesc factura: avertisment; una din ele ajunge", () => {
    const strain = verifica([storno({ clientId: "999", clientNume: "Alt Om", comentarii: "Retur" })]);
    assert.ok("ok" in strain && strain.avertismente.some((x) => /nu pare legată/.test(x)));
    const pomenita = verifica([storno({ clientId: "999", clientNume: "Alt Om", comentarii: "Storno EBF 955" })]);
    assert.ok("ok" in pomenita && pomenita.avertismente.length === 0);
    const dupaNume = verifica([storno({ clientId: "", clientNume: "ION  POPESCU", comentarii: "" })]);
    assert.ok("ok" in dupaNume && dupaNume.avertismente.length === 0);
  });
  test("numarul facturii pomenit doar ca bucata din alt numar nu leaga nimic", () => {
    const v = verifica([storno({ clientId: "999", clientNume: "Alt Om", comentarii: "Storno EBF 9551" })]);
    assert.ok("ok" in v && v.avertismente.some((x) => /nu pare legată/.test(x)));
  });
  test("datata inaintea facturii, sau factura originala anulata: avertisment", () => {
    const v = verifica([storno({ data: "2026-11-01" })]);
    assert.ok("ok" in v && v.avertismente.some((x) => /înaintea facturii/.test(x)));
    const a = verificaStornarea({ gasite: [storno()], originala: { ...ORIGINALA, anulata: true }, cautat: { numar: "961" }, cautare: CAUTARE });
    assert.ok("ok" in a && a.avertismente.some((x) => /apare și anulată/.test(x)));
  });
});

describe("facturile pomenite in observatii", () => {
  test("formele obisnuite: serie si numar, „seria … nr.”, cu cratima, fara serie", () => {
    assert.deepEqual(facturiPomenite("Stornare factura EBF 955"), [{ serie: "EBF", numar: "955" }]);
    assert.deepEqual(facturiPomenite("Storno factura seria EBF nr. 955 din 10.11.2026"), [{ serie: "EBF", numar: "955" }]);
    assert.deepEqual(facturiPomenite("Stornează facturii EBF-0955"), [{ serie: "EBF", numar: "955" }]);
    assert.deepEqual(facturiPomenite("factura nr. 955"), [{ serie: "", numar: "955" }]);
  });
  test("fara „factura”, sau doar marcajul nostru: nimic", () => {
    assert.deepEqual(facturiPomenite("Retur marfa, comanda #0012"), []);
    assert.deepEqual(facturiPomenite("ref. EDN-ABCDEF123456 (inlocuieste factura EBF 7, stornata prin EBF 9)"), []);
  });
});

describe("inainte de refacturare: mai tine stornarea?", () => {
  const E = { storno: "EBF 961", factura: "EBF 955" };
  test("vie, finalizata, negativa: da", () => {
    assert.equal(stornareaMaiTine(storno(), E), null);
  });
  test("⚠ negasita, anulata, ciorna sau fara total negativ: refuz (factura veche e din nou vie)", () => {
    assert.match(stornareaMaiTine(null, E) ?? "", /nu mai apare/);
    assert.match(stornareaMaiTine(storno({ anulata: true }), E) ?? "", /anulată/);
    assert.match(stornareaMaiTine(storno({ stare: "draft" }), E) ?? "", /ciornă/);
    assert.ok(stornareaMaiTine(storno({ total: 119 }), E));
    assert.ok(stornareaMaiTine(storno({ total: null }), E));
  });
});

/* ═══ Cautarea pe fir, simulata ═══ */

const fetchOriginal = globalThis.fetch;
beforeEach(() => uitaSesiunileEasybill());
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

const A = { username: "api", password: "parola" };

/**
 * Un easybill care tine facturile pe zile si raspunde la `searchInvoices_fct` pe interval, tinand seama
 * de `limit` (cel mult atatea randuri, ca un server care il respecta).
 */
function listaPeZile(randuri: Record<string, unknown>[], cade = false) {
  const cereri: { start: string; end: string; limit?: string }[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const corp = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
    if (corp.sec === "authenticateUser_fct") return json({ status: 1, SessionId: "S1", AppUnique: "1x1", UserId: "7" });
    if (corp.sec !== "searchInvoices_fct") return new Response("", { status: 302, headers: { location: "index.cgi?sec=friendlyerrormessage_frm" } });
    cereri.push({ start: corp.startDate, end: corp.endDate, limit: corp.limit });
    if (cade) throw new TypeError("fetch failed");
    const toate = randuri.filter((r) => String(r.invoiceIssueDate) >= corp.startDate && String(r.invoiceIssueDate) <= corp.endDate);
    return json(toate.slice(0, Number(corp.limit) || toate.length));
  }) as typeof fetch;
  return cereri;
}

const RAND_STORNO = {
  invoiceCurrency: "RON", invoiceStatus: "fiscal", invoiceNumber: "961", invoiceIssueDate: "2026-11-15",
  clientName: "Ion Popescu", invoiceComments: "Stornare factura EBF 955", invoiceSerie: "EBF", clientId: "164690",
  invoiceTotalAmount: -119, invoiceId: "92033001", invoiceIsCancelled: "0",
};
const RAND_ALTUL = { ...RAND_STORNO, invoiceNumber: "962", invoiceId: "92033002", invoiceIssueDate: "2026-11-17", invoiceTotalAmount: 40 };

describe("cautarea in lista lor", () => {
  const { intervale } = intervaleDeCautare("2026-11-10", ACUM);
  const alege = (randuri: FacturaCitita[]) => potrivesteDocumentul(randuri, { serie: "EBF", numar: "961" });

  test("gasita in a treia zi: se opreste acolo, nu mai citeste restul ferestrei", async () => {
    const cereri = listaPeZile([RAND_STORNO, RAND_ALTUL]);
    const gasite = await cautaFacturi(A, intervale, alege);
    assert.deepEqual(gasite.map((f) => f.cheie), ["92033001"]);
    assert.equal(gasite[0].total, -119);
    assert.deepEqual(cereri.map((c) => c.start), ["2026-11-17", "2026-11-16", "2026-11-15"]);
  });
  test("negasita: toata fereastra, apoi lista goala (verificarea spune „negasit”)", async () => {
    const cereri = listaPeZile([RAND_ALTUL]);
    assert.deepEqual(await cautaFacturi(A, intervale, alege), []);
    assert.equal(cereri.length, intervale.length);
  });
  test("o citire picata e REFUZ: n-a creat nimic, se poate reincerca", async () => {
    listaPeZile([], true);
    await assert.rejects(cautaFacturi(A, intervale, alege), (e: unknown) => verdictFurnizor(e) === "esuat");
  });
  test("fiecare cerere poarta `limit`, explicit", async () => {
    const cereri = listaPeZile([RAND_STORNO]);
    await cautaFacturi(A, intervale, alege);
    assert.ok(cereri.every((c) => c.limit === String(LIMITA_LISTA)));
  });

  /** O zi plina de facturi straine (cat plafonul), fara stornare. */
  const plina = (zi: string) => Array.from({ length: LIMITA_LISTA }, (_, i) => ({
    ...RAND_ALTUL, invoiceId: String(700000 + i), invoiceNumber: String(5000 + i), invoiceIssueDate: zi,
  }));

  test("⚠ o saptamana PLINA se reia zi cu zi, iar stornarea din ea se gaseste", async () => {
    const { intervale: lungi } = intervaleDeCautare("2026-10-01", ACUM);
    const saptamana = lungi[ZILE_UNA_CATE_UNA];
    const ziDinEa = saptamana.start;
    const cereri = listaPeZile([...plina(saptamana.end), { ...RAND_STORNO, invoiceIssueDate: ziDinEa }]);
    const gasite = await cautaFacturi(A, lungi, alege);
    assert.deepEqual(gasite.map((x) => x.cheie), ["92033001"]);
    assert.ok(cereri.some((c) => c.start === ziDinEa && c.end === ziDinEa), "intervalul plin nu s-a reluat pe zile");
  });
  test("⚠ o zi PLINA, fara stornare: REFUZ (lista poate fi taiata), nu „negasita”", async () => {
    listaPeZile(plina("2026-11-17"));
    await assert.rejects(cautaFacturi(A, intervale, alege), (e: unknown) => verdictFurnizor(e) === "esuat" && /poate fi incompletă/.test(String(e)));
  });
});
