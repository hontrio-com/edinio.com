import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { continutTikTok, continutTikTokDinCos, continutTikTokComanda } from "./continut";
import { utilizatorulPentruTikTok, potrivireaPentruPixelTikTok, dateDinAdresaTikTok, sha256Hex } from "./date-client";
import { trimiteLaTikTok, intreabaDespreToken, ttclidValid, ttpValid } from "./capi";
import { citesteCerereaTikTok, curataProprietatile, evenimentTikTokDinBrowser } from "./eveniment-browser";
import { acordPentruTikTok, evenimentCumparareTikTok, raporteazaCumparareaTikTok, raporteazaCumparareaTikTokDupaIncasare } from "@/lib/orders/tiktok-comanda";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * TIKTOK PIXEL SI EVENTS API 2.0: CONFORM DOCUMENTATIEI            (18.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA: 4 magazine cu pixel TikTok, niciunul cu banner de cookie-uri. `suporti-numar` are
 * 245 de comenzi de vitrina in 90 de zile, 2 cu `ttclid`. Niciunul n-avea Events API.
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 *  1. Achizitia pleca de DOUA ori, sub doua nume care nu mai exista in lista lor: `PlaceAnOrder` si
 *     `CompletePayment`. Lista de azi („Supported Pixel events”, 18 evenimente web) are `Purchase`.
 *  2. `content_type` se trimitea INAUNTRUL fiecarui articol din `contents`, unde TikTok nu-l citeste;
 *     exemplul lor il pune langa eveniment. Si lipsea `content_ids`, cerut pentru Video Shopping Ads.
 *  3. ID-urile erau ale produsului si pentru produsele cu variante, ca la Meta inainte de 17.09.
 *  4. Lipseau `Search` si `AddPaymentInfo`, amandoua in lista lor de evenimente standard.
 *  5. Nu exista Events API: tot ce pierdea browserul nu ajungea la TikTok.
 *  6. Potrivirea avansata trimitea emailul si telefonul in CLAR din browser.
 */

const viu = (cale: string) => readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

type Apel = { url: string; init?: RequestInit; corp?: Record<string, unknown> };
function fetchFals(raspunde: (a: Apel) => { status: number; json: unknown }) {
  const apeluri: Apel[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const a: Apel = { url: String(url), init, corp: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    apeluri.push(a);
    const r = raspunde(a);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return apeluri;
}

const PID = "9fca598b-313b-471f-b365-738b02bef486";
const cuVariante = {
  variants: {
    enabled: true,
    options: [{ id: "o1", name: "Culoare", values: ["Gri", "Rosu"] }],
    combinations: [
      { id: "gri", title: "Gri", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
      { id: "rosu-vechi", title: "Rosu", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
    ],
  },
};

// ── 1. Continutul: felul langa eveniment, ID-urile din catalog ────────────────────
describe("continutul evenimentelor", () => {
  test("⚠ `content_type` sta LANGA eveniment, iar `content_ids` pleaca si el", () => {
    const c = continutTikTok([{ productId: PID, comboId: "gri", areVariante: true, cantitate: 2, pret: 10.005, nume: "Husa" }]);
    assert.deepEqual(c.contents, [{ content_id: `${PID}-gri`, content_name: "Husa", price: 10.01, quantity: 2 }]);
    assert.deepEqual(c.content_ids, [`${PID}-gri`]);
    assert.equal(c.content_type, "product");
    assert.equal("content_type" in c.contents[0], false, "felul a ramas inauntrul articolului, unde nu se citeste");
  });

  test("produsul cu variante fara varianta aleasa e GRUP; amestecul pleaca fara fel", () => {
    assert.equal(continutTikTok([{ productId: PID, areVariante: true, cantitate: 1, pret: 5 }]).content_type, "product_group");
    assert.equal(continutTikTok([{ productId: "simplu", cantitate: 1, pret: 5 }]).content_type, "product");
    const amestec = continutTikTokDinCos([
      { productId: "simplu", quantity: 1, pret: 3 },
      { productId: PID, variantTitle: "Gri", quantity: 1, pret: 4 },
    ]);
    assert.equal("content_type" in amestec, false);
    assert.deepEqual(amestec.content_ids, ["simplu", PID]);
  });

  test("cantitatea e un intreg de cel putin 1, pretul rotunjit la bani", () => {
    const c = continutTikTok([{ productId: "a", cantitate: 2.7, pret: 10.005 }, { productId: "b", cantitate: 0, pret: 1 }]);
    assert.deepEqual(c.contents.map((x) => x.quantity), [2, 1]);
    assert.equal(c.contents[0].price, 10.01);
  });

  test("⚠ produsul cu variante a carui combinatie nu se mai gaseste pleaca drept GRUP", () => {
    const c = continutTikTokComanda(
      [{ product_id: PID, name: "Husa (o marime stearsa)", quantity: 1, price: 90 }],
      new Map<string, unknown>([[PID, cuVariante]]),
    );
    assert.deepEqual(c.content_ids, [PID]);
    assert.equal(c.content_type, "product_group", "ID-ul produsului a plecat ca articol, nu ca grup");
  });

  test("⚠ comanda: ID-ul variantei, citit din `variant_title` sau din numele liniei", () => {
    const c = continutTikTokComanda([
      { product_id: PID, name: "Husa (Rosu)", quantity: 1, price: 90 },
      { product_id: "simplu", name: "Cana", quantity: 2, price: 5 },
    ], new Map<string, unknown>([[PID, cuVariante], ["simplu", {}]]));
    assert.deepEqual(c.content_ids, [`${PID}-rosu-vechi`, "simplu"]);
    assert.equal(c.content_type, "product");
    assert.equal(c.contents[0].content_name, "Husa (Rosu)");
  });
});

// ── 2. Datele omului, dupa „user parameters” ──────────────────────────────────────
describe("normalizarea si hash-ul, pe exemplele din documentatia TikTok", () => {
  test("⚠ emailul, telefonul E.164 CU `+` si codul postal: exact hash-urile din exemple", () => {
    assert.equal(
      utilizatorulPentruTikTok({ email: " ALICE_abc@gmail.com " }).email,
      "848a771458438fc2ec420560d769fb9b9b86851ee338ec56517baabd79d3bb4f",
    );
    assert.equal(
      utilizatorulPentruTikTok({ telefon: "(+1)2133734253", tara: "US" }).phone,
      "9f7ec22d72092cd3c0b58726ed9c2d91b92e51a3f29837508fb2948bb22dd2fd",
      "telefonul a fost hash-uit fara `+`, ca la Meta",
    );
    assert.equal(
      utilizatorulPentruTikTok({ nume: "Jane Popescu" }).first_name,
      "81f8f6dde88365f3928796ec7aa53f72820b06db8664f5fe76a7eb13e24546a2",
    );
    assert.equal(
      utilizatorulPentruTikTok({ codPostal: "95110" }).zip_code,
      "383f7fffd99f3b1c3066086bcf991eae7ad543589d12bd792ecb6dc8b5acebc1",
    );
    assert.equal(
      utilizatorulPentruTikTok({ codPostal: "M5V 3L9" }).zip_code,
      "5c850751d57c5d887fe7807d3da801efe7e8faa1f105ea36cdcd913dd32a41c7",
      "codul postal cu spatiu n-a fost normalizat inainte de hash",
    );
  });

  test("⚠ orasul, judetul si tara NU se hash-uiesc (spre deosebire de Meta), codul postal DA", () => {
    const u = utilizatorulPentruTikTok({ oras: "Târgu Mureș", judet: "Mureș", codPostal: "540 001", telefon: "0722123456" });
    assert.equal(u.city, "targumures");
    assert.equal(u.state, "mures");
    assert.equal(u.country, "ro");
    assert.match(u.zip_code!, /^[0-9a-f]{64}$/);
    assert.equal(u.phone, sha256Hex("+40722123456"), "telefonul romanesc n-a plecat in E.164");
  });

  test("`identify` primeste doar email si telefon, hash-uite; fara ele, nimic", () => {
    const p = potrivireaPentruPixelTikTok({ email: "a@b.ro", telefon: "0722123456", oras: "Cluj" })!;
    assert.deepEqual(Object.keys(p).sort(), ["email", "phone_number"]);
    for (const v of Object.values(p)) assert.match(v!, /^[0-9a-f]{64}$/);
    assert.equal(potrivireaPentruPixelTikTok({ oras: "Cluj" }), null, "un `identify` doar cu orasul nu leaga pe nimeni");
    assert.equal(utilizatorulPentruTikTok({ email: "nu-e-email" }).email, undefined, "un text care nu e email a plecat hash-uit");
    assert.deepEqual(dateDinAdresaTikTok({ city: "Cluj", postalCode: "400001" }), { oras: "Cluj", judet: null, codPostal: "400001", tara: null });
  });
});

// ── 3. Trimiterea Events API ──────────────────────────────────────────────────────
describe("Events API: trimiterea si codurile", () => {
  const ev = { event: "Purchase", event_time: 1, event_id: "x", user: {}, page: { url: "https://m.ro/confirm" } };

  test("⚠ tokenul pleaca in ANTETUL `Access-Token`, forma e `event_source: web`, reusita e `code: 0`", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { code: 0, message: "OK" } }));
    assert.deepEqual(await trimiteLaTikTok({ pixelId: "D69ESQRC77U0KGAU8B90", token: "TTsecret" }, [ev]), { ok: true });
    assert.match(apeluri[0].url, /^https:\/\/business-api\.tiktok\.com\/open_api\/v\d+\.\d\/event\/track\/$/);
    assert.doesNotMatch(apeluri[0].url, /TTsecret/);
    assert.equal((apeluri[0].init?.headers as Record<string, string>)["Access-Token"], "TTsecret");
    assert.equal(apeluri[0].corp?.event_source, "web");
    assert.equal(apeluri[0].corp?.event_source_id, "D69ESQRC77U0KGAU8B90");
    assert.equal((apeluri[0].corp?.data as unknown[]).length, 1);
  });

  test("⚠ HTTP 200 cu `code` nenul NU e reusita; 40100 e trecator, 40105 e tokenul", async () => {
    fetchFals(() => ({ status: 200, json: { code: 40001, message: "No permission to operate pixel code" } }));
    const fara = await trimiteLaTikTok({ pixelId: "p", token: "t" }, [ev]);
    assert.equal(fara.ok, false);
    assert.equal(!fara.ok && fara.tokenInvalid, true);
    assert.equal(!fara.ok && fara.trecator, false);

    fetchFals(() => ({ status: 200, json: { code: 40100, message: "Requests made too frequently" } }));
    const limita = await trimiteLaTikTok({ pixelId: "p", token: "t" }, [ev]);
    assert.equal(!limita.ok && limita.trecator, true, "limitarea de rata a fost luata drept refuz definitiv");
    assert.equal(!limita.ok && limita.tokenInvalid, false);

    fetchFals(() => ({ status: 200, json: { code: 40105, message: "Invalid or incorrect access token" } }));
    const token = await trimiteLaTikTok({ pixelId: "p", token: "t" }, [ev]);
    assert.equal(!token.ok && token.tokenInvalid, true);
  });

  test("intrebarea despre token: doar 40105 inseamna sigur „rau”, restul e nesigur", async () => {
    fetchFals(() => ({ status: 200, json: { code: 0, data: {} } }));
    assert.equal((await intreabaDespreToken("t")).stare, "bun");
    fetchFals(() => ({ status: 200, json: { code: 40105, message: "Invalid or incorrect access token" } }));
    assert.equal((await intreabaDespreToken("t")).stare, "rau");
    fetchFals(() => ({ status: 200, json: { code: 40001, message: "No permission" } }));
    assert.equal((await intreabaDespreToken("t")).stare, "nesigur", "un token din Events Manager ar fi fost refuzat pe degeaba");
  });

  test("`ttclid` si `ttp` doar in forma lor; `ttclid` merge pana la 1000 de caractere", () => {
    assert.equal(ttclidValid("E.C.P.v3fQ2RHacdksKfofPmlyuStIIHJ4Af1tKYxF9zz2c2PLx1Oaw15oHpcfl5AH"), "E.C.P.v3fQ2RHacdksKfofPmlyuStIIHJ4Af1tKYxF9zz2c2PLx1Oaw15oHpcfl5AH");
    assert.equal(ttclidValid("x".repeat(1000))?.length, 1000);
    assert.equal(ttclidValid("x".repeat(1001)), undefined);
    assert.equal(ttclidValid("<script>"), undefined);
    assert.equal(ttpValid("Xy1_2-3.4"), "Xy1_2-3.4");
    assert.equal(ttpValid(""), undefined);
  });
});

// ── 4. Evenimentele primite din browser ───────────────────────────────────────────
describe("capatul de evenimente: ce primeste si ce trimite mai departe", () => {
  const baza = { magazin: "m", event_id: "abcdef12-3456", url: "https://m.ro/p" };

  test("⚠ `Purchase` NU se primeste din browser; nici un `event_id` fara forma", () => {
    assert.ok("refuz" in citesteCerereaTikTok({ ...baza, event: "Purchase" }));
    assert.ok("refuz" in citesteCerereaTikTok({ ...baza, event: "CompletePayment" }), "un nume scos din lista lor a trecut");
    assert.ok("refuz" in citesteCerereaTikTok({ ...baza, event: "ViewContent", event_id: "x y" }));
    assert.ok(!("refuz" in citesteCerereaTikTok({ ...baza, event: "AddToCart" })));
    /* ⚠ `page.url` e obligatoriu la evenimentele web, deci o cerere fara adresa nu se primeste. */
    assert.ok("refuz" in citesteCerereaTikTok({ magazin: "m", event_id: "abcdef12-3456", event: "AddToCart" }));
  });

  test("doar campurile din „properties parameters”, cu tipurile lor", () => {
    const d = curataProprietatile({
      value: 12.345, currency: "RON", content_type: "product_group", content_ids: ["a", 5, "x".repeat(101)],
      contents: [{ content_id: "a", quantity: 2, price: 4, content_name: "Cana" }, { content_id: 7 }],
      search_string: "ciorapi", email: "a@b.ro", altceva: 1,
    });
    assert.deepEqual(d, {
      value: 12.35, currency: "RON", content_type: "product_group", content_ids: ["a"],
      contents: [{ content_id: "a", quantity: 2, price: 4, content_name: "Cana" }], search_string: "ciorapi",
    });
    assert.equal(curataProprietatile({ currency: "EUR", value: 1 }).currency, undefined);
    /* Enumerarea lor are doar `product` si `product_group`; „hotel” si „flight” sunt pentru alte industrii. */
    assert.equal(curataProprietatile({ content_type: "hotel" }).content_type, undefined);
  });

  test("⚠ fara niciun semn despre om (ttclid, ttp, IP) nu se trimite nimic", () => {
    const cerere = citesteCerereaTikTok({ ...baza, event: "ViewContent", properties: { value: 5, currency: "RON" } });
    assert.ok(!("refuz" in cerere));
    const c = cerere as Exclude<typeof cerere, { refuz: string }>;
    const gol = evenimentTikTokDinBrowser(c, { ip: null, userAgent: "Mozilla/5.0", ttclid: undefined, ttp: undefined });
    assert.ok("refuz" in gol);

    const e = evenimentTikTokDinBrowser(c, { ip: "86.120.1.2", userAgent: "Mozilla/5.0", ttclid: "E.C.P.abcdefghij", ttp: "n u" }, 1_700_000_000_000);
    assert.ok(!("refuz" in e));
    const ev = e as Exclude<typeof e, { refuz: string }>;
    assert.deepEqual(ev.user, { user_agent: "Mozilla/5.0", ip: "86.120.1.2", ttclid: "E.C.P.abcdefghij" }, "un `_ttp` fara forma a plecat asa cum a venit");
    const cuTtp = evenimentTikTokDinBrowser(c, { ip: null, userAgent: "Mozilla/5.0", ttclid: undefined, ttp: "Xy1_2-3.4" });
    assert.ok(!("refuz" in cuTtp) && cuTtp.user.ttp === "Xy1_2-3.4");
    assert.equal(ev.event_time, 1_700_000_000, "clipa n-a plecat in secunde");
    assert.deepEqual(ev.page, { url: "https://m.ro/p" });
    const ipStricat = evenimentTikTokDinBrowser(c, { ip: "unknown", userAgent: "Mozilla/5.0", ttclid: "E.C.P.abcdefghij", ttp: undefined });
    assert.ok(!("refuz" in ipStricat) && !("ip" in ipStricat.user), "un IP fara forma a plecat la TikTok");
  });
});

// ── 5. Achizitia de pe server ─────────────────────────────────────────────────────
const comanda = (extra: Record<string, unknown> = {}) => ({
  id: "22222222-3333-4444-5555-666666666666", business_id: "biz", total: 189.9,
  items: [{ product_id: PID, name: "Husa (Rosu)", price: 90, quantity: 2 }, { product_id: "simplu", name: "Cana", price: 9.9, quantity: 1 }],
  customer_name: "Ion Popescu", customer_email: "Ion@Exemplu.ro", customer_phone: "0722123456",
  shipping_address: { city: "Cluj-Napoca", county: "Cluj", postal_code: "400001" },
  order_source: { user_agent: "Mozilla/5.0", client_ip: "86.120.1.2", ttp: "Xy1_2-3.4", ttclid: "E.C.P.abcdefghij" },
  payment_method: "cash_on_delivery", payment_status: "unpaid",
  ...extra,
});

describe("Purchase de pe server", () => {
  test("⚠ un singur `Purchase`, cu `event_id` = id-ul comenzii si `page.url` obligatoriu", () => {
    const ev = evenimentCumparareTikTok(comanda(), new Map([[PID, cuVariante]]), "https://m.ro", 1_700_000_000_000);
    assert.equal(ev.event, "Purchase");
    assert.equal(ev.event_id, "22222222-3333-4444-5555-666666666666");
    assert.equal(ev.page.url, "https://m.ro/confirm");
    assert.equal(ev.user.email, sha256Hex("ion@exemplu.ro"));
    assert.equal(ev.user.phone, sha256Hex("+40722123456"));
    assert.equal(ev.user.city, "clujnapoca");
    assert.equal(ev.user.ip, "86.120.1.2");
    assert.equal(ev.user.ttp, "Xy1_2-3.4");
    assert.equal(ev.user.ttclid, "E.C.P.abcdefghij");
    assert.deepEqual(ev.properties?.content_ids, [`${PID}-rosu-vechi`, "simplu"], "varianta n-a primit ID-ul din catalog");
    assert.equal(ev.properties?.content_type, "product");
    assert.equal(ev.properties?.value, 189.9);
    assert.equal(ev.properties?.currency, "RON");
    assert.equal(ev.properties?.num_items, 3);
  });

  test("acordul: fara banner se trimite; cu banner, decizia de marketing, iar fara ea doar cu `_ttp`/`ttclid`", () => {
    assert.equal(acordPentruTikTok({}, false), true);
    assert.equal(acordPentruTikTok({ consimtamant_citit: "da", consimtamant_marketing: "da" }, true), true);
    assert.equal(acordPentruTikTok({ consimtamant_citit: "da", consimtamant_marketing: "nu", ttp: "Xy1_2-3.4" }, true), false);
    assert.equal(acordPentruTikTok({ ttp: "Xy1_2-3.4" }, true), true);
    assert.equal(acordPentruTikTok({ ttclid: "E.C.P.abcdefghij" }, true), true);
    assert.equal(acordPentruTikTok({}, true), false);
  });

  /* Baza de proba: `from().select().eq().maybeSingle()`, `.in()`, `upsert`, `update().eq()`. */
  function bazaFalsa(tabele: Record<string, Record<string, unknown>[]>) {
    const scrieri: { tabel: string; fel: string; rand: unknown }[] = [];
    const admin = {
      from(tabel: string) {
        const randuri = tabele[tabel] ?? [];
        const filtre: [string, unknown][] = [];
        const lant: Record<string, unknown> = {
          select: () => lant,
          eq: (c: string, v: unknown) => { filtre.push([c, v]); return lant; },
          in: (c: string, v: unknown[]) => Promise.resolve({ data: randuri.filter((r) => v.includes(r[c])), error: null }),
          maybeSingle: async () => ({ data: randuri.find((r) => filtre.every(([c, v]) => r[c] === v)) ?? null, error: null }),
          upsert: async (rand: unknown) => { scrieri.push({ tabel, fel: "upsert", rand }); return { error: null }; },
          update: (rand: unknown) => ({ eq: async () => { scrieri.push({ tabel, fel: "update", rand }); return { error: null }; } }),
        };
        return lant;
      },
    };
    return { admin: admin as never, scrieri };
  }
  const setari = (extra: Record<string, unknown> = {}) => ({
    business_id: "biz", marketing_config: { tiktok_pixel_id: "D69ESQRC77U0KGAU8B90", tiktok_capi_activ: true },
    tiktok_capi_config: { access_token: "TTtoken", pixel_id: "D69ESQRC77U0KGAU8B90" }, cookie_banner_config: { enabled: false }, ...extra,
  });

  test("⚠ trimisa o singura data: urma se scrie dupa `code: 0`, iar a doua chemare nu mai pleaca", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { code: 0 } }));
    const { admin, scrieri } = bazaFalsa({
      orders: [comanda()], store_settings: [setari()], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }],
      products: [{ id: PID, page_sections: cuVariante }], tiktok_comenzi_raportate: [],
    });
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, admin), "trimisa");
    assert.equal(apeluri.length, 1);
    assert.ok(scrieri.some((s) => s.tabel === "tiktok_comenzi_raportate" && s.fel === "upsert"));

    const { admin: dupa } = bazaFalsa({
      orders: [comanda()], store_settings: [setari()], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }],
      tiktok_comenzi_raportate: [{ order_id: comanda().id }],
    });
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, dupa), "deja-raportata");
    assert.equal(apeluri.length, 1);
  });

  test("nu pleaca: marketplace, card neincasat, fara token, semnal stins, fara acord; refuzul se scrie pentru panou", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { code: 40105, message: "Invalid or incorrect access token" } }));
    const baza = (o: Record<string, unknown>, s: Record<string, unknown> = setari()) => bazaFalsa({
      orders: [o], store_settings: [s], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }], tiktok_comenzi_raportate: [],
    });
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, baza(comanda({ order_source: { marketplace: "emag" } })).admin), "de-marketplace");
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, baza(comanda({ payment_method: "stripe", payment_status: "unpaid" })).admin), "neincasata");
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, baza(comanda(), setari({ tiktok_capi_config: null })).admin), "fara-configurare");
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, baza(comanda(), setari({ marketing_config: { tiktok_pixel_id: "D69ESQRC77U0KGAU8B90" } })).admin), "fara-configurare");
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, baza(comanda({ order_source: {} }), setari({ cookie_banner_config: { enabled: true } })).admin), "fara-acord");
    assert.equal(apeluri.length, 0, "a plecat ceva ce n-avea voie");

    const { admin, scrieri } = baza(comanda());
    assert.equal(await raporteazaCumparareaTikTok(comanda().id, admin), "respinsa");
    const stare = scrieri.find((s) => s.tabel === "store_settings")?.rand as { tiktok_capi_config?: { ultima_eroare?: string; access_token?: string } };
    assert.match(stare?.tiktok_capi_config?.ultima_eroare ?? "", /40105/);
    assert.equal(stare?.tiktok_capi_config?.access_token, "TTtoken", "tokenul s-a pierdut la scrierea starii");
  });

  test("⚠ dupa incasare pleaca doar comanda ONLINE: rambursul a plecat deja la creare", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { code: 0 } }));
    const baza = (o: Record<string, unknown>) => bazaFalsa({
      orders: [o], store_settings: [setari()], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }], tiktok_comenzi_raportate: [],
    }).admin;
    assert.equal(await raporteazaCumparareaTikTokDupaIncasare(comanda().id, baza(comanda())), "neincasata");
    assert.equal(apeluri.length, 0);
    assert.equal(await raporteazaCumparareaTikTokDupaIncasare(comanda().id, baza(comanda({ payment_method: "stripe", payment_status: "paid" }))), "trimisa");
    assert.equal(apeluri.length, 1);
  });
});

// ── 6. Cablarea din pagini (unde o proba pe ruta ar cere un browser) ───────────────
describe("cablarea care nu se poate rula fara browser", () => {
  test("⚠ potrivirea avansata intra hash-uita in codul de baza, si nu mai pleaca nimic in clar", () => {
    const pixel = readFileSync("src/components/public/TikTokPixel.tsx", "utf8");
    assert.match(pixel, /if\(window\.__edinioTTAM\)ttq\.identify\(window\.__edinioTTAM\);/);
    assert.ok(
      pixel.indexOf("ttq.identify(window.__edinioTTAM)") < pixel.indexOf("ttq.page()"),
      "identify dupa primul eveniment",
    );
    assert.match(pixel, /window\.__edinioTikTok=\{magazin:\$\{slug\},capi:/, "runtime-ul nu afla magazinul, deci nu trimite nimic pe server");
    const confirmare = viu("src/app/(public)/[slug]/confirm/page.tsx");
    assert.match(confirmare, /window\.__edinioTTAM=\$\{JSON\.stringify\(potrivireTikTok\)\}/);
    assert.match(confirmare, /continutTikTok = continutTikTokComanda\(orderItems, sectiuni\);/);
    assert.doesNotMatch(viu("src/lib/marketing.ts"), /export function ttqIdentify/);
    assert.doesNotMatch(viu("src/components/public/FbPurchaseEvent.tsx"), /ttqIdentify/);
  });

  test("⚠ achizitia din browser: un singur `Purchase`, cu ID-urile din catalog", () => {
    const eveniment = viu("src/components/public/FbPurchaseEvent.tsx");
    assert.doesNotMatch(eveniment, /PlaceAnOrder|CompletePayment/);
    assert.match(eveniment, /ttqTrack\("Purchase", \{[\s\S]{0,200}content_type: ttContentType[\s\S]{0,80}content_ids: ttContentIds, contents: ttContents/);
    assert.match(eveniment, /const ttContentIds = continutTikTok\?\.content_ids \?\?/);
  });

  test("⚠ evenimentele de palnie folosesc regulile de continut, si `AddPaymentInfo`/`Search` exista", () => {
    for (const pagina of ["ProductPageClassic", "ProductPageDetailed"]) {
      const cod = viu(`src/components/storefront/sections/product/${pagina}.tsx`);
      assert.match(cod, /ttqTrack\("ViewContent", \{[\s\S]{0,120}\.\.\.continutTikTok\(\[\{ productId, areVariante: produsCuVariante,/, pagina);
    }
    assert.match(viu("src/lib/storefront/cart/track-add.ts"), /ttqTrack\("AddToCart", \{[\s\S]{0,140}\.\.\.continutTikTok\(\[\{ productId, comboId, areVariante,/);
    for (const f of ["src/components/storefront/sections/cart/CartPageClient.tsx", "src/components/storefront/sections/checkout/CheckoutPageClient.tsx"]) {
      assert.match(viu(f), /ttqTrack\("InitiateCheckout", \{[\s\S]{0,140}\.\.\.continutTikTokDinCos\(/, f);
    }
    assert.match(viu("src/components/ministore/MiniStoreRenderer.tsx"), /ttqTrack\("InitiateCheckout", \{[\s\S]{0,160}\.\.\.continutTikTokDinCos\(/);
    const checkout = viu("src/components/storefront/sections/checkout/checkout-core.ts");
    assert.match(checkout, /ttqTrack\("AddPaymentInfo", \{[\s\S]{0,140}\.\.\.continutTikTokDinCos\(/);
    assert.ok(checkout.indexOf('ttqTrack("AddPaymentInfo"') < checkout.indexOf("await placeCartOrder(payload)"), "AddPaymentInfo dupa trimiterea comenzii");
    assert.match(viu("src/components/ministore/OrderModal.tsx"), /ttqTrack\("AddPaymentInfo", \{[\s\S]{0,200}\.\.\.continutTikTok\(\[\{ productId: product\.id,/);
    assert.match(viu("src/components/storefront/UrmaCautarePixel.tsx"), /ttqTrack\("Search", \{\s*search_string: t\.slice\(0, 200\),/);
  });

  test("capatul public e scutit de poarta, tokenul e secret, iar cookie-urile se iau sub acord", () => {
    assert.match(readFileSync("src/lib/auth/poarta-mfa.ts", "utf8"), /"\/api\/tiktok\/eveniment",/);
    assert.match(readFileSync("src/lib/integrari/secrete.ts", "utf8"), /tiktok_capi_config: \["access_token"\]/);
    assert.match(readFileSync("migrations/2027-01-27-tiktok-events-api.sql", "utf8"), /\('tiktok_capi_config', 'access_token'\)/);
    const atribuire = viu("src/lib/storefront/attribution.ts");
    assert.match(atribuire, /const ttp = cookieSimplu\("_ttp"\);/);
    assert.match(atribuire, /const ttclid = cookieSimplu\("ttclid"\);/);
    /* ⚠ Taiat pana la ACOLADA blocului, nu pana la blocul urmator: altfel ce e mutat dupa `}` tot se vedea. */
    const inceputAcord = atribuire.indexOf("if (!refuzatMarketing) {");
    const subAcord = atribuire.slice(inceputAcord, atribuire.indexOf("\n    }", inceputAcord));
    assert.match(subAcord, /cookieSimplu\("_ttp"\)/, "cookie-ul `_ttp` se ia si de la cine a refuzat marketingul");
    assert.match(subAcord, /cookieSimplu\("ttclid"\)/, "`ttclid` se ia si de la cine a refuzat marketingul");
    const actiuni = viu("src/lib/actions/order.actions.ts");
    assert.match(actiuni, /"ttp",/);
    assert.equal((actiuni.match(/raporteazaCumparareaTikTok\(order\.id\)/g) ?? []).length, 2, "o cale de creare a comenzii a ramas fara achizitia TikTok");
    assert.match(actiuni, /raporteazaCumparareaTikTok\(orderId\), "tiktok\.cumparareManuala"/);
    assert.match(viu("src/lib/orders/finalizare-plata.ts"), /raporteazaCumparareaTikTokDupaIncasare\(comanda\.id\)/);
  });

  test("⚠ platforma nu mai arunca evenimentele la o limitare de rata (40100)", () => {
    const trimite = viu("src/lib/edinio-marketing/server/trimite-tiktok.ts");
    assert.match(trimite, /const permanent = corp\.code === 40001 \|\| corp\.code === 40002 \|\| corp\.code === 40007 \|\| corp\.code === 40105;/);
    assert.doesNotMatch(trimite, /permanent =[^;]*40100/);
  });
});
