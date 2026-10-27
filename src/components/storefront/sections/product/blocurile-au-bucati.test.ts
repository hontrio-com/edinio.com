import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { schemaBlocurilor, type SchemaBlocuri } from "@/lib/storefront/design/blocuri";

/**
 * Fiecare bloc din schema are bucata lui in componenta variantei, si invers
 * (etapa 4 din `docs/editor-magazin/PLAN.md`).
 *
 * Un bloc fara bucata ar fi aparut in editor si n-ar fi aratat nimic in magazin;
 * o bucata fara bloc n-ar mai fi fost asezata NICIODATA, fiindca zonele se
 * randeaza doar din lista de blocuri. Ordinea cheilor din harta e si ea
 * verificata: e asezarea de dinainte de blocuri, iar lista implicita trebuie sa
 * o dea exact, ca nicio pagina sa nu se schimbe la lansare.
 *
 * Rulare: `npm test`.
 */

const DIR = path.resolve(process.cwd(), "src/components/storefront/sections/product");
const sursa = (fisier: string) => readFileSync(path.join(DIR, fisier), "utf8").replace(/\r\n/g, "\n");

/** Cheile unei harti `const <nume>: Record<string, ReactNode> = { ... };`, in ordine. */
function cheileHartii(text: string, nume: string): string[] {
  const inceput = text.indexOf(`const ${nume}: Record<string, ReactNode> = {\n`);
  assert.ok(inceput >= 0, `harta ${nume} lipseste`);
  const indentare = text.slice(text.lastIndexOf("\n", inceput) + 1, inceput);
  const sfarsit = text.indexOf(`\n${indentare}};`, inceput);
  const corp = text.slice(inceput, sfarsit);
  // Cheile stau cu doua spatii mai la dreapta decat `const`.
  const cheie = new RegExp(`^${indentare}  ([a-z_]+): \\($`, "gm");
  return [...corp.matchAll(cheie)].map((m) => m[1]);
}

/** Bucatile FIXE ale zonei, in ordinea schemei. „Conținut liber” (etapa 9) nu sta in harta: se repeta, deci se randeaza dupa id. */
const ordineaZonei = (schema: SchemaBlocuri, zona: string) =>
  Object.entries(schema.tipuri).filter(([, m]) => m.zona === zona && !m.repetabil).map(([t]) => t);

test("⚠⚠ Clasic: fiecare zona are exact bucatile blocurilor ei, in ordinea implicita", () => {
  const schema = schemaBlocurilor("product_page", "classic")!;
  const text = sursa("ProductPageClassic.tsx");
  assert.deepEqual(cheileHartii(text, "bucati"), ordineaZonei(schema, "cumparare"));
  assert.deepEqual(cheileHartii(text, "jos"), ordineaZonei(schema, "jos"));
  assert.deepEqual(schema.zone.map((z) => z.id), ["cumparare", "jos"]);
  // Zonele chiar se randeaza din blocuri: fara linia asta, harta ar fi fost doar decor.
  for (const zona of ["cumparare", "jos"]) {
    assert.match(text, new RegExp(`blocurileZonei\\(blocuriPagina, SCHEMA_BLOCURI, "${zona}"\\)`), zona);
  }
});

test("⚠⚠ Detaliat: la fel, pe cele patru zone, iar filele isi iau ordinea din blocuri", () => {
  const schema = schemaBlocurilor("product_page", "detailed")!;
  const text = sursa("ProductPageDetailed.tsx");
  assert.deepEqual(schema.zone.map((z) => z.id), ["cumparare", "sub_galerie", "file", "jos"]);
  assert.deepEqual(cheileHartii(text, "bucati"), ordineaZonei(schema, "cumparare"));
  assert.deepEqual(cheileHartii(text, "subGalerie"), ordineaZonei(schema, "sub_galerie"));
  assert.deepEqual(cheileHartii(text, "jos"), ordineaZonei(schema, "jos"));
  // Filele nu sunt bucati de JSX, ci butoane cu continut ascuns: harta lor e alta.
  const inceput = text.indexOf("const fileDupaTip: Record<");
  assert.ok(inceput >= 0, "harta filelor lipseste");
  const corp = text.slice(inceput, text.indexOf("\n  };", inceput));
  assert.deepEqual([...corp.matchAll(/^ {4}([a-z_]+): \{ id:/gm)].map((m) => m[1]), ordineaZonei(schema, "file"));
  for (const zona of ["cumparare", "sub_galerie", "file", "jos"]) {
    assert.match(text, new RegExp(`blocurileZonei\\(blocuriPagina, SCHEMA_BLOCURI, "${zona}"\\)`), zona);
  }
});

test.todo("„Conținut liber” de sub produs se randeaza in ambele variante, dupa id (pasul 9.3)");

test("portile duble au iesit: comutatoarele vechi le citeste doar schema blocurilor", () => {
  // Citite si in componenta, ele ar fi stins o bucata pe care ochiul tocmai o
  // aprinsese, ca in etapa 2 la sectiuni.
  for (const fisier of ["ProductPageClassic.tsx", "ProductPageDetailed.tsx"]) {
    // Fara comentarii: cele care explica regula numesc chiar cheile vechi.
    const text = sursa(fisier).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const poarta of [
      "trust_badges_enabled", "show_social_proof", "show_quality_badge",
      "benefitsSection?.enabled", "howItWorksSection?.enabled", "faqSection?.enabled",
      "setari.showDetails", "setari.showSpecsSummary", "setari.showTiers", "setari.showContact",
    ]) {
      assert.ok(!text.includes(poarta), `${fisier}: ${poarta}`);
    }
  }
});
