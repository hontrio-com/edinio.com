import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN FISIER `"use server"` EXPORTA NUMAI FUNCTII ASYNC        (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ SI `tsc` NU PRINDE ASTA. Pe 21.09.2026 o constanta exportata dintr-un
 * fisier de actiuni (`export const CATI_DEODATA = 100`) a trecut de `npx tsc
 * --noEmit` fara o vorba, si a rupt compilarea abia la randarea paginii:
 *
 *     Only async functions are allowed to be exported in a "use server" file.
 *
 * Adica o pagina alba, gasita cu ochiul, nu de vreo plasa. Intr-un `push`
 * facut fara sa deschizi pagina, ar fi ajuns asa in productie — si CI-ul ar fi
 * prins-o abia la `next build`, dupa cateva minute.
 *
 * ⚠ Proba citeste fisierele, nu ruleaza nimic. E mai putin decat o compilare,
 * dar prinde exact ce se intampla in practica: cineva pune o constanta, un tip
 * sau un obiect de configurare langa actiunile lui, fiindca acolo il foloseste.
 *
 * ⚠ SI ARATA UNDE SE MUTA: intr-un fisier obisnuit din `lib/`, de unde il pot
 * importa si serverul, si browserul.
 */

const RADACINA = "src";

/** Toate fisierele `.ts`/`.tsx` din proiect. */
function toateFisierele(dir: string, out: string[] = []): string[] {
  for (const nume of readdirSync(dir)) {
    const p = join(dir, nume);
    if (statSync(p).isDirectory()) toateFisierele(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Fisierele care incep cu `"use server"`. */
const SERVER = toateFisierele(RADACINA)
  .map((f) => ({ f, text: readFileSync(f, "utf8") }))
  .filter(({ text }) => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(text));

test("⚠ chiar s-au gasit fisiere de actiuni, altfel proba n-are ce citi", () => {
  /* O cautare care nu gaseste nimic trece pe tacute. Vezi `ancora-negasita`. */
  assert.ok(SERVER.length > 30, `am gasit doar ${SERVER.length} fisiere „use server"`);
});

test("⚠⚠ niciun export care sa NU fie o functie async", () => {
  const vinovati: string[] = [];

  for (const { f, text } of SERVER) {
    /* Comentariile ies din calcul: un exemplu scris intr-un comentariu nu strica nimic. */
    const curat = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    for (const linie of curat.split("\n")) {
      const l = linie.trim();
      if (!l.startsWith("export")) continue;

      /* Ingaduite: functiile async si tipurile (care dispar la compilare). */
      if (/^export\s+async\s+function\s/.test(l)) continue;
      if (/^export\s+(type|interface)\s/.test(l)) continue;
      if (/^export\s+\{[^}]*\}\s*from\s/.test(l)) continue;
      if (/^export\s+type\s*\{/.test(l)) continue;

      vinovati.push(`${f}: ${l.slice(0, 90)}`);
    }
  }

  assert.deepEqual(
    vinovati, [],
    "exporturi care nu sunt functii async intr-un fisier „use server”.\n"
    + "Mută-le într-un fișier obișnuit din `lib/`, de unde le pot importa și serverul, și browserul:\n"
    + vinovati.join("\n"),
  );
});
