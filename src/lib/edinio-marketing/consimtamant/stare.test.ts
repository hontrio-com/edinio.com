import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  serializeaza, parseaza, validVid, are, NIMIC,
  VERSIUNE, CATEGORII, FURNIZORI, DURATA_ZILE, AMPRENTA_SCOPURI,
  type Stare,
} from "./stare";

const ACUM = 1_800_000_000;
const buna: Stare = { statistici: true, marketing: true, cand: ACUM - 10, metoda: "t", vid: "a".repeat(32) };

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ORICE NELAMURIRE CADE SPRE „N-A ALES INCA"
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ASTA E SINGURA REGULA CARE CONTEAZA AICI. Un sir stricat, o versiune veche,
  un furnizor adaugat intre timp, o hotarare de acum un an — toate trebuie sa dea
  `null`, adica „arata bannerul si nu porni nimic".

  O dezlegare care cade spre „a acceptat" ar porni pixelii pentru cine n-a fost
  intrebat niciodata. De aceea proba de mai jos nu se uita la campuri, ci cere ca
  FIECARE fel de stricaciune sa dea null.
*/

test("dus si intors: hotararea supravietuieste drumului prin cookie", () => {
  const inapoi = parseaza(serializeaza(buna), ACUM);
  assert.deepEqual(inapoi, buna);
});

test("⚠ FIECARE fel de sir stricat da `null`, niciodata un acord", () => {
  const rele: Array<[string, string | null | undefined]> = [
    ["gol", ""],
    ["lipsa", null],
    ["nedefinit", undefined],
    ["gunoi", "asdfasdf"],
    ["prea putine campuri", `${VERSIUNE}.${ACUM}.11`],
    ["versiune veche", `0.${ACUM}.11.t.${AMPRENTA_SCOPURI}.`],
    ["versiune viitoare", `99.${ACUM}.11.t.${AMPRENTA_SCOPURI}.`],
    ["amprenta straina", `${VERSIUNE}.${ACUM}.11.t.deadbeef.`],
    ["metoda necunoscuta", `${VERSIUNE}.${ACUM}.11.x.${AMPRENTA_SCOPURI}.`],
    ["flaguri stricate", `${VERSIUNE}.${ACUM}.1x.t.${AMPRENTA_SCOPURI}.`],
    ["flaguri prea lungi", `${VERSIUNE}.${ACUM}.111.t.${AMPRENTA_SCOPURI}.`],
    ["clipa nenumerica", `${VERSIUNE}.maine.11.t.${AMPRENTA_SCOPURI}.`],
    ["clipa zero", `${VERSIUNE}.0.11.t.${AMPRENTA_SCOPURI}.`],
  ];
  for (const [cum, sir] of rele) {
    assert.equal(parseaza(sir, ACUM), null, `"${cum}" n-a dat null`);
  }
});

test("⚠ o hotarare mai veche decat durata nu mai tine", () => {
  const vechi = serializeaza({ ...buna, cand: ACUM - DURATA_ZILE * 86_400 - 1 });
  assert.equal(parseaza(vechi, ACUM), null, "o hotarare expirata inca porneste pixelii");

  /* Martorul: cu o zi mai putin, tine. Altfel proba de sus ar trece si daca TOT cade. */
  const proaspat = serializeaza({ ...buna, cand: ACUM - DURATA_ZILE * 86_400 + 86_400 });
  assert.ok(parseaza(proaspat, ACUM), "o hotarare inca valabila a fost aruncata");
});

test("⚠ un furnizor NOU invalideaza hotararile de dinainte", () => {
  /*
    ⚠ CE APARA, SI DE CE E CEL MAI USOR DE RATAT. Cand se adauga un al patrulea
    furnizor, oamenii care au apasat „Accepta" ieri n-au stiut de el. Fara
    amprenta, acordul lor s-ar intinde tacut peste ceva ce n-au vazut niciodata.

    Amprenta se CALCULEAZA din liste, deci proba asta cade singura daca cineva
    adauga un furnizor si uita sa se gandeasca la hotararile vechi.
  */
  const cuAltaLume = `${VERSIUNE}.${ACUM}.11.t.${"0".repeat(8)}.`;
  assert.equal(parseaza(cuAltaLume, ACUM), null);

  /* Si ca amprenta chiar depinde de liste, nu e o constanta scrisa de mana. */
  assert.match(AMPRENTA_SCOPURI, /^[0-9a-f]{8}$/);
  assert.ok(CATEGORII.length >= 2 && FURNIZORI.length >= 3, "listele s-au golit");
});

test("id-ul de vizitator: 32 hexa, orice altceva se ignora", () => {
  assert.ok(validVid("f".repeat(32)));
  for (const rau of ["", "scurt", "G".repeat(32), "a".repeat(31), "a".repeat(33), 42, null, undefined]) {
    assert.ok(!validVid(rau), `"${String(rau)}" a trecut ca vid`);
  }
  /* Un vid stricat nu strica hotararea — se pierde doar el. */
  const cuVidRau = `${VERSIUNE}.${ACUM}.11.t.${AMPRENTA_SCOPURI}.NUEHEXA`;
  const s = parseaza(cuVidRau, ACUM);
  assert.ok(s, "un vid stricat a aruncat toata hotararea");
  assert.equal(s.vid, undefined);
});

test("⚠ retragerea nu poate lasa id-ul in urma", () => {
  /*
    ⚠ INVARIANTUL E STRUCTURAL. Id-ul sta in ACELASI cookie ca hotararea, deci o
    retragere care rescrie cookie-ul il sterge fara sa fie nevoie ca cineva sa-si
    aminteasca. Daca vreodata capata cookie-ul lui, proba asta nu mai dovedeste
    nimic — si de aia e scrisa aici, nu langa retragere.
  */
  const retras = serializeaza({ statistici: false, marketing: false, cand: ACUM, metoda: "w" });
  const s = parseaza(retras, ACUM);
  assert.ok(s);
  assert.equal(s.vid, undefined, "id-ul a supravietuit retragerii");
  assert.equal(s.marketing, false);
  assert.equal(s.statistici, false);
});

test("`are` cade spre nu, si pentru `null`", () => {
  assert.equal(are(null, "marketing"), false, "necunoscutul a trecut drept acord");
  assert.equal(are(NIMIC, "statistici"), false);
  assert.equal(are(buna, "marketing"), true);
  assert.equal(are({ ...buna, marketing: false }, "marketing"), false);
});

test("flagurile nu se amesteca intre ele", () => {
  /* ⚠ Doua booleene lipite intr-un sir de doua caractere: usor de inversat. */
  const doarStatistici = parseaza(
    serializeaza({ statistici: true, marketing: false, cand: ACUM, metoda: "p" }), ACUM);
  assert.deepEqual(
    { s: doarStatistici?.statistici, m: doarStatistici?.marketing },
    { s: true, m: false },
    "categoriile s-au inversat la drum",
  );
});
