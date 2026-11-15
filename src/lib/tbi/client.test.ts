import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { anuleazaCererea, trimiteCererea } from "./client";
import { citesteCheiaPublicaTbi } from "./cripto";
import { construiesteCererea } from "./cerere";

/*
 * Clientul tbi, cu banca SIMULATA: `fetch` e inlocuit, iar „banca" de aici face ce face a lor:
 * desparte corpul, descifreaza `order_data` cu cheia ei privata (algoritmul PHP: bucati de k octeti,
 * lipite), si raspunde ca ei (301 + Location). Asa se probeaza drumul intreg al octetilor, nu doar
 * functiile pe bucati.
 */

const SFTL = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const PUBLICA = citesteCheiaPublicaTbi(SFTL.publicKey);
const CFG = { sandbox: false, store_id: "magazin_ro", username: "user", password: "Parola123" };

function descifreazaCaBanca(b64: string): string {
  const octeti = Buffer.from(b64, "base64");
  const bucati: Buffer[] = [];
  for (let i = 0; i < octeti.length; i += 256) {
    bucati.push(privateDecrypt({ key: SFTL.privateKey, padding: constants.RSA_PKCS1_PADDING }, octeti.subarray(i, i + 256)));
  }
  return Buffer.concat(bucati).toString("utf8");
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

type Primit = { url: string; tip: string; corp: string; redirect?: string };
function banca(raspuns: (p: Primit) => Response): Primit[] {
  const primite: Primit[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const p = { url: String(url), tip: headers.get("content-type") ?? "", corp: String(init?.body ?? ""), redirect: init?.redirect };
    primite.push(p);
    return raspuns(p);
  }) as typeof fetch;
  return primite;
}

/** Campurile unui corp multipart, citite ca la ei (ASP.NET / PHP le citesc la fel). */
async function campuriMultipart(p: Primit): Promise<Record<string, string>> {
  const fd = await new Response(p.corp, { headers: { "content-type": p.tip } }).formData();
  const iesire: Record<string, string> = {};
  for (const [k, v] of fd.entries()) iesire[k] = String(v);
  return iesire;
}

const CERERE = construiesteCererea({
  comanda: {
    id: "x", order_number: "#0007", total: 2500.5, shipping_cost: 25,
    items: [{ name: "Șosete bărbătești", price: 2475.5, quantity: 1, product_id: "p1" }],
    customer_name: "Ion Popescu", customer_email: "ion@exemplu.ro", customer_phone: "0752000000",
    shipping_address: { address: "Str. A 1", city: "Iasi", county: "Iasi" },
  },
  cfg: { ...CFG, promo: false, categorie: "1" },
  idCerere: 700000123,
  adresaInapoi: "https://www.edinio.com/api/tbi/notificare/JETON",
  produse: new Map(),
});

describe("Finalize", () => {
  test("✅ corpul e cel din exemplele lor, iar banca il descifreaza intreg", async () => {
    const primite = banca(() => new Response(null, { status: 301, headers: { location: "https://ecommerce.tbibank.ro/TBILandingPage/Home/Index/?url=abc&link2payid=123" } }));
    const r = await trimiteCererea(CFG, PUBLICA, CERERE);
    assert.deepEqual(r, { fel: "redirect", adresa: "https://ecommerce.tbibank.ro/TBILandingPage/Home/Index/?url=abc&link2payid=123", status: 301 });
    assert.equal(primite.length, 1);
    assert.equal(primite[0].url, "https://ecommerce.tbibank.ro/Api/LoanApplication/Finalize");
    assert.equal(primite[0].redirect, "manual", "urmata, redirectarea ar aduce pagina lor in loc de adresa ei");
    assert.match(primite[0].tip, /^multipart\/form-data; boundary=/);
    const campuri = await campuriMultipart(primite[0]);
    assert.deepEqual(Object.keys(campuri).sort(), ["order_data", "providerCode"]);
    assert.equal(campuri.providerCode, "magazin_ro");
    const json = JSON.parse(descifreazaCaBanca(campuri.order_data));
    assert.deepEqual(json, JSON.parse(JSON.stringify(CERERE)));
    assert.equal(json.items[0].name, "Șosete bărbătești", "diacriticele au ajuns intregi la banca");
    /* Credentialele pleaca DOAR criptate. */
    assert.ok(!primite[0].corp.includes("Parola123"));
  });

  test("mediul de test merge la serverul lor de test, fara `/Api` in cale", async () => {
    const primite = banca(() => new Response(null, { status: 302, headers: { location: "/TBILandingPage/x" } }));
    const r = await trimiteCererea({ ...CFG, sandbox: true }, PUBLICA, CERERE);
    assert.equal(primite[0].url, "https://vmrouatftos01.westeurope.cloudapp.azure.com/LoanApplication/Finalize");
    /* O adresa relativa se rezolva fata de serverul lor. */
    assert.deepEqual(r, { fel: "redirect", adresa: "https://vmrouatftos01.westeurope.cloudapp.azure.com/TBILandingPage/x", status: 302 });
  });

  test("⚠ 401 = credentiale respinse: refuz DOVEDIT, cu sfatul potrivit", async () => {
    banca(() => new Response("Unauthorized", { status: 401 }));
    const r = await trimiteCererea(CFG, PUBLICA, CERERE);
    assert.equal(r.fel, "refuz");
    assert.match((r as { mesaj: string }).mesaj, /autentificarea/);
  });

  test("⚠ 5xx, retea picata, 200 fara adresa: NU stim, nu „refuz”", async () => {
    banca(() => new Response("<html>eroare</html>", { status: 502 }));
    assert.equal((await trimiteCererea(CFG, PUBLICA, CERERE)).fel, "necunoscut");
    banca(() => new Response("<html>pagina</html>", { status: 200 }));
    assert.equal((await trimiteCererea(CFG, PUBLICA, CERERE)).fel, "necunoscut");
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    assert.equal((await trimiteCererea(CFG, PUBLICA, CERERE)).fel, "necunoscut");
  });

  test("o redirectare catre o adresa nesigura (http) nu trimite clientul acolo", async () => {
    banca(() => new Response(null, { status: 301, headers: { location: "http://ecommerce.tbibank.ro/x" } }));
    assert.equal((await trimiteCererea(CFG, PUBLICA, CERERE)).fel, "necunoscut");
  });

  test("adresa intoarsa in corp (unele instalari) e primita", async () => {
    banca(() => new Response("https://ecommerce.tbibank.ro/TBILandingPage/y", { status: 200 }));
    const r = await trimiteCererea(CFG, PUBLICA, CERERE);
    assert.deepEqual(r, { fel: "redirect", adresa: "https://ecommerce.tbibank.ro/TBILandingPage/y", status: 200 });
  });
});

describe("CanceledByCustomer", () => {
  test("✅ formularul din exemplul lor: `orderData` criptat + `encryptCode`, iar raspunsul `isSuccess`", async () => {
    const primite = banca(() => Response.json({ isSuccess: true, error: null }));
    const r = await anuleazaCererea(CFG, PUBLICA, "700000123");
    assert.deepEqual(r, { fel: "anulata" });
    assert.equal(primite[0].url, "https://ecommerce.tbibank.ro/Api/LoanApplication/CanceledByCustomer");
    assert.equal(primite[0].tip, "application/x-www-form-urlencoded");
    const sp = new URLSearchParams(primite[0].corp);
    assert.equal(sp.get("encryptCode"), "magazin_ro");
    assert.deepEqual(JSON.parse(descifreazaCaBanca(sp.get("orderData")!)),
      { orderId: "700000123", statusId: "1", username: "user", password: "Parola123" });
  });

  test("`isSuccess: false` e refuz, cu mesajul lor", async () => {
    banca(() => Response.json({ isSuccess: false, error: "Application already approved" }));
    const r = await anuleazaCererea(CFG, PUBLICA, "1");
    assert.equal(r.fel, "refuz");
    assert.match((r as { mesaj: string }).mesaj, /already approved/);
  });

  test("un raspuns necitibil sau o cadere nu e confundat cu o anulare", async () => {
    banca(() => new Response("oops", { status: 500 }));
    assert.equal((await anuleazaCererea(CFG, PUBLICA, "1")).fel, "necunoscut");
    banca(() => new Response("ok", { status: 200 }));
    assert.equal((await anuleazaCererea(CFG, PUBLICA, "1")).fel, "necunoscut");
  });
});
