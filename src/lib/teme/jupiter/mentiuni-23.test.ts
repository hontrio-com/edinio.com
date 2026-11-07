import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { procentReducere } from "@/lib/storefront/procent-reducere";
import { IDENTITATE_JUPITER, STIL_JUPITER } from "./design";

/*
 * Etapa 23 din `docs/editor-magazin/PLAN.md`, cererea lui (07.11): „Vreau sa modifici tema sa nu fie identica 1 la 1 cu
 * Dedeman, lasam asa cum e dar mai modifica design-ul sa fie tot premium”. Structura ramane; aspectul e al temei.
 */

/** Codul fara comentarii (comentariile pomenesc dinadins aspectul de dinainte). */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const COMPONENTE = {
  antet: "src/components/storefront/sections/chrome/HeaderHipermarket.tsx",
  card: "src/components/storefront/product/ProductCardJupiter.tsx",
  categorii: "src/components/storefront/sections/catalog/CategoryNavPlaci.tsx",
  recomandari: "src/components/storefront/sections/content/PlaciPromo.tsx",
  banner: "src/components/storefront/sections/hero/HeroCuCarduri.tsx",
} as const;

test("identitatea nu mai e a modelului: alt albastru, alte fonturi; colturi rotunjite si butoane-pastila", () => {
  assert.notEqual(IDENTITATE_JUPITER.culoare.toUpperCase(), "#215196");
  assert.notEqual(STIL_JUPITER.colors?.accent?.toUpperCase(), "#FF882D");
  assert.ok(!["sofiasans", "opensans"].includes(IDENTITATE_JUPITER.fontTitluri));
  assert.ok(!["sofiasans", "opensans"].includes(IDENTITATE_JUPITER.fontText));
  assert.equal(STIL_JUPITER.radius, "md");
  assert.equal(STIL_JUPITER.buttonRadius, "full");
});

test("componentele temei urmeaza colturile din stil, nu 3 px scrisi de mana", () => {
  for (const [nume, cale] of Object.entries(COMPONENTE)) {
    assert.doesNotMatch(cod(cale), /rounded-(?:[a-z]-)?\[3px\]/, nume);
    assert.match(cod(cale), /var\(--st-radius/, `${nume} citeste --st-radius*`);
  }
});

test("antetul: cautarea-pastila cu butonul „Cauta” in culoarea principala, pastila „Toate categoriile”", () => {
  const c = cod(COMPONENTE.antet);
  assert.match(c, /rounded-full border border-transparent bg-\[var\(--st-camp\)\]/);
  assert.match(c, /\}\s*Toate categoriile\s*<\/button>/);
  assert.doesNotMatch(c, /Categorii produse/);
  // Portocaliul nu mai e fondul butoanelor mari (cautarea, categoriile): ramane accent (insigna cosului, sublinierea).
  assert.doesNotMatch(c, /backgroundColor: "var\(--st-accent\)", color: "var\(--st-accent-contrast\)" \}\}>\s*\{meniuDeschis/);
  assert.equal((c.match(/backgroundColor: "var\(--st-primary\)", color: "var\(--st-primary-contrast\)"/g) ?? []).length, 2);
});

test("cardul: procentul reducerii in loc de „Super pret”, butonul fara patratul de accent", () => {
  const c = cod(COMPONENTE.card);
  assert.doesNotMatch(c, /Super pret/i);
  assert.doesNotMatch(c, /--st-accent/, "nici patratul cosului, nici alta pata portocalie pe card");
  assert.match(c, />-\{reducere\}%</);
});

test("procentul reducerii: rotunjit in jos, fara insigna sub 1% sau fara pret vechi mai mare", () => {
  assert.equal(procentReducere(76, 100), 24);
  assert.equal(procentReducere(75.5, 100), 24, "24,5% nu se scrie 25%");
  assert.equal(procentReducere(50, 100), 50);
  assert.equal(procentReducere(99.5, 100), null, "-0% n-are sens");
  assert.equal(procentReducere(100, 100), null);
  assert.equal(procentReducere(120, 100), null);
  assert.equal(procentReducere(10, Number.NaN), null);
});

test("randul de produse: panou rotunjit in pagina, nu banda pe tot ecranul", () => {
  const c = cod("src/components/storefront/sections/products/ProductRowClassic.tsx");
  assert.doesNotMatch(c, /100vmax/);
  assert.match(c, /if \(banda\) \{\s*return \(\s*<section className="[^"]*rounded-\[var\(--st-radius-lg\)\]/);
});
