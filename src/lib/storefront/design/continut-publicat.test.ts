import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Block } from "@/lib/pages/blocks.types";
import { adaugaContinut } from "./blocuri";
import { parseBlocuriLibere } from "./continut-liber";
import { blocDinMagazin } from "./continut-publicat";
import { buildClassicDesign } from "./defaults";
import { addSection, caleDinText, caleInText, schimbaBlocuriLaCale, schimbaBlocurile, toggleSection, updateSection } from "./edit";
import { parseStoreDesign } from "./parse";
import type { DesignContext, StoreDesign } from "./types";

/**
 * „Conținut liber” (etapa 9.2): ce ajunge in design (fara `raw`) si cum isi gasesc formularele
 * blocul pe server, numai in designul publicat si numai daca se vede in magazin.
 *
 * Rulare: `npm test`.
 */

const ctx = (pageContent: Record<string, unknown> = {}): DesignContext => ({ primaryColor: "#07c527", pageContent, features: {} });
const citit = (d: unknown, c = ctx()) => parseStoreDesign(JSON.parse(JSON.stringify(d)), c);
const contact = (id: string): Block => ({ id, type: "contact", title: "Scrie-ne", emailEnabled: true } as Block);
const RAD = process.cwd();
/** Fara comentarii: istoria scrisa in ele numeste dinadins ce se cauta. */
const cod = (f: string) => readFileSync(path.join(RAD, f), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── Codul personalizat ───────────────────────────────────────────────────────

test("⚠⚠ semnul `raw` nu intra in design, nici din coloane", () => {
  const curat = parseBlocuriLibere([
    { id: "h", type: "html", html: "<b>x</b>", raw: true, rawApprovedBy: "cineva" },
    { id: "col", type: "columns", items: [{ blocks: [{ id: "h2", type: "html", html: "y", raw: true, rawApprovedBy: "cineva" }] }] },
  ]);
  const h = curat[0] as unknown as Record<string, unknown>;
  assert.equal("raw" in h, false);
  assert.equal("rawApprovedBy" in h, false);
  assert.equal(h.html, "<b>x</b>", "restul blocului ramane; HTML-ul il curata randarea");
  const din = (curat[1] as Extract<Block, { type: "columns" }>).items![0].blocks![0] as unknown as Record<string, unknown>;
  assert.equal("raw" in din, false);
});

// ── Calea containerului ──────────────────────────────────────────────────────

test("calea in text: dus-intors, si nimic in afara caracterelor de id", () => {
  for (const cale of [{ sectiune: "s1", bloc: null }, { sectiune: "pagina_produs", bloc: "cl_ab-1" }]) {
    assert.deepEqual(caleDinText(caleInText(cale)), cale);
  }
  for (const rau of ["", "a/b/c", "a b", "../x", "a/", "/b", 7, null, undefined, "x".repeat(65)]) {
    assert.equal(caleDinText(rau), null, String(rau));
  }
});

// ── Unde se vede un formular ────────────────────────────────────────────────

/** Un design cu cate un continut pe pagina principala, sub produs si pe Pagina Magazin, fiecare cu un formular. */
function cuFormulare(variantMagazin = "sidebar"): { d: StoreDesign; acasa: string; sub: string; magazin: string } {
  let d = citit(buildClassicDesign(ctx()));
  d = addSection(d, "continut_liber");
  const acasa = d.home.find((s) => s.kind === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: acasa, bloc: null }, () => [contact("f_acasa")]);
  d = schimbaBlocurile(d, d.product.page.id, (l, s) => adaugaContinut(l, s, "continut_liber"));
  const sub = d.product.page.blocks!.find((b) => b.type === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: d.product.page.id, bloc: sub }, () => [{ id: "col", type: "columns", items: [{ blocks: [contact("f_produs")] }] } as Block]);
  d = updateSection(d, d.shop.page.id, { variant: variantMagazin, enabled: true });
  d = schimbaBlocurile(d, d.shop.page.id, (l, s) => adaugaContinut(l, s, "continut_jos"));
  const magazin = d.shop.page.blocks!.find((b) => b.type === "continut_jos")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: d.shop.page.id, bloc: magazin }, () => [contact("f_magazin")]);
  return { d: citit(d), acasa, sub, magazin };
}

test("⚠⚠ formularul se gaseste in toate trei locurile, cu locul lui in cuvinte (si din coloane)", () => {
  const { d, acasa, sub, magazin } = cuFormulare();
  assert.deepEqual(blocDinMagazin(d, {}, { sectiune: acasa, bloc: null }, "f_acasa")?.loc, "Pagina principală");
  assert.deepEqual(blocDinMagazin(d, {}, { sectiune: d.product.page.id, bloc: sub }, "f_produs")?.loc, "Pagina de produs");
  assert.deepEqual(blocDinMagazin(d, {}, { sectiune: d.shop.page.id, bloc: magazin }, "f_magazin")?.loc, "Pagina Magazin");
  assert.equal(blocDinMagazin(d, {}, { sectiune: acasa, bloc: null }, "f_acasa")?.bloc.type, "contact");
});

test("⚠⚠ ce nu se vede in magazin nu primeste mesaje", () => {
  const { d, acasa, sub, magazin } = cuFormulare();
  const laAcasa = { sectiune: acasa, bloc: null };
  // Bloc strain, cale gresita.
  assert.equal(blocDinMagazin(d, {}, laAcasa, "f_produs"), null, "blocul altui continut");
  assert.equal(blocDinMagazin(d, {}, { sectiune: acasa, bloc: "x" }, "f_acasa"), null);
  assert.equal(blocDinMagazin(d, {}, { sectiune: d.product.page.id, bloc: "titlu" }, "f_produs"), null, "o bucata fixa nu e continut");
  // Sectiunea stinsa.
  assert.equal(blocDinMagazin(toggleSection(d, acasa), {}, laAcasa, "f_acasa"), null);
  // Pagina principala nu e cea cu sectiuni.
  assert.equal(blocDinMagazin(d, { pagina_acasa: "11111111-1111-1111-1111-111111111111" }, laAcasa, "f_acasa"), null, "pagina proprie in locul ei");
  assert.equal(blocDinMagazin(d, { store_mode: "one_product", one_product_id: "p1" }, laAcasa, "f_acasa"), null, "un singur produs");
  // Continutul de sub produs ascuns.
  const subAscuns = schimbaBlocurile(d, d.product.page.id, (l) => l.map((b) => (b.id === sub ? { ...b, enabled: false } : b)));
  assert.equal(blocDinMagazin(subAscuns, {}, { sectiune: d.product.page.id, bloc: sub }, "f_produs"), null);
  // Pagina Magazin fara pagina ei.
  const fara = cuFormulare("none");
  assert.equal(blocDinMagazin(fara.d, {}, { sectiune: fara.d.shop.page.id, bloc: fara.magazin }, "f_magazin"), null);
  // ... dar cu o pagina proprie ca pagina principala, catalogul (deci si continutul) are pagina lui.
  assert.equal(
    blocDinMagazin(fara.d, { pagina_acasa: "11111111-1111-1111-1111-111111111111" }, { sectiune: fara.d.shop.page.id, bloc: fara.magazin }, "f_magazin")?.loc,
    "Pagina Magazin",
  );
});

test("pe sablonul de produs, locul spune si sablonul", () => {
  const { d, sub } = cuFormulare();
  const sablon = { nume: "Tablouri", page: { ...structuredClone(d.product.page), id: "sablon_tablouri" }, categorii: [], produse: [] };
  const cu = citit({ ...d, product: { ...d.product, sabloane: [sablon] } });
  assert.equal(blocDinMagazin(cu, {}, { sectiune: "sablon_tablouri", bloc: sub }, "f_produs")?.loc, "Pagina de produs (Tablouri)");
});

// ── Cusatura: actiunile si formularele, pe sursa ─────────────────────────────

const ACTIUNI = "src/lib/actions/page.actions.ts";

test("⚠⚠ serverul cauta blocul in designul PUBLICAT, niciodata in ciorna", () => {
  const s = cod(ACTIUNI);
  const inceput = s.indexOf("async function blocDinMagazinPublicat(");
  const corp = s.slice(inceput, s.indexOf("\n}\n", inceput));
  assert.match(corp, /\.select\("storefront_design, page_content"\)\.eq\("business_id", businessId\)/);
  assert.doesNotMatch(corp, /storefront_design_draft/);
  assert.match(corp, /return blocDinMagazin\(design, pc, cale, idBloc\);/);
});

test("⚠⚠ formularul de contact: fara pagina, blocul din magazin sau nimic; definitia din blocul gasit, nu din cerere", () => {
  const s = cod(ACTIUNI);
  const corp = s.slice(s.indexOf("export async function submitPageForm("), s.indexOf("export async function aboneazaNewsletter("));
  assert.match(corp, /if \(!input\.pageId && input\.cale !== undefined\) \{\s*const cale = caleDinText\(input\.cale\);\s*dinMagazin = cale && input\.blockId \? await blocDinMagazinPublicat\(admin, biz\.id, cale, input\.blockId\) : null;\s*if \(!dinMagazin\) return \{ error:/);
  assert.match(corp, /\} else if \(dinMagazin\) \{\s*const block = dinMagazin\.bloc;\s*if \(block\.type === "contact"\) definitie = campuriFormularSimplu\(block\);\s*if \(block\.type === "contact" && block\.emailEnabled === true\) emailEnabled = true;/);
  assert.match(corp, /\.\.\.\(dinMagazin \? \{ loc: dinMagazin\.loc \} : \{\}\)/);
});

test("⚠⚠ newsletterul: pagina publicata sau, fara ea, blocul din magazin", () => {
  const s = cod(ACTIUNI);
  const inceput = s.indexOf("export async function aboneazaNewsletter(");
  const corp = s.slice(inceput, s.indexOf("\n}\n", inceput));
  assert.match(corp, /\} else \{\s*const cale = caleDinText\(input\.cale\);\s*const gasit = cale \? await blocDinMagazinPublicat\(admin, biz\.id, cale, input\.blockId\) : null;/);
  assert.match(corp, /if \(!block \|\| block\.type !== "newsletter"\) return \{ error:/);
  assert.match(corp, /page_id: input\.pageId \?\? null/);
});

test("componentele trimit calea containerului; randarea o da amandurora", () => {
  const randare = cod("src/components/pages/BlockRenderer.tsx");
  // Pe rand, nu pana la primul „>”: atributele contin `=>`.
  assert.match(randare, /<ContactFormBlockView [^\n]*caleDesign=\{ctx\.caleDesign\}/);
  assert.match(randare, /<NewsletterBlockView [^\n]*caleDesign=\{ctx\.caleDesign\}/);
  assert.match(cod("src/components/pages/blocks/ContactFormBlock.tsx"), /\.\.\.\(caleDesign !== undefined \? \{ cale: caleDesign \} : \{\}\)/);
  const nl = cod("src/components/pages/blocks/NewsletterBlock.tsx");
  assert.match(nl, /if \(disabled \|\| \(!pageId && caleDesign === undefined\)\) return;/);
  assert.match(nl, /\.\.\.\(caleDesign !== undefined \? \{ cale: caleDesign \} : \{\}\)/);
  // „Mesaje” arata locul cand trimiterea n-are pagina.
  assert.match(cod("src/app/(dashboard)/dashboard/pages/messages/page.tsx"), /s\.page_id \? titluPagina\.get\(s\.page_id\) : typeof d\?\.loc === "string" \? d\.loc : undefined/);
});
