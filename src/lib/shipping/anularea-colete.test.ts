import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COLETE ONLINE CHIAR ARE ANULARE, SI NOI SCRIAM CA NU      (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Codul spunea, negru pe alb: „Colete Online e cel mai prost caz din toti sase: NU are
 * endpoint de anulare". Era adevarat despre COLECTIA LOR POSTMAN, care n-are o asemenea
 * cerere, si de acolo a intrat in memoria proiectului si in cod. Nu era adevarat despre API:
 * specificatia lor OpenAPI, cea care sta in spatele `docs.api.colete-online.ro`, documenteaza
 * `DELETE /order/{uniqueId}` cu titlul „Cancel an existing expedition".
 *
 * ⚠⚠ IAR `200` NU INSEAMNA „ANULAT". Raspunsul e `{ success: boolean }`, si documentatia lor
 * spune: „Cancellation may not be possible depending on the current status of the expedition
 * (for example, after the package has already been picked up by the courier). In such cases
 * the response field `success` will be `false`".
 *
 * Citit ca reusita, comanda ar ramane fara AWB in panou in timp ce coletul chiar pleaca, iar
 * comerciantul ar afla din factura. Aceeasi forma ca la Cargus, unde un `200` putea purta un
 * obiect de eroare.
 */

const RAD = process.cwd();
const viu = (cale: string) =>
  readFileSync(path.join(RAD, cale), "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ clientul chiar cheama ruta lor de anulare", () => {
  const s = viu("src/lib/colete.ts");
  assert.match(s, /const cale = `\/order\/\$\{encodeURIComponent\(uniqueId\)\}`/,
    "anularea merge pe `DELETE /order/{uniqueId}`");
  assert.match(s, /coReq<unknown>\(token, sandbox, "DELETE", cale\)/,
    "metoda trebuie sa fie DELETE");
  assert.match(s, /cancelReason=/, "motivul lor e un parametru documentat");
});

test("⚠⚠ se cere `success === true` ANUME, nu „adevarat-ish”", () => {
  /*
   * Un raspuns fara campul lor, sau cu altceva in el, NU e o anulare: e un raspuns pe care
   * nu-l intelegem, iar coletul poate fi inca in drum. `!!raspuns.success` ar fi inghitit
   * sirul „false", si `raspuns.success !== false` ar fi inghitit lipsa campului.
   */
  const s = viu("src/lib/colete.ts");
  assert.match(s, /\(raspuns as Record<string, unknown>\)\.success === true/,
    "verificarea trebuie sa fie pe `=== true`");
  assert.ok(
    !/!!\s*\(?raspuns[^)]*\)?\.success/.test(s),
    "`!!success` ar inghiti sirul „false” si orice alta valoare adevarat-ish",
  );
});

test("⚠ refuzul LOR nu se poarta ca reusita", () => {
  const s = viu("src/lib/colete.ts");
  const start = s.indexOf("export async function cancelCOOrder");
  assert.notEqual(start, -1);
  const corp = s.slice(start, s.indexOf("\n}", start));
  assert.match(corp, /return \{ fel: "anulat" \}/);
  assert.match(corp, /return \{ fel: "refuzat", motiv: mesaj \}/);
});

test("⚠⚠ dezlegarea de pe comanda INCEARCA mai intai anularea la ei", () => {
  const s = viu("src/lib/actions/colete.actions.ts");
  const start = s.indexOf("export async function detachCOAwb");
  assert.notEqual(start, -1);
  const corp = s.slice(start);

  assert.match(corp, /cancelCOOrder\(token, config\.sandbox \?\? false, uniqueId\)/,
    "trebuie chemata anularea la furnizor");
  /* Iar identitatea e `uniqueId`-ul lor, cu numarul de AWB ca rezerva: documentatia lor spune
     ca amandoua merg, dar ca fara AWB numai `uniqueId` functioneaza. */
  assert.match(corp, /order\.colete_unique_id \?\? ""/,
    "identitatea trebuie sa fie `uniqueId`-ul lor");
});

test("⚠ dar dezlegarea locala se face ORICUM, si refuzul nu se inghite", () => {
  /*
   * Butonul a insemnat mereu „scoate numarul de pe comanda", iar comerciantul poate sa fi
   * anulat deja de mana in contul lor. Ce nu are voie sa se piarda e refuzul: el iese in
   * `mesaj`, care ajunge pe ecran.
   */
  const s = viu("src/lib/actions/colete.actions.ts");
  const corp = s.slice(s.indexOf("export async function detachCOAwb"));
  assert.match(corp, /return \{ success: true, mesaj: `AWB scos de pe comanda\. \$\{laEi\}` \}/,
    "rezultatul trebuie sa spuna si ce s-a intamplat la ei");
  assert.match(corp, /NU a anulat expedierea/, "refuzul lor trebuie sa ajunga in mesaj");
  assert.match(corp, /Anularea la Colete Online nu a raspuns/, "si caderea de retea");
});

test("⚠⚠ panoul nu mai spune ca „la Colete nu s-a atins nimic”", () => {
  /*
   * `scrieDoarLaNoi` hotaraste ce i se spune omului cand serverul nu raspunde. Cat timp
   * `detachCOAwb` chiar vorbeste cu furnizorul, „colete" nu mai are ce cauta in lista: i-am
   * fi spus ca la ei nu s-a schimbat nimic exact cand se schimbase.
   */
  const s = viu("src/components/dashboard/OrderEditModal.tsx");
  assert.match(s, /const scrieDoarLaNoi = key === "posta" \|\| key === "packeta";/,
    "„colete” trebuie scos din lista celor care scriu doar la noi");
  assert.ok(
    !/scrieDoarLaNoi = [^;]*key === "colete"/.test(s),
    "„colete” a iesit din lista fiindca acum chiar anuleaza la furnizor",
  );
});

test("⚠ afirmatia falsa nu mai sta ca ADEVAR nicaieri in cod", () => {
  /*
   * Propozitia „Colete Online NU are endpoint de anulare" a stat in cod si in memoria
   * proiectului din iulie si a tinut butonul pe loc doua luni. E cel mai scump fel de
   * comentariu: unul care descrie o limita care nu exista.
   *
   * ⚠ Plasa cere ca fiecare loc unde propozitia mai apare sa o INSOTEASCA de indreptare.
   * Scoasa cu totul, cineva ar putea-o scrie la loc fara sa stie ca a fost deja gresita o
   * data; lasata neinsotita, ar minti mai departe.
   */
  for (const cale of ["src/lib/actions/colete.actions.ts", "src/lib/colete.ts"]) {
    const brut = readFileSync(path.join(RAD, cale), "utf8");
    for (const bucata of brut.split(/endpoint de anulare/).slice(0, -1)) {
      const dupa = brut.slice(brut.indexOf(bucata) + bucata.length);
      const fereastra = bucata.slice(-400) + dupa.slice(0, 400);
      assert.match(
        fereastra,
        /Era adevarat despre|NU e adevarat despre|nu era adevarat/i,
        `${cale}: propozitia despre lipsa anularii apare fara indreptare`,
      );
    }
  }
});
