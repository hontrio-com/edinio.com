import assert from "node:assert/strict";
import { test } from "node:test";
import { styleToCssVars } from "./css-vars";
import { resolveStyle } from "./defaults";
import type { DesignContext } from "./types";

/**
 * Culoarea principala o alege comerciantul, dintr-un selector fara nicio
 * ingradire. Textul asezat peste ea trebuie sa ramana lizibil pentru ORICE
 * alegere — inclusiv pentru culorile de mijloc, pe care nici negrul de tema,
 * nici albul nu le acopera.
 */

const ctx: DesignContext = {
  primaryColor: "#1AB554",
  pageContent: {},
  features: {},
  coverUrl: null,
  tagline: null,
};

/** Raportul de contrast WCAG dintre doua culori hex. */
function raport(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const canal = (i: number) => {
      const v = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const contrastul = (primary: string) =>
  styleToCssVars(resolveStyle({ colors: { primary } }, ctx))["--st-primary-contrast"];

test("verdele platformei primeste text inchis, nu alb", () => {
  // Albul pe #1AB554 da 2,7:1 — sub pragul AA. Cazul care a pornit reparatia.
  assert.equal(contrastul("#1AB554"), "#111827");
});

test("un albastru inchis primeste text deschis", () => {
  assert.equal(contrastul("#1E3A8A"), "#FFFFFF");
});

test("orice culoare aleasa da un text peste pragul AA", () => {
  // Culorile de mijloc sunt cele periculoase: nici negrul de tema, nici albul
  // nu le acopera, iar magazinul ramanea cu text ilizibil.
  const culori = [
    "#1AB554", "#1E3A8A", "#FFFFFF", "#000000",
    "#808080", "#C0A000", "#00A0A0", "#B07030", "#7A7AC0", "#D06070",
    "#4A9E4A", "#9E4A9E", "#E0C000", "#00B0B0",
  ];
  for (const c of culori) {
    const text = contrastul(c);
    assert.ok(
      raport(c, text) >= 4.5,
      `${c} cu text ${text} da doar ${raport(c, text).toFixed(2)}:1`,
    );
  }
});

test("scurtatura de trei caractere se citeste la fel", () => {
  assert.equal(contrastul("#000"), contrastul("#000000"));
});
