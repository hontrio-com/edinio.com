import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveStyle } from "./defaults";
import { fontDinPageContent } from "./fonturi-magazin";

const ctx = (pageContent: Record<string, unknown>) => ({ primaryColor: "#07c527", pageContent, features: {} });

test("fonturile din Editeaza magazinul ajung in stil; fara ele ramane Geist", () => {
  const ales = resolveStyle({}, ctx({ font_titluri: "playfair", font_text: "inter" }));
  assert.equal(ales.fontHeading, "playfair");
  assert.equal(ales.fontBody, "inter");
  const gol = resolveStyle(undefined, ctx({}));
  assert.equal(gol.fontHeading, "geist");
  assert.equal(gol.fontBody, "geist");
});

test("un font ales in design ramane mai tare decat cel din page_content", () => {
  const s = resolveStyle({ fontHeading: "sora" }, ctx({ font_titluri: "playfair" }));
  assert.equal(s.fontHeading, "sora");
});

test("o valoare necunoscuta nu trece: cade pe Geist", () => {
  assert.equal(fontDinPageContent("comic-sans"), undefined);
  assert.equal(fontDinPageContent(3), undefined);
  assert.equal(resolveStyle({}, ctx({ font_text: "<script>" })).fontBody, "geist");
});

test("pe Geist invelisul vitrinei nu pune nimic in plus; titlurile au variabila lor", () => {
  const scope = readFileSync("src/components/storefront/StorefrontThemeScope.tsx", "utf8");
  assert.match(scope, /const fonturiAlese = style\.fontHeading !== "geist" \|\| style\.fontBody !== "geist";/);
  assert.match(scope, /"--font-app-heading": fonts\.vars\["--st-font-heading"\]/);
  const css = readFileSync("src/app/stil-comun.css", "utf8");
  assert.match(css, /--font-heading: var\(--font-app-heading, var\(--font-app, var\(--font-geist-sans\)\)\);/);
});
