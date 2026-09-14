import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gazdaConfigurabila } from "./gazda-configurabila";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * GAZDA DIN CONFIG NU POATE PARASI DOMENIUL FURNIZORULUI        (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `posta_config.baza` si `packeta_config.bazaRest` se scriu prin actiuni de server, iar tipul lor
 * nu exista la rulare. Catre gazda aleasa acolo pleaca, la Posta, antetul `Authorization: Basic` cu
 * numele si parola comerciantului, iar la Packeta parola API chiar in corpul XML.
 *
 * ⚠ Proba are doua jumatati, si fara a doua prima nu apara nimic: regula pura de mai jos, si
 * cusatura care cere ca cei trei clienti sa CHEME chiar regula asta.
 */

const POSTA = "https://awb.posta-romana.ro/api";
const PACKETA = "https://www.zasilkovna.cz/api/rest";

// ─── Regula ──────────────────────────────────────────────────────────────────

test("fara suprascriere se foloseste adresa implicita", () => {
  assert.equal(gazdaConfigurabila(undefined, POSTA), POSTA);
  assert.equal(gazdaConfigurabila(null, POSTA), POSTA);
  assert.equal(gazdaConfigurabila("   ", POSTA), POSTA);
});

test("⚠⚠ o gazda STRAINA nu e primita: acolo ar pleca credentialele", () => {
  assert.equal(gazdaConfigurabila("https://atacator.tld/api", POSTA), POSTA);
  assert.equal(gazdaConfigurabila("https://posta-romana.ro.atacator.tld", POSTA), POSTA);
});

test("⚠⚠ SIRETLICUL CU `@` NU TRECE, si de asta se compara gazda, nu sirul", () => {
  /*
   * `https://awb.posta-romana.ro@atacator.tld` are gazda `atacator.tld`: tot ce sta inaintea lui
   * `@` e nume de utilizator. O verificare scrisa cu `startsWith` ar fi spus „incepe cu adresa
   * buna" si ar fi trecut-o, iar parola ar fi plecat la atacator cu poarta aratand verde.
   */
  assert.equal(gazdaConfigurabila("https://awb.posta-romana.ro@atacator.tld", POSTA), POSTA);
  assert.equal(gazdaConfigurabila("https://www.zasilkovna.cz@atacator.tld/x", PACKETA), PACKETA);
});

test("⚠ `http:` nu trece, nici pe domeniul bun", () => {
  /* Pe `http:` credentialele ar pleca in clar chiar catre gazda adevarata. */
  assert.equal(gazdaConfigurabila("http://awb.posta-romana.ro/api", POSTA), POSTA);
});

test("aceeasi gazda si o subdomena a ei sunt ingaduite", () => {
  /* Campul exista ca sa se poata arata catre un mediu de TEST al aceluiasi furnizor. */
  assert.equal(gazdaConfigurabila("https://awb.posta-romana.ro/api", POSTA), "https://awb.posta-romana.ro/api");
  assert.equal(gazdaConfigurabila("https://test.posta-romana.ro/api", POSTA), "https://test.posta-romana.ro/api");
  assert.equal(gazdaConfigurabila("https://posta-romana.ro/api", POSTA), "https://posta-romana.ro/api");
  assert.equal(gazdaConfigurabila("https://test.zasilkovna.cz/api/rest", PACKETA), "https://test.zasilkovna.cz/api/rest");
});

test("bara de la coada se taie, ca inainte", () => {
  assert.equal(gazdaConfigurabila("https://awb.posta-romana.ro/api//", POSTA), "https://awb.posta-romana.ro/api");
});

test("⚠ ce nu e nici macar o adresa cade pe implicit, nu arunca", () => {
  /*
   * Un rand stricat in baza trebuie sa ne intoarca la purtarea corecta, nu sa opreasca emiterea
   * AWB-ului: altfel o reparatie de securitate ar deveni o cadere de productie.
   */
  assert.equal(gazdaConfigurabila("nu e adresa", POSTA), POSTA);
  assert.equal(gazdaConfigurabila("//atacator.tld", POSTA), POSTA);
  assert.equal(gazdaConfigurabila("javascript:alert(1)", POSTA), POSTA);
});

// ─── Cusatura: clientii chiar cheama regula ──────────────────────────────────

const faraComentarii = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ Posta compune adresa PRIN regula, nu din sirul brut", () => {
  const s = faraComentarii("src/lib/posta/client.ts");
  assert.match(s, /return gazdaConfigurabila\(config\.baza, BAZA_IMPLICITA\);/,
    "Posta nu mai trece adresa prin regula");
  assert.doesNotMatch(s, /\(config\.baza \?\? ""\)\.trim\(\)\.replace/,
    "s-a intors compunerea care primea orice gazda");
});

test("⚠ Packeta compune adresa PRIN regula, nu din sirul brut", () => {
  const s = faraComentarii("src/lib/packeta/client.ts");
  assert.match(s, /const baza = gazdaConfigurabila\(cfg\.bazaRest, BAZA_REST\);/,
    "Packeta nu mai trece adresa prin regula");
  assert.doesNotMatch(s, /\(cfg\.bazaRest \?\? ""\)\.trim\(\) \|\| BAZA_REST/,
    "s-a intors compunerea care primea orice gazda");
});

test("⚠ GLS trece tara prin ENUM, nu o interpoleaza cum vine", () => {
  /*
   * La GLS gazda nu e un sir liber, ci se COMPUNE din tara: `ro@atacator.tld` da
   * `https://api.mygls.ro@atacator.tld`, adica tot gazda atacatorului. `TARI_MYGLS` exista de mult,
   * dar era folosit doar la umplerea listei din interfata, iar interfata nu e o paza.
   */
  const s = faraComentarii("src/lib/gls/client.ts");
  assert.match(s, /\$\{gazda\}\$\{taraPermisa\(config\.tara\)\.toLowerCase\(\)\}/,
    "tara ajunge iar neverificata in gazda");
  assert.doesNotMatch(s, /\$\{gazda\}\$\{config\.tara\.toLowerCase\(\)\}/,
    "s-a intors interpolarea directa a tarii in gazda");
  assert.match(s, /TARI_MYGLS as readonly string\[\]\)\.includes\(t\)/,
    "enumul nu mai e cerut la rulare");
});

test("⚠ niciunul dintre cei trei nu urmeaza redirectari", () => {
  /*
   * Urmat, un 3xx RE-TRIMITE corpul si antetele catre gazda din `Location`, adica duce chiar
   * credentialele in afara domeniului pe care tocmai l-am fixat. Trei fisiere, trei afirmatii:
   * numarate la gramada, unul singur reparat ar fi trecut proba.
   */
  for (const cale of ["src/lib/posta/client.ts", "src/lib/packeta/client.ts", "src/lib/gls/client.ts"]) {
    assert.match(faraComentarii(cale), /redirect: "manual",/, `${cale} urmeaza redirectarile`);
  }
});
