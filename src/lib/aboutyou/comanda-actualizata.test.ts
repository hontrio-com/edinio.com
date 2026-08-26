import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hotarareaActualizarii } from "./orders";

/* ══════════════════════════════════════════════════════════════════════════
   COMANDA DIN EDINIO NU SE SCHIMBA DELOC LA O ANULARE PARTIALA (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Calea de ACTUALIZARE scria numai randul lateral `aboutyou_orders`. Comanda din Edinio ramanea
   cu liniile si totalul de la CREARE. Cand clientul anula o linie din trei:

     - raportarile aratau o valoare pe care nimeni n-a platit-o;
     - fisa comenzii ii arata comerciantului un produs care nu se mai trimite;
     - iar el il putea pregati si expedia degeaba.

   ⚠ Nu se rescrie ORICE: o comanda facturata nu se corecteaza schimband tacut totalul dedesubt.
*/

const linii = (n: number, anulate = 0) =>
  Array.from({ length: n }, (_, i) => ({
    product_id: `p${i}`, name: `Produs ${i}`, sku: `S${i}`, price: 100, quantity: 1,
    ...(i < anulate ? { status: "cancelled" } : {}),
  }));

test("⚠ o linie anulata la ei se scrie in comanda din Edinio", () => {
  /* Trei linii la creare, una anulata intre timp: 300 lei devin 200. */
  assert.equal(hotarareaActualizarii({
    facturata: false,
    itemsVechi: linii(3), totalVechi: 300,
    itemsNoi: linii(3, 1), totalNou: 200,
  }), "scrie");
});

test("⚠ dar o comanda FACTURATA nu se atinge, se strica jurnalul", () => {
  /*
   * Un document fiscal emis se STORNEAZA, nu se corecteaza pe sub el. Hotararea e a
   * comerciantului; noi ii spunem doar ca s-a intamplat.
   */
  assert.equal(hotarareaActualizarii({
    facturata: true,
    itemsVechi: linii(3), totalVechi: 300,
    itemsNoi: linii(3, 1), totalNou: 200,
  }), "doar-jurnal");
});

test("⚠ si cand nu s-a schimbat nimic nu se scrie, nici macar `updated_at`", () => {
  /*
   * Ingestul trece peste aceleasi comenzi la fiecare reconciliere. O scriere neconditionata ar
   * impinge `updated_at` inainte de fiecare data, deci FIECARE comanda ar parea „atinsa acum" in
   * orice lista sortata dupa el \u2014 iar cea chiar atinsa nu s-ar mai deosebi de restul.
   */
  assert.equal(hotarareaActualizarii({
    facturata: false,
    itemsVechi: linii(3), totalVechi: 300,
    itemsNoi: linii(3), totalNou: 300,
  }), "nimic");
  /* Si nici la una facturata: „doar-jurnal" ar fi umplut jurnalul cu aceeasi comanda la infinit. */
  assert.equal(hotarareaActualizarii({
    facturata: true,
    itemsVechi: linii(3), totalVechi: 300,
    itemsNoi: linii(3), totalNou: 300,
  }), "nimic");
});

test("⚠ comanda anulata in intregime isi pastreaza liniile, cu totalul la zero", () => {
  /*
   * Nu se scrie `items: []`. Comerciantul trebuie sa vada CE s-a anulat, nu o fisa goala; liniile
   * raman, marcate. Doar banii cad.
   */
  const toate = linii(3, 3);
  assert.equal(toate.filter((l) => "status" in l).length, 3);
  assert.equal(hotarareaActualizarii({
    facturata: false, itemsVechi: linii(3), totalVechi: 300, itemsNoi: toate, totalNou: 0,
  }), "scrie");
});

test("⚠ virgula banilor nu declanseaza o scriere singura", () => {
  /* Totalul vine socotit din intregi si trece prin `money()`; o diferenta sub un ban nu e o stire. */
  assert.equal(hotarareaActualizarii({
    facturata: false, itemsVechi: linii(2), totalVechi: 200.0000001, itemsNoi: linii(2), totalNou: 200,
  }), "nimic");
  /* Dar un ban intreg da. */
  assert.equal(hotarareaActualizarii({
    facturata: false, itemsVechi: linii(2), totalVechi: 200.01, itemsNoi: linii(2), totalNou: 200,
  }), "scrie");
});

test("⚠ un total lipsa in baza nu trece drept „la fel”", () => {
  /* `total` e nullable in schema. Citit ca 0, o comanda de 200 ar fi aratat neschimbata. */
  assert.equal(hotarareaActualizarii({
    facturata: false, itemsVechi: linii(2), totalVechi: null, itemsNoi: linii(2), totalNou: 200,
  }), "scrie");
});

test("⚠ si comanda necitibila din baza nu se rescrie orbeste", () => {
  /*
   * Fara randul din `orders` nu stim daca are factura. Se scaneaza sursa: hotararea „nimic" e
   * luata la apelant, nu inauntru, fiindca acolo se afla `null`-ul.
   *
   * ⚠ Comentariile de LINIE se sterg PRIMELE: un `/*` intr-un comentariu de linie ar face
   * stergatorul de blocuri sa inghita restul fisierului, si proba ar trece pe gol.
   */
  const viu = readFileSync("src/lib/aboutyou/orders.ts", "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(viu.includes('const hotarare = comanda == null ? "nimic" : hotarareaActualizarii({'));
  /* Si scrierea chiar pune toate cele patru campuri, nu doar totalul. */
  const bloc = viu.slice(viu.indexOf('} else if (hotarare === "scrie") {'));
  for (const camp of ["items: edinioItems", "subtotal,", "total,", "vat_amount: vatAmount"]) {
    assert.ok(bloc.slice(0, 600).includes(camp), camp);
  }
});
