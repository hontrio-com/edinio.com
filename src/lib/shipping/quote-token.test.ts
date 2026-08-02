import assert from "node:assert/strict";
import { test } from "node:test";
import { signShippingQuote, verifyShippingQuote, semneazaOptiuni } from "./quote-token";

/** Optiunea folosita de testele care nu se ocupa chiar ele de legarea optiunii. */
const OPT = { courier: "sameday", deliveryType: "address", courierLabel: "Sameday Courier" };

/**
 * Costul livrarii era singurul numar din comanda scris asa cum venea din browser.
 * Cine trimitea zero primea livrare gratuita, iar comerciantul platea oricum
 * curierul. Testele astea apara exact ce leaga semnatura: magazinul, destinatia
 * si suma.
 */

const BIZ = "biz-1";
const DEST = { county: "Cluj", city: "Cluj-Napoca", country: "RO", postCode: "400000" };

test("cotatia proprie trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5, OPT);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t, OPT), true);
});

test("alta suma pe aceeasi cotatie nu trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5, OPT);
  assert.equal(verifyShippingQuote(BIZ, DEST, 0, t, OPT), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.49, t, OPT), false);
});

test("cotatia unui alt magazin nu trece", () => {
  const t = signShippingQuote("biz-2", DEST, 24.5, OPT);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t, OPT), false);
});

test("cotatia altei destinatii nu trece", () => {
  const t = signShippingQuote(BIZ, { ...DEST, city: "Bucuresti" }, 24.5, OPT);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t, OPT), false);
});

test("destinatia se normalizeaza, deci spatiile si majusculele nu strica nimic", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5, OPT);
  assert.equal(verifyShippingQuote(BIZ, { ...DEST, city: "  cluj-napoca " }, 24.5, t, OPT), true);
});

test("tara lipsa inseamna Romania, in ambele sensuri", () => {
  const t = signShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 24.5, OPT);
  assert.equal(verifyShippingQuote(BIZ, { ...DEST, country: "RO" }, 24.5, t, OPT), true);
});

test("o cotatie expirata nu mai trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5, OPT, Date.now() - 1000);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t, OPT), false);
});

test("token lipsa sau stricat nu trece", () => {
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, null, OPT), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, "", OPT), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, "fara-punct", OPT), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, `${Date.now() + 10000}.gresit`, OPT), false);
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
  const t = signShippingQuote(BIZ, dest, 19.99, OPT);
  assert.equal(verifyShippingQuote(BIZ, dest, 19.99, t, OPT), true);
});

test("codul postal adaugat pe o singura parte rupe verificarea", () => {
  const t = signShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, 19.99, OPT);
  assert.equal(verifyShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 19.99, t, OPT), false);
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
  const t = signShippingQuote(BIZ, dest, 95.84, OPT);
  assert.equal(verifyShippingQuote(BIZ, dest, 95.84, t, OPT), true);
});

test("cotatie internationala: alta tara sau alt cod postal nu trece", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const t = signShippingQuote(BIZ, dest, 95.84, OPT);
  assert.equal(verifyShippingQuote(BIZ, { ...dest, country: "AT" }, 95.84, t, OPT), false);
  assert.equal(verifyShippingQuote(BIZ, { ...dest, postCode: "97941" }, 95.84, t, OPT), false);
  // Si nici tariful implicit intern nu poate trece drept cotatie semnata.
  assert.equal(verifyShippingQuote(BIZ, dest, 18, t, OPT), false);
});

test("codul postal netaiat la cotare si taiat la comanda semneaza la fel", () => {
  const t = signShippingQuote(BIZ, { county: "", city: "Ratibor", country: "DE", postCode: " 02627 " }, 95.84, OPT);
  assert.equal(verifyShippingQuote(BIZ, { county: "", city: "Ratibor", country: "DE", postCode: "02627" }, 95.84, t, OPT), true);
});

/*
 * `semneazaOptiuni` exista fiindca `getShippingOptions` are DOUA iesiri, iar
 * semnarea statea doar pe cea de la final: ramura internationala taia scurt si
 * pleca fara token. Testele de mai jos apara contractul „nicio optiune nu iese
 * nesemnata", care e singurul lucru care face imposibila reaparitia defectului
 * la urmatoarea iesire adaugata in functie.
 */
test("semneazaOptiuni pune token pe FIECARE optiune, si fiecare se verifica cu ea insasi", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const optiuni = [
    { courier: "sameday", deliveryType: "address", price: 24.5 },
    { courier: "pickup", deliveryType: "address", price: 0 },
    { courier: "sameday", deliveryType: "locker", price: 19 },
  ];
  const semnate = semneazaOptiuni(BIZ, dest, optiuni);
  assert.equal(semnate.length, 3);
  for (const o of semnate) {
    assert.ok(o.token, `optiunea ${o.courier} a plecat fara token`);
    assert.equal(verifyShippingQuote(BIZ, dest, o.price, o.token, { courier: o.courier, deliveryType: o.deliveryType }), true);
  }
});

/*
 * Miezul constatarii 6: „Ridicare personala" produce mereu o optiune de 0 lei,
 * semnata valid. Cat timp amprenta nu continea curierul, tokenul ei valida 0 lei
 * pentru livrare la domiciliu — si cinci magazine publicate au pickup pornit
 * langa curieri de 17-45 de lei.
 */
test("tokenul de la Ridicare personala NU legitimeaza livrarea cu curier", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [pickup] = semneazaOptiuni(BIZ, dest, [{ courier: "pickup", deliveryType: "address", price: 0 }]);
  // Cu el insusi, da.
  assert.equal(verifyShippingQuote(BIZ, dest, 0, pickup.token, { courier: "pickup", deliveryType: "address" }), true);
  // Pe alt curier, nu — asta e gaura inchisa.
  assert.equal(verifyShippingQuote(BIZ, dest, 0, pickup.token, { courier: "cargus", deliveryType: "address" }), false);
  assert.equal(verifyShippingQuote(BIZ, dest, 0, pickup.token, { courier: "sameday", deliveryType: "address" }), false);
});

test("tokenul de locker nu trece pentru livrare la adresa, si invers", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [laLocker] = semneazaOptiuni(BIZ, dest, [{ courier: "sameday", deliveryType: "locker", price: 19 }]);
  assert.equal(verifyShippingQuote(BIZ, dest, 19, laLocker.token, { courier: "sameday", deliveryType: "locker" }), true);
  assert.equal(verifyShippingQuote(BIZ, dest, 19, laLocker.token, { courier: "sameday", deliveryType: "address" }), false);
});

test("curierul lipsa de o singura parte nu trece drept potrivire", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [o] = semneazaOptiuni(BIZ, dest, [{ courier: "cargus", deliveryType: "address", price: 17 }]);
  assert.equal(verifyShippingQuote(BIZ, dest, 17, o.token, {}), false);
  assert.equal(verifyShippingQuote(BIZ, dest, 17, o.token, { courier: undefined, deliveryType: "address" }), false);
});

test("semneazaOptiuni pastreaza campurile optiunii neatinse", () => {
  const semnate = semneazaOptiuni(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, [
    { courier: "woot", price: 19.99, wootServiceId: 7, courierLabel: "Woot" },
  ]);
  assert.equal(semnate[0].wootServiceId, 7);
  assert.equal(semnate[0].courierLabel, "Woot");
  assert.equal(semnate[0].price, 19.99);
});

test("tokenul unei optiuni nu trece pentru pretul alteia, la curier IDENTIC", () => {
  // Curierul si tipul de livrare sunt aceleasi pe ambele: asa testul cade daca
  // se scoate PRETUL din amprenta, nu doar daca se scoate curierul.
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const [ieftina, scumpa] = semneazaOptiuni(BIZ, dest, [
    { courier: "dpd", deliveryType: "address", price: 18 },
    { courier: "dpd", deliveryType: "address", price: 95.84 },
  ]);
  assert.equal(verifyShippingQuote(BIZ, dest, 95.84, ieftina.token, { courier: "dpd", deliveryType: "address" }), false);
  assert.equal(verifyShippingQuote(BIZ, dest, 18, scumpa.token, { courier: "dpd", deliveryType: "address" }), false);
  assert.equal(verifyShippingQuote(BIZ, dest, 18, ieftina.token, { courier: "dpd", deliveryType: "address" }), true);
});

test("tokenul unei optiuni nu trece pentru pretul alteia din aceeasi lista", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const [ieftina, scumpa] = semneazaOptiuni(BIZ, dest, [{ price: 18 }, { price: 95.84 }]);
  assert.equal(verifyShippingQuote(BIZ, dest, 95.84, ieftina.token, OPT), false);
  assert.equal(verifyShippingQuote(BIZ, dest, 18, scumpa.token, OPT), false);
});

test("lista goala ramane goala, fara sa se prabuseasca", () => {
  assert.deepEqual(semneazaOptiuni(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, []), []);
});

/*
 * Eticheta e semnata, nu dedusa: ea poarta lucruri pe care comanda nu le mai
 * stie (sufixul de locker, numele transportatorului real al unui broker, tara
 * la international). Dedusa pe server, „Sameday EasyBox (locker)" devenea
 * „Sameday Courier", si omul care pregatea coletul pierdea tocmai marcajul de
 * locker.
 */
test("eticheta face parte din semnatura: schimbata, tokenul nu mai trece", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [pickup] = semneazaOptiuni(BIZ, dest, [
    { courier: "pickup", deliveryType: "address", courierLabel: "Ridicare personala", price: 0 },
  ]);
  assert.equal(verifyShippingQuote(BIZ, dest, 0, pickup.token,
    { courier: "pickup", deliveryType: "address", courierLabel: "Ridicare personala" }), true);
  // Exact atacul: token de pickup, eticheta de Cargus.
  assert.equal(verifyShippingQuote(BIZ, dest, 0, pickup.token,
    { courier: "pickup", deliveryType: "address", courierLabel: "Livrare prin Cargus" }), false);
});

test("eticheta bogata supravietuieste dus-intors, neatinsa", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  for (const eticheta of ["Sameday EasyBox (locker)", "DPD International (Germania)", "Cargus Ship & Go (punct)"]) {
    const [o] = semneazaOptiuni(BIZ, dest, [
      { courier: "dpd", deliveryType: "locker", courierLabel: eticheta, price: 24.5 },
    ]);
    assert.equal(o.courierLabel, eticheta);
    assert.equal(verifyShippingQuote(BIZ, dest, 24.5, o.token,
      { courier: "dpd", deliveryType: "locker", courierLabel: eticheta }), true);
  }
});

/*
 * TESTE PE APELANT, nu doar pe biblioteca.
 *
 * Testele de mai sus construiesc perechi de mana, deci treceau toate in timp ce
 * `updateOrderDetails` verifica fara eticheta si re-cotarea din panou era moarta
 * la 100% din incercari. Astea semneaza cum semneaza PRODUCTIA (prin
 * `semneazaOptiuni`, cu eticheta mereu nevida) si verifica exact cu obiectul pe
 * care il construieste fiecare apelant.
 */
const optiuneReala = (over = {}) => ({
  courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", price: 17, ...over,
});

test("apelantul care uita eticheta NU poate valida o cotatie reala", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [o] = semneazaOptiuni(BIZ, dest, [optiuneReala()]);
  // Asa gresea `updateOrderDetails`: fara `courierLabel`.
  assert.equal(verifyShippingQuote(BIZ, dest, 17, o.token,
    { courier: "cargus", deliveryType: "address" }), false);
  // Asa e corect.
  assert.equal(verifyShippingQuote(BIZ, dest, 17, o.token,
    { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus" }), true);
});

test("fiecare eticheta reala de productie se verifica dus-intors", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const cazuri = [
    optiuneReala(),
    optiuneReala({ courier: "sameday", deliveryType: "locker", courierLabel: "Sameday EasyBox (locker)", price: 19 }),
    optiuneReala({ courier: "pickup", courierLabel: "Ridicare personala", price: 0 }),
    optiuneReala({ courier: "woot", courierLabel: "Cargus prin Woot", price: 16 }),
    optiuneReala({ courier: "dpd", courierLabel: "DPD International (Germania)", price: 95.84 }),
  ];
  for (const c of cazuri) {
    const [o] = semneazaOptiuni(BIZ, dest, [c]);
    assert.equal(
      verifyShippingQuote(BIZ, dest, c.price, o.token,
        { courier: c.courier, deliveryType: c.deliveryType, courierLabel: c.courierLabel }),
      true,
      `nu se verifica: ${c.courierLabel}`,
    );
  }
});
