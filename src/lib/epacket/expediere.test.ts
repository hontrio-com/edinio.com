import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import type { EpacketConfig } from "./client";
import {
  coleteEgale, corpAwbEpacket, despartaNumele, lipsuriExpediereEpacket, optiuniAwbEpacket, referintaEpacket,
  telefonEpacket, type DateExpediereEpacket,
} from "./expediere";

const CONFIG: EpacketConfig = {
  enabled: true,
  api_key: "epk_live_x",
  expeditor: {
    prenume: "Magazin", nume: "Proba", firma: "Edinio Test SRL", telefon: "0712 345 678", email: "comenzi@magazin.ro",
    localitate_id: 14515, localitate_nume: "Sectorul 1 (Bucuresti)", cod_postal: "010011", strada: "Strada Exemplu", numar: "5",
  },
  ramburs: { titular: "Ion Popescu", iban: "ro49 aaaa 1b31 0075 9384 0000", banca: "Banca Transilvania" },
  continut_implicit: "Produse",
};

const DATE: DateExpediereEpacket = {
  curier: "DPD",
  tip: "D2D",
  destinatar: {
    prenume: "Ana", nume: "Ionescu", telefon: "+40 722-333-444", email: "ana@example.ro",
    localitateId: 109, codPostal: "400001", strada: "Strada Mare", numar: "12", bloc: "A2", apartament: "7",
  },
  tipColet: "parcel",
  colete: [{ greutate: 2, lungime: 30, latime: 20, inaltime: 10 }],
  continut: "Haine",
  referinta: "EDN-ABCD-1042",
};

/* ─── Contractul: specificatia LOR, salvata in depozit ────────────────────── */

const SPEC = JSON.parse(readFileSync(new URL("../../../docs/curieri/EPACKET-openapi.json", import.meta.url), "utf8"));
const SCHEME = SPEC.components.schemas;

/** Verifica un obiect pe o schema „object" a lor: chei cunoscute, obligatorii prezente, tipuri. */
function peSchema(obiect: Record<string, unknown>, schema: Record<string, unknown>, cale: string): void {
  const props = schema.properties as Record<string, { type?: string | string[]; enum?: unknown[]; $ref?: string; items?: { $ref?: string } }>;
  for (const cheie of Object.keys(obiect)) {
    assert.ok(Object.hasOwn(props, cheie), `${cale}.${cheie} nu exista in specificatie (ei refuza campurile necunoscute)`);
  }
  for (const cheie of (schema.required as string[] | undefined) ?? []) {
    assert.ok(cheie in obiect, `${cale}.${cheie} e obligatoriu in specificatie`);
  }
  for (const [cheie, v] of Object.entries(obiect)) {
    const p = props[cheie];
    if (p.enum) assert.ok(p.enum.includes(v), `${cale}.${cheie}=${String(v)} nu e in ${JSON.stringify(p.enum)}`);
    const tip = Array.isArray(p.type) ? p.type : p.type ? [p.type] : [];
    if (tip.includes("integer")) assert.ok(Number.isInteger(v), `${cale}.${cheie} trebuie intreg`);
    else if (tip.includes("number")) assert.equal(typeof v, "number", `${cale}.${cheie} trebuie numar`);
    else if (tip.includes("string")) assert.equal(typeof v, "string", `${cale}.${cheie} trebuie text`);
    else if (tip.includes("boolean")) assert.equal(typeof v, "boolean", `${cale}.${cheie} trebuie boolean`);
  }
}

function verificaContractul(corp: Record<string, unknown>): void {
  peSchema(corp, SCHEME.AwbRequest, "awb");
  peSchema(corp.sender as Record<string, unknown>, SCHEME.Side, "sender");
  peSchema(corp.recipient as Record<string, unknown>, SCHEME.Side, "recipient");
  for (const [i, c] of (corp.parcels as Record<string, unknown>[]).entries()) peSchema(c, SCHEME.Parcel, `parcels[${i}]`);
  if (corp.cash_on_delivery) peSchema(corp.cash_on_delivery as Record<string, unknown>, SCHEME.AwbRequest.properties.cash_on_delivery, "cash_on_delivery");
}

describe("contractul cu specificatia lor", () => {
  test("la adresa, cu ramburs, asigurare si deschidere: fiecare camp exista la ei", () => {
    verificaContractul(corpAwbEpacket(CONFIG, { ...DATE, ramburs: 150, asigurare: 300, deschidere: true }));
  });

  test("la punct si cu plic: la fel", () => {
    verificaContractul(corpAwbEpacket(CONFIG, { ...DATE, curier: "SDY", tip: "D2L", punctId: "79" }));
    verificaContractul(corpAwbEpacket(CONFIG, { ...DATE, tipColet: "envelope", colete: [{ greutate: 0.3 }] }));
  });

  test("specificatia salvata e chiar cea citita (amprenta), ca proba sa nu verifice altceva", async () => {
    const { createHash } = await import("node:crypto");
    const octeti = readFileSync(new URL("../../../docs/curieri/EPACKET-openapi.json", import.meta.url));
    assert.equal(createHash("sha256").update(octeti).digest("hex"), "7f1c3cc0ded5a20f0eabe934637e2a315ff1746ecd443cf75353abbe0a5992db");
  });
});

describe("corpul cererii", () => {
  test("adresa, cu forma lor", () => {
    const c = corpAwbEpacket(CONFIG, DATE);
    assert.deepEqual(c.recipient, {
      first_name: "Ana", last_name: "Ionescu", phone: "0722333444", email: "ana@example.ro",
      locality_id: 109, postcode: "400001", street: "Strada Mare", number: "12", block: "A2", apartment: "7",
    });
    assert.equal((c.sender as Record<string, unknown>).company, "Edinio Test SRL");
    assert.equal((c.sender as Record<string, unknown>).phone, "0712345678");
    assert.deepEqual(c.parcels, [{ weight: 2, length: 30, width: 20, height: 10 }]);
    assert.equal(c.reference, "EDN-ABCD-1042");
    assert.equal("cash_on_delivery" in c, false);
  });

  test("⚠⚠ la punct pleaca DOAR `locker_id`: cu localitatea sau strada langa el, ei refuza", () => {
    const c = corpAwbEpacket(CONFIG, { ...DATE, curier: "SDY", tip: "D2L", punctId: " 79 " });
    assert.deepEqual(c.recipient, {
      first_name: "Ana", last_name: "Ionescu", phone: "0722333444", email: "ana@example.ro", locker_id: "79",
    });
  });

  test("⚠⚠ tot textul in ASCII: in adresa, Sameday STERGE literele cu diacritice („Mărășești” -> „Mreti”)", () => {
    const c = corpAwbEpacket(CONFIG, {
      ...DATE,
      destinatar: { ...DATE.destinatar, prenume: "Ștefan", nume: "Țăranu", strada: "Strada Mărășești", bloc: "Ș2" },
      continut: "Încălțăminte și țesături",
    });
    const r = c.recipient as Record<string, unknown>;
    assert.equal(r.street, "Strada Marasesti");
    assert.equal(r.block, "S2");
    assert.equal(r.first_name, "Stefan");
    assert.equal(r.last_name, "Taranu");
    assert.equal(c.contents, "Incaltaminte si tesaturi");
  });

  test("rambursul: contul curat, titularul fara diacritice, IBAN fara spatii", () => {
    const c = corpAwbEpacket({ ...CONFIG, ramburs: { titular: "Ion Popescu Ștefan", iban: "ro49 aaaa 1b31 0075 9384 0000", banca: "BT" } }, { ...DATE, ramburs: 123.456 });
    assert.deepEqual(c.cash_on_delivery, { amount: 123.46, account_holder: "Ion Popescu Stefan", iban: "RO49AAAA1B31007593840000", bank_name: "BT" });
  });

  test("plicul pleaca doar cu greutatea", () => {
    const c = corpAwbEpacket(CONFIG, { ...DATE, tipColet: "envelope", colete: [{ greutate: 0.3, lungime: 30, latime: 20, inaltime: 1 }] });
    assert.deepEqual(c.parcels, [{ weight: 0.3 }]);
    assert.equal(c.package_type, "envelope");
  });

  test("continutul se taie la 50 (limita lor), iar lipsa lui cade pe cel implicit", () => {
    const lung = "Tricou bumbac organic marimea L, culoare neagra, set de doua bucati";
    assert.ok((corpAwbEpacket(CONFIG, { ...DATE, continut: lung }).contents as string).length <= 50);
    assert.equal(corpAwbEpacket(CONFIG, { ...DATE, continut: "" }).contents, "Produse");
  });

  test("campurile goale NU pleaca (ei le refuza ca obligatorii lipsa)", () => {
    const c = corpAwbEpacket(CONFIG, { ...DATE, destinatar: { ...DATE.destinatar, bloc: "", apartament: "  ", firma: "" } });
    const r = c.recipient as Record<string, unknown>;
    assert.equal("block" in r, false);
    assert.equal("apartment" in r, false);
    assert.equal("company" in r, false);
  });
});

describe("lipsurile", () => {
  test("o comanda buna nu are lipsuri", () => {
    assert.deepEqual(lipsuriExpediereEpacket(CONFIG, DATE), []);
  });

  test("numele dupa regula lor: 3-25 caractere, cu o litera", () => {
    const l = lipsuriExpediereEpacket(CONFIG, { ...DATE, destinatar: { ...DATE.destinatar, nume: "Li" } });
    assert.ok(l.some((x) => x.includes("numele destinatarului")), l.join("; "));
  });

  test("adresa: localitate, cod postal de 6 cifre, strada si numar", () => {
    const l = lipsuriExpediereEpacket(CONFIG, {
      ...DATE, destinatar: { ...DATE.destinatar, localitateId: null, codPostal: "40000", strada: "", numar: "" },
    });
    for (const x of ["localitatea", "codul postal", "strada", "numarul"]) assert.ok(l.some((y) => y.includes(x)), x);
  });

  test("telefonul strain si emailul lipsa", () => {
    const l = lipsuriExpediereEpacket(CONFIG, { ...DATE, destinatar: { ...DATE.destinatar, telefon: "+359888123456", email: "" } });
    assert.ok(l.some((x) => x.includes("telefon")));
    assert.ok(l.some((x) => x.includes("emailul")));
  });

  test("⚠ cheia de TEST: doar DPD si Sameday", () => {
    const test = { ...CONFIG, api_key: "epk_test_x" };
    assert.deepEqual(lipsuriExpediereEpacket(test, DATE), []);
    assert.ok(lipsuriExpediereEpacket(test, { ...DATE, curier: "CGS" }).some((x) => x.includes("cheie de TEST")));
  });

  test("punctul: un singur colet, fara deschidere, si curierul trebuie sa aiba puncte", () => {
    const l = lipsuriExpediereEpacket(CONFIG, {
      ...DATE, curier: "TCE", tip: "D2L", punctId: "", deschidere: true, colete: coleteEgale(4, 2, { lungime: 10, latime: 10, inaltime: 10 }),
    });
    for (const x of ["puncte de ridicare", "punctul", "un singur colet", "deschiderea"]) assert.ok(l.some((y) => y.includes(x)), x);
  });

  test("limitele curierului: DPD 31,5 kg si 10 colete; plicul 0,5 kg", () => {
    assert.ok(lipsuriExpediereEpacket(CONFIG, { ...DATE, colete: [{ greutate: 32, lungime: 30, latime: 20, inaltime: 10 }] })
      .some((x) => x.includes("31,5")));
    assert.ok(lipsuriExpediereEpacket(CONFIG, { ...DATE, colete: coleteEgale(11, 11, { lungime: 10, latime: 10, inaltime: 10 }) })
      .some((x) => x.includes("10 colete")));
    assert.ok(lipsuriExpediereEpacket(CONFIG, { ...DATE, tipColet: "envelope", colete: [{ greutate: 0.6 }] })
      .some((x) => x.includes("plic")));
  });

  test("⚠ coletul fara dimensiuni e refuzat de ei (422 masurat), deci se cere aici", () => {
    const l = lipsuriExpediereEpacket(CONFIG, { ...DATE, colete: [{ greutate: 2 }] });
    assert.ok(l.some((x) => x.includes("dimensiunile")));
  });

  test("⚠ deschiderea la DPD cere ramburs: cotarea o accepta, emiterea NU", () => {
    assert.ok(lipsuriExpediereEpacket(CONFIG, { ...DATE, deschidere: true }).some((x) => x.includes("ramburs")));
    assert.deepEqual(lipsuriExpediereEpacket(CONFIG, { ...DATE, deschidere: true, ramburs: 100 }), []);
  });

  test("rambursul cere contul intreg din configurare", () => {
    const l = lipsuriExpediereEpacket({ ...CONFIG, ramburs: { titular: "", iban: "RO00", banca: "" } }, { ...DATE, ramburs: 100 });
    for (const x of ["titularul", "IBAN", "banca"]) assert.ok(l.some((y) => y.includes(x)), x);
  });
});

describe("ajutoarele", () => {
  test("numele se desparte dupa regula lor, in ordinea scrisa", () => {
    assert.deepEqual(despartaNumele("Ion Popescu"), { prenume: "Ion", nume: "Popescu" });
    assert.deepEqual(despartaNumele("Ana Maria Popescu"), { prenume: "Ana", nume: "Maria Popescu" });
    /* „Al" are doua litere: taietura merge mai departe, nu inventeaza. */
    assert.deepEqual(despartaNumele("Al Ionescu Mihai"), { prenume: "Al Ionescu", nume: "Mihai" });
    assert.deepEqual(despartaNumele("Li Wu"), { prenume: "Li Wu", nume: "" }, "fara taietura buna, numele ramane de completat");
    assert.deepEqual(despartaNumele("Ștefan Țăranu"), { prenume: "Stefan", nume: "Taranu" });
  });

  test("telefonul: mobil si fix romanesc, strainul nu", () => {
    assert.equal(telefonEpacket("+40 722-333-444"), "0722333444");
    assert.equal(telefonEpacket("0264 123 456"), "0264123456");
    assert.equal(telefonEpacket("+359888123456"), "");
    assert.equal(telefonEpacket("0722"), "");
  });

  test("coletele egale acopera greutatea, rotunjite in SUS", () => {
    const c = coleteEgale(1, 3);
    assert.equal(c.length, 3);
    assert.ok(c.reduce((s, x) => s + x.greutate, 0) >= 1);
  });

  test("referinta poarta magazinul si comanda", () => {
    assert.equal(referintaEpacket("abcd1234-0000-0000-0000-000000000000", "#0042"), "EDN-ABCD-0042");
  });

  test("ce primeste fereastra: FARA cheia API", () => {
    const o = optiuniAwbEpacket(CONFIG);
    assert.equal(JSON.stringify(o).includes("epk_"), false);
    assert.equal(o.rambursGata, true);
    assert.equal(o.curierAdresa, "DPD");
    assert.equal(o.curierPuncte, "SDY");
    assert.deepEqual(o.dimensiuni, { lungime: 30, latime: 20, inaltime: 10 });
    assert.equal(optiuniAwbEpacket({ ...CONFIG, api_key: "epk_test_1" }).test, true);
  });
});
