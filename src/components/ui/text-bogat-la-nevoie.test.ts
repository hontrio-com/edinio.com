import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * Etapa 25.15 (11.11.2026): TipTap (~124 KB gzip) nu mai pleaca odata cu editorul magazinului. Se aduce abia cand se
 * deschide un camp de text bogat, prin `RichTextEditorLaNevoie`.
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

test("25.15: invelisul aduce editorul de text cu `import()` la nevoie, fara randare pe server", () => {
  const lenes = cod("src/components/ui/RichTextEditorLaNevoie.tsx");
  assert.match(lenes, /export const RichTextEditor = dynamic\(\(\) => import\("\.\/RichTextEditor"\)\.then\(\(m\) => m\.RichTextEditor\), \{\n {2}ssr: false,/);
  // Cat se incarca: un chenar care spune ce se intampla, nu un loc gol.
  assert.match(lenes, /role="status"/);
  assert.match(lenes, /Se încarcă editorul de text/);
  // Si niciun import static al editorului de text in invelis (altfel ar pleca oricum in acelasi pachet).
  assert.doesNotMatch(lenes, /^import .* from "\.\/RichTextEditor";$/m);
});

test("25.15: niciun fisier din editorul magazinului, al paginilor sau din vitrina nu importa direct editorul de text", () => {
  const directe: string[] = [];
  const umbla = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) umbla(p);
      else if (/\.tsx?$/.test(n) && !/\.test\./.test(n) && /from "(@\/components\/ui|\.\.?(\/\.\.)*(\/ui)?)\/RichTextEditor"/.test(cod(p))) directe.push(p);
    }
  };
  for (const d of ["src/components/editor-magazin", "src/components/pages", "src/components/storefront", "src/components/ministore"]) umbla(d);
  assert.deepEqual(directe, []);
  // Singurul loc din editor care il foloseste trece prin invelis.
  assert.match(cod("src/components/pages/BlockSettings.tsx"), /^import \{ RichTextEditor \} from "@\/components\/ui\/RichTextEditorLaNevoie";$/m);
});
