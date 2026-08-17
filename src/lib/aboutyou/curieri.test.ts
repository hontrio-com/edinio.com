import assert from "node:assert/strict";
import { test } from "node:test";
import { CAMPURI_AWB_ABOUTYOU, CURIERI_ABOUTYOU, SELECT_AWB_ABOUTYOU } from "./curieri";

/*
 * Deriva dintre trei liste care trebuie sa spuna acelasi lucru.
 *
 * S-a intamplat de sase ori: un curier nou aparea in `COURIER_FIELDS` (de unde se
 * citeste AWB-ul) si lipsea din ecranul de mapare — sau invers, lipsea din
 * `select`-ul interogarii. Niciuna dintre scapari nu da vreo eroare: expedierea
 * cade pe „Mapează curierul la un carrier About You în setări", un mesaj care
 * trimite omul catre un control care nu exista, ori iese cu „skipped", adica un
 * succes raportat pentru o comanda ramasa neexpediata.
 *
 * Lista si ecranul sunt acum aceeasi sursa. `select`-ul NU poate fi: PostgREST are
 * nevoie de un sir literal ca sa tipizeze randul. Deci il verificam aici.
 */
test("select-ul de AWB acopera fiecare curier din lista", () => {
  const coloane = new Set(
    SELECT_AWB_ABOUTYOU.split(",").map((s) => s.trim()).filter(Boolean));
  const lipsa = CAMPURI_AWB_ABOUTYOU.filter((c) => !coloane.has(c));
  assert.deepEqual(lipsa, [], `coloane necerute in select: ${lipsa.join(", ")}`);
  // Si invers: nimic in plus, ca sa nu rămână coloane ale unor curieri scosi.
  const inPlus = [...coloane].filter((c) => c !== "id" && c !== "tracking_number" && !CAMPURI_AWB_ABOUTYOU.includes(c));
  assert.deepEqual(inPlus, [], `coloane in select fara curier in lista: ${inPlus.join(", ")}`);
});

test("codurile si coloanele de curier sunt unice", () => {
  const coduri = CURIERI_ABOUTYOU.map((c) => c.cod);
  assert.equal(new Set(coduri).size, coduri.length, "doua intrari cu acelasi cod de curier");
  const campuri = CURIERI_ABOUTYOU.map((c) => c.camp);
  assert.equal(new Set(campuri).size, campuri.length, "doua intrari pe aceeasi coloana de AWB");
});

test("ordinea nu se schimba la adaugari: cei vechi rămân in fata", () => {
  /*
   * `shipOrderNow` ia PRIMUL camp nevid. Un curier nou pus in fata ar fura
   * precedenta unui AWB emis anterior cu altul — comanda ar pleca la About You cu
   * curierul greșit. Adaugarile merg la FINAL, si testul o impune.
   */
  assert.deepEqual(CURIERI_ABOUTYOU.slice(0, 6).map((c) => c.cod),
    ["cargus", "sameday", "fan-courier", "dpd", "colete", "woot"]);
});
