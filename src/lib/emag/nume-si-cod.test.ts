import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schimbaSiNumele } from "./mapping";

/* ══════════════════════════════════════════════════════════════════════════
   NUMELE SI CODUL NU SE SCHIMBA IN ACEEASI CERERE (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Regula lor, citita din raspunsurile reale ale productiei:

     „You are trying to change both part_number and name at the same time for id 285089.
      Existing part_number is [AVX-K6253-285089] and existing name is [Lesa Retractabila…]"

   ⚠ SI RASPUND 200. Verdictul iese `reusit_cu_observatii`, elementul PARASESTE coada, si
   totul pare dus — dar schimbarea nu s-a aplicat. Oferta ramane la ei cu numele si codul
   vechi, iar in Edinio scrie ca s-a trimis.

   Masurat pe 48 de ore, in jurnalul de cereri: cinci oferte. Putine — dar mecanismul
   loveste ORICE produs caruia i se schimba amandoua, si tocmai forma „200 cu observatie"
   il face sa nu se vada.

   ⚠ SE RENUNTA LA COD, NU LA NUME: numele il vede cumparatorul in lista lor, codul e al
   nostru, de regasire. Iar codul nu se pierde — la trecerea urmatoare numele va fi deja
   al lor, conditia cade, si codul pleaca singur.
*/

const NUME_LUNG = "x".repeat(300);

test("nume neschimbat: codul pleaca", () => {
  assert.equal(schimbaSiNumele({ titlu: "Lesa retractabila", numeLaEi: "Lesa retractabila" }), false);
});

test("nume schimbat: codul NU pleaca in aceeasi cerere", () => {
  assert.equal(schimbaSiNumele({ titlu: "Lesa retractabila 5m", numeLaEi: "Lesa retractabila" }), true);
});

test("⚠ „nu stim ce nume au” NU e „numele s-a schimbat”", () => {
  /*
   * Cea mai importanta dintre probe. Tratat ca „schimbat", un `nume_emag` gol ar fi oprit
   * codul de produs pentru TOATE ofertele noi — la publicare, cand nimic nu poate intra in
   * conflict fiindca oferta nici nu exista inca la ei.
   */
  assert.equal(schimbaSiNumele({ titlu: "Ceva", numeLaEi: null }), false);
  assert.equal(schimbaSiNumele({ titlu: "Ceva", numeLaEi: "" }), false);
  assert.equal(schimbaSiNumele({ titlu: "Ceva" }), false);
});

test("se compara pe textul TAIAT, nu pe cel intreg", () => {
  /*
   * ⚠ La eMAG pleaca numele taiat la limita lor, iar reconcilierea aduce inapoi exact
   * forma aceea. Comparat cu titlul intreg, un produs cu nume lung ar fi parut mereu
   * „schimbat" — si codul lui n-ar mai fi plecat NICIODATA.
   */
  const taiat = NUME_LUNG.slice(0, 255);
  assert.equal(
    schimbaSiNumele({ titlu: NUME_LUNG, numeLaEi: taiat }), false,
    "acelasi nume, doar ca al lor e cel taiat: nu e o schimbare",
  );
});

test("spatiile de la margini nu conteaza", () => {
  assert.equal(schimbaSiNumele({ titlu: "Ham M", numeLaEi: "  Ham M  " }), false);
});

/* ── Si chiar se foloseste ────────────────────────────────────────────────── */

test("incarcatura chiar omite codul cand numele se schimba", () => {
  const cod = readFileSync("src/lib/emag/mapping.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(
    cod, /\.\.\.\(schimbaSiNumele\(a\) \? \{\} : \{ part_number: a\.partNumber \}\)/,
    "codul trebuie sa lipseasca din incarcatura cand numele se schimba",
  );
  /* ⚠ Numele pleaca INTOTDEAUNA: renuntam la cod, nu la el. */
  assert.match(cod, /name: taiat\(a\.titlu, LIMITE_EMAG\.nume\),/);
});

test("numele lor chiar ajunge pana la hotarare", () => {
  /*
   * ⚠ Fara asta, `numeLaEi` ar fi mereu gol, `schimbaSiNumele` ar raspunde mereu `false`,
   * si reparatia ar fi doar o functie frumoasa pe care n-o cheama nimeni cu date.
   */
  const t = readFileSync("src/lib/emag/trimite.ts", "utf8");
  assert.match(t, /creat_de_edinio, nume_emag"/, "se citeste din baza");
  assert.match(t, /nume_emag: r\.nume_emag,/, "si se trece in identitate");

  const m = readFileSync("src/lib/emag/mapping.ts", "utf8");
  assert.match(m, /numeLaEi: ident\?\.nume_emag \?\? null,/, "si ajunge pe oferta");
});
