import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

import {
  ADRESA_SCAPA_DE_STOC, CUTIA_CADRULUI, URMARIREA_LOR, VERDELE_LOR,
} from "./scapa-de-stoc";

/* ── Adresa lor ─────────────────────────────────────────────────────────── */

test("⚠⚠ adresa pastreaza TOTI parametrii lor de urmarire", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA PARTENERIATUL. `utm_source` poarta identificatorul
   * nostru de partener; fara el, vizitele trimise de noi nu se mai vad in raportul
   * lor, deci intelegerea nu mai are pe ce sta. Un „hai sa curatam adresa" sau o
   * rescriere neatenta nu s-ar vedea nicaieri in panou, si s-ar afla peste luni.
   */
  const u = new URL(ADRESA_SCAPA_DE_STOC);
  for (const [cheie, valoare] of Object.entries(URMARIREA_LOR)) {
    assert.equal(u.searchParams.get(cheie), valoare, `lipseste sau s-a schimbat ${cheie}`);
  }
});

test("⚠ adresa e a LOR, pe https, si pe `www`", () => {
  const u = new URL(ADRESA_SCAPA_DE_STOC);
  assert.equal(u.protocol, "https:");
  assert.equal(u.hostname, "www.scapadestoc.ro");
});

test("⚠ adresa nu se compune nicaieri altundeva in cod", () => {
  /*
   * Un al doilea loc care scrie domeniul lor ar fi a doua copie a aceleiasi
   * adrese, si cele doua se despart la prima schimbare ceruta de ei. Singurul
   * fisier care are voie sa-l pomeneasca e asta si proba lui.
   *
   * ⚠ SE CITESTE DISCUL, NU `git grep`. Prima forma folosea `git grep`, care nu
   * vede fisierele NEURMARITE — adica exact fisierele noi, adica exact cele in
   * care ar aparea a doua copie. Proba iesea verde peste orice, inclusiv peste
   * ea insasi.
   */
  const gasite: string[] = [];
  const mergi = (dir: string) => {
    for (const nume of readdirSync(dir)) {
      const cale = `${dir}/${nume}`;
      if (statSync(cale).isDirectory()) { mergi(cale); continue; }
      if (!/\.(ts|tsx|mjs|json)$/.test(nume)) continue;
      if (readFileSync(cale, "utf8").includes("scapadestoc")) gasite.push(cale);
    }
  };
  mergi("src");

  assert.deepEqual(
    gasite.sort(),
    ["src/lib/parteneri/scapa-de-stoc.test.ts", "src/lib/parteneri/scapa-de-stoc.ts"],
    "domeniul partenerului apare si in alte fisiere: adresa trebuie sa stea intr-un singur loc",
  );
});

/* ── Cutia de siguranta a cadrului ──────────────────────────────────────── */

test("⚠⚠ pagina incadrata NU poate scoate comerciantul din panou", () => {
  /*
   * ⚠ ASTA E PAZA. Fara cutie, o pagina incadrata scrie `window.top.location` si
   * muta browserul de tot din panou — dintr-un panou in care omul e autentificat.
   * Nu e o banuiala despre partener: pagina lui incarca si scripturi straine.
   */
  assert.ok(!CUTIA_CADRULUI.includes("allow-top-navigation"),
    "cutia ingaduie navigarea ferestrei de sus: pagina lor poate muta comerciantul de unde vrea");
});

test("⚠ dar pagina lor chiar merge: are scripturi, origine proprie si formulare", () => {
  /*
   * O cutie prea stramta ar fi dat o fereastra care „nu merge" si pe care nimeni
   * n-ar fi legat-o de noi. Fara `allow-same-origin` pagina lor ar fi intr-o
   * origine oarba: fara cookie-uri, fara `localStorage`, si se rupe.
   */
  for (const cerut of ["allow-scripts", "allow-same-origin", "allow-forms", "allow-popups"]) {
    assert.ok(CUTIA_CADRULUI.includes(cerut), `lipseste ${cerut}`);
  }
});

/* ── Ce se vede pe ecran ────────────────────────────────────────────────── */

test("⚠ fereastra ofera MEREU o iesire catre fila noua", () => {
  /*
   * Ei n-au azi `X-Frame-Options` (masurat pe 21.09.2026), deci cadrul merge. Daca
   * adauga vreodata unul, cadrul ramane ALB si browserul nu spune nimic omului.
   * Legatura catre fila noua e singurul lucru care il scoate din fundatura, deci
   * trebuie sa fie acolo tot timpul, nu doar cand ceva pare stricat.
   */
  const sursa = readFileSync("src/components/dashboard/ScapaDeStoc.tsx", "utf8");
  assert.match(sursa, /target="_blank"/, "fereastra nu are legatura catre fila noua");
  assert.match(sursa, /rel="noopener/, "legatura catre fila noua trebuie sa aiba `noopener`");
});

test("⚠ cadrul chiar foloseste cutia, nu o declara degeaba", () => {
  const sursa = readFileSync("src/components/dashboard/ScapaDeStoc.tsx", "utf8");
  assert.match(sursa, /sandbox=\{CUTIA_CADRULUI\}/, "cadrul nu primeste cutia de siguranta");
  assert.match(sursa, /src=\{ADRESA_SCAPA_DE_STOC\}/, "cadrul nu foloseste adresa din singurul loc");
});

test("⚠⚠ fereastra se scoate prin PORTAL, nu se randeaza in bara", () => {
  /*
   * ⚠ BARA DE SUS E `backdrop-blur-sm` (vezi antetul din `DashboardTopbar`), iar
   * orice element cu `backdrop-filter` — ca si cu `transform` sau `filter` —
   * devine BLOC DE REFERINTA pentru descendentii lui `position: fixed`.
   *
   * Randata pe loc, fereastra nu s-ar aseza fata de ecran, ci fata de bara de 56
   * de pixeli: taiata sus, inalta cat un sfert de ecran. Masurat pe 21.09.2026,
   * asa a si iesit prima forma.
   *
   * ⚠ DE CE O PROBA. Defectul NU se vede la `tsc` si nu se vede la nicio proba de
   * comportament: codul e corect, doar asezarea e alta. Se vede numai pe ecran, iar
   * cine sterge portalul peste sase luni („de ce complicatia asta?") n-ar afla
   * niciodata de ce era acolo. Nota din fisier spune de ce; asta o tine.
   */
  const sursa = readFileSync("src/components/dashboard/ScapaDeStoc.tsx", "utf8");
  assert.match(sursa, /createPortal\(/, "fereastra nu mai trece prin portal");
  assert.match(sursa, /document\.body/, "portalul nu mai duce in `document.body`");
});

test("⚠ si bara de sus chiar are `backdrop-blur`, altfel proba de mai sus n-ar apara nimic", () => {
  /*
   * Daca blurul dispare vreodata din bara, portalul nu mai e strict necesar — dar
   * atunci si proba de mai sus devine o regula fara motiv, iar o regula fara motiv
   * se sterge pe buna dreptate. Randul asta leaga cele doua: cat timp blurul e
   * acolo, portalul e obligatoriu.
   */
  const bara = readFileSync("src/components/dashboard/DashboardTopbar.tsx", "utf8");
  assert.match(
    bara, /<header className="sticky[^"]*backdrop-blur/,
    "bara de sus nu mai are `backdrop-blur`: verifica daca portalul din fereastra mai e necesar",
  );
});

test("⚠ butonul isi spune numele si cand eticheta e ascunsa, pe telefon", () => {
  /*
   * ⚠ Sub `lg` eticheta e `display:none`, iar ce e ascuns asa NU intra in numele
   * accesibil. Fara `aria-label`, numele ar fi venit din `title` — toata descrierea
   * de o suta cincizeci de semne, citita la fiecare trecere. Si ar fi disparut cu
   * totul in ziua in care cineva scoate `title`-ul.
   */
  const sursa = readFileSync("src/components/dashboard/ScapaDeStoc.tsx", "utf8");
  assert.match(sursa, /aria-label=\{NUMELE_LOR\}/, "butonul din bara n-are nume scris explicit");
  assert.match(sursa, /hidden lg:inline/, "eticheta nu mai e ascunsa pe ecrane mici");
});

test("culoarea marcii lor e cea data de ei", () => {
  assert.equal(VERDELE_LOR, "#3FA88A");
});

test("⚠ verdele lor NU e folosit ca text pe fundal deschis", () => {
  /*
   * ⚠ `#3FA88A` pe alb da un contrast de ~2,6:1, sub pragul de 4,5:1. E o culoare
   * de SIGLA, nu de text. Folosita pentru cuvinte, ar fi facut un rand pe care
   * multi nu-l pot citi — si ar fi trecut neobservata, fiindca pe ecranul celui
   * care o scrie arata bine.
   */
  const sursa = readFileSync("src/components/dashboard/ScapaDeStoc.tsx", "utf8");
  assert.ok(
    !/text-\[#3FA88A\]|color:\s*['"]?#3FA88A/i.test(sursa),
    "verdele partenerului e folosit ca si culoare de text: contrastul pe fundal deschis e ~2,6:1",
  );
});
