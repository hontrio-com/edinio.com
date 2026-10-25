import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aplicaPretulLaPunct, aratiSamedayPoint, parseShippingZones } from "./rules";

/**
 * PRETUL FIX LA PUNCT SI SAMEDAY POINT, din Setari > Livrare (25.10.2026).
 *
 * Cerut de proprietar pentru VetDepo: Sameday Point scos din checkout, GLS ParcelShop la 10
 * lei, DPD la punct la 15 lei, fara sa se schimbe pretul livrarii la adresa. Pana azi punctul
 * costa mereu cat adresa (aceeasi cotatie sau acelasi tarif al zonei), iar regulile de
 * transport nu deosebesc adresa de punct, deci nu se putea face din setari.
 *
 * Rulare: `npm test`.
 */

test("zona pastreaza pretul la punct doar cand e un numar; casuta goala inseamna „ca la adresa”", () => {
  const z = parseShippingZones({
    gls: { enabled: true, price: 18, locker_price: 10 },
    dpd: { enabled: true, price: 18, locker_price: "15.004" },
    cargus: { enabled: true, price: 17, locker_price: "" },
    fan: { enabled: true, price: 20, locker_price: null },
    posta: { enabled: true, price: 16, locker_price: "abc" },
    ups: { enabled: true, price: 40, locker_price: -5 },
  });
  assert.equal(z.gls.locker_price, 10);
  assert.equal(z.dpd.locker_price, 15);
  // ⚠ Golul nu e zero: altfel o casuta stearsa ar fi dat livrarea la punct gratis.
  assert.equal(z.cargus.locker_price, undefined);
  assert.equal(z.fan.locker_price, undefined);
  assert.equal(z.posta.locker_price, undefined);
  assert.equal(z.ups.locker_price, 0, "negativul se plafoneaza, ca la pretul zonei");
});

test("Sameday Point se ofera pana cand comerciantul il scoate anume", () => {
  const z = parseShippingZones({
    sameday: { enabled: true, price: 0, pudo: false },
    alt: { enabled: true, price: 0, pudo: "false" },
  });
  assert.equal(z.sameday.pudo, false);
  assert.equal(z.alt.pudo, undefined, "doar un boolean adevarat conteaza");
  assert.equal(aratiSamedayPoint(z.sameday), false);
  assert.equal(aratiSamedayPoint(z.alt), true);
  assert.equal(aratiSamedayPoint({ enabled: true, price: 0 }), true, "lipsa = ca pana azi");
  assert.equal(aratiSamedayPoint(undefined), true);
});

test("⚠⚠ pretul la punct schimba DOAR optiunile la punct ale curierului care il are", () => {
  const zone = {
    gls: { enabled: true, price: 18, locker_price: 10 },
    dpd: { enabled: true, price: 18, locker_price: 15 },
    sameday: { enabled: true, price: 0 },
  };
  const optiuni = [
    { courier: "gls", deliveryType: "address", price: 18 },
    { courier: "gls", deliveryType: "locker", price: 18 },
    { courier: "dpd", deliveryType: "address", price: 21.5 },
    { courier: "dpd", deliveryType: "locker", price: 21.5 },
    { courier: "sameday", deliveryType: "locker", price: 14.99 },
  ];
  const dupa = aplicaPretulLaPunct(optiuni, zone);
  assert.deepEqual(dupa.map((o) => o.price), [18, 10, 21.5, 15, 14.99]);
  assert.equal(optiuni[1].price, 18, "intrarea nu se modifica pe loc");
});

/* ─── Cablarea in `getShippingOptions` ────────────────────────────────────── */

const SURSA = readFileSync(path.join(process.cwd(), "src/lib/actions/shipping.actions.ts"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ cotarea punctelor PUDO pleaca doar cand zona Sameday nu le-a scos", () => {
  // Fara conditie, Sameday Point ar fi aparut mai departe la VetDepo.
  assert.match(SURSA, /if \(aratiSamedayPoint\(zone\)\) promises\.push\(\s*getSamedayPudoServiceId\(/);
  assert.equal(SURSA.split("getSamedayPudoServiceId(samedayConfig!)").length - 1, 1, "o singura cotare PUDO in ramura");
});

test("⚠⚠ pretul la punct se pune inaintea filtrului de rezerve si a regulilor, o singura data", () => {
  const apel = "options = aplicaPretulLaPunct(options, zones);";
  assert.equal(SURSA.split(apel).length - 1, 1);
  const i = SURSA.indexOf(apel);
  // Inaintea filtrului: altfel o cotatie picata (rezerva la 0) ar fi scos punctul, desi are pret fix.
  assert.ok(i < SURSA.indexOf("rezervaEDeIncredere("), "inaintea filtrului de rezerve");
  // Inaintea regulilor: „transport gratuit peste X” trebuie sa se aplice si peste pretul fix.
  assert.ok(i < SURSA.indexOf("applyShippingRules("), "inaintea regulilor");
  assert.ok(i < SURSA.indexOf("semneazaOptiuni(businessId, destination, esteRamburs, grameCotate, finalOptions"), "inaintea semnarii");
});
