import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adresaGls, coletGls, serviciiGls, taie, type DateExpediere } from "./expediere";

/*
 * ⚠ Prima expediere GLS va fi pe contractul REAL al unui client, in productie.
 * Nu exista rulaj de proba pe care sa-l gresim ieftin.
 *
 * De aia constructia coletului — singura parte care nu atinge reteaua — e
 * acoperita aici pana la capat: fiecare regula care, gresita, ar produce un
 * colet gresit, o eticheta fara telefon sau un ramburs pe care nu-l vrea nimeni.
 */

const EXPEDITOR = {
  nume: "Magazinul Meu SRL",
  strada: "Str. Progresului 2",
  oras: "Matasari",
  codPostal: "217310",
  tara: "RO",
  telefon: "0750456809",
  email: "contact@magazin.ro",
};

const DESTINATAR = {
  nume: "Ion Popescu",
  strada: "Bd. Unirii 5",
  oras: "Bucuresti",
  codPostal: "030167",
  tara: "RO",
  telefon: "+40 712 345 678",
  email: "ion@exemplu.ro",
};

const BAZA: DateExpediere = {
  referinta: "CMD-1001",
  destinatar: DESTINATAR,
  expeditor: EXPEDITOR,
  clientNumber: 12345,
  numarColete: 1,
};

// ─── taierea campurilor ───────────────────────────────────────────────────────

test("textul scurt nu se atinge", () => {
  assert.equal(taie("Bd. Unirii 5", 40), "Bd. Unirii 5");
});

test("spatiile multiple se strang, ca sa nu risipeasca din cele 40 de caractere", () => {
  assert.equal(taie("  Bd.   Unirii    5  ", 40), "Bd. Unirii 5");
});

test("taierea se face pe granita de cuvant cand se poate", () => {
  /* O adresa taiata la mijlocul cuvantului e mai greu de citit de curier. */
  const lung = "Bulevardul Independentei Numarul Douazeci si Trei";
  const rezultat = taie(lung, 30);
  assert.ok(rezultat.length <= 30);
  assert.ok(!rezultat.endsWith(" "));
  assert.equal(rezultat, "Bulevardul Independentei");
});

test("un cuvant mai lung decat limita se taie brutal, nu se pierde", () => {
  /* Altfel am intoarce sir gol, iar GLS ar refuza adresa fara strada. */
  const rezultat = taie("Constantinopolitanuluiforte", 10);
  assert.equal(rezultat.length, 10);
  assert.equal(rezultat, "Constantin");
});

// ─── adresa ───────────────────────────────────────────────────────────────────

test("adresa se traduce in campurile MyGLS", () => {
  const a = adresaGls(DESTINATAR);
  assert.equal(a.Name, "Ion Popescu");
  assert.equal(a.Street, "Bd. Unirii 5");
  assert.equal(a.City, "Bucuresti");
  assert.equal(a.ZipCode, "030167");
  assert.equal(a.CountryIsoCode, "RO");
  assert.equal(a.ContactName, "Ion Popescu");
  assert.equal(a.ContactEmail, "ion@exemplu.ro");
});

test("⚠ telefonul se normalizeaza — altfel nu ajunge pe eticheta", () => {
  /* Curierii accepta expedierea si arunca tacut un telefon pe care nu-l pot
     citi. „+40 712 345 678" trebuie sa iasa „0712345678". */
  assert.equal(adresaGls(DESTINATAR).ContactPhone, "0712345678");
  assert.equal(adresaGls({ ...DESTINATAR, telefon: "0040-712-345-678" }).ContactPhone, "0712345678");
  assert.equal(adresaGls({ ...DESTINATAR, telefon: null }).ContactPhone, "");
});

test("⚠ Name e firma daca exista, dar ContactName ramane persoana", () => {
  /* Curierul suna un om, nu o firma. Daca ContactName ar deveni firma, pe
     eticheta n-ar mai fi pe cine sa caute. */
  const a = adresaGls({ ...DESTINATAR, companie: "Firma Client SRL" });
  assert.equal(a.Name, "Firma Client SRL");
  assert.equal(a.ContactName, "Ion Popescu");
});

test("adresa a doua se lipeste de strada", () => {
  const a = adresaGls({ ...DESTINATAR, stradaExtra: "Bl. A2, Ap. 15" });
  assert.equal(a.Street, "Bd. Unirii 5 Bl. A2, Ap. 15");
});

test("campurile lungi se taie la 40, nu se lasa pe seama GLS", () => {
  /* Un refuz la mijlocul unui lot lasa jumatate din comenzi cu AWB si jumatate
     fara — mai rau decat o adresa scurtata. */
  const a = adresaGls({
    ...DESTINATAR,
    nume: "Alexandru Constantin Vasilescu Popescu Ionescu Georgescu",
    strada: "Bulevardul General Gheorghe Magheru Numarul Douazeci si Opt-Treizeci",
  });
  assert.ok(a.Name.length <= 40, a.Name);
  assert.ok(a.Street.length <= 40, a.Street);
  assert.ok(a.ContactName.length <= 40);
});

test("tara lipsa inseamna Romania, si iese cu majuscule", () => {
  assert.equal(adresaGls({ ...DESTINATAR, tara: null }).CountryIsoCode, "RO");
  assert.equal(adresaGls({ ...DESTINATAR, tara: "de" }).CountryIsoCode, "DE");
});

// ─── ramburs ──────────────────────────────────────────────────────────────────

test("fara ramburs nu se trimit campurile de ramburs", () => {
  /*
   * ⚠ Cel mai important test din fisier. Un `CODAmount: 0` inseamna pentru GLS
   * „incaseaza zero lei": expedierea intra pe fluxul de ramburs degeaba, cu
   * comisionul aferent si cu bani asteptati inapoi de la curier.
   */
  for (const ramburs of [undefined, 0, -5]) {
    const c = coletGls({ ...BAZA, ramburs });
    assert.equal("CODAmount" in c, false, `ramburs=${ramburs}`);
    assert.equal("CODReference" in c, false, `ramburs=${ramburs}`);
  }
});

test("cu ramburs se trimit suma si referinta", () => {
  const c = coletGls({ ...BAZA, ramburs: 249.9 });
  assert.equal(c.CODAmount, 249.9);
  assert.equal(c.CODReference, "CMD-1001");
});

test("suma de ramburs se rotunjeste la doi zecimali", () => {
  /* O suma cu erori de virgula mobila e exact ce respinge un sistem de incasari
     — sau, mai rau, rotunjeste altfel decat noi. */
  const c = coletGls({ ...BAZA, ramburs: 0.1 + 0.2 });
  assert.equal(c.CODAmount, 0.3);
  assert.equal(coletGls({ ...BAZA, ramburs: 12.345 }).CODAmount, 12.35);
});

test("referinta de ramburs poate fi proprie", () => {
  const c = coletGls({ ...BAZA, ramburs: 100, referintaRamburs: "FACT-77" });
  assert.equal(c.CODReference, "FACT-77");
});

// ─── servicii ─────────────────────────────────────────────────────────────────

test("fara optiuni nu se cere niciun serviciu", () => {
  assert.deepEqual(serviciiGls(BAZA), []);
});

test("livrarea in punct trimite PSD cu ID-ul punctului", () => {
  const s = serviciiGls({ ...BAZA, servicii: { parcelShopId: "RO-12345" } });
  assert.deepEqual(s, [{ Code: "PSD", PSDParameter: { StringValue: "RO-12345" } }]);
});

test("⚠ la livrare in punct nu se mai pun serviciile de domiciliu", () => {
  /*
   * CS1, FDS, FSS si AOS presupun ca cineva asteapta acasa. Trimise impreuna cu
   * PSD, GLS fie le ignora, fie refuza expedierea.
   */
  const s = serviciiGls({
    ...BAZA,
    servicii: {
      parcelShopId: "RO-1",
      contact: true,
      livrareFlexibila: true,
      livrareFlexibilaSms: true,
      doarDestinatarul: true,
    },
  });
  const coduri = s.map((x) => x.Code);
  assert.deepEqual(coduri, ["PSD"]);
  for (const interzis of ["CS1", "FDS", "FSS", "AOS"]) {
    assert.ok(!coduri.includes(interzis), `${interzis} n-are ce cauta la livrare in punct`);
  }
});

test("⚠ FSS nu se trimite fara FDS", () => {
  /* Singur, SMS-ul de livrare flexibila n-are pe ce sa se lege. */
  const doarSms = serviciiGls({ ...BAZA, servicii: { livrareFlexibilaSms: true } });
  assert.deepEqual(doarSms.map((s) => s.Code), []);

  const amandoua = serviciiGls({
    ...BAZA,
    servicii: { livrareFlexibila: true, livrareFlexibilaSms: true },
  });
  assert.deepEqual(amandoua.map((s) => s.Code), ["FDS", "FSS"]);
});

test("FDS are nevoie de email, CS1 si SM2 de telefon", () => {
  /* Un serviciu trimis fara parametrul lui e refuzat de GLS pentru toata
     expedierea, nu doar ignorat. */
  const faraEmail = serviciiGls({
    ...BAZA,
    destinatar: { ...DESTINATAR, email: null },
    servicii: { livrareFlexibila: true },
  });
  assert.deepEqual(faraEmail, []);

  const faraTelefon = serviciiGls({
    ...BAZA,
    destinatar: { ...DESTINATAR, telefon: null },
    servicii: { contact: true, smsPreavizare: true },
  });
  assert.deepEqual(faraTelefon, []);
});

test("⚠ SM1 are formatul „telefon|text”, cu bara verticala", () => {
  /* Fara bara, GLS nu stie pe ce numar sa trimita si serviciul cade tacut. */
  const s = serviciiGls({ ...BAZA, servicii: { smsText: "Coletul tau vine azi" } });
  assert.deepEqual(s, [
    { Code: "SM1", SM1Parameter: { Value: "0712345678|Coletul tau vine azi" } },
  ]);
});

test("⚠ 24H nu se trimite in Serbia", () => {
  const inRomania = serviciiGls({ ...BAZA, servicii: { garantat24h: true } });
  assert.deepEqual(inRomania.map((s) => s.Code), ["24H"]);

  const inSerbia = serviciiGls({
    ...BAZA,
    destinatar: { ...DESTINATAR, tara: "RS" },
    servicii: { garantat24h: true },
  });
  assert.deepEqual(inSerbia.map((s) => s.Code), []);
});

test("asigurarea are nevoie de o valoare pozitiva", () => {
  assert.deepEqual(serviciiGls({ ...BAZA, servicii: { asigurare: true } }), []);
  assert.deepEqual(serviciiGls({ ...BAZA, valoare: 0, servicii: { asigurare: true } }), []);
  assert.deepEqual(serviciiGls({ ...BAZA, valoare: 500, servicii: { asigurare: true } }), [
    { Code: "INS", INSParameter: { Value: 500 } },
  ]);
});

// ─── coletul intreg ───────────────────────────────────────────────────────────

test("coletul are forma pe care o asteapta MyGLS", () => {
  const c = coletGls({ ...BAZA, ramburs: 199.99, continut: "Imbracaminte" });
  assert.equal(c.ClientNumber, 12345);
  assert.equal(c.ClientReference, "CMD-1001");
  assert.equal(c.Count, 1);
  assert.equal(c.Content, "Imbracaminte");
  assert.equal(c.PickupAddress.City, "Matasari");
  assert.equal(c.DeliveryAddress.City, "Bucuresti");
  assert.equal(c.CODAmount, 199.99);
});

test("numarul de colete e cel putin 1 si intreg", () => {
  /* Un `Count: 0` produce o expediere fara niciun colet — acceptata si inutila. */
  assert.equal(coletGls({ ...BAZA, numarColete: 0 }).Count, 1);
  assert.equal(coletGls({ ...BAZA, numarColete: 2.7 }).Count, 2);
  assert.equal(coletGls({ ...BAZA, numarColete: 3 }).Count, 3);
});

test("expeditorul si destinatarul nu se incurca intre ei", () => {
  /* Inversate, coletul pleaca de la client catre magazin — si se descopera abia
     cand curierul sune la usa clientului sa ridice. */
  const c = coletGls(BAZA);
  assert.equal(c.PickupAddress.ContactName, "Magazinul Meu SRL");
  assert.equal(c.DeliveryAddress.ContactName, "Ion Popescu");
  assert.notEqual(c.PickupAddress.City, c.DeliveryAddress.City);
});
