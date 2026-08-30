import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   UN LOT NU SE INCHIDE DACA ASEZAREA LUI N-A APUCAT SA SE SCRIE (29.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   `pollOpenBatches` aseza verdictul lor prin treisprezece scrieri OARBE, si apoi inchidea lotul
   NECONDIȚIONAT. Deci o pana de o clipa la mijloc lasa verdictul nescris SI lotul inchis — iar
   loturile inchise nu se mai intreaba niciodata: selectia cere `pending/processing/retry`.

   Cel mai scump: un produs RESPINS de Trendyol ramanea la noi pe `pending` pentru totdeauna, fara
   text de eroare. Comerciantul il vedea „in asteptare" si nu afla niciodata de ce nu apare la ei.

   ⚠ SI NICIO PLASA NU-L RIDICA. `confirmaTintit` citeste `["pending","created"]` si scrie
   `approved` numai pentru produsele GASITE la ei — unul respins nu se gaseste, deci ramane
   `pending` la nesfarsit. `reconcileRejections` porneste de la listele LOR de respingeri, nu de
   la loturi.

   ⚠ ACEEASI CAPCANA E REPARATA DE MULT LA ABOUT YOU, in acelasi rol si cu acelasi nume: acolo
   `setListingStatus` intoarce `boolean` si asezarea tine un steag `asezat`. Aici lipseau si
   valoarea, si steagul.
*/

const sync = readFileSync("src/lib/trendyol/sync.ts", "utf8");

/** Regiunea in care se aseaza verdictul, de la steag pana la inchiderea lotului. */
function regiuneaAsezarii(): string {
  const i = sync.indexOf("    let asezat = true;");
  assert.notEqual(i, -1, "lipseste steagul asezarii");
  const j = sync.indexOf('const { error: eInchidere } = await admin.from("trendyol_batches")', i);
  assert.notEqual(j, -1, "lipseste inchiderea care citeste steagul");
  return sync.slice(i, j);
}

test("⚠ `setListingStatus` spune daca a mers, nu intoarce `void`", () => {
  assert.match(sync, /async function setListingStatus\([^)]*\): Promise<boolean> \{/);
  assert.match(sync, /const \{ error \} = await admin\.from\("trendyol_listings"\)[\s\S]{0,200}?return !error;/);
});

test("⚠ nicio scriere din asezare nu mai merge oarba", () => {
  /*
   * ⚠ SE NUMARA CAILE RAMASE, NU CELE ACOPERITE. Un prag pe „cel putin N invelite" ar fi trecut
   * verde peste o scriere noua, adaugata maine, lasata pe dinafara — iar aia e chiar greseala pe
   * care o pazim. Se cere zero descoperite.
   */
  const reg = regiuneaAsezarii();
  const oarbe = [...reg.matchAll(
    /await admin\s*\n?\s*\.?from\("(?!trendyol_batches)[a-z_]+"\)\s*\n?\s*\.(update|insert|upsert|delete)/g,
  )];
  assert.equal(oarbe.length, 0,
    `au ramas ${oarbe.length} scrieri fara raspuns citit: ${oarbe.map((m) => m[0].replace(/\s+/g, " ")).join(" | ")}`);
});

test("⚠ si scrierile de stare isi citesc raspunsul", () => {
  const reg = regiuneaAsezarii();
  const stari = [...reg.matchAll(/await setListingStatus\(/g)];
  const pazite = [...reg.matchAll(/if \(!await setListingStatus\(/g)];
  assert.equal(stari.length, pazite.length,
    "fiecare scriere de stare trebuie sa stinga steagul cand pica");
  assert.ok(pazite.length >= 2, "asezarea chiar scrie stari");
});

test("⚠ lotul se inchide `retry` cand asezarea n-a fost scrisa in intregime", () => {
  /*
   * ⚠ `retry`, nu `completed`: verdictul lor e deja la noi in `result`, ce lipseste e urma lui in
   * baza. Iar reluarea e ieftina, fiindca asezarea e idempotenta.
   */
  assert.match(sync, /status: !asezat \? "retry" : hardFail \? "failed" : "completed",/);
  /* ⚠ Si se vede in jurnal: un lot care se reia la nesfarsit, tacut, ar fi tot o pierdere. */
  assert.match(sync, /verdictul lotului n-a putut fi scris in intregime/);
  /* ⚠ Si `retry` chiar e reintrebat — altfel steagul n-ar folosi la nimic. */
  assert.match(sync, /\.in\("status", \["pending", "processing", "retry"\]\)/);
});

test("⚠ steagul se naste ADEVARAT si se stinge doar la esec", () => {
  /*
   * Pornit `false`, fiecare lot s-ar reintoarce pe `retry` la nesfarsit chiar cand totul merge —
   * o roata perfecta, si mult mai greu de vazut decat defectul reparat.
   */
  const reg = regiuneaAsezarii();
  assert.match(sync, /let asezat = true;/);
  assert.doesNotMatch(reg, /asezat = true;\s*\n[\s\S]{0,40}?asezat = true/);
  assert.match(reg, /if \(error\) asezat = false;/);
});
