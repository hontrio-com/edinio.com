import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

/*
  Blocurile de pagina pe telefon (26.09.2026). Editorul arata telefonul intr-un
  cadru de 400px pe un ecran lat, deci `md:grid-cols-3` punea trei coloane intr-un
  telefon si blocurile aratau stricate doar in editor. Blocurile folosesc
  `pg-sm:`/`pg-md:`/`pg-lg:`/`pg-xl:`: pe magazin aceleasi praguri de ecran, in
  cadrul de telefon al editorului niciodata.
*/

const dir = new URL("../../components/pages/blocks/", import.meta.url);
const fisiere = [
  ...readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => new URL(f, dir)),
  new URL("../../components/pages/BlockShell.tsx", import.meta.url),
];
const PRAG_DE_ECRAN = /(?<![\w-])(sm|md|lg|xl|2xl):[a-z[!-]/;

test("niciun bloc nu raspunde la latimea ferestrei: pragurile sunt `pg-*`", () => {
  const gasite: string[] = [];
  for (const f of fisiere) {
    readFileSync(f, "utf8").split("\n").forEach((rand, i) => {
      if (PRAG_DE_ECRAN.test(rand)) gasite.push(`${f.pathname.split("/").pop()}:${i + 1}: ${rand.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(gasite, []);
});

test("pragurile `pg-*` sunt cele de ecran pe magazin si se opresc in cadrul de telefon", () => {
  const css = readFileSync(new URL("../../app/stil-comun.css", import.meta.url), "utf8");
  for (const [nume, rem] of [["sm", "40rem"], ["md", "48rem"], ["lg", "64rem"], ["xl", "80rem"]]) {
    const rand = css.split("\n").find((r) => r.startsWith(`@custom-variant pg-${nume} `));
    assert.ok(rand, `lipseste pg-${nume}`);
    assert.ok(rand.includes(`(width >= ${rem})`), `pg-${nume}: alt prag decat ${nume}:`);
    assert.ok(rand.includes(`:not([data-editor-device="mobile"] *)`), `pg-${nume} se aplica si in cadrul de telefon`);
  }
});

test("in editor blocul primeste cursorul (efectele la trecere), dar un clic doar il selecteaza", () => {
  const src = readFileSync(new URL("../../components/pages/PageBuilder.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /pointer-events-none">\s*<BlockRenderer/, "previzualizarea fara cursor nu arata efectele");
  const f = src.slice(src.indexOf("function Previzualizare"));
  assert.match(f, /onClickCapture=\{\(e\) => \{ e\.preventDefault\(\); e\.stopPropagation\(\); onSelect\(\); \}\}/);
  assert.match(f, /onSubmitCapture=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.equal((src.match(/<Previzualizare onSelect=/g) ?? []).length, 3, "toate cele trei locuri care randeaza un bloc in editor");
});

test("fundalul paginii: alb implicit, cel ales pentru magazin daca exista, acelasi in editor si pe magazin", async () => {
  const { fundalulPaginii } = await import("./fundal-pagina");
  assert.equal(fundalulPaginii("var(--color-background)"), "#FFFFFF", "fundalul implicit al magazinului e gri: paginile sunt albe");
  assert.equal(fundalulPaginii(undefined), "#FFFFFF");
  assert.equal(fundalulPaginii("#FDF2F8"), "#FDF2F8", "fundalul ales de comerciant ramane");
  assert.equal(fundalulPaginii("red;}body{display:none"), "#FFFFFF");
  const publica = readFileSync(new URL("../../app/(public)/[slug]/[pageSlug]/page.tsx", import.meta.url), "utf8");
  assert.match(publica, /backgroundColor: fundalulPaginii\(resolved\.style\.colors\.background\)/);
  const editor = readFileSync(new URL("../../app/(dashboard)/dashboard/pages/[pageId]/edit/page.tsx", import.meta.url), "utf8");
  assert.match(editor, /fundalulPaginii\(resolveDesign\(ss\?\.storefront_design/);
  const builder = readFileSync(new URL("../../components/pages/PageBuilder.tsx", import.meta.url), "utf8");
  assert.match(builder, /style=\{\{ backgroundColor: fundal \}\}/);
});

test("o pagina fara titlu, hero sau H1 ales primeste titlul paginii ca H1 ascuns", async () => {
  const { areTitluPrincipal } = await import("./titlul-principal");
  assert.equal(areTitluPrincipal([{ id: "a", type: "trust" }, { id: "b", type: "bundles" }] as never), false);
  assert.equal(areTitluPrincipal([{ id: "a", type: "hero", title: "Salut" }] as never), true);
  assert.equal(areTitluPrincipal([{ id: "c", type: "columns", items: [{ blocks: [{ id: "h", type: "heading", text: "T" }] }] }] as never), true);
  const publica = readFileSync(new URL("../../app/(public)/[slug]/[pageSlug]/page.tsx", import.meta.url), "utf8");
  assert.match(publica, /\{!areTitluPrincipal\(blocks\) && <h1 className="sr-only">\{page\.title\}<\/h1>\}/);
});
