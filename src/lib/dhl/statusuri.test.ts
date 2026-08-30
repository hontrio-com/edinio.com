import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  clasificaStatus, codStatus, CODURI, descriereStatus, eCombinatieNecunoscuta, eLivrat,
  eStareFinala, esteRetur, EXPLICATIE_CLASIFICARE, statusComandaDinCod, statusUrmator,
  trebuieSemnalat, type Clasificare,
} from "./statusuri";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * O singura confuzie face cea mai scumpa stricaciune posibila, si a costat deja o data,
 * la UPS: acolo `currentStatus.type === "D"` parea „Delivered" si insemna de fapt
 * „**loaded on delivery vehicle, out for delivery, delivered**". Comanda trecea pe
 * „Livrata" si se DECLANSA FACTURAREA AUTOMATA in timp ce coletul era inca in masina.
 *
 * La DHL capcana are alt nume si aceeasi forma:
 *
 *   `WC` „With delivering courier" = IESIT LA LIVRARE. NU e livrare.
 *   `OK` „Delivery"                = dispozitia finala, singura livrare din tot tabelul.
 *
 * Si mai sunt trei care par livrare si nu sunt: `PD` (partiala — o parte din colete
 * lipseste), `DD` (livrat AVARIAT) si `AD` (livrare CONVENITA, adica programata).
 * Inchise automat, prima factureaza marfa nelivrata, a doua inchide comanda chiar cand
 * se deschide despagubirea, a treia finalizeaza o comanda care nici n-a plecat spre usa.
 *
 * ⚠ La DHL greseala inversa e la fel de scumpa, si e proaspata: `signedBy` E GOL DIN
 * OFICIU, DIN GDPR, nu fiindca n-a semnat nimeni („This field may be intentionally left
 * empty in accordance with the General Data Protection Regulation"). Facuta CONDITIE a
 * livrarii, nicio comanda DHL n-ar trece vreodata pe „Livrata".
 *
 * ⚠ Si tabelul insusi trebuie sa ramana intreg: 65 de coduri, fiecare cu denumire si cu
 * clasa. DHL a adaugat coduri fara preaviz (`PY` si `SM` in iunie 2024, apoi `SD`, `EM`,
 * `MF`); un rand adaugat pe jumatate ar clasifica tacut ca „necunoscut".
 */

const CLASE: Clasificare[] = ["livrat", "in_retea", "la_comerciant", "problema", "necunoscut"];

/** O data de livrare adevarata, cum vine din `events[]`. */
const LIVRAT_LA = "2026-08-16T14:32:00";

describe("DHL: livrarea are UN singur cod, si nu e cel care suna a livrare", () => {
  test("`OK` e livrat, si duce comanda pana la capat", () => {
    assert.equal(clasificaStatus("OK"), "livrat");
    assert.equal(eLivrat("OK", null, false), true);
    assert.equal(statusComandaDinCod("OK"), "delivered");
    assert.equal(statusUrmator("shipped", "OK", null, false), "delivered");
    assert.equal(eStareFinala("OK", null, false), true);
    assert.equal(descriereStatus("OK"), "Livrat");
  });

  test("⚠ `WC` („La curierul de livrare”) NU e livrat — capcana `D` a UPS-ului", () => {
    assert.equal(clasificaStatus("WC"), "in_retea");
    assert.equal(eLivrat("WC", null, false), false);
    assert.equal(statusComandaDinCod("WC"), "shipped");
    /* Se opreste la „Expediata". Trecuta pe „Livrata", ar emite factura cu coletul in masina. */
    assert.equal(statusUrmator("processing", "WC", null, false), "shipped");
    assert.equal(statusUrmator("shipped", "WC", null, false), null);
    assert.equal(eStareFinala("WC", null, false), false);
  });

  test("⚠ `AD` e livrare CONVENITA, adica programata, nu efectuata", () => {
    assert.equal(clasificaStatus("AD"), "in_retea");
    assert.equal(eLivrat("AD", null, false), false);
    assert.equal(trebuieSemnalat("AD"), false);
  });

  test("⚠ semnatura lipsa NU impiedica livrarea: `signedBy` e gol din GDPR", () => {
    /* Facuta conditie, nicio comanda DHL n-ar trece vreodata pe „Livrata". Ea doar
       INTARESTE `OK`, si abia asta deosebeste „gol fiindca e mascat" de „n-a semnat". */
    assert.equal(eLivrat("OK", null, false), true);
    assert.equal(eLivrat("OK", null, undefined), true);
    assert.equal(eLivrat("OK", LIVRAT_LA, true), true);
  });

  test("⚠ o dovada pe un cod NECUNOSCUT e tot o dovada", () => {
    /* DHL adauga coduri fara preaviz. O data de livrare pe un cod pe care nu-l stim inca
       vine dintr-un eveniment de dispozitie finala; ignorata, comanda ar ramane blocata. */
    assert.equal(eLivrat("ZZ", LIVRAT_LA), true);
    assert.equal(eLivrat("ZZ", null, true), true);
    assert.equal(statusUrmator("shipped", "ZZ", LIVRAT_LA), "delivered");
    /* Dar un camp gol sau numai spatii nu e o dovada. */
    assert.equal(eLivrat("ZZ", "   "), false);
    assert.equal(eLivrat("ZZ", null, false), false);
    assert.equal(statusUrmator("shipped", "ZZ", null, false), null);
  });
});

describe("DHL: cele doua livrari care nu inchid comanda", () => {
  test("⚠ `PD` (partiala) nu e livrare, nici cu data si semnatura", () => {
    /* Inchisa automat, comanda se finalizeaza cu marfa nelivrata si se factureaza intreaga. */
    assert.equal(eLivrat("PD", LIVRAT_LA, true), false);
    assert.equal(clasificaStatus("PD"), "problema");
    assert.equal(statusComandaDinCod("PD", LIVRAT_LA, true), null);
    assert.equal(statusUrmator("shipped", "PD", LIVRAT_LA, true), null);
    assert.equal(trebuieSemnalat("PD"), true);
    /* Si NU e stare finala: mai are cine sa se ocupe de restul coletelor. */
    assert.equal(eStareFinala("PD", LIVRAT_LA, true), false);
  });

  test("⚠ `DD` (livrat AVARIAT) la fel: deschide o despagubire, nu inchide o comanda", () => {
    assert.equal(eLivrat("DD", LIVRAT_LA, true), false);
    assert.equal(statusUrmator("shipped", "DD", LIVRAT_LA, true), null);
    assert.equal(trebuieSemnalat("DD"), true);
    assert.equal(eStareFinala("DD", LIVRAT_LA, true), false);
    assert.equal(descriereStatus("DD"), "Livrat AVARIAT");
  });
});

describe("DHL: returul se STIE, spre deosebire de UPS", () => {
  test("`RT` e retur, e final si se semnaleaza", () => {
    /* La UPS `esteRetur` intorcea `false` mereu: API-ul lor n-are niciun tip de retur.
       Aici `RT` e „Returned to consignor" chiar in nomenclatorul lor. */
    assert.equal(esteRetur("RT"), true);
    assert.equal(clasificaStatus("RT"), "problema");
    assert.equal(trebuieSemnalat("RT"), true);
    assert.equal(eStareFinala("RT", null), true);
    /* ⚠ Final nu inseamna „livrat": statusul comenzii NU se misca. */
    assert.equal(statusComandaDinCod("RT"), null);
    assert.equal(statusUrmator("shipped", "RT", null), null);
  });

  test("⚠ `RT` e SINGURUL retur din tot tabelul", () => {
    assert.deepEqual(Object.keys(CODURI).filter((cod) => esteRetur(cod)), ["RT"]);
    assert.equal(esteRetur("ZZ"), false);
    assert.equal(esteRetur(null), false);
  });

  test("celelalte terminale fara livrare nu se dau drept retur", () => {
    for (const cod of ["DS", "SS", "CS", "CA", "TP"]) {
      assert.equal(esteRetur(cod), false, cod);
      assert.equal(eStareFinala(cod, null), true, cod);
      assert.equal(trebuieSemnalat(cod), true, cod);
      assert.equal(eLivrat(cod, null, false), false, cod);
    }
  });
});

describe("DHL: o semnatura NU rastoarna un cod pe care tabelul il cunoaste", () => {
  /*
   * ⚠⚠ CE DEFECT PRIND PROBELE ASTEA, si de ce n-a fost prins de la inceput.
   *
   * Prima forma a lui `eLivrat` sarea peste `PD` si `DD`, apoi accepta ORICE cod daca exista
   * o semnatura:
   *     if (c === "PD" || c === "DD") return false;
   *     if (c === "OK") return true;
   *     return !!livratLa || areDovadaLivrarii === true;
   *
   * Iar `areDovadaLivrarii` se ridica (in `client.ts`) la o semnatura de pe ORICE eveniment,
   * si semnatura apare — prin chiar documentatia lor — la fiecare „final disposition event".
   * Predarea coletului INAPOI la expeditor e si ea o dispozitie finala, si e si ea semnata.
   * Deci un colet RETURNAT (`RT`) iesea „livrat": comanda trecea pe „Livrata",
   * `maybeAutoInvoice` emitea factura la ANAF pentru marfa intoarsa in depozit, iar cronul o
   * scotea definitiv din urmarire fiindca scrisese o stare finala.
   *
   * ⚠ Si PROBELE APARAU asezarea gresita: proba care trece tot tabelul de 65 de coduri il
   * trecea NUMAI cu `areDovada = false`, iar singurele probe cu `true` erau pe `PD` si `DD`.
   * Combinatia „cod terminal cunoscut + dovada" nu era probata nicaieri. Acelasi tipar ca
   * `LabelSpecification` la UPS: o proba scrisa odata cu defectul, care il apara.
   */
  test("⚠⚠ `RT` cu semnatura NU e livrare — altfel se factureaza marfa intoarsa in depozit", () => {
    assert.equal(eLivrat("RT", null, true), false);
    assert.equal(statusComandaDinCod("RT", null, true), null);
    assert.equal(statusUrmator("shipped", "RT", null, true), null);
    /* Si nici cu o data de livrare pe deasupra: dovada nu bate tabelul. */
    assert.equal(eLivrat("RT", LIVRAT_LA, true), false);
    assert.equal(statusUrmator("shipped", "RT", LIVRAT_LA, true), null);
    /* ⚠ Codul nu are voie sa se contrazica pe acelasi eveniment: in ACEEASI trecere
       `esteRetur("RT")` ii trimite comerciantului „coletul se intoarce la tine". */
    assert.equal(esteRetur("RT"), true);
    assert.equal(trebuieSemnalat("RT"), true);
  });

  test("⚠ acelasi drum era deschis pentru terminalele fara livrare, pentru `WC` si pentru `NH`", () => {
    /* `WC` („La curierul de livrare") e capcana `D` a UPS-ului: pe o expediere cu mai multe
       colete, un `PD` semnat mai devreme ridica steagul, iar comanda s-ar fi inchis cu
       jumatate din colete inca in masina. `DS` e distrus, `TP` e predat unui tert. */
    for (const cod of ["DS", "SS", "CS", "CA", "TP", "WC", "NH"]) {
      assert.equal(eLivrat(cod, null, true), false, cod);
      assert.equal(eLivrat(cod, LIVRAT_LA, true), false, cod);
      assert.notEqual(statusComandaDinCod(cod, LIVRAT_LA, true), "delivered", cod);
      assert.equal(statusUrmator("shipped", cod, null, true), null, cod);
      assert.equal(statusUrmator("shipped", cod, LIVRAT_LA, true), null, cod);
    }
  });

  test("⚠ dar rezerva pe dovada RAMANE pentru codurile NECUNOSCUTE — stergerea ei ar fi cealalta greseala", () => {
    /* Ea e chiar motivul pentru care exista ultima linie din `eLivrat`: DHL adauga coduri fara
       preaviz (`PY` si `SM` in iunie 2024, apoi `SD`, `EM`, `MF`). O dispozitie finala pe un cod
       pe care nu-l cunoastem inca, ignorata, ar lasa comanda blocata pe „Expediata" la nesfarsit
       si ar tine-o in urmarire pana la plafonul cronului. */
    assert.equal(eLivrat("ZZ", null, true), true);
    assert.equal(eLivrat("ZZ", LIVRAT_LA, false), true);
    assert.equal(statusComandaDinCod("ZZ", null, true), "delivered");
    assert.equal(statusUrmator("shipped", "ZZ", null, true), "delivered");
    assert.equal(eStareFinala("ZZ", null, true), true);
    /* Si un cod de TREI litere e tot necunoscut, deci tot o dovada. */
    assert.equal(eLivrat("ABC", null, true), true);
    /* Fara dovada insa, un cod necunoscut nu misca nimic. */
    assert.equal(eLivrat("ZZ", null, false), false);
    assert.equal(statusUrmator("shipped", "ZZ", null, false), null);
  });
});

describe("DHL: doua coduri care suna grav si nu sunt", () => {
  test("⚠ `MC` si `MS` sunt greseli de sortare pe care DHL le corecteaza singur", () => {
    /* Coletul e in drum. O alarma pe ele se invata sa fie ignorata — inclusiv atunci
       cand are dreptate. */
    for (const cod of ["MC", "MS", "SC"]) {
      assert.equal(clasificaStatus(cod), "in_retea", cod);
      assert.equal(trebuieSemnalat(cod), false, cod);
      assert.equal(statusUrmator("processing", cod, null), "shipped", cod);
    }
  });

  test("un blocaj adevarat semnaleaza, dar nu da comanda inapoi", () => {
    for (const cod of ["OH", "HP", "PY", "CD", "UD", "ND", "NH", "RD", "BA"]) {
      assert.equal(trebuieSemnalat(cod), true, cod);
      /* Un colet oprit in vama e tot expediat; „In procesare" ar sterge informatie. */
      assert.equal(statusUrmator("shipped", cod, null), null, cod);
      assert.equal(eStareFinala(cod, null), false, cod);
    }
  });
});

describe("DHL: statusul urca, niciodata nu coboara", () => {
  test("un eveniment intarziat nu intoarce comanda din „livrata”", () => {
    /* „A plecat din centru" sosit dupa livrare ar retrimite emailuri si ar putea declansa
       a doua oara facturarea automata. */
    assert.equal(statusUrmator("delivered", "DF", null), null);
    assert.equal(statusUrmator("delivered", "PU", null), null);
  });

  test("acelasi status nu se rescrie", () => {
    assert.equal(statusUrmator("shipped", "PU", null), null);
    assert.equal(statusUrmator("processing", "PU", null), "shipped");
    assert.equal(statusUrmator("pending", "OK", null), "delivered");
  });

  test("⚠ `cancelled` si `refunded` nu se misca de la curier", () => {
    /* Sunt hotarari ale omului, nu stari de transport, si nu sunt in scara. */
    assert.equal(statusUrmator("cancelled", "OK", LIVRAT_LA, true), null);
    assert.equal(statusUrmator("refunded", "OK", LIVRAT_LA, true), null);
    assert.equal(statusUrmator("ceva-ce-nu-exista", "OK", LIVRAT_LA), null);
  });

  test("⚠ `la_comerciant` nu misca nimic: DHL are datele, nu coletul", () => {
    for (const cod of ["SD", "MF"]) {
      assert.equal(clasificaStatus(cod), "la_comerciant", cod);
      assert.equal(statusComandaDinCod(cod), null, cod);
      assert.equal(statusUrmator("confirmed", cod, null), null, cod);
    }
  });

  test("un cod necunoscut nu misca si nu semnaleaza nimic", () => {
    assert.equal(clasificaStatus("ZZ"), "necunoscut");
    assert.equal(statusComandaDinCod("ZZ"), null);
    assert.equal(statusUrmator("shipped", "ZZ", null), null);
    assert.equal(trebuieSemnalat("ZZ"), false);
    assert.equal(eStareFinala("ZZ", null), false);
  });
});

describe("DHL: normalizarea si cresterea tabelului", () => {
  test("codul se aduce la majuscule, fara alte ghiciri", () => {
    assert.equal(codStatus(" ok "), "OK");
    assert.equal(clasificaStatus("ok"), "livrat");
    assert.equal(eLivrat("ok", null), true);
    assert.equal(codStatus(""), null);
    assert.equal(codStatus("   "), null);
    assert.equal(codStatus(123), null);
    assert.equal(codStatus(null), null);
  });

  test("⚠ un cod de TREI litere se pastreaza brut, nu se arunca", () => {
    /* Toate cele 65 au doua litere, dar DHL a mai adaugat coduri fara preaviz. */
    assert.equal(codStatus("abc"), "ABC");
    assert.equal(codStatus("A".repeat(16)), "A".repeat(16));
    /* Peste 16 e un camp murdar, nu un cod. */
    assert.equal(codStatus("A".repeat(17)), null);
  });

  test("⚠ carligul prin care tabelul creste din traficul real", () => {
    assert.equal(eCombinatieNecunoscuta("OK"), false);
    assert.equal(eCombinatieNecunoscuta("ok"), false);
    /* `PY` si `SM` au fost adaugate de ei in iunie 2024 si sunt deja in tabel. */
    assert.equal(eCombinatieNecunoscuta("PY"), false);
    assert.equal(eCombinatieNecunoscuta("SM"), false);
    assert.equal(eCombinatieNecunoscuta("ZZ"), true);
    /* Un camp gol nu e un cod nou: nu se scrie in jurnal. */
    assert.equal(eCombinatieNecunoscuta(""), false);
    assert.equal(eCombinatieNecunoscuta(null), false);
    assert.equal(eCombinatieNecunoscuta(123), false);
  });

  test("⚠ pentru un cod cunoscut, textul ROMANESC bate descrierea lor", () => {
    /* Exemplul lor propriu trimite `typeCode: OK` cu `description: 'Delivered : ALBY H'`.
       In panou se arata „Livrat", nu numele semnatarului. */
    assert.equal(descriereStatus("OK", "Delivered : ALBY H"), "Livrat");
    assert.equal(descriereStatus("WC", "With delivery courier"), "La curierul de livrare");
  });

  test("pentru un cod necunoscut se cade pe textul LOR, apoi pe cod", () => {
    assert.equal(descriereStatus("ZZ", "Some brand new DHL event"), "Some brand new DHL event");
    assert.equal(descriereStatus("ZZ", "   "), "Status DHL ZZ");
    assert.equal(descriereStatus("ZZ"), "Status DHL ZZ");
    assert.equal(descriereStatus(null, null), "Status DHL necunoscut");
    assert.equal(descriereStatus(""), "Status DHL necunoscut");
  });
});

describe("DHL: tabelul intreg, rand cu rand", () => {
  /*
   * ⚠ Probele de mai jos trec peste toate cele 65 de randuri, nu peste cateva alese.
   * Un rand adaugat pe jumatate — cod fara denumire, sau cu o clasa scrisa gresit — n-ar
   * rupe nici tsc, nici build: s-ar clasifica tacut ca „necunoscut" si comanda ar sta.
   */
  test("cele 65 de coduri sunt intregi: denumire nevida si clasa valida", () => {
    const coduri = Object.keys(CODURI);
    assert.equal(coduri.length, 65);
    for (const cod of coduri) {
      const intrare = CODURI[cod];
      assert.match(cod, /^[A-Z]{2}$/, `codul ${cod} nu are forma lor`);
      assert.equal(codStatus(cod), cod, `codul ${cod} nu trece prin normalizare`);
      assert.ok(intrare.denumire.trim().length > 0, `${cod} n-are denumire`);
      assert.ok(CLASE.includes(intrare.clasa), `${cod} are clasa ${intrare.clasa}`);
      /* „necunoscut" e raspunsul pentru ce NU e in tabel; un rand din tabel nu-l poate purta. */
      assert.notEqual(intrare.clasa, "necunoscut", `${cod} e in tabel si totusi necunoscut`);
      assert.equal(clasificaStatus(cod), intrare.clasa, cod);
      assert.equal(descriereStatus(cod), intrare.denumire, cod);
    }
  });

  test("⚠ orice stare de „problema” ajunge la om", () => {
    for (const [cod, intrare] of Object.entries(CODURI)) {
      if (intrare.clasa === "problema") assert.equal(trebuieSemnalat(cod), true, cod);
    }
  });

  test("⚠ singura semnalare din afara clasei „problema” e cea scrisa dinadins", () => {
    /* `FD` („Redirectionat catre alta destinatie") e in retea si totusi cere om: coletul
       merge, dar nu acolo unde a platit cumparatorul. Orice alt cod care ajunge aici e o
       alarma in plus, si alarmele in plus se invata sa fie ignorate. */
    const dinAfara = Object.entries(CODURI)
      .filter(([, intrare]) => intrare.semnaleaza === true && intrare.clasa !== "problema")
      .map(([cod]) => cod);
    assert.deepEqual(dinAfara, ["FD"]);
  });

  test("⚠ `OK` e SINGURUL cod de livrare din tot tabelul, ORICAT de tare ar fi dovada", () => {
    const livrate = Object.entries(CODURI)
      .filter(([, intrare]) => intrare.clasa === "livrat")
      .map(([cod]) => cod);
    assert.deepEqual(livrate, ["OK"]);
    /*
     * ⚠⚠ TOATE CELE PATRU COMBINATII, nu una singura. Prima forma a probei trecea tabelul
     * NUMAI cu `areDovada = false` si fara data de livrare, deci nu putea sa cada pe defectul
     * care exista: `eLivrat` accepta atunci orice cod care nu era `PD`/`DD` de indata ce
     * exista o semnatura, iar un colet returnat (`RT`) iesea „livrat" si se factura la ANAF.
     * Rulata pe tot tabelul si pe amandoua semnalele, proba acopera din oficiu si codurile
     * adaugate de acum inainte.
     */
    for (const [cod, intrare] of Object.entries(CODURI)) {
      const eLivrare = intrare.clasa === "livrat";
      for (const livratLa of [null, LIVRAT_LA]) {
        for (const dovada of [false, true]) {
          const unde = `${cod} livratLa=${livratLa} dovada=${dovada}`;
          assert.equal(eLivrat(cod, livratLa, dovada), eLivrare, unde);
          assert.equal(statusComandaDinCod(cod, livratLa, dovada) === "delivered", eLivrare, unde);
          assert.equal(statusUrmator("shipped", cod, livratLa, dovada) === "delivered", eLivrare, unde);
        }
      }
    }
  });

  test("steagul `final` si `eStareFinala` spun acelasi lucru pe toate randurile", () => {
    for (const [cod, intrare] of Object.entries(CODURI)) {
      assert.equal(eStareFinala(cod, null, false), intrare.final === true, cod);
      /* ⚠ Si CU dovada. `RT`, `DS`, `SS`, `CS`, `CA` si `TP` erau deja finale, dar treceau
         prin `eLivrat` drept LIVRATE de indata ce exista o semnatura — iar cronul scria
         „delivered" si scotea comanda din urmarire. Cele doua intrebari sunt diferite, si
         raspunsul la a doua nu se schimba dupa semnatar. */
      assert.equal(eStareFinala(cod, LIVRAT_LA, true), intrare.final === true, cod);
    }
  });

  test("un retur e mereu si o stare finala", () => {
    for (const [cod, intrare] of Object.entries(CODURI)) {
      if (intrare.retur === true) assert.equal(intrare.final, true, cod);
    }
  });

  test("statusul de comanda scos din tabel urmeaza clasa, nu codul", () => {
    for (const [cod, intrare] of Object.entries(CODURI)) {
      const asteptat =
        cod === "OK" ? "delivered" : intrare.clasa === "in_retea" ? "shipped" : null;
      assert.equal(statusComandaDinCod(cod), asteptat, cod);
    }
  });

  test("fiecare clasa are o explicatie in romaneste", () => {
    for (const clasa of CLASE) {
      assert.ok(EXPLICATIE_CLASIFICARE[clasa].trim().length > 0, clasa);
    }
  });
});
