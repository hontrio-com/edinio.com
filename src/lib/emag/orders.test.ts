import { strict as assert } from "node:assert";
import { test } from "node:test";
import { baniiComenzii, clientComenzii, liniiEdinio, statusEdinio, valoareVouchere, onoratDeEmag, TIP_ONORAT_DE_EMAG, seCereConfirmare, eDejaConfirmata, STATUS_NOUA} from "./orders";
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

/* ── Comenzile onorate de eMAG (FBE) ──────────────────────────────── */

test("eMAG comenzi: `type: 2` inseamna onorata de EI, si se recunoaste ca atare", () => {
  /*
   * ═══ DE CE CONTEAZA ATAT DE MULT ═══
   *
   * La FBE marfa e DEJA la eMAG: a plecat din depozitul comerciantului cand a trimis-o
   * acolo, cu saptamani inaintea vanzarii.
   *
   * ⚠ Stocul scazut din nou la vanzare ar fi lasat magazinul propriu fara stoc pentru
   * marfa pe care o are pe raft — si ar fi refuzat comenzi adevarate.
   * ⚠ `order/acknowledge` inseamna „ma ocup eu de livrare". La FBE se ocupa ei, iar
   * documentatia lor spune ca doar `type: 3` se editeaza.
   */
  assert.equal(TIP_ONORAT_DE_EMAG, 2);
  assert.equal(onoratDeEmag(2), true);
  assert.equal(onoratDeEmag(3), false, "onorata de vanzator");
});

test("eMAG comenzi: un tip lipsa NU e tratat ca FBE", () => {
  /*
   * ⚠ Implicitul lor la `order/read` e 3, iar o comanda fara tip e aproape sigur una
   * de vanzator. Presupusa FBE, stocul NU s-ar mai fi consumat — iar magazinul ar fi
   * vandut a doua oara bucati care plecasera deja, la fiecare comanda careia ii lipsea
   * campul. Tacut, fiindca lipsa unei scaderi nu se vede nicaieri.
   */
  assert.equal(onoratDeEmag(null), false);
  assert.equal(onoratDeEmag(undefined), false);
  assert.equal(onoratDeEmag(0), false);
});

/* ── Confirmarea comenzii ───────────────────────────────────────── */

test("eMAG confirmare: se cere DOAR pentru o comanda inca „noua”", () => {
  /*
   * ═══ DEFECT VAZUT IN PRODUCTIE, 24.08.2026, LA PRIMA CONECTARE ═══
   *
   * O comanda deja „in procesare" la ei — confirmata de alta integrare, sau de
   * comerciant din panoul lor — raspunde la `acknowledge` cu:
   *
   *   400  ERROR: Order is already in progress.
   *
   * Forma dinainte trata orice 400 ca esec: scria un warning si NU punea
   * `acknowledged_at`. Iar ingestul reincearca confirmarea la FIECARE actualizare,
   * tocmai fiindca `acknowledged_at` e gol.
   *
   * Cerere arsa → 400 → warning → campul ramane gol → se repeta. La nesfarsit.
   * Masurat la prima conectare: 1 comanda din 2 era prinsa asa.
   *
   * ⚠ Raspunsul nu e sa citim mesajul lor, ci sa nu mai punem intrebarea:
   * `acknowledge` muta comanda din „noua" in „in procesare", iar daca e deja dincolo,
   * cererea n-are ce sa faca. Se stie din `status`, care e documentat.
   */
  assert.equal(STATUS_NOUA, 1);
  assert.equal(seCereConfirmare(1), true, "noua: se confirma");
  for (const st of [2, 3, 4, 0, 5]) {
    assert.equal(seCereConfirmare(st), false, `starea ${st}: nu se mai cere`);
  }
});

test("eMAG confirmare: un status LIPSA nu declanseaza cererea", () => {
  /* ⚠ Fara status nu se stie daca e „noua". Presupusa asa, s-ar fi intors exact bucla
     de mai sus pentru fiecare comanda careia ii lipseste campul. */
  assert.equal(seCereConfirmare(null), false);
  assert.equal(seCereConfirmare(undefined), false);
});

test("eMAG confirmare: plasa pentru cursa recunoaste ce spun EI", () => {
  /*
   * ⚠ Se uita la TEXT, si regula casei e sa nu se faca asta (vezi `errors.ts`). E o
   * PLASA, nu regula: paza adevarata e `seCereConfirmare`, pe status. Asta prinde doar
   * cursa — comanda era „noua" cand am citit-o si a confirmat-o altcineva intre timp.
   *
   * Daca ei schimba textul, plasa tace si ramane paza structurala. Degradeaza bland,
   * ceea ce e chiar conditia in care o potrivire pe text e ingaduita.
   */
  assert.equal(eDejaConfirmata("ERROR: Order is already in progress."), true);
  assert.equal(eDejaConfirmata("WARNING: Order has already been acknowledged."), true);
  assert.equal(eDejaConfirmata("order IS ALREADY IN PROGRESS"), true, "fara majuscule");
});

test("eMAG confirmare: un refuz ADEVARAT nu se ia drept reusita", () => {
  /* Plasa n-are voie sa inghita esecuri reale: acelea trebuie sa se vada in jurnal. */
  assert.equal(eDejaConfirmata("ERROR: Order does not belong to seller"), false);
  assert.equal(eDejaConfirmata("Invalid order id"), false);
  assert.equal(eDejaConfirmata(null), false);
  assert.equal(eDejaConfirmata(""), false);
});

/* ── Taxele SGR intra in bani (audit 24.08.2026) ───────────────────────────── */

test("eMAG comenzi: taxa SGR intra in totalul comenzii", () => {
  /*
   * ═══ O GAURA DE BANI, TACUTA ═══
   *
   * `recycle_warranties` era declarat `unknown[]` si nu se citea nicaieri. Deci
   * totalul nostru iesea mai mic decat cat a facturat eMAG clientului.
   *
   * La plata ramburs, `rambursDeIncasat` trimite curierul sa incaseze totalul NOSTRU:
   * cu SGR-ul lipsa, cere mai putin decat trebuie, iar diferenta o pierde
   * comerciantul. Cate 0,50 lei pe ambalaj, pe fiecare comanda, la nesfarsit.
   */
  const fara = baniiComenzii({
    products: [{ status: 1, sale_price: 100, quantity: 1 }],
  } as never, 21);
  const cu = baniiComenzii({
    products: [{
      status: 1, sale_price: 100, quantity: 1,
      recycle_warranties: [{ quantity: 2, sale_price: 0.5, vat_rate: 0 }],
    }],
  } as never, 21);

  assert.equal(cu.subtotal - fara.subtotal, 1, "doua ambalaje x 0,50 lei");
  assert.equal(cu.total - fara.total, 1, "SGR cu cota 0 nu adauga TVA");
});

test("eMAG comenzi: SGR-ul are COTA LUI, nu pe a magazinului", () => {
  /* ⚠ Trecut prin cota magazinului, ar fi iesit cu cativa bani gresit — o suma prea
     mica pentru a fi observata, si exact de aceea nereparata niciodata. */
  const r = baniiComenzii({
    products: [{
      status: 1, sale_price: 0, quantity: 1,
      recycle_warranties: [{ quantity: 1, sale_price: 10, vat_rate: 5 }],
    }],
  } as never, 21);
  assert.equal(r.subtotal, 10);
  assert.equal(r.vat_amount, 0.5, "5% din 10, nu 21%");
});

test("eMAG comenzi: SGR-ul unei linii stornate nu se mai incaseaza", () => {
  /* ⚠ Urmeaza soarta liniei. Numarat separat, o linie anulata si-ar fi lasat taxa in
     total, iar curierul ar fi cerut bani pentru un ambalaj care nu mai pleaca. */
  const r = baniiComenzii({
    products: [{
      status: 0, sale_price: 100, quantity: 1,
      recycle_warranties: [{ quantity: 4, sale_price: 0.5, vat_rate: 0 }],
    }],
  } as never, 21);
  assert.equal(r.total, 0);
});
