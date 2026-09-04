import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/*
  ═══ FIECARE PAGINĂ TREBUIE SĂ AJUNGĂ LA O FOAIE DE STIL ═══

  Rădăcina (`app/layout.tsx`) NU importă nicio foaie, dinadins: site-ul de
  prezentare ar fi cărat utilitarele panoului pe fiecare pagină. În schimb,
  fiecare grup de rute și-o aduce pe a lui — `(website)` și `(ajutor)` pe
  `website.css`, restul pe `globals.css`.

  ⚠ IAR ASTA A LĂSAT O PAGINĂ PE DINAFARĂ, ȘI NIMIC N-A CĂZUT.
  `/preview-sectiune/[slug]` — miniaturile din galeria de design-uri — stă în
  afara lui `[slug]`, ca să nu ia pixelii de marketing și bannerul de cookies ale
  magazinului. Dar tot de acolo venea și `globals.css`: ruta îi e SORĂ, nu fiică.

  Măsurat în producție pe 04.09.2026, înainte de reparație: pagina încărca 65 de
  reguli CSS în total, iar `.flex`, `.items-center`, `.h-16` și `.gap-2` lipseau.
  Headerul avea `display: block` în loc de `flex`, butoanele se așezau unul sub
  altul, iar un cap de magazin de 64px raporta 1356px — deci fiecare card din
  galerie se întindea la peste 900px, cu conținut nestilizat înăuntru.

  Nimic nu putea să cadă: pagina răspundea 200, markup-ul era corect, clasele
  erau scrise corect. Lipsea doar foaia care le dă înțeles — iar asta nu se vede
  din niciun tip, din niciun lint și din niciun test care nu se uită ANUME.

  Proba de aici se uită anume: urcă pe lanțul de layout-uri al fiecărei pagini și
  cere să întâlnească un import de `.css`. E regula, nu reparația: o pagină nouă
  pusă mâine în afara grupurilor cade la fel.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "app");

/** Dosarele care conțin un `layout.tsx`/`template.tsx` ce importă o foaie. */
function dosareCuFoaie(dir: string, out = new Set<string>()): Set<string> {
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) {
      dosareCuFoaie(cale, out);
      continue;
    }
    if (nume !== "layout.tsx" && nume !== "template.tsx") continue;
    /* ⚠ Fără comentarii: `app/layout.tsx` EXPLICĂ în comentariu de ce nu importă
       CSS și pomenește chiar numele fișierelor. O scanare naivă l-ar fi socotit
       drept sursă de stil pentru toată aplicația — adică ar fi declarat totul în
       regulă exact fiindcă cineva a scris de ce nu e. */
    const sursa = readFileSync(cale, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    if (/import\s+"[^"]*\.css"/.test(sursa)) out.add(dir);
  }
  return out;
}

/** Dosarele care conțin o `page.tsx`. */
function dosareCuPagina(dir: string, out: string[] = []): string[] {
  let arePagina = false;
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) dosareCuPagina(cale, out);
    else if (nume === "page.tsx") arePagina = true;
  }
  if (arePagina) out.push(dir);
  return out;
}

const CU_FOAIE = dosareCuFoaie(APP);
const PAGINI = dosareCuPagina(APP);

/** Urcă din dosarul paginii până la `app`, căutând o foaie pe drum. */
function areFoaie(dosarPagina: string): boolean {
  let d = dosarPagina;
  for (;;) {
    if (CU_FOAIE.has(d)) return true;
    if (d === APP) return false;
    const sus = dirname(d);
    if (sus === d || !sus.startsWith(APP)) return false;
    d = sus;
  }
}

describe("nicio pagină fără foaie de stil pe lanțul ei de layout-uri", () => {
  test("proba nu e vidă: s-au găsit pagini ȘI layout-uri cu foaie", () => {
    assert.ok(PAGINI.length > 20, `doar ${PAGINI.length} pagini găsite`);
    assert.ok(CU_FOAIE.size >= 5, `doar ${CU_FOAIE.size} layout-uri importă o foaie`);
  });

  for (const dosar of PAGINI) {
    const scurt = dosar.slice(APP.length + 1).replace(/\\/g, "/") || "(rădăcina)";
    test(scurt, () => {
      assert.ok(
        areFoaie(dosar),
        `${scurt}/page.tsx nu ajunge la niciun import de CSS urcând pe layout-uri.\n` +
          "  Pagina va răspunde 200, cu markup și clase corecte, dar NESTILIZATĂ — nimic nu cade.\n" +
          "  Adaugă un `layout.tsx` care importă foaia potrivită: `website.css` pentru paginile de\n" +
          "  prezentare, `globals.css` pentru panou și magazine.",
      );
    });
  }
});

describe("unealta probei chiar poate cădea", () => {
  /*
    Fără rândurile astea, scanarea ar putea deveni tăcută — sau s-ar agăța de
    comentariul din `app/layout.tsx`, care pomenește chiar numele fișierelor de
    stil ca să explice de ce NU le importă.
  */
  const scoate = (t: string) =>
    t.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const gaseste = (t: string) => /import\s+"[^"]*\.css"/.test(scoate(t));

  test("prinde importul adevărat", () => {
    assert.equal(gaseste('import "../../globals.css";'), true);
    assert.equal(gaseste('import "../website.css";'), true);
  });

  test("NU se aprinde pe comentariul care explică de ce nu se importă", () => {
    assert.equal(
      gaseste('// ⚠ FĂRĂ import de CSS AICI — fiecare grup își importă foaia lui: `globals.css`.'),
      false,
      "s-a agățat de un comentariu de rând",
    );
    assert.equal(
      gaseste('/* Un import "./globals.css" aici ar aduce utilitarele peste tot. */'),
      false,
      "s-a agățat de un comentariu-bloc",
    );
  });

  test("rădăcina chiar NU importă nimic — altfel proba n-ar măsura nimic", () => {
    /* Dacă cineva pune la loc `import "./globals.css"` în `app/layout.tsx`,
       fiecare pagină trece automat și regula devine decorativă. Atunci trebuie
       recitită nota din rădăcină, nu ștearsă proba. */
    assert.ok(
      !CU_FOAIE.has(APP),
      "`app/layout.tsx` importă din nou o foaie — regula de mai sus nu mai măsoară nimic",
    );
  });
});
