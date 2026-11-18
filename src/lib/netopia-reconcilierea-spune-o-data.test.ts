import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ═══ RECONCILIEREA NETOPIA SPUNE UN RASPUNS O SINGURA DATA (18.11.2026) ═══
 *
 * Cronul `netopia-reconciliere` intreaba din ora in ora despre fiecare plata nedecisa din ultimele 14
 * zile, si scria raspunsul lor in jurnal de FIECARE data. Masurat in productie, la `caian-textile`:
 *
 *   * 335 de avertismente „REFUZATA” pentru o singura comanda, 234 pentru alta;
 *   * 380 de „status Netopia NERECUNOSCUT: 0” in patru zile, pentru patru comenzi pornite pe modul de
 *     TEST si intrebate dupa trecerea pe plati reale. Raspunsul lor: `0`, `99 Invalid ntpID`.
 *
 * Se ruleaza CHIAR cronul si CHIAR ruta IPN: baza e un PostgREST de proba (server HTTP local), Netopia
 * e un `fetch` de proba care raspunde dupa `ntpID`.
 *
 * ⚠ CE APARA:
 *   - fiecare raspuns se scrie o data, iar a doua rulare cu aceleasi raspunsuri nu scrie NIMIC;
 *   - un raspuns nou (alt cod, sau alta tranzactie cu acelasi cod) se scrie;
 *   - `0` cu „Invalid ntpID” se numeste pe nume si spune mediul, nu „NERECUNOSCUT”; un `0` cu alt
 *     mesaj ramane necunoscut, fiindca numai perechea aceea e masurata;
 *   - IPN-ul scrie la fiecare notificare, dar tine minte starea, ca cronul sa nu repete refuzul;
 *   - un esec nu se tine minte, deci se vede din nou;
 *   - ⚠⚠ starea NU se scrie pe `orders`: acolo ar muta `updated_at` si ar re-trimite clopotelul
 *     „Marfa expediata, plata neconfirmata” (`plati-neconfirmate` tine minte prin `updated_at`).
 */

type Rand = Record<string, unknown>;
const BIZ = "b1000000-0000-4000-8000-0000000000aa";
const CRON = "secret-cron-de-proba";

let TABELE: Record<string, Rand[]> = {};
let scrieri: Array<{ tabel: string; metoda: string; corp: unknown }> = [];

function lista(v: string): string[] {
  return v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
}

function potriveste(r: Rand, cheie: string, expr: string): boolean {
  const val = r[cheie];
  const s = val === undefined || val === null ? null : String(val);
  if (expr === "is.null") return s === null;
  if (expr === "not.is.null") return s !== null;
  if (expr.startsWith("eq.")) return s === expr.slice(3);
  if (expr.startsWith("neq.")) return s !== expr.slice(4);
  if (expr.startsWith("gte.")) return s !== null && s >= expr.slice(4);
  if (expr.startsWith("lte.")) return s !== null && s <= expr.slice(4);
  if (expr.startsWith("in.")) return s !== null && lista(expr.slice(3)).includes(s);
  if (expr.startsWith("not.in.")) return s === null || !lista(expr.slice(7)).includes(s);
  throw new Error(`operator neasteptat: ${cheie}=${expr}`);
}

function filtreaza(randuri: Rand[], url: URL): Rand[] {
  return randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "limit", "order", "offset", "on_conflict", "columns"].includes(k)) continue;
      if (!potriveste(r, k, v)) return false;
    }
    return true;
  });
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const tabel = url.pathname.replace("/rest/v1/", "");
  let corpBrut = "";
  req.on("data", (b) => (corpBrut += b));
  req.on("end", () => {
    const json = (cod: number, corp: unknown) => {
      res.writeHead(cod, { "content-type": "application/json" });
      res.end(JSON.stringify(corp));
    };
    try {
      /* Niciun RPC nu are ce cauta aici: niciun raspuns din proba nu misca vreo comanda. */
      if (tabel.startsWith("rpc/")) return json(404, { message: `rpc neasteptat: ${tabel}` });
      const randuri = TABELE[tabel];
      if (!randuri) return json(404, { code: "42P01", message: `relation "public.${tabel}" does not exist` });
      if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
        const corp = corpBrut ? JSON.parse(corpBrut) : null;
        scrieri.push({ tabel, metoda: req.method, corp });
        if (req.method === "PATCH") for (const r of filtreaza(randuri, url)) Object.assign(r, corp as Rand);
        if (req.method === "POST") {
          const conflict = url.searchParams.get("on_conflict");
          for (const nou of (Array.isArray(corp) ? corp : [corp]) as Rand[]) {
            const chei = conflict ? conflict.split(",") : null;
            const existent = chei ? randuri.find((r) => chei.every((k) => r[k] === nou[k])) : undefined;
            if (existent) Object.assign(existent, nou);
            else randuri.push({ ...nou });
          }
        }
        res.writeHead(req.method === "POST" ? 201 : 204);
        return res.end();
      }
      let gasite = filtreaza(randuri, url);
      const o = url.searchParams.get("order");
      if (o) {
        const [k, dir] = o.split(".");
        gasite = [...gasite].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (dir === "desc" ? -1 : 1));
      }
      const limit = url.searchParams.get("limit");
      if (limit) gasite = gasite.slice(0, Number(limit));
      if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, gasite);
      if (gasite.length !== 1) return json(406, { code: "PGRST116", message: `${gasite.length} rows` });
      return json(200, gasite[0]);
    } catch (e) {
      return json(400, { message: (e as Error).message });
    }
  });
});

/* ── Netopia: raspunde dupa `ntpID`, ca `/operation/status` ─────────────── */
let netopia: Record<string, unknown> = {};
let intrebari: Array<{ url: string; ntpID: string }> = [];
const fetchAdevarat = globalThis.fetch;

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "next/cache") {
       return { url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = () => {}; export const revalidateTag = () => {};"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

let cron: typeof import("@/app/api/cron/netopia-reconciliere/route");
let notify: typeof import("@/app/api/netopia/notify/route");
let semneaza: typeof import("./netopia-ipn").signNetopiaIpn;
let NextRequestCls: typeof import("next/server").NextRequest;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.CRON_SECRET = CRON;
  /* Secret ADEVARAT, pus de proba: cu cheia goala, jetonul n-ar dovedi nimic. */
  process.env.NETOPIA_IPN_SECRET = "secret-ipn-de-proba";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("http://127.0.0.1")) return fetchAdevarat(input, init);
    const corp = JSON.parse(String(init?.body ?? "{}")) as { ntpID?: string };
    intrebari.push({ url, ntpID: String(corp.ntpID) });
    const r = netopia[String(corp.ntpID)];
    if (!r) throw new Error(`Netopia de proba: nicio stare pentru ${corp.ntpID}`);
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  register(HOOK);
  cron = await import("@/app/api/cron/netopia-reconciliere/route");
  notify = await import("@/app/api/netopia/notify/route");
  semneaza = (await import("./netopia-ipn")).signNetopiaIpn;
  NextRequestCls = (await import("next/server")).NextRequest;
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

const acumMinus = (ore: number) => new Date(Date.now() - ore * 3600_000).toISOString();

const comanda = (id: string, ntp: string, extra: Rand = {}): Rand => ({
  id, business_id: BIZ, order_number: id.toUpperCase(), status: "pending", payment_status: "unpaid",
  payment_method: "netopia", total: "100.00", netopia_ntp_id: ntp, created_at: acumMinus(48), ...extra,
});

/** Raspunsurile masurate. `0 / 99 Invalid ntpID` e chiar cel din productie, 14-18.11.2026. */
const NEGASITA = { payment: { status: 0 }, error: { code: "99", message: "Invalid ntpID" } };
const REFUZ = { payment: { status: 12 }, error: { code: "21", message: "Invalid CVV" } };
const ASTEAPTA = { payment: { status: 1 }, error: { code: "101", message: "Redirect to payment page" } };

beforeEach(() => {
  scrieri = [];
  intrebari = [];
  TABELE = {
    store_settings: [{
      business_id: BIZ,
      /* Magazinul e ACUM pe plati reale, ca la caian-textile dupa 14.11. */
      netopia_config: { enabled: true, sandbox: false, api_key: "cheie-live", pos_signature: "POS-1" },
    }],
    orders: [
      /* Pornita pe modul de TEST (ntpID de 7 cifre, ca toate cele din sandbox), intrebata pe Live. */
      comanda("o-test", "3104544"),
      comanda("o-refuz", "560000001"),
      comanda("o-asteapta", "560000002"),
      comanda("o-zero-alt", "560000003"),
      /* Platita: se intreaba doar despre o rambursare, deci un `5` nu spune si nu scrie nimic. */
      comanda("o-platita", "560000004", { payment_status: "paid", status: "shipped", created_at: acumMinus(30) }),
    ],
    netopia_stari: [],
    error_logs: [],
  };
  netopia = {
    "3104544": NEGASITA,
    "560000001": REFUZ,
    "560000002": ASTEAPTA,
    "560000003": { payment: { status: 0 }, error: { code: "99", message: "Error" } },
    "560000004": { payment: { status: 5, amount: 100 }, error: { code: "00", message: "Approved" } },
  };
});

async function ruleazaCronul(): Promise<Rand> {
  const r = await cron.GET(new NextRequestCls("https://www.edinio.com/api/cron/netopia-reconciliere", {
    headers: { authorization: `Bearer ${CRON}` },
  }));
  assert.equal(r.status, 200);
  return (await r.json()) as Rand;
}

const jurnal = () => TABELE.error_logs as Array<{ action: string; message: string; severity: string; details: Rand }>;
const despre = (orderId: string) => jurnal().filter((l) => l.details?.orderId === orderId);
const stare = (orderId: string) => TABELE.netopia_stari.find((s) => s.order_id === orderId);

describe("reconcilierea: fiecare raspuns, o singura data", () => {
  test("⚠⚠ prima rulare spune fiecare raspuns O DATA, a doua, cu aceleasi raspunsuri, nu scrie NIMIC", async () => {
    const r1 = await ruleazaCronul();
    assert.deepEqual(r1.socoteala, { negasita: 1, refuzata: 1, intermediara: 1, necunoscuta: 1 });
    assert.equal(jurnal().length, 4, JSON.stringify(jurnal().map((l) => l.message)));
    assert.equal(despre("o-platita").length, 0, "o plata confirmata a fost scrisa in jurnal");

    const scrisInainte = jurnal().length;
    scrieri = [];
    const r2 = await ruleazaCronul();
    assert.deepEqual(r2.socoteala, r1.socoteala, "a doua rulare a judecat altfel");
    assert.equal(jurnal().length, scrisInainte, "acelasi raspuns s-a scris iar: exact zgomotul din productie");
    assert.deepEqual(scrieri, [], "a doua rulare a scris ceva, desi nu s-a schimbat nimic");
    /* Si totusi a INTREBAT: daca intre timp plata trece, vrem sa aflam. */
    assert.equal(intrebari.filter((q) => q.ntpID === "560000001").length, 2);
  });

  test("⚠⚠ „Invalid ntpID” se numeste pe nume, cu mediul pe care am intrebat, si nu misca nimic", async () => {
    await ruleazaCronul();
    const [l] = despre("o-test");
    assert.ok(l, "raspunsul nu s-a scris deloc");
    assert.doesNotMatch(l.message, /NERECUNOSCUT/, "un raspuns masurat e numit iar nerecunoscut");
    assert.match(l.message, /nu gaseste tranzactia 3104544/);
    assert.match(l.message, /platile REALE/, "nu spune pe ce mediu am intrebat, adica tocmai cauza");
    assert.match(l.message, /99 Invalid ntpID/, "nu spune ce au raspuns ei");
    assert.equal(l.severity, "info");
    assert.equal(l.action, "netopia/reconciliere");
    assert.deepEqual(stare("o-test"), { order_id: "o-test", cod: "0", ntp_id: "3104544", schimbata_la: stare("o-test")?.schimbata_la });
  });

  test("⚠ dar un 0 cu ALT mesaj ramane necunoscut: numai perechea masurata are nume", async () => {
    await ruleazaCronul();
    const [l] = despre("o-zero-alt");
    assert.match(l.message, /status Netopia NERECUNOSCUT: 0/);
  });

  test("⚠⚠ un raspuns NOU se spune: asteptarea devenita refuz", async () => {
    await ruleazaCronul();
    netopia["560000002"] = REFUZ;
    await ruleazaCronul();
    const l = despre("o-asteapta");
    assert.equal(l.length, 2);
    assert.match(l[1].message, /REFUZATA/);
    assert.equal(stare("o-asteapta")?.cod, "12");
  });

  test("⚠ si o tranzactie NOUA cu acelasi cod: plata pornita din nou e alta intamplare", async () => {
    await ruleazaCronul();
    (TABELE.orders.find((o) => o.id === "o-refuz") as Rand).netopia_ntp_id = "560000099";
    netopia["560000099"] = REFUZ;
    await ruleazaCronul();
    assert.equal(despre("o-refuz").length, 2, "refuzul unei tranzactii noi a fost luat drept cel vechi");
    assert.equal(stare("o-refuz")?.ntp_id, "560000099");
  });

  test("⚠⚠ un ESEC nu se tine minte: se reia si trebuie sa se vada din nou", async () => {
    /* Platita pe jumatate: garda de suma o refuza, iar ce nu s-a lamurit nu are voie sa taca. */
    TABELE.orders.push(comanda("o-suma", "560000005"));
    netopia["560000005"] = { payment: { status: 3, amount: 50 }, error: { code: "00", message: "Approved" } };
    const r = await ruleazaCronul();
    assert.equal((r.socoteala as Rand).esec, 1);
    assert.equal(stare("o-suma"), undefined, "un esec a fost tinut minte ca un raspuns stiut");
  });

  test("⚠⚠ starea NU se scrie pe `orders`: ar re-trimite clopotelul „plata neconfirmata”", async () => {
    await ruleazaCronul();
    netopia["560000002"] = REFUZ;
    await ruleazaCronul();
    const peComenzi = scrieri.filter((s) => s.tabel === "orders");
    assert.deepEqual(peComenzi, [], "s-a scris pe comanda, deci `updated_at` s-a mutat");
    assert.ok(scrieri.some((s) => s.tabel === "netopia_stari"), "starea nu s-a tinut minte nicaieri");
  });

  test("⚠ fara tabela starilor, cronul se poarta ca pana azi: mai zgomotos, dar nu tace", async () => {
    delete TABELE.netopia_stari;
    const r1 = await ruleazaCronul();
    const r2 = await ruleazaCronul();
    assert.deepEqual(r2.socoteala, r1.socoteala);
    assert.equal(jurnal().length, 8, "fara stari, un raspuns s-a pierdut");
  });
});

describe("IPN-ul: spune MEREU, si tine minte pentru cron", () => {
  async function trimiteIpn(orderId: string, plata: Rand) {
    const r = await notify.POST(new NextRequestCls(
      `https://www.edinio.com/api/netopia/notify?t=${semneaza(orderId)}`,
      { method: "POST", body: JSON.stringify({ order: { orderID: orderId }, payment: plata }) },
    ));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { errorCode: 0, errorMessage: "OK" });
  }

  test("⚠⚠ fiecare notificare e o intamplare: doua refuzuri, doua randuri; apoi cronul nu-l repeta", async () => {
    const plata = { status: 12, ntpID: "560000001", code: "21", message: "Invalid CVV" };
    await trimiteIpn("o-refuz", plata);
    await trimiteIpn("o-refuz", plata);
    assert.equal(despre("o-refuz").length, 2, "a doua incercare a cumparatorului s-a pierdut");
    assert.ok(despre("o-refuz").every((l) => l.action === "netopia/notify"));
    assert.equal(stare("o-refuz")?.cod, "12");

    await ruleazaCronul();
    assert.equal(despre("o-refuz").length, 2, "cronul a repetat refuzul spus deja de notificare");
  });
});

describe("cablajul", () => {
  const viu = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  test("⚠⚠ regula tine minte starea intr-o tabela a ei, niciodata pe `orders`", () => {
    const m = viu("src/lib/netopia-aplica-statusul.ts");
    assert.match(m, /from\("netopia_stari"\)\.upsert\(/);
    assert.ok(!/netopia_status|netopia_stare/.test(m.replace(/netopia_stari/g, "")), "starea a ajuns pe comanda");
  });

  test("⚠ cronul citeste starile in bucati de 100: adresa PostgREST are limita", () => {
    const c = viu("src/app/api/cron/netopia-reconciliere/route.ts");
    assert.match(c, /from\("netopia_stari"\)\.select\("order_id, cod, ntp_id"\)\.in\("order_id", ids\.slice\(i, i \+ 100\)\)/);
    assert.match(c, /stiute\.get\(c\.id\) \?\? null/);
  });

  test("⚠ migratia: tabela cu RLS, fara drept pentru anon si authenticated", () => {
    const sql = readFileSync("migrations/2027-02-08-netopia-ultima-stare.sql", "utf8").replace(/--.*$/gm, "");
    assert.match(sql, /create table if not exists public\.netopia_stari/);
    assert.match(sql, /order_id uuid primary key references public\.orders\(id\) on delete cascade/);
    assert.match(sql, /alter table public\.netopia_stari enable row level security/);
    assert.match(sql, /revoke all on table public\.netopia_stari from anon, authenticated/);
    assert.ok(!/alter table public\.orders/.test(sql), "migratia atinge iar `orders`");
  });
});
