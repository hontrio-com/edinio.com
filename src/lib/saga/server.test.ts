import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  comenziDeExportat, contextulMagazinului, exportaComanda, sagaPermiteReemiterea, stareaPanouluiSaga, type OptiuniExport,
} from "./server";
import { cheiaDocumentului } from "./document-sursa";
import { mesajStornariLipsa } from "./config";
import { golesteRapoarteleComenzilorSterse } from "./jurnal";

/*
 * Exportul si garda de reemitere, PE PURTARE: cu o baza falsa (tabelele si functiile pe care le cheama
 * codul) si un fir fals catre SAGA. Ce conteaza aici e cablarea pe care regulile pure nu o pot vedea:
 * termenul verificat inaintea FIECARUI document, stornarea care asteapta factura (si cand nu o asteapta),
 * data documentului, TVA-ul casei, registrul fara textul SAGA, semnalarea facturii inlocuite, si garda
 * care nu arunca niciodata si citeste de cel mult trei ori.
 */

/* ═══ baza falsa ═══ */

type Rasp = { data?: unknown; error?: { message: string } | null };
interface Apel {
  tabela: string; op: "select" | "insert" | "update" | "delete"; coloane: string; filtre: unknown[][]; valoare?: unknown;
  /** `maybeSingle()`: un rand, nu o lista. */
  unic?: boolean;
}

/** Filtrele simple ale cererii (`eq`, `gte`, `in`), aplicate pe randurile care au coloana. */
function filtreaza(randuri: Record<string, unknown>[], a: Apel): Record<string, unknown>[] {
  return randuri.filter((r) => a.filtre.every(([op, col, val]) => {
    const c = String(col);
    if (!(c in r)) return true;
    if (op === "eq") return r[c] === val;
    if (op === "gte") return Date.parse(String(r[c])) >= Date.parse(String(val));
    if (op === "in") return Array.isArray(val) && val.includes(r[c]);
    return true;
  }));
}

interface Scena {
  config?: Record<string, unknown> | null;
  configCazuta?: boolean;
  comanda?: Record<string, unknown> | null;
  comandaCazuta?: boolean;
  jurnal?: Record<string, unknown>[];
  jurnalCazut?: boolean;
  emiteri?: Record<string, unknown>[];
  tva?: Record<string, unknown>;
  /** Raspunsul registrului la rezervare, dupa cheia operatiei. Implicit: rezervat. */
  rezerva?: (cheie: string) => Record<string, unknown>;
  /** `from` arunca pe loc (clientul stricat). */
  arunca?: boolean;
}

function bazaFalsa(s: Scena) {
  const apeluri: Apel[] = [];
  const rpcuri: { nume: string; args: Record<string, unknown> }[] = [];
  const inserate: Record<string, unknown>[] = [];
  let operatii = 0;

  const raspunde = (a: Apel): Rasp => {
    switch (a.tabela) {
      case "store_settings":
        if (a.coloane.includes("saga_config")) {
          if (s.configCazuta) return { error: { message: "baza cazuta" } };
          return { data: { saga_config: s.config ?? null } };
        }
        return { data: s.tva ?? { vat_enabled: true, vat_rate: 21, prices_include_vat: true, sb_cota: "Normala", sb_exista: "true", ob_cota: null, ob_exista: null } };
      case "businesses":
        return { data: { business_name: "Magazin SRL", reg_com: "J12/1/2020", address: "Str. Fabricii 1", city: "Cluj-Napoca", county: "Cluj" } };
      case "orders": {
        if (s.comandaCazuta) return { error: { message: "baza cazuta" } };
        const c = s.comanda === undefined ? COMANDA : s.comanda;
        return { data: a.unic ? c : (c ? [c] : []) };
      }
      case "saga_exporturi":
        if (a.op === "insert") {
          inserate.push(a.valoare as Record<string, unknown>);
          return {};
        }
        if (s.jurnalCazut) return { error: { message: "baza cazuta" } };
        return { data: s.jurnal ?? [] };
      case "operatii_externe":
        return { data: filtreaza((s.emiteri ?? EMITERI).map((e) => ({ order_id: "ord-1", ...e })), a) };
      default:
        return { data: [] };
    }
  };

  const from = (tabela: string) => {
    if (s.arunca) throw new Error("clientul s-a stricat");
    const apel: Apel = { tabela, op: "select", coloane: "", filtre: [] };
    apeluri.push(apel);
    const rezolva = async (unic = false) => {
      apel.unic = unic;
      const r = raspunde(apel);
      return { data: r.data ?? null, error: r.error ?? null };
    };
    const lant: object = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => rezolva().then(ok, ko);
        }
        if (prop === "maybeSingle" || prop === "single") return () => rezolva(true);
        return (...args: unknown[]) => {
          if (prop === "select" && apel.op === "select") apel.coloane = String(args[0] ?? "*");
          else if (prop === "insert" || prop === "update" || prop === "delete") {
            apel.op = prop;
            apel.valoare = args[0];
          } else apel.filtre.push([String(prop), ...args]);
          return lant;
        };
      },
    });
    return lant;
  };

  const rpc = async (nume: string, args: Record<string, unknown>) => {
    rpcuri.push({ nume, args });
    switch (nume) {
      case "saga_ocupa_apelul": return { data: true, error: null };
      case "rezerva_operatie_externa": {
        const r = s.rezerva?.(String(args.p_cheie)) ?? { rezervat: true, id: `op-${++operatii}` };
        return { data: r, error: null };
      }
      case "incheie_operatie_externa": return { data: { gasit: true }, error: null };
      case "saga_roteste_cheia": return { data: true, error: null };
      default: return { data: null, error: null };
    }
  };

  return { admin: { from, rpc } as unknown as SupabaseClient<Database>, apeluri, rpcuri, inserate };
}

/* ═══ firul fals catre SAGA ═══ */

const fetchOriginal = globalThis.fetch;
const acumOriginal = Date.now;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  Date.now = acumOriginal;
});

interface Trimis { url: string; fisier: string | null; xml: Promise<string> | null }

function fir(raspunsuri: { status: number; body: string }[], dupaFiecare?: () => void): Trimis[] {
  const trimise: Trimis[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const f = init?.body instanceof FormData ? (init.body.get("file") as File | null) : null;
    trimise.push({ url: String(url), fisier: f?.name ?? null, xml: f ? f.text() : null });
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    dupaFiecare?.();
    return new Response(r.body, { status: r.status });
  }) as typeof fetch;
  return trimise;
}

/* ═══ datele ═══ */

const CONFIG = {
  enabled: true, api_key: "cheie-test-0001", cod_fiscal: "RO12345678", import_automat: true, trimite_stornari: true,
  trimitere_automata: false, trimitere_automata_de_la: null, clienti_pf: "fiecare", nume_client_generic: "",
  tva_la_incasare: false, gestiune: "",
};

const COMANDA: Record<string, unknown> = {
  id: "ord-1", business_id: "biz-1", order_number: "1042", customer_name: "Ion Popescu", billing_company: null,
  shipping_address: { address: "Str. Lunga 5", city: "Cluj-Napoca", county: "Cluj", country: "RO" },
  items: [{ name: "Cana", price: 50, quantity: 2, product_id: null }],
  shipping_cost: 15.99, discount_amount: 10, discount_code: "TOAMNA", card_discount_amount: 0, cod_discount_amount: 0,
  cod_fee_amount: 0, total: 105.99, vat_rate: 21, vat_amount: 18.4, prices_include_vat: true, payment_status: "paid",
  smartbill_invoice_series: "EDN", smartbill_invoice_number: "0001", smartbill_invoice_url: "https://ext.smartbill.ro/x",
  smartbill_storno_series: "EDN", smartbill_storno_number: "0002",
};

/*
 * Factura: casa a scris ziua documentului (contractul C1), 9 noiembrie. Stornarea: fara ea, iar randul e
 * din noaptea de 12 spre 13 (23:30 UTC = 01:30 la noi): SmartBill a datat-o cu ziua UTC, 12.
 */
const EMITERI = [
  { fel: "storno", furnizor: "smartbill", referinta_externa: "0002", creat_la: "2026-11-12T23:30:00Z", detalii: null },
  { fel: "factura", furnizor: "smartbill", referinta_externa: "0001", creat_la: "2026-11-10T08:00:00Z", detalii: { data: "2026-11-09" } },
];

const rand = (tip: "factura" | "storno", numar: string, stare: string, creatLa = "2026-11-13T08:00:00Z") => ({
  id: `j-${tip}-${numar}-${stare}-${creatLa}`, order_id: "ord-1", cheie: cheiaDocumentului(tip, "smartbill", "EDN", numar),
  casa: "smartbill", tip, serie: "EDN", numar, data_document: "2026-11-09", total: tip === "factura" ? 105.99 : -105.99,
  stare, cod_http: null, import_automat: true, sursa: "manual", fisier: null, mesaj: null, raport: null, creat_la: creatLa,
});

const OK_IMPORT = { status: 200, body: '{"success":true,"message":"Import realizat"}' };
const MANUAL: OptiuniExport = { sursa: "manual", asteptareMs: 0 };

async function exporta(s: Scena, o: OptiuniExport = MANUAL) {
  const b = bazaFalsa({ config: CONFIG, ...s });
  const r = await exportaComanda(b.admin, "biz-1", "ord-1", o);
  if ("error" in r) throw new Error(r.error);
  return { ...b, r };
}

/* ═══ probele ═══ */

describe("⚠ termenul: inaintea FIECARUI document, nu doar a comenzii", () => {
  test("termenul trecut: nimic nu porneste, nici rezervarea in registru", async () => {
    const trimise = fir([OK_IMPORT]);
    const { r, rpcuri } = await exporta({}, { ...MANUAL, termen: Date.now() - 1 });
    assert.equal(r.oprire, "timp");
    assert.equal(r.trimise, 0);
    assert.equal(trimise.length, 0);
    assert.equal(rpcuri.filter((x) => x.nume === "rezerva_operatie_externa").length, 0);
  });

  test("timpul se termina dupa factura: stornarea aceleiasi comenzi nu mai porneste", async () => {
    const inceput = acumOriginal();
    const trimise = fir([OK_IMPORT], () => {
      Date.now = () => inceput + 60_000;
    });
    const { r } = await exporta({}, { ...MANUAL, termen: inceput + 30_000 });
    assert.equal(trimise.length, 1, "a plecat doar factura");
    assert.match(trimise[0].fisier ?? "", /EDN0001/);
    assert.equal(r.trimise, 1);
    assert.equal(r.oprire, "timp");
  });
});

describe("⚠ stornarea si factura ei", () => {
  test("factura respinsa ACUM: stornarea asteapta; registrul primeste starea si codul, NU textul SAGA", async () => {
    const trimise = fir([{ status: 422, body: "Clientul Ion Popescu, Str. Lunga 5: judet lipsa" }]);
    const { r, rpcuri, inserate } = await exporta({});
    assert.equal(trimise.length, 1);
    assert.ok(r.erori.some((e) => /pleacă după ce intră factura/.test(e)));
    assert.deepEqual(r.probleme, [{ eticheta: "Factura SmartBill EDN0001", stare: "respins" }]);

    const incheiere = rpcuri.find((x) => x.nume === "incheie_operatie_externa");
    const eroare = String(incheiere?.args.p_eroare ?? "");
    assert.match(eroare, /cod 422/);
    assert.doesNotMatch(eroare, /Popescu|Lunga/, "textul SAGA nu intra in registru");
    /* Jurnalul magazinului pastreaza raportul intreg. */
    assert.equal(inserate.length, 1);
    assert.equal(inserate[0].stare, "respins");
    assert.match(String(inserate[0].raport), /Popescu/);
  });

  test("⚠ pe calea omului, stornarea pleaca peste o factura NELAMURITA (altfel garda ar fi o fundatura)", async () => {
    const trimise = fir([OK_IMPORT]);
    const { r } = await exporta({
      jurnal: [rand("factura", "0001", "necunoscut")],
      rezerva: (cheie) => (cheie.includes("factura:") ? { rezervat: false, motiv: "alta_intentie", stare: "necunoscut", id: "op-f" } : { rezervat: true, id: "op-s" }),
    });
    assert.equal(trimise.length, 1, "factura nu se retrimite (registrul o tine), stornarea pleaca");
    assert.match(trimise[0].fisier ?? "", /EDN0002/);
    assert.equal(r.trimise, 1);
    assert.ok(r.avertismente.some((a) => /nelămurită/.test(a)), "omul afla ca trebuie sa verifice factura");
  });

  test("pe calea cronului, stornarea NU pleaca peste o factura nelamurita", async () => {
    const trimise = fir([OK_IMPORT]);
    const { r } = await exporta(
      {
        config: { ...CONFIG, trimitere_automata: true, trimitere_automata_de_la: "2026-11-01T00:00:00Z" },
        jurnal: [rand("factura", "0001", "necunoscut")],
      },
      { sursa: "automat", asteptareMs: 0, regulaCron: true, emiseDupa: "2026-11-01T00:00:00Z" },
    );
    assert.equal(trimise.length, 0);
    assert.equal(r.trimise, 0);
  });

  test("stornarea al carei total nu anuleaza factura plecata nu pleaca", async () => {
    const trimise = fir([OK_IMPORT]);
    const { r, inserate } = await exporta({ jurnal: [{ ...rand("factura", "0001", "importat"), total: 99 }] });
    assert.equal(trimise.length, 0);
    assert.equal(inserate[0]?.stare, "nepregatit");
    assert.ok(r.erori.some((e) => /99\.00 lei/.test(e)));
  });

  test("si peste o factura NELAMURITA, stornarea trebuie sa anuleze exact totalul ei", async () => {
    const trimise = fir([OK_IMPORT]);
    const { inserate } = await exporta({
      jurnal: [{ ...rand("factura", "0001", "necunoscut"), total: 99 }],
      rezerva: (cheie) => (cheie.includes("factura:") ? { rezervat: false, motiv: "alta_intentie", stare: "necunoscut", id: "op-f" } : { rezervat: true, id: "op-s" }),
    });
    assert.equal(trimise.length, 0);
    assert.equal(inserate[0]?.stare, "nepregatit");
  });
});

describe("⚠ planul cronului, cu baza", () => {
  /* Pornire pe 11.11; azi 17.11, deci fereastra incepe la pornire. Factura e din 10.11 (de dinainte de
     pornire, in afara ferestrei), stornarea din 12.11 (in fereastra). */
  const config = { ...CONFIG, trimitere_automata: true, trimitere_automata_de_la: "2026-11-11T00:00:00Z" };
  const plan = async (s: Scena) => {
    Date.now = () => Date.parse("2026-11-17T12:00:00Z");
    const b = bazaFalsa({ config, ...s });
    const ctx = await contextulMagazinului(b.admin, "biz-1");
    if ("error" in ctx) throw new Error(ctx.error);
    return { ...b, r: await comenziDeExportat(b.admin, "biz-1", ctx, 10) };
  };

  test("⚠ stornarea unei facturi de DINAINTE de pornire intra in plan: factura se citeste FARA fereastra", async () => {
    const { r, apeluri } = await plan({});
    assert.deepEqual(r, { ok: true, orderIds: ["ord-1"] });
    const faraFereastra = apeluri.find((a) => a.tabela === "operatii_externe" && a.filtre.some((f) => f[0] === "in" && f[1] === "order_id"));
    assert.ok(faraFereastra, "a doua citire, pe comenzile cu stornare");
    assert.ok(!faraFereastra.filtre.some((f) => f[0] === "gte"), "fara fereastra");
  });

  test("factura de DUPA pornire, neintrata si oprita: stornarea ei nu ocupa locul", async () => {
    const { r } = await plan({
      emiteri: [EMITERI[0], { ...EMITERI[1], creat_la: "2026-11-11T08:00:00Z" }],
      jurnal: [rand("factura", "0001", "respins")],
    });
    assert.deepEqual(r, { ok: true, orderIds: [] });
  });
});

describe("panoul comenzii", () => {
  const COMANDA_PANOU = COMANDA as Parameters<typeof stareaPanouluiSaga>[2];
  const panou = async (s: Scena) => {
    const b = bazaFalsa({ config: CONFIG, ...s });
    return stareaPanouluiSaga(b.admin, "biz-1", COMANDA_PANOU);
  };

  test("SAGA neconectat: fara panou", async () => {
    assert.equal(await panou({ config: null }), null);
  });

  test("fiecare document al comenzii, cu ultima trimitere si importul automat AL EI", async () => {
    const p = await panou({ jurnal: [{ ...rand("factura", "0001", "necunoscut"), import_automat: false }] });
    assert.ok(p);
    assert.deepEqual(p.documente.map((d) => d.eticheta), ["Factura SmartBill EDN0001", "Stornarea SmartBill EDN0002"]);
    assert.equal(p.documente[0].ultimul?.stare, "necunoscut");
    assert.equal(p.documente[0].ultimul?.importAutomat, false, "sfatul urmeaza trimiterea, nu setarea de azi");
    assert.equal(p.importAutomat, true);
  });

  test("⚠ documentul fara randul lui in registru spune ca nu pleaca (data necunoscuta)", async () => {
    const p = await panou({ emiteri: [EMITERI[1]] });
    assert.equal(p?.documente[0].blocaj, null);
    assert.match(p?.documente[1].blocaj ?? "", /Data documentului nu se cunoaște/);
  });

  test("⚠ fereastra cronului nu e tacuta: documentul vechi spune ca nu mai pleaca singur", async () => {
    const config = { ...CONFIG, trimitere_automata: true, trimitere_automata_de_la: "2026-11-11T00:00:00Z" };
    const p = await panou({ config });
    assert.match(p?.documente[0].nota ?? "", /înainte de pornirea trimiterii automate/);
    const intrata = await panou({ config, jurnal: [rand("factura", "0001", "importat")] });
    assert.equal(intrata?.documente[0].nota, null, "documentul intrat nu mai are ce sa spuna");
  });

  test("stornarile oprite din setari se spun pe stornare", async () => {
    const p = await panou({ config: { ...CONFIG, trimite_stornari: false } });
    assert.match(p?.documente[1].blocaj ?? "", /stornărilor e oprită/);
  });

  test("⚠ factura inlocuita fara stornare in SAGA se vede in panou", async () => {
    const b = bazaFalsa({
      config: CONFIG,
      emiteri: [{ fel: "factura", furnizor: "smartbill", referinta_externa: "0003", creat_la: "2026-11-14T08:00:00Z", detalii: null }, ...EMITERI],
      jurnal: [rand("factura", "0001", "importat")],
    });
    const p = await stareaPanouluiSaga(b.admin, "biz-1", {
      ...COMANDA_PANOU, smartbill_invoice_number: "0003", smartbill_storno_series: null, smartbill_storno_number: null,
    });
    assert.deepEqual(p?.stornariLipsa, ["Factura SmartBill EDN0001"]);
  });
});

describe("⚠ data documentului", () => {
  test("`detalii.data` a casei (C1) intra in SAGA; fara ea, ziua UTC a randului (SmartBill)", async () => {
    const trimise = fir([OK_IMPORT]);
    await exporta({});
    assert.equal(trimise.length, 2);
    assert.match(trimise[0].fisier ?? "", /_09-11-2026\.xml$/);
    assert.match(await trimise[0].xml!, /<FacturaData>09-11-2026<\/FacturaData>/);
    assert.match(trimise[1].fisier ?? "", /_12-11-2026\.xml$/);
  });

  test("⚠ fara randul CHIAR al documentului in registru: nu pleaca nimic pe o data ghicita", async () => {
    const trimise = fir([OK_IMPORT]);
    const { r, inserate } = await exporta({
      emiteri: [{ fel: "factura", furnizor: "smartbill", referinta_externa: "0999", creat_la: "2026-11-15T08:00:00Z", detalii: null }],
    });
    assert.equal(trimise.length, 0);
    assert.equal(inserate[0]?.stare, "nepregatit");
    assert.ok(r.erori.some((e) => /Data documentului nu se cunoaște/.test(e)));
  });
});

describe("⚠ TVA-ul casei care a emis", () => {
  test("SmartBill fara numele cotei: in SAGA fara TVA; cu nume, cu TVA", async () => {
    let trimise = fir([OK_IMPORT]);
    await exporta({ tva: { vat_enabled: true, vat_rate: 21, prices_include_vat: true, sb_cota: "", sb_exista: "true" } });
    const fara = await trimise[0].xml!;
    assert.match(fara, /<ProcTVA>0<\/ProcTVA>/);
    assert.doesNotMatch(fara, /<ProcTVA>21<\/ProcTVA>/);

    trimise = fir([OK_IMPORT]);
    await exporta({});
    assert.match(await trimise[0].xml!, /<ProcTVA>21<\/ProcTVA>/);
  });

  test("configurarea casei se citeste DOAR pentru numele cotei: fara tokenuri in memoria exportului", async () => {
    const b = bazaFalsa({ config: CONFIG });
    const ctx = await contextulMagazinului(b.admin, "biz-1");
    assert.ok(!("error" in ctx));
    const citire = b.apeluri.find((a) => a.tabela === "store_settings" && a.coloane.includes("vat_enabled"));
    assert.ok(citire);
    assert.match(citire.coloane, /smartbill_config->>tax_name/);
    assert.doesNotMatch(citire.coloane, /(smartbill|oblio)_config\s*(,|$)/);
  });

  test("casa deconectata (configurarea lipsa) nu inseamna fara TVA", async () => {
    const b = bazaFalsa({ config: CONFIG, tva: { vat_enabled: true, vat_rate: 21, prices_include_vat: true, sb_cota: null, sb_exista: null } });
    const ctx = await contextulMagazinului(b.admin, "biz-1");
    assert.ok(!("error" in ctx) && ctx.tvaPeCasa.smartbill === true);
  });
});

describe("⚠⚠ factura inlocuita fara stornare in SAGA", () => {
  /* Pe comanda: factura noua EDN0003. EDN0001 a intrat in SAGA, a fost stornata prin EDN0002 (registrul
     o stie), iar reemiterea a sters stornarea de pe comanda inainte sa plece. */
  const REEMISA = { ...COMANDA, smartbill_invoice_number: "0003", smartbill_storno_series: null, smartbill_storno_number: null };
  const EMITERI_REEMISA = [
    { fel: "factura", furnizor: "smartbill", referinta_externa: "0003", creat_la: "2026-11-14T08:00:00Z", detalii: null },
    ...EMITERI,
  ];

  test("pe calea omului se spune de fiecare data", async () => {
    fir([OK_IMPORT]);
    const { r } = await exporta({ comanda: REEMISA, emiteri: EMITERI_REEMISA, jurnal: [rand("factura", "0001", "importat")] });
    assert.deepEqual(r.stornariLipsa, ["Factura SmartBill EDN0001"]);
    assert.ok(r.avertismente.includes(mesajStornariLipsa(["Factura SmartBill EDN0001"])));
  });

  test("prin cron, O SINGURA data: la prima incercare a documentului care a inlocuit-o", async () => {
    const config = { ...CONFIG, trimitere_automata: true, trimitere_automata_de_la: "2026-11-01T00:00:00Z" };
    const cron: OptiuniExport = { sursa: "automat", asteptareMs: 0, regulaCron: true, emiseDupa: "2026-11-01T00:00:00Z" };
    fir([OK_IMPORT]);
    const prima = await exporta({ config, comanda: REEMISA, emiteri: EMITERI_REEMISA, jurnal: [rand("factura", "0001", "importat")] }, cron);
    assert.deepEqual(prima.r.stornariLipsa, ["Factura SmartBill EDN0001"]);

    fir([OK_IMPORT]);
    const aDoua = await exporta({
      config, comanda: REEMISA, emiteri: EMITERI_REEMISA,
      jurnal: [rand("factura", "0003", "importat", "2026-11-14T09:00:00Z"), rand("factura", "0001", "importat")],
    }, cron);
    assert.deepEqual(aDoua.r.stornariLipsa, []);
  });
});

describe("jurnalul comenzilor sterse", () => {
  test("⚠ raportul si mesajul SAGA (pot numi clientul) se golesc pe randurile fara comanda; randul ramane", async () => {
    const b = bazaFalsa({});
    assert.deepEqual(await golesteRapoarteleComenzilorSterse(b.admin), { ok: true });
    const a = b.apeluri.find((x) => x.tabela === "saga_exporturi");
    assert.equal(a?.op, "update");
    assert.deepEqual(a?.valoare, { raport: null, mesaj: null });
    assert.ok(a?.filtre.some((f) => f[0] === "is" && f[1] === "order_id" && f[2] === null), "doar comenzile sterse (order_id gol)");
  });
});

describe("⚠⚠ sagaPermiteReemiterea (contractul C2)", () => {
  const MESAJ = "Stornarea facturii EDN0001 n-a plecat încă în SAGA. Trimite-o din panoul SAGA al comenzii, apoi emite factura nouă.";
  const garda = async (s: Scena) => {
    const b = bazaFalsa(s);
    return { ...b, g: await sagaPermiteReemiterea(b.admin, "biz-1", "ord-1") };
  };

  test("SAGA neconectat: DA, dintr-o singura citire", async () => {
    const { g, apeluri } = await garda({ config: null });
    assert.deepEqual(g, { ok: true });
    assert.equal(apeluri.length, 1);
  });

  test("factura in SAGA, stornarea netrimisa: NU, cu mesajul din contract, din cel mult trei citiri", async () => {
    const { g, apeluri } = await garda({ config: CONFIG, jurnal: [rand("factura", "0001", "importat")] });
    assert.deepEqual(g, { ok: false, mesaj: MESAJ });
    assert.ok(apeluri.length <= 3, `citiri: ${apeluri.length}`);
    const comanda = apeluri.find((a) => a.tabela === "orders");
    assert.ok(comanda?.filtre.some((f) => f[0] === "eq" && f[1] === "business_id" && f[2] === "biz-1"), "comanda se citeste in magazinul dat");
  });

  test("stornarea intrata: DA; factura neintrata: DA", async () => {
    assert.deepEqual((await garda({ config: CONFIG, jurnal: [rand("storno", "0002", "importat"), rand("factura", "0001", "importat")] })).g, { ok: true });
    assert.deepEqual((await garda({ config: CONFIG, jurnal: [] })).g, { ok: true });
  });

  test("⚠ orice citire cazuta: NU, cu mesaj (o garda care trece pe o pana nu e garda)", async () => {
    for (const s of [{ configCazuta: true }, { comandaCazuta: true }, { jurnalCazut: true }] as Scena[]) {
      const { g } = await garda({ config: CONFIG, ...s });
      assert.equal(g.ok, false, JSON.stringify(s));
      if (!g.ok) assert.match(g.mesaj, /Nu am putut verifica/);
    }
  });

  test("⚠ NU ARUNCA, nici cand clientul bazei arunca", async () => {
    const { g } = await garda({ config: CONFIG, arunca: true });
    assert.equal(g.ok, false);
  });
});
