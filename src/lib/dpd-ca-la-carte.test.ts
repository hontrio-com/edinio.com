import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildDpdShipmentBody, calculateDpdDomesticPrice, calculateDpdIntlPrice, obpdPentru,
  punctulDpdPrimesteColetul, resolveDpdSiteId, type DpdConfig, type DpdShipmentInput,
} from "@/lib/dpd";

/*
 * Regulile scoase din auditul pe specificatia DPD (docs/curieri/DPD-web-api.txt), 08.10.2026.
 * Fiecare proba spune randul din specificatie pe care il apara.
 */

const CONFIG: DpdConfig = { enabled: true, username: "u", password: "p", client_id: 7 };
const INPUT: DpdShipmentInput = {
  recipientName: "Ion Popescu", recipientPhone: "0722000000", recipientEmail: "a@b.ro",
  recipientCity: "Cluj-Napoca", recipientCounty: "Cluj", recipientStreet: "Str. Lunga", recipientStreetNo: "1",
  recipientAddressNote: "", weightKg: 1, cashOnDelivery: 150, ref1: "#1", shipmentNote: "",
};

/* ─── fetch simulat: inregistreaza fiecare cerere si raspunde dupa cale ─── */
type Cerere = { cale: string; corp: Record<string, unknown> };
let cereri: Cerere[] = [];
const fetchOriginal = globalThis.fetch;
function simuleaza(raspunde: (cale: string, corp: Record<string, unknown>) => unknown) {
  cereri = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const cale = String(url).replace("https://api.dpd.ro/v1/", "");
    const corp = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    cereri.push({ cale, corp });
    return new Response(JSON.stringify(raspunde(cale, corp)), { status: 200 });
  }) as typeof fetch;
}
afterEach(() => { globalThis.fetch = fetchOriginal; });

/* ─── OBPD ─── */

test("OBPD numai cu ramburs: „options ... before the payment of the COD”", () => {
  const cfg: DpdConfig = { ...CONFIG, open_before_delivery: "OPEN" };
  assert.ok(obpdPentru(cfg, { hasCod: true, countryId: 642, serviceId: 2505 }));
  assert.equal(obpdPentru(cfg, { hasCod: false, countryId: 642, serviceId: 2505 }), null);
  assert.equal(obpdPentru(cfg, { hasCod: true, countryId: 642, serviceId: 2505, pickupOfficeId: 5 }), null);
  assert.equal(obpdPentru(cfg, { hasCod: true, countryId: 642, serviceId: 9999 }), null);

  const faraRamburs = buildDpdShipmentBody(cfg, { ...INPUT, cashOnDelivery: 0 }, { countryId: 642, serviceId: 2505 }) as { service: { additionalServices?: Record<string, unknown> } };
  assert.equal(faraRamburs.service.additionalServices?.obpd, undefined);
  const cuRamburs = buildDpdShipmentBody(cfg, INPUT, { countryId: 642, serviceId: 2505 }) as { service: { additionalServices?: Record<string, unknown> } };
  assert.ok(cuRamburs.service.additionalServices?.obpd);
});

test("greutatea zero sau lipsa se refuza local, nu la DPD", () => {
  assert.throws(() => buildDpdShipmentBody(CONFIG, { ...INPUT, weightKg: 0 }, { countryId: 642, serviceId: 2505 }), /Greutatea/);
  assert.throws(() => buildDpdShipmentBody(CONFIG, { ...INPUT, weightKg: Number.NaN }, { countryId: 642, serviceId: 2505 }), /Greutatea/);
});

/* ─── Cotatia: aceleasi servicii suplimentare ca AWB-ul ─── */

function raspunsCotatie(cale: string) {
  if (cale === "location/site") return { sites: [{ id: 100, name: "CLUJ-NAPOCA", region: "CLUJ" }] };
  if (cale === "services/destination") return { services: [{ serviceId: 2505 }] };
  if (cale === "calculate") return { calculations: [{ price: { amount: 20, vat: 3.8, total: 23.8, currency: "RON" } }] };
  return {};
}

test("cotatia poarta asigurarea si OBPD, ca AWB-ul („like COD, Declared value, etc.”)", async () => {
  simuleaza(raspunsCotatie);
  const cfg: DpdConfig = { ...CONFIG, declared_value_enabled: true, open_before_delivery: "TEST" };
  await calculateDpdDomesticPrice(cfg, { city: "Cluj-Napoca", county: "Cluj", weightKg: 1, cod: 150, declaredValue: 300 });
  const extra = (cereri.find((c) => c.cale === "calculate")!.corp.service as { additionalServices: Record<string, unknown> }).additionalServices;
  assert.ok(extra.cod);
  assert.deepEqual(extra.declaredValue, { amount: 300 });
  assert.ok(extra.obpd, "OBPD trebuie cotat cand AWB-ul la adresa il va purta");
});

test("cotatia pentru punct de ridicare NU poarta OBPD (AWB-ul la punct nu-l pune)", async () => {
  simuleaza(raspunsCotatie);
  const cfg: DpdConfig = { ...CONFIG, open_before_delivery: "OPEN" };
  await calculateDpdDomesticPrice(cfg, { city: "Cluj-Napoca", county: "Cluj", weightKg: 1, cod: 150, laPunct: true });
  const extra = (cereri.find((c) => c.cale === "calculate")!.corp.service as { additionalServices: Record<string, unknown> }).additionalServices;
  assert.equal(extra.obpd, undefined);
});

test("fara asigurare pornita, valoarea declarata nu se coteaza", async () => {
  simuleaza(raspunsCotatie);
  await calculateDpdDomesticPrice(CONFIG, { city: "Cluj-Napoca", county: "Cluj", weightKg: 1, declaredValue: 300 });
  const service = cereri.find((c) => c.cale === "calculate")!.corp.service as { additionalServices?: Record<string, unknown> };
  assert.equal(service.additionalServices, undefined);
});

test("eroarea PE REZULTAT (CalculationResult.error) nu mai trece tacut", async () => {
  simuleaza((cale) => cale === "calculate"
    ? { calculations: [{ error: { message: "Serviciul nu este permis", id: "EE20261008ABC" } }] }
    : raspunsCotatie(cale));
  await assert.rejects(
    calculateDpdDomesticPrice(CONFIG, { city: "Cluj-Napoca", county: "Cluj", weightKg: 1 }),
    /EE20261008ABC/,
  );
});

/* ─── Erorile poarta referinta pe care o cere suportul DPD ─── */

test("eroarea DPD poarta `id`-ul (EE…), codul si campul", async () => {
  simuleaza(() => ({ error: { message: "Date invalide", id: "EE2026100812345", code: 100, component: "$.recipient.phone1" } }));
  await assert.rejects(
    calculateDpdIntlPrice(CONFIG, { countryId: 276, postCode: "10115", weightKg: 1, serviceId: 2212 }),
    (e: Error) => /EE2026100812345/.test(e.message) && /cod 100/.test(e.message) && /\$\.recipient\.phone1/.test(e.message),
  );
});

/* ─── International: brut si net ─── */

test("internationalul intoarce brutul SI netul („amount: before VAT”, „total: amount + vat”)", async () => {
  simuleaza(() => ({ calculations: [{ price: { amount: 100, vat: 21, total: 121, currency: "RON" } }] }));
  const q = await calculateDpdIntlPrice(CONFIG, { countryId: 276, postCode: "10115", weightKg: 1, serviceId: 2212 });
  assert.equal(q?.price, 121);
  assert.equal(q?.priceNoVat, 100);
});

/* ─── Localitatea ─── */

test("localitatea se fixeaza doar la potrivire EXACTA, iar judetul pleaca in cerere ca `region`", async () => {
  simuleaza(() => ({ sites: [{ id: 1, name: "VALEA LUNGA-CRICOV", region: "DAMBOVITA" }] }));
  const id = await resolveDpdSiteId(CONFIG, "Valea Lunga", "Dambovita");
  assert.equal(id, null, "un nume care doar CONTINE termenul nu are voie sa fie fixat");
  assert.equal(cereri[0].corp.region, "DAMBOVITA");
});

test("potrivirea exacta din judetul cerut se fixeaza", async () => {
  simuleaza(() => ({ sites: [
    { id: 1, name: "POIANA", region: "NEAMT" },
    { id: 2, name: "POIANA", region: "GALATI" },
  ] }));
  assert.equal(await resolveDpdSiteId(CONFIG, "Poiana", "Galati"), 2);
});

/* ─── Punctele de ridicare ─── */

test("oficiul care nu permite ridicarea, expirat, de paleti sau fara plata la ramburs iese din lista", () => {
  const azi = "2026-10-08";
  const bun = { id: 1, pickUpAllowed: true, validFrom: "2020-01-01", validTo: "3000-01-01", cargoTypesAllowed: ["PARCEL"] };
  assert.equal(punctulDpdPrimesteColetul(bun, { cuRamburs: true }, azi), true);
  assert.equal(punctulDpdPrimesteColetul({ id: 1 }, { cuRamburs: true }, azi), true, "un camp lipsa nu exclude");
  assert.equal(punctulDpdPrimesteColetul({ ...bun, pickUpAllowed: false }, { cuRamburs: false }, azi), false);
  assert.equal(punctulDpdPrimesteColetul({ ...bun, validTo: "2026-10-07" }, { cuRamburs: false }, azi), false);
  assert.equal(punctulDpdPrimesteColetul({ ...bun, validFrom: "2026-10-09" }, { cuRamburs: false }, azi), false);
  assert.equal(punctulDpdPrimesteColetul({ ...bun, palletOffice: true }, { cuRamburs: false }, azi), false);
  assert.equal(punctulDpdPrimesteColetul({ ...bun, cargoTypesAllowed: ["PALLET"] }, { cuRamburs: false }, azi), false);
  const faraPlata = { ...bun, cashPaymentAllowed: false, cardPaymentAllowed: false };
  assert.equal(punctulDpdPrimesteColetul(faraPlata, { cuRamburs: true }, azi), false);
  assert.equal(punctulDpdPrimesteColetul(faraPlata, { cuRamburs: false }, azi), true);
});
