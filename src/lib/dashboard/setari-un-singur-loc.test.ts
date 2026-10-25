import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/*
 * ⚠ O SETARE ARE UN SINGUR ECRAN.
 *
 * Etapa 1 a editorului unic (24.10.2026). Telefonul si emailul aveau camp si in
 * Setari > General, si in „Editeaza magazinul”, peste aceleasi coloane: cine le
 * schimba intr-un loc vedea valoarea veche in celalalt, iar prima salvare de acolo
 * o scria inapoi. Formularul de comanda si regulile catalogului stateau printre
 * bannere, desi nu sunt design. Acum stau in Setari, iar probele de aici cad daca
 * editorul isi face din nou o copie.
 */

const RADACINA = process.cwd();
/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
const sursa = (f: string) => readFileSync(path.join(RADACINA, f), "utf8").replace(/\r\n/g, "\n");

/** Fara comentarii: istoria scrisa in ele pomeneste dinadins cheile mutate. */
function cod(f: string): string {
  return sursa(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const EDITOR = "src/components/editor/StoreEditor.tsx";
const SETARI = "src/components/dashboard/SettingsClient.tsx";

const MUTATE_IN_SETARI: Record<string, string> = {
  checkout_config: "src/components/dashboard/setari/FormularComandaSetari.tsx",
  hide_products_without_images: "src/components/dashboard/setari/CatalogSetari.tsx",
  hide_out_of_stock_products: "src/components/dashboard/setari/CatalogSetari.tsx",
  show_empty_categories: "src/components/dashboard/setari/CatalogSetari.tsx",
};

test("⚠⚠ editorul nu mai atinge cheile mutate in Setari", () => {
  const editor = cod(EDITOR);
  for (const [cheie, ecran] of Object.entries(MUTATE_IN_SETARI)) {
    assert.ok(!editor.includes(cheie), `„${cheie}” a aparut din nou in editor`);
    assert.ok(cod(ecran).includes(cheie), `„${cheie}” nu mai e in ${ecran}`);
  }
});

test("⚠⚠ editorul scrie in `businesses` doar logo, coperta, culoarea si publicarea", () => {
  /* Restul coloanelor (nume, contact, adresa, retele, butoane) le scrie Setari > General. */
  const editor = cod(EDITOR);
  const apeluri = [...editor.matchAll(/updateBusiness\(business\.id, \{([^}]*)\}\)/g)];
  assert.ok(apeluri.length >= 2, "nu am gasit scrierile editorului; s-a schimbat forma apelului?");
  const chei = new Set(apeluri.flatMap((m) => m[1].split(",").map((p) => p.split(":")[0].trim()).filter(Boolean)));
  assert.deepEqual([...chei].sort(), ["cover_url", "is_published", "logo_url", "primary_color"]);
  /* Si nicio cale ocolita: `updateBusiness` chemat altfel decat cu un obiect scris pe loc. */
  assert.equal((editor.match(/updateBusiness\(/g) ?? []).length, apeluri.length);
});

test("trimiterile din editor duc la file care exista in Setari", () => {
  /* O fila necunoscuta nu da eroare: Setarile deschid tacut „General”. */
  const setari = sursa(SETARI);
  const navStart = setari.indexOf("const NAV_SECTIONS");
  const nav = setari.slice(navStart, setari.indexOf("];", navStart));
  const file = new Set([...nav.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]));
  const tinte = [...cod(EDITOR).matchAll(/\/dashboard\/settings\?sectiune=([a-z-]+)/g)].map((m) => m[1]);
  assert.deepEqual(tinte.sort(), ["catalog", "formular-comanda", "general"]);
  for (const t of tinte) assert.ok(file.has(t), `fila „${t}” nu exista in NAV_SECTIONS`);
});

test("⚠ fila Catalog trimite exact cele trei chei ale ei", () => {
  const s = cod("src/components/dashboard/setari/CatalogSetari.tsx");
  assert.deepEqual(s.match(/updatePageContent\([^)]*\)/g), ["updatePageContent(businessId, trimis)"]);
  const obiect = s.slice(s.indexOf("const trimis: VizibilitateCatalog = {"), s.indexOf("};", s.indexOf("const trimis")));
  const chei = [...obiect.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(chei, ["hide_out_of_stock_products", "hide_products_without_images", "show_empty_categories"]);
});

test("⚠ comutatoarele de catalog se citesc in Setari exact ca in magazin (`=== true`)", () => {
  const pagina = sursa("src/app/(dashboard)/dashboard/settings/page.tsx");
  for (const cheie of ["hide_products_without_images", "hide_out_of_stock_products", "show_empty_categories"]) {
    assert.match(pagina, new RegExp(`${cheie}: pcCatalog\\.${cheie} === true`), cheie);
  }
  /* Perechea: asa le citeste magazinul. */
  assert.match(sursa("src/lib/storefront/catalog/pagina-magazin.tsx"), /pc\.hide_products_without_images === true/);
  assert.match(sursa("src/components/ministore/MiniStoreRenderer.tsx"), /pageContent\.show_empty_categories === true/);
});

/** Sursele aplicatiei, fara probe, cu cai relative la radacina. */
function surseleAplicatiei(): string[] {
  return (readdirSync(path.join(RADACINA, "src"), { recursive: true, withFileTypes: false }) as string[])
    .map(String)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => path.join("src", f));
}

test("⚠ emailul din formularul de comanda are acelasi implicit in Setari si in magazin", () => {
  /*
   * Fara reglaj (`email_field` lipsa), magazinul ARATA campul, optional. Editorul
   * vechi, si dupa el prima forma a filei din Setari, il citeau oprit: comutatorul
   * spunea „oprit”, iar formularul clientilor avea campul. Proba aduna FIECARE
   * citire cu implicitul scris pe loc si cere ca toate sa spuna acelasi lucru.
   */
  const implicite = new Map<string, string[]>();
  for (const fisier of surseleAplicatiei()) {
    for (const m of cod(fisier).matchAll(/email_field \?\? (\{[^}]*\})/g)) {
      const forma = m[1].replace(/\s+/g, " ");
      implicite.set(forma, [...(implicite.get(forma) ?? []), fisier]);
    }
  }
  const toate = [...implicite.values()].flat();
  assert.ok(
    toate.some((f) => f.endsWith("FormularComandaSetari.tsx")),
    "Setarile nu mai citesc `email_field` cu un implicit scris pe loc; proba nu mai vede ecranul",
  );
  /* Azi: cele cinci cai ale magazinului si fila din Setari. Mai putine = s-a schimbat forma citirii. */
  assert.ok(toate.length >= 6, `doar ${toate.length} citiri gasite; s-a schimbat forma lor?`);
  assert.deepEqual(
    [...implicite.keys()],
    ["{ enabled: true, required: false }"],
    `implicite diferite: ${JSON.stringify(Object.fromEntries(implicite), null, 2)}`,
  );
});
