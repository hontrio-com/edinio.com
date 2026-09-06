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

/* ══════════════════════════════════════════════════════════════════════════
   PIESELE CONFIGURATIILOR
   ══════════════════════════════════════════════════════════════════════════ */

test("refuzul pe o PIESA nu-i cere omului sa scoata din cos ce n-are in cos", () => {
  /*
   * ⚠ Cazul care a produs regula: o usa configurata consuma patru balamale. Balamaua e un
   * rand de stoc tinut STINS dinadins — nu apare in catalog, nu se poate cumpara, si
   * cumparatorul n-a auzit de ea. Mesajul de produs suna „Balama Blum 110 tocmai s-a epuizat.
   * Scoate-l din cos si incearca din nou.” — o propozitie imposibil de urmat, care pe
   * deasupra ii spune numele intern al unui produs pe care comerciantul il tine ascuns.
   */
  const piese = new Map([["balama-1", "Balama ascunsa"]]);
  const m = mesajRefuzStoc(
    { produs: "balama-1", nume: "BLM-110-INT (nu se vinde)", disponibil: 0 },
    piese,
  );
  assert.ok(!m.includes("BLM-110-INT"), `numele intern a plecat la client: ${m}`);
  assert.ok(!m.includes("Scoate"), `il trimite sa scoata din cos ce n-are in cos: ${m}`);
  assert.ok(m.includes("Balama ascunsa"), m);
  assert.ok(m.includes("optiune"), `nu-i spune ce POATE face: ${m}`);
});

test("piesa cu bucati ramase spune CATE, si ce se poate face", () => {
  const m = mesajRefuzStoc(
    { produs: "p1", nume: "intern", disponibil: 3 },
    new Map([["p1", "Balama ascunsa"]]),
  );
  assert.ok(m.includes("3"), m);
  assert.ok(!m.includes("intern"), m);
  assert.ok(m.includes("Scade cantitatea"), m);
});

test("piesa care e SI marfa din cos ramane pe mesajul de produs", () => {
  /*
   * ⚠ Aceeasi balama poate fi si vanduta la bucata, si consumata de o usa configurata, in
   * aceeasi comanda. Atunci „scoate-o din cos” chiar are inteles, si e sfatul mai bun. Cine
   * hotaraste e `numelePieselor`, care scoate din lista tot ce e si linie de comanda — deci
   * aici lista pur si simplu n-o contine.
   */
  const m = mesajRefuzStoc({ produs: "balama-1", nume: "Balama Blum", disponibil: 0 }, new Map());
  assert.ok(m.includes("Balama Blum"), m);
  assert.ok(m.includes("Scoate"), m);
});

test("o piesa FARA nume nu cade inapoi pe numele produsului ascuns", () => {
  /*
   * ⚠ Numele piesei se ingheata la publicare si poate lipsi dintr-o versiune veche. Cazut
   * atunci pe mesajul de produs, defectul s-ar fi intors exact pentru versiunile mai vechi —
   * adica tocmai acolo unde nimeni nu se mai uita. Se pierde numele, nu regula.
   */
  const m = mesajRefuzStoc(
    { produs: "p1", nume: "SKU-INTERN-77", disponibil: 0 },
    new Map([["p1", ""]]),
  );
  assert.ok(!m.includes("SKU-INTERN-77"), m);
  assert.ok(!m.includes("Scoate"), m);
});

test("un refuz pe VARIANTA ramane pe marime chiar daca produsul e si piesa", () => {
  /*
   * ⚠ O piesa n-are combinatii, deci `varianta` prezenta inseamna ca a picat o marime a unei
   * linii adevarate din cos. Mesajul de piesa ar fi ascuns tocmai marimea — singurul lucru pe
   * care omul il poate schimba.
   */
  const m = mesajRefuzStoc(
    { produs: "p1", nume: "Polo", varianta: "4XL", disponibil: 0 },
    new Map([["p1", "Ceva"]]),
  );
  assert.ok(m.includes("4XL"), m);
});

test("fara lista de piese, purtarea ramane cea dinainte", () => {
  // Calea de editare a comenzii nu trimite lista: acolo produsele configurabile sunt refuzate
  // din start, deci nu exista piese. `undefined` nu trebuie sa schimbe nimic.
  const m = mesajRefuzStoc({ produs: "p1", nume: "Casca", disponibil: 0 });
  assert.ok(m.includes("Casca"), m);
});

test("mesajul de piesa nu devine un paragraf", () => {
  const m = mesajRefuzStoc({ produs: "p1", disponibil: 0 }, new Map([["p1", "x".repeat(200)]]));
  assert.ok(m.length < 180, `mesaj de ${m.length} caractere`);
});
