import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CARE GRUP DE RUTE ÎNCARCĂ CE FOAIE DE STIL
  ═══════════════════════════════════════════════════════════════════════════

  Pe 31.08.2026 foaia unică s-a despărțit în două. Măsurătoarea care a cerut-o:
  din 274.046 de octeți de CSS livrați fiecărei pagini, 192.398 — 70% — nu erau
  atinși de nicio pagină de prezentare. Erau utilitare de panou: `input-group`,
  `switch`, `tabs-list`, `combobox`, calendarul, 190 de reguli de temă întunecată.

      globals.css   panou, admin, autentificare, onboarding, magazine, /reactivare
      website.css   (website), (ajutor)

  Amândouă importă `stil-comun.css`, deci regulile scrise de mână sunt scrise o
  singură dată. Diferă doar ce scanează Tailwind.

  Rezultat măsurat pe build: paginile de prezentare 45.277 → 22.389 octeți gzip.
  Magazinele: 288.090 → 287.995, adică neatinse, cum trebuia.

  ⚠ TREI LUCRURI POT STRICA ASTA TĂCUT, ȘI TOATE TREI SUNT APĂRATE MAI JOS.
*/

const RAD = process.cwd();
const APP = join(RAD, "src/app");
const curat = (p: string) => relative(RAD, p).split(sep).join("/");

/** Ce foaie importă fișierul, dacă importă vreuna. */
function foaiaImportata(fisier: string): string | null {
  const s = readFileSync(fisier, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const m = s.match(/^\s*import\s+["']([^"']*\.css)["']\s*;?\s*$/m);
  return m ? m[1].split("/").pop()! : null;
}

const PREZENTARE = ["(website)", "(ajutor)"];
const APLICATIE = ["(auth)", "(dashboard)", "(admin)", "(onboarding)", "(public)/[slug]", "reactivare"];

test("fiecare grup de rute importă foaia care i se cuvine", () => {
  const gresite: string[] = [];

  for (const g of PREZENTARE) {
    const l = join(APP, g, "layout.tsx");
    if (!existsSync(l)) continue;
    const f = foaiaImportata(l);
    if (f !== "website.css") gresite.push(`${g}/layout.tsx importă ${f ?? "nimic"}, aștept website.css`);
  }
  for (const g of APLICATIE) {
    const l = join(APP, g, "layout.tsx");
    if (!existsSync(l)) continue;
    const f = foaiaImportata(l);
    if (f !== "globals.css") gresite.push(`${g}/layout.tsx importă ${f ?? "nimic"}, aștept globals.css`);
  }

  assert.deepEqual(
    gresite,
    [],
    "Un grup fără foaie se randează COMPLET NESTILIZAT, fără nicio eroare:\n  " + gresite.join("\n  "),
  );
});

test("`app/layout.tsx` NU importă nicio foaie de stil", () => {
  /*
    ⚠ E părintele tuturor rutelor. Un import aici aduce înapoi exact ce s-a
    despărțit: fiecare pagină de prezentare ar căra iar utilitarele panoului.
  */
  const f = foaiaImportata(join(APP, "layout.tsx"));
  assert.equal(
    f,
    null,
    `\`app/layout.tsx\` importă \`${f}\`. De acolo ajunge pe TOATE rutele și ` +
      "anulează despărțirea. Pune importul în aspectul grupului care are nevoie.",
  );
});

test("paginile speciale de la rădăcină nu importă nicio foaie de stil", () => {
  /*
    ⚠ ASTA A FOST GREȘEALA DE PRIMA ÎNCERCARE, prinsă doar fiindcă am pornit
    serverul și am cerut o pagină de magazin. `not-found.tsx`, `error.tsx` și
    `global-error.tsx` fac parte din arborele FIECĂREI rute — foaia lor se leagă
    peste tot. Cu `import "./website.css"` în ele, un magazin încărca ȘI
    273.951 ȘI 107.352 de octeți de CSS. Adică despărțirea înrăutățea exact
    paginile pe care nu trebuia să le atingă.

    Se stilizează în linie, din `lib/stil-pagina-simpla.ts`.
  */
  const vinovate: string[] = [];
  for (const n of ["not-found.tsx", "error.tsx", "global-error.tsx"]) {
    const p = join(APP, n);
    if (!existsSync(p)) continue;
    const f = foaiaImportata(p);
    if (f) vinovate.push(`${n} importă ${f}`);
  }
  assert.deepEqual(
    vinovate,
    [],
    "Fișierele astea stau în arborele fiecărei rute — foaia lor ajunge pe toată " +
      "platforma, inclusiv pe magazine. Stilizează-le în linie:\n  " + vinovate.join("\n  "),
  );
});

test("`website.css` scanează chiar dosarele din care se randează prezentarea", () => {
  /*
    ⚠ CE PĂȚEȘTI DACĂ LIPSEȘTE UN `@source`: utilitarele din acel dosar nu se
    generează. Pagina nu dă eroare — doar clasele alea nu fac nimic. Un `grid`
    care nu e grid, un `hidden` care nu ascunde.
  */
  const css = readFileSync(join(APP, "website.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const surse = [...css.matchAll(/@source\s+["']([^"']+)["']/g)].map((m) => m[1]);

  assert.ok(/source\(none\)/.test(css), "`website.css` nu mai are `source(none)` — scanează iar tot proiectul");

  const cerute = [
    "../app/(website)",
    "../app/(ajutor)",
    "../components/website",
  ];
  const lipsa = cerute.filter((c) => !surse.includes(c));
  assert.deepEqual(lipsa, [], "`@source` lipsă în `website.css`:\n  " + lipsa.join("\n  "));

  /*
    ⚠ PARTEA ASTA LIPSEA, ȘI COMENTARIUL DIN `website.css` O PROMITEA DEJA.
    Lista de mai sus e scrisă de mână: verifică trei dosare pe care le știm
    dinainte, nu ce importă CHIAR paginile. Așa a scăpat `components/ui/gauge-1`
    — încărcat cu `dynamic()` din `/optimizare`, deci randat pe prezentare fără
    să fie sub niciun `@source`. Clasa lui `fill-muted-foreground` apărea de zero
    ori în foaia livrată.

    De aici încolo lista se DERIVĂ din importuri, nu se mai ține minte.
  */
  const zonePrezentare = ["app/(website)", "app/(ajutor)", "components/website", "lib/website"];
  const fisiere: string[] = [];
  const adunaFisiere = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const it of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, it.name);
      if (it.isDirectory()) adunaFisiere(p);
      else if (/\.(tsx?|jsx?)$/.test(it.name)) fisiere.push(p);
    }
  };
  for (const z of zonePrezentare) adunaFisiere(join(RAD, "src", z));

  // `@/components/ui/x` — și în `import … from`, și în `dynamic(() => import(…))`.
  const importate = new Set<string>();
  for (const f of fisiere) {
    const txt = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const m of txt.matchAll(/["']@\/components\/ui\/([A-Za-z0-9_.-]+)["']/g)) importate.add(m[1]);
  }

  /* Un `@source` acoperă un fișier dacă e chiar el, sau un dosar care îl conține. */
  const caiSursa = surse.map((s) => join(APP, s));
  const acoperit = (fisier: string) =>
    caiSursa.some((c) => fisier === c || fisier.startsWith(c + sep));

  const neacoperite = [...importate]
    .map((nume) => {
      for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
        const p = join(RAD, "src/components/ui", nume + ext);
        if (existsSync(p)) return p;
      }
      // Poate fi dosar cu `index`, sau importul are deja extensia.
      const brut = join(RAD, "src/components/ui", nume);
      return existsSync(brut) ? brut : null;
    })
    .filter((p): p is string => !!p && !acoperit(p))
    .map(curat);

  assert.deepEqual(
    neacoperite,
    [],
    "Fișiere din `components/ui` folosite de prezentare, dar sub niciun `@source`.\n" +
      "Clasele lor NU se generează în `website.css`, iar pagina apare nestilizată\n" +
      "exact pe ele — fără nicio eroare:\n  " + neacoperite.join("\n  "),
  );

  /* Fiecare `@source` trebuie să existe pe disc — o cale greșită tace, nu cade. */
  const inexistente = surse
    .map((s) => ({ s, p: join(APP, s) }))
    .filter(({ p }) => !existsSync(p))
    .map(({ s }) => s);
  assert.deepEqual(
    inexistente,
    [],
    "`@source` care nu arată spre nimic — Tailwind nu se plânge, doar nu " +
      "generează nimic din el:\n  " + inexistente.join("\n  "),
  );
});

test("cele două foi împart aceleași reguli scrise de mână", () => {
  /*
    ⚠ Fără rândul ăsta, cineva ar putea copia `stil-comun.css` în două și cele
    două foi ar începe să devieze — o culoare schimbată în panou și rămasă veche
    pe site, sau invers. Regulile se scriu O SINGURĂ DATĂ.
  */
  for (const n of ["globals.css", "website.css"]) {
    const s = readFileSync(join(APP, n), "utf8");
    assert.match(
      s,
      /@import\s+["']\.\/stil-comun\.css["']/,
      `\`${n}\` nu mai importă \`stil-comun.css\`. Regulile scrise de mână trebuie ` +
        "să rămână într-un singur fișier, altfel cele două foi deviază tăcut.",
    );
  }
  assert.ok(
    statSync(join(APP, "stil-comun.css")).size > 50_000,
    "`stil-comun.css` e suspect de mic — s-au pierdut reguli la vreo mutare?",
  );
});

test("nicio altă pagină din `app/` nu importă direct o foaie de stil", () => {
  /*
    Foile se leagă din aspecte, nu din pagini. O pagină care își importă foaia
    ei o adaugă PESTE cea a grupului, deci vizitatorul descarcă două.
  */
  const gasite: string[] = [];
  const permise = new Set([
    "src/app/(website)/layout.tsx",
    "src/app/(ajutor)/layout.tsx",
    "src/app/(auth)/layout.tsx",
    "src/app/(dashboard)/layout.tsx",
    "src/app/(admin)/layout.tsx",
    "src/app/(onboarding)/layout.tsx",
    "src/app/(public)/[slug]/layout.tsx",
    "src/app/reactivare/layout.tsx",
  ]);

  const umbla = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) umbla(p);
      else if (e.name.endsWith(".tsx") && foaiaImportata(p) && !permise.has(curat(p))) gasite.push(curat(p));
    }
  };
  umbla(APP);

  assert.deepEqual(
    gasite,
    [],
    "Importuri de CSS în afara aspectelor de grup — se adaugă peste foaia " +
      "grupului, deci pagina descarcă două:\n  " + gasite.join("\n  "),
  );
});
