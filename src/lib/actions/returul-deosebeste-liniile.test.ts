import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Doua cani gravate diferit se pot returna separat?
 *
 * ═══ ⚠ CE SE INTAMPLA CAND NU ═══
 *
 * Clientul bifeaza UNA. Serverul potrivea pe `product_id`, iar cele doua linii au acelasi produs
 * — deci `filter` le prindea pe amandoua si cererea de retur se inregistra pentru DOUA cani. Pe
 * ecran, cele doua randuri aveau o singura bifa (aceeasi cheie de stare) si acelasi `key` de React.
 *
 * Iar comerciantul nu afla nici macar CARE gravura se intoarce: `returnableItems` arunca
 * configuratia, si emailurile de retur arata tot `name` + cantitate.
 *
 * ═══ ⚠ DE CE INDEXUL, SI NU O CHEIE NOUA ═══
 *
 * `orders.items` nu se reordoneaza: editarea din panou scoate sau schimba linii pe loc, prin
 * spread, dar nu le amesteca. Deci pozitia e stabila pe viata comenzii, si nu cere nimic scris in
 * plus pe linie — spre deosebire de o amprenta, care ar fi lipsit de pe toate comenzile vechi.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

const SERVER = "lib/actions/return.actions.ts";
const CLIENT = "components/ministore/ReturnRequestClient.tsx";

test("⚠ probele stiu sa citeasca fisierele", () => {
  assert.ok(sursa(SERVER).length > 5_000);
  assert.ok(sursa(CLIENT).length > 5_000);
});

test("⚠ SERVERUL potriveste pe INDEXUL liniei, nu pe produs", () => {
  const s = sursa(SERVER);
  assert.match(s, /wanted\.has\(i\.index\)/, "selectia se face inca pe produs");
  assert.match(s, /\[Number\(i\.index\), Math\.max\(1/, "cererea nu mai vine pe index");
  assert.match(s, /quantity: Math\.min\(i\.quantity, wanted\.get\(i\.index\)!\)/);
});

test("⚠ indexul se ia INAINTE de filtrarea extraoptiunilor", () => {
  /*
   * ⚠ Luat dupa, extraoptiunile scoase l-ar fi decalat: serverul ar fi returnat ALTA linie decat
   * cea bifata. Tacut, si numai pe comenzile care au extraoptiuni — adica greu de legat de cauza.
   */
  const s = sursa(SERVER);
  const iIndex = s.indexOf(".map((linie, index) =>");
  const iFiltru = s.indexOf('.startsWith("extra_")');
  assert.ok(iIndex > 0 && iFiltru > 0, "lipseste una dintre cele doua");
  assert.ok(iIndex < iFiltru, "indexul se numara dupa ce s-au scos extraoptiunile");
});

test("⚠ CLIENTUL tine bifa si `key` pe index", () => {
  const s = sursa(CLIENT);
  assert.match(s, /type Selection = Record<number,/, "starea de selectie e inca pe produs");
  assert.match(s, /key=\{i\.index\}/, "doua linii ale aceluiasi produs au acelasi `key`");
  assert.match(s, /onChange=\{\(\) => toggleItem\(i\.index\)\}/, "o bifa lucreaza pe doua linii");
  assert.match(s, /selection\[i\.index\]\?\.checked/);
});

test("⚠ omul VEDE ce deosebeste cele doua linii", () => {
  /*
   * ⚠ Cheia buna nu ajunge: cu doua randuri care scriu acelasi nume si acelasi pret, omul tot nu
   * poate alege. Rezumatul se ia din instantaneul comenzii, care poarta etichetele de la momentul
   * vanzarii — nu din configuratorul de azi, care poate fi redenumit intre timp.
   */
  assert.match(sursa(SERVER), /rezumat: caUnRand\(cfg\.rezumat\)/, "linia de retur nu poarta rezumatul");
  assert.match(sursa(CLIENT), /\{i\.rezumat && \(/, "ecranul de retur nu arata rezumatul");
});

test("⚠ si rezumatul ajunge pe CEREREA inregistrata, nu doar pe ecran", () => {
  /*
   * ⚠ Fara el acolo, comerciantul deschide cererea de retur si vede „Cana personalizata x1" —
   * exact problema, mutata cu un pas mai departe. Iar de acolo o iau si emailurile de retur.
   */
  assert.match(sursa(SERVER), /\.\.\.\(i\.rezumat \? \{ rezumat: i\.rezumat \} : \{\}\)/);
});
