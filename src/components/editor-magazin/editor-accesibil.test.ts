import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Etapa 25.14 (11.11.2026): ce a reparat axe-core in editor si in panou (10 stari, calculator si telefon, toate curate pe
 * build-ul de productie), plus focusul vizibil al selectorului de pagina, gasit la trecerea din tastatura (45 de pasi,
 * un singur element fara indicator). Proiectul n-are jsdom: componentele se citesc ca text.
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

test("25.14: editorul are un titlu de pagina si previzualizarea e o regiune cu nume (nu al doilea <main>)", () => {
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /<h1 className="sr-only">Editează magazinul<\/h1>/);
  assert.match(e, /<section aria-label="Previzualizarea magazinului"/);
  assert.doesNotMatch(e, /^\s*<main[\s>]/m);
});

test("25.14: sertarul panoului de pe telefon nu se citeste si nu primeste focus cand e inchis", () => {
  assert.match(cod("src/components/dashboard/DashboardTopbar.tsx"), /<aside aria-label="Meniul panoului" inert=\{!mobileOpen\}/);
});

test("25.14: textul verde din meniul lateral foloseste culoarea cu contrast (4,31 -> peste 4,5)", () => {
  const css = cod("src/app/stil-comun.css");
  assert.match(css, /--primary-text: oklch\(0\.47 0\.16 143\.725\);/);
  assert.ok((cod("src/components/dashboard/Sidebar.tsx").match(/text-\[var\(--primary-text\)\]/g) ?? []).length >= 1);
});

test("25.14: selectorul „Pagina pe care o editezi” are inel de focus vizibil din tastatura", () => {
  const b = cod("src/components/editor-magazin/BaraEditor.tsx");
  // `[^\n]*`, nu `[^>]*`: in `onChange` sta o functie-sageata (`=>`).
  const sel = b.match(/<select value=\{pagina\}[^\n]*aria-label="Pagina pe care o editezi"\n\s*className="([^"]+)"/);
  assert.ok(sel, "selectorul de pagina nu mai e unde il stiam");
  assert.match(sel![1], /focus-visible:ring-2 focus-visible:ring-primary\/40/);
});

test("WebKit (19.11.2026): un `<select>` al panoului are CONTUR la focusul din tastatura, nu doar inel", () => {
  /*
    Inelul (`ring`) e `box-shadow`, iar Safari nu deseneaza umbre pe un `<select>` cu aspect nativ: la proba editorului pe
    WebKit, selectorul de pagina ramanea doar cu chenarul de 1 px. Regula sta in afara straturilor, ca sa bata
    `focus:outline-none` din clasele campurilor, si doar in zona aplicatiei (vitrina are culorile ei).
  */
  const css = cod("src/app/stil-comun.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const regula = css.match(/\.zona-aplicatie select:focus-visible \{([^}]*)\}/);
  assert.ok(regula, "regula de contur pentru `<select>` a disparut din `stil-comun.css`");
  assert.match(regula![1], /outline: 2px solid color-mix\(in oklab, var\(--primary\) 60%, transparent\);/);
  assert.match(regula![1], /outline-offset: 1px;/);
  // In afara oricarui `@layer`: inauntrul unuia, `focus:outline-none` (strat de utilitare) ar castiga.
  const pana = css.slice(0, css.indexOf(".zona-aplicatie select:focus-visible"));
  const deschise = (pana.match(/\{/g) ?? []).length - (pana.match(/\}/g) ?? []).length;
  assert.equal(deschise, 0, "regula de contur a ajuns inauntrul unui bloc (strat sau media)");
});
