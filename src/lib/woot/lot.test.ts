import test from "node:test";
import assert from "node:assert/strict";

import type { WootPriceResult } from "@/lib/woot";
import {
  FARA_SERVICII_DE_LOT, MESAJUL_SARIRII, cerePunctDePredare, etichetaServiciului,
  livreazaLaPunct, regasesteServiciul, serviciiPentruLot,
} from "./lot";

function serviciu(p: Partial<WootPriceResult>): WootPriceResult {
  return {
    service_id: 1, service_name: "Standard", courier_id: 7, courier_name: "DPD",
    price: 20, tax: 4, total: 24, final_price: 20, final_tax: 4, final_total: 24,
    return_price: null, errors: [], ...p,
  };
}

/* ── Predarea la punct ──────────────────────────────────────────────────── */

test("„door” la ridicare nu cere punct de predare", () => {
  assert.equal(cerePunctDePredare(serviciu({ service_pickup: "door" })), false);
  assert.equal(cerePunctDePredare(serviciu({ service_pickup: undefined })), false);
});

test("⚠ orice ALTCEVA decat „door” cere punct de predare", () => {
  /*
   * ⚠ Se judeca prin EXCLUDERE, nu pe o lista de valori cunoscute. Woot n-a documentat
   * multimea valorilor; o lista alba („locker”, „pudo”) ar fi tacut la prima valoare
   * noua, si lotul ar fi trimis emiterea fara `sender_location_id` — refuzata de ei,
   * sau, mai rau, acceptata cu o ridicare pe care n-o asteapta nimeni.
   *
   * Cazul masurat: 264 din 267 de expedieri ale magazinului sunt „locatie - adresa”.
   */
  for (const v of ["locker", "location", "pudo", "point", "ceva-nou"]) {
    assert.equal(cerePunctDePredare(serviciu({ service_pickup: v })), true, v);
  }
});

/* ── Livrarea la punct ──────────────────────────────────────────────────── */

test("⚠⚠ serviciile cu livrare la punct NU intra in lot", () => {
  /*
   * ⚠ ASTA E REGULA CARE APARA CEL MAI MULT. Punctul de livrare e altul pentru fiecare
   * cumparator, in localitatea LUI. O alegere facuta o data pentru tot lotul ar fi
   * trimis coletele a zece oameni la acelasi locker, pe adresa altcuiva — si s-ar fi
   * aflat de la clienti, dupa livrare.
   */
  const laUsa = serviciu({ service_id: 1, service_delivery: "door" });
  const laLocker = serviciu({ service_id: 2, service_delivery: "locker" });
  const faraCamp = serviciu({ service_id: 3, service_delivery: undefined });

  assert.equal(livreazaLaPunct(laLocker), true);
  assert.equal(livreazaLaPunct(laUsa), false);
  assert.equal(livreazaLaPunct(faraCamp), false);

  const oferite = serviciiPentruLot([laUsa, laLocker, faraCamp]);
  assert.deepEqual(oferite.map((s) => s.service_id), [1, 3]);
});

test("⚠ predarea la punct RAMANE ingaduita, desi livrarea la punct nu", () => {
  /*
   * Cele doua nu sunt acelasi lucru, si confuzia ar fi scos tocmai serviciul pe care
   * il foloseste magazinul: la „locatie - adresa” EL preda la un punct (acelasi mereu),
   * iar coletul pleaca la ADRESA cumparatorului.
   */
  const alLui = serviciu({ service_pickup: "location", service_delivery: "door" });
  assert.equal(cerePunctDePredare(alLui), true);
  assert.equal(livreazaLaPunct(alLui), false);
  assert.equal(serviciiPentruLot([alLui]).length, 1);
});

test("cand toate livreaza la punct, lista iese goala si exista un mesaj pentru asta", () => {
  const doar = [serviciu({ service_delivery: "locker" }), serviciu({ service_id: 2, service_delivery: "pudo" })];
  assert.deepEqual(serviciiPentruLot(doar), []);
  assert.ok(FARA_SERVICII_DE_LOT.length > 40);
  assert.match(FARA_SERVICII_DE_LOT, /individual/);
});

/* ── Eticheta ───────────────────────────────────────────────────────────── */

test("⚠ eticheta serviciului are ACEEASI forma ca la emiterea pe bucata", () => {
  /*
   * `woot_service_name` e singurul loc in care se mai vede serviciul dupa emitere. Doua
   * forme ar fi insemnat ca aceeasi expediere arata altfel dupa cum a fost emisa — si
   * exact asta s-a intamplat deja odata, cand emdash-ul a fost scos si acelasi serviciu
   * a ajuns scris in doua feluri in baza.
   */
  assert.equal(
    etichetaServiciului(serviciu({ courier_name: "DPD", service_name: "locatie - adresa" })),
    "DPD · locatie - adresa",
  );
});

/* ── Regasirea pe alta ruta ─────────────────────────────────────────────── */

test("⚠ serviciul se cauta DIN NOU in cotatia fiecarei comenzi", () => {
  /*
   * Cotatia e pe ruta: acelasi `service_id` poate lipsi cu totul pe alta adresa.
   * Trimis orbeste, Woot ar fi raspuns cu o eroare pe care nimeni n-ar fi stiut s-o
   * citeasca — si asta pe o operatie care COSTA.
   */
  const peAltaRuta = [serviciu({ service_id: 9 }), serviciu({ service_id: 12 })];
  assert.equal(regasesteServiciul(peAltaRuta, 12)?.service_id, 12);
  assert.equal(regasesteServiciul(peAltaRuta, 7), undefined);
  assert.equal(regasesteServiciul([], 12), undefined);
});

/* ── Mesajele ───────────────────────────────────────────────────────────── */

test("⚠ fiecare motiv de sarire spune si ce are omul de facut", () => {
  /*
   * „Sărită” fara motiv arata ca un lot care a mers pe jumatate, si il trimite pe
   * comerciant sa caute prin tabel. Aceeasi regula ca la `motiveSarite` din
   * `bulk-orders.actions.ts`.
   */
  const motive = Object.entries(MESAJUL_SARIRII);
  assert.equal(motive.length, 4);
  for (const [cheie, mesaj] of motive) {
    assert.ok(mesaj.length > 40, `${cheie}: mesajul e prea scurt ca sa spuna ceva`);
    assert.ok(/[.!]$/.test(mesaj.trim()), `${cheie}: mesajul nu e o propozitie incheiata`);
  }
});

test("⚠ motivul pentru o comanda care are deja AWB spune CE s-ar fi intamplat", () => {
  /* Un al doilea AWB la Woot e un al doilea colet, platit. Nu e o formalitate. */
  assert.match(MESAJUL_SARIRII["are-deja"], /al doilea colet|plătit/);
});
