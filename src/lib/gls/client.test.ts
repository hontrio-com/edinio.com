import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  areEtichete,
  eroriPeColet,
  eroriRetiparire,
  numereColet,
  pdfDinEtichete,
  probaConexiune,
  pdfDinRetiparire,
  retipareste,
  stergeEtichete,
  urlMetoda,
  COD_UTILIZATOR_INEXISTENT,
  MAX_RETIPARIRI_PE_CERERE,
  MAX_STERGERI_PE_CERERE,
  TARI_MYGLS,
  TIPURI_IMPRIMANTA,
  type GlsConfig,
  type RaspunsEtichete,
} from "./client";

/*
 * ⚠ Integrarea se probeaza DIRECT IN PRODUCTIE, pe contractul unui client real.
 * Tot ce se poate verifica fara retea se verifica aici — pentru ca urmatoarea
 * ocazie e un colet adevarat, facturat.
 *
 * Ce NU se poate acoperi aici: raspunsul real al MyGLS. De aia probele de mai
 * jos lucreaza pe FORMA raspunsului, luata din integrarea WooCommerce care merge
 * in productie, nu pe presupuneri.
 */

const CFG = { tara: "RO" as const, sandbox: false };

test("adresa metodei se compune din tara si mediu", () => {
  assert.equal(
    urlMetoda(CFG, "PrintLabels"),
    "https://api.mygls.ro/ParcelService.svc/json/PrintLabels",
  );
  assert.equal(
    urlMetoda({ tara: "RO", sandbox: true }, "PrintLabels"),
    "https://api.test.mygls.ro/ParcelService.svc/json/PrintLabels",
  );
});

test("⚠ mediul de test si productia difera printr-un singur cuvant", () => {
  /*
   * `api.mygls.ro` vs `api.test.mygls.ro`. O greseala aici inseamna colete reale
   * emise cand credeai ca testezi — sau invers, teste care nu ajung nicaieri.
   * Proba tine cele doua forme separate explicit.
   */
  const prod = urlMetoda({ tara: "RO", sandbox: false }, "PrintLabels");
  const test_ = urlMetoda({ tara: "RO", sandbox: true }, "PrintLabels");
  assert.notEqual(prod, test_);
  assert.ok(prod.startsWith("https://api.mygls."), "productia nu are cuvantul test");
  assert.ok(test_.includes("api.test.mygls."), "mediul de test are cuvantul test");
});

test("codul de tara intra cu litere mici in subdomeniu", () => {
  /* Configurarea tine „RO" cu majuscule (asa e in ISO si in restul aplicatiei),
     dar gazda e `api.mygls.ro`. */
  for (const tara of TARI_MYGLS) {
    const url = urlMetoda({ tara, sandbox: false }, "PrintLabels");
    assert.ok(url.includes(`mygls.${tara.toLowerCase()}`), `${tara}: ${url}`);
    assert.ok(!url.includes(tara), `${tara} n-ar trebui sa apara cu majuscule in ${url}`);
  }
});

test("MyGLS raspunde in cele sapte tari in care are contracte", () => {
  assert.deepEqual([...TARI_MYGLS], ["CZ", "HR", "HU", "RO", "SI", "SK", "RS"]);
  assert.ok(TARI_MYGLS.includes("RO"));
});

test("se poate cere si alt serviciu decat ParcelService", () => {
  assert.equal(
    urlMetoda(CFG, "GetPickupRequest", "PickupService"),
    "https://api.mygls.ro/PickupService.svc/json/GetPickupRequest",
  );
});

test("⚠ eticheta e o lista de OCTETI, nu un sir", () => {
  /*
   * `Labels` vine ca tablou de numere. Tratat ca text, iese un PDF corupt care
   * se deschide gol — si afli abia cand curierul refuza coletul.
   *
   * „%PDF-1.4" in octeti, ca sa se vada ca reconstructia da chiar un PDF.
   */
  const octeti = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
  const pdf = pdfDinEtichete({ Labels: octeti });
  assert.ok(pdf, "nu s-a construit PDF-ul");
  assert.equal(pdf.length, 8);
  assert.equal(pdf.subarray(0, 4).toString("latin1"), "%PDF");
});

test("octetii peste 127 supravietuiesc — un PDF nu e text", () => {
  /* Daca undeva pe drum s-ar face o conversie prin sir UTF-8, octetii mari s-ar
     transforma in doi octeti si fisierul ar iesi mai lung si stricat. */
  const octeti = [0, 1, 127, 128, 200, 255];
  const pdf = pdfDinEtichete({ Labels: octeti });
  assert.ok(pdf);
  assert.equal(pdf.length, 6);
  assert.deepEqual([...pdf], octeti);
});

test("fara etichete nu se inventeaza un fisier gol", () => {
  /* Un PDF de zero octeti salvat pe disc arata ca un succes si nu e. */
  assert.equal(pdfDinEtichete({}), null);
  assert.equal(pdfDinEtichete({ Labels: [] }), null);
  assert.equal(areEtichete({}), false);
  assert.equal(areEtichete({ Labels: [] }), false);
  assert.equal(areEtichete({ Labels: [1] }), true);
});

test("se pastreaza ParcelNumber, nu ParcelId", () => {
  /*
   * MyGLS intoarce amandoua. `ParcelId` e intern la ei; `ParcelNumber` e cel de
   * pe eticheta si cel pe care il urmareste clientul. Salvat gresit, clientul
   * primeste un numar care nu se gaseste in tracking.
   */
  const r: RaspunsEtichete = {
    PrintLabelsInfoList: [
      { ParcelId: 111, ParcelNumber: 999888777, ClientReference: "CMD-1" },
      { ParcelId: 222, ParcelNumber: 999888778, ClientReference: "CMD-1" },
    ],
  };
  assert.deepEqual(numereColet(r), ["999888777", "999888778"]);
});

test("un colet fara numar nu produce „undefined” in lista de AWB-uri", () => {
  const r: RaspunsEtichete = {
    PrintLabelsInfoList: [{ ParcelId: 1 }, { ParcelNumber: 5 }, {}],
  };
  assert.deepEqual(numereColet(r), ["5"]);
  assert.deepEqual(numereColet({}), []);
});

test("erorile pe colet se citesc cu referinta comenzii", () => {
  /*
   * La un lot, unele colete trec si altele nu. Fara referinta in mesaj,
   * comerciantul vede „adresa invalida" si nu stie la care comanda.
   */
  const r: RaspunsEtichete = {
    PrintLabelsErrorList: [
      { ErrorCode: 12, ErrorDescription: "Adresa invalida", ClientReferenceList: ["CMD-7"] },
      { ErrorCode: 33 },
    ],
  };
  assert.deepEqual(eroriPeColet(r), ["Adresa invalida (CMD-7)", "eroare 33"]);
  assert.deepEqual(eroriPeColet({}), []);
});

// ─── Anularea si retiparirea ─────────────────────────────────────────────────

const CONFIG: GlsConfig = {
  enabled: true,
  username: "cont@firma.ro",
  password: "parola",
  client_number: 100000001,
  tara: "RO",
  sandbox: true,
  tip_imprimanta: "A4_2x2",
  pozitie_tiparire: 1,
};

/**
 * Inlocuieste `fetch` si tine minte ce s-a trimis.
 *
 * Nu se atinge reteaua: probele de aici verifica CE cere clientul de la MyGLS,
 * fiindca acolo se afla regulile care nu se pot descoperi altfel decat platind un
 * colet real.
 */
function fetchFals(raspunsuri: unknown[]) {
  const cereri: Record<string, unknown>[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    cereri.push(JSON.parse(init.body) as Record<string, unknown>);
    const corp = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    return new Response(JSON.stringify(corp), { status: 200 });
  }) as unknown as typeof fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

test("⚠ stergerea se rupe in bucati de cel mult 50", async () => {
  /*
   * „MAX. 50 ITEMS PER REQUEST", scris in tabelul lui `ParcelIdList`
   * (documentatia MyGLS ver. 25.12.11, pagina 27). Peste, GLS raspunde cu codul
   * 22 din Appendix A si NU sterge nimic — adica o comanda mare ar ramane cu
   * toate coletele vii, dupa ce noi am raportat anulare.
   */
  assert.equal(MAX_STERGERI_PE_CERERE, 50);
  const ids = Array.from({ length: 120 }, (_, i) => i + 1);
  const f = fetchFals([{ SuccessfullyDeletedList: [] }]);
  try {
    await stergeEtichete(CONFIG, ids);
  } finally {
    f.restaureaza();
  }
  assert.equal(f.cereri.length, 3, "120 de ID-uri incap in trei cereri");
  assert.deepEqual((f.cereri[0].ParcelIdList as number[]).length, 50);
  assert.deepEqual((f.cereri[1].ParcelIdList as number[]).length, 50);
  assert.deepEqual((f.cereri[2].ParcelIdList as number[]).length, 20);
});

test("⚠ stergerea NU trimite ClientNumberList", async () => {
  /* Changelog-ul documentatiei, intrarea 2 (21.10.2019): „do not use". */
  const f = fetchFals([{ SuccessfullyDeletedList: [{ ParcelId: 7 }] }]);
  try {
    await stergeEtichete(CONFIG, [7]);
  } finally {
    f.restaureaza();
  }
  assert.ok(!("ClientNumberList" in f.cereri[0]), "ClientNumberList n-are ce cauta in cerere");
  assert.ok("Username" in f.cereri[0] && "Password" in f.cereri[0], "datele de acces raman");
});

test("⚠ sub-coletele sterse se numara si ele", async () => {
  /*
   * O expediere cu mai multe colete are sub-colete; GLS le sterge odata cu cel
   * principal si le raporteaza separat, in `SubParcelIdList`. Necitite, am fi
   * crezut ca a ramas ceva viu la curier si am fi alarmat degeaba comerciantul.
   */
  const f = fetchFals([{
    SuccessfullyDeletedList: [{ ParcelId: 10, SubParcelIdList: [11, 12] }],
  }]);
  let rod;
  try {
    rod = await stergeEtichete(CONFIG, [10]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(rod.sterse, [10, 11, 12]);
  assert.deepEqual(rod.erori, []);
});

test("⚠ succesul e PARTIAL: si sterse, si erori, in acelasi raspuns", async () => {
  /*
   * Codul 6 = „Parcel with this ID has different status than PRINTED", adica GLS
   * a preluat deja coletul. Daca am citi raspunsul ca tot-sau-nimic, am dezlega
   * de pe comanda un colet care chiar pleaca spre client.
   */
  const f = fetchFals([{
    SuccessfullyDeletedList: [{ ParcelId: 10 }],
    DeleteLabelsErrorList: [
      { ErrorCode: 6, ErrorDescription: "Parcel with this ID has different status than PRINTED", ParcelIdList: [11] },
    ],
  }]);
  let rod;
  try {
    rod = await stergeEtichete(CONFIG, [10, 11]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(rod.sterse, [10]);
  assert.equal(rod.erori.length, 1);
  assert.ok(rod.erori[0].includes("colete 11"), `ID-ul lipseste din mesaj: ${rod.erori[0]}`);
});

test("ID-urile de sters se curata: duplicate, zerouri, valori imposibile", async () => {
  const f = fetchFals([{ SuccessfullyDeletedList: [] }]);
  try {
    await stergeEtichete(CONFIG, [5, 5, 0, -3, 7, Number.NaN, 1.5]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(f.cereri[0].ParcelIdList, [5, 7]);
});

test("stergerea fara niciun ID nu ajunge la GLS", async () => {
  await assert.rejects(() => stergeEtichete(CONFIG, []), /niciun ParcelId/);
  await assert.rejects(() => stergeEtichete(CONFIG, [0, -1]), /niciun ParcelId/);
});

test("⚠ retiparirea cere GetPrintedLabels, cu ParcelId — nu PrintLabels", async () => {
  /*
   * Proba exista ca sa nu se strecoare niciodata un `PrintLabels` pe drumul de
   * retiparire: acela ar crea un al DOILEA colet, real si facturat.
   */
  const f = fetchFals([{ Labels: [0x25, 0x50, 0x44, 0x46] }]);
  let r;
  try {
    r = await retipareste(CONFIG, [123, 123, 456]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(f.cereri[0].ParcelIdList, [123, 456]);
  assert.ok(!("ParcelList" in f.cereri[0]), "cererea n-are cum sa descrie un colet nou");
  assert.equal(f.cereri[0].TypeOfPrinter, "A4_2x2");
  assert.equal(f.cereri[0].PrintPosition, 1);
  assert.equal(pdfDinRetiparire(r)?.subarray(0, 4).toString("latin1"), "%PDF");
});

test("⚠ raspunsul retiparirii are ALTE nume de liste decat al emiterii", () => {
  /*
   * `GetPrintedLabelsErrorList`, nu `PrintLabelsErrorList`; `PrintDataInfoList`,
   * nu `PrintLabelsInfoList` (documentatia ver. 25.12.11, paginile 19-20).
   *
   * Daca cineva refoloseste cititoarele emiterii pe raspunsul asta, ele intorc
   * liste GOALE si nicio eroare — defectul se descopera dupa ce a mers „bine" o
   * luna. Proba tine cele doua forme despartite.
   */
  const raspuns = {
    Labels: [0x25],
    GetPrintedLabelsErrorList: [{ ErrorCode: 4, ErrorDescription: "Parcel not found", ParcelIdList: [9] }],
  };
  assert.deepEqual(eroriRetiparire(raspuns), ["Parcel not found (colete 9)"]);
  /* Aceleasi date citite ca raspuns de emitere nu produc nicio eroare — dovada. */
  assert.deepEqual(eroriPeColet(raspuns as RaspunsEtichete), []);
});

test("retiparirea fara PDF nu inventeaza un fisier gol", () => {
  assert.equal(pdfDinRetiparire({}), null);
  assert.equal(pdfDinRetiparire({ Labels: [] }), null);
});

test("⚠ limitele NU sunt aceleasi la stergere si la retiparire", async () => {
  /*
   * 50 la `DeleteLabels`, 99 la `GetPrintedLabels`, 100 la
   * `GetParcelListStatuses`. O singura constanta „limita GLS" ar fi gresita la
   * doua dintre cele trei.
   */
  assert.notEqual(MAX_STERGERI_PE_CERERE, MAX_RETIPARIRI_PE_CERERE);
  assert.equal(MAX_RETIPARIRI_PE_CERERE, 99);
  const preaMulte = Array.from({ length: 100 }, (_, i) => i + 1);
  await assert.rejects(() => retipareste(CONFIG, preaMulte), /cel mult 99/);
});

test("⚠ un raspuns poate avea SI etichete, SI erori", () => {
  /*
   * Cazul care se pierde usor: la un lot de zece comenzi, opt reusesc si doua
   * pica. Daca la prima eroare am arunca tot, cele opt etichete emise (si
   * facturate) s-ar pierde, iar comerciantul ar reincerca — emitand inca opt.
   */
  const r: RaspunsEtichete = {
    Labels: [0x25, 0x50, 0x44, 0x46],
    PrintLabelsInfoList: [{ ParcelNumber: 1234 }],
    PrintLabelsErrorList: [{ ErrorCode: 9, ErrorDescription: "Cod postal lipsa" }],
  };
  assert.ok(areEtichete(r), "etichetele exista");
  assert.deepEqual(numereColet(r), ["1234"]);
  assert.equal(eroriPeColet(r).length, 1);
});

test("⚠ „coletul nu exista” NU e o eroare de anulare", async () => {
  /*
   * Codul 4 din Appendix A. Cazul real: `DeleteLabels` intra in timeout DUPA ce
   * GLS a sters. Verdictul e „necunoscut", comerciantul incearca din nou, si a
   * doua oara primeste 4. Citit ca esec, comanda ar fi ramas cu un AWB pe care
   * nimeni nu-l mai putea scoate: nici anulat (nu mai exista la GLS), nici reemis
   * (registrul il tinea ocupat).
   */
  const f = fetchFals([{
    DeleteLabelsErrorList: [
      { ErrorCode: 4, ErrorDescription: "Parcel ID not exists", ParcelIdList: [77] },
    ],
  }]);
  let rod;
  try {
    rod = await stergeEtichete(CONFIG, [77]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(rod.sterse, []);
  assert.deepEqual(rod.inexistente, [77]);
  assert.deepEqual(rod.erori, [], "nu se arata comerciantului ca eroare");
});

test("⚠ codul 6 (colet deja preluat) RAMANE eroare", async () => {
  /*
   * Deosebirea fata de proba de mai sus e chiar miezul: la 6, coletul EXISTA si
   * pleaca spre client. Confundat cu „inexistent", AWB-ul s-ar sterge de pe
   * comanda si transportul ar deveni invizibil — iar o reemitere ar factura al
   * doilea colet.
   */
  const f = fetchFals([{
    DeleteLabelsErrorList: [
      { ErrorCode: 6, ErrorDescription: "Parcel with this ID has different status than PRINTED", ParcelIdList: [77] },
    ],
  }]);
  let rod;
  try {
    rod = await stergeEtichete(CONFIG, [77]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(rod.sterse, []);
  assert.deepEqual(rod.inexistente, [], "6 nu inseamna inexistent");
  assert.equal(rod.erori.length, 1);
});

test("⚠ codul 4 FARA lista de colete nu dispare, devine eroare", async () => {
  /*
   * Documentatia nu promite ca `ParcelIdList` e mereu completata. Inghitita fara
   * ID-uri, intrarea n-ar mai aparea nici la disparute, nici la erori, iar
   * comerciantul ar primi „GLS nu a confirmat anularea" fara sa afle ce a spus GLS.
   */
  const f = fetchFals([{
    DeleteLabelsErrorList: [{ ErrorCode: 4, ErrorDescription: "Parcel ID not exists" }],
  }]);
  let rod;
  try {
    rod = await stergeEtichete(CONFIG, [77]);
  } finally {
    f.restaureaza();
  }
  assert.deepEqual(rod.inexistente, []);
  assert.equal(rod.erori.length, 1, "nu se pierde");
});

/* ─── Proba de conexiune ──────────────────────────────────────────────────────
 *
 * ⚠ CAZUL REAL DE LA CARE VIN PROBELE ASTEA (14.08): un comerciant care incerca
 * sa conecteze GLS primea „Access denied for this parcel ID (5)" si butonul iesea
 * rosu, desi datele de acces erau bune. Proba intreaba de coletul cu numarul 1,
 * iar acela exista la GLS si e al altcuiva.
 */

const CFG_PROBA: GlsConfig = {
  enabled: true,
  username: "u@x.ro",
  password: "p",
  client_number: 100,
  tara: "RO",
  sandbox: false,
  tip_imprimanta: "A4_2x2",
  pozitie_tiparire: 1,
  expeditor_cod_postal: "010101",
};

/** Raspunsul MyGLS pentru o eroare pe `GetParcelStatuses`. */
function raspunsEroare(cod: number, text: string) {
  return { GetParcelStatusErrors: [{ ErrorCode: cod, ErrorDescription: text }] };
}

test("⚠ „acces refuzat la coletul asta” inseamna ca ne-au RECUNOSCUT", async () => {
  /*
    Codul 5 din Appendix A. Ca sa se uite la colet si sa spuna ca nu e al nostru,
    GLS a trecut deja de autentificare — deci conexiunea e buna.

    Lista avea doar 4 si 26, iar acest raspuns scotea butonul rosu la un client
    real cu date corecte.
  */
  const f = fetchFals([raspunsEroare(5, "Access denied for this parcel ID")]);
  const r = await probaConexiune(CFG_PROBA);
  f.restaureaza();
  assert.deepEqual(r, { ok: true });
});

test("⚠ codurile pe NUMAR de colet trec si ele, nu doar cele pe ID", async () => {
  /*
    `GetParcelStatuses` primeste un ParcelNUMBER, nu un ParcelID — deci raspunsul
    firesc e 9 („Parcel number not exists") sau 10 („not assigned yet"). Niciunul
    nu era in lista: proba trecea doar cand GLS raspundea cu un cod de ID.
  */
  for (const cod of [4, 9, 10, 15, 26]) {
    const f = fetchFals([raspunsEroare(cod, "colet negasit")]);
    const r = await probaConexiune(CFG_PROBA);
    f.restaureaza();
    assert.deepEqual(r, { ok: true }, `codul ${cod} ar trebui sa treaca drept conexiune buna`);
  }
});

test("⚠ „User not exists” RAMANE rosu — ala e chiar refuzul de autentificare", async () => {
  /*
    Cea mai importanta proba din grup. Daca cineva largeste lista de coduri „bune"
    pana cuprinde si 14, butonul „Testeaza conexiunea" iese VERDE cu parola
    gresita, iar comerciantul afla ca datele sunt gresite abia la primul colet
    real — adica exact scaparea reparata o data.
  */
  const f = fetchFals([raspunsEroare(COD_UTILIZATOR_INEXISTENT, "User not exists")]);
  const r = await probaConexiune(CFG_PROBA);
  f.restaureaza();
  assert.equal(r.ok, false);
  assert.match((r as { eroare: string }).eroare, /User not exists/);
});

test("un cod necunoscut ramane rosu, cu mesajul lui GLS cu tot", async () => {
  /* Lista ALBA, nu neagra: ce nu dovedeste recunoasterea, nu trece. */
  const f = fetchFals([raspunsEroare(99, "ceva nou de la GLS")]);
  const r = await probaConexiune(CFG_PROBA);
  f.restaureaza();
  assert.equal(r.ok, false);
  assert.match((r as { eroare: string }).eroare, /ceva nou de la GLS/);
});

test("proba CITESTE, nu emite: nu trimite niciun colet", async () => {
  /* Un „testeaza conexiunea" care creeaza AWB ar factura un colet real la fiecare
     apasare, iar butonul se apasa de zece ori pana iese configurarea. */
  const f = fetchFals([{ ParcelStatusList: [] }]);
  await probaConexiune(CFG_PROBA);
  f.restaureaza();
  assert.equal(f.cereri.length, 1);
  assert.ok("ParcelNumber" in f.cereri[0], "proba trebuie sa fie o interogare de stari");
  assert.equal("ParcelList" in f.cereri[0], false, "proba nu are voie sa trimita colete");
});

test("formatele de tiparire sunt cele opt din documentatia MyGLS", () => {
  /*
    ⚠ Lista avea doar primele patru. Celelalte au fost adaugate de GLS in 2025
    (ThermoZPL 12.02, ShipItThermoPdf 02.09, ThermoZPL_300DPI 03.09), deci un
    comerciant cu imprimanta ZPL n-avea ce alege in panou.

    Sursa: `api.mygls.ro/docs/MyGLS_API.pdf`, `GetPrintedLabelsRequest →
    TypeOfPrinter`. Daca GLS mai adauga unul, se adauga si aici — nu se
    inventeaza valori: una gresita e respinsa abia la primul colet real.
  */
  assert.deepEqual([...TIPURI_IMPRIMANTA], [
    "A4_2x2",
    "A4_4x1",
    "Connect",
    "Thermo",
    "ThermoZPL",
    "ThermoZPL_300DPI",
    "ShipItThermoPdf",
    "ShipItThermoZpl",
  ]);
});
