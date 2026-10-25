import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Pagina de produs, cosul si comanda in editorul unic (etapa 2, 25.10.2026).
 *
 * Pana acum randau mereu designul publicat si nu ascultau editorul: alegeai alt
 * design de pagina de produs si previzualizarea ramanea pe cel vechi pana la
 * Publica. Acum randeaza ciorna proprietarului cand sunt deschise in editor.
 */

const RAD = process.cwd();
const cod = (f: string) =>
  readFileSync(path.join(RAD, f), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const RUTE: Record<string, string> = {
  produs: "src/app/(public)/[slug]/_rute/pagina-produs.tsx",
  cos: "src/app/(public)/[slug]/cos/page.tsx",
  comanda: "src/app/(public)/[slug]/checkout/page.tsx",
};

test("⚠⚠ coloana de ciorna nu intra in randul de setari al paginii", () => {
  /*
   * Randul de setari pleaca intreg catre componente de client, iar React il
   * serializeaza in HTML-ul fiecarui vizitator. Ciorna se citeste numai prin
   * `designDeRandat`, separat, si numai pentru proprietar in editor.
   */
  for (const [pagina, fisier] of Object.entries(RUTE)) {
    assert.doesNotMatch(cod(fisier), /storefront_design_draft/, `${pagina}: ${fisier} cere ciorna in randul de setari`);
  }
});

test("paginile alese in editor randeaza ciorna si asculta editorul", () => {
  for (const [pagina, fisier] of Object.entries(RUTE)) {
    const text = cod(fisier);
    assert.match(text, /esteEditorDeDesign\(semneDeEditor\(sp\)/, `${pagina}: nu afla daca e deschisa in editor`);
    assert.match(text, /designDeRandat\(/, `${pagina}: randeaza mereu designul publicat`);
    assert.match(text, /esteEditorDesign=\{esteEditorDesign\}/, `${pagina}: nu asculta mesajele editorului`);
  }
});
