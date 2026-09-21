import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  COLOANE_CSV, asezate, cheieCautare, csvulCosurilor, numeleFisierului,
  rezumatSelectie, sePotriveste,
} from "./lista";
import type { AbandonedCartRow } from "@/lib/abandoned-cart";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Cautarea si exportul par lucruri mici, dar amandoua mint tacut cand sunt
  gresite: o cautare care nu gaseste un nume romanesc il face pe comerciant sa
  creada ca omul nu e in lista, iar un CSV scris prost se deschide in Excel ca
  o singura coloana cu diacriticele stricate - si e aruncat.
*/

/*
  ⚠ SE IMPRASTIE PESTE IMPLICITE, NU SE CITESTE CU `??`.

  Prima scriere facea `email: p.email ?? "ion@mail.ro"`. Dar `??` sare peste
  `null`, deci `cos({ email: null })` primea inapoi adresa implicita: cosul
  „fara email" avea email, iar cel „fara nume" se chema Ion Popescu. Doua
  probe au cazut, si amandoua aratau ca un defect in cod - cand de fapt fabrica
  de probe era cea care mintea.
*/
const IMPLICIT: AbandonedCartRow = {
  id: "c1",
  customer_name: "Ion Popescu",
  email: "ion@mail.ro",
  phone: "0722184305",
  items: [{ product_id: "p1", name: "Covor oriental", price: 100, quantity: 2 }],
  item_count: 2,
  subtotal: 200,
  source: "cart",
  last_activity_at: "2026-09-20T10:00:00Z",
  created_at: "2026-09-20T09:00:00Z",
  ignorat_la: null,
  deschis_la: null,
  mesaje: [],
  recovery_email_sent_at: null,
  recovery_sms_sent_at: null,
  recovery_count: 0,
};

const cos = (p: Partial<AbandonedCartRow> = {}): AbandonedCartRow => ({ ...IMPLICIT, ...p });

test("⚠ CAUTAREA NU SE IMPIEDICA DE DIACRITICE SI DE LITERE MARI", () => {
  /*
    ⚠ Cine scrie „gheorghita" trebuie sa-l gaseasca pe „Gheorghiță". Altfel
    cautarea pare stricata tocmai pe numele romanesti - adica pe majoritatea
    clientilor unui magazin de la noi.
  */
  const c = cos({ customer_name: "Ionescu Gheorghiță" });
  for (const cautat of ["gheorghita", "GHEORGHIȚĂ", "Gheorghita", "ionescu"]) {
    assert.ok(sePotriveste(c, cautat), `nu l-a gasit cu „${cautat}"`);
  }
  assert.equal(cheieCautare("Ionescu Gheorghiță"), "ionescu gheorghita");
});

test("se cauta si in email, telefon si in numele produselor", () => {
  const c = cos();
  assert.ok(sePotriveste(c, "ion@mail"));
  assert.ok(sePotriveste(c, "0722"));
  /* ⚠ „Cine a lasat covorul in cos" e o intrebare buna, si tot o cautare. */
  assert.ok(sePotriveste(c, "covor"));
  assert.ok(!sePotriveste(c, "lustra"));
});

test("cautarea goala nu arunca pe nimeni", () => {
  assert.ok(sePotriveste(cos(), ""));
  assert.ok(sePotriveste(cos(), "   "));
});

test("⚠ SORTAREA NU SCHIMBA NUMARUL DE RANDURI", () => {
  /*
    ⚠ Pare limpede, dar o sortare care arunca randurile fara valoarea ceruta
    (un cos fara nume) ar face randuri sa dispara din pagina fara ca nimic sa
    spuna de ce.
  */
  const randuri = [
    cos({ id: "a", customer_name: null, subtotal: 50 }),
    cos({ id: "b", customer_name: "Zaharia", subtotal: 300 }),
    cos({ id: "c", customer_name: "Andrei", subtotal: 100 }),
  ];
  for (const cheie of ["activitate", "valoare", "produse", "nume"] as const) {
    for (const crescator of [true, false]) {
      const r = asezate(randuri, cheie, crescator);
      assert.equal(r.length, randuri.length, `${cheie}/${crescator}: s-au pierdut randuri`);
      assert.deepEqual(
        [...r.map((x) => x.id)].sort(), ["a", "b", "c"],
        `${cheie}/${crescator}: s-au schimbat randurile`,
      );
    }
  }
  /* ⚠ Si lista de intrare NU se modifica: e starea ecranului. */
  assert.equal(randuri[0].id, "a", "sortarea a modificat lista primita");
});

test("⚠ COSURILE FARA NUME STAU LA COADA, oricum ai sorta", () => {
  /*
    ⚠ Un cos fara nume nu e „primul alfabetic". Lasat sa iasa primul, omul care
    sorteaza dupa nume vede intai zece „Client anonim" si crede ca sortarea
    nu merge.
  */
  const randuri = [
    cos({ id: "gol", customer_name: null }),
    cos({ id: "z", customer_name: "Zaharia" }),
    cos({ id: "a", customer_name: "Andrei" }),
  ];
  assert.equal(asezate(randuri, "nume", true).at(-1)!.id, "gol");
  assert.equal(asezate(randuri, "nume", false).at(-1)!.id, "gol");
  assert.equal(asezate(randuri, "nume", true)[0].id, "a");
  assert.equal(asezate(randuri, "nume", false)[0].id, "z");
});

test("sortarea dupa valoare si dupa activitate merge in amandoua sensurile", () => {
  const randuri = [
    cos({ id: "mic", subtotal: 50, last_activity_at: "2026-09-01T10:00:00Z" }),
    cos({ id: "mare", subtotal: 500, last_activity_at: "2026-09-20T10:00:00Z" }),
  ];
  assert.equal(asezate(randuri, "valoare", true)[0].id, "mic");
  assert.equal(asezate(randuri, "valoare", false)[0].id, "mare");
  assert.equal(asezate(randuri, "activitate", true)[0].id, "mic");
  assert.equal(asezate(randuri, "activitate", false)[0].id, "mare");
});

test("⚠ CSV-UL SE DESCHIDE IN EXCELUL ROMANESC, nu intr-o singura coloana", () => {
  /*
    ⚠ Trei lucruri, si fiecare singur strica exportul:
      · separatorul `;` - Excel in romana citeste dupa separatorul de lista al
        sistemului; cu virgula, tot randul intra intr-o singura celula;
      · BOM-ul - fara el, „Gheorghiță" se deschide ca „GheorghiÈ›Ä";
      · CRLF - randurile vechi de Excel cer capat de linie de Windows.
  */
  const csv = csvulCosurilor([cos()]);
  assert.ok(csv.startsWith("﻿"), "lipseste BOM-ul: diacriticele ies stricate");
  assert.ok(csv.includes("\r\n"), "randurile nu se termina cu CRLF");
  assert.ok(csv.split("\r\n")[0].includes(";"), "antetul nu e despartit cu punct-si-virgula");
  assert.equal(csv.split("\r\n")[0].replace("﻿", "").split(";").length, COLOANE_CSV.length);
});

test("⚠ TELEFONUL NU-SI PIERDE ZEROUL DIN FATA", () => {
  /*
    ⚠ Fara apostrof, Excel vede „0722184305" ca pe un numar, taie zeroul si
    lasa „722184305" - un numar la care nu suna nimeni. Exportul ar fi aratat
    perfect pana cand cineva ar fi incercat sa sune.
  */
  const csv = csvulCosurilor([cos({ phone: "0722184305" })]);
  assert.match(csv, /'0722184305/);
});

test("⚠ VIRGULA ZECIMALA, SI CAMPURILE CU `;` SE INCHID IN GHILIMELE", () => {
  const csv = csvulCosurilor([cos({ subtotal: 1234.5, customer_name: 'Ion "Popescu"; SRL' })]);
  assert.match(csv, /1234,50/, "suma nu e scrisa cu virgula zecimala");
  /* ⚠ Ghilimelele dinauntru se dubleaza, altfel randul se rupe la ele. */
  assert.match(csv, /"Ion ""Popescu""; SRL"/);
});

test("un export fara niciun cos ramane un fisier valid, cu antet", () => {
  const csv = csvulCosurilor([]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.replace("﻿", "").trim().split("\r\n").length, 1);
});

test("numele fisierului poarta ziua romaneasca", () => {
  /* ⚠ La 1 septembrie 01:30 in Romania, pe UTC e inca 31 august. */
  assert.equal(numeleFisierului(new Date("2026-09-01T01:30:00+03:00")), "cosuri-abandonate-2026-09-01.csv");
});

test("⚠ REZUMATUL SELECTIEI NU NUMARA COSURILE IGNORATE CA TRIMITIBILE", () => {
  /*
    ⚠ Butonul spune „Trimite email (3)". Daca printre cele trei e unul ignorat,
    pleaca doua si omul nu intelege de ce - sau, mai rau, crede ca a plecat si
    catre cel pe care il scosese dinadins.
  */
  const r = rezumatSelectie([
    cos({ id: "a" }),
    cos({ id: "b", ignorat_la: "2026-09-20T10:00:00Z" }),
    cos({ id: "c", email: null }),
  ]);
  assert.equal(r.cate, 3);
  assert.equal(r.cuEmail, 1, "ignoratul sau cel fara email a fost numarat");
  assert.equal(r.cuTelefon, 2);
});
