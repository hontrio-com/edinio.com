import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { atingeCheiPc } from "@/lib/storefront/design/continut-ciorna";
import type { UrmaDateDemo } from "./import-demo";
import { categoriiDemoDeSters, continutFaraDateleDemo, type CategorieMagazin } from "./stergere-demo";

/*
 * Etapa 18.4: „Șterge datele demo” scoate doar ce a adaugat importul (dupa urma lui). Ce a adaugat sau a schimbat
 * omul ramane al lui.
 */

const urma = (o: Partial<UrmaDateDemo> = {}): UrmaDateDemo => ({ tema: "jupiter", categorii: [], bannere: [], randuri: [], la: "2026-10-29T10:00:00Z", ...o });

test("bannerele: ies doar cele din urma, fiecare cu linkul lui; ale lui raman in ordine, cu linkurile lor", () => {
  const pc = { hero_banners: ["a.jpg", "d1.jpg", "b.jpg", "d2.jpg"], hero_banner_links: ["/contact", "/magazin?cat=X", "/despre", "/magazin?cat=Y"] };
  const c = continutFaraDateleDemo(pc, urma({ bannere: ["d1.jpg", "d2.jpg"] }));
  assert.deepEqual(c.pc.hero_banners, ["a.jpg", "b.jpg"]);
  assert.deepEqual(c.pc.hero_banner_links, ["/contact", "/despre"], "linkul lui nu se muta pe alt banner");
  // Lista de linkuri mai scurta decat cea de imagini (ca inainte de import): perechea lipsa e goala.
  const scurt = continutFaraDateleDemo({ hero_banners: ["d1.jpg", "a.jpg"], hero_banner_links: ["/x"] }, urma({ bannere: ["d1.jpg"] }));
  assert.deepEqual(scurt.pc, { hero_banners: ["a.jpg"], hero_banner_links: [""] });
});

test("randurile: ies cele din urma, dupa id; ale lui raman neatinse", () => {
  const alLui = { id: "r1", title: "Noutăți", enabled: true };
  const pc = { product_sections: [alLui, { id: "demo-jupiter-oferte" }, { id: "r2" }] };
  const c = continutFaraDateleDemo(pc, urma({ randuri: ["demo-jupiter-oferte"] }));
  assert.deepEqual(c.pc.product_sections, [alLui, { id: "r2" }]);
  assert.equal((c.pc.product_sections as unknown[])[0], alLui, "acelasi obiect");
});

test("fara nimic de scos (de pilda dupa „Pune la loc”): nicio cheie, deci nimic de publicat pentru ele", () => {
  const c = continutFaraDateleDemo({ hero_banners: ["a.jpg"], product_sections: [{ id: "r1" }] }, urma({ bannere: ["d1.jpg"], randuri: ["demo-jupiter-oferte"] }));
  assert.deepEqual(c, { pc: {}, magazin: {} });
  assert.equal(atingeCheiPc(c), false);
  assert.deepEqual(continutFaraDateleDemo({}, urma({ bannere: ["d1.jpg"] })).pc, {});
});

const cat = (id: string, name: string, parent_id: string | null = null): CategorieMagazin => ({ id, name, parent_id });

test("categoriile: cele create de import, ramase goale, ies cu tot cu copiii lor creati de import", () => {
  const lista = [cat("P", "Grădină"), cat("C1", "Ghivece", "P"), cat("C2", "Unelte", "P")];
  assert.deepEqual(categoriiDemoDeSters(urma({ categorii: ["P", "C1", "C2"] }), lista, new Set()), ["P", "C1", "C2"]);
});

test("⚠⚠ o categorie cu un produs de-al lui ramane, si odata cu ea parintele ei (`on delete cascade`)", () => {
  const lista = [cat("P", "Grădină"), cat("C1", "Ghivece", "P"), cat("C2", "Unelte", "P")];
  assert.deepEqual(categoriiDemoDeSters(urma({ categorii: ["P", "C1", "C2"] }), lista, new Set(["Ghivece"])), ["C2"]);
});

test("⚠⚠ un parinte creat de import, cu o subcategorie pusa de el sub el, ramane: altfel cascada i-ar fi sters-o", () => {
  const lista = [cat("P", "Grădină"), cat("C1", "Ghivece", "P"), cat("H", "Ale mele", "P")];
  assert.deepEqual(categoriiDemoDeSters(urma({ categorii: ["P", "C1"] }), lista, new Set()), ["C1"]);
});

test("pe mai multe niveluri, un nepot pastrat isi pastreaza toti stramosii; ale lui si id-urile disparute nu se ating", () => {
  const lista = [cat("P", "A"), cat("C", "B", "P"), cat("G", "C", "C"), cat("L", "Al lui")];
  assert.deepEqual(categoriiDemoDeSters(urma({ categorii: ["P", "C", "G", "disparut"] }), lista, new Set(["C"])), []);
  assert.deepEqual(categoriiDemoDeSters(urma({ categorii: ["P", "C", "G"] }), lista, new Set()), ["P", "C", "G"]);
  assert.ok(!categoriiDemoDeSters(urma({ categorii: ["P", "C", "G"] }), lista, new Set()).includes("L"), "a lui, chiar goala, nu");
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function functia(s: string, nume: string): string {
  const i = s.indexOf(`function ${nume}(`);
  assert.ok(i >= 0, `lipseste ${nume}`);
  return s.slice(i, s.indexOf("\n}\n", i) + 2);
}

test("⚠⚠ actiunea: proprietarul, nu peste o ciorna, apoi „Publică”, produsele, categoriile, si urma LA URMA", () => {
  const f = functia(cod("src/lib/actions/store-design.actions.ts"), "stergeDateleDemo");
  const ordine = [
    "const owned = await loadOwnedStore(businessId);",
    "if (row?.storefront_design_draft) {",
    "const publicat = await publishDesign(owned.businessId, ciornaCuContinut(fara.design, continut));",
    "await bulkProductAction(owned.businessId, iduri, { kind: \"delete\" });",
    "await stergeCategoriileDemo(owned.businessId, urma);",
    "await scrieCheiaTemei(owned.businessId, CHEIE_DATE_DEMO, null, \"stergeDateleDemo.urma\");",
  ].map((x) => f.indexOf(x));
  assert.ok(ordine.every((x, i) => x > 0 && (i === 0 || x > ordine[i - 1])), `ordinea: ${ordine.join(", ")}`);
  // Doar produsele demo ale magazinului lui; publicarea, doar cand e ceva de scos.
  assert.match(f, /\.from\("products"\)\s*\.select\("id"\)\s*\.eq\("business_id", owned\.businessId\)\s*\.eq\("source", SURSA_DEMO\);/);
  assert.match(f, /if \(atingeCheiPc\(continut\) \|\| fara\.schimbat\) \{/);
  assert.match(f, /if \(!urma && iduri\.length === 0\) return \{ error: "Nu sunt date demo de șters\." \};/);
  assert.match(f, /revalidatePath\("\/dashboard\/editor\/teme"\);/);
});

test("⚠ categoriile: id-uri adevarate in filtru, un produs intrebat pe fiecare nume (nu o lista taiata la 1000)", () => {
  const f = functia(cod("src/lib/actions/store-design.actions.ts"), "stergeCategoriileDemo");
  const garda = f.indexOf("urma.categorii.filter(esteUuid)");
  const filtrul = f.indexOf(".or(`id.in.(${lista}),parent_id.in.(${lista})`)");
  assert.ok(garda > 0 && filtrul > garda, "id-urile din `page_content` trec prin `esteUuid` inainte de filtru");
  assert.match(f, /\.eq\("business_id", businessId\)\.eq\("category", n\)\.limit\(1\)/);
  const alegerea = f.indexOf("categoriiDemoDeSters(urma, categorii ?? [], cuProduse)");
  const stergerea = f.indexOf(".delete()");
  assert.ok(alegerea > 0 && stergerea > alegerea);
  assert.match(f, /\.from\("categories"\)\.delete\(\)\.eq\("business_id", businessId\)\.in\("id", deSters\)/);
});
