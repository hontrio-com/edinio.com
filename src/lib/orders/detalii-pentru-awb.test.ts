import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { campuriDinConfigurare, detaliiPentruAwb, FARA_DETALII } from "./detalii-pentru-awb";
import { codPostalDeTrimis, eroareCodPostalRo } from "./cod-postal-checkout";

/*
 * Ce ajunge din formularul de checkout pe AWB. Configurarea e cea reala a magazinului care a cerut
 * asta (07.10.2026): campuri personalizate „Cod postal", „Tara", „Punct reper", „Observatii",
 * „Marime inel"; valorile sunt inventate.
 */

const CAMPURI = [
  { id: "cf_1780781197625", label: "Cod postal", pe_awb: false },
  { id: "cf_1786863293816", label: "Tara", pe_awb: false },
  { id: "cf_1789233895590", label: "Punct reper", pe_awb: true },
  { id: "cf_1790352182830", label: "Observatii", pe_awb: true },
  { id: "cf_1790439816688", label: "Marime inel", pe_awb: false },
];

const NOTE = JSON.stringify({
  cf_1780781197625: " 700 001 ",
  cf_1786863293816: "Romania",
  cf_1789233895590: "langa  scoala",
  cf_1790352182830: "sunati inainte",
  cf_1790439816688: "54",
});

describe("Observatiile de pe AWB", () => {
  test("numai campurile bifate „Pune pe AWB”, cu eticheta lor, in ordinea configurarii", () => {
    assert.equal(detaliiPentruAwb(NOTE, CAMPURI).observatii, "Punct reper: langa scoala; Observatii: sunati inainte");
  });

  test("nimic bifat, nimic pe AWB (pana acum, observatiile porneau goale)", () => {
    assert.equal(detaliiPentruAwb(NOTE, CAMPURI.map((c) => ({ ...c, pe_awb: false }))).observatii, "");
  });

  test("campul bifat dar necompletat nu lasa „Punct reper:” gol", () => {
    const note = JSON.stringify({ cf_1789233895590: "  ", cf_1790352182830: "sunati" });
    assert.equal(detaliiPentruAwb(note, CAMPURI).observatii, "Observatii: sunati");
  });

  test("notele vechi (text simplu) sau stricate nu rup fereastra", () => {
    assert.deepEqual(detaliiPentruAwb("text vechi", CAMPURI), FARA_DETALII);
    assert.deepEqual(detaliiPentruAwb("{stricat", CAMPURI), FARA_DETALII);
    assert.deepEqual(detaliiPentruAwb(null, CAMPURI), FARA_DETALII);
  });
});

describe("Codul postal din campul personalizat (comenzile de dinainte de campul adevarat)", () => {
  test("dupa NUMELE campului, numai cu 6 cifre", () => {
    assert.equal(detaliiPentruAwb(NOTE, CAMPURI).codPostal, "700001");
    const cuDiacritice = [{ id: "x", label: " Cod poștal " }];
    assert.equal(detaliiPentruAwb(JSON.stringify({ x: "400001" }), cuDiacritice).codPostal, "400001");
    /* Nu se ghiceste: un cod gresit nu pleaca. */
    assert.equal(detaliiPentruAwb(JSON.stringify({ x: "40001" }), cuDiacritice).codPostal, "");
    /* Alt camp care doar CONTINE cuvintele nu e codul postal. */
    assert.equal(detaliiPentruAwb(JSON.stringify({ y: "400001" }), [{ id: "y", label: "Cod postal firma veche" }]).codPostal, "");
  });
});

describe("Configurarea, citita din baza", () => {
  test("forma stricata da lista goala; `pe_awb` e numai `true`", () => {
    assert.deepEqual(campuriDinConfigurare(null), []);
    assert.deepEqual(campuriDinConfigurare({ custom_fields: "nu" }), []);
    assert.deepEqual(
      campuriDinConfigurare({ custom_fields: [{ id: "a", label: "A", pe_awb: "da" }, { label: "fara id" }, null] }),
      [{ id: "a", label: "A", pe_awb: false }],
    );
  });
});

describe("Codul postal in checkout (Romania)", () => {
  const oprit = { enabled: false, required: false };
  const optional = { enabled: true, required: false };
  const obligatoriu = { enabled: true, required: true };

  test("oprit: nicio eroare si nimic trimis (ca pana acum)", () => {
    assert.equal(eroareCodPostalRo(oprit, ""), null);
    assert.equal(codPostalDeTrimis(false, oprit, "400001"), undefined);
  });

  test("pornit: 6 cifre, spatiile se iarta; obligatoriu numai cand e cerut", () => {
    assert.equal(eroareCodPostalRo(optional, ""), null);
    assert.equal(eroareCodPostalRo(obligatoriu, ""), "Introduceti codul postal");
    assert.equal(eroareCodPostalRo(optional, "40001"), "Codul postal are 6 cifre");
    assert.equal(eroareCodPostalRo(obligatoriu, "400 001"), null);
    assert.equal(codPostalDeTrimis(false, optional, "400 001"), "400001");
    assert.equal(codPostalDeTrimis(false, optional, "abc"), undefined);
  });

  test("internationalul ramane cum era", () => {
    assert.equal(codPostalDeTrimis(true, oprit, " 10115 "), "10115");
  });
});

/* ⚠ PE ELEMENT: fiecare loc, numit, foloseste regula. */
const sursa = (f: string) => readFileSync(f, "utf8");

describe("Fiecare loc foloseste regulile", () => {
  for (const f of ["src/components/storefront/sections/checkout/checkout-core.ts", "src/components/ministore/OrderModal.tsx"]) {
    test(`${f}: valideaza si trimite codul postal prin regula comuna`, () => {
      const s = sursa(f);
      assert.match(s, /eroareCodPostalRo\(campCodPostal, form\.postCode\)/);
      assert.match(s, /customer_postal_code: codPostalDeTrimis\(isIntl, campCodPostal, form\.postCode\)/);
    });
  }
  test("ambele formulare arata campul in Romania", () => {
    for (const f of ["src/components/storefront/sections/checkout/CheckoutForm.tsx", "src/components/ministore/OrderModal.tsx"]) {
      assert.match(sursa(f), /\{!isIntl && campCodPostal\.enabled && \(/, f);
    }
  });
  test("serverul pastreaza in Romania numai 6 cifre, in AMBELE copii ale comenzii", () => {
    const s = sursa("src/lib/actions/order.actions.ts");
    assert.equal((s.match(/return \/\^\\d\{6\}\$\/\.test\(cod\) \? \{ postal_code: cod \} : \{\};/g) ?? []).length, 2);
  });

  const CU_OBSERVATII: Record<string, RegExp> = {
    CargusAwbModal: /useState\(detaliiAwb\.observatii\)/,
    SamedayAwbModal: /useState\(detaliiAwb\.observatii\)/,
    FanCourierAwbModal: /useState\(detaliiAwb\.observatii\)/,
    CurieraAwbModal: /useState\(detaliiAwb\.observatii\)/,
    PallexAwbModal: /useState\(detaliiAwb\.observatii\)/,
    EcoletAwbModal: /useState\(detaliiAwb\.observatii\)/,
    DpdAwbModal: /setShipmentNote\] = useState\(detaliiAwb\.observatii\)/,
  };
  const CU_COD = ["Cargus", "Sameday", "FanCourier", "Curiera", "Pallex", "Colete", "Gls", "Dhl", "Fedex", "Shipo", "Smartship", "Ups", "Innoship", "Packeta", "Posta"];
  for (const [f, re] of Object.entries(CU_OBSERVATII)) {
    test(`${f}: observatiile pornesc din formular`, () => {
      const s = sursa(`src/components/dashboard/${f}.tsx`);
      assert.match(s, /const detaliiAwb = useDetaliiPentruAwb\(order\);/);
      assert.match(s, re);
    });
  }
  for (const f of CU_COD) {
    test(`${f}AwbModal: codul postal cade pe cel din formular`, () => {
      assert.match(sursa(`src/components/dashboard/${f}AwbModal.tsx`), /addr\??\.postal_code \|\| detaliiAwb\.codPostal/);
    });
  }
  test("lotul pune aceleasi observatii si acelasi cod postal", () => {
    const s = sursa("src/lib/actions/bulk-orders.actions.ts");
    assert.match(s, /const zip = \(addr\.postal_code \?\? ""\)\.trim\(\) \|\| detalii\.codPostal;/);
    assert.equal((s.match(/detalii\.observatii/g) ?? []).length >= 5, true);
  });
  test("ambele pagini dau campurile ferestrelor", () => {
    for (const f of ["src/app/(dashboard)/dashboard/orders/page.tsx", "src/app/(dashboard)/dashboard/orders/[orderId]/page.tsx"]) {
      assert.match(sursa(f), /<CampuriCheckoutProvider campuri=\{campuriDinConfigurare\(/, f);
    }
  });
});
