import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ORICE PAGINĂ CARE POATE CHEMA `toast` TREBUIE SĂ AIBĂ UN `<Toaster>` DEASUPRA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E NEVOIE DE O PROBĂ, ȘI NU DE ATENȚIE. Pentru că greșeala e TĂCUTĂ.
  `toast.error("Eroare la initializarea platii.")` nu aruncă nimic când nu
  există niciun `<Toaster>` montat — sonner pune notificarea într-o coadă pe
  care n-o citește nimeni. Nu apare în consolă, nu cade nicio probă, build-ul e
  verde. Singurul simptom e un om care apasă un buton și nu vede nimic.

  ⚠ CE A FĂCUT-O NECESARĂ. Pe 31.08.2026 `<Toaster>` a fost mutat din
  `app/layout.tsx` (unde ajungea peste tot, inclusiv pe 28 de rute de prezentare
  care nu-l foloseau deloc) în cele cinci aspecte care chiar au nevoie de el.
  În clipa aia, `/reactivare` — singura rută din afara oricărui grup care cheamă
  `toast` — a rămas pentru un moment descoperită. Și tocmai acolo notificarea
  contează cel mai mult: un comerciant cu magazinul oprit, care încearcă să
  plătească.

  ⚠ CUM CAUTĂ. Urmărește importurile de la fișierul de rută în jos, prin `@/` și
  prin căi relative, până dă de `sonner`. Nu se uită după numele „toast" în text
  — un fișier care importă o componentă care importă alta care cheamă `toast` e
  la fel de vinovat, iar căutarea de text n-ar vedea asta.

  ⚠ CE NU ACOPERĂ: importurile dinamice (`next/dynamic`, `import()`). Astăzi nu
  există niciunul în `src/app` — se verifică mai jos, ca proba să cadă în ziua în
  care apare primul și cineva să vină să citească rândurile astea.
*/

const RAD = process.cwd();
const APP = join(RAD, "src/app");

const curat = (p: string) => relative(RAD, p).split(sep).join("/");

const cache = new Map<string, boolean>();

function rezolva(spec: string, dinFisier: string): string | null {
  let baza: string;
  if (spec.startsWith("@/")) baza = join(RAD, "src", spec.slice(2));
  else if (spec.startsWith(".")) baza = resolve(dirname(dinFisier), spec);
  else return null; // pachet din node_modules
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(baza + ext) && statSync(baza + ext).isFile()) return baza + ext;
  }
  return existsSync(baza) && statSync(baza).isFile() ? baza : null;
}

/** Ajunge fișierul ăsta la `sonner`, direct sau prin oricâte importuri? */
function atingeSonner(fisier: string): boolean {
  const gata = cache.get(fisier);
  if (gata !== undefined) return gata;
  cache.set(fisier, false); // taie ciclurile de importuri
  const sursa = readFileSync(fisier, "utf8");
  if (/from\s+["']sonner["']/.test(sursa)) {
    cache.set(fisier, true);
    return true;
  }
  for (const m of sursa.matchAll(/from\s+["']([^"']+)["']/g)) {
    const t = rezolva(m[1], fisier);
    if (t && atingeSonner(t)) {
      cache.set(fisier, true);
      return true;
    }
  }
  return false;
}

function toateFisierele(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...toateFisierele(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Are vreun aspect de la `dir` în sus un `<Toaster>` montat? */
function areToasterDeasupra(dir: string): string | null {
  let d = dir;
  for (;;) {
    const l = join(d, "layout.tsx");
    if (existsSync(l)) {
      const s = readFileSync(l, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (/<NotificariToast\b|<Toaster\b/.test(s)) return curat(l);
    }
    if (d === APP) return null;
    const sus = dirname(d);
    if (sus === d) return null;
    d = sus;
  }
}

const RUTE = toateFisierele(APP).filter((f) => /\/page\.tsx$/.test(curat(f)));

test("fiecare pagină care ajunge la `sonner` are un `<Toaster>` într-un aspect părinte", () => {
  const descoperite: string[] = [];
  let cuToast = 0;

  for (const f of RUTE) {
    if (!atingeSonner(f)) continue;
    cuToast++;
    if (!areToasterDeasupra(dirname(f))) descoperite.push(curat(f));
  }

  assert.ok(cuToast > 0, "nicio pagină nu ajunge la `sonner` — urmărirea importurilor s-a stricat");
  assert.deepEqual(
    descoperite,
    [],
    "paginile astea pot chema `toast` fără să aibă vreun `<Toaster>` deasupra. " +
      "Notificările lor NU se văd, și nimic nu dă eroare. " +
      "Pune `<NotificariToast />` în aspectul lor:\n  " +
      descoperite.join("\n  "),
  );
});

test("site-ul de prezentare și magazinele NU cară `sonner` degeaba", () => {
  /*
    Reversul: nu doar că toată lumea care are nevoie e acoperită, ci și că cine
    n-are nevoie nu plătește. Dacă cineva pune din nou `<Toaster>` în rădăcină,
    proba de sus rămâne verde — asta e cea care cade.
  */
  const radacina = readFileSync(join(APP, "layout.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    radacina,
    /<NotificariToast\b|<Toaster\b/,
    "`app/layout.tsx` e părintele TUTUROR rutelor. Un `<Toaster>` aici ajunge și " +
      "pe cele 28 de rute de prezentare și pe cele 15 de magazin, care nu cheamă " +
      "niciodată `toast`. Pune-l în aspectul grupului care are nevoie.",
  );

  for (const grup of ["(website)", "(ajutor)", "(landing)", "(public)"]) {
    const dir = join(APP, grup);
    if (!existsSync(dir)) continue;
    const ating = toateFisierele(dir)
      .filter((f) => /\/(page|layout)\.tsx$/.test(curat(f)))
      .filter(atingeSonner)
      .map(curat);
    assert.deepEqual(
      ating,
      [],
      `${grup} a început să importe \`sonner\`. Dacă e intenționat, grupul are ` +
        "nevoie de `<NotificariToast />` în aspectul lui — și atunci scoate-l de " +
        `aici. Rute:\n  ${ating.join("\n  ")}`,
    );
  }
});

test("nu au apărut importuri dinamice, pe care urmărirea nu le vede", () => {
  /*
    ⚠ MARGINEA PROBEI, SPUSĂ CU VOCE TARE. `next/dynamic` și `import()` rup lanțul
    de importuri pe care se bizuie totul mai sus. Azi nu există niciunul în
    `src/app`. Când apare primul, proba asta cade — nu fiindcă e greșit să-l
    folosești, ci ca să vină cineva să verifice de mână dacă ruta aia mai are
    `<Toaster>` deasupra.
  */
  const cu: string[] = [];
  for (const f of toateFisierele(APP)) {
    const nume = curat(f);
    /*
      ⚠ `route.ts` NU SE NUMĂRĂ, și nu e o scutire de convenență: un manipulator
      de rută întoarce un `Response`, nu randează niciodată React, deci nu poate
      avea și nu are nevoie de `<Toaster>`. Trei dintre ele chiar folosesc
      `import()` azi — Stripe, impersonare, încărcare de fișiere — și e în
      regulă. Ce contează aici e arborele care ajunge pe ecran.
    */
    if (/\/route\.tsx?$/.test(nume)) continue;
    const s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/from\s+["']next\/dynamic["']|[^.\w]import\s*\(/.test(s)) cu.push(nume);
  }
  assert.deepEqual(
    cu,
    [],
    "importuri dinamice în `src/app` — urmărirea de mai sus nu le poate urma. " +
      "Verifică de mână că rutele astea au `<Toaster>` deasupra dacă folosesc " +
      `\`toast\`, apoi mută-le pe lista de excepții:\n  ${cu.join("\n  ")}`,
  );
});
