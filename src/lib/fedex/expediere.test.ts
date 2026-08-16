import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  coletFedex, corpExpediere, corpTarife, liniiAdresa, lipsuriExpediere, orasFedex,
  parteFedex, referintaComenzii, sectorPentruAdresa, telefonFedex, ziuaAzi,
  type AdresaComanda, type DateExpediere,
} from "./expediere";
import type { FedexConfig } from "./client";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Trei feluri de gresala pe care FedEx NU le semnaleaza:
 *
 *  1. `dimensions.units` lipsa e citit de ei ca INCH. Un colet de 30x20x10 devine
 *     76x51x25 cm, cu tarif si validari pe masura, fara nicio eroare.
 *  2. `streetLines` se taie la 35 de caractere pe linie si se ignora peste a treia.
 *     O adresa romaneasca pusa pe un rand ajunge la curier fara apartament.
 *  3. Rambursul. FedEx nu-l are, si o comanda cu ramburs trebuie sa se opreasca
 *     INAINTE de emitere, nu la ei.
 */

const CONFIG: FedexConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "613902139",
  mediu: "productie",
  expeditor: {
    nume: "Depozit Edinio",
    companie: "Edinio SRL",
    telefon: "0721000111",
    strada: "Str. Fabricii nr. 12",
    oras: "Cluj-Napoca",
    judet: "Cluj",
    cod_postal: "400001",
    tara: "RO",
  },
};

const DESTINATAR: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Strada Aviatorilor",
  numar: "25",
  bloc: "A2",
  scara: "B",
  etaj: "3",
  apartament: "47",
  oras: "Constanta",
  judet: "Constanta",
  codPostal: "900330",
  telefon: "0722333444",
  email: "ion@exemplu.ro",
};

const DATE: DateExpediere = {
  destinatar: DESTINATAR,
  greutateKg: 2.4,
  serviceType: "FEDEX_PRIORITY",
  referinta: "EDN-AB12-000123",
};

describe("FedEx: unitatile care nu au voie sa lipseasca", () => {
  test("⚠ `dimensions.units` pleaca INTOTDEAUNA — lipsa lui inseamna INCH la ei", () => {
    const colet = coletFedex(CONFIG, DATE, null) as Record<string, Record<string, unknown>>;
    assert.equal(colet.dimensions.units, "CM");
    assert.equal(colet.weight.units, "KG");
  });

  test("dimensiunile sunt intregi si se rotunjesc IN SUS", () => {
    const colet = coletFedex({ ...CONFIG, lungime_cm: 30.2, latime_cm: 19.6, inaltime_cm: 9.1 }, DATE, null) as Record<string, Record<string, number>>;
    assert.equal(colet.dimensions.length, 31);
    assert.equal(colet.dimensions.width, 20);
    assert.equal(colet.dimensions.height, 10);
    for (const v of Object.values(colet.dimensions)) {
      if (typeof v === "number") assert.ok(Number.isInteger(v), `${v} nu e intreg`);
    }
  });

  test("dimensiunile lipsa cad pe implicitele noastre, nu pe zero", () => {
    const colet = coletFedex(CONFIG, DATE, null) as Record<string, Record<string, number>>;
    assert.equal(colet.dimensions.length, 30);
    assert.equal(colet.dimensions.width, 20);
    assert.equal(colet.dimensions.height, 10);
  });

  test("dimensiunile nu depasesc plafonul lor de 999", () => {
    const colet = coletFedex({ ...CONFIG, lungime_cm: 5000 }, DATE, null) as Record<string, Record<string, number>>;
    assert.equal(colet.dimensions.length, 999);
  });

  test("greutatea zero devine minimul, nu zero", () => {
    const colet = coletFedex(CONFIG, { ...DATE, greutateKg: 0 }, null) as Record<string, Record<string, number>>;
    assert.ok(colet.weight.value > 0);
  });

  test("⚠ `groupPackageCount` exista — fara el referinta noastra nu se intoarce in raspuns", () => {
    const colet = coletFedex(CONFIG, DATE, "EDN-AB12-000123") as Record<string, unknown>;
    assert.equal(colet.groupPackageCount, 1);
  });

  test("referinta merge pe colet, cu tipul care exista SI la cautare", () => {
    const colet = coletFedex(CONFIG, DATE, "EDN-AB12-000123") as Record<string, { customerReferenceType: string; value: string }[]>;
    assert.equal(colet.customerReferences.length, 1);
    assert.equal(colet.customerReferences[0].customerReferenceType, "CUSTOMER_REFERENCE");
    assert.equal(colet.customerReferences[0].value, "EDN-AB12-000123");
  });

  test("fara referinta, campul lipseste cu totul", () => {
    const colet = coletFedex(CONFIG, DATE, null) as Record<string, unknown>;
    assert.equal(colet.customerReferences, undefined);
  });
});

describe("FedEx: adresa se imparte, nu se trunchiaza", () => {
  test("⚠ apartamentul NU se pierde pe o adresa lunga", () => {
    const linii = liniiAdresa(DESTINATAR);
    assert.ok(linii.length > 1, "o adresa lunga trebuie sa ocupe mai multe linii");
    assert.ok(linii.join(" ").includes("ap. 47"), `apartamentul lipseste din ${JSON.stringify(linii)}`);
  });

  test("nicio linie nu depaseste 35 de caractere si nu sunt mai mult de 3", () => {
    const linii = liniiAdresa(DESTINATAR);
    assert.ok(linii.length <= 3);
    for (const l of linii) assert.ok(l.length <= 35, `„${l}” are ${l.length} caractere`);
  });

  test("diacriticele cad, o singura data, aici", () => {
    const linii = liniiAdresa({ strada: "Str. Mihail Kogălniceanu", numar: "5" });
    assert.equal(linii.join(" ").includes("ă"), false);
    assert.ok(linii.join(" ").includes("Kogalniceanu"));
  });

  test("adresa scurta ramane pe o singura linie", () => {
    assert.deepEqual(liniiAdresa({ strada: "Str. Lunga", numar: "3" }), ["Str. Lunga, nr. 3"]);
  });

  test("adresa goala nu arunca", () => {
    assert.deepEqual(liniiAdresa({ strada: "", numar: null }), []);
  });

  test("un singur cuvant absurd de lung se taie, dar nu blocheaza restul", () => {
    const linii = liniiAdresa({ strada: "A".repeat(60), numar: "7" });
    assert.ok(linii.length >= 1);
    for (const l of linii) assert.ok(l.length <= 35);
  });
});

describe("FedEx: Bucurestiul", () => {
  /*
   * ⚠ FedEx intra in TABARA CEA MARE: orasul se plieaza in „Bucuresti".
   * FedEx nu documenteaza NICIO regula de sector, deci nu se inventeaza una —
   * sectorul, care ramane o informatie reala de livrare, pleaca pe adresa.
   */
  test("orasul se plieaza in „Bucuresti”, oricum ar fi scris", () => {
    assert.equal(orasFedex("Sector 3", "Bucuresti"), "Bucuresti");
    assert.equal(orasFedex("București", "București"), "Bucuresti");
    assert.equal(orasFedex("Bucharest", ""), "Bucuresti");
  });

  test("in afara Bucurestiului, orasul ramane al lui", () => {
    assert.equal(orasFedex("Cluj-Napoca", "Cluj"), "Cluj-Napoca");
    assert.equal(orasFedex("Iași", "Iași"), "Iasi");
  });

  test("sectorul se recunoaste din oras sau din judet", () => {
    assert.equal(sectorPentruAdresa({ oras: "Sector 5", judet: "Bucuresti" }), "Sector 5");
    assert.equal(sectorPentruAdresa({ oras: "Bucuresti", judet: "sectorul 2" }), "Sector 2");
  });

  test("⚠ sectorul NU se ghiceste: „Bucuresti” simplu nu produce niciunul", () => {
    assert.equal(sectorPentruAdresa({ oras: "Bucuresti", judet: "Bucuresti" }), null);
    assert.equal(sectorPentruAdresa({ oras: "Cluj-Napoca", judet: "Cluj" }), null);
  });

  test("sectorul ajunge pe ADRESA, nu in oras", () => {
    const p = parteFedex({ ...DESTINATAR, oras: "Sector 4", judet: "Bucuresti", strada: "Str. Mica", numar: "1", bloc: null, scara: null, etaj: null, apartament: null });
    assert.equal(p.address.city, "Bucuresti");
    assert.ok(p.address.streetLines.join(" ").includes("Sector 4"));
  });

  test("sectorul NU imbranceste strada afara cand adresa e deja plina", () => {
    const p = parteFedex({ ...DESTINATAR, oras: "Sector 4", judet: "Bucuresti" });
    assert.ok(p.address.streetLines.length <= 3);
    assert.ok(p.address.streetLines[0].includes("Aviatorilor"));
  });
});

describe("FedEx: contactul", () => {
  test("⚠ macar unul dintre nume si firma exista mereu — FedEx cere asta", () => {
    const cuNume = parteFedex(DESTINATAR);
    assert.equal(cuNume.contact.personName, "Ion Popescu");

    const doarFirma = parteFedex({ ...DESTINATAR, nume: "", companie: "Firma SRL" });
    assert.equal(doarFirma.contact.companyName, "Firma SRL");

    const niciunul = parteFedex({ ...DESTINATAR, nume: "", companie: null });
    assert.ok(niciunul.contact.personName || niciunul.contact.companyName);
  });

  test("numele se taie la 35, ca sa nu-l taie ei pe eticheta", () => {
    const p = parteFedex({ ...DESTINATAR, nume: "N".repeat(60) });
    assert.equal(p.contact.personName?.length, 35);
  });

  test("telefonul ramane doar cifre si sub 15 caractere", () => {
    assert.equal(telefonFedex("+40 (721) 000-111"), "0721000111");
    assert.equal(telefonFedex("0040721000111"), "0721000111");
    assert.ok(telefonFedex("+49 30 123456789012345678").length <= 15);
  });

  test("telefon gol ramane gol, si atunci `lipsuriExpediere` opreste", () => {
    assert.equal(telefonFedex(""), "");
    assert.equal(telefonFedex(null), "");
  });

  test("emailul lipsa nu produce un camp gol in cerere", () => {
    const p = parteFedex({ ...DESTINATAR, email: null });
    assert.equal("emailAddress" in p.contact, false);
  });
});

describe("FedEx: referinta noastra", () => {
  test("⚠ poarta si magazinul, nu doar numarul comenzii", () => {
    // `order_number` reporneste la #0001 pe fiecare magazin, iar FedEx cauta pe CONT.
    const a = referintaComenzii("ab12cdef-0000-0000-0000-000000000000", "000123");
    const b = referintaComenzii("ff99cdef-0000-0000-0000-000000000000", "000123");
    assert.notEqual(a, b);
    assert.ok(a.startsWith("EDN-AB12-"));
  });

  test("acelasi magazin si aceeasi comanda dau acelasi sir, mereu", () => {
    const id = "ab12cdef-0000-0000-0000-000000000000";
    assert.equal(referintaComenzii(id, "000123"), referintaComenzii(id, "000123"));
  });

  test("caracterele ciudate din numarul comenzii nu se strecoara", () => {
    const r = referintaComenzii("ab12cdef", "#00/12 3");
    assert.equal(/^[A-Z0-9-]+$/.test(r), true);
  });
});

describe("FedEx: ce lipseste", () => {
  test("configurarea si comanda se despart, ca la SmartShip", () => {
    const l = lipsuriExpediere(CONFIG, DATE);
    assert.deepEqual(l.configurare, []);
    assert.deepEqual(l.comanda, []);
  });

  test("⚠ o adresa incompleta a clientului NU da vina pe configurare", () => {
    const l = lipsuriExpediere(CONFIG, { ...DATE, destinatar: { ...DESTINATAR, telefon: "" } });
    assert.deepEqual(l.configurare, []);
    assert.ok(l.comanda.some((x) => x.includes("telefonul")));
  });

  test("codul postal al expeditorului lipsa e o problema de CONFIGURARE", () => {
    const fara = { ...CONFIG, expeditor: { ...CONFIG.expeditor!, cod_postal: "" } };
    assert.ok(lipsuriConfigurareaAre(fara, "codul postal"));
  });

  test("⚠ o comanda cu ramburs se opreste la noi, nu la ei", () => {
    const l = lipsuriExpediere(CONFIG, { ...DATE, ramburs: 250 });
    assert.ok(l.comanda.some((x) => x.toLowerCase().includes("ramburs")));
  });

  test("codul postal se cere pentru Romania, dar nu si pentru alte tari", () => {
    const roFara = lipsuriExpediere(CONFIG, { ...DATE, destinatar: { ...DESTINATAR, codPostal: "" } });
    assert.ok(roFara.comanda.some((x) => x.includes("codul postal")));

    const strainFara = lipsuriExpediere(CONFIG, {
      ...DATE,
      destinatar: { ...DESTINATAR, codPostal: "", tara: "DE", oras: "Berlin" },
    });
    assert.equal(strainFara.comanda.some((x) => x.includes("codul postal")), false);
  });

  test("greutatea peste limita Express se semnaleaza, cu iesirea spre Freight", () => {
    const l = lipsuriExpediere(CONFIG, { ...DATE, greutateKg: 120, serviceType: "FEDEX_PRIORITY" });
    assert.ok(l.comanda.some((x) => x.includes("Freight")));
  });

  /*
   * ⚠ REGRESIE PROPRIE, gasita la a doua trecere.
   *
   * Prima varianta punea depasirea de 68 kg in `comanda` NECONDITIONAT, iar
   * `buildFedexOptions` foloseste acea lista ca poarta INAINTE de cotare. Deci un cos
   * de 80 kg nu ajungea niciodata la FedEx si primea tariful fix — desi FedEx Priority
   * Freight exista in Romania si acopera chiar 68-1.000 kg, iar configurarea i-o
   * promite comerciantului.
   */
  test("⚠ 80 kg pe FedEx Priority Freight NU e o lipsa — serviciul acopera exact intervalul", () => {
    const l = lipsuriExpediere(CONFIG, { ...DATE, greutateKg: 80, serviceType: "FEDEX_PRIORITY_FREIGHT" });
    assert.deepEqual(l.comanda, []);
  });

  test("⚠ fara serviciu cerut (cazul cotarii) greutatea nu blocheaza nimic", () => {
    // La cotare intrebam „ce merge?"; raspunsul lor propune singur Freight-ul.
    const l = lipsuriExpediere(CONFIG, { ...DATE, greutateKg: 80, serviceType: null });
    assert.deepEqual(l.comanda, []);
  });

  test("un numar de cont mai lung decat plafonul lor se semnaleaza", () => {
    const l = lipsuriExpediere({ ...CONFIG, account_number: "1234567890123" }, DATE);
    assert.ok(l.configurare.some((x) => x.includes("cel mult 9")));
  });
});

function lipsuriConfigurareaAre(config: FedexConfig, fragment: string): boolean {
  return lipsuriExpediere(config, DATE).configurare.some((x) => x.includes(fragment));
}

describe("FedEx: corpul cotarii", () => {
  test("⚠ `preferredCurrency` NU pleaca singur — vine cu `PREFERRED` in rateRequestType", () => {
    // Singur nu face nimic: „Used in conjunction with the rateRequestType data element."
    const corp = corpTarife(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    const e = corp.requestedShipment;
    assert.equal(e.preferredCurrency, "RON");
    assert.deepEqual(e.rateRequestType, ["ACCOUNT", "PREFERRED"]);
  });

  test("timpii de tranzit se cer explicit — implicitul lor e `false`", () => {
    const corp = corpTarife(CONFIG, DATE) as { requestedShipment: Record<string, Record<string, unknown>> };
    assert.equal(corp.requestedShipment.rateRequestControlParameters.returnTransitTimes, true);
  });

  test("la cotare destinatarul e `recipient` SINGULAR, nu `recipients`", () => {
    const corp = corpTarife(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    assert.ok(corp.requestedShipment.recipient);
    assert.equal(corp.requestedShipment.recipients, undefined);
  });

  test("fara serviciu cerut, campul lipseste — asa se intorc TOATE serviciile", () => {
    const corp = corpTarife(CONFIG, { ...DATE, serviceType: null }) as { requestedShipment: Record<string, unknown> };
    assert.equal(corp.requestedShipment.serviceType, undefined);
  });

  test("cu serviciu cerut, el pleaca", () => {
    const corp = corpTarife(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    assert.equal(corp.requestedShipment.serviceType, "FEDEX_PRIORITY");
  });
});

describe("FedEx: corpul emiterii", () => {
  test("⚠ `labelResponseOptions` si `accountNumber` stau la RADACINA, nu inauntru", () => {
    const corp = corpExpediere(CONFIG, DATE) as Record<string, unknown>;
    assert.equal(corp.labelResponseOptions, "LABEL");
    assert.deepEqual(corp.accountNumber, { value: "613902139" });
    const e = corp.requestedShipment as Record<string, unknown>;
    assert.equal(e.labelResponseOptions, undefined);
    assert.equal(e.accountNumber, undefined);
  });

  test("⚠ eticheta se cere ca base64, niciodata ca URL — linkul lor expira si n-au reprint", () => {
    const corp = corpExpediere(CONFIG, DATE) as Record<string, unknown>;
    assert.notEqual(corp.labelResponseOptions, "URL_ONLY");
  });

  test("la emitere destinatarul e `recipients`, PLURAL si tablou", () => {
    const corp = corpExpediere(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    assert.ok(Array.isArray(corp.requestedShipment.recipients));
    assert.equal(corp.requestedShipment.recipient, undefined);
  });

  test("⚠ `totalWeight` NU se trimite la o expediere interna", () => {
    // Schema il declara `required`, dar toate cele sapte exemple RO→RO ale FedEx il omit.
    const corp = corpExpediere(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    assert.equal(corp.requestedShipment.totalWeight, undefined);
  });

  test("la international pleaca si greutatea totala, si vama", () => {
    const corp = corpExpediere(CONFIG, {
      ...DATE,
      destinatar: { ...DESTINATAR, tara: "DE", oras: "Berlin", codPostal: "10115" },
      valoareComanda: 350,
    }) as { requestedShipment: Record<string, unknown> };
    const e = corp.requestedShipment;
    assert.equal(e.totalWeight, 2.4);
    const vama = e.customsClearanceDetail as Record<string, unknown>;
    assert.ok(vama, "lipseste customsClearanceDetail la international");
    assert.ok(Array.isArray(vama.commodities));
    assert.ok((vama.commodities as Record<string, unknown>[])[0].description);
  });

  test("⚠ la INTERN nu se trimite vama, desi schema lor spune „intra-country”", () => {
    const corp = corpExpediere(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    assert.equal(corp.requestedShipment.customsClearanceDetail, undefined);
  });

  test("plata transportului e a expeditorului, cu contul lui", () => {
    const corp = corpExpediere(CONFIG, DATE) as { requestedShipment: Record<string, unknown> };
    const plata = corp.requestedShipment.shippingChargesPayment as {
      paymentType: string;
      payor: { responsibleParty: { accountNumber: { value: string } } };
    };
    assert.equal(plata.paymentType, "SENDER");
    assert.equal(plata.payor.responsibleParty.accountNumber.value, "613902139");
  });

  test("⚠ NICIUN camp de ramburs nu apare in cerere, oricum ar fi comanda", () => {
    const corp = JSON.stringify(corpExpediere(CONFIG, { ...DATE, ramburs: 500 }));
    assert.equal(corp.includes("COD"), false, "corpul contine un camp de ramburs");
    assert.equal(corp.toLowerCase().includes("codcollection"), false);
  });

  test("valoarea declarata pleaca doar cand comerciantul o cere", () => {
    const fara = corpExpediere(CONFIG, { ...DATE, valoareComanda: 400 }) as { requestedShipment: Record<string, unknown> };
    assert.equal(fara.requestedShipment.totalDeclaredValue, undefined);

    const cu = corpExpediere({ ...CONFIG, valoare_declarata: true }, { ...DATE, valoareComanda: 400 }) as { requestedShipment: Record<string, unknown> };
    assert.deepEqual(cu.requestedShipment.totalDeclaredValue, { amount: 400, currency: "RON" });
  });

  /*
   * ⚠ REGRESIE PROPRIE, gasita la a doua trecere.
   *
   * `ziuaAzi` da ziua ROMANEASCA, iar cautarea dupa referinta si-o compunea pe a ei
   * cu `toISOString()`, adica ziua UTC. Intre miezul noptii si ora 3 cele doua
   * difera, deci fereastra de cautare se inchidea INAINTE de ziua in care tocmai se
   * emisese AWB-ul: „nu exista nicio expediere" pentru un colet de doua minute, si
   * drum deschis catre al doilea AWB, taxabil.
   *
   * Proba verifica VALOAREA, nu forma — forma trecea si inainte.
   */
  test("⚠ ziua e cea ROMANEASCA, nu cea UTC", () => {
    // 22:30 UTC pe 16 august = 01:30, 17 august, in Romania (vara, UTC+3).
    assert.equal(ziuaAzi(new Date("2026-08-16T22:30:00Z")), "2026-08-17");
    // Si iarna, cand decalajul e de doua ore.
    assert.equal(ziuaAzi(new Date("2026-01-15T22:30:00Z")), "2026-01-16");
  });

  test("data expedierii are forma ceruta de ei", () => {
    const corp = corpExpediere(CONFIG, DATE) as { requestedShipment: Record<string, string> };
    assert.match(corp.requestedShipment.shipDatestamp, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("serviciul lipsa cade pe FedEx Priority, nu pe gol", () => {
    const corp = corpExpediere(CONFIG, { ...DATE, serviceType: null }) as { requestedShipment: Record<string, string> };
    assert.equal(corp.requestedShipment.serviceType, "FEDEX_PRIORITY");
  });

  test("eticheta are amandoua campurile cerute de schema lor", () => {
    const corp = corpExpediere(CONFIG, DATE) as { requestedShipment: Record<string, Record<string, string>> };
    const spec = corp.requestedShipment.labelSpecification;
    assert.ok(spec.imageType);
    assert.ok(spec.labelStockType);
  });
});
