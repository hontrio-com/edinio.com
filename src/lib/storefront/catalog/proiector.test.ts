import assert from "node:assert/strict";
import { test } from "node:test";
import { proiecteazaRand, SEPARATOR_FATETA } from "./proiector";
import { getProductPriceRange } from "@/lib/utils/product-price";

/**
 * Proiectorul NU are voie sa reimplementeze nimic.
 *
 * Testele de mai jos nu verifica „preturile ies bine" — pentru asta exista deja
 * `product-price.test.ts`. Verifica altceva, mai important pentru modelul de
 * citire: ca ce scrie proiectorul in tabela e IDENTIC cu ce ar fi calculat
 * randarea de azi. In clipa in care cineva „optimizeaza" proiectorul cu o
 * formula proprie, testele astea pica.
 */

const ACUM = "2026-08-09T10:00:00.000Z";

const rand = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  business_id: "b1",
  name: "Geaca VISION",
  description: null,
  category: null,
  tags: null,
  price: 203,
  page_sections: null,
  ...over,
} as Parameters<typeof proiecteazaRand>[0]);

const variante = (combinatii: unknown[], optiuni: unknown[] = [{ name: "Marime", values: ["S", "M"] }]) => ({
  variants: { enabled: true, options: optiuni, combinations: combinatii },
});

/* ─── Pretul: aceeasi valoare ca la randare, pe fiecare forma ──────────────── */

const CAZURI_PRET: { nume: string; price: unknown; ps: unknown }[] = [
  { nume: "produs simplu", price: 49.9, ps: null },
  { nume: "variante cu preturi diferite", price: 100, ps: variante([
    { title: "S", enabled: true, price: 90 }, { title: "M", enabled: true, price: 120 }]) },
  { nume: "titluri duplicate (conteaza PRIMA)", price: 203, ps: variante([
    { title: "S", enabled: true, price: 203 }, { title: "S", enabled: true, price: 231 }]) },
  { nume: "combinatie dezactivata se ignora", price: 100, ps: variante([
    { title: "S", enabled: false, price: 10 }, { title: "M", enabled: true, price: 120 }]) },
  { nume: "niciuna activa => fara oferta", price: 100, ps: variante([
    { title: "S", enabled: false, price: 10 }]) },
  { nume: "rand null nu arunca", price: 100, ps: variante([null, { title: "M", enabled: true, price: 120 }]) },
  { nume: "pret 0 cade pe pretul de baza", price: 100, ps: variante([{ title: "S", enabled: true, price: 0 }]) },
  { nume: "pret nenumeric cade pe pretul de baza", price: 100, ps: variante([{ title: "S", enabled: true, price: "abc" }]) },
  { nume: "variants.enabled fara options e produs SIMPLU", price: 100, ps: { variants: { enabled: true } } },
];

for (const c of CAZURI_PRET) {
  test(`pret identic cu randarea: ${c.nume}`, () => {
    const asteptat = getProductPriceRange(Number(c.price), c.ps);
    const pr = proiecteazaRand(rand({ price: c.price, page_sections: c.ps }), ACUM);
    assert.equal(pr.price_min, asteptat.min);
    assert.equal(pr.price_max, asteptat.max);
    assert.equal(pr.has_range, asteptat.hasRange);
    assert.equal(pr.fara_oferta, asteptat.faraOferta);
  });
}

/* ─── Textul de cautare ────────────────────────────────────────────────────── */

test("cauta_norm nu are diacritice si strange numele, categoria, optiunile si descrierea", () => {
  const pr = proiecteazaRand(rand({
    name: "Păpușă",
    category: "Jucării",
    description: "<p>Foarte <strong>frumoasă</strong></p>",
    page_sections: variante([], [{ name: "Culoare", values: ["Roșu"] }]),
  }), ACUM);
  for (const cuvant of ["papusa", "jucarii", "rosu", "frumoasa"]) {
    assert.ok(pr.cauta_norm.includes(cuvant), `lipseste „${cuvant}" din: ${pr.cauta_norm}`);
  }
  // Marcajul se taie INAINTE de normalizare, altfel „strong" ar deveni cuvant cautabil.
  assert.ok(!pr.cauta_norm.includes("strong"), "marcajul a ramas in textul de cautare");
});

test("descrierea scurta taie marcajul si se opreste la 300 de caractere", () => {
  const pr = proiecteazaRand(rand({ description: "<p>" + "a".repeat(500) + "</p>" }), ACUM);
  assert.equal(pr.descriere_scurta.length, 300);
  assert.ok(!pr.descriere_scurta.includes("<"));
});

test("descrierea lipsa da sir gol, nu null", () => {
  // Coloana e `not null default ''`: un null ar face UPDATE-ul sa pice.
  assert.equal(proiecteazaRand(rand({ description: null }), ACUM).descriere_scurta, "");
});

/* ─── Fatetele ─────────────────────────────────────────────────────────────── */

test("fatetele poarta cheia si valoarea, despartite de caracterul de control", () => {
  const pr = proiecteazaRand(rand({
    tags: ["Reducere"],
    page_sections: {
      variants: { enabled: true, options: [{ name: "Marime", values: ["XL"] }] },
      google: { brand: "Portwest" },
      specifications: [{ label: "Certificari", value: "EN388" }],
    },
  }), ACUM);
  assert.ok(pr.fatete.includes(`a.Marime${SEPARATOR_FATETA}XL`));
  assert.ok(pr.fatete.includes(`brand${SEPARATOR_FATETA}Portwest`));
  assert.ok(pr.fatete.includes(`tag${SEPARATOR_FATETA}Reducere`));
  assert.ok(pr.fatete.includes(`s.Certificari${SEPARATOR_FATETA}EN388`));
});

test("aceeasi pereche din doua surse se scrie o singura data", () => {
  // Un magazin real are si `google.brand`, si o specificatie scrisa „Brand".
  const pr = proiecteazaRand(rand({
    page_sections: { google: { brand: "Portwest" }, specifications: [{ label: "Brand", value: "Portwest" }] },
  }), ACUM);
  const portwest = pr.fatete.filter((f) => f.endsWith(`${SEPARATOR_FATETA}Portwest`));
  assert.equal(new Set(portwest).size, portwest.length, "dubluri in indexul GIN");
});

test("produsul fara fatete da array gol, nu null", () => {
  assert.deepEqual(proiecteazaRand(rand(), ACUM).fatete, []);
});

/* ─── Optiunile ────────────────────────────────────────────────────────────── */

test("optiunile pastreaza axele si arunca combinatiile", () => {
  const pr = proiecteazaRand(rand({
    page_sections: variante(
      [{ title: "S", enabled: true, price: 90 }],
      [{ name: "Marime", values: ["S", "M"] }],
    ),
  }), ACUM);
  const v = (pr.optiuni as { variants?: { options?: unknown; combinations?: unknown } })?.variants;
  assert.deepEqual(v?.options, [{ name: "Marime", values: ["S", "M"] }]);
  // Combinatiile sunt partea grea a payload-ului; nu au ce cauta in model.
  assert.equal(v?.combinations, undefined);
});

test("produsul fara sectiuni da optiuni null", () => {
  assert.equal(proiecteazaRand(rand(), ACUM).optiuni, null);
});
