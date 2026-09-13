import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  campuriDezlegareFan,
  contextulAwbEmis,
  FAN_MAX_COD,
  FANBOX_COMPARTMENT_CM,
  FANBOX_MAX_WEIGHT_KG,
  incapeInFanbox,
  createFanCourierAwb,
  deleteFanCourierAwb,
  estimateFanCourierCost,
  getFanCourierAwbLabel,
  getFanCourierBranches,
  uitaTokenurileFan,
  PAYPOINT_MAX_WEIGHT_KG,
  PAYPOINT_LATURI_CM,
} from "@/lib/fancourier";

/*
 * Probe pentru clientul FAN Courier.
 *
 * Fiecare afirma o REGULA, nu implementarea de azi, si fiecare are mutantul pe
 * APELANT: a doua chemare vine cu alta parola, cu alt raspuns, cu alt corp.
 * Scrise dupa ce un audit din 09.09.2026 a gasit ca nu exista NICIO proba pentru
 * fisierul asta, desi el emite AWB-uri si citeste bani.
 */

const CONFIG = {
  enabled: true,
  username: "u",
  password: "PAROLA-BUNA",
  client_id: 42,
  client_name: "X",
};

type Raspunsuri = {
  login?: (parola: string) => Response;
  branches?: () => Response;
  tarif?: () => Response;
  delete?: () => Response;
  label?: () => Response;
};

/** Inlocuieste `fetch` si numara apelurile. Intoarce jurnalul si restaurarea. */
function prindeFan(r: Raspunsuri) {
  const jurnal: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const cale = u.replace("https://api.fancourier.ro/", "").split("?")[0];
    jurnal.push(`${init?.method ?? "GET"} ${cale}`);
    if (u.includes("/login")) {
      const parola = new URL(u).searchParams.get("password") ?? "";
      return r.login
        ? r.login(parola)
        : parola === CONFIG.password
          ? new Response(JSON.stringify({ status: "success", data: { token: "TOKEN" } }), { status: 200 })
          : new Response(JSON.stringify({ status: "error", message: "invalid credentials" }), { status: 401 });
    }
    if (cale.startsWith("reports/branches")) {
      return r.branches?.() ?? new Response(JSON.stringify({ status: "success", data: [
        { id: 42, name: "Depozit", email: "d@x.ro", phone: "0722000000", bankAccount: "RO00SECRET",
          address: { locality: "Cluj-Napoca", county: "Cluj", street: "S", streetNo: "1" } },
      ] }), { status: 200 });
    }
    if (cale.includes("internal-tariff")) {
      return r.tarif?.() ?? new Response(JSON.stringify({ status: "success", data: {
        costNoVAT: 26.19, vat: 4.98, total: 31.17,
      } }), { status: 200 });
    }
    if (cale.startsWith("awb/label")) {
      return r.label?.() ?? new Response(Buffer.from("%PDF-1.4 fals dar cu antet"), { status: 200 });
    }
    if (init?.method === "DELETE") {
      return r.delete?.() ?? new Response("", { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { jurnal, gata: () => { globalThis.fetch = original; } };
}

beforeEach(() => uitaTokenurileFan());

// ─── Cache-ul de token ────────────────────────────────────────────────────────

test("o parola gresita NU primeste tokenul pastrat pentru parola buna", async () => {
  const { jurnal, gata } = prindeFan({});
  try {
    // Incalzeste cache-ul cu credentiala BUNA.
    await getFanCourierBranches(CONFIG.username, CONFIG.password);
    assert.equal(jurnal.filter((a) => a.includes("login")).length, 1);

    // ⚠ MUTANTUL E AICI, PE APELANT: acelasi username, alta parola.
    // Cu cheia de cache dupa username, asta trecea si intorcea datele contului.
    await assert.rejects(
      () => getFanCourierBranches(CONFIG.username, "ALTA-PAROLA"),
      /login error: 401/,
      "o credentiala gresita trebuie sa fie refuzata chiar si pe cache cald",
    );
  } finally { gata(); }
});

test("acelasi cont, cereri in paralel: UN SINGUR login", async () => {
  const { jurnal, gata } = prindeFan({});
  try {
    await Promise.all(Array.from({ length: 8 }, () => getFanCourierBranches(CONFIG.username, CONFIG.password)));
    const loginuri = jurnal.filter((a) => a.includes("login")).length;
    assert.equal(loginuri, 1, `opt cereri simultane au produs ${loginuri} login-uri`);
  } finally { gata(); }
});

test("un `expiresAt` deja trecut nu se pastreaza: urmatoarea cerere se autentifica din nou", async () => {
  const { jurnal, gata } = prindeFan({
    login: () => new Response(JSON.stringify({ status: "success", data: {
      token: "TOKEN", expiresAt: "2020-01-01 10:00:00",
    } }), { status: 200 }),
  });
  try {
    await getFanCourierBranches(CONFIG.username, CONFIG.password);
    await getFanCourierBranches(CONFIG.username, CONFIG.password);
    assert.equal(jurnal.filter((a) => a.includes("login")).length, 2,
      "tokenul expirat anuntat de FAN a fost totusi refolosit");
  } finally { gata(); }
});

// ─── Tarif ────────────────────────────────────────────────────────────────────

test("tariful intoarce si valoarea FARA TVA, nu doar totalul", async () => {
  const { gata } = prindeFan({});
  try {
    const t = await estimateFanCourierCost(CONFIG, {
      recipientCounty: "Cluj", recipientLocality: "Cluj-Napoca", weightKg: 1,
    });
    // Exemplul oficial, pag. 31. `total` CONTINE TVA-ul; cine il ia ca baza de
    // TVA il taxeaza a doua oara.
    assert.equal(t.total, 31.17);
    assert.equal(t.costNoVAT, 26.19);
    assert.equal(round2(t.costNoVAT! + t.vat!), t.total);
  } finally { gata(); }
});

test("un tarif fara `total` valid e EROARE, nu transport gratuit", async () => {
  for (const data of [{}, { total: null }, { total: "nu-i numar" }, { total: Infinity }]) {
    const { gata } = prindeFan({
      tarif: () => new Response(JSON.stringify({ status: "success", data }), { status: 200 }),
    });
    try {
      await assert.rejects(
        () => estimateFanCourierCost(CONFIG, { recipientCounty: "Cluj", recipientLocality: "Cluj-Napoca", weightKg: 1 }),
        /total/,
        `raspunsul ${JSON.stringify(data)} a trecut drept pret`,
      );
    } finally { gata(); uitaTokenurileFan(); }
  }
});

test("un `total: 0` PREZENT si valid ramane pret, nu eroare", async () => {
  const { gata } = prindeFan({
    tarif: () => new Response(JSON.stringify({ status: "success", data: { total: 0, costNoVAT: 0, vat: 0 } }), { status: 200 }),
  });
  try {
    const t = await estimateFanCourierCost(CONFIG, {
      recipientCounty: "Cluj", recipientLocality: "Cluj-Napoca", weightKg: 1,
    });
    assert.equal(t.total, 0, "un tarif zero negociat cu FAN e treaba comerciantului");
  } finally { gata(); }
});

// ─── Anulare ──────────────────────────────────────────────────────────────────

test("un 200 cu `status: error` NU e anulare reusita", async () => {
  const { gata } = prindeFan({
    delete: () => new Response(JSON.stringify({ status: "error", message: "AWB deja preluat" }), { status: 200 }),
  });
  try {
    await assert.rejects(() => deleteFanCourierAwb(CONFIG, "2228000111"), /AWB deja preluat/);
  } finally { gata(); }
});

test("un 200 cu corp GOL ramane anulare reusita", async () => {
  // Contra-cazul care apara anularea ridicarii: pag. 39 nu documenteaza niciun
  // corp de raspuns, deci cerand `status: "success"` am fi blocat ziua degeaba.
  const { gata } = prindeFan({ delete: () => new Response("", { status: 200 }) });
  try {
    await deleteFanCourierAwb(CONFIG, "2228000111");
  } finally { gata(); }
});

// ─── Eticheta ─────────────────────────────────────────────────────────────────

test("un raspuns care nu e PDF nu se serveste ca eticheta", async () => {
  const { gata } = prindeFan({
    label: () => new Response(JSON.stringify({ status: "error", message: "AWB inexistent" }), { status: 200 }),
  });
  try {
    await assert.rejects(() => getFanCourierAwbLabel(CONFIG, "2228000111"), /nu este un PDF/);
  } finally { gata(); }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE PLEACA IN CERERE (09.09.2026)
   ═══════════════════════════════════════════════════════════════════════════ */

const DESTINATAR = {
  recipientName: "Ion Popescu",
  recipientPhone: "0722000000",
  recipientEmail: "ion@exemplu.ro",
  recipientCounty: "Cluj",
  recipientLocality: "Cluj-Napoca",
  recipientStreet: "Bulevardul Eroilor",
  recipientStreetNo: "12",
  recipientZipCode: "400001",
  parcels: 1,
  weightKg: 2,
  cod: 0,
  content: "produse",
  observation: "",
};

/** Prinde corpul trimis la `intern-awb`. */
function prindeAwb(raspuns?: unknown) {
  const trimise: Record<string, unknown>[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/login")) return new Response(JSON.stringify({ status: "success", data: { token: "T" } }), { status: 200 });
    if (u.includes("reports/branches")) return new Response(JSON.stringify({ status: "success", data: [
      { id: 42, name: "Depozit", email: "d@x.ro", phone: "0722000000",
        address: { locality: "Cluj-Napoca", county: "Cluj", street: "S", streetNo: "1" } }] }), { status: 200 });
    if (u.includes("intern-awb")) {
      trimise.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(raspuns ?? { response: [{ awbNumber: 2228000111, tariff: 26.19, vat: 4.98, errors: null }] }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { trimise, gata: () => { globalThis.fetch = original; } };
}

const CU_COLET = { ...CONFIG, colet_implicit: { length: 30, width: 20, height: 10 } };

test("⚠ numerele imposibile sunt REFUZATE, nu trimise mai departe", async () => {
  for (const [camp, valoare, tipar] of [
    ["parcels", -2, /colete/i], ["parcels", 1.5, /colete/i], ["parcels", 1000, /colete/i],
    ["weightKg", -5, /greutatea/i], ["weightKg", 0, /greutatea/i], ["weightKg", 10000, /greutatea/i],
    ["cod", -12, /ramburs/i], ["cod", 10001, /ramburs/i],
  ] as [string, number, RegExp][]) {
    const { trimise, gata } = prindeAwb();
    try {
      await assert.rejects(
        () => createFanCourierAwb(CU_COLET, { ...DESTINATAR, [camp]: valoare } as never),
        tipar, `${camp}=${valoare}`,
      );
      assert.equal(trimise.length, 0, `${camp}=${valoare} a ajuns la retea`);
    } finally { gata(); uitaTokenurileFan(); }
  }
});

test("⚠ fara dimensiuni nicaieri, emiterea CERE dimensiuni; nu inventeaza 1x1x1", async () => {
  const { trimise, gata } = prindeAwb();
  try {
    await assert.rejects(() => createFanCourierAwb(CONFIG, DESTINATAR as never), /dimensiunile coletului/i);
    assert.equal(trimise.length, 0);
  } finally { gata(); }
});

test("⚠ coletul configurat al magazinului tine loc de dimensiuni, si ajunge intreg la FAN", async () => {
  const { trimise, gata } = prindeAwb();
  try {
    await createFanCourierAwb(CU_COLET, DESTINATAR as never);
    assert.deepEqual(trimise[0].shipments && (trimise[0].shipments as Record<string, unknown>[])[0].info &&
      ((trimise[0].shipments as Record<string, unknown>[])[0].info as Record<string, unknown>).dimensions,
      { length: 30, height: 10, width: 20 });
  } finally { gata(); }
});

test("⚠ dimensiunile de pe AWB au intaietate fata de coletul configurat", async () => {
  const { trimise, gata } = prindeAwb();
  try {
    await createFanCourierAwb(CU_COLET, { ...DESTINATAR, length: 44.3, width: 40, height: 15 } as never);
    const info = (trimise[0].shipments as Record<string, unknown>[])[0].info as Record<string, unknown>;
    // ⚠ 44,3 ramane 44,3: cu `parseInt` undeva pe drum ar fi devenit 44 si ar fi
    // schimbat clasa de compartiment FANbox.
    assert.deepEqual(info.dimensions, { length: 44.3, height: 15, width: 40 });
  } finally { gata(); }
});

test("⚠ DOUA din trei dimensiuni: REFUZ, nu inlocuire tacuta cu coletul configurat", async () => {
  /*
   * Cazul tacut, inchis pe 13.09.2026: `dateDinInput` cerea toate trei DEODATA, deci
   * o singura masura lipsa arunca si celelalte doua si trimitea coletul obisnuit al
   * magazinului. Cu cutia din Setari 30x20x10, omul scrie L=120 si l=80 si uita
   * inaltimea, iar la FAN pleaca 30x20x10 pentru un colet de 120x80: de zece ori mai
   * putin volum declarat. FAN recantareste la depozit si refactureaza diferenta, pe
   * care comerciantul o vede abia pe factura lunara.
   *
   * ⚠ MUTANTUL E PE APELANT: perechea de campuri completate, nu o cablare. Cu regula
   * veche afirmatia de mai jos pica pe `trimise.length`, fiindca AWB-ul chiar pleca.
   *
   * Contra-probele stau chiar deasupra: toate trei ajung intregi la FAN, iar niciuna
   * cade cinstit pe coletul configurat. Deci poarta nu refuza tot.
   */
  for (const partiale of [
    { length: 120, width: 80 },
    { length: 120, height: 25 },
    { width: 80, height: 25 },
  ]) {
    const { trimise, gata } = prindeAwb();
    try {
      await assert.rejects(
        () => createFanCourierAwb(CU_COLET, { ...DESTINATAR, ...partiale } as never),
        /toate trei/i,
        `${JSON.stringify(partiale)} a trecut de poarta dimensiunilor`,
      );
      assert.equal(trimise.length, 0, `${JSON.stringify(partiale)} a ajuns la FAN`);
    } finally { gata(); uitaTokenurileFan(); }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CONTEXTUL AWB-ULUI EMIS, SI CE SE GOLESTE LA DEZLEGARE (13.09.2026)
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ pe ramura `deja`, sucursala vine din REGISTRU, nu din configurarea de acum", () => {
  /*
   * `deja` inseamna: AWB creat la FAN, scrierea pe comanda pierduta. Daca intre cele
   * doua apasari comerciantul si-a mutat punctul de lucru in Setari, sucursala curenta
   * NU mai e cea emitenta. Scrisa asa, comanda ramanea pironita cu contul gresit, iar
   * anularea si eticheta primeau de la FAN „nu e al tau".
   *
   * ⚠ MUTANTUL E PE APELANT: `dinRegistru` poarta sucursala 42, iar configurarea de
   * acum spune 77. Cu regula veche iesea 77.
   */
  const c = contextulAwbEmis({
    creata: null,
    clientIdCurent: 77,
    dinRegistru: { clientId: 42, tariff: 26.19, vat: 4.98 },
  });
  assert.deepEqual(c, { clientId: 42, tariff: 26.19, vat: 4.98 });
});

test("⚠ cand chiar s-a emis acum, contextul e cel curent", () => {
  const c = contextulAwbEmis({
    creata: { awbNumber: "2228000111", tariff: 31.17, vat: 5.92 },
    clientIdCurent: 77,
    dinRegistru: { clientId: 42 },
  });
  assert.deepEqual(c, { clientId: 77, tariff: 31.17, vat: 5.92 });
});

test("⚠ un registru fara `detalii` da null, nu o valoare inventata", () => {
  // Randurile scrise inainte de reparatie n-au `detalii`. Null e raspunsul cinstit:
  // `configPentruAwbEmis` cade atunci pe configurarea curenta, ca pana acum.
  assert.deepEqual(
    contextulAwbEmis({ creata: null, clientIdCurent: 77, dinRegistru: null }),
    { clientId: null, tariff: null, vat: null },
  );
  // Un sir venit prin `Json` nu ajunge ca sir intr-o coloana numerica.
  assert.equal(contextulAwbEmis({ creata: null, clientIdCurent: 77, dinRegistru: { clientId: "42" } }).clientId, 42);
  // Iar un tarif ZERO negociat ramane zero, nu devine „lipsa".
  assert.equal(contextulAwbEmis({ creata: null, clientIdCurent: 77, dinRegistru: { tariff: 0 } }).tariff, 0);
});

test("⚠ dezlegarea pastreaza banii cand coletul RAMANE viu la FAN", () => {
  /*
   * Cele doua iesiri in care FAN nu a anulat nimic: refuzul dovedit (coletul e deja
   * preluat) si „integrarea nu mai e configurata, deci n-am avut cu ce cere". In
   * amandoua coletul pleaca si va aparea pe factura lunara, iar tariful si sucursala
   * sunt singura urma care o leaga de comanda.
   */
  const ramaneViu = campuriDezlegareFan(false, false);
  assert.equal(ramaneViu.fan_courier_awb_number, null, "numarul trebuie scos oricum");
  assert.ok(!("fan_courier_cost" in ramaneViu), "tariful s-a sters desi coletul ramane viu la FAN");
  assert.ok(!("fan_courier_vat" in ramaneViu), "TVA-ul s-a sters desi coletul ramane viu la FAN");
  assert.ok(!("fan_courier_awb_client_id" in ramaneViu), "sucursala s-a sters desi coletul ramane viu");
});

test("⚠ dar cand FAN chiar a anulat, se goleste tot: n-a costat nimic", () => {
  const anulat = campuriDezlegareFan(true, true);
  assert.deepEqual(anulat, {
    fan_courier_awb_number: null,
    fan_courier_awb_client_id: null,
    fan_courier_cost: null,
    fan_courier_vat: null,
    tracking_number: null,
  });
  // `tracking_number` e comun tuturor curierilor: nu se atinge cand e al altuia.
  assert.ok(!("tracking_number" in campuriDezlegareFan(true, false)));
});

/* ═══════════════════════════════════════════════════════════════════════════
   GABARITUL FANBOX, O SINGURA COMPARATIE (13.09.2026)
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ cutia obisnuita a unui magazin poate sa NU incapa in FANbox", () => {
  /*
   * Cazul care a devenit viu chiar prin reparatia dimensiunilor: de cand emiterea le
   * cere, comerciantul isi seteaza „coletul obisnuit". O cutie perfect normala de
   * 60x40x40 nu intra in niciun compartiment, iar cotarea o oferea mai departe.
   *
   * ⚠ MUTANTUL E PE APELANT: cutia. Cu compararea nesortata, sau cu o singura latura
   * verificata, cazul asta ar trece.
   */
  assert.equal(incapeInFanbox({ length: 60, width: 40, height: 40 }), false);
  assert.equal(incapeInFanbox({ length: 30, width: 20, height: 10 }), true);
});

test("⚠ comparatia e pe laturi SORTATE, deci nu atarna de cum le-a scris omul", () => {
  // Aceeasi cutie, cele sase asezari: raspunsul trebuie sa fie unul singur.
  const laturi = [44, 40, 30];
  const asezari = [
    [44, 40, 30], [44, 30, 40], [40, 44, 30],
    [40, 30, 44], [30, 44, 40], [30, 40, 44],
  ];
  for (const [length, width, height] of asezari) {
    assert.equal(
      incapeInFanbox({ length, width, height }), true,
      `asezarea ${length}x${width}x${height} a dat alt raspuns decat ${laturi.join("x")}`,
    );
  }
  /*
   * Si o cutie care NU incape, in aceleasi sase asezari: 46 trece de latura cea mai
   * lunga a compartimentului (45), oricum ai roti-o.
   *
   * ⚠ Prima forma a randurilor astea era GRESITA, si proba a prins-o: adaugam 12 doar
   * pe pozitia a treia a fiecarei permutari, deci iesea alta cutie la fiecare rand, iar
   * una din ele chiar incapea. Se permuteaza ACEEASI cutie, altfel nu se probeaza
   * sortarea, ci se compara sase cutii diferite.
   */
  const preaMare = [
    [46, 40, 30], [46, 30, 40], [40, 46, 30],
    [40, 30, 46], [30, 46, 40], [30, 40, 46],
  ];
  for (const [length, width, height] of preaMare) {
    assert.equal(incapeInFanbox({ length, width, height }), false, `${length}x${width}x${height}`);
  }
});

test("⚠ marginea compartimentului: 44,3 intra, 44,4 nu", () => {
  /* `parseInt` undeva pe drum ar face din 44,3 un 44 si ar muta marginea tacut. */
  assert.equal(incapeInFanbox({ length: 45, width: 44.3, height: 40.4 }), true);
  assert.equal(incapeInFanbox({ length: 45, width: 44.4, height: 40.4 }), false);
});

test("⚠ copiile din fereastra de AWB nu au voie sa se departeze de server", () => {
  /*
   * ⚠ DE CE EXISTA DOUA COPII, si de ce NU se unifica.
   *
   * `FanCourierAwbModal` e componenta de CLIENT. Un import din `@/lib/fancourier` ar
   * trage `cheie-token`, care importa `node:crypto`, deci ar intra in pachetul din
   * browser. De aceea fereastra isi tine limitele ca literali, dinadins.
   *
   * Doua copii care trebuie sa spuna acelasi lucru se despart insa la prima corectura,
   * si atunci ecranul ar valida altceva decat serverul: omul ar trece de formular si ar
   * fi refuzat de FAN, sau invers, ar fi oprit degeaba. Proba asta le tine legate.
   */
  const sursa = readFileSync("src/components/dashboard/FanCourierAwbModal.tsx", "utf8");

  const greutate = /const FANBOX_MAX_WEIGHT_KG = ([\d.]+);/.exec(sursa);
  assert.ok(greutate, "fereastra nu mai declara `FANBOX_MAX_WEIGHT_KG`: reciteste nota de mai sus");
  assert.equal(Number(greutate![1]), FANBOX_MAX_WEIGHT_KG, "greutatea maxima FANbox s-a departat de server");

  const ramburs = /const FAN_MAX_COD = ([\d.]+);/.exec(sursa);
  assert.ok(ramburs, "fereastra nu mai declara `FAN_MAX_COD`");
  assert.equal(Number(ramburs![1]), FAN_MAX_COD, "plafonul de ramburs s-a departat de server");

  const compartiment = /const FANBOX_COMPARTMENT_CM = \[([^\]]+)\]/.exec(sursa);
  assert.ok(compartiment, "fereastra nu mai declara `FANBOX_COMPARTMENT_CM`");
  assert.deepEqual(
    compartiment![1].split(",").map((x) => Number(x.trim())),
    [...FANBOX_COMPARTMENT_CM],
    "compartimentul FANbox din fereastra s-a departat de cel de pe server",
  );

  /*
   * ⚠ PAYPOINT, DIN 13.09.2026, SI AICI MIZA E MAI MARE.
   *
   * Limitele lui sunt mai STRANSE decat ale FANbox-ului (10 kg fata de 30), deci o copie
   * ramasa in urma nu doar ca ar deranja: fereastra ar lasa comerciantul sa trimita un
   * colet de 20 kg la PayPoint, iar refuzul ar veni de la FAN, dupa ce clientul a platit.
   */
  const greutatePayPoint = /const PAYPOINT_MAX_WEIGHT_KG = ([\d.]+);/.exec(sursa);
  assert.ok(greutatePayPoint, "fereastra nu mai declara `PAYPOINT_MAX_WEIGHT_KG`: reciteste nota de mai sus");
  assert.equal(Number(greutatePayPoint![1]), PAYPOINT_MAX_WEIGHT_KG, "greutatea maxima PayPoint s-a departat de server");

  const laturiPayPoint = /const PAYPOINT_LATURI_CM = \[([^\]]+)\]/.exec(sursa);
  assert.ok(laturiPayPoint, "fereastra nu mai declara `PAYPOINT_LATURI_CM`");
  assert.deepEqual(
    laturiPayPoint![1].split(",").map((x) => Number(x.trim())),
    [...PAYPOINT_LATURI_CM],
    "laturile maxime PayPoint din fereastra s-au departat de cele de pe server",
  );
});

test("⚠ si pe un magazin FARA colet configurat, doua din trei raman refuz", async () => {
  // Acolo defectul nu era tacut, ci prost explicat: mesajul vechi ii cerea omului sa
  // completeze pe AWB exact cele pe care tocmai le completase pe jumatate.
  const { trimise, gata } = prindeAwb();
  try {
    await assert.rejects(
      () => createFanCourierAwb(CONFIG, { ...DESTINATAR, length: 120, width: 80 } as never),
      /toate trei/i,
    );
    assert.equal(trimise.length, 0);
  } finally { gata(); uitaTokenurileFan(); }
});

test("⚠ textele se taie la lungimile documentate, dar emailul prea lung se OMITE", async () => {
  const { trimise, gata } = prindeAwb();
  try {
    await createFanCourierAwb(CU_COLET, {
      ...DESTINATAR,
      recipientName: "N".repeat(80),
      recipientEmail: `${"e".repeat(95)}@exemplu.ro`,
      observation: "o".repeat(400),
    } as never);
    const sh = (trimise[0].shipments as Record<string, unknown>[])[0];
    const info = sh.info as Record<string, unknown>;
    const dest = sh.recipient as Record<string, unknown>;
    assert.equal(String(dest.name).length, 50);
    assert.equal(String(info.observation).length, 255);
    // Taiat, ar fi fost un email GRESIT trimis unui om real. Campul e optional la domiciliu.
    assert.equal(dest.email, undefined);
  } finally { gata(); }
});

test("⚠ strada goala e REFUZATA, nu inlocuita cu sirul „Strada”", async () => {
  const { trimise, gata } = prindeAwb();
  try {
    await assert.rejects(
      () => createFanCourierAwb(CU_COLET, { ...DESTINATAR, recipientStreet: "  ", recipientStreetNo: "" } as never),
      /strada/i,
    );
    assert.equal(trimise.length, 0, "un colet fara adresa a plecat totusi la curier");
  } finally { gata(); }
});

test("⚠ tariful si TVA-ul din raspunsul de emitere se intorc, nu se arunca", async () => {
  const { gata } = prindeAwb();
  try {
    const r = await createFanCourierAwb(CU_COLET, DESTINATAR as never);
    assert.equal(r.awbNumber, "2228000111");
    assert.equal(r.tariff, 26.19);
    assert.equal(r.vat, 4.98);
  } finally { gata(); }
});

test("⚠ un `client_id` invalid opreste cererea inainte de retea", async () => {
  for (const rau of [0, -1, 1.5, NaN, "7; drop" as unknown as number]) {
    const { gata } = prindeAwb();
    try {
      await assert.rejects(
        () => deleteFanCourierAwb({ ...CONFIG, client_id: rau }, "2228000111"),
        /client ID/i, String(rau),
      );
    } finally { gata(); uitaTokenurileFan(); }
  }
});
