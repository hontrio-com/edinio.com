import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { orasulSePotriveste } from "./orasul-punctului";

describe("orasul punctului de ridicare", () => {
  /*
   * ⚠ Perechile vin din lista reala de puncte Curiera (29.09.2026) si din ce scriu oamenii in
   * campul liber al checkoutului. Inainte de plierea cratimei, fiecare dadea ZERO puncte.
   */
  test("cratima si spatiul se potrivesc, in ambele sensuri", () => {
    assert.ok(orasulSePotriveste("Piatra-Neamt", "Piatra Neamț"));
    assert.ok(orasulSePotriveste("Cluj-Napoca", "Cluj Napoca"));
    assert.ok(orasulSePotriveste("Miercurea-Ciuc", "Miercurea Ciuc"));
    assert.ok(orasulSePotriveste("Drobeta-Turnu Severin", "Drobeta Turnu-Severin"));
    assert.ok(orasulSePotriveste("Targu Jiu", "Târgu-Jiu"));
  });

  test("diacriticele si Bucurestiul pe sectoare, ca inainte", () => {
    assert.ok(orasulSePotriveste("Bucuresti", "Sector 3"));
    assert.ok(orasulSePotriveste("Bucuresti", "București"));
    assert.ok(orasulSePotriveste("Sector 3", "Sector 3"));
    assert.ok(orasulSePotriveste("Iasi", "Iași"));
  });

  test("orasele diferite nu se potrivesc", () => {
    assert.ok(!orasulSePotriveste("Cluj-Napoca", "Iasi"));
    assert.ok(!orasulSePotriveste("Piatra-Neamt", "Targu Neamt"));
  });
});
