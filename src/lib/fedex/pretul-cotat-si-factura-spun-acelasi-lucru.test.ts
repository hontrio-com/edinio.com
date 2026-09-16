import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { corpExpediere, corpTarife, type AdresaComanda, type DateExpediere } from "./expediere";
import { urmareste, type FedexConfig } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRETUL COTAT SI FACTURA TREBUIE SA SPUNA ACELASI LUCRU     (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trei lucruri pe care raspunsul lor le spune si noi nu le ascultam.
 *
 * 1. ⚠⚠ `totalDeclaredValue` pleca DOAR la emitere. Cotarea mergea fara el, deci pretul aratat
 *    cumparatorului in checkout si comerciantului in panou NU continea suprataxa de valoare
 *    declarata — iar factura FedEx o continea. Diferenta o suporta comerciantul, tacut, la
 *    fiecare colet asigurat. ⚠ Exact acelasi defect a fost reparat la DHL pe 14.09; aici statea
 *    a doua copie, si asta e lectia care se repeta: cauta a doua copie INAINTE.
 *
 * 2. ⚠⚠ Eticheta se salva cu formatul CERUT (`specificatieEticheta(config).imageType`), nu cu
 *    cel TRIMIS (`docType` din raspuns). `imageType` si `labelStockType` nu sunt independente
 *    la ei, iar un proiect de API fara formatul cerut intoarce altceva — fara alerta, fiindca
 *    eticheta chiar a fost produsa. Coloana `format` e apoi singura sursa pentru numele
 *    fisierului si tipul MIME, deci un ZPL ajunge la om ca `.pdf` si nu se deschide cu nimic.
 *    Iar FedEx nu are reimprimare: nu exista „mai cere-o o data".
 *
 * 3. ⚠ `latestStatusDetail.ancillaryDetails[]` poarta MOTIVUL („Customer not available",
 *    „Incorrect address"), iar `statusByLocale` spune doar „Delivery exception". Notificarea
 *    catre comerciant ii spunea ca s-a intamplat ceva, fara sa-i spuna ce, si deci fara sa-i
 *    spuna ce poate face.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const EXPEDITOR = {
  nume: "Depozit Edinio",
  companie: "Edinio SRL",
  telefon: "0721000111",
  strada: "Str. Fabricii nr. 12",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  cod_postal: "400001",
  tara: "RO",
};

const CONFIG: FedexConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "613902139",
  mediu: "productie",
  expeditor: EXPEDITOR,
};

const DESTINATAR: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Strada Aviatorilor",
  numar: "25",
  oras: "Constanta",
  judet: "Constanta",
  codPostal: "900330",
  telefon: "0722333444",
  tara: "RO",
};

const DATE: DateExpediere = {
  destinatar: DESTINATAR,
  greutateKg: 2.4,
  serviceType: "FEDEX_PRIORITY",
  referinta: "EDN-AB12-000123",
  valoareComanda: 480,
};

const expedierea = (corp: Record<string, unknown>) => corp.requestedShipment as Record<string, unknown>;

describe("Valoarea declarata pleaca la AMANDOUA cererile", () => {
  const cuAsigurare: FedexConfig = { ...CONFIG, valoare_declarata: true };

  test("⚠⚠ cotarea o trimite, nu doar emiterea", () => {
    const e = expedierea(corpTarife(cuAsigurare, DATE));
    assert.deepEqual(
      e.totalDeclaredValue, { amount: 480, currency: "RON" },
      "pretul cotat nu contine suprataxa de valoare, dar factura o va contine",
    );
  });

  test("⚠⚠ si pe COLET, altfel totalul nu corespunde nimanui", () => {
    /* Verbatim din schema lor: „The amount of totalDeclaredValue must be equal to the sum of
       all the individual declaredValues in the shipment.” */
    for (const corp of [corpTarife(cuAsigurare, DATE), corpExpediere(cuAsigurare, DATE)]) {
      const colete = expedierea(corp).requestedPackageLineItems as Record<string, unknown>[];
      assert.deepEqual(colete[0].declaredValue, { amount: 480, currency: "RON" });
    }
  });

  test("⚠ cele doua cereri trimit EXACT aceeasi suma", () => {
    /* Diferite, pretul cotat ar fi tot altul decat cel facturat — doar cu alt numar. */
    assert.deepEqual(
      expedierea(corpTarife(cuAsigurare, DATE)).totalDeclaredValue,
      expedierea(corpExpediere(cuAsigurare, DATE)).totalDeclaredValue,
    );
  });

  test("⚠ stinsa din configurare, nu pleaca nicaieri: asigurarea COSTA", () => {
    assert.equal(expedierea(corpTarife(CONFIG, DATE)).totalDeclaredValue, undefined);
    assert.equal(expedierea(corpExpediere(CONFIG, DATE)).totalDeclaredValue, undefined);
  });

  test("⚠ si fara valoare nu se trimite un zero: n-ar asigura nimic", () => {
    const fara = { ...DATE, valoareComanda: 0 };
    assert.equal(expedierea(corpTarife(cuAsigurare, fara)).totalDeclaredValue, undefined);
    assert.equal(expedierea(corpExpediere(cuAsigurare, fara)).totalDeclaredValue, undefined);
  });

  test("⚠⚠ si cotarea din CHECKOUT primeste valoarea, nu doar cea din panou", () => {
    /*
     * `buildFedexOptions` compunea `date` fara `valoareComanda`, deci pretul din magazin
     * ramanea cel fara suprataxa oricat de corect ar fi fost `corpTarife`.
     *
     * ⚠ Si primeste `valoareDeclarata` (podea din catalog), nu `valoareMarfii` (plafon): la
     * valoarea declarata pericolul e COBORAREA din browser, nu umflarea.
     */
    const s = viu("src/lib/actions/shipping.actions.ts");
    assert.match(s, /buildFedexOptions\(fxCfg, destination, weight, valoareDeclarata,/);
    assert.match(s, /greutateKg: weightKg,\n    valoareComanda: valoareMarfa,/);
  });
});

describe("Formatul etichetei se ia din RASPUNS", () => {
  const client = viu("src/lib/fedex/client.ts");
  const actiuni = viu("src/lib/actions/fedex.actions.ts");

  test("⚠⚠ `docType` se citeste si se poarta pana la salvare", () => {
    assert.match(client, /format: text\(doc\?\.docType\)\?\.toUpperCase\(\) \|\| null/, "docType nu se citeste");
    assert.match(client, /etichetaFormat: eticheta\?\.format \?\? null/, "nu se intoarce din client");
    assert.match(actiuni, /format: formatDinRaspuns \?\? spec\.imageType/, "nu se salveaza din raspuns");
    assert.match(actiuni, /raspuns\.eticheta, config, raspuns\.etichetaFormat\)/, "nu se trece la salvare");
  });

  test("⚠ lipsa lui NU e o eroare: se cade pe ce am cerut", () => {
    /* `docType` ramane optional la ei. Refuzata, o eticheta perfect buna s-ar pierde — si
       FedEx nu are reimprimare. */
    assert.match(actiuni, /formatDinRaspuns \?\? spec\.imageType/);
    assert.ok(!/formatDinRaspuns!/.test(actiuni), "s-a presupus ca formatul vine mereu");
  });

  test("⚠ si continutul ramane legat de formatul lui, nu de al altei etichete", () => {
    /* Citite din doua locuri diferite, un colet cu doua documente ar fi dat continutul unuia
       cu formatul celuilalt. */
    assert.match(client, /return \{ continut: codata, format: /);
  });
});

describe("Motivul exceptiei ajunge la comerciant", () => {
  const client = viu("src/lib/fedex/client.ts");

  test("⚠⚠ `ancillaryDetails` se citesc", () => {
    assert.match(client, /stare\.ancillaryDetails/, "amanuntele nu se citesc deloc");
    assert.match(client, /reasonDescription/);
    assert.match(client, /actionDescription/);
  });

  test("⚠ si intra in descriere, care e ce ajunge in notificare", () => {
    assert.match(client, /motive\.length > 0/);
    assert.match(client, /motive\.join\("\. "\)/);
    const cron = viu("src/app/api/cron/fedex-tracking/route.ts");
    assert.match(cron, /descriere: descriereStatus\(codNou, u\.descriere\)/, "descrierea nu mai ajunge la om");
  });

  test("⚠⚠ dar NU se ia nicio hotarare din ele: sunt text TRADUS", () => {
    /*
     * `ancillaryDetails` se traduc dupa `x-locale`, ca si `statusByLocale`. O comparatie pe
     * ele ar fi mers in engleza si ar fi tacut in romana. Codul ramane singura autoritate.
     */
    assert.ok(!/reasonDescription[^\n]*===/.test(client), "se compara pe text tradus");
    assert.ok(!/ancillaryDetails[\s\S]{0,400}statusComandaDinCod/.test(client), "amanuntele misca statusul");
  });

  test("⚠ si fara ele descrierea ramane exact ce era", () => {
    assert.match(client, /: stareaSpusa,/, "ramura fara motive s-a pierdut");
  });
});

// ─── Si prin CLIENTUL adevarat, nu doar prin forma codului ───────────────────

const fetchAdevarat = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchAdevarat; });

/** Token-ul intai, apoi raspunsul de urmarire. Ambele prin `fetch`, ca la ei. */
function raspundeUrmarire(stare: Record<string, unknown>): void {
  globalThis.fetch = (async (u: unknown) => {
    if (String(u).includes("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({
      output: {
        completeTrackResults: [{
          trackingNumber: "794613751234",
          trackResults: [{
            trackingNumberInfo: { trackingNumber: "794613751234" },
            latestStatusDetail: stare,
          }],
        }],
      },
    }), { status: 200 });
  }) as typeof fetch;
}

describe("Motivul chiar iese din clientul adevarat", () => {
  test("⚠⚠ „Delivery exception” se intoarce CU motivul, nu singur", async () => {
    raspundeUrmarire({
      derivedCode: "DE",
      statusByLocale: "Delivery exception",
      ancillaryDetails: [{
        reason: "08",
        reasonDescription: "Customer not available or business closed",
        action: "Please contact FedEx",
        actionDescription: "Contacteaza FedEx pentru reprogramare",
      }],
    });
    const [u] = await urmareste(CONFIG, ["794613751234"]);
    assert.equal(u.cod, "DE");
    assert.match(u.descriere ?? "", /Customer not available/, `descrierea a ramas seaca: ${u.descriere}`);
    assert.match(u.descriere ?? "", /Delivery exception/, "starea s-a pierdut cu totul");
  });

  test("⚠ fara amanunte, descrierea e exact ce era inainte", async () => {
    raspundeUrmarire({ derivedCode: "DL", statusByLocale: "Delivered" });
    const [u] = await urmareste(CONFIG, ["794613751234"]);
    assert.equal(u.descriere, "Delivered");
  });

  test("⚠ un amanunt fara text nu lasa o urma goala in descriere", async () => {
    raspundeUrmarire({
      derivedCode: "DE",
      statusByLocale: "Delivery exception",
      ancillaryDetails: [{ reason: "08" }, { reasonDescription: "   " }],
    });
    const [u] = await urmareste(CONFIG, ["794613751234"]);
    assert.equal(u.descriere, "Delivery exception");
  });

  test("⚠ doua amanunte cu acelasi text se spun O SINGURA data", async () => {
    raspundeUrmarire({
      derivedCode: "DE",
      statusByLocale: "Delivery exception",
      ancillaryDetails: [
        { reasonDescription: "Incorrect address" },
        { reasonDescription: "Incorrect address", actionDescription: "Corecteaza adresa" },
      ],
    });
    const [u] = await urmareste(CONFIG, ["794613751234"]);
    assert.equal(u.descriere, "Delivery exception: Incorrect address. Corecteaza adresa");
  });
});
