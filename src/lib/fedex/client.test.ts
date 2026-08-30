import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  alerteleDin, chiarNuExista, descrieEroarea, eRaspunsVirtual, extensiaEtichetei, fedexGata,
  gazda, linkUrmarire, primulCod, specificatieEticheta, STOC_IMPLICIT,
  type FedexConfig,
} from "./client";
import { numeServiciu, eMarfaGrea, serviciiPropuse } from "./servicii";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * FedEx raspunde erori in TREI forme diferite, si una dintre ele nu e in nicio
 * schema de-a lor:
 *   1. `errors[]` — forma standard;
 *   2. `error_description` — ce raspunde gateway-ul la un token stricat
 *      (`{"error_description": "Invalid CXS JWT"}`), fara `transactionId`, fara `errors[]`;
 *   3. `output.alerts[]` cu `alertType: WARNING` — pe un raspuns de SUCCES.
 *
 * Un parser care s-ar uita doar la prima ar spune „raspuns gol" fix cand cauza e
 * scrisa in clar in corp.
 */

const CONFIG: FedexConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "613902139",
  expeditor: { nume: "Depozit", telefon: "0721000111", strada: "Str. A nr. 1", oras: "Cluj-Napoca", cod_postal: "400001" },
};

describe("FedEx: citirea erorilor", () => {
  test("forma standard: se traduce codul, nu se repeta mesajul lor", () => {
    const corp = { errors: [{ code: "ACCOUNT.NUMBER.INVALID", message: "Invalid account number." }] };
    assert.ok(descrieEroarea(corp, "").includes("9 cifre"));
    assert.equal(primulCod(corp), "ACCOUNT.NUMBER.INVALID");
  });

  test("un cod necunoscut trece mai departe cu mesajul si codul lor", () => {
    const corp = { errors: [{ code: "SOMETHING.NEW", message: "Ceva neasteptat" }] };
    const text = descrieEroarea(corp, "");
    assert.ok(text.includes("Ceva neasteptat"));
    assert.ok(text.includes("SOMETHING.NEW"));
  });

  test("⚠ forma NEDOCUMENTATA a gateway-ului se citeste si ea", () => {
    const corp = { error_description: "Invalid CXS JWT" };
    assert.equal(descrieEroarea(corp, ""), "Invalid CXS JWT");
    assert.equal(primulCod(corp), null);
  });

  test("mesajul din `output.message` (anulare) nu se pierde", () => {
    const corp = { output: { message: "Shipment is successfully cancelled" } };
    assert.ok(descrieEroarea(corp, "").includes("cancelled"));
  });

  test("corp necitibil: se arata textul brut, nu „raspuns gol”", () => {
    assert.ok(descrieEroarea(null, "<html>502 Bad Gateway</html>").includes("502"));
    assert.equal(descrieEroarea(null, ""), "raspuns gol");
  });

  test("mai multe erori se aduna, fara sa se repete", () => {
    const corp = {
      errors: [
        { code: "CITY.REQUIRED", message: "A valid city is required" },
        { code: "CITY.REQUIRED", message: "A valid city is required" },
      ],
    };
    const text = descrieEroarea(corp, "");
    assert.equal(text.split(" | ").length, 1);
  });
});

describe("FedEx: avertismentele de pe un raspuns de SUCCES", () => {
  test("⚠ se citesc — acolo spune FedEx ca ti-a schimbat adresa", () => {
    const corp = {
      output: {
        alerts: [{ code: "ORIGIN.STATEORPROVINCECODE.CHANGED", alertType: "NOTE", message: "State changed" }],
      },
    };
    const alerte = alerteleDin(corp);
    assert.equal(alerte.length, 1);
    assert.equal(alerte[0].code, "ORIGIN.STATEORPROVINCECODE.CHANGED");
  });

  test("raspunsul din sandbox se recunoaste", () => {
    const alerte = alerteleDin({
      output: { alerts: [{ code: "VIRTUAL.RESPONSE", alertType: "NOTE", message: "This is a Virtual Response." }] },
    });
    assert.equal(eRaspunsVirtual(alerte), true);
    assert.equal(eRaspunsVirtual([]), false);
  });

  test("lipsa lor nu arunca", () => {
    assert.deepEqual(alerteleDin(null), []);
    assert.deepEqual(alerteleDin({}), []);
    assert.deepEqual(alerteleDin({ output: { alerts: "nu e tablou" } }), []);
  });
});

describe("FedEx: gazda si configurarea", () => {
  test("⚠ implicitul e PRODUCTIA — un cont real nu trebuie sa nimereasca in sandbox", () => {
    assert.equal(gazda({}), "https://apis.fedex.com");
    assert.equal(gazda({ mediu: "productie" }), "https://apis.fedex.com");
    assert.equal(gazda({ mediu: "test" }), "https://apis-sandbox.fedex.com");
  });

  test("„gata” cere si expeditorul, nu doar cheile", () => {
    assert.equal(fedexGata(CONFIG), true);
    assert.equal(fedexGata({ ...CONFIG, enabled: false }), false);
    assert.equal(fedexGata({ ...CONFIG, client_secret: "" }), false);
    assert.equal(fedexGata({ ...CONFIG, account_number: "" }), false);
    assert.equal(fedexGata(null), false);
    assert.equal(fedexGata(undefined), false);
  });

  test("⚠ fara codul postal al expeditorului nu se poate cota — deci nu e „gata”", () => {
    const fara = { ...CONFIG, expeditor: { ...CONFIG.expeditor!, cod_postal: "" } };
    assert.equal(fedexGata(fara), false);
  });
});

describe("FedEx: eticheta", () => {
  test("un stoc inventat cade pe implicitul nostru, nu pleaca la ei", () => {
    assert.equal(specificatieEticheta({ stoc_eticheta: "CEVA_INVENTAT" }).labelStockType, STOC_IMPLICIT);
    assert.equal(specificatieEticheta({ stoc_eticheta: "STOCK_4X6" }).labelStockType, "STOCK_4X6");
  });

  test("formatul implicit e PDF, ca sa se poata tipari pe o imprimanta de birou", () => {
    assert.equal(specificatieEticheta({}).imageType, "PDF");
    assert.equal(specificatieEticheta({ format_eticheta: "ZPLII" }).imageType, "ZPLII");
  });

  test("extensia fisierului urmeaza formatul", () => {
    assert.equal(extensiaEtichetei("PDF"), "pdf");
    assert.equal(extensiaEtichetei("PNG"), "png");
    assert.equal(extensiaEtichetei("ZPLII"), "zpl");
    assert.equal(extensiaEtichetei("ceva"), "pdf");
  });
});

describe("FedEx: serviciile", () => {
  test("cele patru din Romania au nume omenesti", () => {
    assert.ok(numeServiciu("FEDEX_PRIORITY").includes("Priority"));
    assert.ok(numeServiciu("FEDEX_FIRST").includes("First"));
    assert.ok(numeServiciu("FEDEX_PRIORITY_EXPRESS").includes("Priority Express"));
  });

  test("⚠ un serviciu necunoscut primeste un nume citibil, nu enumerarea bruta", () => {
    // Enumerarea bruta intr-un checkout romanesc arata a defect; „Serviciu FedEx"
    // ar sterge singura informatie utila si ar face doua servicii noi identice.
    const nume = numeServiciu("FEDEX_SOMETHING_BRAND_NEW");
    assert.equal(nume.includes("_"), false);
    assert.ok(nume.startsWith("FedEx"));
    assert.notEqual(numeServiciu("FEDEX_ALTCEVA"), nume);
  });

  test("numele lor se foloseste cand exista si nu-l stim pe al nostru", () => {
    assert.equal(numeServiciu("NECUNOSCUT_X", "FedEx Something"), "FedEx Something");
  });

  test("marfa grea e recunoscuta", () => {
    assert.equal(eMarfaGrea("FEDEX_PRIORITY_FREIGHT"), true);
    assert.equal(eMarfaGrea("FEDEX_PRIORITY"), false);
    assert.equal(eMarfaGrea("NECUNOSCUT"), false);
  });

  test("⚠ enumerarile propuse NU au spatiu la final, desi tabelul lor are", () => {
    // In `API_Reference_Guide.json` doua chei sunt scrise `"FEDEX_PRIORITY "` si
    // `"FEDEX_PRIORITY_FREIGHT "`. Copiate mecanic, ar trimite un serviceType invalid.
    for (const s of serviciiPropuse("RO")) {
      assert.equal(s.cod, s.cod.trim(), `„${s.cod}” are spatii`);
      assert.match(s.cod, /^[A-Z_]+$/);
    }
  });

  test("pentru Romania se propun cele patru domestice plus internationalele", () => {
    const coduri = serviciiPropuse("RO").map((s) => s.cod);
    for (const c of ["FEDEX_FIRST", "FEDEX_PRIORITY_EXPRESS", "FEDEX_PRIORITY", "FEDEX_PRIORITY_FREIGHT"]) {
      assert.ok(coduri.includes(c), `lipseste ${c}`);
    }
    assert.ok(coduri.includes("FEDEX_INTERNATIONAL_PRIORITY"));
  });

  test("⚠ serviciile care NU merg intern in Romania nu se propun", () => {
    const coduri = serviciiPropuse("RO").map((s) => s.cod);
    // Coloana e goala la Romania in matricea lor, iar `FEDEX_ECONOMY_SELECT` scrie
    // literal „Only U.K.".
    assert.equal(coduri.includes("FEDEX_ECONOMY_SELECT"), false);
    assert.equal(coduri.includes("PRIORITY_OVERNIGHT"), false);
    assert.equal(coduri.includes("FEDEX_PRIORITY_EXPRESS_FREIGHT"), false);
  });

  test("pentru alta tara de plecare nu se ghiceste portofoliul domestic", () => {
    const coduri = serviciiPropuse("DE").map((s) => s.cod);
    assert.equal(coduri.includes("FEDEX_FIRST"), false);
    assert.ok(coduri.includes("FEDEX_INTERNATIONAL_PRIORITY"));
  });
});

describe("FedEx: „nu am gasit nimic” vs „nu ti-am putut spune”", () => {
  /*
   * ⚠ REGRESIE PROPRIE, gasita la a doua trecere.
   *
   * `cautaDupaReferinta` arunca TOATE rezultatele cu eroare si intorcea o lista
   * goala. Dar al cincilea nivel de citire a raspunsului lor (`trackResults[].error`
   * intr-un 200) acopera si `TRACKING.DATA.NOTUNIQUE` — „sunt MAI MULTE expedieri cu
   * referinta asta". Topita in „lista goala", ea ar fi deblocat emiterea peste o
   * expediere care CHIAR exista: al doilea AWB, taxabil.
   */
  test("codurile de „nu exista” chiar inseamna ca nu exista", () => {
    assert.equal(chiarNuExista([]), true);
    assert.equal(chiarNuExista(["TRACKING.REFERENCENUMBER.NOTFOUND"]), true);
    assert.equal(chiarNuExista(["TRACKING.REFERENCENUMBER.NOTFOUND", "TRACKING.DATA.NOTFOUND"]), true);
  });

  test("⚠ „mai multe expedieri cu referinta asta” NU inseamna „niciuna”", () => {
    assert.equal(chiarNuExista(["TRACKING.DATA.NOTUNIQUE"]), false);
  });

  test("un cod necunoscut nu se ia drept „nu exista”", () => {
    assert.equal(chiarNuExista(["CEVA.NOU"]), false);
    assert.equal(chiarNuExista(["NECUNOSCUT"]), false);
  });

  test("o singura eroare ambigua strica tot lotul, si asa trebuie", () => {
    assert.equal(chiarNuExista(["TRACKING.REFERENCENUMBER.NOTFOUND", "TRACKING.DATA.NOTUNIQUE"]), false);
  });
});

describe("FedEx: linkul de urmarire", () => {
  test("se compune, fiindca ei nu-l intorc", () => {
    assert.ok(linkUrmarire("794953555571").includes("794953555571"));
    assert.ok(linkUrmarire("794953555571").startsWith("https://www.fedex.com/fedextrack/"));
  });

  test("un AWB cu caractere ciudate nu strica adresa", () => {
    assert.equal(linkUrmarire("a b&c").includes(" "), false);
  });
});
