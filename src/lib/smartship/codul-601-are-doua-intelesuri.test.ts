import { strict as assert } from "node:assert";
import { test, describe } from "node:test";

import {
  acceptaOfertaTransport, CODURI, creeazaAwb, mesajCod, refuzaOfertaTransport, verdictCod,
  type SmartshipConfig,
} from "./client";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ⚠ ACELASI NUMAR, ALT INTELES, PE ALTA CALE.
 *
 * Documentatia SmartShip da `601` de doua ori, la doua endpointuri:
 *
 *   `/awb/new`                          601 = „courier_id invalid"
 *   `/transport-offer/{ref}/accept`     601 = „credite insuficiente pentru pretul ofertei"
 *
 * Tabelul nostru de coduri e unul singur, deci pana azi comerciantul care accepta
 * o oferta de marfa grea fara sa aiba credit afla ca „curierul ales nu e in lista
 * celor acceptate de SmartShip". O propozitie adevarata despre ALT endpoint, care
 * il trimite sa umble la lista de curieri in loc sa-si alimenteze contul.
 *
 * ═══ CE APARA PROBELE, SI CE NU ═══
 *
 * Nu apara „textul e cel de mai jos". Apara REGULA: cand acelasi cod inseamna
 * altceva pe o cale anume, mesajul trebuie sa fie al CAII, iar verdictul (refuz
 * dovedit / necunoscut) trebuie sa ramana neschimbat: altfel un mesaj mai bun
 * s-ar plati cu un slot de registru deblocat pe nedrept.
 *
 * ⚠ Mutantul sta pe APELANT: `apel()` e cel care trebuie sa duca `cale` mai
 * departe. De aia jumatate din probe trec prin `creeazaAwb` si
 * `acceptaOfertaTransport` cu `fetch` fals, nu prin `mesajCod` direct: o tabela
 * corecta la care nu ajunge nimeni n-ar repara nimic.
 *
 * Aceeasi clasa cu `301`, care la ei inseamna si „cheie de API gresita" si „AWB
 * inexistent". Acolo deosebirea se vedea in cod (`cautaDupaComanda` o trateaza);
 * aici se vedea doar in text, deci nicio proba de tipuri n-avea cum sa cada.
 */

const CONFIG: SmartshipConfig = { enabled: true, api_key: "cheie-de-proba" };

const REF = "OFT-2026-00123";
const CALE_ACCEPT = `/transport-offer/${REF}/accept`;
const CALE_REJECT = `/transport-offer/${REF}/reject`;

/** Un `fetch` care raspunde cu HTTP 200 si codul LOR in corp, ca in exemplele lor. */
function fetchCuCod(cod: number, peste: Record<string, unknown> = {}) {
  const original = globalThis.fetch;
  const cai: string[] = [];
  globalThis.fetch = (async (url: string) => {
    cai.push(String(url));
    return new Response(JSON.stringify({ status: cod, ...peste }), { status: 200 });
  }) as unknown as typeof fetch;
  return { cai, restaureaza: () => { globalThis.fetch = original; } };
}

async function eroareaDin(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("apelul ar fi trebuit sa arunce");
}

describe("SmartShip: codul 601 inseamna doua lucruri diferite", () => {
  test("fara cale, ramane intelesul din tabelul general", () => {
    assert.equal(mesajCod(601), CODURI[601]);
    assert.match(mesajCod(601) ?? "", /lista celor acceptate/);
  });

  test("la emitere, 601 e tot despre curier", () => {
    assert.match(mesajCod(601, "/awb/new") ?? "", /lista celor acceptate/);
  });

  test("la acceptarea ofertei, 601 e despre CREDIT", () => {
    const m = mesajCod(601, CALE_ACCEPT) ?? "";
    assert.match(m, /[Cc]redit insuficient/);
    assert.doesNotMatch(m, /lista celor acceptate/);
  });

  /*
   * ⚠ Calea se potriveste pe FORMA, nu pe un sir fix: referinta ofertei e a lor
   * („OFT-2026-00123") si se schimba la fiecare solicitare. O potrivire pe
   * inceput de sir („/transport-offer") ar fi prins si `GET /transport-offer/{ref}`,
   * unde 601 nu e documentat deloc.
   */
  test("potrivirea tine de forma caii, nu de o referinta anume", () => {
    assert.match(mesajCod(601, "/transport-offer/OFT-2027-99999/accept") ?? "", /[Cc]redit/);
    assert.match(mesajCod(601, `/transport-offer/${REF}`) ?? "", /lista celor acceptate/);
    assert.match(mesajCod(601, "/cost") ?? "", /lista celor acceptate/);
  });

  test("409 spune ce s-a intamplat pe fiecare din cele doua cai", () => {
    assert.match(mesajCod(409, CALE_ACCEPT) ?? "", /de acceptat/);
    assert.match(mesajCod(409, CALE_REJECT) ?? "", /refuzata/);
  });

  /*
   * ⚠ Un mesaj mai bun n-are voie sa schimbe VERDICTUL. „Refuz dovedit" e ce
   * elibereaza slotul din registru; „necunoscut" e ce il tine blocat. Daca
   * tabelul pe cale ar fi ocolit `CODURI`, un cod pe care il stim doar acolo ar
   * fi ramas „necunoscut" si comanda s-ar fi blocat degeaba.
   */
  test("verdictul ramane refuz dovedit, pe orice cale", () => {
    assert.equal(verdictCod(601), "esuat");
    assert.equal(verdictCod(601, CALE_ACCEPT), "esuat");
    assert.equal(verdictCod(409, CALE_REJECT), "esuat");
  });

  test("un cod necunoscut ramane necunoscut, si pe calea cu tabel propriu", () => {
    assert.equal(mesajCod(777, CALE_ACCEPT), undefined);
    assert.equal(verdictCod(777, CALE_ACCEPT), "necunoscut");
    assert.equal(verdictCod(null, CALE_ACCEPT), "necunoscut");
  });
});

/*
 * ⚠ AICI E MUTANTUL: `apel()` trebuie sa duca `cale` pana la mesaj.
 *
 * Tabelul de mai sus poate fi perfect si totusi inutil, daca cine il cheama uita
 * calea. Probele astea trec prin clientul real, cu un `fetch` fals care raspunde
 * exact ca ei: HTTP 200, codul in CORP.
 */
describe("SmartShip: calea ajunge pana la mesajul pe care il vede omul", () => {
  test("acceptarea ofertei fara credit vorbeste despre credit", async () => {
    const f = fetchCuCod(601);
    try {
      const e = await eroareaDin(() => acceptaOfertaTransport(CONFIG, REF));
      assert.match(e.message, /[Cc]redit insuficient/);
      assert.doesNotMatch(e.message, /lista celor acceptate/);
      /* ⚠ Si ramane refuz DOVEDIT: oferta nu s-a acceptat, deci se poate reincerca. */
      assert.equal(verdictFurnizor(e), "esuat");
    } finally {
      f.restaureaza();
    }
  });

  test("emiterea cu un curier gresit vorbeste tot despre curier", async () => {
    const f = fetchCuCod(601);
    try {
      const e = await eroareaDin(() => creeazaAwb(CONFIG, {
        courier_id: 999,
        sender: { name: "Magazin Meu", address: "Str. A 1", city: 255154, phone: "0721000000" },
        recipient: { name: "Ion Popescu", address: "Str. B 2", city: 256212, phone: "0722000000" },
        content: { package_content: "Produse", parcels: 1, weight: 1, length: 30, width: 20, height: 10 },
      }));
      assert.match(e.message, /lista celor acceptate/);
      assert.doesNotMatch(e.message, /[Cc]redit insuficient/);
    } finally {
      f.restaureaza();
    }
  });

  test("refuzul unei oferte inchise spune ca nu mai poate fi refuzata", async () => {
    const f = fetchCuCod(409);
    try {
      const e = await eroareaDin(() => refuzaOfertaTransport(CONFIG, REF, "prea scump"));
      assert.match(e.message, /refuzata/);
    } finally {
      f.restaureaza();
    }
  });
});
