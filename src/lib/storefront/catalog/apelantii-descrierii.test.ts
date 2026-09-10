import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Apelantii descrierii o cer ASA cum trebuie?
 *
 * ═══ DE CE O PROBA PE SURSA, SI NUMAI PENTRU CE A RAMAS IN `.tsx` ═══
 *
 * `RandeazaMagazin` (`pagina-magazin.tsx`), `generateMetadata` din `[slug]/page.tsx` si
 * pagina `/cautare` sunt fisiere `.tsx`, iar un `.tsx` nu se poate importa in probe
 * (`scripts/tests/ts-resolve.mjs`). De aceea tot ce se putea muta a plecat in module
 * `.ts`, rulate CHIAR ele: `dateStructuratePaginaCatalog` si `descrierePaginiiCatalog`
 * (`metadata-magazin.test.ts`), `metadataPaginiiPrincipale` (`metadata-acasa.test.ts`),
 * `contextDescriere` (`context-descriere.test.ts`).
 *
 * In `.tsx` a ramas doar FIRUL: ce intrari da pagina acelor functii. Aici se verifica
 * textul INTREG al fiecarui apel, nu doar ca un simbol apare undeva: un argument schimbat
 * (`esteCautare: false`, `numeCategorie: ""`, alte `setari`) arata identic, raspunde 200
 * si trece de build.
 */

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Codul fara comentarii: o regula scrisa doar intr-un comentariu nu apara nimic, iar
 * un apel pomenit intr-un comentariu nu e un apel.
 *
 * ⚠ `//` precedat de `:` ramane: e o adresa (`https://`), nu un comentariu.
 */
function cod(rel: string): string {
  return sursa(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGINA = "src/lib/storefront/catalog/pagina-magazin.tsx";
const METADATA = "src/lib/storefront/catalog/metadata-magazin.ts";
const ACASA = "src/lib/storefront/catalog/metadata-acasa.ts";
const PAGINA_ACASA = "src/app/(public)/[slug]/page.tsx";
const POLITICI = "src/app/(public)/[slug]/politici/[type]/page.tsx";
const CAUTARE = "src/app/(public)/[slug]/cautare/page.tsx";

/** Textul apelului care incepe la `start` (`nume(`), pana la paranteza care il inchide. */
function apel(text: string, start: number): string {
  let adancime = 0;
  for (let i = text.indexOf("(", start); i < text.length; i++) {
    if (text[i] === "(") adancime++;
    else if (text[i] === ")" && --adancime === 0) return text.slice(start, i + 1);
  }
  throw new Error("apel neinchis");
}

/** Pozitiile APELURILOR lui `nume`; definitia (`function nume(`) nu e un apel. */
const apeluri = (text: string, nume: string) =>
  [...text.matchAll(new RegExp(`(?<!function )\\b${nume}\\(`, "g"))].map((m) => m.index ?? 0);

/** Textul fara formatare: fara virgula de la coada, spatiile comprimate. */
const plat = (s: string) => s.replace(/,(\s*[}\])])/g, "$1").replace(/\s+/g, " ");

/**
 * Functia exportata `nume`, de la `export` pana la acolada care ii inchide corpul.
 *
 * ⚠ Nu „pana la urmatorul `export`": dupa ea poate veni o functie neexportata. Si nu
 * prima acolada de dupa parametri: tipul intors poate fi el insusi un obiect
 * (`Promise<{ ... }>`), deci acoladele dintre `<` si `>` se sar.
 */
function corpul(text: string, nume: string): string {
  const start = text.search(new RegExp(`^export (?:async )?function ${nume}\\b`, "m"));
  assert.ok(start >= 0, `${nume} lipseste`);
  let i = text.indexOf("(", start);
  for (let adancime = 0; i < text.length; i++) {
    if (text[i] === "(") adancime++;
    else if (text[i] === ")" && --adancime === 0) break;
  }
  for (let unghi = 0; i < text.length; i++) {
    if (text[i] === "<") unghi++;
    else if (text[i] === ">" && text[i - 1] !== "=") unghi--;
    else if (text[i] === "{" && unghi === 0) break;
  }
  for (let j = i, adancime = 0; j < text.length; j++) {
    if (text[j] === "{") adancime++;
    else if (text[j] === "}" && --adancime === 0) return text.slice(start, j + 1);
  }
  throw new Error(`${nume}: corp neinchis`);
}

test("RandeazaMagazin isi scrie JSON-LD-ul NUMAI prin `dateStructuratePaginaCatalog`, cu intrarile paginii", () => {
  const c = cod(PAGINA);
  const unde = apeluri(c, "dateStructuratePaginaCatalog");
  assert.equal(unde.length, 1, "datele structurate se compun intr-un singur loc al randarii");
  assert.equal(
    plat(apel(c, unde[0])),
    "dateStructuratePaginaCatalog({ business, pageContent: storeSettings?.page_content ?? null, "
      + "faraTva: preturiFaraTva(storeSettings), setari, sp, filtre, numeCategorie, "
      + "parinteCategorie: categorieDinCale?.numeParinte ?? null, products, reusitPeServer, "
      + "esteCiorna: isPreview || !business.is_published, esteCautare: esteCautare === true, "
      + "categorii: categoriiDeNavigat, categoriiCuProduse: rezumat?.categorii })",
  );
  // Nimic din ce sta acum in modulul rulat nu se mai compune a doua oara aici.
  for (const nume of ["contextDescriere", "construiesteDateCatalog", "emiteDateCatalog", "descriereProprieAPaginii", "subarboreAreProduse"]) {
    assert.equal(apeluri(c, nume).length, 0, `${nume} se cheama in \`dateStructuratePaginaCatalog\`, nu in randare`);
  }
  assert.match(c, /dangerouslySetInnerHTML=\{\{ __html: dateStructurate \}\}/, "rezultatul trebuie sa ajunga in pagina");
});

test("intrarile randarii vin de unde trebuie", () => {
  const c = cod(PAGINA);
  // Setarile paginii de catalog, din designul randat (acelasi din care ia `<head>`-ul pe cel publicat).
  assert.match(c, /const setari = citesteSetariMagazin\(resolved\.design\);/);
  // Categoriile vizibile si rezumatul pentru comutatoarele MAGAZINULUI: decizia 6.
  assert.match(c, /rezumatMagazin\(business\.id, faraImagini, faraStocAscuns\)/);
  assert.match(c, /const categoriiDeNavigat = categoriiCitite\.vizibile;/);
  // Fara coloanele de TVA, `preturiFaraTva` ar da mereu fals: pretul fara TVA ar parea intreg.
  assert.match(c, /\.from\("store_settings"\)\s*\.select\("[^"]*\bvat_enabled, prices_include_vat\b[^"]*"\)/);
});

test("`/cautare` isi da steagul si metadatei, si randarii", () => {
  /* Fara el, randarea emite `CollectionPage` pentru catalogul intreg pe o pagina `noindex`,
     iar metadata o face indexabila. Ruta e un `.tsx`, deci firul se verifica aici. */
  const c = cod(CAUTARE);
  assert.equal(plat(apel(c, apeluri(c, "metadataMagazin")[0])), "metadataMagazin({ slug, sp, esteCautare: true })");
  assert.equal(plat(apel(c, apeluri(c, "RandeazaMagazin")[0])), "RandeazaMagazin({ slug, sp, esteCautare: true })");
});

test("descrierea se compune intr-un SINGUR loc: `descrierePaginiiCatalog`", () => {
  const m = cod(METADATA);
  // O singura data fiecare, in `descrierePaginiiCatalog`.
  assert.equal(apeluri(m, "contextDescriere").length, 1);
  assert.equal(apeluri(m, "descriereProprieAPaginii").length, 1);
  assert.match(corpul(m, "descrierePaginiiCatalog"), /\bcontextDescriere\(/);
  // `<head>`-ul catalogului si nodul `CollectionPage` trec amandoua prin ea.
  assert.equal(apeluri(corpul(m, "metadataMagazin"), "descrierePaginiiCatalog").length, 1);
  assert.equal(apeluri(corpul(m, "dateStructuratePaginaCatalog"), "descrierePaginiiCatalog").length, 1);
  // `/?cat=` la magazinele cu pagina de catalog (ramura 3) la fel; `contextDescriere` ramane
  // numai pe ramurile fara pagina de catalog, unde grila e a paginii principale.
  const a = cod(ACASA);
  assert.equal(apeluri(a, "descrierePaginiiCatalog").length, 1);
  assert.equal(apeluri(a, "descriereProprieAPaginii").length, 0);
  assert.equal(apeluri(a, "contextDescriere").length, 1);
});

test("niciun apelant nu-si calculeaza singur contextul si nu citeste `seo.description`", () => {
  for (const f of [PAGINA, METADATA, ACASA, PAGINA_ACASA]) {
    const c = cod(f);
    assert.doesNotMatch(c, /\bramuriCuProduse\(/, `${f}: subcategoriile vin din contextDescriere`);
    assert.doesNotMatch(c, /\bcontinut\s*:/, `${f}: continutul vine din contextDescriere, nu scris de mana`);
  }
  // ⚠ `metadataPaginiiPrincipale` il citeste pe drept: e chiar pagina principala. Restul nu.
  for (const [f, c] of [[PAGINA, cod(PAGINA)], [METADATA, cod(METADATA)], [ACASA, corpul(cod(ACASA), "metadataAcasaFiltrata")]] as const) {
    assert.doesNotMatch(c, /seo\.description/, `${f}: descrierea paginii principale n-are ce cauta aici`);
  }
});

test("decizia 6: aceeasi regula in `<head>` si in `CollectionPage`", () => {
  const m = cod(METADATA);
  assert.match(corpul(m, "metadataMagazin"), /subarboreAreProduse\(vizibile, categorie, rezumat\?\.categorii\) === false/);
  assert.match(corpul(m, "dateStructuratePaginaCatalog"), /subarboreCuProduse: subarboreAreProduse\(a\.categorii, a\.numeCategorie, a\.categoriiCuProduse\)/);
});

test("pagina-magazin reexporta metadata, deci rutele nu s-au schimbat", () => {
  assert.match(cod(PAGINA), /export \{ metadataMagazin \} from "@\/lib\/storefront\/catalog\/metadata-magazin"/);
});

test("pagina principala: `generateMetadata` doar paseaza mai departe, catre functia rulata in probe", () => {
  /* Garda adreselor filtrate si ramurile ei sunt in `metadataPaginiiPrincipale`, rulata in
     `metadata-acasa.test.ts`. Aici ramane doar ca pagina chiar o cheama, cu `getStoreProduct`:
     acelasi incarcator, cu `cache()`, ca randarea produsului unic. */
  const c = cod(PAGINA_ACASA);
  const meta = corpul(c, "generateMetadata");
  assert.equal(
    plat(meta).trim(),
    "export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> { "
      + "const [{ slug }, sp] = await Promise.all([params, searchParams]); "
      + "return metadataPaginiiPrincipale({ slug, sp, incarcaProdus: getStoreProduct }); }",
  );
  assert.match(c, /getStoreProduct\(business\.id, storeMode\.productId\)/, "randarea cere produsul unic cu aceleasi argumente");
});

test("pagina de politici isi scrie descrierea, aceeasi in meta, og si twitter", () => {
  /* Tot un `.tsx`, deci tot pe sursa. Fraza insasi e probata in `policy-links.test.ts`. */
  const c = cod(POLITICI);
  const inceput = c.indexOf("export async function generateMetadata");
  const sfarsit = c.indexOf("export default async function");
  assert.ok(inceput >= 0 && sfarsit > inceput);
  const meta = c.slice(inceput, sfarsit);
  const unde = apeluri(meta, "descrierePolitica");
  assert.equal(unde.length, 1, "descrierea politicii se cere o data, in `generateMetadata`; fara ea, pagina mosteneste descrierea paginii principale");
  // Cu numele SCURT, ca descrierile catalogului: fara „S.R.L." si fara slogan.
  assert.equal(apel(meta, unde[0]), "descrierePolitica(type, numeScurtMagazin(numeMagazin))");
  // Radacina, og si twitter. og si twitter inlocuiesc INTREG obiectul parintelui, deci o
  // descriere lipsa din ele n-ar mai veni de nicaieri.
  assert.equal([...meta.matchAll(/\bdescription:\s*descriere\b/g)].length, 3, "description, openGraph.description, twitter.description");
  assert.match(meta, /openGraph:\s*\{[^}]*\bdescription:\s*descriere\b/);
  assert.match(meta, /twitter:\s*\{[^}]*\bdescription:\s*descriere\b/);
});
