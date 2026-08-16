import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { cheiaOfertei, etichetaOferta, ofertePosibile, pretOferta } from "./preturi";
import type { ServiciuShipo, TarifShipo } from "./client";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Aici se hotaraste ce vede cumparatorul si pe ce plateste. Doua oferte care se
 * prabusesc una peste alta inseamna „a ales 15 lei, a plecat cu 22" — iar
 * diferenta o suporta comerciantul, care afla la factura. E defectul gasit la
 * Innoship, si cheia de aici exista tocmai ca sa nu se repete.
 */

const serviciu = (id: number, dest: "address" | "locker" | "pudo" = "address"): ServiciuShipo => ({
  id, courier_id: 1, type: "standard",
  sender_address_type: "address", recipient_address_type: dest,
  description: dest === "address" ? "Livrare standard la adresa" : "Livrare in locker",
});

const tarif = (rate_id: number, slug: string, fee: number, cod = true): TarifShipo => ({
  rate_id, courier_slug: slug, courier_name: slug.toUpperCase(),
  service_type: "standard", total_fee: fee, is_cod_available: cod,
});

const SERVICII = [serviciu(10), serviciu(42, "locker"), serviciu(55, "pudo")];

describe("cheia ofertei", () => {
  test("⚠ e `rate_id`, nu curierul", () => {
    // Acelasi curier apare de mai multe ori — la adresa, in locker, in PUDO — la
    // preturi diferite. O cheie facuta din slug le-ar prabusi una peste alta.
    assert.equal(cheiaOfertei({ rateId: 42 }), "42");
    assert.notEqual(cheiaOfertei({ rateId: 10 }), cheiaOfertei({ rateId: 42 }));
  });

  test("acelasi curier cu doua servicii ramane DOUA oferte distincte", () => {
    const oferte = ofertePosibile(
      [tarif(10, "fancourier", 22), tarif(42, "fancourier", 15)],
      SERVICII,
      { foloseste_lockere: true },
    );
    assert.equal(oferte.length, 2);
    assert.equal(new Set(oferte.map(cheiaOfertei)).size, 2);
  });
});

describe("pretul", () => {
  test("zero sau lipsa NU inseamna gratuit — oferta se arunca", () => {
    assert.equal(pretOferta(tarif(1, "dpd", 0)), null);
    assert.equal(ofertePosibile([tarif(10, "dpd", 0)], SERVICII).length, 0);
  });

  test("se rotunjeste la doi bani", () => {
    assert.equal(pretOferta(tarif(1, "dpd", 15.499)), 15.5);
  });

  test("ordinea e dupa pret, nu dupa ordinea cheilor lor", () => {
    // Raspunsul lor e un obiect indexat dupa rate_id, deci ordinea nu inseamna nimic.
    const oferte = ofertePosibile(
      [tarif(10, "dpd", 30), tarif(42, "fancourier", 12)], SERVICII, { foloseste_lockere: true },
    );
    assert.deepEqual(oferte.map((o) => o.pret), [12, 30]);
  });
});

describe("filtrele", () => {
  test("un tarif fara serviciu cunoscut se ARUNCA, nu se presupune „la adresa\"", () => {
    // Presupus, un serviciu de locker ar ajunge in checkout ca livrare la
    // domiciliu, iar emiterea ar cadea DUPA plata.
    assert.equal(ofertePosibile([tarif(999, "dpd", 20)], SERVICII).length, 0);
  });

  test("lockerele se arata doar cand comerciantul le-a pornit", () => {
    const fara = ofertePosibile([tarif(42, "fancourier", 15)], SERVICII, { foloseste_lockere: false });
    assert.equal(fara.length, 0);
    const cu = ofertePosibile([tarif(42, "fancourier", 15)], SERVICII, { foloseste_lockere: true });
    assert.equal(cu.length, 1);
    assert.equal(cu[0].laPunct, true);
  });

  test("lista goala de curieri inseamna TOTI, nu niciunul", () => {
    const oferte = ofertePosibile([tarif(10, "dpd", 20)], SERVICII, { curieri_permisi: [] });
    assert.equal(oferte.length, 1);
  });

  test("filtrul de curieri e insensibil la majuscule si spatii", () => {
    const oferte = ofertePosibile([tarif(10, "dpd", 20)], SERVICII, { curieri_permisi: [" DPD "] });
    assert.equal(oferte.length, 1);
  });

  test("⚠ cu ramburs, serviciile care nu-l accepta nu se arata", () => {
    // Ales, un asemenea serviciu ar cadea la emitere si comanda ar ramane fara transport.
    const oferte = ofertePosibile([tarif(10, "fedex", 20, false)], SERVICII, {}, { cuRamburs: true });
    assert.equal(oferte.length, 0);
    const fara = ofertePosibile([tarif(10, "fedex", 20, false)], SERVICII, {}, { cuRamburs: false });
    assert.equal(fara.length, 1);
  });

  test("ridicarea din locker nu e acoperita, deci nu se ofera", () => {
    const dinLocker: ServiciuShipo = { ...serviciu(77), sender_address_type: "locker" };
    assert.equal(ofertePosibile([tarif(77, "sameday", 10)], [dinLocker], { foloseste_lockere: true }).length, 0);
  });

  test("acelasi rate_id de doua ori se numara o data", () => {
    const oferte = ofertePosibile([tarif(10, "dpd", 20), tarif(10, "dpd", 25)], SERVICII);
    assert.equal(oferte.length, 1);
  });
});

describe("eticheta", () => {
  test("cumparatorul vede CURIERUL REAL, nu brokerul", () => {
    const [o] = ofertePosibile([tarif(10, "dpd", 20)], SERVICII);
    assert.equal(etichetaOferta({ ...o, numeCurier: "DPD" }), "DPD");
  });

  test("livrarea in punct se spune pe fata", () => {
    const [o] = ofertePosibile([tarif(42, "fancourier", 15)], SERVICII, { foloseste_lockere: true });
    assert.ok(etichetaOferta(o).includes("locker"));
  });

  test("fara nume de curier ramane ceva de citit", () => {
    assert.equal(
      etichetaOferta({ rateId: 1, courierSlug: "", numeCurier: "", descriere: "", pret: 1, laPunct: false, acceptaRamburs: true }),
      "Livrare prin Shipo",
    );
  });
});
