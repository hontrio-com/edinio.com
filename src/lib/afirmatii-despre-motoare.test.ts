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
 * „nu" ca negație, fără să se agațe de alt cuvânt.
 *
 * ⚠ NU `\b`, și e o capcană deja plătită o dată în fișierul ăsta: `\b` din
 * JavaScript e ASCII, deci „ș", „î", „ă" trec drept graniță de cuvânt. Aici s-ar
 * fi văzut invers decât la regula 3 — „nu" lipit de un diacritic ar fi fost citit
 * ca negație de sine stătătoare. Literele românești se scriu pe față.
 */
const NEGATIE = /(?:^|[^a-zăâîșțA-ZĂÂÎȘȚ])nu(?![a-zăâîșțA-ZĂÂÎȘȚ])/i;

/**
 * Un tipar interzis, dar numai când NU e negat.
 *
 * ⚠ FEREASTRA CUPRINDE ȘI POTRIVIREA, NU DOAR CE E ÎNAINTEA EI. O revizie
 * adversarială a măsurat de ce contează: la regula despre `llms.txt`, negația
 * cade CHIAR între cele două capete ale tiparului — „llms.txt **nu** ajută la
 * clasarea în Google" — deci o fereastră doar-de-dinainte n-ar fi văzut-o
 * niciodată. Iar propoziția aia e exact ce scrie omul azi, după clarificarea
 * Google din 2026: proba ar fi picat pe adevărul pe care ea îl apără.
 *
 * ⚠ ȘI E O FUNCȚIE, NU O PRIVIRE-ÎNAPOI. Prima scriere folosea `(?<!nu\s)` și
 * cădea pe „**Nu mai** aduc rezultate îmbogățite", fiindcă „mai" se strecoară
 * între „nu" și verb. O alarmă falsă pe chiar fraza corectă scrisă azi e cel mai
 * sigur drum către o regulă slăbită până la tăcere.
 */
function faraNegatie(tipar: RegExp, fereastra = 30) {
  assert.ok(tipar.global, `${tipar} n-are steagul g, deci matchAll ar arunca`);
  return (t: string): string | null => {
    for (const m of t.matchAll(tipar)) {
      const de_la = m.index ?? 0;
      const jur = t.slice(Math.max(0, de_la - fereastra), de_la + m[0].length);
      /* Doar propoziția curentă: un „nu" dintr-o frază deja încheiată nu neagă
         nimic aici. Când tiparul își are punctul lui („llms.txt"), tăietura cade
         înăuntru — și e bine așa, fiindcă restrânge, nu lărgește. */
      if (NEGATIE.test(jur.slice(jur.lastIndexOf(".") + 1))) continue;
      return m[0];
    }
    return null;
  };
}

/** Fiecare regulă: ce nu se mai poate spune, și ce se pune în loc. */
const INTERZISE: { nume: string; gaseste: (t: string) => string | null; deCe: string }[] = [
  {
    nume: "FAQ aduce rezultate îmbogățite",
    gaseste: faraNegatie(/aduc(?:e|ă)?\s+rezultate\s+îmbogățite/gi),
    deCe: "Rezultatele îmbogățite FAQ au dispărut complet pe 7 mai 2026. Spune ce fac ACUM.",
  },
  {
    nume: "data greșită a dispariției FAQ",
    /* Negat, e chiar corectura: „nu au fost scoase în 2023, ci restrânse la
       site-urile de stat și de sănătate" e propoziția pe care o scrii ca să
       repari greșeala — n-are voie să aprindă alarma care o cere. */
    gaseste: faraNegatie(/(?:scoase|eliminate|dispărut)\s+în\s+2023/gi),
    deCe: "2023 a fost RESTRÂNGEREA la site-uri de stat și de sănătate. Scoaterea completă: 7 mai 2026.",
  },
  {
    nume: "garanție că AI citează un anume format",
    /* „o citează ChatGPT", „îl citează Perplexity" — afirmația tare, la prezent
       și la persoana a treia. „pot cita" și „citează pasaje care…" rămân:
       primul e o posibilitate, al doilea o afirmație despre cum lucrează ele,
       nu despre noi. Iar „nu există nicio garanție că o citează ChatGPT" e chiar
       fraza cerută de `deCe` de mai jos — de aceea trece prin `faraNegatie`.

       ⚠ FĂRĂ `\b` LA ÎNCEPUT, și e o capcană măsurată: `\b` din JavaScript e
       ASCII, iar „î" nu e literă pentru el — deci „ îl citează" NU se potrivea,
       fiindcă între spațiu și „î" nu vede nicio graniță. Tiparul a lăsat să
       treacă exact forma pe care o vâna, iar proba mea de control a prins-o.
       Se cere explicit începutul sau un spațiu. */
    gaseste: faraNegatie(
      /(?:^|[\s(„"])(?:o|îl|il|le|îi)\s+citeaz[ăa]\s+(?:ChatGPT|Perplexity|AI Overviews|Google)/gi,
    ),
    deCe: "Nu există garanție că un format anume e citat. Spune ce NU poate fi citat, nu ce sigur e.",
  },
  {
    nume: "llms.txt ajută la Google",
    gaseste: faraNegatie(/llms\.txt[^.]{0,80}(?:ajut[ăa]|conteaz[ăa]|clasare)[^.]{0,40}Google/gi, 20),
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
      /* ⚠ Regula despre `llms.txt` N-AVEA NICIUN EXEMPLU AICI: trecea de doi
         ani fără să fie pusă vreodată să se aprindă. O regulă nedovedită e o
         regulă care poate fi deja moartă. */
      "Un llms.txt bine scris ajută la clasarea în Google.",
      "llms.txt contează pentru Google, deci merită întreținut.",
    ]) {
      assert.ok(prinde(rau), `n-a prins: ${rau}`);
    }
  });

  test("NU se aprinde pe frazele adevărate scrise azi", () => {
    /*
      ⚠ ULTIMELE TREI SUNT CHIAR CORECTURILE CERUTE DE `deCe`. O revizie
      adversarială le-a scris și a măsurat: aprindeau alarma. Adică proba cerea
      o frază pe care apoi o declara interzisă — iar omul care ar fi scris-o
      corect ar fi văzut suita roșie și ar fi slăbit regula ca să treacă.
    */
    for (const bun of [
      "În Google nu mai aduc nimic în plus: din 7 mai 2026 au dispărut complet.",
      "Nu mai aduc rezultate îmbogățite; rămân utile pentru cititor.",
      "Motoarele care răspund cu text citează pasaje care se țin pe picioarele lor.",
      "ChatGPT și Perplexity pot cita un pasaj care se înțelege singur.",
      "llms.txt nu e folosit de Google Search.",
      "Nu există nicio garanție că un anume format e citat.",
      "Nu au fost scoase în 2023, ci restrânse la site-uri de stat și de sănătate.",
      "Nu există nicio garanție că o citează ChatGPT sau Perplexity.",
      "llms.txt nu ajută la clasarea în Google Search.",
    ]) {
      assert.ok(!prinde(bun), `alarmă falsă pe: ${bun}`);
    }
  });
});
