import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { CATEGORII_GOOGLE, CAI_VECHI_GRESITE, categorieGooglePentruTrimitere, caleaDeAfisat } from "./taxonomy";
import { corpAbonare, motivulErorii } from "./client";
import { asiguraAbonarea } from "./abonare";
import { asiguraTarileSursei } from "./tari-sursa";
import { createApiDataSource } from "./client";
import { obtineTokenul } from "./oauth";
import { masuraPretPeUnitate, bazaPretPeUnitate } from "./pret-pe-unitate";
import { expandProductOffers, offerIdVarianta, type MappableBusiness, type MappableProduct } from "./mapping";
import { problemeDeAfisat } from "./probleme";
import { asteptareaUrmatoare, ASTEPTARE_DUPA_TOKEN_MS, EroareGoogle, caderePermanenta, limitaZilnicaAtinsa, dupaResetareaZilnica } from "./asteptare";
import type { GoogleMerchantConfig } from "./types";
import { optiunileDinAdresa } from "../storefront/varianta-din-adresa";
import { parseVariants } from "../storefront/variants";
import { buildProductJsonLd } from "../storefront/product-jsonld";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * GOOGLE MERCHANT: CONFORM DOCUMENTATIEI                     (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA: 7 magazine conectate, 315 oferte. La 6 dintre ele, TOATE produsele stateau
 * „In asteptare” cu zero destinatii si zero probleme; la `mokka`, 38 de produse aprobate cu 228 de
 * probleme stocate.
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 *  1. Abonarea la notificari se crea fara `targetAccount` si eroarea se inghitea: 0 din 7 magazine.
 *  2. 5 din 77 de categorii erau cai care nu exista in taxonomia Google (`google_category_unrecognized`).
 *  3. Lipsea pretul pe unitate, obligatoriu in UE la produsele vandute la masura (31 din 38 la `mokka`).
 *  4. Ofertele pe varianta plecau cu adresa produsului, iar pagina nu preselecta varianta.
 *  5. `offerId` pe varianta se taia la 50 de caractere, iar variante diferite ajungeau pe acelasi id.
 *  6. Panoul citea `documentationUri` in loc de `documentation` si arata fiecare problema de sase ori.
 *  7. O cadere a tokenului STERGEA coada magazinului; reincercarile mergeau minut de minut, fara asteptare.
 *  8. ⚠⚠ 276 de oferte fara NICIO destinatie: sursa de date se crea fara `countries`, iar feedLabel nu da tara.
 *     (Programele erau pornite la toate: s-a verificat pe productie, dupa ce s-a banuit intai contrariul.)
 *  9. Webhook-ul servea un singur magazin pe cont si cerea reverificarea intregului catalog la o stergere.
 * 10. Limita ZILNICA de apeluri era tratata ca o pana de minute: 5 incercari arse, produsul „Eroare”.
 *
 * Punctele 7, 9 si 10 se probeaza ruland chiar rutele: `cron-si-webhook-ruta.test.ts`.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.GMC_WEBHOOK_SECRET;
});

type Apel = { url: string; method: string; body: unknown };
function fetchFals(raspunde: (a: Apel) => { status: number; json: unknown }) {
  const apeluri: Apel[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const a: Apel = {
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body,
    };
    apeluri.push(a);
    const r = raspunde(a);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return apeluri;
}

// ── 1. Taxonomia ───────────────────────────────────────────────────────────────
describe("categoriile Google au ID-ul OFICIAL", () => {
  const oficial = new Map<number, string>();
  for (const rand of readFileSync("src/lib/google-merchant/date/taxonomy-with-ids.en-US.txt", "utf8").split(/\r?\n/)) {
    const m = rand.match(/^(\d+) - (.+)$/);
    if (m) oficial.set(Number(m[1]), m[2]);
  }

  test("fisierul oficial chiar s-a citit (altfel probele de mai jos n-ar apara nimic)", () => {
    assert.ok(oficial.size > 5000, `doar ${oficial.size} categorii citite`);
  });

  test("FIECARE pereche din lista exista identic in taxonomia Google", () => {
    assert.ok(CATEGORII_GOOGLE.length >= 77);
    for (const [id, cale] of CATEGORII_GOOGLE) {
      assert.equal(oficial.get(id), cale, `ID ${id}: in lista „${cale}”, la Google „${oficial.get(id)}”`);
    }
  });

  test("caile vechi gresite NU exista la Google si se traduc intr-un ID care exista", () => {
    assert.equal(Object.keys(CAI_VECHI_GRESITE).length, 5);
    const caiOficiale = new Set(oficial.values());
    for (const [cale, id] of Object.entries(CAI_VECHI_GRESITE)) {
      assert.ok(!caiOficiale.has(cale), `„${cale}” exista totusi la Google`);
      assert.ok(oficial.has(id), `ID-ul ${id} pentru „${cale}” nu exista`);
      assert.equal(categorieGooglePentruTrimitere(cale), String(id));
      assert.equal(caleaDeAfisat(cale), oficial.get(id));
    }
  });

  test("se trimite ID-ul; un ID ramane ID, un text necunoscut pleaca neschimbat", () => {
    assert.equal(categorieGooglePentruTrimitere("Apparel & Accessories > Shoes"), "187");
    assert.equal(categorieGooglePentruTrimitere("  187 "), "187");
    assert.equal(categorieGooglePentruTrimitere("Ceva scris de mana"), "Ceva scris de mana");
    assert.equal(categorieGooglePentruTrimitere(""), undefined);
    assert.equal(categorieGooglePentruTrimitere(null), undefined);
  });
});

// ── 2. Abonarea la notificari ─────────────────────────────────────────────────────
describe("abonarea la notificari, dupa ghidul „product status changes”", () => {
  test("contul standalone se aboneaza cu `targetAccount` = propriul cont", () => {
    const corp = corpAbonare("555", "https://www.edinio.com/api/google-merchant/webhook?token=x");
    assert.equal(corp.registeredEvent, "PRODUCT_STATUS_CHANGE");
    assert.equal(corp.targetAccount, "accounts/555");
    assert.equal(corp.callBackUri, "https://www.edinio.com/api/google-merchant/webhook?token=x");
    assert.equal("allManagedAccounts" in corp, false);
  });

  test("fara secret NU se creeaza nimic: webhook-ul ar refuza toate notificarile", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: {} }));
    assert.deepEqual(await asiguraAbonarea("tok", "555"), { stare: "fara-secret" });
    assert.equal(apeluri.length, 0);
  });

  test("abonarea NOASTRA existenta se refoloseste, iar adresa veche se actualizeaza cu PATCH", async () => {
    process.env.GMC_WEBHOOK_SECRET = "nou";
    const apeluri = fetchFals((a) => a.method === "GET"
      ? { status: 200, json: { notificationSubscriptions: [
          { name: "accounts/555/notificationsubscriptions/strain", registeredEvent: "PRODUCT_STATUS_CHANGE", targetAccount: "accounts/555", callBackUri: "https://alta-aplicatie.ro/hook" },
          { name: "accounts/555/notificationsubscriptions/7", registeredEvent: "PRODUCT_STATUS_CHANGE", targetAccount: "accounts/555", callBackUri: "https://www.edinio.com/api/google-merchant/webhook?token=vechi" },
        ] } }
      : { status: 200, json: {} });
    assert.deepEqual(await asiguraAbonarea("tok", "555"), { stare: "activa", name: "accounts/555/notificationsubscriptions/7" });
    const patch = apeluri.find((a) => a.method === "PATCH");
    assert.ok(patch, "adresa veche n-a fost actualizata");
    assert.match(patch.url, /notificationsubscriptions\/7\?update_mask=callBackUri$/);
    assert.deepEqual(patch.body, { callBackUri: "https://www.edinio.com/api/google-merchant/webhook?token=nou" });
    assert.equal(apeluri.some((a) => a.method === "POST"), false, "s-a creat o a doua abonare");
  });

  test("abonarea altei aplicatii NU se fura: se creeaza a noastra", async () => {
    process.env.GMC_WEBHOOK_SECRET = "s";
    const apeluri = fetchFals((a) => a.method === "GET"
      ? { status: 200, json: { notificationSubscriptions: [
          { name: "accounts/555/notificationsubscriptions/strain", registeredEvent: "PRODUCT_STATUS_CHANGE", targetAccount: "accounts/555", callBackUri: "https://alta-aplicatie.ro/hook" },
        ] } }
      : { status: 200, json: { name: "accounts/555/notificationsubscriptions/9" } });
    assert.deepEqual(await asiguraAbonarea("tok", "555"), { stare: "activa", name: "accounts/555/notificationsubscriptions/9" });
    const post = apeluri.find((a) => a.method === "POST");
    assert.ok(post);
    assert.equal((post.body as { targetAccount?: string }).targetAccount, "accounts/555");
    assert.equal(apeluri.some((a) => a.method === "PATCH"), false);
  });

  test("refuzul lui Google se intoarce cu mesaj si REASON, nu se inghite", async () => {
    process.env.GMC_WEBHOOK_SECRET = "s";
    fetchFals((a) => a.method === "GET"
      ? { status: 200, json: {} }
      : { status: 400, json: { error: { message: "Invalid target", details: [{ metadata: { REASON: "invalid_argument" } }] } } });
    assert.deepEqual(await asiguraAbonarea("tok", "555"), { stare: "eroare", mesaj: "Invalid target", reason: "invalid_argument" });
  });
});

// ── 2b. Tara pe sursa de date ─────────────────────────────────────────────────────
describe("tara in care apar produsele, dupa ghidul „Data sources”", () => {
  test("⚠ sursa noua se creeaza CU tara magazinului", async () => {
    const apeluri = fetchFals(() => ({ status: 200, json: { name: "accounts/555/dataSources/1" } }));
    await createApiDataSource("tok", "555", "Edinio", "RO", "ro", " ro ");
    assert.deepEqual(apeluri[0].body, { displayName: "Edinio", primaryProductDataSource: { contentLanguage: "ro", feedLabel: "RO", countries: ["RO"] } });
  });

  test("⚠ sursa fara tara se repara cu PATCH, cu masca DOAR pe `countries`", async () => {
    const apeluri = fetchFals((a) => a.method === "GET"
      ? { status: 200, json: { name: "accounts/555/dataSources/1", primaryProductDataSource: { feedLabel: "RO", contentLanguage: "ro" } } }
      : { status: 200, json: { name: "accounts/555/dataSources/1", primaryProductDataSource: { countries: ["RO"] } } });
    assert.deepEqual(await asiguraTarileSursei("tok", "accounts/555/dataSources/1", "ro"), { stare: "reparata", inainte: [], tari: ["RO"] });
    const patch = apeluri.find((a) => a.method === "PATCH")!;
    assert.match(patch.url, /\/datasources\/v1\/accounts\/555\/dataSources\/1\?updateMask=primaryProductDataSource\.countries$/);
    assert.deepEqual(patch.body, { name: "accounts/555/dataSources/1", primaryProductDataSource: { countries: ["RO"] } });
  });

  test("tara existenta nu atinge nimic; o alta tara a comerciantului ramane", async () => {
    let apeluri = fetchFals(() => ({ status: 200, json: { primaryProductDataSource: { countries: ["RO"] } } }));
    assert.deepEqual(await asiguraTarileSursei("tok", "accounts/555/dataSources/1", "RO"), { stare: "corecta", tari: ["RO"] });
    assert.equal(apeluri.length, 1);

    apeluri = fetchFals((a) => a.method === "GET"
      ? { status: 200, json: { primaryProductDataSource: { countries: ["BG"] } } }
      : { status: 200, json: { primaryProductDataSource: { countries: ["BG", "RO"] } } });
    assert.deepEqual(await asiguraTarileSursei("tok", "accounts/555/dataSources/1", "RO"), { stare: "reparata", inainte: ["BG"], tari: ["BG", "RO"] });
    assert.deepEqual((apeluri.find((a) => a.method === "PATCH")!.body as { primaryProductDataSource: { countries: string[] } }).primaryProductDataSource.countries, ["BG", "RO"]);
  });

  test("o sursa care nu e primara sau o citire cazuta nu se „repara” orbeste", async () => {
    let apeluri = fetchFals(() => ({ status: 200, json: { name: "x", supplementalProductDataSource: {} } }));
    assert.equal((await asiguraTarileSursei("tok", "x", "RO")).stare, "eroare");
    assert.equal(apeluri.some((a) => a.method === "PATCH"), false);

    apeluri = fetchFals(() => ({ status: 403, json: { error: { message: "fara drept", details: [{ metadata: { REASON: "permission_denied" } }] } } }));
    assert.deepEqual(await asiguraTarileSursei("tok", "x", "RO"), { stare: "eroare", mesaj: "fara drept", reason: "permission_denied" });
    assert.equal(apeluri.length, 1);
  });

  test("conectarea (callback si alegerea contului) trece prin aceeasi reparatie", () => {
    for (const cale of ["src/app/api/google-merchant/oauth/callback/route.ts", "src/lib/actions/google-merchant.actions.ts"]) {
      const sursa = viu(cale);
      assert.match(sursa, /asiguraTarileSursei\(/, `${cale}: sursa refolosita ramane fara tara`);
      assert.match(sursa, /createApiDataSource\([^)]*,\s*(config\.country|config\.country \|\| DEFAULT_COUNTRY)\)/, `${cale}: sursa noua se creeaza fara tara`);
    }
  });

  test("panoul nu mai da „programul oprit” drept singura cauza a produselor fara destinatie", () => {
    const panou = viu("src/components/dashboard/GoogleMerchantClient.tsx");
    assert.doesNotMatch(panou, /nu are pornit niciun program/);
    assert.match(panou, /nicio țară în care să apară/);
  });
});

// ── 3. Erori, token, asteptare ───────────────────────────────────────────────────
describe("erorile dupa ghidul „Handle error responses”", () => {
  test("REASON se ia din `details[].metadata`, nu din mesaj", () => {
    assert.equal(motivulErorii({ error: { message: "x", details: [{ "@type": "t" }, { metadata: { REASON: "quota/request_rate_too_high" } }] } }), "quota/request_rate_too_high");
    assert.equal(motivulErorii({ error: { message: "quota/request_rate_too_high" } }), undefined);
    assert.equal(motivulErorii(null), undefined);
  });

  test("asteptarea creste: 1, 2, 4, 8, apoi 15 minute", () => {
    const t0 = Date.parse("2026-09-17T10:00:00Z");
    const minute = [1, 2, 3, 4, 5, 6].map((n) => (Date.parse(asteptareaUrmatoare(n, t0)) - t0) / 60_000);
    assert.deepEqual(minute, [1, 2, 4, 8, 15, 15]);
  });

  test("doar 400 e cadere definitiva; 429, 5xx si 403 se reincearca", () => {
    assert.equal(caderePermanenta(new EroareGoogle("x", 400, "invalid_argument")), true);
    for (const s of [0, 401, 403, 404, 429, 500, 503]) assert.equal(caderePermanenta(new EroareGoogle("x", s)), false, `status ${s}`);
    assert.equal(caderePermanenta(new Error("x")), false);
  });

  test("limita zilnica se deosebeste de cea pe minut dupa REASON, nu dupa mesaj", () => {
    assert.equal(limitaZilnicaAtinsa(new EroareGoogle("Daily request quota exceeded", 429, "QUOTA_TOO_MANY_REQUESTS")), true);
    assert.equal(limitaZilnicaAtinsa(new EroareGoogle("x", 429, "quota/daily_limit_exceeded")), true);
    assert.equal(limitaZilnicaAtinsa(new EroareGoogle("Daily request quota exceeded", 429, "QUOTA_REQUEST_RATE_TOO_HIGH")), false);
    assert.equal(limitaZilnicaAtinsa(new EroareGoogle("x", 500, "QUOTA_TOO_MANY_REQUESTS")), false);
    assert.equal(limitaZilnicaAtinsa(new Error("QUOTA_TOO_MANY_REQUESTS")), false);
  });

  test("dupa limita zilnica se reia la urmatoarea ora 12:00 UTC (plus 5 minute), si dimineata, si dupa-amiaza", () => {
    assert.equal(dupaResetareaZilnica(Date.parse("2026-09-17T08:30:00Z")), "2026-09-17T12:05:00.000Z");
    assert.equal(dupaResetareaZilnica(Date.parse("2026-09-17T13:55:00Z")), "2026-09-18T12:05:00.000Z");
    assert.equal(dupaResetareaZilnica(Date.parse("2026-09-17T12:00:00Z")), "2026-09-18T12:05:00.000Z");
    assert.equal(dupaResetareaZilnica(Date.parse("2026-12-31T23:59:00Z")), "2027-01-01T12:05:00.000Z");
  });

  test("un token revocat asteapta mai mult decat o pana trecatoare", () => {
    assert.ok(ASTEPTARE_DUPA_TOKEN_MS.revocat > ASTEPTARE_DUPA_TOKEN_MS.indisponibil);
    assert.ok(ASTEPTARE_DUPA_TOKEN_MS["fara-drept"] > ASTEPTARE_DUPA_TOKEN_MS.indisponibil);
  });

  test("tokenul spune DE CE n-a venit", async () => {
    fetchFals(() => ({ status: 400, json: { error: "invalid_grant" } }));
    assert.deepEqual(await obtineTokenul("rt-revocat"), { eroare: "revocat" });
    fetchFals(() => ({ status: 200, json: { access_token: "a", expires_in: 3600, scope: "openid email" } }));
    assert.deepEqual(await obtineTokenul("rt-fara-drept"), { eroare: "fara-drept" });
    fetchFals(() => ({ status: 503, json: {} }));
    assert.deepEqual(await obtineTokenul("rt-pana"), { eroare: "indisponibil" });
    globalThis.fetch = (async () => { throw new Error("retea"); }) as typeof fetch;
    assert.deepEqual(await obtineTokenul("rt-retea"), { eroare: "indisponibil" });
    fetchFals(() => ({ status: 200, json: { access_token: "bun", expires_in: 3600, scope: "https://www.googleapis.com/auth/content" } }));
    assert.deepEqual(await obtineTokenul("rt-bun"), { token: "bun" });
  });
});

// ── 4. Cronul si webhook-ul ─────────────────────────────────────────────────────────
/* ⚠ Se probeaza RULAND rutele, in `cron-si-webhook-ruta.test.ts`: token cazut, backoff, 400, limita zilnica,
   configurarea recitita, abonarile si programele magazinelor conectate, webhook-ul cu doua magazine pe cont. */

// ── 5. Pretul pe unitate ─────────────────────────────────────────────────────────────
describe("pretul pe unitate, dupa specificatia `unit_pricing_measure`", () => {
  test("cantitatea neta: numar pozitiv plus unitate acceptata", () => {
    assert.deepEqual(masuraPretPeUnitate("750ml"), { value: 750, unit: "ml" });
    assert.deepEqual(masuraPretPeUnitate("2,5 kg"), { value: 2.5, unit: "kg" });
    assert.deepEqual(masuraPretPeUnitate(" 1.5 L "), { value: 1.5, unit: "l" });
    assert.deepEqual(masuraPretPeUnitate("10ct"), { value: 10, unit: "ct" });
    for (const gresit of ["0g", "750", "ml", "10 item", "5 sheet", "2 bucati", "-1kg", "", null]) {
      assert.equal(masuraPretPeUnitate(gresit), null, `„${gresit}” a trecut`);
    }
  });

  test("unitatea de baza: doar numitorii acceptati, de acelasi fel", () => {
    const ml = masuraPretPeUnitate("750ml");
    assert.deepEqual(bazaPretPeUnitate("100ml", ml), { value: 100, unit: "ml" });
    assert.deepEqual(bazaPretPeUnitate("1l", ml), { value: 1, unit: "l" });
    assert.deepEqual(bazaPretPeUnitate("75cl", ml), { value: 75, unit: "cl" });
    assert.equal(bazaPretPeUnitate("3l", ml), null, "3 nu e numitor acceptat");
    assert.equal(bazaPretPeUnitate("100g", ml), null, "grame pe o masura in mililitri");
    assert.equal(bazaPretPeUnitate("100ml", null), null, "numitor fara masura");
    assert.deepEqual(bazaPretPeUnitate("50kg", masuraPretPeUnitate("25kg")), { value: 50, unit: "kg" });
  });
});

// ── 6. Maparea ofertelor ─────────────────────────────────────────────────────────────
const BUSINESS: MappableBusiness = { slug: "exemplu", custom_domain: "exemplu.ro", store_name: "Exemplu", business_name: "Exemplu SRL" };
const CONFIG = { content_language: "ro", feed_label: "RO", category_map: { Parfumuri: "Health & Beauty > Personal Care > Fragrances" } } as GoogleMerchantConfig;
const PID = "9cfcce6f-da63-431f-8fa2-b6ead4c87cb2";

const combo = (title: string, extra: Record<string, unknown> = {}) => ({
  id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title, price: "", compare_at_price: "", sku: "",
  stock_quantity: "", image: "", enabled: true, ...extra,
});

function produs(google: Record<string, string>, variante?: { optiune: string; valori: string[]; combinatii: ReturnType<typeof combo>[] }): MappableProduct {
  return {
    id: PID, name: "Parfum Oud", slug: "parfum-oud", description: null, price: 120, compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"], category: "Parfumuri", track_inventory: false, stock_quantity: null, weight_grams: null,
    page_sections: {
      google,
      ...(variante ? { variants: { enabled: true, options: [{ id: "o1", name: variante.optiune, values: variante.valori }], combinations: variante.combinatii } } : {}),
    },
  };
}
const atribute = (p: MappableProduct) =>
  expandProductOffers(BUSINESS, p, CONFIG).map((o) => ({ offerId: o.offerId, a: (o.input as { productAttributes: Record<string, unknown> }).productAttributes }));

describe("maparea ofertelor, dupa specificatia produselor", () => {
  test("categoria mapata pe o cale veche pleaca drept ID oficial; categoria magazinului e `productTypes`", () => {
    const [{ a }] = atribute(produs({}));
    assert.equal(a.googleProductCategory, "479");
    assert.deepEqual(a.productTypes, ["Parfumuri"]);
  });

  test("pretul pe unitate pleaca doar valid", () => {
    assert.deepEqual(atribute(produs({ unit_pricing_measure: "100ml", unit_pricing_base_measure: "10ml" }))[0].a.unitPricingMeasure, { value: 100, unit: "ml" });
    assert.deepEqual(atribute(produs({ unit_pricing_measure: "100ml", unit_pricing_base_measure: "10ml" }))[0].a.unitPricingBaseMeasure, { value: 10, unit: "ml" });
    const gresit = atribute(produs({ unit_pricing_measure: "o sticla", unit_pricing_base_measure: "10ml" }))[0].a;
    assert.equal("unitPricingMeasure" in gresit, false);
    assert.equal("unitPricingBaseMeasure" in gresit, false);
  });

  test("varianta cu cantitatea ei o poarta pe a ei; o optiune de alt fel nu atinge nimic", () => {
    const cantitati = atribute(produs({ unit_pricing_measure: "50ml" }, { optiune: "Volum", valori: ["50ml", "100ml"], combinatii: [combo("50ml"), combo("100ml")] }));
    assert.deepEqual(cantitati.map((o) => o.a.unitPricingMeasure), [{ value: 50, unit: "ml" }, { value: 100, unit: "ml" }]);

    const perna = atribute(produs({ unit_pricing_measure: "1kg" }, { optiune: "Marime", valori: ["40cm", "60cm"], combinatii: [combo("40cm"), combo("60cm")] }));
    assert.deepEqual(perna.map((o) => o.a.unitPricingMeasure), [{ value: 1, unit: "kg" }, { value: 1, unit: "kg" }]);

    const faraAlegere = atribute(produs({}, { optiune: "Volum", valori: ["50ml"], combinatii: [combo("50ml")] }));
    assert.equal("unitPricingMeasure" in faraAlegere[0].a, false, "o valoare care seamana cu o masura a devenit masura");
  });

  test("`offerId` si `itemGroupId` raman sub 50 de caractere si distincte", () => {
    const lung = "Culoare Rosu Aprins / Marime XXL Extra / Material Bumbac Organic";
    const oferte = atribute(produs({}, { optiune: "Varianta", valori: [lung, `${lung} 2`], combinatii: [combo(lung), combo(`${lung} 2`)] }));
    assert.equal(oferte.length, 2);
    for (const o of oferte) {
      assert.ok(o.offerId.length <= 50, `offerId de ${o.offerId.length}: ${o.offerId}`);
      assert.ok(String(o.a.itemGroupId).length <= 50);
    }
    assert.notEqual(oferte[0].offerId, oferte[1].offerId);
    assert.equal(offerIdVarianta(PID, { id: "rosu", title: "Rosu" }), `${PID}-rosu`, "offerId-urile scurte, deja trimise, s-au mutat");
  });

  test("⚠ linkul variantei deschide pagina PE EA: pagina citeste inapoi exact combinatia", () => {
    const combinatii = [combo("Alb"), combo("Negru", { uid: "0123456789abcdef" }), combo("Rosu", { enabled: false })];
    const p = produs({}, { optiune: "Culoare", valori: ["Alb", "Negru", "Rosu"], combinatii });
    const oferte = atribute(p);
    const variante = parseVariants(p.page_sections);
    assert.equal(oferte.length, 2);
    for (const [i, o] of oferte.entries()) {
      const link = new URL(String(o.a.link));
      assert.equal(`${link.origin}${link.pathname}`, "https://exemplu.ro/product/parfum-oud");
      assert.deepEqual(optiunileDinAdresa(variante, link.search), { Culoare: ["Alb", "Negru"][i] });
    }
    assert.equal(new URL(String(oferte[1].a.link)).searchParams.get("varianta"), "0123456789abcdef");
  });

  test("pagina nu preselecteaza o combinatie oprita, una necunoscuta, sau nimic", () => {
    const p = produs({}, { optiune: "Culoare", valori: ["Alb", "Rosu"], combinatii: [combo("Alb"), combo("Rosu", { enabled: false, uid: "fedcba9876543210" })] });
    const variante = parseVariants(p.page_sections);
    assert.equal(optiunileDinAdresa(variante, "?varianta=fedcba9876543210"), null);
    assert.equal(optiunileDinAdresa(variante, "?varianta=nu-exista"), null);
    assert.equal(optiunileDinAdresa(variante, "?utm_source=google"), null);
    assert.equal(optiunileDinAdresa(null, "?varianta=x"), null);
  });

  test("datele structurate ale variantei poarta aceeasi adresa ca oferta din Merchant", () => {
    const p = produs({}, { optiune: "Culoare", valori: ["Alb", "Negru"], combinatii: [combo("Alb", { gtin: "5941234567899" }), combo("Negru", { gtin: "5941234567882" })] });
    const oferte = atribute(p);
    const jsonld = buildProductJsonLd({ ...p, price: 120 }, "https://exemplu.ro/product/parfum-oud", "Exemplu", { cost: 20, min: 1, max: 3 }) as { hasVariant?: { offers: { url: string } }[] };
    assert.ok(jsonld.hasVariant?.length === 2, "fixtura n-a iesit ProductGroup");
    assert.deepEqual(jsonld.hasVariant.map((v) => v.offers.url), oferte.map((o) => String(o.a.link)));
  });
});

// ── 7. Drumurile de conectare si paginile de produs ──────────────────────────────────
describe("conectarea si pagina de produs folosesc aceleasi reguli", () => {
  test("callback-ul si alegerea contului fac abonarea prin `asiguraAbonarea`, fara s-o inghita", () => {
    const callback = viu("src/app/api/google-merchant/oauth/callback/route.ts");
    const actiuni = viu("src/lib/actions/google-merchant.actions.ts");
    for (const [nume, sursa] of [["callback", callback], ["actiuni", actiuni]] as const) {
      assert.match(sursa, /asiguraAbonarea\(/, `${nume}: abonarea nu trece prin modulul comun`);
      assert.doesNotMatch(sursa, /createNotificationSubscription\(/, `${nume}: abonare creata pe langa modul`);
      /* ⚠ Atribuirea anume, nu numele campului: actiunile il si CITESC in `getMerchantStatus`, deci o
         cautare pe subsir ramanea verde si dupa ce scrierea disparea (prins de bancul de mutanti). */
      assert.match(sursa, /abonare_eroare(?::| =) abonare\.stare === "eroare" \? abonare\.mesaj\.slice\(0, 300\) : undefined/, `${nume}: motivul unei caderi nu se scrie`);
    }
  });

  test("la schimbarea contului nu se refoloseste sursa de date a contului vechi", () => {
    const actiuni = viu("src/lib/actions/google-merchant.actions.ts");
    assert.match(actiuni, /let dataSourceName = config\.data_source_name\?\.startsWith\(`accounts\/\$\{accountId\}\/`\) \? config\.data_source_name : undefined;/);
  });

  test("panoul numara produsele verificate fara nicio destinatie", () => {
    const actiuni = viu("src/lib/actions/google-merchant.actions.ts");
    assert.match(actiuni, /\.eq\("status", "pending"\)\.not\("last_status_at", "is", null\)\.eq\("destinations", "\[\]"\)/);
  });

  test("AMBELE machete ale paginii de produs preselecteaza varianta din adresa, doar peste o alegere goala", () => {
    for (const cale of [
      "src/components/storefront/sections/product/ProductPageClassic.tsx",
      "src/components/storefront/sections/product/ProductPageDetailed.tsx",
    ]) {
      const sursa = viu(cale);
      assert.match(sursa, /const optiuni = optiunileDinAdresa\(variantsData, cautareaAdresei\);/, `${cale}: adresa nu se citeste`);
      assert.match(sursa, /if \(optiuni && Object\.keys\(selectedOptions\)\.length === 0\) setSelectedOptions\(optiuni\);/, `${cale}: alegerea omului poate fi calcata`);
      assert.match(sursa, /useSyncExternalStore\(abonareCautare, citesteCautarea, \(\) => ""\)/, `${cale}: serverul n-are instantaneu gol`);
    }
  });
});

// ── 8. Problemele din panou ─────────────────────────────────────────────────────────
describe("problemele unui produs, cum le arata panoul", () => {
  const SUPRAFETE = ["SHOPPING_ADS", "DISPLAY_ADS", "FREE_LISTINGS", "DEMAND_GEN_ADS", "VIDEO_ADS", "DEMAND_GEN_ADS_DISCOVER_SURFACE"];
  /* Forma exacta a unui rand de la `mokka`, 17.09.2026. */
  const lipsaUnitate = SUPRAFETE.map((reportingContext) => ({
    code: "missing_potentially_required_attribute", severity: "NOT_IMPACTED", attribute: "unit pricing measure",
    resolution: "merchant_action", description: "Missing unit pricing measure",
    detail: "Missing or invalid unit pricing measure attributes may be present in your product data",
    documentation: "https://support.google.com/merchants/answer/10009686", reportingContext, applicableCountries: ["RO"],
  }));

  test("aceeasi problema pe sase suprafete se arata O DATA, cu linkul din `documentation`", () => {
    const p = problemeDeAfisat(lipsaUnitate);
    assert.equal(p.length, 1);
    assert.equal(p[0].link, "https://support.google.com/merchants/answer/10009686");
    assert.equal(p[0].suprafete.length, 6);
    assert.equal(p[0].titlu, "Missing unit pricing measure");
  });

  test("se pastreaza severitatea cea mai grava, si cele care resping vin primele", () => {
    const p = problemeDeAfisat([
      ...lipsaUnitate,
      { code: "image_link_broken", severity: "DEMOTED", reportingContext: "SHOPPING_ADS", description: "Imagine" },
      { code: "image_link_broken", severity: "DISAPPROVED", reportingContext: "FREE_LISTINGS", description: "Imagine", documentationUri: "https://vechi.example/doc" },
    ]);
    assert.deepEqual(p.map((x) => [x.cheie, x.severitate]), [["image_link_broken|", "DISAPPROVED"], ["missing_potentially_required_attribute|unit pricing measure", "NOT_IMPACTED"]]);
    assert.equal(p[0].link, "https://vechi.example/doc", "problemele stocate inainte de reparatie si-au pierdut linkul");
  });

  test("panoul trece problemele prin `problemeDeAfisat`, nu le mai citeste brut", () => {
    const panou = viu("src/components/dashboard/GoogleMerchantClient.tsx");
    const lista = panou.slice(panou.indexOf("function IssueList("));
    assert.match(lista.slice(0, 400), /problemeDeAfisat\(issues\)/);
    assert.doesNotMatch(panou, /iss\.documentationUri/);
  });
});
