import { strict as assert } from "node:assert";
import { test } from "node:test";
import { faraComentarii } from "./fara-comentarii";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UNEALTA PE CARE SE SPRIJINA CELELALTE PLASE ISI ARE SI EA PLASA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE. Mai multe probe interzic sau cer o forma in sursa, si toate cauta prin
  `faraComentarii`. Daca ea se strica, ele nu cad — ele TAC, sau strigă pe propriile
  comentarii. O unealta gresita nu se vede in rosu, se vede in liniste.

  ⚠ CUM A IESIT LA IVEALA. Rulind mutanti pe ea: cel care oprea taierea blocurilor
  `/* … *​/` a fost prins de o proba care o foloseste, dar cel care oprea taierea
  randurilor `//` a trecut VERDE — nicio proba nu depindea de acea jumatate. Adica
  jumatate din unealta era nedovedita, si ar fi putut fi gresita de la inceput.
*/

test("⚠ taie amandoua felurile de comentariu", () => {
  /* ⚠ Saltul de rand RAMANE: se taie comentariul, nu randul pe care statea. */
  assert.equal(faraComentarii("a // b\nc"), "a \nc");
  assert.equal(faraComentarii("a /* b */ c"), "a  c");
  assert.equal(faraComentarii("a /* pe\nmai multe\nranduri */ c"), "a  c");
});

test("⚠ NU taie ce seamana a comentariu dar sta intr-un sir", () => {
  /*
    ⚠ ASTA E JUMATATEA CARE CONTEAZA. Un regex simplu ar taia de la `//` incolo si
    ar inghiti restul randului — deci un `https://…` dintr-un sir ar face ca tot ce
    urmeaza pe rand sa DISPARA din cautare. Adica un fals negativ: plasa ar tacea
    exact acolo unde codul are adrese, si nimeni n-ar afla.
  */
  const cod = 'const u = "https://exemplu.ro/a"; const v = 1;';
  assert.equal(faraComentarii(cod), cod, "sirul cu `//` a fost taiat ca un comentariu");

  assert.equal(faraComentarii("const s = '/* nu e comentariu */';"),
    "const s = '/* nu e comentariu */';");
  assert.equal(faraComentarii("const t = `un // sablon`;"), "const t = `un // sablon`;");
});

test("⚠ o evadare inghite si caracterul de dupa ea", () => {
  /*
    ⚠ CE APARA. `"a\\"b // c"` e UN singur sir. Fara regula evadarii, unealta ar
    crede ca sirul s-a inchis la a doua ghilimea si ar socoti `// c` drept
    comentariu — taind text care e chiar cod.
  */
  const cod = 'const s = "a\\"b // c"; const v = 1;';
  assert.equal(faraComentarii(cod), cod);
});

test("⚠ cazul care a nascut unealta: nota citeaza forma pe care codul o interzice", () => {
  /*
    Amandoua defectele adevarate dintr-o singura zi, puse fata in fata.
  */
  const codul = [
    "/*",
    '  Randul de sub el scria `session.currency ?? "ron"` — chiar turnarea interzisa.',
    "*/",
    'const moneda = monedaDeIncredere(session.currency);',
    '// pana azi: const baniiAuIntrat = session.payment_status === "paid";',
    "const baniiAuIntrat = true;",
  ].join("\n");

  const curat = faraComentarii(codul);

  /* Fals POZITIV inchis: forma interzisa nu mai e gasita in nota. */
  assert.ok(!/currency\s*\?\?\s*"ron"/.test(curat),
    "cautarea cade iar pe comentariul care explica reparatia");

  /* Fals NEGATIV inchis: forma ceruta nu mai e gasita intr-o nota, cand codul n-o are. */
  assert.ok(!/payment_status === "paid"/.test(curat),
    "cautarea vede iar in comentariu o conditie pe care codul n-o mai are");

  /* Si codul adevarat a ramas intreg. */
  assert.match(curat, /monedaDeIncredere\(session\.currency\)/, "s-a taiat si cod, nu doar comentarii");
});
