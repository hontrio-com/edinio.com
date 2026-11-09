import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Block } from "@/lib/pages/blocks.types";
import { schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { addSection, blocuriLaCale, schimbaBlocuriLaCale } from "@/lib/storefront/design/edit";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { actiuneaDeSub } from "@/lib/storefront/design/preview-protocol";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { actiuniMeniu, aplicaPeDesign, operatiaPeBlocuri, tintaDinId, type CheieActiune } from "./meniu-contextual";

/**
 * Meniul de clic dreapta din previzualizarea editorului (cerut de el, 08.11.2026): ce intrari are fiecare element si
 * ca fiecare intrare activa chiar face ce scrie.
 *
 * Rulare: `npm test`.
 */

const ctxDesign = (): DesignContext => ({ primaryColor: "#07c527", pageContent: {}, features: {} });
const citit = (d: unknown) => parseStoreDesign(JSON.parse(JSON.stringify(d)), ctxDesign());
const text = (id: string): Block => ({ id, type: "text", html: "<p>Text</p>" } as Block);
const chei = (l: { cheie: string; dezactivata?: true }[]) => l.map((a) => (a.dezactivata ? `(${a.cheie})` : a.cheie));

function acasaCuContinut(blocuri: Block[]): { d: StoreDesign; cl: string } {
  let d = addSection(citit(buildClassicDesign(ctxDesign())), "continut_liber");
  const cl = d.home.find((s) => s.kind === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: cl, bloc: null }, () => blocuri);
  return { d: citit(d), cl };
}

test("sectiunea de pe Acasa: Editeaza, sagetile (stinse la capat), Duplica cand se poate, Ascunde, Sterge", () => {
  const { d } = acasaCuContinut([text("a")]);
  const prima = d.home[0];
  const tinta = tintaDinId(d, prima.id, true);
  assert.deepEqual(tinta, { fel: "sectiune", id: prima.id });
  const l = chei(actiuniMeniu(d, tinta!, null));
  assert.equal(l[0], "editeaza");
  assert.ok(l.includes("(sus)"), "prima sectiune: „Mută mai sus” stinsa");
  assert.ok(l.includes("jos"));
  // Ochiul spune ce face ACUM: „Arată” pe o sectiune ascunsa, „Ascunde” pe una aprinsa.
  assert.ok(l.includes(prima.enabled ? "ascunde" : "arata"));
  // Fiecare intrare activa schimba designul; cele stinse nu.
  for (const a of actiuniMeniu(d, tinta!, null)) {
    if (a.cheie === "editeaza") continue;
    const dupa = aplicaPeDesign(d, tinta!, a.cheie);
    assert.equal(dupa !== d, !a.dezactivata, a.cheie);
  }
});

test("Sterge din meniu scoate sectiunea si o tine scoasa la recitire", () => {
  const { d, cl } = acasaCuContinut([text("a")]);
  const tinta = tintaDinId(d, cl, true)!;
  assert.ok(chei(actiuniMeniu(d, tinta, null)).includes("sterge"));
  const dupa = citit(aplicaPeDesign(d, tinta, "sterge"));
  assert.ok(!dupa.home.some((s) => s.id === cl));
});

test("fara lista de pe Acasa (magazin cu un singur produs) sectiunile doar se deschid", () => {
  const { d, cl } = acasaCuContinut([text("a")]);
  const tinta = tintaDinId(d, cl, false)!;
  assert.equal(tinta.fel, "fixa");
  assert.deepEqual(chei(actiuniMeniu(d, tinta, null)), ["editeaza"]);
});

test("antetul si subsolul: doar Editeaza; bara de anunt: Editeaza si ochiul", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  assert.deepEqual(chei(actiuniMeniu(d, tintaDinId(d, d.chrome.header.id, true)!, null)), ["editeaza"]);
  assert.deepEqual(chei(actiuniMeniu(d, tintaDinId(d, d.chrome.footer.id, true)!, null)), ["editeaza"]);
  if (d.chrome.announcement) {
    const t = tintaDinId(d, d.chrome.announcement.id, true)!;
    assert.equal(t.fel, "anunt");
    const l = chei(actiuniMeniu(d, t, null));
    assert.equal(l.length, 2);
    assert.ok(aplicaPeDesign(d, t, l[1] as CheieActiune) !== d);
  }
});

test("blocurile paginii de produs: sagetile in zona lor, fara Sterge pe bucatile fixe, fara ochi pe cele obligatorii", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  const pagina = d.product.page;
  const schema = schemaBlocurilor(pagina.kind, pagina.variant)!;
  for (const b of pagina.blocks ?? []) {
    const t = tintaDinId(d, `${pagina.id}/${b.id}`, true)!;
    assert.deepEqual(t, { fel: "bloc", sectiune: pagina.id, bloc: b.id });
    const l = chei(actiuniMeniu(d, t, null));
    assert.ok(!l.includes("sterge"), `${b.type}: o bucata fixa nu se sterge`);
    if (schema.tipuri[b.type].obligatoriu) assert.ok(!l.includes("ascunde") && !l.includes("arata"), `${b.type}: obligatoriu`);
  }
});

test("coloanele subsolului: Duplica si Sterge chiar le pun si le scot", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  const subsol = d.chrome.footer;
  const coloana = (subsol.blocks ?? []).find((b) => schemaBlocurilor(subsol.kind, subsol.variant)?.tipuri[b.type]?.coloana);
  if (!coloana) return;
  const t = tintaDinId(d, `${subsol.id}/${coloana.id}`, true)!;
  const l = chei(actiuniMeniu(d, t, null));
  assert.ok(l.includes("sterge"));
  const dupa = aplicaPeDesign(d, t, "sterge");
  assert.ok(!dupa.chrome.footer.blocks?.some((b) => b.id === coloana.id));
});

test("„Conținut liber”: blocul se muta, se duplica, se sterge; ULTIMUL bloc sterge tot containerul", () => {
  const { d, cl } = acasaCuContinut([text("a"), text("b")]);
  const t = tintaDinId(d, `${cl}/a`, true)!;
  assert.deepEqual(t, { fel: "liber", cale: { sectiune: cl, bloc: null }, bloc: "a" });
  assert.deepEqual(chei(actiuniMeniu(d, t, null)), ["editeaza", "(sus)", "jos", "duplica", "sterge"]);
  const faraA = aplicaPeDesign(d, t, "sterge");
  assert.deepEqual(blocuriLaCale(faraA, { sectiune: cl, bloc: null })!.map((b) => b.id), ["b"]);
  // Al doilea pas: ramasese un singur bloc, deci pleaca sectiunea, nu ramane un container gol in pagina.
  const faraB = aplicaPeDesign(faraA, tintaDinId(faraA, `${cl}/b`, true)!, "sterge");
  assert.ok(!faraB.home.some((s) => s.id === cl));
});

test("⚠ „Conținut liber” cu un singur bloc Coloane: Sterge pe un bloc DIN coloana scoate doar blocul, nu tot continutul", () => {
  /*
   * Gasit la recitirea din 09.11: regula „ultimul bloc sterge containerul” numara doar primul nivel. Coloanele isi
   * marcheaza si ele blocurile (acelasi `marcheazaBloc`), deci clicul dreapta pe un text dintr-o coloana trimite id-ul
   * textului; cu Coloanele singure pe primul nivel, „Șterge” scotea toata sectiunea, cu tot ce era in ea.
   */
  const coloane = { id: "col", type: "columns", count: 2, items: [{ blocks: [text("n1"), text("n2")] }, { blocks: [text("n3")] }] } as unknown as Block;
  const { d, cl } = acasaCuContinut([coloane]);
  const t = tintaDinId(d, `${cl}/n1`, true)!;
  assert.deepEqual(t, { fel: "liber", cale: { sectiune: cl, bloc: null }, bloc: "n1" });
  assert.ok(chei(actiuniMeniu(d, t, null)).includes("sterge"));
  const faraN1 = citit(aplicaPeDesign(d, t, "sterge"));
  assert.ok(faraN1.home.some((s) => s.id === cl), "sectiunea ramane");
  const coloaneDupa = (l: StoreDesign) => blocuriLaCale(l, { sectiune: cl, bloc: null })!;
  assert.deepEqual(coloaneDupa(faraN1).map((b) => b.id), ["col"]);
  const celule = (l: StoreDesign) => ((coloaneDupa(l)[0] as unknown as { items: { blocks: Block[] }[] }).items).map((it) => it.blocks.map((b) => b.id));
  assert.deepEqual(celule(faraN1), [["n2"], ["n3"]]);
  // Si singurul bloc dintr-o coloana pleaca singur (coloana ramane goala, ca in arbore), nu cu tot continutul.
  const faraN3 = citit(aplicaPeDesign(faraN1, tintaDinId(faraN1, `${cl}/n3`, true)!, "sterge"));
  assert.ok(faraN3.home.some((s) => s.id === cl), "sectiunea ramane si dupa ultimul bloc al unei coloane");
  assert.deepEqual(celule(faraN3), [["n2"], []]);
  // Coloanele insele, singure pe primul nivel: regula ramane, pleaca tot containerul (altfel ramanea un loc gol).
  assert.ok(!aplicaPeDesign(d, tintaDinId(d, `${cl}/col`, true)!, "sterge").home.some((s) => s.id === cl));
});

test("blocurile paginii proprii: pe lista paginii deschise, cu operatiile din `block-tree`", () => {
  const { d } = acasaCuContinut([text("a")]);
  const blocuri = [text("x"), text("y")];
  const t = tintaDinId(d, "pagina:pg/y", true)!;
  assert.deepEqual(t, { fel: "pagina", bloc: "y" });
  assert.deepEqual(chei(actiuniMeniu(d, t, blocuri)), ["editeaza", "sus", "(jos)", "duplica", "sterge"]);
  assert.deepEqual(operatiaPeBlocuri("sterge", "y")!(blocuri).map((b) => b.id), ["x"]);
  // Pagina inca neincarcata: doar Editeaza (sagetile stinse), nimic de facut orbeste.
  assert.ok(actiuniMeniu(d, t, null).every((a) => a.cheie === "editeaza" || a.dezactivata));
  // Continutul paginii (fara bloc) nu are meniu.
  assert.equal(tintaDinId(d, "pagina:pg", true), null);
});

test("un id necunoscut nu are meniu", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  assert.equal(tintaDinId(d, "nu-exista", true), null);
});

test("previzualizarea: intrarea stinsa nu se alege; meniul se deschide pe clic dreapta, alegerea trece prin editor", () => {
  const buton = (attrs: Record<string, string>) => ({ closest: () => ({ getAttribute: (n: string) => attrs[n] ?? null }) });
  assert.deepEqual(actiuneaDeSub(buton({ "data-st-actiune": "sterge", "data-st-actiune-id": "s1" })), { id: "s1", cheie: "sterge" });
  assert.equal(actiuneaDeSub(buton({ "data-st-actiune": "sus", "data-st-actiune-id": "s1", "aria-disabled": "true" })), null);
  assert.equal(actiuneaDeSub({ closest: () => null }), null);
  const contur = readFileSync(path.join("src", "components", "storefront", "ConturEditor.tsx"), "utf8");
  assert.match(contur, /addEventListener\("contextmenu"/);
  const editor = readFileSync(path.join("src", "components", "editor-magazin", "EditorMagazin.tsx"), "utf8");
  // Actiunea venita din cadru se verifica pe lista elementului de acum, nu se crede.
  assert.match(editor, /tip === "actiune"[\s\S]{0,600}actiuniMeniu\(design, tinta, blocuriPaginii\)\.some/);
});
