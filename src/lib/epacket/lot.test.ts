import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { EpacketConfig, LocalitateEpacket, PunctEpacket } from "./client";
import { ASTEPTARE_DRUM_LOT_MS, ASTEPTARE_LOT_MS, TERMEN_PREGATIRE_MS, dateEpacketPentruLot, type CautariLot, type ComandaLot } from "./lot";
import { ASTEPTARE_EMITERE_MS } from "./client";

const CONFIG: EpacketConfig = {
  enabled: true, api_key: "epk_live_x", curier_adresa: "DPD", asigurare: false, deschidere_colet: true,
  expeditor: { prenume: "Magazin", nume: "Proba", telefon: "0712345678", email: "comenzi@magazin.ro", localitate_id: 14515, cod_postal: "010011", strada: "Strada Exemplu", numar: "5" },
  dimensiuni_implicite: { lungime: 30, latime: 20, inaltime: 10 },
};

const CLUJ: LocalitateEpacket = { id: 109, nume: "CLUJ NAPOCA", afisare: "Cluj Napoca (Cluj)", judet: "CJ" };
const OFICIU: PunctEpacket = { id: "909", nume: "CLUJ", tip: "office", adresa: "x", codPostal: "400001", localitateId: 109, lat: 1, lng: 1 };

function cautari(over: Partial<CautariLot> = {}): CautariLot & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    cauta: async (q, j, ms) => { log.push(`cauta ${q}|${j}|${ms}`); return q.includes("cluj") ? [CLUJ] : []; },
    puncte: async (c, id, ms) => { log.push(`puncte ${c}|${id}|${ms}`); return c === "DPD" ? [OFICIU] : []; },
    ...over,
  };
}

const COMANDA: ComandaLot = {
  customer_name: "Ana Ionescu", customer_phone: "0722333444", customer_email: "", total: 150,
  shipping_address: { city: "Cluj-Napoca", county: "Cluj", address: "Str. Mare nr. 12, bl. A2, ap. 7" },
  items: [{ name: "Tricou" }],
};

test("o comanda obisnuita: localitatea, codul postal din oficiul DPD, adresa despartita", async () => {
  const c = cautari();
  const r = await dateEpacketPentruLot(CONFIG, COMANDA, 1.2, 150, c);
  assert.ok("date" in r, JSON.stringify(r));
  const d = r.date;
  assert.equal(d.tip, "D2D");
  assert.equal(d.curier, "DPD");
  assert.deepEqual([d.destinatar.prenume, d.destinatar.nume], ["Ana", "Ionescu"]);
  assert.equal(d.destinatar.localitateId, 109);
  assert.equal(d.destinatar.codPostal, "400001");
  assert.deepEqual([d.destinatar.strada, d.destinatar.numar, d.destinatar.bloc, d.destinatar.apartament], ["Str. Mare", "12", "A2", "7"]);
  /* Comanda n-are email: pleaca al magazinului (e-packet il cere). */
  assert.equal(d.destinatar.email, "comenzi@magazin.ro");
  /* Deschiderea la DPD merge doar cu ramburs: aici are. */
  assert.equal(d.deschidere, true);
  /* Citirile poarta termenul SCURT al lotului. */
  assert.ok(c.log.every((l) => l.endsWith(`|${ASTEPTARE_LOT_MS}`)), c.log.join("; "));
});

test("deschiderea NU pleaca la DPD fara ramburs (emiterea ar fi refuzata)", async () => {
  const r = await dateEpacketPentruLot(CONFIG, COMANDA, 1, 0, cautari());
  assert.ok("date" in r);
  assert.equal(r.date.deschidere, false);
});

test("⚠ in lot NU se ghiceste: localitate, numar, nume, cod postal nelamurite = motiv", async () => {
  const faraLoc = await dateEpacketPentruLot(CONFIG, { ...COMANDA, shipping_address: { city: "Atlantida", county: "Cluj", address: "Str. Mare 12" } }, 1, 0, cautari());
  assert.ok("motiv" in faraLoc && /fereastra/.test(faraLoc.motiv));
  const faraNumar = await dateEpacketPentruLot(CONFIG, { ...COMANDA, shipping_address: { city: "Cluj-Napoca", county: "Cluj", address: "Strada Florilor" } }, 1, 0, cautari());
  assert.ok("motiv" in faraNumar && /numar/.test(faraNumar.motiv));
  const faraNume = await dateEpacketPentruLot(CONFIG, { ...COMANDA, customer_name: "Li Wu" }, 1, 0, cautari());
  assert.ok("motiv" in faraNume && /prenume si nume/.test(faraNume.motiv));
  const faraCod = await dateEpacketPentruLot(CONFIG, COMANDA, 1, 0, cautari({ puncte: async () => [] }));
  assert.ok("motiv" in faraCod && /codul postal/.test(faraCod.motiv));
});

test("codul postal scris pe comanda bate pe cel dedus, si nu mai cere punctele", async () => {
  const c = cautari();
  const r = await dateEpacketPentruLot(CONFIG, { ...COMANDA, shipping_address: { ...(COMANDA.shipping_address as object), postal_code: "400123" } }, 1, 0, c);
  assert.ok("date" in r);
  assert.equal(r.date.destinatar.codPostal, "400123");
  assert.equal(c.log.some((l) => l.startsWith("puncte")), false);
});

test("comanda la locker din checkout: reteaua din id, fara adresa", async () => {
  const c = cautari();
  const r = await dateEpacketPentruLot(CONFIG, { ...COMANDA, shipping_address: { courier: "epacket", delivery_type: "locker", locker_id: "SDY:79" } }, 1, 0, c);
  assert.ok("date" in r);
  assert.equal(r.date.tip, "D2L");
  assert.equal(r.date.curier, "SDY");
  assert.equal(r.date.punctId, "79");
  assert.equal(c.log.length, 0, "la punct nu se cauta nimic");
  const strain = await dateEpacketPentruLot(CONFIG, { ...COMANDA, shipping_address: { courier: "epacket", delivery_type: "locker", locker_id: "79" } }, 1, 0, c);
  assert.ok("motiv" in strain, "un id fara retea nu se trimite pe ghicite");
});

test("⚠ dupa termenul pregatirii nu mai porneste nicio citire", async () => {
  let t = 0;
  const c = cautari({ acum: () => t });
  /* Ceasul sare peste termen dupa prima citire. */
  const cauta = c.cauta;
  c.cauta = async (q, j, ms) => { const r = await cauta(q, j, ms); t = TERMEN_PREGATIRE_MS + 1; return r; };
  const r = await dateEpacketPentruLot(CONFIG, COMANDA, 1, 0, c);
  assert.ok("motiv" in r && /codul postal/.test(r.motiv));
  assert.equal(c.log.filter((l) => l.startsWith("puncte")).length, 0);
});

test("⚠ cel mai lung drum din lot e socotit din constantele lui, nu scris din cap", () => {
  assert.equal(ASTEPTARE_DRUM_LOT_MS, TERMEN_PREGATIRE_MS + ASTEPTARE_LOT_MS + ASTEPTARE_EMITERE_MS);
});

test("⚠⚠ punctul ALTUI curier NU pleaca in lot, nici la adresa punctului, nici acasa", async () => {
  /* Forma reala a comenzii #0001 din baza demo (07.10.2026): `address` e adresa FANbox-ului. */
  const c = cautari();
  const r = await dateEpacketPentruLot(CONFIG, {
    ...COMANDA,
    shipping_address: {
      city: "Cluj-Napoca", county: "Cluj", address: "Str. Fabricii 2 (Kaufland)",
      courier: "curiera", courier_label: "Curiera: locker sau punct de ridicare", delivery_type: "locker",
      locker_id: "16478", locker_name: "FANbox Kaufland Fabricii", home_address: "Str. Mare nr. 12",
    },
  }, 1, 0, c);
  assert.ok("motiv" in r, JSON.stringify(r));
  assert.match(r.motiv, /FANbox Kaufland Fabricii/);
  assert.match(r.motiv, /fereastra/);
  /* Nicio citire: hotararea se ia inainte de orice cerere catre ei. */
  assert.deepEqual(c.log, []);
});
