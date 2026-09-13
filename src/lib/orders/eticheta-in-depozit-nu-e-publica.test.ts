import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O ETICHETA SERVITA `no-store` DAR DEPOZITATA PUBLIC       (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CONTRADICTIA. Rutele care servesc etichete pun `Cache-Control: private, no-store`,
 * fiindca documentul poarta numele, adresa si telefonul CUMPARATORULUI. Dar unele dintre ele
 * pun apoi o copie in R2 prin `uploadToR2(octeti, cheie, tip)`, forma cu TREI argumente, al
 * carei implicit este `public, max-age=31536000, immutable`. Adica exact pe dos fata de ce
 * incearca sa faca antetul de pe raspuns, si pentru un an.
 *
 * ⚠ CE S-A GASIT, masurat: Pall-Ex si eColet depozitau public. GLS dadea deja `private,
 * no-store`, si tocmai de aceea nimeni n-a observat ca vecinii nu-l dau. Auditul Astra
 * semnaleaza cazul doar la Pall-Ex (PALLEX-08); eColet nu e numit de niciun audit.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: se scoate al patrulea argument din oricare dintre apeluri.
 * Proba trebuie sa cada, si sa spuna care fisier.
 */

const ANTET_CERUT = '"private, no-store"';

/** Fisierele care pot depozita un document de curier. Se cauta pe disc, nu dintr-o lista. */
function fisiereCuEtichete(): string[] {
  const gasite: string[] = [];

  const dirApi = "src/app/api";
  for (const curier of readdirSync(dirApi, { withFileTypes: true })) {
    if (!curier.isDirectory()) continue;
    for (const sub of ["awb", "document"]) {
      const cale = `${dirApi}/${curier.name}/${sub}/route.ts`;
      try { readFileSync(cale); gasite.push(cale); } catch { /* nu exista */ }
    }
  }

  /*
   * Si actiunile care urca eticheta la EMITERE, nu doar rutele care o servesc.
   *
   * ⚠ SE CERE SI O CHEIE DE ETICHETA, nu doar apelul `uploadToR2(`. Altfel intrau aici
   * importurile de produse, feedurile de stoc si incarcarile de imagini, care urca DINADINS
   * in galeata publica: proba ar fi cerut `private, no-store` pentru o poza de produs si ar
   * fi cazut pe cod perfect corect. O plasa care prinde si pestele bun nu e o plasa.
   */
  const dirAct = "src/lib/actions";
  for (const f of readdirSync(dirAct)) {
    if (!/\.actions\.ts$/.test(f)) continue;
    const cale = `${dirAct}/${f}`;
    const s = readFileSync(cale, "utf8");
    if (s.includes("uploadToR2(") && /che(ie|i)Eticheta\(/.test(s)) gasite.push(cale);
  }
  return gasite;
}

test("⚠⚠ nicio eticheta de curier nu se depoziteaza cu antet public", () => {
  const fisiere = fisiereCuEtichete();

  /*
   * ⚠ SE NUMARA. Fara pragul asta, o redenumire a folderelor ar face proba sa treaca peste
   * ZERO fisiere si sa iasa verde: exact proba care nu poate cadea.
   */
  assert.ok(fisiere.length >= 7, `gasite doar ${fisiere.length} fisiere de eticheta: plasa n-are pe cine cadea`);

  const vinovate: string[] = [];
  let incarcari = 0;

  for (const cale of fisiere) {
    const s = readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
    let de = 0;
    for (;;) {
      const i = s.indexOf("uploadToR2(", de);
      if (i < 0) break;
      de = i + 1;
      incarcari++;

      /*
       * ⚠ Se citeste CHIAR apelul, nu fisierul. Un `private, no-store` scris altundeva in
       * fisier (pe antetul raspunsului, de pilda) ar fi facut proba sa treaca peste o
       * incarcare publica: exact greseala pe care o repara, doar mutata in plasa.
       */
      const apel = s.slice(i, s.indexOf(");", i) + 2);
      if (!apel.includes(ANTET_CERUT)) {
        vinovate.push(`${cale}: ${apel.replace(/\s+/g, " ").slice(0, 110)}`);
      }
    }
  }

  assert.ok(incarcari >= 3, `doar ${incarcari} incarcari gasite: plasa e prea mica`);

  assert.deepEqual(vinovate, [],
    "incarcarile astea depoziteaza documentul cu implicitul `public, max-age=31536000, "
    + "immutable`, desi el poarta numele, adresa si telefonul cumparatorului:\n"
    + vinovate.join("\n"));
});

test("⚠ si implicitul lui `uploadToR2` chiar E public, altfel proba de mai sus n-ar apara nimic", () => {
  /*
   * ⚠ PROBA ISI VERIFICA PREMISA. Daca intr-o zi implicitul devine `private`, regula de mai
   * sus ramane adevarata dar nu mai apara nimic, si nimeni n-ar afla. Aici se vede.
   */
  const r2 = readFileSync("src/lib/r2.ts", "utf8");
  assert.match(
    r2, /cacheControl = "public, max-age=31536000, immutable"/,
    "implicitul lui `uploadToR2` s-a schimbat: reciteste daca al patrulea argument mai e necesar",
  );
});
