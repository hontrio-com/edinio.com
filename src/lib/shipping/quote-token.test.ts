import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { signShippingQuote, verificaCotatia, semneazaOptiuni, TOLERANTA_GRAME } from "./quote-token";

/**
 * ⚠ PROBELE DE MAI JOS SUNT DESPRE SEMNATURA, nu despre greutate, si raman asa.
 *
 * Pe 08.09.2026 tokenul a capatat si gramele cosului, iar verificarea a devenit un verdict cu
 * motiv, nu un boolean. Ajutoarele astea duc probele vechi peste schimbare NEATINSE: ele semneaza
 * cu zero grame si nu trimit nicio greutate la verificare, adica exact intrebarea pe care o puneau
 * si inainte. Greutatea isi are probele ei, la finalul fisierului.
 */
const semneaza = (
  businessId: string,
  dest: Parameters<typeof signShippingQuote>[1],
  price: number,
  optiune: Parameters<typeof signShippingQuote>[3],
  expiraLa?: number,
) => signShippingQuote(businessId, dest, price, optiune, 0, expiraLa);

const verifica = (
  businessId: string,
  dest: Parameters<typeof verificaCotatia>[1],
  price: number,
  token: string | null | undefined,
  optiune: Parameters<typeof verificaCotatia>[4],
) => verificaCotatia(businessId, dest, price, token, optiune).ok;
import { readFileSync } from "node:fs";
import path from "node:path";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { recalculeazaTotal } from "@/lib/orders/edit-pricing";

/** Optiunea folosita de testele care nu se ocupa chiar ele de legarea optiunii. */
const OPT = { courier: "sameday", deliveryType: "address", courierLabel: "Sameday Courier", ramburs: false };

/**
 * Costul livrarii era singurul numar din comanda scris asa cum venea din browser.
 * Cine trimitea zero primea livrare gratuita, iar comerciantul platea oricum
 * curierul. Testele astea apara exact ce leaga semnatura: magazinul, destinatia
 * si suma.
 */

const BIZ = "biz-1";
const DEST = { county: "Cluj", city: "Cluj-Napoca", country: "RO", postCode: "400000" };

test("cotatia proprie trece", () => {
  const t = semneaza(BIZ, DEST, 24.5, OPT);
  assert.equal(verifica(BIZ, DEST, 24.5, t, OPT), true);
});

test("alta suma pe aceeasi cotatie nu trece", () => {
  const t = semneaza(BIZ, DEST, 24.5, OPT);
  assert.equal(verifica(BIZ, DEST, 0, t, OPT), false);
  assert.equal(verifica(BIZ, DEST, 24.49, t, OPT), false);
});

test("cotatia unui alt magazin nu trece", () => {
  const t = semneaza("biz-2", DEST, 24.5, OPT);
  assert.equal(verifica(BIZ, DEST, 24.5, t, OPT), false);
});

test("cotatia altei destinatii nu trece", () => {
  const t = semneaza(BIZ, { ...DEST, city: "Bucuresti" }, 24.5, OPT);
  assert.equal(verifica(BIZ, DEST, 24.5, t, OPT), false);
});

test("destinatia se normalizeaza, deci spatiile si majusculele nu strica nimic", () => {
  const t = semneaza(BIZ, DEST, 24.5, OPT);
  assert.equal(verifica(BIZ, { ...DEST, city: "  cluj-napoca " }, 24.5, t, OPT), true);
});

test("tara lipsa inseamna Romania, in ambele sensuri", () => {
  const t = semneaza(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 24.5, OPT);
  assert.equal(verifica(BIZ, { ...DEST, country: "RO" }, 24.5, t, OPT), true);
});

test("o cotatie expirata nu mai trece", () => {
  const t = semneaza(BIZ, DEST, 24.5, OPT, Date.now() - 1000);
  assert.equal(verifica(BIZ, DEST, 24.5, t, OPT), false);
});

test("token lipsa sau stricat nu trece", () => {
  assert.equal(verifica(BIZ, DEST, 24.5, null, OPT), false);
  assert.equal(verifica(BIZ, DEST, 24.5, "", OPT), false);
  assert.equal(verifica(BIZ, DEST, 24.5, "fara-punct", OPT), false);
  assert.equal(verifica(BIZ, DEST, 24.5, `${Date.now() + 10000}.gresit`, OPT), false);
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
  const t = semneaza(BIZ, dest, 19.99, OPT);
  assert.equal(verifica(BIZ, dest, 19.99, t, OPT), true);
});

test("codul postal adaugat pe o singura parte rupe verificarea", () => {
  const t = semneaza(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, 19.99, OPT);
  assert.equal(verifica(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 19.99, t, OPT), false);
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
  const t = semneaza(BIZ, dest, 95.84, OPT);
  assert.equal(verifica(BIZ, dest, 95.84, t, OPT), true);
});

test("cotatie internationala: alta tara sau alt cod postal nu trece", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const t = semneaza(BIZ, dest, 95.84, OPT);
  assert.equal(verifica(BIZ, { ...dest, country: "AT" }, 95.84, t, OPT), false);
  assert.equal(verifica(BIZ, { ...dest, postCode: "97941" }, 95.84, t, OPT), false);
  // Si nici tariful implicit intern nu poate trece drept cotatie semnata.
  assert.equal(verifica(BIZ, dest, 18, t, OPT), false);
});

test("codul postal netaiat la cotare si taiat la comanda semneaza la fel", () => {
  const t = semneaza(BIZ, { county: "", city: "Ratibor", country: "DE", postCode: " 02627 " }, 95.84, OPT);
  assert.equal(verifica(BIZ, { county: "", city: "Ratibor", country: "DE", postCode: "02627" }, 95.84, t, OPT), true);
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
  const semnate = semneazaOptiuni(BIZ, dest, false, 0, optiuni);
  assert.equal(semnate.length, 3);
  for (const o of semnate) {
    assert.ok(o.token, `optiunea ${o.courier} a plecat fara token`);
    assert.equal(verifica(BIZ, dest, o.price, o.token, { courier: o.courier, deliveryType: o.deliveryType, ramburs: false }), true);
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
  const [pickup] = semneazaOptiuni(BIZ, dest, false, 0, [{ courier: "pickup", deliveryType: "address", price: 0 }]);
  // Cu el insusi, da.
  assert.equal(verifica(BIZ, dest, 0, pickup.token, { courier: "pickup", deliveryType: "address", ramburs: false }), true);
  // Pe alt curier, nu — asta e gaura inchisa.
  assert.equal(verifica(BIZ, dest, 0, pickup.token, { courier: "cargus", deliveryType: "address", ramburs: false }), false);
  assert.equal(verifica(BIZ, dest, 0, pickup.token, { courier: "sameday", deliveryType: "address", ramburs: false }), false);
});

test("tokenul de locker nu trece pentru livrare la adresa, si invers", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [laLocker] = semneazaOptiuni(BIZ, dest, false, 0, [{ courier: "sameday", deliveryType: "locker", price: 19 }]);
  assert.equal(verifica(BIZ, dest, 19, laLocker.token, { courier: "sameday", deliveryType: "locker", ramburs: false }), true);
  assert.equal(verifica(BIZ, dest, 19, laLocker.token, { courier: "sameday", deliveryType: "address", ramburs: false }), false);
});

test("curierul lipsa de o singura parte nu trece drept potrivire", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const [o] = semneazaOptiuni(BIZ, dest, false, 0, [{ courier: "cargus", deliveryType: "address", price: 17 }]);
  assert.equal(verifica(BIZ, dest, 17, o.token, { ramburs: false }), false);
  assert.equal(verifica(BIZ, dest, 17, o.token, { courier: undefined, deliveryType: "address", ramburs: false }), false);
});

test("semneazaOptiuni pastreaza campurile optiunii neatinse", () => {
  const semnate = semneazaOptiuni(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, false, 0, [
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
  const [ieftina, scumpa] = semneazaOptiuni(BIZ, dest, false, 0, [
    { courier: "dpd", deliveryType: "address", price: 18 },
    { courier: "dpd", deliveryType: "address", price: 95.84 },
  ]);
  assert.equal(verifica(BIZ, dest, 95.84, ieftina.token, { courier: "dpd", deliveryType: "address", ramburs: false }), false);
  assert.equal(verifica(BIZ, dest, 18, scumpa.token, { courier: "dpd", deliveryType: "address", ramburs: false }), false);
  assert.equal(verifica(BIZ, dest, 18, ieftina.token, { courier: "dpd", deliveryType: "address", ramburs: false }), true);
});

test("tokenul unei optiuni nu trece pentru pretul alteia din aceeasi lista", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const [ieftina, scumpa] = semneazaOptiuni(BIZ, dest, false, 0, [{ price: 18 }, { price: 95.84 }]);
  assert.equal(verifica(BIZ, dest, 95.84, ieftina.token, OPT), false);
  assert.equal(verifica(BIZ, dest, 18, scumpa.token, OPT), false);
});

test("lista goala ramane goala, fara sa se prabuseasca", () => {
  assert.deepEqual(semneazaOptiuni(BIZ, { county: "Cluj", city: "Cluj-Napoca" }, false, 0, []), []);
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
  const [pickup] = semneazaOptiuni(BIZ, dest, false, 0, [
    { courier: "pickup", deliveryType: "address", courierLabel: "Ridicare personala", price: 0 },
  ]);
  assert.equal(verifica(BIZ, dest, 0, pickup.token,
    { courier: "pickup", deliveryType: "address", courierLabel: "Ridicare personala", ramburs: false }), true);
  // Exact atacul: token de pickup, eticheta de Cargus.
  assert.equal(verifica(BIZ, dest, 0, pickup.token,
    { courier: "pickup", deliveryType: "address", courierLabel: "Livrare prin Cargus", ramburs: false }), false);
});

test("eticheta bogata supravietuieste dus-intors, neatinsa", () => {
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  for (const eticheta of ["Sameday EasyBox (locker)", "DPD International (Germania)", "Cargus Ship & Go (punct)"]) {
    const [o] = semneazaOptiuni(BIZ, dest, false, 0, [
      { courier: "dpd", deliveryType: "locker", courierLabel: eticheta, price: 24.5 },
    ]);
    assert.equal(o.courierLabel, eticheta);
    assert.equal(verifica(BIZ, dest, 24.5, o.token,
      { courier: "dpd", deliveryType: "locker", courierLabel: eticheta, ramburs: false }), true);
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
  const [o] = semneazaOptiuni(BIZ, dest, false, 0, [optiuneReala()]);
  // Asa gresea `updateOrderDetails`: fara `courierLabel`.
  assert.equal(verifica(BIZ, dest, 17, o.token,
    { courier: "cargus", deliveryType: "address", ramburs: false }), false);
  // Asa e corect.
  assert.equal(verifica(BIZ, dest, 17, o.token,
    { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", ramburs: false }), true);
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
    const [o] = semneazaOptiuni(BIZ, dest, false, 0, [c]);
    assert.equal(
      verifica(BIZ, dest, c.price, o.token,
        { courier: c.courier, deliveryType: c.deliveryType, courierLabel: c.courierLabel, ramburs: false }),
      true,
      `nu se verifica: ${c.courierLabel}`,
    );
  }
});

/*
 * REGIMUL DE RAMBURS (constatarea 23).
 *
 * `cod` era o suma trimisa de browser care intra direct in cererea catre curier
 * si din care iese comisionul de ramburs. Cotatia cu `cod: 0` iesea mai ieftina,
 * se semna valid, si se folosea apoi la o comanda ramburs. Nu cerea nicio regula
 * de transport, deci era exploatabil pe productia de atunci.
 *
 * Cel mai expus, masurat 2026-08-03: okxi coteaza live prin Sameday, are ramburs
 * ca SINGURA metoda de plata, si are si tariful zonei si `default_shipping_cost`
 * pe 0,00 — deci rezerva `max(suma ceruta, tarif implicit)` nu apara acolo nimic.
 */
const CARGUS = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus" };

test("cotatia ceruta fara ramburs NU legitimeaza o comanda cu ramburs", () => {
  const dest = { county: "Suceava", city: "Suceava" };
  // Asa arata atacul: se cere pretul fara ramburs (mai mic, fara comision)...
  const [faraRamburs] = semneazaOptiuni(BIZ, dest, false, 0, [{ ...CARGUS, price: 17 }]);
  // ...si se comanda cu ramburs, unde curierul incaseaza si isi ia comisionul.
  assert.equal(verifica(BIZ, dest, 17, faraRamburs.token, { ...CARGUS, ramburs: true }), false);
  // Cu el insusi, ramane valid: clientul care chiar plateste cu cardul nu patimeste.
  assert.equal(verifica(BIZ, dest, 17, faraRamburs.token, { ...CARGUS, ramburs: false }), true);
});

test("si invers: cotatia de ramburs nu trece drept cotatie fara ramburs", () => {
  // Simetric dinadins. Formularul re-cere cotatia la fiecare schimbare de metoda
  // de plata (`cod` e in cheia efectului din `CourierSelector`, iar re-cererea
  // goleste selectia si blocheaza trimiterea), deci clientul cinstit nu ajunge
  // niciodata sa trimita un token dintr-un regim in celalalt.
  const dest = { county: "Suceava", city: "Suceava" };
  const [cuRamburs] = semneazaOptiuni(BIZ, dest, true, 0, [{ ...CARGUS, price: 19.5 }]);
  assert.equal(verifica(BIZ, dest, 19.5, cuRamburs.token, { ...CARGUS, ramburs: false }), false);
  assert.equal(verifica(BIZ, dest, 19.5, cuRamburs.token, { ...CARGUS, ramburs: true }), true);
});

test("regimul se leaga si pe cotatia internationala, care iese pe alt drum", () => {
  // Ramura DPD international taie scurt inainte de bucla de curieri interni si a
  // mai plecat o data nesemnata din cauza asta. Trece prin acelasi ajutor, deci
  // primeste si acelasi regim — testul o tine acolo.
  const dest = { county: "", city: "Ratibor", country: "DE", postCode: "02627" };
  const [intl] = semneazaOptiuni(BIZ, dest, false, 0, [
    { courier: "dpd", deliveryType: "address", courierLabel: "DPD International (Germania)", price: 95.84 },
  ]);
  const optIntl = { courier: "dpd", deliveryType: "address", courierLabel: "DPD International (Germania)" };
  assert.equal(verifica(BIZ, dest, 95.84, intl.token, { ...optIntl, ramburs: true }), false);
  assert.equal(verifica(BIZ, dest, 95.84, intl.token, { ...optIntl, ramburs: false }), true);
});

test("un lot semnat cu ramburs poarta regimul pe FIECARE optiune, nu doar pe prima", () => {
  // `semneazaOptiuni` primeste regimul o singura data si trebuie sa il puna pe
  // tot lotul: altfel optiunile de la coada (lockerele, ofertele de broker) ar
  // ramane semnate in regimul implicit si s-ar putea folosi incrucisat.
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const optiuni = [
    { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", price: 19.5 },
    { courier: "cargus", deliveryType: "locker", courierLabel: "Cargus Ship & Go (punct)", price: 17.5 },
    { courier: "pickup", deliveryType: "address", courierLabel: "Ridicare personala", price: 0 },
  ];
  for (const o of semneazaOptiuni(BIZ, dest, true, 0, optiuni)) {
    const baza = { courier: o.courier, deliveryType: o.deliveryType, courierLabel: o.courierLabel };
    assert.equal(verifica(BIZ, dest, o.price, o.token, { ...baza, ramburs: true }), true, `regim pierdut: ${o.courierLabel}`);
    assert.equal(verifica(BIZ, dest, o.price, o.token, { ...baza, ramburs: false }), false, `regim nelegat: ${o.courierLabel}`);
  }
});

/*
 * „Ridicare personala" si regimul de ramburs, impreuna.
 *
 * Pickup e cazul cu miza cea mai mare la o semnatura rupta: 5 magazine publicate
 * au pickup pe 0 lei langa un `default_shipping_cost` de 18-45, iar rezerva e
 * `max(suma ceruta, tarif implicit)` — deci un client care vede 0,00 pe ecran ar
 * fi taxat 18-45 de lei. Testul tine regimul legat SI pe pickup, ca sa nu apara
 * ideea de a-l scuti „fiindca oricum e 0 lei": pickup cu plata la ridicare e tot
 * o incasare, si tokenul lui nu are voie sa treaca in celalalt regim.
 */
test("pickup: 0 lei semnat intr-un regim nu trece in celalalt", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const opt = { courier: "pickup", deliveryType: "address", courierLabel: "Ridicare personala" };
  const [p] = semneazaOptiuni(BIZ, dest, true, 0, [{ ...opt, price: 0 }]);
  assert.equal(verifica(BIZ, dest, 0, p.token, { ...opt, ramburs: true }), true);
  assert.equal(verifica(BIZ, dest, 0, p.token, { ...opt, ramburs: false }), false);
});

/*
 * ═══ REGIMUL DE RAMBURS, CERUT SI VERIFICAT DIN ACELASI TOTAL ═══
 *
 * Panoul cere cotatia cu `cod: rambursDeIncasat(..., totalul PREVIZUALIZAT)`, iar
 * `updateOrderDetails` verifica semnatura cu acelasi ajutor. Multa vreme partea a doua folosea
 * `order.total`, adica totalul VECHI, cu explicatia ca „steagul e doar > 0".
 *
 * Nu era de ajuns, si asta apara proba de mai jos: pe o comanda neplatita cu total 0 in care
 * comerciantul adauga marfa, panoul cere „ramburs" si serverul verifica „platit". Semnatura nu
 * bate, `sePoateAplica` iese fals, si re-cotarea se arunca TACIT: comerciantul citeste „Comanda a
 * fost actualizata" peste transportul vechi. Exact felul in care a mai murit o data, cand se
 * verifica fara eticheta.
 *
 * ⚠ SE MASOARA PE AJUTOARELE ADEVARATE, nu pe siruri din sursa: si panoul si serverul cheama
 * `recalculeazaTotal` cu aceleasi intrari, apoi `rambursDeIncasat`. Daca cele doua formule se
 * despart vreodata, proba cade aici, nu la un comerciant.
 */
const comandaZero = {
  payment_status: "unpaid",
  total: 0,
  subtotal: 0,
  discount_amount: 0,
  card_discount_amount: 0,
  cod_discount_amount: 0,
  shipping_cost: 25,
};
const vatOprit = { vat_enabled: false, vat_rate: 0, prices_include_vat: false };

/** Totalul, socotit cum il socotesc AMANDOUA capetele: cu transportul vechi. */
function totalDupaEditare(subtotalNou: number): number {
  return recalculeazaTotal({
    subtotal: subtotalNou,
    extras: 0,
    discount: comandaZero.discount_amount,
    cardDiscount: comandaZero.card_discount_amount,
    codDiscount: comandaZero.cod_discount_amount,
    codFee: 0,
    shipping: comandaZero.shipping_cost,
    freeShippingThreshold: null,
    vat: vatOprit,
  }).total;
}

test("⚠ o comanda cu total 0 in care se adauga marfa NU pierde re-cotarea", () => {
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const opt = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus" };

  /* Panoul: totalul PREVIZUALIZAT, adica dupa ce s-au adaugat 500 de lei de marfa. */
  const totalNou = totalDupaEditare(500);
  const rambursCerut = rambursDeIncasat({ payment_status: comandaZero.payment_status, total: totalNou, order_source: null }) > 0;
  assert.equal(rambursCerut, true, "panoul n-ar mai cere ramburs pe o comanda neplatita de 500 lei");
  const [semnata] = semneazaOptiuni(BIZ, dest, rambursCerut, 0, [{ ...opt, price: 21 }]);

  /* Serverul: acelasi calcul, din datele lui. */
  const rambursVerificat = rambursDeIncasat({
    payment_status: comandaZero.payment_status,
    total: totalDupaEditare(500),
    order_source: null,
  }) > 0;
  assert.equal(
    verifica(BIZ, dest, 21, semnata.token, { ...opt, ramburs: rambursVerificat }),
    true,
    "re-cotarea din panou e refuzata tacit pe o comanda care era la total 0",
  );

  /*
   * ⚠ PERECHEA, ca proba sa insemne ceva: asa gresea inainte. Cu totalul VECHI (0), steagul iese
   * „platit" si semnatura nu mai bate, adica exact tacerea pe care o inchidem.
   */
  const cumGresea = rambursDeIncasat({
    payment_status: comandaZero.payment_status,
    total: comandaZero.total,
    order_source: null,
  }) > 0;
  assert.equal(cumGresea, false, "premisa s-a schimbat: totalul vechi nu mai da «platit»");
  assert.equal(
    verifica(BIZ, dest, 21, semnata.token, { ...opt, ramburs: cumGresea }),
    false,
    "proba e slaba: si cu steagul vechi semnatura ar fi trecut",
  );
});

test("⚠ si invers: golirea comenzii nu lasa un token de «ramburs» sa treaca drept «platit»", () => {
  /*
   * Cealalta jumatate a aceleiasi reguli. Steagul nu e o formalitate: cotatia „platit" e cea
   * IEFTINA, fiindca n-are comisionul de ramburs. Cine ar potrivi steagurile „ca sa mearga" ar
   * deschide chiar gaura pentru care exista.
   */
  const dest = { county: "Cluj", city: "Cluj-Napoca" };
  const opt = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus" };
  const [caRamburs] = semneazaOptiuni(BIZ, dest, true, 0, [{ ...opt, price: 24 }]);

  assert.equal(verifica(BIZ, dest, 24, caRamburs.token, { ...opt, ramburs: false }), false);
  assert.equal(verifica(BIZ, dest, 24, caRamburs.token, { ...opt, ramburs: true }), true);
});

test("⚠ SI APELANTUL chiar foloseste totalul nou, nu pe cel din comanda", () => {
  /*
   * ═══ ⚠ DE CE E NEAPARATA SI PROBA ASTA ═══
   *
   * Cele doua de mai sus apara REGULA, si trec verzi si daca `updateOrderDetails` s-ar intoarce
   * maine la `order.total`: ele isi construiesc singure amandoua capetele. Masurat cu un mutant care
   * pune la loc totalul vechi in ruta, niciuna n-a clipit.
   *
   * Un drum intreg nu se poate rula aici (`updateOrderDetails` cere sesiune, baza si catalog), dar
   * ce trebuie aparat e o singura hotarare: din CE total iese steagul. Aia se vede din sursa.
   *
   * ⚠ Comentariile se taie inainte de cautare: fisierul isi explica pe larg propria greseala
   * veche, iar o cautare peste el ar fi gasit `order.total` chiar in explicatie si ar fi picat pe
   * un cod corect.
   */
  const brut = readFileSync(path.resolve(process.cwd(), "src/lib/actions/order.actions.ts"), "utf8");
  const cod = brut
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const i = cod.indexOf("const semnaturaBuna = verificaCotatia(");
  assert.ok(i > 0, "verificarea cotatiei din panou si-a schimbat forma");
  /*
   * ⚠ Apelul se incheie acum cu `null);` (greutatea nu se judeca pe drumul panoului), nu cu `});`.
   * Se taie pana la `sePoateAplica`, prima linie de dupa el.
   */
  const apel = cod.slice(i, cod.indexOf("const sePoateAplica", i));

  assert.match(apel, /ramburs: rambursDeIncasat\(/, "steagul nu mai iese din `rambursDeIncasat`");
  assert.match(apel, /recalculeazaTotal\(/, "steagul nu se mai socoteste din totalul de dupa editare");
  assert.match(apel, /shipping: shippingDeBaza/, "totalul se socoteste cu alt transport decat vede panoul");
  assert.doesNotMatch(
    apel, /total: order\.total/,
    "steagul s-a intors pe totalul VECHI: re-cotarea moare tacit pe comenzile care erau la total 0",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   GREUTATEA COSULUI, LEGATA DE COTATIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ═══ ⚠ CE APARA, SI DE CE ABIA ACUM ═══
 *
 * Pana pe 08.09.2026 amprenta nu lega cosul: se cerea o cotatie pentru un cos usor, se primea un
 * token valid, si se comanda apoi unul greu la acelasi pret. Decizia de a lasa asa, luata pe
 * 04.08, era intemeiata ATUNCI: gaura se putea folosi la un singur magazin, cu produse de cel mult
 * un kilogram, iar o legare gresita trimite comenzi REALE pe `max(suma ceruta, tarif implicit)`.
 *
 * Premisa s-a schimbat, masurat: 16 magazine cu curier activ, 5.064 de produse cantarite, pana la
 * 40 de kilograme bucata.
 */
const DEST_CJ = { county: "Cluj", city: "Cluj-Napoca" };
const OPT_CARGUS = { courier: "cargus", deliveryType: "address", courierLabel: "Livrare prin Cargus", ramburs: false };

test("⚠ COSUL MAI GREU DECAT CEL COTAT nu mai trece", () => {
  /* Se coteaza un kilogram, se comanda cincisprezece: chiar forma atacului. */
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 1000);
  const v = verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 15000);
  assert.equal(v.ok, false, "cosul de 15 kg a trecut pe cotatia de 1 kg");
  assert.equal(v.ok === false && v.motiv, "greutate", "motivul nu spune ca e greutatea");
});

test("⚠ SI MOTIVUL CONTEAZA: greutatea cere recotare, semnatura cade pe tarif", () => {
  /*
   * ═══ ⚠ DOUA ESECURI, DOUA PURTARI OPUSE ═══
   *
   * Nota veche din `quote-token.ts` cerea explicit celui care reia legarea cosului: „nu lega cosul
   * cu esec pe tariful implicit. Esueaza in FAVOAREA clientului". Motivul e numeric: rezerva e
   * `max(suma ceruta, tarif implicit)`, deci pe „Ridicare personala" la 0,00 lei o cadere face
   * transportul 18 pana la 45 de lei, fara ca omul sa fi vazut suma.
   *
   * De aceea verdictul poarta MOTIVUL: `autoritativeShipping` cade pe tarif doar pentru semnatura,
   * si refuza comanda pentru greutate.
   */
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 1000);
  const stricat = verificaCotatia(BIZ, DEST_CJ, 19, t, OPT_CARGUS, 500);
  assert.equal(stricat.ok === false && stricat.motiv, "semnatura", "un pret schimbat da motiv de greutate");
});

test("⚠ COSUL MAI USOR TRECE, si asta e dinadins", () => {
  /*
   * ⚠ JUMATATEA CARE APARA COMENZILE CINSTITE. Intre cotatie si comanda serverul arunca liniile
   * indisponibile si desface pachetele pentru stoc; un cos care iese mai usor e un cos cinstit.
   * Clientul plateste atunci un transport prea scump PENTRU EL, iar comerciantul nu pierde nimic.
   * Cerut „identic", fiecare din cazurile astea ar fi blocat o comanda buna.
   */
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 15000);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 1000).ok, true, "un cos mai usor a fost refuzat");
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 0).ok, true, "un cos fara greutati a fost refuzat");
  /* Si exact cat s-a cotat, evident. */
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 15000).ok, true);
});

test("⚠ toleranta absoarbe o rotunjire, nu o bucata in plus", () => {
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 1000);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 1000 + TOLERANTA_GRAME).ok, true);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 1000 + TOLERANTA_GRAME + 1).ok, false);
  /*
   * ⚠ SI E MICA DINADINS: cel mai usor produs cantarit din platforma are zeci de grame, deci
   * toleranta nu poate acoperi nicio bucata. Larga, ar fi fost o portita cu numele de rotunjire.
   */
  assert.ok(TOLERANTA_GRAME < 50, `toleranta a crescut la ${TOLERANTA_GRAME} grame si poate ascunde o bucata`);
});

test("⚠ GRAMELE SUNT SEMNATE, nu doar purtate", () => {
  /*
   * Calatoresc in clar, ca verificarea sa aiba fata de ce sa compare. Daca n-ar fi acoperite de
   * semnatura, cine comanda greu ar rescrie pur si simplu numarul din token si ar trece.
   */
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 1000);
  const [expira, grame, mac] = t.split(".");
  assert.equal(grame, "1000", "gramele nu mai calatoresc in clar");

  const umflat = `${expira}.900000.${mac}`;
  const v = verificaCotatia(BIZ, DEST_CJ, 18, umflat, OPT_CARGUS, 15000);
  assert.equal(v.ok, false, "gramele rescrise de mana au trecut");
  assert.equal(v.ok === false && v.motiv, "semnatura", "rescrierea gramelor n-a cazut pe semnatura");
});

test("⚠ FARA greutate ceruta, greutatea nu se judeca deloc", () => {
  /*
   * Drumul panoului („Recoteaza transportul") coteaza fara lista de produse, deci semneaza zero
   * grame; comparata cu greutatea reala a comenzii, fiecare re-cotare din panou ar fi fost
   * refuzata. Acolo se trimite `null`, si atunci poarta tace.
   */
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 0);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, null).ok, true);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS).ok, true);
  /* ⚠ Iar cand CHIAR se cere, aceeasi cotatie de zero grame refuza un colet adevarat. */
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, t, OPT_CARGUS, 15000).ok, false);
});

test("⚠ TOKENELE DE FORMA VECHE se mai citesc, cat le tine viata", () => {
  /*
   * ═══ ⚠ DE CE E O PROBA ═══
   *
   * Un token traieste 24 de ore. In clipa desfasurarii, fiecare pagina de finalizare deschisa
   * poarta unul de forma veche, cu doua bucati. Refuzate, ar fi cazut comenzi CINSTITE, in curs, la
   * 16 magazine. Gaura a stat deschisa luni de zile; inca o zi de coada nu schimba nimic, in timp
   * ce comenzile pierdute ar fi fost pierdute de-a binelea.
   *
   * Tokenul de mai jos se compune in forma VECHE, cu semnatura veche, nu prin functia de azi:
   * altfel proba s-ar muta odata cu codul si n-ar mai apara nimic.
   */
  const expira = Date.now() + 60_000;
  const amprentaVeche = [
    BIZ, "cluj", "cluj-napoca", "ro", "", "1800", "cargus", "address", "livrare prin cargus", "platit",
  ].join("|");
  const mac = createHmac("sha256", process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    .update(`${amprentaVeche}|${expira}`)
    .digest("base64url");
  const vechi = `${expira}.${mac}`;

  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, vechi, OPT_CARGUS).ok, true, "un token de forma veche nu mai trece");
  /* ⚠ Si pe el greutatea NU se judeca: n-o poarta, deci n-avem fata de ce sa comparam. */
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, vechi, OPT_CARGUS, 15000).ok, true);
});

test("⚠ un token cu mai mult de trei bucati nu trece", () => {
  /* Forma se citeste strict: doua bucati (vechi) sau trei (nou), nimic altceva. */
  const t = signShippingQuote(BIZ, DEST_CJ, 18, OPT_CARGUS, 1000);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, `${t}.inca-ceva`, OPT_CARGUS, 0).ok, false);
  assert.equal(verificaCotatia(BIZ, DEST_CJ, 18, "fara-nimic", OPT_CARGUS, 0).ok, false);
});
