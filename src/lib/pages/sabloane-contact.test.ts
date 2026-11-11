import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flattenBlocks } from "./block-tree";
import { blocuriSablon, htmlContact } from "./sabloane";

/* Etapa 25.13 (11.11.2026): sablonul „Contact” scrie telefonul si emailul MAGAZINULUI, nu „07xx” si „contact@magazin.ro”. */

test("cu datele magazinului, pagina noua le are pe ale lui", () => {
  const blocuri = flattenBlocks(blocuriSablon("contact", "Contact", { telefon: "0722 123 456", email: "ana@floraria.ro" }));
  const text = blocuri.find((b) => b.type === "text") as { html: string } | undefined;
  assert.ok(text);
  assert.match(text.html, /0722 123 456/);
  assert.match(text.html, /ana@floraria\.ro/);
  assert.doesNotMatch(text.html, /07xx|contact@magazin\.ro/);
});

test("un camp lipsa ramane de completat, cu exemplul vechi; restul e al magazinului", () => {
  assert.match(htmlContact({ telefon: "0722 123 456", email: "  " }), /0722 123 456[\s\S]*contact@magazin\.ro/);
  assert.match(htmlContact(), /07xx xxx xxx[\s\S]*contact@magazin\.ro/);
});

test("datele se scapa: nimic din ele nu ajunge HTML", () => {
  const h = htmlContact({ telefon: "<img src=x onerror=alert(1)>", email: "a\"b@c.ro" });
  assert.doesNotMatch(h, /<img/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h, /a&quot;b@c\.ro/);
});

test("actiunea de creare le citeste de la magazinul LUI, doar pentru sablonul „Contact”", () => {
  const s = readFileSync("src/lib/actions/page.actions.ts", "utf8");
  assert.match(s, /sablon === "contact"\s*\? await supabase\.from\("businesses"\)\.select\("phone, email"\)\.eq\("id", input\.businessId\)\.maybeSingle\(\)/);
  assert.match(s, /blocuriSablon\(sablon, title, \{ telefon: contactMagazin\?\.phone, email: contactMagazin\?\.email \}\)/);
  // Proprietarul e verificat inainte (`getUserAndBusiness`), deci id-ul e al lui.
  assert.ok(s.indexOf("const ctx = await getUserAndBusiness(supabase, input.businessId);") < s.indexOf('sablon === "contact"'));
});
