import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { deNumaratAcum, maiEDeNumarat, uitaAfisarileNumarate } from "./o-data-pe-vizita";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AFIȘĂRILE SE NUMĂRĂ PE TOATE SUPRAFEȚELE, ȘI O DATĂ PE VIZITĂ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECTUL PE CARE ÎL APĂRĂ PROBA ASTA A EXISTAT PE PRODUCȚIE, și a existat
 * cu un comentariu care spunea contrariul. `use-afisari-oferte.ts` scria că „tot
 * așa se numără și pe celelalte două suprafețe… deci cele trei suprafețe rămân
 * comparabile între ele în același contor”, iar `getCheckoutBumps` trimitea
 * cititorul la el. Baliza era însă legată doar la pagina de produs.
 *
 * Măsurat pe producție la 22.09.2026: `cross_sell` avea 405 afișări și 0
 * conversii, `order_bump` avea 0 afișări și 29 de conversii. Fiecare tip de
 * ofertă era numărat pe jumătate, și fiecare jumătate arăta ca o măsurătoare
 * întreagă — ecranul de Oferte nu avea de unde să spună că minte.
 *
 * ⚠ De-aia proba nu se uită la cine IMPORTĂ hook-ul, ci la cine îi LEAGĂ ref-ul
 * de un element: un hook importat și nechemat, sau chemat și cu ref-ul aruncat,
 * lasă contorul pe zero exact la fel.
 */

const RADACINA = path.resolve(process.cwd(), "src");
const cite = (p: string) => fs.readFileSync(path.join(RADACINA, p), "utf8");

/**
 * Cele patru suprafețe pe care un cumpărător poate vedea o ofertă, și
 * componenta care desenează fiecare.
 *
 * ⚠ Lista NU e scrisă de mână și atât — proba de mai jos o verifică împotriva
 * codului: orice fișier care cere oferte de la server trebuie să fie aici sau să
 * deseneze prin una din componentele de aici.
 */
const SUPRAFETE = [
  "components/storefront/sections/product/ProductPageClassic.tsx",
  "components/storefront/sections/product/ProductPageDetailed.tsx",
  "components/ministore/OrderBump.tsx",
  "components/ministore/CartRecommendations.tsx",
];

test("fiecare suprafață cheamă baliza ȘI îi leagă ref-ul de un element", () => {
  for (const f of SUPRAFETE) {
    const s = cite(f);
    assert.ok(s.includes('from "@/lib/offers/use-afisari-oferte"'), `${f}: nu aduce baliza`);

    // Numele sub care e prins ref-ul — luat din cod, nu presupus.
    const chemare = s.match(/const\s+(\w+)\s*=\s*useAfisariOferte\(/);
    assert.ok(chemare, `${f}: aduce baliza dar n-o cheamă`);
    const nume = chemare![1];

    // ⚠ PE ELEMENT, nu pe fișier: `ref={nume}` trebuie să apară pe un `<div`
    // sau pe altă etichetă. Fără asta, `gazda.current` rămâne null, baliza
    // cade pe ramura optimistă și numără fără să fi văzut cineva ceva.
    assert.ok(
      new RegExp(`ref=\\{${nume}\\}`).test(s),
      `${f}: cheamă baliza dar nu leagă \`${nume}\` de niciun element`,
    );
  }
});

/** Toate fișierele de cod din `src`, afară de probe. */
function fisiere(filtru: RegExp): { rel: string; s: string }[] {
  const out: { rel: string; s: string }[] = [];
  const mergi = (dir: string) => {
    for (const intrare of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, intrare.name);
      if (intrare.isDirectory()) { mergi(p); continue; }
      if (!filtru.test(intrare.name) || intrare.name.endsWith(".test.ts")) continue;
      out.push({ rel: path.relative(RADACINA, p).split(path.sep).join("/"), s: fs.readFileSync(p, "utf8") });
    }
  };
  mergi(RADACINA);
  return out;
}

test("nimeni nu numără afișări pe lângă baliză", () => {
  // `recordOfferImpressions` e calea publică spre contor. Chemată din altă
  // parte — de pildă dintr-o acțiune de server, „ca să fie sigur” — jumătate din
  // afișări ar fi numărate după altă regulă, și cele două jumătăți n-ar mai fi
  // comparabile. Exact defectul reparat aici, întors pe dos.
  //
  // ⚠ CĂUTAREA E PE IMPORT, nu pe numele gol: numele apare și în comentariile
  // care explică regula, iar o probă care cade pe propriile ei explicații se
  // repară slăbind-o. Cine n-o importă n-o poate chema — afară de fișierul în
  // care e definită.
  const importa = /import\s*\{[^}]*\brecordOfferImpressions\b[^}]*\}\s*from/;
  const gasite = fisiere(/\.tsx?$/)
    .filter((f) => f.rel !== "lib/actions/offer.actions.ts" && importa.test(f.s))
    .map((f) => f.rel);
  assert.deepEqual(gasite, ["lib/offers/use-afisari-oferte.ts"]);
});

/**
 * Componenta care desenează ofertele de pe pagina de produs. NU cheamă ea
 * baliza: e învelită de `ref={refOferte}` în amândouă paginile de produs, care
 * sunt cele care știu dacă ecranul e demonstrativ (`demo`). Proba de mai jos
 * verifică învelirea, nu o presupune.
 */
const INVELITA = "components/ministore/ProductOffers.tsx";

test("orice ecran care ține oferte ori le numără, ori e desenat de unul care le numără", () => {
  /*
    ⚠⚠ PLASA CARE PRINDE O A CINCEA SUPRAFAȚĂ, și e întinsă pe TIPURI, nu pe
    numele acțiunilor de citire. Un ecran nou care primește ofertele ca prop —
    fără să cheme el `getCheckoutBumps` sau `getCartCrossSell` — ar fi scăpat
    printr-o plasă pusă pe numele cererii, și ar fi rămas pe zero afișări, tăcut,
    exact cum a stat `order_bump` până azi.

    `ResolvedOffer` și `OfferProduct` sunt singurele forme prin care o ofertă
    ajunge sub ochii unui cumpărător. Cine le atinge într-o componentă de browser
    desenează oferte.
  */
  const DESENATORI = ["<OrderBump", "<CartRecommendations", "<ProductOffers"];
  const vinovate = fisiere(/\.tsx$/)
    .filter((f) => f.s.startsWith('"use client"'))
    .filter((f) => /\b(ResolvedOffer|OfferProduct)\b/.test(f.s))
    .filter((f) => !SUPRAFETE.includes(f.rel) && f.rel !== INVELITA)
    .filter((f) => !DESENATORI.some((d) => f.s.includes(d)))
    .map((f) => f.rel);
  assert.deepEqual(vinovate, [], `țin oferte dar nu le numără: ${vinovate.join(", ")}`);
});

test("fiecare bucată de ecran cu oferte stă sub ref-ul balizei EI", () => {
  /*
   * `ProductOffers` și `SetulDeLangaPret` sunt scutite de baliză fiindcă o poartă
   * părintele. Dacă vreo pagină de produs încetează să le mai deseneze — sau le
   * scoate de sub înveliș — scutirea de mai sus ar acoperi componente care nu se
   * mai numără de nicăieri.
   *
   * ⚠⚠ DOUĂ BUCĂȚI DE AZI, deci două perechi înveliș/baliză: setul poate sta
   * lângă preț (22.09.2026), iar recomandările rămân jos. Vezi
   * `setul-se-aseaza-si-se-numara-la-fel.test.ts` pentru regula împărțirii.
   */
  for (const f of SUPRAFETE.filter((x) => x.includes("ProductPage"))) {
    const s = cite(f);
    for (const [inveliz, sectiune] of [
      ["ref={refOferteJos}", "<ProductOffers"],
      ["ref={refSetSus}", "<SetulDeLangaPret"],
    ] as const) {
      assert.ok(s.includes(sectiune), `${f}: nu mai desenează ${sectiune}`);
      const ref = s.indexOf(inveliz);
      const la = s.indexOf(sectiune);
      assert.ok(ref !== -1 && ref < la, `${f}: ${sectiune} nu stă sub ${inveliz}`);
    }
  }
});

test("o ofertă văzută de două ori în aceeași vizită se numără o dată", () => {
  const deja = new Set<string>();
  assert.deepEqual(deNumaratAcum(["A", "B"], deja), ["A", "B"]);
  // Sertarul de coș redeschis: aceleași oferte, nicio afișare nouă.
  assert.deepEqual(deNumaratAcum(["A", "B"], deja), []);
  assert.equal(maiEDeNumarat(["A", "B"], deja), false);
});

test("lista care se subțiază și se îngroașă la loc nu renumără ce n-a plecat", () => {
  // Defectul concret: în formularul de comandă, scoaterea unei linii din coș
  // reface lista de bump-uri. „A,B” devine „A”, apoi iar „A,B”. Ținută ca un
  // singur șir, întoarcerea ar fi numărat din nou și pe A.
  const deja = new Set<string>();
  assert.deepEqual(deNumaratAcum(["A", "B"], deja), ["A", "B"]);
  assert.deepEqual(deNumaratAcum(["A"], deja), []);
  assert.deepEqual(deNumaratAcum(["A", "B"], deja), []);

  // O ofertă cu adevărat nouă se numără, chiar dacă vine lângă una veche.
  assert.equal(maiEDeNumarat(["A", "C"], deja), true);
  assert.deepEqual(deNumaratAcum(["A", "C"], deja), ["C"]);
});

test("întrebarea nu însemnează nimic", () => {
  // ⚠ Dacă `maiEDeNumarat` ar însemna, ofertele la care vizitatorul nu coboară
  // niciodată ar ieși din socoteală ca și cum le-ar fi văzut: hook-ul întreabă
  // la MONTARE și numără abia la intrarea în ecran.
  const deja = new Set<string>();
  assert.equal(maiEDeNumarat(["A"], deja), true);
  assert.equal(maiEDeNumarat(["A"], deja), true);
  assert.equal(deja.size, 0);
  assert.deepEqual(deNumaratAcum(["A"], deja), ["A"]);
});

test("id-urile goale nu ajung la contor", () => {
  const deja = new Set<string>();
  // `"".split(",")` dă `[""]`, iar un `""` trimis mai departe ar fi însemnat o
  // interogare inutilă pe fiecare ecran fără oferte.
  assert.deepEqual(deNumaratAcum([""], deja), []);
  assert.equal(maiEDeNumarat([""], deja), false);
  assert.equal(deja.size, 0);
});

test("mulțimea din modul e cea folosită când nu se dă alta", () => {
  // Proba asta atinge starea comună, deci o golește și după ea.
  uitaAfisarileNumarate();
  assert.deepEqual(deNumaratAcum(["Z"]), ["Z"]);
  assert.deepEqual(deNumaratAcum(["Z"]), []);
  uitaAfisarileNumarate();
  assert.deepEqual(deNumaratAcum(["Z"]), ["Z"]);
  uitaAfisarileNumarate();
});
