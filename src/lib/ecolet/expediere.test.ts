import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adresaEcolet,
  corpExpediere,
  codPostalDeTrimis,
  curata,
  greutateIntreaga,
  lipsuriAdresa,
  type AdresaComanda,
  type DateExpediere,
} from "./expediere";

/*
 * ⚠ eColet nu are mediu de test si fiecare emitere reala e facturata. Fisierul
 * asta e singurul loc unde corpul expedierii se poate verifica INAINTE de prima
 * expediere adevarata.
 */

const EXPEDITOR: AdresaComanda = {
  nume: "Magazinul Meu",
  strada: "Bucuresti-Ploiesti",
  numar: "172-176",
  oras: "Bucuresti",
  judet: "Bucuresti",
  localityId: 323,
  codPostal: "011318",
  telefon: "0214824089",
  email: "depozit@magazin.ro",
};

const DESTINATAR: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Bulevardul Eroilor",
  numar: "12",
  bloc: "A1",
  apartament: "23",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  localityId: 4021,
  codPostal: "400129",
  telefon: "+40 712 345 678",
  email: "ion@exemplu.ro",
};

function date(peste: Partial<DateExpediere> = {}): DateExpediere {
  return { expeditor: EXPEDITOR, destinatar: DESTINATAR, greutateKg: 2.4, ...peste };
}

// ─── Adresa ───────────────────────────────────────────────────────────────────

test("adresa se traduce pe campurile lor", () => {
  const a = adresaEcolet(DESTINATAR);
  assert.equal(a.name, "Ion Popescu");
  assert.equal(a.contact_person, "Ion Popescu");
  assert.equal(a.locality_id, 4021);
  assert.equal(a.locality, "Cluj-Napoca");
  assert.equal(a.county, "Cluj");
  assert.equal(a.street_name, "Bulevardul Eroilor");
  assert.equal(a.street_number, "12");
  assert.equal(a.country, "ro");
});

test("firma devine `name`, persoana ramane `contact_person`", () => {
  const a = adresaEcolet({ ...DESTINATAR, companie: "Firma Beta SRL" });
  assert.equal(a.name, "Firma Beta SRL");
  assert.equal(a.contact_person, "Ion Popescu", "curierul suna un om, nu o firma");
});

test("telefonul se normalizeaza, ca la ceilalti curieri", () => {
  assert.equal(adresaEcolet(DESTINATAR).phone, "0712345678");
});

test("campurile de bloc se trimit doar completate", () => {
  const a = adresaEcolet(DESTINATAR);
  assert.equal(a.block, "A1");
  assert.equal(a.flat, "23");
  assert.ok(!("entrance" in a), "scara lipsa nu se trimite goala");
  assert.ok(!("floor" in a), "etajul lipsa nu se trimite gol");
});

test("⚠ nimic nu se taie", () => {
  /*
   * Specificatia nu declara nicio lungime maxima. Taiat din presupunere, o adresa
   * ciuntita pleaca TACUT; netaiat, eColet raspunde 422 cu numele campului — un
   * refuz dovedit, pe care comerciantul il repara.
   */
  const lunga = "Bulevardul Alexandru Ioan Cuza numarul 1234, bloc A12, scara C, etaj 7, interfon 71";
  assert.equal(adresaEcolet({ ...DESTINATAR, strada: lunga }).street_name, lunga);
});

test("spatiile multiple se strang", () => {
  assert.equal(curata("  Str.   Lunga    12 "), "Str. Lunga 12");
  assert.equal(curata(null), "");
});

// ─── Verificarea adresei ──────────────────────────────────────────────────────

test("o adresa completa nu are lipsuri", () => {
  assert.deepEqual(lipsuriAdresa(DESTINATAR, "destinatar"), []);
  assert.deepEqual(lipsuriAdresa(EXPEDITOR, "expeditor"), []);
});

test("⚠ localitatea nerezolvata are mesaj propriu, nu „camp lipsa”", () => {
  /*
   * `locality_id` nu e ceva ce omul completeaza: e rezultatul unei cautari care
   * poate sa nu gaseasca nimic. Mesajul trebuie sa spuna ca eColet nu recunoaste
   * localitatea, nu ca lipseste un camp — altfel comerciantul cauta in formular
   * un camp care nu exista.
   */
  const l = lipsuriAdresa({ ...DESTINATAR, localityId: 0 }, "destinatar");
  assert.equal(l.length, 1);
  assert.ok(l[0].includes("nu e recunoscuta"), l[0]);
  assert.ok(l[0].includes("Cluj-Napoca"), l[0]);
});

test("⚠ codul postal lipsa e o lipsa, nu un camp optional", () => {
  /* eColet il cere la fiecare adresa; fara el cotarea se intoarce fara nicio
     oferta, si nimic nu spune de ce. */
  const l = lipsuriAdresa({ ...DESTINATAR, codPostal: null }, "destinatar");
  assert.deepEqual(l, ["codul postal al destinatarului"]);
});

test("persoana de contact e omul, nu firma", () => {
  /* La expeditor, `nume` e denumirea firmei: fara campul propriu, curierul ar
     cere la ridicare o persoana pe numele societatii. */
  const a = adresaEcolet({ ...EXPEDITOR, companie: "Magazinul Meu SRL", persoanaContact: "Andrei" });
  assert.equal(a.name, "Magazinul Meu SRL");
  assert.equal(a.contact_person, "Andrei");
});

test("telefonul lipsa e o lipsa: curierul suna inainte sa ajunga", () => {
  const l = lipsuriAdresa({ ...DESTINATAR, telefon: null }, "destinatar");
  assert.deepEqual(l, ["telefonul destinatarului"]);
});

test("o adresa goala isi enumera toate lipsurile deodata", () => {
  const l = lipsuriAdresa(
    { nume: "", strada: "", oras: "", judet: "", localityId: 0 },
    "destinatar",
  );
  assert.equal(l.length, 7, l.join(", "));
});

// ─── Greutatea ────────────────────────────────────────────────────────────────

test("⚠ greutatea e INTREAGA si se rotunjeste IN SUS", () => {
  /*
   * `weight: integer` in specificatie. Rotunjita in jos, declaratia ar fi mai mica
   * decat marfa — iar diferenta o plateste comerciantul la recantarire.
   */
  assert.equal(greutateIntreaga(2.4), 3);
  assert.equal(greutateIntreaga(2), 2);
  assert.equal(greutateIntreaga(0.4), 1);
});

test("greutatea lipsa sau imposibila cade pe un kilogram", () => {
  for (const v of [0, -3, null, undefined, "aiurea", NaN]) {
    assert.equal(greutateIntreaga(v), 1, String(v));
  }
});

// ─── Corpul expedierii ────────────────────────────────────────────────────────

test("⚠ la COTARE serviciul lipseste, la EMITERE e pus", () => {
  /*
   * Singura deosebire intre cele doua apeluri. Gol, eColet raspunde cu preturile
   * pentru toate serviciile; pus, expediaza pe acela.
   */
  const cotare = corpExpediere(date());
  assert.ok(!("service" in cotare.courier), "la cotare nu se trimite niciun serviciu");

  const emitere = corpExpediere(date({ serviciu: "dpd_standard" }));
  assert.equal(emitere.courier.service, "dpd_standard");
});

test("ridicarea e prin curier, fara data fixata de noi", () => {
  /*
   * O data aleasa de noi ar fi putut cadea intr-o zi in care curierul ales nu
   * ridica, iar oferta ar fi disparut din lista fara nicio explicatie.
   */
  const c = corpExpediere(date());
  assert.equal(c.courier.pickup.type, "courier");
  assert.ok(!("date" in c.courier.pickup));
});

test("⚠ rambursul se trimite cu status false, nu omis", () => {
  const fara = corpExpediere(date());
  assert.deepEqual(fara.additional_services.cod, { status: false });

  const cu = corpExpediere(date({ ramburs: 249.999 }));
  assert.deepEqual(cu.additional_services.cod, { status: true, amount: 250 });
});

test("⚠ NICIODATA ramburs pornit cu suma zero", () => {
  /*
   * Ar insemna „incaseaza zero lei": expedierea intra pe fluxul de ramburs, cu
   * comisionul aferent, si nu incaseaza nimic.
   */
  for (const v of [0, -5, NaN, undefined]) {
    assert.deepEqual(corpExpediere(date({ ramburs: v as number })).additional_services.cod, { status: false }, String(v));
  }
});

test("serviciile aditionale pleaca explicit, pornite sau oprite", () => {
  const c = corpExpediere(date({ servicii: { deschidereLaLivrare: true, livrareSambata: false } }));
  assert.equal(c.additional_services.open_package.status, true);
  assert.equal(c.additional_services.saturday_delivery.status, false);
  assert.equal(c.additional_services.sms_notify.status, false);
});

test("valoarea declarata pleaca doar cand e pozitiva", () => {
  assert.ok(!("declared_value" in corpExpediere(date()).parcel));
  assert.ok(!("declared_value" in corpExpediere(date({ valoareDeclarata: 0 })).parcel));
  assert.equal(corpExpediere(date({ valoareDeclarata: 199.994 })).parcel.declared_value, 199.99);
});

test("continutul are o rezerva: campul e obligatoriu la ei", () => {
  assert.equal(corpExpediere(date()).parcel.content, "Produse");
  assert.equal(corpExpediere(date({ continut: "  carti  " })).parcel.content, "carti");
});

test("dimensiunile au valori implicite si sunt intregi pozitive", () => {
  const c = corpExpediere(date());
  assert.ok(c.parcel.dimensions.length > 0);
  assert.ok(Number.isInteger(c.parcel.dimensions.width));

  const d = corpExpediere(date({ dimensiuni: { lungime: 40.7, latime: 30, inaltime: 0 } }));
  assert.equal(d.parcel.dimensions.length, 40);
  assert.equal(d.parcel.dimensions.height, 1, "zero nu e o dimensiune");
});

test("⚠ corpul de cotare si cel de emitere difera DOAR prin serviciu", () => {
  /*
   * Daca s-ar departa in altceva, comanda ar pleca pe alt pret decat cel cotat, iar
   * diferenta ar suporta-o comerciantul. De aia exista un singur constructor.
   */
  const cotare = corpExpediere(date());
  const emitere = corpExpediere(date({ serviciu: "dpd_standard" }));
  const faraServiciu = { ...emitere, courier: { ...emitere.courier, service: undefined } };
  assert.deepEqual(
    JSON.parse(JSON.stringify(faraServiciu)),
    JSON.parse(JSON.stringify(cotare)),
  );
});

test("⚠ codul postal cade pe cel al localitatii — altfel NICIO comanda romaneasca nu poate pleca", () => {
  /*
   * `shipping_address.postal_code` se scrie doar la comenzile din afara tarii.
   * Cand `lipsuriAdresa` a inceput sa ceara codul postal, verificarea a blocat
   * emiterea pentru toate comenzile interne — codul lipsea pur si simplu de peste
   * tot, si nici formularul de AWB nu-l are.
   */
  assert.equal(codPostalDeTrimis("010101", "020202"), "010101", "al comenzii bate");
  assert.equal(codPostalDeTrimis(null, "020202"), "020202", "cel al localitatii tine locul");
  assert.equal(codPostalDeTrimis("  ", "020202"), "020202", "spatiile nu sunt un cod");
  assert.equal(codPostalDeTrimis(undefined, null), "", "fara niciunul, tot gol ramane");

  /* Si consecinta reala: cu caderea, adresa TRECE verificarea. */
  const faraCod = { ...DESTINATAR, codPostal: "" };
  assert.ok(
    lipsuriAdresa(faraCod, "destinatar").some((l) => l.includes("codul postal")),
    "fara cod postal, adresa e refuzata",
  );
  const cuCadere = { ...faraCod, codPostal: codPostalDeTrimis(null, "550000") };
  assert.deepEqual(lipsuriAdresa(cuCadere, "destinatar"), []);
});
