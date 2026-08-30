import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  coleteDinDate, corpExpediere, corpTarife, lipsuriConfigurare, lipsuriExpediere,
  livreazaInPunct, numarDinAdresa, VALOARE_DECLARATA, type AdresaComanda, type DateExpediere,
} from "./expediere";
import { continutShipo, localitateShipo, sectorShipo } from "./localitati";
import type { ServiciuShipo, ShipoConfig } from "./client";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Corpul cererii e locul unde greselile costa bani reali: un colet plecat pe alt
 * serviciu decat cel platit, o asigurare facturata degeaba, un sector inventat
 * care plimba coletul prin Bucuresti. Shipo are `POST /shipment/validate`, deci
 * unele ar cadea acolo — dar validarea costa un dus-intors si nu spune nimic
 * despre ce am uitat sa punem in corp.
 */

const CONFIG: ShipoConfig = {
  enabled: true,
  api_key: "cheie",
  sender_address_id: 7,
};

const LA_ADRESA: Pick<ServiciuShipo, "id" | "recipient_address_type" | "sender_address_type"> = {
  id: 10, recipient_address_type: "address", sender_address_type: "address",
};
const LA_LOCKER: Pick<ServiciuShipo, "id" | "recipient_address_type" | "sender_address_type"> = {
  id: 42, recipient_address_type: "locker", sender_address_type: "address",
};

const DESTINATAR: AdresaComanda = {
  nume: "Maria Ionescu",
  strada: "Strada Florilor",
  numar: "25",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  telefon: "0723456789",
  email: "maria@exemplu.ro",
};

const DATE: DateExpediere = {
  destinatar: DESTINATAR,
  greutateKg: 2,
  felLivrare: "domiciliu",
};

describe("Bucurestiul: oras pliat, sector separat", () => {
  test("orasul se pliaza in „Bucuresti”, oricum ar fi scris", () => {
    assert.equal(localitateShipo("Sector 3", "Bucuresti"), "Bucuresti");
    assert.equal(localitateShipo("București", "Municipiul București"), "Bucuresti");
    assert.equal(localitateShipo("bucuresti sector 5"), "Bucuresti");
  });

  test("sectorul pleaca in campul lui, nu in numele orasului", () => {
    const corp = corpExpediere(CONFIG, {
      ...DATE,
      destinatar: { ...DESTINATAR, oras: "Bucuresti, Sector 3", judet: "Bucuresti" },
    }, LA_ADRESA);
    assert.equal(corp.oras_sosire, "Bucuresti");
    assert.equal(corp.recipient_address_sector, 3);
  });

  test("⚠ in afara Bucurestiului campul LIPSESTE, nu e zero", () => {
    // La SmartShip campul cere `0` in restul tarii. Aici e „Conditionat", deci un
    // zero trimis degeaba ar putea cadea la validarea lor („intre 1 si 6") —
    // pentru fiecare comanda din tara.
    const corp = corpExpediere(CONFIG, DATE, LA_ADRESA);
    assert.ok(!("recipient_address_sector" in corp));
    assert.equal(sectorShipo("Cluj-Napoca", "Cluj"), undefined);
  });

  test("Bucuresti fara sector recunoscut OPRESTE expedierea, nu ghiceste", () => {
    const fara = { ...DESTINATAR, oras: "Bucuresti", judet: "Bucuresti" };
    assert.equal(sectorShipo(fara.oras, fara.judet, fara.strada), null);
    const lipsuri = lipsuriExpediere({ ...DATE, destinatar: fara }, LA_ADRESA);
    assert.ok(lipsuri.some((l) => l.includes("sector")), lipsuri.join(", "));
  });

  test("sectorul se gaseste si cand e scris in strada", () => {
    const d = { ...DESTINATAR, oras: "Bucuresti", judet: "Bucuresti", strada: "Calea Victoriei, sector 1" };
    assert.equal(sectorShipo(d.oras, d.judet, `${d.strada} ${d.numar}`), 1);
  });
});

describe("continutul de pe AWB", () => {
  test("se curata de diacritice si semne, si se taie la 40", () => {
    // „max. 40 car., alfanumeric" e cerinta LOR. Un titlu romanesc obisnuit are
    // diacritice, virgule si paranteze — trimis asa, cade la validare.
    assert.equal(continutShipo("Prosop hotel 500 GSM, 50×90 cm (alb)"), "Prosop hotel 500 GSM 50 90 cm alb");
    assert.equal(continutShipo("x".repeat(80)).length, 40);
  });

  test("nu ramane niciodata gol", () => {
    assert.equal(continutShipo(""), "Colet");
    assert.equal(continutShipo("###"), "Colet");
    assert.equal(continutShipo(null, "Marfa"), "Marfa");
  });
});

describe("coletele", () => {
  test("greutatea se imparte pe colete si se rotunjeste IN SUS", () => {
    // Suma bucatilor trebuie sa acopere totalul, altfel curierul recantareste si
    // factureaza diferenta comerciantului.
    const colete = coleteDinDate({ ...DATE, greutateKg: 2.5, numarColete: 3 }, CONFIG);
    assert.equal(colete.length, 3);
    const suma = colete.reduce((s, c) => s + c.weight, 0);
    assert.ok(suma >= 2.5, `suma ${suma} sub greutatea ceruta`);
  });

  test("greutatea zero devine minimul, nu zero", () => {
    const [c] = coleteDinDate({ ...DATE, greutateKg: 0 }, CONFIG);
    assert.ok(c.weight > 0);
  });

  test("dimensiunile din configurare bat implicitul", () => {
    const [c] = coleteDinDate(DATE, { ...CONFIG, lungime_cm: 50, latime_cm: 40, inaltime_cm: 30 });
    assert.deepEqual([c.length, c.width, c.height], [50, 40, 30]);
  });

  test("coletele date explicit au prioritate", () => {
    const colete = coleteDinDate(
      { ...DATE, colete: [{ length: 11, width: 12, height: 13, weight: 4 }] }, CONFIG,
    );
    assert.deepEqual(colete, [{ length: 11, width: 12, height: 13, weight: 4 }]);
  });
});

describe("cotarea", () => {
  test("⚠ `sender_city` e ID-UL ADRESEI, iar `delivery_city` e un NUME", () => {
    // Asimetria e a lor, si e cea mai usoara greseala de facut din tot API-ul.
    const corp = corpTarife(CONFIG, DATE);
    assert.equal(corp.sender_city, 7);
    assert.equal(corp.delivery_city, "Cluj-Napoca");
  });

  test("filtrul de curieri se trimite doar cand exista", () => {
    assert.ok(!("courier" in corpTarife(CONFIG, DATE)));
    const cu = corpTarife({ ...CONFIG, curieri_permisi: ["FanCourier", " dpd "] }, DATE);
    assert.deepEqual(cu.courier, ["fancourier", "dpd"]);
  });
});

describe("emiterea la adresa", () => {
  const corp = corpExpediere(CONFIG, { ...DATE, ramburs: 250 }, LA_ADRESA);

  test("poarta serviciul ales, nu curierul", () => {
    assert.equal(corp.rate_id, 10);
  });

  test("adresa pleaca pe campuri individuale", () => {
    // `recipient_address_id` pentru adrese salvate NU se poate folosi: adresele de
    // destinatar nu sunt expuse prin API-ul lor.
    assert.equal(corp.strada_sosire, "Strada Florilor");
    assert.equal(corp.recipient_address_street_no, "25");
    assert.ok(!("recipient_address_id" in corp));
  });

  test("telefonul se normalizeaza", () => {
    assert.equal(typeof corp.recipient_phone, "string");
    assert.ok(String(corp.recipient_phone).length > 0);
  });

  test("rambursul pleaca doar cand exista", () => {
    assert.equal(corp.cod, 250);
    assert.ok(!("cod" in corpExpediere(CONFIG, DATE, LA_ADRESA)));
  });

  test("codul postal se trimite DOAR cu exact 6 cifre", () => {
    const scurt = corpExpediere(CONFIG, { ...DATE, destinatar: { ...DESTINATAR, codPostal: "40012" } }, LA_ADRESA);
    assert.ok(!("recipient_address_postal_code" in scurt));
    const bun = corpExpediere(CONFIG, { ...DATE, destinatar: { ...DESTINATAR, codPostal: "400 123" } }, LA_ADRESA);
    assert.equal(bun.recipient_address_postal_code, "400123");
  });
});

describe("emiterea in locker", () => {
  test("⚠ punctul pleaca in `recipient_address_id`, si FARA campuri de adresa", () => {
    const corp = corpExpediere(CONFIG, { ...DATE, felLivrare: "locker", punctId: 1234 }, LA_LOCKER);
    assert.equal(corp.recipient_address_id, 1234);
    for (const camp of ["oras_sosire", "strada_sosire", "recipient_address_street_no", "recipient_address_sector"]) {
      assert.ok(!(camp in corp), `${camp} n-are ce cauta la un locker`);
    }
  });

  test("emailul e obligatoriu: acolo se trimite codul de ridicare", () => {
    const fara = { ...DESTINATAR, email: "" };
    const lipsuri = lipsuriExpediere(
      { ...DATE, destinatar: fara, felLivrare: "locker", punctId: 1234 }, LA_LOCKER,
    );
    assert.ok(lipsuri.some((l) => l.includes("email")), lipsuri.join(", "));
  });

  test("fara punct ales, expedierea se opreste", () => {
    const lipsuri = lipsuriExpediere({ ...DATE, felLivrare: "locker" }, LA_LOCKER);
    assert.ok(lipsuri.some((l) => l.includes("punctul")), lipsuri.join(", "));
  });

  test("`livreazaInPunct` prinde si PUDO, nu doar locker", () => {
    assert.equal(livreazaInPunct({ recipient_address_type: "pudo" }), true);
    assert.equal(livreazaInPunct({ recipient_address_type: "address" }), false);
  });
});

describe("serviciile care costa: booleene adevarate, si numai cand sunt aprinse", () => {
  test("stinse, campurile LIPSESC din corp", () => {
    // Pana la 23.07.2026 ei citeau „false" ca ADEVARAT si facturau asigurare si
    // deschidere la livrare nedorite. Acum resping orice nu e boolean sau „0"/„1".
    const corp = corpExpediere(CONFIG, { ...DATE, ramburs: 100 }, LA_ADRESA);
    for (const camp of ["insurance", "declared_value", "open_on_delivery", "notify_recipient", "quick_cod"]) {
      assert.ok(!(camp in corp), `${camp} nu trebuie trimis cand e stins`);
    }
  });

  test("aprinse, pleaca drept BOOLEENE, nu siruri", () => {
    const corp = corpExpediere(
      { ...CONFIG, deschidere_la_livrare: true, notifica_destinatarul: true, ramburs_turbo: true, asigura_coletul: true },
      { ...DATE, ramburs: 100, valoareDeclarata: 300 },
      LA_ADRESA,
    );
    assert.equal(corp.open_on_delivery, true);
    assert.equal(corp.notify_recipient, true);
    assert.equal(corp.quick_cod, true);
    assert.equal(corp.insurance, true);
    assert.equal(corp.declared_value, 300);
  });

  test("rambursul turbo NU pleaca fara ramburs", () => {
    // „Se aplica doar daca expedierea are cod > 0" — al lor, cuvant cu cuvant.
    const corp = corpExpediere({ ...CONFIG, ramburs_turbo: true }, DATE, LA_ADRESA);
    assert.ok(!("quick_cod" in corp));
  });

  test("valoarea declarata se plafoneaza la maximul LOR", () => {
    const corp = corpExpediere(
      { ...CONFIG, asigura_coletul: true }, { ...DATE, valoareDeclarata: 8000 }, LA_ADRESA,
    );
    assert.equal(corp.declared_value, VALOARE_DECLARATA.max);
  });

  test("⚠ sub 1 leu, asigurarea NU se aprinde deloc", () => {
    // `declared_value` e „Obligatoriu daca insurance=true. Intre 1 si 5000".
    // Un `insurance: true` fara valoare valida ar face cererea sa cada la validare.
    const corp = corpExpediere(
      { ...CONFIG, asigura_coletul: true }, { ...DATE, valoareDeclarata: 0 }, LA_ADRESA,
    );
    assert.ok(!("insurance" in corp));
    assert.ok(!("declared_value" in corp));
  });
});

describe("lipsurile: vina magazinului contra vina datelor", () => {
  test("configurarea incompleta se numeste pe fata", () => {
    assert.deepEqual(lipsuriConfigurare(null), ["integrarea Shipo nu e pornita", "cheia de API", "adresa de ridicare"]);
    assert.deepEqual(lipsuriConfigurare({ ...CONFIG, sender_address_id: 0 }), ["adresa de ridicare"]);
    assert.deepEqual(lipsuriConfigurare(CONFIG), []);
  });

  test("o comanda intreaga nu are lipsuri", () => {
    assert.deepEqual(lipsuriExpediere(DATE, LA_ADRESA), []);
  });

  test("datele lipsa ale clientului sunt separate de cele ale magazinului", () => {
    const lipsuri = lipsuriExpediere(
      { ...DATE, destinatar: { ...DESTINATAR, nume: "", telefon: "" } }, LA_ADRESA,
    );
    assert.ok(lipsuri.some((l) => l.includes("numele")));
    assert.ok(lipsuri.some((l) => l.includes("telefonul")));
  });
});

/*
 * ═══ REPARATII GASITE LA A DOUA TRECERE ═══
 *
 * Fiecare proba de mai jos apara un defect care a EXISTAT in prima scriere si
 * care n-a fost prins nici de tsc, nici de build, nici de celelalte 74 de probe.
 */
describe("numarul de la adresa se scoate din text", () => {
  test("⚠ platforma NU scrie niciodata `street_no` — emiterea la domiciliu ar fi cazut la TOATE comenzile", () => {
    // Checkout-ul are UN SINGUR camp de adresa, iar `shipping_address` scrie doar
    // `address`. Cerut ca un camp de sine statator, `numar` ar fi fost mereu gol.
    const d = { ...DESTINATAR, numar: null, strada: "Strada Florilor nr. 25" };
    assert.deepEqual(lipsuriExpediere({ ...DATE, destinatar: d }, LA_ADRESA), []);
    const corp = corpExpediere(CONFIG, { ...DATE, destinatar: d }, LA_ADRESA);
    assert.equal(corp.recipient_address_street_no, "25");
  });

  test("gaseste numarul in formele scrise de oameni", () => {
    assert.equal(numarDinAdresa("Calea Victoriei, Nr 25A"), "25A");
    assert.equal(numarDinAdresa("Bd. Unirii 12, bl. A2"), "12");
    assert.equal(numarDinAdresa("Str. Lunga 3/B"), "3/B");
  });

  test("campul explicit bate textul", () => {
    assert.equal(numarDinAdresa("Strada Florilor nr. 25", "30"), "30");
  });

  test("o adresa chiar fara numar OPRESTE emiterea — nu se inventeaza unul", () => {
    assert.equal(numarDinAdresa("Strada Florilor"), "");
    const lipsuri = lipsuriExpediere(
      { ...DATE, destinatar: { ...DESTINATAR, numar: null, strada: "Strada Florilor" } }, LA_ADRESA,
    );
    assert.ok(lipsuri.some((l) => l.includes("numarul")), lipsuri.join(", "));
  });
});
