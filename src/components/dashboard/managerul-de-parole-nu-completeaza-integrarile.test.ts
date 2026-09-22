import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * MANAGERUL DE PAROLE NU COMPLETEAZA SINGUR ECRANELE DE INTEGRARI (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECTUL PE CARE IL APARA PROBA. Aratat de el pe captura, pe
 * `/dashboard/features/ecolet`: doar intrand pe pagina, Chrome scria singur
 * emailul contului in CAUTAREA din capul panoului si parola salvata in campul
 * „Token". Omul credea ca e ceva la calculatorul lui.
 *
 * Nu era. Managerul de parole cauta in pagina un camp `type="password"`, il ia
 * drept camp de autentificare, si atunci completeaza si „utilizatorul": primul
 * camp de text de dinaintea lui. In panou, acela e bara de cautare din antet,
 * care sta pe FIECARE pagina. Deci defectul nu era al unei integrari, ci al
 * tuturor celor care cer un secret.
 *
 * ⚠ DE CE `new-password` SI NU `off`. Chrome IGNORA dinadins `autocomplete="off"`
 * pe campurile de parola, fiindca site-urile il puneau tocmai ca sa impiedice
 * managerele de parole. `new-password` e singura valoare pe care o asculta: ii
 * spune „aici se SCRIE un secret nou", deci nu completeaza nimic si nici nu mai
 * cauta un camp de utilizator.
 *
 * De-aia proba de mai jos respinge `off` LA FEL de tare ca lipsa lui: sase
 * campuri il aveau deja scris si se completau oricum.
 *
 * ⚠ REGULA, NU CABLAREA. Implicitul sta intr-un singur loc, `components/ui/input`,
 * dar un `<input>` brut il ocoleste, si chiar asa erau scrise zece campuri (cheia
 * Mailchimp, Brevo, Klaviyo, parola SMTP, eMAG, Trendyol, About You). Proba
 * intreaba DOSARUL de fiecare eticheta `<input>`, nu o lista de fisiere.
 */

const PANOURI = ["src/components/dashboard", "src/app/(dashboard)"];

function toateEcranele(dir: string): string[] {
  const iesire: string[] = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const cale = join(dir, intrare.name);
    if (intrare.isDirectory()) iesire.push(...toateEcranele(cale));
    else if (intrare.name.endsWith(".tsx") && !intrare.name.endsWith(".test.tsx")) iesire.push(cale);
  }
  return iesire;
}

/**
 * Eticheta de deschidere a fiecarui `<input …>`, de la `<input` pana la `>`-ul
 * care o inchide cu adevarat.
 *
 * ⚠ NU SE POATE CU `/<input[^>]*>/`: aproape fiecare camp are
 * `onChange={(e) => …}`, iar sageata contine un `>`. Cu regexul acela, eticheta
 * se taia la mijloc, `autoComplete` ramanea in afara ei, si proba ar fi raportat
 * curate chiar campurile stricate. Pierdut o data pe drum; de-aia se numara
 * acoladele si sirurile.
 */
function etichetePentruParole(sursa: string): { text: string; rand: number }[] {
  const gasite: { text: string; rand: number }[] = [];
  const re = /<input\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sursa)) !== null) {
    let i = m.index;
    let acolade = 0;
    let ghilimea: string | null = null;
    for (; i < sursa.length; i++) {
      const c = sursa[i];
      if (ghilimea) { if (c === ghilimea && sursa[i - 1] !== "\\") ghilimea = null; continue; }
      if (c === '"' || c === "'" || c === "`") { ghilimea = c; continue; }
      if (c === "{") acolade++;
      else if (c === "}") acolade--;
      else if (c === ">" && acolade === 0) break;
    }
    const text = sursa.slice(m.index, i + 1);
    if (text.includes('type="password"')) {
      gasite.push({ text, rand: sursa.slice(0, m.index).split("\n").length });
    }
  }
  return gasite;
}

/* ══ 1. Mostra: scanerul chiar vede peste sageata din `onChange` ═══════════ */

test("⚠ scanerul nu se opreste la `>`-ul din `() =>`, altfel ar raporta curat orice", () => {
  const mostra = [
    '<input type="password" value={x} onChange={(e) => set(e.target.value)} autoComplete="new-password" />',
    '<input type="password" value={y} onChange={(e) => set(e.target.value)} />',
    '<input type="text" value={z} />',
  ].join("\n");

  const gasite = etichetePentruParole(mostra);
  assert.equal(gasite.length, 2, "n-a gasit exact cele doua campuri de parola din mostra");
  assert.ok(
    gasite[0].text.includes("autoComplete"),
    "eticheta s-a taiat la sageata din `onChange`, deci `autoComplete` a ramas pe dinafara"
      + " si orice camp ar fi parut curat",
  );
  assert.ok(!gasite[1].text.includes("autoComplete"), "al doilea camp chiar n-are autoComplete");
});

/* ══ 2. Implicitul din componenta comuna ══════════════════════════════════ */

test("⚠⚠ `Input` pune singur `new-password` pe campurile de parola", () => {
  const sursa = readFileSync(join(process.cwd(), "src", "components", "ui", "input.tsx"), "utf8");
  assert.match(
    sursa,
    /autoComplete=\{type === "password" \? "new-password" : undefined\}/,
    "implicitul a disparut din `Input`; toate cele 26 de ecrane cu secrete se completeaza iar singure",
  );
  /*
    Pus INAINTE de `{...props}`, ca un camp care chiar vrea altceva sa poata cere.

    ⚠ SE CAUTA DOAR IN JSX, de dupa `return (`. Prima scriere cauta in tot
    fisierul si a picat pe LOC: chiar comentariul de deasupra lui `Input` scrie
    „`{...props}` vine dupa", iar sirul ala a fost gasit primul. Proba imi
    masura propriul comentariu. Vezi memoria `comentariul-fals-e-o-invitatie`.
  */
  const jsx = sursa.slice(sursa.indexOf("return ("));
  const pozImplicit = jsx.indexOf("autoComplete={type");
  const pozProps = jsx.indexOf("{...props}");
  assert.ok(pozImplicit >= 0 && pozProps > pozImplicit,
    "implicitul a ajuns DUPA `{...props}`, deci `/login` nu-si mai poate cere `current-password`");
});

/* ══ 3. Campurile scrise cu `<input>` brut, care ocolesc implicitul ════════ */

test("⚠⚠ orice camp de parola din panou isi spune `autoComplete`, si NU e `off`", () => {
  const vinovate: string[] = [];

  for (const radacina of PANOURI) {
    for (const fisier of toateEcranele(join(process.cwd(), radacina))) {
      const sursa = readFileSync(fisier, "utf8");
      if (!sursa.includes('type="password"')) continue;

      for (const eticheta of etichetePentruParole(sursa)) {
        const unde = `${fisier.replace(process.cwd(), "").split("\\").join("/")}:${eticheta.rand}`;
        const m = eticheta.text.match(/autoComplete="([a-z-]+)"/);
        if (!m) { vinovate.push(`${unde} (fara autoComplete)`); continue; }
        /*
          „current-password" e ingaduit: la schimbarea parolei contului si la
          stergerea lui, campul CHIAR cere parola de acum, iar acolo completarea
          din managerul de parole e ce trebuie sa se intample.
        */
        if (m[1] !== "new-password" && m[1] !== "current-password") {
          vinovate.push(`${unde} (autoComplete="${m[1]}")`);
        }
      }
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "Campuri de parola pe care managerul de parole le poate completa singur:\n  "
      + vinovate.join("\n  ")
      + "\nScrie `autoComplete=\"new-password\"` pe ele. `off` NU ajuta: Chrome il ignora"
      + " pe campurile de parola.",
  );
});

/* ══ 4. Cealalta jumatate: campul in care ajungea EMAILUL ══════════════════ */

test("⚠ cautarea din antet nu e campul de utilizator al nimanui", () => {
  const sursa = readFileSync(
    join(process.cwd(), "src", "components", "dashboard", "CautareGlobala.tsx"),
    "utf8",
  );
  assert.match(sursa, /autoComplete="off"/,
    "bara de cautare si-a pierdut `autoComplete`; acolo ajungea emailul contului");
});
