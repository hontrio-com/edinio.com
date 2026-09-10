import assert from "node:assert/strict";
import { test, before, after, beforeEach } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * GOOGLE SCOATE PRODUSUL LA 30 DE ZILE: RETRIMITEREA DE INTRETINERE SI EXPIRAREA VAZUTA IN PANOU.
 *
 * ═══ ⚠ CE APARA ═══
 *
 * Reclamat de caian-textile.ro pe 10.09.2026: produsele active din Merchant Center au scazut de la
 * 31 la 21, restul urmand sa expire. Coada cronului se umplea doar la o schimbare, deci un produs
 * neatins nu mai pleca niciodata, iar Google il scoate la 30 de zile de la ultima trimitere. Si
 * panoul nostru nu spunea nimic: la 404, statusul vechi ramanea pe loc.
 *
 * ⚠ SE RULEAZA CHIAR `GET` din `route.ts`. Baza de proba APLICA filtrele pe care i le trimite ruta
 * (`in`, `lt`, `or`, `not.is.null`, `order`, `limit`) si intoarce doar coloanele cerute: o baza care
 * le-ar ignora ar lasa sa treaca tocmai un filtru uitat.
 */

const ACUM = Date.now();
const zileInUrma = (n: number) => new Date(ACUM - n * 86_400_000).toISOString();
const minuteInUrma = (n: number) => new Date(ACUM - n * 60_000).toISOString();

type Rand = {
  id: string; business_id: string; product_id: string | null; offer_id: string;
  status: string | null; last_synced_at: string | null; last_status_at: string | null; error: string | null;
};

let gmc: Rand[] = [];
let configuri: Record<string, Record<string, unknown>> = {};
/** Ce s-a pus in coada, cu antetul `Prefer`: din el se vede daca o editare aflata deja acolo ar fi fost calcata. */
let puseInCoada: { rand: Record<string, unknown>; prefer: string }[] = [];
/** Codul cu care raspunde Google la citirea unei oferte; lipsa inseamna 200, aprobata. */
let googleRaspunde: Record<string, number> = {};
const laGoogle: string[] = [];

/** Desparte `a,b(c,d),e` pe virgulele de la nivelul de sus. */
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

/** O conditie PostgREST pe o valoare. Ca in SQL: o comparatie cu NULL nu e adevarata, nici negata. */
function potriveste(valoare: unknown, expr: string): boolean {
  const gol = valoare === null || valoare === undefined;
  if (expr === "is.null") return gol;
  if (expr === "not.is.null") return !gol;
  const m = /^(not\.)?(eq|neq|lt|gt|in)\.(.*)$/.exec(expr);
  if (!m) throw new Error(`filtru necunoscut: ${expr}`);
  const [, nu, op, arg] = m;
  if (gol) return false;
  const v = String(valoare);
  let ok: boolean;
  if (op === "in") ok = arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(v);
  else if (op === "eq") ok = v === arg;
  else if (op === "neq") ok = v !== arg;
  else if (op === "lt") ok = v < arg;
  else ok = v > arg;
  return nu ? !ok : ok;
}

/** Aplica pe randuri filtrele din adresa, ca PostgREST. */
function filtreaza<T extends Record<string, unknown>>(randuri: T[], p: URLSearchParams): T[] {
  let rez = randuri.filter((r) => {
    for (const [cheie, expr] of p) {
      if (["select", "order", "limit", "on_conflict", "columns"].includes(cheie)) continue;
      if (cheie === "or") {
        const conditii = bucati(expr.replace(/^\(|\)$/g, ""));
        const vreuna = conditii.some((c) => {
          const i = c.indexOf(".");
          return potriveste(r[c.slice(0, i)], c.slice(i + 1));
        });
        if (!vreuna) return false;
        continue;
      }
      if (!potriveste(r[cheie], expr)) return false;
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

/** Doar coloanele cerute, cu alias si cu `->>` pe jsonb: o coloana uitata in `select` nu ajunge. */
function proiecteaza(r: Record<string, unknown>, select: string): Record<string, unknown> {
  const iesire: Record<string, unknown> = {};
  for (const bucata of bucati(select)) {
    const [alias, expr] = bucata.includes(":") ? bucata.split(":") : [bucata, bucata];
    const [col, cheie] = expr.trim().split("->>");
    if (cheie === undefined) {
      iesire[alias.trim()] = r[col];
    } else {
      const v = (r[col] as Record<string, unknown> | null | undefined)?.[cheie];
      iesire[alias.trim()] = v === undefined || v === null ? null : String(v);
    }
  }
  return iesire;
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  const select = url.searchParams.get("select") ?? "*";
  let corp = "";
  req.on("data", (c) => { corp += c; });
  req.on("end", () => {
    const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const json = (cod: number, date: unknown) => {
      res.writeHead(cod, { "content-type": "application/json" });
      res.end(JSON.stringify(date));
    };
    /* O scriere fara `select` raspunde 204, fara corp: cu un corp necitit, cererea urmatoare atarna. */
    const scris = () => { res.writeHead(204); res.end(); };
    const lista = (randuri: unknown[]) => (unul ? json(randuri.length ? 200 : 406, randuri[0] ?? { message: "gol" }) : json(200, randuri));
    try {
      /* Coada porneste goala: se probeaza ce se PUNE in ea, nu ce se trimite din ea. */
      if (cale === "rpc/revendica_din_coada") return json(200, []);

      if (cale === "store_settings") {
        const randuri = Object.entries(configuri).map(([business_id, cfg]) => ({
          business_id,
          google_merchant_config: cfg,
          "google_merchant_config->>connected": cfg.connected === undefined ? null : String(cfg.connected),
        }));
        return lista(filtreaza(randuri, url.searchParams).map((r) => proiecteaza(r, select)));
      }

      if (cale === "businesses") {
        return lista([{ slug: "exemplu", custom_domain: "exemplu.ro", store_name: "Exemplu", business_name: "Exemplu SRL" }]);
      }

      if (cale === "gmc_products") {
        const toate = gmc as unknown as Record<string, unknown>[];
        if (req.method === "PATCH") {
          const petic = JSON.parse(corp || "{}") as Partial<Rand>;
          const atinse = new Set(filtreaza(toate, url.searchParams));
          gmc = gmc.map((r) => (atinse.has(r as unknown as Record<string, unknown>) ? { ...r, ...petic } : r));
          return scris();
        }
        return lista(filtreaza(toate, url.searchParams).map((r) => proiecteaza(r, select)));
      }

      if (cale === "gmc_sync_queue" && req.method === "POST") {
        const trimis = JSON.parse(corp || "[]") as Record<string, unknown> | Record<string, unknown>[];
        for (const rand of Array.isArray(trimis) ? trimis : [trimis]) {
          puseInCoada.push({ rand, prefer: String(req.headers.prefer ?? "") });
        }
        return scris();
      }

      if (cale === "error_logs") return scris();
      return json(200, []);
    } catch (e) {
      json(500, { message: `baza de proba: ${(e as Error).message}` });
    }
  });
});

let GET: (req: unknown) => Promise<Response>;
let NextRequest: (typeof import("next/server"))["NextRequest"];
const fetchAdevarat = globalThis.fetch;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.CRON_SECRET = "secret-de-proba";

  globalThis.fetch = (async (intrare: unknown, optiuni?: { method?: string }) => {
    const adresa = String(typeof intrare === "object" && intrare && "url" in intrare ? (intrare as { url: string }).url : intrare);
    if (adresa.startsWith("https://oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "jeton-de-proba", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (adresa.startsWith("https://merchantapi.googleapis.com")) {
      const cale = decodeURIComponent(new URL(adresa).pathname);
      laGoogle.push(`${optiuni?.method ?? "GET"} ${cale}`);
      const oferta = cale.split("~").pop() ?? "";
      const cod = googleRaspunde[oferta] ?? 200;
      if (cod !== 200) {
        return new Response(JSON.stringify({ error: { message: `raspuns ${cod}` } }), {
          status: cod, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ productStatus: { destinationStatuses: [{ approvedCountries: ["RO"] }] } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return fetchAdevarat(intrare as string, optiuni as RequestInit);
  }) as typeof fetch;

  ({ GET } = (await import("@/app/api/cron/gmc-sync/route")) as unknown as { GET: (req: unknown) => Promise<Response> });
  ({ NextRequest } = await import("next/server"));
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  gmc = [];
  configuri = {};
  puseInCoada = [];
  googleRaspunde = {};
  laGoogle.length = 0;
});

function cerere() {
  return new NextRequest("https://www.edinio.com/api/cron/gmc-sync", { headers: { authorization: "Bearer secret-de-proba" } });
}

function config(autoSync: boolean | undefined) {
  return {
    connected: true, account_id: "123", refresh_token: "rt-de-proba",
    data_source_name: "accounts/123/dataSources/1", content_language: "ro", feed_label: "RO",
    ...(autoSync === undefined ? {} : { auto_sync: autoSync }),
  };
}

/** Un rand din `gmc_products`. Statusul e citit acum un minut, ca reimprospatarea sa-l sara. */
function rand(id: string, business_id: string, product_id: string, offer_id: string, status: string | null, last_synced_at: string): Rand {
  return { id, business_id, product_id, offer_id, status, last_synced_at, last_status_at: minuteInUrma(1), error: null };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETRIMITEREA DE INTRETINERE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ oferta netrimisa de o saptamana intra singura in coada, dupa editari, fara sa calce ce e acolo", async () => {
  configuri = { "biz-a": config(true) };
  gmc = [
    rand("a1", "biz-a", "p1", "p1", "active", zileInUrma(8)),
    rand("a2", "biz-a", "p2", "p2", "active", zileInUrma(2)),
    rand("a3", "biz-a", "p3", "p3", "exclus", zileInUrma(40)),
    rand("a4", "biz-a", "p4", "p4", "error", zileInUrma(40)),
    /* Un produs cu variante: doua oferte, un singur rand de coada. */
    rand("a5", "biz-a", "p5", "p5-x", "active", zileInUrma(9)),
    rand("a6", "biz-a", "p5", "p5-y", "active", zileInUrma(9)),
    /* Statusul gol nu scapa printre degete: `not.in` sare peste NULL. */
    rand("a7", "biz-a", "p6", "p6", null, zileInUrma(10)),
  ];

  const r = await (await GET(cerere())).json() as { improspatate: number };

  const puse = puseInCoada.map((x) => x.rand);
  assert.deepEqual(puse.map((x) => x.product_id).sort(), ["p1", "p5", "p6"], "s-au retrimis alte produse decat cele netrimise de o saptamana");
  for (const x of puse) {
    assert.equal(x.offer_id, x.product_id, "coada lucreaza pe produs, nu pe oferta de varianta");
    assert.equal(x.op, "upsert");
    assert.equal(x.prioritate, 9, "retrimiterea de intretinere trebuie sa treaca DUPA editarile reale");
  }
  assert.ok(puseInCoada.every((x) => /resolution=ignore-duplicates/.test(x.prefer)), "o editare aflata deja in coada ar fi fost calcata");
  assert.equal(r.improspatate, 3);
});

test("⚠ magazinul cu sincronizarea stinsa si cel deconectat nu se retrimit, si nu tin locul celorlalti", async () => {
  /*
   * 250 de oferte vechi la magazinul cu sincronizarea stinsa, peste plafonul de 200 pe rulare. O
   * cerere care ar lua direct cele mai vechi oferte din platforma si ar alege magazinele abia dupa
   * s-ar umple numai cu ele, iar oferta magazinului pornit n-ar mai ajunge niciodata in fata.
   */
  configuri = {
    "biz-oprit": config(false),
    "biz-deconectat": { ...config(true), connected: false },
    "biz-pornit": config(undefined), // fara camp: pornit, ca in panou (`auto_sync !== false`)
  };
  gmc = [
    ...Array.from({ length: 250 }, (_, i) => rand(`o${i}`, "biz-oprit", `po${i}`, `po${i}`, "active", zileInUrma(40))),
    rand("d1", "biz-deconectat", "pd", "pd", "active", zileInUrma(60)),
    rand("n1", "biz-pornit", "pn", "pn", "active", zileInUrma(10)),
  ];

  await GET(cerere());

  assert.deepEqual(
    puseInCoada.map((x) => x.rand.product_id),
    ["pn"],
    "s-au retrimis produse ale unui magazin oprit sau deconectat, ori oferta magazinului pornit n-a ajuns in fata",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   EXPIRAREA, VAZUTA IN PANOU
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ 404 pe o oferta trimisa de mult: „Expirat la Google”, si inapoi in coada", async () => {
  configuri = { "biz-a": config(true) };
  gmc = [
    { ...rand("e1", "biz-a", "p1", "p1", "active", zileInUrma(3)), last_status_at: null },
    /* Trimisa acum zece minute: Google inca n-a procesat-o, deci 404 nu inseamna expirare. */
    { ...rand("e2", "biz-a", "p2", "p2", "pending", minuteInUrma(10)), last_status_at: null },
    /* O eroare de server nu spune nimic despre oferta. */
    { ...rand("e3", "biz-a", "p3", "p3", "active", zileInUrma(5)), last_status_at: null },
  ];
  googleRaspunde = { p1: 404, p2: 404, p3: 500 };

  const r = await (await GET(cerere())).json() as { expirate: number };

  const e1 = gmc.find((x) => x.id === "e1")!;
  assert.equal(e1.status, "expirat", "oferta pe care Google n-o mai are a ramas cu statusul vechi, deci panoul minte");
  assert.match(String(e1.error), /pus înapoi în coadă/, "comerciantul nu afla ce s-a intamplat");
  assert.deepEqual(puseInCoada.map((x) => x.rand.product_id), ["p1"], "oferta expirata nu s-a pus inapoi in coada");
  assert.ok(/resolution=ignore-duplicates/.test(puseInCoada[0].prefer));

  assert.equal(gmc.find((x) => x.id === "e2")!.status, "pending", "o oferta trimisa acum zece minute a fost declarata expirata: s-ar retrimite la nesfarsit");
  assert.equal(gmc.find((x) => x.id === "e3")!.status, "active", "o eroare de server a schimbat statusul ofertei");
  assert.equal(r.expirate, 1);
  /* Perechea: Google chiar a fost intrebat de toate trei, deci statusurile de mai sus nu vin din tacere. */
  assert.equal(laGoogle.filter((x) => x.startsWith("GET")).length, 3);
});

test("cu sincronizarea stinsa, expirarea se spune, dar nu se retrimite nimic singur", async () => {
  configuri = { "biz-oprit": config(false) };
  gmc = [{ ...rand("e1", "biz-oprit", "p1", "p1", "active", zileInUrma(35)), last_status_at: null }];
  googleRaspunde = { p1: 404 };

  await GET(cerere());

  const e1 = gmc.find((x) => x.id === "e1")!;
  assert.equal(e1.status, "expirat");
  assert.match(String(e1.error), /Sincronizează acum/, "comerciantul nu afla ce are de facut");
  assert.deepEqual(puseInCoada, [], "s-a retrimis singur, desi comerciantul a oprit sincronizarea automata");
});
