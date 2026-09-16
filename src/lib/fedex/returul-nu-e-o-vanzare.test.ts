import { strict as assert } from "node:assert";
import { test, describe, beforeEach } from "node:test";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  cautaDupaReferinta, creeazaExpediere, uitaTokenurile, urmareste, ziuaAzi,
  type FedexConfig,
} from "./client";
import { statusComandaDinCod, statusUrmator } from "./statusuri";

/*
 * ⚠⚠ CE APARA PROBELE ASTEA.
 *
 * Patru locuri in care FedEx se deosebeste de ceilalti si in care codul lua o
 * hotarare pe care nu avea de unde s-o ia:
 *
 *  1. Un refuz DOVEDIT al autentificarii iesea rescris ca „nu stim”, deci blocheaza
 *     o comanda pe care nu s-a intamplat nimic.
 *  2. Capatul ferestrei de cautare pleca mereu pe MAINE, iar ei au cod anume pentru
 *     asta (`TRACKING.SHIPDATEEND.FUTURE`) — deci singura plasa contra duplicatelor
 *     era respinsa de fiecare data.
 *  3. Un retur ajuns inapoi la comerciant e de nedeosebit de o livrare, daca te uiti
 *     numai la starea curenta: acelasi AWB, acelasi `DL`, acelasi `ACTUAL_DELIVERY`.
 *     Crezut, trece comanda pe „Livrata” si poate declansa factura automata.
 *  4. Cheia gresita cerea un token nou la fiecare apel, iar pragul lor e pe IP —
 *     adica pe TOATE magazinele de pe aceeasi instanta.
 */

const CONFIG: FedexConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "613902139",
  expeditor: { nume: "Depozit", telefon: "0721000111", strada: "Str. A nr. 1", oras: "Cluj-Napoca", cod_postal: "400001" },
};

type Cerere = { url: string; corp: unknown };

/** Inlocuieste `fetch` si tine minte ce a plecat. */
function retea(raspunde: (url: string, corp: unknown) => Response) {
  const original = globalThis.fetch;
  const cereri: Cerere[] = [];
  globalThis.fetch = (async (intrare: unknown, init?: { body?: unknown }) => {
    const url = String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? "");
    let corp: unknown = null;
    if (typeof init?.body === "string") {
      try { corp = JSON.parse(init.body); } catch { corp = init.body; }
    }
    cereri.push({ url, corp });
    return raspunde(url, corp);
  }) as unknown as typeof globalThis.fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

function json(corp: unknown, status = 200): Response {
  return new Response(JSON.stringify(corp), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => uitaTokenurile());

describe("FedEx: un refuz al autentificarii ramane REFUZ, si pe o scriere", () => {
  /*
   * ⚠ De ce conteaza tocmai pe scriere: `necunoscut` BLOCHEAZA randul din registru
   * si scoate cazul la om. E purtarea corecta cand chiar nu stim daca a plecat ceva.
   * Dar cand FedEx ne-a respins CHEILE, stim: n-a plecat nimic. Comerciantul trebuie
   * sa-si repare cheia si sa apese din nou, nu sa ramana cu o comanda inghetata.
   */
  test("401 la /oauth/token => verdict `esuat`, nu `necunoscut`", async () => {
    const r = retea((url) => url.includes("/oauth/token")
      ? json({ errors: [{ code: "NOT.AUTHORIZED.ERROR", message: "bad key" }] }, 401)
      : json({ output: {} }));
    try {
      await assert.rejects(
        () => creeazaExpediere(CONFIG, { requestedShipment: {} }, "CMD-PROBA"),
        (e: unknown) => {
          assert.equal(verdictFurnizor(e), "esuat");
          return true;
        },
      );
      /* Si chiar n-a plecat nicio cerere de expediere. */
      assert.equal(r.cereri.filter((c) => c.url.includes("/ship/")).length, 0);
    } finally { r.restaureaza(); }
  });

  test("403 (pragul lor pe IP) => tot `esuat`", async () => {
    const r = retea((url) => url.includes("/oauth/token")
      ? json({ errors: [{ code: "FORBIDDEN.ERROR", message: "rate limited" }] }, 403)
      : json({ output: {} }));
    try {
      await assert.rejects(
        () => creeazaExpediere(CONFIG, { requestedShipment: {} }, "CMD-PROBA"),
        (e: unknown) => verdictFurnizor(e) === "esuat",
      );
    } finally { r.restaureaza(); }
  });

  test("⚠ dar o cadere de RETEA pe cererea de expediere ramane `necunoscut`", async () => {
    const r = retea((url) => {
      if (url.includes("/oauth/token")) return json({ access_token: "t", expires_in: 3600 });
      throw new Error("socket hang up");
    });
    try {
      await assert.rejects(
        () => creeazaExpediere(CONFIG, { requestedShipment: {} }, "CMD-PROBA"),
        (e: unknown) => verdictFurnizor(e) === "necunoscut",
      );
    } finally { r.restaureaza(); }
  });
});

describe("FedEx: cheia respinsa nu mai bate in pragul lor pe IP", () => {
  /*
   * ⚠ Pragul e pe ADRESA IP, iar pe Vercel IP-ul e partajat intre magazine: un
   * singur magazin prost configurat putea sa stinga cotarea FedEx pentru toate.
   */
  test("al doilea apel cu aceeasi cheie gresita nu mai cere token", async () => {
    const r = retea(() => json({ errors: [{ code: "NOT.AUTHORIZED.ERROR" }] }, 401));
    try {
      await assert.rejects(() => creeazaExpediere(CONFIG, { requestedShipment: {} }, "CMD-PROBA"));
      const dupaPrimul = r.cereri.filter((c) => c.url.includes("/oauth/token")).length;
      await assert.rejects(() => creeazaExpediere(CONFIG, { requestedShipment: {} }, "CMD-PROBA"));
      const dupaAlDoilea = r.cereri.filter((c) => c.url.includes("/oauth/token")).length;
      assert.equal(dupaPrimul, 1);
      assert.equal(dupaAlDoilea, 1, "al doilea apel a mai cerut un token");
    } finally { r.restaureaza(); }
  });

  test("dar mesajul ramane acelasi, ca omul sa stie ce sa repare", async () => {
    const r = retea(() => json({ errors: [{ code: "NOT.AUTHORIZED.ERROR" }] }, 401));
    try {
      const mesaje: string[] = [];
      for (let i = 0; i < 2; i++) {
        try { await creeazaExpediere(CONFIG, { requestedShipment: {} }, "CMD-PROBA"); }
        catch (e) { mesaje.push((e as Error).message); }
      }
      assert.equal(mesaje.length, 2);
      assert.ok(mesaje[0].includes("API Key"), mesaje[0]);
      assert.equal(mesaje[1], mesaje[0]);
    } finally { r.restaureaza(); }
  });
});

describe("FedEx: fereastra de cautare nu pleaca in viitor", () => {
  /*
   * `Track-Common-ErrorMapping.json`, cod `TRACKING.SHIPDATEEND.FUTURE`:
   * „Invalid ship date range. End date must not be in the future.”
   */
  test("shipDateEnd nu trece niciodata de ziua de azi", async () => {
    const r = retea((url) => url.includes("/oauth/token")
      ? json({ access_token: "t", expires_in: 3600 })
      : json({ output: { completeTrackResults: [] } }));
    try {
      await cautaDupaReferinta(CONFIG, "CMD-1", new Date(Date.now() - 5 * 86_400_000), new Date());
      const cerere = r.cereri.find((c) => c.url.includes("/track/v1/referencenumbers"));
      const info = (cerere?.corp as { referencesInformation: Record<string, string> }).referencesInformation;
      const azi = ziuaAzi();
      assert.ok(info.shipDateEnd <= azi, `shipDateEnd=${info.shipDateEnd} > ${azi}`);
      assert.ok(info.shipDateEndDate <= azi, `shipDateEndDate=${info.shipDateEndDate} > ${azi}`);
      assert.ok(info.shipDateBegin < info.shipDateEnd, "fereastra s-a inchis de tot");
    } finally { r.restaureaza(); }
  });

  test("si cand i se cere un capat din viitor, tot azi ramane", async () => {
    const r = retea((url) => url.includes("/oauth/token")
      ? json({ access_token: "t", expires_in: 3600 })
      : json({ output: { completeTrackResults: [] } }));
    try {
      const peste5zile = new Date(Date.now() + 5 * 86_400_000);
      await cautaDupaReferinta(CONFIG, "CMD-2", new Date(Date.now() - 86_400_000), peste5zile);
      const cerere = r.cereri.find((c) => c.url.includes("/track/v1/referencenumbers"));
      const info = (cerere?.corp as { referencesInformation: Record<string, string> }).referencesInformation;
      assert.equal(info.shipDateEnd, ziuaAzi());
    } finally { r.restaureaza(); }
  });
});

describe("FedEx: un retur ajuns inapoi NU e o livrare", () => {
  const RASPUNS_RETUR = {
    output: {
      completeTrackResults: [{
        trackingNumber: "794600000001",
        trackResults: [{
          trackingNumberInfo: { trackingNumber: "794600000001" },
          latestStatusDetail: { derivedCode: "DL", statusByLocale: "Delivered" },
          dateAndTimes: [{ type: "ACTUAL_DELIVERY", dateTime: "2026-09-16T11:04:00+03:00" }],
          scanEvents: [
            { eventType: "PU", eventDescription: "Picked up" },
            { eventType: "RS", eventDescription: "Returning to shipper" },
            { eventType: "DL", eventDescription: "Delivered" },
          ],
        }],
      }],
    },
  };

  test("istoricul cu `RS` se citeste din scanEvents, pe care oricum le cerem", async () => {
    const r = retea((url) => url.includes("/oauth/token")
      ? json({ access_token: "t", expires_in: 3600 })
      : json(RASPUNS_RETUR));
    try {
      const [u] = await urmareste(CONFIG, ["794600000001"]);
      assert.equal(u.cod, "DL");
      assert.ok(u.livratLa, "livrarea exista, si asta e tocmai capcana");
      assert.equal(u.seIntoarce, true);
    } finally { r.restaureaza(); }
  });

  test("fara retur in istoric, aceeasi livrare ramane livrare", async () => {
    const curat = JSON.parse(JSON.stringify(RASPUNS_RETUR)) as typeof RASPUNS_RETUR;
    curat.output.completeTrackResults[0].trackResults[0].scanEvents =
      [{ eventType: "PU", eventDescription: "Picked up" }, { eventType: "DL", eventDescription: "Delivered" }];
    const r = retea((url) => url.includes("/oauth/token")
      ? json({ access_token: "t", expires_in: 3600 })
      : json(curat));
    try {
      const [u] = await urmareste(CONFIG, ["794600000001"]);
      assert.equal(u.seIntoarce, false);
    } finally { r.restaureaza(); }
  });

  /*
   * ⚠ Proba pe APELANT, nu pe unealta: `eLivrat` are DOUA semnale (codul si
   * `ACTUAL_DELIVERY`), si amandoua spun „livrat” pe un retur ajuns. Deci taietura
   * trebuie sa fie INAINTEA lor, in `statusComandaDinCod`.
   */
  test("comanda NU trece pe `delivered`, desi si codul si data livrarii spun ca da", () => {
    assert.equal(statusComandaDinCod("DL", "2026-09-16T11:04:00+03:00"), "delivered");
    assert.equal(statusComandaDinCod("DL", "2026-09-16T11:04:00+03:00", true), null);
  });

  test("si nici prin `statusUrmator`, de unde pleaca facturarea automata", () => {
    assert.equal(statusUrmator("shipped", "DL", "2026-09-16T11:04:00+03:00"), "delivered");
    assert.equal(statusUrmator("shipped", "DL", "2026-09-16T11:04:00+03:00", true), null);
  });

  test("intoarcerea taie si cand nu exista nicio data de livrare", () => {
    assert.equal(statusComandaDinCod("IT", null, true), null);
    assert.equal(statusComandaDinCod("IT", null, false), "shipped");
  });
});
