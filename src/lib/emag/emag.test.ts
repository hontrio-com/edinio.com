import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ardeIncercare, clasificaRaspuns, mesajeEmag, poarteObservatii, sAIncheiat,
} from "./errors";
import { emagUrl, iesireEmag, monedaEmag } from "./auth";
import { citesteNumarul } from "./client";
import {
  alegeCotaTva, alegeTimpPregatire, caracteristiciLipsa, caracteristiciObligatorii,
  categoriiIngaduite,
} from "./taxonomy";
import { EMAG_TRECERI_RETUR, EMAG_VALIDARE_VANDABILA } from "./types";

/*
 * Probele integrarii eMAG.
 *
 * Ce pazesc: exact deciziile pe care le-am gresit deja la alte marketplace-uri,
 * plus cele doua capcane scrise negru pe alb in documentatia eMAG. Fiecare grup
 * de mai jos spune, in titlu, REGULA — nu numele functiei.
 *
 * Functiile probate sunt pure dinadins: se pot chema fara retea, fara baza si
 * fara proxy. Aceeasi alegere ca la `rutaDeTrimitere` si `marcajUrmator` de la
 * Trendyol.
 */

/* ── Verdictul unui raspuns ────────────────────────────────────────────────── */

test("eMAG: `isError: true` la salvarea unui produs NU e un esec — oferta e salvata", () => {
  /*
   * Documentatia lor, cuvant cu cuvant: „in the event of a documentation error
   * when saving a product, the API returns «isError»: true but the new offer is
   * still saved and processed."
   *
   * Citit ca esec, coada nu se goleste niciodata si cele 3 cereri pe secunda ale
   * magazinului se duc pe o eroare care nu se repara singura.
   */
  const c = clasificaRaspuns(200, {
    isError: true,
    messages: ["Characteristic 'Culoare' is mandatory for this category"],
  }, "/product_offer/save");

  assert.equal(c.verdict, "reusit_cu_observatii");
  assert.equal(sAIncheiat(c.verdict), true, "elementul iese din coada");
  assert.equal(ardeIncercare(c.verdict), false, "si nu arde nicio incercare");
  assert.match(c.mesaj, /Culoare/, "observatia se pastreaza, ca s-o vada omul");
});

test("eMAG: aceeasi forma pe ALTA ruta e un refuz obisnuit", () => {
  /*
   * Exceptia e scrisa numai despre salvarea unui produs. Luata larg, ar fi
   * ascuns refuzuri adevarate pe comenzi si pe AWB — adica o comanda
   * neconfirmata sau un AWB neemis, raportate drept reusite.
   */
  const c = clasificaRaspuns(200, { isError: true, messages: ["Order cannot be edited"] }, "/order/save");
  assert.equal(c.verdict, "refuz");
  assert.equal(sAIncheiat(c.verdict), false);
});

test("eMAG: numai `product_offer/save` poarta observatii", () => {
  assert.equal(poarteObservatii("/product_offer/save"), true);
  assert.equal(poarteObservatii("/offer/save"), false);
  assert.equal(poarteObservatii("/order/acknowledge/123"), false);
  assert.equal(poarteObservatii("/awb/save"), false);
});

test("eMAG: `isError: false` e reusita curata", () => {
  const c = clasificaRaspuns(200, { isError: false, messages: [], results: [] }, "/product_offer/save");
  assert.equal(c.verdict, "reusit");
  assert.equal(c.mesaj, "");
});

test("eMAG: un 429 sau un 503 NU arde o incercare din coada", () => {
  /*
   * Lectia din `src/lib/trendyol/sync.ts:81`: cinci minute de 429 goleau
   * definitiv coada unui magazin, fiindca fiecare raspuns ardea o incercare.
   */
  for (const status of [429, 500, 502, 503, 504, 408, 0]) {
    const c = clasificaRaspuns(status, {}, "/product_offer/save");
    assert.equal(c.verdict, "trecatoare", `status ${status}`);
    assert.equal(ardeIncercare(c.verdict), false, `status ${status} nu arde`);
  }
});

test("eMAG: un 400 e refuz si ARDE o incercare", () => {
  const c = clasificaRaspuns(400, { isError: true, messages: ["Invalid vat_id"] }, "/offer/save");
  assert.equal(c.verdict, "refuz");
  assert.equal(ardeIncercare(c.verdict), true);
});

test("eMAG: 401 SI 403 sunt probleme de CONT, nu de continut", () => {
  /*
   * ⚠ 403 nu e refuz. La eMAG inseamna de obicei IP nealbit sau utilizator fara
   * drept de API — amandoua se rezolva in contul comerciantului, nu prin
   * reincercare. Tratat ca refuz, fiecare produs din coada ar arde cinci
   * incercari degeaba.
   */
  for (const status of [401, 403]) {
    const c = clasificaRaspuns(status, {}, "/vat/read");
    assert.equal(c.verdict, "chei", `status ${status}`);
    assert.equal(ardeIncercare(c.verdict), false);
    assert.match(c.mesaj, /IP/i, "mesajul pomeneste lista albă de IP-uri");
  }
});

/* ── Mesajele ─────────────────────────────────────────────────────────────── */

test("eMAG: mesajele se citesc si ca text, si ca obiecte", () => {
  /*
   * OpenAPI-ul lor declara `string[]`, dar in practica sosesc si obiecte. Daca
   * normalizarea ar cadea, `last_error` ar ajunge „[object Object]" si n-ar mai
   * ajuta pe nimeni.
   */
  assert.deepEqual(mesajeEmag({ messages: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(mesajeEmag({ messages: [{ message: "lipseste EAN" }] }), ["lipseste EAN"]);
  assert.deepEqual(mesajeEmag({ messages: [{ field: "ean", message: "invalid" }] }), ["ean: invalid"]);
  assert.deepEqual(mesajeEmag({ messages: [] }), []);
  assert.deepEqual(mesajeEmag({}), []);
  assert.deepEqual(mesajeEmag(null), []);
  assert.deepEqual(mesajeEmag({ messages: ["  ", "x"] }), ["x"], "randurile goale se arunca");
});

/* ── Adresele ─────────────────────────────────────────────────────────────── */

test("eMAG: cele patru rute cu `/api-3` in cale NU primesc prefixul de doua ori", () => {
  /*
   * ⚠ E o scapare in OpenAPI-ul lor: serverul e `…/api-3`, dar patru rute isi
   * poarta prefixul in cale. Lipite naiv, ar iesi `/api-3/api-3/invoice/read` si
   * un 404 fara nicio explicatie.
   */
  assert.equal(emagUrl("ro", "/order/read"), "https://marketplace-api.emag.ro/api-3/order/read");
  assert.equal(emagUrl("ro", "/api-3/invoice/read"), "https://marketplace-api.emag.ro/api-3/invoice/read");
  assert.equal(
    emagUrl("ro", "/api-3/smart-deals-price-check?productId=7"),
    "https://marketplace-api.emag.ro/api-3/smart-deals-price-check?productId=7",
  );
});

test("eMAG: fiecare tara are gazda ei", () => {
  assert.equal(emagUrl("ro", "/vat/read"), "https://marketplace-api.emag.ro/api-3/vat/read");
  assert.equal(emagUrl("bg", "/vat/read"), "https://marketplace-api.emag.bg/api-3/vat/read");
  assert.equal(emagUrl("hu", "/vat/read"), "https://marketplace-api.emag.hu/api-3/vat/read");
  assert.equal(emagUrl(undefined, "/vat/read"), "https://marketplace-api.emag.ro/api-3/vat/read");
});

/* ── Moneda ───────────────────────────────────────────────────────────────── */

test("eMAG: Bulgaria trece de la BGN la EUR pe 1 ianuarie 2026", () => {
  /*
   * Scrisa ca functie de DATA, nu ca o constanta: o constanta ar fi ramas
   * corecta pana intr-o noapte si apoi ar fi mintit fara nicio eroare, iar
   * preturile s-ar fi trimis in moneda gresita.
   */
  assert.equal(monedaEmag("bg", new Date("2025-12-31T23:59:59Z")), "BGN");
  assert.equal(monedaEmag("bg", new Date("2026-01-01T00:00:00Z")), "EUR");
  assert.equal(monedaEmag("bg", new Date("2026-08-23T00:00:00Z")), "EUR");
  assert.equal(monedaEmag("ro", new Date("2026-08-23T00:00:00Z")), "RON");
  assert.equal(monedaEmag("hu", new Date("2026-08-23T00:00:00Z")), "HUF");
});

/* ── Nomenclatoare care sunt REGULI, nu doar liste ────────────────────────── */

test("eMAG: starile de validare in care oferta se poate vinde sunt exact cele patru", () => {
  /*
   * Nu e o lista aleasa de noi. Documentatia: oferta e disponibila doar cand
   * `stock > 0`, `status = 1`, `offer_validation_status = 1` SI
   * `validation_status` e 3, 9, 11 sau 12.
   *
   * ⚠ 9 („documentatie aprobata") singur NU ajunge, si de aia nu se scrie
   * nicaieri `=== 9`.
   */
  assert.deepEqual([...EMAG_VALIDARE_VANDABILA], [3, 9, 11, 12]);
  for (const respins of [5, 6, 8, 10]) {
    assert.equal(EMAG_VALIDARE_VANDABILA.includes(respins), false, `${respins} nu e vandabila`);
  }
});

test("eMAG: trecerile de stare la retur sunt cele din tabelul lor", () => {
  /* O trecere nepermisa e refuzata cu un mesaj greu de citit, iar butonul care
     n-ar fi trebuit sa existe ajunge oricum sub degetul comerciantului. */
  assert.deepEqual([...EMAG_TRECERI_RETUR[2]], [2, 3, 5], "din Nou");
  assert.deepEqual([...EMAG_TRECERI_RETUR[3]], [3, 5, 6], "din Confirmat");
  assert.deepEqual([...EMAG_TRECERI_RETUR[6]], [4, 6, 7], "din Primit");
  assert.deepEqual([...EMAG_TRECERI_RETUR[4]], [4], "Refuzat e terminal");
  assert.deepEqual([...EMAG_TRECERI_RETUR[5]], [5], "Anulat e terminal");
  assert.deepEqual([...EMAG_TRECERI_RETUR[7]], [7], "Finalizat e terminal");
});

/* ── Cota de TVA ──────────────────────────────────────────────────────────── */

test("eMAG: cota de TVA se potriveste si cand ei o dau in fractii, si cand o dau in procente", () => {
  /*
   * ⚠ `store_settings.vat_rate` e in PROCENTE (21). eMAG intoarce `vat_rate` fara
   * sa spuna in ce unitate, si se vede si `21`, si `0.21`. Un `vat_id` gresit NU da
   * eroare: oferta se publica si se vinde cu TVA-ul altcuiva, si se afla la
   * contabilitate.
   */
  const inProcente = [{ vat_id: 1, vat_rate: 21 }, { vat_id: 2, vat_rate: 11 }];
  const inFractii = [{ vat_id: 1, vat_rate: 0.21 }, { vat_id: 2, vat_rate: 0.11 }];

  assert.equal(alegeCotaTva(inProcente, 21)?.vat_id, 1);
  assert.equal(alegeCotaTva(inFractii, 21)?.vat_id, 1);
  assert.equal(alegeCotaTva(inProcente, 11)?.vat_id, 2);
  assert.equal(alegeCotaTva(inFractii, 11)?.vat_id, 2);
});

test("eMAG: cota 0 e o cota adevarata, nu o lipsa", () => {
  /* Magazinele neplatitoare de TVA o folosesc. Tratata ca fractie, 0 ar fi trecut
     prin `v < 1` si ar fi iesit tot 0 — corect din intamplare; scrisa explicit,
     ramane corecta si daca se schimba normalizarea. */
  const cote = [{ vat_id: 5, vat_rate: 0 }, { vat_id: 1, vat_rate: 21 }];
  assert.equal(alegeCotaTva(cote, 0)?.vat_id, 5);
});

test("eMAG: cand nicio cota nu se potriveste NU se alege una implicita", () => {
  /*
   * ⚠ Cea mai importanta proba din grupul asta. Alegerea „cotei implicite a
   * contului" ar fi parut prudenta si ar fi trimis in tacere alt TVA decat cel din
   * magazin. `null` inseamna „intreaba omul", si asa trebuie sa ramana.
   */
  const cote = [{ vat_id: 1, vat_rate: 21, is_default: 1 }, { vat_id: 2, vat_rate: 11 }];
  assert.equal(alegeCotaTva(cote, 19), null);
  assert.equal(alegeCotaTva([], 21), null);
  assert.equal(alegeCotaTva(cote, Number.NaN), null);
});

/* ── Timpul de pregatire ──────────────────────────────────────────────────── */

test("eMAG: timpul de pregatire se rotunjeste IN SUS, nu la cel mai apropiat", () => {
  /*
   * Un magazin care expediaza in 3 zile si trimite „2" fiindca 2 e mai aproape
   * decat 5 promite mai repede decat poate. La eMAG intarzierea se numara si scade
   * nota vanzatorului, deci rotunjirea in sus e conservatoare in singurul sens
   * care conteaza.
   */
  const valori = [{ value: 0 }, { value: 1 }, { value: 2 }, { value: 5 }, { value: 7 }];
  assert.equal(alegeTimpPregatire(valori, 3), 5, "3 urca la 5, nu coboara la 2");
  assert.equal(alegeTimpPregatire(valori, 2), 2, "o valoare exacta ramane");
  assert.equal(alegeTimpPregatire(valori, 0), 0);
  assert.equal(alegeTimpPregatire(valori, 30), 7, "peste maxim se ia maximul, nu se inventeaza");
  assert.equal(alegeTimpPregatire([], 3), null);
});

/* ── Caracteristicile categoriei ──────────────────────────────────────────── */

test("eMAG: se verifica LOCAL ce caracteristici obligatorii lipsesc", () => {
  /*
   * Fara verificarea asta, fiecare produs incomplet ar pleca, ar consuma din cele
   * 3 cereri pe secunda si s-ar intoarce cu `isError: true`. Costul e chiar bugetul
   * de ritm al magazinului.
   */
  const cat = {
    id: 506,
    characteristics: [
      { id: 1, name: "Culoare", is_mandatory: 1 },
      { id: 2, name: "Material", is_mandatory: 1 },
      { id: 3, name: "Note", is_mandatory: 0 },
    ],
  };
  assert.deepEqual(caracteristiciObligatorii(cat).map((c) => c.id), [1, 2]);
  assert.deepEqual(caracteristiciLipsa(cat, [{ id: 1, value: "rosu" }]).map((c) => c.id), [2]);
  assert.deepEqual(caracteristiciLipsa(cat, [{ id: 1, value: "rosu" }, { id: 2, value: "bumbac" }]), []);
  assert.deepEqual(
    caracteristiciLipsa(cat, [{ id: 1, value: "rosu" }, { id: 2, value: "   " }]).map((c) => c.id),
    [2],
    "o valoare goala nu completeaza nimic",
  );
});

test("eMAG: o categorie in care vanzatorul n-are voie NU intra in sugestii", () => {
  /*
   * ⚠ `is_allowed !== 1` nu inseamna „ascunde din lista", inseamna „produsele
   * trimise acolo se resping" — si respingerea vine ca eroare de documentatie,
   * deci arata exact ca o caracteristica lipsa.
   */
  const categorii = [
    { id: 1, name: "Telefoane mobile", is_allowed: 1 },
    { id: 2, name: "Medicamente", is_allowed: 0 },
    { id: 3, name: "  ", is_allowed: 1 },
  ];
  assert.deepEqual(categoriiIngaduite(categorii), [{ id: 1, label: "Telefoane mobile" }]);
});

/* ── Iesirea catre eMAG ───────────────────────────────────────────────────── */

test("eMAG: o adresa stricata a releului NU darama pagina de integrari", () => {
  /*
   * ⚠ CEA MAI SCUMPA PROBA DIN FISIER, si nu se vede de ce.
   *
   * `iesireEmag()` se cheama la RANDAREA hub-ului de integrari, ca sa se stie daca
   * se pune lacat pe cardul eMAG. Dedesubt, `new ProxyAgent(url)` ARUNCA la o
   * adresa stricata — verificat: `ERR_INVALID_URL` pentru „nu-e-adresa",
   * „http://" si un sir gol.
   *
   * Deci o litera gresita intr-o variabila de mediu ar fi daramat pagina de
   * integrari pentru TOTI comerciantii, nu doar pentru cine foloseste eMAG. Si nu
   * la o cerere catre eMAG, ci la simpla deschidere a paginii.
   */
  const vechi = process.env.EMAG_PROXY_URL;
  try {
    for (const stricata of ["nu-e-adresa", "http://", "   x   "]) {
      process.env.EMAG_PROXY_URL = stricata;
      const r = iesireEmag();
      assert.equal(r.dispatcher, null, `„${stricata}" nu trebuie sa dea dispatcher`);
      assert.ok(r.eroare, `„${stricata}" trebuie sa spuna ce e in neregula`);
    }

    process.env.EMAG_PROXY_URL = "";
    const gol = iesireEmag();
    assert.equal(gol.dispatcher, null);
    assert.match(gol.eroare ?? "", /EMAG_PROXY_URL/);

    process.env.EMAG_PROXY_URL = "http://user:parola@127.0.0.1:3128";
    const buna = iesireEmag();
    assert.ok(buna.dispatcher, "o adresa buna da dispatcher");
    assert.equal(buna.eroare, null);
  } finally {
    if (vechi === undefined) delete process.env.EMAG_PROXY_URL;
    else process.env.EMAG_PROXY_URL = vechi;
  }
});

/* ── Refuzul CERERII INTREGI, pe ruta care „poarta observatii" ─────────────── */

test("eMAG: «Maximum input vars» e REFUZ, nu «salvat cu observatii»", () => {
  /*
   * Cea mai scumpa nuanta din tot fisierul.
   *
   * `/product_offer/save` e ruta pe care documentatia lor spune ca `isError: true`
   * poate insemna totusi „oferta e salvata". Prima forma a clasificarii se uita DOAR
   * la ruta, deci orice `isError` de acolo iesea `reusit_cu_observatii` — adica „gata,
   * scoate-l din coada, nu reincerca".
   *
   * Dar aceeasi ruta refuza si CEREREA INTREAGA cand lotul e prea mare, si atunci nu
   * s-a salvat NIMIC. Citit ca observatie, un lot de 50 de produse ar fi iesit din
   * coada raportand succes, fara ca vreunul sa fi ajuns la eMAG — forma exacta a
   * incidentului VetDepo: raspuns de succes, zero efect, si nimeni nu afla.
   */
  const c = clasificaRaspuns(
    200,
    { isError: true, messages: ["Maximum input vars of 4000 exceeded"] },
    "/product_offer/save",
  );
  assert.equal(c.verdict, "refuz");
  assert.equal(sAIncheiat(c.verdict), false, "nu are voie sa iasa din coada");
  assert.equal(ardeIncercare(c.verdict), true, "arde o incercare: e vina cererii, se micsoreaza lotul");
});

test("eMAG: o eroare de documentatie ramane «salvat cu observatii» pe aceeasi ruta", () => {
  /* Cealalta jumatate a aceleiasi probe: sentinelul de mai sus e INGUST. Daca ar fi
     fost scris larg („orice mesaj cu «maximum»"), ar fi inghitit si observatiile
     adevarate, si atunci ofertele salvate ar fi fost retrimise la nesfarsit. */
  const c = clasificaRaspuns(
    200,
    { isError: true, messages: [{ field: "characteristics", message: "Maximum length exceeded for value" }] },
    "/product_offer/save",
  );
  assert.equal(c.verdict, "reusit_cu_observatii");
  assert.equal(sAIncheiat(c.verdict), true);
});

test("eMAG: acelasi mesaj pe ALTA ruta e refuz oricum", () => {
  const c = clasificaRaspuns(200, { isError: true, messages: ["orice"] }, "/order/acknowledge/1");
  assert.equal(c.verdict, "refuz");
});

/* ── Numarul de oferte: forma raspunsului NU e documentata ─────────────────── */

test("eMAG: numaratoarea intoarce `null` cand nu se poate citi, nu zero", () => {
  /*
   * Prima forma declara `{ results: { noResults } }`. Gresita de doua ori: `results`
   * e despachetat deja de client, iar `noResults` nu apare NICAIERI in OpenAPI-ul lor
   * — era inventat, nu citit.
   *
   * De ce conteaza ca `null` nu e `0`: daca paginarea si-ar lua sfarsitul dintr-un
   * zero inventat, primul import al fiecarui comerciant s-ar fi oprit inainte de a
   * citi ceva, si ar fi raportat „n-ai nicio oferta pe eMAG" unui om care are 400.
   */
  assert.equal(citesteNumarul(undefined), null);
  assert.equal(citesteNumarul({}), null);
  assert.equal(citesteNumarul({ results: { noResults: 7 } }), null, "nu se scotoceste in adancime");
  assert.equal(citesteNumarul("multe"), null);
});

test("eMAG: numaratoarea citeste formele plauzibile", () => {
  assert.equal(citesteNumarul(42), 42);
  assert.equal(citesteNumarul([1, 2, 3]), 3, "`results` e declarat tablou in spec");
  assert.equal(citesteNumarul({ count: 12 }), 12);
  assert.equal(citesteNumarul({ noResults: "350" }), 350, "ei trimit numere si ca text");
  assert.equal(citesteNumarul({ count: Number.NaN }), null, "NaN nu e un numar de oferte");
});
