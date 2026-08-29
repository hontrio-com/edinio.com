import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* ══════════════════════════════════════════════════════════════════════════
   O COLOANA CARE NU EXISTA NU STRICA UN CAMP — STRICA TOATA SCRIEREA
   ══════════════════════════════════════════════════════════════════════════

   31.08.2026. `removeRemote` din OLX scria piatra hotararii omului asa:

       .update({ olx_advert_id: null, status: "sters_de_om", url: null, … } as never)

   Coloana se cheama `olx_url`. `url` nu exista. PostgREST nu ignora campul in plus —
   respinge INTREAGA cerere cu `PGRST204`. Deci:

       omul apasa „Șterge anunțul" -> anuntul chiar dispare la OLX
       scrierea pietrei pica -> i se arata o eroare, desi la ei s-a facut
       iar din coada, aceeasi lucrare moare dupa cinci incercari
       si fara piatra, urmatoarea editare de pret recreeaza anuntul

   ⚠ NICIUNA DIN PORTILE OBISNUITE N-AVEA CUM S-O PRINDA. `as never` — pus ca sa treaca
   de tipurile generate — opreste tocmai verificarea care ar fi vazut-o. `tsc` tace,
   lintul tace, cele patru mii cinci sute de probe tac, build-ul trece. Se vede abia in
   productie, si numai daca cineva citeste eroarea.

   ⚠ Deosebirea fata de `scripts/tests/coloane-cerute-exista.mjs`: aceea intreaba BAZA
   (deci cere retea, si ruleaza inainte de push, pe patru tabele alese). Asta nu cere
   nimic: compara codul cu `database.types.ts`, care e tinut in acord cu productia de
   `scripts/verifica-tipuri-db.mjs --check`. Deci poate rula in fiecare suita, pe TOATE
   tabelele.
*/

const RADACINA = process.cwd();

/** Coloanele fiecarei tabele, din tipurile generate. */
function coloanePeTabela(): Map<string, Set<string>> {
  const tipuri = readFileSync(join(RADACINA, "src/types/database.types.ts"), "utf8");
  const out = new Map<string, Set<string>>();
  const re = /^ {6}([a-z][a-z0-9_]*): \{\n {8}Row: \{\n((?: {10}[a-z][a-z0-9_]*: [^\n]*\n)+)/gm;
  for (const m of tipuri.matchAll(re)) {
    const chei = [...m[2].matchAll(/^ {10}([a-z][a-z0-9_]*):/gm)].map((c) => c[1]);
    out.set(m[1], new Set(chei));
  }
  return out;
}

/**
 * Codul, cu comentariile si CONTINUTUL sirurilor inlocuite cu spatii.
 *
 * ⚠ Amandoua sunt necesare, si le-am uitat pe rand. Fara comentarii, cuvintele din notele
 * romanesti („dupa", „mana", „plata") ies drept chei. Fara siruri, un mesaj ca
 * `"Comanda oprita: oferta…"` face din `oprita` o coloana.
 *
 * Lungimea se pastreaza, ca indicii sa ramana ai fisierului adevarat.
 */
function doarCod(s: string): string {
  const out = s.split("");
  const sterge = (k: number) => { if (out[k] !== "\n") out[k] = " "; };
  /** Cate acolade adanc suntem in fiecare `${…}` deschisa, per sablon imbricat. */
  const sabloane: number[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "/" && s[i + 1] === "*") {
      const gasit = s.indexOf("*/", i + 2);
      const sf = gasit < 0 ? s.length : gasit + 2;
      for (let k = i; k < sf; k++) sterge(k);
      i = sf; continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      const gasit = s.indexOf("\n", i);
      const sf = gasit < 0 ? s.length : gasit;
      for (let k = i; k < sf; k++) sterge(k);
      i = sf; continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < s.length && s[k] !== c && s[k] !== "\n") {
        if (s[k] === "\\") { sterge(k); k++; }
        if (k < s.length) sterge(k);
        k++;
      }
      i = k + 1; continue;
    }
    if (c === "`") {
      /*
       * ⚠ Sablonul se parcurge pana la ghilimeaua lui, sarind peste `${…}` cu numararea
       * acoladelor. Prima varianta iesea din bucla la prima interpolare si lasa restul
       * sablonului NEGOLIT — deci acoladele de acolo dezechilibrau obiectul de mai incolo, iar
       * proba raporta drept coloane chiar campurile lui `return { ok: true, action: … }`.
       */
      let k = i + 1;
      while (k < s.length) {
        if (s[k] === "\\") { sterge(k); sterge(k + 1); k += 2; continue; }
        if (s[k] === "`") break;
        if (s[k] === "$" && s[k + 1] === "{") {
          sterge(k); sterge(k + 1);
          let adanc = 1; k += 2;
          while (k < s.length && adanc > 0) {
            if (s[k] === "{") adanc++;
            else if (s[k] === "}") adanc--;
            if (adanc === 0) sterge(k);
            k++;
          }
          continue;
        }
        sterge(k); k++;
      }
      i = k + 1; continue;
    }
    i++;
  }
  void sabloane;
  return out.join("");
}

/** Textul obiectului `{…}` care incepe la `i`, cu acoladele echilibrate. */
function obiectDeLa(s: string, i: number): string | null {
  let adanc = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") adanc++;
    else if (s[j] === "}" && --adanc === 0) return s.slice(i, j + 1);
  }
  return null;
}

/**
 * Cheile de la nivelul intai al unui obiect literal.
 *
 * ⚠ INAINTEA UNEI CHEI STA `{` SAU `,`, si nimic altceva. Prima varianta primea si spatiu sau
 * linie noua, si atunci a doua ramura a oricarui ternar trecea drept cheie:
 *
 *     status: hardFail ? esuat : reusit     ->  „coloana `esuat` nu exista"
 *     awb: gata ? numar : null              ->  „coloana `null` nu exista"
 *
 * Unsprezece plangeri false din unsprezece. O proba care striga degeaba se invata sa fie
 * ignorata, si atunci nu mai pazeste nimic.
 */
function cheiDeNivelUnu(obj: string): string[] {
  const chei: string[] = [];
  let adanc = 0;
  for (let j = 0; j < obj.length; j++) {
    const c = obj[j];
    if (c === "{" || c === "[" || c === "(") adanc++;
    else if (c === "}" || c === "]" || c === ")") adanc--;
    else if (adanc === 1) {
      let k = j - 1;
      while (k >= 0 && /\s/.test(obj[k])) k--;
      if (k < 0 || (obj[k] !== "{" && obj[k] !== ",")) continue;
      const m = /^([a-z][a-z0-9_]*)\s*:/.exec(obj.slice(j));
      if (m) { chei.push(m[1]); j += m[0].length - 1; }
    }
  }
  return chei;
}

function fisiere(rad: string): string[] {
  const out: string[] = [];
  const mers = (d: string) => {
    for (const nume of readdirSync(d)) {
      const p = join(d, nume);
      if (statSync(p).isDirectory()) { mers(p); continue; }
      if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
    }
  };
  mers(rad);
  return out;
}

test("⚠ fiecare coloana SCRISA exista in tabela ei", () => {
  const tabele = coloanePeTabela();
  assert.ok(tabele.size > 50, `am gasit doar ${tabele.size} tabele in tipuri — cititorul s-a stricat`);

  const gresite: string[] = [];
  let verificate = 0;
  for (const cale of [...fisiere(join(RADACINA, "src/lib")), ...fisiere(join(RADACINA, "src/app/api"))]) {
    const brut = readFileSync(cale, "utf8");
    const cod = doarCod(brut);
    /*
     * ⚠ Se CAUTA in textul brut si se CITESTE din cel golit. Golirea sterge si numele tabelei
     * dintre ghilimele, deci o cautare pe textul golit nu mai gaseste nimic — a gasit 29 de scrieri
     * din 541, iar proba a trecut multumita. `doarCod` pastreaza lungimea tocmai ca indicii sa fie
     * ai aceluiasi fisier.
     */
    for (const m of brut.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.(update|upsert|insert)\(\s*(\{|\[)/g)) {
      const coloane = tabele.get(m[1]);
      if (!coloane) continue;
      /*
       * ⚠ Si potrivirea trebuie sa fie in COD. Notele din depozit citeaza cod de exemplu
       * („admin.from("orders").update({ status: … })" ca sa arate ce NU se mai face), iar cautarea
       * pe textul brut le gaseste si pe alea. Acolo `cod` e numai spatii, deci decuparea o lua din
       * loc si inghitea urmatorul obiect adevarat.
       */
      if (cod[m.index!] !== ".") continue;
      let start = m.index! + m[0].length - 1;
      if (cod[start] === "[") {
        const k = cod.indexOf("{", start);
        if (k < 0 || k > start + 200) continue;
        start = k;
      }
      const obj = obiectDeLa(cod, start);
      if (obj === null) continue;
      verificate++;
      for (const cheie of cheiDeNivelUnu(obj)) {
        if (!coloane.has(cheie)) {
          const linie = brut.slice(0, m.index!).split("\n").length;
          gresite.push(`${cale.slice(RADACINA.length + 1).replace(/\\/g, "/")}:${linie} — `
            + `${m[2]} pe \`${m[1]}\` scrie \`${cheie}\`, care nu exista`);
        }
      }
    }
  }

  assert.ok(verificate > 400, `am verificat doar ${verificate} scrieri — cautarea s-a stricat`);
  assert.deepEqual(gresite, [],
    `PostgREST respinge INTREAGA scriere pentru o coloana necunoscuta, nu doar campul:\n  ${gresite.join("\n  ")}`);
});
