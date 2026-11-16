import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  anuleazaCererea, produseleDeFinantare, ramburseaza, stareaCererii, trimiteCererea, verificaLegatura,
} from "./client";
import { descifreazaDeLaTbi } from "./cripto";
import { construiesteCererea } from "./cerere";

/*
 * Clientul Fusion Pay, cu banca SIMULATA: `fetch` e inlocuit, iar „banca" de aici face ce face a lor:
 * citeste corpul JSON, descifreaza `data` cu cheia magazinului, si raspunde cu formele si codurile
 * MASURATE pe serverul lor de test (16.11.2026): 200 + `error: 0` la inregistrare, `error: 200` la
 * anulare si rambursare, 401, 207, 404, 204 fara corp.
 */

const CHEIE = "cheie-de-criptare-de-proba";
const CFG = { sandbox: false, reseller_code: "magazin_ro", reseller_key: "cheie_reseller", cheie_criptare: CHEIE };

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

type Primit = { url: string; tip: string; corp: Record<string, unknown>; date: Record<string, unknown> | null };
function banca(raspuns: (p: Primit) => Response): Primit[] {
  const primite: Primit[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const corp = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    let date: Record<string, unknown> | null = null;
    if (typeof corp.data === "string") {
      try { date = JSON.parse(descifreazaDeLaTbi(corp.data, CHEIE)); } catch { date = null; }
    }
    const p = { url: String(url), tip: new Headers(init?.headers).get("content-type") ?? "", corp, date };
    primite.push(p);
    return raspuns(p);
  }) as typeof fetch;
  return primite;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const CERERE = construiesteCererea({
  comanda: {
    id: "x", order_number: "#0007", total: 2500.5, shipping_cost: 25,
    items: [{ name: "Șosete bărbătești", price: 2475.5, quantity: 1, product_id: "p1" }],
    customer_name: "Ion Popescu", customer_email: "ion@exemplu.ro", customer_phone: "0752000000",
  },
  cfg: { categorie: "1" },
  idCerere: 700000123,
  adresaVesti: "https://www.edinio.com/api/tbi/notificare/JETON",
  intoarcere: { reusita: "https://www.edinio.com/m/confirm?orderId=x", esuata: "https://www.edinio.com/m/confirm?status=esuat&orderId=x" },
  produse: new Map(),
});
const RAZPUNS_BUN = { error: 0, order_id: 60, token: "f27df5405197d00d71f0642c0d9cb0f2", url: "https://app-rotbi-envoy-fos24-uat.azurewebsites.net/b2cportal/x" };

describe("RegisterApplication", () => {
  test("✅ JSON cu codul si cheia in clar, cererea CRIPTATA in `data`, pe care banca o descifreaza intreaga", async () => {
    const primite = banca(() => json(RAZPUNS_BUN));
    const r = await trimiteCererea(CFG, CERERE);
    assert.deepEqual(r, { fel: "trimisa", adresa: RAZPUNS_BUN.url, idTbi: 60, token: RAZPUNS_BUN.token });
    assert.equal(primite[0].url, "https://ro.tbibank.support/api/RegisterApplication");
    assert.match(primite[0].tip, /application\/json/);
    assert.equal(primite[0].corp.reseller_code, "magazin_ro");
    assert.equal(primite[0].corp.reseller_key, "cheie_reseller");
    assert.deepEqual(primite[0].date, JSON.parse(JSON.stringify(CERERE)), "banca nu primeste cererea intreaga (diacriticele)");
  });

  test("mediul de test merge la serverul lor de test", async () => {
    const primite = banca(() => json(RAZPUNS_BUN));
    await trimiteCererea({ ...CFG, sandbox: true }, CERERE);
    assert.equal(primite[0].url, "https://ro.tbi-uat.online/api/RegisterApplication");
  });

  test("⚠ avertismentele PHP din fata JSON-ului (masurate pe serverul lor de test) nu strica raspunsul", async () => {
    banca(() => new Response(`<br />\n<b>Warning</b>:  Undefined property: stdClass::$firstname in <b>x.php</b><br />\n${JSON.stringify(RAZPUNS_BUN)}`, { status: 200 }));
    assert.equal((await trimiteCererea(CFG, CERERE)).fel, "trimisa");
  });

  test("⚠ refuzurile se deosebesc: 401 datele de reseller, 204 si 207 cheia de criptare, 210 suma, 208/209 datele", async () => {
    const cazuri: [Response, string][] = [
      [json({ error: 401, message: "Invalid credentials. Access denied." }, 401), "credentiale"],
      [new Response(null, { status: 204 }), "cheie"],
      [json({ error: 207, message: "Error encryption key or data." }, 207), "cheie"],
      [json({ error: 210, message: "Total basket amount (74200) is below or above financing limits." }), "suma"],
      [json({ error: 208, message: "Missing [ items or orderid ] list." }), "date"],
      [json({ error: 209, message: "Missing mandatory parameters in items list." }), "date"],
    ];
    for (const [raspuns, motiv] of cazuri) {
      banca(() => raspuns.clone());
      const r = await trimiteCererea(CFG, CERERE);
      assert.equal(r.fel, "refuz", motiv);
      assert.equal(r.fel === "refuz" && r.motiv, motiv);
    }
  });

  test("⚠ 5xx, retea picata, raspuns fara adresa sau cu adresa http: NU stim, nu „refuz”", async () => {
    banca(() => new Response("eroare", { status: 502 }));
    assert.equal((await trimiteCererea(CFG, CERERE)).fel, "necunoscut");
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    assert.equal((await trimiteCererea(CFG, CERERE)).fel, "necunoscut");
    banca(() => json({ error: 0, order_id: 60, token: "t" }));
    assert.equal((await trimiteCererea(CFG, CERERE)).fel, "necunoscut");
    banca(() => json({ ...RAZPUNS_BUN, url: "http://nesigur.example/x" }));
    assert.equal((await trimiteCererea(CFG, CERERE)).fel, "necunoscut");
  });
});

describe("GetApplicationStatus", () => {
  test("✅ id-ul si jetonul LOR, iar raspunsul cu starea si lantul ei", async () => {
    const primite = banca(() => json({
      error: 0, store_order_id: "700000123", status: "Comanda in derulare TBI",
      status_chain: [{ datetime: "2026-11-16 18:54:33", status: "Comanda in derulare TBI" }, { datetime: "2026-11-16 18:54:24", status: "Comanda trimisa catre TBI" }],
    }));
    const r = await stareaCererii(CFG, 60, "tok");
    assert.equal(primite[0].url, "https://ro.tbibank.support/api/GetApplicationStatus");
    assert.equal(primite[0].corp.order_id, 60);
    assert.equal(primite[0].corp.token, "tok");
    assert.ok(r.fel === "ok" && r.stare === "Comanda in derulare TBI" && r.lant.length === 2);
  });
});

describe("loanCancellation si loanRefund", () => {
  test("✅ anularea: `data` criptat cu platforma „Api”, id-ul si jetonul lor; `error: 200` inseamna facuta", async () => {
    const primite = banca(() => json({ error: 200, message: "Loan cancellation registered successfully." }));
    assert.deepEqual(await anuleazaCererea(CFG, 60, "tok"), { fel: "facuta" });
    assert.equal(primite[0].url, "https://ro.tbibank.support/api/loanCancellation");
    assert.deepEqual(primite[0].date, { platform: "Api", orderId: "60", token: "tok", action: "cancel" });
  });

  test("⚠ dupa aprobare tbi refuza anularea cu 409, iar refuzul poarta codul", async () => {
    banca(() => json({ error: 409, message: "Cannot cancel an approved loan." }, 409));
    const r = await anuleazaCererea(CFG, 60, "tok");
    assert.ok(r.fel === "refuz" && r.cod === 409);
  });

  test("✅ rambursarea: tipul, suma la ban si adresa vestilor ei (`refundLink`)", async () => {
    const primite = banca(() => json({ error: 200, message: "Loan refund registered successfully." }));
    const r = await ramburseaza(CFG, 60, "tok", { tip: "partial", suma: 125.005, adresaVesti: "https://www.edinio.com/api/tbi/notificare/R" });
    assert.deepEqual(r, { fel: "facuta" });
    assert.equal(primite[0].url, "https://ro.tbibank.support/api/loanRefund");
    assert.deepEqual(primite[0].date, {
      platform: "Api", orderId: "60", token: "tok", action: "refund", type: "partial", amount: 125.01,
      refundLink: "https://www.edinio.com/api/tbi/notificare/R",
    });
  });

  test("un raspuns necitibil sau o cadere nu e confundat cu o operatie facuta", async () => {
    banca(() => new Response("<html>", { status: 500 }));
    assert.equal((await anuleazaCererea(CFG, 60, "tok")).fel, "necunoscut");
  });
});

describe("⚠⚠ verificarea datelor de acces, fara sa se atinga nimic la banca", () => {
  test("o anulare pentru o cerere care nu exista: 404 = tot bun, 207 = cheia de criptare, 401 = codul sau cheia de reseller", async () => {
    const primite = banca(() => json({ error: 404, message: "No application found for the given details." }, 404));
    assert.deepEqual(await verificaLegatura(CFG), { fel: "buna" });
    assert.equal(primite[0].date?.action, "cancel");
    assert.equal(Number(primite[0].date?.orderId) > 900_000_000, true, "sonda nu are voie sa nimereasca o cerere adevarata");
    banca(() => json({ error: 207, message: "Error encryption key or data." }, 207));
    assert.equal((await verificaLegatura(CFG)).fel, "cheie");
    banca(() => json({ error: 401, message: "Invalid credentials. Access denied." }, 401));
    assert.equal((await verificaLegatura(CFG)).fel, "credentiale");
    banca(() => new Response("x", { status: 503 }));
    assert.equal((await verificaLegatura(CFG)).fel, "necunoscut");
  });
});

describe("GetCalculations", () => {
  test("✅ produsele lor, ordonate dupa suma minima, cu dobanda, comisionul si limitele", async () => {
    const primite = banca(() => json([
      { scheme_id: 2, name: "Promo 0", period: 6, analysis_fee: 95, nir: 29, amount_min: 1000.01, amount_max: 4000 },
      { scheme_id: 1, name: "BNPL", period: 4, analysis_fee: 40, nir: 0, amount_min: 100, amount_max: 2000 },
    ]));
    const r = await produseleDeFinantare(CFG);
    assert.equal(primite[0].url, "https://ro.tbibank.support/api/GetCalculations");
    assert.ok(r.fel === "ok");
    assert.deepEqual(r.produse.map((p) => [p.nume, p.luni, p.dobanda, p.comision, p.sumaMin, p.sumaMax]), [
      ["BNPL", 4, 0, 40, 100, 2000],
      ["Promo 0", 6, 29, 95, 1000.01, 4000],
    ]);
  });
  test("401 = codul sau cheia de reseller", async () => {
    banca(() => json({ error: 401, message: "Invalid credentials. Access denied." }, 401));
    assert.equal((await produseleDeFinantare(CFG)).fel, "refuz");
  });
});
