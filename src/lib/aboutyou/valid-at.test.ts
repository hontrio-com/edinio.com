import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   `valid_at` SE TRIMITE, DUPA CE DOUA CITIRI INDEPENDENTE S-AU POTRIVIT (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Nota din cod scria, pe 26.08: „numele campului si contextul in care apare la ei sugereaza clipa
   in care valoarea comerciantului A DEVENIT valida, folosita ca o actualizare veche sa nu
   suprascrie una noua - dar documentatia lor e in spatele autentificarii de partener, deci n-am
   putut citi contractul". Deductia a fost apoi confirmata dintr-o citire separata a specificatiei
   lor curente. Doua citiri care nu s-au vazut una pe alta, si spun acelasi lucru.

   ⚠ DE CE CONTEAZA: loturile lor se prelucreaza ASINCRON. Trimitem stocul 5, apoi la o secunda
   stocul 3; daca al doilea se aseaza primul, la ei ramane 5 - si se vinde marfa care nu exista.
   Nicio paza construita pe ordinea in care NOI sondam nu poate opri asta: ordinea in care EI
   aplica e a lor.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");

test("⚠ marca de timp e a SCHIMBARII, nu a trimiterii", () => {
  /*
   * `new Date()` din clipa in care cronul scoate elementul din coada ar face doua loturi trimise
   * la o secunda distanta sa para amandoua „de acum", si n-ar deosebi nimic. Se trimite
   * `products.updated_at`.
   */
  assert.match(sync, /produs\.updated_at \?\? undefined/);
  assert.equal((sync.match(/produs\.updated_at \?\? undefined/g) ?? []).length, 2, "si la stoc, si la pret");
  /* Si campul chiar se cere din baza: fara el ar fi mereu `undefined` si nimic n-ar pleca. */
  assert.match(sync, /stock_quantity, updated_at"/);
});

test("⚠ campul pleaca in fiecare articol, nu pe lot", () => {
  /* Asa cere schema lor: `valid_at` sta langa `sku`, in fiecare intrare. */
  assert.match(sync, /lot\.map\(\(x\) => \(\{ \.\.\.x, \.\.\.\(validAt \? \{ valid_at: validAt \} : \{\}\) \}\)\)/);
  const client = readFileSync("src/lib/aboutyou/client.ts", "utf8");
  assert.match(client, /valid_at\?: string \| null \}\[\]/);
});

test("⚠ si tot nu se merge orbeste: un refuz limpede se reia FARA el", () => {
  /*
   * Chiar daca amandoua citirile ar fi gresite, cel mai rau caz e o cerere in plus - nu impingerea
   * de stoc oprita pentru toate magazinele, care era teama din nota veche.
   *
   * ⚠ Numai pe REFUZ LIMPEDE (4xx): acolo stim ca nu s-a intamplat nimic. Peste un raspuns
   * necunoscut, o retrimitere ar putea aplica de doua ori.
   */
  assert.match(sync, /if \(validAt && isAboutYouError\(res\) && eRefuzLimpede\(res\.status\)\) \{/);
  assert.match(sync, /trimite\(transa, undefined\)/);
  /* Si se SCRIE, ca sa nu para o hotarare buna: fara `valid_at` nu mai exista paza. */
  assert.match(sync, /fara paza impotriva reordonarii/);
});

test("⚠ reluarea se face o SINGURA data", () => {
  /* A doua oara `validAt` e `undefined`, deci conditia nu mai tine. Nu e o bucla. */
  const i = sync.indexOf("if (validAt && isAboutYouError(res) && eRefuzLimpede(res.status))");
  const bucata = sync.slice(i, i + 900);
  assert.equal((bucata.match(/eRefuzLimpede/g) ?? []).length, 1);
});

test("⚠ paza veche nu s-a scos: reordonarea se vede si din datele noastre", () => {
  /*
   * `valid_at` e leacul de la ei; detectarea reordonarii ramane a noastra si prinde si derive
   * venite din alte cauze. Doua paze care se suprapun nu se anuleaza.
   */
  assert.match(sync, /const maiNou = randuriCitite<\{ id: string \}>\(/);
  assert.match(sync, /"aboutyou\.lotMaiNouIncheiat"/);
});
