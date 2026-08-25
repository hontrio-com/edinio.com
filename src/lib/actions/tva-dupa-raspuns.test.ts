import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/* ══════════════════════════════════════════════════════════════════════════
   SCHIMBAREA COTEI DE TVA SUPRAVIETUIESTE INCHIDERII RASPUNSULUI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Preturile nete de pe eMAG se socotesc din cota de TVA a magazinului. Cand cota se
   schimba, catalogul trebuie repus in coada — si chiar era, dar printr-un
   `void (async () => ...)()`. Pe Vercel, instanta poate fi inghetata in clipa in care
   raspunsul se inchide, deci repunerea putea sa nu apuce sa fie scrisa.

   ⚠ Si aici tacerea costa: un catalog intreg ar fi ramas cu preturi vechi la ei, fara
   nicio urma nicaieri. Nu se repara singur — plasa de amprenta priveste CONTINUTUL, iar
   pretul nu e in amprenta.

   ⚠ Aceeasi clasa de problema a fost reparata in alte optzeci si patru de locuri.
   Asta ramasese.
*/

const cod = readFileSync("src/lib/actions/store.actions.ts", "utf8");
const viu = cod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("repunerea in coada trece prin mecanismul casei", () => {
  assert.match(viu, /dupaRaspuns\(async \(\) => \{/);
  assert.match(viu, /\}, "tvaEmag", businessId\);/);
  assert.doesNotMatch(viu, /void \(async \(\) => \{/, "forma veche, care se putea pierde");
});

test("⚠ si `dupaRaspuns` chiar tine instanta vie", () => {
  /*
   * Proba asta nu verifica reparatia, ci TEMEIUL ei. Daca maine `dupaRaspuns` ar deveni un
   * simplu ambalaj de jurnal, mutarea de mai sus n-ar mai insemna nimic — iar nota care
   * spune ca „supravietuieste inchiderii raspunsului" ar deveni mincinoasa.
   */
  const dr = readFileSync("src/lib/marketplace/dupa-raspuns.ts", "utf8");
  assert.match(dr, /after\(cuPaza\)/, "foloseste after() din Next");
  assert.match(dr, /from "next\/server"/);
});

test("catalogul se citeste intreg, nu primele 1000", () => {
  /* ⚠ PostgREST taie la 1000 FARA sa spuna, iar aici lista e chiar catalogul. */
  assert.match(viu, /fetchAllRowsStrict<\{ product_id: string \| null \}>\(\s*"tva\.emag"/);
});

test("⚠ nu mai exista nicio lucrare de server pornita si uitata", () => {
  /*
   * Disciplina invatata la cronul de facturi: se cauta TIPARUL, nu linia care s-a vazut.
   *
   * ⚠ Componentele de client raman in afara: acolo `void (async ...)()` ruleaza in browser,
   * unde nu exista instanta serverless care sa fie inghetata. `after()` nici n-ar merge.
   *
   * ⚠ AICI SE CAUTA NUMAI `void (async ...)()`. Fratele lui, `void enqueueX(...)`, e deja
   * politat de `dupa-raspuns.test.ts` — si e mai bine acolo, langa unealta. Scris si aici,
   * ar fi fost aceeasi regula in doua locuri, adica doua care se pot departa.
   *
   * ⚠ Iar prima forma a probei ASTEIA a picat chiar in proba aceea: continea sirul cautat
   * intr-un regex, in cod viu. Un politist prins de celalalt politist.
   */
  const iesire = execSync(
    'git ls-files "src/**/*.ts" "src/**/*.tsx"',
    { encoding: "utf8", cwd: process.cwd() },
  ).split("\n").filter(Boolean);

  const vinovate: string[] = [];
  for (const f of iesire) {
    if (f.includes(".test.")) continue;
    const brut = readFileSync(f, "utf8");
    /* Numai fisierele care ruleaza pe server: fara `"use client"`. */
    if (brut.includes('"use client"')) continue;
    /*
     * ⚠ SE TAIE COMENTARIILE INTAI. Prima forma a probei s-a prins in propriul ei
     * comentariu — nota din `store.actions.ts` care EXPLICA de ce nu se mai foloseste
     * `void (async () => ...)()` continea chiar sirul cautat. O proba care se acuza
     * singura e mai rea decat una care lipseste: te pune sa cauti un defect inexistent.
     */
    const t = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");
    if (/void \(async \(\) =>/.test(t)) vinovate.push(f);
  }
  assert.deepEqual(vinovate, [], `lucrari de server pornite si uitate: ${vinovate.join(", ")}`);
});
