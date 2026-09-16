import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { esteChiarPdf, NU_E_PDF } from "./factura-comenzii";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LA MARKETPLACE NU PLEACA O PAGINA DE LOGIN DREPT FACTURA   (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Urcarea facturii la eMAG si Trendyol aduce documentul cu `fetch(f.url)` FARA nicio acreditare,
 * fiindca marketplace-ul trebuie sa poata lua fisierul. Apoi il pune in R2 cu
 * `contentType: "application/pdf"` si da adresa mai departe.
 *
 * ⚠⚠ Daca adresa salvata de la casa de facturare se dovedeste una care CERE autentificare,
 * raspunsul nu e o eroare: e `200` cu pagina de login. `res.ok` e adevarat, `arrayBuffer()`
 * intoarce HTML, si la marketplace ajunge o pagina de login etichetata drept document fiscal.
 * Comerciantul afla cand i-o cere cineva.
 *
 * ⚠ Nu e o grija inchipuita, si de asta a aparut proba:
 *   * la SmartBill raspunsul are DOUA adrese, `documentViewUrl` (publica) si `documentUrl`
 *     („cere autentificare"), si pe 16.09.2026 era gata sa se pastreze cea gresita;
 *   * la Oblio, `link` are forma unei adrese cu jeton (`?it=<32 hex>`), deci PARE publica, dar
 *     documentatia lor nu spune, iar zero facturi emise inseamna ca nimeni n-a probat-o.
 *
 * Deci nu se mai raspunde la intrebarea „e publica adresa?" pentru fiecare casa in parte. Se
 * verifica CE A VENIT, la toate trei deodata.
 */

const octeti = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("Se verifica CE a venit, nu de unde", () => {
  test("un PDF adevarat trece", () => {
    assert.equal(esteChiarPdf(octeti("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n1 0 obj")), true);
    assert.equal(esteChiarPdf(octeti("%PDF-1.4")), true);
  });

  test("⚠⚠ o pagina de autentificare NU trece", () => {
    assert.equal(esteChiarPdf(octeti("<!DOCTYPE html><html><body>Autentificare</body></html>")), false);
    assert.equal(esteChiarPdf(octeti("<html><head><title>Login</title></head>")), false);
  });

  test("⚠ nici o eroare JSON, nici un corp gol, nici unul prea scurt", () => {
    assert.equal(esteChiarPdf(octeti('{"status":401,"statusMessage":"Unauthorized"}')), false);
    assert.equal(esteChiarPdf(octeti("")), false);
    assert.equal(esteChiarPdf(octeti("%PDF")), false, "patru octeti nu sunt inca `%PDF-`");
  });

  test("⚠ si ceva care doar SEAMANA nu trece", () => {
    /* Antetul se cere la INCEPUT: un HTML care pomeneste `%PDF-` pe la mijloc nu e un document. */
    assert.equal(esteChiarPdf(octeti("<html>%PDF-1.7</html>")), false);
    assert.equal(esteChiarPdf(octeti(" %PDF-1.7")), false, "nici macar cu un spatiu in fata");
  });

  test("⚠ se uita DOAR la antet, ca sa nu refuze un PDF bun", () => {
    /* Un document neobisnuit inauntru ramane un document. Nu validam PDF-uri, verificam ca nu e
       altceva. */
    assert.equal(esteChiarPdf(octeti("%PDF-1.7" + "\x00".repeat(50))), true);
  });
});

// ─── Si garda chiar sta pe amandoua drumurile ────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Amandoua urcarile trec prin garda", () => {
  const DRUMURI = [
    { nume: "eMAG", cale: "src/lib/emag/facturi.ts" },
    { nume: "Trendyol", cale: "src/lib/trendyol/facturi.ts" },
  ] as const;

  for (const d of DRUMURI) {
    test(`⚠⚠ ${d.nume}: nu se urca nimic neverificat`, () => {
      const s = viu(d.cale);
      assert.match(s, /if \(!esteChiarPdf\(pdf\)\) throw new Error\(NU_E_PDF\);/, `${d.nume}: garda lipseste`);
    });

    test(`⚠⚠ ${d.nume}: garda e INAINTE de `+"`uploadToR2`", () => {
      /*
       * Pusa dupa, fisierul ar fi deja in R2 si adresa ar fi deja compusa: am fi refuzat urcarea
       * la marketplace, dar am fi lasat in urma o pagina de login gazduita de noi, sub o cheie
       * care poarta numarul facturii.
       */
      const s = viu(d.cale);
      const iGarda = s.indexOf("esteChiarPdf(pdf)");
      const iUpload = s.indexOf("uploadToR2(", iGarda > 0 ? 0 : undefined);
      assert.ok(iGarda > 0, `${d.nume}: garda lipseste`);
      assert.ok(iGarda < iUpload, `${d.nume}: garda vine DUPA urcarea in R2`);
    });
  }

  test("⚠ si mesajul spune omului ce sa verifice, nu doar ca a picat", () => {
    assert.match(NU_E_PDF, /nu e un PDF/);
    assert.match(NU_E_PDF, /NU s-a urcat/, "nu se spune ca urcarea a fost oprita");
    assert.match(NU_E_PDF, /fara sa fii logat/, "nu se spune CUM se verifica");
  });

  test("⚠⚠ si aruncarea se face INAUNTRUL registrului, ca sa se poata relua", () => {
    /*
     * `cuRegistru` prinde aruncarea si clasifica. Aruncata in afara lui, urcarea ar fi ramas
     * marcata „in curs" si n-ar mai fi fost reluata niciodata dupa ce omul repara linkul.
     */
    for (const d of DRUMURI) {
      const s = viu(d.cale);
      const iRegistru = s.indexOf("cuRegistru(");
      const iGarda = s.indexOf("esteChiarPdf(pdf)");
      assert.ok(iRegistru > 0 && iRegistru < iGarda, `${d.nume}: garda nu e in interiorul registrului`);
    }
  });
});
