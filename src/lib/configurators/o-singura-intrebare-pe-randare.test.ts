import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cache } from "react";

/**
 * Intrebarea „are magazinul asta vreun configurator?" se pune O DATA pe randare.
 *
 * ═══ ⚠ CE COSTA CAND NU ═══
 *
 * Pe o singura pagina de start se cheama de pana la cinci ori, din drumuri care nu se vad unul pe
 * altul: proiectia catalogului, pagina produsului, si CELE TREI locuri din `offers.ts` care aduc
 * produse pentru oferte. Pentru un magazin fara niciun configurator — masurat, 131 din 131 —
 * raspunsul „niciunul" opreste tot restul drumului, deci intrebarea asta E intreaga cheltuiala:
 * cinci dus-intorsuri la baza pe randare, toate cu acelasi raspuns gol.
 *
 * ═══ ⚠ DE CE PROBA E PE SURSA ═══
 *
 * Fiindca `cache` din React NU memoreaza in afara unei randari — masurat mai jos, chiar in proba.
 * Deduplicarea o porneste dispecerul pe care il aseaza randarea RSC, si el nu se poate ridica
 * intr-un proces de teste fara a monta tot fluxul. Deci ce se poate apara aici e FORMA care face
 * memorarea cu putinta, si mai ales cele doua feluri in care ea se stinge TACUT:
 * o a doua citire scrisa direct in corp, si un al doilea argument pe carligul memorat.
 */

const FISIER = path.resolve(process.cwd(), "src/lib/configurators/vitrina.ts");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

test("⚠ proba stie sa citeasca fisierul", () => {
  assert.ok(sursa().length > 5_000);
});

test("⚠ carligul e chiar `cache` din React", () => {
  const s = sursa();
  assert.match(s, /^import \{ cache \} from "react";$/m, "nu se importa `cache`");
  assert.match(
    s,
    /const configuratoareleActive = cache\(async \(/,
    "citirea celor active nu mai e memorata",
  );
});

test("⚠ intrebarea e SCRISA O SINGURA DATA", () => {
  /*
   * ⚠ Fisierul mai citeste `configuratoare` inca o data, dinadins: versiunea activa, cu starea
   * ceruta din nou ca sa se inchida fereastra dintre cele doua citiri. Deci nu se numara tabelul,
   * ci CHIAR forma intrebarii ieftine — `select("id")` pe magazin si pe stare.
   *
   * Mutantul care o dovedeste: intoarcerea citirii inline in `configuratoareleCuVerdict`. Codul ar
   * fi mers la fel, si ar fi platit iar cinci drumuri pe randare, fara ca nimic sa cada.
   */
  const s = sursa();
  const forma = /\.select\("id"\)\s*\n\s*\.eq\("business_id", businessId\)\s*\n\s*\.eq\("stare", "activ"\)/g;
  const cate = (s.match(forma) ?? []).length;
  assert.equal(cate, 1, `intrebarea ieftina e scrisa de ${cate} ori, nu o data`);
});

test("⚠ corpul CHEAMA carligul, nu interogheaza el", () => {
  const s = sursa();
  assert.match(s, /const active = await configuratoareleActive\(businessId\);/);
  assert.match(s, /if \(!active\.ok\) return \{ ok: false, harta: gol \};/);
  /* ⚠ Si ca „niciunul" ramane un raspuns CITIT (`ok: true`), nu o pana — el da steagul pe catalog. */
  assert.match(s, /if \(active\.ids\.size === 0\) return \{ ok: true, harta: gol \};/);
});

test("⚠ carligul primeste UN SINGUR argument: magazinul", () => {
  /*
   * ⚠ ASTA E GUARDA CARE CONTEAZA. `cache` cheieste pe TOATE argumentele, prin identitate. Un al
   * doilea parametru — lista de produse, clientul de baza, orice obiect facut la fiecare chemare —
   * ar da o cheie noua de fiecare data, si memorarea s-ar stinge fara sa cada nimic si fara sa se
   * vada in cod: aceleasi cinci drumuri, aceeasi forma, alt cost.
   */
  const s = sursa();
  const i = s.indexOf("const configuratoareleActive = cache(async (");
  assert.ok(i > 0, "carligul memorat lipseste");
  const capul = s.slice(i, s.indexOf("=> {", i));
  const parametri = capul.slice(capul.indexOf("(async (") + 8, capul.lastIndexOf("):"));
  assert.equal(
    parametri.trim().replace(/,$/, ""),
    "businessId: string",
    `carligul primeste \`${parametri.trim()}\`; orice al doilea argument stinge memorarea`,
  );
});

test("⚠ multimea IMPARTITA nu se schimba de nimeni", () => {
  /*
   * ⚠ Pana acum multimea se facea la fiecare chemare si era a chemarii. Memorata, ea e ACEEASI
   * pentru toate drumurile randarii: cine ar scoate un id din ea l-ar scoate si pentru cardul din
   * grila, si pentru pagina produsului. De aceea iese ca `ReadonlySet` — si de aceea `doarActive`
   * o cere tot asa.
   */
  const s = sursa();
  assert.match(s, /ids: ReadonlySet<string>/, "multimea impartita a redevenit scriibila");
  /*
   * ⚠ SE INTERZICE IN TOT FISIERUL, nu doar pe `idActive`, si asta e o hotarare cu pret.
   *
   * Prima forma numea variabila — `/\b(idActive|active\.ids)\.(add|delete|clear)\(/` — si a
   * SUPRAVIETUIT mutantului: `(idActive as Set<string>).delete("x")` nu incepe cu numele, deci
   * expresia nu potrivea nimic si stergerea din multimea impartita trecea verde. Orice guarda
   * scrisa pe un nume se ocoleste cu o paranteza sau cu un alias.
   *
   * ⚠ CE COSTA: fisierul nu mai poate scrie intr-o multime NICAIERI, nici intr-una a lui, facuta
   * pe loc. Azi nu are niciuna — hartile se compun cu `.set`, si ele raman libere. Cand va avea,
   * regula asta trebuie RESCRISA, nu stearsa: ce apara e multimea care iese din `cache`.
   */
  assert.equal(
    /\.(add|delete|clear)\(/.test(s),
    false,
    "se scrie intr-o multime in `vitrina.ts`; multimea celor active e IMPARTITA pe randare",
  );
  /* Si castul care ar deschide poarta inapoi. */
  assert.equal(
    /as Set<string>/.test(s),
    false,
    "un cast scoate `readonly` de pe multimea impartita",
  );
});

test("⚠ in afara unei randari NU memoreaza, si drumul ramane cel de dinainte", () => {
  /*
   * ⚠ Nu e o curiozitate: `vitrina.ts` e chemat si din cron (`abandoned-cart`) si de pe calea de
   * comanda. Daca `cache` ar fi memorat si acolo, un proces lung ar fi tinut un raspuns invechit
   * peste comenzi care nu au nicio legatura intre ele — un configurator oprit ar fi continuat sa
   * se vanda. Masurat aici, ca sa nu ramana o presupunere in comentariu.
   */
  let chemari = 0;
  const f = cache((x: number) => { chemari++; return x; });
  f(1); f(1); f(2);
  assert.equal(chemari, 3, "`cache` a inceput sa memoreze in afara unei randari; reciteste comentariul");
});
