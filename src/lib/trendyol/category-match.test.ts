import assert from "node:assert/strict";
import { test } from "node:test";
import { potriveste, scorPotrivire, segment, simboluri } from "./category-match";

/**
 * Maparea automata are voie sa nu gaseasca nimic; nu are voie sa nimereasca
 * gresit. Testele apara exact linia asta: ce se cheama „sigur" chiar trebuie sa
 * fie sigur, iar confuziile de segment trebuie sa cada sub prag.
 */

const FRUNZE = [
  { id: 1, label: "Îmbrăcăminte > Femei > Rochii" },
  { id: 2, label: "Îmbrăcăminte > Bărbați > Tricouri" },
  { id: 3, label: "Îmbrăcăminte > Femei > Fuste" },
  { id: 4, label: "Îmbrăcăminte > Copii > Rochii fete" },
  { id: 5, label: "Încălțăminte > Femei > Sandale" },
  { id: 6, label: "Electronice > Telefoane > Telefoane mobile" },
  { id: 7, label: "Protecția muncii > Mănuși de protecție" },
  { id: 8, label: "Accesorii > Curele" },
];

function primul(nume: string) {
  return potriveste(nume, FRUNZE)[0] ?? null;
}

// ── Simboluri ─────────────────────────────────────────────────────────────────
test("diacriticele si cuvintele de legatura nu conteaza", () => {
  const s = simboluri("Îmbrăcăminte de damă");
  assert.equal(s.includes("imbracaminte"), true);
  assert.equal(s.includes("de"), false);
});

test("sinonimele acopera si raspunsurile in engleza sau turca", () => {
  assert.equal(simboluri("Rochii").includes("dress"), true);
  assert.equal(simboluri("Tricouri").includes("tisort"), true);
});

// ── Segment ───────────────────────────────────────────────────────────────────
test("segmentul e recunoscut in ambele limbi si forme", () => {
  assert.equal(segment("Rochii dama"), "femei");
  assert.equal(segment("Women Dresses"), "femei");
  assert.equal(segment("Tricouri bărbați"), "barbati");
  assert.equal(segment("Îmbrăcăminte copii"), "copii");
  assert.equal(segment("Curele"), null);
});

test("copiii bat femeile cand apar amandoua", () => {
  // „Rochii fete" e categorie de copii, chiar daca fetele sunt tot feminin.
  assert.equal(segment("Îmbrăcăminte > Copii > Rochii fete"), "copii");
});

// ── Potriviri corecte ─────────────────────────────────────────────────────────
test("o categorie evidenta e potrivita sigur", () => {
  const p = primul("Rochii");
  assert.equal(p?.categoryId, 1);
  assert.equal(p?.incredere, "sigura");
});

test("pluralul si singularul duc in acelasi loc", () => {
  assert.equal(primul("Rochie")?.categoryId, 1);
  assert.equal(primul("Fustă")?.categoryId, 3);
});

test("calea magazinului dezambiguizeaza", () => {
  assert.equal(primul("Îmbrăcăminte > Femei > Fuste")?.categoryId, 3);
});

test("merge si pe alte domenii decat moda", () => {
  assert.equal(primul("Telefoane mobile")?.categoryId, 6);
  assert.equal(primul("Mănuși de protecție")?.categoryId, 7);
});

// ── Ce NU are voie sa se intample ─────────────────────────────────────────────
test("rochiile de dama nu ajung la copii", () => {
  const p = primul("Rochii damă");
  assert.equal(p?.categoryId, 1);
  // Chiar daca „Rochii fete" contine cuvantul, conflictul de segment o coboara.
  assert.ok(scorPotrivire("Rochii damă", "Îmbrăcăminte > Copii > Rochii fete") < 0.5);
});

test("tricourile de dama nu ajung la barbati ca alegere sigura", () => {
  const p = primul("Tricouri damă");
  assert.notEqual(p?.incredere, "sigura");
});

test("o categorie fara corespondent nu produce o sugestie sigura", () => {
  for (const nume of ["Diverse", "Promoții", "Noutăți"]) {
    const p = primul(nume);
    assert.notEqual(p?.incredere, "sigura", `„${nume}" nu ar trebui potrivit sigur`);
  }
});

test("cand doua categorii sunt la fel de bune, nu declaram siguranta", () => {
  // Magazinul are o singura categorie „Rochii", fara segment; Trendyol are si
  // pentru femei, si pentru copii. Nu avem cum sa alegem — deci nu pretindem ca stim.
  const frunzeAmbigue = [
    { id: 10, label: "Îmbrăcăminte > Femei > Rochii" },
    { id: 11, label: "Îmbrăcăminte > Copii > Rochii" },
  ];
  const p = potriveste("Rochii", frunzeAmbigue)[0];
  assert.notEqual(p?.incredere, "sigura");
});

test("cand magazinul spune segmentul, ambiguitatea dispare", () => {
  const frunzeAmbigue = [
    { id: 10, label: "Îmbrăcăminte > Femei > Rochii" },
    { id: 11, label: "Îmbrăcăminte > Copii > Rochii" },
  ];
  const p = potriveste("Rochii damă", frunzeAmbigue)[0];
  assert.equal(p?.categoryId, 10);
  assert.equal(p?.incredere, "sigura");
});

test("scorul ramane intre 0 si 1", () => {
  for (const f of FRUNZE) {
    const s = scorPotrivire("Rochii damă", f.label);
    assert.ok(s >= 0 && s <= 1, `scor in afara intervalului: ${s}`);
  }
});

test("nu intoarce nimic pentru text gol", () => {
  assert.deepEqual(potriveste("", FRUNZE), []);
  assert.deepEqual(potriveste("Rochii", []), []);
});
