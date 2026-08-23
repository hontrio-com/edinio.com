import { strict as assert } from "node:assert";
import { test } from "node:test";
import { baniiComenzii, clientComenzii, liniiEdinio, statusEdinio, valoareVouchere } from "./orders";
import type { EmagComanda } from "./types";

/*
 * Probele comenzilor eMAG.
 *
 * Toate cifrele de mai jos ajung in `orders.total`, adica in rapoartele
 * comerciantului si pe facturile pe care le trimite clientilor. O greseala aici nu
 * da nicio eroare — da niste numere care par in regula si nu sunt.
 */

const P1 = "11111111-1111-1111-1111-111111111111";
const HARTA = new Map([[501, { product_id: P1, variant_title: "M" }]]);

function comanda(x: Partial<EmagComanda>): EmagComanda {
  return { id: 1, status: 1, ...x };
}

/* ── Statusurile ───────────────────────────────────────────────────────────── */

test("eMAG comenzi: fiecare status al lor are un corespondent la noi", () => {
  /* O comanda anulata ramasa „in procesare" tine stocul rezervat pe veci. */
  assert.equal(statusEdinio(0), "cancelled");
  assert.equal(statusEdinio(1), "pending");
  assert.equal(statusEdinio(2), "processing");
  assert.equal(statusEdinio(3), "shipped");
  assert.equal(statusEdinio(4), "delivered");
  assert.equal(statusEdinio(5), "returned");
});

test("eMAG comenzi: un status necunoscut cade pe «nouă», nu pe «livrată»", () => {
  /* ⚠ Directia caderii conteaza. Cazuta pe „livrata", o comanda cu un status nou
     inventat de ei ar fi iesit din fluxul comerciantului fara sa fie expediata. */
  assert.equal(statusEdinio(99), "pending");
});

/* ── Banii ─────────────────────────────────────────────────────────────────── */

test("eMAG comenzi: preturile vin FARA TVA si se aduc inapoi cu el", () => {
  /*
   * ═══ PROBA CARE PAZESTE FACTURILE ═══
   *
   * `sale_price` e net la ei. Insumat de-a gata, totalul comenzii ar fi aparut in
   * magazin cu o cincime sub cat a incasat comerciantul — iar factura ar fi plecat
   * de la numarul mic, catre un client care a platit mai mult.
   */
  const c = comanda({
    products: [{ id: 1, product_id: 501, status: 1, quantity: 2, sale_price: 100 }],
    shipping_tax: 20,
  });
  const b = baniiComenzii(c, 21);
  assert.equal(b.subtotal, 220, "net: 2×100 + 20 livrare");
  assert.equal(b.total, 266.2, "cu TVA de 21%");
  assert.equal(b.vat_amount, 46.2);
  assert.equal(Math.round((b.subtotal + b.vat_amount) * 100) / 100, b.total, "cele trei se leaga");
});

test("eMAG comenzi: o linie stornata nu intra in total", () => {
  const c = comanda({
    products: [
      { id: 1, product_id: 501, status: 1, quantity: 1, sale_price: 100 },
      { id: 2, product_id: 502, status: 0, quantity: 1, sale_price: 500 },
    ],
  });
  assert.equal(baniiComenzii(c, 21).subtotal, 100);
});

test("eMAG comenzi: vouchere pe DOUA niveluri, si toate bucatile lor", () => {
  /*
   * ⚠ Documentatia cere explicit sa se citeasca TOTI parametrii, nu doar primul: pe
   * acelasi produs pot cadea mai multe vouchere, cu cote de TVA diferite.
   *
   * ⚠ Valorile lor sunt NEGATIVE. Scazute in loc sa fie adunate, reducerea s-ar fi
   * transformat in adaos — si comanda ar fi aratat mai scumpa decat a platit omul.
   */
  const c = comanda({
    products: [{
      id: 1, product_id: 501, status: 1, quantity: 1, sale_price: 100,
      product_voucher_split: [
        { voucher_id: 1, value: -10, vat_value: -2.1 },
        { voucher_id: 2, value: -5, vat_value: -1.05 },
      ],
    }],
    vouchers: [{ voucher_id: 3, sale_price: -20, sale_price_vat: -4.2 }],
  });
  const b = baniiComenzii(c, 21);
  assert.equal(b.subtotal, 65, "100 − 10 − 5 − 20");
  assert.equal(b.total, 78.65);
});

test("eMAG comenzi: bucatile unui voucher se ADUNA, nu se ia prima", () => {
  assert.deepEqual(
    valoareVouchere([{ value: -10, vat_value: -2.1 }, { value: -5, vat_value: -1.05 }]),
    { fara: -15, tva: -3.15 },
  );
  assert.deepEqual(valoareVouchere(undefined), { fara: 0, tva: 0 });
});

/* ── Liniile ───────────────────────────────────────────────────────────────── */

test("eMAG comenzi: linia se leaga EXACT, prin id-ul pe care l-am trimis noi", () => {
  /*
   * `products[].product_id` din comanda e chiar `emag_id`-ul nostru. Deci nu se
   * ghiceste dupa cod de bare sau dupa nume — la Trendyol, potrivirea pe barcode a
   * fost sursa a jumatate din incidentele de stoc.
   */
  const l = liniiEdinio([{ id: 1, product_id: 501, status: 1, quantity: 2, sale_price: 100 }], HARTA, 21);
  assert.equal(l[0].product_id, P1);
  assert.equal(l[0].variant_title, "M", "si marimea, ca stocul sa scada de unde trebuie");
  assert.equal(l[0].price, 121, "pretul liniei se scrie CU TVA, ca peste tot in magazin");
});

test("eMAG comenzi: o linie care nu se leaga NU dispare din comanda", () => {
  /*
   * Ramane, cu `product_id: null`. Se vede si se poate factura, dar nu scade stoc,
   * fiindca nu stim al cui. Sarita, comanda ar fi aratat mai ieftina decat e si
   * clientul ar fi primit un produs care nu apare nicaieri.
   */
  const l = liniiEdinio([{ id: 1, product_id: 999, status: 1, quantity: 1, sale_price: 50 }], HARTA, 21);
  assert.equal(l.length, 1);
  assert.equal(l[0].product_id, null);
  assert.equal(l[0].emag_product_id, 999, "id-ul lor ramane scris, ca sa se poata lega pe urma");
});

/* ── Clientul ──────────────────────────────────────────────────────────────── */

test("eMAG comenzi: e-mailul clientului NU se scrie niciodata", () => {
  /*
   * ═══ CEA MAI IMPORTANTA PROBA DIN FISIER ═══
   *
   * `customer.email` de la eMAG e un HASH, nu o adresa — documentatia lor o spune
   * limpede. Scris in `orders.customer_email`, ar fi ajuns pe mana automatizarilor
   * de e-mail: confirmari, cereri de recenzie, cosuri abandonate. Fiecare ar fi
   * plecat catre o adresa inexistenta.
   *
   * Iar respingerile n-ar fi cazut pe eMAG, ci pe domeniul comerciantului. Cateva
   * sute de comenzi si e-mailurile lui adevarate incep sa ajunga in spam — un rau
   * care se repara greu si care n-are nicio legatura vizibila cu integrarea.
   */
  const c = clientComenzii(comanda({
    customer: { name: "Ion Popescu", email: "a3f9c2e1b4d7@hash.emag.ro", shipping_phone: "0722000000" },
  }));
  assert.equal(c.email, null);
  assert.equal(c.name, "Ion Popescu");
  assert.equal(c.phone, "0722000000");
});

test("eMAG comenzi: fara nume, clientul are totusi un nume", () => {
  /* `orders.customer_name` nu poate fi gol. Un rand refuzat de constrangere ar fi
     inghetat fereastra magazinului la fiecare trecere. */
  assert.equal(clientComenzii(comanda({})).name, "Client eMAG");
});

test("eMAG comenzi: livrarea la easybox pastreaza lockerul", () => {
  /* Adresa e a lockerului, nu a omului. Fara id-ul lui, comerciantul n-are cum sa
     stie unde trimite si sună clientul degeaba. */
  const c = clientComenzii(comanda({
    delivery_mode: "pickup",
    details: { locker_id: "RO123", locker_name: "Easybox Piața Unirii" },
    customer: { name: "X", shipping_city: "București" },
  }));
  assert.equal(c.address.locker_id, "RO123");
  assert.equal(c.address.locker_name, "Easybox Piața Unirii");
});
