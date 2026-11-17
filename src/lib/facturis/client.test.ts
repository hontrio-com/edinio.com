import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  ADRESA_FACTURIS, cheiaDinRaspuns, citesteFactura, citesteRaspunsul, corpulCererii, emiteFactura,
  inregistreazaIncasarea, mesajFacturis, pdfFactura, testeazaConexiunea,
} from "./client";

/*
 * Clientul Facturis, probat fara fir. Ce conteaza aici e un singur lucru, cu doua fete: un refuz
 * DOVEDIT trebuie sa iasa `esuat` (reincercarea e libera), iar orice „nu stim" de pe o scriere
 * trebuie sa iasa `necunoscut` (reincercarea ar emite a doua factura fiscala).
 */

const A = { api_key: " CHEIE ", username: "admin", password: "p&ss%'\"=", cif: "RO 31234567" };

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

type Raspuns = { status?: number; body: string | Uint8Array; headers?: Record<string, string> };
/** Inlocuieste `fetch` si tine minte cererile, ca proba sa poata citi ce a plecat. */
function fir(...raspunsuri: (Raspuns | Error)[]) {
  const cereri: { url: string; corp: Record<string, unknown> }[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const json = new URLSearchParams(String(init?.body ?? "")).get("json") ?? "{}";
    cereri.push({ url: String(url), corp: JSON.parse(json) as Record<string, unknown> });
    const r = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(r.body as BodyInit, { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return cereri;
}

const ok = (result: unknown): Raspuns => ({ body: JSON.stringify({ success: 2000, result }) });
const refuz = (cod: number, mesaj: string): Raspuns => ({ body: JSON.stringify({ error: cod, result: mesaj }) });

describe("cererea", () => {
  test("un singur camp `json`, codat: caracterele care rupeau modulul lor pleaca intregi", () => {
    const corp = corpulCererii(A, "Facturi", "Ins", { dataFact: { facturi_obs_up: "Tom & Jerry 100% \"bun\" 'sigur'" } });
    const p = new URLSearchParams(corp);
    assert.deepEqual([...p.keys()], ["json"]);
    const o = JSON.parse(p.get("json") ?? "") as Record<string, unknown>;
    assert.equal((o.dataFact as Record<string, string>).facturi_obs_up, "Tom & Jerry 100% \"bun\" 'sigur'");
    assert.equal(o.p, "p&ss%'\"=", "parola pleaca exact, nici macar taiata la spatii");
    assert.equal(o.APIkey, "CHEIE");
    assert.equal(o.c, "RO 31234567");
    assert.equal(o.met, "Facturi");
    assert.equal(o.act, "Ins");
  });
  test("⚠ un parametru nu poate inlocui acreditarile sau metoda", () => {
    const o = JSON.parse(new URLSearchParams(corpulCererii(A, "Facturi", "Get", { APIkey: "alta", met: "Clienti", u: "x" })).get("json") ?? "");
    assert.equal(o.APIkey, "CHEIE");
    assert.equal(o.met, "Facturi");
    assert.equal(o.u, "admin");
  });
});

describe("raspunsul", () => {
  test("reusita: `success` ca numar sau ca text", () => {
    assert.deepEqual(citesteRaspunsul('{"success":2000,"result":{"id":"5"}}'), { ok: true, rezultat: { id: "5" } });
    assert.deepEqual(citesteRaspunsul('{"success":"2000","result":[]}'), { ok: true, rezultat: [] });
  });
  test("refuzul lor, cu cod si mesaj", () => {
    assert.deepEqual(citesteRaspunsul('{"error":1005,"result":"Campul este obligatoriu"}'), { ok: false, cod: "1005", mesaj: "Campul este obligatoriu" });
  });
  /*
   * ⚠ RASPUNSURI REALE, culese pe fir pe 17.11.2026 cu chei INVENTATE (nu creeaza nimic). Pastrate
   * brute: documentatia nu le arata, iar o presupunere despre forma lor ar fi fost a cincea gresita
   * (vezi `pastreaza-raspunsul-brut`).
   */
  test("pe fir: cheile gresite (1004) — si la citire, si la emitere, si la PDF", () => {
    const r = citesteRaspunsul('{"error":1004,"result":"Datele de autentificare sunt gresite"}');
    assert.deepEqual(r, { ok: false, cod: "1004", mesaj: "Datele de autentificare sunt gresite" });
  });
  test("pe fir: validarea vine cu cate un obiect pe camp, iar mesajul trebuie sa ramana citibil", () => {
    const brut = '{"msg":"Campul este obligatoriu!","cod":1005,"error":"1005","result":{"c":{"msg":"Campul este obligatoriu!","cod":1005},"u":{"msg":"Campul este obligatoriu!","cod":1005},"p":{"msg":"Campul este obligatoriu!","cod":1005}}}';
    const r = citesteRaspunsul(brut);
    assert.equal(r?.ok, false);
    assert.equal(!r?.ok && r?.cod, "1005");
    assert.equal(!r?.ok && r?.mesaj, "Campul este obligatoriu! (codul fiscal al firmei, utilizatorul, parola)");
  });
  test("pe fir: codul vine si ca TEXT („2110”, JSON stricat)", () => {
    assert.deepEqual(citesteRaspunsul('{"error":"2110","result":"The json format is incorrect! "}'), { ok: false, cod: "2110", mesaj: "The json format is incorrect!" });
  });
  test("⚠ orice alta forma e NECUNOSCUTA, nu reusita si nu refuz", () => {
    assert.equal(citesteRaspunsul("<html>login</html>"), null);
    assert.equal(citesteRaspunsul('{"success":1000}'), null);
    assert.equal(citesteRaspunsul("[]"), null);
    assert.equal(citesteRaspunsul(""), null);
  });
  test("id-ul documentului: `id` (documentatia), `id_fact` (modulul lor), si doar cifre", () => {
    assert.equal(cheiaDinRaspuns({ msg: "ok", id: "92382888" }), "92382888");
    assert.equal(cheiaDinRaspuns({ id_fact: 77 }), "77");
    assert.equal(cheiaDinRaspuns({ id: "" }), null);
    assert.equal(cheiaDinRaspuns({ id: "0" }), null);
    assert.equal(cheiaDinRaspuns({ id: "abc" }), null);
    assert.equal(cheiaDinRaspuns(null), null);
  });
  test("mesajele reale (ghidul easySales) primesc pasul urmator, iar brutul ramane citat", () => {
    assert.match(mesajFacturis("1", "Datele de autentificare sunt gresite"), /utilizatorul care a generat cheia API/);
    assert.match(mesajFacturis("1", "Cheia API este invalida"), /„Ip Acces” gol/);
    assert.match(mesajFacturis("1", "Pentru activare activati pachetul Complet++"), /pachetul care include API-ul/);
    assert.match(mesajFacturis("1", "Seria nu a fost gasita! Folositi o serie creata in contul de cloud."), /nu găsește seria/);
    assert.match(mesajFacturis("1", "Nu aveti permisiuni pentru operatia solicitata"), /administrator/);
    assert.match(mesajFacturis("1005", "Ceva nou"), /Ceva nou \(cod 1005\)/);
    assert.match(mesajFacturis(null, "Datele de autentificare sunt gresite"), /„Datele de autentificare sunt gresite”/);
  });
});

describe("emiterea", () => {
  test("reusita: intoarce id-ul si trimite `Facturi`/`Ins` cu factura si liniile", async () => {
    const cereri = fir(ok({ msg: "Datele au fost salvate cu succes!", id: "92382888" }));
    const id = await emiteFactura(A, { facturi_serie: "EDN" }, [{ facturi_prod_nume: "x" }]);
    assert.equal(id, "92382888");
    assert.equal(cereri[0].url, ADRESA_FACTURIS);
    assert.equal(cereri[0].corp.met, "Facturi");
    assert.equal(cereri[0].corp.act, "Ins");
    assert.deepEqual(cereri[0].corp.dataFact, { facturi_serie: "EDN" });
  });
  test("refuzul lor e REFUZ dovedit: reincercarea e libera", async () => {
    fir(refuz(1005, "Campul 'Serie' este obligatoriu."));
    await assert.rejects(emiteFactura(A, {}, []), (e: unknown) => verdictFurnizor(e) === "esuat");
  });
  test("⚠ 2000 fara id: documentul aproape sigur exista, deci NU STIM", async () => {
    fir(ok({ msg: "Datele au fost salvate cu succes!" }));
    await assert.rejects(emiteFactura(A, {}, []), (e: unknown) => verdictFurnizor(e) === "necunoscut");
  });
  test("⚠ legatura rupta, pagina de eroare, 5xx, timeout: NU STIM", async () => {
    for (const r of [
      new TypeError("fetch failed"),
      { status: 502, body: "<html>Bad gateway</html>" },
      { status: 200, body: "<html>ceva</html>" },
      Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    ]) {
      fir(r as Raspuns | Error);
      await assert.rejects(emiteFactura(A, {}, []), (e: unknown) => verdictFurnizor(e) === "necunoscut");
    }
  });
  test("un refuz JSON venit pe un status de eroare e tot refuz", async () => {
    fir({ status: 400, body: JSON.stringify({ error: 1112, result: "Clientul exista" }) });
    await assert.rejects(emiteFactura(A, {}, []), (e: unknown) => verdictFurnizor(e) === "esuat");
  });
  test("⚠ pe o scriere, un 5xx sau 408 cu corp de eroare NU e refuz dovedit: NU STIM", async () => {
    for (const status of [500, 503, 408]) {
      fir({ status, body: JSON.stringify({ error: "9999", result: "Eroare interna" }) });
      await assert.rejects(emiteFactura(A, {}, []), (e: unknown) => verdictFurnizor(e) === "necunoscut", String(status));
    }
  });
  test("⚠ succesul castiga: `error: 0` langa `success: 2000` nu e refuz", async () => {
    for (const eroare of [0, "0", "", null]) {
      fir({ body: JSON.stringify({ success: 2000, error: eroare, result: { id: 77 } }) });
      assert.equal(await emiteFactura(A, {}, []), "77", String(eroare));
    }
  });
});

describe("citirea", () => {
  test("alege CHIAR factura cu id-ul cerut, si citeste seria, numarul si totalul", async () => {
    fir(ok([
      { facturi_key: "1", facturi_serie: "X", facturi_serie_numar: "9" },
      {
        facturi_key: "92382888", facturi_serie: "EDN", facturi_serie_numar: "141", facturi_prod_val_tot: "59.50",
        facturi_status: "Emisa", fk_clienti_key: "245", facturi_nume_client: "Ion", clienti_oras: "Bacau",
        dataProd: [{ facturi_prod_nume: "Cana", facturi_prod_cant: "1.000", facturi_prod_val_tot: "59.5" }],
      },
    ]));
    const f = await citesteFactura(A, "92382888");
    assert.ok(f);
    assert.equal(f.serie, "EDN");
    assert.equal(f.numar, "141");
    assert.equal(f.total, 59.5);
    assert.equal(f.clientCheie, "245");
    assert.equal(f.client.oras, "Bacau");
    assert.equal(f.linii[0].nume, "Cana");
  });
  test("„nu exista rezultate” (5005) = factura nu exista; un id strain in raspuns = la fel", async () => {
    fir(refuz(5005, "Nu exista rezultate"));
    assert.equal(await citesteFactura(A, "5"), null);
    fir(ok([{ facturi_key: "6" }]));
    assert.equal(await citesteFactura(A, "5"), null);
  });
  test("o citire picata e REFUZ: o citire nu creeaza nimic", async () => {
    fir(new TypeError("fetch failed"));
    await assert.rejects(citesteFactura(A, "5"), (e: unknown) => verdictFurnizor(e) === "esuat");
  });
});

describe("PDF-ul", () => {
  test("octetii unui PDF trec, si se cere `FacturiHtml`/`Facturi` dupa id", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n...\n%%EOF");
    const cereri = fir({ body: pdf, headers: { "content-type": "application/pdf" } });
    const octeti = await pdfFactura(A, "92382888");
    assert.equal(octeti.byteLength, pdf.byteLength);
    assert.equal(cereri[0].corp.met, "FacturiHtml");
    assert.equal(cereri[0].corp.act, "Facturi");
    assert.equal(cereri[0].corp.id_fact, "92382888");
  });
  test("⚠ un JSON de eroare sau o pagina HTML NU pleaca drept PDF", async () => {
    fir(refuz(1, "Datele de autentificare sunt gresite"));
    await assert.rejects(pdfFactura(A, "1"), /utilizatorul care a generat cheia API/);
    fir({ body: "<html>login</html>" });
    await assert.rejects(pdfFactura(A, "1"), /nu a trimis un PDF/);
  });
});

describe("incasarea", () => {
  test("se imperecheaza cu factura, suma cu doi bani, id-urile ca numere", async () => {
    const cereri = fir(ok({ msg: "ok", id: "88" }));
    const id = await inregistreazaIncasarea(A, {
      clientCheie: "245", data: "17-11-2026 12:00:00", suma: 39.9, tip: "Card", observatii: "Plata online", facturaCheie: "92382888",
    });
    assert.equal(id, "88");
    const c = cereri[0].corp;
    assert.equal(c.met, "RegistruIncasari");
    assert.equal(c.act, "Ins");
    assert.equal(c.incasari_suma, "39.90");
    assert.deepEqual(c.idFacturi, [92382888]);
    assert.equal(c.incasari_tip, "Card");
  });
});

describe("proba de conexiune", () => {
  test("„nu exista rezultate” e REUSITA: au trecut de autentificare", async () => {
    const cereri = fir(refuz(5005, "Nu exista rezultate"));
    assert.deepEqual(await testeazaConexiunea(A), { ok: true });
    assert.equal(cereri[0].corp.met, "Facturi");
    assert.equal(cereri[0].corp.date_start, "01-01-2000");
    assert.equal(cereri[0].corp.facturi_key, undefined, "fara cheia „0”: in PHP ar fi sarit filtrul");
  });
  test("reusita cu lista goala e reusita; refuzul de autentificare spune ce e de facut", async () => {
    fir(ok([]));
    assert.deepEqual(await testeazaConexiunea(A), { ok: true });
    fir(refuz(1001, "Datele de autentificare sunt gresite"));
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /utilizatorul care a generat cheia API/);
    assert.equal(!r.ok && r.refuz, true, "Facturis a raspuns NU: salvarea trebuie oprita");
  });
  test("fara retea: spune, nu arunca, si NU e refuz (salvarea trece cu avertisment)", async () => {
    fir(new TypeError("fetch failed"));
    const r = await testeazaConexiunea(A);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.refuz, false);
  });
});
