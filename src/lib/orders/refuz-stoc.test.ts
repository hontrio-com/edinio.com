import assert from "node:assert/strict";
import { test } from "node:test";
import { mesajRefuzStoc } from "./refuz-stoc";

test("refuzul pe varianta spune MARIMEA, nu produsul", () => {
  /*
   * Cazul care a produs tot fixul: „Pique Polo" are 94 de combinatii si 993.313
   * bucati in total, dar marimea ceruta are zero. Mesajul de produs ar suna
   * „«Pique Polo» tocmai s-a epuizat" pe o pagina care arata mii de bucati.
   */
  const m = mesajRefuzStoc({ nume: "Pique Polo", varianta: "verde sticlă / 4XL", disponibil: 0 });
  assert.ok(m.includes("verde sticlă / 4XL"), m);
  assert.ok(!m.includes("Pique Polo"), m);
});

test("varianta cu bucati ramase spune CATE", () => {
  const m = mesajRefuzStoc({ nume: "Pique Polo", varianta: "4XL", disponibil: 2 });
  assert.ok(m.includes("2 bucati"), m);
  assert.ok(m.includes("4XL"), m);
});

test("fara `varianta` ramane mesajul de produs", () => {
  const m = mesajRefuzStoc({ nume: "Casca de protectie", disponibil: 0 });
  assert.ok(m.includes("Casca de protectie"), m);
  assert.ok(!m.toLowerCase().includes("varianta"), m);
});

test("`varianta` gol nu se ia drept refuz pe marime", () => {
  // `null` si `""` vin amandoua din baza (`->>` da NULL pe cheie lipsa). Tratate
  // ca adevarate, ar produce „Varianta «» nu mai este in stoc".
  for (const v of [null, undefined, ""]) {
    const m = mesajRefuzStoc({ nume: "Bocanci", varianta: v as string | null, disponibil: 0 });
    assert.ok(m.includes("Bocanci"), `varianta=${JSON.stringify(v)} -> ${m}`);
  }
});

test("fara nume, mesajul ramane omenesc", () => {
  const m = mesajRefuzStoc({ disponibil: 0 });
  assert.ok(m.includes("produsul cerut"), m);
});

test("numele lungi se taie, ca mesajul sa nu devina un paragraf", () => {
  const m = mesajRefuzStoc({ nume: "x".repeat(200), disponibil: 0 });
  assert.ok(m.length < 140, `mesaj de ${m.length} caractere`);
});

test("`disponibil` absent sau aiurea se citeste ca zero, nu ca NaN", () => {
  // „au mai ramas NaN bucati" a fost un bug real in alta parte a platformei.
  for (const d of [undefined, null, "abc" as unknown as number]) {
    const m = mesajRefuzStoc({ nume: "Manusi", disponibil: d as number | null });
    assert.ok(!m.includes("NaN"), m);
    assert.ok(m.includes("epuizat"), m);
  }
});
