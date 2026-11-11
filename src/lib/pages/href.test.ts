import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { linkAfisat, linkDeSalvat, resolveHref, schemaRefuzata } from "./href";

/* Etapa 25.9-25.10 (11.11.2026): campul de link arata textul citibil si spune pe loc cand un link nu va merge. */

test("schema refuzata: doar ce `resolveHref` face „#”", () => {
  for (const bun of ["/contact", "https://exemplu.ro", "http://x.ro", "mailto:a@b.ro", "tel:0722", "#sus", "contact", ""]) {
    assert.equal(schemaRefuzata(bun), null, bun);
  }
  for (const [rau, schema] of [["javascript:alert(1)", "javascript:"], ["JavaScript:void(0)", "javascript:"], ["data:text/html,x", "data:"], ["vbscript:x", "vbscript:"]]) {
    assert.equal(schemaRefuzata(rau), schema, rau);
    assert.equal(resolveHref(rau, "/m"), "#", "si magazinul il refuza");
  }
});

test("⚠⚠ dus-intors fara pierderi: ce se afiseaza si apoi se salveaza e EXACT linkul de dinainte", () => {
  const categorii = ["Termice și impermeabile", "Cafea & Ceai", "Lapte = viață", "100% bumbac", "Mobilă/Grădină", "Încălțăminte #1", "A+B", "Ce? Unde?"];
  for (const c of categorii) {
    const href = hrefCategorie("/magazin", c);
    assert.equal(linkDeSalvat(linkAfisat(href)), href, c);
  }
  assert.equal(linkAfisat(hrefCategorie("/magazin", "Termice și impermeabile")), "/magazin?cat=Termice și impermeabile");
  // Caracterele care schimba intelesul adresei raman codificate si in camp.
  assert.equal(linkAfisat(hrefCategorie("/magazin", "Cafea & Ceai")), "/magazin?cat=Cafea %26 Ceai");
  // Ce scrie omul cu diacritice se salveaza ca linkurile din sugestii.
  assert.equal(linkDeSalvat("/magazin?cat=Termice și impermeabile"), hrefCategorie("/magazin", "Termice și impermeabile"));
});

test("`tel:`, `mailto:` si un sir stricat raman neatinse", () => {
  assert.equal(linkAfisat("tel:+40%20722"), "tel:+40%20722");
  assert.equal(linkAfisat("mailto:a%40b.ro"), "mailto:a%40b.ro");
  assert.equal(linkAfisat("/x?cat=%E0%A4%A"), "/x?cat=%E0%A4%A");
  assert.equal(linkDeSalvat("mailto:ana maria@x.ro"), "mailto:ana maria@x.ro");
});

test("campul de link foloseste afisarea, salvarea si avertismentul", () => {
  const c = readFileSync("src/components/pages/editor/CampLink.tsx", "utf8");
  assert.match(c, /value=\{linkAfisat\(text\)\}/);
  assert.match(c, /onChange\(linkDeSalvat\(e\.target\.value\)\)/);
  assert.match(c, /const refuzata = schemaRefuzata\(text\);/);
  assert.match(c, /role="alert"/);
});
