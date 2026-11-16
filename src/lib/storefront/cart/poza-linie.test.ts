import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pozaLiniei, type RegulaPretCos } from "./pret-linie";

/**
 * Miniatura unei linii de cos (16.11.2026): la finalizarea comenzii, trei produse din patru
 * apareau FARA poza, desi toate aveau poze in catalog. Liniile intrasera in cos fara ea (cosul
 * refacut din linkul de recuperare poarta doar ce s-a salvat la abandon), iar rezumatul citea
 * numai poza salvata in localStorage.
 */

const regula = (imagine: string | null | undefined): RegulaPretCos => ({
  price: 49, combos: {}, tiers: null, customization: null, imagine,
});

test("poza salvata la adaugare are intaietate fata de cea de acum a produsului", () => {
  assert.equal(pozaLiniei({ imageUrl: "https://x/varianta-mica.jpg" }, regula("https://x/prima.jpg")), "https://x/varianta-mica.jpg");
});

test("⚠ linia fara poza primeste prima poza de ACUM a produsului, de la server", () => {
  assert.equal(pozaLiniei({ imageUrl: null }, regula("https://x/prima.jpg")), "https://x/prima.jpg");
  // Un sir gol sau numai spatii nu e o poza: ar fi ascuns-o pe cea buna.
  assert.equal(pozaLiniei({ imageUrl: "" }, regula("https://x/prima.jpg")), "https://x/prima.jpg");
  assert.equal(pozaLiniei({ imageUrl: "   " }, regula("https://x/prima.jpg")), "https://x/prima.jpg");
});

test("fara nicio poza: null, ca ecranul sa-si arate iconita, nu o imagine stricata", () => {
  assert.equal(pozaLiniei({ imageUrl: null }, regula(null)), null);
  assert.equal(pozaLiniei({ imageUrl: null }, regula("  ")), null);
  // Preturile n-au ajuns inca (sau produsul nu mai e activ): ramane ce poarta linia.
  assert.equal(pozaLiniei({ imageUrl: null }, undefined), null);
  assert.equal(pozaLiniei({ imageUrl: "https://x/a.jpg" }, undefined), "https://x/a.jpg");
});

const sursa = (cale: string) => readFileSync(new URL(`../../../${cale}`, import.meta.url), "utf8");

test("⚠ serverul trimite poza: `getCartPricing` citeste `images` si intoarce `imagine`", () => {
  const s = sursa("lib/actions/store.actions.ts");
  const de = s.indexOf("export async function getCartPricing(");
  const pana = s.indexOf("\n}\n", de);
  assert.ok(de !== -1 && pana !== -1, "nu s-a gasit `getCartPricing`");
  const corp = s.slice(de, pana);
  assert.match(corp, /\.select\("[^"]*\bimages\b[^"]*"\)/, "`getCartPricing` nu mai cere coloana `images`");
  assert.match(corp, /\bimagine: /, "`getCartPricing` nu mai intoarce `imagine`");
});

test("⚠ TOATE suprafetele cosului iau miniatura din `lineImage`, nu din `imageUrl`", () => {
  for (const cale of [
    "components/storefront/sections/checkout/CheckoutSummary.tsx",
    "components/storefront/sections/cart/_shared/CartPieces.tsx",
    "components/storefront/sections/cart/CartDrawerClassic.tsx",
    "components/ministore/OrderModal.tsx",
  ]) {
    const s = sursa(cale);
    assert.doesNotMatch(s, /src=\{(?:item|ci)\.imageUrl\}/, `${cale}: miniatura citita direct din linie`);
    assert.match(s, /lineImage\(/, `${cale}: nu mai trece prin \`lineImage\``);
  }
});

test("⚠ si cosul abandonat salveaza poza de rezerva: din el se reface cosul la recuperare", () => {
  assert.match(sursa("components/storefront/sections/checkout/checkout-core.ts"), /image_url: lineImage\(i\)/);
  assert.match(sursa("components/ministore/OrderModal.tsx"), /image_url: \(cosMagazin\?\.lineImage\(i\) \?\? i\.imageUrl\) \?\? null/);
});
