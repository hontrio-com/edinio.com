import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adresaDupaEmitereSameday } from "./punctul-de-pe-awb";
import { reteaSameday, reteauaPunctului } from "@/lib/shipping/reteaua-punctului";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RETEAUA PUNCTULUI SAMEDAY CALATORESTE PANA LA AWB              (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sameday are DOUA nomenclatoare de puncte, si pana azi platforma stia doar unul. Punctele PUDO
 * (Sameday Point, tejghele in magazine partenere) se cer de la alta cale, se emit cu alt serviciu
 * (`PP` fata de `LN`) si pleaca pe alt camp de pe AWB (`oohLastMile` fata de `lockerLastMile`).
 *
 * ⚠ DEFECTUL PE CARE IL APARA PROBA E RUPEREA LANTULUI. Reteaua trece prin sase maini:
 * cotare → optiune semnata → selectorul din checkout → comanda → `shipping_address` → emitere.
 * Pierduta la ORICARE din ele, coletul pleaca in cealalta retea: un id de punct PUDO scris pe
 * campul dulapurilor nu ajunge nicaieri, si nimeni nu afla pana nu suna clientul.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("lipsa inseamna easybox pe TOT lantul, nu „nicio retea”", () => {
  /*
   * ⚠ Comenzile de dinainte de 15.09.2026 nu poarta campul deloc, iar filele deschise in browser
   * nici atat. Tratate ca „nicio retea", ele ar fi plecat brusc pe alt serviciu.
   */
  assert.equal(reteaSameday(undefined), "easybox");
  assert.equal(reteaSameday(null), "easybox");
  assert.equal(reteaSameday(""), "easybox");
  assert.equal(reteaSameday("altceva"), "easybox");
  assert.equal(reteaSameday("pudo"), "pudo");
  assert.equal(reteauaPunctului("sameday", undefined), "easybox");
  assert.equal(reteauaPunctului("sameday", "pudo"), "pudo");
});

test("⚠ reteaua se scrie inapoi pe comanda DOAR cand chiar e PUDO", () => {
  const cuPudo = adresaDupaEmitereSameday({}, { id: 42, name: "Punct", retea: "pudo" });
  assert.equal(cuPudo.sameday_point_net, "pudo");

  const cuDulap = adresaDupaEmitereSameday({}, { id: 42, name: "Dulap", retea: "easybox" });
  assert.ok(!("sameday_point_net" in cuDulap), "easybox nu scrie campul: lipsa INSEAMNA easybox");

  const faraRetea = adresaDupaEmitereSameday({}, { id: 42, name: "Dulap" });
  assert.ok(!("sameday_point_net" in faraRetea));
});

test("⚠⚠ mutarea coletului din PUDO in easybox STERGE reteaua veche", () => {
  /*
   * Capcana adevarata: comerciantul muta coletul dintr-un punct Sameday intr-un dulap. Ramasa in
   * urma, `sameday_point_net: "pudo"` ar fi cerut serviciul PUDO pentru un id de DULAP. Cheile
   * punctului se sterg TOATE sau niciuna.
   */
  const veche = { sameday_point_net: "pudo", locker_id: "11", locker_name: "Punct vechi" };
  const dupa = adresaDupaEmitereSameday(veche, { id: 42, name: "Dulap nou", retea: "easybox" });
  assert.ok(!("sameday_point_net" in dupa), "reteaua veche trebuie stearsa");
  assert.equal(dupa.locker_id, "42");

  /* Si mutarea la ADRESA sterge tot. */
  const acasa = adresaDupaEmitereSameday(veche, null);
  assert.ok(!("sameday_point_net" in acasa));
  assert.equal(acasa.delivery_type, "address");
});

test("⚠ lantul nu e rupt: fiecare veriga chiar poarta campul", () => {
  /*
   * Probele pure de mai sus apara REGULA. Asta apara CABLAREA, care e chiar locul unde se rupe:
   * o veriga scapata nu da nicio eroare, doar trimite coletul in cealalta retea.
   */
  const verigi: [string, RegExp, string][] = [
    ["src/lib/actions/shipping.actions.ts", /samedayPointNet: "pudo"/,
      "cotarea trebuie sa marcheze optiunea PUDO"],
    ["src/lib/shipping/quote-token.ts", /samedayPointNet: o\.samedayPointNet/,
      "optiunea trebuie sa-si duca reteaua in planul SEMNAT"],
    ["src/components/ministore/CourierSelector.tsx", /samedayPointNet: opt\.samedayPointNet/,
      "selectorul trebuie sa duca reteaua mai departe in alegere"],
    ["src/components/ministore/OrderModal.tsx", /sameday_point_net: courierSelection\?\.samedayPointNet/,
      "fereastra de comanda trebuie sa trimita reteaua"],
    ["src/components/storefront/sections/checkout/checkout-core.ts", /sameday_point_net: courierSelection\?\.samedayPointNet/,
      "si checkoutul de magazin, care e a doua copie a aceluiasi drum"],
    ["src/lib/shipping/curierul-declarat.ts", /samedayPointNet: d\.sameday_point_net/,
      "planul pretins trebuie sa cuprinda reteaua, ca sa fie confruntata"],
    ["src/lib/actions/order.actions.ts", /sameday_point_net: data\.sameday_point_net/,
      "comanda trebuie sa scrie reteaua pe adresa de livrare"],
    ["src/lib/actions/sameday.actions.ts", /retea: locker!\.retea \?\? "easybox"/,
      "emiterea trebuie sa citeasca reteaua punctului"],
    ["src/lib/sameday/client.ts", /const ePudo = input\.retea === "pudo";/,
      "clientul trebuie sa aleaga serviciul dupa retea"],
  ];

  for (const [cale, tipar, deCe] of verigi) {
    assert.match(viu(cale), tipar, `${cale}: ${deCe}`);
  }
});

test("⚠ selectorul deosebeste cele doua retele in CHEIA optiunii", () => {
  /*
   * Fara asta, cele doua optiuni Sameday la punct s-ar prabusi intr-o singura cheie: cumparatorul
   * ar vedea una in loc de doua, iar lista de puncte i-ar veni din reteaua gresita. Exact lectia
   * platita la cele trei retele FAN.
   */
  const s = viu("src/components/ministore/CourierSelector.tsx");
  assert.match(s, /\$\{o\.samedayPointNet \?\? ""\}/, "reteaua Sameday trebuie sa intre in cheia optiunii");
  assert.match(s, /opt\.courier === "sameday" \? \(opt\.samedayPointNet \?\? "easybox"\)/,
    "cererea listei de puncte trebuie sa poarte nomenclatorul cerut");
});

test("⚠ cele doua liste nu impart o intrare de cache", () => {
  /* Primul cumparator care deschide dulapurile ar umple cache-ul, iar urmatorul, care a ales un
     punct Sameday, ar primi tot dulapurile: ar alege un id din reteaua gresita. */
  const s = viu("src/lib/actions/shipping.actions.ts");
  assert.match(s, /courier === "sameday" \? `:\$\{reteaSamedayCeruta\}`/,
    "discriminantul de cache trebuie sa cuprinda reteaua Sameday");
  assert.match(s, /reteaSamedayCeruta === "pudo"\s*\n?\s*\? await puncteOohSameday\(config\)/,
    "lista PUDO trebuie adusa de la `ooh-locations`, nu de la `lockers`");
});
