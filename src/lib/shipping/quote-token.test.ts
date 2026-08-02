import assert from "node:assert/strict";
import { test } from "node:test";
import { signShippingQuote, verifyShippingQuote, semneazaOptiuni } from "./quote-token";

/**
 * Costul livrarii era singurul numar din comanda scris asa cum venea din browser.
 * Cine trimitea zero primea livrare gratuita, iar comerciantul platea oricum
 * curierul. Testele astea apara exact ce leaga semnatura: magazinul, destinatia
 * si suma.
 */

const BIZ = "biz-1";
const DEST = { county: "Cluj", city: "Cluj-Napoca", country: "RO", postCode: "400000" };

test("cotatia proprie trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), true);
});

test("alta suma pe aceeasi cotatie nu trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 0, t), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.49, t), false);
});

test("cotatia unui alt magazin nu trece", () => {
  const t = signShippingQuote("biz-2", DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), false);
});

test("cotatia altei destinatii nu trece", () => {
  const t = signShippingQuote(BIZ, { ...DEST, city: "Bucuresti" }, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), false);
});

test("destinatia se normalizeaza, deci spatiile si majusculele nu strica nimic", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, { ...DEST, city: "  cluj-napoca " }, 24.5, t), true);
});

test("tara lipsa inseamna Romania, in ambele sensuri", () => {
  const t = signShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 24.5);
  assert.equal(verifyShippingQuote(BIZ, { ...DEST, country: "RO" }, 24.5, t), true);
});

test("o cotatie expirata nu mai trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5, Date.now() - 1000);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), false);
});

test("token lipsa sau stricat nu trece", () => {
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, null), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, ""), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, "fara-punct"), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, `${Date.now() + 10000}.gresit`), false);
});

/*
 * Re-cotarea din panoul de comenzi (editarea comenzii) semneaza si verifica o
 * destinatie interna DOAR cu judetul si orasul. Codul postal adaugat de o
 * singura parte schimba amprenta si face semnatura sa cada in tacere, iar
 * atunci comerciantul ar apasa „Aplica" si transportul ar ramane cel vechi,
 * fara ca nimeni sa afle de ce.
 */
test("destinatie interna doar cu judet si oras: semneaza si verifica identic", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const t = signShippingQuote(BIZ, dest, 19.99);
  assert.equal(verifyShippingQuote(BIZ, dest, 19.99, t), true);
});

test("codul postal adaugat pe o singura parte rupe verificarea", () => {
  const t = signShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, 19.99);
  assert.equal(verifyShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 19.99, t), false);
});

/*
 * Cotatia INTERNATIONALA. Ramura DPD international iese din `getShippingOptions`
 * inainte de pasul de semnare, deci pana acum pleca fara token: la comanda,
 * verificarea cadea si transportul de 95,84 lei catre Germania era inlocuit
 * tacit cu tariful implicit intern al magazinului, 18 lei. Comerciantul platea
 * oricum cursa.
 *
 * Amprenta acopera tara si codul postal, iar judetul e gol pe adresele straine
 * (asa arata comenzile reale ale magazinului tonel-beauty).
 */
test("cotatie internationala: se semneaza si se verifica cu tara si codul postal", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const t = signShippingQuote(BIZ, dest, 95.84);
  assert.equal(verifyShippingQuote(BIZ, dest, 95.84, t), true);
});

test("cotatie internationala: alta tara sau alt cod postal nu trece", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const t = signShippingQuote(BIZ, dest, 95.84);
  assert.equal(verifyShippingQuote(BIZ, { ...dest, country: "AT" }, 95.84, t), false);
  assert.equal(verifyShippingQuote(BIZ, { ...dest, postCode: "97941" }, 95.84, t), false);
  // Si nici tariful implicit intern nu poate trece drept cotatie semnata.
  assert.equal(verifyShippingQuote(BIZ, dest, 18, t), false);
});

test("codul postal netaiat la cotare si taiat la comanda semneaza la fel", () => {
  const t = signShippingQuote(BIZ, { county: "", city: "Ratibor", country: "DE", postCode: " 02627 " }, 95.84);
  assert.equal(verifyShippingQuote(BIZ, { county: "", city: "Ratibor", country: "DE", postCode: "02627" }, 95.84, t), true);
});

/*
 * `semneazaOptiuni` exista fiindca `getShippingOptions` are DOUA iesiri, iar
 * semnarea statea doar pe cea de la final: ramura internationala taia scurt si
 * pleca fara token. Testele de mai jos apara contractul „nicio optiune nu iese
 * nesemnata", care e singurul lucru care face imposibila reaparitia defectului
 * la urmatoarea iesire adaugata in functie.
 */
test("semneazaOptiuni pune token pe FIECARE optiune, si toate se verifica", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const optiuni = [{ courier: "sameday", price: 24.5 }, { courier: "pickup", price: 0 }, { courier: "dpd", price: 95.84 }];
  const semnate = semneazaOptiuni(BIZ, dest, optiuni);
  assert.equal(semnate.length, 3);
  for (const o of semnate) {
    assert.ok(o.token, `optiunea ${o.courier} a plecat fara token`);
    assert.equal(verifyShippingQuote(BIZ, dest, o.price, o.token), true);
  }
});

test("semneazaOptiuni pastreaza campurile optiunii neatinse", () => {
  const semnate = semneazaOptiuni(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, [
    { courier: "woot", price: 19.99, wootServiceId: 7, courierLabel: "Woot" },
  ]);
  assert.equal(semnate[0].wootServiceId, 7);
  assert.equal(semnate[0].courierLabel, "Woot");
  assert.equal(semnate[0].price, 19.99);
});

test("tokenul unei optiuni nu trece pentru pretul alteia din aceeasi lista", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const [ieftina, scumpa] = semneazaOptiuni(BIZ, dest, [{ price: 18 }, { price: 95.84 }]);
  assert.equal(verifyShippingQuote(BIZ, dest, 95.84, ieftina.token), false);
  assert.equal(verifyShippingQuote(BIZ, dest, 18, scumpa.token), false);
});

test("lista goala ramane goala, fara sa se prabuseasca", () => {
  assert.deepEqual(semneazaOptiuni(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, []), []);
});
