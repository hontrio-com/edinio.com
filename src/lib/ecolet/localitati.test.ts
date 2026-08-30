import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alegeLocalitatea, cheieLocalitate, type LocalitateEcolet } from "./localitati";

/*
 * ⚠ Corpul expedierii cere `locality_id` INTREG. Intre „Cluj-Napoca" scris de
 * client si expedierea trimisa la eColet trece o cautare, iar o alegere gresita
 * aici trimite marfa in alt judet — fara nicio eroare, pana la livrare.
 */

function loc(id: number, name: string, judet?: string): LocalitateEcolet {
  return { id, name, county: judet ? { name: judet } : null };
}

// ─── Cheia ────────────────────────────────────────────────────────────────────

test("⚠ diacriticele romanesti au DOUA codificari, si amandoua dau aceeasi cheie", () => {
  /*
   * „ș" se scrie si U+0219 (virgula dedesubt) si U+015F (sedila). Aceeasi litera
   * pe ecran, doua caractere in memorie: un `===` intre ele e FALS, iar
   * cumparatorul ramane fara oferte fara ca cineva sa afle de ce.
   */
  const cuVirgula = "Timișoara";
  const cuSedila = "Timişoara";
  assert.notEqual(cuVirgula, cuSedila, "chiar sunt doua siruri diferite");
  assert.equal(cheieLocalitate(cuVirgula), cheieLocalitate(cuSedila));
  assert.equal(cheieLocalitate(cuVirgula), "timisoara");
});

test("cratimele si majusculele nu conteaza", () => {
  assert.equal(cheieLocalitate("Cluj-Napoca"), cheieLocalitate("cluj napoca"));
  assert.equal(cheieLocalitate("  BAIA   MARE "), "baiamare");
  assert.equal(cheieLocalitate(null), "");
});

// ─── Alegerea ─────────────────────────────────────────────────────────────────

test("potrivirea exacta pe nume, cand e una singura", () => {
  const g = [loc(1, "Cluj-Napoca", "Cluj"), loc(2, "Floresti", "Cluj")];
  assert.equal(alegeLocalitatea(g, "Cluj-Napoca")?.id, 1);
});

test("⚠ NU se ia prima din lista", () => {
  /*
   * Cautarea lor e pe fragment: „Ocna" intoarce zece sate. Luata prima, comanda ar
   * pleca in alt judet, si greseala nu s-ar vedea pana la livrare.
   */
  const g = [loc(1, "Ocna Mures", "Alba"), loc(2, "Ocna Sibiului", "Sibiu")];
  assert.equal(alegeLocalitatea(g, "Ocna Sibiului")?.id, 2);
  assert.equal(alegeLocalitatea(g, "Ocna"), null, "un fragment nu e o potrivire");
});

test("judetul departe omonimele", () => {
  const g = [loc(1, "Vulcan", "Hunedoara"), loc(2, "Vulcan", "Brasov")];
  assert.equal(alegeLocalitatea(g, "Vulcan", "Brasov")?.id, 2);
  assert.equal(alegeLocalitatea(g, "Vulcan", "Hunedoara")?.id, 1);
});

test("⚠ fara judet, mai multe omonime inseamna NICIUNA", () => {
  /* O ghicire aici trimite marfa in alt colt de tara. */
  const g = [loc(1, "Vulcan", "Hunedoara"), loc(2, "Vulcan", "Brasov")];
  assert.equal(alegeLocalitatea(g, "Vulcan"), null);
});

test("⚠ judet dat dar nepotrivit NU cade pe lista fara judet", () => {
  /*
   * Ar insemna sa trimitem marfa intr-un oras cu acelasi nume din alt judet —
   * exista zeci de omonime in Romania.
   */
  const g = [loc(1, "Vulcan", "Hunedoara")];
  assert.equal(alegeLocalitatea(g, "Vulcan", "Cluj"), null);
});

test("capitala se potriveste desi o scriem altfel", () => {
  /* Nomenclatoarele scriu „Bucuresti", noi scriem „Municipiul Bucuresti". */
  const g = [loc(323, "Bucuresti", "Bucuresti")];
  assert.equal(alegeLocalitatea(g, "Bucuresti", "Municipiul Bucuresti")?.id, 323);
});

test("diacriticele nu strica alegerea", () => {
  const g = [loc(7, "Timişoara", "Timiş")];
  assert.equal(alegeLocalitatea(g, "Timișoara", "Timiș")?.id, 7);
});

test("lista goala sau oras gol dau null, nu o exceptie", () => {
  assert.equal(alegeLocalitatea([], "Cluj-Napoca"), null);
  assert.equal(alegeLocalitatea([loc(1, "Cluj-Napoca", "Cluj")], ""), null);
});

test("⚠ „Mures” e subsir in „Maramures” si NU se potriveste cu el", () => {
  /*
   * Singura pereche de judete romanesti in care unul se cuprinde in celalalt.
   * Cu potrivirea pe incluziune, „Dumbrava, Maramures" trecea drept „Dumbrava,
   * Mures" — comanda pleca la 300 de kilometri, fara sa se planga nimic.
   */
  const g = [loc(1, "Dumbrava", "Maramures"), loc(2, "Dumbrava", "Mures")];
  assert.equal(alegeLocalitatea(g, "Dumbrava", "Mures")?.id, 2);
  assert.equal(alegeLocalitatea(g, "Dumbrava", "Maramures")?.id, 1);

  /* Si cand exista DOAR cel gresit, raspunsul e null, nu o potrivire aproximativa. */
  assert.equal(alegeLocalitatea([loc(1, "Dumbrava", "Maramures")], "Dumbrava", "Mures"), null);
});

test("incluziunea ramane ingaduita DOAR pentru capitala", () => {
  const g = [loc(323, "Bucuresti", "Bucuresti")];
  assert.equal(alegeLocalitatea(g, "Bucuresti", "Municipiul Bucuresti")?.id, 323);
});
