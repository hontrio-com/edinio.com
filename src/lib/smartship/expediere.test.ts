import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  adresaSmartship, avertismenteExpediere, bani, corpCotare, corpEmitere, continutSmartship,
  courierDeEmis, dimensiuni, greutate, greutateVolumetrica, ibanValid, lipsuriConfigurare,
  lipsuriExpediere, lockerNumeric, numeleAreDouaCuvinte, referintaComenzii, telefonValid,
  type AdresaComanda, type DateExpediere,
} from "./expediere";
import type { SmartshipConfig } from "./client";

/**
 * Probele constructorului SmartShip.
 *
 * ⚠ SmartShip NU are mediu de proba, NU are endpoint de validare si NU are
 * credentiale de test. Deci fisierul asta e SINGURA verificare care se poate face
 * inainte de prima cheie de cont — spre deosebire de Innoship, unde `/validate`
 * raspundea la orice, si de Packeta, unde `packetAttributesValid` spunea chiar
 * numele campului gresit.
 */

const IBAN_BUN = "RO49AAAA1B31007593840000";

const CONFIG: SmartshipConfig = {
  enabled: true,
  api_key: "cheie",
  expeditor: {
    name: "Magazinul Meu SRL",
    address: "Str. Polona 68",
    city: 255154,
    phone: "0720333222",
    country: "RO",
    sector: 1,
  },
  iban: IBAN_BUN,
};

const DESTINATAR: AdresaComanda = {
  nume: "Ion Vasile",
  strada: "Str. Memorandumului",
  numar: "28",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  telefon: "0720123456",
  email: "client@email.com",
  cityId: 256212,
  sector: 0,
};

const DATE: DateExpediere = {
  destinatar: DESTINATAR,
  greutateKg: 2,
  felLivrare: "domiciliu",
  numarColete: 1,
};

describe("SmartShip: unde sta fiecare camp", () => {
  /*
   * ⚠ Proba cea mai importanta din fisier. Documentatia spune de doua ori, cu
   * „NU" scris apasat, ca `show_byoc` si `use_own_contract` stau la nivelul
   * PRINCIPAL — iar `curier_preferat` sta, singur, in `content`. Un camp mutat
   * gresit nu da nicio eroare: se emite tacut pe alt contract, la alt tarif.
   */
  test("curier_preferat sta in content, la COTARE", () => {
    const corp = corpCotare({ ...DATE, courierId: 1 }, CONFIG);
    assert.equal(corp.content.curier_preferat, 1);
    assert.equal((corp as Record<string, unknown>).courier_id, undefined);
  });

  test("courier_id sta la nivelul PRINCIPAL, la EMITERE", () => {
    const corp = corpEmitere({ ...DATE, courierId: 1 }, CONFIG);
    assert.equal(corp.courier_id, 1);
    assert.equal(corp.content.curier_preferat, undefined);
  });

  test("show_byoc sta la nivelul principal, nu in content", () => {
    const corp = corpCotare(DATE, { ...CONFIG, arata_contract_propriu: true });
    assert.equal(corp.show_byoc, 1);
    assert.equal((corp.content as Record<string, unknown>).show_byoc, undefined);
  });

  test("use_own_contract sta la nivelul principal, nu in content", () => {
    const corp = corpEmitere(
      { ...DATE, courierId: 1, contractPropriu: true },
      { ...CONFIG, contract_propriu: true },
    );
    assert.equal(corp.use_own_contract, 1);
    assert.equal((corp.content as Record<string, unknown>).use_own_contract, undefined);
  });

  test("swap si nocom NU pleaca la cotare — acolo ar fi ignorate si pretul ar minti", () => {
    const cotare = corpCotare(
      { ...DATE, laSchimb: true },
      { ...CONFIG, fara_ridicare_automata: true },
    );
    assert.equal(cotare.content.swap, undefined);
    assert.equal(cotare.content.nocom, undefined);

    const emitere = corpEmitere(
      { ...DATE, courierId: 14, laSchimb: true },
      { ...CONFIG, fara_ridicare_automata: true },
    );
    assert.equal(emitere.content.swap, 1);
    assert.equal(emitere.content.nocom, 1);
  });
});

describe("SmartShip: contractul propriu si easybox", () => {
  /*
   * ⚠ Codul 4004 e chiar despre asta. Pe contract propriu, easybox (12) NU e
   * curier separat: se emite cu SameDay (2) plus lockerul.
   */
  test("pe contract propriu, easybox devine SameDay", () => {
    assert.equal(courierDeEmis(12, true), 2);
  });

  test("fara contract propriu, easybox ramane 12", () => {
    assert.equal(courierDeEmis(12, false), 12);
  });

  test("ceilalti curieri raman neatinsi pe amandoua drumurile", () => {
    assert.equal(courierDeEmis(1, true), 1);
    assert.equal(courierDeEmis(1, false), 1);
  });

  test("traducerea se vede in corpul emiterii", () => {
    const corp = corpEmitere(
      { ...DATE, courierId: 12, contractPropriu: true, felLivrare: "locker", lockerId: 4321 },
      { ...CONFIG, contract_propriu: true },
    );
    assert.equal(corp.courier_id, 2);
    assert.equal(corp.content.locker_id, 4321);
  });

  /*
   * ⚠ Comerciantul poate avea BYOC pornit si totusi sa aleaga oferta SmartShip.
   * `use_own_contract` se pune dupa OFERTA aleasa, nu dupa steagul din configurare.
   */
  test("o oferta SmartShip nu emite pe contractul propriu, chiar cu BYOC pornit", () => {
    const corp = corpEmitere(
      { ...DATE, courierId: 1, contractPropriu: false },
      { ...CONFIG, contract_propriu: true },
    );
    assert.equal(corp.use_own_contract, undefined);
    assert.equal(corp.courier_id, 1);
  });

  test("fara BYOC in configurare, o oferta marcata BYOC nu forteaza contractul", () => {
    const corp = corpEmitere({ ...DATE, courierId: 12, contractPropriu: true }, CONFIG);
    assert.equal(corp.use_own_contract, undefined);
    /* Si atunci easybox ramane 12, fiindca nu emitem pe contract propriu. */
    assert.equal(corp.courier_id, 12);
  });
});

describe("SmartShip: validarile lor, facute la noi", () => {
  test("numele cere doua cuvinte", () => {
    assert.equal(numeleAreDouaCuvinte("Ion Vasile"), true);
    assert.equal(numeleAreDouaCuvinte("Ion"), false);
    assert.equal(numeleAreDouaCuvinte("  Ion   Vasile  "), true);
    assert.equal(numeleAreDouaCuvinte(""), false);
    assert.equal(numeleAreDouaCuvinte(null), false);
  });

  test("un nume dintr-un cuvant OPRESTE emiterea, cu numele in mesaj", () => {
    const lipsuri = lipsuriExpediere({ ...DATE, destinatar: { ...DESTINATAR, nume: "Ion" } }, CONFIG);
    assert.ok(lipsuri.some((l) => l.includes("Ion") && l.includes("doua")));
  });

  test("telefonul: zece cifre romanesti", () => {
    assert.equal(telefonValid("0720123456"), true);
    assert.equal(telefonValid("+40 720 123 456"), true);
    assert.equal(telefonValid("0040720123456"), true);
    assert.equal(telefonValid("072012345"), false);
    assert.equal(telefonValid("+49 30 1234567"), false);
    assert.equal(telefonValid(""), false);
  });

  test("un telefon international spune ca SmartShip livreaza doar in tara", () => {
    const lipsuri = lipsuriExpediere(
      { ...DATE, destinatar: { ...DESTINATAR, telefon: "+49 30 1234567" } },
      CONFIG,
    );
    assert.ok(lipsuri.some((l) => l.includes("international")));
  });

  test("IBAN: mod 97 si forma romaneasca", () => {
    assert.equal(ibanValid(IBAN_BUN), true);
    assert.equal(ibanValid("RO49 AAAA 1B31 0075 9384 0000"), true);
    assert.equal(ibanValid("ro49aaaa1b31007593840000"), true);
    /* Cifra de control schimbata: forma e buna, mod 97 nu. */
    assert.equal(ibanValid("RO50AAAA1B31007593840000"), false);
    assert.equal(ibanValid("DE89370400440532013000"), false);
    assert.equal(ibanValid("RO49AAAA1B3100759384"), false);
    assert.equal(ibanValid(""), false);
    assert.equal(ibanValid(null), false);
  });

  /*
   * ⚠ Cel mai scump defect posibil in configurare: un IBAN gresit face ca TOATE
   * comenzile cu ramburs sa cada pe tariful fix, tacut, fiindca `/cost` raspunde
   * 201 si cotarea se pierde in `catch`.
   */
  test("rambursul fara IBAN valid opreste inainte de orice cerere", () => {
    const cuRamburs = { ...DATE, ramburs: 250 };
    assert.ok(lipsuriExpediere(cuRamburs, { ...CONFIG, iban: "" }).some((l) => l.includes("IBAN")));
    assert.ok(lipsuriExpediere(cuRamburs, { ...CONFIG, iban: "RO50AAAA1B31007593840000" })
      .some((l) => l.includes("IBAN")));
    assert.equal(lipsuriExpediere(cuRamburs, CONFIG).length, 0);
  });

  test("fara ramburs, IBAN-ul nu e cerut", () => {
    assert.equal(lipsuriExpediere(DATE, { ...CONFIG, iban: "" }).length, 0);
  });
});

describe("SmartShip: configurarea magazinului contra adresei clientului", () => {
  /*
   * ⚠ Cele doua cauze cer lucruri opuse in checkout: configurarea gresita ridica
   * o alerta catre comerciant (pana o repara, TOATE comenzile pierd pretul real),
   * adresa incompleta a unui cumparator NU. Amestecate, alerta ar suna la fiecare
   * client care scrie „Bucuresti" fara sector — si omul s-ar invata s-o ignore.
   */
  test("o adresa incompleta NU e o problema de configurare", () => {
    const faraSector: AdresaComanda = { ...DESTINATAR, oras: "Bucuresti", judet: "Bucuresti", sector: null };
    const date = { ...DATE, destinatar: faraSector };

    assert.equal(lipsuriConfigurare(CONFIG, false).length, 0);
    assert.ok(lipsuriExpediere(date, CONFIG).some((l) => l.includes("sectorul")));
  });

  test("un IBAN gresit E o problema de configurare, dar numai la ramburs", () => {
    const stricat = { ...CONFIG, iban: "RO50AAAA1B31007593840000" };
    assert.equal(lipsuriConfigurare(stricat, false).length, 0);
    assert.ok(lipsuriConfigurare(stricat, true).some((l) => l.includes("IBAN")));
  });

  test("expeditorul lipsa e o problema de configurare, la orice comanda", () => {
    const gol = { ...CONFIG, expeditor: undefined };
    assert.ok(lipsuriConfigurare(gol, false).some((l) => l.includes("adresa de ridicare")));
  });

  test("emiterea le cuprinde pe amandoua", () => {
    const date = { ...DATE, ramburs: 250, destinatar: { ...DESTINATAR, nume: "Ion" } };
    const lipsuri = lipsuriExpediere(date, { ...CONFIG, iban: "", expeditor: undefined });
    assert.ok(lipsuri.some((l) => l.includes("adresa de ridicare")));
    assert.ok(lipsuri.some((l) => l.includes("IBAN")));
    assert.ok(lipsuri.some((l) => l.includes("doua")));
  });
});

describe("SmartShip: Bucurestiul si sectorul", () => {
  const bucurestean: AdresaComanda = {
    ...DESTINATAR,
    oras: "Sector 3",
    judet: "Municipiul Bucuresti",
    cityId: 255154,
    sector: 3,
  };

  test("sectorul ajunge in campul lui", () => {
    const corp = corpCotare({ ...DATE, destinatar: bucurestean }, CONFIG);
    assert.equal(corp.recipient.sector, 3);
  });

  test("in afara Bucurestiului sectorul e 0, cum cer ei", () => {
    const corp = corpCotare(DATE, CONFIG);
    assert.equal(corp.recipient.sector, 0);
  });

  /*
   * ⚠ `null` inseamna „e in Bucuresti si nu stim care sector". Un 0 pus in locul
   * lui ar fi o AFIRMATIE („nu e in Bucuresti"), nu o valoare lipsa — si coletul
   * ar pleca prin oras dupa cum vrea curierul.
   */
  test("in Bucuresti fara sector, expedierea SE OPRESTE", () => {
    const lipsuri = lipsuriExpediere(
      { ...DATE, destinatar: { ...bucurestean, oras: "Bucuresti", sector: null } },
      CONFIG,
    );
    assert.ok(lipsuri.some((l) => l.includes("sectorul") && l.includes("Bucuresti")));
  });
});

describe("SmartShip: continutul coletului", () => {
  test("greutatea nu coboara sub pragul minim si nu e niciodata zero", () => {
    assert.equal(greutate(0), 0.1);
    assert.equal(greutate(-5), 0.1);
    assert.equal(greutate("abc"), 0.1);
    assert.equal(greutate(2.4567), 2.457);
  });

  test("banii se rotunjesc la doi zecimali, iar negativul devine zero", () => {
    assert.equal(bani(12.345), 12.35);
    assert.equal(bani(-1), 0);
    assert.equal(bani(null), 0);
  });

  test("dimensiunile cad pe cele din exemplul lor cand configurarea e goala", () => {
    assert.deepEqual(dimensiuni({}), { length: 30, width: 20, height: 10 });
    assert.deepEqual(dimensiuni({ lungime_cm: 0, latime_cm: -3 }), { length: 30, width: 20, height: 10 });
    assert.deepEqual(dimensiuni({ lungime_cm: 45.6 }), { length: 46, width: 20, height: 10 });
  });

  test("greutatea volumetrica e L×l×h/6000, formula lor", () => {
    assert.equal(greutateVolumetrica(30, 20, 10), 1);
    assert.equal(greutateVolumetrica(60, 40, 30), 12);
    assert.equal(greutateVolumetrica(0, 20, 10), 0);
  });

  test("IBAN-ul pleaca doar cand exista ramburs", () => {
    assert.equal(continutSmartship(DATE, CONFIG).iban, "");
    assert.equal(continutSmartship({ ...DATE, ramburs: 250 }, CONFIG).iban, IBAN_BUN);
  });

  test("asigurarea e stinsa din oficiu, fiindca ea costa", () => {
    assert.equal(continutSmartship({ ...DATE, valoareDeclarata: 500 }, CONFIG).insurance, 0);
    assert.equal(
      continutSmartship({ ...DATE, valoareDeclarata: 500 }, { ...CONFIG, asigura_coletul: true }).insurance,
      500,
    );
  });

  /* ⚠ Documentat de ei: la locker nu exista curier care sa deschida coletul. */
  test("deschiderea la livrare nu pleaca la locker", () => {
    const cuDeschidere = { ...CONFIG, deschidere_la_livrare: true };
    assert.equal(continutSmartship(DATE, cuDeschidere).open_package, 1);
    assert.equal(
      continutSmartship({ ...DATE, felLivrare: "locker", lockerId: 12 }, cuDeschidere).open_package,
      0,
    );
  });

  test("coletele multiple au prioritate, si numai cand sunt complete", () => {
    const cuColete = continutSmartship(
      { ...DATE, colete: [{ weight: 2, length: 30, width: 20, height: 10 }] },
      CONFIG,
    );
    assert.equal(cuColete.parcels_multiple?.length, 1);

    /* Un colet fara dimensiuni n-are ce cauta acolo: ar inlocui greutatea totala. */
    const incomplet = continutSmartship(
      { ...DATE, colete: [{ weight: 2, length: 0, width: 20, height: 10 }] },
      CONFIG,
    );
    assert.equal(incomplet.parcels_multiple, undefined);
    assert.equal(incomplet.weight, 2);
  });

  test("nota DPD se taie la plafonul LOR de 200", () => {
    const c = continutSmartship({ ...DATE, notaDpd: "x".repeat(300) }, CONFIG);
    assert.equal(c.dpd_shipment_note?.length, 200);
  });

  test("lockerul pleaca doar la livrarea in locker, si doar ca intreg pozitiv", () => {
    assert.equal(continutSmartship({ ...DATE, lockerId: 4321 }, CONFIG).locker_id, undefined);
    assert.equal(
      continutSmartship({ ...DATE, felLivrare: "locker", lockerId: "4321" }, CONFIG).locker_id,
      4321,
    );
    assert.equal(lockerNumeric("0"), null);
    assert.equal(lockerNumeric("abc"), null);
    assert.equal(lockerNumeric(-3), null);
    assert.equal(lockerNumeric(4321), 4321);
  });

  test("livrarea la locker fara locker OPRESTE", () => {
    const lipsuri = lipsuriExpediere({ ...DATE, felLivrare: "locker" }, CONFIG);
    assert.ok(lipsuri.some((l) => l.includes("lockerul")));
  });

  /*
   * ⚠ Altfel decat la Sameday si Innoship: adresa clientului RAMANE, fiindca
   * SmartShip ruteaza dupa `locker_id`, iar adresa e datele de contact.
   */
  test("la locker, adresa destinatarului ramane a lui", () => {
    const corp = corpCotare({ ...DATE, felLivrare: "locker", lockerId: 4321 }, CONFIG);
    assert.ok(corp.recipient.address.includes("Memorandumului"));
    assert.equal(corp.recipient.city, 256212);
  });
});

describe("SmartShip: referinta comenzii", () => {
  /*
   * ⚠ `order_number` e unic doar PER MAGAZIN, iar SmartShip cauta pe CONT. Doua
   * magazine cu acelasi cont ar imparti comanda #0001 — si `cautaDupaComanda`,
   * chiar mecanismul care inchide fereastra „nu stiu daca s-a creat", ar scrie
   * AWB-ul altui magazin pe comanda gresita.
   */
  test("cuprinde si magazinul, nu doar numarul comenzii", () => {
    const a = referintaComenzii("#0001", "11111111-2222-3333-4444-555555555555");
    const b = referintaComenzii("#0001", "99999999-2222-3333-4444-555555555555");
    assert.notEqual(a, b);
    assert.equal(a, "0001-1111");
  });

  test("e stabila intre apeluri — altfel cautarea inversa n-ar gasi nimic", () => {
    assert.equal(referintaComenzii("#0042", "abc-def"), referintaComenzii("#0042", "abc-def"));
  });

  test("nu ramane goala nici cand numarul lipseste", () => {
    assert.equal(referintaComenzii(null, "abcdef"), "ORD-ABCD");
  });

  test("ajunge in content.order_id", () => {
    const corp = corpCotare({ ...DATE, orderId: "0042-ABCD" }, CONFIG);
    assert.equal(corp.content.order_id, "0042-ABCD");
  });
});

describe("SmartShip: expeditorul", () => {
  test("un expeditor incomplet opreste inainte de orice cerere", () => {
    const lipsuri = lipsuriExpediere(DATE, { ...CONFIG, expeditor: undefined });
    assert.ok(lipsuri.some((l) => l.includes("adresa de ridicare")));
  });

  test("id-ul de localitate al expeditorului e cerut anume", () => {
    const lipsuri = lipsuriExpediere(DATE, {
      ...CONFIG,
      expeditor: { ...CONFIG.expeditor!, city: 0 },
    });
    assert.ok(lipsuri.some((l) => l.includes("id-ul localitatii expeditorului")));
  });

  test("expeditorul ajunge in cerere cu tara si sectorul lui", () => {
    const corp = corpCotare(DATE, CONFIG);
    assert.equal(corp.sender.city, 255154);
    assert.equal(corp.sender.sector, 1);
    assert.equal(corp.sender.country, "RO");
    assert.equal(corp.sender.phone, "0720333222");
  });
});

describe("SmartShip: coletul la schimb", () => {
  test("e refuzat local la curierii care nu-l accepta (codul lor 699)", () => {
    const lipsuri = lipsuriExpediere({ ...DATE, courierId: 1, laSchimb: true }, CONFIG);
    assert.ok(lipsuri.some((l) => l.includes("colet la schimb")));
  });

  test("trece la PTT Express si la SmartShip Delivery", () => {
    assert.equal(lipsuriExpediere({ ...DATE, courierId: 14, laSchimb: true }, CONFIG).length, 0);
    assert.equal(lipsuriExpediere({ ...DATE, courierId: 16, laSchimb: true }, CONFIG).length, 0);
  });

  test("pe contract propriu ramane doar PTT Express", () => {
    const lipsuri = lipsuriExpediere(
      { ...DATE, courierId: 16, laSchimb: true, contractPropriu: true },
      { ...CONFIG, contract_propriu: true },
    );
    assert.ok(lipsuri.some((l) => l.includes("colet la schimb")));
  });
});

describe("SmartShip: ce doar avertizeaza", () => {
  test("greutatea volumetrica peste cea reala se spune, fiindca ea se factureaza", () => {
    const av = avertismenteExpediere(
      { ...DATE, greutateKg: 0.5 },
      { ...CONFIG, lungime_cm: 60, latime_cm: 40, inaltime_cm: 30 },
    );
    assert.ok(av.some((a) => a.includes("volumetrica")));
  });

  test("cand greutatea reala e mai mare, nu se spune nimic", () => {
    const av = avertismenteExpediere({ ...DATE, greutateKg: 20 }, CONFIG);
    assert.equal(av.some((a) => a.includes("volumetrica")), false);
  });

  test("continutul prea lung se taie, si se spune", () => {
    const date = { ...DATE, continut: "x".repeat(400) };
    assert.ok(avertismenteExpediere(date, CONFIG).some((a) => a.includes("taiata")));
    assert.equal(continutSmartship(date, CONFIG).package_content.length, 255);
  });
});

describe("SmartShip: adresa", () => {
  test("blocul, scara, etajul si apartamentul intra in acelasi camp", () => {
    const a = adresaSmartship({
      ...DESTINATAR,
      bloc: "A1", scara: "2", etaj: "3", apartament: "45",
    });
    assert.equal(a.address, "Str. Memorandumului, nr. 28, bl. A1, sc. 2, et. 3, ap. 45");
  });

  test("firma tine locul persoanei in campul `name`", () => {
    assert.equal(adresaSmartship({ ...DESTINATAR, companie: "Firma Mea SRL" }).name, "Firma Mea SRL");
  });

  test("emiterea fara curier ales arunca — nu trimite o cerere pe jumatate", () => {
    assert.throws(() => corpEmitere(DATE, CONFIG), /curierul ales/);
  });
});
