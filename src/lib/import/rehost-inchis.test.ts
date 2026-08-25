import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   REHOSTAREA NU MAI DECLARA „GATA” PE O CADERE DE BAZA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Toate cele patru atingeri de baza din `rehostChunk` erau oarbe: `{ data }` fara `error`.
   PostgREST nu arunca la un refuz — intoarce `{ data: null, error }` — deci o singura
   interogare picata facea ca faza sa se declare INCHEIATA.

   ⚠ SI CE URMEAZA DUPA: apelantul vede `remaining === 0`, pune importul pe „completed" si
   cheama `anuntaCanalele`. Adica eMAG primeste produsul inainte ca starea lui la noi sa fie
   sigura, cu adresele furnizorului in loc de cele din R2. Cu `auto_publish` bifat, se si
   publica asa.

   ⚠ NU SE REPARA SINGUR. `images_done = true` si `status = "completed"` sunt fapte false
   scrise pe disc, iar randurile care le-ar fi contrazis se sterg doua linii mai jos. Cronul
   nu mai ridica jobul, si nimic nu recauta produse cu adrese externe.
*/

const cod = readFileSync("src/lib/import/committer.ts", "utf8");
const viu = cod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("citirea randurilor de rehostat nu mai e oarba", () => {
  assert.match(viu, /const \{ data: rows, error: eRows \}/);
  assert.match(viu, /if \(eRows\) \{[\s\S]{0,600}?remaining: 1, incert: true \}/,
    "si tine jobul in lucru, nu-l declara gata");
});

test("⚠ citirea produsului: randul se lasa NEATINS, ca sa fie reluat", () => {
  /* Fara asta, `product = null` insemna zero imagini, deci „nimic de rehostat" — si randul
     se marca `images_done: true` cateva linii mai jos. */
  assert.match(viu, /const \{ data: product, error: eProdus \}/);
  assert.match(viu, /if \(eProdus\) \{[\s\S]{0,500}?return;\s*\}/);
});

test("⚠ scrierea adreselor: cel mai scump, si singurul fara plasa", () => {
  /*
   * Imaginile sunt DEJA urcate in R2 si platite. Marcat „gata" pe o scriere picata,
   * adresele se pierd pentru totdeauna: cheia R2 se compune din `Date.now()` si
   * `Math.random()`, iar cache-ul traieste doar cat o bucata — deci nu se pot nici regasi,
   * nici recalcula.
   *
   * ⚠ Si e chiar cel mai PROBABIL dintre cele patru: biblioteca reincearca singura de trei
   * ori, dar numai pentru `GET`/`HEAD`. Un `update` e `PATCH`, explicit exclus.
   */
  assert.match(viu, /const \{ error: eScriere \} = await admin\.from\("products"\)\.update\(/);
  assert.match(viu, /if \(eScriere\) \{[\s\S]{0,500}?return;\s*\}/);

  /*
   * ⚠ Iar `images_done: true` trebuie sa ramana DUPA garda, nu inaintea ei.
   *
   * ⚠ Se cauta DE DUPA garda, nu de la inceput: marcajul apare de doua ori in functie —
   * o data la randul fara `product_id` (unde e corect, n-are ce rehosta) si o data la
   * sfarsit. Cautat de la zero, primul il gaseste pe cel dintai si proba ar fi picat
   * degeaba.
   */
  const iGarda = viu.indexOf("if (eScriere)");
  const iMarcaj = viu.indexOf('update({ images_done: true }).eq("id", row.id)', iGarda);
  assert.ok(iGarda > 0 && iMarcaj > iGarda, "marcajul sta dupa garda de scriere");
});

test("numaratoarea de la sfarsit nu mai transforma o cadere in zero", () => {
  assert.match(viu, /const \{ count: remaining, error: eRest \}/);
  assert.match(viu, /if \(eRest\) \{[\s\S]{0,600}?remaining: 1, incert: true \}/);
});

test("⚠ apelantul incheie faza NUMAI cand chiar stie", () => {
  /* Piesa care leaga totul: de aici pleaca `anuntaCanalele`. */
  assert.match(viu, /if \(remaining === 0 && !incert\) \{/);

  /*
   * ⚠ Numai pe RAMURA DE REHOSTARE. Faza de comitere are si ea un `if (remaining === 0)`,
   * si acolo e corect: nu exista `incert`, iar dupa ea nu pleaca niciun anunt catre canale.
   * O cautare pe tot fisierul ar fi cazut pe ea si ar fi cerut o reparatie inutila.
   */
  const iRehost = viu.indexOf('if (job.status === "rehosting_images")');
  const ramura = viu.slice(iRehost);
  assert.ok(iRehost > 0, "ramura de rehostare exista");
  assert.doesNotMatch(ramura, /if \(remaining === 0\) \{/, "forma veche, fara `incert`");
});

test("⚠ si `anuntaCanalele` chiar atarna de incheierea aceea", () => {
  /*
   * Proba asta nu verifica reparatia, ci MOTIVUL ei. Daca maine cineva muta anuntul in
   * alta parte, legatura se rupe si notele de mai sus devin mincinoase.
   */
  const iIncheiere = viu.indexOf("if (remaining === 0 && !incert)");
  const iAnunt = viu.indexOf("anuntaCanalele", iIncheiere);
  assert.ok(iIncheiere > 0 && iAnunt > iIncheiere, "anuntul catre canale sta sub incheiere");
});

test("nu s-a lasat nicio citire oarba in functie", () => {
  /*
   * ⚠ Cautare pe TOATA functia, nu pe cele patru locuri stiute: un al cincilea adaugat
   * maine ar cadea in aceeasi capcana, iar proba n-ar spune nimic.
   */
  const i = viu.indexOf("async function rehostChunk");
  const j = viu.indexOf("\n}", viu.indexOf("return { done: imagesDone"));
  const corp = viu.slice(i, j);
  const oarbe = corp.match(/const \{ (data|count)[^}]*\} = await/g) ?? [];
  for (const o of oarbe) {
    assert.match(o, /error/, `citire fara verificare de eroare: ${o}`);
  }
});
