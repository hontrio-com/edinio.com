import assert from "node:assert/strict";
import { test } from "node:test";
import { JUDETE, potrivesteJudet, judetDupaCodAuto, despartaLocalitateaDeCod } from "./judete";
import { ROMANIAN_COUNTIES } from "@/lib/validations/business";

/**
 * ANAF scrie judetul cu MAJUSCULE si cu diacritice; lista formularului il scrie
 * fara. Fara potrivirea asta, autocompletarea din ANAF ar fi lasat campul de
 * judet gol exact la firmele pentru care a fost facuta.
 */

test("potriveste forma ANAF, cu majuscule si diacritice", () => {
  assert.equal(potrivesteJudet("CLUJ"), "Cluj");
  assert.equal(potrivesteJudet("BISTRIŢA-NĂSĂUD"), "Bistrita-Nasaud");
  assert.equal(potrivesteJudet("BISTRIȚA-NĂSĂUD"), "Bistrita-Nasaud");
  assert.equal(potrivesteJudet("SATU MARE"), "Satu Mare");
  assert.equal(potrivesteJudet("Timiş"), "Timis");
});

test("cratima si spatiile nu conteaza", () => {
  assert.equal(potrivesteJudet("Bistrita Nasaud"), "Bistrita-Nasaud");
  assert.equal(potrivesteJudet("satumare"), "Satu Mare");
});

test("capitala are mai multe forme, toate duc in acelasi loc", () => {
  assert.equal(potrivesteJudet("BUCUREŞTI"), "Municipiul Bucuresti");
  assert.equal(potrivesteJudet("Municipiul Bucuresti"), "Municipiul Bucuresti");
  assert.equal(potrivesteJudet("Sector 3"), "Municipiul Bucuresti");
});

test("ce nu seamana cu nimic intoarce null, nu o ghicire", () => {
  assert.equal(potrivesteJudet("Budapesta"), null);
  assert.equal(potrivesteJudet(""), null);
  assert.equal(potrivesteJudet(null), null);
  assert.equal(potrivesteJudet(undefined), null);
});

test("fiecare judet din lista se potriveste cu el insusi", () => {
  for (const j of JUDETE) assert.equal(potrivesteJudet(j), j);
});

/**
 * Testul de mai sus nu poate prinde o intrare LIPSA — si chiar lipsea una:
 * „Caras-Severin" nu era in niciuna dintre cele doua liste copiate in formulare,
 * asa ca un judet intreg nu putea fi ales la livrare. Comparatia cu lista
 * canonica din `validations/business.ts` e singura care nu se poate pacali.
 */
test("acopera toate cele 41 de judete plus capitala", () => {
  const lipsa = ROMANIAN_COUNTIES
    .filter((j) => j !== "Bucuresti")
    .filter((j) => potrivesteJudet(j) === null);
  assert.deepEqual(lipsa, []);
  assert.equal(potrivesteJudet("Bucuresti"), "Municipiul Bucuresti");
  assert.equal(JUDETE.length, 42);
});

// ─── Codurile auto, folosite la punctele de ridicare GLS ─────────────────────

test("⚠ fiecare judet are un cod auto, si niciun cod nu inventeaza un judet", () => {
  /*
   * Tabelul `COD_AUTO` e scris de mana si e singura cale prin care un punct de
   * ridicare GLS capata judet (fisierul lor scrie „Brasov BV" si nimic altundeva).
   * Un judet uitat inseamna comenzi fara judet dintr-o parte de tara, tacut.
   */
  const alfabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const acoperite = new Set<string>();
  for (const a of alfabet) {
    const unul = judetDupaCodAuto(a);
    if (unul) acoperite.add(unul);
    for (const b of alfabet) {
      const doua = judetDupaCodAuto(a + b);
      if (doua) acoperite.add(doua);
    }
  }
  assert.deepEqual(JUDETE.filter((j) => !acoperite.has(j)), [], "judete fara cod auto");
  assert.deepEqual([...acoperite].filter((j) => !JUDETE.includes(j as never)), [], "coduri catre judete inexistente");
});

test("cateva coduri reale, verificate pe nume", () => {
  assert.equal(judetDupaCodAuto("BV"), "Brasov");
  assert.equal(judetDupaCodAuto("bv"), "Brasov", "se accepta si litere mici");
  assert.equal(judetDupaCodAuto("B"), "Municipiul Bucuresti");
  assert.equal(judetDupaCodAuto("CJ"), "Cluj");
  assert.equal(judetDupaCodAuto("XX"), null);
  assert.equal(judetDupaCodAuto(""), null);
  assert.equal(judetDupaCodAuto(null), null);
});

test("⚠ despartirea localitatii de cod nu rupe numele din doua cuvinte", () => {
  assert.deepEqual(despartaLocalitateaDeCod("Brasov BV"), { localitate: "Brasov", judet: "Brasov" });
  assert.deepEqual(despartaLocalitateaDeCod("Cluj-Napoca CJ"), { localitate: "Cluj-Napoca", judet: "Cluj" });
  /* „Mare" nu e cod, deci numele ramane intreg. */
  assert.deepEqual(despartaLocalitateaDeCod("Satu Mare"), { localitate: "Satu Mare", judet: "" });
  assert.deepEqual(despartaLocalitateaDeCod("Baia Mare"), { localitate: "Baia Mare", judet: "" });
  /* Codul trebuie scris cu MAJUSCULE: „Mures" nu e „MS". */
  assert.deepEqual(despartaLocalitateaDeCod("Targu Mures"), { localitate: "Targu Mures", judet: "" });
  /* ⚠ Bucurestiul nu poarta cod: GLS scrie „Bucuresti Sector 3". Sectorul ramane
     in nume (ca la Sameday), doar judetul se completeaza. 186 de puncte reale. */
  assert.deepEqual(despartaLocalitateaDeCod("Bucuresti Sector 3"), { localitate: "Bucuresti Sector 3", judet: "Municipiul Bucuresti" });
  assert.deepEqual(despartaLocalitateaDeCod("Bucuresti"), { localitate: "Bucuresti", judet: "Municipiul Bucuresti" });
  assert.deepEqual(despartaLocalitateaDeCod("București Sector 1").judet, "Municipiul Bucuresti", "si cu diacritice");
  /* „Bucuresti B" ramane pe regula codului: sectorul nu exista, deci se taie. */
  assert.deepEqual(despartaLocalitateaDeCod("Bucuresti B"), { localitate: "Bucuresti", judet: "Municipiul Bucuresti" });
  assert.deepEqual(despartaLocalitateaDeCod(""), { localitate: "", judet: "" });
  assert.deepEqual(despartaLocalitateaDeCod(null), { localitate: "", judet: "" });
});
