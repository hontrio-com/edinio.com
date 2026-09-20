import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  cheieEmail, cheieTelefon, mesajContactSuprimat, motivulSuprimarii, type RandSuprimare,
} from "./suprimare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Un mesaj trimis cuiva care a cerut sa nu mai fie contactat nu se poate lua
  inapoi. Nu e o cifra gresita pe un ecran, e o promisiune incalcata - si una pe
  care omul o considera indeplinita din clipa in care a apasat „dezabonare".

  Pana pe 21.09.2026, lista de suprimari era citita NUMAI de cron. Trimiterea de
  mana din panou n-o atingea deloc. Pe productie plecasera deja 34 de emailuri
  si 21 de SMS-uri catre clienti adevarati, deci gaura nu era teoretica.
*/

const DEZABONAT: RandSuprimare[] = [
  { email: "ion@mail.ro", phone: null, motiv: "dezabonare" },
  { email: null, phone: "+40722184305", motiv: "numar_invalid" },
];

test("emailul se potriveste indiferent de litere mari sau spatii", () => {
  /*
    ⚠ „Ion@Mail.ro " si „ion@mail.ro" sunt acelasi om. Comparate ca text brut,
    dezabonarea salvata intr-o forma n-ar fi prins mesajul trimis catre alta -
    adica exact cazul in care plasa pare pusa si nu prinde.
  */
  assert.equal(motivulSuprimarii(DEZABONAT, { email: "  Ion@Mail.RO " }), "dezabonare");
  assert.equal(motivulSuprimarii(DEZABONAT, { email: "ion@mail.ro" }), "dezabonare");
});

test("telefonul se potriveste in oricare din formele in care se scrie", () => {
  /* ⚠ „0722 184 305", „+40722184305" si „0040722184305" sunt acelasi numar. */
  for (const forma of ["0722 184 305", "+40722184305", "0722184305", "+40 722 184 305"]) {
    assert.equal(motivulSuprimarii(DEZABONAT, { phone: forma }), "numar_invalid", forma);
  }
});

test("un contact curat nu e oprit", () => {
  assert.equal(motivulSuprimarii(DEZABONAT, { email: "maria@mail.ro", phone: "0733111222" }), null);
});

test("daca ORICARE dintre cele doua contacte e suprimat, nu se trimite nimic", () => {
  /*
    ⚠ Omul a cerut sa nu mai fie contactat, nu „sa nu mai fie contactat pe
    email". Un cos cu emailul dezabonat si un telefon nou nu deschide o portita
    de SMS.
  */
  assert.equal(
    motivulSuprimarii(DEZABONAT, { email: "ion@mail.ro", phone: "0799000111" }),
    "dezabonare",
  );
  assert.equal(
    motivulSuprimarii(DEZABONAT, { email: "altcineva@mail.ro", phone: "0722184305" }),
    "numar_invalid",
  );
});

test("un cos fara niciun contact nu se potriveste cu nimic", () => {
  assert.equal(motivulSuprimarii(DEZABONAT, {}), null);
  assert.equal(motivulSuprimarii(DEZABONAT, { email: "", phone: "  " }), null);
});

test("randurile fara contact din lista nu prind cosurile fara contact", () => {
  /*
    ⚠ Capcana: `null === null` ar fi facut ca un rand stricat din lista sa
    opreasca ORICE cos care n-are email. Cheile se compara doar cand exista.
  */
  const stricat: RandSuprimare[] = [{ email: null, phone: null, motiv: "dezabonare" }];
  assert.equal(motivulSuprimarii(stricat, { phone: "0722184305" }), null);
  assert.equal(motivulSuprimarii(stricat, { email: "ion@mail.ro" }), null);
});

test("lista goala nu opreste pe nimeni", () => {
  assert.equal(motivulSuprimarii([], { email: "ion@mail.ro", phone: "0722184305" }), null);
});

test("cheile aduc la forma de comparat, nu inventeaza", () => {
  assert.equal(cheieEmail(null), null);
  assert.equal(cheieEmail("   "), null);
  assert.equal(cheieEmail(" A@B.RO "), "a@b.ro");
  assert.equal(cheieTelefon(null), null);
  assert.equal(cheieTelefon("0722 184 305"), cheieTelefon("+40722184305"));
});

test("fiecare motiv are un mesaj care spune DE CE nu pleaca", () => {
  /*
    ⚠ Comerciantul trebuie sa afle care e pricina, nu doar ca „n-a mers": altfel
    apasa din nou, si din nou. Mesajele nu se repeta intre ele.
  */
  const motive = ["dezabonare", "numar_invalid", "email_respins", "reclamatie_spam", "nu_contacta"];
  const mesaje = motive.map(mesajContactSuprimat);
  assert.equal(new Set(mesaje).size, motive.length, "doua motive au acelasi mesaj");
  for (const m of mesaje) assert.ok(m.length > 30, `mesaj prea scurt: ${m}`);
  assert.match(mesajContactSuprimat("dezabonare"), /dezabonat/i);
  assert.match(mesajContactSuprimat("reclamatie_spam"), /spam/i);
  /* Un motiv necunoscut nu lasa ecranul mut. */
  assert.ok(mesajContactSuprimat("ceva_nou").length > 20);
});
