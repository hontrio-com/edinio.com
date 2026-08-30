import test from "node:test";
import assert from "node:assert/strict";
import { eRefuzAlCererii, mesajOmenesc, clasificaRaspuns, pnkDinMesaj } from "./errors";

/* ══════════════════════════════════════════════════════════════════════════
   REFUZUL LOR, CITIT DE NOI CA REUSITA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CUM S-A GASIT. `offer/save` a intors „Offer 1000000388 not found" pentru o oferta pe
   care noi o credeam trimisa. De acolo, o singura intrebare pusa bazei:

     cate oferte au `last_synced_at` scris, dar n-au fost VAZUTE niciodata de
     reconciliere (`status_la_ei` si `validation_status` amandoua goale)?

   Raspuns: **sapte**. Si toate sapte purtau in `doc_errors` un mesaj prin care eMAG ne
   spusese limpede ca nu s-a creat nimic:

     „The product you have tried to associate this offer to is a duplicated product."   5
     „You already hold an offer associated with this PNK: DXT961MBM."                   1
     „4032254753475 is not a valid EAN. - Product id: 1000001088"                       1

   ⚠ CE COSTA. Cu `last_synced_at` scris, `rutaDeTrimitere` vede `existaLaEmag: true` si
   alege ruta USOARA. Deci produsul nu se mai publica NICIODATA — ruta grea, singura care
   creeaza, nu mai e aleasa — iar fiecare schimbare de pret pleaca spre un id inexistent.
   La nesfarsit, si de fiecare data „reusit".

   ⚠ IRONIA. Primele doua mesaje sunt exact `nehotarat` si `avem_deja`, verdictele carora
   li s-a dat pe 25.08 puterea sa OPREASCA publicarea. N-au oprit-o fiindca intrebarea nici
   nu se punea: `emag_offers.ean` e scris numai de import, deci filtrul din
   `cautaInCatalogulLor` iesea gol si `find_by_eans` nu se chema pentru un produs nou.

   Reparatia de dimineata inchide jumatatea din fata — se intreaba INAINTE.
   Asta o inchide pe cea din spate — raspunsul de DUPA nu mai e citit ca reusita.
*/

test("cele trei mesaje masurate inseamna „nu s-a salvat”", () => {
  assert.equal(eRefuzAlCererii([
    "The product you have tried to associate this offer to is a duplicated product. Please associate the offer to the original product.",
  ]), true, "produs duplicat in catalogul lor");

  assert.equal(eRefuzAlCererii([
    "You already hold an offer associated with this PNK: DXT961MBM.",
  ]), true, "avem deja oferta pe pagina aceea");

  assert.equal(eRefuzAlCererii([
    "4032254753475 is not a valid EAN. - Product id: 1000001088",
  ]), true, "cod de bare respins");
});

test("codul respins se recunoaste indiferent de numar", () => {
  /* ⚠ Mesajul poarta chiar codul refuzat, care e altul de fiecare data. Potrivit pe
     mesajul intreg, regula ar fi prins un singur produs din catalog. */
  for (const cod of ["4032254753475", "5941234567890", "1"]) {
    assert.equal(
      eRefuzAlCererii([`${cod} is not a valid EAN. - Product id: 99`]), true,
      `codul ${cod} n-a fost recunoscut`,
    );
  }
});

test("cele doua semnale mai vechi raman", () => {
  assert.equal(eRefuzAlCererii(["Maximum input vars of 4000 exceeded"]), true);
  assert.equal(eRefuzAlCererii(["You already hold a Product associated with this PN:100170833."]), true);
});

test("⚠ observatiile care CHIAR inseamna „salvat” nu devin refuzuri", () => {
  /*
   * Perechea probei de sus, si cea mai importanta din fisier.
   *
   * Regula din documentatia lor — `isError: true` la o eroare de documentatie inseamna
   * totusi salvat — e adevarata pentru majoritatea mesajelor. Mutata categoria intreaga in
   * „refuz", am fi retrimis la nesfarsit oferte care EXISTA, si am fi ascuns `doc_errors`
   * comerciantului. De aceea se enumera semnale, nu se muta categoria.
   */
  const chiarSalvate = [
    "WARNING: The product was saved as a draft, and you need the following product fields to continue documenting and have the product ready for sale: EAN.",
    "WARNING: Your product has been automatically associated via EAN to an existing product.",
    "WARNING: You are not eligible to edit the product documentation. - Product id: 195",
    "You are trying to change both part_number and name at the same time for id 285089.",
    "Pentru a putea comercializa produse din acest brand, este necesar să trimiți documentele specifice.",
  ];
  for (const m of chiarSalvate) {
    assert.equal(eRefuzAlCererii([m]), false, `tratat gresit ca refuz: ${m.slice(0, 60)}`);
  }
});

test("⚠ „saved as a draft … EAN” NU se confunda cu „is not a valid EAN”", () => {
  /*
   * Cele doua mesaje pomenesc amandoua EAN-ul si sunt opuse ca inteles: primul spune ca
   * oferta EXISTA, ca ciorna; al doilea ca a fost refuzata. Masurat pe 48 de ore: 85 de
   * raspunsuri de primul fel. Un tipar prea larg — „ean" simplu — le-ar fi mutat pe toate
   * 85 in „refuz", si 85 de produse aflate legitim in ciorna ar fi fost retrimise la
   * nesfarsit.
   */
  assert.equal(eRefuzAlCererii([
    "WARNING: The product was saved as a draft, and you need the following product fields to continue documenting and have the product ready for sale: EAN. - Product id: 1000001055",
  ]), false);
});

test("mai multe mesaje: unul singur de refuz ajunge", () => {
  /* ⚠ Verdictul lotului e cel mai rau din el: raspunsul lor e generic si nu spune CARE
     dintre cele 50 de oferte s-a ciocnit, deci partea nestiuta se citeste in defavoarea
     noastra. Vezi `trimiteInLoturi`. */
  assert.equal(eRefuzAlCererii([
    "WARNING: Your product has been automatically associated via EAN.",
    "The product you have tried to associate this offer to is a duplicated product.",
  ]), true);
});

/* ── Si ce vede comerciantul in panou ─────────────────────────────────────── */

test("⚠ cele trei refuzuri au mesaj in romana, nu engleza bruta", () => {
  /*
   * Fara asta, reparatia ar fi pe jumatate: oferta n-ar mai parea publicata, dar in dreptul
   * ei ar sta „The product you have tried to associate this offer to is a duplicated
   * product". Adica omul ar sti ca e o piedica, si n-ar sti care.
   */
  const dupla = mesajOmenesc("The product you have tried to associate this offer to is a duplicated product.");
  assert.match(dupla, /dublură/);
  assert.match(dupla, /nu s-a creat/, "trebuie spus limpede ca oferta NU exista");

  const deja = mesajOmenesc("You already hold an offer associated with this PNK: DXT961MBM.");
  assert.match(deja, /Leagă produsele cu ofertele tale de pe eMAG/, "numeste butonul adevarat");

  const ean = mesajOmenesc("4032254753475 is not a valid EAN. - Product id: 1000001088");
  assert.match(ean, /Cod EAN \/ Cod de bare/, "numeste campul asa cum scrie pe ecran");
  assert.match(ean, /4032254753475/, "codul respins ramane in mesaj");
});

test("⚠ niciunul dintre cele trei nu mai zice „observație”", () => {
  /* Cuvantul e potrivit pentru „saved as a draft", si mincinos pentru un refuz. */
  for (const m of [
    "The product you have tried to associate this offer to is a duplicated product.",
    "You already hold an offer associated with this PNK: DXT961MBM.",
    "4032254753475 is not a valid EAN. - Product id: 1000001088",
  ]) {
    assert.doesNotMatch(mesajOmenesc(m), /observație/, `inca zice „observație”: ${m.slice(0, 40)}`);
  }
});

test("observatia adevarata la EAN si-a pastrat ramura ei", () => {
  /* ⚠ Ramura generica sta DUPA cele trei, si trebuie sa fie inca ajunsa de restul. */
  assert.match(
    mesajOmenesc("WARNING: The product was saved as a draft, and you need the following product fields: EAN."),
    /observație la codul EAN/,
  );
});

test("drumul intreg: 200 cu isError si mesajul de dublura da „refuz”", () => {
  /*
   * ⚠ Cea mai apropiata proba de traficul real: nu se cheama `eRefuzAlCererii` de-a dreptul,
   * ci se trece prin `clasificaRaspuns`, cu tot cu HTTP 200 si cu ruta care poarta observatii.
   * Aici s-ar vedea daca ordinea ramurilor din clasificare ar aseza exceptia de documentatie
   * inaintea refuzului.
   *
   * ⚠ BARA DIN FATA E OBLIGATORIE. `RUTE_CU_OBSERVATII` tine `"/product_offer/save"` si
   * se potriveste cu `startsWith`. Scrisa fara bara, proba trecea — dar pe drumul gresit:
   * `poarteObservatii` iesea `false` si verdictul cadea pe `refuz`-ul de la urma, deci
   * n-ar fi dovedit nimic despre refuzurile noi. S-a vazut fiindca proba-pereche, cea
   * care asteapta `reusit_cu_observatii`, a picat.
   */
  const r = clasificaRaspuns(200, {
    isError: true,
    messages: ["The product you have tried to associate this offer to is a duplicated product."],
  }, "/product_offer/save");
  assert.equal(r.verdict, "refuz");
});

test("si acelasi drum lasa observatia adevarata sa treaca", () => {
  const r = clasificaRaspuns(200, {
    isError: true,
    messages: ["WARNING: The product was saved as a draft, and you need the following product fields: EAN."],
  }, "/product_offer/save");
  assert.equal(r.verdict, "reusit_cu_observatii");
});

/* ── Codul paginii, rostit chiar de ei ────────────────────────────────────── */

test("cheia paginii se scoate din amandoua formele de mesaj", () => {
  /*
   * ⚠ Cele doua mesaje o asaza altfel: unul „with PNK X", celalalt „this PNK: X". De aceea
   * doua puncte sunt luate ca nepasatoare in tipar.
   */
  assert.equal(
    pnkDinMesaj("...duplicated product. Please associate the offer to product with PNK D03M9BBBM - Product id: 1000000388"),
    "D03M9BBBM",
  );
  assert.equal(
    pnkDinMesaj("You already hold an offer associated with this PNK: DXT961MBM. If this association was a mistake..."),
    "DXT961MBM",
  );
});

test("⚠ cheia iese cu MAJUSCULE, nu coborata", () => {
  /* Linkul `emag.ro/-/pd/` cauta exact; cu litere mici n-ar duce nicaieri. Pericolul e
     adevarat: `mesajOmenesc` lucreaza cu un text coborat la litere mici, iar cheia trebuie
     luata din cel brut. */
  assert.equal(pnkDinMesaj("with PNK D03M9BBBM - Product id: 1"), "D03M9BBBM");
  assert.match(
    mesajOmenesc("The product ... is a duplicated product. Please associate the offer to product with PNK D03M9BBBM - Product id: 1"),
    /D03M9BBBM/,
  );
});

test("fara cheie in mesaj, mesajul isi tine forma si nu inventeaza", () => {
  assert.equal(pnkDinMesaj("The product you have tried to associate this offer to is a duplicated product."), "");
  assert.equal(pnkDinMesaj(""), "");
  const m = mesajOmenesc("The product you have tried to associate this offer to is a duplicated product.");
  assert.match(m, /Cod EAN \/ Cod de bare/, "cade pe indemnul de rezerva");
  assert.doesNotMatch(m, /emag\.ro\/-\/pd/, "fara cheie NU se scrie link");
});

test("⚠ nu se agata de un cuvant scurt de dupa „PNK”", () => {
  /* Un „PNK is missing" ar fi dat cheia „missing", si linkul ar fi dus la 404. */
  assert.equal(pnkDinMesaj("PNK: n/a"), "");
  assert.equal(pnkDinMesaj("PNK abc"), "");
});

test("⚠ dovada ca linkul din mesaj NU e linkul stins din panou", () => {
  /*
   * Sageata catre `emag.ro/-/pd/{part_number_key}` e stinsa din 24.08.2026: 3 chei din
   * coloana, 3 produse straine. Aici se scrie totusi un link — si e voie fiindca izvorul
   * cheii e altul: o spune eMAG despre CHIAR oferta asta.
   *
   * ⚠ Verificat pe emag.ro pe 25.08.2026, nu presupus:
   *   D03M9BBBM → „Royal Canin, Medium, Adult, 15Kg"           = produsul nostru
   *   DXT961MBM → „Calibra Dog Verve GF … Wild Boar …, 400g"   = produsul nostru
   *
   * Proba de aici nu poate atinge emag.ro; ce pazeste ea e ca linkul se face DIN mesaj,
   * si numai cand mesajul chiar poarta o cheie.
   */
  const cu = mesajOmenesc("is a duplicated product. Please associate the offer to product with PNK D03M9BBBM - Product id: 1");
  assert.match(cu, /https:\/\/www\.emag\.ro\/-\/pd\/D03M9BBBM/);
});
