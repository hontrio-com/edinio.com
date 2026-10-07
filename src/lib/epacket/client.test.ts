import { strict as assert } from "node:assert";
import { afterEach, describe, test } from "node:test";

import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  BAZA_EPACKET, campulEroriiEpacket, codulEroriiEpacket, creeazaAwbEpacket, eAwbNegasit, eCheieDeTest,
  epacketGata, eroareDinRaspuns, etichetaEpacket, felulEroriiEpacket, probaConexiuneEpacket, stareEpacket,
  tarifeEpacket, type EpacketConfig,
} from "./client";

/*
 * Clientul e-packet, pe purtare. Raspunsurile sunt cele MASURATE pe fir pe 07.10.2026 (vezi
 * `docs/curieri/EPACKET.md`); `fetch` se inlocuieste, ca proba sa nu atinga reteaua.
 */

const CFG = { api_key: "epk_test_cheie" };
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

type Cerere = { url: string; init: RequestInit };
function raspunde(status: number, corp: unknown, antete: Record<string, string> = {}): Cerere[] {
  const cereri: Cerere[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    cereri.push({ url: String(url), init });
    const b = typeof corp === "string" || corp instanceof Uint8Array ? corp : JSON.stringify(corp);
    return new Response(b as BodyInit, { status, headers: { "content-type": "application/json", ...antete } });
  }) as typeof fetch;
  return cereri;
}

const err = (code: string, message: string, field?: string) => ({ error: { code, message, ...(field ? { field } : {}) } });

describe("verdictele, pe codurile lor", () => {
  test("401/403: refuz si felul `autentificare` (singurul care trimite la cheie)", () => {
    for (const [st, cod] of [[401, "invalid_api_key"], [403, "key_inactive"], [403, "account_inactive"]] as const) {
      const e = eroareDinRaspuns(st, err(cod, "x"), "scriere", "awb");
      assert.equal(verdictFurnizor(e), "esuat", cod);
      assert.equal(felulEroriiEpacket(e), "autentificare", cod);
    }
  });

  test("402: refuz, felul `credit`, iar mesajul spune ce e de facut", () => {
    const e = eroareDinRaspuns(402, err("insufficient_credit", "Credit sub minimul pentru generare (20 lei)."), "scriere", "awb");
    assert.equal(verdictFurnizor(e), "esuat");
    assert.equal(felulEroriiEpacket(e), "credit");
    assert.match(e.message, /Alimenteaza creditul/);
  });

  test("422: refuz cu CAMPUL lor in mesaj si pe eroare", () => {
    const e = eroareDinRaspuns(422, err("invalid_field", "Codul poștal are exact 6 cifre.", "recipient.postcode"), "scriere", "awb");
    assert.equal(verdictFurnizor(e), "esuat");
    assert.equal(campulEroriiEpacket(e), "recipient.postcode");
    assert.equal(codulEroriiEpacket(e), "invalid_field");
    assert.match(e.message, /\(recipient\.postcode\)$/);
  });

  test("429: nimic creat sau taxat (scris de ei), deci refuz si pe scriere", () => {
    assert.equal(verdictFurnizor(eroareDinRaspuns(429, err("rate_limited", "x"), "scriere", "awb")), "esuat");
  });

  test("⚠⚠ 502 `courier_refused` e refuz; `courier_unavailable` pe SCRIERE e „nu stim”", () => {
    const refuz = eroareDinRaspuns(502, err("courier_refused", "Curierul a refuzat expedierea."), "scriere", "awb");
    assert.equal(verdictFurnizor(refuz), "esuat");
    assert.match(refuz.message, /codul postal/, "refuzul DPD fara motiv cere sfatul despre codul postal");
    const nustim = eroareDinRaspuns(502, err("courier_unavailable", "Curierul nu a răspuns."), "scriere", "awb");
    assert.equal(verdictFurnizor(nustim), "necunoscut");
    assert.match(nustim.message, /verifica in aplicatia e-packet/i);
    /* Pe o CITIRE, nimic nu s-a creat: refuz. */
    assert.equal(verdictFurnizor(eroareDinRaspuns(502, err("courier_unavailable", "x"), "citire", "status")), "esuat");
  });

  test("500 si un 5xx fara corp, pe scriere: „nu stim”", () => {
    assert.equal(verdictFurnizor(eroareDinRaspuns(500, err("internal_error", "x"), "scriere", "awb")), "necunoscut");
    assert.equal(verdictFurnizor(eroareDinRaspuns(503, undefined, "scriere", "awb")), "necunoscut");
  });
});

describe("cererea", () => {
  test("cheia pleaca DOAR in antet (Bearer), niciodata in adresa; redirectul nu se urmeaza", async () => {
    const cereri = raspunde(200, { data: [{ id: 109, name: "CLUJ NAPOCA", display_name: "Cluj Napoca (Cluj)", county: "CJ" }], has_more: false });
    await probaConexiuneEpacket(CFG);
    assert.equal(cereri.length, 1);
    assert.ok(cereri[0].url.startsWith(`${BAZA_EPACKET}/localities?`));
    assert.equal(cereri[0].url.includes("epk_"), false);
    assert.equal((cereri[0].init.headers as Record<string, string>).Authorization, "Bearer epk_test_cheie");
    assert.equal(cereri[0].init.redirect, "manual");
  });

  test("fara cheie nu pleaca nicio cerere", async () => {
    const cereri = raspunde(200, {});
    await assert.rejects(probaConexiuneEpacket({ api_key: "  " }), /lipseste cheia/);
    assert.equal(cereri.length, 0);
  });

  test("⚠ proba de conexiune: o lista goala nu e o conexiune buna", async () => {
    raspunde(200, { data: [], has_more: false });
    await assert.rejects(probaConexiuneEpacket(CFG), /fara nicio localitate/);
  });

  test("⚠ un 3xx pe EMITERE e „nu stim”, pe citire e refuz", async () => {
    raspunde(302, "");
    await assert.rejects(creeazaAwbEpacket(CFG, {}), (e) => verdictFurnizor(e) === "necunoscut");
    raspunde(302, "");
    await assert.rejects(stareEpacket(CFG, "1"), (e) => verdictFurnizor(e) === "esuat");
  });

  test("⚠ termenul depasit pe EMITERE e „nu stim”", async () => {
    globalThis.fetch = (async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as typeof fetch;
    await assert.rejects(creeazaAwbEpacket(CFG, {}), (e) => verdictFurnizor(e) === "necunoscut");
  });
});

describe("emiterea", () => {
  test("201 cu numarul curierului, pret, credit si ridicarea DPD (forma masurata)", async () => {
    raspunde(201, {
      awb_number: "81382503889", courier: "DPD", delivery_type: "D2D", price: 56.76, currency: "RON", credit_left: 0,
      reference: "EDN-PROBA-FIR-1", pickup: { requested: true, id: "2610070000008269", from: "2026-10-07T14:18:00+0300", to: "2026-10-07T16:18:00+0300" },
    });
    const a = await creeazaAwbEpacket(CFG, {});
    assert.deepEqual(a, {
      awb: "81382503889", curier: "DPD", tip: "D2D", pret: 56.76, creditRamas: 0,
      ridicare: { ceruta: true, id: "2610070000008269", de: "2026-10-07T14:18:00+0300", pana: "2026-10-07T16:18:00+0300", motiv: "" },
    });
  });

  test("Sameday: `pickup: null` (masurat)", async () => {
    raspunde(201, { awb_number: "1ONBLN1456985", courier: "SDY", delivery_type: "D2L", price: 4749.41, credit_left: 0, pickup: null });
    assert.equal((await creeazaAwbEpacket(CFG, {})).ridicare, null);
  });

  test("⚠⚠ 201 FARA numar: „nu stim”, niciodata reusita", async () => {
    raspunde(201, { courier: "DPD" });
    await assert.rejects(creeazaAwbEpacket(CFG, {}), (e) => verdictFurnizor(e) === "necunoscut");
  });

  test("⚠ corp necitibil pe emitere: „nu stim”", async () => {
    raspunde(201, "<html>gateway</html>");
    await assert.rejects(creeazaAwbEpacket(CFG, {}), (e) => verdictFurnizor(e) === "necunoscut");
  });
});

describe("tarifele, starea, eticheta", () => {
  test("tarifele: indisponibilele cu motivul lor, curierul strain sare", async () => {
    raspunde(200, { quotes: [
      { courier: "DPD", delivery_type: "D2D", available: true, price: 28.68, currency: "RON" },
      { courier: "TCE", delivery_type: "D2D", available: false, reason: "Curierul nu oferă un tarif pentru acest transport." },
      { courier: "XYZ", delivery_type: "D2D", available: true, price: 1 },
      { courier: "SDY", delivery_type: "D2D", available: true, price: 10, currency: "EUR" },
    ] });
    const o = await tarifeEpacket(CFG, { sender_locality_id: 1, recipient_locality_id: 2, package_type: "parcel", parcels: [{ weight: 1 }] });
    assert.deepEqual(o.map((x) => [x.curier, x.disponibil, x.pret]), [["DPD", true, 28.68], ["TCE", false, null], ["SDY", false, null]]);
    assert.match(o[2].motiv, /EUR/, "alta moneda nu se aduna la lei");
  });

  test("starea: forma masurata; AWB necunoscut = 404 `not_found`, recunoscut ca atare", async () => {
    raspunde(200, { awb: "81382475619", courier: "DPD", status: "creat", label: "Creat", is_final: false, status_at: "2026-10-07T13:57:15+03:00", checked_at: "2026-10-07T13:58:40.38+03:00" });
    const s = await stareEpacket(CFG, "81382475619");
    assert.deepEqual([s.status, s.eticheta, s.final, s.curier], ["creat", "Creat", false, "DPD"]);
    raspunde(404, err("not_found", "AWB-ul nu a fost găsit în contul dumneavoastră."));
    await assert.rejects(stareEpacket(CFG, "0"), (e) => eAwbNegasit(e) && verdictFurnizor(e) === "esuat");
  });

  test("⚠ eticheta se judeca dupa OCTETI, nu dupa antet", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.5 ...");
    raspunde(200, pdf, { "content-type": "application/pdf", "x-label-size": "A6" });
    const e = await etichetaEpacket(CFG, "1", "A6");
    assert.equal(e.marime, "A6");
    assert.equal(e.pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    raspunde(200, "nu e pdf", { "content-type": "application/pdf" });
    await assert.rejects(etichetaEpacket(CFG, "1"), /nu a trimis o eticheta PDF/);
  });
});

describe("regulile de configurare", () => {
  const BUN: EpacketConfig = {
    enabled: true, api_key: "epk_live_x",
    expeditor: { prenume: "Magazin", nume: "Proba", telefon: "0712345678", email: "a@b.ro", localitate_id: 14515, cod_postal: "010011", strada: "Strada X", numar: "5" },
  };

  test("gata numai cu cheia si TOATA adresa de ridicare", () => {
    assert.equal(epacketGata(BUN), true);
    for (const stricat of [
      { ...BUN, enabled: false }, { ...BUN, api_key: " " },
      { ...BUN, expeditor: { ...BUN.expeditor, prenume: "Al" } },
      { ...BUN, expeditor: { ...BUN.expeditor, localitate_id: null } },
      { ...BUN, expeditor: { ...BUN.expeditor, cod_postal: "01001" } },
      { ...BUN, expeditor: { ...BUN.expeditor, numar: "" } },
      { ...BUN, expeditor: { ...BUN.expeditor, email: "" } },
    ]) assert.equal(epacketGata(stricat as EpacketConfig), false, JSON.stringify(stricat.expeditor));
  });

  test("cheia de test se recunoaste dupa prefixul lor", () => {
    assert.equal(eCheieDeTest(" epk_test_abc"), true);
    assert.equal(eCheieDeTest("epk_live_abc"), false);
    assert.equal(eCheieDeTest(null), false);
  });
});
