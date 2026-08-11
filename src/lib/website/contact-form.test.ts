import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MAX, verificaMesajDeContact } from "./contact-form";

/*
 * Formularul de contact e SINGURA cale prin care un om care nu are cont ajunge
 * la noi. Daca verificarea respinge ceva ce nu trebuia, omul pleaca si nu afla
 * nimeni: nu exista nicio urma a unui mesaj care n-a fost trimis.
 *
 * De aia probele de mai jos apasa mai tare pe „ce trebuie SA TREACA" decat pe
 * „ce trebuie respins".
 */

const BUN = {
  nume: "Ion Popescu",
  email: "ion@exemplu.ro",
  telefon: "0750 456 809",
  mesaj: "As vrea sa aflu daca pot muta magazinul meu pe Edinio.",
  acord: true,
};

test("un mesaj normal trece", () => {
  const r = verificaMesajDeContact(BUN);
  assert.equal(r.ok, true);
});

test("valorile ies CURATATE de spatii, nu cum au intrat", () => {
  const r = verificaMesajDeContact({
    ...BUN,
    nume: "  Ion Popescu  ",
    email: "  ion@exemplu.ro ",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.valoare.nume, "Ion Popescu");
  assert.equal(r.valoare.email, "ion@exemplu.ro");
});

test("adresele REALE, mai ciudate, trec toate", () => {
  /* O expresie „stricta" respinge oameni adevarati. Fiecare din astea e o
     adresa care exista in viata reala. */
  for (const email of [
    "ion+magazin@exemplu.ro",
    "ion.popescu@mail.exemplu.co.uk",
    "i@x.io",
    "nume-cu-liniuta@sub.domeniu.ro",
    "ION@EXEMPLU.RO",
  ]) {
    const r = verificaMesajDeContact({ ...BUN, email });
    assert.equal(r.ok, true, `respinsa gresit: ${email}`);
  }
});

test("numerele scrise oricum trec: cu spatii, prefix, liniute, paranteze", () => {
  for (const telefon of ["0750456809", "0750 456 809", "+40750456809", "0750-456-809", "(0750) 456 809"]) {
    const r = verificaMesajDeContact({ ...BUN, telefon });
    assert.equal(r.ok, true, `respins gresit: ${telefon}`);
  }
});

test("fiecare camp lipsa are mesajul LUI, nu unul general", () => {
  /* „Completeaza toate campurile" il pune pe om sa caute singur care lipseste. */
  const cazuri: [keyof typeof BUN, RegExp][] = [
    ["nume", /numele/i],
    ["email", /email/i],
    ["telefon", /telefon/i],
    ["mesaj", /mesajul/i],
  ];
  for (const [camp, tipar] of cazuri) {
    const r = verificaMesajDeContact({ ...BUN, [camp]: "   " });
    assert.equal(r.ok, false, `${camp} gol ar fi trebuit respins`);
    if (r.ok) continue;
    assert.match(r.error, tipar, `mesajul pentru ${camp} nu spune despre ce e vorba`);
  }
});

test("adresa fara domeniu sau fara punct e respinsa", () => {
  for (const email of ["ion", "ion@", "ion@exemplu", "@exemplu.ro", "ion @exemplu.ro"]) {
    assert.equal(verificaMesajDeContact({ ...BUN, email }).ok, false, `acceptata gresit: ${email}`);
  }
});

test("un numar prea scurt sau cu litere e respins", () => {
  for (const telefon of ["0750", "12345678", "telefonul meu", "0750abc4569"]) {
    assert.equal(verificaMesajDeContact({ ...BUN, telefon }).ok, false, `acceptat gresit: ${telefon}`);
  }
});

test("un mesaj de doua cuvinte e respins, dar cu un motiv care ajuta", () => {
  const r = verificaMesajDeContact({ ...BUN, mesaj: "salut" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /cateva cuvinte/i);
});

test("plafoanele de lungime opresc un mesaj care ar rupe emailul", () => {
  /* Fara ele, un singur mesaj poate carpi un email de cativa megaocteti, pe
     care furnizorul il respinge — deci formularul ar cadea, si nu din vina
     omului. */
  assert.equal(verificaMesajDeContact({ ...BUN, mesaj: "a".repeat(MAX.mesaj + 1) }).ok, false);
  assert.equal(verificaMesajDeContact({ ...BUN, nume: "a".repeat(MAX.nume + 1) }).ok, false);
  assert.equal(verificaMesajDeContact({ ...BUN, email: "a".repeat(MAX.email) + "@x.ro" }).ok, false);
});

test("un mesaj exact la plafon inca trece", () => {
  /* Plafonul e o limita, nu o margine de siguranta pe care sa cada cineva. */
  assert.equal(verificaMesajDeContact({ ...BUN, mesaj: "a".repeat(MAX.mesaj) }).ok, true);
});

test("campurile lipsa cu totul se trateaza ca goale, nu arunca", () => {
  /* Actiunea poate fi chemata cu orice corp, de oriunde. */
  assert.equal(verificaMesajDeContact({}).ok, false);
  assert.equal(verificaMesajDeContact({ nume: "Ion" }).ok, false);
});

test("fara bifa de acord, mesajul NU trece", () => {
  /* Consimtamantul e temeiul pe care prelucram datele. Daca singura dovada ca
     omul a bifat ar fi atributul `required` din HTML, n-am avea nicio dovada:
     actiunea poate fi chemata cu orice corp. */
  for (const acord of [false, undefined]) {
    const r = verificaMesajDeContact({ ...BUN, acord });
    assert.equal(r.ok, false, `acord=${acord} ar fi trebuit respins`);
    if (r.ok) continue;
    assert.match(r.error, /confiden/i);
  }
});

test("`acord` trebuie sa fie chiar `true`, nu doar adevarat-ish", () => {
  /* Un corp trimis de mana poate contine `"da"`, `1` sau `"on"`. Comparatia e
     stricta dinadins: altfel orice sir nevid ar trece drept consimtamant. */
  for (const acord of ["true", "on", 1, {}] as unknown as boolean[]) {
    assert.equal(verificaMesajDeContact({ ...BUN, acord }).ok, false, `acceptat gresit: ${String(acord)}`);
  }
});

test("bifa se verifica DUPA campuri: prima eroare e cea reparabila langa camp", () => {
  const r = verificaMesajDeContact({ ...BUN, telefon: "123", acord: false });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /telefon/i, "ar fi trebuit sa se planga intai de telefon");
});
