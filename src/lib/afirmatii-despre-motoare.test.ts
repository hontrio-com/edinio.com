import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/*
  ═══ CE SPUNEM DESPRE MOTOARE TREBUIE SĂ FIE ADEVĂRAT ȘI MÂINE ═══

  Un audit din 04.09.2026 a găsit în cod trei afirmații care fuseseră adevărate
  când au fost scrise și nu mai erau:

    1. „rezultatele îmbogățite FAQ au fost scoase în 2023" — 2023 a fost
       RESTRÂNGEREA la site-uri de stat și de sănătate; scoaterea completă e din
       7 mai 2026. Data greșită făcea povestea să pară încheiată mai devreme
       decât a fost, iar cine o citea nu înțelegea de ce mai există nodul.
    2. „sunt exact bucata pe care ChatGPT, Perplexity sau AI Overviews o citează"
       — nu există nicio garanție oficială că un anume format e citat. Se poate
       spune ce NU poate fi citat (un pasaj care atârnă de restul textului),
       nu ce SIGUR e.
    3. despre `llms.txt` nu se afirma nimic fals — verificat rând cu rând — dar
       lipsea faptul că Google a clarificat în 2026 că nu-l folosește. Adăugat,
       ca nimeni să nu-l măsoare în poziții.

  ⚠ DE CE E O PROBĂ ȘI NU DOAR O CORECTURĂ. Afirmațiile astea se întorc: cineva
  scrie „aduce rezultate îmbogățite" din obișnuință, nimic nu cade, iar peste
  șase luni un om își scrie întrebările pentru un loc în Google care nu există.
  Un comentariu care minte e mai rău decât unul care lipsește — cine îl citește
  construiește pe el.

  ⚠ SE CAUTĂ ÎN TOT `src`, cod ȘI comentarii. Aici comentariile CONTEAZĂ: ele
  sunt exact locul unde stau afirmațiile. E singura probă din depozit care NU-și
  scoate comentariile înainte să se uite.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AICI, "..");

/** Toate fișierele de sursă, în afara probelor. */
function fisiere(dir: string, out: string[] = []): string[] {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const cale = join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "node_modules" || d.name === ".next") continue;
      fisiere(cale, out);
      continue;
    }
    if (!/\.tsx?$/.test(d.name)) continue;
    if (/\.test\.tsx?$/.test(d.name)) continue;
    out.push(cale);
  }
  return out;
}

const TOATE = fisiere(SRC);

/**
 * Fiecare regulă: ce nu se mai poate spune, și ce se pune în loc.
 *
 * ⚠ `gaseste` E O FUNCȚIE, NU O EXPRESIE, și am ajuns aici pe pielea mea. Prima
 * scriere folosea o privire-înapoi (`(?<!nu\s)`) ca să lase negația să treacă —
 * și cădea pe „**Nu mai** aduc rezultate îmbogățite", fiindcă „mai" se strecoară
 * între „nu" și verb. O alarmă falsă pe chiar fraza corectă scrisă azi e cel mai
 * sigur drum către o regulă slăbită până la tăcere.
 *
 * Negația se caută acum într-o fereastră de dinainte, nu lipită de verb.
 */
const INTERZISE: { nume: string; gaseste: (t: string) => string | null; deCe: string }[] = [
  {
    nume: "FAQ aduce rezultate îmbogățite",
    gaseste: (t) => {
      for (const m of t.matchAll(/aduc(?:e|ă)?\s+rezultate\s+îmbogățite/gi)) {
        const inainte = t.slice(Math.max(0, (m.index ?? 0) - 30), m.index).toLowerCase();
        /* „nu mai aduc", „nu aduc", „nu mai aduce" — toate sunt fraza CORECTĂ. */
        if (/\bnu\b[^.]{0,20}$/.test(inainte)) continue;
        return m[0];
      }
      return null;
    },
    deCe: "Rezultatele îmbogățite FAQ au dispărut complet pe 7 mai 2026. Spune ce fac ACUM.",
  },
  {
    nume: "data greșită a dispariției FAQ",
    gaseste: (t) => t.match(/(?:scoase|eliminate|dispărut)\s+în\s+2023/i)?.[0] ?? null,
    deCe: "2023 a fost RESTRÂNGEREA la site-uri de stat și de sănătate. Scoaterea completă: 7 mai 2026.",
  },
  {
    nume: "garanție că AI citează un anume format",
    /* „o citează ChatGPT", „îl citează Perplexity" — afirmația tare, la prezent
       și la persoana a treia. „pot cita" și „citează pasaje care…" rămân:
       primul e o posibilitate, al doilea o afirmație despre cum lucrează ele,
       nu despre noi.

       ⚠ FĂRĂ `\b` LA ÎNCEPUT, și e o capcană măsurată: `\b` din JavaScript e
       ASCII, iar „î" nu e literă pentru el — deci „ îl citează" NU se potrivea,
       fiindcă între spațiu și „î" nu vede nicio graniță. Tiparul a lăsat să
       treacă exact forma pe care o vâna, iar proba mea de control a prins-o.
       Se cere explicit începutul sau un spațiu. */
    gaseste: (t) =>
      t.match(/(?:^|[\s(„"])(?:o|îl|il|le|îi)\s+citeaz[ăa]\s+(?:ChatGPT|Perplexity|AI Overviews|Google)/i)?.[0] ?? null,
    deCe: "Nu există garanție că un format anume e citat. Spune ce NU poate fi citat, nu ce sigur e.",
  },
  {
    nume: "llms.txt ajută la Google",
    gaseste: (t) =>
      t.match(/llms\.txt[^.]{0,80}(?:ajut[ăa]|conteaz[ăa]|clasare)[^.]{0,40}Google/i)?.[0] ?? null,
    deCe: "Google a clarificat în 2026 că nu folosește llms.txt în Search.",
  },
];

describe("nicio afirmație învechită despre motoare", () => {
  test("proba nu e goală: s-au găsit fișierele", () => {
    assert.ok(TOATE.length > 300, `doar ${TOATE.length} fișiere de sursă`);
  });

  for (const regula of INTERZISE) {
    test(regula.nume, () => {
      const gasite: string[] = [];
      for (const cale of TOATE) {
        const text = readFileSync(cale, "utf8");
        const m = regula.gaseste(text);
        if (m) gasite.push(`${cale.slice(SRC.length + 1)} → „${m}"`);
      }
      assert.deepEqual(gasite, [], `${regula.deCe}\n  ` + gasite.join("\n  "));
    });
  }
});

describe("regulile chiar pot cădea, și nu se aprind pe adevăr", () => {
  /*
    ⚠ PARTEA ASTA E JUMĂTATE DIN PROBĂ. Un tipar prea larg ar face alarmă falsă
    pe chiar frazele corecte scrise azi — și atunci cineva l-ar slăbi până la
    tăcere. Se măsoară pe amândouă fețele, pe text scris aici.
  */
  const prinde = (t: string) => INTERZISE.some((r) => r.gaseste(t) !== null);

  test("prinde afirmațiile false", () => {
    for (const rau of [
      "Întrebările aduc rezultate îmbogățite în Google.",
      "FAQ-urile au fost scoase în 2023, deci nu mai contează.",
      "e bucata pe care o citează ChatGPT",
      "e fragmentul pe care îl citează Perplexity",
    ]) {
      assert.ok(prinde(rau), `n-a prins: ${rau}`);
    }
  });

  test("NU se aprinde pe frazele adevărate scrise azi", () => {
    for (const bun of [
      "În Google nu mai aduc nimic în plus: din 7 mai 2026 au dispărut complet.",
      "Nu mai aduc rezultate îmbogățite; rămân utile pentru cititor.",
      "Motoarele care răspund cu text citează pasaje care se țin pe picioarele lor.",
      "ChatGPT și Perplexity pot cita un pasaj care se înțelege singur.",
      "llms.txt nu e folosit de Google Search.",
      "Nu există nicio garanție că un anume format e citat.",
    ]) {
      assert.ok(!prinde(bun), `alarmă falsă pe: ${bun}`);
    }
  });
});
