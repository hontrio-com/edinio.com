import test from "node:test";
import assert from "node:assert/strict";
import { faraSemnPeSectiuni, sectiuniAleComutatoarelor } from "./comutatoare-vechi";
import { buildClassicDesign } from "./defaults";
import { toggleSection } from "./edit";
import { parseStoreDesign } from "./parse";
import type { DesignContext } from "./types";

/**
 * Cele doua comutatoare ale aceleiasi sectiuni.
 *
 * Rulare: npm test
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };

test("cheile din page_content se traduc in sectiuni de design", () => {
  assert.deepEqual(sectiuniAleComutatoarelor(["show_featured_section"]), ["featured"]);
  assert.deepEqual(sectiuniAleComutatoarelor(["announcement_bar", "reviews_section"]), ["announcement", "reviews"]);
});

test("cheile fara pereche se ignora", () => {
  assert.deepEqual(sectiuniAleComutatoarelor(["logo_size", "footer_badges"]), []);
});

test("⚠⚠ comutatorul vechi redevine viu dupa ce ochiul l-a stins", () => {
  // Fara asta, dupa prima folosire a ochiului din editorul de design comutatorul
  // din „Editeaza magazinul" se misca, se salva, arata „Salvat" — si nu schimba
  // nimic, pentru totdeauna.
  const pc = { show_trust_strip_on_store: true };
  const stinsDinDesign = toggleSection(buildClassicDesign({ ...ctx, pageContent: pc }), "usp");
  assert.equal(stinsDinDesign.home.find((s) => s.id === "usp")?.enabled, false);

  // Comerciantul apasa acum comutatorul vechi: semnul nu mai are ce apara.
  const dupa = parseStoreDesign(
    JSON.parse(JSON.stringify(faraSemnPeSectiuni(stinsDinDesign, ["usp"]))),
    { ...ctx, pageContent: pc },
  );
  assert.equal(dupa.home.find((s) => s.id === "usp")?.enabled, true);
});

test("semnele altor sectiuni raman neatinse", () => {
  const pc = { show_trust_strip_on_store: true, reviews_section: { enabled: true } };
  let d = buildClassicDesign({ ...ctx, pageContent: pc });
  d = toggleSection(d, "usp");
  d = toggleSection(d, "reviews");

  const dupa = faraSemnPeSectiuni(d, ["usp"]);
  assert.equal(dupa.home.find((s) => s.id === "usp")?.enabledOverride, undefined);
  assert.equal(dupa.home.find((s) => s.id === "reviews")?.enabledOverride, false);
});

test("bara de anunt trece si ea prin curatare, desi sta in chrome", () => {
  const pc = { announcement_bar: { enabled: true } };
  const d = toggleSection(buildClassicDesign({ ...ctx, pageContent: pc }), "announcement");
  assert.equal(d.chrome.announcement?.enabledOverride, false);
  assert.equal(faraSemnPeSectiuni(d, ["announcement"]).chrome.announcement?.enabledOverride, undefined);
});

test("fara nicio sectiune de curatat, designul se intoarce neatins", () => {
  const d = buildClassicDesign(ctx);
  assert.equal(faraSemnPeSectiuni(d, []), d);
});
