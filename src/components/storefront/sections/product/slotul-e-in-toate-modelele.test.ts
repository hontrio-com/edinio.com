import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Slotul de configurator e in TOATE modelele de pagina de produs?
 *
 * ═══ ⚠ DE CE E NEVOIE DE O PROBA, CAND `tsc` PARE SA PAZEASCA ═══
 *
 * Dispecerul din `ProductPageSection` cere ca fiecare varianta sa fie
 * `ComponentType<ComponentProps<typeof ProductPageClassic>>`. Suna a paza, dar nu e: o
 * componenta care primeste MAI PUTINE props e perfect atribuibila uneia care primeste mai
 * multe. O varianta care nu stie deloc de `configurator` trece de `tsc`, trece de build si se
 * randeaza frumos — doar ca produsul se vinde la pretul de baza, fara nimic din ce a configurat
 * clientul. Nimeni n-ar afla pana la prima comanda gresita.
 *
 * Proiectul are deja tiparul asta scris de doua ori: al doilea meniu al panoului care „il
 * oglindeste” pe primul si nu il oglindeste, si un prop inghitit de `{...props}` care a lasat 39
 * de panouri fara titlu peste tsc, eslint, 2892 de teste si build.
 *
 * ═══ CE PAZESTE, EXACT ═══
 *
 *   1. Fiecare varianta din `VARIANTE` isi declara props-ul `configurator` SI randeaza slotul.
 *   2. Slotul e UNUL SINGUR, cel din `_shared` — nu o a doua copie care ar diverge tacut.
 *   3. Fiecare ruta care randeaza pagina de produs chiar ii DA configuratorul.
 *
 * ⚠ Nu se uita la previzualizarea din editorul de design (`SectionPreviewFrame`): acolo produsul
 * e o demonstratie fara magazin in spate, deci n-are ce configurator sa primeasca.
 */

const MODELE = path.resolve(process.cwd(), "src/components/storefront/sections/product");
const APLICATIA = path.resolve(process.cwd(), "src/app");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(fisier: string): string {
  return readFileSync(fisier, "utf8").replace(/\r\n/g, "\n");
}

/** ⚠ Si separatorii: pe Windows `readdir` intoarce `\`, iar comparatia scrisa cu `/` ar cadea. */
function caleUnificata(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Calea relativa scrisa cel mai aproape de numele componentei.
 *
 * Acopera amandoua felurile in care dispecerul aduce o varianta: `import { X } from "./X"` si
 * `const X = dynamic(() => import("./X")…)`. Se cauta pe text, nu cu o expresie compusa din
 * sabloane: escaparile se pierd pe drum, si o expresie care nu mai potriveste nimic ar fi facut
 * proba sa treaca pe gol — exact modul de esec impotriva caruia e scrisa.
 */
function caleaDeLangaNume(dispecer: string, nume: string): string | undefined {
  const lenes = dispecer.indexOf(`const ${nume} = dynamic(`);
  if (lenes >= 0) {
    // Importul lenes se scrie pe mai multe randuri: numele pe unul, calea pe urmatorul.
    return dispecer.slice(lenes).match(/import\("(\.[^"]+)"/)?.[1];
  }
  for (const linie of dispecer.split("\n")) {
    if (!linie.startsWith("import") || !linie.includes(nume)) continue;
    const m = linie.match(/"(\.[^"]+)"/);
    if (m) return m[1];
  }
  return undefined;
}

/** Unde sta componenta unei variante. */
function fisierulComponentei(dispecer: string, nume: string): string {
  const relativ = caleaDeLangaNume(dispecer, nume);
  assert.ok(relativ, `nu am gasit de unde vine varianta ${nume}`);
  const fisier = path.join(MODELE, `${relativ}.tsx`);
  assert.ok(existsSync(fisier), `${nume} ar veni din ${relativ}, dar fisierul nu exista`);
  return fisier;
}

/** Variantele declarate in dispecer: cheia din design → fisierul componentei. */
function variantele(): Map<string, string> {
  const s = sursa(path.join(MODELE, "ProductPageSection.tsx"));

  const start = s.indexOf("const VARIANTE");
  assert.ok(start > 0, "nu am gasit lista de variante in ProductPageSection.tsx");
  const desc = s.indexOf("{", start);
  const stop = s.indexOf("};", desc);
  assert.ok(desc > 0 && stop > desc, "nu am gasit corpul listei de variante");

  const out = new Map<string, string>();
  for (const m of s.slice(desc, stop).matchAll(/(\w+)\s*:\s*(\w+)\s*,/g)) {
    out.set(m[1], fisierulComponentei(s, m[2]));
  }

  /*
   * ⚠ GARDA DE NUMARATOARE. Fara ea, o rescriere a fisierului — alt fel de a declara lista, o
   * virgula mutata — ar face expresia sa nu mai potriveasca nimic, iar proba ar trece pe gol
   * peste zero variante. Exact modul de esec pe care proiectul il are scris de doua ori.
   */
  assert.ok(out.size >= 2, `am citit doar ${out.size} variante — cititorul s-a rupt`);
  return out;
}

test("FIECARE model de pagina de produs randeaza slotul de configurator", () => {
  for (const [cheie, fisier] of variantele()) {
    const s = sursa(fisier);
    assert.match(
      s,
      /import\s*\{\s*ConfiguratorSlot\s*\}\s*from\s*"\.\/_shared\/ConfiguratorSlot"/,
      `modelul „${cheie}” nu aduce slotul comun`,
    );
    assert.ok(
      s.includes("<ConfiguratorSlot"),
      `modelul „${cheie}” nu randeaza slotul: produsul lui s-ar vinde la pretul de baza`,
    );
    assert.match(
      s,
      /configurator\?:\s*ConfiguratorDeVitrina\s*\|\s*null/,
      `modelul „${cheie}” nu primeste deloc configuratorul`,
    );
    /*
     * ⚠ SI CARLIGUL COMUN, nu o stare scrisa de mana.
     *
     * `useConfigurator` tine intr-un singur loc regula „cand se poate comanda". Un model care si-o
     * scrie singur ar fi ajuns sa raspunda altfel — de pilda sa lase butonul apasabil cu o gravura
     * obligatorie necompletata — si nimic n-ar fi cazut.
     */
    assert.ok(
      s.includes("useConfigurator(configurator"),
      `modelul „${cheie}” nu foloseste carligul comun`,
    );
    assert.match(
      s,
      /const maiEDeAles = .*\|\| !cfg\.gata;/,
      `modelul „${cheie}” nu leaga butonul de starea configuratorului`,
    );
    assert.ok(
      s.includes("configuratie: cfg.valori ?? undefined"),
      `modelul „${cheie}” nu duce configuratia in cos`,
    );
    assert.ok(
      s.includes("price: cfg.pretUnitar"),
      `modelul „${cheie}” pune in cos alt pret decat cel configurat`,
    );
  }
});

test("slotul e UNUL SINGUR, in _shared", () => {
  /*
   * ⚠ O a doua copie ar fi divergit tacut: reguli intr-un model, preturi in celalalt. Aceeasi
   * lectie ca la piesele mutate verbatim din `ProductPageClassic` cand a aparut a doua varianta.
   */
  const copii = readdirSync(MODELE, { recursive: true, encoding: "utf8" })
    .map((f) => caleUnificata(String(f)))
    .filter((f) => f.endsWith("ConfiguratorSlot.tsx"))
    .sort();
  assert.deepEqual(copii, ["_shared/ConfiguratorSlot.tsx"]);
});

/**
 * Rutele care randeaza pagina de produs cu un magazin adevarat in spate.
 *
 * ⚠ DOUA NUME, nu unul: ruta de produs cheama dispecerul de-a dreptul, iar magazinul „un singur
 * produs” trece prin invelisul care ia varianta din designul VIU. Cautat dupa un singur nume,
 * cititorul ar fi gasit o ruta din doua si ar fi lasat-o pe cealalta nepazita.
 */
function ruteleDeProdus(): string[] {
  const gasite: string[] = [];
  for (const f of readdirSync(APLICATIA, { recursive: true, encoding: "utf8" })) {
    const nume = String(f);
    if (!nume.endsWith(".tsx")) continue;
    const plin = path.join(APLICATIA, nume);
    const s = sursa(plin);
    if (s.includes("ProductPageDinDesign") || s.includes("ProductPageSection")) gasite.push(plin);
  }
  // ⚠ Aceeasi garda: doua rute o randeaza azi — pagina de produs si magazinul „un produs”.
  assert.ok(gasite.length >= 2, `am gasit doar ${gasite.length} rute — cautarea s-a rupt`);
  return gasite;
}

test("FIECARE ruta care randeaza pagina de produs ii da si configuratorul", () => {
  for (const ruta of ruteleDeProdus()) {
    const s = sursa(ruta);
    const scurt = caleUnificata(path.relative(APLICATIA, ruta));
    assert.match(
      s,
      /const\s*\{[^}]*\bconfigurator\b[^}]*\}\s*=\s*await\s+enrichStoreProduct/,
      `${scurt} nu cere configuratorul de la enrichStoreProduct`,
    );
    assert.ok(
      s.includes("configurator={configurator}"),
      `${scurt} il cere, dar nu il paseaza mai departe — pagina l-ar ignora in tacere`,
    );
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ CALEA „COMANDA ACUM”, care n-avea nicio paza
   ══════════════════════════════════════════════════════════════════════════ */

/** Cele doua modele de pagina de produs. `MODELE` (mai sus) e directorul lor. */
const CELE_DOUA = ["ProductPageClassic.tsx", "ProductPageDetailed.tsx"];

test("⚠ fereastra de comanda primeste pretul CONFIGURAT, nu pe cel din catalog", () => {
  /*
   * ⚠ CE COSTA. Din pretul dat ferestrei ies TOATE sumele ei: treapta, subtotalul, pragul de
   * transport gratuit, comanda minima, reducerea de card, TVA-ul, suma declarata la ramburs si
   * numarul mare de langa poza. Serverul insa NU citeste `product_price` pe o linie configurata:
   * calculeaza `unitar * cantitate` din valori.
   *
   * Deci cu `displayPrice` acolo, omul configura cana la 149 lei, formularul ii scria 89, si
   * comanda intra la 149. Curierul cerea 149. Nicio garda nu se aprindea, fiindca
   * `authoritativeSubtotal` (toleranta 0,50 lei) e ocolit cu totul pe ramura configurata.
   *
   * ⚠ Proba de mai jos verifica CALEA COSULUI si trecea verde cat timp asta era rupta: cele
   * doua drumuri de cumparare au fiecare pretul lui, si numai unul era pazit.
   */
  for (const model of CELE_DOUA) {
    const s = sursa(path.join(MODELE, model));
    assert.match(
      s,
      /price: cfg\.gata \? cfg\.pretUnitar : displayPrice,/,
      `${model}: fereastra de comanda primeste alt pret decat cel pe care il incaseaza serverul`,
    );
  }
});

test("⚠ treptele de cantitate NU se ofera pe un produs configurat", () => {
  /*
   * ⚠ Serverul le sare dinadins (o treapta e un pret scris pentru produsul din catalog; aplicata
   * peste o configuratie ar fi vandut-o cu toata configurarea pe gratis). Dar pagina le ARATA, iar
   * fiecare rand din tabel duce in fereastra cu cantitatea lui.
   *
   * Pe o cana de 100 lei configurati, „3 bucati — 150 lei” insemna: afisat 150, incasat 300.
   */
  for (const model of CELE_DOUA) {
    const s = sursa(path.join(MODELE, model));
    assert.match(
      s,
      /const quantityTiers: QuantityTier\[\] \| undefined = configurator\s+\? undefined\s+: construiesteTrepte\(/,
      `${model}: treptele se construiesc si pe produsele configurate`,
    );
  }
});

test("⚠ linia noua se NORMALIZEAZA inainte sa i se caute cheia in cos", () => {
  /*
   * ⚠ Pagina nu trimite `amprenta` — ea se calculeaza in `normalizeazaCos`. Cheia luata de pe
   * obiectul brut cadea deci pe forma VECHE (fara amprenta), si doua configuratii diferite ale
   * aceluiasi produs primeau ACEEASI cheie: cosul le contopea intr-o linie, a doua configuratie
   * era suprascrisa in `localStorage` si atelierul grava de doua ori prima gravura.
   */
  const s = sursa(path.resolve(process.cwd(), "src/components/storefront/cart/CartProvider.tsx"));
  assert.match(s, /const \[curatat\] = normalizeazaCos\(\[\{ \.\.\.item, quantity: n \}\]\);/);
  assert.match(s, /const key = lineKey\(curatat\);/, "cheia se ia inca de pe obiectul brut");
  assert.match(s, /: \[\.\.\.prev, curatat\];/, "in cos intra tot obiectul brut");
});
