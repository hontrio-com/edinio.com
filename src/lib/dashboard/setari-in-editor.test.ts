import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { COLOANE_MAGAZIN_CIORNA } from "@/lib/storefront/design/continut-ciorna";
import { SETARI_EDITOR } from "@/lib/editor-magazin/setari";

/*
 * ⚠ O SETARE ARE UN SINGUR ECRAN.
 *
 * Etapa 1 a editorului unic (24.10.2026) mutase din „Editeaza magazinul” in Setari datele magazinului,
 * formularul de comanda si catalogul: telefonul si emailul aveau camp in ambele locuri, peste aceleasi
 * coloane, iar prima salvare dintr-un loc o scria inapoi pe cea veche din celalalt.
 *
 * Etapa 8 (lista lui de pe 27.10.2026: „pune-l tot aici la Setari [...] Catalog la fel, si tot ce era
 * acolo”; raspunsul lui: „Doar în editor”) le-a dus inapoi in editor, in fila „Setări”, si le-a scos din
 * Setari. Regula ramane: un singur ecran. Probele de aici cad daca Setarile isi fac din nou o copie.
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

/** Editorul unic: tot ce e sub cele doua dosare ale lui. */
const DOSARE_EDITOR = ["src/components/editor-magazin", "src/lib/editor-magazin"];
const fisiereEditor = (): string[] =>
  DOSARE_EDITOR.flatMap((d) => (readdirSync(path.join(RADACINA, d), { recursive: true, withFileTypes: false }) as string[])
    .map(String)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => path.join(d, f)));
/** Codul editorului, toate fisierele lipite, fara comentarii. */
const codEditor = () => fisiereEditor().map(cod).join("\n");
const SETARI = "src/components/dashboard/SettingsClient.tsx";
const PAGINA_SETARI = "src/app/(dashboard)/dashboard/settings/page.tsx";
const STAREA = "src/components/editor-magazin/setari/useSetariMagazin.ts";
const PANOURILE = "src/components/editor-magazin/setari/PanouriSetari.tsx";

const CHEI_MUTATE = ["checkout_config", "hide_products_without_images", "hide_out_of_stock_products", "show_empty_categories"];

test("⚠⚠ setarile mutate au un singur ecran: fila „Setări” a editorului, nu Setarile", () => {
  assert.ok(fisiereEditor().length >= 10, "nu gasesc fisierele editorului unic");
  const stare = cod(STAREA);
  const setari = cod(SETARI) + cod(PAGINA_SETARI);
  for (const cheie of CHEI_MUTATE) {
    assert.ok(stare.includes(cheie) || cod("src/lib/editor-magazin/setari.ts").includes(cheie), `„${cheie}” nu mai e in editor`);
    assert.ok(!setari.includes(cheie), `„${cheie}” a aparut din nou in Setari`);
  }
  // Si datele magazinului: Setarile nu mai salveaza nimic prin `updateGeneralSettings`.
  assert.doesNotMatch(cod(SETARI), /updateGeneralSettings|DateleMagazinului|FormularComandaSetari|CatalogSetari/);
  assert.match(cod(STAREA), /rezultat = await updateGeneralSettings\(businessId, trimise\.date, trimise\.formatComanda\);/);
});

test("⚠ Setarile nu mai au filele mutate, iar „General” trimite in editor", () => {
  const setari = sursa(SETARI);
  const navStart = setari.indexOf("const NAV_SECTIONS");
  const nav = setari.slice(navStart, setari.indexOf("];", navStart));
  const file = new Set([...nav.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]));
  for (const mutata of ["catalog", "formular-comanda"]) assert.ok(!file.has(mutata), `fila „${mutata}” e inca in Setari`);
  assert.ok(file.has("general"), "„General” (cu „Contul tău”) trebuie sa ramana");
  // Prin `cn`, ca `<Button>`: fara el, `border-transparent` din baza butonului batea conturul (proba din 27.10).
  assert.match(cod(SETARI), /<Link href=\{adresaSetarii\(\)\} className=\{cn\(buttonVariants\(\{ variant: "outline" \}\)\)\}>\s*Deschide setările magazinului/);
});

test("⚠ adresele vechi ale filelor mutate duc in editor, pe setarea lor", () => {
  const pagina = cod(PAGINA_SETARI);
  assert.match(pagina, /const mutata = sectiune \? FILE_MUTATE_IN_EDITOR\[sectiune\] : undefined;\s*if \(mutata\) redirect\(adresaSetarii\(mutata\)\);/);
  // Inainte de orice citire: o fila mutata nu mai incarca Setarile degeaba.
  assert.ok(pagina.indexOf("redirect(adresaSetarii(mutata))") < pagina.indexOf("await createClient()"));
});

test("⚠⚠ editorul scrie in `businesses`: prin ciorna doar cele patru coloane; direct, publicarea si Setările", () => {
  /*
   * Prin ciorna (etapa 6) trec logo-ul, coperta, culoarea si galeria; ajung in magazin la „Publică”. Pe
   * loc: comutatorul de publicare a magazinului si, din etapa 8, fila „Setări”, prin `updateGeneralSettings`
   * (pe server, doar ce iese din `pregatesteDateleGenerale`).
   */
  const editor = codEditor();
  const apeluri = [...editor.matchAll(/updateBusiness\(\w+\.id, \{([^}]*)\}\)/g)];
  assert.equal(apeluri.length, 1, "nu am gasit scrierea pe loc a editorului; s-a schimbat forma apelului?");
  const chei = new Set(apeluri.flatMap((m) => m[1].split(",").map((p) => p.split(":")[0].trim()).filter(Boolean)));
  assert.deepEqual([...chei].sort(), ["is_published"]);
  assert.equal((editor.match(/updateBusiness\(/g) ?? []).length, apeluri.length);
  assert.deepEqual([...COLOANE_MAGAZIN_CIORNA].sort(), ["cover_url", "gallery", "logo_url", "primary_color"]);
  const prinCiorna = new Set([...editor.matchAll(/cuColoanele\(\w+, \{ (\w+):/g)].map((m) => m[1]));
  assert.deepEqual([...prinCiorna].sort(), ["cover_url", "gallery", "logo_url", "primary_color"]);
  assert.match(cod("src/lib/actions/store-design.actions.ts"), /\.from\("businesses"\)\s*\.update\(continut\.magazin as never\)/);
  assert.equal((editor.match(/updateGeneralSettings\(/g) ?? []).length, 1, "o singura salvare a datelor generale");
});

test("trimiterile editorului spre Setari duc la file care exista; cele mutate se deschid pe loc, in editor", () => {
  /* O fila necunoscuta nu da eroare: Setarile deschid tacut „General”. */
  const setari = sursa(SETARI);
  const navStart = setari.indexOf("const NAV_SECTIONS");
  const nav = setari.slice(navStart, setari.indexOf("];", navStart));
  const file = new Set([...nav.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]));
  const editor = codEditor();
  const tinte = [...new Set([...editor.matchAll(/\/dashboard\/settings\?sectiune=([a-z-]+)/g)].map((m) => m[1]))];
  assert.ok(tinte.includes("livrare"), "editorul nu mai trimite la „Livrare”");
  for (const t of tinte) assert.ok(file.has(t), `fila „${t}” nu exista in NAV_SECTIONS`);
  // FIECARE nota care numeste o setare mutata o deschide chiar pe ea, pe loc (`setare=`), nu doar una
  // dintre ele. ⚠ Eticheta contine „>”: atributele se citesc pe valori intregi, nu pana la primul „>”.
  const deMutat = new Map<string, string>(SETARI_EDITOR.map((s) => [s.titlu, s.cheie]));
  const note = [...editor.matchAll(/<Nota\b((?:\s+[a-zA-Z]+(?:=(?:"[^"]*"|\{[^{}]*\}))?)*)\s*\/?>/g)].map((m) => m[1]);
  const spreMutate = note.flatMap((atribute) => {
    const titlu = atribute.match(/eticheta="Setări > ([^"]+)"/)?.[1];
    return titlu && deMutat.has(titlu) ? [{ titlu, atribute }] : [];
  });
  /* Azi: despre, contact (de doua ori), pagina magazinului, catalogul de pe „Acasă”, formularul. */
  assert.ok(spreMutate.length >= 6, `doar ${spreMutate.length} note spre setarile mutate; s-a schimbat forma lor?`);
  for (const { titlu, atribute } of spreMutate) {
    assert.match(atribute, new RegExp(`\\bsetare="${deMutat.get(titlu)}"`), `nota „Setări > ${titlu}” nu deschide setarea ei`);
  }
  assert.doesNotMatch(editor, /\/dashboard\/settings(\?sectiune=(general|catalog|formular-comanda))?["`]/);
});

test("⚠ catalogul trimite exact cele trei chei ale lui", () => {
  const s = cod(STAREA);
  assert.deepEqual(s.match(/updatePageContent\(businessId, trimis\)/g), ["updatePageContent(businessId, trimis)"]);
  // `const trimis:`, nu `const trimis`: altfel prinde intai `const trimise` din datele generale.
  const start = s.indexOf("const trimis: VizibilitateCatalog = {");
  const obiect = s.slice(start, s.indexOf("};", start));
  const chei = [...obiect.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(chei, ["hide_out_of_stock_products", "hide_products_without_images", "show_empty_categories"]);
});

test("⚠ comutatoarele de catalog se citesc in editor exact ca in magazin (`=== true`)", () => {
  const regula = cod("src/lib/editor-magazin/setari.ts");
  for (const cheie of ["hide_products_without_images", "hide_out_of_stock_products", "show_empty_categories"]) {
    assert.match(regula, new RegExp(`${cheie}: pageContent\\.${cheie} === true`), cheie);
  }
  assert.match(cod("src/app/(dashboard)/dashboard/editor/page.tsx"), /catalog: catalogDinPageContent\(pageContent\)/);
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

test("⚠ emailul din formularul de comanda are acelasi implicit in editor si in magazin", () => {
  /*
   * Fara reglaj (`email_field` lipsa), magazinul ARATA campul, optional. Editorul vechi, si dupa el prima
   * forma a filei din Setari, il citeau oprit: comutatorul spunea „oprit”, iar formularul clientilor avea
   * campul. Proba aduna FIECARE citire cu implicitul scris pe loc si cere ca toate sa spuna acelasi lucru.
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
    toate.some((f) => path.normalize(f) === path.normalize(PANOURILE)),
    "fila „Setări” nu mai citeste `email_field` cu un implicit scris pe loc; proba nu mai vede ecranul",
  );
  /* Azi: cele cinci cai ale magazinului si fila din editor. Mai putine = s-a schimbat forma citirii. */
  assert.ok(toate.length >= 6, `doar ${toate.length} citiri gasite; s-a schimbat forma lor?`);
  assert.deepEqual(
    [...implicite.keys()],
    ["{ enabled: true, required: false }"],
    `implicite diferite: ${JSON.stringify(Object.fromEntries(implicite), null, 2)}`,
  );
});
