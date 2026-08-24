import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  normalizeaza, potrivesteCaracteristici, valoarePotrivita, VALORI_ARATATE,
} from "./caracteristici";
import type { EmagCaracteristicaCategorie } from "./types";

/*
 * Probele potrivirii de caracteristici (§19).
 *
 * Toate pazesc acelasi lucru: sa nu plece la eMAG o valoare pe care ei o refuza. O
 * caracteristica lipsa se vede in centrul problemelor si se repara; o oferta intreaga
 * respinsa pentru o valoare gresita se vede tot acolo, dar cu un mesaj care nu spune
 * CARE valoare a picat.
 */

const ALE_CATEGORIEI: EmagCaracteristicaCategorie[] = [
  { id: 6553, name: "Mărime", is_mandatory: 1, values: ["XS", "S", "M", "L", "XL"] },
  { id: 6554, name: "Culoare", is_mandatory: 1, values: ["Negru", "Alb", "Roșu"] },
  { id: 6555, name: "Material", allow_new_value: 1, values: ["Bumbac"] },
  { id: 6556, name: "Observații" },
];

/* ── Normalizarea ──────────────────────────────────────────────────────────── */

test("eMAG caracteristici: diacriticele NU despart doua nume identice", () => {
  /*
   * ═══ FARA ASTA, NIMIC NU S-AR FI POTRIVIT NICIODATA ═══
   *
   * Ei scriu „Mărime"; comerciantul scrie de cele mai multe ori „Marime". Comparate
   * ca atare, caracteristicile romanesti — adica toate — ar fi ramas necompletate, iar
   * fiecare produs ar fi picat la validare pentru un camp pe care il aveam in fisa.
   */
  assert.equal(normalizeaza("Mărime"), normalizeaza("Marime"));
  assert.equal(normalizeaza("Culoare"), normalizeaza("culoare"));
  assert.equal(normalizeaza("Observații"), normalizeaza("Observatii"));
});

test("eMAG caracteristici: si sedila gresita, dar des folosita, se potriveste", () => {
  /* ⚠ `ș` (virgula) se descompune la NFD; `ş` (sedila) NU. Datele vechi sunt pline de
     sedile, iar fara traducerea anume, „Mărime" cu sedila n-ar fi intrat. */
  assert.equal(normalizeaza("Şosete"), normalizeaza("Șosete"));
  assert.equal(normalizeaza("Greutaţe"), normalizeaza("Greutațe"));
});

test("eMAG caracteristici: doua nume DIFERITE raman diferite", () => {
  assert.notEqual(normalizeaza("Mărime"), normalizeaza("Culoare"));
});

/* ── Potrivirea ────────────────────────────────────────────────────────────── */

test("eMAG caracteristici: fisa produsului umple caracteristicile lor", () => {
  const r = potrivesteCaracteristici(
    [{ label: "Marime", value: "M" }, { label: "Culoare", value: "negru" }],
    ALE_CATEGORIEI,
  );
  assert.deepEqual(r.caracteristici, [{ id: 6553, value: "M" }, { id: 6554, value: "Negru" }]);
  assert.deepEqual(r.nepotriviri, []);
});

test("eMAG caracteristici: se trimite valoarea LOR, litera cu litera", () => {
  /*
   * ⚠ Trimis „negru" unde ei scriu „Negru", raspunsul e o respingere despre
   * caracteristica — fara sa spuna ce valoare a picat. Se cauta fara diacritice si
   * fara majuscule, dar se TRIMITE exact sirul lor.
   */
  const r = potrivesteCaracteristici([{ label: "Culoare", value: "rosu" }], ALE_CATEGORIEI);
  assert.deepEqual(r.caracteristici, [{ id: 6554, value: "Roșu" }], "cu diacritice, ca la ei");
});

test("eMAG caracteristici: o valoare IN AFARA listei lor NU se trimite", () => {
  /*
   * ═══ CE APARA PROBA ASTA ═══
   *
   * Trimisa oricum, oferta INTREAGA ar fi fost respinsa — nu doar caracteristica. Iar
   * mesajul lor vorbeste despre caracteristica, nu despre valoare, deci comerciantul
   * n-ar fi avut de unde sti ce sa schimbe.
   *
   * Mai bine o caracteristica lipsa, care se vede in centrul problemelor cu numele ei.
   */
  const r = potrivesteCaracteristici([{ label: "Culoare", value: "Turcoaz" }], ALE_CATEGORIEI);
  assert.deepEqual(r.caracteristici, []);
  assert.equal(r.nepotriviri.length, 1);
  assert.equal(r.nepotriviri[0].motiv, "valoare_neingaduita");
  assert.deepEqual(r.nepotriviri[0].ingaduite, ["Negru", "Alb", "Roșu"], "si se spune ce accepta ei");
});

test("eMAG caracteristici: cu `allow_new_value` se trimite si o valoare noua", () => {
  const r = potrivesteCaracteristici([{ label: "Material", value: "In" }], ALE_CATEGORIEI);
  assert.deepEqual(r.caracteristici, [{ id: 6555, value: "In" }]);
});

test("eMAG caracteristici: fara lista de valori, textul pleaca asa cum e", () => {
  const r = potrivesteCaracteristici(
    [{ label: "Observatii", value: "Se spală la 30 de grade" }], ALE_CATEGORIEI);
  assert.deepEqual(r.caracteristici, [{ id: 6556, value: "Se spală la 30 de grade" }]);
});

test("eMAG caracteristici: o specificatie fara corespondent NU e o eroare, dar se vede", () => {
  /* ⚠ Fisele au si specificatii care n-au corespondent la ei — masurat pe productie:
     „Cod furnizor", „Baxare", „Cod de bare". Se raporteaza ca sa se vada, nu ca sa
     alarmeze: nu opresc nimic. */
  const r = potrivesteCaracteristici([{ label: "Cod furnizor", value: "5000" }], ALE_CATEGORIEI);
  assert.deepEqual(r.caracteristici, []);
  assert.equal(r.nepotriviri[0].motiv, "fara_caracteristica");
});

/* ── Cele fixate pe categorie ──────────────────────────────────────────────── */

test("eMAG caracteristici: fisa produsului BATE valoarea fixata pe categorie", () => {
  /*
   * ⚠ Valoarea fixata pe categorie e una singura pentru toate produsele din ea — ceea
   * ce e absurd tocmai la caracteristicile care conteaza: nu toate tricourile sunt „M".
   */
  const r = potrivesteCaracteristici(
    [{ label: "Marime", value: "L" }],
    ALE_CATEGORIEI,
    [{ id: 6553, value: "M" }],
  );
  assert.deepEqual(r.caracteristici, [{ id: 6553, value: "L" }]);
});

test("eMAG caracteristici: valoarea fixata UMPLE GOLUL cand produsul n-o are", () => {
  /* ⚠ Setarile vechi nu se pierd: raman ca valoare de rezerva pentru produsele care
     n-au specificatia lor. Sterse, un magazin care si-a fixat „Material: Bumbac" pe
     toata categoria s-ar fi trezit ca nu mai pleaca deloc. */
  const r = potrivesteCaracteristici(
    [{ label: "Marime", value: "L" }],
    ALE_CATEGORIEI,
    [{ id: 6555, value: "Bumbac" }],
  );
  assert.deepEqual(r.caracteristici, [{ id: 6553, value: "L" }, { id: 6555, value: "Bumbac" }]);
});

test("eMAG caracteristici: o valoare fixata GOALA nu umple nimic", () => {
  const r = potrivesteCaracteristici([], ALE_CATEGORIEI, [{ id: 6553, value: "  " }]);
  assert.deepEqual(r.caracteristici, []);
});

/* ── Marginile ─────────────────────────────────────────────────────────────── */

test("eMAG caracteristici: prima specificatie castiga, nu ultima", () => {
  /* O fisa cu „Culoare: Negru" si mai jos „Culoare: Alb" ar fi trimis-o pe a doua,
     adica pe cea mai putin sigura — de obicei un rand adaugat in graba. */
  const r = potrivesteCaracteristici(
    [{ label: "Culoare", value: "Negru" }, { label: "Culoare", value: "Alb" }],
    ALE_CATEGORIEI,
  );
  assert.deepEqual(r.caracteristici, [{ id: 6554, value: "Negru" }]);
});

test("eMAG caracteristici: doua caracteristici cu acelasi nume — PRIMA castiga, mereu", () => {
  /* ⚠ Altfel id-ul ales s-ar fi schimbat de la o trecere la alta, iar oferta ar fi
     primit caracteristica ba pe una, ba pe alta. */
  const doua: EmagCaracteristicaCategorie[] = [
    { id: 1, name: "Mărime" }, { id: 2, name: "Marime" },
  ];
  const r = potrivesteCaracteristici([{ label: "marime", value: "M" }], doua);
  assert.deepEqual(r.caracteristici, [{ id: 1, value: "M" }]);
});

test("eMAG caracteristici: etichete si valori goale se sar, nu fac randuri goale", () => {
  const r = potrivesteCaracteristici(
    [{ label: "", value: "M" }, { label: "Marime", value: "   " }],
    ALE_CATEGORIEI,
  );
  assert.deepEqual(r.caracteristici, []);
  assert.deepEqual(r.nepotriviri, []);
});

test("eMAG caracteristici: lista de valori aratata se margineste", () => {
  const multe: EmagCaracteristicaCategorie[] = [{
    id: 9, name: "Culoare",
    values: Array.from({ length: 40 }, (_, i) => `Culoarea ${i}`),
  }];
  const r = potrivesteCaracteristici([{ label: "Culoare", value: "Inexistenta" }], multe);
  assert.equal(r.nepotriviri[0].ingaduite?.length, VALORI_ARATATE);
});

test("eMAG caracteristici: `valoarePotrivita` singura se poarta la fel", () => {
  const c: EmagCaracteristicaCategorie = { id: 1, name: "Culoare", values: ["Negru"] };
  assert.equal(valoarePotrivita("NEGRU", c), "Negru");
  assert.equal(valoarePotrivita("Verde", c), null);
  assert.equal(valoarePotrivita("orice", { id: 2, name: "Liber" }), "orice");
});
