import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cutiaSectiunii, sectiuneaDeSub, type Dreptunghi, type ElementDeMasurat } from "./contur-editor";
import { ETICHETA_ATTR, SECTION_ATTR } from "./preview-protocol";

/**
 * Conturul din previzualizarea editorului (etapa 3): cutia unei sectiuni al
 * carei invelis n-are cutie, si sectiunea de sub mouse.
 *
 * Rulare: `npm test`.
 */

/** Un element de test: cu `dreptunghi` are cutie, fara el e `display: contents`. */
function el(dreptunghi: Dreptunghi | null, copii: ElementDeMasurat[] = []): ElementDeMasurat {
  return {
    getClientRects: () => ({ length: dreptunghi ? 1 : 0 }),
    getBoundingClientRect: () => dreptunghi ?? { top: 0, left: 0, right: 0, bottom: 0 },
    children: copii,
  };
}
const d = (top: number, left: number, right: number, bottom: number): Dreptunghi => ({ top, left, right, bottom });

test("un element cu cutie se masoara pe el insusi, fara copii", () => {
  const sectiune = el(d(10, 0, 800, 210), [el(d(-500, -500, 5000, 5000))]);
  assert.deepEqual(cutiaSectiunii(sectiune), { sus: 10, stanga: 0, latime: 800, inaltime: 200 });
});

test("⚠⚠ invelisul `display: contents` se masoara din copii, uniti", () => {
  // Cazul real: `<div data-st-section class="contents">` da zero la
  // `getBoundingClientRect()`. Masurat pe el, conturul ar fi fost un punct in colt.
  const inveli = el(null, [el(d(100, 20, 500, 300)), el(d(300, 0, 800, 450))]);
  assert.deepEqual(cutiaSectiunii(inveli), { sus: 100, stanga: 0, latime: 800, inaltime: 350 });
});

test("un copil tot fara cutie se desface si el", () => {
  const inveli = el(null, [el(null, [el(d(50, 10, 110, 90))])]);
  assert.deepEqual(cutiaSectiunii(inveli), { sus: 50, stanga: 10, latime: 100, inaltime: 40 });
});

test("⚠ un copil cu latime sau inaltime zero nu intinde conturul", () => {
  // Un `div` gol cat tot randul ar fi tras conturul pana la marginea paginii.
  const inveli = el(null, [el(d(100, 200, 400, 300)), el(d(900, 0, 1920, 900))]);
  assert.deepEqual(cutiaSectiunii(inveli), { sus: 100, stanga: 200, latime: 200, inaltime: 200 });
});

test("o sectiune care n-a randat nimic n-are cutie", () => {
  assert.equal(cutiaSectiunii(el(null)), null);
  assert.equal(cutiaSectiunii(el(null, [el(null)])), null);
  assert.equal(cutiaSectiunii(null), null);
});

/** O tinta de eveniment al carei marcaj de sectiune are atributele date. */
function tinta(atribute: Record<string, string> | null) {
  return {
    closest: (selector: string) =>
      atribute && selector === `[${SECTION_ATTR}]`
        ? { getAttribute: (nume: string) => atribute[nume] ?? null }
        : null,
  };
}

test("sectiunea de sub mouse: id-ul si numele din marcaj", () => {
  assert.deepEqual(
    sectiuneaDeSub(tinta({ [SECTION_ATTR]: "reviews", [ETICHETA_ATTR]: "Recenzii" })),
    { id: "reviews", eticheta: "Recenzii" },
  );
});

test("fara nume in marcaj, conturul scrie id-ul; in afara sectiunilor, nimic", () => {
  assert.deepEqual(sectiuneaDeSub(tinta({ [SECTION_ATTR]: "hero" })), { id: "hero", eticheta: "hero" });
  assert.equal(sectiuneaDeSub(tinta(null)), null);
  assert.equal(sectiuneaDeSub(tinta({ [SECTION_ATTR]: "" })), null);
  assert.equal(sectiuneaDeSub(null), null);
});

/** Toate fisierele sursa de sub `dir`, cu cai relative la `src`, cu „/”. */
function surse(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const cale = path.join(dir, e.name);
    if (e.isDirectory()) return surse(cale);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [cale] : [];
  });
}

test("⚠⚠ stratul de contur se incarca DOAR la cerere, fara server, si doar in editor", () => {
  /*
   * Magazinul public n-are voie sa descarce stratul: importat static, ar fi intrat
   * in pachetul fiecarui vizitator; randat fara steag, ar fi ascultat mesaje si pe
   * magazinul real. `ssr: false` e si ce-i da voie sa citeasca `document` la randare.
   */
  const src = path.join(process.cwd(), "src");
  const gazde: string[] = [];
  for (const fisier of surse(src)) {
    const text = readFileSync(fisier, "utf8");
    if (!text.includes("storefront/ConturEditor")) continue;
    const rel = path.relative(src, fisier).split(path.sep).join("/");
    assert.doesNotMatch(text, /^import[^;]*["']@\/components\/storefront\/ConturEditor["']/m, `${rel}: import static`);
    assert.match(
      text,
      /dynamic\(\(\) => import\("@\/components\/storefront\/ConturEditor"\), \{ ssr: false \}\)/,
      `${rel}: fara import dinamic cu ssr: false`,
    );
    const randari = [...text.matchAll(/<ConturEditor\b/g)];
    assert.ok(randari.length > 0, `${rel}: importat, dar nerandat`);
    for (const r of randari) {
      const inainte = text.slice(Math.max(0, (r.index ?? 0) - 40), r.index);
      assert.match(inainte, /\b(esteEditorDesign|editorDesign) && $/, `${rel}: randat fara steagul de editor`);
    }
    gazde.push(rel);
  }
  assert.deepEqual(gazde.sort(), ["components/ministore/MiniStoreRenderer.tsx", "components/storefront/StorePageShell.tsx"]);
});
