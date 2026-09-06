import test from "node:test";
import assert from "node:assert/strict";
import { planulRedenumirii, type LegaturaRand } from "./redenumire";

const l = (id: string, configurator_id: string, categorie: string): LegaturaRand =>
  ({ id, configurator_id, categorie });

test("redenumirea MUTA legatura pe numele nou", () => {
  const plan = planulRedenumirii([l("r1", "cfg", "Rochii")], "Rochii", "Rochii de seara");
  assert.deepEqual(plan, { deMutat: ["r1"], deSters: [] });
});

test("legaturile altor categorii nu se ating", () => {
  const legaturi = [l("r1", "cfg", "Rochii"), l("r2", "cfg", "Fuste"), l("r3", "alt", "Camasi")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Rochii de seara");
  assert.deepEqual(plan, { deMutat: ["r1"], deSters: [] });
});

test("mai multe configuratoare pe acelasi nume se muta toate", () => {
  const legaturi = [l("r1", "cfgA", "Rochii"), l("r2", "cfgB", "Rochii")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Rochii lungi");
  assert.deepEqual(plan, { deMutat: ["r1", "r2"], deSters: [] });
});

test("CIOCNIREA se rezolva stergand, nu mutand", () => {
  /*
   * Acelasi configurator legat si de „Rochii" si de „Femei", iar „Rochii" se redenumeste in
   * „Femei". Mutat, randul ar fi calcat unicitatea si scrierea ar fi picat CU TOTUL — adica si
   * mutarile bune din acelasi lot. Perechea catre care s-ar fi mutat exista deja si acopera
   * exact acelasi lucru.
   */
  const legaturi = [l("r1", "cfg", "Rochii"), l("r2", "cfg", "Femei")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Femei");
  assert.deepEqual(plan, { deMutat: [], deSters: ["r1"] });
});

test("ciocnirea e pe CONFIGURATOR, nu pe magazin", () => {
  // Alt configurator legat de „Femei" nu impiedica mutarea legaturii primului.
  const legaturi = [l("r1", "cfgA", "Rochii"), l("r2", "cfgB", "Femei")];
  const plan = planulRedenumirii(legaturi, "Rochii", "Femei");
  assert.deepEqual(plan, { deMutat: ["r1"], deSters: [] });
});

test("STERGEREA categoriei sterge legatura, NU o urca la parinte", () => {
  /*
   * ⚠ Produsele urca la parinte cand categoria lor se sterge. Legatura NU urca odata cu ele:
   * mutata pe parinte, configuratorul s-ar fi intins peste toti fratii, si produse care nu l-au
   * avut niciodata ar fi devenit deodata configurabile, cu alt pret.
   */
  const plan = planulRedenumirii([l("r1", "cfg", "Rochii")], "Rochii", null);
  assert.deepEqual(plan, { deMutat: [], deSters: ["r1"] });
});

test("un nume redenumit in el insusi nu misca nimic", () => {
  assert.deepEqual(planulRedenumirii([l("r1", "cfg", "Rochii")], "Rochii", "Rochii"),
    { deMutat: [], deSters: [] });
});

test("fara nume vechi nu se atinge nimic", () => {
  // ⚠ Cu un nume vechi gol, un plan lacom ar fi maturat legaturile fara categorie din baza.
  assert.deepEqual(planulRedenumirii([l("r1", "cfg", "")], "", "Ceva"), { deMutat: [], deSters: [] });
});

test("liste goale sau lipsa nu arunca", () => {
  assert.deepEqual(planulRedenumirii([], "Rochii", "Fuste"), { deMutat: [], deSters: [] });
});

test("un nume care nu apare in legaturi nu produce nimic de scris", () => {
  const plan = planulRedenumirii([l("r1", "cfg", "Camasi")], "Rochii", "Fuste");
  assert.deepEqual(plan, { deMutat: [], deSters: [] });
});
