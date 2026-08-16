import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  alerteleDin, asTablou, descrieEroarea, erorileDin, FONDURI_RAMBURS, FONDURI_RAMBURS_IMPLICIT,
  gazda, linkUrmarire, primulCod, upsGata, ziuaUps, type UpsConfig,
} from "./client";
import { eVandutInRomania, numeServiciu, serviciiPropuse, serviciulImplicit } from "./servicii";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * UPS raspunde in DOUA gramatici diferite, pe acelasi API:
 *   succes  →  `{ "ShipmentResponse": { "Response": { "ResponseStatus": … } } }`  PascalCase
 *   eroare  →  `{ "response": { "errors": [ { "code", "message" } ] } }`          minuscule
 *
 * Un parser scris pentru una n-o vede pe cealalta si raporteaza „raspuns gol" fix cand
 * cauza e scrisa in clar in corp.
 *
 * Si mai e un nivel: un 200 poate purta `ResponseStatus.Code != "1"` — „Identifies the
 * success or failure of the transaction. 1 = Successful" — adica un esec fara `errors[]`.
 */

const CONFIG: UpsConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "A1B2C3",
  expeditor: {
    nume: "Depozit", telefon: "0721000111", strada: "Str. A nr. 1",
    oras: "Cluj-Napoca", cod_postal: "400001",
  },
};

describe("UPS: citirea erorilor", () => {
  test("⚠ erorile stau sub `response.errors`, cu MINUSCULE", () => {
    const corp = { response: { errors: [{ code: "120601", message: "Missing or invalid Package weight" }] } };
    assert.equal(primulCod(corp), "120601");
    assert.ok(descrieEroarea(corp, "").includes("greutatea"));
  });

  test("un `errors[]` la RADACINA (forma PascalCase) nu exista si nu se citeste", () => {
    /* Daca UPS ar schimba forma, vrem sa se vada — nu sa ghicim. */
    assert.deepEqual(erorileDin({ errors: [{ code: "1", message: "x" }] }), []);
  });

  test("un cod necunoscut trece mai departe cu mesajul si codul lor", () => {
    const corp = { response: { errors: [{ code: "999999", message: "Ceva neasteptat" }] } };
    const text = descrieEroarea(corp, "");
    assert.ok(text.includes("Ceva neasteptat"));
    assert.ok(text.includes("999999"));
  });

  test("⚠ codul de ramburs invalid are traducere: e cel mai des gresit", () => {
    const corp = { response: { errors: [{ code: "120626", message: "The COD Funds Code is invalid" }] } };
    assert.ok(descrieEroarea(corp, "").includes("1 (numerar)"));
  });

  test("⚠ valuta rambursului: mesajul spune ce sa faci, nu doar ce e gresit", () => {
    const corp = { response: { errors: [{ code: "120597", message: "Invalid COD currency code" }] } };
    assert.ok(descrieEroarea(corp, "").includes("RON"));
  });

  test("mai multe erori se aduna, fara sa se repete", () => {
    const corp = {
      response: {
        errors: [
          { code: "120205", message: "Missing or invalid ShipTo City" },
          { code: "120205", message: "Missing or invalid ShipTo City" },
        ],
      },
    };
    assert.equal(descrieEroarea(corp, "").split(" | ").length, 1);
  });

  test("corp necitibil: se arata textul brut, nu „raspuns gol”", () => {
    assert.ok(descrieEroarea(null, "<html>502 Bad Gateway</html>").includes("502"));
    assert.equal(descrieEroarea(null, ""), "raspuns gol");
  });

  test("⚠ AL TREILEA NIVEL: un 200 cu `ResponseStatus.Code` diferit de „1”", () => {
    const corp = {
      ShipmentResponse: { Response: { ResponseStatus: { Code: "0", Description: "Failure" } } },
    };
    /* Nu are `errors[]` deloc — daca nu s-ar citi starea, ar trece drept succes. */
    assert.deepEqual(erorileDin(corp), []);
    assert.ok(descrieEroarea(corp, "").includes("starea 0"));
  });

  test("starea se gaseste sub ORICE invelis: Rate, Ship, Void, LabelRecovery", () => {
    for (const invelis of ["RateResponse", "VoidShipmentResponse", "LabelRecoveryResponse"]) {
      const corp = { [invelis]: { Response: { ResponseStatus: { Code: "0", Description: "Failure" } } } };
      assert.ok(descrieEroarea(corp, "").includes("starea 0"), invelis);
    }
  });

  test("⚠ Locator scrie starea ALTFEL: `ResponseStatusCode` plat", () => {
    const corp = { LocatorResponse: { Response: { ResponseStatusCode: "0", ResponseStatusDescription: "Failure" } } };
    assert.ok(descrieEroarea(corp, "").includes("starea 0"));
  });
});

describe("UPS: avertismentele de pe un raspuns de SUCCES", () => {
  test("⚠ se citesc — acolo spune UPS ca tarifele negociate NU s-au aplicat", () => {
    const corp = {
      RateResponse: {
        Response: {
          ResponseStatus: { Code: "1", Description: "Success" },
          Alert: [{ Code: "120900", Description: "User Id and Shipper Number combination is not qualified to receive negotiated rates." }],
        },
      },
    };
    const alerte = alerteleDin(corp);
    assert.equal(alerte.length, 1);
    assert.equal(alerte[0].code, "120900");
  });

  test("un singur avertisment venit ca OBIECT se citeste la fel ca un tablou", () => {
    const corp = {
      RateResponse: { Response: { Alert: { Code: "123020", Description: "Invalid ShipFrom postal code" } } },
    };
    assert.equal(alerteleDin(corp).length, 1);
  });

  test("fara avertismente, lista e goala si nu crapa nimic", () => {
    assert.deepEqual(alerteleDin({ RateResponse: { Response: {} } }), []);
    assert.deepEqual(alerteleDin(null), []);
  });
});

describe("UPS: tablourile care nu sunt mereu tablouri", () => {
  test("⚠ pe `v1` (reimprimarea) un singur element vine ca OBIECT", () => {
    assert.deepEqual(asTablou({ a: 1 }), [{ a: 1 }]);
    assert.deepEqual(asTablou([{ a: 1 }, { a: 2 }]), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(asTablou(null), []);
    assert.deepEqual(asTablou(undefined), []);
  });
});

describe("UPS: gazdele si prefixele", () => {
  test("productia e implicitul — un cont real nu trebuie sa nimereasca in CIE", () => {
    assert.equal(gazda({}), "https://onlinetools.ups.com");
    assert.equal(gazda({ mediu: "test" }), "https://wwwcie.ups.com");
    assert.equal(gazda({ mediu: "productie" }), "https://onlinetools.ups.com");
  });

  test("linkul public de urmarire se COMPUNE — UPS nu intoarce niciunul", () => {
    assert.ok(linkUrmarire("1Z12345E0205271688").includes("1Z12345E0205271688"));
    assert.ok(linkUrmarire("a b").includes("a%20b"));
  });
});

describe("UPS: „configurat” inseamna acelasi lucru peste tot", () => {
  test("fara credentiale, fara cont sau fara adresa de expeditie nu e gata", () => {
    assert.equal(upsGata(CONFIG), true);
    assert.equal(upsGata({ ...CONFIG, enabled: false }), false);
    assert.equal(upsGata({ ...CONFIG, client_secret: "" }), false);
    assert.equal(upsGata({ ...CONFIG, account_number: "" }), false);
    assert.equal(upsGata(null), false);
  });

  test("⚠ adresa de expeditie intra in ea: fara oras si cod postal nu se poate cota", () => {
    assert.equal(upsGata({ ...CONFIG, expeditor: { ...CONFIG.expeditor!, oras: "" } }), false);
    assert.equal(upsGata({ ...CONFIG, expeditor: { ...CONFIG.expeditor!, cod_postal: "" } }), false);
  });
});

describe("UPS: data in fusul Romaniei", () => {
  test("⚠ `YYYYMMDD` fara cratime, si ziua ROMANEASCA, nu cea UTC", () => {
    /* 01:30 in Romania pe 16 august = inca 15 august in UTC (22:30). Fereastra de
       cautare dupa referinta si `ShipmentDate` trebuie sa spuna acelasi lucru. */
    const noapte = new Date("2026-08-15T23:30:00Z");
    assert.equal(ziuaUps(noapte), "20260816");
    assert.equal(/^\d{8}$/.test(ziuaUps(new Date("2026-01-05T12:00:00Z"))), true);
  });
});

describe("UPS: rambursul, din tabelul lor", () => {
  test("⚠ implicitul e „1” (numerar) — ce plateste un cumparator roman", () => {
    assert.equal(FONDURI_RAMBURS_IMPLICIT, "1");
  });

  test("cele doua valori valabile in Uniunea Europeana, la nivel de EXPEDIERE", () => {
    assert.deepEqual(FONDURI_RAMBURS.map((f) => f.cod), ["1", "9"]);
  });
});

describe("UPS: serviciile", () => {
  test("codurile se traduc, iar cele necunoscute primesc un nume citibil", () => {
    assert.ok(numeServiciu("07").includes("Express"));
    assert.ok(numeServiciu("65").includes("Saver"));
    assert.equal(numeServiciu("ZZ"), "UPS (serviciu ZZ)");
    assert.equal(numeServiciu("ZZ", "Something New"), "UPS Something New");
    assert.equal(numeServiciu(null), "UPS");
  });

  test("in configurare se propun doar cele patru vandute in Romania", () => {
    const propuse = serviciiPropuse("RO");
    assert.deepEqual(propuse.map((s) => s.cod).sort(), ["07", "11", "54", "65"]);
    /* Numai doua merg si intern. */
    assert.deepEqual(propuse.filter((s) => s.intern).map((s) => s.cod).sort(), ["07", "65"]);
  });

  test("pentru alta tara de plecare nu se propune nimic — n-avem matricea lor", () => {
    assert.deepEqual(serviciiPropuse("DE"), []);
  });

  test("⚠ `eVandutInRomania` e un SFAT, si raspunde `true` la ce nu cunoaste", () => {
    assert.equal(eVandutInRomania("11", "RO", "RO"), false);
    assert.equal(eVandutInRomania("11", "RO", "DE"), true);
    assert.equal(eVandutInRomania("07", "RO", "RO"), true);
    assert.equal(eVandutInRomania("ZZ", "RO", "RO"), true);
  });

  test("implicitul intern e cel mai IEFTIN, nu cel mai scump", () => {
    /* Implicitul LOR, cand nu trimiti serviciul, e UPS Express — cel mai scump. */
    assert.equal(serviciulImplicit("RO", "RO"), "65");
    assert.equal(serviciulImplicit("RO", "DE"), "11");
  });
});
