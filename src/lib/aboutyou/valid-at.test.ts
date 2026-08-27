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
  /*
   * ═══ ⚠ SI NU DOAR `products.updated_at` (27.08.2026, seara) ═══
   *
   * Pretul nu vine mereu din `products`: la `manual_eur` vine din randul variantei, la
   * `fx_from_ron` depinde de curs. Marca de timp e maximul a tot ce influenteaza chiar valoarea.
   * Vezi `momentul-valorii.test.ts`.
   */
  assert.match(sync, /momentulValorii\(produs\.updated_at, variants,/);
  assert.equal((sync.match(/momentulValorii\(produs\.updated_at, variants,/g) ?? []).length, 2,
    "si la stoc, si la pret");
  /* Si campul chiar se cere din baza: fara el ar fi mereu `undefined` si nimic n-ar pleca. */
  assert.match(sync, /stock_quantity, updated_at"/);
});

test("⚠ campul pleaca in fiecare articol, nu pe lot", () => {
  /* Asa cere schema lor: `valid_at` sta langa `sku`, in fiecare intrare. */
  assert.match(sync, /lot\.map\(\(x\) => \(\{ \.\.\.x, \.\.\.\(validAt \? \{ valid_at: validAt \} : \{\}\) \}\)\)/);
  const client = readFileSync("src/lib/aboutyou/client.ts", "utf8");
  assert.match(client, /valid_at\?: string \| null \}\[\]/);
});

test("⚠ reluarea fara `valid_at` s-a scos, si de ce", () => {
  /*
   * ═══ ⚠ „REFUZ LIMPEDE" INSEAMNA ORICE 4xx (27.08.2026, seara) ═══
   *
   * Dimineata: la un refuz limpede se retrimitea fara `valid_at`. Dar acolo intra si
   * `400 Invalid price` - care n-are nicio legatura cu campul. Adica prima greseala de pret dintr-un
   * lot stingea TACUT chiar paza impotriva reordonarii, si o stingea pentru totdeauna, fiindca
   * urmatoarele trimiteri treceau pe aceeasi cale.
   *
   * ⚠ Si nu se poate inlocui cu o citire a mesajului lor: regula casei e ca esecul se clasifica
   * pe cod sau pe tip, niciodata pe text. Deci ori tinem campul dupa contract, ori nu-l trimitem
   * deloc. Il tinem.
   */
  assert.doesNotMatch(sync, /trimite\(transa, undefined\)/);
  assert.doesNotMatch(sync, /if \(validAt && isAboutYouError\(res\)/);
  /* Un refuz adevarat se vede acum ca refuz, cu mesajul lor cu tot. */
  assert.match(sync, /if \(isAboutYouError\(res\)\) return \{ ok: false, error: res\.error, status: res\.status \};/);
});

test("⚠ paza veche nu s-a scos: reordonarea se vede si din datele noastre", () => {
  /*
   * `valid_at` e leacul de la ei; detectarea reordonarii ramane a noastra si prinde si derive
   * venite din alte cauze. Doua paze care se suprapun nu se anuleaza.
   */
  assert.match(sync, /const maiNou = randuriCitite<\{ id: string \}>\(/);
  assert.match(sync, /"aboutyou\.lotMaiNouIncheiat"/);
});
