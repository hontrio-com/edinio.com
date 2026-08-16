import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  clasificaStatus, codStatus, descriereStatus, esteRetur, eStareFinala,
  statusComandaDinCod, statusUrmator, trebuieSemnalat,
} from "./statusuri";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Traducerea statusurilor e singurul loc din integrare unde o greseala nu produce
 * nicio eroare si nu se vede niciodata: comanda pur si simplu nu se mai misca, sau
 * se misca prea devreme. Cronul n-are proba (cere reteaua si baza), deci fisierul
 * asta e SINGURA poarta automata a stratului de urmarire.
 *
 * Fiecare grupa de mai jos corespunde unui defect trait la un curier anterior.
 */

describe("statusurile sunt SIRURI, nu numere", () => {
  test("un numar nu e status valid la Shipo", () => {
    // La SmartShip codurile sunt intregi si `0` e valid. Copiat mecanic aici,
    // `codStatus(0)` ar fi trebuit sa intoarca ceva — si nu are ce.
    assert.equal(codStatus(0), null);
    assert.equal(codStatus(2), null);
  });

  test("se normalizeaza doar spatiile si majusculele", () => {
    assert.equal(codStatus("  DELIVERED "), "delivered");
    assert.equal(clasificaStatus("Delivered"), "livrat");
  });

  test("nu se ghiceste o potrivire apropiata", () => {
    // Daca ei incep candva sa trimita „in transit" cu spatiu, raspunsul corect e
    // tacerea, nu o potrivire dedusa care ar muta comanda pe o presupunere.
    assert.equal(clasificaStatus("in transit"), "necunoscut");
    assert.equal(clasificaStatus("IN-TRANSIT"), "necunoscut");
  });
});

describe("harta statusurilor", () => {
  test("AWB emis lasa comanda la comerciant, NU o expediaza", () => {
    // Eticheta e facuta, marfa e inca in depozit. Marcata expediata, comanda ar
    // minti clientul si ar porni instiintari pentru un colet care n-a plecat.
    assert.equal(clasificaStatus("order_placed"), "la_comerciant");
    assert.equal(statusComandaDinCod("order_placed"), "processing");
  });

  test("ridicat, in tranzit si iesit la livrare inseamna expediat", () => {
    for (const s of ["collected", "in_transit", "out_for_delivery"]) {
      assert.equal(statusComandaDinCod(s), "shipped", s);
    }
  });

  test("`picked_up` e sinonimul lui `collected` din /tracking", () => {
    // Lista oficiala de `status_delivery` are `collected`, dar `statusClasses` din
    // /tracking arata `picked_up`. Nu se stie care ajunge in campul `status`.
    assert.equal(clasificaStatus("picked_up"), clasificaStatus("collected"));
  });

  test("⚠ „incarcat in locker\" NU e livrare", () => {
    // Coletul e la capatul drumului, dar clientul nu l-a ridicat. Marcata livrata
    // aici, comanda ar declansa factura pentru marfa neatinsa, iar daca nu se
    // ridica si se intoarce, nimeni n-ar mai afla.
    assert.equal(statusComandaDinCod("loaded_locker"), "shipped");
    assert.equal(statusComandaDinCod("loaded_pudo"), "shipped");
    assert.equal(eStareFinala("loaded_locker"), false);
  });

  test("predarea in locker de catre expeditor e tot expediere", () => {
    assert.equal(statusComandaDinCod("dropoff_locker"), "shipped");
    assert.equal(statusComandaDinCod("dropoff_pudo"), "shipped");
  });

  test("livrat incheie drumul", () => {
    assert.equal(statusComandaDinCod("delivered"), "delivered");
    assert.equal(eStareFinala("delivered"), true);
  });
});

describe("sfarsiturile proaste", () => {
  test("returul si anularea se SEMNALEAZA, dar NU misca comanda", () => {
    // Anularea si rambursarea sunt decizii ale comerciantului, nu ale curierului:
    // mutata pe „cancelled", comanda ar elibera stocul si cuponul in spatele lui.
    for (const s of ["return_to_sender", "canceled"]) {
      assert.equal(statusComandaDinCod(s), null, s);
      assert.equal(trebuieSemnalat(s), true, s);
      assert.equal(eStareFinala(s), true, s);
    }
  });

  test("returul e retur; anularea nu e", () => {
    assert.equal(esteRetur("return_to_sender"), true);
    assert.equal(esteRetur("canceled"), false);
  });
});

describe("implicitul e TACEREA", () => {
  test("un status nou aparut la ei nu misca, nu semnaleaza si nu incheie", () => {
    // Un broker cu sapte curieri isi poate largi oricand nomenclatorul. Presupunerea
    // inversa („nu-l stiu, deci s-a terminat") ar ingheta comenzi pentru totdeauna.
    for (const s of ["awaiting_pickup", "", "  ", null, undefined, 7, {}]) {
      assert.equal(clasificaStatus(s), "necunoscut", String(s));
      assert.equal(statusComandaDinCod(s), null, String(s));
      assert.equal(trebuieSemnalat(s), false, String(s));
      assert.equal(eStareFinala(s), false, String(s));
    }
  });

  test("descrierea cade pe ce au trimis ei, apoi pe cod", () => {
    assert.equal(descriereStatus("delivered"), "Livrat");
    assert.equal(descriereStatus("nastrusnic", "Ceva nou"), "Ceva nou");
    assert.equal(descriereStatus("nastrusnic"), "Status nastrusnic");
    assert.equal(descriereStatus(null), "Status necunoscut");
  });
});

describe("comanda nu coboara si nu se misca dupa anulare", () => {
  test("nu se coboara de pe o treapta mai avansata", () => {
    // Evenimentele pot sosi in alta ordine decat s-au petrecut.
    assert.equal(statusUrmator("delivered", "in_transit"), null);
    assert.equal(statusUrmator("shipped", "order_placed"), null);
  });

  test("acelasi status nu e o schimbare", () => {
    assert.equal(statusUrmator("shipped", "in_transit"), null);
  });

  test("o comanda anulata sau rambursata nu se misca de la curier", () => {
    assert.equal(statusUrmator("cancelled", "delivered"), null);
    assert.equal(statusUrmator("refunded", "delivered"), null);
  });

  test("urcarea normala functioneaza", () => {
    assert.equal(statusUrmator("confirmed", "in_transit"), "shipped");
    assert.equal(statusUrmator("shipped", "delivered"), "delivered");
    assert.equal(statusUrmator("pending", "order_placed"), "processing");
  });
});
