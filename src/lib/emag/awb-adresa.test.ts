import test from "node:test";
import assert from "node:assert/strict";

import { participantAwb } from "./awb-adresa";

/* ══════════════════════════════════════════════════════════════════════════
   ADRESA DE PE AWB (audit 24.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

/** Exact ce trimit ei, copiat din comanda 500822531. */
const CLIENT_ADEVARAT = {
  name: "Ionut Popescu",
  contact: "Ionut Popescu",
  phone1: "0722123456",
  street: "Str. Traian Popovici nr. 128A, bl. B4F, sc.1, et.5, ap.62",
  localityId: "4",
  zipcode: "",
};

test("`locality_id` pleaca, si ca NUMAR: fara el, cererea e refuzata din prima", () => {
  /*
   * ⚠ Schema lor: `AWBParticipant.required` are `locality_id`. Lipsea din toate
   * incarcaturile de AWB, iar `emag_awb` avea zero randuri — deci s-ar fi aflat la prima
   * apasare de dupa anunt.
   */
  const r = participantAwb(CLIENT_ADEVARAT);
  assert.equal(r.fel, "gata");
  if (r.fel !== "gata") return;
  assert.equal(r.participant.locality_id, 4, "numar, nu sirul „4” cum vine de la ei");
});

test("`zipcode` gol NU se trimite: dat asa, strica cererea de unul singur", () => {
  /*
   * ⚠ `cl.shipping_postal_code ?? ""` nu prindea sirul gol — iar ei chiar sirul gol il
   * trimit, pe amandoua comenzile reale. Schema cere `minLength: 1`, dar campul NU e
   * obligatoriu: nedat e in regula, dat gol e refuz.
   */
  const r = participantAwb(CLIENT_ADEVARAT);
  assert.equal(r.fel, "gata");
  if (r.fel !== "gata") return;
  assert.ok(!("zipcode" in r.participant), "campul lipseste cu totul, nu e sir gol");
});

test("`zipcode` adevarat se trimite", () => {
  const r = participantAwb({ ...CLIENT_ADEVARAT, zipcode: "030167" });
  assert.equal(r.fel, "gata");
  if (r.fel !== "gata") return;
  assert.equal(r.participant.zipcode, "030167");
});

test("fara localitate se refuza in romaneste, inainte de a cheltui o cerere", () => {
  const r = participantAwb({ ...CLIENT_ADEVARAT, localityId: null });
  assert.equal(r.fel, "lipseste");
  if (r.fel !== "lipseste") return;
  assert.match(r.mesaj, /localitatea/);
  /* ⚠ Numele campului din API n-are ce cauta pe ecran: omului nu-i spune nimic. */
  assert.ok(!r.mesaj.includes("locality_id"));
});

test("telefonul se masoara in cifre, nu in caractere", () => {
  /* ⚠ „8–11 digits" e despre cifre. Numarat pe textul brut, „(021) 12" ar fi trecut. */
  const r = participantAwb({ ...CLIENT_ADEVARAT, phone1: "(021) 12" });
  assert.equal(r.fel, "lipseste");
  if (r.fel !== "lipseste") return;
  assert.match(r.mesaj, /telefonul/);
});

test("lipsurile se spun toate deodata, nu una pe apasare", () => {
  const r = participantAwb({ localityId: null });
  assert.equal(r.fel, "lipseste");
  if (r.fel !== "lipseste") return;
  for (const cuvant of ["numele", "telefonul", "strada", "localitatea"]) {
    assert.ok(r.mesaj.includes(cuvant), `lipseste „${cuvant}” din mesaj: ${r.mesaj}`);
  }
});

test("numele scurt din schema lor (sub 3 litere) se prinde aici, nu la ei", () => {
  const r = participantAwb({ ...CLIENT_ADEVARAT, name: "Io", contact: "Io" });
  assert.equal(r.fel, "lipseste");
});
