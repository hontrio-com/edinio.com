import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   COMUTATORUL CARE MINTE (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Aceeasi greseala in doua integrari, gasita in aceeasi zi:

     Trendyol — bifa „Sincronizeaza automat schimbarile de produs, stoc si pret" era
       PORNITA, iar 29 de listari adoptate (`auto_inventory = false`) nu trimiteau
       nimic. Comerciantul a aflat dintr-o comanda vanduta cu 39,99 pentru un produs
       care in magazin e 43,99.

     eMAG — comutatorul „Trimite automat pretul si stocul" era pornit, iar 3.714 din
       3.754 de oferte aveau `auto_sync = false`. Propozitia scrisa anume pentru cazul
       asta se citea din `status = 'imported'`, stare cu ZERO randuri, deci nu s-a
       afisat niciodata.

   In amandoua, steagul adevarat e cel pe care se FILTREAZA trimiterea. Numaratoarea de
   pe ecran trebuie sa citeasca acelasi lucru, altfel ecranul si fapta spun altceva.
*/

/**
 * Sursa fara comentarii.
 *
 * ⚠ Trebuie, fiindca notele care EXPLICA reparatia pomenesc chiar forma reparata. Fara
 * taiere, proba trecea sau cadea dupa ce scrie in comentarii, nu dupa ce face codul.
 */
function faraComentarii(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ 	]*\/\/.*$/gm, "");
}

test("eMAG: „preluate” se numara din `auto_sync`, nu dintr-o stare de trecere", () => {
  const sursa = faraComentarii("src/lib/actions/emag.actions.ts");
  assert.ok(
    !sursa.includes('stare("imported")'),
    "`imported` e o stare de trecere: reconcilierea o muta in cateva minute, deci numaratoarea iese mereu zero",
  );
  assert.ok(
    sursa.includes('.eq("auto_sync", false)'),
    "se numara chiar steagul pe care se filtreaza coada",
  );
});

test("Trendyol: „preluate” se numara din `auto_inventory`", () => {
  const sursa = faraComentarii("src/lib/actions/trendyol.actions.ts");
  assert.ok(
    sursa.includes('.eq("auto_inventory", false)'),
    "se numara chiar steagul pe care se opreste impingerea (`sync.ts`)",
  );
});

test("amandoua ecranele spun cate NU asculta de comutator", () => {
  /*
   * ⚠ Scris gri, ca nota de subsol, textul a trecut neobservat luni de zile pe amandoua.
   * Culoarea de avertisment nu e decor: e diferenta dintre „am citit" si „n-am vazut".
   */
  for (const [fisier, cheie] of [
    ["src/components/dashboard/EmagClient.tsx", "oferte.preluate"],
    ["src/components/dashboard/TrendyolClient.tsx", "counts.preluate"],
  ] as const) {
    const sursa = readFileSync(fisier, "utf8");
    const i = sursa.indexOf(`status.${cheie} > 0`);
    assert.notEqual(i, -1, `${fisier} nu arata deloc cate sunt preluate`);
    const bloc = sursa.slice(i, i + 2600);
    assert.ok(bloc.includes("amber"), `${fisier}: avertismentul e scris ca nota gri`);
    assert.ok(
      /onClick=\{pornes|onClick=\{porneș/.test(bloc),
      `${fisier}: se spune ca e o problema, dar nu se da nicio cale de reparat`,
    );
  }
});

test("pornirea in masa cere confirmare: rescrie preturi puse de om", () => {
  /*
   * ⚠ Cele preluate au pretul pus de comerciant DIRECT in panoul lor, poate dinadins
   * altul decat cel din magazin (comision, concurenta). Aprinderea sterge exact acea
   * hotarare, pe tot catalogul deodata.
   */
  for (const fisier of [
    "src/components/dashboard/EmagClient.tsx",
    "src/components/dashboard/TrendyolClient.tsx",
  ]) {
    const sursa = readFileSync(fisier, "utf8");
    assert.ok(sursa.includes("window.confirm("), `${fisier}: aprinde fara sa intrebe`);
  }
});
