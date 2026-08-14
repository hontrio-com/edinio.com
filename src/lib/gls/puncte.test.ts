import { strict as assert } from "node:assert";
import { test } from "node:test";
import { codPostalOras, golesteCachePuncte, punctDinBrut } from "./puncte";

/** `fetch` inlocuit cu un raspuns dat, ca sa se poata proba cautarea pe oras. */
function fetchFals(corp: unknown) {
  /* ⚠ Cache-ul e la nivel de modul: fara golire, prima proba care cere punctele
     hotaraste ce vad TOATE celelalte, oricat de diferit ar fi raspunsul lor. */
  golesteCachePuncte();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(corp), { status: 200 })) as unknown as typeof fetch;
  return { restaureaza: () => { globalThis.fetch = original; golesteCachePuncte(); } };
}

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

test("⚠ codul postal al localitatii se ia din punctele GLS, fara diacritice", async () => {
  /*
   * Masurat pe productie la 14.08.2026: din 137 de comenzi romanesti din ultimele
   * 90 de zile, ZERO aveau cod postal — iar `ZipCode` e camp REQUIRED la MyGLS.
   * Deci alegerea nu e „exact sau aproximativ", ci „ceva sau NIMIC".
   *
   * Potrivirea trebuie sa treaca peste diacritice: fisierul GLS scrie „Braşov",
   * comanda scrie „Brasov".
   */
  const f = fetchFals({
    items: [
      { id: "RO500001-PARCELSH01", name: "Punct 1", type: "parcel-shop", features: ["delivery"],
        contact: { city: "Braşov BV", postalCode: "500001", address: "Str. Lunga 1" }, location: [45.6, 25.6] },
      { id: "RO010101-PARCELSH02", name: "Punct 2", type: "parcel-shop", features: ["delivery"],
        contact: { city: "Bucuresti B", postalCode: "010101", address: "Calea Victoriei 1" }, location: [44.4, 26.1] },
    ],
  });
  try {
    assert.equal(await codPostalOras("RO", "Brasov"), "500001");
    assert.equal(await codPostalOras("RO", "BRAȘOV"), "500001");
    assert.equal(await codPostalOras("RO", "Bucuresti"), "010101");
    /* O localitate in care GLS n-are niciun punct: NU se inventeaza un cod. */
    assert.equal(await codPostalOras("RO", "Sat Fara Punct"), null);
    assert.equal(await codPostalOras("RO", ""), null);
  } finally {
    f.restaureaza();
  }
});

test("⚠ un punct fara cod postal nu se foloseste ca sursa", () => {
  /* Altfel am intoarce sir gol si am crede ca am rezolvat problema. */
  const p = punctDinBrut({
    id: "RO000000-PARCELSH99", name: "Fara cod", type: "parcel-shop", features: ["delivery"],
    contact: { city: "Undeva UN", address: "Str. X" }, location: [45, 25],
  });
  assert.equal(p?.codPostal, "");
});

test("⚠⚠ codul postal se alege dupa JUDET, nu dupa primul omonim", async () => {
  /*
   * In fisierul real sunt 23 de nume de localitate care apar in mai multe judete.
   * Fara judet, `find` lua primul din ordinea fisierului — masurat pe date reale:
   * „Mihail Kogalniceanu" scotea codul din Galati (807277) in loc de cel din
   * Constanta (907195), la 250 km.
   *
   * ⚠ Si nu e cosmetic: documentatia (clasa `Location`, pag. 15-16) leaga
   * `ZipCode` de `Routing.DepotNumber` — codul postal ALEGE depozitul, deci
   * coletul intra pe ruta gresita.
   */
  const punct = (cod: string, oras: string) => ({
    id: `RO${cod}-PARCELSH01`, name: `Punct ${oras}`, type: "parcel-shop", features: ["delivery"],
    contact: { city: oras, postalCode: cod, address: "Str. Test 1" }, location: [45, 25],
  });
  const f = fetchFals({ items: [
    punct("807277", "Mihail Kogalniceanu GL"),
    punct("907195", "Mihail Kogalniceanu CT"),
  ] });
  try {
    assert.equal(await codPostalOras("RO", "Mihail Kogalniceanu", "Constanta"), "907195");
    assert.equal(await codPostalOras("RO", "Mihail Kogalniceanu", "Galati"), "807277");
    /*
     * Fara judet, numele e ambiguu: a alege la intamplare ar fi chiar greseala.
     * Mai bine „nu stim", si omul scrie codul.
     */
    assert.equal(await codPostalOras("RO", "Mihail Kogalniceanu"), null);
    /* Judet in care nu exista niciun punct cu numele asta: tot „nu stim". */
    assert.equal(await codPostalOras("RO", "Mihail Kogalniceanu", "Cluj"), null);
  } finally {
    f.restaureaza();
  }
});

test("⚠⚠ localitatile pe care GLS le scrie cu sufix de judet se potrivesc", async () => {
  /*
   * GLS dezambiguizeaza singur omonimele lipind codul de judet cu CRATIMA:
   * „Navodari-CT CT", „Tecuci-GL GL", „Bals-OT OT". `despartaLocalitateaDeCod`
   * taie doar dupa ultimul SPATIU, deci ramanea „Navodari-CT" ca nume — si 60 de
   * localitati (136 de puncte) nu se potriveau NICIODATA cu ce scrie cumparatorul.
   * Adica rezerva refuza tocmai in orasele unde GLS are cea mai buna acoperire.
   */
  const f = fetchFals({ items: [
    { id: "RO905700-PARCELSH01", name: "Punct Navodari", type: "parcel-shop", features: ["delivery"],
      contact: { city: "Navodari-CT CT", postalCode: "905700", address: "Str. A 1" }, location: [44, 28] },
    { id: "RO400667-PARCELSH02", name: "Punct Cluj", type: "parcel-shop", features: ["delivery"],
      contact: { city: "Cluj-Napoca CJ", postalCode: "400667", address: "Str. B 2" }, location: [46, 23] },
  ] });
  try {
    assert.equal(await codPostalOras("RO", "Navodari", "Constanta"), "905700");
    assert.equal(await codPostalOras("RO", "Navodari"), "905700");
    /* Si formele tastate uzual, cu sau fara cratima. */
    assert.equal(await codPostalOras("RO", "Cluj-Napoca"), "400667");
    assert.equal(await codPostalOras("RO", "Cluj Napoca"), "400667");
  } finally {
    f.restaureaza();
  }
});

test("⚠ sufixul de judet iese din numele localitatii si completeaza judetul", () => {
  const p = punctDinBrut({
    id: "RO905700-PARCELSH01", name: "Punct", type: "parcel-shop", features: ["delivery"],
    contact: { city: "Navodari-CT CT", postalCode: "905700", address: "Str. A 1" }, location: [44, 28],
  });
  assert.equal(p?.city, "Navodari", "sufixul cu cratima nu are ce cauta in nume");
  assert.equal(p?.county, "Constanta");
});
