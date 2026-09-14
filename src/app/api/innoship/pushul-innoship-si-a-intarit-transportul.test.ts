import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PUSH-UL INNOSHIP: TRANSPORT INTARIT, PURTARE NESCHIMBATA      (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Innoship NU semneaza nimic: documentatia lor spune ca „your endpoint may use any
 * authentication method". Tot ce apara ruta e secretul din adresa, pe care il generam noi si pe
 * care comerciantul il lipeste in portalul lor.
 *
 * ⚠ CU ADRESA ACEEA SINGURA se poate trimite un istoric FABRICAT pentru orice `order_number` al
 * magazinului, iar asta impinge comanda in „livrata" si declanseaza emiterea facturii. De aceea
 * lotul asta e despre TRANSPORT, si de aceea fiecare schimbare e ADITIVA.
 *
 * ⚠ CE APARA PROBA, SI DE CE PE SURSA. Ruta cere sesiune, baza si un furnizor, deci nu se poate
 * rula aici. Iar `secretulCererii` si `secreteEgale` sunt private in fisierul de ruta: exportate
 * doar ca sa fie probate, ar fi „forma pentru proba", si intr-un fisier de ruta Next exporturile
 * necunoscute sunt si riscante. Se apara deci CUSATURA, cu accent pe ce n-are voie sa se schimbe.
 */

const sursa = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const RUTA = "src/app/api/innoship/track/route.ts";
const PANOU = "src/components/dashboard/InnoshipConfigClient.tsx";

/* ── 1. Ce n-are voie sa se schimbe pentru comerciantii vii ───────────────── */

test("⚠⚠ ADRESA VECHE, cu `?secret=`, ramane valabila", () => {
  /*
   * ⚠ AFIRMATIA CU MIZA CEA MAI MARE DIN FISIER. Fiecare comerciant care foloseste push azi are
   * deja lipita in portalul Innoship forma cu `?secret=`. Scoasa, urmarirea s-ar opri la toti, si
   * TACUT: ruta raspunde oricum 200, deci nimeni n-ar vedea nimic pana cand o comanda n-ar mai
   * avansa. Nu exista nicio parghie prin care sa ceri portalului lor sa trimita altceva.
   */
  const s = sursa(RUTA);
  assert.match(s, /searchParams\.get\("secret"\)/, "forma veche a adresei nu mai e citita");
});

test("⚠⚠ si drumul VECHI de cautare a magazinului ramane", () => {
  /*
   * Selectorul `business` e nou si nimeni nu-l are inca in portal. Daca ruta ar cere doar forma
   * noua, ar fi acelasi dezastru tacut ca mai sus.
   */
  const s = sursa(RUTA);
  assert.match(s, /innoship_config->>webhook_secret/, "cautarea dupa secretul decriptat a disparut");
});

test("⚠⚠ TOATE iesirile raman 200", () => {
  /*
   * Hotarare a proprietarului, si scrisa in cap de fisier: politica de reincercare a lor nu e
   * documentata, iar un 4xx la un lot de zeci de comenzi ar reface TOT lotul, la nesfarsit.
   * Singurul constructor de raspuns e `ok()`.
   */
  const s = sursa(RUTA);
  assert.doesNotMatch(s, /status:\s*[45]\d\d/, "a aparut un raspuns de eroare: invita la furtuna de reincercari");
  assert.doesNotMatch(s, /NextResponse\.json\((?!\{ ok: true)/, "exista un al doilea fel de a raspunde");
});

/* ── 2. Ce s-a intarit ────────────────────────────────────────────────────── */

test("⚠ secretul se primeste SI din antet, nu doar din interogare", () => {
  const s = sursa(RUTA);
  assert.match(s, /headers\.get\("x-edinio-secret"\)/, "antetul nu mai e o forma acceptata");
});

test("⚠⚠ comparatia e in TIMP CONSTANT, cu paza de lungime", () => {
  /*
   * `timingSafeEqual` arunca la lungimi diferite, deci paza nu e un moft. Acelasi tipar ca
   * `verificaCron`.
   */
  const s = sursa(RUTA);
  const i = s.indexOf("function secreteEgale(");
  assert.ok(i > 0, "comparatia in timp constant a disparut");
  const corp = s.slice(i, s.indexOf("\n}", i));
  assert.match(corp, /if \(a\.length !== b\.length\) return false;/, "lipseste paza de lungime");
  assert.match(corp, /crypto\.timingSafeEqual\(a, b\)/, "comparatia nu mai e in timp constant");
});

test("⚠⚠ marimea corpului se verifica INAINTE de citire", () => {
  /*
   * `req.text()` pe un corp urias ar tine memoria functiei pana la capat. Verificarea de dupa
   * citire nu mai apara nimic din asta, de aceea contează ORDINEA.
   */
  const s = sursa(RUTA);
  const iAntet = s.indexOf('req.headers.get("content-length")');
  const iCitire = s.indexOf("await req.text()");
  assert.ok(iAntet > 0, "plafonul pe `content-length` a disparut");
  assert.ok(iCitire > 0, "nu mai gasesc citirea corpului");
  assert.ok(iAntet < iCitire, "plafonul se verifica dupa citire, deci nu mai apara memoria");
});

test("⚠ si inca o data pe OCTETI, inainte de `JSON.parse`", () => {
  /*
   * Antetul poate lipsi sau minti, iar `text.length` numara CARACTERE: in UTF-8 un caracter
   * romanesc are doi octeti, un emoji patru. Aceeasi lectie ca la `corpPreaMare` din Pepita.
   */
  const s = sursa(RUTA);
  const iOcteti = s.indexOf("Buffer.byteLength(corp");
  const iParse = s.indexOf("JSON.parse(corp)");
  assert.ok(iOcteti > 0, "masurarea in octeti a disparut");
  assert.ok(iOcteti < iParse, "se parseaza inainte de a se masura");
});

test("⚠ lotul se TAIE, nu se refuza, si taierea nu e tacuta", () => {
  /*
   * Refuzat intreg, s-ar pierde si urmaririle bune din el. Taiat tacut, ar arata ca o rulare
   * sanatoasa care n-a prelucrat tot. Vezi `zero-randuri-nu-e-succes`.
   */
  const s = sursa(RUTA);
  assert.match(s, /urmariri\.slice\(0, MAX_ELEMENTE\)/, "plafonul pe numarul de elemente a disparut");
  const i = s.indexOf("urmariri.length > MAX_ELEMENTE");
  assert.ok(i > 0, "nu se mai observa depasirea");
  assert.match(s.slice(i, i + 400), /logError\(/, "taierea nu lasa nicio urma");
});

/* ── 3. Comanda fara `order_number` ───────────────────────────────────────── */

test("⚠⚠ potrivirea cade si pe `id`, nu doar pe `order_number`", () => {
  /*
   * `referintaComenzii` trimite `order_number ?? id`, iar `order_number` e anulabil. O comanda
   * fara numar a plecat deci la ei cu UUID-ul nostru, si cautata numai pe `order_number` n-ar fi
   * fost gasita NICIODATA prin push. Cronul face caderea asta; webhookul nu o facea.
   */
  const s = sursa(RUTA);
  assert.match(s, /\.in\("id", caUuid\)/, "comenzile fara numar raman de negasit prin push");
  assert.match(s, /dupaReferinta\.set\(String\(o\.id\), c\)/, "harta nu se mai indexeaza si pe `id`");
  assert.match(s, /if \(o\.order_number\) dupaReferinta\.set\(String\(o\.order_number\), c\)/,
    "harta nu se mai indexeaza pe numarul comenzii");
});

test("⚠⚠ FARA `.or(...)`: o sintaxa gresita acolo da LISTA GOALA, nu eroare", () => {
  /*
   * Prima forma a reparatiei imbina cele doua cautari intr-un `.or()`. Aceeasi capcana ca la
   * fereastra cronului Sameday, scrisa acolo pe larg: o gresala de sintaxa in `.or()` nu da
   * eroare, da lista goala, iar push-ul ar fi incetat sa potriveasca orice comanda, tacut.
   */
  assert.doesNotMatch(sursa(RUTA), /\.or\(/, "s-a intors interogarea care poate esua tacut");
});

test("⚠⚠ AMANDOUA interogarile poarta filtrul de magazin", () => {
  /*
   * Nu e un filtru de prisos, e AUTORIZARE: fara el, un lot cu referinte straine ar atinge
   * comenzile altui comerciant. Se numara, nu se cauta „macar unul".
   */
  const s = sursa(RUTA);
  const cate = (s.match(/\.eq\("business_id", businessId\)/g) ?? []).length;
  assert.equal(cate, 2, `filtrul de magazin apare de ${cate} ori, nu pe amandoua interogarile`);
});

/* ── 4. Panoul da adresa noua ─────────────────────────────────────────────── */

test("⚠ adresa din panou poarta si selectorul, si secretul", () => {
  const s = sursa(PANOU);
  assert.match(s, /\/api\/innoship\/track\?business=\$\{businessId\}&secret=\$\{initialConfig\.webhook_secret\}/,
    "adresa aratata comerciantului nu mai poarta selectorul de magazin");
});
