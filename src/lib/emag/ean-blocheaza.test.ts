import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verdictEan } from "./ean";

/* ══════════════════════════════════════════════════════════════════════════
   UN VERDICT CARE SPUNE „NU” TREBUIE SI SA OPREASCA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ `verdictEan` era corect. Apelantul nu-l asculta.

   `cautaInCatalogulLor` raspundea `"ok" | "necunoscut"`, iar „ok” se intorcea si pentru
   trei verdicte care inseamna exact pe dos. Comentariile de langa fiecare spuneau chiar
   „NU se creeaza unul nou”, dupa care se mergea la `product_offer/save`.

     `nehotarat`  codul duce la produse DIFERITE pe eMAG. Trimis fara `part_number_key`,
                  se CREA un produs nou in catalogul lor COMUN: pagina fara recenzii si
                  fara vizitatori, zile de validare manuala, si de nedesfacut.
     `inchis`     ei nu mai primesc oferte pe produsul acela. Acelasi duplicat — pentru
                  un lucru despre care STIAM deja ca nu se poate face.
     `avem_deja`  a doua oferta e refuzata de ei, dar cererea si incercarea se ard.

   ⚠ Un catalog cu coduri trecute prin Excel (masurat: 33 de produse cu `5.94903E+12`)
   duce chiar la genul de amestecatura care da `nehotarat`.
*/

const NL = String.fromCharCode(10);

/** `trimite.ts` fara comentarii: notele explica reparatia si ar potrivi orice regula. */
function corpulCautarii(): string {
  const sursa = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const i = sursa.indexOf("async function cautaInCatalogulLor(");
  assert.ok(i > 0, "n-am gasit `cautaInCatalogulLor`");
  const j = sursa.indexOf(NL + "}", i);
  assert.ok(j > i, "n-am gasit sfarsitul functiei");
  return sursa.slice(i, j);
}

/* ── Verdictele, ca atare ────────────────────────────────────────────────── */

test("codurile care duc la pagini diferite NU se pot alege", () => {
  const v = verdictEan([
    { eans: ["5941234567890"], part_number_key: "AAA", allow_to_add_offer: 1 },
    { eans: ["5941234567890"], part_number_key: "BBB", allow_to_add_offer: 1 },
  ]);
  assert.equal(v.fel, "nehotarat");
});

test("pagina inchisa la oferte noi ramane inchisa", () => {
  const v = verdictEan([{ eans: ["594"], part_number_key: "AAA", allow_to_add_offer: 0 }]);
  assert.equal(v.fel, "inchis");
});

test("cand avem deja oferta acolo, verdictul o spune", () => {
  const v = verdictEan([{
    eans: ["594"], part_number_key: "AAA", allow_to_add_offer: 1, vendor_has_offer: 1,
  }]);
  assert.equal(v.fel, "avem_deja");
});

/* ── Si acum: chiar OPRESC? ──────────────────────────────────────────────── */

test("cele trei verdicte care interzic ajung in lista de opriri", () => {
  /*
   * ⚠ Aici se masoara reparatia insasi. Inainte, fiecare dintre cele trei ramuri se
   * incheia cu `continue;` si atat — se scria motivul in `emag_offers.error` si se mergea
   * mai departe, iar functia raspundea „ok”.
   */
  const corp = corpulCautarii();

  for (const fel of ["inchis", "nehotarat"]) {
    const i = corp.indexOf(`v.fel === "${fel}"`);
    assert.ok(i > 0, `n-am gasit ramura „${fel}”`);
    const ramura = corp.slice(i, corp.indexOf("continue;", i));
    assert.match(ramura, /opriri\.push\(/, `„${fel}” trebuie sa opreasca trimiterea, nu doar sa scrie un mesaj`);
  }

  const iAvem = corp.indexOf('v.fel === "avem_deja"');
  assert.ok(iAvem > 0);
  const ramuraAvem = corp.slice(iAvem, corp.indexOf("continue;", iAvem));
  assert.match(ramuraAvem, /opriri\.push\(/, "„avem deja” nu are voie sa creeze o a doua oferta");
  assert.match(
    ramuraAvem, /ofertaEsteLaEi\(rand\)/,
    "dar NUMAI cand oferta de acolo nu e chiar a randului asta: dupa prima publicare "
    + "reusita, `vendor_has_offer` suntem tot noi, si oprit orbeste ne-am refuza singuri "
    + "orice a doua trimitere",
  );
});

test("`atasare` si `produs_nou` NU opresc nimic", () => {
  /*
   * ⚠ Perechea probei de sus. Fara ea, reparatia ar fi putut fi „opresc tot” — si atunci
   * nu s-ar mai fi publicat niciodata nimic, ceea ce ar fi trecut la fel de verde.
   */
  const corp = corpulCautarii();
  const iAtas = corp.indexOf('v.fel === "atasare"');
  const ramura = corp.slice(iAtas, corp.indexOf("continue;", iAtas));
  assert.ok(!/opriri\.push\(/.test(ramura), "atasarea la un produs existent e chiar ce vrem");

  /* `produs_nou` n-are ramura: e calea implicita de dupa bucla. */
  assert.match(corp, /return \{ fel: "mergi" \};/, "calea buna trebuie sa ramana");
});

test("apelantul chiar se opreste la `oprit`, si arde o incercare", () => {
  /*
   * ⚠ `refuz`, nu `sarit`. „Sarit” ar sterge elementul din coada, iar comerciantul n-ar
   * mai avea nimic de vazut. Motivul nu se repara singur — il repara omul, in fisa
   * produsului — deci trebuie sa ramana sub ochii lui.
   */
  const sursa = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const i = sursa.indexOf('stieCatalogul.fel === "oprit"');
  assert.ok(i > 0, "apelantul nu se uita la verdictul `oprit`");
  const bloc = sursa.slice(i, i + 400);
  assert.match(bloc, /verdict: "refuz"/, "trebuie sa refuze, ca sa se vada in coada");
  assert.match(bloc, /scrieEroare\(/, "si motivul trebuie sa ajunga in panou");

  /* ⚠ Si oprirea trebuie sa vina INAINTE de trimiterea propriu-zisa. */
  const iTrimite = sursa.indexOf("salveazaProduseOferte(ctx.auth", i);
  assert.ok(iTrimite > i, "oprirea trebuie sa fie inaintea lui `product_offer/save`");
});
