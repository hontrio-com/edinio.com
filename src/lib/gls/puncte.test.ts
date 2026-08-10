import { strict as assert } from "node:assert";
import { test } from "node:test";
import { punctDinBrut } from "./puncte";

/*
 * Forma de mai jos NU e inventata: e copiata din fisierul public real
 * (`map.gls-romania.com/data/deliveryPoints/ro.json`, 2833 de puncte). Probele
 * apara exact diferentele dintre ce credeai ca e acolo si ce e cu adevarat —
 * fiindca fiecare dintre ele produce, gresit citita, o lista goala sau un punct
 * inutilizabil, si niciuna nu da eroare nicaieri.
 */

const LOCKER = {
  id: "RO021622-PLOCKER001",
  goldId: 12353,
  name: "GLS Locker 1047 Bertis",
  contact: {
    countryCode: "RO",
    postalCode: "500170",
    city: "Brasov BV",
    address: "Str. Stefan Baciu, nr. 64",
  },
  location: [45.67458427, 25.59989556],
  hours: [[1, "00:00", "24:00"]],
  features: ["acceptsOnline", "pickup", "delivery"],
  type: "parcel-locker",
  lockerSaturation: "lowVolume",
  hasWheelchairAccess: false,
};

test("⚠ id-ul punctului ramane SIR, neatins", () => {
  /*
   * Merge direct in `PSDParameter.StringValue`. Dovada ca e chiar acelasi camp:
   * exemplul din documentatia MyGLS („2351-CSOMAGPONT") exista verbatim ca
   * `items[].id` in fisierul public. Trecut printr-un `Number(...)`, cum fac
   * ceilalti curieri cu id-ul lor de punct, ar da `NaN` si coletul ar pleca la
   * domiciliu in loc de punct.
   */
  const p = punctDinBrut(LOCKER);
  assert.equal(p?.id, "RO021622-PLOCKER001");
  assert.ok(Number.isNaN(Number(p?.id)), "id-ul GLS nu e un numar — de asta nu se converteste");
});

test("⚠ coordonatele sunt un TABLOU [lat, lng], nu doua campuri", () => {
  const p = punctDinBrut(LOCKER);
  assert.equal(p?.lat, 45.67458427);
  assert.equal(p?.lng, 25.59989556);
});

test("⚠ judetul se scoate din oras: „Brasov BV” → Brasov", () => {
  /* Fisierul NU are camp de judet. Singurul loc unde apare e codul lipit de oras. */
  const p = punctDinBrut(LOCKER);
  assert.equal(p?.city, "Brasov");
  assert.equal(p?.county, "Brasov");
});

test("Bucurestiul are cod de o singura litera", () => {
  const p = punctDinBrut({ ...LOCKER, contact: { ...LOCKER.contact, city: "Bucuresti B" } });
  assert.equal(p?.city, "Bucuresti");
  assert.equal(p?.county, "Municipiul Bucuresti");
});

test("⚠ un oras din doua cuvinte NU se rupe in localitate si judet", () => {
  /*
   * „Satu Mare" ar deveni localitatea „Satu" din judetul „Mare", iar „Baia Mare"
   * la fel. Al doilea cuvant se ia in seama doar daca e chiar un cod de judet SI
   * e scris cu majuscule.
   */
  for (const oras of ["Satu Mare", "Baia Mare", "Targu Mures", "Ramnicu Valcea"]) {
    const p = punctDinBrut({ ...LOCKER, contact: { ...LOCKER.contact, city: oras } });
    assert.equal(p?.city, oras, `${oras} nu trebuie rupt`);
    assert.equal(p?.county, "", `${oras} nu are cod de judet`);
  }
});

test("⚠ lockerele defecte NU se ofera clientului", () => {
  /*
   * 59 de puncte din Romania au `outOfOrder`. Oferit in checkout, e un locker
   * mort: comanda pleaca si coletul n-are unde sa intre.
   */
  assert.equal(punctDinBrut({ ...LOCKER, lockerSaturation: "outOfOrder" }), null);
  assert.ok(punctDinBrut({ ...LOCKER, lockerSaturation: "highVolume" }), "aglomerat nu inseamna stricat");
  assert.ok(punctDinBrut({ ...LOCKER, lockerSaturation: undefined }), "lipsa steagului nu descalifica");
});

test("punctele care nu primesc colete se scot", () => {
  assert.equal(punctDinBrut({ ...LOCKER, features: ["pickup"] }), null);
  /* Fara lista de trasaturi nu presupunem raul: punctul ramane. */
  assert.ok(punctDinBrut({ ...LOCKER, features: [] }));
});

test("un punct fara id nu poate fi trimis la GLS, deci nu se ofera", () => {
  assert.equal(punctDinBrut({ ...LOCKER, id: "" }), null);
  assert.equal(punctDinBrut({ ...LOCKER, id: undefined }), null);
});

test("magazinele se deosebesc de lockere", () => {
  assert.equal(punctDinBrut(LOCKER)?.tip, "locker");
  assert.equal(punctDinBrut({ ...LOCKER, type: "parcel-shop" })?.tip, "shop");
});

test("un punct fara coordonate nu produce NaN pe harta", () => {
  const p = punctDinBrut({ ...LOCKER, location: undefined });
  assert.equal(p?.lat, 0);
  assert.equal(p?.lng, 0);
});

test("fara nume, se arata id-ul in loc de un rand gol", () => {
  const p = punctDinBrut({ ...LOCKER, name: undefined });
  assert.equal(p?.name, "RO021622-PLOCKER001");
});
