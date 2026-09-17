import assert from "node:assert/strict";
import { test, describe, before, after, beforeEach } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * CRONUL `gmc-sync` SI WEBHOOK-UL GOOGLE MERCHANT, RULATE CHIAR ELE.
 *
 * ═══ ⚠ CE APARA (17.09.2026) ═══
 *
 * Regulile de la trecerea „conform documentatiei”, pe drumul adevarat: `GET` din cron si `POST` din
 * webhook, cu o baza PostgREST de proba care APLICA filtrele primite (inclusiv `coloana->>cheie` pe
 * jsonb) si un Google de proba care raspunde ca in ghiduri. Probele de pe textul sursei nu vedeau o
 * cheie redenumita, un filtru uitat sau o scriere care nu mai pleaca; astea le vad.
 */

type Rand = Record<string, unknown>;

const ACUM = Date.now();
const minuteDeAcum = (n: number) => ACUM + n * 60_000;
const minuteInUrma = (n: number) => new Date(ACUM - n * 60_000).toISOString();

let setari: Rand[] = [];
let gmc: Rand[] = [];
let coada: Rand[] = [];
let produse: Rand[] = [];
let jurnal: Rand[] = [];
/** Cum raspunde Google la trimiterea unei oferte: cod + REASON. Lipsa inseamna 200. */
let laTrimitere: Record<string, { cod: number; reason?: string }> = {};
/** Cod pentru citirea unei oferte (`products.get`). Lipsa inseamna 200, aprobata. */
let laCitire: Record<string, number> = {};
let abonariExistente: Record<string, Rand[]> = {};
let abonareRefuzata: Record<string, string> = {};
/** Tarile fiecarei surse de date la Google, dupa nume. Lipsa inseamna sursa necunoscuta (404). */
let surse: Record<string, string[] | undefined> = {};
/** Se cheama la fiecare trimitere catre Google: aici „se razgandeste” comerciantul in timpul rularii. */
let inTimpulTrimiterii: (() => void) | null = null;
const laGoogle: { metoda: string; cale: string; corp: unknown }[] = [];

/* ── baza PostgREST de proba ─────────────────────────────────────────────── */

function bucati(s: string): string[] {
  const iesire: string[] = [];
  let adancime = 0;
  let curent = "";
  for (const ch of s) {
    if (ch === "(") adancime++;
    if (ch === ")") adancime--;
    if (ch === "," && adancime === 0) { iesire.push(curent); curent = ""; continue; }
    curent += ch;
  }
  if (curent) iesire.push(curent);
  return iesire;
}

/** Valoarea unei coloane, si `col->>cheie` pe jsonb, ca in PostgREST (text sau null). */
function valoare(r: Rand, coloana: string): unknown {
  const [col, cheie] = coloana.split("->>");
  if (cheie === undefined) return r[col];
  const v = (r[col] as Rand | null | undefined)?.[cheie];
  return v === undefined || v === null ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
}

function potriveste(v: unknown, expr: string): boolean {
  const gol = v === null || v === undefined;
  if (expr === "is.null") return gol;
  if (expr === "not.is.null") return !gol;
  const m = /^(not\.)?(eq|neq|lt|gt|in)\.(.*)$/.exec(expr);
  if (!m) throw new Error(`filtru necunoscut: ${expr}`);
  const [, nu, op, arg] = m;
  if (gol) return false;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  let ok: boolean;
  if (op === "in") ok = arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(s);
  else if (op === "eq") ok = s === arg;
  else if (op === "neq") ok = s !== arg;
  else if (op === "lt") ok = s < arg;
  else ok = s > arg;
  return nu ? !ok : ok;
}

function filtreaza(randuri: Rand[], p: URLSearchParams): Rand[] {
  let rez = randuri.filter((r) => {
    for (const [cheie, expr] of p) {
      if (["select", "order", "limit", "on_conflict", "columns"].includes(cheie)) continue;
      if (cheie === "or") {
        const vreuna = bucati(expr.replace(/^\(|\)$/g, "")).some((c) => {
          const i = c.indexOf(".");
          return potriveste(valoare(r, c.slice(0, i)), c.slice(i + 1));
        });
        if (!vreuna) return false;
        continue;
      }
      if (!potriveste(valoare(r, cheie), expr)) return false;
    }
    return true;
  });
  const ordine = p.get("order");
  if (ordine) {
    const [col, dir] = ordine.split(".");
    rez = [...rez].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
  }
  const limita = p.get("limit");
  return limita ? rez.slice(0, Number(limita)) : rez;
}

function proiecteaza(r: Rand, select: string): Rand {
  if (select === "*") return { ...r };
  const iesire: Rand = {};
  for (const bucata of bucati(select)) {
    const [alias, expr] = bucata.includes(":") ? bucata.split(":") : [bucata, bucata];
    iesire[alias.trim().split("->>").pop()!] = valoare(r, expr.trim());
  }
  return iesire;
}

const TABELE = () => ({ store_settings: setari, gmc_products: gmc, gmc_sync_queue: coada, products: produse, error_logs: jurnal });

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  const select = url.searchParams.get("select");
  let corp = "";
  req.on("data", (c) => { corp += c; });
  req.on("end", () => {
    const json = (cod: number, date: unknown) => { res.writeHead(cod, { "content-type": "application/json" }); res.end(JSON.stringify(date)); };
    const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const lista = (randuri: Rand[]) => (unul ? json(randuri.length ? 200 : 406, randuri[0] ?? { message: "gol" }) : json(200, randuri));
    const cuRaspuns = /return=representation/.test(String(req.headers.prefer ?? ""));
    try {
      if (cale === "rpc/revendica_din_coada") return json(200, coada.map((r) => ({ ...r })));
      const tabele = TABELE() as Record<string, Rand[]>;
      const tabel = tabele[cale];
      if (!tabel) return json(200, []);

      if (req.method === "GET") return lista(filtreaza(tabel, url.searchParams).map((r) => proiecteaza(r, select ?? "*")));

      if (req.method === "PATCH") {
        const petic = JSON.parse(corp || "{}") as Rand;
        const atinse = filtreaza(tabel, url.searchParams);
        for (const r of atinse) Object.assign(r, petic);
        return cuRaspuns ? json(200, atinse.map((r) => proiecteaza(r, select ?? "*"))) : (res.writeHead(204), res.end());
      }

      if (req.method === "DELETE") {
        const sterse = filtreaza(tabel, url.searchParams);
        for (const r of sterse) tabel.splice(tabel.indexOf(r), 1);
        return cuRaspuns ? json(200, sterse.map((r) => proiecteaza(r, select ?? "*"))) : (res.writeHead(204), res.end());
      }

      if (req.method === "POST") {
        const trimis = JSON.parse(corp || "[]") as Rand | Rand[];
        const conflict = url.searchParams.get("on_conflict")?.split(",");
        for (const rand of Array.isArray(trimis) ? trimis : [trimis]) {
          const existent = conflict ? tabel.find((r) => conflict.every((c) => r[c] === rand[c])) : undefined;
          if (existent) Object.assign(existent, rand);
          else tabel.push({ ...rand });
        }
        return cuRaspuns ? json(201, []) : (res.writeHead(201), res.end());
      }
      return json(405, { message: "metoda" });
    } catch (e) {
      json(500, { message: `baza de proba: ${(e as Error).message}` });
    }
  });
});

/* ── Google de proba ─────────────────────────────────────────────────────── */

const fetchAdevarat = globalThis.fetch;
const raspuns = (cod: number, date: unknown) =>
  new Response(JSON.stringify(date), { status: cod, headers: { "content-type": "application/json" } });

function googleFals(intrare: unknown, optiuni?: RequestInit): Response | null {
  const adresa = String(typeof intrare === "object" && intrare && "url" in intrare ? (intrare as { url: string }).url : intrare);
  if (adresa.startsWith("https://oauth2.googleapis.com")) {
    const rt = new URLSearchParams(String(optiuni?.body ?? "")).get("refresh_token");
    if (rt === "rt-revocat") return raspuns(400, { error: "invalid_grant" });
    if (rt === "rt-pana") return raspuns(503, { error: "backend_error" });
    return raspuns(200, { access_token: `jeton-${rt}`, expires_in: 3600 });
  }
  if (!adresa.startsWith("https://merchantapi.googleapis.com")) return null;
  const u = new URL(adresa);
  const cale = decodeURIComponent(u.pathname);
  const metoda = optiuni?.method ?? "GET";
  const corp = typeof optiuni?.body === "string" && optiuni.body ? JSON.parse(optiuni.body) : undefined;
  laGoogle.push({ metoda, cale, corp });
  const cont = /accounts\/(\d+)/.exec(cale)?.[1] ?? "";

  if (cale.endsWith("productInputs:insert")) {
    inTimpulTrimiterii?.();
    const r = laTrimitere[(corp as { offerId: string }).offerId];
    if (r) return raspuns(r.cod, { error: { message: `raspuns ${r.cod}`, details: r.reason ? [{ metadata: { REASON: r.reason } }] : [] } });
    return raspuns(200, corp);
  }
  if (cale.includes("/productInputs/")) return raspuns(200, {});
  if (cale.includes("/products/")) {
    const oferta = cale.split("~").pop() ?? "";
    const cod = laCitire[oferta] ?? 200;
    if (cod !== 200) return raspuns(cod, { error: { message: `raspuns ${cod}` } });
    return raspuns(200, { productStatus: { destinationStatuses: [{ reportingContext: "FREE_LISTINGS", approvedCountries: ["RO"] }] } });
  }
  if (cale.endsWith("/notificationsubscriptions") && metoda === "GET") {
    return raspuns(200, { notificationSubscriptions: abonariExistente[cont] ?? [] });
  }
  if (cale.endsWith("/notificationsubscriptions") && metoda === "POST") {
    if (abonareRefuzata[cont]) return raspuns(400, { error: { message: abonareRefuzata[cont], details: [{ metadata: { REASON: "invalid_argument" } }] } });
    return raspuns(200, { ...(corp as Rand), name: `accounts/${cont}/notificationsubscriptions/nou` });
  }
  if (cale.includes("/dataSources/")) {
    const nume = cale.replace("/datasources/v1/", "");
    if (!(nume in surse)) return raspuns(404, { error: { message: "sursa necunoscuta" } });
    if (metoda === "PATCH") {
      if (u.searchParams.get("updateMask") !== "primaryProductDataSource.countries") return raspuns(400, { error: { message: "masca gresita" } });
      surse[nume] = (corp as { primaryProductDataSource: { countries: string[] } }).primaryProductDataSource.countries;
    }
    const tari = surse[nume];
    return raspuns(200, { name: nume, primaryProductDataSource: { feedLabel: "RO", contentLanguage: "ro", ...(tari ? { countries: tari } : {}) } });
  }
  if (cale.endsWith("/programs")) {
    return raspuns(200, { programs: [
      { name: `accounts/${cont}/programs/free-listings`, state: "ELIGIBLE" },
      { name: `accounts/${cont}/programs/shopping-ads`, state: "NOT_ELIGIBLE" },
    ] });
  }
  return raspuns(404, { error: { message: `neprevazut: ${metoda} ${cale}` } });
}

let GET: (req: unknown) => Promise<Response>;
let POST: (req: unknown) => Promise<Response>;
let NextRequest: (typeof import("next/server"))["NextRequest"];

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.CRON_SECRET = "secret-de-proba";
  globalThis.fetch = (async (intrare: unknown, optiuni?: RequestInit) =>
    googleFals(intrare, optiuni) ?? fetchAdevarat(intrare as string, optiuni)) as typeof fetch;
  ({ GET } = (await import("@/app/api/cron/gmc-sync/route")) as unknown as { GET: typeof GET });
  ({ POST } = (await import("@/app/api/google-merchant/webhook/route")) as unknown as { POST: typeof POST });
  ({ NextRequest } = await import("next/server"));
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  setari = []; gmc = []; coada = []; produse = []; jurnal = [];
  laTrimitere = {}; laCitire = {}; abonariExistente = {}; abonareRefuzata = {}; surse = {};
  inTimpulTrimiterii = null;
  laGoogle.length = 0;
  delete process.env.GMC_WEBHOOK_SECRET;
});

/* ── fixturi ─────────────────────────────────────────────────────────────── */

/** Un magazin conectat, deja abonat si cu programele citite: pasii aceia nu se amesteca in proba. */
function magazin(business_id: string, extra: Rand = {}): Rand {
  return {
    business_id,
    google_merchant_config: {
      connected: true, account_id: "111", refresh_token: "rt-ok", data_source_name: "accounts/111/dataSources/1",
      content_language: "ro", feed_label: "RO", auto_sync: true,
      notification_subscription_name: "accounts/111/notificationsubscriptions/1",
      programe_citite_la: new Date(ACUM).toISOString(),
      sursa_tari_verificate_la: new Date(ACUM).toISOString(),
      ...extra,
    },
  };
}
function produs(id: string, business_id = "biz"): Rand {
  return {
    id, business_id, name: `Produs ${id}`, slug: id, description: null, price: 100, compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"], category: null, is_active: true, is_bundle: false,
    track_inventory: false, stock_quantity: null, weight_grams: null, page_sections: {},
  };
}
function lucrare(id: string, product_id: string, attempts = 0, business_id = "biz"): Rand {
  return { id, business_id, product_id, offer_id: product_id, op: "upsert", attempts, generation: 1, next_retry_at: null };
}
const cerereCron = () => new NextRequest("https://www.edinio.com/api/cron/gmc-sync", { headers: { authorization: "Bearer secret-de-proba" } });
const cfg = (business_id: string) => setari.find((s) => s.business_id === business_id)!.google_merchant_config as Rand;
const laMinute = (iso: unknown) => (Date.parse(String(iso)) - ACUM) / 60_000;
const trimiteri = () => laGoogle.filter((g) => g.cale.endsWith("productInputs:insert"));

/* ═══════════════════════════════════════════════════════════════════════════
   CRONUL
   ═══════════════════════════════════════════════════════════════════════════ */

describe("cronul: tokenul care nu vine nu arunca munca", () => {
  test("⚠ token revocat: lucrarile raman, asteapta o ora, fara incercari consumate", async () => {
    setari = [magazin("biz", { refresh_token: "rt-revocat" })];
    produse = [produs("p1"), produs("p2")];
    coada = [lucrare("q1", "p1", 2), lucrare("q2", "p2")];

    const r = await (await GET(cerereCron())).json() as { amanate: number };

    assert.equal(coada.length, 2, "lucrarile au fost sterse: schimbarile de pret si stoc s-ar fi pierdut");
    for (const q of coada) {
      const m = laMinute(q.next_retry_at);
      assert.ok(m > 58 && m < 62, `asteapta ${m} minute, nu o ora`);
    }
    assert.deepEqual(coada.map((q) => q.attempts), [2, 0], "o pana de token a consumat incercarile produselor");
    assert.equal(trimiteri().length, 0);
    assert.equal(r.amanate, 2);
  });

  test("pana trecatoare la Google: aceleasi lucrari, reluate in 5 minute", async () => {
    setari = [magazin("biz", { refresh_token: "rt-pana" })];
    produse = [produs("p1")];
    coada = [lucrare("q1", "p1")];

    await GET(cerereCron());

    assert.equal(coada.length, 1);
    const m = laMinute(coada[0].next_retry_at);
    assert.ok(m > 3 && m < 7, `asteapta ${m} minute`);
  });

  test("magazinul chiar deconectat: lucrarile lui se sterg (n-au unde pleca)", async () => {
    setari = [magazin("biz", { connected: false })];
    coada = [lucrare("q1", "p1")];

    await GET(cerereCron());

    assert.equal(coada.length, 0);
  });
});

describe("cronul: caderile de la Google", () => {
  test("⚠ 500: incercarea se numara si asteapta crescator, produsul nu e declarat „eroare”", async () => {
    setari = [magazin("biz")];
    produse = [produs("p1"), produs("p2")];
    coada = [lucrare("q1", "p1"), lucrare("q2", "p2", 3)];
    laTrimitere = { p1: { cod: 500, reason: "internal_error" }, p2: { cod: 500, reason: "internal_error" } };

    const r = await (await GET(cerereCron())).json() as { failed: number };

    assert.equal(coada.length, 2);
    const q1 = coada.find((q) => q.id === "q1")!;
    const q2 = coada.find((q) => q.id === "q2")!;
    assert.equal(q1.attempts, 1);
    assert.equal(q2.attempts, 4);
    const m1 = laMinute(q1.next_retry_at);
    const m2 = laMinute(q2.next_retry_at);
    assert.ok(m1 > 0.5 && m1 < 1.5, `prima reincercare peste ${m1} minute, nu 1`);
    assert.ok(m2 > 7.5 && m2 < 8.5, `a patra reincercare peste ${m2} minute, nu 8`);
    assert.equal(gmc.filter((g) => g.status === "error").length, 0);
    assert.equal(r.failed, 2);
  });

  test("⚠ 400: nu se reincearca, iar motivul ajunge pe loc in panou", async () => {
    setari = [magazin("biz")];
    produse = [produs("p1")];
    coada = [lucrare("q1", "p1")];
    laTrimitere = { p1: { cod: 400, reason: "invalid_argument" } };

    await GET(cerereCron());

    assert.equal(coada.length, 0, "un produs respins s-ar fi reincercat degeaba de cinci ori");
    const rand = gmc.find((g) => g.offer_id === "p1");
    assert.equal(rand?.status, "error");
    assert.match(String(rand?.error), /raspuns 400/);
    assert.equal(trimiteri().length, 1);
  });

  test("⚠ limita ZILNICA: nimic consumat, nimic „eroare”, restul magazinului nu mai loveste in Google", async () => {
    setari = [magazin("biz"), magazin("alt", { account_id: "222", data_source_name: "accounts/222/dataSources/1" })];
    produse = [produs("p1"), produs("p2"), produs("p3"), produs("a1", "alt")];
    coada = [lucrare("q1", "p1", 1), lucrare("q2", "p2"), lucrare("q3", "p3"), lucrare("qa", "a1", 0, "alt")];
    laTrimitere = { p1: { cod: 429, reason: "QUOTA_TOO_MANY_REQUESTS" } };

    const r = await (await GET(cerereCron())).json() as { failed: number; amanate: number; synced: number };

    const aleMagazinului = coada.filter((q) => q.business_id === "biz");
    assert.equal(aleMagazinului.length, 3, "lucrari pierdute la limita zilnica");
    const reset = new Date(ACUM);
    let asteptat = Date.UTC(reset.getUTCFullYear(), reset.getUTCMonth(), reset.getUTCDate(), 12, 5, 0);
    if (asteptat - 5 * 60_000 <= ACUM) asteptat += 86_400_000;
    for (const q of aleMagazinului) {
      assert.ok(Math.abs(Date.parse(String(q.next_retry_at)) - asteptat) < 5 * 60_000, `reluare la ${q.next_retry_at}, nu dupa resetarea de la 12:00 UTC`);
    }
    assert.deepEqual(aleMagazinului.map((q) => q.attempts), [1, 0, 0], "limita zilnica a consumat incercari");
    assert.equal(gmc.filter((g) => g.status === "error").length, 0);
    assert.deepEqual(trimiteri().map((t) => (t.corp as { offerId: string }).offerId).sort(), ["a1", "p1"], "dupa limita s-a lovit iar in Google, sau alt magazin a fost oprit");
    assert.equal(r.failed, 0);
    assert.equal(r.amanate, 3);
    assert.equal(r.synced, 1);
  });

  test("limita PE MINUT ramane o cadere obisnuita, cu asteptare scurta", async () => {
    setari = [magazin("biz")];
    produse = [produs("p1")];
    coada = [lucrare("q1", "p1")];
    laTrimitere = { p1: { cod: 429, reason: "QUOTA_REQUEST_RATE_TOO_HIGH" } };

    await GET(cerereCron());

    assert.equal(coada[0].attempts, 1);
    assert.ok(laMinute(coada[0].next_retry_at) < 2);
  });
});

describe("cronul: configurarea", () => {
  test("⚠ ce schimba comerciantul IN TIMPUL rularii nu e calcat de cron", async () => {
    setari = [magazin("biz")];
    produse = [produs("p1")];
    coada = [lucrare("q1", "p1")];
    inTimpulTrimiterii = () => {
      Object.assign(cfg("biz"), { auto_sync: false, category_map: { Rochii: "2271" } });
    };

    await GET(cerereCron());

    assert.equal(cfg("biz").auto_sync, false, "sincronizarea oprita de comerciant a fost repornita de cron");
    assert.deepEqual(cfg("biz").category_map, { Rochii: "2271" });
    assert.ok(cfg("biz").last_sync_at, "cronul nu si-a mai scris ora");
  });

  test("un magazin deconectat in timpul rularii nu se reconecteaza pe dos", async () => {
    setari = [magazin("biz")];
    produse = [produs("p1")];
    coada = [lucrare("q1", "p1")];
    inTimpulTrimiterii = () => { setari[0].google_merchant_config = {}; };

    await GET(cerereCron());

    assert.deepEqual(cfg("biz"), {}, "deconectarea a fost suprascrisa cu configurarea veche");
  });
});

describe("cronul: abonarile si programele magazinelor deja conectate", () => {
  const faraAbonare = (id: string, cont: string, extra: Rand = {}) => {
    const m = magazin(id, { account_id: cont, data_source_name: `accounts/${cont}/dataSources/1`, ...extra });
    delete (m.google_merchant_config as Rand).notification_subscription_name;
    return m;
  };

  test("fara secret nu se aboneaza nimeni", async () => {
    setari = [faraAbonare("b1", "301")];

    await GET(cerereCron());

    assert.equal(laGoogle.filter((g) => g.cale.includes("notificationsubscriptions")).length, 0);
    assert.equal(cfg("b1").abonare_incercata_la, undefined);
  });

  test("⚠ cu secret: cate 3 pe rulare, cu `targetAccount`, iar numele se scrie in configurare", async () => {
    process.env.GMC_WEBHOOK_SECRET = "secret-webhook";
    setari = [
      faraAbonare("b1", "301"), faraAbonare("b2", "302"), faraAbonare("b3", "303"), faraAbonare("b4", "304"),
      /* incercat acum o ora si refuzat: se reia abia peste 6 ore */
      faraAbonare("b5", "305", { abonare_incercata_la: minuteInUrma(60), abonare_eroare: "vechi" }),
      /* deja abonat */
      magazin("b6", { account_id: "306" }),
    ];

    const r = await (await GET(cerereCron())).json() as { abonari: number };

    const create = laGoogle.filter((g) => g.metoda === "POST" && g.cale.endsWith("/notificationsubscriptions"));
    assert.equal(create.length, 3);
    for (const c of create) {
      const cont = /accounts\/(\d+)/.exec(c.cale)![1];
      assert.deepEqual(c.corp, {
        registeredEvent: "PRODUCT_STATUS_CHANGE",
        targetAccount: `accounts/${cont}`,
        callBackUri: "https://www.edinio.com/api/google-merchant/webhook?token=secret-webhook",
      });
    }
    const abonate = setari.filter((s) => (s.google_merchant_config as Rand).notification_subscription_name === `accounts/${/\d+/.exec(String((s.google_merchant_config as Rand).account_id))![0]}/notificationsubscriptions/nou`);
    assert.equal(abonate.length, 3, "numele abonarii nu s-a scris in configurare");
    assert.equal(cfg("b5").abonare_eroare, "vechi", "incercarea refuzata recent s-a reluat prea devreme");
    assert.equal(r.abonari, 3);
  });

  test("refuzul lui Google se scrie in configurare si nu se reia la urmatoarea rulare", async () => {
    process.env.GMC_WEBHOOK_SECRET = "secret-webhook";
    setari = [faraAbonare("b1", "301")];
    abonareRefuzata = { "301": "Account not eligible" };

    await GET(cerereCron());
    assert.equal(cfg("b1").abonare_eroare, "Account not eligible");
    assert.ok(cfg("b1").abonare_incercata_la);
    assert.equal(cfg("b1").notification_subscription_name, undefined);

    laGoogle.length = 0;
    await GET(cerereCron());
    assert.equal(laGoogle.filter((g) => g.cale.includes("notificationsubscriptions")).length, 0);
  });

  test("⚠ programele se fotografiaza in configurare: cele necitite intai, cate 3, o data la 12 ore", async () => {
    const necitit = (id: string, cont: string) => {
      const m = magazin(id, { account_id: cont });
      delete (m.google_merchant_config as Rand).programe_citite_la;
      return m;
    };
    setari = [
      necitit("b1", "401"), necitit("b2", "402"),
      magazin("b3", { account_id: "403", programe_citite_la: minuteInUrma(13 * 60) }),
      magazin("b4", { account_id: "404", programe_citite_la: minuteInUrma(14 * 60) }),
      magazin("b5", { account_id: "405", programe_citite_la: minuteInUrma(60) }),
    ];

    const r = await (await GET(cerereCron())).json() as { programe: number };

    const citite = laGoogle.filter((g) => g.cale.endsWith("/programs")).map((g) => /accounts\/(\d+)/.exec(g.cale)![1]).sort();
    assert.deepEqual(citite, ["401", "402", "404"]);
    assert.deepEqual(cfg("b1").programe, { "free-listings": "ELIGIBLE", "shopping-ads": "NOT_ELIGIBLE" });
    assert.ok(Date.parse(String(cfg("b1").programe_citite_la)) >= ACUM - 1000);
    assert.equal(cfg("b5").programe, undefined, "un cont citit acum o ora a fost intrebat din nou");
    assert.equal(r.programe, 3);
  });

  test("conturile citite in ultimele 12 ore nu se intreaba deloc, chiar cu loc liber in rulare", async () => {
    /* ⚠ Proba de mai sus nu apara pragul: acolo contul proaspat cadea oricum sub plafonul de 3
       (prins de bancul de mutanti). Aici e singur, cu toate locurile libere. */
    setari = [
      magazin("b1", { account_id: "501", programe_citite_la: minuteInUrma(60) }),
      magazin("b2", { account_id: "502", programe_citite_la: minuteInUrma(11 * 60) }),
    ];

    const r = await (await GET(cerereCron())).json() as { programe: number };

    assert.equal(laGoogle.filter((g) => g.cale.endsWith("/programs")).length, 0);
    assert.equal(r.programe, 0);
  });
});

describe("cronul: tara pe sursa de date (cauza ofertelor fara destinatie)", () => {
  const neverificat = (id: string, cont: string, extra: Rand = {}) => {
    const m = magazin(id, { account_id: cont, data_source_name: `accounts/${cont}/dataSources/9`, ...extra });
    delete (m.google_merchant_config as Rand).sursa_tari_verificate_la;
    return m;
  };
  const oferta = (business_id: string, product_id: string, offer_id: string, status = "pending"): Rand =>
    ({ id: `${business_id}-${offer_id}`, business_id, product_id, offer_id, status, last_synced_at: minuteInUrma(10), last_status_at: minuteInUrma(5) });

  test("⚠ sursa fara tara primeste tara magazinului, dovada ramane in configurare, iar produsele pleaca din nou", async () => {
    setari = [neverificat("b1", "601")];
    surse = { "accounts/601/dataSources/9": undefined };
    gmc = [oferta("b1", "p1", "p1"), oferta("b1", "p2", "p2-a"), oferta("b1", "p2", "p2-b"), oferta("b1", "p3", "p3", "exclus")];

    const r = await (await GET(cerereCron())).json() as { surseReparate: number };

    const patch = laGoogle.find((g) => g.metoda === "PATCH" && g.cale.includes("/dataSources/"));
    assert.ok(patch, "sursa n-a fost reparata");
    assert.deepEqual(patch.corp, { name: "accounts/601/dataSources/9", primaryProductDataSource: { countries: ["RO"] } });
    assert.deepEqual(surse["accounts/601/dataSources/9"], ["RO"]);
    assert.deepEqual(cfg("b1").sursa_tari, ["RO"]);
    assert.deepEqual(cfg("b1").sursa_tari_inainte, [], "dovada cauzei nu s-a scris");
    assert.ok(cfg("b1").sursa_tari_verificate_la);
    const puse = coada.filter((q) => q.business_id === "b1");
    assert.deepEqual(puse.map((q) => q.product_id).sort(), ["p1", "p2"], "produsele magazinului nu s-au retrimis (sau cel retras a intrat)");
    assert.ok(puse.every((q) => q.prioritate === 9 && q.offer_id === q.product_id && q.op === "upsert"));
    assert.equal(r.surseReparate, 1);
  });

  test("tara pusa de comerciant in Merchant Center NU se sterge: RO se adauga langa ea", async () => {
    setari = [neverificat("b1", "602")];
    surse = { "accounts/602/dataSources/9": ["BG"] };

    await GET(cerereCron());

    assert.deepEqual(surse["accounts/602/dataSources/9"], ["BG", "RO"]);
    assert.deepEqual(cfg("b1").sursa_tari_inainte, ["BG"]);
  });

  test("sursa care are deja tara: nimic scris la Google, nimic in coada", async () => {
    setari = [neverificat("b1", "603", { country: "ro" })];
    surse = { "accounts/603/dataSources/9": ["RO"] };
    gmc = [oferta("b1", "p1", "p1")];

    const r = await (await GET(cerereCron())).json() as { surseReparate: number };

    assert.equal(laGoogle.filter((g) => g.metoda === "PATCH").length, 0);
    assert.equal(coada.length, 0);
    assert.deepEqual(cfg("b1").sursa_tari, ["RO"]);
    assert.equal(cfg("b1").sursa_tari_inainte, undefined);
    assert.equal(r.surseReparate, 0);
  });

  test("cate 3 pe rulare, iar o sursa verificata azi nu se intreaba din nou", async () => {
    setari = [
      neverificat("b1", "611"), neverificat("b2", "612"), neverificat("b3", "613"), neverificat("b4", "614"),
      magazin("b5", { account_id: "615", data_source_name: "accounts/615/dataSources/9", sursa_tari_verificate_la: minuteInUrma(60) }),
    ];
    surse = Object.fromEntries(["611", "612", "613", "614", "615"].map((c) => [`accounts/${c}/dataSources/9`, undefined]));

    await GET(cerereCron());

    const citite = laGoogle.filter((g) => g.metoda === "GET" && g.cale.includes("/dataSources/"));
    assert.equal(citite.length, 3);
    assert.ok(!citite.some((g) => g.cale.includes("615")), "sursa verificata acum o ora a fost intrebata din nou");
  });

  test("o sursa verificata in ultimele 24 de ore nu se intreaba, chiar cu loc liber in rulare", async () => {
    /* ⚠ Singura, ca pragul sa nu fie ascuns de plafonul de 3 (aceeasi capcana ca la programe). */
    setari = [magazin("b1", { account_id: "631", data_source_name: "accounts/631/dataSources/9", sursa_tari_verificate_la: minuteInUrma(23 * 60) })];
    surse = { "accounts/631/dataSources/9": undefined };

    await GET(cerereCron());

    assert.equal(laGoogle.filter((g) => g.cale.includes("/dataSources/")).length, 0);
  });

  test("o sursa pe care Google n-o gaseste lasa motivul in configurare, fara nimic in coada", async () => {
    setari = [neverificat("b1", "621")];
    gmc = [oferta("b1", "p1", "p1")];

    await GET(cerereCron());

    assert.match(String(cfg("b1").sursa_tari_eroare), /sursa necunoscuta/);
    assert.equal(coada.length, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   WEBHOOK-UL
   ═══════════════════════════════════════════════════════════════════════════ */

describe("webhook-ul de stare a produselor", () => {
  const notificare = (token: string | null, mesaj: Rand) => new NextRequest(
    `https://www.edinio.com/api/google-merchant/webhook${token === null ? "" : `?token=${token}`}`,
    { method: "POST", body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(mesaj)).toString("base64") } }), headers: { "content-type": "application/json" } },
  );
  const oferta = (business_id: string, offer_id: string): Rand =>
    ({ id: `${business_id}-${offer_id}`, business_id, product_id: offer_id, offer_id, status: "pending", issues: [], destinations: [], last_status_at: minuteInUrma(5) });

  /** Doua magazine legate de ACELASI cont Merchant, cum se poate. */
  function contComun() {
    process.env.GMC_WEBHOOK_SECRET = "secret-webhook";
    setari = [magazin("m1", { account_id: "777" }), magazin("m2", { account_id: "777" })];
    gmc = [oferta("m1", "x1"), oferta("m1", "x2"), oferta("m2", "y1"), oferta("m2", "y2")];
  }
  const mesaj = (offerId: string | null, schimbari: Rand[] = [{ oldValue: "pending", newValue: "approved", regionCode: "RO", reportingContext: "SHOPPING_ADS" }]) => ({
    account: "accounts/777", managingAccount: "accounts/777", resourceType: "PRODUCT", attribute: "STATUS", changes: schimbari,
    ...(offerId ? { resourceId: `ro~RO~${offerId}`, resource: `accounts/777/products/ro~RO~${offerId}` } : {}),
    eventTime: new Date(ACUM).toISOString(),
  });

  test("⚠ oferta celui de-al doilea magazin de pe cont isi primeste starea", async () => {
    contComun();

    const r = await POST(notificare("secret-webhook", mesaj("y1")));

    assert.equal(r.status, 200);
    const y1 = gmc.find((g) => g.offer_id === "y1")!;
    assert.equal(y1.status, "active", "notificarea a ajuns doar la primul magazin al contului");
    assert.deepEqual(y1.destinations, [{ reportingContext: "FREE_LISTINGS", approvedCountries: ["RO"] }]);
    assert.ok(gmc.filter((g) => g.offer_id !== "y1").every((g) => g.status === "pending" && g.last_status_at !== null));
  });

  test("⚠ produs sters la Google (404): se reverifica DOAR oferta anuntata", async () => {
    contComun();
    laCitire = { x2: 404 };

    await POST(notificare("secret-webhook", mesaj("x2", [{ oldValue: "approved", regionCode: "RO", reportingContext: "SHOPPING_ADS" }])));

    assert.deepEqual(gmc.filter((g) => g.last_status_at === null).map((g) => g.offer_id), ["x2"], "tot catalogul a fost dat la reverificat");
  });

  test("tokenul revocat nu goleste catalogul: doar oferta anuntata asteapta cronul", async () => {
    contComun();
    setari[0].google_merchant_config = { ...(setari[0].google_merchant_config as Rand), refresh_token: "rt-revocat" };

    await POST(notificare("secret-webhook", mesaj("x1")));

    assert.deepEqual(gmc.filter((g) => g.last_status_at === null).map((g) => g.offer_id), ["x1"]);
  });

  test("fara oferta in mesaj: se reverifica tot, la TOATE magazinele contului", async () => {
    contComun();

    await POST(notificare("secret-webhook", mesaj(null)));

    assert.equal(gmc.filter((g) => g.last_status_at === null).length, 4);
  });

  test("oferta care nu e a noastra, secret gresit sau lipsa: nimic atins, dar confirmat cu 200", async () => {
    contComun();
    const inainte = JSON.stringify(gmc);

    for (const cerere of [notificare("secret-webhook", mesaj("nu-exista")), notificare("gresit", mesaj("x1")), notificare(null, mesaj("x1"))]) {
      const r = await POST(cerere);
      assert.equal(r.status, 200, "Google ar reincerca la nesfarsit");
    }
    assert.equal(JSON.stringify(gmc), inainte);
    assert.equal(laGoogle.length, 0);
  });
});
