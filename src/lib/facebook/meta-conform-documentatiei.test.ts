import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { idArticolMeta, comboIdDupaTitlu, continutPixel, continutDinCos, continutComanda, titluDinNumeleLiniei } from "./pixel-continut";
import { normalizeazaPentruMeta, hashuieste, potrivireaPentruPixel, sha256Hex, dateDinAdresa } from "./date-client";
import { trimiteLaMeta, verificaTokenul, cookieMetaValid, fbcDinFbclid } from "./capi";
import { citesteCererea, curataDateleEvenimentului, adresaEAMagazinului, evenimentDinBrowser } from "./eveniment-browser";
import { buildCatalogItems, serializeCatalogFeed, type CatalogProduct } from "./catalog-feed";
import { acordPentruMeta, evenimentCumparare, raporteazaCumparareaMeta, raporteazaCumparareaMetaDupaIncasare } from "@/lib/orders/meta-comanda";
import { optiunileDinAdresa } from "@/lib/storefront/varianta-din-adresa";
import { parseVariants } from "@/lib/storefront/variants";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * META PIXEL SI FACEBOOK CATALOG: CONFORM DOCUMENTATIEI            (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA: 7 magazine cu pixel, toate fara banner de cookie-uri. `suporti-numar`: 240 de comenzi
 * in 90 de zile, 162 cu `fbclid` (din reclame Meta). Niciuna cu `_fbp`/`_fbc`. Produse cu variante la esafe
 * (3047 din 3351) si rallsro (113 din 113).
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 *  1. Fara Conversions API pentru comercianti: tot ce pierdea browserul nu ajungea la Meta.
 *  2. Pixelul trimitea ID-ul PRODUSULUI si pentru produsele cu variante, iar catalogul are ID-uri de VARIANTA:
 *     reclamele dinamice nu legau vizitatorul de nimic.
 *  3. Potrivirea avansata se trimitea printr-un `init` al doilea, pe care Meta nu-l ia drept potrivire manuala.
 *  4. `AddToCart` fara `contents` („Required for Advantage+ catalog ads”); blocul din editor nu-l trimitea deloc.
 *  5. Lipseau `Search` si `AddPaymentInfo`.
 *  6. Catalogul trimitea imagini WebP („JPEG or PNG”), variantele aveau acelasi link, titlul cu combinatia,
 *     axele necunoscute mascate ca `material`/`pattern`, iar entitatile HTML stricau descrierea.
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
    options: [{ id: "o1", name: "Culoare", values: ["Gri", "Rosu"] }, { id: "o2", name: "Aroma", values: ["Vanilie"] }],
    combinations: [
      { id: "gri-vanilie", title: "Gri / Vanilie", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
      /* Redenumita: ID-ul vechi nu mai iese din titlu (3222 de asemenea combinatii in productie). */
      { id: "rosu-vechi", title: "Rosu / Vanilie", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
    ],
  },
};

// ── 1. ID-urile: pixelul si catalogul spun ACELASI lucru ──────────────────────────
describe("pixelul foloseste ID-urile din catalog (dynamic ads)", () => {
  test("ID-ul variantei e `<produs>-<combinatie>`, taiat la 100; fara combinatie, al produsului", () => {
    assert.equal(idArticolMeta(PID, "gri-vanilie"), `${PID}-gri-vanilie`);
    assert.equal(idArticolMeta(PID, null), PID);
    assert.equal(idArticolMeta(PID, "x".repeat(200)).length, 100);
  });

  test("⚠ ID-urile articolelor din feed sunt EXACT cele pe care le calculeaza pixelul din titlul liniei", () => {
    const produs = { id: PID, name: "Husa", slug: "husa", description: null, price: 100, compare_at_price: null, images: ["https://e.ro/a.jpg"], category: null, track_inventory: false, stock_quantity: null, page_sections: cuVariante } as CatalogProduct;
    const articole = buildCatalogItems({ slug: "m", custom_domain: "m.ro", store_name: "M", business_name: "M" }, produs);
    const dinPixel = ["Gri / Vanilie", "Rosu / Vanilie"].map((t) => idArticolMeta(PID, comboIdDupaTitlu(cuVariante, t)));
    assert.deepEqual(articole.map((a) => a.id), dinPixel);
    assert.ok(articole.every((a) => a.itemGroupId === PID), "grupul din feed nu e ID-ul pe care il trimite ViewContent");
  });

  test("felul continutului: produs, varianta cunoscuta, grup, iar amestecul fara `content_type`", () => {
    assert.equal(continutPixel([{ productId: "a", cantitate: 1, pret: 5 }]).content_type, "product");
    assert.equal(continutPixel([{ productId: PID, comboId: "gri-vanilie", areVariante: true, cantitate: 1, pret: 5 }]).content_type, "product");
    const grup = continutPixel([{ productId: PID, areVariante: true, cantitate: 2, pret: 5 }]);
    assert.equal(grup.content_type, "product_group");
    assert.deepEqual(grup.contents, [{ id: PID, quantity: 2, item_price: 5 }]);
    const amestec = continutDinCos([{ productId: "a", quantity: 1, pret: 3 }, { productId: PID, variantTitle: "Gri / Vanilie", quantity: 1, pret: 4 }]);
    assert.equal("content_type" in amestec, false, "un cos amestecat a primit un fel care minte pentru jumatate din el");
    assert.deepEqual(amestec.content_ids, ["a", PID]);
  });

  test("cantitatea e un intreg de cel putin 1, pretul rotunjit la bani", () => {
    const c = continutPixel([{ productId: "a", cantitate: 2.7, pret: 10.005 }, { productId: "b", cantitate: 0, pret: 1 }, { productId: "c", cantitate: Number.NaN, pret: 1 }]);
    assert.deepEqual(c.contents.map((x) => x.quantity), [2, 1, 1]);
    assert.equal(c.contents[0].item_price, 10.01);
  });

  test("⚠ linia de VITRINA n-are `variant_title`: combinatia se citeste din nume, „<produs> (<titlu>)”", () => {
    /* Masurat 17.09.2026: 0 din 173 de linii de vitrina au `variant_title`; numele e „BOCANCI ... (38)”. */
    assert.equal(titluDinNumeleLiniei("Husa redenumita (Gri / Vanilie)", cuVariante), "Gri / Vanilie");
    const marimi = { variants: { enabled: true, options: [{ id: "m", name: "Marime", values: ["S", "XS"] }], combinations: [
      { id: "s", title: "S", enabled: true }, { id: "xs", title: "XS", enabled: true }, { id: "l", title: "L", enabled: false },
    ] } };
    assert.equal(titluDinNumeleLiniei("Tricou (XS)", marimi), "XS");
    assert.equal(titluDinNumeleLiniei("Tricou (S)", marimi), "S");
    assert.equal(titluDinNumeleLiniei("Tricou (L)", marimi), null, "o combinatie stinsa a fost aleasa");
    assert.equal(titluDinNumeleLiniei("TricouS", marimi), null);

    const c = continutComanda([
      { product_id: PID, name: "Husa (Gri / Vanilie)", quantity: 1, price: 90 },
      { product_id: "tricou", name: "Tricou fara paranteza", quantity: 1, price: 30 },
      { product_id: "simplu", name: "Cana (mare)", quantity: 2, price: 5 },
    ], new Map<string, unknown>([[PID, cuVariante], ["tricou", marimi], ["simplu", {}]]));
    assert.deepEqual(c.content_ids, [`${PID}-gri-vanilie`, "tricou", "simplu"]);
    assert.equal("content_type" in c, false, "produsul cu variante fara combinatie gasita trebuia anuntat ca GRUP");
  });
});

// ── 2. Datele omului, dupa „Customer Information Parameters” ───────────────────────
describe("normalizarea si hash-ul datelor, pe exemplele din documentatia Meta", () => {
  test("email, prenume cu diacritice, tara: exact hash-urile din exemple", () => {
    const n = normalizeazaPentruMeta({ email: "  John_Smith@gmail.com ", nume: "Valéry Popescu", tara: "US" });
    assert.equal(n.em, "john_smith@gmail.com");
    const h = hashuieste(n);
    assert.equal(h.em, "62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f");
    assert.equal(h.fn, "08e1996b5dd49e62a4b4c010d44e4345592a863bb9f8e3976219bac29417149c");
    assert.equal(h.country, "79adb2a2fce5c6ba215fe5f27f532d4e7edbac4b6a5e09e1ef3a08084a904621");
    assert.equal(sha256Hex("mary"), "6915771be1c5aa0c886870b6951b03d7eafc121fea0e80a5ea83beb7c449f4ec");
  });

  test("telefon romanesc cu prefix de tara, oras fara spatii si diacritice, cod postal, tara implicita ro", () => {
    const n = normalizeazaPentruMeta({ telefon: "0722 123 456", oras: "Târgu Mureș", judet: "Mureș", codPostal: "540 001", nume: "Ana-Maria" });
    assert.equal(n.ph, "40722123456");
    assert.equal(n.ct, "targumures");
    assert.equal(n.st, "mures");
    assert.equal(n.zp, "540001");
    assert.equal(n.country, "ro");
    assert.equal(n.fn, "anamaria", "punctuatia a ramas in prenume");
    assert.equal(normalizeazaPentruMeta({ codPostal: "540-001" }).zp, "540001", "„no dash”");
  });

  test("potrivirea pentru pixel: doar hash-uri hex, si nimic cand ar ramane doar tara", () => {
    const p = potrivireaPentruPixel({ email: "a@b.ro", telefon: "0722123456" })!;
    for (const v of Object.values(p)) assert.match(v!, /^[0-9a-f]{64}$/);
    assert.equal(potrivireaPentruPixel({ email: "nu-e-email" }), null);
    assert.deepEqual(dateDinAdresa({ city: "Cluj", county: "Cluj", postalCode: "400001" }), { oras: "Cluj", judet: "Cluj", codPostal: "400001", tara: null });
  });
});

// ── 3. Trimiterea Conversions API ──────────────────────────────────────────────────
describe("Conversions API: trimiterea si verificarea tokenului", () => {
  const ev = { event_name: "Purchase", event_time: 1, event_id: "x", action_source: "website" as const, event_source_url: "https://m.ro/confirm", user_data: {} };

  test("⚠ tokenul pleaca in CORP, nu in adresa; codul de test insotit; reusita = `events_received`", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { events_received: 1 } }));
    const r = await trimiteLaMeta({ pixelId: "123456789012345", token: "EAAsecret", testEventCode: "TEST123" }, [ev]);
    assert.deepEqual(r, { ok: true, primite: 1 });
    assert.match(apeluri[0].url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d\/123456789012345\/events$/);
    assert.doesNotMatch(apeluri[0].url, /EAAsecret/);
    assert.equal(apeluri[0].corp?.access_token, "EAAsecret");
    assert.equal(apeluri[0].corp?.test_event_code, "TEST123");
  });

  test("un raspuns fara eroare si fara `events_received` NU e reusita; 190 e tokenul", async () => {
    fetchFals(() => ({ status: 200, json: {} }));
    assert.equal((await trimiteLaMeta({ pixelId: "1", token: "t" }, [ev])).ok, false);
    fetchFals(() => ({ status: 400, json: { error: { code: 190, message: "Invalid OAuth access token" } } }));
    const r = await trimiteLaMeta({ pixelId: "1", token: "t" }, [ev]);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.tokenInvalid, true);
  });

  test("verificarea tokenului citeste pixelul cu tokenul in ANTET", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { id: "123456789012345", name: "Pixel" } }));
    assert.deepEqual(await verificaTokenul("123456789012345", "EAAsecret"), { ok: true, nume: "Pixel" });
    assert.doesNotMatch(apeluri[0].url, /EAAsecret/);
    assert.equal((apeluri[0].init?.headers as Record<string, string>).Authorization, "Bearer EAAsecret");
    fetchFals(() => ({ status: 200, json: { id: "alt-pixel" } }));
    assert.equal((await verificaTokenul("123456789012345", "t")).ok, false, "un token al altui pixel a trecut");
  });

  test("`fbp`/`fbc` doar in forma lor; `fbc` din `fbclid` cu indexul 1 si momentul vazut", () => {
    assert.equal(cookieMetaValid("fb.1.1596403881668.1116446470"), "fb.1.1596403881668.1116446470");
    assert.equal(cookieMetaValid("GA1.1.123"), undefined);
    assert.equal(fbcDinFbclid("IwAR2F4-dbP0l7Mn1Iaw", "2026-09-17T10:00:00.000Z"), `fb.1.${Date.parse("2026-09-17T10:00:00.000Z")}.IwAR2F4-dbP0l7Mn1Iaw`);
    assert.equal(fbcDinFbclid("<script>", "x"), undefined);
  });
});

// ── 4. Evenimentele primite din browser ────────────────────────────────────────────
describe("capatul de evenimente: ce primeste si ce trimite mai departe", () => {
  test("⚠ `Purchase` NU se primeste din browser; nici un `event_id` fara forma", () => {
    const baza = { magazin: "m", event_id: "abcdef12-3456", event_source_url: "https://m.ro/p" };
    assert.ok("refuz" in citesteCererea({ ...baza, event_name: "Purchase" }));
    assert.ok("refuz" in citesteCererea({ ...baza, event_name: "ViewContent", event_id: "x y" }));
    assert.ok(!("refuz" in citesteCererea({ ...baza, event_name: "AddToCart" })));
  });

  test("doar campurile din referinta pixelului, cu tipurile lor", () => {
    const d = curataDateleEvenimentului({
      value: 12.345, currency: "RON", content_type: "product_group", content_ids: ["a", 5, "x".repeat(101)],
      contents: [{ id: "a", quantity: 2, item_price: 4 }, { id: 7 }], em: "a@b.ro", search_string: "ciorapi", altceva: 1,
    });
    assert.deepEqual(d, { value: 12.35, currency: "RON", content_type: "product_group", content_ids: ["a"], contents: [{ id: "a", quantity: 2, item_price: 4 }], search_string: "ciorapi" });
    assert.equal(curataDateleEvenimentului({ value: 5, currency: "EUR" }).currency, undefined, "o moneda pe care magazinul n-o foloseste a trecut");
  });

  test("⚠ pagina trebuie sa fie a ACESTUI magazin", () => {
    const m = { slug: "caian", custom_domain: "caian-textile.ro" };
    assert.equal(adresaEAMagazinului("https://caian-textile.ro/product/x", m, "www.edinio.com"), true);
    assert.equal(adresaEAMagazinului("https://www.caian-textile.ro/", m, "www.edinio.com"), true);
    assert.equal(adresaEAMagazinului("https://www.edinio.com/caian/product/x", m, "www.edinio.com"), true);
    assert.equal(adresaEAMagazinului("https://www.edinio.com/caian-alt/product/x", m, "www.edinio.com"), false);
    assert.equal(adresaEAMagazinului("https://alt-magazin.ro/", m, "www.edinio.com"), false);
    assert.equal(adresaEAMagazinului("https://alt-magazin.ro/caian/product/x", m, "www.edinio.com"), false, "orice site cu /caian in cale a trecut");
    assert.equal(adresaEAMagazinului("http://caian-textile.ro/", m, "www.edinio.com"), false);
  });

  test("datele vizitatorului vin din cerere (IP, agent, cookie-uri valide); fara agent, refuz", () => {
    const cerere = citesteCererea({ magazin: "m", event_name: "ViewContent", event_id: "abcdef12-3456", event_source_url: "https://m.ro/p", custom_data: { value: 5, currency: "RON" } });
    assert.ok(!("refuz" in cerere));
    const e = evenimentDinBrowser(cerere as Exclude<typeof cerere, { refuz: string }>, { ip: "86.120.1.2", userAgent: "Mozilla/5.0", fbp: "fb.1.1596403881668.1116446470", fbc: "gunoi" }, 1_700_000_000_000);
    assert.ok(!("refuz" in e));
    const ev = e as Exclude<typeof e, { refuz: string }>;
    assert.deepEqual(ev.user_data, { client_user_agent: "Mozilla/5.0", client_ip_address: "86.120.1.2", fbp: "fb.1.1596403881668.1116446470" });
    assert.equal(ev.event_time, 1_700_000_000);
    assert.equal(ev.action_source, "website");
    const ipStricat = evenimentDinBrowser(cerere as Exclude<typeof cerere, { refuz: string }>, { ip: "unknown", userAgent: "Mozilla/5.0", fbp: undefined, fbc: undefined });
    assert.ok(!("refuz" in ipStricat) && !("client_ip_address" in ipStricat.user_data), "un IP fara forma a plecat la Meta");
    const fara = evenimentDinBrowser(cerere as Exclude<typeof cerere, { refuz: string }>, { ip: null, userAgent: null, fbp: undefined, fbc: undefined });
    assert.ok("refuz" in fara);
  });
});

// ── 5. Achizitia de pe server ──────────────────────────────────────────────────────
const comanda = (extra: Record<string, unknown> = {}) => ({
  id: "11111111-2222-3333-4444-555555555555", business_id: "biz", total: 189.9,
  items: [{ product_id: PID, variant_title: "Rosu / Vanilie", price: 90, quantity: 2 }, { product_id: "simplu", price: 9.9, quantity: 1 }],
  customer_name: "Ion Popescu", customer_email: "Ion@Exemplu.ro", customer_phone: "0722123456",
  shipping_address: { city: "Cluj-Napoca", county: "Cluj", postal_code: "400001" },
  order_source: { user_agent: "Mozilla/5.0", client_ip: "86.120.1.2", fbp: "fb.1.1596403881668.1116446470", fbclid: "IwAR2F4dbP0l7Mn", captured_at: "2026-09-17T10:00:00.000Z" },
  payment_method: "cash_on_delivery", payment_status: "unpaid",
  ...extra,
});

describe("Purchase de pe server", () => {
  test("⚠ `event_id` = id-ul comenzii (acelasi ca in browser), datele hash-uite in liste, ID-urile din catalog", () => {
    const ev = evenimentCumparare(comanda(), new Map([[PID, cuVariante]]), "https://m.ro", 1_700_000_000_000);
    assert.equal(ev.event_name, "Purchase");
    assert.equal(ev.event_id, "11111111-2222-3333-4444-555555555555");
    assert.equal(ev.event_source_url, "https://m.ro/confirm");
    assert.deepEqual(ev.user_data.em, [sha256Hex("ion@exemplu.ro")]);
    assert.deepEqual(ev.user_data.ph, [sha256Hex("40722123456")]);
    assert.deepEqual(ev.user_data.ct, [sha256Hex("clujnapoca")]);
    assert.equal(ev.user_data.client_ip_address, "86.120.1.2");
    assert.equal(ev.user_data.client_user_agent, "Mozilla/5.0");
    assert.equal(ev.user_data.fbp, "fb.1.1596403881668.1116446470");
    assert.equal(ev.user_data.fbc, `fb.1.${Date.parse("2026-09-17T10:00:00.000Z")}.IwAR2F4dbP0l7Mn`, "fbc nu s-a construit din fbclid");
    assert.deepEqual(ev.custom_data?.content_ids, [`${PID}-rosu-vechi`, "simplu"], "varianta redenumita n-a primit ID-ul din catalog");
    assert.equal(ev.custom_data?.content_type, "product");
    assert.equal(ev.custom_data?.value, 189.9);
    assert.equal(ev.custom_data?.currency, "RON");
    assert.equal(ev.custom_data?.num_items, 3);

    /* Forma liniilor de VITRINA: varianta doar in nume (vezi `titluDinNumeleLiniei`). */
    const vitrina = evenimentCumparare(comanda({ items: [{ product_id: PID, name: "Husa (Gri / Vanilie)", price: 90, quantity: 1 }] }), new Map([[PID, cuVariante]]), "https://m.ro");
    assert.deepEqual(vitrina.custom_data?.content_ids, [`${PID}-gri-vanilie`], "achizitia de pe vitrina a plecat fara ID-ul variantei");
    assert.equal(vitrina.custom_data?.content_type, "product");
  });

  test("acordul: fara banner se trimite; cu banner, decizia de marketing, iar fara ea doar cu `_fbp`", () => {
    assert.equal(acordPentruMeta({}, false), true);
    assert.equal(acordPentruMeta({ consimtamant_citit: "da", consimtamant_marketing: "da" }, true), true);
    assert.equal(acordPentruMeta({ consimtamant_citit: "da", consimtamant_marketing: "nu", fbp: "fb.1.1596403881668.1" }, true), false);
    assert.equal(acordPentruMeta({ fbp: "fb.1.1596403881668.1116446470" }, true), true);
    assert.equal(acordPentruMeta({}, true), false);
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
    business_id: "biz", marketing_config: { facebook_pixel_id: "123456789012345", facebook_capi_activ: true },
    meta_capi_config: { access_token: "EAAtoken", pixel_id: "123456789012345" }, cookie_banner_config: { enabled: false }, ...extra,
  });

  test("⚠ trimisa o singura data: urma se scrie dupa `events_received`, iar a doua chemare nu mai pleaca", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { events_received: 1 } }));
    const { admin, scrieri } = bazaFalsa({
      orders: [comanda()], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }],
      store_settings: [setari({ meta_capi_config: { access_token: "EAAtoken", pixel_id: "123456789012345", test_event_code: "TEST555" } })],
      products: [{ id: PID, page_sections: cuVariante }], meta_comenzi_raportate: [],
    });
    assert.equal(await raporteazaCumparareaMeta(comanda().id, admin), "trimisa");
    assert.equal(apeluri.length, 1);
    assert.equal(apeluri[0].corp?.test_event_code, "TEST555", "achizitia de proba a intrat in datele reale");
    assert.ok(scrieri.some((s) => s.tabel === "meta_comenzi_raportate" && s.fel === "upsert"));

    const { admin: dupa } = bazaFalsa({
      orders: [comanda()], store_settings: [setari()], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }],
      meta_comenzi_raportate: [{ order_id: comanda().id }],
    });
    assert.equal(await raporteazaCumparareaMeta(comanda().id, dupa), "deja-raportata");
    assert.equal(apeluri.length, 1);
  });

  test("nu pleaca: marketplace, card neincasat, fara token, fara acord; refuzul lui Meta se scrie pentru panou", async () => {
    const apeluri = fetchFals(() => ({ status: 400, json: { error: { code: 190, message: "token expirat" } } }));
    const baza = (o: Record<string, unknown>, s: Record<string, unknown> = setari()) => bazaFalsa({
      orders: [o], store_settings: [s], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }], meta_comenzi_raportate: [],
    });
    assert.equal(await raporteazaCumparareaMeta(comanda().id, baza(comanda({ order_source: { marketplace: "emag" } })).admin), "de-marketplace");
    assert.equal(await raporteazaCumparareaMeta(comanda().id, baza(comanda({ payment_method: "stripe", payment_status: "unpaid" })).admin), "neincasata");
    assert.equal(await raporteazaCumparareaMeta(comanda().id, baza(comanda(), setari({ meta_capi_config: null })).admin), "fara-configurare");
    /* Tokenul exista, dar Pixel ID-ul s-a schimbat de la verificare: semnalul e stins. */
    assert.equal(await raporteazaCumparareaMeta(comanda().id, baza(comanda(), setari({ marketing_config: { facebook_pixel_id: "999999999999999" } })).admin), "fara-configurare");
    assert.equal(await raporteazaCumparareaMeta(comanda().id, baza(comanda({ order_source: {} }), setari({ cookie_banner_config: { enabled: true } })).admin), "fara-acord");
    assert.equal(apeluri.length, 0, "a plecat ceva ce n-avea voie");

    const { admin, scrieri } = baza(comanda());
    assert.equal(await raporteazaCumparareaMeta(comanda().id, admin), "respinsa");
    const stare = scrieri.find((s) => s.tabel === "store_settings")?.rand as { meta_capi_config?: { ultima_eroare?: string; access_token?: string } };
    assert.equal(stare?.meta_capi_config?.ultima_eroare, "token expirat");
    assert.equal(stare?.meta_capi_config?.access_token, "EAAtoken", "tokenul s-a pierdut la scrierea starii");
  });

  test("⚠ dupa incasare pleaca doar comanda ONLINE: rambursul a plecat deja la creare", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { events_received: 1 } }));
    const baza = (o: Record<string, unknown>) => bazaFalsa({
      orders: [o], store_settings: [setari()], businesses: [{ id: "biz", slug: "m", custom_domain: "m.ro" }], meta_comenzi_raportate: [],
    }).admin;
    assert.equal(await raporteazaCumparareaMetaDupaIncasare(comanda().id, baza(comanda())), "neincasata");
    assert.equal(apeluri.length, 0);
    assert.equal(await raporteazaCumparareaMetaDupaIncasare(comanda().id, baza(comanda({ payment_method: "stripe", payment_status: "paid" }))), "trimisa");
    assert.equal(apeluri.length, 1);
  });
});

// ── 6. Catalogul, dupa „Catalog Reference” si „Product Variants” ───────────────────
describe("feedul Facebook Catalog", () => {
  const magazin = { slug: "m", custom_domain: "m.ro", store_name: "M", business_name: "M SRL" };
  const produs = (extra: Partial<CatalogProduct> = {}) => ({
    id: PID, name: "Husa", slug: "husa", description: "<p>Pentru c&acirc;ine &amp; pisic&#259;</p>", price: 100, compare_at_price: null,
    images: ["https://e.ro/a.jpg"], category: "Fragrante", track_inventory: false, stock_quantity: null, page_sections: cuVariante, ...extra,
  }) as CatalogProduct;

  test("⚠ variantele: acelasi nume ca produsul, link care preselecteaza varianta, axa necunoscuta in `additional_variant_attribute`", () => {
    const articole = buildCatalogItems(magazin, produs());
    assert.ok(articole.every((a) => a.title === "Husa"), "titlul variantei poarta combinatia");
    const variante = parseVariants(cuVariante);
    for (const [i, a] of articole.entries()) {
      const u = new URL(a.link);
      assert.deepEqual(optiunileDinAdresa(variante, u.search), { Culoare: ["Gri", "Rosu"][i], Aroma: "Vanilie" });
    }
    assert.equal(articole[0].color, "Gri");
    assert.equal(articole[0].additionalVariantAttribute, "Aroma:Vanilie");
    assert.equal(articole[0].material, undefined, "aroma a fost mascata ca material");
    assert.equal(articole[0].pattern, undefined);
    assert.match(serializeCatalogFeed(magazin, articole), /<g:additional_variant_attribute>Aroma:Vanilie<\/g:additional_variant_attribute>/);
  });

  test("⚠ imaginea WebP din depozit pleaca prin JPEG, si pe produs, si pe varianta", () => {
    const webp = "https://pub-exemplu.r2.dev/products/abc/poza.webp";
    const [simplu] = buildCatalogItems(magazin, produs({ page_sections: {}, images: [webp, webp] }));
    assert.equal(simplu.imageLink, `https://www.edinio.com/api/img?p=${encodeURIComponent("products/abc/poza.webp")}&w=1024&f=jpg`);
    assert.deepEqual(simplu.additionalImageLinks, [simplu.imageLink]);
    const [varianta] = buildCatalogItems(magazin, produs({ images: [webp] }));
    assert.equal(varianta.imageLink, simplu.imageLink, "varianta a plecat cu WebP-ul");
  });

  test("descrierea: entitatile decodate, nu inlocuite cu spatiu", () => {
    const [a] = buildCatalogItems(magazin, produs({ page_sections: {} }));
    assert.equal(a.description, "Pentru câine & pisică");
  });

  test("categoria Google: din harta Merchant, tradusa in ID oficial (calea veche gresita inclusa)", () => {
    const [a] = buildCatalogItems(magazin, produs({ page_sections: {} }), { Fragrante: "Health & Beauty > Personal Care > Fragrances" });
    assert.equal(a.googleProductCategory, "479");
    const [b] = buildCatalogItems(magazin, produs({ page_sections: { google: { google_product_category: "187" } } }), { Fragrante: "469" });
    assert.equal(b.googleProductCategory, "187", "categoria de pe produs n-a castigat");
  });
});

// ── 7. Drumurile din cod (unde o proba pe ruta ar cere un browser) ─────────────────
describe("cablarea care nu se poate rula fara browser", () => {
  test("⚠ potrivirea avansata intra in `init`-ul codului de baza, nu intr-un `init` al doilea", () => {
    const pixel = readFileSync("src/components/public/FacebookPixel.tsx", "utf8");
    assert.match(pixel, /fbq\('init','\$\{id\}',window\.__edinioAM\|\|\{\}\)/);
    const confirmare = viu("src/app/(public)/[slug]/confirm/page.tsx");
    assert.match(confirmare, /window\.__edinioAM=\$\{JSON\.stringify\(potrivireMeta\)\}/);
    assert.doesNotMatch(viu("src/lib/marketing.ts"), /fbq\("init"/);
    assert.doesNotMatch(viu("src/components/public/FbPurchaseEvent.tsx"), /fbAdvancedMatch/);
  });

  test("achizitia de pe server e legata in toate cele trei momente, langa GA4", () => {
    const actiuni = viu("src/lib/actions/order.actions.ts");
    assert.equal((actiuni.match(/raporteazaCumparareaMeta\(order\.id\)/g) ?? []).length, 2, "o cale de creare a comenzii a ramas fara achizitia Meta");
    assert.match(actiuni, /raporteazaCumparareaMeta\(orderId\), "meta\.cumparareManuala"/);
    assert.match(viu("src/lib/orders/finalizare-plata.ts"), /raporteazaCumparareaMetaDupaIncasare\(comanda\.id\)/);
  });

  test("cookie-urile Meta se fotografiaza sub acordul de MARKETING, iar IP-ul il scrie numai serverul", () => {
    const atribuire = viu("src/lib/storefront/attribution.ts");
    assert.match(atribuire, /const refuzatMarketing = acord !== null && acord\.decis && !acord\.marketing;/);
    const actiuni = viu("src/lib/actions/order.actions.ts");
    assert.match(actiuni, /"fbp", "fbc",/);
    assert.doesNotMatch(actiuni.slice(actiuni.indexOf("const CHEI_ATRIBUIRE"), actiuni.indexOf("] as const")), /client_ip/);
    assert.match(actiuni, /if \(ip && isIP\(ip\) && \(curat\.fbp \|\| curat\.fbc \|\| curat\.fbclid \|\| curat\.ttp \|\| curat\.ttclid\)\) curat\.client_ip = ip;/, "IP-ul se pastreaza si fara semn de pixel");
  });

  test("⚠ paginile trimit evenimentele de palnie prin regulile de continut (ID-uri de catalog, grupuri, cosuri)", () => {
    for (const pagina of ["ProductPageClassic", "ProductPageDetailed"]) {
      const cod = viu(`src/components/storefront/sections/product/${pagina}.tsx`);
      assert.match(cod, /fbTrack\("ViewContent", \{[^}]*\.\.\.continutPixel\(\[\{ productId, areVariante: produsCuVariante,/, `${pagina}: ViewContent`);
      assert.match(cod, /trackAddToCart\(\{ productId: product\.id, [^}]*comboId: selectedCombo\?\.id, areVariante: !!variantsData \}\)/, `${pagina}: AddToCart fara combinatie`);
    }
    assert.match(viu("src/components/ministore/MiniStoreRenderer.tsx"),
      /trackAndFlash\(line\.productId, line\.name, line\.price, comboIdDupaTitlu\(quickAddProduct\?\.page_sections, line\.variantTitle\), true\)/);
    for (const f of ["src/components/storefront/sections/cart/CartPageClient.tsx", "src/components/storefront/sections/checkout/CheckoutPageClient.tsx"]) {
      assert.match(viu(f), /fbTrack\("InitiateCheckout", \{\s*value: total, currency: "RON", num_items: count,\s*\.\.\.continutDinCos\(/, f);
    }
    const checkout = viu("src/components/storefront/sections/checkout/checkout-core.ts");
    assert.match(checkout, /fbTrack\("AddPaymentInfo", \{\s*value: grandTotal, currency: "RON",\s*\.\.\.continutDinCos\(/);
    assert.ok(checkout.indexOf('fbTrack("AddPaymentInfo"') < checkout.indexOf("await placeCartOrder(payload)"), "AddPaymentInfo dupa trimiterea comenzii");
    const modal = viu("src/components/ministore/OrderModal.tsx");
    assert.match(modal, /fbTrack\("AddPaymentInfo", \{[^;]*\.\.\.continutPixel\(\[\{ productId: product\.id, areVariante: !!product\.variantTitle,/);
    const cautare = viu("src/lib/storefront/catalog/pagina-magazin.tsx");
    assert.match(cautare, /\{esteCautare && filtre\.cautare\.trim\(\) \? \(\s*<UrmaCautarePixel\s+termen=\{filtre\.cautare\}\s+rezultate=\{reusitPeServer \? products\.slice\(0, 10\)/);
    assert.match(viu("src/components/storefront/UrmaCautarePixel.tsx"), /fbTrack\("Search", \{\s*search_string: t\.slice\(0, 200\),/);
  });

  test("⚠ achizitia din browser poarta ACELASI continut ca cea de pe server", () => {
    assert.match(viu("src/app/(public)/[slug]/confirm/page.tsx"), /continutMeta = continutComanda\(orderItems, sectiuni\);/);
    assert.match(viu("src/lib/orders/meta-comanda.ts"), /const continut = continutComanda\(linii, paginiSectiuni\);/);
    const eveniment = viu("src/components/public/FbPurchaseEvent.tsx");
    assert.match(eveniment, /const fbContentIds = continutMeta\?\.content_ids \?\?/);
    assert.match(eveniment, /const fbContents = continutMeta\?\.contents \?\?/);
    assert.match(eveniment, /const fbContentType = continutMeta \? continutMeta\.content_type : "product";/);
  });

  test("blocul din editor trimite AddToCart; capatul public e scutit de poarta; tokenul e secret", () => {
    assert.match(viu("src/components/pages/blocks/AddToCartButton.tsx"), /trackAddToCart\(\{/);
    assert.match(readFileSync("src/lib/auth/poarta-mfa.ts", "utf8"), /"\/api\/meta\/eveniment",/);
    assert.match(readFileSync("src/lib/integrari/secrete.ts", "utf8"), /meta_capi_config: \["access_token"\]/);
    assert.match(readFileSync("migrations/2027-01-26-meta-conversions-api.sql", "utf8"), /\('meta_capi_config', 'access_token'\)/);
  });
});
