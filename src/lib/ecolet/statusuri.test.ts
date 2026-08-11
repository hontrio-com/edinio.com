import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cheieStatus,
  clasificaStatus,
  eStareFinala,
  esteRetur,
  statusComandaDinNume,
  statusUrmator,
  trebuieSemnalat,
} from "./statusuri";

/*
 * ⚠ eColet NU publica lista de statusuri. Specificatia da forma („name": „new",
 * „real_name": „Shipment data received") si atat. Fisierul probat aici e deci o
 * PRESUPUNERE despre vocabular, iar probele sunt singurul loc unde presupunerea
 * se vede scrisa.
 *
 * Un status tradus gresit nu crapa nimic: comanda ajunge tacut in starea
 * nepotrivita — iar „livrata" o inchide, o scoate din urmarire si, la magazinele
 * cu facturare automata, emite si factura.
 */

test("cheia se curata de diacritice, majuscule si punctuatie", () => {
  assert.equal(cheieStatus("În Tranzit"), "in tranzit");
  assert.equal(cheieStatus("Shipment data received"), "shipment data received");
  assert.equal(cheieStatus(null), "");
});

test("⚠ se citesc AMANDOUA campurile, nu doar `name`", () => {
  /*
   * `name` e cheia scurta („new"), `real_name` e fraza („Shipment data
   * received"). Oricare poate purta intelesul, iar la un broker care agrega mai
   * multi curieri nu avem nicio garantie ca prima e mereu completata.
   */
  assert.equal(clasificaStatus("x7", "Delivered to recipient"), "livrat");
  assert.equal(clasificaStatus("delivered", null), "livrat");
});

// ─── Livrarea ─────────────────────────────────────────────────────────────────

test("livrarea inchide comanda", () => {
  assert.equal(statusComandaDinNume("delivered"), "delivered");
  assert.equal(statusComandaDinNume("livrat"), "delivered");
  assert.equal(statusComandaDinNume(null, "Proof of delivery received"), "delivered");
});

test("⚠ o livrare NEGATA nu inchide comanda", () => {
  /*
   * Cea mai scumpa greseala din fisier. Fara lista de negatii, fiecare dintre
   * numele de mai jos ar fi inchis comanda ca livrata — si la o comanda cu plata
   * la livrare asta inseamna bani marcati incasati care nu s-au incasat.
   */
  for (const [n, r] of [
    ["not_delivered", "Not delivered"],
    ["failed", "Delivery failed"],
    ["refused", "Delivery refused by recipient"],
    ["partial", "Partially delivered"],
    ["cancelled", "Delivery cancelled"],
  ] as const) {
    assert.notEqual(statusComandaDinNume(n, r), "delivered", `${n} / ${r}`);
  }
});

test("⚠ „ pod ” e incadrat: „podul” nu e o livrare", () => {
  assert.equal(clasificaStatus(null, "POD signed"), "livrat");
  assert.notEqual(clasificaStatus(null, "Blocat pe podul de la Cernavoda"), "livrat");
});

// ─── Restul treptelor ─────────────────────────────────────────────────────────

test("expedierea din reteaua curierului inseamna comanda expediata", () => {
  assert.equal(statusComandaDinNume("in_transit", "In transit"), "shipped");
  assert.equal(statusComandaDinNume("picked_up", "Picked up by courier"), "shipped");
  assert.equal(statusComandaDinNume(null, "Out for delivery"), "shipped");
  assert.equal(statusComandaDinNume(null, "Arrived at hub"), "shipped");
});

test("⚠ „new” inseamna ca marfa e INCA la comerciant", () => {
  /*
   * E chiar exemplul din specificatie: „new" / „Shipment data received". eColet
   * stie de expediere, curierul n-a luat-o. Marcata „expediata", comanda ar minti
   * clientul — si daca merchantul trimite instiintarea, l-ar minti in scris.
   */
  assert.equal(statusComandaDinNume("new", "Shipment data received"), "processing");
  assert.equal(statusComandaDinNume(null, "AWB generated"), "processing");
  assert.equal(statusComandaDinNume(null, "Awaiting pickup"), "processing");
});

test("⚠ „awaiting pickup” bate „pickup”", () => {
  /* Ambele radacini sunt in text; marfa insa n-a plecat inca. */
  assert.equal(clasificaStatus(null, "Awaiting pickup"), "la_comerciant");
  assert.equal(clasificaStatus(null, "Picked up"), "in_retea");
});

test("un status necunoscut nu misca nimic", () => {
  assert.equal(statusComandaDinNume("zz_intern", "Internal check 7B"), null);
  assert.equal(clasificaStatus("", ""), "necunoscut");
  assert.equal(statusComandaDinNume(null, null), null);
});

// ─── Sfarsiturile proaste ─────────────────────────────────────────────────────

test("⚠ returul nu inchide si nu anuleaza comanda", () => {
  assert.equal(statusComandaDinNume("returned", "Returned to sender"), null);
  assert.ok(trebuieSemnalat("returned", "Returned to sender"));
  assert.ok(esteRetur("returned", "Returned to sender"));
  assert.ok(!esteRetur("in_transit", "In transit"));
});

test("marfa avariata sau pierduta nu se inchide singura", () => {
  for (const r of ["Parcel damaged", "Parcel lost", "Stolen in transit"]) {
    assert.equal(statusComandaDinNume(null, r), null, r);
    assert.ok(trebuieSemnalat(null, r), r);
  }
});

test("⚠ un eveniment poate SI sa mute comanda, SI sa ceara atentie", () => {
  /* O incercare esuata inseamna si ca marfa e in retea, si ca cineva trebuie sunat. */
  assert.equal(statusComandaDinNume(null, "Delivery attempt failed"), "shipped");
  assert.ok(trebuieSemnalat(null, "Delivery attempt failed"));
});

test("ce nu e de semnalat chiar nu se semnaleaza", () => {
  for (const r of ["In transit", "Delivered", "Picked up", "Shipment data received"]) {
    assert.ok(!trebuieSemnalat(null, r), r);
  }
});

// ─── Scara comenzii ───────────────────────────────────────────────────────────

test("⚠ statusul nu coboara niciodata", () => {
  assert.equal(statusUrmator("delivered", null, "In transit"), null);
  assert.equal(statusUrmator("shipped", "new", "Shipment data received"), null);
  assert.equal(statusUrmator("processing", null, "In transit"), "shipped");
  assert.equal(statusUrmator("shipped", null, "Delivered"), "delivered");
});

test("⚠ o comanda anulata sau rambursata nu se misca de la un curier", () => {
  assert.equal(statusUrmator("cancelled", null, "Delivered"), null);
  assert.equal(statusUrmator("refunded", null, "Delivered"), null);
});

// ─── Iesirea din urmarire ─────────────────────────────────────────────────────

test("⚠ starile incheiate scot expedierea din raza cronului", () => {
  assert.ok(eStareFinala(null, "Delivered"));
  assert.ok(eStareFinala("returned", "Returned to sender"));
  assert.ok(eStareFinala(null, "Parcel lost"));
  assert.ok(eStareFinala("cancelled", "Cancelled"));
});

test("⚠ o livrare NEGATA nu e stare finala", () => {
  /*
   * Scoasa din urmarire, comanda ar fi ramas expediata pentru totdeauna, cu marfa
   * blocata undeva si fara nicio rulare viitoare care sa mai afle ceva.
   */
  assert.ok(!eStareFinala(null, "Delivery failed"));
  assert.ok(!eStareFinala(null, "Not delivered"));
  assert.ok(!eStareFinala(null, "In transit"));
  assert.ok(!eStareFinala(null, null));
});

// ─── Invariante ───────────────────────────────────────────────────────────────

test("⚠ ce e final si nu misca statusul trebuie sa fie si de semnalat", () => {
  /*
   * Altfel o expediere s-ar opri din urmarire fara ca nimeni sa afle de ce:
   * comanda ramane „expediata", cronul n-o mai intreaba, si nu exista notificare.
   */
  for (const r of ["Returned to sender", "Parcel lost", "Destroyed", "Cancelled"]) {
    assert.ok(eStareFinala(null, r), `${r} ar trebui finala`);
    assert.equal(statusComandaDinNume(null, r), null, `${r} nu misca statusul`);
    assert.ok(trebuieSemnalat(null, r), `${r} trebuie semnalat`);
  }
});

test("⚠ nicio livrare recunoscuta nu e in acelasi timp semnal de problema", () => {
  for (const r of ["Delivered", "Livrat", "Proof of delivery received"]) {
    assert.equal(clasificaStatus(null, r), "livrat", r);
    assert.ok(!trebuieSemnalat(null, r), `${r} nu are de ce sa alarmeze`);
  }
});

test("clasificarea e stabila oricum ar fi scris statusul", () => {
  const forme = ["in transit", "IN TRANSIT", "  În   Transit  ", "In-Transit"];
  const asteptat = clasificaStatus(null, forme[0]);
  for (const f of forme) assert.equal(clasificaStatus(null, f), asteptat, f);
});

test("⚠ memoria urmaririi sta pe CLASA, nu pe fraza", () => {
  /*
   * Cronul retine ce a prelucrat ca sa nu anunte de doua ori acelasi lucru. Prima
   * forma lipea `real_name` in cheie — text care se schimba la fiecare scanare —
   * si atunci un singur retur producea patru notificari.
   *
   * Testul fixeaza proprietatea de care depinde cheia: fraze diferite ale
   * ACELUIASI eveniment dau aceeasi clasa, deci aceeasi cheie.
   */
  const cheie = (scurt: string | null, real: string | null) =>
    [scurt, clasificaStatus(scurt, real)].filter(Boolean).join("|");

  const acelasiRetur = [
    "Return in transit",
    "Colet retur sortat in hub Bucuresti",
    "Retur - in curs de returnare catre expeditor",
  ];
  const prima = cheie("returned", acelasiRetur[0]);
  for (const f of acelasiRetur) {
    assert.equal(cheie("returned", f), prima, `„${f}" nu are voie sa mute cheia`);
  }

  /* Dar un INTELES nou trebuie sa mute cheia, altfel nu s-ar anunta nimic. */
  assert.notEqual(cheie("returned", "Returned to sender"), cheie("delivered", "Livrat"));
});
