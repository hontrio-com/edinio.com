import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { createOblioDoc, getSeries, uitaTokenurileOblio } from "./oblio";
import { verdictFurnizor } from "./operatii/eroare-furnizor";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN RASPUNS FARA STATUS NU E UN SUCCES                      (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Oblio isi pune statusul in CORP, nu in HTTP: raspunsul e `200` si cand refuza. De aia clientul
 * il citeste de acolo, si asa a fost scris de la inceput. Corect.
 *
 * ⚠⚠ Dar `json.status` era citit ca `number` fara sa se verifice ca CHIAR e unul, iar lipsa lui
 * facea AMANDOUA comparatiile false: `undefined < 200` e `false` si `undefined >= 300` e tot
 * `false`. Deci poarta nu se aprindea, iar `json.data` (adica `undefined`) se intorcea drept
 * SUCCES. Apelantul il lua ca document creat si cadea abia la `rezultat.seriesName`, cu
 * „Cannot read properties of undefined" in loc de motivul adevarat.
 *
 * ⚠ Si pe acolo putea trece si un `429` de la limita lor documentata (30 de documente la 100 de
 * secunde), daca raspunsul acela nu poarta `status` in corp.
 *
 * ⚠⚠ CE CONTEAZA CEL MAI MULT E VERDICTUL, nu mesajul. La emitere, „nu stim" tine randul blocat
 * si scoate cazul la om; „a esuat" elibereaza reincercarea. Oblio ARE `idempotencyKey`, dar garda
 * aia apara doar cererile identice, nu si un document scris cu numar gol pe comanda.
 */

const CONFIG = { clientId: "id", clientSecret: "secret" };
const DOC = { cif: "RO1", client: { name: "X" }, seriesName: "S", products: [{ name: "P", price: 1 }] };

const fetchAdevarat = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchAdevarat; uitaTokenurileOblio(); });

/** Tokenul intai, apoi raspunsul cerut, cu statusul HTTP dat. */
function raspundeCu(corp: unknown, statusHttp = 200): void {
  globalThis.fetch = (async (u: unknown) => {
    if (String(u).includes("/authorize/token")) {
      return new Response(JSON.stringify({
        access_token: "t", expires_in: 3600, token_type: "Bearer",
        request_time: Math.floor(Date.now() / 1000),
      }), { status: 200 });
    }
    return new Response(JSON.stringify(corp), { status: statusHttp });
  }) as typeof fetch;
}

async function eroareaDin(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
    throw new Error("NU A ARUNCAT: raspunsul a trecut drept succes");
  } catch (e) {
    return e as Error;
  }
}

describe("Statusul din corp ramane autoritatea", () => {
  test("un raspuns bun trece si intoarce `data`", async () => {
    uitaTokenurileOblio();
    raspundeCu({ status: 200, statusMessage: "Success", data: { seriesName: "S", number: "1", link: "http://x" } });
    const r = await createOblioDoc("t", "invoice", DOC);
    assert.deepEqual(r, { seriesName: "S", number: "1", link: "http://x" });
  });

  test("⚠ un refuz cu HTTP 200 si status 400 in corp ramane REFUZ dovedit", async () => {
    /* Purtarea de baza a lor, si nu se schimba: 200 pe sarma, 4xx in corp. */
    raspundeCu({ status: 400, statusMessage: "Seria nu exista" });
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.match(e.message, /Seria nu exista/);
    assert.equal(verdictFurnizor(e), "esuat", "un refuz dovedit ar bloca degeaba randul");
  });

  test("⚠ iar un 500 in corp ramane NESIGUR: documentul poate exista", async () => {
    raspundeCu({ status: 500, statusMessage: "Eroare interna" });
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.equal(verdictFurnizor(e), "necunoscut");
  });
});

describe("Cand corpul NU poarta status", () => {
  test("⚠⚠ nu mai trece drept succes", async () => {
    raspundeCu({ mesaj: "ceva ce nu vine de la ei" }, 200);
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.doesNotMatch(e.message, /NU A ARUNCAT/, "raspunsul fara status a fost luat drept document creat");
  });

  test("⚠⚠ si un 429 de la limita lor NU mai trece", async () => {
    /* 30 de documente la 100 de secunde, scris in documentatia lor. */
    raspundeCu({ mesaj: "Too Many Requests" }, 429);
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.equal(verdictFurnizor(e), "esuat", "o limita de cereri NU creeaza documentul, deci reluarea e libera");
  });

  test("⚠ un 500 HTTP fara status in corp iese NESIGUR", async () => {
    raspundeCu({ mesaj: "gateway" }, 500);
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.equal(verdictFurnizor(e), "necunoscut", "la 5xx documentul poate exista");
  });

  test("⚠⚠ un 200 cu status bun dar FARA `data` e „nu stim”, nu succes", async () => {
    /*
     * Intors ca succes, ar fi scris un document cu numar GOL pe comanda, adica exact valoarea care
     * dezarmeaza garda anti-duplicat: urmatoarea apasare ar fi emis al doilea document fiscal.
     */
    raspundeCu({ status: 200, statusMessage: "Success" });
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.equal(verdictFurnizor(e), "necunoscut");
    assert.match(e.message, /Verifica in contul Oblio|Success/);
  });
});

describe("Statusul poate veni si ca SIR", () => {
  test("⚠⚠ „400” ca sir ramane REFUZ, nu devine succes", async () => {
    /*
     * Gasit de bancul de mutanti, nu de citit codul: Oblio isi stringifica numerele (chiar
     * raspunsul lor de autentificare da `"expires_in": "3600"`). Cerut strict `number`, un status
     * venit ca sir ar fi cazut pe cel HTTP, care la ei e `200` si cand refuza. Refuzul ar fi iesit
     * SUCCES, adica exact defectul reparat, pe alta usa.
     */
    raspundeCu({ status: "400", statusMessage: "Seria nu exista" }, 200);
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.match(e.message, /Seria nu exista/);
    assert.equal(verdictFurnizor(e), "esuat");
  });

  test("⚠ si „200” ca sir ramane succes", async () => {
    raspundeCu({ status: "200", statusMessage: "Success", data: { seriesName: "S", number: "9", link: "u" } });
    const r = await createOblioDoc("t", "invoice", DOC);
    assert.equal((r as { number: string }).number, "9");
  });

  test("⚠ un status care nu e numar deloc cade pe cel HTTP", async () => {
    raspundeCu({ status: "ceva", statusMessage: "?" }, 503);
    const e = await eroareaDin(createOblioDoc("t", "invoice", DOC));
    assert.equal(verdictFurnizor(e), "necunoscut");
  });
});

describe("Regula e a CLIENTULUI, nu a emiterii", () => {
  test("⚠ si citirile trec prin aceeasi poarta", async () => {
    /* Altfel nomenclatoarele ar intoarce `undefined` si panoul ar arata liste goale fara motiv. */
    raspundeCu({ mesaj: "fara status" }, 200);
    const e = await eroareaDin(getSeries("t", "RO1"));
    assert.doesNotMatch(e.message, /NU A ARUNCAT/);
  });
});
