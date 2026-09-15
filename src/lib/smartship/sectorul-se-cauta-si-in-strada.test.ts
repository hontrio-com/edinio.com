import { strict as assert } from "node:assert";
import { test, describe, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { sectorSmartship } from "./localitati";
import { golesteCacheGeo, rezolvaLocalitatea } from "./geo";
import type { SmartshipConfig } from "./client";

/*
 * ⚠ BUCURESTIUL FARA SECTOR NU E O COMANDA INCOMPLETA, E UN SECTOR NECAUTAT.
 *
 * SmartShip cere `sector` 1-6 pentru capitala si 0 in rest, iar `null` (nu se
 * stie) opreste EXPEDIEREA in `lipsuriExpediere`. Asta ramane bine: un sector
 * ghicit plimba coletul prin oras.
 *
 * Dar pana azi sectorul se citea DOAR din oras. Iar orasul poarta sectorul numai
 * pentru comenzile venite prin checkout-ul nostru, care din 15.08.2026 il impune
 * acolo („Sector 3"). Celelalte nu:
 *
 *   - eMAG, Trendyol si About You trimit `oras: "Bucuresti"` si scriu sectorul in
 *     strada;
 *   - la fel face comerciantul care isi scrie comanda de mana in panou.
 *
 * Pentru toate acelea sectorul iesea `null`, iar comanda nu putea primi AWB
 * DELOC. Nu cadea pe tarif fix (aia se intampla doar la cotare): se oprea la
 * emitere, cu un mesaj care cerea completarea unui lucru pe care clientul il
 * scrisese deja, doua campuri mai incolo.
 *
 * Aceeasi cautare o fac deja Shipo (`sectorShipo`), Woot, DHL, UPS si FedEx.
 * Comentariul din `sectorSmartship` o promitea de la inceput („si in restul
 * adresei"); codul n-o facea. Vezi [[nu-orice-steag-e-un-spinner]]: o promisiune
 * din comentariu nu e o garda.
 *
 * ═══ CE APARA PROBELE ═══
 *
 *   1. in Bucuresti, sectorul se cauta in oras, in judet si in strada, IN ORDINEA ASTA;
 *   2. in afara Bucurestiului raspunsul ramane `0`, oricat ar scrie „sector" in strada;
 *   3. cand nu scrie nicaieri, raspunsul ramane `null`, si nu se ghiceste nimic;
 *   4. ⚠ si strada chiar AJUNGE pana acolo: mutantul sta pe `rezolvaLocalitatea`,
 *      care e singura cale prin care apelantii afla sectorul.
 */

describe("SmartShip: sectorul se cauta in toate cele trei locuri", () => {
  test("orasul ramane primul, ca pana acum", () => {
    assert.equal(sectorSmartship("Sector 3", "Municipiul Bucuresti"), 3);
  });

  test("scris in strada, sectorul se gaseste", () => {
    assert.equal(
      sectorSmartship("Bucuresti", "Municipiul Bucuresti", "Str. Fabrica de Glucoza 5, Sector 2"),
      2,
    );
  });

  test("scris in judet, sectorul se gaseste", () => {
    assert.equal(sectorSmartship("Bucuresti", "Bucuresti Sector 4"), 4);
  });

  /* ⚠ Ordinea nu e decorativa: orasul e cel pe care l-a ales cumparatorul in
     checkout, strada e text liber si poate purta si numele unui parc de birouri. */
  test("cand amandoua poarta un sector, orasul castiga", () => {
    assert.equal(sectorSmartship("Sector 3", "Municipiul Bucuresti", "Bd. Unirii 1, sector 5"), 3);
  });

  test("in afara Bucurestiului nu se inventeaza niciun sector", () => {
    assert.equal(sectorSmartship("Cluj-Napoca", "Cluj"), 0);
    /* „Sector 3 Business Park" e un nume de cladire, nu o adresa bucuresteana. */
    assert.equal(sectorSmartship("Cluj-Napoca", "Cluj", "Sector 3 Business Park, et. 2"), 0);
  });

  test("cand sectorul nu scrie nicaieri, raspunsul ramane necunoscut", () => {
    assert.equal(sectorSmartship("Bucuresti", "Municipiul Bucuresti"), null);
    assert.equal(sectorSmartship("Bucuresti", "Municipiul Bucuresti", "Calea Victoriei 12"), null);
  });

  test("formele scrierii, toate cele pe care le accepta ajutorul comun", () => {
    const cu = (strada: string) => sectorSmartship("Bucuresti", "Municipiul Bucuresti", strada);
    assert.equal(cu("Str. A 1, Sec. 6"), 6);
    assert.equal(cu("Str. A 1, SECTORUL 1"), 1);
    assert.equal(cu("Str. A 1, sector5"), 5);
    /* Sectorul 7 nu exista; ajutorul comun opreste la 6. */
    assert.equal(cu("Str. A 1, sector 7"), null);
  });
});

/*
 * ⚠ MUTANTUL PE APELANT.
 *
 * `sectorSmartship` poate primi trei argumente si tot sa nu afle nimic, daca cine
 * il cheama nu-i da strada. `rezolvaLocalitatea` e singura poarta prin care
 * apelantii (panoul, emiterea, cotarea) afla sectorul, deci proba trece pe acolo,
 * cu nomenclatorul lor dat de mana.
 */
const CONFIG: SmartshipConfig = { enabled: true, api_key: "cheie-de-proba" };

function fetchNomenclator() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes("/geolocation/counties")) {
      return new Response(JSON.stringify({
        status: 200,
        counties: [{ id: 10, county: "Bucuresti" }, { id: 13, county: "Cluj" }],
      }), { status: 200 });
    }
    if (u.includes("/geolocation/cities")) {
      return new Response(JSON.stringify({
        status: 200,
        cities: [{ id: 255154, city: "Bucuresti" }, { id: 256212, city: "Cluj-Napoca" }],
      }), { status: 200 });
    }
    throw new Error(`cerere neasteptata: ${u}`);
  }) as unknown as typeof fetch;
  return { restaureaza: () => { globalThis.fetch = original; } };
}

describe("SmartShip: strada ajunge pana la sector", () => {
  beforeEach(() => golesteCacheGeo());

  test("cu strada in cerere, comanda bucuresteana capata sectorul ei", async () => {
    const f = fetchNomenclator();
    try {
      const loc = await rezolvaLocalitatea(CONFIG, "Bucuresti", "Municipiul Bucuresti", {
        adresa: "Sos. Mihai Bravu 42, bl. P12, Sector 3",
      });
      assert.equal(loc?.cityId, 255154);
      assert.equal(loc?.sector, 3);
    } finally {
      f.restaureaza();
    }
  });

  test("fara strada, raspunsul ramane necunoscut, si nu se ghiceste", async () => {
    const f = fetchNomenclator();
    try {
      const loc = await rezolvaLocalitatea(CONFIG, "Bucuresti", "Municipiul Bucuresti");
      assert.equal(loc?.cityId, 255154);
      assert.equal(loc?.sector, null);
    } finally {
      f.restaureaza();
    }
  });

  test("in afara Bucurestiului sectorul ramane 0, cu strada cu tot", async () => {
    const f = fetchNomenclator();
    try {
      const loc = await rezolvaLocalitatea(CONFIG, "Cluj-Napoca", "Cluj", {
        adresa: "Sector 3 Business Park",
      });
      assert.equal(loc?.cityId, 256212);
      assert.equal(loc?.sector, 0);
    } finally {
      f.restaureaza();
    }
  });
});

/*
 * ⚠ SI ULTIMA VERIGA: EMITEREA.
 *
 * `rezolvaLocalitatea` poate sti sa caute in strada si tot sa n-o primeasca, daca
 * apelantul nu i-o da. `pregatesteExpedierea` e locul prin care trec si cotarea
 * din panou, si emiterea, si solicitarea de oferta: o singura linie, si toate trei
 * depind de ea.
 *
 * ⚠ Proba citeste SURSA fiindca actiunea are nevoie de Supabase si de un magazin
 * adevarat ca sa se poata chema. Aceeasi unealta ca la
 * `scrierile-din-actiuni-poarta-magazinul`: cand apelantul nu se poate rula, se
 * citeste ce scrie in el.
 */
describe("SmartShip: emiterea ii da rezolvarii strada comenzii", () => {
  const SURSA = "src/lib/actions/smartship.actions.ts";

  /*
   * ⚠ Fisierul are DOUA apeluri, si numai unul conteaza.
   *
   * Celalalt e cotarea de proba din pagina de configurare, care nu are nicio
   * comanda in spate: destinatia ei e un substituent (Cluj-Napoca), deci nu are
   * ce strada sa trimita. O proba care ar cere adresa in AMANDOUA ar fi cerut o
   * minciuna; una care se uita doar la „macar unul" n-ar fi cazut daca cel
   * adevarat ar pierde-o. Deci se citeste chiar corpul functiei care poarta
   * comenzile.
   */
  function corpul(nume: string, text: string): string {
    const start = text.indexOf(`async function ${nume}(`);
    assert.notEqual(start, -1, `nu gasesc ${nume} in ${SURSA}`);
    const sfarsit = text.indexOf("\n}\n", start);
    assert.notEqual(sfarsit, -1, `nu gasesc sfarsitul lui ${nume}`);
    return text.slice(start, sfarsit);
  }

  test("pregatesteExpedierea trimite adresa, nu doar orasul si judetul", () => {
    const text = readFileSync(SURSA, "utf8");
    const corp = corpul("pregatesteExpedierea", text);

    const apeluri = [...corp.matchAll(/rezolvaLocalitatea\([^;]*?\)/g)].map((m) => m[0]);
    assert.equal(apeluri.length, 1, `astept un singur apel in pregatesteExpedierea, am gasit ${apeluri.length}`);
    assert.match(apeluri[0], /adresa:\s*adresaPeRand\(/);
  });
});
