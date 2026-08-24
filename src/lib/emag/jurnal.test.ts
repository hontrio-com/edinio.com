import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cuFir, deJurnalizat, firNou, firulCurent, idurileAtinse, mesajeDeScris,
  MAXIM_CARACTERE, MAXIM_IDURI, MAXIM_MESAJE,
} from "./jurnal";

/*
 * Probele jurnalului de cereri (§65) si ale firului (§66).
 *
 * Hotararile sunt in `jurnal.ts` si sunt curate dinadins: nu ating nici reteaua,
 * nici baza de date. Altfel intrebarea „se jurnalizeaza o citire reusita?" ar fi
 * cerut un client de Supabase ca sa primeasca un raspuns — si atunci n-ar mai fi
 * avut niciun raspuns.
 */

/* ── Ce se scrie si ce nu ──────────────────────────────────────────────────── */

test("eMAG jurnal: o citire REUSITA nu se scrie", () => {
  /*
   * ═══ DE CE E O HOTARARE, NU O SCAPARE ═══
   *
   * Cronul bate din minut in minut: reconciliere, comenzi, retururi. Scrise si
   * citirile reusite, ar fi fost zeci de mii de randuri pe zi din care NICIUNUL nu
   * spune nimic — aceleasi citiri idempotente, repetate la nesfarsit.
   *
   * Un jurnal in care nu se poate cauta nu e un jurnal, e o factura de stocare.
   */
  assert.equal(deJurnalizat("GET", "reusit"), false);
});

test("eMAG jurnal: TOATE scrierile se scriu, chiar si cele reusite", () => {
  /* O scriere are efecte, iar efectele trebuie sa aiba urma. „Pretul ala chiar a
     plecat?" e singura intrebare care se pune despre o integrare de marketplace. */
  assert.equal(deJurnalizat("POST", "reusit"), true);
  assert.equal(deJurnalizat("PATCH", "reusit"), true);
});

test("eMAG jurnal: orice NEREUSITA se scrie, si citirile la fel", () => {
  for (const v of ["refuz", "trecatoare", "chei", "reusit_cu_observatii"]) {
    assert.equal(deJurnalizat("GET", v), true, `citire cu verdict «${v}»`);
    assert.equal(deJurnalizat("POST", v), true, `scriere cu verdict «${v}»`);
  }
});

test("eMAG jurnal: «reusit_cu_observatii» NU e tratat ca o reusita curata", () => {
  /*
   * ⚠ Verdictul asta nu exista la niciun alt furnizor din Edinio, si e chiar capcana
   * eMAG: `isError: true` pe `product_offer/save` inseamna ca oferta E SALVATA, dar cu
   * observatii de documentatie.
   *
   * Tratat ca „reusit", el ar fi fost singurul caz in care oferta pleaca STRICATA si
   * jurnalul tace — adica exact randul dupa care s-ar fi cautat.
   */
  assert.equal(deJurnalizat("GET", "reusit_cu_observatii"), true);
});

/* ── Firul (§66) ───────────────────────────────────────────────────────────── */

test("eMAG jurnal: firul se vede inauntrul lucrarii si nu se scurge in afara", () => {
  assert.equal(firulCurent(), null, "in afara: niciun fir");
  return cuFir("proba-1", async () => {
    assert.equal(firulCurent(), "proba-1");
  }).then(() => {
    assert.equal(firulCurent(), null, "dupa lucrare: firul s-a stins");
  });
});

test("eMAG jurnal: doua lucrari deodata NU isi amesteca firele", () => {
  /*
   * ═══ CHIAR RAUL PE CARE IL PREVINE §66 ═══
   *
   * Cronul face lucrari una dupa alta, dar in acelasi proces. Cu un fir tinut intr-o
   * variabila de modul, a doua lucrare l-ar fi suprascris pe al primei — si cine
   * urmareste o cadere ar fi vazut cereri amestecate din doua lucrari fara nicio
   * legatura. `AsyncLocalStorage` tine cate un fir pe lant de asteptare.
   */
  const vazute: (string | null)[] = [];
  return Promise.all([
    cuFir("una", async () => {
      await new Promise((r) => setTimeout(r, 5));
      vazute.push(firulCurent());
    }),
    cuFir("alta", async () => {
      vazute.push(firulCurent());
    }),
  ]).then(() => {
    assert.deepEqual(vazute.sort(), ["alta", "una"]);
  });
});

test("eMAG jurnal: doua fire pornite in aceeasi clipa sunt DIFERITE", () => {
  /* Cu `Math.random()` singur, doua cereri din aceeasi milisecunda ar fi putut primi
     acelasi fir, iar cine urmareste o cadere ar fi vazut doua lucrari amestecate. */
  const fire = new Set(Array.from({ length: 200 }, () => firNou("coada")));
  assert.equal(fire.size, 200);
  assert.match([...fire][0], /^coada-[0-9a-f]{8}$/);
});

/* ── Id-urile atinse ───────────────────────────────────────────────────────── */

test("eMAG jurnal: id-urile se citesc din incarcatura de scriere, din `data`", () => {
  assert.deepEqual(idurileAtinse({ data: [{ id: 7 }, { id: 9 }] }), [7, 9]);
  assert.deepEqual(idurileAtinse({ data: { id: 5 } }), [5]);
  assert.deepEqual(idurileAtinse([{ id: 1 }]), [1]);
});

test("eMAG jurnal: o incarcatura fara id-uri da o lista goala, NU un zero inventat", () => {
  /* Un `0` scris in `emag_ids` ar fi legat randul de o oferta care nu exista, iar
     „ce s-a intamplat cu oferta asta" ar fi intors cereri straine. */
  assert.deepEqual(idurileAtinse({ data: [{ sale_price: 10 }] }), []);
  assert.deepEqual(idurileAtinse({}), []);
  assert.deepEqual(idurileAtinse(null), []);
  assert.deepEqual(idurileAtinse("nu e un obiect"), []);
  assert.deepEqual(idurileAtinse({ data: [{ id: "sapte" }] }), [], "text, nu numar");
  assert.deepEqual(idurileAtinse({ data: [{ id: Number.NaN }] }), []);
});

test("eMAG jurnal: id-urile se dedubleaza si se margineste cate se scriu", () => {
  assert.deepEqual(idurileAtinse({ data: [{ id: 3 }, { id: 3 }] }), [3]);
  const multe = { data: Array.from({ length: 500 }, (_, i) => ({ id: i + 1 })) };
  assert.equal(idurileAtinse(multe).length, MAXIM_IDURI,
    "⚠ randul de jurnal n-are voie sa fie mai mare decat cererea");
});

/* ── Mesajele lor ──────────────────────────────────────────────────────────── */

test("eMAG jurnal: mesajele LOR nu se rezuma si nu se traduc", () => {
  /*
   * ⚠ `doc_errors` si mesajele de validare sunt SINGURUL loc din care afla cineva ce
   * e de reparat. Un rezumat scris de noi ar fi pierdut exact campul si valoarea — si
   * ar fi lasat produsul „in aprobare" la nesfarsit, ca la Trendyol.
   */
  const alLor = ["characteristic 38 (Marime) is required for category 2735"];
  assert.deepEqual(mesajeDeScris(alLor), alLor);
});

test("eMAG jurnal: se taie doar lungimea absurda, si se arata ca s-a taiat", () => {
  const lung = "x".repeat(MAXIM_CARACTERE + 200);
  const iesit = mesajeDeScris([lung])[0];
  assert.equal(iesit.length, MAXIM_CARACTERE + 1);
  assert.ok(iesit.endsWith("…"), "se vede ca a fost taiat, nu pare intreg");
});

test("eMAG jurnal: un raspuns cu sute de mesaje nu umple randul", () => {
  const multe = Array.from({ length: 300 }, (_, i) => `mesajul ${i}`);
  assert.equal(mesajeDeScris(multe).length, MAXIM_MESAJE);
});

test("eMAG jurnal: lipsa mesajelor da o lista goala, nu cade", () => {
  assert.deepEqual(mesajeDeScris(undefined), []);
  assert.deepEqual(mesajeDeScris([]), []);
  assert.deepEqual(mesajeDeScris(["", "bun"]), ["bun"]);
});
