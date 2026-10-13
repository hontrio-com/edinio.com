import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clasificaCaderea, clasificaRaspuns, mesajPentruOm, campurileErorii } from "./erori";
import { acelasiId, idText, intreg, suma, rotunjeste, inBani } from "./numere";
import { citesteJwt } from "./jwt";

/*
 * Clasificatorul raspunsurilor easySales. Formele de eroare vin din exemplele colectiei; pentru
 * 401, 403, 404, 405, 429 si 5xx colectia n-are niciun corp, deci forma se citeste dupa chei.
 */

describe("formele documentate ale erorilor", () => {
  test("validarea Laravel: `{message, errors}` fara `success` -> validare, cu campurile aplatizate", () => {
    const c = clasificaRaspuns({ status: 422, corp: {
      message: "The given data was invalid.",
      errors: { "order.order_id": ["The order.order id field is required."], "order.customer.phone": ["The phone is required."] },
    } });
    assert.equal(c.verdict, "validare");
    assert.deepEqual(c.campuri, ["order.order_id: The order.order id field is required.", "order.customer.phone: The phone is required."]);
  });

  test("422 fara `errors` e un refuz de business (ex. categoria atasata), nu o validare", () => {
    const c = clasificaRaspuns({ status: 422, corp: { success: false, message: "Cannot delete attached categories!", data: null } });
    assert.equal(c.verdict, "refuz");
    assert.equal(c.mesaj, "Cannot delete attached categories!");
  });

  test("hibridul de la `archive/bulk` (`success:false` + `errors`) e tot validare", () => {
    const c = clasificaRaspuns({ status: 422, corp: { success: false, message: "x", errors: { skus: ["The skus may not have more than 50 items."] } } });
    assert.equal(c.verdict, "validare");
  });

  test("forma OAuth: mesajul se ia din `message`, iar indiciul intra in cautare", () => {
    const c = clasificaRaspuns({ status: 400, corp: {
      success: false, error: "invalid_request", error_description: "The request is missing a required parameter.",
      hint: "Check the `website_token` parameter", message: "The request is missing a required parameter.",
    } });
    assert.equal(c.verdict, "refuz");
    assert.match(c.mesaj, /missing a required parameter/);
  });

  test("lipsa cheii `success` pe un 200 NU e eroare (31 din 86 de raspunsuri 200 n-o au)", () => {
    assert.equal(clasificaRaspuns({ status: 200, corp: { data: [{ name: "Edinio" }] } }).verdict, "reusit");
    assert.equal(clasificaRaspuns({ status: 200, corp: null }).verdict, "reusit");
  });

  test("⚠ 200 cu `success: false` e refuz, si se marcheaza ca anomalie (documentatia nu-l are)", () => {
    const c = clasificaRaspuns({ status: 200, corp: { success: false, message: "ceva" } });
    assert.equal(c.verdict, "refuz");
    assert.equal(c.anomalie, "200 cu success:false");
  });
});

describe("⚠⚠ motivul unui 403 se citeste din text, in ordinea planului", () => {
  test("plafonul de comenzi se recunoaste INAINTEA codului: pe 403, pe 422, chiar pe 400", () => {
    for (const status of [403, 422, 400, 429]) {
      const c = clasificaRaspuns({ status, corp: { message: "Orders limit exceeded." } });
      assert.equal(c.verdict, "plafon", `pe ${status} plafonul n-a fost recunoscut`);
    }
  });

  test("website dezactivat, website token invalid, scope lipsa, alt 403", () => {
    assert.equal(clasificaRaspuns({ status: 403, corp: { message: "The website has been deactivated" } }).verdict, "website_dezactivat");
    assert.equal(clasificaRaspuns({ status: 403, corp: { success: false, message: "Invalid website token" } }).verdict, "website_token_invalid");
    assert.equal(clasificaRaspuns({ status: 403, corp: { message: "Invalid scope(s) provided." } }).verdict, "scope_lipsa");
    assert.equal(clasificaRaspuns({ status: 403, corp: { message: "This action is unauthorized." } }).verdict, "interzis");
    assert.equal(clasificaRaspuns({ status: 403, corp: null }).verdict, "interzis");
  });

  test("⚠ un 403 nerecunoscut NU e prezentat ca parola gresita", () => {
    const m = mesajPentruOm(clasificaRaspuns({ status: 403, corp: { message: "Restricted sub-account" } }));
    assert.doesNotMatch(m, /parol|reconect|autentific/i);
    assert.match(m, /Restricted sub-account/);
  });

  test("401 e fluxul de token, oricare ar fi corpul (colectia n-are niciun exemplu 401)", () => {
    assert.equal(clasificaRaspuns({ status: 401, corp: null }).verdict, "neautorizat");
    assert.equal(clasificaRaspuns({ status: 401, corp: { message: "Unauthenticated." } }).verdict, "neautorizat");
  });
});

describe("codurile fara corp documentat", () => {
  test("429 si 5xx sunt trecatoare; 404 negasit; 405 e defectul NOSTRU", () => {
    for (const s of [429, 500, 502, 503, 504, 520]) assert.equal(clasificaRaspuns({ status: s, corp: null }).verdict, "trecatoare");
    assert.equal(clasificaRaspuns({ status: 404, corp: null }).verdict, "negasit");
    assert.equal(clasificaRaspuns({ status: 405, corp: null }).verdict, "metoda");
  });

  test("400 „Invalid json” e un defect al nostru, nu al comenzii", () => {
    assert.equal(clasificaRaspuns({ status: 400, corp: { message: "Invalid json" } }).verdict, "json_invalid");
  });
});

describe("⚠⚠ o cadere fara raspuns la SCRIERE e `necunoscut`, nu `esuat`", () => {
  test("la scriere: necunoscut (comanda poate sa fi intrat la ei)", () => {
    const e = new Error("timeout"); e.name = "TimeoutError";
    assert.equal(clasificaCaderea(true, e).verdict, "necunoscut");
    assert.equal(clasificaCaderea(true, new TypeError("fetch failed")).verdict, "necunoscut");
  });
  test("la citire: trecatoare", () => {
    assert.equal(clasificaCaderea(false, new TypeError("fetch failed")).verdict, "trecatoare");
  });
});

describe("campurile erorii, oricum ar veni", () => {
  test("lista de erori pe SKU de la `/stocks/bulk` [A: error_messages {sku, message}]", () => {
    const c = campurileErorii({ errors: [{ sku: "ABC", message: "Product not found" }, "alta eroare"] });
    assert.deepEqual(c, ["ABC: Product not found", "alta eroare"]);
  });
  test("nu inventeaza nimic din ce nu e obiect", () => {
    assert.deepEqual(campurileErorii(null), []);
    assert.deepEqual(campurileErorii("text"), []);
    assert.deepEqual(campurileErorii({ errors: "x" }), []);
  });
});

describe("numerele si identificatorii lor", () => {
  test("⚠ id-urile se compara ca text: `2` si `\"2\"` sunt acelasi; lipsa nu e egala cu lipsa", () => {
    assert.equal(acelasiId(2, "2"), true);
    assert.equal(acelasiId(" 1134585 ", 1134585), true);
    assert.equal(acelasiId(null, null), false);
    assert.equal(acelasiId("", ""), false);
    assert.equal(idText(undefined), null);
    assert.equal(idText(NaN), null);
  });

  test("sumele: numar sau sir zecimal; virgula si gunoiul NU", () => {
    assert.equal(suma("964.15"), 964.15);
    assert.equal(suma("53.8500"), 53.85);
    assert.equal(suma(42.862100999999996), 42.862100999999996);
    assert.equal(suma("-11.9"), -11.9);
    assert.equal(suma("1,234"), null, "virgula e ambigua: o mie sau unu virgula doua");
    assert.equal(suma("12 lei"), null);
    assert.equal(suma(null), null);
    assert.equal(suma(Infinity), null);
  });

  test("intreg si rotunjirea fara capcana lui toFixed", () => {
    assert.equal(intreg("3"), 3);
    assert.equal(intreg("3.5"), null);
    assert.equal(rotunjeste(1.005, 2), 1.01);
    assert.equal(inBani(294.9), 29490);
  });
});

describe("JWT-ul se citeste, nu se crede", () => {
  const jwt = (corp: unknown) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(corp)).toString("base64url")}.x`;

  test("revendicarile din mostra colectiei: sub, scopes, exp", () => {
    const r = citesteJwt(jwt({ aud: "c", sub: "1", exp: 1748013076, scopes: ["read-orders", "add-orders"] }))!;
    assert.equal(r.sub, "1");
    assert.deepEqual(r.scopuri, ["read-orders", "add-orders"]);
    assert.equal(r.expiraLaMs, 1748013076000);
  });

  test("⚠ fara `scopes`, scopurile sunt NECUNOSCUTE (null), nu „fara drepturi” ([])", () => {
    assert.equal(citesteJwt(jwt({ sub: "1" }))!.scopuri, null);
  });

  test("ce nu arata a JWT intoarce null, fara sa arunce", () => {
    for (const t of ["", "abc", "a.b", "a.%%%.c", null, undefined, `x.${Buffer.from("nu e json").toString("base64url")}.y`]) {
      assert.equal(citesteJwt(t as string), null);
    }
  });
});
