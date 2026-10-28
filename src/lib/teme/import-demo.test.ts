import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { DATE_DEMO_JUPITER } from "./jupiter/date-demo";
import { bannereDupaImport, categoriiDeCreat, externalIdDemo, idRandDemo, randuriDupaImport, sluguriUnice, urmaDupaImport } from "./import-demo";
import type { SetDateDemo } from "./tipuri";

/*
 * Etapa 16.1: setul de date al temei Jupiter si importul lui. Raspunsul lui: „Adaugă, marcate demo”, deci nimic din
 * ce are magazinul nu se sterge si nu se suprascrie.
 */

const D = DATE_DEMO_JUPITER;
const toateCategoriile = D.categorii.flatMap((c) => [c.nume, ...c.copii]);

test("setul Jupiter: fiecare produs, banner, card si placa duce la o categorie care exista", () => {
  const nume = new Set(toateCategoriile);
  for (const p of D.produse) assert.ok(nume.has(p.categorie), `${p.cheie}: ${p.categorie}`);
  for (const x of [...D.bannere, ...D.carduri, ...D.placi]) assert.ok(nume.has(x.categorie), x.categorie);
});

test("setul Jupiter: chei, nume si categorii unice, preturi cu sens, poze doar de pe Unsplash", () => {
  assert.equal(new Set(D.produse.map((p) => p.cheie)).size, D.produse.length, "chei unice");
  assert.equal(new Set(D.produse.map((p) => p.nume)).size, D.produse.length, "nume unice");
  assert.equal(new Set(toateCategoriile.map((n) => n.toLowerCase())).size, toateCategoriile.length, "categorii unice");
  for (const p of D.produse) {
    assert.ok(p.pret > 0, p.cheie);
    if (p.pretVechi !== undefined) assert.ok(p.pretVechi > p.pret, `${p.cheie}: reducerea e reala`);
    assert.match(p.imagine, /^https:\/\/images\.unsplash\.com\/photo-\d+-[0-9a-f]+\?/, p.cheie);
    assert.ok(p.descriere.length > 20, p.cheie);
  }
  const poze = [...D.categorii.map((c) => c.imagine), ...D.bannere, ...D.carduri, ...D.placi].map((x) => (typeof x === "string" ? x : x.imagine));
  for (const u of poze) assert.match(u, /^https:\/\/images\.unsplash\.com\//);
  assert.ok(D.produse.length >= 48 && D.categorii.length === 12);
});

test("⚠ nimic de la Dedeman in setul demo: nici numele, nici adresele lor (comentariul spune doar de unde e inspiratia)", () => {
  assert.doesNotMatch(cod("src/lib/teme/jupiter/date-demo.ts"), /dedeman/i);
});

test("categoriile: se creeaza doar cele care lipsesc, intai primul nivel, si una de-a lui cu acelasi nume se refoloseste", () => {
  const date: SetDateDemo = { ...D, categorii: [{ nume: "Grădină", imagine: "i", copii: ["Unelte de grădină", "Ghivece"] }, { nume: "Mobilă", imagine: "j", copii: ["Mese"] }] };
  const plan = categoriiDeCreat(["  grădină ", "Mese"], date);
  assert.deepEqual(plan, [
    { nume: "Mobilă", parinte: null, imagine: "j" },
    { nume: "Unelte de grădină", parinte: "Grădină", imagine: D.produse.find((p) => p.categorie === "Unelte de grădină")!.imagine },
    { nume: "Ghivece", parinte: "Grădină", imagine: null },
  ]);
  assert.equal(categoriiDeCreat(toateCategoriile, D).length, 0, "importul repetat nu mai creeaza nimic");
});

test("slugurile: ca la produsele adaugate de mana, baza si apoi -2, -3, fata de cele ocupate si intre ele", () => {
  assert.deepEqual(sluguriUnice(["Ciocan cu gheară", "Ciocan cu gheară", "Bec LED"], ["ciocan-cu-gheara"]), ["ciocan-cu-gheara-2", "ciocan-cu-gheara-3", "bec-led"]);
});

test("bannerele: ale lui raman primele si neatinse, cele demo se adauga o singura data, cu linkurile in pereche", () => {
  const pc = { hero_banners: ["a.jpg", "b.jpg"], hero_banner_links: ["/contact"] };
  const r = bannereDupaImport(pc, D, "/magazin");
  assert.deepEqual(r.imagini.slice(0, 2), ["a.jpg", "b.jpg"]);
  assert.deepEqual(r.linkuri.slice(0, 2), ["/contact", ""], "linkul lipsa al lui ramane gol, nu se muta");
  assert.equal(r.imagini.length, 2 + D.bannere.length);
  assert.equal(r.linkuri.length, r.imagini.length);
  assert.match(r.linkuri[2], /^\/magazin\?cat=/);
  const iar = bannereDupaImport({ hero_banners: r.imagini, hero_banner_links: r.linkuri }, D, "/magazin");
  assert.equal(iar.adaugate.length, 0, "importul repetat nu dubleaza bannerele");
});

test("urma: se aduna peste cea de dinainte, fara dubluri, iar codul produsului e „<tema>:<cheie>”", () => {
  const u = urmaDupaImport({ tema: "jupiter", categorii: ["c1"], bannere: ["x"] }, "jupiter", ["c1", "c2"], ["y"], ["r1"], "2026-10-28T20:00:00Z");
  assert.deepEqual(u, { tema: "jupiter", categorii: ["c1", "c2"], bannere: ["x", "y"], randuri: ["r1"], la: "2026-10-28T20:00:00Z" });
  assert.equal(externalIdDemo("jupiter", "roaba-85l"), "jupiter:roaba-85l");
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("⚠ importul nu trimite nimic spre marketplace-uri si nu sterge nimic", () => {
  const c = cod("src/lib/teme/import-demo.ts");
  assert.doesNotMatch(c, /enqueue|Sync\(|\.delete\(|\.upsert\(/);
  assert.match(c, /source: SURSA_DEMO,\s*external_id: externalIdDemo\(tema, p\.cheie\),/);
  assert.match(c, /await proiecteazaImediat\(businessId\);/);
});

test("randurile: produsele lor exista in set, iar ale lui raman primele si neatinse", () => {
  const chei = new Set(D.produse.map((p) => p.cheie));
  for (const r of D.randuri) for (const k of r.produse) assert.ok(chei.has(k), `${r.cheie}: ${k}`);

  const idDupaCheie = new Map(D.produse.map((p, i) => [p.cheie, `id${i}`]));
  const alLui = { id: "r_lui", title: "Noutăți", enabled: true, mode: "category", category: "X" };
  const r = randuriDupaImport({ product_sections: [alLui] }, D, "jupiter", idDupaCheie);
  assert.equal(r.randuri[0], alLui, "randul lui, acelasi obiect, primul");
  assert.deepEqual(r.adaugate, D.randuri.map((x) => idRandDemo("jupiter", x.cheie)));
  const oferte = r.randuri[1] as { mode: string; productIds: string[]; layout: string };
  assert.equal(oferte.mode, "selected");
  assert.equal(oferte.layout, "carousel");
  assert.equal(oferte.productIds.length, D.randuri[0].produse.length);
  for (const id of r.adaugate) assert.ok(id.length <= 64, "incape in legatura din design");

  const iar = randuriDupaImport({ product_sections: r.randuri }, D, "jupiter", idDupaCheie);
  assert.equal(iar.adaugate.length, 0, "importul repetat nu dubleaza randurile");
  assert.equal(randuriDupaImport({}, D, "jupiter", new Map()).adaugate.length, 0, "fara produse gasite, niciun rand gol");
});
