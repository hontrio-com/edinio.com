import assert from "node:assert/strict";
import { test } from "node:test";
import { citesteComanda, MAX_LINII } from "./comanda-forma";
import { citesteEticheta } from "./eticheta";

/*
 * ⚠ SARCINA UTILA DE MAI JOS E CEA DIN DOCUMENTATIA LOR, reparata numai acolo unde
 * exemplul lor nu e JSON valid: `"payment_mode":cod` fara ghilimele, o virgula lipsa
 * intre `total_shipping_price_currency` si `voucher`, si virgule la coada listelor.
 *
 * ⚠ NU S-A SCHIMBAT NICIUN NUME DE CAMP si nicio valoare. Rescrisa „cum ar trebui sa
 * arate", proba ar fi aparat forma pe care mi-o inchipui eu, nu pe cea care soseste.
 */
const OFICIAL = {
  origin: "pepita.hu",
  id: 118924,
  date: "2018-05-21 10:23:41",
  payment_mode: "cod",
  customer_message: "Tisztelt Partnerünk! Vevő megjegyzése: Kézbesítés előtt fél órával, hívjon!",
  courier_message: "Keremhivjanakelotte",
  status: "new_order",
  payment_status: "unpaid",
  total_shipping_price: 1200,
  total_shipping_price_currency: "HUF",
  voucher: "",
  delivery_mod: "mpl",
  customer: {
    last_name: "Teszt", first_name: "Péter", phone: "06201111111", email: "teszt.peter@pepita.hu",
    billing_name: "Teszt Péter", billing_country: "HU", billing_city: "Miskolc",
    billing_street: "Teszt u.14", billing_street_address: "Teszt u.", billing_house_number: "14",
    billing_postal_code: "3534",
    shipping_country: "HU", shipping_city: "Miskolc", shipping_street: "Teszt u.14",
    shipping_street_address: "Teszt u", shipping_house_number: "14", shipping_postal_code: "3534",
  },
  products: [
    { id: "139955", sku: "ozq123", currency: "HUF", quantity: 2, price: 3192, vat: 27 },
    { id: "139956", sku: "ozq124", currency: "HUF", quantity: 2, price: 3192, vat: 27 },
  ],
};

const bun = (brut: unknown) => {
  const v = citesteComanda(brut);
  assert.equal(v.ok, true, `asteptam o comanda valida, am primit ${JSON.stringify(v)}`);
  return v.ok ? v.comanda : (undefined as never);
};

const rau = (brut: unknown, cod: string) => {
  const v = citesteComanda(brut);
  assert.equal(v.ok, false, "asteptam un refuz");
  if (!v.ok) assert.equal(v.cod, cod);
  return v;
};

test("sarcina utila oficiala se citeste intreaga", () => {
  const c = bun(OFICIAL);
  assert.equal(c.externalId, "118924");
  assert.equal(c.origine, "pepita.hu");
  assert.equal(c.modPlata, "cod");
  assert.equal(c.starePlata, "unpaid");
  assert.equal(c.modLivrare, "mpl");
  assert.equal(c.transport, 1200);
  assert.equal(c.monedaTransport, "HUF");
  assert.equal(c.voucher, 0);
  assert.equal(c.linii.length, 2);
  assert.deepEqual(c.linii[0], { idPepita: "139955", sku: "ozq123", moneda: "HUF", cantitate: 2, pret: 3192, tva: 27 });
  assert.equal(c.client.prenume, "Péter");
  assert.equal(c.client.nume, "Teszt");
  assert.equal(c.client.livrare.oras, "Miskolc");
});

test("⚠ `id`-ul numeric si cel text duc la acelasi identificator", () => {
  /* Exemplul lor trimite `"id":118924` (numar) la comanda si `"id":"139955"` (sir) la
     produse. Citit numai ca sir, comanda intreaga ar fi fost respinsa. */
  assert.equal(bun({ ...OFICIAL, id: "118924" }).externalId, "118924");
  assert.equal(bun({ ...OFICIAL, id: 118924 }).externalId, "118924");
});

test("⚠ se citeste si `delivery_mod`, si `delivery_mode`", () => {
  /* Documentatia lor scrie `delivery_mod` si in definitie, si in exemplu. Poate fi o
     greseala de tipar. Aleasa una singura, jumatate din comenzi ar fi ramas fara mod
     de livrare. */
  assert.equal(bun({ ...OFICIAL, delivery_mod: "gls" }).modLivrare, "gls");
  const faraMod = { ...OFICIAL, delivery_mod: undefined };
  assert.equal(bun({ ...faraMod, delivery_mode: "gls_parcelshop" }).modLivrare, "gls_parcelshop");
});

test("judetul romanesc se citeste, si lipseste pe alte piete", () => {
  /* Documentatia lor: „only for Romanian orders". */
  const ro = bun({ ...OFICIAL, customer: { ...OFICIAL.customer, shipping_country: "RO", shipping_county: "Cluj" } });
  assert.equal(ro.client.livrare.judet, "Cluj");
  assert.equal(bun(OFICIAL).client.livrare.judet, null);
});

test("codul fiscal al unei comenzi pe firma se pastreaza", () => {
  const c = bun({ ...OFICIAL, customer: { ...OFICIAL.customer, tax_number: "RO12345678" } });
  assert.equal(c.client.codFiscal, "RO12345678");
});

test("⚠ campurile necunoscute NU opresc comanda", () => {
  /* Ei pot adauga maine un camp. O comanda respinsa pentru asta ar fi o comanda pierduta,
     si ar cadea toate deodata. */
  const c = bun({ ...OFICIAL, camp_nou_2027: { orice: [1, 2] }, products: [{ ...OFICIAL.products[0], nou: true }] });
  assert.equal(c.linii.length, 1);
});

test("⚠ campurile critice lipsa opresc comanda, cu motiv", () => {
  rau({}, "corp-gol");
  rau(null, "corp-gol");
  rau("nu e obiect", "corp-gol");
  rau({ ...OFICIAL, id: undefined }, "fara-id");
  rau({ ...OFICIAL, id: "   " }, "fara-id");
  rau({ ...OFICIAL, products: [] }, "fara-produse");
  rau({ ...OFICIAL, products: "nu e listă" }, "fara-produse");
});

test("⚠ cantitatea si pretul se verifica PE LINIE", () => {
  /* O linie cu cantitate zero sau negativa ar CRESTE stocul la consum. */
  for (const q of [0, -1, 1.5, "abc", null, undefined]) {
    rau({ ...OFICIAL, products: [{ ...OFICIAL.products[0], quantity: q }] }, "cantitate-nevalida");
  }
  rau({ ...OFICIAL, products: [{ ...OFICIAL.products[0], price: -1 }] }, "pret-nevalid");
  rau({ ...OFICIAL, products: [{ ...OFICIAL.products[0], price: "abc" }] }, "pret-nevalid");
});

test("pretul zero pe o linie e primit: un cadou din campanie e o linie reala", () => {
  const c = bun({ ...OFICIAL, products: [{ ...OFICIAL.products[0], price: 0 }] });
  assert.equal(c.linii[0].pret, 0);
});

test("⚠ o comanda cu prea multe linii se opreste, nu se prelucreaza pe jumatate", () => {
  const multe = Array.from({ length: MAX_LINII + 1 }, () => OFICIAL.products[0]);
  rau({ ...OFICIAL, products: multe }, "prea-multe-linii");
  /* Chiar la limita trece: 50 de articole intr-o comanda e mult, dar cu putinta. */
  const laLimita = Array.from({ length: MAX_LINII }, () => OFICIAL.products[0]);
  assert.equal(bun({ ...OFICIAL, products: laLimita }).linii.length, MAX_LINII);
});

test("⚠ campul gol inseamna „lipsește”, nu „zero lei”", () => {
  /* `Number("")` e zero, iar zero are inteles la transport: un transport netrimis ar fi
     aparut ca transport gratuit. Aici amandoua ies 0, dar din drumuri diferite. */
  assert.equal(bun({ ...OFICIAL, voucher: "" }).voucher, 0);
  assert.equal(bun({ ...OFICIAL, voucher: "500" }).voucher, 500);
  assert.equal(bun({ ...OFICIAL, total_shipping_price: "1.200" }).transport, 1.2);
});

test("moneda se citeste numai daca arata a cod de moneda", () => {
  /* Moneda liniilor SI a transportului deodata: altfel amestecul opreste comanda, pe drept. */
  const ron = bun({
    ...OFICIAL,
    products: [{ ...OFICIAL.products[0], currency: "ron" }],
    total_shipping_price_currency: "ron",
  });
  assert.equal(ron.linii[0].moneda, "RON");
  assert.equal(ron.monedaNevalida, false);

  /*
   * ⚠ PROBA ASTA APARA ALTCEVA DECAT INAINTE. Pana acum cerea ca un cod strambat sa devina
   * `null`, adica exact repararea tacuta: comanda mergea mai departe cu moneda magazinului,
   * ca si cum am fi stiut. Acum codul necitit ramane `null` PE LINIE, dar comanda poarta
   * semnul, si ingestul o duce in carantina.
   */
  const stramb = bun({ ...OFICIAL, products: [{ ...OFICIAL.products[0], currency: "lei romanesti" }] });
  assert.equal(stramb.linii[0].moneda, null);
  assert.equal(stramb.monedaNevalida, true);

  /* Un camp care nu e nici macar text nu e „trimis": e lipsa. */
  assert.equal(bun({ ...OFICIAL, total_shipping_price_currency: 42 }).monedaTransport, null);
});

test("⚠ data NU se converteste, se pastreaza ca sir", () => {
  /*
   * Formatul lor n-are fus orar si documentatia nu spune in ce fus e. Citita ca UTC, o
   * comanda de la 01:00 ar aparea in ziua precedenta; citita local, una din alt fus ar
   * sari inainte.
   */
  assert.equal(bun(OFICIAL).dataBruta, "2018-05-21 10:23:41");
  assert.equal(bun({ ...OFICIAL, date: "nu e o data" }).dataBruta, "nu e o data");
});

test("clientul lipsa nu darama comanda, dar se vede ca lipseste", () => {
  const c = bun({ ...OFICIAL, customer: undefined });
  assert.equal(c.client.nume, "");
  assert.equal(c.client.telefon, "");
  assert.equal(c.client.email, null);
});

test("sirurile foarte lungi se taie, nu se scriu intregi in baza", () => {
  const c = bun({ ...OFICIAL, customer_message: "a".repeat(50_000) });
  assert.ok((c.mesajClient ?? "").length <= 2000);
});

test("valorile ostile raman TEXT, nu devin cod", () => {
  /* Ce vine de la ei e text neincrezator peste tot: in panou, in XML si in loguri. */
  const c = bun({ ...OFICIAL, customer_message: "<script>alert(1)</script>", products: [{ ...OFICIAL.products[0], sku: "'; drop table orders; --" }] });
  assert.equal(c.mesajClient, "<script>alert(1)</script>");
  assert.equal(c.linii[0].sku, "'; drop table orders; --");
});

/* ══════════════════════════════════════════════════════════════════════════
   MONEDA: FORMA SI COERENTA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Ce se verifica NU e o lista alba de monede. O lista prea stramta ar respinge o comanda
   adevarata dintr-o piata noua, iar o comanda respinsa e o comanda PIERDUTA: „Resend order"
   e un buton apasat de om, nu o reincercare. Se verifica forma codului si coerenta lui in
   cadrul comenzii; alta moneda decat a magazinului duce comanda in carantina, nu la gunoi.
*/

function cuMonede(linii: unknown[], peste: Record<string, unknown> = {}) {
  return citesteComanda({
    id: 900, payment_mode: "cod", delivery_mod: "shipping",
    customer: { last_name: "P", first_name: "I", phone: "0720000000" },
    products: linii, ...peste,
  });
}

test("⚠ doua monede pe aceeasi comanda se RESPING: totalul ar fi mere adunate cu pere", () => {
  const v = cuMonede([
    { id: "1", sku: "A", quantity: 1, price: 10, currency: "RON" },
    { id: "2", sku: "B", quantity: 1, price: 10, currency: "HUF" },
  ]);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.cod, "monede-amestecate");
});

test("⚠ un cod de moneda strambat nu se mai repara tacut, dar nici nu pierde comanda", () => {
  for (const rea of ["12", "ronn", "R", "lei romanesti", "-"]) {
    const v = cuMonede([{ id: "1", sku: "A", quantity: 1, price: 10, currency: rea }]);
    /* Comanda intra: un cod necitit nu strica nicio socoteala, spre deosebire de doua monede. */
    assert.equal(v.ok, true, `„${rea}" a pierdut comanda`);
    assert.equal(v.ok && v.comanda.moneda, null);
    assert.equal(v.ok && v.comanda.monedaNevalida, true, `„${rea}" a trecut ca si cum ar fi in regula`);
  }

  /*
   * ⚠ CE NU PRINDE FORMA, SI SE STIE: „LEI" are trei litere, deci trece de verificarea de
   * forma si devine o moneda cu numele „LEI". Nu se pierde nimic: nefiind moneda magazinului,
   * ingestul o duce tot in carantina, doar cu celalalt motiv. O lista alba ar fi prins-o aici,
   * si ar fi respins in schimb o comanda adevarata dintr-o piata pe care n-o cunoastem.
   */
  const lei = cuMonede([{ id: "1", sku: "A", quantity: 1, price: 10, currency: "LEI" }]);
  assert.equal(lei.ok && lei.comanda.moneda, "LEI");
  assert.equal(lei.ok && lei.comanda.monedaNevalida, false);
});

test("moneda lipsa NU e o abatere: sunt piete unde ei n-o trimit", () => {
  const v = cuMonede([{ id: "1", sku: "A", quantity: 1, price: 10 }]);
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.comanda.moneda, null);
});

test("o singura moneda pe toate liniile devine moneda comenzii", () => {
  const v = cuMonede([
    { id: "1", sku: "A", quantity: 1, price: 10, currency: "huf" },
    { id: "2", sku: "B", quantity: 1, price: 10, currency: "HUF" },
  ]);
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.comanda.moneda, "HUF");
});

test("⚠ si transportul e bani: in alta moneda decat liniile, comanda se respinge", () => {
  const v = cuMonede(
    [{ id: "1", sku: "A", quantity: 1, price: 10, currency: "RON" }],
    { total_shipping_price: 20, total_shipping_price_currency: "HUF" },
  );
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.cod, "monede-amestecate");
});

test("transport ZERO nu se compara cu nimic: n-are ce sa strice", () => {
  const v = cuMonede(
    [{ id: "1", sku: "A", quantity: 1, price: 10, currency: "RON" }],
    { total_shipping_price: 0, total_shipping_price_currency: "HUF" },
  );
  assert.equal(v.ok, true);
});

/* ══════════════════════════════════════════════════════════════════════════
   ETICHETA TRECE INTREAGA PRIN CITITOR (09.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE A SCAPAT. `package_label` se citea cu `sir()`, care taie la 2.000 de semne — bun pentru un
   nume sau o adresa, dezastruos pentru un PDF codat Base64. O eticheta de numai 100 KB are peste
   136.000 de semne, deci pastram 1,46% din ea.

   ⚠ SI DE CE N-A SCARTAIT NIMIC. 2.000 se imparte exact la 4, deci ciotul ramane Base64 VALID;
   decodat, incepe tot cu `%PDF-`, deci trecea si de verificarea de continut. Scriam in depozit un
   PDF rupt si il numeam eticheta.

   ⚠ SI DE CE N-A PRINS-O NICIUNA DIN CELE SAPTE PROBE ALE ETICHETEI: toate ii dadeau octetii
   DIRECT lui `citesteEticheta`, niciuna nu trecea prin `citesteComanda`. Iar PDF-ul din ele avea
   60 de octeti — sub plafon, deci nimic nu se taia. Un numar mare de probe nu inlocuieste o proba
   pe DRUMUL adevarat.
*/

/** Un PDF de peste 100 KB, cu antet si coada adevarate. */
function pdfMare(octetiUmplutura = 100 * 1024): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "latin1"),
    Buffer.alloc(octetiUmplutura, 0x41),
    Buffer.from("\ntrailer\n%%EOF\n", "latin1"),
  ]);
}

test("⚠ o eticheta de 100 KB trece INTREAGA prin citirea comenzii", () => {
  const pdf = pdfMare();
  const b64 = pdf.toString("base64");
  assert.ok(b64.length > 130_000, `proba nu mai masoara ce credea: ${b64.length} semne`);

  const c = bun({ ...OFICIAL, package_label: b64 });

  assert.equal(c.etichetaBruta, b64, "eticheta a fost taiata pe drum");
  const citita = citesteEticheta(c.etichetaBruta);
  assert.equal(citita.fel, "buna");
  if (citita.fel === "buna") assert.deepEqual(citita.octeti, pdf, "octetii nu mai sunt cei trimisi");
});

test("⚠ un PDF TAIAT se refuza, desi incepe cu `%PDF-` si e Base64 valid", () => {
  /*
   * Chiar forma pe care o producea defectul: primele 2.000 de semne dintr-o eticheta adevarata.
   * Base64 valid (2.000 se imparte la 4), decodeaza in octeti care incep cu `%PDF-`, si totusi e un
   * fisier rupt. A doua plasa il prinde dupa coada: orice PDF intreg se termina cu `%%EOF`.
   */
  const intreg = pdfMare().toString("base64");
  const ciot = intreg.slice(0, 2000);
  assert.equal(ciot.length % 4, 0, "ciotul trebuie sa fie Base64 valid, altfel proba nu apara nimic");

  const citita = citesteEticheta(ciot);
  assert.equal(citita.fel, "rea", "un PDF rupt a trecut drept eticheta buna");
  if (citita.fel === "rea") assert.match(citita.motiv, /taiat/);
});

test("celelalte campuri RAMAN taiate la 2.000: plafonul n-a fost slabit pentru toata lumea", () => {
  /*
   * ⚠ Reparatia ar fi putut fi „mareste `MAX_SIR`". Ar fi mers pentru eticheta si ar fi deschis un
   * mesaj de client de un megaoctet, pastrat pe comanda si randat in panou.
   */
  const c = bun({ ...OFICIAL, customer_message: "x".repeat(5000), package_label: pdfMare(1024).toString("base64") });
  assert.equal(c.mesajClient?.length, 2000, "mesajul clientului nu mai e marginit");
  assert.ok((c.etichetaBruta ?? "").length > 1300, "eticheta a ramas taiata");
});
