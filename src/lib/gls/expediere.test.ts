import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adresaGls,
  avertismenteColet,
  coletGls,
  motivRefuzSerbia,
  serviciiGls,
  taie,
  MAX_COLETE,
  type DateExpediere,
} from "./expediere";

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
  /* ⚠ Numarul iese in campul lui: `Street` e „Name of the street", iar
     `HouseNumber` „ONLY NUMBER" (pagina 10). Vezi proba de taiere mai jos. */
  assert.equal(a.Street, "Bd. Unirii");
  assert.equal(a.HouseNumber, "5");
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

test("adresa a doua se desparte in numar si detalii de bloc", () => {
  const a = adresaGls({ ...DESTINATAR, stradaExtra: "Bl. A2, Ap. 15" });
  assert.equal(a.Street, "Bd. Unirii");
  assert.equal(a.HouseNumber, "5");
  assert.equal(a.HouseNumberInfo, "Bl. A2, Ap. 15");
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

test("⚠⚠ NUMARUL SUPRAVIETUIESTE TAIERII — proba care lipsea", () => {
  /*
   * Proba de mai sus verifica doar `length <= 40` si trece EXACT peste defect.
   *
   * Adresa reala: strada plus numar depaseste 40 de caractere, iar taierea se
   * face pe granita de cuvant — deci numarul, care sta la sfarsit, pica primul:
   *
   *   „Bulevardul General Gheorghe Magheru 28" -> „Bulevardul General Gheorghe Magheru"
   *
   * Coletul pleaca cu strada fara numar, curierul nu gaseste adresa, urmeaza
   * codul 18 sau 20 din Appendix G si apoi 23: retur. Comerciantul plateste
   * ambele drumuri si nu incaseaza rambursul.
   */
  const a = adresaGls({ ...DESTINATAR, strada: "Bulevardul General Gheorghe Magheru 28" });
  assert.equal(a.HouseNumber, "28", "numarul nu are voie sa dispara");
  assert.ok(a.Street.length <= 40);
  assert.ok(!a.Street.includes("28"), "numarul nu mai sta si in Street");

  /* Cazul din Bucuresti, 56 de caractere, care pierdea bloc/scara/etaj/apartament. */
  const b = adresaGls({ ...DESTINATAR, strada: "Aleea Barajul Bicaz nr. 12, bl. M21, sc. B, et. 4, ap. 63" });
  assert.equal(b.Street, "Aleea Barajul Bicaz");
  assert.equal(b.HouseNumber, "12");
  assert.equal(b.HouseNumberInfo, "bl. M21, sc. B, et. 4, ap. 63");
});

test("⚠ o strada al carei NUME contine cifre nu se rupe gresit", () => {
  /*
   * Cealalta jumatate a regulii: o despartire gresita strica adresa mai rau
   * decat o lasa. „Strada 13 Septembrie" nu are numarul 13.
   */
  const a = adresaGls({ ...DESTINATAR, strada: "Strada 13 Septembrie" });
  assert.equal(a.Street, "Strada 13 Septembrie");
  assert.equal(a.HouseNumber, undefined, "nu exista numar de casa aici");

  /* Dar cu numar la sfarsit, tot trebuie sa iasa numarul CORECT — ultimul. */
  const b = adresaGls({ ...DESTINATAR, strada: "Bulevardul 1 Mai 28" });
  assert.equal(b.Street, "Bulevardul 1 Mai");
  assert.equal(b.HouseNumber, "28");
});

test("cand apelantul are numarul separat, nu se mai ghiceste", () => {
  /* `shipping_address.street_no` exista pe unele comenzi. Atunci e adevarul, si
     nicio euristica nu are ce cauta peste el. */
  const a = adresaGls({ ...DESTINATAR, strada: "Strada 13 Septembrie", numar: "90" });
  assert.equal(a.HouseNumber, "90");
  assert.equal(a.Street, "Strada 13 Septembrie");
});

test("adresa fara numar nu inventeaza campuri goale", () => {
  const a = adresaGls({ ...DESTINATAR, strada: "Calea Victoriei" });
  assert.equal(a.Street, "Calea Victoriei");
  assert.equal("HouseNumber" in a, false);
  assert.equal("HouseNumberInfo" in a, false);
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

test("⚠ numarul dat separat se curata: HouseNumber e „ONLY NUMBER”", () => {
  /*
   * `shipping_address.street_no` e text liber si contine des si restul. Pus
   * intreg in `HouseNumber`, ar incalca chiar regula pentru care exista campul
   * (pagina 10).
   */
  const a = adresaGls({ ...DESTINATAR, strada: "Bd. Unirii", numar: "5, bl. A2, ap. 15" });
  assert.equal(a.Street, "Bd. Unirii");
  assert.equal(a.HouseNumber, "5");
  assert.equal(a.HouseNumberInfo, "bl. A2, ap. 15");
});

test("⚠⚠ cele doua cai de emitere trimit ACEEASI adresa, pe TOATE formele reale", () => {
  /*
   * Modalul lipeste strada si numarul intr-un singur camp editabil; lotul le are
   * separat. Aceeasi comanda nu are voie sa plece altfel dupa cum a fost apasat
   * butonul — diferenta s-ar vedea abia pe eticheta tiparita.
   *
   * ⚠ Prima forma a probei verifica doar „5" si trecea EXACT peste defect: cand
   * `street_no` nu incepea cu o cifra („FN", „nr. 5", „bis 3"), calea lotului
   * pierdea textul cu totul, iar calea formularului il pastra. Lista de mai jos
   * e cea pe care s-a masurat divergenta.
   */
  const forme = ["5", "5A", "FN", "nr. 5", "no. 7", "bis 3", "12-14", "1 bis", "5, bl. A2, ap. 15", "-"];
  for (const numar of forme) {
    const caLot = adresaGls({ ...DESTINATAR, strada: "Str. Morii", numar });
    const caModal = adresaGls({ ...DESTINATAR, strada: `Str. Morii ${numar}` });
    assert.deepEqual(caLot, caModal, `forma „${numar}" pleaca diferit pe cele doua cai`);
  }
});

test("⚠⚠ un numar care nu incepe cu cifra NU se pierde", () => {
  /*
   * „FN" (fara numar) si „nr. 5" sunt forme uzuale in datele reale. O varianta
   * anterioara a despartirii le arunca in intregime: nici in `Street`, nici in
   * `HouseNumber`, nici in `HouseNumberInfo` — coletul pleca spre o strada fara
   * numar, adica exact defectul pe care despartirea trebuia sa-l repare.
   */
  const fn = adresaGls({ ...DESTINATAR, strada: "Str. Principala", numar: "FN" });
  assert.ok(
    `${fn.Street} ${fn.HouseNumber ?? ""} ${fn.HouseNumberInfo ?? ""}`.includes("FN"),
    `„FN" a disparut: ${JSON.stringify(fn)}`,
  );

  /* Marcajul explicit e chiar cazul cel mai sigur: trebuie sa iasa numarul. */
  const cuMarcaj = adresaGls({ ...DESTINATAR, strada: "Str. Morii", numar: "nr. 5" });
  assert.equal(cuMarcaj.Street, "Str. Morii");
  assert.equal(cuMarcaj.HouseNumber, "5");
});

test("plafonul de colete e cel din documentatie, si se aplica", () => {
  const colet = coletGls({ ...BAZA, numarColete: 250 });
  assert.equal(colet.Count, MAX_COLETE);
  assert.equal(MAX_COLETE, 99);
  assert.deepEqual(avertismenteColet({ ...BAZA, numarColete: 250 }).length, 1);
});

test("⚠ asigurarea nu pleaca pe o expediere cu mai multe colete", () => {
  /* Appendix A, 28: „The Count must be 1 because of the INS service" — trimise
     impreuna, GLS refuza TOATA expedierea. */
  const multe = coletGls({ ...BAZA, numarColete: 3, valoare: 500, servicii: { asigurare: true } });
  assert.equal(multe.ServiceList.some((s) => s.Code === "INS"), false);
  assert.equal(avertismenteColet({ ...BAZA, numarColete: 3, valoare: 500, servicii: { asigurare: true } }).length, 1);

  const unul = coletGls({ ...BAZA, numarColete: 1, valoare: 500, servicii: { asigurare: true } });
  assert.equal(unul.ServiceList.some((s) => s.Code === "INS"), true);
});

test("⚠ Content pleaca INTOTDEAUNA, cu referinta pe post de rezerva", () => {
  /* „optionally REQUIRED, depends on the user right" (pagina 9), MANDATORY in
     Serbia, iar Appendix A are codul 33. Un cont cu dreptul pornit ar fi primit
     refuz pe orice comanda careia i s-a sters continutul din formular. */
  assert.equal(coletGls({ ...BAZA, continut: "Doua carti" }).Content, "Doua carti");
  assert.equal(coletGls({ ...BAZA, continut: null }).Content, BAZA.referinta);
  assert.equal(coletGls({ ...BAZA, continut: "" }).Content, BAZA.referinta);
});

test("⚠ Serbia se opreste inainte de apel, cu motivul spus", () => {
  /* Trei campuri obligatorii acolo si niciunul nu se trimite: buletinul/PIB-ul
     expeditorului, continutul si greutatea. Refuzul ar fi venit de la GLS, iar
     comerciantul n-ar fi avut ce corecta. */
  assert.equal(motivRefuzSerbia(BAZA), null);
  const spreRS = { ...BAZA, destinatar: { ...BAZA.destinatar, tara: "RS" } };
  assert.ok(motivRefuzSerbia(spreRS)?.includes("Serbia"));
});
