import { strict as assert } from "node:assert";
import { afterEach, describe, test } from "node:test";

import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  adresaUrmarireCuriera,
  anuleazaExpediereaCuriera,
  cautaDupaReferintaCuriera,
  creeazaExpediereaCuriera,
  curieraGata,
  dataCuriera,
  etichetaCuriera,
  felulEroriiCuriera,
  istoricCuriera,
  motiveleCiornei,
  partenerCuriera,
  partenerDinRand,
  probaConexiuneCuriera,
  puncteCuriera,
  serviciiCuriera,
  stariCuriera,
  type CurieraConfig,
} from "./client";

/*
 * Raspunsurile de mai jos sunt COPIATE de pe contul de test Curiera, 29.09.2026. Fiecare apara
 * o purtare pe care documentatia nu o spune si pe care am vazut-o pe fir.
 */

const CONFIG: CurieraConfig = {
  enabled: true,
  api_key: "cheie-de-proba",
  expeditor: { nume: "Magazin", telefon: "0740000000", adresa: "Strada Florilor 10", oras: "Iasi", judet: "Iasi" },
};

type Cerere = { url: string; antete: Record<string, string>; corp: URLSearchParams };

const original = globalThis.fetch;
let cereri: Cerere[] = [];

function raspunde(...raspunsuri: Array<(c: Cerere) => Response>) {
  cereri = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const c: Cerere = {
      url: String(url),
      antete: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      corp: new URLSearchParams(String(init?.body ?? "")),
    };
    cereri.push(c);
    const f = raspunsuri[Math.min(i++, raspunsuri.length - 1)];
    return f(c);
  }) as typeof fetch;
}

const json = (v: unknown) => () => new Response(JSON.stringify(v), {
  status: 200, headers: { "content-type": "application/json;charset=UTF-8" },
});
const text = (t: string) => () => new Response(t, {
  status: 200, headers: { "content-type": "application/json;charset=UTF-8" },
});

afterEach(() => { globalThis.fetch = original; });

describe("configurarea", () => {
  test("gata doar cu cheie SI adresa de ridicare", () => {
    assert.ok(curieraGata(CONFIG));
    assert.ok(!curieraGata({ ...CONFIG, enabled: false }));
    assert.ok(!curieraGata({ ...CONFIG, api_key: " " }));
    assert.ok(!curieraGata(null));
  });

  test("⚠ fara oras sau telefon de ridicare NU e gata, desi cheia e buna", () => {
    /* Altfel fiecare emitere iese ciorna refuzata („Lipseste orasul expeditorului"). */
    assert.ok(!curieraGata({ ...CONFIG, expeditor: { ...CONFIG.expeditor, oras: "" } }));
    assert.ok(!curieraGata({ ...CONFIG, expeditor: { ...CONFIG.expeditor, telefon: "" } }));
    assert.ok(!curieraGata({ ...CONFIG, expeditor: undefined }));
  });

  test("adresa publica de urmarire poarta numarul, escapat", () => {
    assert.equal(
      adresaUrmarireCuriera(" 710915533 "),
      "https://app.curiera.ro/cscourier/Main?tracking=true&appcont=4416&awbno=710915533",
    );
    assert.ok(adresaUrmarireCuriera("1&x=2").endsWith("awbno=1%26x%3D2"));
  });
});

describe("cererea", () => {
  test("cheia pleaca in ANTET, nu in adresa si nu in corp; gazda e a Curiera", async () => {
    raspunde(json({ status: "done", data: { usercompany_name: "Curiera Transport Solutions SRL", account_name: "Curiera" } }));
    await serviciiCuriera(CONFIG, "main").catch(() => null);
    const c = cereri[0];
    assert.ok(c.url.startsWith("https://app.curiera.ro/cscourier/API/list_services"));
    assert.equal(c.antete.api_key, "cheie-de-proba");
    assert.ok(!c.url.includes("cheie-de-proba"));
    assert.equal(c.corp.get("api_key"), null);
  });

  test("⚠ BAD_LOGIN vine pe HTTP 200 si e refuz de AUTENTIFICARE", async () => {
    raspunde(json({ error: "BAD_LOGIN", message: "Something went wrong with logging in. No/bad api key?", status: "failed" }));
    const e = await probaConexiuneCuriera(CONFIG).then(() => null, (x) => x);
    assert.ok(e instanceof Error);
    assert.equal(felulEroriiCuriera(e), "autentificare");
    assert.equal(verdictFurnizor(e), "esuat");
    assert.match((e as Error).message, /cheia/);
  });

  test("fara cheie nu pleaca nicio cerere", async () => {
    raspunde(json({}));
    const e = await probaConexiuneCuriera({ api_key: "" }).then(() => null, (x) => x);
    assert.ok(e instanceof Error);
    assert.equal(cereri.length, 0);
  });
});

describe("proba de conexiune", () => {
  test("citeste firma, clientul, dreptul de anulare si serviciile", async () => {
    raspunde(
      json({ status: "done", data: { usercompany_name: "Curiera Transport Solutions SRL", account_name: "Curiera" } }),
      (c) => {
        const op = c.url.split("/").pop();
        if (op === "me") {
          return json({ status: "done", data: {
            client_name: "CLIENT TEST INOVEX.RO", client_id: 66711,
            permissions: { awbs: { cancel: { allowed: false }, cancel_uncollected: { allowed: true } } },
          } })();
        }
        if (c.corp.get("type") === "main") return json([{ name: "Standard", value: "standard" }, { name: "LOCKERE", value: "lockere" }])();
        return json([{ name: "Deschidere colet la livrare", description: "", id: "443" }])();
      },
    );
    const r = await probaConexiuneCuriera(CONFIG);
    assert.equal(r.firma, "Curiera Transport Solutions SRL");
    assert.equal(r.client, "CLIENT TEST INOVEX.RO");
    assert.equal(r.cheieDeClient, true);
    assert.equal(r.anulare, "pana_la_ridicare");
    assert.deepEqual(r.servicii.map((s) => s.id), ["standard", "lockere"]);
    assert.deepEqual(r.extra, [{ id: "443", nume: "Deschidere colet la livrare" }]);
  });

  test("o cadere a lui `me` nu face proba rosie", async () => {
    raspunde(
      json({ status: "done", data: { usercompany_name: "Curiera Transport Solutions SRL", account_name: "Curiera" } }),
      text(""),
    );
    const r = await probaConexiuneCuriera(CONFIG);
    assert.equal(r.firma, "Curiera Transport Solutions SRL");
    assert.equal(r.anulare, "necunoscut");
    assert.deepEqual(r.servicii, []);
  });
});

describe("listele fara plic", () => {
  test("list_delivery_locations intoarce o LISTA BRUTA, si se citeste ca atare", async () => {
    raspunde(json([{ id: "16478", type: "locker" }]));
    const p = await puncteCuriera(CONFIG);
    assert.equal(p.length, 1);
    assert.equal(cereri[0].corp.get("country"), "RO");
  });

  test("un corp gol la o lista e eroare, nu „zero puncte”", async () => {
    raspunde(text(""));
    await assert.rejects(puncteCuriera(CONFIG));
  });
});

describe("emiterea", () => {
  test("numarul se ia din data.no, cu pretul si grupul", async () => {
    raspunde(json({ status: "done", message: "AWB was created", data: {
      no: "710915558", status: "neridicat", errors: "", price: 0.0, price_with_vat: 0.0,
      all_numbers: ["710915558", "710915558/1"],
    } }));
    const r = await creeazaExpediereaCuriera(CONFIG, { weight: "1" });
    assert.equal(r.awb, "710915558");
    assert.equal(r.stare, "neridicat");
    assert.deepEqual(r.numere, ["710915558", "710915558/1"]);
    assert.equal(cereri[0].corp.get("weight"), "1");
  });

  test("⚠⚠ „AWB was created” cu `errors` e REFUZ, iar ciorna se anuleaza", async () => {
    raspunde(
      json({ status: "done", message: "AWB was created", data: {
        no: "710915565", status: "initial",
        errors: "Serviciul este incorect:nuexista\nLipseste orasul expeditorului\nTelefonul destinatarului este obligatoriu",
      } }),
      json({ status: "done", message: "Status changed", data: { no: "710915565", status: "anulat" } }),
    );
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.ok(e instanceof Error);
    assert.equal(verdictFurnizor(e), "esuat", "nimic nu pleaca, deci reincercarea e libera");
    assert.match((e as Error).message, /Lipseste orasul expeditorului/);
    assert.equal(cereri.length, 2);
    assert.ok(cereri[1].url.endsWith("/change_status"));
    assert.equal(cereri[1].corp.get("status"), "anulat");
    assert.equal(cereri[1].corp.get("awbno"), "710915565");
  });

  test("ciorna care nu se poate anula ramane refuz, dar mesajul o spune", async () => {
    raspunde(
      json({ status: "done", data: { no: "710915565", status: "initial", errors: "Serviciul este incorect:x" } }),
      text("forbidden"),
    );
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "esuat");
    assert.match((e as Error).message, /Ciorna 710915565 a ramas/);
  });

  test("⚠⚠ motive langa o expediere care NU e ciorna: nu stim, si nu se atinge nimic", async () => {
    /* Luata drept refuz, slotul s-ar elibera, iar reemiterea ar face al doilea colet viu. */
    raspunde(json({ status: "done", data: { no: "8", status: "neridicat", errors: "Adresa incompleta" } }));
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "necunoscut");
    assert.match((e as Error).message, /Verifica expedierea in contul Curiera/);
    assert.equal(cereri.length, 1, "o expediere vie nu se anuleaza pe ascuns");
  });

  test("⚠ starea `initial` fara motive NU e refuz (cont setat sa porneasca in ciorna)", async () => {
    raspunde(json({ status: "done", data: { no: "7", status: "initial", errors: "" } }));
    const r = await creeazaExpediereaCuriera(CONFIG, {});
    assert.equal(r.awb, "7");
    assert.equal(cereri.length, 1);
  });

  test("refuzul din plic e refuz dovedit", async () => {
    raspunde(json({ error: "NOT_FOUND", message: "No valid delivery location was found with that id", status: "failed" }));
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "esuat");
    assert.match((e as Error).message, /No valid delivery location/);
  });

  test("⚠ un corp gol la emitere e NECUNOSCUT, nu refuz", async () => {
    raspunde(text(""));
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "necunoscut");
  });

  test("⚠ „done” fara numar e NECUNOSCUT", async () => {
    raspunde(json({ status: "done", data: { status: "neridicat" } }));
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "necunoscut");
  });

  test("⚠ termenul depasit la emitere e NECUNOSCUT", async () => {
    globalThis.fetch = (async () => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    }) as typeof fetch;
    const e = await creeazaExpediereaCuriera(CONFIG, {}).then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "necunoscut");
    assert.equal(felulEroriiCuriera(e), "indisponibil");
  });

  test("motivele ciornei se despart pe randuri", () => {
    assert.deepEqual(motiveleCiornei("a\nb\r\n\n c "), ["a", "b", "c"]);
    assert.deepEqual(motiveleCiornei(""), []);
    assert.deepEqual(motiveleCiornei(null), []);
  });
});

describe("transportatorul partener", () => {
  /*
   * Forma masurata pe 29.09.2026 pe primul AWB REAL (un magazin care lucreaza cu DPD prin Curiera):
   * `get_info` → `{ no, status, info: { ...98 de campuri } }`, cu `franchisor_type: "DPD"` si
   * `franchisor_no: "81376952082"`. Pe contul de test campurile exista, dar goale.
   */
  test("numarul DPD se citeste din `info` al lui get_info", async () => {
    raspunde(json({ status: "done", data: { no: "710918525", status: "neridicat", info: {
      franchisor_type: "DPD", franchisor_no: "81376952082", franchisor_no_canon: "1000813769520829140009073018",
    } } }));
    assert.deepEqual(await partenerCuriera(CONFIG, " 710918525 "), { nume: "DPD", awb: "81376952082" });
    assert.ok(cereri[0].url.endsWith("/get_info"));
    assert.equal(cereri[0].corp.get("awbno"), "710918525");
  });

  test("fara numar la partener nu exista partener, chiar daca tipul e scris (contul de test)", () => {
    assert.equal(partenerDinRand({ franchisor_type: "fan", franchisor_no: "" }), null);
    assert.equal(partenerDinRand(null), null);
    assert.equal(partenerDinRand("text"), null);
  });

  test("numele partenerului: cele cunoscute frumos, restul cum vine, nimic ghicit", () => {
    assert.equal(partenerDinRand({ franchisor_type: "fan", franchisor_no: "123" })?.nume, "FAN Courier");
    assert.equal(partenerDinRand({ franchisor_type: "Nemo Express", franchisor_no: "9" })?.nume, "Nemo Express");
    assert.equal(partenerDinRand({ franchisor_type: "", franchisor_no: "9" })?.nume, "partener");
    assert.equal(partenerDinRand({ franchisor_type: "constructor", franchisor_no: "9" })?.nume, "constructor");
  });

  test("emiterea il ia din acelasi rand, cand vine deja", async () => {
    raspunde(json({ status: "done", message: "AWB was created", data: {
      no: "710918525", status: "neridicat", errors: "", franchisor_type: "DPD", franchisor_no: "81376952082",
    } }));
    const r = await creeazaExpediereaCuriera(CONFIG, {});
    assert.deepEqual(r.partener, { nume: "DPD", awb: "81376952082" });
  });
});

describe("cautarea dupa referinta", () => {
  test("data pleaca in forma lor, iar anulatele si membrii grupului nu conteaza", async () => {
    /* ⚠ Lista BRUTA, fara plic (masurat): citita ca plic, cautarea iesea „necitibil”. */
    raspunde(json([
      { no: "710915558/2", status: "neridicat", customer_reference: "EDN-AB12-7" },
      { no: "710915558", status: "anulat", customer_reference: "EDN-AB12-7" },
      { no: "710915600", status: "neridicat", customer_reference: "EDN-AB12-7", errors: "" },
      { no: "710915601", status: "neridicat", customer_reference: "EDN-XXXX-7" },
      /* ⚠⚠ Ciorna REFUZATA (forma masurata, EDN-TEST-ERR1): nu va fi ridicata, deci nu e dovada. */
      { no: "710915565", status: "initial", customer_reference: "EDN-AB12-7", errors: "Serviciul este incorect:nuexista\nLipseste orasul expeditorului" },
      /* Ciorna FARA motive ramane: e a unui cont care porneste expedierile in ciorna. */
      { no: "710915700", status: "initial", customer_reference: "EDN-AB12-7", errors: "" },
    ]));
    const r = await cautaDupaReferintaCuriera(CONFIG, "EDN-AB12-7", new Date("2026-09-29T21:30:00Z"));
    assert.deepEqual(r, [{ awb: "710915600", stare: "neridicat" }, { awb: "710915700", stare: "initial" }]);
    /* 21:30 UTC e deja 30 septembrie la Bucuresti. */
    assert.equal(cereri[0].corp.get("from_date"), "30-09-2026");
  });

  test("dataCuriera e dd-MM-yyyy", () => {
    assert.equal(dataCuriera(new Date("2026-01-05T10:00:00Z")), "05-01-2026");
  });
});

describe("starea", () => {
  test("⚠ lotul merge pe get_status cu awbnos, nu pe get_statuses", async () => {
    raspunde(json({ status: "done", message: "", data: [
      { date: 1790667221, no: "710915533", code: "", request_no: "710915533", location: "", code_name: "", status: "neridicat" },
      { date: 0, no: "", code: "", request_no: "999999999", location: "", code_name: "", status: "" },
    ] }));
    const r = await stariCuriera(CONFIG, ["710915533", " 999999999 "]);
    assert.ok(cereri[0].url.endsWith("/get_status"));
    assert.equal(cereri[0].corp.get("awbnos"), "710915533,999999999");
    assert.equal(r[0].status, "neridicat");
    assert.equal(r[0].data, 1790667221);
    /* ⚠ Necunoscutul vine „done", cu campuri goale: numarul gol il deosebeste. */
    assert.equal(r[1].cerut, "999999999");
    assert.equal(r[1].no, "");
    assert.equal(r[1].data, null);
  });

  test("cu un singur numar, `data` vine obiect si se citeste la fel", async () => {
    raspunde(json({ status: "done", data: { date: 5, no: "1", request_no: "1", status: "livrat", code: "Succes", code_name: "Succes" } }));
    const r = await stariCuriera(CONFIG, ["1"]);
    assert.equal(r.length, 1);
    assert.equal(r[0].cod, "Succes");
  });

  test("corp gol la stari e eroare, nu „nicio stare”", async () => {
    raspunde(text(""));
    await assert.rejects(stariCuriera(CONFIG, ["1"]));
  });

  test("fara numere nu pleaca nicio cerere", async () => {
    raspunde(json({}));
    assert.deepEqual(await stariCuriera(CONFIG, []), []);
    assert.equal(cereri.length, 0);
  });

  test("istoricul se citeste din data.history", async () => {
    raspunde(json({ status: "done", data: { no: "1", status: "anulat", history: [
      { date: 1, event_date: 1, description: "Datele expedierii au intrat in sistem", eventType: "ShipmentCreated", status: "", code: "" },
      { date: 3, event_date: 3, description: "Expedierea a fost anulata", eventType: "StatusChanged:anulat", status: "anulat", code: "" },
    ] } }));
    const r = await istoricCuriera(CONFIG, "1");
    assert.equal(r.length, 2);
    assert.equal(r[1].tip, "StatusChanged:anulat");
    assert.equal(r[1].data, 3);
  });
});

describe("anularea", () => {
  test("reusita vine in plic", async () => {
    raspunde(json({ data: { no: "1", status: "anulat" }, message: "Awb canceled", status: "done" }));
    assert.deepEqual(await anuleazaExpediereaCuriera(CONFIG, "1"), { fel: "anulat" });
  });

  test("⚠ „forbidden” pe un AWB deja anulat e reusita, nu eroare", async () => {
    raspunde(text("forbidden"), json({ status: "done", data: { no: "1", request_no: "1", status: "anulat", date: 2 } }));
    assert.deepEqual(await anuleazaExpediereaCuriera(CONFIG, "1"), { fel: "deja_anulat" });
    assert.ok(cereri[1].url.endsWith("/get_status"));
  });

  test("„forbidden” pe un AWB necunoscut e `negasit`", async () => {
    raspunde(text("forbidden"), json({ status: "done", data: { no: "", request_no: "9", status: "", date: 0 } }));
    assert.deepEqual(await anuleazaExpediereaCuriera(CONFIG, "9"), { fel: "negasit" });
  });

  test("„forbidden” pe o ciorna se rezolva cu change_status anulat", async () => {
    raspunde(
      text("forbidden"),
      json({ status: "done", data: { no: "5", request_no: "5", status: "initial", date: 2 } }),
      json({ status: "done", data: { no: "5", status: "anulat" }, message: "Status changed" }),
    );
    assert.deepEqual(await anuleazaExpediereaCuriera(CONFIG, "5"), { fel: "anulat" });
    assert.equal(cereri[2].corp.get("status"), "anulat");
  });

  test("⚠ „forbidden” urmat de o citire PICATA e „nu stim”, nu refuz", async () => {
    /* Luata drept refuz, dezlegarea ar fi scos de pe comanda un AWB despre care nu stim nimic. */
    raspunde(text("forbidden"), text(""));
    const e = await anuleazaExpediereaCuriera(CONFIG, "5").then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "necunoscut");
  });

  test("„forbidden” pe un colet ridicat e refuz, cu starea lor", async () => {
    raspunde(text("forbidden"), json({ status: "done", data: { no: "5", request_no: "5", status: "in_curs", date: 2 } }));
    assert.deepEqual(await anuleazaExpediereaCuriera(CONFIG, "5"), { fel: "refuzat", stare: "in_curs" });
  });

  test("⚠ un text necunoscut la anulare e NECUNOSCUT", async () => {
    raspunde(text("<html>eroare</html>"));
    const e = await anuleazaExpediereaCuriera(CONFIG, "5").then(() => null, (x) => x);
    assert.equal(verdictFurnizor(e), "necunoscut");
  });
});

describe("eticheta", () => {
  test("PDF-ul se recunoaste dupa octeti", async () => {
    raspunde(() => new Response("%PDF-1.4 ...", { status: 200, headers: { "content-type": "application/pdf" } }));
    const b = await etichetaCuriera(CONFIG, "1", "a4");
    assert.equal(b.subarray(0, 5).toString(), "%PDF-");
    assert.equal(cereri[0].corp.get("type"), "pdf");
    assert.equal(cereri[0].corp.get("format"), "a4");
  });

  test("⚠ „Shipment is canceled” cu antet JSON NU e o eticheta", async () => {
    raspunde(text("Shipment is canceled:710915533"));
    await assert.rejects(etichetaCuriera(CONFIG, "710915533"), /anulat/);
  });

  test("⚠ „Not found” cu antet JSON NU e o eticheta", async () => {
    raspunde(text("Not found:999999999"));
    await assert.rejects(etichetaCuriera(CONFIG, "999999999"), /nu exista/);
  });
});
