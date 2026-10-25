import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * PAGINILE PROPRII IN EDITORUL UNIC, partea din magazin (etapa 5.2 din `docs/editor-magazin/PLAN.md`).
 *
 * Ruta si componentele nu se pot randa intr-o proba de Node, deci regulile se probeaza pe sursa.
 *
 * Rulare: `npm test`.
 */

const fara = (s: string) => s.replace(/\r\n/g, "\n").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const sursa = (f: string) => fara(readFileSync(f, "utf8"));

const RUTA = "src/app/(public)/[slug]/[pageSlug]/page.tsx";
const VIE = "src/components/pages/PaginaVie.tsx";
const RENDERER = "src/components/pages/BlockRenderer.tsx";

test("⚠⚠ modul editor cere proprietarul SI semnele de editor; altfel pagina e cea de dinainte", () => {
  const s = sursa(RUTA);
  assert.match(s, /const esteEditorDesign = esteEditorDeDesign\(semneDeEditor\(await searchParams\), isOwner\);/);
  assert.match(s, /<StorePageShell chrome=\{chrome\} design=\{resolved\.design\} esteEditorDesign=\{esteEditorDesign\}/);
  // Blocurile vii doar in editor; publicul primeste blocurile randate pe server, ca inainte.
  assert.match(s, /\{esteEditorDesign \? \(\s*<PaginaVie[\s\S]*?\{blocuriServer\}\s*<\/PaginaVie>\s*\) : blocuriServer\}/);
  // CSS-ul salvat nu se bate cu cel scris in editor.
  assert.match(s, /\{pageCss && !esteEditorDesign \? <style/);
  // Antetul si subsolul din ciorna, doar in editor (`ciornaDeRandat` cere semnul), cu continutul ei (etapa 6).
  assert.match(s, /const ciorna = await ciornaDeRandat\(createAdminClient\(\), business\.id, esteEditorDesign\);/);
  assert.match(s, /resolveDesign\(ciorna\.ciorna \?\? storeSettings\?\.storefront_design, \{/);
});

test("⚠ pagina aleasa ca pagina principala trimite la radacina, dar NU in editor", () => {
  const s = sursa(RUTA);
  // In editor redirectarea ar fi pierdut semnele de editor si previzualizarea s-ar fi rupt.
  assert.match(s, /if \(page\.is_published && citestePaginaAcasa\(pageContent\) === page\.id && !esteEditorDesign\) \{\s*permanentRedirect/);
});

test("⚠⚠ `PaginaVie` asculta doar mesajele ei: aceeasi origine, felul `pagina`, aceeasi pagina", () => {
  const s = sursa(VIE);
  assert.match(s, /e\.origin !== window\.location\.origin \|\| !isPreviewMessage\(e\.data\)/);
  assert.match(s, /mesaj\[PREVIEW_MESSAGE\] !== "pagina" \|\| mesaj\.id !== pageId/);
  // Formularele si newsletterul nu trimit nimic din previzualizare.
  assert.match(s, /preview: true/);
  // Marcajele: continutul si fiecare bloc, cu id-urile din protocol.
  assert.match(s, /\[SECTION_ATTR\]: sectiune/);
  assert.match(s, /\[BLOC_ATTR\]: idBloc\(sectiune, b\.id\)/);
  assert.match(s, /const sectiune = cheiaPaginiiProprii\(pageId\);/);
});

test("invelisul blocurilor e optional: fara el, `BlockRenderer` randeaza exact ca inainte", () => {
  const s = sursa(RENDERER);
  assert.match(s, /ctx\.marcheazaBloc\s*\?\s*<Fragment key=\{block\.id\}>\{ctx\.marcheazaBloc\(block, <BlockOne block=\{block\} ctx=\{ctx\} \/>\)\}<\/Fragment>\s*:\s*<BlockOne key=\{block\.id\} block=\{block\} ctx=\{ctx\} \/>/);
  // Pagina publica nu-l da niciodata.
  assert.doesNotMatch(sursa("src/components/pages/BlocuriPagina.tsx"), /marcheazaBloc/);
});

test("⚠⚠ o animatie aleasa sau reluata in editor remonteaza blocul, altfel el ramane ascuns", async () => {
  /*
   * Scriptul paginii (`pornesteAnimatiile`) porneste doar blocurile NOI. Un bloc vechi caruia i se
   * alege o animatie primea `data-anim` fara `data-anim-in` si ramanea la `opacity: 0`.
   */
  const { cheieAnimatie } = await import("./animatii");
  const b = { id: "b1", type: "heading", text: "T" } as never as Parameters<typeof cheieAnimatie>[0];
  assert.equal(cheieAnimatie(b, 0), "b1", "fara animatie, cheia e id-ul: blocul nu se remonteaza la fiecare litera");
  const cu = (style: Record<string, unknown>, reluare = 0) => cheieAnimatie({ ...b, style } as never, reluare);
  const chei = [cu({ anim: "fade" }), cu({ anim: "zoom-in" }), cu({ anim: "fade", animSpeed: "slow" }), cu({ anim: "fade", animDelay: 300 }), cu({ anim: "fade" }, 1)];
  assert.equal(new Set(["b1", ...chei]).size, 6, "fiecare schimbare a animatiei (si fiecare reluare) da alta cheie");
  assert.equal(cu({ anim: "none" }), "b1");
  // Previzualizarea foloseste cheia pe fiecare bloc (si pe cele din coloane: `marcheazaBloc` e in ctx).
  assert.match(sursa(VIE), /<div key=\{cheieAnimatie\(b, viu\?\.reluari\[b\.id\] \?\? 0\)\}/);
  // In editor scriptul animatiilor e mereu in pagina: blocurile pot primi animatii oricand.
  assert.match(sursa(RUTA), /\{\(areAnimatii \|\| esteEditorDesign\) && <script dangerouslySetInnerHTML=\{\{ __html: SCRIPT_ANIMATII \}\} \/>\}/);
  // „Redă animația” din panoul blocului ajunge in previzualizare.
  assert.match(sursa("src/components/editor-magazin/PanouriPagina.tsx"), /<RedaAnimatia\.Provider value=\{onRedaAnimatia\}>/);
  assert.match(sursa("src/components/editor-magazin/EditorMagazin.tsx"), /\[PREVIEW_MESSAGE\]: "pagina", id, blocks: stare\.blocks, css: stare\.css, reluari: r,/);
});
