import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   INGUSTAREA ARE UN FUND, SI PE FUND SE STATEA PE LOC (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Reparatia de dimineata: cand fereastra are mai multe pagini decat citim, se ingusteaza si se
   reia, ca marcajul sa poata avansa. Dar `stransa` nu coboara sub `FEREASTRA_MINIMA_MS` — deci
   la fund se intorcea `latimeUrmatoare === latime`, la nesfarsit:

       fereastra de-o ora -> 3 pagini citite din 12 -> `ok = false`, latime = 1h
       fereastra de-o ora -> 3 pagini citite din 12 -> `ok = false`, latime = 1h
       ... pentru totdeauna

   ⚠ CE COSTA: marcajul nemiscat inseamna ca nu se mai citeste NICIODATA nimic — nici coada orei
   aceleia, nici retururile de maine. Aceeasi paguba pe care reparatia voia s-o inlature,
   reintrodusa exact acolo unde nu mai avea unde sa ingusteze.

   ⚠ CAND NU MAI POTI INGUSTA, CITESTE MAI MULT. `page` n-are plafon documentat, iar citirea
   cererilor are 1000 pe minut la ei. Douazeci de pagini pe o ora inseamna o mie de cereri intr-o
   ora la un singur magazin.
*/

const brut = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
const viu = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ la fundul ferestrei se citesc mai multe pagini, nu tot trei", () => {
  assert.match(viu, /const laStramtoare = latime <= FEREASTRA_MINIMA_MS;/);
  /* ⚠ `let`, nu `const`: la podea bucla se INTINDE dupa ce afla din `totalPages` cat e de
     citit. Vezi `retur-cine-poate-apasa.test.ts`. */
  assert.match(viu, /let paginiDeCitit = laStramtoare \? PAGINI_LA_STRAMTOARE : PAGINI_PE_TRECERE;/);
  assert.match(viu, /for \(let pagina = 0; pagina < paginiDeCitit; pagina\+\+\)/);

  const laStramtoare = Number(/const PAGINI_LA_STRAMTOARE = (\d+);/.exec(viu)?.[1]);
  const peTrecere = Number(/const PAGINI_PE_TRECERE = (\d+);/.exec(viu)?.[1]);
  assert.ok(laStramtoare > peTrecere, "la stramtoare se citeste MAI MULT, nu mai putin");
});

test("⚠ si la fund marcajul AVANSEAZA, cu `critical` scris", () => {
  /*
   * ⚠ Alegere grea, si se numeste ce e: se pierde coada unei ore. Alternativa era sa se piarda
   * tot, de-acum inainte. O mie de cereri intr-o ora la un singur magazin nu mai e o problema de
   * paginare, si nici nu s-a intamplat vreodata — dar daca s-ar intampla, nu poate opri cronul.
   */
  const i = viu.indexOf("if (laStramtoare) {");
  assert.ok(i > 0, "ramura de fund exista");
  const ramura = viu.slice(i, i + 900);
  assert.match(ramura, /severity: "critical"/);
  assert.match(ramura, /ok: true/);
  assert.match(ramura, /latimeUrmatoare: FEREASTRA_MINIMA_MS/);
});

test("⚠ ingustarea obisnuita imparte la CATE pagini s-au citit chiar", () => {
  /* `totalPagini / PAGINI_PE_TRECERE` cu o bucla care citeste douazeci ar fi ingustat de sapte
     ori mai mult decat trebuie, si fereastra ar fi cazut pe fund dintr-un pas. */
  assert.match(viu, /const depasire = totalPagini \/ paginiDeCitit;/);
  assert.doesNotMatch(viu, /totalPagini \/ PAGINI_PE_TRECERE/);
});

test("⚠ `size` ramane 50: 200 e documentat doar pe Turcia", () => {
  /*
   * `/reference/getclaims.md` (Turcia): `"default": 50, "maximum": 200`.
   * `getclaimseurope` si `getclaimsgulf`: blocul e identic intre ele si NU contine `maximum`.
   *
   * ⚠ Toate vitrinele noastre sunt europene. Adancimea se ia din `page`, care e documentat fara
   * plafon, nu dintr-un `size` ghicit pe un capat de la care depinde ca un comerciant afla ca
   * are un retur de rezolvat.
   */
  assert.match(viu, /const PE_PAGINA = 50;/);
  assert.match(readFileSync("src/lib/trendyol/client.ts", "utf8"), /200 E DOCUMENTAT DOAR PE TURCIA/);
});

test("⚠ si nu se mai sustine ca fereastra de doua saptamani e regula LOR", () => {
  /*
   * Comentariul de la `getClaims` a sustinut ca fereastra e obligatoriu de cel mult doua
   * saptamani si ca peste atat raspund 400. Nu e scris nicaieri pentru retururi: in OpenAPI
   * `startDate`/`endDate` sunt `required: false`, si singurul „maximum" din pagina e la `size`.
   * Regula e scrisa la COMENZI si a fost adusa aici prin analogie. Se pastreaza — dar se
   * numeste ce este.
   */
  const client = readFileSync("src/lib/trendyol/client.ts", "utf8");
  assert.doesNotMatch(client, /FEREASTRA E OBLIGATORIE LA EI/);
  assert.match(client, /LATIMEA DE DOUA SAPTAMANI E PRECAUTIA NOASTRA, NU REGULA LOR/);

  /* ⚠ Si ce E documentat se scrie: filtrul se uita la data CREARII, nu la ultima modificare. */
  assert.match(client, /FEREASTRA FILTREAZA DUPA DATA CREARII, NU DUPA ULTIMA MODIFICARE/);

  /* ⚠ Si acelasi neadevar era scris a doua oara, la `FEREASTRA_MAXIMA_MS`. */
  assert.doesNotMatch(brut, /FEREASTRA LOR E DE CEL MULT DOUA SAPTAMANI/);
  assert.match(brut, /E PRECAUTIA NOASTRA, NU REGULA LOR/);
});
