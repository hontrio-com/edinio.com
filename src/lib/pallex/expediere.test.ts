import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adaugaZileLucratoare,
  curata,
  inainteDe,
  lipsuriAdresa,
  oraNormalizata,
  paletComplet,
  partidaPallEx,
  ziuaInRomania,
  type AdresaComanda,
  type DatePartida,
} from "./expediere";

/*
 * ⚠ Pall-Ex nu are mediu de test si nu are niciun endpoint public: toate cer
 * autentificare. Deci prima verificare pe fir e o partida REALA, facturata.
 *
 * Fisierul asta e singurul loc unde se poate verifica ceva inainte de atunci, si
 * de aceea probeaza si lucrurile care par evidente — o data calculata gresit sau
 * un judet netradus nu crapa nimic: partida pleaca, si se afla de la sofer.
 */

const EXPEDITOR: AdresaComanda = {
  nume: "Depozit Central",
  strada: "Str. Stefan cel Mare 193",
  oras: "Sibiu",
  judet: "Sibiu",
  codPostal: "550321",
  telefon: "0269202222",
};

const DESTINATAR: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Bd. Independentei 12",
  stradaExtra: "bl. A, sc. 2",
  oras: "Brasov",
  judet: "Brasov",
  codPostal: "500091",
  telefon: "+40 712 345 678",
};

function date(peste: Partial<DatePartida> = {}): DatePartida {
  return {
    referinta: "0042",
    tip: 3,
    expeditor: EXPEDITOR,
    destinatar: DESTINATAR,
    dataRidicare: "2026-09-01",
    oraDeschidereRidicare: "08:00",
    oraInchidereRidicare: "17:00",
    dataLivrare: "2026-09-03",
    oraDeschidereLivrare: "09:00",
    oraInchidereLivrare: "16:00",
    numarPaleti: 2,
    greutateKg: 640,
    ...peste,
  };
}

// ─── Judetul ──────────────────────────────────────────────────────────────────

test("⚠ judetul pleaca drept COD ISO auto, nu ca nume", () => {
  /*
   * Specificatia ClientPlus exemplifica `consignor_county` cu „SB" si
   * `consignee_county` cu „B". Trimis ca nume, campul e ori respins, ori acceptat
   * si ignorat — si atunci partida pleaca fara judet.
   */
  const p = partidaPallEx(date());
  assert.equal(p.consignor_county, "SB");
  assert.equal(p.consignee_county, "BV");
});

test("capitala are cod de o singura litera", () => {
  const p = partidaPallEx(date({
    destinatar: { ...DESTINATAR, oras: "Bucuresti", judet: "Municipiul Bucuresti" },
  }));
  assert.equal(p.consignee_county, "B");
});

test("judetul venit in alta forma se potriveste tot", () => {
  const p = partidaPallEx(date({
    destinatar: { ...DESTINATAR, judet: "BISTRIŢA-NĂSĂUD" },
  }));
  assert.equal(p.consignee_county, "BN");
});

// ─── Adresa ───────────────────────────────────────────────────────────────────

test("strada si detaliul se unesc intr-un singur camp", () => {
  const p = partidaPallEx(date());
  assert.equal(p.consignee_address, "Bd. Independentei 12, bl. A, sc. 2");
});

test("⚠ nimic nu se taie, in afara de referinta noastra", () => {
  /*
   * Specificatia nu declara `maxLength` la niciun camp. Taiat din presupunere,
   * o adresa ciuntita pleaca TACUT; netaiat, Pall-Ex raspunde 422 — un refuz
   * dovedit, cu numele campului in el, pe care comerciantul il poate repara.
   */
  const lunga = "Bulevardul Alexandru Ioan Cuza numarul 1234, bloc A12, scara C, etaj 7, apartament 71, interfon 71";
  const p = partidaPallEx(date({
    destinatar: { ...DESTINATAR, strada: lunga, stradaExtra: null },
  }));
  assert.equal(p.consignee_address, lunga);
});

test("referinta se taie la 20 de caractere", () => {
  const p = partidaPallEx(date({ referinta: "012345678901234567890123456789" }));
  assert.equal(p.client_reference, "01234567890123456789");
  assert.equal(p.client_reference!.length, 20);
});

test("spatiile multiple se strang", () => {
  assert.equal(curata("  Str.   Lunga    12 "), "Str. Lunga 12");
  assert.equal(curata(null), "");
  assert.equal(curata(undefined), "");
});

test("numele firmei bate numele persoanei, contactul ramane persoana", () => {
  const p = partidaPallEx(date({
    destinatar: { ...DESTINATAR, companie: "Firma Beta SRL" },
  }));
  assert.equal(p.consignee_name, "Firma Beta SRL");
  assert.equal(p.consignee_contact, "Ion Popescu");
});

test("telefonul se normalizeaza, ca la ceilalti curieri", () => {
  const p = partidaPallEx(date());
  assert.equal(p.consignee_phone, "0712345678");
});

test("telefonul lipsa nu trimite camp gol", () => {
  const p = partidaPallEx(date({
    destinatar: { ...DESTINATAR, telefon: null },
  }));
  assert.ok(!("consignee_phone" in p), "campul nu se trimite gol");
});

// ─── Verificarea adresei, inainte de orice atingere a furnizorului ────────────

test("o adresa completa nu are lipsuri", () => {
  assert.deepEqual(lipsuriAdresa(DESTINATAR, "destinatar"), []);
  assert.deepEqual(lipsuriAdresa(EXPEDITOR, "expeditor"), []);
});

test("⚠ codul postal e OBLIGATORIU la Pall-Ex, spre deosebire de ceilalti curieri", () => {
  /*
   * `consignee_postcode` e in lista `required` a specificatiei. Ceilalti sase
   * curieri il primesc gol fara sa se planga, deci checkout-ul nu-l cere — de aia
   * lipsa lui trebuie prinsa aici, cu un mesaj limpede, nu la un 422 fara text.
   */
  const lipsuri = lipsuriAdresa({ ...DESTINATAR, codPostal: null }, "destinatar");
  assert.deepEqual(lipsuri, ["codul postal al destinatarului"]);
});

test("⚠ un judet nerecunoscut e o lipsa, nu o ghicire", () => {
  const lipsuri = lipsuriAdresa({ ...DESTINATAR, judet: "Chisinau" }, "destinatar");
  assert.equal(lipsuri.length, 1);
  assert.ok(lipsuri[0].includes("Chisinau"), "mesajul spune ce a primit: " + lipsuri[0]);
});

test("adresa goala isi enumera toate lipsurile deodata", () => {
  const lipsuri = lipsuriAdresa(
    { nume: "", strada: "", oras: "", judet: "", codPostal: "" },
    "destinatar",
  );
  assert.equal(lipsuri.length, 5, lipsuri.join(", "));
});

// ─── Date si ore ──────────────────────────────────────────────────────────────

test("⚠ ziua se ia in ora Romaniei, nu in UTC", () => {
  /*
   * Serverul ruleaza pe UTC. La 22:30 ora Bucurestiului (19:30 UTC iarna, 20:30
   * vara) `toISOString()` da inca ziua curenta — dar la 23:30 vara, adica 21:30
   * UTC, e tot ziua curenta si in UTC. Cazul care doare e invers: 01:00 ora
   * Bucurestiului inseamna 22:00 UTC in ZIUA DE DINAINTE. O partida creata
   * atunci ar primi o data de ridicare in trecut.
   */
  const noapte = new Date("2026-09-01T22:30:00Z"); // 2026-09-02 01:30 la Bucuresti
  assert.equal(ziuaInRomania(noapte), "2026-09-02");
  assert.equal(new Date(noapte).toISOString().slice(0, 10), "2026-09-01", "asa ar fi iesit gresit");
});

test("ziua in Romania, si iarna", () => {
  const iarna = new Date("2026-01-15T23:30:00Z"); // 2026-01-16 01:30 la Bucuresti
  assert.equal(ziuaInRomania(iarna), "2026-01-16");
});

test("zilele lucratoare sar peste weekend", () => {
  /* 2026-09-04 e vineri. */
  assert.equal(adaugaZileLucratoare("2026-09-04", 1), "2026-09-07", "vineri + 1 = luni");
  assert.equal(adaugaZileLucratoare("2026-09-04", 2), "2026-09-08");
  assert.equal(adaugaZileLucratoare("2026-09-01", 1), "2026-09-02", "marti + 1 = miercuri");
});

test("zero zile lucratoare inseamna azi, dar niciodata in weekend", () => {
  assert.equal(adaugaZileLucratoare("2026-09-01", 0), "2026-09-01");
  /* 2026-09-05 e sambata. */
  assert.equal(adaugaZileLucratoare("2026-09-05", 0), "2026-09-07");
});

test("o data invalida se intoarce neatinsa, nu se inventeaza alta", () => {
  assert.equal(adaugaZileLucratoare("nu-i o data", 1), "nu-i o data");
  assert.equal(adaugaZileLucratoare("2026-02-31", 1), "2026-02-31", "31 februarie nu se muta pe 3 martie");
});

test("compararea datelor", () => {
  assert.ok(inainteDe("2026-09-01", "2026-09-02"));
  assert.ok(!inainteDe("2026-09-02", "2026-09-01"));
  assert.ok(!inainteDe("2026-09-01", "2026-09-01"), "aceeasi zi nu e inainte");
  assert.ok(!inainteDe("aiurea", "2026-09-01"), "datele invalide nu se compara");
});

test("ora se normalizeaza la HH:MM", () => {
  assert.equal(oraNormalizata("8:00"), "08:00");
  assert.equal(oraNormalizata("08:00"), "08:00");
  assert.equal(oraNormalizata("8"), "08:00");
  assert.equal(oraNormalizata("17:30:00"), "17:30");
  assert.equal(oraNormalizata(" 9:05 "), "09:05");
});

test("⚠ o ora imposibila da null, ca sa se cada pe implicit", () => {
  assert.equal(oraNormalizata("25:00"), null);
  assert.equal(oraNormalizata("08:75"), null);
  assert.equal(oraNormalizata("dimineata"), null);
  assert.equal(oraNormalizata(""), null);
  assert.equal(oraNormalizata(null), null);
});

// ─── Paleti si greutate ───────────────────────────────────────────────────────

test("⚠ greutatea se rotunjeste IN SUS, si e intreaga", () => {
  /*
   * `pallet_weight` e `format: int32` in specificatie. Rotunjita in jos,
   * declaratia ar fi mai mica decat marfa — iar diferenta o plateste comerciantul
   * la recantarirea din depozitul Pall-Ex.
   */
  assert.equal(partidaPallEx(date({ greutateKg: 640.2 })).pallet_weight, 641);
  assert.equal(partidaPallEx(date({ greutateKg: 640 })).pallet_weight, 640);
});

test("⚠ niciodata zero paleti si niciodata zero kilograme", () => {
  const p = partidaPallEx(date({ numarPaleti: 0, greutateKg: 0 }));
  assert.equal(p.pallet_count, 1);
  assert.equal(p.pallet_weight, 1);
});

test("paletii pe bucata se trimit doar cand sunt COMPLETI", () => {
  /* `Pallet` cere toate patru masuratorile; o lista partiala e respinsa cu totul. */
  const p = partidaPallEx(date({
    paleti: [
      { weight: 300, length: 120, width: 80, height: 100 },
      { weight: 340, length: 120, width: 80, height: 0 },
    ],
  }));
  assert.equal(p.pallets?.length, 1);
  assert.equal(p.pallets?.[0].weight, 300);
});

test("fara niciun palet complet, campul nu se trimite deloc", () => {
  const p = partidaPallEx(date({ paleti: [{ weight: 0, length: 0, width: 0, height: 0 }] }));
  assert.ok(!("pallets" in p), "o lista goala n-are ce cauta in cerere");
});

test("paletComplet cere toate cele patru masuratori", () => {
  assert.ok(paletComplet({ weight: 1, length: 1, width: 1, height: 1 }));
  assert.ok(!paletComplet({ weight: 1, length: 1, width: 1, height: -1 }));
  assert.ok(!paletComplet(null));
  assert.ok(!paletComplet(undefined));
});

// ─── Servicii ─────────────────────────────────────────────────────────────────

test("fara servicii cerute, niciun steag nu pleaca", () => {
  const p = partidaPallEx(date());
  for (const camp of [
    "has_collection_tail_lift", "has_delivery_tail_lift", "has_depallet",
    "has_premises_delivery", "has_reception_assistance", "has_insurance",
    "has_return_documents", "has_return_instruments", "has_return_pallets",
    "has_delivery_bookin_required",
  ]) {
    assert.ok(!(camp in p), `${camp} n-ar trebui trimis`);
  }
});

test("⚠ asigurarea nu pleaca fara valoare", () => {
  /*
   * `has_insurance: true` cu `insurance: 0` inseamna „asigura pentru zero lei":
   * partida intra pe fluxul de asigurare, cu comisionul de rigoare, si nu acopera
   * nimic. Aceeasi capcana ca rambursul de zero lei la GLS.
   */
  const fara = partidaPallEx(date({ servicii: { asigurare: true }, valoare: 0 }));
  assert.ok(!("has_insurance" in fara));
  assert.ok(!("insurance" in fara));

  const cu = partidaPallEx(date({ servicii: { asigurare: true }, valoare: 4200.555 }));
  assert.equal(cu.has_insurance, true);
  assert.equal(cu.insurance, 4200.56, "doi zecimali, ca la orice suma de bani");
});

test("valoarea fara bifa de asigurare nu porneste serviciul", () => {
  const p = partidaPallEx(date({ valoare: 4200 }));
  assert.ok(!("has_insurance" in p));
});

test("serviciile de retur trimit steagul si numarul impreuna", () => {
  const p = partidaPallEx(date({
    servicii: {
      returDocumente: true, returDocumenteNumar: 2, returDocumenteDetalii: "FF123, AV999",
      returPaleti: true, returPaletiNumar: 3,
    },
  }));
  assert.equal(p.has_return_documents, true);
  assert.equal(p.return_documents_count, 2);
  assert.equal(p.return_documents, "FF123, AV999");
  assert.equal(p.has_return_pallets, true);
  assert.equal(p.return_pallets_count, 3);
});

test("un serviciu de retur fara numar primeste 1, nu 0", () => {
  const p = partidaPallEx(date({ servicii: { returDocumente: true } }));
  assert.equal(p.return_documents_count, 1, "zero documente de returnat n-ar avea niciun rost");
});

test("serviciile de ridicare si cele de livrare sunt campuri DIFERITE", () => {
  const p = partidaPallEx(date({ servicii: { liftLaRidicare: true } }));
  assert.equal(p.has_collection_tail_lift, true);
  assert.ok(!("has_delivery_tail_lift" in p), "liftul de la depozit nu e cel de la client");
});

// ─── Ferestrele orare si tipul ────────────────────────────────────────────────

test("ferestrele orare si datele ajung pe campurile lor", () => {
  const p = partidaPallEx(date());
  assert.equal(p.collection_date, "2026-09-01");
  assert.equal(p.collection_open_time, "08:00");
  assert.equal(p.collection_close_time, "17:00");
  assert.equal(p.delivery_date, "2026-09-03");
  assert.equal(p.delivery_open_time, "09:00");
  assert.equal(p.delivery_close_time, "16:00");
});

test("tipul partidei se trimite ca numar", () => {
  assert.equal(partidaPallEx(date({ tip: 3 })).type, 3);
  assert.equal(partidaPallEx(date({ tip: 2 })).type, 2);
});

test("⚠ nicaieri in partida nu exista ramburs", () => {
  /*
   * Pall-Ex NU incaseaza la livrare: nu exista niciun camp, nici pe partida nici
   * pe palet. Proba e aici ca sa nu adauge cineva, candva, un camp inventat care
   * ar fi ignorat tacut — si atunci marfa ar pleca fara nicio cale de incasare.
   */
  const p = partidaPallEx(date()) as unknown as Record<string, unknown>;
  /*
   * Comparatia se face pe CUVINTE, nu pe subsiruri: `consignee_postcode` contine
   * „cod" si ar fi picat proba degeaba — exact felul de proba falsa care se
   * dezactiveaza si nu se mai pune inapoi.
   */
  const cuvinte = new Set(Object.keys(p).flatMap((k) => k.toLowerCase().split("_")));
  for (const cuvant of ["cod", "cash", "ramburs", "collect"]) {
    assert.ok(!cuvinte.has(cuvant), `„${cuvant}" n-are ce cauta in partida`);
  }
});
