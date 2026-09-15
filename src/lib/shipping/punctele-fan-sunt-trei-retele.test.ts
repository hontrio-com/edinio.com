import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FANBOX_MAX_WEIGHT_KG,
  incapeInFanbox,
  incapeInPayPoint,
  optiuneaPunctuluiFan,
  PAYPOINT_LATURI_CM,
  PAYPOINT_MAX_WEIGHT_KG,
  serviciulPunctuluiFan,
  tipPunctFan,
} from "@/lib/fancourier";

/**
 * PUNCTELE FAN SUNT TREI RETELE, NU UNA.
 *
 * ═══ ⚠ CE S-A DESCHIS (13.09.2026) ═══
 *
 * `reports/pickup-points?type=` da trei nomenclatoare: `fanbox`, `paypoint` si `office`.
 * Semnatura din client le accepta pe toate trei de mult, iar `mapPickupPoint` le trata
 * identic, dar NIMENI nu cerea vreodata altceva decat `fanbox`. Cumparatorul putea alege
 * doar dulapuri, desi FAN livreaza si la magazinele PayPoint si la propriile oficii.
 *
 * ⚠ CELE TREI NU SUNT INTERSCHIMBABILE, si asta e toata miza:
 *
 *     retea      serviciu                              optiune  limite
 *     fanbox     FANbox / FANbox Cont Colector         V        30 kg, 1 colet, compartiment
 *     paypoint   CollectPoint / CollectPoint Cont Col. F        10 kg, 60x90x60
 *     office     Standard / Cont Colector              D        cele obisnuite
 *
 * O pereche gresita NU da eroare de compilare. Da un colet plecat in alta retea, sau un
 * refuz de la FAN dupa ce cumparatorul a platit.
 *
 * ⚠ OFICIUL NU E CollectPoint, desi numele ar sugera-o. Documentatia (pag. 29) ii da
 * serviciul de la domiciliu, si doar optiunea `D` muta destinatia. Chiar eu am confundat
 * cele doua cand lucram din memorie, si de aia perechea are proba ei mai jos.
 *
 * ═══ ⚠ DE CE PARTEA A DOUA CITESTE SURSA ═══
 *
 * Cablarea trece prin `shipping.actions.ts`, `order.actions.ts` si `fancourier.actions.ts`,
 * toate `"use server"`: acolo fiecare export devine actiune chemabila din browser, deci
 * ajutoarele lor nu se pot exporta ca sa fie probate pur. Regulile care SE POT importa sunt
 * probate pe numere, mai sus. Acelasi tipar ca la vecinele despre TVA si despre plafon.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: scotand `fan_point_type` din oricare dintre cele SASE
 * locuri prin care calatoreste, sau intorcand un serviciu scris de mana in cotare, probele
 * de mai jos cad.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGULA, PE NUMERE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ fiecare retea are serviciul EI, si oficiul nu e CollectPoint", () => {
  assert.equal(serviciulPunctuluiFan("fanbox", false), "FANbox");
  assert.equal(serviciulPunctuluiFan("fanbox", true), "FANbox Cont Colector");

  assert.equal(serviciulPunctuluiFan("paypoint", false), "CollectPoint");
  assert.equal(serviciulPunctuluiFan("paypoint", true), "CollectPoint Cont Colector");

  /*
   * ⚠ PERECHEA CARE APARA CHIAR GRESEALA MEA. Lucrand din memorie, notasem oficiul drept
   * CollectPoint. Documentatia (pag. 29) spune altceva: serviciul e cel de la domiciliu.
   * Trimis „CollectPoint" pentru un oficiu, coletul ar fi plecat catre reteaua PayPoint.
   */
  assert.equal(serviciulPunctuluiFan("office", false), "Standard");
  assert.equal(serviciulPunctuluiFan("office", true), "Cont Colector");
  assert.notEqual(serviciulPunctuluiFan("office", false), serviciulPunctuluiFan("paypoint", false));
});

test("⚠ rambursul schimba serviciul la TOATE trei, altfel coletul pleaca neincasat", () => {
  /*
   * Varianta „Cont Colector" e cea prin care FAN incaseaza banii si ii vireaza
   * comerciantului. Uitata, coletul ajunge la client fara plata.
   */
  for (const tip of ["fanbox", "paypoint", "office"] as const) {
    assert.notEqual(
      serviciulPunctuluiFan(tip, true),
      serviciulPunctuluiFan(tip, false),
      `la ${tip}, rambursul nu mai schimba serviciul`,
    );
    assert.match(serviciulPunctuluiFan(tip, true), /Cont Colector$/);
  }
});

test("⚠ fiecare retea are litera EI, si toate trei difera", () => {
  assert.equal(optiuneaPunctuluiFan("fanbox"), "V");
  assert.equal(optiuneaPunctuluiFan("paypoint"), "F");
  assert.equal(optiuneaPunctuluiFan("office"), "D");

  /* La oficiu serviciul e chiar cel de la domiciliu, deci `D` e SINGURUL lucru care
     deosebeste coletul trimis la ghiseu de unul trimis acasa. */
  const litere = new Set(["fanbox", "paypoint", "office"].map((t) => optiuneaPunctuluiFan(t as "fanbox")));
  assert.equal(litere.size, 3, "doua retele au ajuns pe aceeasi litera");
});

test("⚠ limitele PayPoint sunt ALE LUI, nu imprumutate de la FANbox", () => {
  assert.equal(PAYPOINT_MAX_WEIGHT_KG, 10);
  assert.equal(FANBOX_MAX_WEIGHT_KG, 30);
  assert.notEqual(PAYPOINT_MAX_WEIGHT_KG, FANBOX_MAX_WEIGHT_KG,
    "limitele s-au unificat: un colet de 20 kg ar fi oferit la PayPoint, care il refuza");

  /* Marginea, exact pe cifrele documentate: 60x90x60. */
  assert.equal(incapeInPayPoint({ length: 90, width: 60, height: 60 }), true);
  assert.equal(incapeInPayPoint({ length: 91, width: 60, height: 60 }), false);
  assert.equal(incapeInPayPoint({ length: 90, width: 61, height: 60 }), false);

  /*
   * ⚠ CELE DOUA GABARITE NU SE ACOPERA, in NICIUN sens, si de aia niciunul nu tine locul
   * celuilalt: un colet lung intra la PayPoint si nu in dulap, iar unul gros intra in dulap
   * si nu la PayPoint.
   */
  assert.equal(incapeInPayPoint({ length: 80, width: 30, height: 20 }), true);
  assert.equal(incapeInFanbox({ length: 80, width: 30, height: 20 }), false);
});

test("⚠ tipul venit din browser se ingusteaza, si nu se corecteaza tacit", () => {
  assert.equal(tipPunctFan("fanbox"), "fanbox");
  assert.equal(tipPunctFan("paypoint"), "paypoint");
  assert.equal(tipPunctFan("office"), "office");

  /*
   * ⚠ `null`, NU „fanbox". Valoarea intra si in cheia de cache a punctelor, si in numele
   * serviciului trimis la FAN. Corectata tacit, un tip inventat ar deveni o livrare in
   * alta retea decat cea aleasa de cumparator.
   */
  for (const gunoi of ["FANBOX", "Fanbox", "locker", "", " ", "__proto__", null, undefined, 7, {}]) {
    assert.equal(tipPunctFan(gunoi), null, `„${String(gunoi)}" nu are voie sa treaca drept retea`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CABLAREA: reteaua chiar calatoreste, si pe TOATE drumurile
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COTARE = "src/lib/actions/shipping.actions.ts";
const SELECTOR = "src/components/ministore/CourierSelector.tsx";
const COMENZI = "src/lib/actions/order.actions.ts";
const ACTIUNE_FAN = "src/lib/actions/fancourier.actions.ts";
/** ⚠ DOUA checkout-uri, nu unul. Vezi proba de mai jos. */
const CHECKOUTURI = [
  "src/components/ministore/OrderModal.tsx",
  "src/components/storefront/sections/checkout/checkout-core.ts",
];

test("⚠⚠ reteaua calatoreste pe AMANDOUA checkout-urile, nu doar pe unul", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CENTRALA, SI NIMIC DIN COD N-O IMPUNE.
   *
   * Incarcatura catre `placeOrder` se construieste in DOUA fisiere aproape identice:
   * fereastra ministore si checkout-ul vitrinei. Ele nu au niciun tip comun care sa le
   * lege, deci un camp adaugat intr-unul singur compileaza curat si merge pentru jumatate
   * dintre cumparatori. Cealalta jumatate alege PayPoint, plateste, si abia emiterea
   * descopera ca reteaua lipseste.
   *
   * Aceeasi clasa cu memoria `campuri-scrise-dar-necitite`.
   */
  for (const fisier of CHECKOUTURI) {
    const s = sursa(fisier);
    assert.match(s, /locker_id: courierSelection\?\.lockerId,/,
      `${fisier} nu mai construieste incarcatura cu lockerul: proba n-are pe ce cadea`);
    assert.match(s, /fan_point_type: courierSelection\?\.fanPointType,/,
      `${fisier} NU trimite reteaua punctului FAN: PayPoint cade tacut pe acest drum`);
  }
});

test("⚠ si pe AMANDOUA drumurile de scriere in `shipping_address`", () => {
  /*
   * `order.actions.ts` are doua incarcaturi si doua scrieri, byte cu byte identice: una
   * pentru comanda din vitrina, alta pentru cea facuta din panou. Se numara, nu se cauta
   * „macar una": o plasa care cere macar o aparitie nu cade cand a doua dispare.
   */
  const s = sursa(COMENZI);

  const inTip = (s.match(/fan_point_type\?: string;/g) ?? []).length;
  assert.equal(inTip, 2, `reteaua e declarata in ${inTip} din 2 incarcaturi`);

  const laScriere = (s.match(/fan_point_type: data\.fan_point_type,/g) ?? []).length;
  assert.equal(laScriere, 2, `reteaua se scrie in ${laScriere} din 2 drumuri`);

  /*
   * ⚠ ANCORA PERECHE S-A SCHIMBAT PE 15.09.2026, SI ASTA E CHIAR RECITIREA PE CARE O CEREA NOTA
   * DE AICI, nu o coborare a ei.
   *
   * Pana azi se numarau doua aparitii ale lui `locker_county: data.locker_county,`, adica ale
   * campului scris DIN CERERE. De azi cele sase campuri ale punctului se scriu din fisa semnata de
   * noi, iar `data.locker_county` nu se mai citeste nicaieri. Perechea se numara deci pe scrierea
   * canonica, care e noua forma a aceluiasi lucru: tot doua drumuri, tot numarate, nu cautate.
   */
  const ancora = (s.match(/\.\.\.\(punctAles\.campuri \?\? \{\}\),/g) ?? []).length;
  assert.equal(ancora, 2, "nu mai sunt doua drumuri de scriere: reciteste de ce cerem doua");

  /*
   * ⚠⚠ SI CAMPURILE DIN CERERE N-AU VOIE SA SE INTOARCA.
   *
   * Asta nu e o afirmatie de stil. Rescris fie si unul singur din `data`, poarta punctului ar fi
   * ocolita fara ca nimic altceva sa cada: tokenul s-ar verifica in continuare, verdictul ar fi
   * bun, si tot sirul browserului ar ajunge pe AWB. La Sameday `locker_city` si `locker_county`
   * INLOCUIESC destinatarul, deci exact acolo se pierde adresa de livrare.
   *
   * Zero, nu „mai putine": o plasa care cere „macar unul mai putin" nu cade cand se intoarce unul.
   */
  /*
   * ⚠ SI NU PE FORMA `camp: data.camp,` CU VIRGULA LIPITA, cum era scrisa prima oara. Masurat cu
   * mutant: regresia cea mai probabila nu e scrierea goala, ci REZERVA BLANDA,
   * `locker_city: data.locker_city ?? punctAles.campuri?.locker_city,`. Ea nu potriveste tiparul
   * acela, deci trecea nevazuta, iar cheia din urma castiga: campul redevine sirul browserului si
   * ajunge iar sa inlocuiasca destinatarul pe AWB-ul Sameday. Proba unitara nu poate acoperi gaura,
   * fiindca `punctulDePeComanda` nici nu primeste campurile din cerere ca argumente: scanarea asta e
   * singura plasa care exista.
   *
   * Se cere deci ca `data.<camp>` sa nu fie CITIT nicaieri, in nicio forma.
   */
  for (const camp of ["locker_name", "locker_address", "locker_city", "locker_county", "locker_post_code"]) {
    const cate = (s.match(new RegExp(`data\\.${camp}\\b`, "g")) ?? []).length;
    assert.equal(cate, 0,
      `${camp} se citeste din nou din cerere, in ${cate} locuri: punctul de pe comanda poate redeveni cel trimis de browser`);
  }

  /*
   * ⚠ `locker_id` e SINGURUL care ramane citit, si numai in doua roluri care nu scriu nimic pe
   * comanda: garda „e comanda asta la punct?" si jurnalul refuzului. Se numara, ca sa nu se
   * strecoare un al treilea rol care sa-l duca inapoi pe comanda.
   */
  const idCitit = (s.match(/data\.locker_id\b/g) ?? []).length;
  assert.equal(idCitit, 4,
    `locker_id se citeste in ${idCitit} locuri, asteptam 4: garda si jurnalul, pe fiecare din cele doua drumuri`);
});

test("⚠ selectorul deosebeste cele trei optiuni si duce reteaua mai departe", () => {
  const s = sursa(SELECTOR);

  /*
   * ⚠ Cele trei vin toate sub `courier: "fan-courier"` SI sub acelasi
   * `deliveryType: "locker"`. Fara reteaua in cheie, `optionKey` le prabuseste intr-una
   * singura: cumparatorul ar vedea o optiune in loc de trei.
   */
  assert.match(s, /\$\{o\.fanPointType \?\? ""\}/,
    "cheia optiunii nu mai cuprinde reteaua: cele trei optiuni FAN se prabusesc una peste alta");

  /* Lista de puncte se cere PE RETEA, altfel omul primeste dulapuri cand a ales PayPoint. */
  assert.match(s, /opt\.courier === "fan-courier" \? opt\.fanPointType/,
    "lista de puncte nu se mai cere pe reteaua aleasa");

  /* Si alegerea punctului duce reteaua catre parinte, ca sa ajunga pe comanda. */
  assert.match(s, /fanPointType: opt\.fanPointType,/,
    "alegerea punctului nu mai poarta reteaua: emiterea ar cadea inapoi pe FANbox");
});

test("⚠ cotarea cere serviciul si optiunea din REGULA, nu scrise de mana", () => {
  const s = sursa(COTARE);

  /*
   * Acelasi rationament ca la dimensiuni: doua copii ale regulii, una in cotare si una la
   * emitere, se despart la prima corectura, iar atunci pretul aratat si coletul emis sunt
   * ale unor servicii diferite.
   */
  assert.match(s, /service: serviciulPunctuluiFan\(tip, codAmount > 0\),/,
    "cotarea nu mai ia serviciul din regula comuna");
  assert.match(s, /options: \[optiuneaPunctuluiFan\(tip\)\],/,
    "cotarea nu mai ia optiunea din regula comuna");

  /* ⚠ Si nu s-au intors sirurile scrise de mana, care erau forma de dinainte. */
  assert.doesNotMatch(s, /service: codAmount > 0 \? "FANbox Cont Colector" : "FANbox"/,
    "serviciul FANbox s-a intors scris de mana in cotare");
  assert.doesNotMatch(s, /options: \["V"\]/,
    "optiunea V s-a intors scrisa de mana in cotare");

  /* Fiecare optiune poarta reteaua ei mai departe. */
  assert.match(s, /fanPointType: tip,/,
    "optiunile de punct nu mai poarta reteaua");
});

test("⚠ lista de puncte se cere pe retea, SI reteaua intra in cheia de cache", () => {
  const s = sursa(COTARE);

  /*
   * ⚠ INGUSTAREA S-A MUTAT IN `reteaua-punctului.ts`, pe 15.09.2026, si afirmatia o urmeaza acolo.
   *
   * Pana azi randul era scris pe loc: `tipPunctFan(retea) ?? "fanbox"`. De azi aceeasi regula o cere
   * si celalalt capat, verificarea punctului semnat la plasarea comenzii. Scrisa in doua locuri,
   * cele doua copii s-ar fi despartit la prima corectura, si despartirea n-ar fi aratat ca o eroare:
   * ar fi aratat ca fiecare comanda cinstita la PayPoint cade cu motivul „semnatura".
   *
   * Ce se cere aici ramane acelasi lucru: tipul venit din browser NU se foloseste brut. Ca ajutorul
   * chiar ingusteaza se probeaza pe valori, in `punctul-de-pe-comanda.test.ts`, nu pe text.
   */
  assert.match(s, /const tipPunctCerut = tipPunctFanCuImplicit\(retea\);/,
    "tipul punctului nu se mai ingusteaza la primire, desi vine din browser");
  assert.match(s, /getFanCourierPickupPoints\(config\.username, config\.password, tipPunctCerut\)/,
    "punctele se cer din nou doar din nomenclatorul FANbox");

  /*
   * ⚠ FARA RETEAUA IN CHEIE, CELE TREI IMPART O SINGURA INTRARE.
   *
   * Primul cumparator care deschide lista de FANbox-uri umple cache-ul; urmatorul, care a
   * ales PayPoint, primeste tot dulapuri, alege unul care nu e in reteaua lui, si emiterea
   * il refuza. Exact defectul consemnat acolo pentru Shipo si UPS.
   */
  assert.match(s, /courier === "fan-courier" \? `:\$\{tipPunctCerut\}`/,
    "reteaua a iesit din cheia de cache: cele trei nomenclatoare se amesteca");
});

test("⚠ actiunea de server REFUZA un tip nerecunoscut, nu-l corecteaza", () => {
  /*
   * `createFanCourierAwbAction` primeste incarcatura de la client, iar tipurile TypeScript
   * nu valideaza nimic la rulare. Corectat tacit la „fanbox", un tip inventat ar deveni un
   * colet plecat in alta retea decat cea aleasa.
   */
  const s = sursa(ACTIUNE_FAN);
  assert.match(s, /tipPunctFan\(input\.pickupPointType\) === null/,
    "actiunea nu mai ingusteaza tipul punctului venit din browser");
  assert.match(s, /return \{ error: "FAN Courier: tipul punctului de ridicare nu e recunoscut/,
    "tipul nerecunoscut nu mai e REFUZAT");
});
