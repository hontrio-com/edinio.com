import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  asteptareaUrmatoare, eVandabila, LOT_MAXIM, PRIORITATE_OP, rutaDeTrimitere,
  traducereaPoateBloca,
} from "./rute";
import { oferteUsoare, stocCuRezerva, stocuriDeTrimis } from "./mapping";

/*
 * Probele drumului pe care pleaca o modificare spre eMAG.
 *
 * ⚠ Toate greselile pazite aici raspund „reusit". Nu se vad nici la citire, nici la
 * rulare — se afla de la comerciant, peste o zi, cand intreaba de ce nu s-a schimbat
 * nimic. Exact asa s-a aflat la Trendyol, pe 1051 de produse.
 */

/*
 * ⚠ `catalogCitit: true` in BAZA, si dinadins: probele de mai jos verifica ALEGEREA
 * DRUMULUI, iar paza catalogului e alta intrebare, cu probele ei mai jos. Lasata pe
 * `false`, fiecare proba de aici ar fi cazut pe paza aceea si n-ar mai fi masurat
 * nimic din ce spune numele ei.
 */
const BAZA = { op: "pret" as const, existaLaEmag: true, autoSync: true, catalogCitit: true };

/* ── Drumul se alege dupa CE S-A SCHIMBAT ──────────────────────────────────── */

test("eMAG rute: o schimbare de pret NU merge pe ruta care trimite documentatia", () => {
  /*
   * ═══ CHIAR DEFECTUL VETDEPO, MUTAT LA eMAG ═══
   *
   * La Trendyol, `op: 'upsert'` pe un produs aprobat trimitea CONTINUT in loc de
   * pret. 1051 de produse au raportat succes cu preturile neschimbate.
   *
   * `product_offer/save` e ruta grea: duce documentatia intreaga si e singura care
   * poate CREA. Folosita pentru un pret, ea rescrie la eMAG tot ce a atins vreodata
   * comerciantul in panoul lor.
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret" }).fel, "oferta");
  assert.notEqual(rutaDeTrimitere({ ...BAZA, op: "pret" }).fel, "creeaza");
});

test("eMAG rute: o miscare de stoc merge pe ruta cea mai usoara", () => {
  /* `PATCH /offer_stock/{id}` nu atinge nici pretul, nici documentatia. Trimisa mai
     greu, o oferta preluata si-ar fi pierdut modificarile la FIECARE vanzare. */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc" }).fel, "stoc");
});

test("eMAG rute: publicarea e singura care merge pe ruta grea", () => {
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "oferta" }).fel, "creeaza");
});

test("eMAG rute: masuratorile au ruta lor", () => {
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "masuratori" }).fel, "masuratori");
});

/* ── Prima trimitere nu poate fi o actualizare ─────────────────────────────── */

test("eMAG rute: o oferta care nu exista inca la ei pleaca pe ruta care CREEAZA", () => {
  /*
   * Oricat de mica ar fi lucrarea ceruta. Trimisa pe `offer_stock`, eMAG ar fi
   * raspuns cu un refuz despre un id inexistent — iar produsul ar fi ramas
   * nepublicat, cu un mesaj care nu spune nicaieri „mai intai publica-l".
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc", existaLaEmag: false }).fel, "creeaza");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret", existaLaEmag: false }).fel, "creeaza");
});

/* ── Ofertele preluate ─────────────────────────────────────────────────────── */

test("eMAG rute: unei oferte PRELUATE nu i se rescrie pretul singur", () => {
  /*
   * ⚠ A DOUA PAZA, si trebuie sa existe chiar daca prima e in coada.
   *
   * Ofertele aduse de import au `auto_sync: false`: pretul si stocul lor sunt puse
   * de comerciant in panoul eMAG. Un rand poate ajunge in coada INAINTE ca
   * `auto_sync` sa fie stins de importul care ruleaza chiar atunci — si atunci numai
   * verificarea de aici mai apuca sa-l opreasca.
   */
  const r = rutaDeTrimitere({ ...BAZA, op: "pret", autoSync: false });
  assert.equal(r.fel, "nimic");
  assert.match(r.motiv ?? "", /preluat/i);
  assert.match(r.motiv ?? "", /Trimite acum/, "motivul spune si ce poate face omul");
});

test("eMAG rute: dar cand comerciantul apasa el butonul, pleaca", () => {
  /*
   * „Nu trimite singur" nu inseamna „nu trimite niciodata" — inseamna „nu fara sa-mi
   * ceri". Confundate, butonul „Trimite acum" n-ar fi facut nimic pe ofertele
   * preluate, si nici n-ar fi spus de ce.
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret", autoSync: false, fortat: true }).fel, "oferta");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc", autoSync: false, fortat: true }).fel, "stoc");
});

/* ── Retragerea trece peste tot ────────────────────────────────────────────── */

test("eMAG rute: stergerea unui produs preluat ajunge TOTUSI la eMAG", () => {
  /*
   * ⚠ ORDINEA VERIFICARILOR. Pusa dupa paza ofertelor preluate, retragerea unui
   * produs importat n-ar fi plecat niciodata — si magazinul ar fi continuat sa vanda
   * pe eMAG un produs care nu mai exista la noi. Nimeni nu apasa „Trimite acum"
   * pentru un produs pe care tocmai l-a sters.
   */
  assert.equal(rutaDeTrimitere({ op: "retragere", existaLaEmag: true, autoSync: false, catalogCitit: true }).fel, "retrage");
});

test("eMAG rute: o oferta care n-a ajuns niciodata la ei nu se retrage", () => {
  const r = rutaDeTrimitere({ op: "retragere", existaLaEmag: false, autoSync: true, catalogCitit: true });
  assert.equal(r.fel, "nimic");
  assert.match(r.motiv ?? "", /niciodat/i);
});

/* ── Nu se creeaza nimic la ei inainte sa le fi citit catalogul (24.08.2026) ── */

test("eMAG rute: publicarea NU pleaca inainte sa le fi citit catalogul", () => {
  /*
   * ═══ INCIDENTUL DIN 24.08.2026, FACUT PROBA ═══
   *
   * Un comerciant cu produsele deja in contul lui eMAG a pus 208 la publicat fara sa
   * fi rulat vreodata importul. Din 150 de trimiteri masurate: doua treimi refuzate cu
   * „You already hold a Product associated with this PN”, o treime ajunse ciorne fara
   * EAN in contul LOR. Zero publicate.
   *
   * ⚠ Si niciuna n-a fost o eroare. Verdictele au fost „reusit” si „reusit cu
   * observatii”; ecranul ar fi aratat „208 trimise”. De aceea paza sta AICI, in
   * alegerea drumului, si nu intr-o citire a raspunsului: raspunsul lor nu spune „ai
   * gresit”.
   */
  const r = rutaDeTrimitere({ ...BAZA, op: "oferta", existaLaEmag: false, catalogCitit: false });
  assert.equal(r.fel, "nimic");
  assert.notEqual(r.fel, "creeaza");
  assert.match(r.motiv ?? "", /Import/i, "motivul trebuie sa spuna ce sa apese");
});

test("eMAG rute: nici stocul si nici pretul nu creeaza inainte de citirea catalogului", () => {
  /* ⚠ Cea mai usoara lucrare din lume — o miscare de stoc — trece prin `creeaza` cand
     oferta nu exista inca la ei. Pazita numai la `op: "oferta"`, o vanzare ar fi
     deschis chiar usa pe care o inchidem. */
  for (const op of ["stoc", "pret", "masuratori"] as const) {
    const r = rutaDeTrimitere({ ...BAZA, op, existaLaEmag: false, catalogCitit: false });
    assert.equal(r.fel, "nimic", `${op} n-are voie sa creeze`);
  }
});

test("eMAG rute: o oferta pe care ei o STIU pleaca si fara catalogul citit", () => {
  /*
   * ⚠ Paza opreste CREAREA, nu sincronizarea. Cand ei cunosc deja oferta,
   * `product_offer/save` actualizeaza si n-are cu ce se ciocni.
   *
   * Oprita si aici, paza ar fi inghetat pretul si stocul TUTUROR ofertelor unui
   * magazin pana la urmatorul import — adica ar fi facut, tacut, exact raul de care
   * ne aparam: eMAG vinde mai departe marfa la pretul vechi.
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret", catalogCitit: false }).fel, "oferta");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc", catalogCitit: false }).fel, "stoc");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "oferta", catalogCitit: false }).fel, "creeaza");
});

test("eMAG rute: retragerea trece peste paza catalogului", () => {
  /* ⚠ Aceeasi regula de ordine ca la ofertele preluate: un produs sters din magazin
     trebuie oprit de la vanzare pe eMAG oricand, indiferent ce stim despre catalog. */
  assert.equal(
    rutaDeTrimitere({ op: "retragere", existaLaEmag: true, autoSync: true, catalogCitit: false }).fel,
    "retrage",
  );
});

test("eMAG rute: „Trimite acum” NU trece peste paza catalogului", () => {
  /*
   * ⚠ ALTA PAZA DECAT CEA A OFERTELOR PRELUATE, SI NU SE COMPORTA LA FEL.
   *
   * Acolo, `fortat` inseamna „stiu ce fac, e oferta mea”. Aici n-ar insemna nimic: nici
   * comerciantul nu stie daca produsul e deja la ei — tocmai asta n-am citit. Trecuta
   * cu `fortat`, paza ar fi cedat exact in locul in care a fost apasat butonul pe 208
   * produse deodata.
   */
  const r = rutaDeTrimitere({
    ...BAZA, op: "oferta", existaLaEmag: false, catalogCitit: false, fortat: true,
  });
  assert.equal(r.fel, "nimic");
});

/* ── Loturile ──────────────────────────────────────────────────────────────── */

test("eMAG rute: niciun lot nu trece de 50", () => {
  /* Peste 50, `product_offer/save` intoarce „Maximum input vars of 4000 exceeded" si
     NU salveaza nimic din lot. Vezi `errors.ts`, unde raspunsul e clasificat refuz. */
  for (const [fel, cat] of Object.entries(LOT_MAXIM)) {
    assert.ok(cat <= 50, `${fel} are lot ${cat}`);
  }
  assert.equal(LOT_MAXIM.stoc, 1, "`offer_stock` e PATCH pe un id, deci n-are lot");
});

/* ── Vandabilitatea ────────────────────────────────────────────────────────── */

const APROBATA = { stoc: 3, status: 1, offer_validation_status: 1, validation_status: 9 };

test("eMAG: o oferta e vandabila numai cu toate cele patru conditii deodata", () => {
  /*
   * Verificata pe una singura, ecranul ar fi spus „publicat" pentru oferte pe care
   * cumparatorul nu le vede — cea mai suparatoare minciuna a unui panou, fiindca
   * omul nu are cum s-o dovedeasca.
   */
  assert.equal(eVandabila(APROBATA), true);
  assert.equal(eVandabila({ ...APROBATA, stoc: 0 }), false, "fara stoc");
  assert.equal(eVandabila({ ...APROBATA, status: 0 }), false, "oprita");
  assert.equal(eVandabila({ ...APROBATA, offer_validation_status: 2 }), false, "oferta nevalidata");
  assert.equal(eVandabila({ ...APROBATA, validation_status: 1 }), false, "asteapta MKTP");
  assert.equal(eVandabila({ ...APROBATA, validation_status: null }), false, "nu stim");
});

test("eMAG: cele patru stari de validare care ingaduie vanzarea", () => {
  for (const v of [3, 9, 11, 12]) {
    assert.equal(eVandabila({ ...APROBATA, validation_status: v }), true, `validation_status ${v}`);
  }
  for (const v of [1, 2, 4, 5, 6, 8, 10]) {
    assert.equal(eVandabila({ ...APROBATA, validation_status: v }), false, `validation_status ${v}`);
  }
});

test("eMAG: traducerea se ARATA, nu se interpreteaza", () => {
  /*
   * ═══ CE NU STIM, NU PRETINDEM CA STIM ═══
   *
   * Documentatia lor spune doar ca „produsele traduse automat pot sa nu fie publicate
   * chiar cu validation_status 9/11 — verifica translation_validation_status pentru
   * granularitate". Cautat in tot OpenAPI-ul: campul apare de DOUA ori si nicaieri
   * nu i se enumera valorile.
   *
   * Prima forma a lui `eVandabila` avea aici o lista copiata dupa `validation_status`.
   * Era inventata — si inventata ar fi aratat „publicat" acolo unde eMAG blocheaza,
   * adica exact greseala impotriva careia te avertizeaza documentatia lor.
   */
  assert.equal(traducereaPoateBloca({ validation_status: 9, translation_validation_status: 5 }), true);
  assert.equal(traducereaPoateBloca({ validation_status: 9, translation_validation_status: null }), false,
    "n-au spus nimic despre traducere");
  assert.equal(traducereaPoateBloca({ validation_status: 1, translation_validation_status: 5 }), false,
    "cand oferta oricum nu e aprobata, traducerea nu e stirea zilei");
});

/* ── Rutele usoare nu depind de documentatie ───────────────────────────────── */

test("eMAG: o schimbare de pret merge si cand categoria NU e mapata", () => {
  /*
   * ═══ DEFECT PRINS LA VERIFICARE, NU LA SCRIS ═══
   *
   * Prima forma a expeditorului construia si pretul prin `construiesteOferte` — cea
   * care face DOCUMENTATIA. Aceea se opreste, pe drept, cand documentatia n-are cum
   * sa iasa bine: fara categorie sau fara `family_type_id`, intoarce ZERO oferte.
   *
   * Dar o schimbare de pret pe un produs deja publicat n-are nevoie de nimic din
   * toate acelea. Iesea exact defectul pe care toata integrarea se straduieste sa-l
   * evite: zero oferte construite, nicio cerere plecata, si verdict REUSIT.
   *
   * Aici produsul are variante si NICIO categorie. Pretul trebuie sa plece oricum.
   */
  const produs = {
    id: "p1", name: "Tricou", description: null, price: 121, compare_at_price: null,
    images: [], category: "Categorie nemapata", sku: "TR", weight_grams: null,
    stock_quantity: 10, is_active: true,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ id: "marime", name: "Mărime", values: ["S", "M"] }],
        combinations: [
          { id: "s", title: "S", price: 121, sku: "TR-S", enabled: true, stock_quantity: 3 },
          { id: "m", title: "M", price: 151, sku: "TR-M", enabled: true, stock_quantity: 7 },
        ],
      },
    },
  };
  const magazin = {
    vat_rate: 21, prices_include_vat: true, vat_id: 1, handling_time: 1, warehouse_id: 1,
    warranty: 24, price_band_pct: 30, source_language: "ro_RO", brand: null,
  };

  const oferte = oferteUsoare(produs, magazin, [
    { variant_title: "S", emag_id: 1000000001 },
    { variant_title: "M", emag_id: 1000000002 },
  ]);

  assert.equal(oferte.length, 2, "amandoua marimile pleaca, desi categoria lipseste");
  assert.equal(oferte[0].sale_price, 100, "121 cu TVA de 21% => 100 fara");
  assert.equal(oferte[1].sale_price, 124.7934);
  assert.equal(oferte[0].stock?.[0].value, 3, "fiecare marime cu stocul EI");
  assert.equal(oferte[1].stock?.[0].value, 7);
  assert.ok(oferte[0].min_sale_price! < oferte[0].sale_price!);
  assert.ok(oferte[0].max_sale_price! > oferte[0].sale_price!);
});

test("eMAG: un produs oprit in magazin pleaca cu `status: 0`, nu dispare", () => {
  /* eMAG NU are stergere de oferta. Un produs dezactivat trebuie oprit de la vanzare
     acolo, altfel continua sa se vanda ceva ce magazinul nu mai arata. */
  const produs = {
    id: "p2", name: "X", description: null, price: 100, compare_at_price: null, images: [],
    category: null, sku: "X", weight_grams: null, stock_quantity: 5, is_active: false,
    page_sections: {},
  };
  const magazin = {
    vat_rate: 21, prices_include_vat: false, vat_id: 1, handling_time: 1, warehouse_id: 1,
    warranty: 24, price_band_pct: 30, source_language: "ro_RO", brand: null,
  };
  const oferte = oferteUsoare(produs, magazin, [{ variant_title: null, emag_id: 5 }]);
  assert.equal(oferte[0].status, 0);
  assert.equal(oferte[0].sale_price, 100, "magazin fara TVA in pret: pretul nu se atinge");
});

test("eMAG: stocul unei combinatii nedeclarate cade pe cel al produsului", () => {
  const produs = {
    id: "p3", name: "Y", description: null, price: 100, compare_at_price: null, images: [],
    category: null, sku: "Y", weight_grams: null, stock_quantity: 12, is_active: true,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ id: "c", name: "Culoare", values: ["Roșu"] }],
        combinations: [{ id: "r", title: "Roșu", price: 100, sku: "Y-R", enabled: true }],
      },
    },
  };
  assert.deepEqual(
    stocuriDeTrimis(produs, [{ variant_title: "Roșu", emag_id: 9 }]),
    [{ emagId: 9, cantitate: 12 }],
  );
});

/* ── §4/§72. Prioritati si asteptare crescatoare ───────────────────────────── */

test("eMAG coada: o miscare de stoc trece inaintea unui catalog", () => {
  /*
   * ═══ DE CE EXISTA SCARA ═══
   *
   * Fara ea, coada mergea strict in ordinea intrarii — iar o miscare de stoc de dupa
   * o vanzare statea la rand in urma unui catalog de 20.000 de produse pus la publicat
   * cu un minut inainte. La 30 de elemente pe trecere, ar fi asteptat unsprezece ore.
   *
   * In orele acelea eMAG vinde mai departe marfa pe care magazinul n-o mai are.
   */
  assert.ok(PRIORITATE_OP.stoc < PRIORITATE_OP.oferta);
  assert.ok(PRIORITATE_OP.retragere < PRIORITATE_OP.pret);
  assert.ok(PRIORITATE_OP.pret < PRIORITATE_OP.oferta);
  assert.ok(PRIORITATE_OP.oferta < PRIORITATE_OP.masuratori,
    "publicarea e grea, dar masuratorile nu opresc nicio vanzare");
});

test("eMAG coada: fiecare `op` are o graba, si `stoc` e prima", () => {
  const toate = Object.entries(PRIORITATE_OP);
  assert.equal(toate.length, 5, "orice `op` nou trebuie sa primeasca o graba, nu una implicita");
  const ceaMaiMica = Math.min(...toate.map(([, v]) => v));
  assert.equal(PRIORITATE_OP.stoc, ceaMaiMica);
});

test("eMAG coada: asteptarea creste, si se opreste la patru ore", () => {
  /*
   * Un refuz nu se repara singur: acelasi produs va fi refuzat la fel si peste un
   * minut. Dar fiecare reincercare arde o cerere din cele 3 pe secunda ale
   * magazinului — aceleasi prin care pleaca o miscare de stoc.
   */
  const t = [1, 2, 3, 4, 5].map(asteptareaUrmatoare);
  for (let i = 1; i < t.length; i++) {
    assert.ok(t[i] > t[i - 1], `treapta ${i + 1} nu creste fata de ${i}`);
  }
  assert.equal(t[0], 60_000, "prima reincercare e la un minut, ca pana acum");
  assert.equal(t[4], 4 * 60 * 60_000);
});

test("eMAG coada: peste ultima treapta nu se mai creste, si nu se strica", () => {
  assert.equal(asteptareaUrmatoare(99), asteptareaUrmatoare(5));
  assert.equal(asteptareaUrmatoare(0), asteptareaUrmatoare(1), "zero incercari nu da un index negativ");
  assert.equal(asteptareaUrmatoare(-3), asteptareaUrmatoare(1));
});

/* ── §14. Timpul de pregatire nu se rescrie cu o valoare de rezerva ────────── */

test("eMAG: fara timp de pregatire ales, campul NU pleaca deloc", () => {
  /*
   * ═══ DEFECT GASIT DE SCEPTICI ═══
   *
   * `oferteUsoare` trimitea MEREU `handling_time`, iar contextul punea `?? 1`. Deci
   * fiecare schimbare de PRET a unui magazin care nu si-a ales timpul de pregatire ii
   * rescria valoarea de la eMAG cu „o zi".
   *
   * Un comerciant care expediaza in trei zile si-ar fi vazut oferta promitand una,
   * dupa o simpla modificare de pret. Fara nicio eroare: campul se accepta.
   *
   * `handling_time` e OPTIONAL la ei. Cand nu-l stim, nu-l trimitem — si atunci eMAG
   * pastreaza ce are.
   */
  const produs = {
    id: "p", name: "X", description: null, price: 100, compare_at_price: null, images: [],
    category: null, sku: "X", weight_grams: null, stock_quantity: 1, is_active: true,
    page_sections: {},
  };
  const faraTimp = {
    vat_rate: 21, prices_include_vat: false, vat_id: 1, handling_time: null, warehouse_id: 1,
    warranty: 24, price_band_pct: 30, source_language: "ro_RO", brand: null,
  };
  const cuTimp = { ...faraTimp, handling_time: 3 };

  assert.equal(oferteUsoare(produs, faraTimp, [{ variant_title: null, emag_id: 5 }])[0].handling_time,
    undefined, "campul lipseste cu totul, nu e trimis cu o valoare inventata");
  assert.deepEqual(oferteUsoare(produs, cuTimp, [{ variant_title: null, emag_id: 5 }])[0].handling_time,
    [{ warehouse_id: 1, value: 3 }], "cand se stie, pleaca ce a ales omul");
});

/* ── §12. Continutul oprit ─────────────────────────────────────────────────── */

test("eMAG: cu continutul oprit, publicarea coboara pe ruta usoara", () => {
  /*
   * Comerciantul care isi ingrijeste fisa in panoul eMAG a spus „nu-mi rescrie fisa".
   * O cerere de publicare pe o oferta care EXISTA nu se arunca — se face ce se poate:
   * pretul, stocul, starea.
   *
   * Aruncata, o salvare obisnuita de produs n-ar mai fi dus nici pretul nou, iar omul
   * ar fi crezut ca oprirea continutului a oprit sincronizarea cu totul.
   */
  assert.equal(
    rutaDeTrimitere({ ...BAZA, op: "oferta", sincronizeazaContinut: false }).fel,
    "oferta",
  );
  assert.equal(
    rutaDeTrimitere({ ...BAZA, op: "oferta", sincronizeazaContinut: true }).fel,
    "creeaza",
  );
});

test("eMAG: la o oferta care NU exista, oprirea continutului nu schimba nimic", () => {
  /* Nu e nimic de coborat: ori pleaca documentatia, ori produsul ramane nepublicat. */
  assert.equal(
    rutaDeTrimitere({ ...BAZA, op: "oferta", existaLaEmag: false, sincronizeazaContinut: false }).fel,
    "creeaza",
  );
});

test("eMAG: oprirea continutului NU opreste stocul si pretul", () => {
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc", sincronizeazaContinut: false }).fel, "stoc");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret", sincronizeazaContinut: false }).fel, "oferta");
});

/* ── §11. Rezerva de stoc ──────────────────────────────────────────────────── */

test("eMAG: rezerva se scade din stocul trimis", () => {
  assert.equal(stocCuRezerva(10, 2), 8);
  assert.equal(stocCuRezerva(10, 0), 10);
  assert.equal(stocCuRezerva(10, null), 10);
});

test("eMAG: rezerva mai mare decat stocul da ZERO, nu un numar negativ", () => {
  /*
   * ⚠ eMAG respinge numerele negative, iar oferta ar fi ramas neactualizata cu un
   * mesaj despre un camp — adica ar fi continuat sa vanda cele doua bucati pe care
   * omul le voia oprite. Zero opreste vanzarea, care e chiar ce a cerut.
   */
  assert.equal(stocCuRezerva(2, 3), 0);
  assert.equal(stocCuRezerva(0, 5), 0);
});

test("eMAG: o rezerva stricata nu strica stocul", () => {
  assert.equal(stocCuRezerva(10, Number.NaN), 10);
  assert.equal(stocCuRezerva(10, -3), 10, "o rezerva negativa nu ADAUGA stoc");
  assert.equal(stocCuRezerva(Number.NaN, 2), 0);
});

/* ── O oferta PRELUATA se poate retrage ──────────────────────────────── */

test("eMAG rute: o oferta preluata din contul lor SE POATE retrage", () => {
  /*
   * ═══ DEFECT GASIT DE RECENZIA ADVERSARIALA, 24.08.2026 ═══
   *
   * `existaLaEmag` se citea DOAR din `last_synced_at`, iar importul nu-l scrie — si
   * nici n-ar trebui: acela inseamna „cand am trimis NOI".
   *
   * Deci fiecare oferta preluata iesea cu `existaLaEmag: false`, iar retragerea
   * intorcea „nimic". Stergi un produs importat din magazin, elementul intra in coada,
   * iese „sarit", se sterge, se numara la „duse" — si oferta ramane la VANZARE pe eMAG.
   *
   * Comerciantul vede produsul disparut din Edinio si comenzi care continua sa vina
   * pentru marfa pe care n-o mai are. Niciun mesaj de eroare, nicaieri.
   */
  const preluata = rutaDeTrimitere({
    op: "retragere", existaLaEmag: true, autoSync: false, catalogCitit: true,
  });
  assert.equal(preluata.fel, "retrage", "oferta lor exista acolo: se poate opri");
});

test("eMAG rute: o oferta care N-A ajuns niciodata acolo nu se retrage", () => {
  /* ⚠ Paza ramane: un rand facut de noi si netrimis inca n-are ce sa opreasca. O
     cerere trimisa pentru el ar fi fost refuzata cu un mesaj despre un id necunoscut. */
  const r = rutaDeTrimitere({ op: "retragere", existaLaEmag: false, autoSync: true, catalogCitit: true });
  assert.equal(r.fel, "nimic");
});
