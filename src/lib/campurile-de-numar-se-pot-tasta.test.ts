import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Se poate CHIAR tasta in campurile de numar?
 *
 * ═══ ⚠ CE COSTA CAND NU SE POATE ═══
 *
 * Un `<input type="number">` CONTROLAT — cu `value` din stare si `onChange` care scrie inapoi —
 * mananca tastarea. Browserul intoarce sir GOL pentru starile intermediare: cine scrie „2,5"
 * apasa intai virgula, browserul da `""`, valoarea se goleste, campul se redeseneaza gol. In
 * Romania zecimalele se scriu cu virgula, deci defectul loveste tocmai forma obisnuita, si
 * loveste comerciantul care isi pune preturile — nu o margine.
 *
 * ═══ ⚠ DE CE O PROBA, SI NU DOAR REPARATIA ═══
 *
 * Fiindca s-a intamplat de DOUA ori. Prima data pe campul de numar al VITRINEI, unde a fost
 * reparat cu `camp-numar.ts`. A doua oara pe ecranele NOI ale builderului, unde cine le-a scris
 * n-avea de unde sti ca regula exista: douazeci de campuri, toate cu acelasi defect. A treia
 * oara se opreste aici.
 *
 * ⚠ Proba se uita la SURSA, fiindca harnasamentul ruleaza `node --test` fara JSX si fara DOM,
 * deci nu poate apasa o tasta. Pazeste alegerea, nu randarea.
 */

const PANOURI = path.resolve(process.cwd(), "src/components/dashboard/configurator");
const VITRINA = path.resolve(process.cwd(), "src/components/storefront/sections/product/_shared");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(fisier: string): string {
  return readFileSync(fisier, "utf8").replace(/\r\n/g, "\n");
}

/** Sursa fara comentarii: acolo `type="number"` e explicatia, nu defectul. */
function faraComentarii(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fisiereleDin(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join(dir, f));
}

test("niciun camp de numar al BUILDERULUI nu e `type=\"number\"`", () => {
  const vinovate = fisiereleDin(PANOURI).filter((f) => faraComentarii(sursa(f)).includes('type="number"'));
  assert.deepEqual(
    vinovate.map((f) => path.basename(f)),
    [],
    "campurile astea mananca virgula la tastare; se trec pe `IntrareNumar` din `./bucati`",
  );
});

test("niciun camp de numar al VITRINEI nu e `type=\"number\"`", () => {
  /*
   * ⚠ Aici defectul e si mai scump: nu comerciantul isi pierde cifra, ci CUMPARATORUL care isi
   * scrie dimensiunea. El n-are de unde sti ca trebuie sa scrie cu punct, si nici nu i-o spune
   * nimeni — campul pur si simplu nu retine ce a tastat.
   */
  const vinovate = fisiereleDin(VITRINA).filter((f) => faraComentarii(sursa(f)).includes('type="number"'));
  assert.deepEqual(vinovate.map((f) => path.basename(f)), []);
});

test("`IntrareNumar` isi ia dus-intorsul din modulul PROBAT, nu si-l scrie singura", () => {
  /*
   * ⚠ Regula „ce a tastat omul ramane pe ecran cat timp INSEAMNA acelasi lucru cu valoarea din
   * motor" e singura bucata care poate gresi tacut, si e probata in `camp-numar.test.ts`. Rescrisa
   * in componenta, ar fi iesit din raza probelor — `.tsx` nu se poate rula in harnasament.
   */
  const s = sursa(path.join(PANOURI, "bucati.tsx"));
  assert.match(s, /from "@\/lib\/configurators\/camp-numar"/, "componenta si-a rupt legatura cu modulul probat");
  for (const f of ["textulDeAratat", "dinText", "afisat", "conversia", "eStricat"]) {
    assert.ok(s.includes(f + "("), `\`${f}\` nu se mai foloseste; s-a rescris ceva de mana`);
  }
});

test("panourile nu-si mai convertesc unitatile de mana", () => {
  /*
   * ⚠ ASTA A FOST UN DEFECT ADEVARAT, nu doar o repetare. `Limite` din panoul de reguli isi scria
   * propriul dus-intors si stia DOAR de lungimi: `esteUnitateLungime(u) ? inLungime(...) : v`. Pe
   * un camp in kilograme, „cel mult 5" intra in motor ca 5 GRAME — o limita de o mie de ori mai
   * stransa, care taia orice raspuns, fara nicio eroare pe ecran.
   *
   * `conversia` din `camp-numar` stie si masa. Cine scrie a doua oara conversia de mana o va scrie
   * a doua oara pe jumatate, deci nu se mai scrie deloc: intra prin `unitate={...}`.
   */
  for (const f of fisiereleDin(PANOURI)) {
    const s = faraComentarii(sursa(f));
    assert.ok(
      !s.includes("inMilimetri(") && !s.includes("inGrame("),
      `${path.basename(f)} converteste iar de mana; unitatea se da lui \`IntrareNumar\``,
    );
  }
});
