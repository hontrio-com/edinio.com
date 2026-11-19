import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FISIER_SURSE, continutulFisierului, fisiereleVitrinei } from "../../scripts/foaie-vitrina.mjs";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CARE GRUP DE RUTE ÎNCARCĂ CE FOAIE DE STIL
  ═══════════════════════════════════════════════════════════════════════════

  Pe 31.08.2026 foaia unică s-a despărțit în două. Măsurătoarea care a cerut-o:
  din 274.046 de octeți de CSS livrați fiecărei pagini, 192.398 — 70% — nu erau
  atinși de nicio pagină de prezentare. Erau utilitare de panou: `input-group`,
  `switch`, `tabs-list`, `combobox`, calendarul, 190 de reguli de temă întunecată.

      globals.css   panou, admin, autentificare, onboarding, /reactivare
      website.css   (website), (ajutor)
      vitrina.css   magazinele: (public)/[slug] și miniaturile din (public)/preview-sectiune
                    (din 19.11.2026; până atunci magazinele încărcau `globals.css`)

  Toate trei importă `stil-comun.css`, deci regulile scrise de mână sunt scrise o
  singură dată. Diferă doar ce scanează Tailwind. (Din 19.11.2026, regulile pe
  care le folosește DOAR site-ul de prezentare stau în `stil-site.css`, importat
  de primele două, nu și de `vitrina.css`.)

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
const APLICATIE = ["(auth)", "(dashboard)", "(admin)", "(onboarding)", "reactivare"];
/*
  ⚠ Din 19.11.2026 magazinele au foaia lor, `vitrina.css` (auditul temelor): aceleași reguli scrise de mână, dar cu
  utilitarele generate doar din fișierele la care ajung rutele magazinului. Până atunci încărcau `globals.css`, cu
  utilitarele întregului proiect în drumul primei afișări. Vezi nota din `app/vitrina.css`.
*/
const VITRINA = ["(public)/[slug]", "(public)/preview-sectiune"];

test("fiecare grup de rute importă foaia care i se cuvine", () => {
  const gresite: string[] = [];

  for (const g of VITRINA) {
    const l = join(APP, g, "layout.tsx");
    const f = existsSync(l) ? foaiaImportata(l) : null;
    if (f !== "vitrina.css") gresite.push(`${g}/layout.tsx importă ${f ?? "nimic"}, aștept vitrina.css`);
  }

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
  for (const n of ["globals.css", "website.css", "vitrina.css"]) {
    const s = readFileSync(join(APP, n), "utf8");
    assert.match(
      s,
      /@import\s+["']\.\/stil-comun\.css["']/,
      `\`${n}\` nu mai importă \`stil-comun.css\`. Regulile scrise de mână trebuie ` +
        "să rămână într-un singur fișier, altfel cele două foi deviază tăcut.",
    );
  }
  /*
    Din 19.11.2026 regulile site-ului de prezentare stau în `stil-site.css` (62 KB), iar `stil-comun.css` a rămas cu
    jetoanele și cu ce folosesc toate trei foile (41 KB). Pragurile apără amândouă jumătățile.
  */
  assert.ok(
    statSync(join(APP, "stil-comun.css")).size > 30_000,
    "`stil-comun.css` e suspect de mic — s-au pierdut reguli la vreo mutare?",
  );
  assert.ok(
    statSync(join(APP, "stil-site.css")).size > 40_000,
    "`stil-site.css` e suspect de mic: s-au pierdut reguli la vreo mutare?",
  );
});

/*
  ═══ REGULILE SITE-ULUI, ÎN AFARA FOII MAGAZINELOR (19.11.2026) ═══

  `stil-site.css` poartă regulile scrise de mână ale site-ului de prezentare (fundalul mesh, rama de iPhone, benzile de
  sigle…). Până pe 19.11.2026 stăteau în `stil-comun.css`, deci ajungeau și în foaia magazinelor: 2,6 KB gzip, 9% din
  ea, în drumul primei afișări, pentru clase pe care niciun magazin nu le folosește.
*/
test("`stil-site.css`: îl importă panoul și site-ul, imediat după `stil-comun.css`; magazinele nu", () => {
  const faraComentarii = (n: string) => readFileSync(join(APP, n), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const n of ["globals.css", "website.css"]) {
    assert.match(
      faraComentarii(n),
      /@import\s+"\.\/stil-comun\.css";\s*@import\s+"\.\/stil-site\.css";/,
      `\`${n}\` nu mai importă \`stil-site.css\` imediat după \`stil-comun.css\`: paginile lui pierd regulile site-ului`,
    );
  }
  assert.ok(!/stil-site\.css/.test(faraComentarii("vitrina.css")), "`vitrina.css` cară din nou regulile site-ului de prezentare");
});

test("⚠ nicio clasă din `stil-site.css` nu e folosită de vreun fișier al magazinelor", () => {
  /*
    ⚠ Ce apără: o componentă a vitrinei care ar începe să folosească o clasă de acolo (rama de iPhone într-un bloc, de
    pildă) ar arăta bine în panou și pe site și NESTILIZATĂ în magazin, fără nicio eroare. Regula trebuie atunci mutată
    în `stil-comun.css`.

    ⚠ Cinci clase de acolo sunt și cuvinte obișnuite (`banda`, `placa`, `rapid`, `google`, `iphone`): în vitrină apar ca
    nume de variabile, ca text („Livrare rapida”, „S-ar putea sa-ti placa”) și într-un tipar de `user-agent`, nu ca nume
    de clase. Pentru ele se caută doar forma de clasă: cuvântul întreg, într-un șir din valoarea unui `className` sau
    dintr-un apel `cn(` / `clsx(`.
  */
  /** Șirurile din valorile de clasă ale unui fișier: `className="…"`, `className={…}`, `cn(…)`, `clsx(…)`. */
  const sirurileDeClasa = (cod: string): string[] => {
    const valori: string[] = [];
    const inceput = /className=|\bcn\(|\bclsx\(/g;
    for (let m = inceput.exec(cod); m; m = inceput.exec(cod)) {
      const atribut = m[0] === "className=";
      let j = atribut ? m.index + m[0].length : m.index + m[0].length - 1;
      if (atribut && cod[j] === '"') { valori.push(cod.slice(j + 1, cod.indexOf('"', j + 1))); continue; }
      const [deschis, inchis] = atribut ? ["{", "}"] : ["(", ")"];
      if (cod[j] !== deschis) continue;
      const start = j;
      for (let adancime = 0; j < cod.length; j++) {
        if (cod[j] === deschis) adancime++;
        else if (cod[j] === inchis && --adancime === 0) break;
      }
      for (const sir of cod.slice(start, j).matchAll(/["'`]([^"'`]*)["'`]/g)) valori.push(sir[1].replace(/\$\{[^}]*\}/g, " "));
    }
    return valori;
  };
  const css = readFileSync(join(APP, "stil-site.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "");
  const clase = [...new Set([...css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]))];
  assert.ok(clase.length > 25 && clase.includes("iphone") && clase.includes("hero-mesh-blob"), `doar ${clase.length} clase citite din \`stil-site.css\``);
  const OBISNUITE = new Set(["banda", "placa", "rapid", "google", "iphone"]);
  const gasite: string[] = [];
  for (const fisier of fisiereleVitrinei()) {
    const cod = readFileSync(fisier, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const cuvinteDeClasa = new Set(sirurileDeClasa(cod).flatMap((s) => s.split(/\s+/)));
    for (const clasa of clase) {
      const folosita = OBISNUITE.has(clasa) ? cuvinteDeClasa.has(clasa) : new RegExp(`(?<![\\w-])${clasa}(?![\\w-])`).test(cod);
      if (folosita) gasite.push(`${curat(fisier)}: \`${clasa}\``);
    }
  }
  // Martor: unealta de mai sus chiar vede o clasă scrisă într-un `className` (altfel proba ar trece pe orice).
  assert.deepEqual(
    [...new Set(sirurileDeClasa('<i className="a iphone" /><b className={cn("x", ok ? `banda ${y}` : "z")} />').flatMap((s) => s.split(/\s+/)))].filter((c) => OBISNUITE.has(c)),
    ["iphone", "banda"],
  );
  assert.deepEqual(gasite, [], "clase ale site-ului folosite în vitrină (mută regula în `stil-comun.css`):\n  " + gasite.join("\n  "));
});

/*
  ═══ FOAIA MAGAZINELOR (19.11.2026) ═══

  `vitrina.css` generează utilitare doar din fișierele la care ajung rutele magazinului. Lista lor e în
  `vitrina-surse.css`, scris de `scripts/foaie-vitrina.mjs` din importuri. Două lucruri o pot strica în tăcere, și
  amândouă arată la fel: pagina răspunde 200, cu markup corect, dar clasele noi nu fac nimic.
*/
test("⚠⚠ `vitrina-surse.css` e la zi cu importurile rutelor magazinului", () => {
  const scris = readFileSync(FISIER_SURSE, "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    scris,
    continutulFisierului(),
    "Vitrina importă un fișier care nu e în `vitrina-surse.css` (sau lista ține unul șters). Clasele lui NU se\n" +
      "generează în foaia magazinelor, deci apar nestilizate fără nicio eroare. Rulează:\n" +
      "  node scripts/foaie-vitrina.mjs --scrie",
  );
});

test("`vitrina.css`: fără scanarea proiectului, cu aceleași importuri ca `globals.css` și cu sursele ei", () => {
  const faraComentarii = (n: string) => readFileSync(join(APP, n), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const vitrina = faraComentarii("vitrina.css");
  const globala = faraComentarii("globals.css");

  assert.match(vitrina, /@import\s+"tailwindcss"\s+source\(none\)/, "`vitrina.css` scanează iar tot proiectul: lipsește `source(none)`");
  assert.match(vitrina, /@import\s+"\.\/vitrina-surse\.css"/, "`vitrina.css` nu-și mai importă lista de surse");

  /*
    Aceleași foi de bază, în aceeași ordine: altfel magazinele ar primi alte reguli decât până la despărțire.
    `stil-site.css` (regulile site-ului de prezentare) e singura pe care vitrina NU o ia; vezi proba ei, mai sus.
  */
  const importuri = (css: string) => [...css.matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]).filter((i) => i !== "./vitrina-surse.css" && i !== "./stil-site.css");
  assert.deepEqual(importuri(vitrina), importuri(globala), "importurile de bază ale celor două foi au ajuns să difere");
  assert.match(vitrina, /@custom-variant dark \(&:is\(\.dark \*\)\);/);

  /*
    Clasele pe care le scrie editorul de text în HTML-ul comercianților (descrieri, pagini): nu apar neapărat în
    vreun fișier al vitrinei, deci se generează anume. Măsurat în producție pe 11.11.2026: singurele două.
  */
  const inline = /@source inline\("([^"]+)"\)/.exec(vitrina)?.[1].split(/\s+/) ?? [];
  for (const clasa of ["text-primary", "underline"]) assert.ok(inline.includes(clasa), `\`@source inline\` nu mai generează \`${clasa}\``);
});

test("fiecare sursă a foii magazinelor există, iar căile cu `[slug]` intră ca dosar", () => {
  const surse = [...readFileSync(FISIER_SURSE, "utf8").matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(surse.length > 300, `doar ${surse.length} surse: graful de importuri n-a mai fost parcurs`);
  const lipsa = surse.filter((s) => !existsSync(join(APP, s)));
  assert.deepEqual(lipsa, [], "`@source` care nu arată spre nimic (Tailwind tace):\n  " + lipsa.join("\n  "));
  /*
    ⚠ Tailwind citește `@source` ca TIPAR: `[slug]` ar însemna „o literă din s, l, u, g”, deci fișierul nu s-ar mai
    găsi, în tăcere. De aceea `(public)` intră întreg, ca dosar, și nicio altă cale nu are voie să poarte asemenea semne.
  */
  assert.ok(surse.includes("./(public)"), "dosarul `(public)` nu mai e sursă întreagă");
  const cuTipar = surse.filter((s) => /[[\]{}*?!]/.test(s));
  assert.deepEqual(cuTipar, [], "căi cu semne de tipar:\n  " + cuTipar.join("\n  "));
  // Câteva fișiere despre care știm sigur că se randează în magazin: unealta chiar le găsește.
  for (const sigur of ["../components/storefront/SectionRenderer.tsx", "../components/ministore/MiniStoreRenderer.tsx", "../components/storefront/sections/hero/HeroBanners.tsx", "../components/pages/BlockRenderer.tsx"]) {
    assert.ok(surse.includes(sigur), `${sigur} lipsește din surse`);
  }
});

test("nicio altă pagină din `app/` nu importă direct o foaie de stil", () => {
  /*
    Foile se leagă din aspecte, nu din pagini. O pagină care își importă foaia
    ei o adaugă PESTE cea a grupului, deci vizitatorul descarcă două.

    ⚠ LISTA E DE HOTARE, NU DE GRUPURI. `(public)/[slug]/layout.tsx` nu e un
    aspect de grup, și e aici de la început: e locul unde începe zona
    magazinelor. Regula cere ca fiecare intrare să fie primul aspect de pe lanțul
    ei care aduce o foaie — nu ca numele să fie între paranteze.

    Cele două probe se completează, și abia împreună spun „exact una":
    asta oprește ZERO-ul dublat, iar `foaia-de-stil-ajunge-la-pagini.test.ts`
    oprește pagina rămasă cu NICIUNA.
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
    /*
      ⚠ Miniaturile din galeria de design-uri. Stau DELIBERAT în afara lui
      `[slug]` — layout-ul magazinului injectează pixelii de marketing și
      bannerul de cookies, iar cardurile ar fi trimis câte un pageview în
      conturile comerciantului la fiecare încărcare.

      Dar tot de acolo venea și foaia: ruta îi e SORĂ lui `[slug]`, nu fiică, iar
      rădăcina nu importă nimic dinadins. Măsurat în producție pe 04.09.2026,
      pagina încărca 65 de reguli CSS și nu avea nici măcar `.flex` — headerul
      ieșea `display: block`, iar un cap de magazin de 64px raporta 1356px.

      Nu e cazul pe care regula de mai sus îl apără: aici nu se adaugă o a doua
      foaie peste alta, se aduce SINGURA. Vezi nota din chiar layout-ul acela.
    */
    "src/app/(public)/preview-sectiune/layout.tsx",
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
