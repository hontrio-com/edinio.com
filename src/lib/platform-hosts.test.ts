import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { esteDomeniulPropriu, esteGazdaDeDesfasurare, isPlatformHost, valideazaDomeniuClient } from "./platform-hosts";

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

  test("o gazda goala e a platformei (implicitul sigur mostenit din seo.ts)", () => {
    /* Sitemapul si robots-ul o tratau asa dinainte de unificarea listelor:
       o cerere fara `Host` primeste sitemapul platformei, nu unul gol pentru
       „domeniul" ``. */
    assert.equal(isPlatformHost(""), true);
    assert.equal(isPlatformHost(null), true);
    assert.equal(isPlatformHost(undefined), true);
    assert.equal(isPlatformHost("   "), true);
  });
});

describe("gazdele de desfasurare (*.vercel.app)", () => {
  test("sunt recunoscute, cu sau fara port, indiferent de majuscule", () => {
    assert.equal(esteGazdaDeDesfasurare("edinio-git-main.vercel.app"), true);
    assert.equal(esteGazdaDeDesfasurare("Edinio-Abc123.Vercel.APP:443"), true);
  });

  test("www.edinio.com si domeniile clientilor NU sunt gazde de desfasurare", () => {
    /* Altfel `X-Robots-Tag: noindex` de pe `*.vercel.app` ar ajunge pe site-ul
       platformei sau pe un magazin cu domeniu propriu. */
    assert.equal(esteGazdaDeDesfasurare("www.edinio.com"), false);
    assert.equal(esteGazdaDeDesfasurare("edinio.com"), false);
    assert.equal(esteGazdaDeDesfasurare("magazinul-meu.ro"), false);
    assert.equal(esteGazdaDeDesfasurare("vercel.app.ro"), false);
    assert.equal(esteGazdaDeDesfasurare(""), false);
    assert.equal(esteGazdaDeDesfasurare(null), false);
  });
});

describe("esteDomeniulPropriu: cererea vine chiar de pe domeniul magazinului?", () => {
  test("da, pe apexul stocat, cu port si majuscule normalizate", () => {
    assert.equal(esteDomeniulPropriu("magazin-client.ro", "magazin-client.ro"), true);
    assert.equal(esteDomeniulPropriu("Magazin-Client.RO:443", "magazin-client.ro"), true);
    assert.equal(esteDomeniulPropriu("magazin-client.ro", " Magazin-Client.RO "), true);
  });

  test("nu, pe platforma, pe alt domeniu, sau cand magazinul n-are domeniu", () => {
    assert.equal(esteDomeniulPropriu("www.edinio.com", "magazin-client.ro"), false);
    assert.equal(esteDomeniulPropriu("alt-magazin.ro", "magazin-client.ro"), false);
    assert.equal(esteDomeniulPropriu("magazin-client.ro", null), false);
    assert.equal(esteDomeniulPropriu("magazin-client.ro", ""), false);
    assert.equal(esteDomeniulPropriu(null, "magazin-client.ro"), false);
    assert.equal(esteDomeniulPropriu("", ""), false);
  });

  test("varianta www. nu e domeniul propriu: proxy-ul o trimite la apex inainte de randare", () => {
    assert.equal(esteDomeniulPropriu("www.magazin-client.ro", "magazin-client.ro"), false);
  });
});
