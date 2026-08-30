import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eVitrinaGolf } from "./client";

/* ══════════════════════════════════════════════════════════════════════════
   EI NU PUN MARCAJUL „-gulf" IN ACELASI LOC (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Prima forma lipea `-gulf` dupa `claims` la toate capetele, fiindca asa arata la CITIRE.
   Dar ei il pun altfel de la un capat la altul:

       citire     /claims-gulf                       marcajul dupa „claims"
       aprobare   /claims/{id}/items/approve-gulf    marcajul la SFARSITUL caii
       respingere /claims/{id}/issue-gulf            la fel

   ⚠ CE INSEMNA: un vanzator din Golf isi CITEA retururile, dar nu le putea nici aproba, nici
   respinge. Amandoua ar fi picat cu 404 — adica exact ca „n-are ce aproba".

   ⚠ SI LA RESPINGERE NU ERA NICI MACAR SUFIXUL GRESIT: peticul care il adauga nu s-a aplicat,
   fiindca `replace` nu gaseste si TACE. De-aia caile se scriu acum intregi, fiecare langa
   perechea ei europeana.

   ⚠ PROBELE CER URL-UL EXACT, nu „contine gulf". O proba care cere doar prezenta cuvantului ar
   fi trecut verde peste chiar defectul asta: `/claims-gulf/{id}/items/approve` contine „gulf".
*/

const sursa = readFileSync("src/lib/trendyol/client.ts", "utf8");

test("⚠ vitrinele Golfului sunt cunoscute, si numai ele", () => {
  for (const v of ["SA", "AE", "KW", "QA", "BH", "OM"]) {
    assert.equal(eVitrinaGolf(v), true, v);
    assert.equal(eVitrinaGolf(v.toLowerCase()), true, `${v} cu litere mici`);
  }
  for (const v of ["RO", "GR", "BG", "HU", "INT", "TR"]) {
    assert.equal(eVitrinaGolf(v), false, v);
  }
  assert.equal(eVitrinaGolf(undefined), false, "fara vitrina nu inseamna Golf");
});

test("⚠ CITIREA: marcajul vine dupa „claims”", () => {
  assert.match(sursa, /\$\{baza\}\/claims-gulf` : `\$\{baza\}\/claims`/);
});

test("⚠ APROBAREA: marcajul vine la SFARSITUL caii, nu dupa „claims”", () => {
  /* Aici era defectul. `/claims-gulf/{id}/items/approve` contine „gulf" si e gresit. */
  assert.match(sursa, /claims\/\$\{encodeURIComponent\(claimId\)\}\/items`;/);
  assert.match(sursa, /\$\{baza\}\/approve-gulf` : `\$\{baza\}\/approve`/);
  assert.doesNotMatch(sursa, /claims-gulf\/\$\{encodeURIComponent\(claimId\)\}/, "nu dupa „claims”");
});

test("⚠ RESPINGEREA: are marcaj, si tot la sfarsit", () => {
  /* Inainte n-avea NICIUNUL: peticul nu s-a aplicat, si nimeni n-a observat. */
  assert.match(sursa, /\$\{baza\}\/issue-gulf` : `\$\{baza\}\/issue`/);
});

test("⚠ „sufixul regiunii” nu se mai intoarce", () => {
  /*
   * Nu se repara doar cele trei cai: se scoate IDEEA care le-a stricat. Un sufix generic lipit
   * dupa „claims" pare corect fiindca la citire chiar e — si atunci urmatorul capat adaugat il
   * va folosi la fel, gresit.
   */
  assert.doesNotMatch(sursa, /function sufixulRegiunii/);
  assert.doesNotMatch(sursa, /\$\{sufixulRegiunii\(/);
});

test("⚠ Europa ramane neatinsa", () => {
  /* Toata reparatia asta e pentru vitrine pe care nu le folosim inca. N-are voie sa miste
     nimic pe cele pe care le folosim. */
  for (const cale of [
    "`${baza}/claims`",
    "`${baza}/approve`",
    "`${baza}/issue`",
  ]) {
    assert.ok(sursa.includes(cale), `ramura europeana pentru ${cale}`);
  }
});
