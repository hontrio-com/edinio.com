import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* ══════════════════════════════════════════════════════════════════════════
   `.contains()` PE O COLOANA jsonb CERE UN SIR JSON, NU UN VECTOR (27.08.2026, noaptea)
   ══════════════════════════════════════════════════════════════════════════

   postgrest-js are trei ramuri in `contains()`: un SIR pleaca verbatim, iar un VECTOR devine
   `cs.{${value.join(",")}}` — sintaxa de array Postgres. Pe o coloana `jsonb`, aia e:

       22P02: invalid input syntax for type json

   Adica 400 la fiecare apel. Masurat prin clientul real, pe `aboutyou_batches.related_ids`:

       .contains("related_ids", [sk])                  -> EROARE 22P02
       .contains("related_ids", JSON.stringify([sk]))  -> ok, 3 randuri

   ⚠ SI NU DA O LISTA GOALA, CI ARUNCA. Trecute prin `randuriCitite`, cele trei apeluri gresite din
   `aboutyou/sync.ts` opreau asezarea lotului INAINTE sa se scrie starea listarii: produsul ramanea
   `pending` si nu se publica niciodata. Verificarea pusa ca sa nu se publice PREA DEVREME facea sa
   nu se publice DELOC. Doua zile, in productie, fara nicio urma in jurnal — fiindca mesajul scris
   de cron vorbeste despre „pasul care a picat", nu despre interogare.

   ⚠ DE CE O PROBA SI NU O NOTA: Trendyol AVEA nota, chiar cu „probat prin clientul real". About You
   s-a scris dupa aceea, din memorie, si a gresit oricum. Nota se citeste doar de cine deschide
   fisierul; proba de mai jos citeste TIPUL COLOANEI din baseline si se uita la fiecare apel din
   depozit, inclusiv la cele care nu existau cand a fost scrisa.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

/** Coloanele `jsonb` din baseline, dupa nume. Aceeasi coloana la doua tabele conteaza o data. */
function coloaneJsonb(): Set<string> {
  const out = new Set<string>();
  for (const linie of baseline.split(/\r?\n/)) {
    const m = /^\s{2}([a-z_][a-z0-9_]*)\s+jsonb\b/.exec(linie);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Coloanele care sunt vectori Postgres adevarati (`bigint[]`, `text[]`): acolo VECTORUL e corect. */
function coloaneVector(): Set<string> {
  const out = new Set<string>();
  for (const linie of baseline.split(/\r?\n/)) {
    const m = /^\s{2}([a-z_][a-z0-9_]*)\s+[a-z ]+\[\]/.exec(linie);
    if (m) out.add(m[1]);
  }
  return out;
}

function fisiereTs(dir: string, acc: string[] = []): string[] {
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) { fisiereTs(cale, acc); continue; }
    if (/\.tsx?$/.test(nume) && !/\.test\.tsx?$/.test(nume)) acc.push(cale);
  }
  return acc;
}

test("⚠ baseline-ul chiar spune ce coloane sunt jsonb", () => {
  /*
   * ⚠ O PROBA CARE NU GASESTE NIMIC TRECE MEREU. Daca tiparul de citire se strica — alt format de
   * dump, alta indentare —, cele doua multimi ies goale si proba de mai jos ar declara „curat"
   * exact cand nu mai vede nimic. Se cere sa vada macar coloanele despre care STIM.
   */
  const jsonb = coloaneJsonb();
  assert.ok(jsonb.has("related_ids"), "`related_ids` trebuie recunoscuta ca jsonb");
  assert.ok(jsonb.size > 20, `prea putine coloane jsonb citite (${jsonb.size}): tiparul s-a stricat`);
  assert.ok(coloaneVector().has("emag_ids"), "`emag_ids` e `bigint[]`, deci vector adevarat");
});

test("⚠ niciun `.contains()` pe o coloana jsonb nu primeste un vector", () => {
  const jsonb = coloaneJsonb();
  const vector = coloaneVector();
  const vinovate: string[] = [];

  for (const cale of fisiereTs("src")) {
    const cod = readFileSync(cale, "utf8");
    for (const m of cod.matchAll(/\.contains\(\s*"([a-z_][a-z0-9_]*)"\s*,\s*([^\n]*)/g)) {
      const [, coloana, argument] = m;
      /* Coloanele care sunt vectori Postgres adevarati vor CHIAR vectorul: acolo e corect. */
      if (vector.has(coloana) && !jsonb.has(coloana)) continue;
      if (!jsonb.has(coloana)) continue;
      /*
       * ⚠ Se cere forma de SIR. `JSON.stringify(...)` si un sablon sunt amandoua siruri; un
       * `[` deschis imediat dupa virgula e vectorul care arunca.
       */
      const eSir = /^\s*(JSON\.stringify|`|")/.test(argument);
      if (!eSir) vinovate.push(`${cale}: .contains("${coloana}", ${argument.trim().slice(0, 60)}`);
    }
  }

  assert.deepEqual(vinovate, [],
    "`.contains()` pe jsonb cere un sir JSON; vectorul da 22P02 si ARUNCA, nu intoarce gol");
});
