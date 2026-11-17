import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  ADRESA_SAGA, cheiaNouaDinRaspuns, citesteJson, decodeazaText, importaFisier, primaLinie, testeazaConexiunea,
  verdictImport, verdictPentruRegistru, type SesiuneSaga, type VerdictImport,
} from "./client";

/*
 * Clientul SAGA, probat fara fir. Trei lucruri conteaza:
 *   1. verdictul: un refuz DOVEDIT iese `esuat` (retrimiterea e libera), orice „nu stim" de pe import
 *      iese `necunoscut` (retrimiterea ar dubla documentul in contabilitate);
 *   2. cheia rotita: dupa ORICE raspuns cu `X-Saga-Refresh-Token`, cheia noua se da inapoi spre
 *      salvare INAINTE de orice alt pas, iar apelul urmator pleaca cu ea;
 *   3. proba de conexiune se citeste pe dos: esec numai cand SAGA refuza accesul.
 */

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

type Raspuns = { status?: number; body?: BodyInit | null; headers?: Record<string, string> };
interface Cerere {
  url: string;
  metoda: string;
  antete: Headers;
  corp: FormData | null;
  redirect: string | undefined;
  areTermen: boolean;
}

/** Inlocuieste `fetch` si tine minte cererile, ca proba sa poata citi ce a plecat. */
function fir(...raspunsuri: (Raspuns | Error | (() => Response))[]) {
  const cereri: Cerere[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    cereri.push({
      url: String(url),
      metoda: init?.method ?? "GET",
      antete: new Headers(init?.headers),
      corp: init?.body instanceof FormData ? init.body : null,
      redirect: init?.redirect,
      areTermen: !!init?.signal,
    });
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    if (r instanceof Error) throw r;
    if (typeof r === "function") return r();
    return new Response(r.body ?? null, { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return cereri;
}

function sesiune(cheie = "cheie-veche-0001") {
  const rotiri: string[] = [];
  const s: SesiuneSaga & { rotiri: string[] } = {
    codFiscal: "RO12345678",
    cheie,
    rotiri,
    async laCheieNoua(noua: string) {
      rotiri.push(noua);
    },
  };
  return s;
}

const FISIER = { nume: "F_RO12345678_EDN0001_17-11-2026.xml", xml: '<?xml version="1.0" encoding="UTF-8"?>\n<Facturi></Facturi>\n' };

/*
 * ⚠ RASPUNSURI REALE, culese pe fir pe 17.11.2026, numai pe CITIRI (GetSoldCont, GetArticol,
 * GetStocArticol), cu chei VADIT INVENTATE: nimic nu s-a trimis la import. Pastrate brute: documentatia
 * nu le arata, iar o presupunere despre forma lor ar fi fost gresita (refuzul NU e 401 si NU e JSON).
 */
const PE_FIR_CHEIE_INVENTATA: Raspuns = {
  status: 400,
  body: "A aparut o eroare. Reincercati mai tarziu.",
  headers: { "content-type": "text/plain; charset=utf-8" },
};
const PE_FIR_FARA_AUTORIZARE: Raspuns = { status: 500, body: null };

describe("cererea de import", () => {
  test("POST multipart la /Import: fisierul cu numele lui, `importAutomat`, cheia si codul fiscal in antete", async () => {
    const cereri = fir({ status: 200, body: '{"success":true,"message":"ok"}' });
    await importaFisier(sesiune(), FISIER, true);
    const c = cereri[0];
    assert.equal(c.url, `${ADRESA_SAGA}/Import`);
    assert.equal(c.metoda, "POST");
    assert.equal(c.antete.get("authorization"), "Bearer cheie-veche-0001");
    assert.equal(c.antete.get("x-saga-cod-fiscal"), "RO12345678");
    assert.equal(c.corp?.get("importAutomat"), "true");
    const f = c.corp?.get("file") as File;
    assert.equal(f.name, FISIER.nume);
    assert.equal(await f.text(), FISIER.xml);
  });

  test("fara import automat, `importAutomat` pleaca `false` (implicitul lor)", async () => {
    const cereri = fir({ status: 200, body: '{"success":true}' });
    await importaFisier(sesiune(), FISIER, false);
    assert.equal(cereri[0].corp?.get("importAutomat"), "false");
  });

  test("⚠ fiecare cerere are termen si NU urmeaza redirectionarile (un POST redirectionat ar fi devenit un GET)", async () => {
    const cereri = fir({ status: 200, body: "{}" }, { status: 200, body: '{"success":true}' });
    await importaFisier(sesiune(), FISIER, true);
    await testeazaConexiunea(sesiune());
    for (const c of cereri) {
      assert.equal(c.areTermen, true);
      assert.equal(c.redirect, "manual");
    }
  });
});

describe("verdictele la import", () => {
  const cazuri: { nume: string; r: Raspuns | Error; automat?: boolean; fel: VerdictImport["fel"]; registru: "reusit" | "esuat" | "necunoscut" }[] = [
    { nume: "200 cu import automat: importat", r: { status: 200, body: '{"success":true,"message":"Import realizat"}' }, fel: "importat", registru: "reusit" },
    { nume: "200 fara import automat: incarcat, asteapta contabilul", r: { status: 200, body: '{"success":true}' }, automat: false, fel: "incarcat", registru: "reusit" },
    { nume: "200 cu un corp necunoscut: statusul documentat spune importat", r: { status: 200, body: "OK" }, fel: "importat", registru: "reusit" },
    { nume: "200 cu `success: false`: „Nu s-a realizat importul” (exemplele lor)", r: { status: 200, body: '{"success":false,"message":"Fisier invalid"}' }, fel: "respins", registru: "esuat" },
    { nume: "200 cu cheile scrise cu majuscula (exemplele C#)", r: { status: 200, body: '{"Success":false,"Message":"Fisier invalid"}' }, fel: "respins", registru: "esuat" },
    { nume: "⚠ 207 partial sau cu avertismente: A INTRAT, deci reusit (retrimis, s-ar dubla)", r: { status: 207, body: "Factura EDN0001: clientul a fost creat\nAlt rand" }, fel: "avertismente", registru: "reusit" },
    { nume: "422 import esuat in totalitate: refuz dovedit", r: { status: 422, body: "Factura EDN0001: data invalida" }, fel: "respins", registru: "esuat" },
    { nume: "⚠ pe fir: cheia inventata (400, text simplu)", r: PE_FIR_CHEIE_INVENTATA, fel: "refuzat", registru: "esuat" },
    { nume: "400 cu mesajul lor in JSON", r: { status: 400, body: '{"success":false,"message":"Fisierul nu e XML"}' }, fel: "refuzat", registru: "esuat" },
    { nume: "401", r: { status: 401, body: "" }, fel: "refuzat", registru: "esuat" },
    { nume: "403 (si pagina de blocare Cloudflare)", r: { status: 403, body: "<html>blocked</html>" }, fel: "refuzat", registru: "esuat" },
    { nume: "404: versiunea API retrasa", r: { status: 404, body: "" }, fel: "refuzat", registru: "esuat" },
    { nume: "429: n-a procesat, incetineste", r: { status: 429, body: "" }, fel: "refuzat", registru: "esuat" },
    { nume: "⚠ pe fir: fara autorizare, 500 cu corp gol: NU STIM", r: PE_FIR_FARA_AUTORIZARE, fel: "necunoscut", registru: "necunoscut" },
    { nume: "502 dupa ce au primit fisierul: NU STIM", r: { status: 502, body: "Bad gateway" }, fel: "necunoscut", registru: "necunoscut" },
    { nume: "408: poate primit, poate nu", r: { status: 408, body: "" }, fel: "necunoscut", registru: "necunoscut" },
    { nume: "301: redirectionare, nu stim", r: { status: 301, body: "", headers: { location: "https://alt.ro/" } }, fel: "necunoscut", registru: "necunoscut" },
    { nume: "201: cod nedocumentat pe o scriere, nu stim", r: { status: 201, body: "{}" }, fel: "necunoscut", registru: "necunoscut" },
    { nume: "⚠ legatura rupta: NU STIM", r: new TypeError("fetch failed"), fel: "necunoscut", registru: "necunoscut" },
  ];

  for (const c of cazuri) {
    test(c.nume, async () => {
      fir(c.r);
      const r = await importaFisier(sesiune(), FISIER, c.automat ?? true);
      assert.equal(r.fel, c.fel);
      assert.equal(verdictPentruRegistru(r.fel), c.registru);
      assert.ok(r.mesaj === null || r.mesaj.length > 0);
    });
  }

  test("⚠ termenul depasit: NU STIM, si mesajul spune sa verifici in SAGA inainte", async () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    fir(e);
    const r = await importaFisier(sesiune(), FISIER, true);
    assert.equal(r.fel, "necunoscut");
    assert.match(r.mesaj, /nu a răspuns în 30/);
    assert.match(r.mesaj, /Verifică în SAGA/);
  });

  test("raportul 207/422 se pastreaza, iar mesajul citeaza prima lui linie", async () => {
    fir({ status: 422, body: "\r\nFactura EDN0001: articolul CANA-01 nu exista\r\nLinia 2: cota invalida\r\n" });
    const r = await importaFisier(sesiune(), FISIER, true);
    assert.equal(r.fel, "respins");
    if (r.fel !== "respins") return;
    assert.match(r.mesaj, /„Factura EDN0001: articolul CANA-01 nu exista”/);
    assert.ok(r.raport?.includes("Linia 2: cota invalida"));
    assert.ok(!r.raport?.includes("\r"), "randurile Windows se normalizeaza");
  });

  test("⚠ refuzul de acces numeste AMBELE locuri de verificat (SAGA nu spune care e gresit)", async () => {
    fir(PE_FIR_CHEIE_INVENTATA);
    const r = await importaFisier(sesiune(), FISIER, true);
    assert.match(r.mesaj ?? "", /cheia de acces sau codul fiscal/);
    assert.match(r.mesaj ?? "", /„A aparut o eroare\. Reincercati mai tarziu\.”/);
  });

  test("tabelul verdictelor e complet: fiecare fel are verdictul lui", () => {
    assert.deepEqual(
      (["importat", "incarcat", "avertismente", "respins", "refuzat", "necunoscut"] as const).map(verdictPentruRegistru),
      ["reusit", "reusit", "reusit", "esuat", "esuat", "necunoscut"],
    );
  });

  test("verdictul pur: 5xx si 2xx nedocumentat sunt „nu stim”, oricare ar fi corpul", () => {
    for (const status of [500, 503, 504, 202, 204]) {
      assert.equal(verdictImport(status, '{"success":true}', true).fel, "necunoscut", String(status));
    }
  });

  test("⚠ sfatul de verificare: la import automat, Ieșiri; fara, Diverse, Import date (acolo asteapta fisierul)", async () => {
    fir({ status: 502, body: "" });
    const automat = await importaFisier(sesiune(), FISIER, true);
    assert.match(automat.mesaj ?? "", /la Ieșiri/);
    assert.doesNotMatch(automat.mesaj ?? "", /Import date/);
    fir({ status: 502, body: "" });
    const manual = await importaFisier(sesiune(), FISIER, false);
    assert.match(manual.mesaj ?? "", /Diverse, Import date/);
    fir(new TypeError("fetch failed"));
    assert.match((await importaFisier(sesiune(), FISIER, true)).mesaj ?? "", /la Ieșiri/);
  });

  test("niciun mesaj al clientului nu poarta liniuta lunga", async () => {
    for (const r of [PE_FIR_CHEIE_INVENTATA, PE_FIR_FARA_AUTORIZARE, { status: 422, body: "x" }, { status: 207, body: "y" }] as Raspuns[]) {
      fir(r);
      assert.ok(!((await importaFisier(sesiune(), FISIER, true)).mesaj ?? "").includes("\u2014"));
    }
  });
});

describe("⚠⚠ 400 fara motiv la import: refuz DOVEDIT doar daca si o citire e refuzata", () => {
  test("import 400, citirea trece (200): NU STIM, nu refuz (retrimis, s-ar fi dublat)", async () => {
    const cereri = fir(PE_FIR_CHEIE_INVENTATA, { status: 200, body: '{"success":true,"data":{"sold":0}}' });
    const r = await importaFisier(sesiune(), FISIER, true);
    assert.equal(r.fel, "necunoscut");
    assert.equal(r.status, 400);
    assert.equal(verdictPentruRegistru(r.fel), "necunoscut");
    assert.match(r.mesaj ?? "", /cheia de acces și codul fiscal sunt bune/);
    assert.equal(cereri.length, 2);
    assert.equal(cereri[1].metoda, "GET");
    assert.match(cereri[1].url, /\/Situatii\/GetSoldCont\?/);
    assert.equal(cereri[1].antete.get("X-Saga-Cod-Fiscal"), "RO12345678", "aceeasi firma");
  });

  test("import 400, citirea refuzata (400): refuz dovedit", async () => {
    const cereri = fir(PE_FIR_CHEIE_INVENTATA, PE_FIR_CHEIE_INVENTATA);
    const r = await importaFisier(sesiune(), FISIER, true);
    assert.equal(r.fel, "refuzat");
    assert.equal(verdictPentruRegistru(r.fel), "esuat");
    assert.equal(cereri.length, 2);
  });

  test("import 400, citirea fara raspuns: NU STIM", async () => {
    fir(PE_FIR_CHEIE_INVENTATA, new TypeError("fetch failed"));
    const r = await importaFisier(sesiune(), FISIER, false);
    assert.equal(r.fel, "necunoscut");
    assert.match(r.mesaj ?? "", /n-a primit răspuns/);
    assert.match(r.mesaj ?? "", /Diverse, Import date/);
  });

  test("400 CU motiv in JSON nu cere citirea: e refuzul spus de SAGA", async () => {
    const cereri = fir({ status: 400, body: '{"success":false,"message":"Fisierul nu e XML"}' });
    const r = await importaFisier(sesiune(), FISIER, true);
    assert.equal(r.fel, "refuzat");
    assert.equal(cereri.length, 1);
  });

  test("401 si 403 nu cer citirea (sunt refuz de acces si pe numele lor)", async () => {
    for (const status of [401, 403]) {
      const cereri = fir({ status, body: "" });
      assert.equal((await importaFisier(sesiune(), FISIER, true)).fel, "refuzat");
      assert.equal(cereri.length, 1, String(status));
    }
  });

  test("⚠ cheia rotita de citire se salveaza si apare in rezultat", async () => {
    const s = sesiune();
    fir(PE_FIR_CHEIE_INVENTATA, { status: 200, body: '{"success":true}', headers: { "X-Saga-Refresh-Token": "cheie-noua-0002" } });
    const r = await importaFisier(s, FISIER, true);
    assert.equal(r.fel, "necunoscut");
    assert.equal(r.cheieRotita, true);
    assert.deepEqual(s.rotiri, ["cheie-noua-0002"]);
  });
});

describe("⚠⚠ cheia rotita", () => {
  test("cheia noua se da spre salvare, iar sesiunea trece pe ea", async () => {
    fir({ status: 200, body: '{"success":true}', headers: { "X-Saga-Refresh-Token": "cheie-noua-0002" } });
    const s = sesiune();
    const r = await importaFisier(s, FISIER, true);
    assert.deepEqual(s.rotiri, ["cheie-noua-0002"]);
    assert.equal(s.cheie, "cheie-noua-0002");
    assert.equal(r.cheieRotita, true);
    assert.equal(r.cheieNesalvata, false);
  });

  test("⚠ se salveaza INAINTE de citirea corpului: un corp care cade nu mai poate pierde cheia", async () => {
    const ordine: string[] = [];
    /* `highWaterMark: 0`: fluxul nu se umple singur la nastere, ci abia cand chiar il citeste cineva. */
    fir(() => new Response(new ReadableStream({
      pull(ctrl) {
        ordine.push("corp");
        ctrl.enqueue(new TextEncoder().encode('{"success":true}'));
        ctrl.close();
      },
    }, { highWaterMark: 0 }), { status: 200, headers: { "x-saga-refresh-token": "cheie-noua-0002" } }));
    const s = sesiune();
    s.laCheieNoua = async (noua: string) => { ordine.push(`cheie:${noua}`); };
    await importaFisier(s, FISIER, true);
    assert.deepEqual(ordine, ["cheie:cheie-noua-0002", "corp"]);
  });

  test("⚠ apelul URMATOR pleaca cu cheia noua", async () => {
    const cereri = fir(
      { status: 200, body: '{"success":true}', headers: { "X-Saga-Refresh-Token": "cheie-noua-0002" } },
      { status: 200, body: '{"success":true}' },
    );
    const s = sesiune();
    await importaFisier(s, FISIER, true);
    await importaFisier(s, FISIER, true);
    assert.equal(cereri[0].antete.get("authorization"), "Bearer cheie-veche-0001");
    assert.equal(cereri[1].antete.get("authorization"), "Bearer cheie-noua-0002");
  });

  test("⚠ si pe un REFUZ (422) cheia noua se salveaza: orice raspuns o poate aduce", async () => {
    fir({ status: 422, body: "eroare", headers: { "X-Saga-Refresh-Token": "cheie-noua-0002" } });
    const s = sesiune();
    const r = await importaFisier(s, FISIER, true);
    assert.equal(r.fel, "respins");
    assert.deepEqual(s.rotiri, ["cheie-noua-0002"]);
  });

  test("⚠ salvarea picata: sesiunea tot trece pe cheia noua (cea veche poate fi blocata), iar rezultatul o spune", async () => {
    fir({ status: 200, body: '{"success":true}', headers: { "X-Saga-Refresh-Token": "cheie-noua-0002" } });
    const s = sesiune();
    s.laCheieNoua = async () => { throw new Error("baza cazuta"); };
    const r = await importaFisier(s, FISIER, true);
    assert.equal(r.fel, "importat", "documentul a intrat: verdictul nu se schimba din cauza cheii");
    assert.equal(r.cheieNesalvata, true);
    assert.equal(s.cheie, "cheie-noua-0002");
  });

  test("aceeasi cheie, sau una care nu poate fi cheie, nu e o rotatie", async () => {
    fir({ status: 200, body: "{}", headers: { "X-Saga-Refresh-Token": "cheie-veche-0001" } });
    const s = sesiune();
    assert.equal((await importaFisier(s, FISIER, true)).cheieRotita, false);
    assert.deepEqual(s.rotiri, []);
    assert.equal(cheiaNouaDinRaspuns(new Headers({ "X-Saga-Refresh-Token": "are spatii in ea" }), "x"), null);
    assert.equal(cheiaNouaDinRaspuns(new Headers({ "X-Saga-Refresh-Token": "scurt" }), "x"), null);
    assert.equal(cheiaNouaDinRaspuns(new Headers(), "x"), null);
  });

  test("`Authorization` din raspuns (cum il cauta exemplul lor PHP) se ia numai cand lipseste antetul documentat", () => {
    assert.equal(cheiaNouaDinRaspuns(new Headers({ Authorization: "Bearer cheie-noua-0003" }), "cheie-veche-0001"), "cheie-noua-0003");
    assert.equal(
      cheiaNouaDinRaspuns(new Headers({ Authorization: "Bearer alta-cheie-0004", "X-Saga-Refresh-Token": "cheie-noua-0002" }), "cheie-veche-0001"),
      "cheie-noua-0002",
    );
  });

  test("si proba de conexiune isi salveaza cheia rotita", async () => {
    fir({ status: 200, body: '{"success":true,"data":"0"}', headers: { "X-Saga-Refresh-Token": "cheie-noua-0002" } });
    const s = sesiune();
    const r = await testeazaConexiunea(s);
    assert.equal(r.ok, true);
    assert.equal(r.cheieRotita, true);
    assert.deepEqual(s.rotiri, ["cheie-noua-0002"]);
  });
});

describe("proba de conexiune", () => {
  test("o CITIRE autentificata, fara efect: soldul contului de casa", async () => {
    const cereri = fir({ status: 200, body: '{"success":true,"message":"","data":"1234.56"}' });
    const r = await testeazaConexiunea(sesiune());
    assert.equal(cereri[0].metoda, "GET");
    assert.equal(cereri[0].url, `${ADRESA_SAGA}/Situatii/GetSoldCont?cont=5311&tip=D`);
    assert.equal(cereri[0].antete.get("authorization"), "Bearer cheie-veche-0001");
    assert.equal(cereri[0].antete.get("x-saga-cod-fiscal"), "RO12345678");
    assert.equal(r.ok, true);
    assert.ok(!JSON.stringify(r).includes("1234.56"), "soldul comerciantului nu se pastreaza nicaieri");
  });

  test("⚠ pe fir: cheia inventata e REFUZ (salvarea se opreste), cu sfatul bun", async () => {
    fir(PE_FIR_CHEIE_INVENTATA);
    const r = await testeazaConexiunea(sesiune());
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.refuz, true);
    assert.match(r.error, /cheia de acces sau codul fiscal/);
  });

  test("⚠ CITITA PE DOS: un 200 cu `success: false` despre altceva (contul) inseamna ca accesul a trecut", async () => {
    fir({ status: 200, body: '{"success":false,"message":"Contul 5311 nu exista"}' });
    assert.equal((await testeazaConexiunea(sesiune())).ok, true);
  });

  test("un 200 cu `success: false` despre CHEIE e refuz", async () => {
    fir({ status: 200, body: '{"success":false,"message":"Cheie de acces invalida"}' });
    const r = await testeazaConexiunea(sesiune());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.refuz, true);
  });

  test("SAGA cazut sau de negasit NU e refuz: salvarea trece, cu avertisment", async () => {
    for (const r of [PE_FIR_FARA_AUTORIZARE, { status: 503, body: "" }, { status: 429, body: "" }, new TypeError("fetch failed")]) {
      fir(r);
      const p = await testeazaConexiunea(sesiune());
      assert.equal(p.ok, false);
      if (!p.ok) assert.equal(p.refuz, false, String((r as Raspuns).status ?? "retea"));
    }
  });
});

describe("textul raspunsului", () => {
  test("⚠ un raport in windows-1250, fara set declarat, isi pastreaza diacriticele", () => {
    /* „Clientş" in windows-1250: ş = 0xBA. Ca UTF-8 nu e valid, deci se recunoaste. */
    const octeti = new Uint8Array([0x43, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0xba]);
    assert.equal(decodeazaText(octeti, "text/plain"), "Clientş");
  });

  test("setul declarat castiga; BOM-ul si randurile Windows se curata", () => {
    const utf8 = new TextEncoder().encode("﻿Factură\r\nLinia 2");
    assert.equal(decodeazaText(utf8, "text/plain; charset=utf-8"), "Factură\nLinia 2");
  });

  test("JSON-ul lor, cu cheile scrise oricum", () => {
    assert.deepEqual(citesteJson('{"success":true,"message":" ok "}'), { success: true, message: "ok" });
    assert.deepEqual(citesteJson('{"Success":false,"Message":"x"}'), { success: false, message: "x" });
    assert.equal(citesteJson("A aparut o eroare."), null);
    assert.equal(citesteJson("[1,2]"), null);
  });

  test("prima linie cu continut, taiata", () => {
    assert.equal(primaLinie("\n\n  prima  \na doua"), "prima");
    assert.equal(primaLinie("x".repeat(400), 10).length, 10);
    assert.equal(primaLinie(null), "");
  });
});
