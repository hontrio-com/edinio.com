import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { SABLOANE, type DhlConfig, type FormatEticheta } from "./client";
import { COD_RAMBURS } from "./servicii";
import {
  AVERTISMENT_RAMBURS, DIMENSIUNI_IMPLICITE, DIVIZOR_VOLUMETRIC, GREUTATE_MAXIMA_KG,
  GREUTATE_MINIMA_KG, LIPSA_COD_POSTAL, LIPSA_COD_VAMAL, LUNGIMI,
  adresaDhl, avertismenteColet, codPostalDhl, contactDhl, corpExpediere, corpTarife,
  dimensiuniColet, eVamal, eVamalPeAdresa, expeditorCaAdresa, greutateTaxabila,
  greutateVolumetrica, incotermDhl, judetDhl, liniiAdresa, lipsescDateleVamale,
  lipsesteCodulPostal, lipsuriConfigurare, lipsuriExpediere, orasDhl, produsImplicit,
  referintaComenzii, sectorPentruAdresa, telefonDhl,
  type AdresaComanda, type ArticolVamal, type DateExpediere,
} from "./expediere";

/*
 * ⚠ CE APARA PROBELE ASTEA, IN GENERAL.
 *
 * DHL nu are implicitele tacute de unitate care au costat la FedEx (unitate lipsa = TOL)
 * si la UPS (greutate fara unitate = LIVRE): `unitOfMeasurement` e in `required` peste
 * tot, cu `enum: [metric, imperial]` si fara `default`. Ce ramane tacut aici e altceva,
 * si e mai scump:
 *
 *  1. `dimensions` E OPTIONAL LA COLET (`packages[].required = ["weight"]`). Fara ele DHL
 *     coteaza pe greutatea reala si iti da un pret mic, apoi remasoara: „Any piece in the
 *     shipment may be re-weighed and/or re-measured by DHL to confirm this calculation" —
 *     si vine `Overweight Piece 470 lei` pe factura. Niciun avertisment, nicio eroare.
 *  2. `additionalProperties: false` PE FIECARE SCHEMA, iar cele doua cereri au forme
 *     DIFERITE pentru aceleasi date: la `/rates` `shipperDetails` E adresa, la
 *     `/shipments` o CONTINE, langa contact. Un camp corect intr-o parte e 422 in cealalta.
 *  3. `incoterm` E OBLIGATORIU SI PE O EXPEDIERE INTRA-UE NEDUTIABILA — iar `DDP` pus „ca
 *     sa fie sigur" muta taxele vamale pe magazin, pe toate expedierile din afara Uniunii.
 *  4. NU EXISTA ANULARE DE EXPEDIERE si NU EXISTA IDEMPOTENTA. Singura cale inapoi dupa un
 *     raspuns pierdut e `GET /tracking?shipmentReference=…&shipmentReferenceType=CU`, deci
 *     referinta pusa gresit (pe colet, in loc de pe expediere) nu pierde o informatie
 *     decorativa: pierde singura dovada ca AWB-ul s-a creat.
 *  5. RAMBURSUL NU SE VINDE DIN ROMANIA, iar `KB` trimis totusi nu cade la cotare, ci la
 *     EMITERE (`7008`), adica dupa ce cumparatorul a comandat si a asteptat.
 */

function config(peste: Partial<DhlConfig> = {}): DhlConfig {
  return {
    enabled: true,
    username: "utilizator",
    password: "parola",
    account_number: "123456789",
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

/** Aceeasi comanda, cu adresa destinatarului schimbata pe bucati. */
function catre(peste: Partial<AdresaComanda>, restul: Partial<DateExpediere> = {}): DateExpediere {
  return comanda({ destinatar: { ...comanda().destinatar, ...peste }, ...restul });
}

const ARTICOL: ArticolVamal = {
  descriere: "Tricou din bumbac",
  cantitate: 2,
  pretUnitar: 79.99,
  codVamal: "6109.10",
  taraOrigine: "PT",
};

/** Comanda intra-UE: NEdutiabila, deci fara declaratie vamala. */
function catreDE(restul: Partial<DateExpediere> = {}): DateExpediere {
  return catre(
    { tara: "DE", oras: "Berlin", judet: null, codPostal: "10115", strada: "Karl Marx Allee", numar: "90" },
    restul,
  );
}

/** Comanda din afara uniunii vamale: cu declaratie, cu factura, cu articole. */
function catreUS(restul: Partial<DateExpediere> = {}): DateExpediere {
  return catre(
    { tara: "US", oras: "New York", judet: "NY", codPostal: "10001", strada: "5th Avenue", numar: "350" },
    { valoareComanda: 349.9, continut: "Tricouri din bumbac", articole: [ARTICOL], ...restul },
  );
}

/**
 * Ajutoare de citit prin corpurile lor.
 *
 * Cererile DHL sunt JSON adanc si eterogen; fara ele, fiecare proba s-ar lupta cu
 * castingul in loc sa spuna ce verifica. Aceleasi doua ca la UPS.
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

/** Coletul din cotare, respectiv din emitere. ⚠ Stau in locuri DIFERITE. */
const coletTarif = (o: unknown) => lista(o, "packages")[0] ?? {};
const coletEmis = (o: unknown) => lista(o, "content", "packages")[0] ?? {};
const optiuniImagine = (o: unknown) => lista(o, "outputImageProperties", "imageOptions");
const optiuneImagine = (o: unknown, tip: string) =>
  optiuniImagine(o).find((x) => x.typeCode === tip) ?? {};

/**
 * Toate felurile de cerere pe care le poate produce fisierul, intr-un singur loc.
 *
 * Probele care spun „NICIODATA" (fara `provinceCode`, fara `KB`) trebuie sa treaca peste
 * TOATE combinatiile, nu peste cea implicita — altfel „niciodata" inseamna de fapt
 * „nu in cazul pe care l-am probat eu".
 */
function toateCererile(): { nume: string; corp: Record<string, unknown> }[] {
  const bogat = config({
    asigurare_activa: true,
    valoare_declarata: true,
    cere_ridicare: true,
    notifica_destinatarul: true,
    incoterm: "DDP",
    format_eticheta: "ZPL",
    continut_implicit: "Articole de imbracaminte",
  });
  return [
    { nume: "cotare interna", corp: corpTarife(config(), comanda()) },
    { nume: "cotare intra-UE", corp: corpTarife(bogat, catreDE({ valoareComanda: 500 })) },
    { nume: "cotare vamala", corp: corpTarife(bogat, catreUS()) },
    { nume: "emitere interna", corp: corpExpediere(config(), comanda({ referinta: "EDN-ABCD-000123" })) },
    { nume: "emitere intra-UE", corp: corpExpediere(bogat, catreDE({ valoareComanda: 500, asigurare: 500 })) },
    { nume: "emitere vamala", corp: corpExpediere(bogat, catreUS({ referinta: "EDN-ABCD-000124" })) },
    {
      nume: "emitere catre Australia (judet scris de cumparator)",
      corp: corpExpediere(config(), catre({ tara: "AU", oras: "Sydney", judet: "NSW", codPostal: "2000" })),
    },
    { nume: "emitere din Bucuresti pe sector", corp: corpExpediere(config(), catre({ oras: "Sector 3" })) },
  ];
}

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Unitatea trimisa gresit nu produce un pret gresit (ca la FedEx si UPS), ci una din trei
 * clase de esec tacut ale NOASTRE: (a) cheia pusa la radacina cererii de emitere, unde
 * `additionalProperties: false` o refuza — `required` la radacina lor e fix
 * `[plannedShippingDateAndTime, pickup, productCode, accounts, customerDetails, content]`;
 * (b) valorile SOAP `SI`/`SU` copiate dintr-un exemplu din ghidul lor de 473 de pagini,
 * invalide in REST; (c) uniformizarea lui `quantity.unitOfMeasurement` (care e alt
 * nomenclator, cel de bucati) cu cel de greutate.
 */
describe("DHL: unitatea de masura pleaca explicit, in AMANDOUA cererile", () => {
  test("⚠ la cotare sta la RADACINA cererii", () => {
    assert.equal(corpTarife(config(), comanda()).unitOfMeasurement, "metric");
  });

  test("⚠ la emitere sta in `content`, si NU la radacina", () => {
    const corp = corpExpediere(config(), comanda());
    assert.equal(nod(corp, "content").unitOfMeasurement, "metric");
    /* Radacina lor e `additionalProperties: false`: cheia pusa si aici ar da 422 pe
       fiecare emitere, adica pe drumul care nu se poate relua fara sa emita al doilea AWB. */
    assert.equal("unitOfMeasurement" in corp, false);
  });

  test("⚠ niciodata `SI`/`SU` (formele SOAP) si niciodata `imperial`", () => {
    for (const { nume, corp } of toateCererile()) {
      const brut = JSON.stringify(corp);
      assert.equal(brut.includes("imperial"), false, nume);
      assert.equal(brut.includes('"SI"'), false, nume);
      assert.equal(brut.includes('"SU"'), false, nume);
    }
  });

  test("⚠ `PCS` de pe linia vamala e ALT nomenclator, si ramane `PCS`", () => {
    /* Greutatea e „metric", bucatile sunt „PCS". Cine le uniformizeaza din reflex („doar
       sunt amandoua unitati de masura") rupe declaratia vamala. */
    const corp = corpExpediere(config(), catreUS());
    assert.equal(nod(corp, "content").unitOfMeasurement, "metric");
    const linie = lista(corp, "content", "exportDeclaration", "lineItems")[0];
    assert.equal(nod(linie, "quantity").unitOfMeasurement, "PCS");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `incoterm` e in `required` pe `content`, deci lipsa lui opreste ORICE emitere, inclusiv
 * una Bucuresti → Cluj: propriul lor exemplu de expediere interna (GB→GB) trimite
 * `isCustomsDeclarable: false` impreuna cu `incoterm: DAP`. Iar implicitul gresit nu cade
 * niciodata: `DDP` inseamna, verbatim din nomenclatorul lor, ca vanzatorul „has an
 * obligation to clear the goods not only for export but also for import, to pay any duty
 * for both export and import" — adica magazinul plateste taxele vamale ale
 * cumparatorului, pe toate expedierile din afara Uniunii, si asta se vede abia pe factura.
 */
describe("DHL: incotermul pleaca MEREU, si implicitul e DAP, nu DDP", () => {
  test("⚠ si pe o comanda INTERNA, unde nu e nimic de vamuit", () => {
    const bloc = nod(corpExpediere(config(), comanda()), "content");
    assert.equal(bloc.isCustomsDeclarable, false);
    assert.equal(bloc.incoterm, "DAP");
  });

  test("⚠ si pe una intra-UE, tot nedutiabila", () => {
    const bloc = nod(corpExpediere(config(), catreDE()), "content");
    assert.equal(bloc.isCustomsDeclarable, false);
    assert.equal(bloc.incoterm, "DAP");
  });

  test("implicitul e DAP pe toate cele trei rute", () => {
    for (const date of [comanda(), catreDE(), catreUS()]) {
      assert.equal(nod(corpExpediere(config(), date), "content").incoterm, "DAP");
    }
  });

  test("alegerea comerciantului bate implicitul", () => {
    assert.equal(nod(corpExpediere(config({ incoterm: "DDP" }), catreUS()), "content").incoterm, "DDP");
    assert.equal(incotermDhl("ddp"), "DDP");
  });

  test("⚠ o valoare din afara enumerarii lor cade pe DAP, nu pleaca asa cum a fost scrisa", () => {
    /* `enum` inchis: „DDP " sau „livrat" trimise ca atare fac sa cada TOATA emiterea. */
    assert.equal(incotermDhl("livrat"), "DAP");
    assert.equal(incotermDhl(""), "DAP");
    assert.equal(incotermDhl(null), "DAP");
    assert.equal(nod(corpExpediere(config({ incoterm: "XYZ" }), comanda()), "content").incoterm, "DAP");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `content.description` e in `required` si are `pattern: '^[^\s]'` — nu poate lipsi, nu
 * poate fi gol si nu poate incepe cu spatiu. Un magazin care nu completeaza „continutul
 * implicit" si vinde produse fara descriere ar cadea pe fiecare emitere.
 *
 * ⚠ Si coletul are DOUA scheme: `…ExpressPackage` (emitere) are `description`,
 * `…ExpressPackageRR` (cotare) NU o are deloc. Amandoua `additionalProperties: false`,
 * deci acelasi camp e legal intr-o parte si 422 in cealalta — pe drumul preturilor.
 */
describe("DHL: descrierea continutului nu lipseste NICIODATA", () => {
  test("fara nimic completat, pleaca rezerva", () => {
    assert.equal(nod(corpExpediere(config(), comanda()), "content").description, "Bunuri de consum");
  });

  test("textul din configurare tine loc cand comanda nu spune nimic", () => {
    const corp = corpExpediere(config({ continut_implicit: "Articole de imbracaminte" }), comanda());
    assert.equal(nod(corp, "content").description, "Articole de imbracaminte");
  });

  test("continutul comenzii bate configurarea", () => {
    const corp = corpExpediere(
      config({ continut_implicit: "Articole de imbracaminte" }),
      comanda({ continut: "Doua perechi de pantofi" }),
    );
    assert.equal(nod(corp, "content").description, "Doua perechi de pantofi");
  });

  test("⚠ nu incepe cu spatiu — `pattern: '^[^\\s]'`", () => {
    const corp = corpExpediere(config(), comanda({ continut: "   Pantofi   de   piele  " }));
    const d = nod(corp, "content").description as string;
    assert.equal(d, "Pantofi de piele");
    assert.equal(/^\s/.test(d), false);
  });

  test("taiata la 70 de caractere, fara diacritice", () => {
    const corp = corpExpediere(config(), comanda({ continut: `Rochie de vară ${"foarte ".repeat(20)}lungă` }));
    const d = nod(corp, "content").description as string;
    assert.equal(d.length, LUNGIMI.descriere);
    assert.equal(/[ăâîșț]/.test(d), false);
  });

  test("⚠ descrierea PE COLET exista doar la emitere: schema de cotare n-o are deloc", () => {
    const date = comanda({ continut: "Pantofi de piele" });
    assert.equal("description" in coletTarif(corpTarife(config(), date)), false);
    assert.equal(coletEmis(corpExpediere(config(), date)).description, "Pantofi de piele");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * NU EXISTA IDEMPOTENTA: „idempot" are ZERO potriviri in OpenAPI-ul de 1,2 MB, in ghidul
 * SOAP de 473 de pagini si in ghidul de date de referinta; `Message-Reference` nu tine loc
 * („not required to be unique between requests"). SI NU EXISTA ANULARE DE EXPEDIERE.
 * Deci dupa un raspuns pierdut singura cale inapoi e cautarea dupa referinta noastra, cu
 * `shipmentReferenceType=CU` („Consignor reference number"). Pusa pe COLET
 * (`packages[].customerReferences`) ar folosi alt nomenclator de tipuri si nu s-ar mai
 * putea cauta — iar atunci alternativa e sa emiti al doilea AWB, care nu se mai poate anula.
 */
describe("DHL: referinta noastra, singura plasa cand raspunsul se pierde", () => {
  test("⚠ la NIVEL DE EXPEDIERE, cu `typeCode: \"CU\"`", () => {
    const corp = corpExpediere(config(), comanda({ referinta: "EDN-ABCD-000123" }));
    assert.deepEqual(corp.customerReferences, [{ value: "EDN-ABCD-000123", typeCode: "CU" }]);
  });

  test("⚠ si NU pe colet", () => {
    const corp = corpExpediere(config(), comanda({ referinta: "EDN-ABCD-000123" }));
    assert.equal("customerReferences" in coletEmis(corp), false);
  });

  test("fara referinta, cheia lipseste cu totul — nu pleaca goala", () => {
    assert.equal("customerReferences" in corpExpediere(config(), comanda()), false);
  });

  test("⚠ cele patru caractere din businessId despart doua magazine cu acelasi cont DHL", () => {
    const a = referintaComenzii("aaaaaaaa-1111-2222-3333-444444444444", "000123");
    const b = referintaComenzii("bbbbbbbb-1111-2222-3333-444444444444", "000123");
    assert.equal(a, "EDN-AAAA-000123");
    assert.notEqual(a, b);
  });

  test("referinta n-are spatii si incape in cele 35 de caractere ale lor", () => {
    const r = referintaComenzii("abcd-efgh", "12 34");
    assert.equal(/\s/.test(r), false);
    assert.ok(r.length <= LUNGIMI.referinta);
    assert.ok(referintaComenzii("abcd-efgh", "9".repeat(40)).length <= LUNGIMI.referinta);
  });

  test("o referinta prea lunga e taiata la 35, nu trimisa intreaga", () => {
    const corp = corpExpediere(config(), comanda({ referinta: `EDN-ABCD-${"9".repeat(60)}` }));
    const r = lista(corp, "customerReferences")[0];
    assert.equal((r.value as string).length, LUNGIMI.referinta);
  });

  test("aceeasi referinta ajunge si pe factura vamala, ca sa se poata lega hartia de comanda", () => {
    const corp = corpExpediere(config(), catreUS({ referinta: "EDN-ABCD-000124" }));
    assert.equal(nod(corp, "content", "exportDeclaration", "invoice").number, "EDN-ABCD-000124");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `accounts` NU e in `required` la /rates. Fara el nu primesti o eroare, ci tarifele
 * PUBLICATE in loc de cele contractuale — adica un pret gresit in checkout, iar diferenta
 * se vede abia pe factura. Ghidul lor SOAP marcheaza acelasi camp `M`: „The DHL account
 * number that is used for the shipment. Internally attached to this account are the
 * customer specific rates."
 */
describe("DHL: contul pleaca in amandoua cererile, cu `typeCode: \"shipper\"`", () => {
  test("⚠ la cotare — fara el vin tarifele publicate, nu ale tale", () => {
    assert.deepEqual(corpTarife(config(), comanda()).accounts, [
      { typeCode: "shipper", number: "123456789" },
    ]);
  });

  test("la emitere, acelasi cont si acelasi tip", () => {
    assert.deepEqual(corpExpediere(config(), comanda()).accounts, [
      { typeCode: "shipper", number: "123456789" },
    ]);
  });

  test("⚠ taiat la 12 caractere — `accounts[].number` are `maxLength: 12`", () => {
    const corp = corpTarife(config({ account_number: "1234567890123456" }), comanda());
    assert.equal(lista(corp, "accounts")[0].number, "123456789012");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `pickup` e in `required` LA RADACINA cererii de emitere, si `pickup.required =
 * [isRequested]` — deci lipseste = 422, chiar si cand nu vrei ridicare. Iar numarul intors
 * (`dispatchConfirmationNumber`) e SINGURUL lucru care se mai poate anula dupa emitere:
 * `delete:` apare o singura data in toata specificatia lor, pe
 * `/pickups/{dispatchConfirmationNumber}`. AWB-ul nu se anuleaza.
 */
describe("DHL: `pickup` e mereu prezent si spune adevarul", () => {
  test("⚠ prezent chiar si cand comerciantul nu cere ridicare", () => {
    const corp = corpExpediere(config(), comanda());
    assert.ok("pickup" in corp);
    assert.deepEqual(corp.pickup, { isRequested: false });
  });

  test("pornit din configurare, pleaca `true`", () => {
    assert.deepEqual(corpExpediere(config({ cere_ridicare: true }), comanda()).pickup, { isRequested: true });
  });

  test("`pickup` nu apare in cererea de cotare — acolo nu exista", () => {
    assert.equal("pickup" in corpTarife(config(), comanda()), false);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `provinceCode` exista in AMANDOUA schemele lor de adresa (`minLength: 2`), deci nimic nu
 * cade daca il trimiti. Ghidul lor SOAP il descrie insa „2 letter state code for the USA
 * only", iar nomenclatorul lor de tari da pentru RO `divisionTypeCode = O`
 * („Country-use when no divtype identif") — Romania n-are, la ei, nicio diviziune
 * administrativa declarata. „Cluj" pus acolo nu e o informatie in plus, e una GRESITA:
 * motorul nu cade, ci aplica tacut o regula de rezerva („Pickup/Delivery PL fallback rule
 * applied: PS->CP->P->C") si intoarce 200 cu alta zona si alt pret.
 */
describe("DHL: `provinceCode` NU apare NICIODATA", () => {
  test("⚠ nici pe o adresa romaneasca cu judet completat", () => {
    const a = adresaDhl(comanda().destinatar);
    assert.equal("provinceCode" in a, false);
  });

  test("⚠ nici pe una straina, unde judetul scris de cumparator pleaca in `countyName`", () => {
    const a = adresaDhl({ ...comanda().destinatar, tara: "AU", oras: "Sydney", judet: "NSW", codPostal: "2000" });
    assert.equal("provinceCode" in a, false);
    /* Fara `countyName`, „Sydney, NSW" ar ajunge la ei doar ca „Sydney". */
    assert.equal(a.countyName, "NSW");
  });

  test("⚠ in niciuna dintre cererile pe care le poate produce fisierul", () => {
    for (const { nume, corp } of toateCererile()) {
      assert.equal(JSON.stringify(corp).includes("provinceCode"), false, nume);
    }
  });

  test("judetul romanesc NU pleaca deloc cand nu e sector", () => {
    /* „Cluj" in `countyName` („suburb or county") e sub oras la ei, nu peste. */
    const a = adresaDhl({ ...comanda().destinatar, oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001" });
    assert.equal("countyName" in a, false);
    assert.equal(judetDhl({ oras: "Cluj-Napoca", judet: "Cluj" }), null);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `KB` (rambursul) exista in nomenclatorul lor GLOBAL, deci nimic din schema nu-l opreste.
 * Dar nu apare in catalogul comercial DHL Express Romania (24 de servicii enumerate,
 * „cash"/„ramburs" = 0 aparitii), nici in ghidul de tarife 2026 RO/EN, nici in sonda lor
 * de capabilitate pe rutele cu origine RO. Trimis totusi, NU cade la cotare, ci la
 * EMITERE, cu `7008 The requested Special Service Code … is not available between this
 * origin and destination` — adica dupa ce cumparatorul a comandat si a asteptat, si pe un
 * drum care nu se poate relua fara sa emita al doilea AWB.
 */
describe("DHL: rambursul nu pleaca in niciun fel", () => {
  test("⚠ `KB` nu apare in NICIUNA dintre cereri, oricum ai chema functiile", () => {
    for (const { nume, corp } of toateCererile()) {
      assert.equal(JSON.stringify(corp).includes(COD_RAMBURS), false, nume);
    }
  });

  test("fara asigurare, `valueAddedServices` lipseste cu totul", () => {
    assert.equal("valueAddedServices" in corpExpediere(config(), comanda({ valoareComanda: 500 })), false);
  });

  test("cu asigurarea pornita pleaca DOAR `II`, cu suma si valuta", () => {
    const corp = corpExpediere(config({ asigurare_activa: true }), comanda({ valoareComanda: 500 }));
    const servicii = lista(corp, "valueAddedServices");
    assert.deepEqual(servicii, [{ serviceCode: "II", value: 500, currency: "RON" }]);
    assert.equal(servicii.some((s) => s.serviceCode === COD_RAMBURS), false);
  });

  test("suma asigurata a comenzii bate valoarea comenzii", () => {
    const corp = corpExpediere(config({ asigurare_activa: true }), comanda({ valoareComanda: 500, asigurare: 1200 }));
    assert.equal(lista(corp, "valueAddedServices")[0].value, 1200);
  });

  test("avertismentul catre comerciant spune de ce dispare DHL din checkout", () => {
    assert.ok(AVERTISMENT_RAMBURS.includes("plata la livrare"));
    assert.ok(AVERTISMENT_RAMBURS.includes("Romania"));
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Asigurarea (`II`) pleca DOAR la emitere: `corpExpediere` o trimitea, `corpTarife` nu
 * trimitea niciun `valueAddedServices`. Urmarea nu era o eroare, ci un pret: cel cotat —
 * aratat cumparatorului in checkout si scris in `dhl_cost` pe comanda — iesea sub cel
 * facturat cu cel putin 55 de lei pe FIECARE colet, fiindca in catalogul lor romanesc
 * „Shipment Insurance" costa „55.00 LEI or 1% of insured value, if higher". Magazinul
 * livra in pierdere pe fiecare comanda, si nimic din interfata nu lega cele doua sume.
 *
 * Cele doua corpuri pleaca dinadins din acelasi `DateExpediere` tocmai ca sa nu se poata
 * departa; de aceea proba de mai jos nu verifica o valoare scrisa de mana, ci EGALITATEA
 * celor doua liste — o adaugire facuta doar intr-unul din corpuri cade aici.
 */
describe("DHL: cotarea si emiterea poarta ACELEASI servicii cu valoare adaugata", () => {
  test("⚠ `II` pleaca SI la cotare cand comerciantul are asigurarea pornita", () => {
    const corp = corpTarife(config({ asigurare_activa: true }), comanda({ valoareComanda: 500 }));
    assert.deepEqual(lista(corp, "valueAddedServices"), [
      { serviceCode: "II", value: 500, currency: "RON" },
    ]);
  });

  test("fara asigurare, cotarea nu poarta niciun serviciu", () => {
    assert.equal("valueAddedServices" in corpTarife(config(), comanda({ valoareComanda: 500 })), false);
  });

  test("suma asigurata a comenzii bate valoarea comenzii, la fel ca la emitere", () => {
    const corp = corpTarife(config({ asigurare_activa: true }), comanda({ valoareComanda: 500, asigurare: 1200 }));
    assert.equal(lista(corp, "valueAddedServices")[0].value, 1200);
  });

  test("⚠ acelasi set de servicii pentru aceleasi date, pe toate cele trei rute", () => {
    const cuAsigurare = config({ asigurare_activa: true });
    for (const date of [comanda({ valoareComanda: 500 }), catreDE({ valoareComanda: 500 }), catreUS()]) {
      assert.deepEqual(
        lista(corpTarife(cuAsigurare, date), "valueAddedServices"),
        lista(corpExpediere(cuAsigurare, date), "valueAddedServices"),
        String(date.destinatar.tara),
      );
    }
  });

  test("⚠ suma asigurata NU se declara a doua oara ca `monetaryAmount.insuredValue`", () => {
    /* Enumerarea lor chiar are `insuredValue`, dar ghidul lor spune ca suma calatoreste PE
       serviciu, iar campul separat „will be deprecated … as the SpecialServices section
       should be used to convey Insured Value". Declarata de doua ori, ar putea fi tarifata
       de doua ori — si tot pe factura s-ar vedea. */
    const corp = corpTarife(config({ asigurare_activa: true }), comanda({ valoareComanda: 500 }));
    assert.deepEqual(corp.monetaryAmount, [
      { typeCode: "declaredValue", value: 500, currency: "RON" },
    ]);
    assert.equal(JSON.stringify(corp).includes("insuredValue"), false);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Regula proiectului: Sameday si eColet vor „Sector 3" in campul de localitate, ceilalti
 * zece vor „Bucuresti". Cine le uniformizeaza rupe zece curieri TACUT. DHL sta cu cei
 * multi: „sector" are ZERO aparitii in specificatia lor de 1,2 MB, iar propria lor adresa
 * din ghid e „Calea Floreasca 169A, Corp A, Etaj 8, Bucharest", fara sector.
 *
 * ⚠ FALSUL PRIETEN care poate intoarce hotararea: codul lor de eroare `201200 Either
 * pickup route or sector should be present` vorbeste despre sectorul INTERN de rutare al
 * curierului, nu despre sectoarele bucurestene.
 */
describe("DHL: Bucurestiul intra in tabara cea mare", () => {
  test("orasul se pliaza in „Bucuresti”, oricum ar fi scris", () => {
    assert.equal(orasDhl("Sector 3", "Bucuresti"), "Bucuresti");
    assert.equal(orasDhl("Bucuresti", "Bucuresti"), "Bucuresti");
    assert.equal(orasDhl("București", "București"), "Bucuresti");
    assert.equal(orasDhl("Bucharest"), "Bucuresti");
  });

  test("sectorul pleaca ca `countyName` — la ei nivelul asta e „suburb”, sub oras", () => {
    assert.equal(judetDhl({ oras: "Sector 3", judet: "Bucuresti" }), "Sector 3");
    assert.equal(sectorPentruAdresa({ oras: "bucuresti sectorul 5", judet: "Bucuresti" }), "Sector 5");
  });

  test("⚠ „Bucuresti” simplu NU capata un sector inventat", () => {
    /* Un sector ghicit trimite coletul in alta parte a orasului. */
    assert.equal(judetDhl({ oras: "Bucuresti", judet: "Bucuresti" }), null);
    assert.equal(sectorPentruAdresa({ oras: "Bucuresti", judet: "Bucuresti" }), null);
  });

  test("pe adresa completa: oras „Bucuresti”, sector pe linii SI in `countyName`", () => {
    const a = adresaDhl({ ...comanda().destinatar, oras: "Sector 3" });
    assert.equal(a.cityName, "Bucuresti");
    assert.equal(a.countyName, "Sector 3");
    assert.equal(a.addressLine2, "Sector 3");
  });

  test("si in cererea de emitere, pe adresa destinatarului", () => {
    const a = nod(corpExpediere(config(), catre({ oras: "Sector 3" })), "customerDetails", "receiverDetails", "postalAddress");
    assert.equal(a.cityName, "Bucuresti");
    assert.equal(a.countyName, "Sector 3");
  });

  test("⚠ CONTROLUL NEGATIV: Cluj-Napoca nu primeste niciun sector, nicaieri", () => {
    const date = catre({ oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001" });
    const a = adresaDhl(date.destinatar);
    assert.equal(a.cityName, "Cluj-Napoca");
    assert.equal("countyName" in a, false);
    assert.equal(JSON.stringify(corpExpediere(config(), date)).includes("Sector"), false);
  });

  test("⚠ cand adresa umple cele trei linii, sectorul pleaca DOAR ca `countyName`", () => {
    /* Cele trei linii au FIECARE 45 de caractere, si nu exista concatenare automata la ei:
       strada si numarul conteaza mai mult decat sectorul, pe care il da si codul postal. */
    const lunga = {
      ...comanda().destinatar,
      oras: "Sector 3",
      strada: "Aleea Constructorilor din Cartierul Nou Bulevardul Independentei Numarul Vechi al Uzinei",
      bloc: "B12",
      scara: "C",
      etaj: "4",
      apartament: "57",
    };
    assert.equal(liniiAdresa(lunga).length, LUNGIMI.liniiAdresa);
    const a = adresaDhl(lunga);
    assert.equal(a.countyName, "Sector 3");
    assert.equal([a.addressLine1, a.addressLine2, a.addressLine3].join(" ").includes("Sector 3"), false);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `dimensions` e OPTIONAL la ei (`packages[].required = ["weight"]`), deci lipsa lui nu
 * produce nicio eroare si niciun avertisment — produce un pret cotat mai mic decat cel
 * facturat. Verbatim din ghidul lor romanesc: „Any piece in the shipment may be re-weighed
 * and/or re-measured by DHL to confirm this calculation". Suprataxa „Overweight Piece" e
 * 470 lei international / 248 lei domestic.
 *
 * ⚠ Si daca il trimiti, toate trei laturile sunt obligatorii inauntru
 * (`dimensions.required = [length, width, height]`) — nu se poate trimite doar lungimea.
 */
describe("DHL: dimensiunile pleaca MEREU, in amandoua cererile", () => {
  test("⚠ la cotare — fara ele DHL coteaza pe greutatea reala si remasoara la depozit", () => {
    assert.deepEqual(coletTarif(corpTarife(config(), comanda())).dimensions, { length: 30, width: 20, height: 10 });
  });

  test("⚠ la emitere, aceleasi", () => {
    assert.deepEqual(coletEmis(corpExpediere(config(), comanda())).dimensions, { length: 30, width: 20, height: 10 });
  });

  test("toate TREI laturile, si cand configurarea da doar una", () => {
    const d = coletTarif(corpTarife(config({ lungime_cm: 40 }), comanda())).dimensions as Record<string, unknown>;
    assert.deepEqual(Object.keys(d).sort(), ["height", "length", "width"]);
    assert.equal(d.length, 40);
    assert.equal(d.width, DIMENSIUNI_IMPLICITE.latime);
  });

  test("implicitele sunt aceleasi cu ale celorlalti curieri", () => {
    assert.deepEqual(dimensiuniColet({}), { lungime: 30, latime: 20, inaltime: 10 });
  });

  test("⚠ se rotunjeste IN SUS: o rotunjire in jos subdeclara coletul", () => {
    assert.deepEqual(dimensiuniColet({ lungime_cm: 27.1, latime_cm: 20.9, inaltime_cm: 10 }), {
      lungime: 28, latime: 21, inaltime: 10,
    });
  });

  test("o latura peste plafonul comercial se incadreaza la 120 cm", () => {
    assert.equal(dimensiuniColet({ lungime_cm: 500 }).lungime, 120);
    assert.equal(dimensiuniColet({ latime_cm: 0 }).latime, DIMENSIUNI_IMPLICITE.latime);
    assert.equal(dimensiuniColet({ inaltime_cm: -5 }).inaltime, DIMENSIUNI_IMPLICITE.inaltime);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * CINCI MII, NU SASE MII. Verbatim din ghidul lor romanesc: „inmultiti lungimea cu
 * inaltimea cu latimea in centimetri, apoi impartiti totalul la 5 000 pentru fiecare
 * piesa". Divizorul 6000, folosit de alti curieri din platforma, ar subdeclara greutatea
 * volumetrica cu 20% si ar ascunde exact suprataxa pe care ea o prezice.
 *
 * Si greutatea minima: schema zice `minimum: 0.001`, ghidul lor spune „Minimum allowed
 * weight is 0.1kg" — un colet de 0,05 kg trece validarea JSON si cade la motor cu
 * `410117 The minimum piece weight not met`.
 */
describe("DHL: greutatea volumetrica si cea taxabila", () => {
  test("⚠ divizorul e 5000 — cu 6000 ar iesi 20 kg in loc de 24", () => {
    assert.equal(DIVIZOR_VOLUMETRIC, 5000);
    assert.equal(greutateVolumetrica({ lungime: 60, latime: 50, inaltime: 40 }), 24);
    assert.notEqual(greutateVolumetrica({ lungime: 60, latime: 50, inaltime: 40 }), 20);
  });

  test("greutatea taxabila e maximul dintre cea reala si cea volumetrica", () => {
    /* Coletul usor si mare: 12 kg reali, 80 kg volumetrici. */
    assert.equal(greutateTaxabila(12, { lungime: 100, latime: 80, inaltime: 50 }), 80);
    /* Si invers: coletul mic si greu. */
    assert.equal(greutateTaxabila(30, { lungime: 30, latime: 20, inaltime: 10 }), 30);
  });

  test("dimensiuni fara sens nu produc un volumetric fantoma", () => {
    assert.equal(greutateVolumetrica({ lungime: 0, latime: 20, inaltime: 10 }), 0);
    assert.equal(greutateTaxabila(0, { lungime: 0, latime: 0, inaltime: 0 }), 0);
  });

  test("⚠ greutatea trimisa nu coboara sub 0,1 kg", () => {
    assert.equal(coletTarif(corpTarife(config(), comanda({ greutateKg: 0.05 }))).weight, GREUTATE_MINIMA_KG);
    assert.equal(coletEmis(corpExpediere(config(), comanda({ greutateKg: 0 }))).weight, GREUTATE_MINIMA_KG);
  });

  test("greutatea reala pleaca cu cel mult trei zecimale (`multipleOf: 0.001`)", () => {
    assert.equal(coletTarif(corpTarife(config(), comanda({ greutateKg: 2.34567 }))).weight, 2.346);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Suprataxele NU intra in lista de lipsuri, si asta e o hotarare: lista aia e o POARTA —
 * tot ce intra in ea opreste emiterea si scoate DHL din checkout. O suprataxa nu opreste
 * nimic: coletul pleaca, doar costa mai mult. Amestecate, un colet de 30 kg perfect legal
 * ar fi disparut din checkout.
 */
describe("DHL: suprataxele se SPUN, nu blocheaza", () => {
  test("⚠ coletul usor si mare ia „Overweight”, desi cantareste 12 kg", () => {
    const a = avertismenteColet(12, { lungime: 100, latime: 80, inaltime: 50 });
    assert.ok(a.some((x) => x.includes("Overweight")));
    /* Si nu opreste nimic. */
    assert.deepEqual(lipsuriExpediere(config(), comanda({ greutateKg: 12 })).comanda, []);
  });

  test("intre 25 si 70 kg e doar sortare manuala", () => {
    const a = avertismenteColet(30, { lungime: 30, latime: 20, inaltime: 10 });
    assert.ok(a.some((x) => x.includes("Non-Conveyable")));
    assert.deepEqual(lipsuriExpediere(config(), comanda({ greutateKg: 30 })).comanda, []);
  });

  test("o latura peste 100 cm ia „Oversize”, si numai daca n-a luat deja „Overweight”", () => {
    const a = avertismenteColet(2, { lungime: 110, latime: 30, inaltime: 20 });
    assert.equal(a.length, 1);
    assert.ok(a[0].includes("Oversize"));
  });

  test("120 x 80 x 80 e regula pe TRIPLET: o cutie de 100x100x100 nu incape", () => {
    assert.ok(avertismenteColet(5, { lungime: 100, latime: 100, inaltime: 100 })
      .some((x) => x.includes("120 x 80 x 80")));
    assert.equal(avertismenteColet(5, { lungime: 30, latime: 20, inaltime: 10 }).length, 0);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `isCustomsDeclarable` e descris de ei doar ca „please advise if your shipment is
 * dutiable (true) or non dutiable (false)" — cine hotaraste si dupa ce criteriu nu scrie
 * in niciuna dintre cele patru surse. Regula e a Uniunii Europene, si greseala se plateste
 * in amandoua sensurile: declarat inutil pe RO→DE, coletul cere hartii pe care nimeni nu
 * le trimite; nedeclarat pe RO→GB, se opreste in vama, iar DHL nu are anulare cu care sa
 * repari.
 */
describe("DHL: cine are nevoie de declaratie vamala", () => {
  test("RO→RO nu, RO→DE nu, RO→GB da, RO→US da", () => {
    assert.equal(eVamal("RO", "RO"), false);
    assert.equal(eVamal("RO", "DE"), false);
    assert.equal(eVamal("RO", "GB"), true);
    assert.equal(eVamal("RO", "US"), true);
  });

  test("tara lipsa se ia ca Romania, nu ca „necunoscut”", () => {
    assert.equal(eVamal(null, null), false);
    assert.equal(eVamal(undefined, "us"), true);
  });

  test("⚠ teritoriile cu cod ISO de stat membru si vama proprie: Canare, Ceuta, Aland", () => {
    /* `eVamal` primeste doar tari, deci ramane orb la ele; adresa completa le vede. */
    assert.equal(eVamal("RO", "ES"), false);
    const canare: AdresaComanda = { ...comanda().destinatar, tara: "ES", oras: "Las Palmas", judet: null, codPostal: "35001" };
    assert.equal(eVamalPeAdresa(expeditorCaAdresa(config()), canare), true);
    const madrid: AdresaComanda = { ...canare, oras: "Madrid", codPostal: "28001" };
    assert.equal(eVamalPeAdresa(expeditorCaAdresa(config()), madrid), false);
  });

  test("`exportDeclaration` pleaca DOAR pe expedierile vamale", () => {
    assert.equal("exportDeclaration" in nod(corpExpediere(config(), comanda()), "content"), false);
    assert.equal("exportDeclaration" in nod(corpExpediere(config(), catreDE()), "content"), false);
    assert.ok("exportDeclaration" in nod(corpExpediere(config(), catreUS()), "content"));
  });

  test("⚠ pretul din linie e UNITAR, nu totalul pe linie", () => {
    /* „Please provide unit or article price line item value". Pus totalul, valoarea
       declarata a coletului iese inmultita cu cantitatea. */
    const linie = lista(corpExpediere(config(), catreUS()), "content", "exportDeclaration", "lineItems")[0];
    assert.equal(linie.price, 79.99);
    assert.equal(nod(linie, "quantity").value, 2);
  });

  test("⚠ `manufacturerCountry` e unde a fost FABRICAT, nu de unde pleaca coletul", () => {
    const linie = lista(corpExpediere(config(), catreUS()), "content", "exportDeclaration", "lineItems")[0];
    assert.equal(linie.manufacturerCountry, "PT");
    assert.deepEqual(linie.commodityCodes, [{ typeCode: "outbound", value: "6109.10" }]);
  });

  test("valoarea declarata pleaca cu valuta ei, nu singura", () => {
    const bloc = nod(corpExpediere(config(), catreUS()), "content");
    assert.equal(bloc.declaredValue, 349.9);
    assert.equal(bloc.declaredValueCurrency, "RON");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Doua liste, dinadins: la SmartShip alerta din checkout dadea vina pe magazin si pentru o
 * adresa incompleta a clientului, iar comerciantul cauta degeaba o gresala in configurare.
 * Iar fiecare camp e probat pe rand fiindca o conditie scrisa gresit (`||` in loc de `&&`,
 * o negatie pierduta) trece neobservata cand se probeaza doar lista goala.
 */
describe("DHL: ce lipseste din CONFIGURARE, camp cu camp", () => {
  test("configurarea completa nu ridica nimic", () => {
    assert.deepEqual(lipsuriConfigurare(config()), []);
  });

  test("fara configurare, un singur motiv", () => {
    assert.deepEqual(lipsuriConfigurare(null), ["configurarea DHL"]);
  });

  test("credentialele MyDHL API", () => {
    assert.ok(lipsuriConfigurare(config({ username: "" })).some((x) => x.includes("utilizatorul")));
    assert.ok(lipsuriConfigurare(config({ password: "  " })).some((x) => x.includes("parola")));
  });

  test("⚠ contul, si plafonul lui de 12 caractere", () => {
    assert.ok(lipsuriConfigurare(config({ account_number: "" })).some((x) => x.includes("numarul de cont")));
    /* Peste 12 caractere e sigur altceva — de pilda cheia de API lipita gresit. */
    assert.ok(lipsuriConfigurare(config({ account_number: "1234567890123" })).some((x) => x.includes("12 caractere")));
  });

  test("expeditorul: nume sau firma, strada, oras", () => {
    const fara = (peste: Partial<DhlConfig["expeditor"]>) =>
      lipsuriConfigurare(config({ expeditor: { ...config().expeditor!, ...peste } }));
    assert.ok(fara({ nume: "", companie: "" }).some((x) => x.includes("numele sau firma")));
    /* O firma fara persoana de contact e o configurare valida. */
    assert.deepEqual(fara({ nume: "", companie: "Magazin SRL" }), []);
    assert.ok(fara({ strada: "" }).some((x) => x.includes("strada")));
    assert.ok(fara({ oras: "" }).some((x) => x.includes("orasul")));
  });

  test("⚠ codul postal al expeditorului, cu motiv separat cand nu are sase cifre", () => {
    const fara = (peste: Partial<DhlConfig["expeditor"]>) =>
      lipsuriConfigurare(config({ expeditor: { ...config().expeditor!, ...peste } }));
    assert.ok(fara({ cod_postal: "" }).some((x) => x === "codul postal al expeditorului"));
    assert.ok(fara({ cod_postal: "4000" }).some((x) => x.includes("sase cifre")));
    /* Expeditor strain: n-avem formatul lor, deci nu inventam o cerinta romaneasca. */
    assert.deepEqual(fara({ tara: "DE", cod_postal: "10115" }), []);
  });

  test("⚠ telefonul expeditorului — `phone` e in `required` pe contact, nu doar la extern", () => {
    const fara = lipsuriConfigurare(config({ expeditor: { ...config().expeditor!, telefon: "" } }));
    assert.ok(fara.some((x) => x.includes("telefonul expeditorului")));
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `supermodelIoLogisticsExpressContact.required = [phone, companyName, fullName]` — toate
 * trei, SI PENTRU DESTINATAR. La UPS telefonul cumparatorului devenea obligatoriu abia la
 * expedierile externe; aici o comanda interna fara telefon cade cu 422.
 *
 * ⚠ Iar codul postal e cazul special: checkout-ul Edinio NU il cere la comenzile interne,
 * deci lipsa lui e o stare NORMALA, nu o exceptie — si de aceea are motiv propriu, pe care
 * apelantul il deosebeste ca sa ridice alerta o singura data, in loc sa lase comerciantul
 * sa creada ca a gresit el ceva in configurare.
 */
describe("DHL: ce lipseste din COMANDA, camp cu camp", () => {
  test("o comanda completa nu ridica nimic, si cele doua liste sunt separate", () => {
    const l = lipsuriExpediere(config(), comanda());
    assert.deepEqual(l.comanda, []);
    assert.deepEqual(l.configurare, []);
  });

  test("vina nu se amesteca: configurarea stricata nu murdareste lista comenzii", () => {
    const l = lipsuriExpediere(config({ username: "" }), comanda({ greutateKg: 0 }));
    assert.ok(l.configurare.some((x) => x.includes("utilizatorul")));
    assert.deepEqual(l.comanda, ["greutatea coletului"]);
  });

  test("numele, adresa si orasul destinatarului", () => {
    assert.ok(lipsuriExpediere(config(), catre({ nume: "", companie: null })).comanda
      .some((x) => x.includes("numele sau firma destinatarului")));
    assert.ok(lipsuriExpediere(config(), catre({ strada: "", numar: null })).comanda
      .some((x) => x.includes("adresa destinatarului")));
    assert.ok(lipsuriExpediere(config(), catre({ oras: "" })).comanda
      .some((x) => x.includes("orasul destinatarului")));
  });

  test("⚠ telefonul e obligatoriu SI intern, spre deosebire de UPS", () => {
    const l = lipsuriExpediere(config(), catre({ telefon: null }));
    assert.ok(l.comanda.some((x) => x.includes("telefonul destinatarului")));
  });

  test("⚠ codul postal are motiv propriu, ca sa poata fi deosebit de restul", () => {
    const l = lipsuriExpediere(config(), catre({ codPostal: null }));
    assert.ok(l.comanda.includes(LIPSA_COD_POSTAL));
    assert.equal(lipsesteCodulPostal(l), true);
    /* Cinci cifre nu sunt sase: nomenclatorul lor da `999999 | 6 | RO | ROMANIA`. */
    assert.equal(lipsesteCodulPostal(lipsuriExpediere(config(), catre({ codPostal: "30167" }))), true);
    assert.equal(lipsesteCodulPostal(lipsuriExpediere(config(), comanda())), false);
  });

  test("greutatea: lipsa opreste, si peste 70 kg tot opreste", () => {
    assert.ok(lipsuriExpediere(config(), comanda({ greutateKg: 0 })).comanda.includes("greutatea coletului"));
    const greu = lipsuriExpediere(config(), comanda({ greutateKg: 90 })).comanda;
    assert.ok(greu.some((x) => x.includes(`${GREUTATE_MAXIMA_KG} kg`)));
    /* ⚠ Limita e cea COMERCIALA (ghidul romanesc), nu cea tehnica din nomenclatorul lor
       (`shipmentMaximumWeight: 3030.000`): pe cifra tehnica treci de API si cazi la depozit. */
    assert.deepEqual(lipsuriExpediere(config(), comanda({ greutateKg: 70 })).comanda, []);
  });

  test("⚠ datele vamale blocheaza emiterea, fiindca nu exista al doilea AWB de reparatie", () => {
    /* `commodityCodes` NU e in `required` la ei: fara el se emite, si se opreste in vama. */
    const fara = lipsuriExpediere(config(), catreUS({ articole: [] }));
    assert.ok(fara.comanda.includes(LIPSA_COD_VAMAL));
    assert.equal(lipsescDateleVamale(fara), true);

    const fara2 = lipsuriExpediere(config(), catreUS({ articole: [{ ...ARTICOL, codVamal: null }] }));
    assert.equal(lipsescDateleVamale(fara2), true);
    const fara3 = lipsuriExpediere(config(), catreUS({ articole: [{ ...ARTICOL, taraOrigine: "" }] }));
    assert.equal(lipsescDateleVamale(fara3), true);

    assert.deepEqual(lipsuriExpediere(config(), catreUS()).comanda, []);
  });

  test("⚠ intra-UE NU se cer date vamale — altfel n-ar mai pleca nimic in Uniune", () => {
    assert.deepEqual(lipsuriExpediere(config(), catreDE()).comanda, []);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `additionalProperties: false` nu iarta un camp prea lung — cererea cade cu
 * `#/customerDetails/shipperDetails/postalAddress/cityName: expected maxLength: 45,
 * actual: 49`, verbatim din exemplul lor de raspuns 400. Dar nici o taiere GRESITA nu se
 * vede fara proba: adresa taiata in loc de impartita ajunge la curier fara bloc, scara si
 * apartament, iar coletul se intoarce dupa cateva zile, cu transportul platit.
 */
describe("DHL: taierea pe lungimile lor, si adresa care se IMPARTE", () => {
  test("o adresa romaneasca intreaga intra pe cel mult 3 linii de 45", () => {
    const linii = liniiAdresa({
      strada: "Strada Alexandru Ioan Cuza",
      numar: "128",
      bloc: "B12",
      scara: "C",
      etaj: "4",
      apartament: "57",
    });
    assert.ok(linii.length <= LUNGIMI.liniiAdresa);
    assert.ok(linii.every((l) => l.length <= LUNGIMI.liniiAdresaLungime));
    /* ⚠ Apartamentul se pastreaza: taiata in loc de impartita, adresa ar fi ajuns fara el. */
    assert.ok(linii.join(" ").includes("ap. 57"));
  });

  test("⚠ 45 de FIECARE linie, nu 45 in total — nu exista concatenare automata la ei", () => {
    const a = adresaDhl({
      ...comanda().destinatar,
      strada: "Aleea Constructorilor din Cartierul Nou Bulevardul Independentei Numarul Vechi al Uzinei",
    });
    for (const linie of [a.addressLine1, a.addressLine2, a.addressLine3]) {
      if (linie) assert.ok(linie.length <= LUNGIMI.liniiAdresaLungime, linie);
    }
    assert.ok((a.addressLine1 ?? "").length > 20);
  });

  test("un singur cuvant mai lung decat o linie e taiat, nu aruncat", () => {
    const linii = liniiAdresa({ strada: "A".repeat(80) });
    assert.equal(linii.length, 1);
    assert.equal(linii[0].length, LUNGIMI.liniiAdresaLungime);
  });

  test("fara diacritice pe adresa si pe oras", () => {
    const a = adresaDhl({ ...comanda().destinatar, strada: "Strada Ștefan cel Mare și Sfânt", oras: "Timișoara", judet: "Timiș", codPostal: "300001" });
    assert.equal(/[ăâîșțĂÂÎȘȚ]/.test(JSON.stringify(a)), false);
    assert.equal(a.cityName, "Timisoara");
  });

  test("⚠ adresa goala nu pleaca goala: `addressLine1` are `minLength: 1`", () => {
    /* Cade la ei cu un mesaj despre adresa, nu cu o eroare de schema pe care n-o intelege
       nimeni. ⚠ Si judetul trebuie golit si el: cu „Bucuresti” in judet, un oras gol se
       pliaza tot in „Bucuresti” (`normalizeLocalityName`), deci nu mai e gol. */
    const a = adresaDhl({ ...comanda().destinatar, strada: "", numar: null, oras: "", judet: null });
    assert.equal(a.addressLine1, "-");
    assert.equal(a.cityName, "-");
  });

  test("orasul se taie la 45", () => {
    const a = adresaDhl({ ...comanda().destinatar, oras: "Comuna ".repeat(12), judet: null });
    assert.equal(a.cityName.length, 45);
  });

  test("⚠ lungimile sunt ALE LOR, transcrise din schema — nu se ridica „ca sa incapa”", () => {
    /*
     * ⚠ Proba asta exista fiindca toate celelalte se compara cu `LUNGIMI`, deci o cifra
     * RIDICATA in constanta le trece pe toate: taierea se face in continuare „la limita",
     * numai ca limita nu mai e a lor. Cererea pleaca si cade abia la ei, cu
     * `#/customerDetails/shipperDetails/postalAddress/cityName: expected maxLength: 45,
     * actual: 49` — verbatim din exemplul lor de raspuns 400.
     */
    assert.deepEqual(
      {
        nume: LUNGIMI.nume,
        companie: LUNGIMI.companie,
        oras: LUNGIMI.oras,
        judet: LUNGIMI.judet,
        codPostal: LUNGIMI.codPostal,
        telefon: LUNGIMI.telefon,
        email: LUNGIMI.email,
        emailInstiintare: LUNGIMI.emailInstiintare,
        liniiAdresa: LUNGIMI.liniiAdresa,
        liniiAdresaLungime: LUNGIMI.liniiAdresaLungime,
        referinta: LUNGIMI.referinta,
        descriere: LUNGIMI.descriere,
        descriereColet: LUNGIMI.descriereColet,
      },
      {
        /* `contactInformation`: 255 / 100 / 70 / 70. */
        nume: 255,
        companie: 100,
        telefon: 70,
        email: 70,
        /* `postalAddress`: 45 / 45 / 12, si TREI linii de cate 45. */
        oras: 45,
        judet: 45,
        codPostal: 12,
        liniiAdresa: 3,
        liniiAdresaLungime: 45,
        /* ⚠ `shipmentNotification[].receiverId` are 50, nu 70 ca emailul de pe contact. */
        emailInstiintare: 50,
        /* `customerReferences[].value` si `content.description`. */
        referinta: 35,
        descriere: 70,
        descriereColet: 70,
      },
    );
  });

  test("⚠ numele la 255 si firma la 100 — doua plafoane pe ACELASI text", () => {
    /* Cumparatorul fara firma isi vede numele in amandoua campurile, dar cele doua limite
       sunt diferite. Schimbate intre ele, `companyName` de 255 cade cu
       „expected maxLength: 100" pe fiecare comanda cu nume lung. */
    const c = contactDhl({ ...comanda().destinatar, nume: `Ion${"a".repeat(400)}`, companie: null });
    assert.equal(c.fullName.length, LUNGIMI.nume);
    assert.equal(c.companyName.length, LUNGIMI.companie);
  });

  test("⚠ cumparatorul persoana fizica primeste numele lui in `companyName`", () => {
    /* `companyName` are `minLength: 1` si e in `required`: un sir gol ar cadea cu 422 pe
       majoritatea comenzilor unui magazin. */
    const c = contactDhl(comanda().destinatar);
    assert.equal(c.companyName, "Ion Popescu");
    assert.equal(c.fullName, "Ion Popescu");
    assert.equal(c.email, "ion@exemplu.ro");
  });

  test("firma, cand exista, sta in `companyName` si persoana in `fullName`", () => {
    const c = contactDhl({ ...comanda().destinatar, companie: "Alfa Comert SRL" });
    assert.equal(c.companyName, "Alfa Comert SRL");
    assert.equal(c.fullName, "Ion Popescu");
  });

  test("⚠ emailul are DOUA latimi: 70 pe contact, 50 pe instiintare", () => {
    const lung = `${"a".repeat(52)}@exemplu.ro`;
    const date = catre({ email: lung });
    const corp = corpExpediere(config({ notifica_destinatarul: true }), date);
    const contact = nod(corp, "customerDetails", "receiverDetails", "contactInformation");
    assert.equal((contact.email as string).length, lung.length);
    assert.ok(lung.length <= LUNGIMI.email);
    const instiintare = lista(corp, "shipmentNotification")[0];
    assert.equal((instiintare.receiverId as string).length, LUNGIMI.emailInstiintare);
    assert.equal(instiintare.typeCode, "email");
  });

  test("fara instiintare ceruta, cheia lipseste", () => {
    assert.equal("shipmentNotification" in corpExpediere(config(), comanda()), false);
    /* Si nici cand e ceruta, dar cumparatorul n-a lasat email. */
    assert.equal(
      "shipmentNotification" in corpExpediere(config({ notifica_destinatarul: true }), catre({ email: null })),
      false,
    );
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Codul postal romanesc are SASE cifre, si e afirmatia LOR: nomenclatorul
 * `countryPostalcodeFormat` da `999999 | 6 | RO | ROMANIA`. Un cod partial trimis mai
 * departe cade la ei cu `420506 Postcode not found`, unde mesajul nu spune al cui e codul.
 *
 * Iar telefonul e pe dos fata de UPS: UPS spune raspicat „Valid values are 0 - 9" si
 * respinge plusul; DHL nu impune niciun format, iar propriul lor exemplu e `'+1123456789'`.
 * Pentru un curier care poate suna dintr-o alta tara, `0712345678` e ambiguu.
 */
describe("DHL: telefonul si codul postal", () => {
  test("⚠ telefonul pleaca CU prefix international si CU plus", () => {
    assert.equal(telefonDhl("0722 333 444"), "+40722333444");
    assert.equal(telefonDhl("+40 722 333 444"), "+40722333444");
    assert.equal(telefonDhl("0040-722-333-444"), "+40722333444");
    assert.equal(telefonDhl("(0722) 333-444"), "+40722333444");
  });

  test("un numar strain isi pastreaza prefixul lui", () => {
    assert.equal(telefonDhl("+49 171 1234567"), "+491711234567");
  });

  test("gol ramane gol — un telefon inventat ar fi mai rau decat unul lipsa", () => {
    assert.equal(telefonDhl(null), "");
    assert.equal(telefonDhl("   "), "");
    assert.equal(telefonDhl("fara"), "");
  });

  test("cel mult 70 de caractere", () => {
    assert.ok(telefonDhl(`+40722333444${"9".repeat(90)}`).length <= LUNGIMI.telefon);
  });

  test("⚠ codul postal romanesc: EXACT sase cifre, altfel sirul gol", () => {
    assert.equal(codPostalDhl("030167", "RO"), "030167");
    assert.equal(codPostalDhl(" 03 01 67 ", "RO"), "030167");
    assert.equal(codPostalDhl("30167", "RO"), "");
    assert.equal(codPostalDhl("0301678", "RO"), "");
    assert.equal(codPostalDhl("CP 030167", "RO"), "030167");
    assert.equal(codPostalDhl(null, "RO"), "");
  });

  test("pentru restul lumii se curata, nu se valideaza — n-avem formatul lor", () => {
    assert.equal(codPostalDhl("sw1a 1aa", "GB"), "SW1A 1AA");
    assert.equal(codPostalDhl("1234  ab", "NL"), "1234 AB");
    assert.equal(codPostalDhl("10001", "US"), "10001");
  });

  test("⚠ cheia `postalCode` pleaca si cand valoarea e goala", () => {
    /* E in `required` pe amandoua schemele, cu `minLength: 0`. Omisa, cererea cade cu
       eroare de schema; goala, cade abia la motor, si numai unde chiar exista coduri. */
    const a = adresaDhl({ ...comanda().destinatar, codPostal: null });
    assert.ok("postalCode" in a);
    assert.equal(a.postalCode, "");
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Cele doua implicituri ALE LOR nu se potrivesc intre ele: sablonul implicit declarat e
 * `ECOM26_84_001`, pe care nomenclatorul lor il da ca fiind DOAR termic („ZPL,LP2,EPL2"),
 * in timp ce `encodingFormat` are `default: pdf`. Un comerciant fara imprimanta termica ar
 * primi un fisier pe care nu-l poate tipari. Iar `EPL2` din nomenclatorul lor se scrie
 * `epl` in cerere — cine transcrie coloana in camp ia 422 pe fiecare emitere, cu un mesaj
 * despre un camp copiat din documentatia lor.
 */
describe("DHL: eticheta — `encodingFormat` si `templateName` se potrivesc", () => {
  test("implicitul e PDF, cu un sablon pe care nomenclatorul lor il da ca PDF", () => {
    const corp = corpExpediere(config(), comanda());
    assert.equal(nod(corp, "outputImageProperties").encodingFormat, "pdf");
    assert.equal(optiuneImagine(corp, "label").templateName, "ECOM26_A4_001");
  });

  test("⚠ perechea se potriveste pentru TOATE cele patru formate", () => {
    for (const format of ["PDF", "ZPL", "LP2", "EPL2"] as FormatEticheta[]) {
      const corp = corpExpediere(config({ format_eticheta: format }), comanda());
      const cerut = nod(corp, "outputImageProperties").encodingFormat;
      assert.equal(cerut, format === "EPL2" ? "epl" : format.toLowerCase(), format);

      const numeSablon = optiuneImagine(corp, "label").templateName;
      const sablon = SABLOANE.find((s) => s.valoare === numeSablon);
      assert.ok(sablon, `sablon necunoscut pentru ${format}: ${String(numeSablon)}`);
      assert.ok(sablon.formate.includes(format), `${String(numeSablon)} nu exista in ${format}`);
    }
  });

  test("⚠ `EPL2` din nomenclatorul lor se scrie `epl` in cerere", () => {
    assert.equal(nod(corpExpediere(config({ format_eticheta: "EPL2" }), comanda()), "outputImageProperties").encodingFormat, "epl");
  });

  test("⚠ un sablon PDF ales si apoi trecut pe imprimanta termica NU pleaca asa", () => {
    /* Comerciantul care si-a schimbat imprimanta n-are de unde sa lege cele doua setari. */
    const corp = corpExpediere(config({ format_eticheta: "ZPL", sablon_eticheta: "ECOM26_A4_001" }), comanda());
    const numeSablon = optiuneImagine(corp, "label").templateName;
    assert.notEqual(numeSablon, "ECOM26_A4_001");
    assert.ok(SABLOANE.find((s) => s.valoare === numeSablon)?.formate.includes("ZPL"));
  });

  /*
   * ⚠⚠ PROBA VECHE DE AICI APARA DEFECTUL — SI E A DOUA OARA IN PROIECT.
   *
   * Scria „borderoul se cere anume, si fara numarul de cont pe el" si cerea ANUME ca
   * `waybillDoc` sa FIE prezent in `imageOptions`, cu `templateName: ARCH_8X4_A4_002`.
   * Adica proba tinea pe loc chiar asezarea care rupea potrivirea etichetei: cerute
   * amandoua, DHL intoarce doua intrari in `documents[]` etichetate AMANDOUA `typeCode:
   * label` (exemplul lor oficial `domesticDocShipmentResponse`), iar `client.ts` ia prima
   * intrare de tip `label` — deci pe colet putea ajunge borderoul de ARHIVA, la un curier
   * fara reimprimare de eticheta si fara anulare de expediere. Pe deasupra,
   * `documentTransport = dupaTip("waybilldoc")` iesea nul la fiecare emitere, fiindca in
   * raspuns borderoul nu poarta tipul acela.
   *
   * Prima oara s-a intamplat la `LabelSpecification`, la UPS: o proba scrisa dupa cod, nu
   * dupa regula, care apoi apara codul gresit. Probele de mai jos apara REGULA — un singur
   * `label`, niciun `waybillDoc` — deci precoditia declarata in `client.ts` redevine
   * adevarata si nu se mai poate pierde tacut.
   */
  test("⚠ se cere EXACT o eticheta, si NICIUN `waybillDoc`", () => {
    for (const format of ["PDF", "ZPL", "LP2", "EPL2"] as FormatEticheta[]) {
      const corp = corpExpediere(config({ format_eticheta: format }), comanda());
      assert.deepEqual(optiuniImagine(corp).map((o) => o.typeCode), ["label"], format);
      assert.deepEqual(optiuneImagine(corp, "waybillDoc"), {}, format);
    }
  });

  test("⚠ nici pe expedierile vamale, unde se mai cere si factura", () => {
    /* Doua hartii, si amandoua se pot deosebi in raspunsul lor: `invoice` chiar vine cu
       typeCode-ul lui (`dutiableShipmentResponse`), spre deosebire de borderou. */
    const tipuri = optiuniImagine(corpExpediere(config(), catreUS())).map((o) => o.typeCode);
    assert.deepEqual(tipuri, ["label", "invoice"]);
  });

  test("⚠ cuvantul `waybill` nu apare in NICIUNA dintre cererile pe care le poate produce fisierul", () => {
    for (const { nume, corp } of toateCererile()) {
      assert.equal(JSON.stringify(corp).toLowerCase().includes("waybill"), false, nume);
    }
  });

  test("⚠ factura comerciala se cere DOAR la vamale, si in engleza", () => {
    /* Fara ea tiparita si atasata, coletul se opreste in vama. Iar limba e a vamii de la
       DESTINATIE, nu a comerciantului — desi codul romanesc la ei ar fi `rum`. */
    assert.deepEqual(optiuneImagine(corpExpediere(config(), comanda()), "invoice"), {});
    const factura = optiuneImagine(corpExpediere(config(), catreUS()), "invoice");
    assert.equal(factura.isRequested, true);
    assert.equal(factura.invoiceType, "commercial");
    assert.equal(factura.languageCode, "eng");
  });

  test("toate hartiile cerute sunt marcate `isRequested`", () => {
    for (const optiune of optiuniImagine(corpExpediere(config(), catreUS()))) {
      assert.equal(optiune.isRequested, true, String(optiune.typeCode));
    }
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Cele doua cereri au forme DIFERITE pentru aceleasi date, si amandoua sunt
 * `additionalProperties: false`: la `/rates` `shipperDetails` ESTE adresa
 * (`supermodelIoLogisticsExpressAddressRatesRequest`), la `/shipments` o CONTINE, langa
 * `contactInformation`. Nestarea copiata dintr-o parte in cealalta da 422 exact pe drumul
 * care aduce preturile in checkout — adica tarif fix pentru toti cumparatorii, fara niciun
 * semn ca ceva e stricat.
 */
describe("DHL: cele doua cereri au forme diferite pentru aceleasi parti", () => {
  test("⚠ la cotare, `shipperDetails` E adresa — fara contact", () => {
    const parti = nod(corpTarife(config(), comanda()), "customerDetails");
    const expeditor = nod(parti, "shipperDetails");
    assert.equal(expeditor.cityName, "Cluj-Napoca");
    assert.equal(expeditor.countryCode, "RO");
    assert.equal("postalAddress" in expeditor, false);
    assert.equal("contactInformation" in expeditor, false);
  });

  test("⚠ la emitere, `shipperDetails` CONTINE adresa si contactul", () => {
    const expeditor = nod(corpExpediere(config(), comanda()), "customerDetails", "shipperDetails");
    assert.equal(nod(expeditor, "postalAddress").cityName, "Cluj-Napoca");
    assert.equal(nod(expeditor, "contactInformation").phone, "+40721000000");
  });

  test("cotarea cere anume produsele care au nevoie de intelegere comerciala", () => {
    const corp = corpTarife(config(), comanda());
    assert.equal(corp.returnStandardProductsOnly, false);
    assert.equal(corp.productTypeCode, "all");
    /* ⚠ Fara `nextBusinessDay`, o cerere facuta dupa ora lor de inchidere intoarce ZERO
       produse, iar checkout-ul cade pe tarif fix fara sa spuna nimeni de ce. */
    assert.equal(corp.nextBusinessDay, true);
    assert.deepEqual(corp.estimatedDeliveryDate, { isRequested: true, typeCode: "QDDC" });
    assert.deepEqual(corp.getAdditionalInformation, [
      { typeCode: "allValueAddedServices", isRequested: true },
    ]);
  });

  test("⚠ filtrul de produse al comerciantului NU pleaca la ei", () => {
    /* Se aplica pe RASPUNS, in `preturi.ts`. Trimis ca `productsAndServices`, ar ascunde
       produse pe care contul chiar le vinde — greseala intoarsa deja la UPS. */
    const corp = corpTarife(config({ produse_permise: ["N"] }), comanda());
    assert.equal(JSON.stringify(corp).includes("productsAndServices"), false);
    assert.equal("productCode" in corp, false);
  });

  test("valoarea comenzii intra in cotare, fiindca ea trage suprataxele de valoare", () => {
    const corp = corpTarife(config(), comanda({ valoareComanda: 349.9 }));
    assert.deepEqual(corp.monetaryAmount, [
      { typeCode: "declaredValue", value: 349.9, currency: "RON" },
    ]);
  });

  test("⚠ devizul se cere anume pe raspunsul de emitere", () => {
    /* Fara el nu s-ar sti ca expedierea s-a creat CU SUCCES si FARA PRET — avertismentele
       lor `7991` si `7995`, care chiar apar. */
    assert.equal(corpExpediere(config(), comanda()).getRateEstimates, true);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `productCode` e in `required` la emitere, deci lipsa lui e zgomotoasa. Ce e TACUT e
 * codul LOCAL ramas de la o cotare veche: valabil doar pentru produsul din aceeasi oferta,
 * el descrie atunci alt produs, iar DHL raspunde `8035 Product code provided not matching
 * the account's network type code` — un mesaj care nu spune nimic despre ce s-a intamplat.
 */
describe("DHL: produsul si codul lui local se iau impreuna sau deloc", () => {
  test("implicitul intern e `N`, cel extern `P`", () => {
    assert.equal(produsImplicit("RO", "RO"), "N");
    assert.equal(produsImplicit("RO", "DE"), "P");
    assert.equal(corpExpediere(config(), comanda()).productCode, "N");
    assert.equal(corpExpediere(config(), catreDE()).productCode, "P");
  });

  test("produsul ales in cotare bate implicitul, impreuna cu codul lui local", () => {
    const corp = corpExpediere(config(), comanda({ productCode: "U", localProductCode: "ECX" }));
    assert.equal(corp.productCode, "U");
    assert.equal(corp.localProductCode, "ECX");
  });

  test("⚠ codul local ramas singur NU pleaca — ar descrie alt produs", () => {
    const corp = corpExpediere(config(), comanda({ productCode: null, localProductCode: "ECX" }));
    assert.equal(corp.productCode, "N");
    assert.equal("localProductCode" in corp, false);
  });
});

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `plannedShippingDateAndTime` are un format care nu e ISO 8601 si pe care documentatia
 * lor se contrazice de cinci ori; arbitrul e `maxLength: 29`, adica forma CU spatiu
 * inainte de `GMT`. Iar offsetul e al Romaniei si se CALCULEAZA: scris fix in cod ar fi
 * gresit sapte luni pe an, fara nicio eroare — doar cu alt set de produse si alta data
 * estimata de livrare. Si o data in trecut cade cu `998 The shipment date cannot be in the
 * past or more than 10 days in future.`
 */
describe("DHL: momentul expedierii", () => {
  test("⚠ formatul exact, si cele 29 de caractere care l-au transat", () => {
    const moment = corpTarife(config(), comanda({ dataExpedierii: new Date("2035-06-15T09:00:00Z") }))
      .plannedShippingDateAndTime as string;
    assert.match(moment, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} GMT[+-]\d{2}:\d{2}$/);
    assert.equal(moment.length, 29);
  });

  test("⚠ offsetul se calculeaza: vara GMT+03:00, iarna GMT+02:00", () => {
    const vara = corpExpediere(config(), comanda({ dataExpedierii: new Date("2035-06-15T09:00:00Z") }))
      .plannedShippingDateAndTime as string;
    const iarna = corpExpediere(config(), comanda({ dataExpedierii: new Date("2035-01-15T09:00:00Z") }))
      .plannedShippingDateAndTime as string;
    assert.ok(vara.endsWith("GMT+03:00"), vara);
    assert.ok(iarna.endsWith("GMT+02:00"), iarna);
    /* Aceeasi ora UTC, doua ore locale diferite. */
    assert.ok(vara.includes("T12:00:00"), vara);
    assert.ok(iarna.includes("T11:00:00"), iarna);
  });

  test("⚠ o data din trecut e impinsa inainte, nu trimisa ca atare", () => {
    const moment = corpExpediere(config(), comanda({ dataExpedierii: new Date("2020-01-01T10:00:00Z") }))
      .plannedShippingDateAndTime as string;
    assert.equal(moment.startsWith("2020"), false);
    assert.ok(moment >= new Date().toISOString().slice(0, 4));
  });

  test("aceeasi data ajunge si pe factura vamala, ca zi calendaristica", () => {
    /* „please enter accurate date when the invoice was issued at as that is what drives
       the exchange rate calculation during customs clearance". */
    const corp = corpExpediere(config(), catreUS({ dataExpedierii: new Date("2035-06-15T09:00:00Z") }));
    assert.equal(nod(corp, "content", "exportDeclaration", "invoice").date, "2035-06-15");
  });
});
