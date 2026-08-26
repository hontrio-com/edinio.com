import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   `orders/stream`: ALTFEL DE PAGINARE, SI UN CURSOR CARE NU SE ATINGE
   ══════════════════════════════════════════════════════════════════════════

   Calea de azi (`/v2/orders`, paginata) merge si e verificata. Dar ei ii pun un plafon scris:
   fereastra paginata da cel mult 10.000 de inregistrari (`maxQueryWindowResult`). Peste el,
   paginile de la coada nu se mai pot atinge deloc.

   ⚠ Fluxul n-are plafonul ala — verificat: sirul nu apare pe pagina lui. In schimb schimba
   felul paginarii: nu mai da `totalPages`, ci `hasMore` si un `nextCursor`.

   ⚠ SI E STINS DIN START. Comenzile sunt calea cea mai sensibila din toata integrarea — ele
   misca stocul. Nu se schimba sub un magazin care merge, pentru un plafon la care nu ajunge.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const client = viu("src/lib/trendyol/client.ts");
const stream = viu("src/lib/trendyol/stream.ts");

test("⚠ cursorul e OPAC: nu se citeste, nu se schimba, nu se construieste", () => {
  /*
   * Regula lor, verbatim: „nextCursor opaque bir değerdir → parse edilmemelidir,
   * değiştirilmemelidir." Se trimite inapoi exact cum a venit.
   */
  assert.match(stream, /cursor = urmatorul;/);
  assert.doesNotMatch(stream, /cursor\.(split|slice|replace|substring)/, "nu se atinge");
  assert.doesNotMatch(stream, /decodeURIComponent\(cursor/, "si nu se decodeaza");
});

test("⚠ la PRIMA cerere cursorul nu se trimite deloc, nu se trimite gol", () => {
  assert.match(client, /if \(p\.nextCursor\) q\.set\("nextCursor", p\.nextCursor\);/);
});

test("⚠ `hasMore` e singurul semn de capat", () => {
  /* Nu mai dau `totalPages`, `totalElements` sau `page` — changelog-ul lor din 02.06.2026. Deci
     nu se poate socoti dinainte cate pagini urmeaza. */
  assert.match(stream, /res\.data\?\.hasMore !== true/);
  assert.doesNotMatch(stream, /totalPages/, "nu se cauta un camp pe care nu-l mai dau");
});

test("⚠ `hasMore: true` FARA cursor opreste, si NU avanseaza marcajul", () => {
  /*
   * E o stare pe care n-o putem duce mai departe: reluata cu acelasi cursor (lipsa), ar fi o
   * bucla peste aceeasi pagina. Se opreste, iar fereastra se reia la trecerea urmatoare.
   */
  const i = stream.indexOf("const urmatorul = res.data?.nextCursor;");
  const f = stream.slice(i, i + 400);
  assert.match(f, /typeof urmatorul !== "string" \|\| urmatorul === ""/);
  assert.match(f, /ok: false/);
});

test("⚠ paginile ingaduite terminate NU inseamna „am citit tot”", () => {
  /*
   * Marcajul n-are voie sa sara la „acum", altfel comenzile necitite raman in urma ferestrei
   * pentru totdeauna — chiar incidentul pentru care exista `marcaj.ts`.
   */
  const f = stream.slice(stream.lastIndexOf("return { pachete, ok:"));
  assert.match(f, /ok: false/);
});

test("⚠ o eroare nu avanseaza marcajul", () => {
  assert.match(stream, /if \(isTrendyolError\(res\)\) return \{ pachete, ok: false, pagini \};/);
});

test("⚠ plafoanele LOR: 200 pe pagina, si cinci secunde intre cereri", () => {
  /* „Default 50; maximum 200" si „Önerilen kullanım minimum 5 saniye aralıklarda istek
     atılmasıdır". Cerut mai mult, raspund 400. */
  assert.match(client, /Math\.max\(1, Math\.min\(200, p\.size\)\)/);
  assert.match(stream, /const PAUZA_INTRE_PAGINI_MS = 5000;/);
  assert.match(stream, /const MARIME_PAGINA = 200;/);
});

test("⚠ e STINS din start, si asta se vede in config", () => {
  /* Comenzile misca stocul. Nu se schimba calea lor sub un magazin care merge, pentru un plafon
     la care nu ajunge. */
  const tipuri = readFileSync("src/lib/trendyol/types.ts", "utf8");
  assert.match(tipuri, /foloseste_stream\?: boolean;/);
  assert.match(tipuri, /STINS DIN START/);
});
