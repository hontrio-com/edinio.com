import assert from "node:assert/strict";
import { test } from "node:test";
import { cerereXml, citesteXml, text } from "./xml";
import {
  LIMITE, baniPacketa, construiesteAtribute, despartuNume, despartuStrada,
  greutatePacketa, lipsuriExpediere, taie, telefonPacketa, type DateExpediere,
} from "./expediere";

const BAZA: DateExpediere = {
  destinatar: {
    nume: "Ion Popescu",
    strada: "Aleea Zorilor",
    numar: "12B",
    oras: "Cluj-Napoca",
    judet: "Cluj",
    codPostal: "400123",
    telefon: "0721234567",
    email: "ion@exemplu.ro",
  },
  numarComanda: "CMD-1001",
  addressId: "3060",
  greutateKg: 2.5,
  valoare: 199.99,
  eshop: "MagazinulMeu",
  laAdresa: true,
};

/* ── Numele ───────────────────────────────────────────────────────────────── */

test("⚠ numele se rupe la ULTIMUL spatiu: familia sta la sfarsit in romana", () => {
  assert.deepEqual(despartuNume("Ion Popescu"), { name: "Ion", surname: "Popescu" });
  assert.deepEqual(despartuNume("Ion Popescu Marian"), { name: "Ion Popescu", surname: "Marian" });
  // Rupt la PRIMUL spatiu ar fi dat „Ion" + „Popescu Marian" — familia gresita.
});

test("un singur cuvant merge intreg in `name`, fara `surname` inventat", () => {
  assert.deepEqual(despartuNume("Madonna"), { name: "Madonna", surname: "" });
});

test("⚠ cand despartirea nu incape in 32, se trimite tot sirul si ei descurca", () => {
  /*
   * Documentatia ingaduie anume: „You may forward the entire string as `name`, and
   * we'll make every effort to discern the surname from the first name on your
   * behalf." Mai bine asta decat un nume ciuntit.
   */
  // Familia are 40 de caractere, deci nu incape in cele 32 ale lui `surname`.
  const lung = "Ana Vasilescu-Dragomirescu-Constantinescu";
  assert.ok(lung.slice(lung.lastIndexOf(" ") + 1).length > LIMITE.surname, "premisa probei");
  const r = despartuNume(lung);
  assert.ok(r.name.length <= LIMITE.name);
  assert.equal(r.surname, "", "nu se taie familia: se lasa pe seama lor");

  // Cand AMANDOUA incap, despartirea chiar se face.
  const potrivit = despartuNume("Alexandru-Constantin Vasilescu-Dragomir");
  assert.equal(potrivit.name, "Alexandru-Constantin");
  assert.equal(potrivit.surname, "Vasilescu-Dragomir");
});

test("numele gol ramane gol, nu devine spatiu", () => {
  assert.deepEqual(despartuNume("   "), { name: "", surname: "" });
  assert.deepEqual(despartuNume(null), { name: "", surname: "" });
});

/* ── Taierea ──────────────────────────────────────────────────────────────── */

test("taierea se face pe cuvinte cand ramane ceva folositor", () => {
  assert.equal(taie("Bulevardul Alexandru Ioan Cuza", 20), "Bulevardul Alexandru");
});

test("un prim cuvant foarte lung se taie oricum, ca sa nu ramana nimic", () => {
  assert.equal(taie("Supercalifragilisticexpialidocious strada", 20).length, 20);
});

/* ── Strada ───────────────────────────────────────────────────────────────── */

test("numarul dat separat se foloseste ca atare", () => {
  assert.deepEqual(despartuStrada("Aleea Zorilor", "12B"), { street: "Aleea Zorilor", houseNumber: "12B" });
});

test("fara numar, se incearca scoaterea lui din coada strazii", () => {
  assert.deepEqual(despartuStrada("Aleea Zorilor 12B", null), { street: "Aleea Zorilor", houseNumber: "12B" });
  assert.deepEqual(despartuStrada("Str. Lunga, 7", null), { street: "Str. Lunga", houseNumber: "7" });
});

test("o strada fara niciun numar nu inventeaza unul", () => {
  assert.deepEqual(despartuStrada("Aleea Zorilor", null), { street: "Aleea Zorilor", houseNumber: "" });
});

/* ── Telefonul ────────────────────────────────────────────────────────────── */

test("telefonul romanesc capata prefixul de tara, cum cere regexul lor", () => {
  assert.equal(telefonPacketa("0721234567"), "+40721234567");
  assert.equal(telefonPacketa("+40721234567"), "+40721234567");
  assert.equal(telefonPacketa("0040721234567"), "+40721234567");
  assert.equal(telefonPacketa(" 0721 234 567 "), "+40721234567");
});

test("⚠ un telefon care nu se poate aduce la forma ceruta iese GOL", () => {
  // Gol => `lipsuriExpediere` opreste emiterea. Un telefon gresit inseamna un
  // colet pe care curierul nu-l poate anunta.
  assert.equal(telefonPacketa("123"), "");
  assert.equal(telefonPacketa(""), "");
  assert.equal(telefonPacketa(null), "");
});

/* ── Numerele ─────────────────────────────────────────────────────────────── */

test("greutatea pastreaza zecimalele si nu coboara sub minim", () => {
  assert.equal(greutatePacketa(2.5), "2.5");
  assert.equal(greutatePacketa(2), "2");
  assert.equal(greutatePacketa(0), "0.1");
  assert.equal(greutatePacketa(null), "0.1");
});

test("⚠ banii NU se rotunjesc la leu: regula pentru RON nu e documentata", () => {
  /*
   * Documentatia da reguli doar pentru CZK (intreg), HUF (multiplu de 5) si EUR
   * (doi zecimali). O rotunjire inventata de noi ar incasa de la client alta suma
   * decat cea din comanda.
   */
  assert.equal(baniPacketa(145.55), "145.55");
  assert.equal(baniPacketa(19.999), "20");
  assert.equal(baniPacketa(0), "0");
});

/* ── Ce lipseste ──────────────────────────────────────────────────────────── */

test("o comanda intreaga nu are lipsuri", () => {
  assert.deepEqual(lipsuriExpediere(BAZA), []);
});

test("⚠ email SAU telefon — cel putin unul", () => {
  const doar_mail = { ...BAZA, destinatar: { ...BAZA.destinatar, telefon: null } };
  assert.deepEqual(lipsuriExpediere(doar_mail), []);
  const doar_tel = { ...BAZA, destinatar: { ...BAZA.destinatar, email: null } };
  assert.deepEqual(lipsuriExpediere(doar_tel), []);
  const niciunul = { ...BAZA, destinatar: { ...BAZA.destinatar, telefon: null, email: null } };
  assert.ok(lipsuriExpediere(niciunul).some((l) => l.includes("telefonul sau emailul")));
});

test("un telefon scris gresit se semnaleaza, nu se trece cu vederea", () => {
  const rau = { ...BAZA, destinatar: { ...BAZA.destinatar, telefon: "123", email: "x@y.ro" } };
  assert.ok(lipsuriExpediere(rau).some((l) => l.includes("telefon valid")));
});

test("valoarea e obligatorie: Packeta o cere pentru asigurare", () => {
  assert.ok(lipsuriExpediere({ ...BAZA, valoare: 0 }).some((l) => l.includes("valoarea")));
});

test("la livrare la adresa lipsesc strada, orasul si codul postal daca nu sunt", () => {
  const gol = { ...BAZA, destinatar: { ...BAZA.destinatar, strada: null, numar: null, oras: null, codPostal: null } };
  const l = lipsuriExpediere(gol);
  assert.ok(l.includes("strada"));
  assert.ok(l.includes("orasul"));
  assert.ok(l.includes("codul postal"));
});

test("la punct de ridicare, adresa NU e ceruta", () => {
  const laPunct: DateExpediere = { ...BAZA, laAdresa: false, destinatar: { ...BAZA.destinatar, strada: null, oras: null, codPostal: null } };
  assert.deepEqual(lipsuriExpediere(laPunct), []);
});

test("⚠ numarul casei se cere doar cand curierul chiar il cere separat", () => {
  const fara = { ...BAZA, destinatar: { ...BAZA.destinatar, strada: "Aleea Zorilor", numar: null } };
  assert.equal(lipsuriExpediere(fara).some((l) => l.includes("numarul")), false);
  const cu = { ...fara, numarSeparat: true };
  assert.ok(lipsuriExpediere(cu).some((l) => l.includes("numarul")));
});

test("eticheta de expeditor lipsa opreste emiterea", () => {
  // Un `eshop` gresit CREEAZA tacut un expeditor nou si strica facturarea.
  assert.ok(lipsuriExpediere({ ...BAZA, eshop: "" }).some((l) => l.includes("eshop")));
});

/* ── Documentul ───────────────────────────────────────────────────────────── */

test("atributele dau documentul asteptat, cu campurile din exemplul lor", () => {
  const x = cerereXml("createPacket", { apiPassword: "P", packetAttributes: construiesteAtribute(BAZA) });
  const r = citesteXml(x);
  assert.equal(text(r, "number"), "CMD-1001");
  assert.equal(text(r, "name"), "Ion");
  assert.equal(text(r, "surname"), "Popescu");
  assert.equal(text(r, "addressId"), "3060");
  assert.equal(text(r, "value"), "199.99");
  assert.equal(text(r, "weight"), "2.5");
  assert.equal(text(r, "eshop"), "MagazinulMeu");
  assert.equal(text(r, "street"), "Aleea Zorilor");
  assert.equal(text(r, "houseNumber"), "12B");
  assert.equal(text(r, "city"), "Cluj-Napoca");
  assert.equal(text(r, "zip"), "400123");
  assert.equal(text(r, "phone"), "+40721234567");
});

test("⚠ `cod` se trimite DOAR cand exista ramburs", () => {
  // Un `<cod>0</cod>` ar fi o declaratie („ramburs de zero lei") pe care n-o facem.
  const fara = citesteXml(cerereXml("m", construiesteAtribute(BAZA)));
  assert.equal(text(fara, "cod"), undefined);
  const cu = citesteXml(cerereXml("m", construiesteAtribute({ ...BAZA, ramburs: 250 })));
  assert.equal(text(cu, "cod"), "250");
});

test("⚠ `currency` se OMITE: tara (deci moneda) vine din addressId", () => {
  const r = citesteXml(cerereXml("m", construiesteAtribute(BAZA)));
  assert.equal(text(r, "currency"), undefined);
});

test("la punct de ridicare nu se trimit campurile de adresa", () => {
  const r = citesteXml(cerereXml("m", construiesteAtribute({ ...BAZA, laAdresa: false })));
  for (const camp of ["street", "houseNumber", "city", "zip", "province"]) {
    assert.equal(text(r, camp), undefined, `${camp} n-are ce cauta la punct`);
  }
});

test("⚠ dimensiunile sunt in MILIMETRI, intregi", () => {
  // Ceilalti curieri cer centimetri; o confuzie declara coletul de zece ori mai mic.
  const r = citesteXml(cerereXml("m", construiesteAtribute({
    ...BAZA, dimensiuniMm: { lungime: 150.4, latime: 200, inaltime: 50 },
  })));
  assert.equal(text(r, "length"), "150");
  assert.equal(text(r, "width"), "200");
  assert.equal(text(r, "height"), "50");
});

test("campurile goale nu ajung in document ca elemente vide", () => {
  const r = citesteXml(cerereXml("m", construiesteAtribute({
    ...BAZA, destinatar: { ...BAZA.destinatar, companie: null }, nota: null,
  })));
  assert.equal(text(r, "company"), undefined);
  assert.equal(text(r, "note"), undefined);
});

test("un nume cu `&` nu rupe documentul", () => {
  const d = { ...BAZA, destinatar: { ...BAZA.destinatar, nume: "Ion Popescu", companie: "Ion & Fiii SRL" } };
  const x = cerereXml("createPacket", { packetAttributes: construiesteAtribute(d) });
  assert.doesNotThrow(() => citesteXml(x));
  assert.equal(text(citesteXml(x), "company"), "Ion & Fiii SRL");
});

test("toate campurile de text respecta plafoanele declarate", () => {
  const lung = "x".repeat(200);
  const r = citesteXml(cerereXml("m", construiesteAtribute({
    ...BAZA,
    numarComanda: lung,
    nota: lung,
    destinatar: { ...BAZA.destinatar, companie: lung, strada: lung, oras: lung, judet: lung },
  })));
  assert.ok((text(r, "number") ?? "").length <= LIMITE.number);
  assert.ok((text(r, "company") ?? "").length <= LIMITE.company);
  assert.ok((text(r, "street") ?? "").length <= LIMITE.street);
  assert.ok((text(r, "city") ?? "").length <= LIMITE.city);
  assert.ok((text(r, "province") ?? "").length <= LIMITE.province);
  assert.ok((text(r, "note") ?? "").length <= LIMITE.note);
});
