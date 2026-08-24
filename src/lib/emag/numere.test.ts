import { strict as assert } from "node:assert";
import { test } from "node:test";
import { campuriNecitibile, intregDeLaEi, zecimalDeLaEi } from "./numere";

/*
 * ═══ CE NU E ÎN SCHEMA LOR TRECE PRIN POARTĂ, ÎNTOTDEAUNA ═══
 *
 * 24.08.2026: comerciantul apasă „Adu ofertele". Catalogul se citește întreg, fără o
 * eroare. Apoi importul cade cu `invalid input syntax for type integer: "true"`, zero
 * oferte legate, și o rotiță care se oprește fără să spună nimic.
 *
 * Unul dintre `ownership`, `number_of_offers`, `buy_button_rank` vine boolean. Niciunul
 * nu are tip declarat în OpenAPI-ul lor v4.5.1 — verificat: răspunsul lui
 * `product_offer/read` e `ApiResponse` generic. Le scriseserăm `number` din presupunere,
 * iar TypeScript n-avea cum să ne contrazică: tipul descrie ce credem noi despre un
 * JSON, nu ce trimit ei.
 */

test("eMAG numere: `true` NU devine 1", () => {
  /*
   * ⚠ CHIAR VALOAREA CARE A PICAT IMPORTUL.
   *
   * Și `null`, nu o ghicitură. `ownership: true` ar putea însemna 1 sau 2 — ei spun
   * „1 = poți actualiza documentația, 2 = nu poți", iar un boolean nu se traduce singur
   * în asta. Scris ca 1 din intuiție, ar fi arătat drept până în ziua în care cineva ar
   * fi luat o hotărâre pe el.
   */
  assert.equal(intregDeLaEi(true), null);
  assert.equal(intregDeLaEi(false), null);
});

test("eMAG numere: un șir care e chiar un număr trece", () => {
  /* ⚠ Cealaltă jumătate. Refuzate, un `validation_status: \"9\"` — forma pe care ei o
     trimit uneori — ar fi devenit `null`, iar oferta ar fi arătat neaprobată la
     nesfârșit. Poarta trebuie să fie îngustă, nu închisă. */
  assert.equal(intregDeLaEi("9"), 9);
  assert.equal(intregDeLaEi(" 12 "), 12);
  assert.equal(zecimalDeLaEi("24.99"), 24.99);
});

test("eMAG numere: formele lor obișnuite trec mai departe", () => {
  assert.equal(intregDeLaEi(3), 3);
  assert.equal(intregDeLaEi([7]), 7, "câmpurile lor vin uneori ca tablou de un element");
  assert.equal(intregDeLaEi({ value: 5 }), 5, "și uneori ca `{value}`");
  assert.equal(intregDeLaEi([{ value: 2 }]), 2);
});

test("eMAG numere: gunoiul devine `null`, nu NaN și nu zero", () => {
  /* ⚠ Zero ar fi cel mai rău dintre cele trei: e o valoare validă în coloană, deci
     nimic n-ar da eroare, iar un `buy_button_rank: 0` s-ar citi ca „primul la buton". */
  for (const v of [null, undefined, "", "  ", "abc", {}, [], NaN, Infinity]) {
    assert.equal(intregDeLaEi(v), null, `${JSON.stringify(v)} trebuie să dea null`);
  }
});

test("eMAG numere: se AFLĂ ce anume n-a putut fi citit", () => {
  /*
   * ⚠ Coercitia singură ar fi ascuns problema în loc s-o rezolve: importul ar fi mers,
   * iar întrebarea „ce e `ownership` la ei, de fapt?" ar fi rămas fără răspuns pe veci.
   */
  const ciudate = campuriNecitibile(
    { ownership: true, number_of_offers: 3, buy_button_rank: null },
    ["ownership", "number_of_offers", "buy_button_rank"],
  );
  assert.equal(ciudate.length, 1);
  assert.equal(ciudate[0].camp, "ownership");
  assert.match(ciudate[0].primit, /boolean/);
});

test("eMAG numere: un câmp lipsă NU e un câmp ciudat", () => {
  /* ⚠ Altfel fiecare ofertă fără `buy_button_rank` — adică aproape toate — ar fi
     pornit o constatare, iar cea adevărată s-ar fi pierdut în ele. */
  assert.deepEqual(campuriNecitibile({ ownership: null }, ["ownership", "lipsa"]), []);
});
