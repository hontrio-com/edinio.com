import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MENTENANTA_ASEZARE, MENTENANTA_CARDURI, cardMentenanta } from "./mentenanta";

test("asezarea are exact trei locuri: doua mari si unul lat", () => {
  /* Cerut de client (13.08), dupa o referinta trimisa de el. Numarul e fixat
     dinadins: un al patrulea card in `mari` ar fi rupt grila de doua coloane in
     doua randuri inegale, fara sa se planga nimic. */
  assert.equal(MENTENANTA_ASEZARE.mari.length, 2, "sus stau exact doua carduri");
  assert.equal(typeof MENTENANTA_ASEZARE.lat, "string");
});

test("fiecare loc din asezare trimite la un card care exista", () => {
  /*
    ⚠ Un id gresit aici NU s-ar vedea ca o eroare, ci ca un card lipsa din
    pagina. De aceea `cardMentenanta()` arunca, iar proba il cheama pe fiecare:
    asa, greseala opreste suita, nu iese pe site.
  */
  for (const id of [...MENTENANTA_ASEZARE.mari, MENTENANTA_ASEZARE.lat]) {
    const card = cardMentenanta(id);
    assert.equal(card.id, id);
    assert.ok(card.titlu.length > 0);
    assert.ok(card.descriere.length > 30, `${id}: descriere prea scurta`);
  }
});

test("niciun card nu apare de doua ori pe pagina", () => {
  const puse = [...MENTENANTA_ASEZARE.mari, MENTENANTA_ASEZARE.lat];
  assert.equal(new Set(puse).size, puse.length, "acelasi card e pus in doua locuri");
});

test("se stie care card ramane pe dinafara", () => {
  /*
    ⚠ TREI LOCURI, PATRU TEXTE. Proba nu cere ca toate sa fie pe pagina — ar fi
    impotriva a ce a cerut clientul. Cere doar ca nepotrivirea sa fie de UNU:
    daca cineva mai adauga texte in `MENTENANTA_CARDURI` si uita asezarea, doua
    sau trei carduri ar disparea tacut din pagina, iar nimeni n-ar observa.
  */
  const puse = new Set<string>([...MENTENANTA_ASEZARE.mari, MENTENANTA_ASEZARE.lat]);
  const nepuse = MENTENANTA_CARDURI.filter((c) => !puse.has(c.id));
  assert.equal(
    nepuse.length,
    1,
    `raman pe dinafara ${nepuse.length} carduri (${nepuse.map((c) => c.id).join(", ")}) — asezarea are trei locuri`,
  );
  assert.equal(nepuse[0].id, "optimizari", "cardul lasat pe dinafara s-a schimbat fara nota");
});

test("un id necunoscut opreste, nu trece tacut", () => {
  assert.throws(
    () => cardMentenanta("inexistent" as never),
    /nu există cardul/,
    "un id gresit ar fi lasat un card gol in pagina",
  );
});
