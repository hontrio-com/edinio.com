import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { referintaRamasa, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  ADRESA_EASYBILL, LIMITA_LISTA, MARIME_MAXIMA_PDF, MS_PE_PAS, citesteDupaEmitere, citesteFactura, citesteRaspunsul,
  corpulCererii, emiteFactura, firmaDinRaspuns, inregistreazaIncasarea, liniaSePotriveste, liniiDejaPuse, mesajEasybill,
  numar, pdfFactura, sesiuneDinRaspuns, testeazaConexiunea, uitaSesiunileEasybill, type LinieCitita, type OptiuniEmitere,
} from "./client";
import type { FacturaCompusa, LiniePlan } from "./document";

/*
 * Clientul easybill, probat fara fir. Doua lucruri conteaza, si au aceeasi radacina:
 *   - un refuz DOVEDIT iese `esuat` (reincercarea e libera), iar orice „nu stim” de pe o scriere
 *     iese `necunoscut` (reincercarea ar emite a doua factura fiscala);
 *   - emiterea are PASI, iar dupa ce factura goala exista, nimic nu mai poate iesi `esuat`.
 *
 * Raspunsurile din `PE_FIR` sunt BRUTE, culese pe 17.11.2026 de pe `apps.easybill.ro` cu date
 * INVENTATE (nu creeaza nimic). Cele din `DIN_DOC` sunt exemplele din documentatia lor.
 */

const PE_FIR = {
  /** Utilizator sau parola gresite: 200, JSON declarat, iar corpul e un antet de redirectionare. */
  acreditariGresite: {
    status: 200,
    headers: { "content-type": "application/json" },
    body: "Status: 302 Found\r\nLocation: index.cgi?action=plugin&mode=easybill&sec=friendlyerrormessage_frm\r\n\r\n",
  },
  /** Autentificare fara utilizator. */
  faraUtilizator: {
    status: 200,
    headers: { "content-type": "application/json" },
    body: "{\n   \"status\" : -2,\n   \"StatusMessage\" : \"Error\"\n}\n",
  },
  /** ORICE metoda cu sesiune gresita sau lipsa, si cele care scriu (`createInvoice_fct` inclusiv). */
  sesiuneGresita: {
    status: 403,
    headers: { "content-type": "application/json" },
    body: "{\n   \"error\" : -1,\n   \"errorMessage\" : \"User not authenticated!\"\n}\n",
  },
  /** Metoda necunoscuta sau fara `mode=api`: 302 adevarat, corp gol. */
  metodaNecunoscuta: {
    status: 302,
    headers: { "content-type": "text/plain; charset=UTF-8", location: "index.cgi?action=plugin&mode=easybill&sec=friendlyerrormessage_frm" },
    body: "",
  },
} as const;

const DIN_DOC = {
  autentificare: {
    Alias: "user-507", status: 1, SessionId: "0d0d6a7aebbe51f63d3e9abdb18a6d42",
    AppUnique: "44235149x19418608", UserId: "507", StatusMessage: "Success",
  },
  firma: {
    anafShortCode: "LE9KI", agentCommission: "0", companyCurrencyCommission: "0", companyDecimalPrecision: "",
    companyUniqueRegistrationNumber: "30305759", companyTradeRegistryNumber: "-", companyLargeLogoURL: "",
    agentName: "", companyVAT: "0", anafConnectionURL: "https://apps.easybill.ro/anaf-connect/LE9KI",
    companyData: "0711223344", agentSSN: "", companyWithVATAtCollection: "0", companyIsWithoutVAT: "0",
    companyLogoURL: "", agentSeries: "", companyName: "Easybill Digital S.R.L.", companyDefaultCurrency: "",
  },
};

const A = { username: "api", password: " p&ss%'\"= " };

type Raspuns = { status?: number; body: string | Uint8Array; headers?: Record<string, string> };
type Cerere = { url: string; metoda: string; redirect: string | undefined; tip: string; corp: Record<string, string>; sec: string };

const fetchOriginal = globalThis.fetch;
beforeEach(() => uitaSesiunileEasybill());
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Inlocuieste `fetch` cu un raspuns dat de `h` si tine minte cererile. */
function fir(h: (c: Cerere) => Raspuns | Error) {
  const cereri: Cerere[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const corp = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    const antete = (init?.headers ?? {}) as Record<string, string>;
    const c: Cerere = {
      url: String(url), metoda: init?.method ?? "GET", redirect: init?.redirect,
      tip: antete["Content-Type"] ?? "", corp, sec: corp.sec ?? "",
    };
    cereri.push(c);
    const r = h(c);
    if (r instanceof Error) throw r;
    return new Response(r.body as BodyInit, { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return cereri;
}

const json = (v: unknown, status = 200): Raspuns => ({ status, body: JSON.stringify(v), headers: { "content-type": "application/json" } });
const termen = () => Object.assign(new Error("timeout"), { name: "TimeoutError" });

/* ═══ Un easybill simulat: sesiuni, clienti, facturi cu linii ═══ */

type LinieFalsa = { id: string; nume: string; cant: string; valoare: number; tva: number };
type FacturaFalsa = {
  id: string; comentarii: string; anulata: boolean; data: string; serie: string; numar: string; linii: LinieFalsa[];
  /** `invoiceStatus`; lipsa = „fiscal”. */
  stare?: string;
  /** Un total pus de mana, altul decat suma liniilor. */
  totalFortat?: number;
};

function easybillFals(o: {
  parola?: string;
  /** Raspunsuri puse peste cele obisnuite, pe metoda; `undefined` = purtarea obisnuita. */
  peste?: Partial<Record<string, (c: Cerere, n: number) => Raspuns | Error | undefined>>;
  /** easybill ar trata pretul ca NET chiar cu `productPriceIncludesVat=1`. */
  ignoraPretCuTva?: boolean;
  facturi?: FacturaFalsa[];
  clienti?: { clientId: string; clientCIF: string }[];
  /** Facturi straine in plus, pe zile (lista lor „plina”). */
  umplutura?: Record<string, number>;
} = {}) {
  const parola = o.parola ?? A.password;
  const sesiuni = new Set<string>();
  const facturi = new Map<string, FacturaFalsa>((o.facturi ?? []).map((f) => [f.id, f]));
  const clienti = [...(o.clienti ?? [])];
  let id = 1000;
  let sesiune = 0;
  const peMetoda = new Map<string, number>();

  const cereri = fir((c) => {
    const n = (peMetoda.get(c.sec) ?? 0) + 1;
    peMetoda.set(c.sec, n);
    const pus = o.peste?.[c.sec]?.(c, n);
    if (pus !== undefined) return pus;

    if (c.sec === "authenticateUser_fct") {
      if (c.corp.Username !== A.username || c.corp.Password !== parola) return PE_FIR.acreditariGresite;
      const s = `S${++sesiune}`;
      sesiuni.add(s);
      return json({ ...DIN_DOC.autentificare, SessionId: s });
    }
    if (!sesiuni.has(c.corp.SessionId)) return PE_FIR.sesiuneGresita;

    switch (c.sec) {
      case "getCompanyInfo_fct":
        return json(DIN_DOC.firma);
      case "searchClient_fct":
        return json(clienti.filter((x) => x.clientCIF.includes(c.corp.query ?? "")));
      case "addClient_fct": {
        const cid = String(++id);
        clienti.push({ clientId: cid, clientCIF: c.corp.clientCIF ?? "" });
        return json({ clientId: cid, status: 1 });
      }
      case "createInvoice_fct": {
        const fid = String(++id);
        facturi.set(fid, { id: fid, comentarii: c.corp.invoiceComments ?? "", anulata: false, data: c.corp.invoiceDate, serie: "EBF", numar: String(900 + facturi.size), linii: [] });
        return json({ statusMessage: "Invoice created successfully", status: 1, ebInvoiceNo: fid });
      }
      case "addProductToInvoice_fct": {
        const f = facturi.get(c.corp.invoiceId);
        if (!f) return json({ error: 5, errorMessage: "Invoice not found" });
        const q = Number(c.corp.productQuantity);
        const p = Number(c.corp.productPrice);
        const r = Number(c.corp.productVAT);
        let valoare: number, tva: number;
        if (c.corp.productPriceIncludesVat === "1" && !o.ignoraPretCuTva) {
          const total = Math.round(p * q * 100) / 100;
          tva = Math.round(total * r / (100 + r) * 100) / 100;
          valoare = Math.round((total - tva) * 100) / 100;
        } else {
          valoare = Math.round(p * q * 100) / 100;
          tva = Math.round(valoare * r) / 100;
        }
        const lid = String(++id);
        f.linii.push({ id: lid, nume: c.corp.productName, cant: c.corp.productQuantity, valoare, tva });
        return json({ valueWithoutVat: valoare.toFixed(2), vatValue: tva.toFixed(2), status: 0, convertedPrice: p.toFixed(2), prodId: lid });
      }
      case "getInvoiceProducts_fct": {
        const f = facturi.get(c.corp.invoiceId);
        /* Ca in exemplul lor: de la cea mai noua linie la cea mai veche. */
        return json([...(f?.linii ?? [])].reverse().map((l) => {
          /* Ca in exemplul lor: pretul pe bucata FARA TVA si TVA-ul pe bucata. */
          const q = Math.abs(Number(l.cant)) || 1;
          return {
            productId: l.id, productName: l.nume, productQuantity: l.cant, productVAT: "21", isCancelled: "0",
            productPrice: (Math.abs(l.valoare) / q).toFixed(4), productVATValue: (Math.abs(l.tva) / q).toFixed(4),
          };
        }));
      }
      case "searchInvoices_fct": {
        const rand = (f: FacturaFalsa) => ({
          invoiceId: f.id, invoiceSerie: f.serie, invoiceNumber: f.numar, invoiceStatus: f.stare ?? "fiscal",
          invoiceIsCancelled: f.anulata ? "1" : "0", invoiceComments: f.comentarii, invoiceIssueDate: f.data,
          invoiceTotalAmount: f.totalFortat ?? Math.round(f.linii.reduce((s, l) => s + l.valoare + l.tva, 0) * 100) / 100,
          invoiceCurrency: "RON",
        });
        if (c.corp.invoiceId) return json([...facturi.values()].filter((f) => f.id === c.corp.invoiceId).map(rand));
        const dinZile = [...facturi.values()].filter((f) => f.data >= c.corp.startDate && f.data <= c.corp.endDate).map(rand);
        const straine = Array.from({ length: o.umplutura?.[c.corp.startDate] ?? 0 }, (_, i) => ({
          invoiceId: String(500000 + i), invoiceSerie: "X", invoiceNumber: String(i + 1), invoiceStatus: "fiscal",
          invoiceIsCancelled: "0", invoiceComments: "altceva", invoiceIssueDate: c.corp.startDate, invoiceTotalAmount: 1,
        }));
        /* Ca un server care tine seama de `limit`: cel mult atatea randuri. */
        const toate = [...dinZile, ...straine];
        return json(toate.slice(0, Number(c.corp.limit) || toate.length));
      }
      case "downloadInvoice_fct":
        return { body: new TextEncoder().encode("%PDF-1.4\n...\n%%EOF"), headers: { "content-type": "application/pdf" } };
      case "addPayment_fct":
        return json({ status: "0" });
      default:
        return PE_FIR.metodaNecunoscuta;
    }
  });
  return { cereri, facturi, clienti, metode: () => cereri.map((c) => c.sec) };
}

/** O factura compusa de mana: un client persoana fizica si liniile date. */
function factura(linii: LiniePlan[], extra: Partial<FacturaCompusa> = {}): FacturaCompusa {
  return {
    client: { campuri: { clientName: "Ion Popescu", xType: "PF", clientAddressLine: "Str. Lunga 5", clientCity: "Brasov", clientCounty: "BV", clientCountry: "RO" }, cuiDeCautat: null },
    antet: { invoiceDate: "2026-11-17", invoiceStatus: "1", invoiceCurrency: "RON", invoiceExternalId: "EDN-ABCDEF123456", invoiceComments: "Comanda #0012 - ref. EDN-ABCDEF123456" },
    linii,
    total: Math.round(linii.reduce((s, l) => s + l.total, 0) * 100) / 100,
    marcaj: "EDN-ABCDEF123456",
    regim: { rate: 21, taxIncluded: true, fallback: false },
    ...extra,
  };
}

/** O linie cu pret cu TVA (21%), cum o scoate `linieEasybill`: totalul, valoarea si TVA-ul, cu semn. */
function linie(nume: string, pret: number, cant: number): LiniePlan {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const semn = cant < 0 ? -1 : 1;
  const total = r2(pret * Math.abs(cant));
  const tva = r2((total * 21) / 121);
  return {
    campuri: {
      productName: nume, productPrice: pret.toFixed(2), productCurrency: "RON", productType: "p", productUM: "H87",
      productQuantity: String(cant), productVAT: "21", productPriceIncludesVat: "1", productIsReturned: "0",
      simpleProduct: "1", invoiceIdType: "id",
    },
    total: r2(semn * total),
    valoare: r2(semn * r2(total - tva)),
    tva: r2(semn * tva),
  };
}

/** Linia „Cana” de 10 lei cu TVA, cum o tine easybill: 8,26 + 1,74. */
const CANA_LA_EI = { id: "10", nume: "Cana", cant: "1", valoare: 8.26, tva: 1.74 };

/** O factura ramasa de la o incercare de dinainte, cu marcajul nostru in observatii. */
const ramasaFalsa = (extra: Partial<FacturaFalsa> = {}): FacturaFalsa => ({
  id: "77", comentarii: "Comanda #0012 - ref. EDN-ABCDEF123456", anulata: false, data: "2026-11-17", serie: "EBF", numar: "955",
  linii: [{ ...CANA_LA_EI }], ...extra,
});

const FARA_TERMEN = Number.MAX_SAFE_INTEGER;
const PRIMA: OptiuniEmitere = { reluare: false, ramasa: null, zile: [], termen: FARA_TERMEN };
const RELUARE: OptiuniEmitere = { reluare: true, ramasa: null, zile: ["2026-11-17", "2026-11-16"], termen: FARA_TERMEN };
const necunoscut = (e: unknown) => verdictFurnizor(e) === "necunoscut";
const esuat = (e: unknown) => verdictFurnizor(e) === "esuat";

/* ═══════════════════════════════════════════════════════════════════════════ */

describe("cererea", () => {
  test("formular codat; metoda, `mode` si sesiunea nu pot fi inlocuite de un parametru", () => {
    const corp = corpulCererii("createInvoice_fct", {
      invoiceComments: "Tom & Jerry 100% \"bun\" 'sigur' = da", sec: "altceva", mode: "web", SessionId: "furat",
    }, { SessionId: "S1", AppUnique: "1x1", UserId: "7" });
    const p = new URLSearchParams(corp);
    assert.equal(p.getAll("sec").length, 1);
    assert.equal(p.get("sec"), "createInvoice_fct");
    assert.equal(p.get("mode"), "api");
    assert.equal(p.get("SessionId"), "S1");
    assert.equal(p.get("invoiceComments"), "Tom & Jerry 100% \"bun\" 'sigur' = da");
  });
  test("⚠ totul pleaca prin POST catre aceeasi adresa, fara nimic secret in ea, fara urmarirea redirectarilor", async () => {
    const f = easybillFals();
    await testeazaConexiunea(A);
    assert.ok(f.cereri.length >= 2);
    for (const c of f.cereri) {
      assert.equal(c.url, ADRESA_EASYBILL);
      assert.equal(c.metoda, "POST");
      assert.equal(c.redirect, "manual");
      assert.match(c.tip, /^application\/x-www-form-urlencoded/);
      assert.ok(!/SessionId|Password|Username/i.test(c.url), "adresa poarta acreditari");
    }
    assert.equal(f.cereri[0].corp.Password, A.password, "parola pleaca exact, nici macar taiata la spatii");
    assert.equal(f.cereri[1].corp.SessionId, "S1");
  });
});

describe("raspunsul, pe formele de pe fir", () => {
  test("acreditari gresite: redirectionarea SCRISA IN CORP, sub un 200, e pagina lor de eroare", () => {
    const r = PE_FIR.acreditariGresite;
    assert.deepEqual(citesteRaspunsul(r.status, r.body), { fel: "pagina_de_eroare" });
  });
  test("sesiune gresita: 403 + „User not authenticated!”", () => {
    const r = PE_FIR.sesiuneGresita;
    assert.deepEqual(citesteRaspunsul(r.status, r.body), { fel: "neautentificat" });
  });
  test("metoda necunoscuta: 302 adevarat catre pagina de eroare", () => {
    const r = PE_FIR.metodaNecunoscuta;
    assert.deepEqual(citesteRaspunsul(r.status, r.body, r.headers.location), { fel: "pagina_de_eroare" });
  });
  test("`status` -2 vine ca date; refuzul il judeca apelantul", () => {
    const r = PE_FIR.faraUtilizator;
    assert.deepEqual(citesteRaspunsul(r.status, r.body), { fel: "date", date: { status: -2, StatusMessage: "Error" } });
  });
  test("un `error` al lor e refuz, cu mesajul lor; `error: 0` nu e", () => {
    assert.deepEqual(citesteRaspunsul(200, '{"error":5,"errorMessage":"Invoice not found"}'), { fel: "refuz", cod: "5", mesaj: "Invoice not found" });
    assert.equal(citesteRaspunsul(200, '{"error":0,"prodId":"5"}')?.fel, "date");
  });
  test("⚠ `status` 0 SI 1 inseamna reusita, dupa metoda: nu se judeca dupa el", () => {
    assert.equal(citesteRaspunsul(200, '{"valueWithoutVat":"400.00","vatValue":"76.00","status":0,"convertedPrice":"200.00","prodId":"2981336"}')?.fel, "date");
    assert.equal(citesteRaspunsul(200, '{"statusMessage":"Invoice created successfully","status":1,"ebInvoiceNo":"92032900"}')?.fel, "date");
  });
  test("⚠ orice alta forma e NECUNOSCUTA, nu reusita si nu refuz", () => {
    assert.equal(citesteRaspunsul(200, "<html>login</html>"), null);
    assert.equal(citesteRaspunsul(200, ""), null);
    assert.equal(citesteRaspunsul(302, "", "https://altundeva.ro/"), null);
  });
  test("sesiunea si firma din exemplele lor", () => {
    assert.deepEqual(sesiuneDinRaspuns(DIN_DOC.autentificare), { SessionId: "0d0d6a7aebbe51f63d3e9abdb18a6d42", AppUnique: "44235149x19418608", UserId: "507" });
    assert.equal(sesiuneDinRaspuns({ status: -2 }), null);
    assert.deepEqual(firmaDinRaspuns(DIN_DOC.firma), { nume: "Easybill Digital S.R.L.", cui: "30305759", anafUrl: "https://apps.easybill.ro/anaf-connect/LE9KI", faraTva: false });
    assert.equal(firmaDinRaspuns({ ...DIN_DOC.firma, anafConnectionURL: "https://rau.example/anaf" })?.anafUrl, null, "legatura ANAF doar spre easybill");
  });
  test("mesajele: pasul urmator, iar brutul ramane citat", () => {
    assert.match(mesajEasybill(null, "Invalid username or password"), /API Management/);
    assert.match(mesajEasybill("5", "Ceva nou"), /Ceva nou \(cod 5\)/);
    assert.match(mesajEasybill("5", "Ceva nou"), /easybill a refuzat cererea/);
  });
});

describe("sesiunea", () => {
  test("o singura autentificare pentru mai multe cereri", async () => {
    const f = easybillFals();
    await testeazaConexiunea(A);
    await testeazaConexiunea(A);
    assert.equal(f.metode().filter((m) => m === "authenticateUser_fct").length, 1);
  });
  test("cereri simultane pe acelasi cont asteapta ACEEASI autentificare", async () => {
    const f = easybillFals();
    await Promise.all([testeazaConexiunea(A), testeazaConexiunea(A), testeazaConexiunea(A)]);
    assert.equal(f.metode().filter((m) => m === "authenticateUser_fct").length, 1);
  });
  test("⚠ sesiunea expirata se reface O DATA, iar cererea pleaca din nou cu sesiunea noua", async () => {
    const f = easybillFals({ peste: { getCompanyInfo_fct: (_c, n) => (n === 1 ? PE_FIR.sesiuneGresita : undefined) } });
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, true);
    assert.deepEqual(f.metode(), ["authenticateUser_fct", "getCompanyInfo_fct", "authenticateUser_fct", "getCompanyInfo_fct"]);
    assert.equal(f.cereri[3].corp.SessionId, "S2");
  });
  test("⚠ refuzata si dupa refacere: se opreste, nu bucleaza", async () => {
    const f = easybillFals({ peste: { getCompanyInfo_fct: () => PE_FIR.sesiuneGresita } });
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, false);
    assert.equal(f.metode().filter((m) => m === "getCompanyInfo_fct").length, 2);
  });
  test("⚠ o parola GRESITA nu primeste sesiunea tinuta pentru cea buna (cheia contine secretul)", async () => {
    const f = easybillFals();
    assert.equal((await testeazaConexiunea(A)).ok, true);
    const inainte = f.metode().filter((m) => m === "authenticateUser_fct").length;
    const r = await testeazaConexiunea({ ...A, password: "GRESITA" });
    assert.equal(r.ok, false, "a primit sesiunea altcuiva");
    assert.equal(f.metode().filter((m) => m === "authenticateUser_fct").length, inainte + 1, "n-a mai atins easybill");
  });
  test("o autentificare picata nu se tine minte", async () => {
    let cad = true;
    const f = easybillFals({ peste: { authenticateUser_fct: () => (cad ? new TypeError("fetch failed") : undefined) } });
    assert.equal((await testeazaConexiunea(A)).ok, false);
    cad = false;
    assert.equal((await testeazaConexiunea(A)).ok, true);
    assert.equal(f.metode().filter((m) => m === "authenticateUser_fct").length, 2);
  });
});

describe("proba de conexiune", () => {
  test("pe fir: utilizator sau parola gresite = REFUZ (salvarea se opreste), cu pasul urmator", async () => {
    easybillFals({ parola: "alta" });
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.refuz, true);
    assert.match(!r.ok ? r.error : "", /API Management/);
  });
  test("pe fir: fara utilizator (`status` -2) = refuz", async () => {
    fir(() => PE_FIR.faraUtilizator);
    const r = await testeazaConexiunea(A);
    assert.equal(!r.ok && r.refuz, true);
  });
  test("fara retea, sau o pagina oarecare: NU e refuz (salvarea trece cu avertisment)", async () => {
    fir(() => new TypeError("fetch failed"));
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.refuz, false);
    uitaSesiunileEasybill();
    fir(() => ({ status: 502, body: "<html>Bad gateway</html>" }));
    const r2 = await testeazaConexiunea(A);
    assert.equal(!r2.ok && r2.refuz, false);
  });
  test("⚠ datele firmei cu `status` negativ: REFUZ (salvarea se opreste), nu forma necunoscuta", async () => {
    easybillFals({ peste: { getCompanyInfo_fct: () => json({ status: -1, StatusMessage: "Access denied" }) } });
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.refuz, true);
  });
  test("reusita: firma, CUI-ul si legatura ANAF", async () => {
    easybillFals();
    const r = await testeazaConexiunea(A);
    assert.ok(r.ok);
    assert.equal(r.firma.nume, "Easybill Digital S.R.L.");
    assert.equal(r.firma.anafUrl, "https://apps.easybill.ro/anaf-connect/LE9KI");
  });
});

describe("emiterea in pasi", () => {
  test("clientul, factura goala, apoi liniile una cate una, toate pe aceeasi factura", async () => {
    const f = easybillFals();
    const e = await emiteFactura(A, factura([linie("Cana", 49.9, 2), linie("Transport", 15, 1)]), PRIMA);
    assert.deepEqual(f.metode(), ["authenticateUser_fct", "addClient_fct", "createInvoice_fct", "addProductToInvoice_fct", "addProductToInvoice_fct"]);
    const creare = f.cereri[2].corp;
    assert.equal(creare.clientId, f.clienti[0].clientId, "factura poarta clientul tocmai creat");
    assert.equal(creare.invoiceExternalId, "EDN-ABCDEF123456");
    for (const c of f.cereri.slice(3)) {
      assert.equal(c.corp.invoiceId, e.cheie);
      assert.equal(c.corp.invoiceIdType, "id");
    }
    assert.equal(f.facturi.get(e.cheie)?.linii.length, 2);
    assert.equal(e.reluata, false);
  });
  test("firma: se refoloseste clientul cu ACELASI CUI, nu unul care doar il contine", async () => {
    const f = easybillFals({ clienti: [{ clientId: "500", clientCIF: "RO514399840" }, { clientId: "501", clientCIF: "RO14399840" }] });
    await emiteFactura(A, factura([linie("Cana", 10, 1)], {
      client: { campuri: { clientName: "Firma SRL", xType: "LE", clientCIF: "RO14399840" }, cuiDeCautat: "14399840" },
    }), PRIMA);
    assert.ok(!f.metode().includes("addClient_fct"));
    assert.equal(f.cereri.find((c) => c.sec === "createInvoice_fct")?.corp.clientId, "501");
  });
  test("⚠ clientul picat (chiar si nesigur) e REFUZ: nu exista inca nicio factura", async () => {
    const f = easybillFals({ peste: { addClient_fct: () => termen() } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA), (e: unknown) => esuat(e) && /Nu s-a emis nicio factură/.test(String(e)));
    assert.ok(!f.metode().includes("createInvoice_fct"));
  });
  test("factura goala refuzata de ei = REFUZ; nicio linie nu pleaca", async () => {
    const f = easybillFals({ peste: { createInvoice_fct: () => json({ error: 3, errorMessage: "Client not found" }) } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA), esuat);
    assert.ok(!f.metode().includes("addProductToInvoice_fct"));
  });
  test("⚠ factura goala: legatura rupta, termen, pagina de eroare, 5xx, succes fara id = NU STIM", async () => {
    for (const r of [
      new TypeError("fetch failed"),
      termen(),
      PE_FIR.acreditariGresite,
      PE_FIR.metodaNecunoscuta,
      { status: 502, body: "<html>Bad gateway</html>" },
      json({ statusMessage: "Invoice created successfully", status: 1 }),
      json({ status: 0 }),
    ] as (Raspuns | Error)[]) {
      uitaSesiunileEasybill();
      easybillFals({ peste: { createInvoice_fct: () => r } });
      await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA), necunoscut, JSON.stringify(r instanceof Error ? r.name : r));
    }
  });
  test("⚠ sesiunea expirata la creare: se reface si factura se creeaza O SINGURA data", async () => {
    const f = easybillFals({ peste: { createInvoice_fct: (_c, n) => (n === 1 ? PE_FIR.sesiuneGresita : undefined) } });
    await emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA);
    assert.equal(f.facturi.size, 1);
  });
  test("⚠ dupa crearea facturii, chiar si un REFUZ dovedit al unei linii iese NU STIM, cu id-ul in mesaj", async () => {
    const f = easybillFals({ peste: { addProductToInvoice_fct: (_c, n) => (n === 2 ? json({ error: 7, errorMessage: "Invalid VAT" }) : undefined) } });
    let id = "";
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1), linie("Farfurie", 5, 1), linie("Lingura", 1, 1)]), PRIMA), (e: unknown) => {
      id = [...f.facturi.keys()][0];
      return necunoscut(e) && String(e).includes(id) && /1 din 3 linii/.test(String(e));
    });
    assert.equal(f.metode().filter((m) => m === "addProductToInvoice_fct").length, 2, "s-a mers mai departe dupa linia refuzata");
  });
  test("⚠ linia cu legatura rupta, dar AJUNSA: se citeste factura si NU se trimite a doua oara", async () => {
    let fals: ReturnType<typeof easybillFals> | null = null;
    fals = easybillFals({
      peste: {
        addProductToInvoice_fct: (c, n) => {
          if (n !== 1) return undefined;
          /* Linia ajunge la ei, raspunsul se pierde. */
          const fact = fals!.facturi.get(c.corp.invoiceId)!;
          fact.linii.push({ id: "1999", nume: c.corp.productName, cant: c.corp.productQuantity, valoare: 8.26, tva: 1.74 });
          return termen();
        },
      },
    });
    const e = await emiteFactura(A, factura([linie("Cana", 10, 1), linie("Farfurie", 5, 1)]), PRIMA);
    assert.deepEqual(fals.facturi.get(e.cheie)?.linii.map((l) => l.nume), ["Cana", "Farfurie"]);
    assert.equal(fals.metode().filter((m) => m === "getInvoiceProducts_fct").length, 1);
  });
  test("linia cu legatura rupta si NEAJUNSA: se trimite din nou, o data", async () => {
    const f = easybillFals({ peste: { addProductToInvoice_fct: (_c, n) => (n === 1 ? termen() : undefined) } });
    const e = await emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA);
    assert.deepEqual(f.facturi.get(e.cheie)?.linii.map((l) => l.nume), ["Cana"]);
  });
  test("⚠ o linie socotita altfel de easybill (TVA pus a doua oara) opreste emiterea la PRIMA linie", async () => {
    const f = easybillFals({ ignoraPretCuTva: true });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 100, 1), linie("Farfurie", 50, 1)]), PRIMA), (e: unknown) =>
      necunoscut(e) && /121,00 lei/.test(String(e)) && /100,00 lei/.test(String(e)));
    assert.equal(f.metode().filter((m) => m === "addProductToInvoice_fct").length, 1);
  });
});

describe("reluarea fara id (plasa): factura ramasa cautata dupa marcaj", () => {
  const ramasa = ramasaFalsa;

  test("⚠ gasita dupa marcaj: NU se creeaza alta, i se adauga doar liniile care lipsesc", async () => {
    const f = easybillFals({ facturi: [ramasa()] });
    const e = await emiteFactura(A, factura([linie("Cana", 10, 1), linie("Farfurie", 5, 1)]), RELUARE);
    assert.equal(e.cheie, "77");
    assert.equal(e.reluata, true);
    assert.equal(e.liniiAdaugate, 1);
    assert.ok(!f.metode().includes("createInvoice_fct"));
    assert.ok(!f.metode().includes("addClient_fct"));
    assert.deepEqual(f.facturi.get("77")?.linii.map((l) => l.nume), ["Cana", "Farfurie"]);
  });
  test("anulata de om: nu mai conteaza, se emite alta", async () => {
    const f = easybillFals({ facturi: [ramasa({ anulata: true })] });
    const e = await emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE);
    assert.notEqual(e.cheie, "77");
    assert.equal(f.metode().filter((m) => m === "createInvoice_fct").length, 1);
  });
  test("cu alte linii decat comanda: refuz, nu o completeaza si nu emite alta", async () => {
    const f = easybillFals({ facturi: [ramasa({ linii: [{ id: "10", nume: "Altceva", cant: "3", valoare: 7.44, tva: 1.56 }] })] });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE), (e: unknown) => esuat(e) && /nu se potrivesc/.test(String(e)));
    assert.ok(!f.metode().includes("createInvoice_fct") && !f.metode().includes("addProductToInvoice_fct"));
  });
  test("doua ramase neanulate: refuz, omul alege", async () => {
    easybillFals({ facturi: [ramasa(), ramasa({ id: "78", numar: "956" })] });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE), (e: unknown) => esuat(e) && /2 facturi/.test(String(e)));
  });
  test("⚠ cautarea picata (citire) e refuz: nu se emite pe orbeste", async () => {
    const f = easybillFals({ peste: { searchInvoices_fct: () => new TypeError("fetch failed") } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE), esuat);
    assert.ok(!f.metode().includes("createInvoice_fct"));
  });
  test("negasita: se creeaza, iar factura noua se citeste (easybill ar putea intoarce una veche pentru acelasi id extern)", async () => {
    const f = easybillFals();
    const e = await emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE);
    assert.deepEqual(f.metode(), [
      "authenticateUser_fct", "searchInvoices_fct", "searchInvoices_fct", "addClient_fct", "createInvoice_fct",
      "getInvoiceProducts_fct", "addProductToInvoice_fct",
    ]);
    assert.equal(f.facturi.get(e.cheie)?.linii.length, 1);
  });
});

describe("liniile deja puse", () => {
  const plan = [linie("Cana", 10, 2), linie("Farfurie", 5, 1), linie("Discount", 3, -1)];
  /** O linie citita de la ei; valoarea si TVA-ul pe bucata vin din plan, daca nu sunt date. */
  const citita = (
    id: string, nume: string, cantitate: number, anulata = false,
    pret?: number | null, tvaUnitar?: number | null,
  ): LinieCitita => {
    const p = plan.find((x) => x.campuri.productName === nume);
    const q = Math.abs(cantitate) || 1;
    return {
      id, nume, cantitate, cota: 21, anulata,
      pret: pret !== undefined ? pret : p ? Math.abs(p.valoare) / q : null,
      tvaUnitar: tvaUnitar !== undefined ? tvaUnitar : p ? Math.abs(p.tva) / q : null,
    };
  };
  test("⚠ in ordinea id-urilor, nu in ordinea primita (ei le dau de la noua la veche)", () => {
    assert.equal(liniiDejaPuse([citita("12", "Farfurie", 1), citita("11", "Cana", 2)], plan), 2);
  });
  test("liniile anulate nu se numara; altceva decat inceputul planului = null", () => {
    assert.equal(liniiDejaPuse([citita("11", "Cana", 2), citita("12", "Farfurie", 1, true)], plan), 1);
    assert.equal(liniiDejaPuse([citita("11", "Cana", 3)], plan), null);
    assert.equal(liniiDejaPuse([citita("11", "Farfurie", 1)], plan), null);
    assert.equal(liniiDejaPuse([], plan), 0);
  });
  test("⚠ numele si cantitatea nu ajung: alta valoare sau alt TVA = nepotrivire", () => {
    assert.equal(liniiDejaPuse([citita("11", "Cana", 2, false, 10, 2.1)], plan), null, "TVA pus de doua ori pe aceeasi linie");
    assert.equal(liniiDejaPuse([citita("11", "Cana", 2, false, 8.26, 3)], plan), null);
    assert.equal(liniiDejaPuse([citita("11", "Cana", 2, false, 10)], plan), null, "alta valoare, cu TVA-ul bun");
  });
  test("⚠ o valoare LIPSA sau NECITIBILA e nepotrivire, nu un pas sarit", () => {
    assert.equal(liniiDejaPuse([citita("11", "Cana", 2, false, null)], plan), null);
    assert.equal(liniiDejaPuse([citita("11", "Cana", 2, false, undefined, null)], plan), null);
  });
  test("verificarea pe linie: valoarea SI TVA-ul; prinde un TVA pus de doua ori, nu rotunjirea", () => {
    const l = linie("Cana", 49.9, 2);
    assert.equal(liniaSePotriveste({ valoare: 82.48, tva: 17.32 }, l), true);
    assert.equal(liniaSePotriveste({ valoare: 82.49, tva: 17.31 }, l), true);
    assert.equal(liniaSePotriveste({ valoare: 99.8, tva: 20.96 }, l), false);
    assert.equal(liniaSePotriveste({ valoare: 82.48, tva: 0 }, l), false, "TVA lipsa din socoteala lor");
  });
  test("⚠ raspunsul fara valoare sau fara TVA e nepotrivire", () => {
    const l = linie("Cana", 49.9, 2);
    assert.equal(liniaSePotriveste({ valoare: null, tva: 17.32 }, l), false);
    assert.equal(liniaSePotriveste({ valoare: 82.48, tva: null }, l), false);
  });
});

describe("⚠ reluarea DUPA ID: factura ramasa de pe randul registrului", () => {
  const DUPA_ID: OptiuniEmitere = { reluare: true, ramasa: "77", zile: null, termen: FARA_TERMEN };
  const doua = () => factura([linie("Cana", 10, 1), linie("Farfurie", 5, 1)]);

  test("se citeste DUPA ID si se completeaza, oricat de veche ar fi: fara cautare pe zile, fara factura noua", async () => {
    const f = easybillFals({ facturi: [ramasaFalsa({ data: "2026-09-01" })] });
    const e = await emiteFactura(A, doua(), DUPA_ID);
    assert.equal(e.cheie, "77");
    assert.equal(e.reluata, true);
    assert.equal(e.data, "2026-09-01", "data documentului, nu a completarii");
    assert.ok(f.cereri.filter((c) => c.sec === "searchInvoices_fct").every((c) => c.corp.invoiceId === "77"), "a cautat pe zile");
    assert.ok(!f.metode().includes("createInvoice_fct") && !f.metode().includes("addClient_fct"));
    assert.deepEqual(f.facturi.get("77")?.linii.map((l) => l.nume), ["Cana", "Farfurie"]);
  });
  test("⚠ ANULATA: refuz, nicio factura noua peste ea, iar id-ul ramane pe eroare", async () => {
    const f = easybillFals({ facturi: [ramasaFalsa({ anulata: true })] });
    await assert.rejects(emiteFactura(A, doua(), DUPA_ID), (e: unknown) => esuat(e) && referintaRamasa(e) === "77" && /anulată/.test(String(e)));
    assert.ok(!f.metode().includes("createInvoice_fct"));
  });
  test("disparuta din easybill: refuz, nicio factura noua", async () => {
    const f = easybillFals();
    await assert.rejects(emiteFactura(A, doua(), DUPA_ID), (e: unknown) => esuat(e) && /nu mai apare/.test(String(e)));
    assert.ok(!f.metode().includes("createInvoice_fct"));
  });
  test("⚠ ALT TOTAL decat liniile ei puse de noi: refuz, nu o completeaza", async () => {
    const f = easybillFals({ facturi: [ramasaFalsa({ totalFortat: 50 })] });
    await assert.rejects(emiteFactura(A, doua(), DUPA_ID), (e: unknown) => esuat(e) && /totalul 50,00 lei/.test(String(e)) && /anuleaz-o/i.test(String(e)));
    assert.ok(!f.metode().includes("addProductToInvoice_fct"));
  });
  test("o linie de-a ei cu alt TVA: refuz (nu se potrivesc), nu o completeaza", async () => {
    const f = easybillFals({ facturi: [ramasaFalsa({ linii: [{ ...CANA_LA_EI, valoare: 10, tva: 2.1 }] })] });
    await assert.rejects(emiteFactura(A, doua(), DUPA_ID), (e: unknown) => esuat(e) && /nu se potrivesc/.test(String(e)));
    assert.ok(!f.metode().includes("addProductToInvoice_fct"));
  });
  test("⚠ fara id si cu prima incercare prea veche (zile = null): REFUZ, niciodata creare", async () => {
    const f = easybillFals();
    await assert.rejects(
      emiteFactura(A, doua(), { reluare: true, ramasa: null, zile: null, termen: FARA_TERMEN }),
      (e: unknown) => esuat(e) && /31 de zile/.test(String(e)) && /ref\. EDN-ABCDEF123456/.test(String(e)),
    );
    assert.ok(!f.metode().includes("createInvoice_fct") && !f.metode().includes("searchInvoices_fct"));
  });
});

describe("⚠ dupa crearea facturii, ORICE eroare poarta id-ul ei (registrul il pastreaza)", () => {
  const cheiaCreata = (f: ReturnType<typeof easybillFals>) => [...f.facturi.keys()][0];

  test("linie refuzata de ei: NU STIM, cu id-ul pe eroare, iar omul e trimis s-o ANULEZE", async () => {
    const f = easybillFals({ peste: { addProductToInvoice_fct: (_c, n) => (n === 2 ? json({ error: 7, errorMessage: "Invalid VAT" }) : undefined) } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1), linie("Farfurie", 5, 1)]), PRIMA), (e: unknown) =>
      necunoscut(e) && referintaRamasa(e) === cheiaCreata(f) && /Anuleaz-o/.test(String(e)) && !/Deblochează/.test(String(e)));
  });
  test("linie socotita altfel: id-ul pe eroare si cererea de ANULARE", async () => {
    const f = easybillFals({ ignoraPretCuTva: true });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 100, 1)]), PRIMA), (e: unknown) =>
      necunoscut(e) && referintaRamasa(e) === cheiaCreata(f) && /Anuleaz-o/.test(String(e)));
  });
  test("linie nelamurita (legatura cazuta, citirea picata): id-ul pe eroare si DEBLOCAREA, nu anularea", async () => {
    const f = easybillFals({
      peste: { addProductToInvoice_fct: () => termen(), getInvoiceProducts_fct: () => new TypeError("fetch failed") },
    });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA), (e: unknown) =>
      necunoscut(e) && referintaRamasa(e) === cheiaCreata(f) && /Deblochează/.test(String(e)));
  });
  test("raspunsul la linie fara valoare si TVA: nepotrivire (nu verificare sarita), cu id-ul pe eroare", async () => {
    const f = easybillFals({ peste: { addProductToInvoice_fct: () => json({ status: 0, prodId: "4242" }) } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA), (e: unknown) =>
      necunoscut(e) && referintaRamasa(e) === cheiaCreata(f) && /fără valoare și TVA citibile/.test(String(e)));
  });
  test("INAINTE de factura (clientul picat): fara id pe eroare, nu exista inca nimic", async () => {
    easybillFals({ peste: { addClient_fct: () => json({ error: 2, errorMessage: "Bad client" }) } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), PRIMA), (e: unknown) => esuat(e) && referintaRamasa(e) === null);
  });
});

describe("timpul", () => {
  test("⚠ nu ajunge pentru toate liniile: REFUZ inainte de factura, nimic creat", async () => {
    const f = easybillFals();
    const linii = Array.from({ length: 10 }, (_, i) => linie(`Produs ${i}`, 10, 1));
    await assert.rejects(
      emiteFactura(A, factura(linii), { ...PRIMA, termen: 100_000, ceas: () => 100_000 - 5 * MS_PE_PAS }),
      (e: unknown) => esuat(e) && referintaRamasa(e) === null && /N-am creat nicio factură/.test(String(e)),
    );
    assert.ok(!f.metode().includes("createInvoice_fct"));
  });
  test("⚠ termenul trece intre linii: se opreste, NU STIM, cu id-ul pe eroare si deblocarea in mesaj", async () => {
    let acum = 0;
    const f = easybillFals({ peste: { addProductToInvoice_fct: (_c, n) => { if (n === 1) acum = 99_000; return undefined; } } });
    await assert.rejects(
      emiteFactura(A, factura([linie("Cana", 10, 1), linie("Farfurie", 5, 1)]), { ...PRIMA, termen: 100_000, ceas: () => acum }),
      (e: unknown) => necunoscut(e) && referintaRamasa(e) === [...f.facturi.keys()][0] && /timpul/.test(String(e)) && /Deblochează/.test(String(e)),
    );
    assert.equal(f.metode().filter((m) => m === "addProductToInvoice_fct").length, 1);
  });
});

describe("lista lor de facturi: plafon explicit", () => {
  test("⚠ cautarea dupa marcaj cere `limit`; o zi plina, fara potrivire, e REFUZ (o lipsa nedovedita)", async () => {
    const f = easybillFals({ umplutura: { "2026-11-17": LIMITA_LISTA } });
    await assert.rejects(emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE), (e: unknown) => esuat(e) && /poate fi incompletă/.test(String(e)));
    assert.equal(f.cereri.find((c) => c.sec === "searchInvoices_fct")?.corp.limit, String(LIMITA_LISTA));
    assert.ok(!f.metode().includes("createInvoice_fct"));
  });
  test("o zi cu putine randuri nu e plina: cautarea merge mai departe", async () => {
    const f = easybillFals({ umplutura: { "2026-11-17": 3 } });
    await emiteFactura(A, factura([linie("Cana", 10, 1)]), RELUARE);
    assert.equal(f.metode().filter((m) => m === "createInvoice_fct").length, 1);
  });
});

describe("citirea de dupa emitere", () => {
  test("⚠ ciorna se intoarce pe loc, si fara numar: altfel avertismentul de ciorna n-ar ajunge la om", async () => {
    const f = easybillFals({ facturi: [ramasaFalsa({ numar: "", stare: "draft" })] });
    const c = await citesteDupaEmitere(A, "77", [0, 0, 0]);
    assert.equal(c?.stare, "draft");
    assert.equal(f.metode().filter((m) => m === "searchInvoices_fct").length, 1);
  });
  test("fiscala fara numar inca: se mai citeste, apoi null (numarul se citeste la cerere)", async () => {
    const f = easybillFals({ facturi: [ramasaFalsa({ numar: "" })] });
    assert.equal(await citesteDupaEmitere(A, "77", [0, 0, 0]), null);
    assert.equal(f.metode().filter((m) => m === "searchInvoices_fct").length, 3);
  });
});

describe("numerele din raspunsul lor", () => {
  test("doar forme fara ambiguitate; cu separator de mii = necitibil, nu ghicit", () => {
    assert.equal(numar("200.00"), 200);
    assert.equal(numar("-8.26"), -8.26);
    assert.equal(numar("1234,56"), 1234.56);
    assert.equal(numar(5), 5);
    assert.equal(numar("1.234,56"), null);
    assert.equal(numar("1,234.56"), null);
    assert.equal(numar("1e3"), null, "nu e o suma scrisa de om");
    assert.equal(numar("0x10"), null);
    assert.equal(numar("+5"), null);
    assert.equal(numar(""), null);
    assert.equal(numar("abc"), null);
  });
});

describe("citirea facturii", () => {
  test("alege CHIAR factura cu id-ul cerut", async () => {
    fir((c) => (c.sec === "authenticateUser_fct" ? json(DIN_DOC.autentificare) : json([
      { invoiceId: "1", invoiceSerie: "X", invoiceNumber: "9" },
      { invoiceId: "92032900", invoiceSerie: "EBF", invoiceNumber: "955", invoiceTotalAmount: 1904, invoiceStatus: "fiscal", invoiceIsCancelled: "0" },
    ])));
    const f = await citesteFactura(A, "92032900");
    assert.equal(f?.serie, "EBF");
    assert.equal(f?.numar, "955");
    assert.equal(f?.total, 1904);
    assert.equal(f?.anulata, false);
  });
  test("lipsa = null; o citire picata e REFUZ", async () => {
    fir((c) => (c.sec === "authenticateUser_fct" ? json(DIN_DOC.autentificare) : json([{ invoiceId: "6" }])));
    assert.equal(await citesteFactura(A, "5"), null);
    uitaSesiunileEasybill();
    fir((c) => (c.sec === "authenticateUser_fct" ? json(DIN_DOC.autentificare) : new TypeError("fetch failed")));
    await assert.rejects(citesteFactura(A, "5"), esuat);
  });
});

describe("PDF-ul", () => {
  test("octetii unui PDF trec; se cere `downloadInvoice_fct` dupa id", async () => {
    const f = easybillFals();
    const octeti = await pdfFactura(A, "92032900");
    assert.ok(octeti.byteLength > 5);
    const c = f.cereri.find((x) => x.sec === "downloadInvoice_fct");
    assert.equal(c?.corp.fact, "92032900");
    assert.equal(c?.corp.json, undefined, "fara `json=1`: PDF-ul ar putea veni altfel");
  });
  test("⚠ sesiunea expirata se reface si PDF-ul vine", async () => {
    const f = easybillFals({ peste: { downloadInvoice_fct: (_c, n) => (n === 1 ? PE_FIR.sesiuneGresita : undefined) } });
    await pdfFactura(A, "1");
    assert.equal(f.metode().filter((m) => m === "authenticateUser_fct").length, 2);
  });
  test("⚠ un JSON de eroare, pagina de eroare sau HTML NU pleaca drept PDF", async () => {
    easybillFals({ peste: { downloadInvoice_fct: () => json({ error: 5, errorMessage: "Invoice not found" }) } });
    await assert.rejects(pdfFactura(A, "1"), /Invoice not found/);
    uitaSesiunileEasybill();
    easybillFals({ peste: { downloadInvoice_fct: () => PE_FIR.metodaNecunoscuta } });
    await assert.rejects(pdfFactura(A, "1"), /pagina lor de eroare/);
    uitaSesiunileEasybill();
    easybillFals({ peste: { downloadInvoice_fct: () => ({ body: "<html>login</html>" }) } });
    await assert.rejects(pdfFactura(A, "1"), /nu a trimis un PDF/);
  });
  test("prea mare: refuzat inainte sa plece mai departe", async () => {
    easybillFals({ peste: { downloadInvoice_fct: () => ({ body: new Uint8Array(MARIME_MAXIMA_PDF + 10).fill(0x25) }) } });
    await assert.rejects(pdfFactura(A, "1"), /prea mare/);
  });
});

describe("incasarea", () => {
  test("plata cu cardul, pe factura, suma cu doi bani; `status` \"0\" (text) e reusita", async () => {
    const f = easybillFals();
    await inregistreazaIncasarea(A, { idFactura: "92032900", suma: 39.9, data: "2026-11-17", numar: "0012", detalii: "Plata online", platitor: "Ion" });
    const c = f.cereri.find((x) => x.sec === "addPayment_fct")!.corp;
    assert.equal(c.invoiceId, "92032900");
    assert.equal(c.type, "card");
    assert.equal(c.amount, "39.90");
    assert.equal(c.currency, "RON");
  });
  test("⚠ alt `status` e NU STIM (o plata dubla ar dubla incasarea); `error` e refuz", async () => {
    easybillFals({ peste: { addPayment_fct: () => json({ status: 1 }) } });
    await assert.rejects(inregistreazaIncasarea(A, { idFactura: "1", suma: 1, data: "2026-11-17", numar: "1", detalii: "", platitor: "" }), necunoscut);
    uitaSesiunileEasybill();
    easybillFals({ peste: { addPayment_fct: () => json({ error: 2, errorMessage: "Amount exceeds balance" }) } });
    await assert.rejects(inregistreazaIncasarea(A, { idFactura: "1", suma: 1, data: "2026-11-17", numar: "1", detalii: "", platitor: "" }), esuat);
  });
});
