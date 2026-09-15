import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { adresaDupaEmitereSameday, type LockerAles } from "@/lib/sameday/punctul-de-pe-awb";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CE A FACUT AWB-UL SE SCRIE INAPOI PE COMANDA                  (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comerciantul poate MUTA coletul din fereastra de AWB: o comanda la adresa poate pleca intr-un
 * easybox, iar una la easybox poate pleca acasa. Comutatorul a fost cerut anume si exista.
 *
 * Pana azi alegerea lui nu se scria NICAIERI inapoi. Doua urmari, amandoua reale:
 *
 *   ⚠ AWB-ul pleca in dulapul ales de comerciant, iar comanda pastra dulapul cumparatorului. Deci
 *     panoul, emailurile catre cumparator si orice sincronizare numeau ALT punct decat cel in care
 *     a ajuns coletul.
 *   ⚠⚠ Si mai rau pe dos: cu comutatorul STINS pe o comanda la punct, serverul cadea inapoi pe
 *     lockerul cumparatorului (`input.lockerAles ?? lockerDinComanda`) si coletul pleca TOT in
 *     dulap. Butonul arata ca se poate muta coletul acasa, si nu se putea: controlul mintea.
 */

const ADRESA_LA_PUNCT: Record<string, unknown> = {
  address: "Calea Vitan 236",
  city: "Bucuresti",
  county: "Bucuresti",
  postal_code: "031301",
  courier: "sameday",
  courier_label: "Sameday Courier",
  delivery_type: "locker",
  locker_id: "4242",
  locker_name: "Easybox Kaufland Vitan",
  locker_address: "Calea Vitan 236",
  locker_city: "Bucuresti",
  locker_county: "Bucuresti",
};

const ALT_PUNCT: LockerAles = {
  id: 9001,
  name: "Easybox Cluj Iulius",
  address: "Strada Alexandru Vaida Voevod 53B",
  city: "Cluj-Napoca",
  county: "Cluj",
};

/* ── Punctul mutat ────────────────────────────────────────────────────────── */

test("⚠⚠ punctul ales de comerciant INLOCUIESTE punctul cumparatorului", () => {
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, ALT_PUNCT);
  assert.equal(nou.locker_id, "9001");
  assert.equal(nou.locker_name, "Easybox Cluj Iulius");
  assert.equal(nou.locker_city, "Cluj-Napoca");
  assert.equal(nou.locker_county, "Cluj");
});

test("⚠ id-ul se scrie ca SIR, nu ca numar", () => {
  /*
   * Checkoutul il scrie ca sir, iar emiterea il citeste cu `Number(locker_id)`. Scris ca numar,
   * ar fi fost singurul loc din platforma unde campul are alt tip, si prima comparatie de siruri
   * l-ar fi ratat tacut.
   */
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, ALT_PUNCT);
  assert.equal(typeof nou.locker_id, "string");
});

test("⚠ restul adresei NU se pierde", () => {
  /*
   * `shipping_address` e o coloana JSON: scrierea inlocuieste INTREG obiectul. Cine ar construi
   * de la zero obiectul nou ar sterge numele, telefonul si codul postal ale cumparatorului.
   */
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, ALT_PUNCT);
  assert.equal(nou.postal_code, "031301");
  assert.equal(nou.courier_label, "Sameday Courier");
});

test("⚠ o comanda la ADRESA mutata in dulap capata si tipul, si curierul", () => {
  /*
   * Scris doar blocul punctului, comanda ar fi ramas „livrare la adresa" cu campuri de locker pe
   * ea, adica o nepotrivire NOUA, facuta chiar de reparatie. Iar `courier` se scrie fiindca altfel
   * o comanda cotata la alt curier, mutata intr-un easybox Sameday, ar fi aratat „celalalt curier,
   * punctul X".
   */
  const laAdresa = { address: "Str. Lunga 1", city: "Brasov", county: "Brasov", courier: "woot", delivery_type: "address" };
  const nou = adresaDupaEmitereSameday(laAdresa, ALT_PUNCT);
  assert.equal(nou.delivery_type, "locker");
  assert.equal(nou.courier, "sameday");
  assert.equal(nou.locker_id, "9001");
});

/* ── Punctul stins ────────────────────────────────────────────────────────── */

test("⚠⚠ comutatorul stins CURATA punctul, nu-l lasa pe comanda", () => {
  /*
   * ⚠ ASTA E DIRECTIA CEA MAI SCUMPA. Coletul pleaca acasa, iar comanda spunea in continuare
   * „easybox X": cumparatorul primea de la noi un email care il trimitea la un dulap gol.
   */
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, null);
  assert.equal(nou.delivery_type, "address");
  for (const k of ["locker_id", "locker_name", "locker_address", "locker_city", "locker_county", "locker_post_code"]) {
    assert.equal(k in nou, false, `${k} a ramas pe comanda desi coletul pleaca acasa`);
  }
});

test("⚠ cheile se STERG, nu se pun pe gol", () => {
  /*
   * O cheie prezenta si goala se citeste altfel decat o cheie lipsa: `locker_name: ""` trece de
   * un `in`, de un `?.` si de multe garzi, si ajunge sa se afiseze ca un punct fara nume.
   */
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, null);
  assert.equal(Object.keys(nou).some((k) => k.startsWith("locker_")), false);
});

test("⚠ la stingere NU se atinge curierul", () => {
  /*
   * Acolo doar se curata date ramase. Cine a expediat se stie oricum din `sameday_awb_number`, iar
   * rescrierea curierului ar fi sters ce s-a COTAT, care e alta intrebare decat ce s-a EXPEDIAT.
   */
  const nou = adresaDupaEmitereSameday({ ...ADRESA_LA_PUNCT, courier: "woot" }, null);
  assert.equal(nou.courier, "woot");
});

/* ── Codul postal ─────────────────────────────────────────────────────────── */

test("codul postal al punctului se duce pana la capat, cand exista", () => {
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, { ...ALT_PUNCT, postCode: "400117" });
  assert.equal(nou.locker_post_code, "400117");
});

test("⚠ si LIPSESTE cu totul cand punctul n-are unul", () => {
  /* Sameday nu-l da niciodata. Cheia goala ar fi aratat ca un cod postal pe care nu-l avem. */
  const nou = adresaDupaEmitereSameday(ADRESA_LA_PUNCT, ALT_PUNCT);
  assert.equal("locker_post_code" in nou, false);
});

/* ── Cablarea ─────────────────────────────────────────────────────────────── */

const ACTIUNE = "src/lib/actions/sameday.actions.ts";
const FEREASTRA = "src/components/dashboard/SamedayAwbModal.tsx";
const sursa = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("⚠⚠ comutatorul stins chiar ajunge la server", () => {
  /*
   * ⚠ Regula nu se poate proba pe valori: `laEasybox` traverseaza granita dintre fereastra si
   * actiune, iar campul e OPTIONAL, deci nici `tsc` nu-l apara. Lipsa lui din incarcatura readuce
   * exact defectul: serverul cade inapoi pe lockerul cumparatorului si butonul redevine mincinos.
   */
  assert.match(sursa(FEREASTRA), /\n\s*laEasybox,/,
    "fereastra nu mai trimite starea comutatorului: stingerea lui redevine fara efect");
  assert.match(sursa(ACTIUNE), /const vreaEasybox = input\.laEasybox \?\?/,
    "actiunea nu mai citeste starea comutatorului");
});

test("⚠ lipsa campului pastreaza purtarea VECHE, nu inseamna `stins`", () => {
  /*
   * Un browser cu pagina deschisa dinainte de desfasurare nu trimite campul. Tratat ca „stins",
   * fiecare AWB emis din el ar fi plecat brusc acasa in loc de dulap: acelasi defect, pe dos si
   * mai scump. Se cere pe sursa ca lipsa sa cada pe vechea regula.
   */
  const s = sursa(ACTIUNE);
  const i = s.indexOf("const vreaEasybox = input.laEasybox ??");
  assert.ok(i > 0, "nu mai gasesc hotararea despre comutator");
  const rand = s.slice(i, s.indexOf("\n", i));
  assert.match(rand, /\?\?\s*\(input\.lockerAles \? true : !!lockerDinComanda\)/,
    "lipsa comutatorului nu mai cade pe purtarea veche");
});

test("⚠ scrierea inapoi foloseste o citire PROASPATA a adresei", () => {
  /*
   * `shipping_address` se inlocuieste intreg. Compusa peste instantaneul de la inceputul actiunii,
   * scrierea ar fi sters o editare de adresa facuta intre timp in alta fila.
   */
  const s = sursa(ACTIUNE);
  const i = s.indexOf("petic.shipping_address =");
  assert.ok(i > 0, "punctul nu se mai scrie inapoi pe comanda");
  const inainte = s.slice(Math.max(0, i - 700), i);
  assert.match(inainte, /\.from\("orders"\)\s*\n?\s*\.select\("shipping_address"\)/,
    "adresa nu se mai reciteste inainte de scriere: o editare concurenta s-ar pierde intreaga");
});

test("⚠ returul cere acelasi fel de id ca drumul dus", () => {
  /* `!input.lockerId` lasa sa treaca negativele si fractionarele, care pleaca la Sameday si cad
     acolo cu un cod pe care comerciantul nu-l poate lega de nimic. */
  assert.match(
    sursa(ACTIUNE),
    /input\.fel === "locker" && !\(Number\.isFinite\(input\.lockerId\) && \(input\.lockerId \?\? 0\) > 0\)/,
    "returul a revenit la paza slaba, care accepta id-uri negative sau fractionare",
  );
});
