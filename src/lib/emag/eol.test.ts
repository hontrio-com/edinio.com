import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eScoasaDeLaVanzare } from "./trimite";

/* ══════════════════════════════════════════════════════════════════════════
   „END OF LIFE" NU E O STARE DE-A NOASTRA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Masurat pe contul VetDepo: **3.095 din 4.678 de oferte** au `status_la_ei = 2`, adica
   doua treimi din catalog scoase din vanzare candva.

   eMAG REFUZA orice scriere de pret sau de stoc pe ele, si o spune limpede — spre deosebire
   de vechea ruta `offer_stock`, care raspundea 400 fara niciun cuvant:

     „ERROR: The offer status is 2 (end of life). If you want to sell this product,
      please update the status to 1 (active)."

   ⚠ CE FACEA PANA ACUM: le trimitea oricum, la fiecare miscare de stoc, la nesfarsit.
   Fiecare incercare arde o cerere din cele 3 pe secunda ale magazinului — chiar cererile
   prin care trebuie sa plece stocul ofertelor care CHIAR se vand.

   ══════════════════════════════════════════════════════════════════════════
   ⚠ SI CE ANUME NU FACE REPARATIA
   ══════════════════════════════════════════════════════════════════════════

   NU trimite `status: 1` ca sa le repuna la vanzare. Ar fi tehnic usor si ar face erorile
   sa dispara — dar repunerea unei oferte la vanzare pe un marketplace e hotararea
   COMERCIANTULUI. Exact greseala facuta cu o ora mai devreme de plasa de siguranta, care a
   inceput sa publice singura un catalog intreg.

   Se opreste, si se spune de ce. Atat.
*/

test("2 inseamna scoasa din vanzare; 1 si 0 nu", () => {
  assert.equal(eScoasaDeLaVanzare({ status_la_ei: 2 }), true);
  assert.equal(eScoasaDeLaVanzare({ status_la_ei: 1 }), false, "activa");
  assert.equal(eScoasaDeLaVanzare({ status_la_ei: 0 }), false, "oprita, dar nu scoasa");
});

test("⚠ „nu stiu” nu opreste nimic", () => {
  /*
   * ⚠ `null` inseamna „inca n-am reconciliat oferta", nu „e scoasa". Tratat ca scoasa, o
   * oferta proaspat publicata n-ar mai fi primit niciodata stoc — si nimeni n-ar fi
   * inteles de ce, fiindca mesajul ar fi vorbit despre o stare pe care eMAG n-a spus-o.
   */
  assert.equal(eScoasaDeLaVanzare({ status_la_ei: null }), false);
});

test("rutele usoare chiar le sar", () => {
  const cod = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const i = cod.indexOf("function identitatiUsoare(");
  assert.ok(i > 0, "n-am gasit `identitatiUsoare`");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i));
  assert.match(corp, /\.filter\(\(r\) => !eScoasaDeLaVanzare\(r\)\)/);
});

test("starea lor chiar ajunge pe rand", () => {
  /* ⚠ Fara coloana in `select`, `status_la_ei` ar fi mereu `undefined`, hotararea ar
     raspunde mereu `false`, si reparatia ar fi o functie pe care n-o cheama nimeni cu date
     adevarate — verde la probe, fara efect in productie. */
  const cod = readFileSync("src/lib/emag/trimite.ts", "utf8");
  assert.match(cod, /creat_de_edinio, nume_emag, status_la_ei"/, "se citeste din baza");
  assert.match(cod, /status_la_ei: number \| null;/, "si e pe tipul randului");
});

test("mesajul deosebeste „publică-l” de „ei l-au scos”", () => {
  /*
   * ⚠ Spuse la fel, omul cauta unde nu e: „Publică-l întâi" il trimite la butonul de
   * publicare, pe care il apasa degeaba — oferta EXISTA la ei, doar ca scoasa din vanzare.
   */
  const cod = readFileSync("src/lib/emag/trimite.ts", "utf8");
  const i = cod.indexOf("function deCeNimicDeTrimis(");
  assert.ok(i > 0, "n-am gasit explicatia");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i) + 2);

  assert.match(corp, /Publică-l întâi/, "cazul „n-a fost publicat niciodată”");
  assert.match(corp, /End of Life/, "si cazul „ei l-au scos”");
  assert.match(corp, /laEi\.every\(eScoasaDeLaVanzare\)/,
    "„toate scoase” e altceva decat „unele scoase”: cu una singura buna, se trimite");

  /* ⚠ Si amandoua rutele usoare il folosesc, nu doar una. */
  const fara = cod.replace(/\/\*[\s\S]*?\*\//g, "");
  const chemari = fara.match(/deCeNimicDeTrimis\(randuri\)/g);
  assert.equal(chemari?.length, 2, "si pretul, si stocul trebuie sa spuna adevarul");
});

test("⚠ NU se repune singura la vânzare", () => {
  /*
   * Proba cea mai importanta din fisier, si e despre ce NU face codul.
   *
   * `status: 1` trimis odata cu stocul ar face erorile sa dispara instantaneu. Si ar
   * repune la vanzare, pe un marketplace, 3.095 de oferte pe care cineva le-a scos —
   * fara ca nimeni sa fi cerut asta.
   */
  const cod = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const i = cod.indexOf("async function duStocul(");
  const corp = cod.slice(i, cod.indexOf(String.fromCharCode(10) + "}", i));
  assert.ok(!/status:\s*1/.test(corp), "ruta de stoc n-are voie sa reactiveze oferte");

  const j = cod.indexOf("function identitatiUsoare(");
  const corpFiltru = cod.slice(j, cod.indexOf(String.fromCharCode(10) + "}", j));
  assert.ok(!/status:\s*1/.test(corpFiltru), "nici filtrul");
});
