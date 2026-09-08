import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O INTEGRARE LIVRATA CARE RAMANE CU LACAT (08.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INTAMPLAT. Pepita a fost livrata, desfasurata si probata in productie: ruta
   mergea, panoul ei mergea, adresa raspundea. In hub-ul de integrari insa cardul avea LACAT,
   deci nimeni nu putea intra in ea. A vazut-o proprietarul, nu eu.

   Cauza: cardul isi ia soarta din TREI lanturi de `integration.id === "..."` scrise de mana,
   lungi de cateva mii de caractere fiecare, si eu adaugasem `id: "pepita"` in lista de
   integrari fara sa-l adaug in ele. Fiecare din cele trei tace altfel:

     `isUnlocked`  lipsa -> LACAT, adica „exista, dar n-ai acces"
     `href`        lipsa -> cardul duce la „#"
     `isActive`    lipsa -> bulina verde nu se aprinde niciodata

   ⚠ NICIO POARTA N-AVEA CUM S-O PRINDA. `tsc` vede trei siruri perfect valide, lintul la
   fel, iar probele existente se uitau la CATALOGUL DE PE SITE, nu la panou. Iar defectul nu
   se vede nici la o citire a diff-ului: lanturile sunt pe un singur rand fiecare.

   ⚠ SI SE REPETA LA FIECARE INTEGRARE LIVRATA. Lista are 65 de intrari; a doua oara cand
   cineva scoate un `soon` si pune un `id`, are exact aceleasi trei sanse sa uite.

   Proba SCANEAZA SURSA, si stie ce poate: spune ca fiecare integrare cu `id` e pomenita in
   toate trei, nu ca lanturile sunt corecte. Corectitudinea lor se vede pe ecran; ce nu se
   vedea era LIPSA.
*/

const PANOU = readFileSync("src/app/(dashboard)/dashboard/features/page.tsx", "utf8");

/** Id-urile integrarilor livrate: cele care au `id`, nu `soon`. */
function idUriLivrate(): string[] {
  const out = new Set<string>();
  for (const m of PANOU.matchAll(/\{\s*name:\s*"[^"]+",[^}]*?\bid:\s*"([a-z0-9-]+)"/g)) {
    out.add(m[1]);
  }
  return [...out];
}

/** Bucata de sursa care tine un lant, de la numele lui pana la capatul instructiunii. */
function lantul(nume: string): string {
  const i = PANOU.indexOf(`const ${nume} = `);
  assert.ok(i > 0, `nu s-a gasit lantul \`${nume}\` in panou`);
  const j = PANOU.indexOf(";\n", i);
  assert.ok(j > i, `lantul \`${nume}\` n-are capat`);
  return PANOU.slice(i, j);
}

test("⚠ proba stie sa citeasca panoul", () => {
  /*
   * Perechea obligatorie a oricarei probe care scaneaza: daca regexul n-ar potrivi nimic,
   * lista ar iesi goala si TOATE verificarile de mai jos ar trece pe degeaba. Un zero fals
   * arata ca un zero bun.
   */
  const ids = idUriLivrate();
  assert.ok(ids.length >= 30, `asteptam integrarile livrate, am gasit ${ids.length}`);
  for (const cunoscut of ["emag", "trendyol", "aboutyou", "olx", "pepita", "sameday"]) {
    assert.ok(ids.includes(cunoscut), `${cunoscut} lipseste din lista citita`);
  }
  assert.ok(lantul("isUnlocked").length > 500, "lantul de deblocare pare gol");
});

test("⚠ nicio integrare livrata nu ramane cu lacat", () => {
  const lant = lantul("isUnlocked");
  const cuLacat = idUriLivrate().filter((id) => !lant.includes(`"${id}"`));
  assert.deepEqual(cuLacat, [], "integrari livrate care apar cu lacat in hub");
});

test("⚠ si nicio integrare livrata nu duce la „#”", () => {
  const lant = lantul("href");
  const fara = idUriLivrate().filter((id) => !lant.includes(`"/dashboard/features/${id}"`));
  assert.deepEqual(fara, [], "integrari livrate fara adresa in hub");
});

/**
 * Cine n-are ce sa configureze, si de aceea n-are nici bulina.
 *
 * ⚠ EXCEPTIE CU MOTIV, nu o proba slabita. Catalogul Meta e un feed care merge pentru orice
 * magazin din clipa in care exista: comerciantul doar copiaza o adresa, nu salveaza nicio
 * credentiala si nu porneste niciun comutator. N-are deci ce sa aprinda bulina, iar una
 * aprinsa mereu n-ar spune nimic.
 *
 * ⚠ Lista se completeaza doar pentru integrari care CHIAR n-au configurare. Adaugata aici ca
 * sa treaca proba, o integrare cu configurare ar pierde tocmai plasa.
 */
const FARA_CONFIGURARE = new Set(["facebook-catalog"]);

test("bulina de „configurat” exista pentru fiecare integrare care se configureaza", () => {
  /*
   * Mai putin grava decat celelalte doua: fara ea cardul se deschide, doar ca nu spune ca e
   * deja configurat. Se probeaza totusi, fiindca e al treilea lant si se uita la fel de usor.
   */
  const lant = lantul("isActive");
  const fara = idUriLivrate()
    .filter((id) => !FARA_CONFIGURARE.has(id))
    .filter((id) => !lant.includes(`"${id}"`));
  assert.deepEqual(fara, [], "integrari livrate fara steag de configurare in hub");
});
