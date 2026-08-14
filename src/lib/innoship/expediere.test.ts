import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adresaInnoship,
  adresaPeRand,
  avertismenteExpediere,
  baniInnoship,
  corpComanda,
  greutateInnoship,
  lipsuriExpediere,
  numeInnoship,
  serviciulPentru,
  GREUTATE_MINIMA_KG,
  LUNGIMI,
  type AdresaComanda,
  type DateExpediere,
} from "./expediere";
import { SERVICIU, type InnoshipConfig } from "./client";

/*
 * Innoship ARE endpointuri de proba (`/validate`, `/simulate`) si credentiale de
 * test — deci, spre deosebire de Posta Romana, probele astea nu mai sunt ultima
 * linie de aparare. Raman insa cea mai ieftina verificare, si singura care apara
 * regulile pe care le-am transcris din articolul lor „Order".
 */

const CONFIG: Partial<InnoshipConfig> = {
  external_client_location: "DEPOZIT-1",
};

const DESTINATAR: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Bulevardul Eroilor",
  numar: "12",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  codPostal: "400129",
  telefon: "+40 712 345 678",
  email: "ion@exemplu.ro",
};

function date(peste: Partial<DateExpediere> = {}): DateExpediere {
  return {
    destinatar: DESTINATAR,
    greutateKg: 2.4,
    felLivrare: "domiciliu",
    ziuaExpedierii: "2026-09-03",
    ...peste,
  };
}

// ─── Serviciul ────────────────────────────────────────────────────────────────

test("serviciul se alege dupa felul livrarii, cu implicitele din tabelul lor", () => {
  assert.equal(serviciulPentru("domiciliu"), SERVICIU.domiciliu);
  assert.equal(serviciulPentru("locker"), SERVICIU.locker);
  assert.equal(serviciulPentru("pudo"), SERVICIU.pudo);
});

test("configurarea poate suprascrie serviciul", () => {
  assert.equal(serviciulPentru("locker", { serviciu_locker: 53 }), 53);
});

test("⚠ serviciul ajunge in corp dupa felul livrarii, nu dupa noroc", () => {
  /* 1 = domiciliu, 3 = locker. Gresit, coletul pleaca spre casa cuiva care a ales
     un locker — nu e alt pret, e alt TIP de livrare. */
  assert.equal(corpComanda(date(), CONFIG).serviceId, SERVICIU.domiciliu);
  assert.equal(
    corpComanda(date({ felLivrare: "locker", fixedLocationId: "L1" }), CONFIG).serviceId,
    SERVICIU.locker,
  );
});

// ─── Adresa ───────────────────────────────────────────────────────────────────

test("adresa se compune pe un rand, in ordinea in care o citeste curierul", () => {
  const a = adresaPeRand({ ...DESTINATAR, bloc: "A1", scara: "B", etaj: "3", apartament: "23" });
  assert.equal(a, "Bulevardul Eroilor, nr. 12, bl. A1, sc. B, et. 3, ap. 23");
});

test("numele e firma daca exista, iar contactul ramane omul", () => {
  const a = adresaInnoship({ ...DESTINATAR, companie: "SC Exemplu SRL" }, "domiciliu");
  assert.equal(a.name, "SC Exemplu SRL");
  assert.equal(a.contactPerson, "Ion Popescu");
  assert.equal(numeInnoship({ ...DESTINATAR, companie: "SC Exemplu SRL" }), "SC Exemplu SRL");
});

test("telefonul pleaca normalizat", () => {
  assert.equal(adresaInnoship(DESTINATAR, "domiciliu").phone, "0712345678");
});

test("judetul Bucurestiului pleaca fara „Municipiul”", () => {
  const a = adresaInnoship({ ...DESTINATAR, judet: "Municipiul Bucuresti" }, "domiciliu");
  assert.equal(a.countyName, "Bucuresti");
});

test("se trimit SI judetul SI codul postal cand le avem", () => {
  /* Regula lor cere unul dintre ele; le trimitem pe amandoua fiindca judetul
     dezambiguizeaza localitatile care se repeta, iar codul postal alege depozitul. */
  const a = adresaInnoship(DESTINATAR, "domiciliu");
  assert.equal(a.countyName, "Cluj");
  assert.equal(a.postalCode, "400129");
  assert.equal(a.localityName, "Cluj-Napoca");
});

test("⚠ la locker NU pleaca adresa de acasa, ci punctul", () => {
  const a = adresaInnoship(DESTINATAR, "locker", "LOCKER-77");
  assert.equal(a.fixedLocationId, "LOCKER-77");
  assert.ok(!("addressText" in a), "adresa nu are ce cauta acolo");
  assert.ok(!("localityName" in a));
  assert.ok(!("countyName" in a));
  /* Dar contactul da: curierul tot trebuie sa poata anunta omul. */
  assert.equal(a.name, "Ion Popescu");
  assert.equal(a.phone, "0712345678");
});

test("corpul de locker nu poarta urme de adresa nici dupa compunere", () => {
  const corp = corpComanda(date({ felLivrare: "locker", fixedLocationId: "L1" }), CONFIG);
  assert.ok(!("addressText" in corp.addressTo));
  assert.ok(!("streetName" in corp.addressTo));
  assert.equal(corp.addressTo.fixedLocationId, "L1");
});

// ─── Numere ───────────────────────────────────────────────────────────────────

test("greutatea nu coboara sub minim si are cel mult trei zecimale", () => {
  assert.equal(greutateInnoship(2.4), 2.4);
  assert.equal(greutateInnoship(0), GREUTATE_MINIMA_KG);
  assert.equal(greutateInnoship(null), GREUTATE_MINIMA_KG);
  assert.equal(greutateInnoship(-5), GREUTATE_MINIMA_KG);
  assert.equal(greutateInnoship(1.23456), 1.235);
});

test("banii au doi zecimali, iar valorile fara sens devin zero", () => {
  assert.equal(baniInnoship(19.999), 20);
  assert.equal(baniInnoship(19.994), 19.99);
  assert.equal(baniInnoship(-3), 0);
  assert.equal(baniInnoship("aiurea"), 0);
});

// ─── Ce opreste ───────────────────────────────────────────────────────────────

test("o comanda intreaga nu are nicio lipsa", () => {
  assert.deepEqual(lipsuriExpediere(date(), CONFIG), []);
});

test("fara id-ul depozitului nu se poate emite nimic", () => {
  const l = lipsuriExpediere(date(), {});
  assert.ok(l.some((x) => x.includes("depozitului")), l.join(" | "));
});

test("campurile destinatarului se cer pe nume", () => {
  const l = lipsuriExpediere(
    date({ destinatar: { ...DESTINATAR, nume: "", telefon: null, strada: "" } }),
    CONFIG,
  );
  assert.ok(l.some((x) => x.includes("numele destinatarului")), l.join(" | "));
  assert.ok(l.some((x) => x.includes("telefonul destinatarului")), l.join(" | "));
  assert.ok(l.some((x) => x.includes("strada destinatarului")), l.join(" | "));
});

test("⚠ regula LOR: localitatea are nevoie de judet SAU de cod postal", () => {
  const fara = lipsuriExpediere(
    date({ destinatar: { ...DESTINATAR, judet: null, codPostal: null } }),
    CONFIG,
  );
  assert.ok(fara.some((x) => x.includes("judetul sau codul postal")), fara.join(" | "));

  /* Oricare dintre ele e de ajuns. */
  assert.deepEqual(
    lipsuriExpediere(date({ destinatar: { ...DESTINATAR, codPostal: null } }), CONFIG), [],
  );
  assert.deepEqual(
    lipsuriExpediere(date({ destinatar: { ...DESTINATAR, judet: null } }), CONFIG), [],
  );
});

test("livrarea la locker cere lockerul, si o spune pe nume", () => {
  const l = lipsuriExpediere(date({ felLivrare: "locker" }), CONFIG);
  assert.equal(l.length, 1);
  assert.ok(l[0].includes("lockerul"), l[0]);

  const p = lipsuriExpediere(date({ felLivrare: "pudo" }), CONFIG);
  assert.ok(p[0].includes("punctul de ridicare"), p[0]);
});

test("la locker NU se mai cere adresa de acasa", () => {
  /* Cumparatorul care ridica dintr-un locker nu si-a dat adresa, si nici nu
     trebuie sa si-o dea. Ceruta oricum, fiecare astfel de comanda ar fi refuzata
     de server dupa ce a trecut de formular — capcana platita deja la GLS. */
  const l = lipsuriExpediere(
    date({ felLivrare: "locker", fixedLocationId: "L1", destinatar: { ...DESTINATAR, strada: "", oras: "", judet: null, codPostal: null } }),
    CONFIG,
  );
  assert.deepEqual(l, []);
});

test("un camp obligatoriu prea lung OPRESTE, si spune cat si cat se poate", () => {
  const l = lipsuriExpediere(
    date({ destinatar: { ...DESTINATAR, strada: "A".repeat(LUNGIMI.addressText + 10) } }),
    CONFIG,
  );
  assert.ok(l.some((x) => x.includes(String(LUNGIMI.addressText))), l.join(" | "));
});

test("o zi de expediere ilizibila se opreste local", () => {
  assert.ok(lipsuriExpediere(date({ ziuaExpedierii: "03.09.2026" }), CONFIG).some((x) => x.includes("ziua expedierii")));
});

// ─── Ce doar avertizeaza ──────────────────────────────────────────────────────

test("un email peste plafon se omite, nu opreste coletul", () => {
  const email = "a".repeat(LUNGIMI.email) + "@exemplu.ro";
  const d = date({ destinatar: { ...DESTINATAR, email } });
  assert.deepEqual(lipsuriExpediere(d, CONFIG), []);
  assert.ok(avertismenteExpediere(d).some((x) => x.includes("email")));
  assert.ok(!("email" in corpComanda(d, CONFIG).addressTo));
});

// ─── Corpul ───────────────────────────────────────────────────────────────────

test("corpul poarta campurile obligatorii", () => {
  const corp = corpComanda(date(), CONFIG);
  assert.equal(corp.externalClientLocation, "DEPOZIT-1");
  assert.equal(corp.payment, "Sender");
  assert.equal(corp.content.parcelsCount, 1);
  assert.equal(corp.content.totalWeight, 2.4);
  assert.equal(corp.content.contents, "Produse");
  assert.equal(corp.shipmentDate, "2026-09-03T12:00:00Z");
});

test("⚠ ziua devine miezul zilei UTC, nu miezul noptii", () => {
  /* La 00:00, un fus in urma ar arunca expedierea in ziua precedenta. */
  assert.ok(corpComanda(date(), CONFIG).shipmentDate.includes("T12:00:00Z"));
});

test("⚠ la COTARE curierul lipseste, la EMITERE e pus", () => {
  /* Gol, Innoship raspunde cu ofertele tuturor curierilor contului. E singura
     deosebire dintre corpul de cotare si cel de emitere. */
  assert.ok(!("courierId" in corpComanda(date(), CONFIG)));
  assert.equal(corpComanda(date({ courierId: 3 }), CONFIG).courierId, 3);
});

test("⚠ emiterea e SINCRONA: `async` ramane fals", () => {
  /* Pornit, ne-ar aduce inapoi fereastra oarba de la eColet — expediere creata,
     AWB inca necunoscut — pe care contractul asta ne-o scuteste. */
  assert.equal(corpComanda(date(), CONFIG).parameters?.async, false);
});

test("rambursul si valoarea declarata pleaca doar cand exista", () => {
  const fara = corpComanda(date(), CONFIG);
  assert.ok(!("cashOnDeliveryAmount" in (fara.extra ?? {})));

  const cu = corpComanda(date({ ramburs: 249.99, valoareDeclarata: 300 }), CONFIG);
  assert.equal(cu.extra?.cashOnDeliveryAmount, 249.99);
  assert.equal(cu.extra?.cashOnDeliveryAmountCurrency, "RON");
  assert.equal(cu.extra?.declaredValueAmount, 300);
});

test("bifele de servicii vin din configurare si pleaca explicit", () => {
  const corp = corpComanda(date(), { ...CONFIG, servicii: { openPackage: true } });
  assert.equal(corp.extra?.openPackage, true);
  assert.equal(corp.extra?.saturdayDelivery, false);
});

test("referinta noastra de comanda ajunge in externalOrderId", () => {
  /* ⚠ E si cheia cu care putem urmari fara sa avem AWB-ul lor, si cu care putem
     AFLA daca o emitere nesigura a reusit. */
  assert.equal(corpComanda(date({ externalOrderId: "1042" }), CONFIG).externalOrderId, "1042");
});

test("formatul de eticheta ajunge in preferintele clientului", () => {
  const corp = corpComanda(date(), { ...CONFIG, format_eticheta: "A6" });
  assert.equal(corp.clientSettings?.clientPreferences?.preferredLabel, "A6");
});

test("continutul prea lung se taie, fiindca e text compus de noi", () => {
  const corp = corpComanda(date({ continut: "x".repeat(LUNGIMI.contents + 30) }), CONFIG);
  assert.equal(corp.content.contents.length, LUNGIMI.contents);
});
