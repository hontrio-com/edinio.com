import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ORICE SCRIERE IN BAZA, PE CAILE DE MASURARE, TREBUIE SA-SI VADA EROAREA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FAPTUL. supabase-js NU ARUNCA la eroare de baza: intoarce `{ data, error }`.
  Deci `await baza.from(...).upsert(...)` intr-un `try` nu e pazit de nimic — o
  scriere respinsa trece drept reusita.

  ⚠ DE CE O PROBA PE SURSA, aici, cand de obicei nu ma incred in ele. Fiindca
  insusirea ceruta E chiar sintactica: „in aceeasi instructiune apare
  `.throwOnError()` sau se ia `error` din raspuns". Nu se cere ca ceva sa
  FUNCTIONEZE — asta e probat separat, prin executie, in `esecuri-tacute.test.ts`
  — ci ca paza sa EXISTE. Iar asta e singurul fel de plasa care prinde si codul
  scris peste sase luni.

  ⚠ SI DE CE NU E O CAUTARE CU FEREASTRA. Prima forma se uita 300 de caractere
  inainte si 500 dupa, si a dat si fals-pozitivi (`createHash().update()`) si
  fals-negativi (un `const { error }` din alta functie a aceluiasi fisier).
  Acum se taie chiar INSTRUCTIUNEA: de la `.from(` pana la `;`-ul de la adancime
  zero. Ce e in ea e in ea, ce e in afara nu conteaza.
*/

const DOSARE = [
  "src/lib/edinio-marketing",
  "src/app/api/consimtamant",
  "src/lib/admin-analytics",
];

const SCRIERI = ["insert", "update", "upsert", "delete"] as const;

/** Instructiunea care incepe la `de`, taiata la `;`-ul de la adancime zero. */
function instructiunea(s: string, de: number): string {
  let adanc = 0;
  for (let i = de; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") adanc++;
    else if (c === ")" || c === "]" || c === "}") adanc--;
    else if (c === ";" && adanc <= 0) return s.slice(de, i + 1);
  }
  return s.slice(de);
}

function fisiere(dir: string): string[] {
  const iesire: string[] = [];
  for (const it of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, it.name);
    if (it.isDirectory()) { iesire.push(...fisiere(p)); continue; }
    if (/\.tsx?$/.test(it.name) && !/\.test\.tsx?$/.test(it.name)) iesire.push(p);
  }
  return iesire;
}

test("⚠ nicio scriere in baza fara sa-si vada eroarea", () => {
  const vinovate: string[] = [];
  let cercetate = 0;

  for (const dosar of DOSARE) {
    for (const f of fisiere(join(process.cwd(), dosar))) {
      const s = readFileSync(f, "utf8");
      let i = s.indexOf(".from(");
      while (i >= 0) {
        const instr = instructiunea(s, i);
        const eScriere = SCRIERI.some((m) => instr.includes(`.${m}(`));
        if (eScriere) {
          cercetate++;
          const pazita = instr.includes(".throwOnError()") || /(const|let)\s*\{[^}]*\berror\b/.test(instr);
          if (!pazita) {
            const linie = s.slice(0, i).split(String.fromCharCode(10)).length;
            /* ⚠ Fara regex pentru backslash: scris intr-un heredoc, `\\` ajunge `\`
               si literalul ramane nedeschis. Vezi lectia din `rapoarte.test.ts`. */
            const cale = f.replace(process.cwd(), "").split(String.fromCharCode(92)).join("/");
            vinovate.push(`${cale}:${linie}`);
          }
        }
        i = s.indexOf(".from(", i + 6);
      }
    }
  }

  assert.ok(cercetate >= 5, `s-au gasit doar ${cercetate} scrieri — cautarea s-a stricat?`);
  assert.deepEqual(
    vinovate, [],
    "scrieri care nu-si vad eroarea (supabase-js NU arunca, deci `try` nu le apara): " + vinovate.join(", "),
  );
});
