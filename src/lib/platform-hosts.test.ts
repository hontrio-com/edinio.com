import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPlatformHost, valideazaDomeniuClient } from "./platform-hosts";

describe("gazdele platformei nu pot fi revendicate de un comerciant", () => {
  const interzise = [
    "edinio.com",
    "www.edinio.com",
    "EDINIO.COM",
    "  edinio.com  ",
    "edinio.com.",          // punct final (root DNS)
    "sub.edinio.com",
    "orice.subdomeniu.edinio.com",
    "edinio-preview.vercel.app",
    "localhost",
  ];

  for (const d of interzise) {
    test(`refuza "${d}"`, () => {
      const v = valideazaDomeniuClient(d);
      assert.equal(v.ok, false, `"${d}" ar fi trebuit refuzat`);
    });
  }
});

describe("domeniile reale de client trec si se normalizeaza la apex", () => {
  const permise: [string, string][] = [
    ["magazinul-meu.ro", "magazinul-meu.ro"],
    ["www.magazinul-meu.ro", "magazinul-meu.ro"],
    ["  WWW.Magazinul-Meu.RO  ", "magazinul-meu.ro"],
    ["shop.firma.ro", "shop.firma.ro"],
    ["xn--bcher-kva.de", "xn--bcher-kva.de"],
    // Nume care CONTINE "edinio" dar nu e al platformei.
    ["notedinio.com", "notedinio.com"],
    ["edinio.com.ro", "edinio.com.ro"],
  ];

  for (const [intrare, asteptat] of permise) {
    test(`accepta "${intrare}" → ${asteptat}`, () => {
      const v = valideazaDomeniuClient(intrare);
      assert.equal(v.ok, true, `"${intrare}" ar fi trebuit acceptat`);
      if (v.ok) assert.equal(v.domeniu, asteptat);
    });
  }
});

describe("intrari malformate sunt refuzate inainte de a ajunge la Vercel", () => {
  const rele = [
    "",
    "   ",
    "https://magazin.ro",           // schema
    "magazin.ro/cale",              // cale
    "magazin.ro:8080",              // port ramas dupa normalizare -> invalid
    "magazin",                      // fara TLD
    "-magazin.ro",                  // eticheta incepe cu cratima
    "magazin-.ro",                  // eticheta se termina cu cratima
    "magazin..ro",                  // eticheta goala
    "magazin.r",                    // TLD de o litera
    "magazin.123",                  // TLD numeric
    "ma gazin.ro",                  // spatiu
    "magazin.ro\nevil.com",         // injectie pe linie noua
    "магазин.ро",                   // Unicode brut (punycode se scrie explicit)
    `${"a".repeat(250)}.ro`,        // peste 253 de caractere
  ];

  for (const d of rele) {
    test(`refuza ${JSON.stringify(d)}`, () => {
      assert.equal(valideazaDomeniuClient(d).ok, false);
    });
  }
});

describe("isPlatformHost ramane corect pentru rutare", () => {
  test("gazdele platformei, cu si fara port", () => {
    assert.equal(isPlatformHost("localhost:3000"), true);
    assert.equal(isPlatformHost("www.edinio.com"), true);
    assert.equal(isPlatformHost("edinio.com"), true);
    assert.equal(isPlatformHost("edinio-git-main.vercel.app"), true);
  });

  test("domeniile de client nu sunt gazde de platforma", () => {
    assert.equal(isPlatformHost("magazinul-meu.ro"), false);
    assert.equal(isPlatformHost("notedinio.com"), false);
  });
});
