import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { valoriGa4, verdictTrimitere, sesiuneaPentru } from "./comanda-ga4";
import { corpGa4, trimiteGa4, MP_CAPAT } from "./mp";
import { hasAnalyticsScope, obtineTokenul } from "./oauth";
import { fluxulMagazinului, totalTimpReal, type GaDataStream } from "./client";
import { raporteazaCumparareaGa4, raporteazaRambursareaGa4 } from "../orders/ga4-comanda";
import { getAttribution } from "../storefront/attribution";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * GOOGLE ANALYTICS 4: CONFORM DOCUMENTATIEI                  (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA, inainte de a deschide codul: 4 magazine cu GA4 (3 conectate, unul blocat la
 * alegerea proprietatii), UN SINGUR magazin cu trimitere de pe server (`api_secret`): 164 de comenzi
 * in 90 de zile, dintre care 152 din eMAG si Trendyol, deci 12 de vitrina, 3 cu `ga_client_id`.
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 * 1. `refund` pleca la orice anulare, si pentru comenzi a caror achizitie nu plecase NICIODATA (card
 *    neplatit, marketplace, comanda de mana). Dupa legarea GA: 60 de comenzi de marketplace si 4 cu
 *    cardul neplatite trecute pe anulat/rambursat.
 * 2. Achizitia pleca de pe server si pentru cine REFUZASE analiza, cu un `client_id` inventat. Iar un
 *    `_ga` prezent nu dovedea acordul: pe `edinio.com/<magazin>` il scrie si tag-ul platformei.
 * 3. `value` purta transportul; documentatia: „Don't include shipping or tax”.
 * 4. Fara `session_id`: achizitia de pe server (adesea SINGURA, la plata cu cardul) nu avea sesiune.
 * 5. Raspunsul Measurement Protocol nu se citea; parametrii peste 100 de caractere se pierdeau tacut.
 * 6. `api_secret` nu se verifica, iar Google raspunde 2xx si la unul gresit.
 * 7. Callback-ul OAuth nu verifica dreptul acordat, pe un ecran de permisiuni GRANULARE.
 * 8. Totalul in timp real aduna doar primele 10 tari.
 * 9. Apelurile de pe server erau `void`: pe serverless pot fi inghetate inainte sa plece.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

type Rand = Record<string, unknown>;
type Filtru = [string, unknown];

/** Baza falsa: filtreaza pe `eq`, iar `maybeSingle` intoarce primul rand potrivit. */
function bazaFalsa(init: Partial<Record<string, Rand[]>>) {
  const tabele: Record<string, Rand[]> = {
    orders: [...(init.orders ?? [])],
    store_settings: [...(init.store_settings ?? [])],
    ga4_comenzi_raportate: [...(init.ga4_comenzi_raportate ?? [])],
  };
  const potriveste = (f: Filtru[]) => (r: Rand) => f.every(([c, v]) => r[c] === v);
  const admin = {
    from(tabel: string) {
      const randuri = (tabele[tabel] ??= []);
      return {
        select() {
          const f: Filtru[] = [];
          const lant = {
            eq(c: string, v: unknown) { f.push([c, v]); return lant; },
            maybeSingle: async () => ({ data: randuri.find(potriveste(f)) ?? null, error: null }),
          };
          return lant;
        },
        upsert: async (rand: Rand) => {
          const i = randuri.findIndex((r) => r.order_id === rand.order_id);
          if (i >= 0) randuri[i] = { ...randuri[i], ...rand }; else randuri.push({ ...rand });
          return { error: null };
        },
        update(patch: Rand) {
          const f: Filtru[] = [];
          const lant = {
            eq(c: string, v: unknown) {
              f.push([c, v]);
              for (const r of randuri.filter(potriveste(f))) Object.assign(r, patch);
              return Promise.resolve({ error: null });
            },
          };
          return lant;
        },
      };
    },
  };
  return { admin: admin as never, tabele };
}

async function cuFetch<T>(raspuns: (url: string, init?: RequestInit) => Response, fn: (cereri: { url: string; corp: unknown }[]) => Promise<T>): Promise<T> {
  const vechi = globalThis.fetch;
  const cereri: { url: string; corp: unknown }[] = [];
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    let corp: unknown = init?.body;
    try { corp = JSON.parse(String(init?.body)); } catch { /* formular */ }
    cereri.push({ url, corp });
    return raspuns(url, init);
  }) as typeof fetch;
  try { return await fn(cereri); } finally { globalThis.fetch = vechi; }
}

const MAGAZIN = "biz-1";
const CFG = { connected: true, measurement_id: "G-ABC123", api_secret: "secret-bun", tracking_enabled: true };
const comanda = (extra: Rand = {}): Rand => ({
  id: "ord-1", business_id: MAGAZIN, total: 110, shipping_cost: 15, cod_fee_amount: 5, vat_amount: 15.2,
  prices_include_vat: true, payment_method: "cash_on_delivery",
  items: [{ product_id: "p-1", name: "Hrana caini 10 kg", price: 90, quantity: 1 }],
  order_source: { consimtamant_citit: "da", consimtamant_analiza: "da", consimtamant_marketing: "nu", ga_client_id: "123.456" },
  ...extra,
});

describe("Cat: `value` fara transport si fara taxe", () => {
  test("⚠⚠ transportul si taxa de ramburs ies din `value` si intra la `shipping`", () => {
    const v = valoriGa4({ total: 110, shipping_cost: 15, cod_fee_amount: 5, vat_amount: 15.2, prices_include_vat: true });
    assert.equal(v.value, 90, "transportul sau taxa de ramburs au ramas in venitul GA4");
    assert.equal(v.shipping, 20);
    assert.equal(v.tax, 15.2, "TVA-ul nu mai pleaca separat");
  });

  test("⚠ la preturi FARA TVA, TVA-ul adaugat peste total iese si el din `value`", () => {
    const v = valoriGa4({ total: 134, shipping_cost: 15, vat_amount: 19, prices_include_vat: false });
    assert.equal(v.value, 100);
  });

  test("⚠ la preturi CU TVA, TVA-ul ramane in pretul articolelor (asa cere „suma pret x cantitate”)", () => {
    const v = valoriGa4({ total: 119, shipping_cost: 0, vat_amount: 19, prices_include_vat: true });
    assert.equal(v.value, 119);
  });

  test("valori lipsa sau stricate nu dau NaN si nici venit negativ", () => {
    assert.deepEqual(valoriGa4({ total: null }), { value: 0, shipping: 0, tax: 0 });
    assert.equal(valoriGa4({ total: 5, shipping_cost: 20 }).value, 0);
    assert.equal(valoriGa4({ total: "110.5", shipping_cost: "10.25" }).value, 100.25);
  });
});

describe("Cui: acordul dat MAGAZINULUI", () => {
  test("⚠⚠ cine a REFUZAT analiza nu pleaca de pe server, chiar daca are `_ga`", () => {
    const v = verdictTrimitere({ consimtamant_citit: "da", consimtamant_analiza: "nu", ga_client_id: "1.2" }, true);
    assert.equal(v.trimite, false, "achizitia a plecat pentru un om care a refuzat analiza");
  });

  test("⚠ acord de analiza fara marketing: pleaca, cu datele de reclama REFUZATE", () => {
    const v = verdictTrimitere({ consimtamant_citit: "da", consimtamant_analiza: "da", consimtamant_marketing: "nu" }, true);
    assert.deepEqual(v, { trimite: true, consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" } });
  });

  test("acord pentru amandoua: datele de reclama ACORDATE", () => {
    const v = verdictTrimitere({ consimtamant_citit: "da", consimtamant_analiza: "da", consimtamant_marketing: "da" }, true);
    assert.deepEqual(v, { trimite: true, consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" } });
  });

  test("⚠ magazin FARA banner: pleaca, cu totul acordat, ca tag-ul din browser", () => {
    const v = verdictTrimitere({ consimtamant_citit: "da", consimtamant_analiza: "nu" }, false);
    assert.deepEqual(v, { trimite: true, consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" } });
  });

  test("⚠ comanda veche fara `_ga` NU mai pleaca cu un id inventat", () => {
    assert.equal(verdictTrimitere({}, true).trimite, false);
    assert.equal(verdictTrimitere(null, true).trimite, false);
    const cuGa = verdictTrimitere({ ga_client_id: "1.2" }, true);
    assert.equal(cuGa.trimite, true);
    assert.ok(cuGa.trimite && cuGa.consent === undefined, "la o comanda veche, `consent` se lasa pe seama vizitei");
  });
});

describe("In ce sesiune", () => {
  const sesiuni = "PLATFORMA1=GS2.1.s1700000000$o3$g1;ABC123=GS1.1.1758100000.4.1.1758100300.0.0.0";

  test("⚠⚠ se alege sesiunea FLUXULUI magazinului, nu a platformei", () => {
    assert.equal(sesiuneaPentru(sesiuni, "G-ABC123"), "GS1.1.1758100000.4.1.1758100300.0.0.0");
    assert.equal(sesiuneaPentru(sesiuni, "g-abc123"), "GS1.1.1758100000.4.1.1758100300.0.0.0");
  });

  test("valoarea INTREAGA, si forma noua `GS2` la fel", () => {
    assert.equal(sesiuneaPentru(sesiuni, "PLATFORMA1"), "GS2.1.s1700000000$o3$g1");
  });

  test("fara potrivire sau cu forma necunoscuta: fara sesiune, nu una inventata", () => {
    assert.equal(sesiuneaPentru(sesiuni, "G-ALTUL"), undefined);
    assert.equal(sesiuneaPentru("ABC123=nu-e-sesiune", "G-ABC123"), undefined);
    assert.equal(sesiuneaPentru(undefined, "G-ABC123"), undefined);
    assert.equal(sesiuneaPentru(sesiuni, ""), undefined);
  });
});

describe("Corpul Measurement Protocol", () => {
  const baza = { transactionId: "ord-1", value: 90, shipping: 20, tax: 15.2, items: [{ item_id: "p-1", item_name: "Hrana", price: 90, quantity: 1 }] };

  test("⚠ capatul din UE", () => {
    assert.equal(MP_CAPAT, "https://region1.google-analytics.com/mp/collect");
  });

  test("⚠⚠ achizitia poarta `session_id` si `engagement_time_msec` cand stim sesiunea", () => {
    const c = corpGa4("purchase", { ...baza, clientId: "1.2", sessionId: "GS1.1.9.1.1.9.0.0.0" }) as { events: { params: Rand }[] };
    assert.equal(c.events[0].params.session_id, "GS1.1.9.1.1.9.0.0.0");
    assert.equal(c.events[0].params.engagement_time_msec, 1);
    assert.equal(c.events[0].params.value, 90);
    assert.equal(c.events[0].params.shipping, 20);
    assert.equal(c.events[0].params.tax, 15.2);
  });

  test("⚠ rambursarea NU poarta sesiune (sesiunea se leaga doar 24 de ore)", () => {
    const c = corpGa4("refund", { ...baza, sessionId: "GS1.1.9.1.1.9.0.0.0" }) as { events: { params: Rand }[] };
    assert.equal(c.events[0].params.session_id, undefined);
  });

  test("⚠⚠ nimic peste 100 de caractere: Google l-ar fi aruncat tacut", () => {
    const lung = "N".repeat(140);
    const c = corpGa4("purchase", { ...baza, items: [{ item_id: lung, item_name: lung, price: 1, quantity: 1 }] }) as { events: { params: { items: Rand[] } }[] };
    assert.equal((c.events[0].params.items[0].item_name as string).length, 100);
    assert.equal((c.events[0].params.items[0].item_id as string).length, 100);
  });

  test("`consent` se trimite cand il stim, si lipseste cand nu", () => {
    const cu = corpGa4("purchase", { ...baza, consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" } });
    assert.deepEqual(cu.consent, { ad_user_data: "DENIED", ad_personalization: "DENIED" });
    assert.equal(corpGa4("purchase", baza).consent, undefined);
  });

  test("`client_id` real cand exista; altfel unul valid ca forma", () => {
    assert.equal(corpGa4("purchase", { ...baza, clientId: "123.456" }).client_id, "123.456");
    assert.match(String(corpGa4("refund", baza).client_id), /^\d+\.\d+$/);
  });

  test("⚠ raspunsul se CITESTE: un non-2xx iese ca atare, iar reteaua cazuta nu arunca", async () => {
    const respins = await cuFetch(() => new Response("", { status: 400 }), () => trimiteGa4({ measurementId: "G-X", apiSecret: "s" }, {}));
    assert.deepEqual(respins, { ok: false, status: 400 });
    const vechi = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("retea"); }) as typeof fetch;
    try { assert.deepEqual(await trimiteGa4({ measurementId: "G-X", apiSecret: "s" }, {}), { ok: false, status: 0 }); }
    finally { globalThis.fetch = vechi; }
  });
});

describe("Achizitia de pe server: regulile, chemate pe o baza falsa", () => {
  const magazin = (cfg: Rand = CFG, banner: Rand = { enabled: true }) => ({ business_id: MAGAZIN, google_analytics_config: cfg, cookie_banner_config: banner });

  test("⚠⚠ trimisa: pleaca o data, cu valorile GA4, si lasa URMA achizitiei", async () => {
    const { admin, tabele } = bazaFalsa({ orders: [comanda()], store_settings: [magazin()] });
    const r = await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      const rez = await raporteazaCumparareaGa4("ord-1", admin);
      assert.equal(cereri.length, 1);
      assert.ok(cereri[0].url.startsWith(MP_CAPAT));
      const p = (cereri[0].corp as { events: { params: Rand }[] }).events[0].params;
      assert.equal(p.value, 90, "serverul a trimis altceva decat valoarea produselor");
      return rez;
    });
    assert.equal(r, "trimisa");
    assert.ok(tabele.ga4_comenzi_raportate[0]?.cumparare_la, "urma achizitiei nu s-a scris");
  });

  test("⚠⚠ cine a refuzat analiza: nicio cerere, nicio urma", async () => {
    const { admin, tabele } = bazaFalsa({
      orders: [comanda({ order_source: { consimtamant_citit: "da", consimtamant_analiza: "nu", ga_client_id: "1.2" } })],
      store_settings: [magazin()],
    });
    const r = await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      const rez = await raporteazaCumparareaGa4("ord-1", admin);
      assert.equal(cereri.length, 0, "a plecat o cerere catre Google pentru cine a refuzat");
      return rez;
    });
    assert.equal(r, "fara-acord");
    assert.equal(tabele.ga4_comenzi_raportate.length, 0);
  });

  test("⚠ oprirea urmaririi din panou opreste si serverul", async () => {
    const { admin } = bazaFalsa({ orders: [comanda()], store_settings: [magazin({ ...CFG, tracking_enabled: false })] });
    const r = await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      const rez = await raporteazaCumparareaGa4("ord-1", admin);
      assert.equal(cereri.length, 0);
      return rez;
    });
    assert.equal(r, "urmarire-oprita");
  });

  test("⚠ refuzata de Google: FARA urma, ca rambursarea sa nu plece dupa o achizitie neprimita", async () => {
    const { admin, tabele } = bazaFalsa({ orders: [comanda()], store_settings: [magazin()] });
    const r = await cuFetch(() => new Response("", { status: 400 }), () => raporteazaCumparareaGa4("ord-1", admin));
    assert.equal(r, "respinsa");
    assert.equal(tabele.ga4_comenzi_raportate.length, 0, "s-a scris urma unei achizitii pe care Google a refuzat-o");
  });

  test("a doua oara nu mai pleaca", async () => {
    const { admin } = bazaFalsa({
      orders: [comanda()], store_settings: [magazin()],
      ga4_comenzi_raportate: [{ order_id: "ord-1", business_id: MAGAZIN, cumparare_la: "2026-09-17T10:00:00Z" }],
    });
    const r = await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      const rez = await raporteazaCumparareaGa4("ord-1", admin);
      assert.equal(cereri.length, 0);
      return rez;
    });
    assert.equal(r, "deja-raportata");
  });

  test("fara secret sau fara ID de masurare: tacere, fara cerere", async () => {
    const { admin } = bazaFalsa({ orders: [comanda()], store_settings: [magazin({ connected: true, measurement_id: "G-ABC123" })] });
    assert.equal(await raporteazaCumparareaGa4("ord-1", admin), "fara-configurare");
  });

  test("⚠ sesiunea fluxului magazinului ajunge in cerere", async () => {
    const { admin } = bazaFalsa({
      orders: [comanda({ order_source: { consimtamant_citit: "da", consimtamant_analiza: "da", ga_client_id: "1.2", ga_sesiuni: "ABC123=GS1.1.77.1.1.77.0.0.0" } })],
      store_settings: [magazin()],
    });
    await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      await raporteazaCumparareaGa4("ord-1", admin);
      assert.equal((cereri[0].corp as { events: { params: Rand }[] }).events[0].params.session_id, "GS1.1.77.1.1.77.0.0.0");
    });
  });
});

describe("Rambursarea: NUMAI dupa o achizitie primita de Google", () => {
  const magazin = { business_id: MAGAZIN, google_analytics_config: CFG, cookie_banner_config: { enabled: true } };

  test("⚠⚠ fara urma achizitiei (card neplatit, marketplace, comanda de mana): NICIO rambursare", async () => {
    const { admin } = bazaFalsa({ orders: [comanda({ payment_method: "emag" })], store_settings: [magazin] });
    const r = await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      const rez = await raporteazaRambursareaGa4("ord-1", admin);
      assert.equal(cereri.length, 0, "a plecat o rambursare pentru o achizitie pe care GA n-a vazut-o");
      return rez;
    });
    assert.equal(r, "fara-achizitie");
  });

  test("cu achizitia primita: pleaca o data, cu aceleasi valori, si se tine minte", async () => {
    const { admin, tabele } = bazaFalsa({
      orders: [comanda()], store_settings: [magazin],
      ga4_comenzi_raportate: [{ order_id: "ord-1", business_id: MAGAZIN, cumparare_la: "2026-09-17T10:00:00Z", rambursare_la: null }],
    });
    await cuFetch(() => new Response(null, { status: 204 }), async (cereri) => {
      assert.equal(await raporteazaRambursareaGa4("ord-1", admin), "trimisa");
      const ev = (cereri[0].corp as { events: { name: string; params: Rand }[] }).events[0];
      assert.equal(ev.name, "refund");
      assert.equal(ev.params.value, 90, "rambursarea scade alta suma decat a intrat");
      assert.equal(await raporteazaRambursareaGa4("ord-1", admin), "deja-raportata");
      assert.equal(cereri.length, 1, "rambursarea a plecat de doua ori");
    });
    assert.ok(tabele.ga4_comenzi_raportate[0].rambursare_la);
  });
});

describe("Drumurile catre GA4 din comenzi", () => {
  const o = viu("src/lib/actions/order.actions.ts");

  test("⚠⚠ niciun `void` catre GA4: toate prin `dupaRaspuns`", () => {
    assert.ok(!/void raporteaza\w*Ga4/.test(o), "o raportare GA4 e inca pornita si uitata");
    assert.equal((o.match(/dupaRaspuns\(\(\) => raporteazaCumparareaGa4\(/g) ?? []).length, 3,
      "una dintre cele trei achizitii (placeOrder, placeCartOrder, marcarea de mana) nu trece prin `dupaRaspuns`");
    assert.match(o, /dupaRaspuns\(\(\) => raporteazaRambursareaGa4\(orderId\)/);
    assert.match(viu("src/lib/orders/finalizare-plata.ts"), /dupaRaspuns\(\(\) => raporteazaCumparareaDupaIncasare\(comanda\.id\)/);
  });

  test("⚠ checkout-ul are voie sa scrie acordul si sesiunile in comanda", () => {
    for (const cheie of ["ga_sesiuni", "consimtamant_citit", "consimtamant_analiza", "consimtamant_marketing"]) {
      assert.match(o, new RegExp(`"${cheie}"`), `lista alba a atribuirii nu lasa sa treaca ${cheie}`);
    }
  });

  test("⚠ browserul trimite aceleasi valori ca serverul", () => {
    const pagina = viu("src/app/(public)/[slug]/confirm/page.tsx");
    assert.match(pagina, /valoriGa4Comanda = valoriGa4\(order\)/);
    assert.match(pagina, /ga4=\{valoriGa4Comanda\}/);
    assert.match(pagina, /prices_include_vat/);
    const ev = viu("src/components/public/FbPurchaseEvent.tsx");
    assert.match(ev, /ga4 \? \{ value: ga4\.value, shipping: ga4\.shipping, tax: ga4\.tax \}/);
  });

  test("tabelul urmei exista in depozit si e pornit cu RLS", () => {
    const m = readdirSync("migrations").find((f) => f.includes("ga4-comenzi-raportate"));
    assert.ok(m, "migratia urmei lipseste");
    assert.match(readFileSync(`migrations/${m}`, "utf8"), /enable row level security/);
  });
});

describe("Acordul si sesiunile, citite la checkout", () => {
  function browser(o: { cookie: string; stocare: Record<string, string> }) {
    const g = globalThis as unknown as Record<string, unknown>;
    const s = { ...o.stocare };
    const ls = {
      getItem: (k: string) => (k in s ? s[k] : null),
      setItem: (k: string, v: string) => { s[k] = v; },
      removeItem: (k: string) => { delete s[k]; },
      key: (i: number) => Object.keys(s)[i] ?? null,
      get length() { return Object.keys(s).length; },
    };
    g.window = { location: new URL("https://www.edinio.com/okxi"), localStorage: ls };
    g.localStorage = ls;
    g.document = { referrer: "", cookie: o.cookie };
  }
  const acord = (analytics: boolean, marketing: boolean) => JSON.stringify({ necessary: true, analytics, marketing, v: 1, ts: 1 });
  const COOKIE = "_ga=GA1.1.123456.1758100000; _ga_ABC123=GS1.1.1758100000.4.1.1758100300.0.0.0; alt=1";

  test("⚠⚠ acordul se ia pentru MAGAZINUL acesta, nu pentru altul de pe aceeasi origine", () => {
    browser({ cookie: COOKIE, stocare: { edinio_cc_okxi: acord(true, false), "edinio_cc_alt-magazin": acord(false, false) } });
    const s = getAttribution("/okxi")!;
    assert.equal(s.consimtamant_citit, "da");
    assert.equal(s.consimtamant_analiza, "da");
    assert.equal(s.consimtamant_marketing, "nu");
    assert.equal(s.ga_client_id, "123456.1758100000");
    assert.equal(s.ga_sesiuni, "ABC123=GS1.1.1758100000.4.1.1758100300.0.0.0");
  });

  test("⚠⚠ cine a refuzat analiza la magazin: cookie-urile GA NU se iau (pot fi ale platformei)", () => {
    browser({ cookie: COOKIE, stocare: { edinio_cc_okxi: acord(false, true) } });
    const s = getAttribution("/okxi")!;
    assert.equal(s.consimtamant_analiza, "nu");
    assert.equal(s.ga_client_id, undefined, "s-a luat `_ga` de la cine a refuzat analiza");
    assert.equal(s.ga_sesiuni, undefined);
  });

  test("fara decizie salvata: acord „nu”, dar cookie-urile se iau (magazinul poate sa n-aiba banner)", () => {
    browser({ cookie: COOKIE, stocare: {} });
    const s = getAttribution("/okxi")!;
    assert.equal(s.consimtamant_citit, "da");
    assert.equal(s.consimtamant_analiza, "nu");
    assert.equal(s.ga_client_id, "123456.1758100000");
  });

  test("⚠ pe domeniu propriu (fara `basePath`) se ia decizia de pe origine, cea mai noua", () => {
    const vechi = JSON.stringify({ necessary: true, analytics: false, marketing: false, v: 1, ts: 1 });
    const nou = JSON.stringify({ necessary: true, analytics: true, marketing: true, v: 1, ts: 9 });
    browser({ cookie: COOKIE, stocare: { "edinio_cc_nume-vechi": vechi, edinio_cc_okxi: nou } });
    const s = getAttribution("")!;
    assert.equal(s.consimtamant_analiza, "da");
    assert.equal(s.consimtamant_marketing, "da");
  });
});

describe("OAuth: dreptul acordat, si motivul exact cand tokenul nu vine", () => {
  const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

  test("⚠⚠ dreptul se cauta ca drept INTREG, nu ca subsir", () => {
    assert.equal(hasAnalyticsScope(`openid ${SCOPE} email`), true);
    assert.equal(hasAnalyticsScope("openid email"), false);
    assert.equal(hasAnalyticsScope(`${SCOPE}.extra`), false);
    assert.equal(hasAnalyticsScope(undefined), false);
  });

  test("⚠⚠ callback-ul refuza tokenul fara drept INAINTE sa-l salveze", () => {
    const c = viu("src/app/api/google-analytics/oauth/callback/route.ts");
    const garda = c.indexOf('if (!hasAnalyticsScope(tok.scope)) return back(req, "ga=noscope");');
    assert.ok(garda > 0, "callback-ul nu verifica dreptul acordat");
    assert.ok(garda < c.indexOf('.from("store_settings").select("id, google_analytics_config")'), "tokenul se citeste/salveaza inainte de verificare");
  });

  test("⚠ `invalid_grant` = revocat; Google cazut = indisponibil; fara drept = fara-drept", async () => {
    const json = (corp: unknown, status = 200) => new Response(JSON.stringify(corp), { status, headers: { "content-type": "application/json" } });
    assert.deepEqual(await cuFetch(() => json({ error: "invalid_grant" }, 400), () => obtineTokenul("r1", { id: "c", secret: "s" })), { eroare: "revocat" });
    assert.deepEqual(await cuFetch(() => json({ error: "internal" }, 503), () => obtineTokenul("r2", { id: "c", secret: "s" })), { eroare: "indisponibil" });
    assert.deepEqual(await cuFetch(() => json({ access_token: "a", expires_in: 3600, scope: "openid email" }), () => obtineTokenul("r3", { id: "c", secret: "s" })), { eroare: "fara-drept" });
    assert.deepEqual(await cuFetch(() => json({ access_token: "a", expires_in: 3600, scope: SCOPE }), () => obtineTokenul("r4", { id: "c", secret: "s" })), { token: "a" });
  });
});

describe("Admin si Data API", () => {
  const flux = (id: string, uri: string): GaDataStream => ({
    name: `properties/1/dataStreams/${id}`, type: "WEB_DATA_STREAM", webStreamData: { measurementId: `G-${id}`, defaultUri: uri },
  });

  test("⚠⚠ fluxul magazinului de pe `edinio.com/<slug>`, nu primul flux al proprietatii", () => {
    const fluxuri = [flux("SITE", "https://firma-mea.ro"), flux("OKXI2", "https://www.edinio.com/okxi2"), flux("OKXI", "https://www.edinio.com/okxi")];
    assert.equal(fluxulMagazinului(fluxuri, { slug: "okxi" })?.name, "properties/1/dataStreams/OKXI");
    assert.equal(fluxulMagazinului(fluxuri, { customDomain: "firma-mea.ro", slug: "okxi" })?.name, "properties/1/dataStreams/SITE");
    assert.equal(fluxulMagazinului(fluxuri, { slug: "necunoscut" })?.name, "properties/1/dataStreams/SITE", "fara potrivire, primul flux");
    assert.equal(fluxulMagazinului([{ type: "ANDROID_APP_DATA_STREAM" }], { slug: "okxi" }), undefined);
  });

  test("⚠ totalul in timp real vine din agregarea lui Google, nu din primele 10 tari", () => {
    const tari = [{ users: 5 }, { users: 3 }];
    assert.equal(totalTimpReal({ totals: [{ metricValues: [{ value: "41" }] }] }, tari), 41);
    assert.equal(totalTimpReal({}, tari), 8, "fara agregare, rezerva e suma");
    assert.match(viu("src/lib/actions/google-analytics.actions.ts"), /metricAggregations: \["TOTAL"\]/);
  });

  test("⚠⚠ un secret care NU e al fluxului se refuza, inainte de salvare", () => {
    const a = viu("src/lib/actions/google-analytics.actions.ts");
    const i = a.indexOf("export async function setGaApiSecret(");
    const corp = a.slice(i, a.indexOf("export async function verificaGaApiSecret("));
    assert.match(corp, /if \(verificat === false\) \{\s*return \{\s*error:/);
    assert.ok(corp.indexOf("verificat === false") < corp.indexOf("saveConfig("), "secretul gresit se salveaza inainte de verificare");
  });

  test("⚠ alt flux ales: verificarea secretului facuta pe fluxul vechi se sterge", () => {
    assert.match(viu("src/lib/actions/google-analytics.actions.ts"),
      /api_secret_verificat_la: stream\?\.name === config\.stream_name \? config\.api_secret_verificat_la : undefined/);
    assert.match(viu("src/app/api/google-analytics/oauth/callback/route.ts"),
      /if \(stream\?\.name !== config\.stream_name\) config\.api_secret_verificat_la = undefined;/);
  });

  test("⚠ un secret se cauta printre ale fluxului dupa VALOARE", () => {
    const a = viu("src/lib/actions/google-analytics.actions.ts");
    assert.match(a, /res\.data\.secrete\.some\(\(x\) => x\.secretValue === secret\)/);
  });
});
