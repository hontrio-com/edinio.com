import test from "node:test";
import assert from "node:assert/strict";
import { eanuriDeCautat, imparteRaspunsurilePeRanduri, verdictEan } from "./ean";


/* ══════════════════════════════════════════════════════════════════════════
   LOTURI DE CODURI DE BARE (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

test("raspunsurile unui lot se impart pe randuri, dupa codurile lor", () => {
  /*
   * ═══ 3.500 DE CERERI DIN 5.000 PE ZI, PENTRU UN SINGUR CATALOG ═══
   *
   * Ruta `find_by_eans` are limite PROPRII, mai stranse decat restul API-ului: 5 pe
   * secunda, 200 pe minut si 5.000 PE ZI. Codul chema cu UN cod pe cerere, desi si
   * `cautaDupaEan`, si `eanuriDeCautat` taie la 100 — infrastructura exista si nu se
   * folosea.
   *
   * ⚠ Trimise in lot, raspunsurile mai multor produse vin la gramada, iar `verdictEan`
   * judeca un teanc ca fiind despre UN produs: doua `part_number_key` diferite inseamna
   * „nehotarat". Nedespartite, TOATE randurile ar fi iesit nehotarate.
   */
  const a = { ean: "5941234567890" };
  const b = { ean: "8595602520183" };
  const raspunsuri = [
    { eans: ["5941234567890"], part_number_key: "AAA", allow_to_add_offer: 1 },
    { eans: ["8595602520183"], part_number_key: "BBB", allow_to_add_offer: 1 },
  ];

  const pe = imparteRaspunsurilePeRanduri([a, b], raspunsuri);
  assert.equal(pe.get(a)!.length, 1);
  assert.equal(pe.get(b)!.length, 1);
  assert.equal(verdictEan(pe.get(a)!).fel, "atasare");
  assert.equal(
    (verdictEan(pe.get(a)!) as { part_number_key: string }).part_number_key, "AAA",
    "fiecare rand isi primeste pagina LUI, nu pe a vecinului",
  );
});

test("fara impartire, acelasi lot ar iesi „nehotarat” pentru toti", () => {
  /* ⚠ Proba care arata DE CE e nevoie de impartire, nu doar ca merge. */
  const raspunsuri = [
    { eans: ["5941234567890"], part_number_key: "AAA", allow_to_add_offer: 1 },
    { eans: ["8595602520183"], part_number_key: "BBB", allow_to_add_offer: 1 },
  ];
  assert.equal(verdictEan(raspunsuri).fel, "nehotarat");
});

test("un raspuns fara `eans` NU se da tuturor", () => {
  /*
   * ⚠ Dat tuturor, un produs strain ar fi hotarat pentru randuri cu care n-are nicio
   * legatura — chiar paguba pe care o apara „nehotarat". Se da numai celor ramase fara
   * niciun raspuns identificabil.
   */
  const a = { ean: "5941234567890" };
  const b = { ean: "8595602520183" };
  const raspunsuri = [
    { eans: ["5941234567890"], part_number_key: "AAA", allow_to_add_offer: 1 },
    { part_number_key: "ORFAN", allow_to_add_offer: 1 },
  ];
  const pe = imparteRaspunsurilePeRanduri([a, b], raspunsuri);
  assert.deepEqual(pe.get(a)!.map((x) => x.part_number_key), ["AAA"], "a fost identificat, nu primeste orfanul");
  assert.deepEqual(pe.get(b)!.map((x) => x.part_number_key), ["ORFAN"], "b n-a fost identificat, il primeste");
});

test("un rand fara cod nu primeste nimic si nu strica lotul", () => {
  const a = { ean: "5941234567890" };
  const gol = { ean: null };
  const pe = imparteRaspunsurilePeRanduri([a, gol],
    [{ eans: ["5941234567890"], part_number_key: "AAA", allow_to_add_offer: 1 }]);
  assert.equal(pe.get(gol)!.length, 0);
  assert.equal(pe.get(a)!.length, 1);
});

test("cautarea cazuta OPRESTE publicarea, nu creeaza pe orb", async () => {
  /*
   * ═══ ⚠ CEL MAI SCUMP DINTRE TOATE ═══
   *
   * Forma dinainte scria in jurnal si facea `return`, iar apelantul ignora rezultatul si
   * mergea mai departe la `product_offer/save`: CREA produsul in catalogul lor COMUN fara
   * sa stie daca exista deja. Un duplicat acolo inseamna pagina noua, fara recenzii si
   * fara vizitatori, dupa zile de validare manuala — si nu se poate desface.
   *
   * ⚠ Si NU se arunca: coada n-are `try` in jurul elementului, deci o exceptie ar rupe
   * toata trecerea cronului. Se intoarce „trecatoare", si elementul se reia.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/emag/trimite.ts", "utf8");

  assert.match(sursa, /stieCatalogul === "necunoscut"/, "rezultatul cautarii trebuie citit");
  assert.match(sursa, /verdict: "trecatoare"/, "si trebuie sa opreasca publicarea");

  /* ⚠ Fara comentarii: nota care EXPLICA reparatia pomeneste chiar forma reparata, iar
     proba ar fi cazut pe propriul ei text. A treia oara azi cand tiparul asta musca. */
  const faraNote = sursa
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ 	]*\/\/.*$/gm, "");
  const i = faraNote.indexOf("async function cautaInCatalogulLor(");
  const corp = faraNote.slice(i, faraNote.indexOf(String.fromCharCode(10) + "}", i));
  assert.ok(!/throw/.test(corp), "nu se arunca: ar rupe toata trecerea cronului");
  assert.ok(
    !/for \(const rand of deCautat\)/.test(corp),
    "nu se mai cheama o data pe oferta: ruta are 5.000 de cereri PE ZI",
  );
});

test("peste 100 de variante se intreaba in mai multe loturi, nu se taie", async () => {
  /*
   * ═══ CEA MAI SCUMPA GRESEALA CU PUTINTA, si a stat o zi in cod ═══
   *
   * `eanuriDeCautat` taie la 100 — limita LOR, si documentatia spune ca ce trece peste e
   * IGNORAT, tacut. Forma de ieri lua toate codurile, le taia la 100, si impartea
   * raspunsurile peste TOATE randurile.
   *
   * La un produs cu 250 de variante: 100 intrebate, 150 nu. Iar randurile neintrebate
   * primeau zero raspunsuri, si `verdictEan([])` intoarce `produs_nou` — deci se CREA
   * produsul in catalogul lor COMUN. O pagina noua acolo, fara recenzii si fara
   * vizitatori, dupa zile de validare manuala, si nu se poate desface.
   *
   * ⚠ REGULA: „EAN neverificat" NU e „EAN verificat si inexistent". Prima inseamna „nu
   * stiu", si n-are voie sa devina o hotarare.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/emag/trimite.ts", "utf8");
  const faraNote = sursa.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");

  const i = faraNote.indexOf("async function cautaInCatalogulLor(");
  const corp = faraNote.slice(i, faraNote.indexOf(String.fromCharCode(10) + "}", i));

  assert.match(corp, /i \+= EAN_PE_CERERE/, "codurile trebuie intrebate in loturi, nu taiate");
  assert.match(corp, /imparteRaspunsurilePeRanduri\(\s*bucata/,
    "raspunsurile unui lot se impart NUMAI peste randurile lotului");
  assert.ok(
    !/cautaDupaEan\(ctx\.auth, toate\)/.test(corp),
    "nu se mai trimite o singura cerere cu toate codurile taiate la 100",
  );
});

test("`eanuriDeCautat` chiar taie la 100 — de aceea e nevoie de loturi", () => {
  /* ⚠ Proba care arata DE CE: fara taiere n-ar fi fost nicio problema. */
  const multe = Array.from({ length: 250 }, (_, i) => String(5941234560000 + i));
  assert.equal(eanuriDeCautat(multe).length, 100);
});
