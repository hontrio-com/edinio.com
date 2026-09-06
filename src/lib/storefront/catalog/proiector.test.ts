import assert from "node:assert/strict";
import { test } from "node:test";
import { configuratoareleLotului, proiecteazaRand } from "./proiector";
// Separatorul are o SINGURA definitie, in facets.ts, si testul o foloseste pe
// aceea. Cu o copie locala, testul ar putea trece in timp ce productia scrie
// altceva — exact bug-ul pe care ar trebui sa-l prinda.
import { jeton } from "@/lib/storefront/catalog/facets";
import { getProductPriceRange } from "@/lib/utils/product-price";
import type { Compilat } from "@/lib/configurators/compileaza";
import type { Definitie, Nod } from "@/lib/configurators/definitie";

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
  assert.ok(pr.fatete.includes(jeton("a.Marime", "XL")));
  assert.ok(pr.fatete.includes(jeton("brand", "Portwest")));
  assert.ok(pr.fatete.includes(jeton("tag", "Reducere")));
  assert.ok(pr.fatete.includes(jeton("s.Certificari", "EN388")));
});

test("aceeasi pereche din doua surse se scrie o singura data", () => {
  // Un magazin real are si `google.brand`, si o specificatie scrisa „Brand".
  const pr = proiecteazaRand(rand({
    page_sections: { google: { brand: "Portwest" }, specifications: [{ label: "Brand", value: "Portwest" }] },
  }), ACUM);
  const portwest = pr.fatete.filter((f) => f.endsWith(jeton("", "Portwest")));
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

/* ─── Configuratorul ───────────────────────────────────────────────────────── */

/**
 * ⚠ CELE DOUA COLOANE SE SCRIU IMPREUNA SAU DELOC.
 *
 * Absenta cheilor e un semnal citit de `catalog_aplica_proiectii`, nu o scapare: cand citirea
 * configuratoarelor a picat, coloanele trebuie sa ramana cum erau. Scrise oricum, un magazin
 * intreg ar fi ramas cu steagul stins pe produse care CHIAR cer configurare, si nimic nu l-ar
 * mai fi reaprins pana la urmatoarea salvare a fiecarui produs.
 */

const material = (implicit?: string): Nod => ({
  id: "m", eticheta: "Material", fel: "alegere", control: "butoane",
  optiuni: [{ id: "brad", eticheta: "Brad" }, { id: "stejar", eticheta: "Stejar", pret: 50 }],
  ...(implicit ? { implicit } : {}),
} as Nod);

const gravuraObligatorie: Nod = {
  id: "g", eticheta: "Gravura", fel: "text", control: "scurt", obligatoriu: true,
} as Nod;

const compilat = (noduri: Nod[]): Compilat => ({
  v: 1,
  definitie: {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p1", eticheta: "Alege", grupuri: [{ id: "g1", noduri }] }],
  } as Definitie,
  reguli: [],
  pretuire: { baza: "produs" },
});

test("⚠ fara stire, cele doua chei LIPSESC cu totul din proiectie", () => {
  const pr = proiecteazaRand(rand(), ACUM);
  assert.equal("cere_configurare" in pr, false);
  assert.equal("pret_pornire" in pr, false);
});

test("stirea „n-are configurator” se SCRIE, nu se omite", () => {
  // Altfel un produs caruia i s-a scos configuratorul ar fi ramas pe veci marcat ca avand unul.
  const pr = proiecteazaRand(rand(), ACUM, { compilat: null });
  assert.equal(pr.cere_configurare, false);
  assert.equal(pr.pret_pornire, null);
});

test("produsul cu configurator poarta pretul configuratiei implicite", () => {
  // 203 (pretul produsului) + 50 (stejarul pus implicit de comerciant).
  const pr = proiecteazaRand(rand({ price: 203 }), ACUM, { compilat: compilat([material("stejar")]) });
  assert.equal(pr.cere_configurare, true);
  assert.equal(pr.pret_pornire, 253);
});

test("fara implicite, pretul de pornire e chiar pretul produsului", () => {
  const pr = proiecteazaRand(rand({ price: 203 }), ACUM, { compilat: compilat([material()]) });
  assert.equal(pr.cere_configurare, true);
  assert.equal(pr.pret_pornire, 203);
});

test("⚠ un camp obligatoriu fara implicit da `null`, dar steagul ramane aprins", () => {
  /*
   * Cele doua raspunsuri sunt independente: produsul CERE configurare (deci butonul duce la
   * pagina), dar nu exista niciun pret la care se poate cumpara. Legate, cardul ar fi trimis
   * cumparatorul direct in cos cu o gravura necompletata.
   */
  const pr = proiecteazaRand(rand({ price: 203 }), ACUM, { compilat: compilat([gravuraObligatorie]) });
  assert.equal(pr.cere_configurare, true);
  assert.equal(pr.pret_pornire, null);
});

test("⚠ pretul de pornire creste de la cea mai ieftina VARIANTA, nu de la pretul de baza", () => {
  /*
   * Pretul de baza nu e unul la care se poate cumpara: pe un produs cu variante, cardul arata
   * dintotdeauna minimul VANDABIL. Socotit din `price`, cardul ar fi scris 225 (175 + stejar)
   * pentru un produs a carui cea mai ieftina marime costa 203 — adica taman defectul pentru care
   * exista `getProductPriceRange`.
   */
  const pr = proiecteazaRand(
    rand({
      price: 175,
      page_sections: variante([
        { title: "S", enabled: true, price: 203 },
        { title: "M", enabled: true, price: 231 },
      ]),
    }),
    ACUM,
    { compilat: compilat([material("stejar")]) },
  );
  assert.equal(pr.price_min, 203, "santinela: minimul vandabil");
  assert.equal(pr.pret_pornire, 253);
});

test("un pret de produs stricat nu da niciodata `NaN`", () => {
  /*
   * `Number("abc")` e `NaN`. Ajuns pana in `formatPrice`, cardul ar fi scris „De la NaN lei”.
   * `getProductPriceRange` il aduce deja la 0, iar cardul arata de mult „0 lei” pe randurile
   * astea; configuratorul nu inventeaza aici o purtare noua, doar n-o strica.
   */
  const pr = proiecteazaRand(rand({ price: "abc" }), ACUM, { compilat: compilat([material()]) });
  assert.equal(pr.cere_configurare, true);
  assert.equal(pr.pret_pornire, 0);
  assert.equal(Number.isNaN(pr.pret_pornire), false);
});

/* -- Citirea configuratoarelor pe lot: aici sta toata grija fazei ----------- */

/** Un cititor prefacut: raspunde ce i se spune, si tine minte cine l-a intrebat. */
function cititor(raspunsuri: Record<string, { ok: boolean; ids: string[] }>) {
  const intrebari: { businessId: string; produse: string[] }[] = [];
  const citeste = async (businessId: string, produse: { id: string; category: string | null }[]) => {
    intrebari.push({ businessId, produse: produse.map((p) => p.id) });
    const r = raspunsuri[businessId] ?? { ok: true, ids: [] };
    const harta = new Map(r.ids.map((id) => [id, {
      configuratorId: "c1", versiuneId: "v1", numarVersiune: 1,
      compilat: { v: 1, definitie: { versiuneSchema: 1, mod: "auto", pasi: [] }, reguli: [], pretuire: { baza: "produs" } },
    }]));
    return { ok: r.ok, harta } as never;
  };
  return { citeste, intrebari };
}

const sursa = (id: string, businessId: string, category: string | null = null) =>
  rand({ id, business_id: businessId, category }) as never;

test("se intreaba O SINGURA DATA pe magazin, nu o data pe produs", async () => {
  /*
   * ⚠ Coada e a INTREGII platforme, deci un lot de 500 poate amesteca zeci de comercianti.
   * Intrebat pe produs, backfill-ul ar fi facut mii de citiri; intrebat o singura data cu toate
   * id-urile, filtrul pe magazin ar fi raspuns „n-are configurator” pentru toti ceilalti.
   */
  const c = cititor({ b1: { ok: true, ids: ["p1"] }, b2: { ok: true, ids: [] } });
  const r = await configuratoareleLotului(
    [sursa("p1", "b1"), sursa("p2", "b1"), sursa("p3", "b2")],
    c.citeste,
  );
  assert.equal(c.intrebari.length, 2, "o intrebare pe magazin");
  assert.deepEqual(c.intrebari.map((x) => x.businessId).sort(), ["b1", "b2"]);
  assert.deepEqual(c.intrebari.find((x) => x.businessId === "b1")?.produse, ["p1", "p2"]);
  assert.equal(r.ratate.size, 0);
  assert.equal(r.stiri.get("p1")?.compilat !== null, true, "p1 are configurator");
  assert.equal(r.stiri.get("p2")?.compilat, null, "p2 n-are, si asta se SCRIE");
});

test("O PANA DE CITIRE nu se scrie ca „n-are configurator”", async () => {
  /*
   * ⚠ Aici e toata grija fazei. Harta goala inseamna si „niciunul n-are”, si „citirea a picat”.
   * Luata drept raspuns, pana ar fi SCRIS steagul fals peste produse care au configurator — si ar
   * fi ramas asa, fiindca proiectia nu se reia singura si produsul iese din coada. Cardul ar fi
   * mintit pana la urmatoarea salvare a produsului, poate luni.
   */
  const c = cititor({ b1: { ok: false, ids: [] }, b2: { ok: true, ids: [] } });
  const r = await configuratoareleLotului([sursa("p1", "b1"), sursa("p2", "b2")], c.citeste);
  assert.equal(r.stiri.has("p1"), false, "pentru magazinul cu pana nu se scrie nimic");
  assert.deepEqual([...r.ratate], ["p1"], "si produsul lui ramane de reincercat");
  assert.equal(r.stiri.get("p2")?.compilat, null, "celalalt magazin nu e tras dupa el");
});

test("un magazin care ARUNCA nu opreste proiectia celorlalti", async () => {
  /*
   * ⚠ `proiecteazaCoada` e chemata din ruta de cron fara niciun catch deasupra: o exceptie de aici
   * ar fi oprit proiectia INTREGII platforme pentru un singur magazin cu ceva stricat.
   */
  const citeste = async (businessId: string) => {
    if (businessId === "b1") throw new Error("baza a picat");
    return { ok: true, harta: new Map() } as never;
  };
  const r = await configuratoareleLotului([sursa("p1", "b1"), sursa("p2", "b2")], citeste);
  assert.deepEqual([...r.ratate], ["p1"]);
  assert.equal(r.stiri.get("p2")?.compilat, null);
});

test("un rand fara magazin nu intreaba pe nimeni si nu se scrie", async () => {
  const c = cititor({});
  const r = await configuratoareleLotului([sursa("p1", "")], c.citeste);
  assert.equal(c.intrebari.length, 0);
  assert.equal(r.stiri.size, 0);
});
