import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ADRESA_API, ADRESA_SCRIPT, apeleaza, cerereBruta, contulNuExista, felulErorii, mesajPentruOm, parametriFormular,
  testeazaConexiunea,
} from "./client";

/*
 * Clientul theMarketer, probat fara fir.
 *
 * Raspunsurile din `PE_FIR` sunt BRUTE, culese pe 18.11.2026 de pe `t.themarketer.com` cu chei INVENTATE
 * (nu scriu nimic in niciun cont). De aici vine regula care conteaza: 401 NU inseamna mereu cheie gresita,
 * iar un 404 poate veni si ca pagina HTML.
 */
const PE_FIR = {
  /** `add_subscriber` cu email si chei inventate. */
  clientNegasit: { status: 404, tip: "application/json", corp: '{"message":"Customer not found."}' },
  /** `unsubscribed_emails` cu chei inventate: PAGINA HTML de 404, nu JSON. */
  clientNegasitHtml: { status: 404, tip: "text/html; charset=UTF-8", corp: "<!DOCTYPE html><html><head><title>Not Found</title></head></html>" },
  /** `add_subscriber` FARA email: validarea vine inaintea cheilor, si raspunde 401. */
  validare401: { status: 401, tip: "application/json", corp: '{"message":"The email field is required."}' },
  /** Din specul lor (developers.themarketer.com): cheia REST gresita. */
  cheieGresita: { status: 401, tip: "application/json", corp: '{"message":"Invalid REST Key."}' },
  /** `update_order_status` cerut cu POST: 405, pagina HTML. */
  metodaGresita: { status: 405, tip: "text/html; charset=UTF-8", corp: "<!DOCTYPE html><title>An Error Occurred: Method Not Allowed</title>" },
  /** `save_order` fara campurile obligatorii (din specul lor). */
  validare422: { status: 422, tip: "application/json", corp: '{"message":"One of the following required attributes is empty: products, firstname, lastname, number, email_address or phone"}' },
  /** Cheia de urmarire inventata: scriptul lor raspunde 404. */
  scriptNegasit: { status: 404, tip: "text/html; charset=UTF-8", corp: "<!DOCTYPE html><title>Not Found</title>" },
  /**
   * ⚠⚠ Cheia de urmarire REALA (publica, din pagina unui client theMarketer), ceruta fara domeniul lui: 403,
   * pagina Laravel „Forbidden”. Asa raspunde la proba noastra ORICE cheie buna: scriptul se da numai pe
   * domeniile contului. Pe site-ul clientului, acelasi script: 200 si `__sm__tracking_loaded`.
   */
  scriptCheieBunaFaraDomeniu: { status: 403, tip: "text/html; charset=UTF-8", corp: "<!DOCTYPE html><html lang=\"en\"><head><title>Forbidden</title></head><body>403 Forbidden</body></html>" },
};

type Apel = { url: string; init: RequestInit };

function fetchDeProba(raspunsuri: Array<{ status: number; tip?: string; corp?: string; antete?: Record<string, string> } | "retea">) {
  const apeluri: Apel[] = [];
  let i = 0;
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    apeluri.push({ url: String(url), init: init ?? {} });
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    if (r === "retea") throw new TypeError("fetch failed");
    return new Response(r.corp ?? "", { status: r.status, headers: { "content-type": r.tip ?? "application/json", ...(r.antete ?? {}) } });
  }) as typeof fetch;
  return { f, apeluri };
}

const CHEI = { tracking_key: "TRK12345", customer_id: "CUST-1", rest_key: "rest-key-de-proba-123" };

describe("parametrii, in forma PHP pe care o citeste Laravel", () => {
  test("liste si obiecte imbricate devin `products[0][product_id]`", () => {
    const p = parametriFormular({
      number: "1001",
      products: [{ product_id: "p1", price: "10.00", quantity: 2 }],
      attributes: { oras: "Brasov" },
      gol: null,
      lipsa: undefined,
      da: true,
      nu: false,
    });
    assert.deepEqual(p, [
      ["number", "1001"],
      ["products[0][product_id]", "p1"],
      ["products[0][price]", "10.00"],
      ["products[0][quantity]", "2"],
      ["attributes[oras]", "Brasov"],
      ["da", "1"],
      ["nu", "0"],
    ]);
  });
});

describe("ce inseamna statusurile lor", () => {
  test("404 = contul (Customer ID) nu exista, oricare ar fi corpul", () => {
    assert.equal(felulErorii(404, "Customer not found."), "acreditari");
    assert.equal(felulErorii(404, null), "acreditari");
    assert.equal(contulNuExista(404, "Customer not found."), true);
    assert.equal(contulNuExista(404, "No query results for model [App\\Models\\System\\Domain] CUSTOMER_ID"), true);
    assert.equal(contulNuExista(404, null), true);
    /* Un 404 cu alt mesaj e altceva (un contact pe care nu-l au), nu contul. */
    assert.equal(contulNuExista(404, "Subscriber not found"), false);
  });

  test("⚠ 401 se citeste dupa MESAJ: validarea datelor nu e o cheie gresita", () => {
    assert.equal(felulErorii(401, "Invalid REST Key."), "acreditari");
    assert.equal(felulErorii(401, "The email field is required."), "refuz");
    assert.equal(felulErorii(401, "The selected type is invalid."), "refuz");
    assert.equal(felulErorii(400, "Customer ID not provided."), "acreditari");
  });

  test("422 si 405 sunt refuzuri; 429 si 5xx se reiau", () => {
    assert.equal(felulErorii(422, "One of the following required attributes is empty"), "refuz");
    assert.equal(felulErorii(405, null), "refuz");
    assert.equal(felulErorii(429, null), "limita");
    assert.equal(felulErorii(500, null), "server");
    assert.equal(felulErorii(503, null), "server");
  });

  test("mesajele pentru om spun ce sa repare, in romana", () => {
    assert.match(mesajPentruOm(404, "Customer not found.", "acreditari"), /Customer ID/);
    assert.match(mesajPentruOm(401, "Invalid REST Key.", "acreditari"), /REST API/);
    assert.match(mesajPentruOm(401, "The email field is required.", "refuz"), /The email field is required\./);
    assert.match(mesajPentruOm(undefined, null, "retea"), /la timp/);
  });
});

describe("transportul", () => {
  test("⚠ la POST cheile pleaca in CORP, nu in adresa", async () => {
    const { f, apeluri } = fetchDeProba([{ status: 200, corp: '{"result":true}' }]);
    const r = await apeleaza(CHEI, "POST", "add_subscriber", { email: "om@x.ro" }, { fetchImpl: f });
    assert.equal(r.ok, true);
    assert.equal(apeluri[0].url, `${ADRESA_API}add_subscriber`);
    assert.ok(!apeluri[0].url.includes("rest-key-de-proba"), "cheia REST nu are voie in adresa unui POST");
    const corp = new URLSearchParams(String(apeluri[0].init.body));
    assert.equal(corp.get("k"), CHEI.rest_key);
    assert.equal(corp.get("u"), CHEI.customer_id);
    assert.equal(corp.get("email"), "om@x.ro");
    assert.equal(apeluri[0].init.redirect, "error", "o redirectare ar duce cheia la alta gazda");
    assert.match(String((apeluri[0].init.headers as Record<string, string>)["Content-Type"]), /x-www-form-urlencoded/);
  });

  test("la GET (dictat de ei: `update_order_status`) cheile sunt in adresa", async () => {
    const { f, apeluri } = fetchDeProba([{ status: 200, corp: '{"message":"1"}' }]);
    await apeleaza(CHEI, "GET", "update_order_status", { order_number: "1001", order_status: "Shipped" }, { fetchImpl: f });
    const u = new URL(apeluri[0].url);
    assert.equal(u.pathname, "/api/v1/update_order_status");
    assert.equal(u.searchParams.get("order_status"), "Shipped");
    assert.equal(apeluri[0].init.body, undefined);
  });

  test("raspunsurile de pe fir ajung la felul potrivit", async () => {
    const cazuri: Array<[keyof typeof PE_FIR, string]> = [
      ["clientNegasit", "acreditari"],
      ["clientNegasitHtml", "acreditari"],
      ["validare401", "refuz"],
      ["cheieGresita", "acreditari"],
      ["metodaGresita", "refuz"],
      ["validare422", "refuz"],
    ];
    for (const [cheie, fel] of cazuri) {
      const { f } = fetchDeProba([PE_FIR[cheie]]);
      const r = await apeleaza(CHEI, "POST", "save_order", {}, { fetchImpl: f });
      assert.equal(r.ok, false, cheie);
      if (!r.ok) assert.equal(r.fel, fel, cheie);
    }
  });

  test("⚠ o cadere de retea NU se reia (un `save_order` repetat ar putea dubla comanda)", async () => {
    const { f, apeluri } = fetchDeProba(["retea", { status: 200, corp: "1" }]);
    const r = await apeleaza(CHEI, "POST", "save_order", {}, { fetchImpl: f });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.fel, "retea");
    assert.equal(apeluri.length, 1);
  });

  test("429 se reia (inseamna „n-am facut nimic”), cu asteptarea ceruta", async () => {
    const asteptari: number[] = [];
    const { f, apeluri } = fetchDeProba([
      { status: 429, antete: { "retry-after": "1" } },
      { status: 200, corp: '{"result":true}' },
    ]);
    const r = await cerereBruta("https://t.themarketer.com/api/v1/x", { method: "POST", body: "" }, { fetchImpl: f, dormi: async (ms) => { asteptari.push(ms); } });
    assert.ok(!("retea" in r) && r.status === 200);
    assert.equal(apeluri.length, 2);
    assert.deepEqual(asteptari, [1000]);
  });

  test("fara chei nu pleaca nimic", async () => {
    const { f, apeluri } = fetchDeProba([{ status: 200 }]);
    const r = await apeleaza({ customer_id: "", rest_key: "x" }, "POST", "add_subscriber", {}, { fetchImpl: f });
    assert.equal(r.ok, false);
    assert.equal(apeluri.length, 0);
  });
});

describe("proba de conexiune: toate cele trei chei, fara sa scrie nimic", () => {
  test("cheia de urmarire gresita se spune pe nume", async () => {
    const { f, apeluri } = fetchDeProba([PE_FIR.scriptNegasit]);
    const r = await testeazaConexiunea(CHEI, { fetchImpl: f });
    assert.deepEqual(r.ok ? null : r.camp, "tracking_key");
    assert.equal(apeluri.length, 1, "fara script valid nu se mai intreaba API-ul");
    assert.equal(apeluri[0].url, `${ADRESA_SCRIPT}TRK12345`);
  });

  test("Customer ID gresit: 404 (pagina HTML) la citirea dezabonatilor", async () => {
    const { f } = fetchDeProba([{ status: 200, tip: "text/javascript", corp: "/*ok*/" }, PE_FIR.clientNegasitHtml]);
    const r = await testeazaConexiunea(CHEI, { fetchImpl: f });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.camp, "customer_id");
  });

  test("cheia REST gresita", async () => {
    const { f } = fetchDeProba([{ status: 200, corp: "/*ok*/" }, PE_FIR.cheieGresita]);
    const r = await testeazaConexiunea(CHEI, { fetchImpl: f });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.camp, "rest_key");
  });

  test("⚠⚠ o cheie de urmarire BUNA raspunde 403 de pe server, si NU e respinsa", async () => {
    /* Asa raspunde, masurat, la orice cheie reala: domeniul cererii nu e al contului. Cu 403 respins,
       niciun comerciant nu s-ar fi putut conecta. */
    const { f, apeluri } = fetchDeProba([PE_FIR.scriptCheieBunaFaraDomeniu, { status: 200, corp: "[]" }]);
    assert.deepEqual(await testeazaConexiunea(CHEI, { fetchImpl: f }), { ok: true });
    assert.equal(apeluri.length, 2, "dupa script se intreaba si API-ul");
  });

  test("alt raspuns al scriptului (nici 200, nici 403, nici 404) nu trece", async () => {
    const { f } = fetchDeProba([{ status: 401, tip: "text/html", corp: "<html></html>" }]);
    const r = await testeazaConexiunea(CHEI, { fetchImpl: f });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.camp, "tracking_key");
  });

  test("totul bun: lista de dezabonati (chiar goala) e raspunsul asteptat, pe ZIUA de azi", async () => {
    const { f, apeluri } = fetchDeProba([{ status: 200, corp: "/*ok*/" }, { status: 200, corp: "[]" }]);
    const r = await testeazaConexiunea(CHEI, { fetchImpl: f, acum: new Date("2026-11-18T22:30:00Z") });
    assert.deepEqual(r, { ok: true });
    const u = new URL(apeluri[1].url);
    assert.equal(u.pathname, "/api/v1/unsubscribed_emails");
    /* 22:30 UTC e deja 19.11 la Bucuresti: specul lor cere ZILE, iar ziua e a Romaniei. */
    assert.equal(u.searchParams.get("date_from"), "2026-11-19");
    assert.equal(u.searchParams.get("date_to"), "2026-11-19");
  });

  test("un 200 care nu e lista (o pagina de undeva) nu trece drept succes", async () => {
    const { f } = fetchDeProba([{ status: 200, corp: "/*ok*/" }, { status: 200, tip: "text/html", corp: "<html></html>" }]);
    const r = await testeazaConexiunea(CHEI, { fetchImpl: f });
    assert.equal(r.ok, false);
  });
});
