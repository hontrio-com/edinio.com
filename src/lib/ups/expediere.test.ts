import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import type { UpsConfig } from "./client";
import {
  AVERTISMENT_ACEEASI_LOCALITATE, depasesteCircumferinta, dimensiuniColet, eAceeasiLocalitate,
  corpExpediere, corpTarife, judetUps, liniiAdresa, lipsuriConfigurare, lipsuriExpediere,
  orasUps, referintaComenzii, sectorPentruAdresa, telefonUps, valutaRamburs,
  type DateExpediere,
} from "./expediere";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Cererea catre UPS are patru feluri de a fi gresita fara sa dea nicio eroare:
 *
 *  1. UNITATEA DE MASURA LIPSA. `PackageWeight.UnitOfMeasurement` are documentat
 *     „LBS - Pounds **(default)**". Un colet de 5 kg fara unitate se coteaza ca 5
 *     livre — 2,27 kg — si tariful iese cu o treime mai mic.
 *  2. TARA DE PLECARE LIPSA. „Required, but **defaults to US**." Cotarea pleaca din
 *     America si intoarce preturi fara nicio legatura cu ruta.
 *  3. REFERINTA PE COLET IN LOC DE PE EXPEDIERE. Pentru Romania e exact invers fata
 *     de orice exemplu american, iar pusa gresit se pierde tacut — impreuna cu singura
 *     cale de a afla, printr-o citire, daca AWB-ul chiar s-a creat.
 *  4. ADRESA REZIDENTIALA NEDECLARATA. „If this indicator is not present, address will
 *     be considered as **commercial**" — iar taxa lor de livrare la domiciliu iese la
 *     iveala abia pe factura.
 */

function config(peste: Partial<UpsConfig> = {}): UpsConfig {
  return {
    enabled: true,
    client_id: "id",
    client_secret: "secret",
    account_number: "A1B2C3",
    expeditor: {
      nume: "Magazin SRL",
      telefon: "0721000000",
      strada: "Str. Depozitului 4",
      oras: "Cluj-Napoca",
      judet: "Cluj",
      cod_postal: "400001",
      tara: "RO",
    },
    ...peste,
  };
}

function comanda(peste: Partial<DateExpediere> = {}): DateExpediere {
  return {
    destinatar: {
      nume: "Ion Popescu",
      strada: "Bulevardul Unirii",
      numar: "12",
      oras: "Bucuresti",
      judet: "Bucuresti",
      codPostal: "030167",
      telefon: "0722333444",
      email: "ion@exemplu.ro",
      tara: "RO",
    },
    greutateKg: 2,
    ...peste,
  };
}

/**
 * Ajutoare de citit prin corpul lor.
 *
 * Cererile UPS sunt JSON adanc si eterogen; fara ele, fiecare proba s-ar lupta cu
 * castingul in loc sa spuna ce verifica.
 */
function nod(o: unknown, ...cai: string[]): Record<string, unknown> {
  let curent = (o ?? {}) as Record<string, unknown>;
  for (const c of cai) curent = (curent?.[c] ?? {}) as Record<string, unknown>;
  return curent;
}

function lista(o: unknown, ...cai: string[]): Record<string, unknown>[] {
  const ultim = cai[cai.length - 1];
  const parinte = nod(o, ...cai.slice(0, -1));
  const v = parinte[ultim];
  return Array.isArray(v) ? v as Record<string, unknown>[] : [];
}

/** Expedierea din corpul de cotare, respectiv din cel de emitere. */
const laCotare = (o: unknown) => nod(o, "RateRequest", "Shipment");
const laEmitere = (o: unknown) => nod(o, "ShipmentRequest", "Shipment");
/** ⚠ Specificatia etichetei sta INAUNTRUL lui `ShipmentRequest`. Vezi proba dedicata. */
const specEticheta = (o: unknown) => nod(o, "ShipmentRequest", "LabelSpecification");

/** Ajutor: coletul din corpul de cotare. */
function coletDinTarife(c = config(), d = comanda()) {
  return lista(corpTarife(c, d), "RateRequest", "Shipment", "Package")[0];
}

describe("UPS: unitatile de masura pleaca INTOTDEAUNA", () => {
  test("⚠ greutatea in KGS — fara ea, implicitul lor documentat e LBS", () => {
    const colet = coletDinTarife();
    const g = colet.PackageWeight as Record<string, Record<string, unknown>>;
    assert.equal(g.UnitOfMeasurement.Code, "KGS");
    /* ⚠ `Description` e OBLIGATORIU la cotare (`required: [Description, Code]`) si nu la emitere. */
    assert.equal(g.UnitOfMeasurement.Description, "Kilograms");
  });

  test("⚠ dimensiunile in CM, si `Description` prezent tot pentru cotare", () => {
    const colet = coletDinTarife();
    const d = colet.Dimensions as Record<string, Record<string, unknown>>;
    assert.equal(d.UnitOfMeasurement.Code, "CM");
    assert.equal(d.UnitOfMeasurement.Description, "Centimeters");
  });

  test("la emitere unitatile sunt aceleasi", () => {
    const colet = lista(corpExpediere(config(), comanda()), "ShipmentRequest", "Shipment", "Package")[0];
    assert.equal(nod(colet, "PackageWeight", "UnitOfMeasurement").Code, "KGS");
    assert.equal(nod(colet, "Dimensions", "UnitOfMeasurement").Code, "CM");
  });

  test("⚠ dimensiunile sunt INTREGI: campul are 3 caractere la emitere, 9 la cotare", () => {
    const c = config({ lungime_cm: 27.5, latime_cm: 20.1, inaltime_cm: 10 });
    const colet = lista(corpExpediere(c, comanda()), "ShipmentRequest", "Shipment", "Package")[0];
    const d = nod(colet, "Dimensions");
    /* Rotunjit IN SUS: o rotunjire in jos subdeclara coletul. */
    assert.equal(d.Length, "28");
    assert.equal(d.Width, "21");
    assert.equal(String(d.Length).length <= 3, true);
  });
});

describe("UPS: tipul de ambalaj se numeste ALTFEL in cele doua API-uri", () => {
  test("⚠ `PackagingType` la cotare", () => {
    const colet = coletDinTarife();
    assert.equal((colet.PackagingType as Record<string, unknown>).Code, "02");
    assert.equal("Packaging" in colet, false);
  });

  test("⚠ `Packaging` la emitere", () => {
    const colet = lista(corpExpediere(config(), comanda()), "ShipmentRequest", "Shipment", "Package")[0];
    assert.equal(nod(colet, "Packaging").Code, "02");
    assert.equal("PackagingType" in colet, false);
  });
});

describe("UPS: tara de plecare si adresa rezidentiala", () => {
  test("⚠ `ShipFrom.Address.CountryCode` pleaca mereu — implicitul lor e US", () => {
    assert.equal(nod(laCotare(corpTarife(config(), comanda())), "ShipFrom", "Address").CountryCode, "RO");
  });

  test("⚠ adresa cumparatorului e declarata REZIDENTIALA, ca steag prin prezenta", () => {
    /* Steagul e prin PREZENTA: sirul gol il aprinde, lipsa il stinge. */
    const a = nod(laCotare(corpTarife(config(), comanda())), "ShipTo", "Address");
    assert.equal(a.ResidentialAddressIndicator, "");
  });

  test("adresa expeditorului NU e rezidentiala", () => {
    const a = nod(laCotare(corpTarife(config(), comanda())), "Shipper", "Address");
    assert.equal("ResidentialAddressIndicator" in a, false);
  });
});

describe("UPS: referinta pe EXPEDIERE, nu pe colet", () => {
  test("⚠ pentru Romania, `Package.ReferenceNumber` e valid doar US/US si PR/PR", () => {
    const corp = corpExpediere(config(), comanda({ referinta: "EDN-ABCD-000123" }));
    assert.deepEqual(laEmitere(corp).ReferenceNumber, [{ Value: "EDN-ABCD-000123" }]);
    const colet = lista(corp, "ShipmentRequest", "Shipment", "Package")[0];
    assert.equal("ReferenceNumber" in colet, false);
  });

  test("⚠ `Code` NU se trimite: cere fix 2 caractere dintr-un tabel nepublicat", () => {
    const corp = corpExpediere(config(), comanda({ referinta: "EDN-ABCD-000123" }));
    assert.equal("Code" in lista(corp, "ShipmentRequest", "Shipment", "ReferenceNumber")[0], false);
  });

  test("⚠ cele patru caractere din businessId despart doua magazine cu acelasi cont", () => {
    const a = referintaComenzii("aaaaaaaa-1111-2222-3333-444444444444", "0001");
    const b = referintaComenzii("bbbbbbbb-1111-2222-3333-444444444444", "0001");
    assert.notEqual(a, b);
    assert.equal(a, "EDN-AAAA-0001");
  });

  test("referinta n-are spatii — UPS le refuza la codul de bare", () => {
    assert.equal(/\s/.test(referintaComenzii("abcd-efgh", "12 34")), false);
  });
});

describe("UPS: plata transportului", () => {
  test("⚠ NUMAI `01`: `02` e invalid pentru expedierile intra-UE", () => {
    const corp = corpExpediere(config(), comanda());
    const taxe = lista(corp, "ShipmentRequest", "Shipment", "PaymentInformation", "ShipmentCharge");
    assert.equal(taxe.length, 1);
    assert.equal(taxe[0].Type, "01");
    assert.deepEqual(taxe[0].BillShipper, { AccountNumber: "A1B2C3" });
  });

  test("acelasi cont si la expeditor, si la platitor", () => {
    assert.equal(nod(laEmitere(corpExpediere(config(), comanda())), "Shipper").ShipperNumber, "A1B2C3");
  });
});

describe("UPS: rambursul", () => {
  test("⚠ la NIVEL DE EXPEDIERE, nu de colet — la colet nu merge din UE", () => {
    const corp = corpExpediere(config(), comanda({ ramburs: 250 }));
    const cod = nod(laEmitere(corp), "ShipmentServiceOptions", "COD");
    assert.equal(cod.CODFundsCode, "1");
    assert.equal(nod(cod, "CODAmount").MonetaryValue, "250.00");
    const colet = lista(corp, "ShipmentRequest", "Shipment", "Package")[0];
    assert.equal(!!nod(colet, "PackageServiceOptions").COD, false);
  });

  test("⚠ valuta e a tarii de DESTINATIE: codul lor de eroare 120597 o spune", () => {
    const corp = corpExpediere(config(), comanda({ ramburs: 99.5 }));
    assert.equal(nod(laEmitere(corp), "ShipmentServiceOptions", "COD", "CODAmount").CurrencyCode, "RON");
  });

  test("codul de fonduri se poate schimba din configurare (1 numerar, 9 cec)", () => {
    const corp = corpExpediere(config({ cod_funds_code: "9" }), comanda({ ramburs: 10 }));
    assert.equal(nod(laEmitere(corp), "ShipmentServiceOptions", "COD").CODFundsCode, "9");
  });

  test("fara ramburs, containerul lipseste cu totul", () => {
    assert.equal(laEmitere(corpExpediere(config(), comanda())).ShipmentServiceOptions, undefined);
  });
});

describe("UPS: subversiunea si valutele — trei capcane gasite la a doua trecere", () => {
  test("⚠ subversiunea la EMITERE nu e cea de la COTARE: `2409` nu exista la Ship", () => {
    /* `Rating.yaml`: „…2205, 2407, 2409". `Shipping.yaml`: „…1801, 1807, 2108, 2205". */
    assert.equal(nod(corpTarife(config(), comanda()), "RateRequest", "Request").SubVersion, "2409");
    assert.equal(nod(corpExpediere(config(), comanda()), "ShipmentRequest", "Request").SubVersion, "2205");
  });

  test("⚠ valuta rambursului e a tarii de DESTINATIE, si nu se ghiceste", () => {
    assert.equal(valutaRamburs("RO"), "RON");
    assert.equal(valutaRamburs("DE"), "EUR");
    /* Ungaria e in UE si NU foloseste euro — „EUR pentru restul Europei" ar fi cazut cu 120597. */
    assert.equal(valutaRamburs("HU"), null);
    assert.equal(valutaRamburs("PL"), null);
  });

  test("o comanda cu ramburs catre o valuta necunoscuta se OPRESTE, nu se ghiceste", () => {
    const l = lipsuriExpediere(config(), comanda({
      ramburs: 350,
      destinatar: { ...comanda().destinatar, tara: "HU", oras: "Budapesta", judet: null },
    }));
    assert.ok(l.comanda.some((x) => x.includes("valuta")));
  });

  test("⚠ valoarea declarata foloseste valuta EXPEDITORULUI — invers fata de ramburs", () => {
    const corp = corpExpediere(config({ valoare_declarata: true }), comanda({
      valoareComanda: 500,
      destinatar: { ...comanda().destinatar, tara: "DE", oras: "Berlin", judet: null },
    }));
    const colet = lista(corp, "ShipmentRequest", "Shipment", "Package")[0];
    const dv = nod(colet, "PackageServiceOptions", "DeclaredValue");
    /* Expeditorul e roman: 500 lei, nu 500 euro. */
    assert.equal(dv.CurrencyCode, "RON");
    assert.equal(dv.MonetaryValue, "500.00");
  });
});

describe("UPS: Bucurestiul intra in tabara cea mare", () => {
  test("orasul se pliaza in „Bucuresti”", () => {
    assert.equal(orasUps("Sector 3", "Bucuresti"), "Bucuresti");
    assert.equal(orasUps("Bucuresti", "Bucuresti"), "Bucuresti");
  });

  test("sectorul pleaca pe ADRESA, unde chiar se tipareste", () => {
    assert.equal(sectorPentruAdresa({ oras: "Sector 3", judet: "Bucuresti" }), "Sector 3");
    const corp = corpTarife(config(), comanda({
      destinatar: { ...comanda().destinatar, oras: "Sector 3" },
    }));
    const a = nod(laCotare(corp), "ShipTo", "Address");
    assert.ok((a.AddressLine as string[]).join(" ").includes("Sector 3"));
    assert.equal(a.City, "Bucuresti");
  });

  test("⚠ judetul NU pleaca: UPS n-are nomenclator romanesc, iar cotarea cere fix 2 caractere", () => {
    assert.equal(judetUps("Bucuresti"), null);
    assert.equal(judetUps("Cluj"), null);
    assert.equal(judetUps("B"), null);
    /* Cand comerciantul a primit chiar de la UPS un cod de doua caractere, il trimitem. */
    assert.equal(judetUps("if"), "IF");
    const a = nod(laCotare(corpTarife(config(), comanda())), "ShipTo", "Address");
    assert.equal("StateProvinceCode" in a, false);
  });
});

describe("UPS: adresa se imparte, nu se trunchiaza", () => {
  test("o adresa romaneasca intreaga intra pe cel mult 3 linii de 35", () => {
    const linii = liniiAdresa({
      strada: "Strada Alexandru Ioan Cuza",
      numar: "128",
      bloc: "B12",
      scara: "C",
      etaj: "4",
      apartament: "57",
    });
    assert.ok(linii.length <= 3);
    assert.ok(linii.every((l) => l.length <= 35));
    assert.ok(linii.join(" ").includes("ap. 57"));
  });

  test("fara diacritice: implicitul lor de set de caractere e Latin-1", () => {
    const linii = liniiAdresa({ strada: "Strada Ștefan cel Mare și Sfânt" });
    assert.equal(/[ăâîșțĂÂÎȘȚ]/.test(linii.join(" ")), false);
  });

  test("⚠ si se cere setul romanesc, ca a doua plasa", () => {
    assert.equal(specEticheta(corpExpediere(config(), comanda())).CharacterSet, "ron");
  });
});

describe("UPS: telefonul", () => {
  test("⚠ doar cifre, cu prefixul tarii — layout-ul lor cere „country code, area code, number”", () => {
    assert.equal(telefonUps("0722 333 444"), "40722333444");
    assert.equal(telefonUps("+40 722 333 444"), "40722333444");
    assert.equal(/\D/.test(telefonUps("(0722) 333-444")), false);
  });

  test("un numar strain isi pastreaza prefixul, fara plus", () => {
    assert.equal(telefonUps("+49 171 1234567"), "491711234567");
  });

  test("cel mult 15 caractere", () => {
    assert.ok(telefonUps("+40722333444999999999").length <= 15);
  });
});

describe("UPS: eticheta", () => {
  test("⚠ `LabelStockSize` pleaca si pentru GIF — schema il cere neconditionat", () => {
    const spec = specEticheta(corpExpediere(config(), comanda()));
    assert.deepEqual(spec.LabelStockSize, { Height: "6", Width: "4" });
  });

  test("⚠ PDF nu se poate cere la emitere: enumerarea lor e GIF/ZPL/EPL/SPL", () => {
    const gif = specEticheta(corpExpediere(config(), comanda()));
    assert.equal(nod(gif, "LabelImageFormat").Code, "GIF");
    const zpl = specEticheta(corpExpediere(config({ format_eticheta: "ZPL" }), comanda()));
    assert.equal(nod(zpl, "LabelImageFormat").Code, "ZPL");
    /* `HTTPUserAgent` e cerut doar pentru GIF. */
    assert.equal("HTTPUserAgent" in zpl, false);
  });

  /*
   * ⚠⚠ PROBA ASTA A FOST SCRISA PE DOS PRIMA DATA, SI E CEA MAI SCUMPA GRESEALA POSIBILA.
   *
   * Am pus `LabelSpecification` ca FRATE al lui `ShipmentRequest` — fiindca la FedEx
   * `labelResponseOptions` chiar sta la radacina — si am scris o proba care sa apere
   * asezarea gresita. Schema lor spune altceva: `ShipmentRequest.properties` e
   * `{Request, Shipment, LabelSpecification, ReceiptSpecification}`, iar exemplele lor
   * oficiale il pun langa celelalte doua.
   *
   * Iar UPS NU cade pe asta: `LabelSpecification` nu e in `required`. Se creeaza AWB-ul,
   * se factureaza, si raspunsul vine fara `ShippingLabel` — colet emis, platit, si
   * fara nimic de lipit pe el.
   */
  test("⚠ `LabelSpecification` sta INAUNTRUL lui `ShipmentRequest`, nu langa el", () => {
    const corp = corpExpediere(config(), comanda()) as Record<string, unknown>;
    assert.equal("LabelSpecification" in corp, false);
    assert.ok("LabelSpecification" in (corp.ShipmentRequest as Record<string, unknown>));
  });
});

describe("UPS: serviciul pleaca INTOTDEAUNA", () => {
  test("⚠ lipsa lui nu e o eroare la ei — e o factura pe UPS Express", () => {
    /* Intern, implicitul nostru e cel mai IEFTIN, nu cel mai scump. */
    assert.equal(nod(laEmitere(corpExpediere(config(), comanda())), "Service").Code, "65");
  });

  test("intre tari, implicitul e produsul economic (UPS Standard)", () => {
    const corp = corpExpediere(config(), comanda({
      destinatar: { ...comanda().destinatar, tara: "DE", oras: "Berlin", judet: null },
    }));
    assert.equal(nod(laEmitere(corp), "Service").Code, "11");
  });

  test("alegerea clientului bate implicitul, si se pastreaza LITERAL", () => {
    const corp = corpExpediere(config(), comanda({ serviceCode: "011" }));
    /* ⚠ NU se normalizeaza la „11": echivalenta celor doua forme nu e documentata. */
    assert.equal(nod(laEmitere(corp), "Service").Code, "011");
  });
});

describe("UPS: campurile cerute doar la INTERNATIONAL", () => {
  const extern = () => comanda({
    destinatar: { ...comanda().destinatar, tara: "DE", oras: "Berlin", judet: null, codPostal: "10115" },
    valoareComanda: 349.9,
  });

  test("⚠ `ShipmentTotalWeight` si `InvoiceLineTotal` sunt cerute de calea cu timpi de tranzit", () => {
    const e = laCotare(corpTarife(config(), extern()));
    assert.equal(nod(e, "ShipmentTotalWeight", "UnitOfMeasurement").Code, "KGS");
    /* Valuta lui e a tarii de PLECARE, spre deosebire de cea a rambursului. */
    assert.equal(nod(e, "InvoiceLineTotal").CurrencyCode, "RON");
    assert.equal(nod(e, "InvoiceLineTotal").MonetaryValue, "350");
  });

  test("intern NU se trimit — ele n-au ce cauta acolo", () => {
    const e = laCotare(corpTarife(config(), comanda()));
    assert.equal(e.ShipmentTotalWeight, undefined);
    assert.equal(e.InvoiceLineTotal, undefined);
  });

  test("`Description` se cere doar la international", () => {
    assert.equal(laEmitere(corpExpediere(config(), comanda())).Description, undefined);
    assert.equal(typeof laEmitere(corpExpediere(config(), extern())).Description, "string");
  });
});

describe("UPS: punctele Access Point", () => {
  const cuPunct = () => comanda({
    punct: {
      id: "RO0012345",
      nume: "Chiosc Presa Unirii",
      adresa: "Bd. Unirii 4",
      oras: "Bucuresti",
      judet: "Bucuresti",
      codPostal: "030167",
    },
  });

  test("⚠ trei bucati odata: tipul, adresa alternativa si instiintarea", () => {
    const corp = corpExpediere(config(), cuPunct());
    const e = laEmitere(corp);
    assert.deepEqual(e.ShipmentIndicationType, [{ Code: "01" }]);
    const alt = nod(e, "AlternateDeliveryAddress");
    assert.equal(alt.UPSAccessPointID, "RO0012345");
    assert.equal(nod(alt, "Address").City, "Bucuresti");
    const instiintari = lista(corp, "ShipmentRequest", "Shipment", "ShipmentServiceOptions", "Notification");
    /* ⚠ `012` — cerut de ei, desi campul e declarat `maxLength: 1`. */
    assert.equal(instiintari[0].NotificationCode, "012");
  });

  test("adresa de livrare devine a PUNCTULUI, nu a cumparatorului", () => {
    const a = nod(laEmitere(corpExpediere(config(), cuPunct())), "ShipTo", "Address");
    assert.ok((a.AddressLine as string[]).join(" ").includes("Bd. Unirii 4"));
  });

  test("⚠ peste 20 kg punctele romanesti nu primesc coletul", () => {
    const l = lipsuriExpediere(config(), { ...cuPunct(), greutateKg: 25 });
    assert.ok(l.comanda.some((x) => x.includes("20 kg")));
  });

  /*
   * ⚠ EMAILUL, nu „emailul sau telefonul", si asta a fost o corectie la a doua trecere.
   *
   * Proza lor spune „VoiceMessage phone number or TextMessage phone number or email
   * address is required for ADL notification", dar schema containerului spune
   * `ShipmentServiceOptions_Notification.required = [NotificationCode, **EMail**]` — iar
   * `required` se verifica inainte sa se uite cineva la proza. Ceruta doar „una dintre
   * trei", o comanda cu telefon si fara email ar fi trecut de noi si ar fi cazut la ei.
   */
  test("⚠ fara EMAIL, UPS refuza livrarea in punct — chiar daca exista telefon", () => {
    const d = cuPunct();
    const doarTelefon = lipsuriExpediere(config(), {
      ...d,
      destinatar: { ...d.destinatar, email: null },
    });
    assert.ok(doarTelefon.comanda.some((x) => x.includes("emailul cumparatorului")));

    /* Cu email, nu mai lipseste nimic. */
    assert.deepEqual(lipsuriExpediere(config(), d).comanda, []);
  });

  test("⚠ rambursul la punct pleaca in `AccessPointCOD`, NU in `COD`", () => {
    const corp = corpExpediere(config(), { ...cuPunct(), ramburs: 199.99 });
    const optiuni = nod(laEmitere(corp), "ShipmentServiceOptions");
    /* „Not valid with (Shipment) COD" — cele doua se exclud. */
    assert.equal("COD" in optiuni, false);
    const ap = nod(optiuni, "AccessPointCOD");
    assert.equal(ap.CurrencyCode, "RON");
    assert.equal(ap.MonetaryValue, "199.99");
    /* ⚠ `AccessPointCOD` NU are `CODFundsCode` — `required: [CurrencyCode, MonetaryValue]`. */
    assert.equal("CODFundsCode" in ap, false);
  });

  test("instiintarea de punct poarta EMail (cerut de schema) si telefonul in plus", () => {
    const instiintari = lista(
      corpExpediere(config(), cuPunct()),
      "ShipmentRequest", "Shipment", "ShipmentServiceOptions", "Notification",
    );
    assert.equal(instiintari[0].NotificationCode, "012");
    assert.ok("EMail" in instiintari[0]);
    assert.ok("TextMessage" in instiintari[0]);
  });
});

describe("UPS: ce lipseste, si cine e de vina", () => {
  test("numarul de cont are EXACT 6 caractere, nu 9 ca la FedEx", () => {
    assert.ok(lipsuriConfigurare(config({ account_number: "123456789" }))[0].includes("EXACT"));
    assert.deepEqual(lipsuriConfigurare(config()), []);
  });

  test("configurarea si comanda sunt DOUA liste — vina nu e aceeasi", () => {
    const l = lipsuriExpediere(config({ account_number: "" }), comanda({ greutateKg: 0 }));
    assert.ok(l.configurare.length > 0);
    assert.ok(l.comanda.some((x) => x.includes("greutatea")));
  });

  test("⚠ telefonul devine obligatoriu abia cand tarile difera", () => {
    const faraTelefon = { ...comanda().destinatar, telefon: null };
    const intern = lipsuriExpediere(config(), comanda({ destinatar: faraTelefon }));
    assert.equal(intern.comanda.some((x) => x.includes("telefonul destinatarului")), false);
    const extern = lipsuriExpediere(config(), comanda({
      destinatar: { ...faraTelefon, tara: "DE" },
    }));
    assert.ok(extern.comanda.some((x) => x.includes("telefonul destinatarului")));
  });

  test("⚠ un serviciu „nevandut intern” NU mai blocheaza emiterea", () => {
    /* Serviciul vine din chiar cotarea lor — daca ei l-au intors, ei il vand. */
    const l = lipsuriExpediere(config(), comanda({ serviceCode: "11" }));
    assert.deepEqual(l.comanda, []);
  });

  test("peste 70 kg UPS nu duce coletul", () => {
    const l = lipsuriExpediere(config(), comanda({ greutateKg: 90 }));
    assert.ok(l.comanda.some((x) => x.includes("70 kg")));
  });

  test("rambursul stins din configurare opreste comanda cu plata la livrare", () => {
    const l = lipsuriExpediere(config({ ramburs_activ: false }), comanda({ ramburs: 100 }));
    assert.ok(l.comanda.some((x) => x.includes("plata la livrare")));
    /* Pornit (implicit), nu se opreste nimic. */
    assert.deepEqual(lipsuriExpediere(config(), comanda({ ramburs: 100 })).comanda, []);
  });
});

describe("UPS: aceeasi localitate — se SPUNE, nu se blocheaza", () => {
  test("Cluj → Cluj e semnalat", () => {
    const d = comanda({
      destinatar: { ...comanda().destinatar, oras: "Cluj-Napoca", judet: "Cluj" },
    });
    assert.equal(eAceeasiLocalitate(config(), d.destinatar), true);
    /* ⚠ Dar NU intra in lipsuri: autoritatea e cotarea lor, nu un PDF comercial. */
    assert.deepEqual(lipsuriExpediere(config(), d).comanda, []);
    assert.ok(AVERTISMENT_ACEEASI_LOCALITATE.includes("aceeasi localitate"));
  });

  test("Cluj → Bucuresti nu e", () => {
    assert.equal(eAceeasiLocalitate(config(), comanda().destinatar), false);
  });

  test("nu se aplica in afara Romaniei", () => {
    const d = { ...comanda().destinatar, oras: "Cluj-Napoca", tara: "DE" };
    assert.equal(eAceeasiLocalitate(config(), d), false);
  });
});

describe("UPS: dimensiunile coletului", () => {
  test("implicitele sunt aceleasi cu ale celorlalti curieri", () => {
    assert.deepEqual(dimensiuniColet({}), { lungime: 30, latime: 20, inaltime: 10 });
  });

  test("⚠ circumferinta lor: lungime + 2*(latime + inaltime) <= 330 cm", () => {
    assert.equal(depasesteCircumferinta({ lungime: 30, latime: 20, inaltime: 10 }), false);
    assert.equal(depasesteCircumferinta({ lungime: 200, latime: 40, inaltime: 40 }), true);
  });

  test("o latura nu poate depasi 270 cm", () => {
    assert.equal(dimensiuniColet({ lungime_cm: 500 }).lungime, 270);
  });
});
