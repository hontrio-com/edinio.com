import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { aPropusCeva, areExpeditorSalvat, expeditorDinMagazin } from "./precompletare";

describe("adresa de ridicare propusa din datele magazinului", () => {
  test("magazinul bate firma, camp cu camp", () => {
    const p = expeditorDinMagazin({
      store_name: "Piese Moto", business_name: "Firma SRL",
      store_address: "Str. Depozitului 4", address: "Str. Sediului 1",
      store_city: "", city: "Cluj-Napoca",
      store_county: null, county: "Cluj",
      phone: " 0722 000 000 ", email: "a@b.ro",
    });
    assert.deepEqual(p, {
      nume: "Piese Moto", telefon: "0722 000 000", email: "a@b.ro",
      adresa: "Str. Depozitului 4", oras: "Cluj-Napoca", judet: "Cluj",
    });
  });

  test("fara numele magazinului, numele firmei", () => {
    assert.equal(expeditorDinMagazin({ store_name: "  ", business_name: "Firma SRL" }).nume, "Firma SRL");
  });

  test("judetul se potriveste pe lista formularului", () => {
    assert.equal(expeditorDinMagazin({ county: "CLUJ" }).judet, "Cluj");
    assert.equal(expeditorDinMagazin({ store_county: "Sector 3" }).judet, "Municipiul Bucuresti");
  });

  test("⚠ un judet de nerecunoscut ramane gol, nu se copiaza", () => {
    assert.equal(expeditorDinMagazin({ county: "Narnia" }).judet, "");
  });

  test("nimic inventat: fara date, totul gol", () => {
    const p = expeditorDinMagazin(null);
    assert.deepEqual(p, { nume: "", telefon: "", email: "", adresa: "", oras: "", judet: "" });
    assert.equal(aPropusCeva(p), false);
    assert.equal(aPropusCeva(expeditorDinMagazin({ phone: "0722000000" })), true);
  });
});

describe("cand se propune", () => {
  test("numai daca omul n-a salvat niciun camp al adresei", () => {
    assert.equal(areExpeditorSalvat(undefined), false);
    assert.equal(areExpeditorSalvat({}), false);
    assert.equal(areExpeditorSalvat({ nume: "  ", oras: "" }), false);
    assert.equal(areExpeditorSalvat({ oras: "Cluj-Napoca" }), true);
  });
});
