import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Metadata } from "next";
// Constanta pura, fara baza: se poate importa inainte de a pune env-ul.
import { DESIGN_VERSION, type StoreDesign } from "@/lib/storefront/design/types";

/*
 * ═══ PAGINA PRINCIPALA FILTRATA: `metadataAcasaFiltrata` RULATA CHIAR EA ═══
 *
 * Pe 10.09.2026, live: `ralls.ro/?cat=Rochii` si `ralls.ro/?page=2` aveau titlul si
 * descrierea paginii principale; `caian-textile.ro/?cat=PROSOAPE` arata canonical catre
 * `/magazin?cat=PROSOAPE`, o adresa care isi avea canonicalul in alta parte (lant);
 * `ralls.ro/?cat=zzz-inexistent` isi era singur canonical.
 *
 * Aici se ruleaza functia pe toate cele sase ramuri, cu incarcatoarele adevarate si o
 * baza de proba (`categories`, `catalog_rezumat`, `rpc/catalog_pagina`), aceleasi
 * reguli ca in `metadata-magazin.test.ts`: doar coloanele cerute, fara `order` randurile
 * vin invers, `maybeSingle` pe mai multe randuri da eroare.
 */

const B_CAIAN = "b2000000-0000-4000-8000-000000000001";
const B_RALLS = "b2000000-0000-4000-8000-000000000002";

type Rand = Record<string, unknown>;

const DESCRIERE_ACASA_CAIAN = "Textile hoteliere CAIAN: prosoape, lenjerii de pat și protecții saltea 100% bumbac, certificate OEKO-TEX. Livrare rapidă în România, prețuri speciale HoReCa.";
const SUBTITLU_CAIAN = "Prosoape, lenjerii de pat si protectii saltea certificate OEKO-TEX, pentru hoteluri, pensiuni si uz casnic.";

const id = (n: number) => `c2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cat = (b: string, n: number, name: string, parinte: number | null, sort: number, activ = true): Rand => ({
  business_id: b, id: id(n), name, parent_id: parinte === null ? null : id(parinte), image_url: null, sort_order: sort, is_active: activ,
});

const CATEGORII: Rand[] = [
  cat(B_CAIAN, 1, "PROSOAPE", null, 0),
  cat(B_CAIAN, 2, "Prosoape Hotel", 1, 0),
  cat(B_CAIAN, 3, "HOME & DECO", null, 1),
  cat(B_RALLS, 11, "Rochii", null, 0),
  cat(B_RALLS, 12, "Rochii de seara", 11, 0),
  cat(B_RALLS, 13, "Bluze", null, 1),
  cat(B_RALLS, 14, "Goale", null, 2),
  cat(B_RALLS, 15, "Stinsa", null, 3, false),
];

const rezumat = (b: string, fi: boolean, fs: boolean, categorii: string[]): Rand => ({
  business_id: b, fara_imagini: fi, fara_stoc_ascuns: fs, total: 0, price_min: "0", price_max: "0", categorii,
  fatete: { jetoane: [], fatete: [] },
});
const REZUMATE: Rand[] = [
  rezumat(B_CAIAN, false, false, ["PROSOAPE", "Prosoape Hotel"]),
  rezumat(B_CAIAN, false, true, []),
  rezumat(B_CAIAN, true, false, []),
  rezumat(B_CAIAN, true, true, []),
  rezumat(B_RALLS, false, false, []),
  // ralls isi ascunde produsele fara imagine: numai randul (true, false) e al lui.
  rezumat(B_RALLS, true, false, ["Rochii de seara", "Bluze", "Import vechi", "Stinsa"]),
  rezumat(B_RALLS, false, true, []),
  rezumat(B_RALLS, true, true, []),
];

type Grila = [number, string[], number | null, boolean];
const GRILA: Record<string, Record<string, Grila>> = {
  [B_CAIAN]: {
    "": [41, ["Husa de Pat"], 2.1, false],
    "PROSOAPE": [18, ["Set 3 Prosoape"], 8.63, false],
    "HOME & DECO": [0, [], null, false],
  },
  [B_RALLS]: {
    "": [120, ["Rochie rosie", "Bluza alba"], 49.9, false],
    "Rochii": [40, ["Rochie rosie"], 89, true],
    "Import vechi": [2, ["Produs vechi", "Alt produs vechi"], 15, false],
    "Goale": [0, [], null, false],
  },
};

/** Designul publicat, BRUT (cum sta in `store_settings`), cu pagina de catalog aprinsa. */
const designBrut = (settings: Rand = { subtitlu: SUBTITLU_CAIAN }): Rand => ({
  version: DESIGN_VERSION,
  shop: { page: { id: "pagina-magazin", kind: "shop_page", variant: "toolbar", enabled: true, settings } },
});

const TITLU_ACASA_CAIAN = "Caian Textile | Prosoape Hotel & HoReCa Romania";
const P_UNIC = "d2000000-0000-4000-8000-000000000001";

/**
 * Randurile `businesses` pentru `metadataPaginiiPrincipale`, cu `store_settings` imbricat.
 * Categoriile, rezumatele si grila sunt ale lui caian si ralls de mai sus (acelasi `id`).
 */
const MAGAZINE: Rand[] = [
  {
    id: B_CAIAN, slug: "caian-textile", business_name: "SC CAIAN SRL", store_name: "CAIAN TEXTILE",
    tagline: null, description: null, store_city: "Bucuresti", cover_url: "https://cdn.tld/caian.webp",
    custom_domain: "caian-textile.ro", is_published: true,
    store_settings: {
      page_content: { seo: { title: TITLU_ACASA_CAIAN, description: DESCRIERE_ACASA_CAIAN } },
      storefront_design: designBrut(), vat_enabled: false, prices_include_vat: true,
    },
  },
  // Fara pagina de catalog, fara Setari > SEO, cu preturi FARA TVA.
  {
    id: B_RALLS, slug: "ralls", business_name: "RALLS SRL", store_name: "RALLS",
    tagline: "Rochii si bluze de designer.", description: null, store_city: "Bucuresti", cover_url: null,
    custom_domain: "ralls.ro", is_published: true,
    store_settings: {
      page_content: { hide_products_without_images: true, home_order: { mod: "price_asc" } },
      storefront_design: null, vat_enabled: true, prices_include_vat: false,
    },
  },
  // Magazinul „un singur produs": pagina principala E produsul.
  {
    id: B_RALLS, slug: "lampa", business_name: "LAMPA SRL", store_name: "Lampa Aurora",
    tagline: null, description: null, store_city: null, cover_url: null,
    custom_domain: "lampa.ro", is_published: true,
    store_settings: {
      page_content: { store_mode: "one_product", one_product_id: P_UNIC, hide_products_without_images: true },
      storefront_design: null, vat_enabled: false, prices_include_vat: true,
    },
  },
  // Produsul ales nu mai exista (sters sau dezactivat): cade pe metadata magazinului.
  {
    id: B_RALLS, slug: "lampa-stinsa", business_name: "LAMPA SRL", store_name: "Lampa Veche",
    tagline: null, description: null, store_city: null, cover_url: null,
    custom_domain: "lampa-veche.ro", is_published: true,
    store_settings: {
      page_content: { store_mode: "one_product", one_product_id: "d2000000-0000-4000-8000-000000000999", hide_products_without_images: true },
      storefront_design: null, vat_enabled: false, prices_include_vat: true,
    },
  },
  {
    id: "b2000000-0000-4000-8000-000000000009", slug: "nepublicat", business_name: "SC NOU SRL", store_name: "Nou",
    tagline: null, description: null, store_city: null, cover_url: null, custom_domain: null, is_published: false,
    store_settings: { page_content: {}, storefront_design: null, vat_enabled: false, prices_include_vat: true },
  },
];

/** Coloanele de nivel intai din `select`, cu imbricarile `nume(a,b)` pastrate intregi. */
function coloane(select: string): string[] {
  const out: string[] = [];
  let adancime = 0, bucata = "";
  for (const ch of select) {
    if (ch === "(") adancime++;
    if (ch === ")") adancime--;
    if (ch === "," && adancime === 0) { out.push(bucata.trim()); bucata = ""; continue; }
    bucata += ch;
  }
  if (bucata.trim()) out.push(bucata.trim());
  return out;
}

/** Proiectia PostgREST: doar coloanele cerute, si in imbricare doar cele cerute acolo. */
function proiecteaza(r: Rand, select: string): Rand {
  const out: Rand = {};
  for (const c of coloane(select)) {
    const m = c.match(/^(\w+)\((.*)\)$/);
    if (m) {
      const copil = r[m[1]];
      out[m[1]] = copil && typeof copil === "object" ? proiecteaza(copil as Rand, m[2]) : null;
    } else if (c in r) {
      out[c] = r[c];
    }
  }
  return out;
}

function raspunde(randuri: Rand[], url: URL): Rand[] {
  let out = randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (!v.startsWith("eq.")) throw new Error(`operator neasteptat: ${k}=${v}`);
      if (String(r[k]) !== v.slice(3)) return false;
    }
    return true;
  });
  const ordine = url.searchParams.get("order");
  out = ordine
    ? [...out].sort((a, b) => {
        for (const col of ordine.split(",").map((o) => o.split(".")[0])) {
          const x = a[col] as string | number, y = b[col] as string | number;
          if (x < y) return -1;
          if (x > y) return 1;
        }
        return 0;
      })
    : [...out].reverse();
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : out.length;
  out = out.slice(offset, offset + limit);
  const select = url.searchParams.get("select");
  if (select && select !== "*") {
    const col = select.split(",").map((c) => c.trim());
    out = out.map((r) => Object.fromEntries(col.filter((c) => c in r).map((c) => [c, r[c]])));
  }
  return out;
}

const apeluri: { business: string; filtre: Rand }[] = [];

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const json = (cod: number, corp: unknown) => {
    res.writeHead(cod, { "content-type": "application/json" });
    res.end(JSON.stringify(corp));
  };
  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/catalog_pagina") {
    let corp = "";
    req.on("data", (b) => (corp += b));
    req.on("end", () => {
      const a = JSON.parse(corp || "{}") as Rand;
      const f = (a.p_filtre ?? {}) as Rand;
      apeluri.push({ business: String(a.p_business), filtre: f });
      const pagina = Array.isArray(f.categorii) ? String(f.categorii[0] ?? "") : "";
      const [total, produse, pret, interval] = GRILA[String(a.p_business)]?.[pagina] ?? [0, [], null, false];
      if (f.stoc === true) {
        return json(200, { total, randuri: pret == null ? [] : [{ name: "ieftin", price_min: String(pret), has_range: interval, fara_oferta: false }] });
      }
      json(200, { total, randuri: produse.slice(0, Number(a.p_limit) || 20).map((name) => ({ name })) });
    });
    return;
  }
  try {
    if (url.pathname === "/rest/v1/businesses") {
      // Doar filtrul pe slug: orice alt filtru ar insemna ca metadata cauta magazinul altfel.
      for (const k of url.searchParams.keys()) {
        if (k !== "select" && k !== "slug") throw new Error(`filtru neasteptat pe businesses: ${k}`);
      }
      const slug = (url.searchParams.get("slug") ?? "").replace(/^eq\./, "");
      const randuri = MAGAZINE.filter((r) => r.slug === slug).map((r) => proiecteaza(r, url.searchParams.get("select") ?? ""));
      // `.single()` cere un OBIECT, iar pe zero randuri PostgREST raspunde 406.
      if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, randuri);
      if (randuri.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return json(200, randuri[0]);
    }
    if (url.pathname === "/rest/v1/categories") return json(200, raspunde(CATEGORII, url));
    // `maybeSingle` pe GET cere un TABLOU (Accept: application/json) si da singur
    // eroare pe mai multe randuri: exact ce ar primi o citire care uita un comutator.
    if (url.pathname === "/rest/v1/catalog_rezumat") return json(200, raspunde(REZUMATE, url));
  } catch (e) {
    return json(400, { message: (e as Error).message });
  }
  json(404, { message: "ruta de proba necunoscuta" });
});

let metadataAcasaFiltrata: (typeof import("./metadata-acasa"))["metadataAcasaFiltrata"];
let esteAcasaFiltrata: (typeof import("./metadata-acasa"))["esteAcasaFiltrata"];
let metadataPaginiiPrincipale: (typeof import("./metadata-acasa"))["metadataPaginiiPrincipale"];
let parseStoreDesign: (typeof import("@/lib/storefront/design/parse"))["parseStoreDesign"];

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  ({ metadataAcasaFiltrata, esteAcasaFiltrata, metadataPaginiiPrincipale } = await import("./metadata-acasa"));
  ({ parseStoreDesign } = await import("@/lib/storefront/design/parse"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

const CTX = { primaryColor: "#1AB554", pageContent: {}, features: {} };
/**
 * Designul cu pagina de catalog aprinsa, cu reglajele ei (implicit: subtitlul caian);
 * `faraCatalog()` = designul clasic, fara pagina de catalog.
 *
 * ⚠ Fara `version`, parserul il ia drept design nematerializat si intoarce „classic":
 * pagina de catalog ar fi disparut, si ramurile 3 si 4 n-ar mai fi fost probate deloc.
 */
const cuCatalog = (settings?: Rand): StoreDesign => parseStoreDesign(designBrut(settings), CTX);
const faraCatalog = (): StoreDesign => parseStoreDesign(null, CTX);

type Sp = Record<string, string | string[] | undefined>;

const caian = (sp: Sp, peste: Partial<Parameters<typeof metadataAcasaFiltrata>[0]> = {}) => metadataAcasaFiltrata({
  business: { id: B_CAIAN, slug: "caian-textile", custom_domain: "caian-textile.ro", store_name: "CAIAN TEXTILE", business_name: "SC CAIAN SRL", tagline: null, description: null },
  seo: { description: DESCRIERE_ACASA_CAIAN },
  pageContent: { seo: { description: DESCRIERE_ACASA_CAIAN } },
  design: cuCatalog(),
  faraTva: false,
  sp,
  acasa: { titlu: "Caian Textile | Prosoape Hotel & HoReCa Romania", descriere: DESCRIERE_ACASA_CAIAN, imagini: ["https://cdn.tld/caian.webp"] },
  unSingurProdus: false,
  ...peste,
});

const RALLS_ACASA = { titlu: "RALLS - Bucuresti", descriere: "Rochii si bluze de designer.", imagini: [] as string[] };
const ralls = (sp: Sp, peste: Partial<Parameters<typeof metadataAcasaFiltrata>[0]> = {}) => metadataAcasaFiltrata({
  business: { id: B_RALLS, slug: "ralls", custom_domain: "ralls.ro", store_name: "RALLS", business_name: "RALLS SRL", tagline: null, description: null },
  seo: {},
  pageContent: { hide_products_without_images: true, home_order: { mod: "price_asc" } },
  design: faraCatalog(),
  faraTva: false,
  sp,
  acasa: RALLS_ACASA,
  unSingurProdus: false,
  ...peste,
});

const og = (m: Metadata) => m.openGraph as Record<string, unknown>;
const tw = (m: Metadata) => m.twitter as Record<string, unknown>;

async function cuApeluri<T>(fn: () => Promise<T>) {
  const de = apeluri.length;
  const rezultat = await fn();
  const noi = apeluri.slice(de);
  return { rezultat, a: noi.filter((x) => x.filtre.stoc !== true), b: noi.filter((x) => x.filtre.stoc === true) };
}

function nedefinite(m: unknown, cale = ""): string[] {
  if (m === undefined) return [cale || "(radacina)"];
  if (m === null || typeof m !== "object") return [];
  return Object.entries(m as Record<string, unknown>).flatMap(([k, v]) => nedefinite(v, cale ? `${cale}.${k}` : k));
}

describe("esteAcasaFiltrata", () => {
  test("categoria, reducerile si paginile de la 2 in sus; cautarea si restul nu", () => {
    assert.equal(esteAcasaFiltrata({ cat: "Rochii" }), true);
    assert.equal(esteAcasaFiltrata({ sale: "1" }), true);
    assert.equal(esteAcasaFiltrata({ page: "2" }), true);
    assert.equal(esteAcasaFiltrata({ page: "1" }), false);
    assert.equal(esteAcasaFiltrata({ page: "abc" }), false);
    assert.equal(esteAcasaFiltrata({ q: "rochie" }), false);
    assert.equal(esteAcasaFiltrata({ cat: "  " }), false);
    assert.equal(esteAcasaFiltrata({ utm_source: "fb", sort: "price_asc" }), false);
  });
});

describe("ramura 1: magazinul cu un singur produs", () => {
  test("canonical = radacina, cu textul produsului, oricare ar fi filtrul", async () => {
    const produs = { titlu: "Lampa Aurora", descriere: "Lampa de veghe din lemn.", imagini: ["https://cdn.tld/lampa.webp"] };
    for (const sp of [{ cat: "Rochii" }, { page: "3" }, { sale: "1" }]) {
      const m = await ralls(sp, { acasa: produs, unSingurProdus: true });
      assert.deepEqual(m.alternates, { canonical: "https://ralls.ro" });
      assert.deepEqual(m.title, { absolute: "Lampa Aurora" });
      assert.equal(m.description, "Lampa de veghe din lemn.");
      assert.equal(og(m).url, "https://ralls.ro");
    }
  });
});

describe("ramura 2: categoria nu exista", () => {
  test("`?cat=zzz-inexistent`: canonical = radacina, nu ea insasi", async () => {
    const m = await ralls({ cat: "zzz-inexistent" });
    assert.deepEqual(m.alternates, { canonical: "https://ralls.ro" });
    assert.deepEqual(m.title, { absolute: RALLS_ACASA.titlu });
    assert.equal(m.description, RALLS_ACASA.descriere);
  });

  test("o categorie stinsa nu exista pentru vizitator, nici ca orfana", async () => {
    assert.deepEqual((await ralls({ cat: "Stinsa" })).alternates, { canonical: "https://ralls.ro" });
  });

  test("un id care nu e al niciunei categorii", async () => {
    assert.deepEqual((await ralls({ cat: id(999) })).alternates, { canonical: "https://ralls.ro" });
  });
});

describe("ramura 3: cu pagina de catalog, categoria exista", () => {
  test("`caian/?cat=PROSOAPE`: canonical DIRECT pe pagina categoriei, cu titlul si textul ei", async () => {
    const m = await caian({ cat: "PROSOAPE" });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin/prosoape" });
    assert.deepEqual(m.title, { absolute: "PROSOAPE | CAIAN TEXTILE" });
    assert.equal(m.description, "PROSOAPE la CAIAN TEXTILE: 18 produse, de la 8,63 lei. Subcategoria: Prosoape Hotel.");
    assert.equal(og(m).description, m.description);
    assert.equal(tw(m).description, m.description);
    assert.ok(!("robots" in m));
  });

  test("dupa id (linkurile de meniu) si fara litere mari: acelasi rezultat", async () => {
    const dupaNume = await caian({ cat: "PROSOAPE" });
    for (const c of [id(1), "prosoape"]) {
      const m = await caian({ cat: c });
      assert.deepEqual(m.alternates, dupaNume.alternates);
      assert.equal(m.description, dupaNume.description);
    }
  });

  test("`sale` si `page` raman in canonical", async () => {
    const m = await caian({ cat: "PROSOAPE", page: "2" });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin/prosoape?page=2" });
  });

  test("decizia 6: categoria fara produse e `noindex`, ca pagina spre care arata", async () => {
    const m = await caian({ cat: "HOME & DECO" });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin/home-deco" });
    assert.deepEqual(m.robots, { index: false, follow: true });
  });

  test("⚠ TVA-ul, comutatoarele si sortarea magazinului ajung pana in RPC si in text, ca pe pagina tinta", async () => {
    /*
     * Cu implicitele (fara TVA, fara comutatoare, fara sortare) orice argument pierdut pe drum
     * dadea acelasi rezultat, deci trecea neobservat. eSAFE e exact pe ramura asta: pagina de
     * catalog, preturi fara TVA si epuizatele ascunse.
     */
    const { rezultat, a, b } = await cuApeluri(() => caian({ cat: "PROSOAPE" }, {
      faraTva: true,
      pageContent: { hide_out_of_stock_products: true, sort_options: { default_sort: "price_desc" } },
    }));
    assert.ok(String(rezultat.description).includes("de la 8,63 lei fără TVA"), String(rezultat.description));
    assert.equal(a[0].filtre.sortare, "price_desc");
    assert.ok(a.length + b.length > 0);
    for (const x of [...a, ...b]) {
      assert.equal(x.filtre.faraStocAscuns, true);
      assert.equal(x.filtre.faraImagini, false);
    }
    // Sortarea paginii de catalog, din design, bate `default_sort`: ca in `metadataMagazin`.
    const { a: cuDesign } = await cuApeluri(() => caian({ cat: "PROSOAPE" }, {
      design: cuCatalog({ sortareImplicita: "name_asc" }),
      pageContent: { sort_options: { default_sort: "price_desc" } },
    }));
    assert.equal(cuDesign[0].filtre.sortare, "name_asc");
  });
});

describe("ramura 4: cu pagina de catalog, fara categorie", () => {
  test("`caian/?page=2`: canonical `/magazin?page=2`, cu titlul si textul catalogului (subtitlul)", async () => {
    const m = await caian({ page: "2" });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin?page=2" });
    assert.deepEqual(m.title, { absolute: "Toate produsele | CAIAN TEXTILE" });
    assert.equal(m.description, SUBTITLU_CAIAN);
  });

  test("`caian/?sale=1`: textul reducerilor, nu subtitlul (ar fi dublat pagina fara reduceri)", async () => {
    const { rezultat, a } = await cuApeluri(() => caian({ sale: "1" }));
    assert.deepEqual(rezultat.alternates, { canonical: "https://caian-textile.ro/magazin?sale=1" });
    assert.equal(rezultat.description, "Reduceri: Catalogul CAIAN TEXTILE: 41 de produse.");
    assert.equal(a[0].filtre.reduceri, true);
    // Sortarea grilei canonicalului: nici designul, nici `default_sort` nu spun altceva.
    assert.equal(a[0].filtre.sortare, "newest");
  });
});

describe("ramura 5: fara pagina de catalog, categoria exista", () => {
  test("`ralls/?cat=Rochii`: titlul si textul categoriei, canonical propriu", async () => {
    const m = await ralls({ cat: "Rochii" });
    assert.deepEqual(m.title, { absolute: "Rochii | RALLS" });
    assert.deepEqual(m.alternates, { canonical: "https://ralls.ro?cat=Rochii" });
    assert.equal(m.description, "Rochii la RALLS: 40 de produse, de la 89 lei. Subcategoria: Rochii de seara.");
    assert.notEqual(m.description, RALLS_ACASA.descriere);
    assert.ok(!("robots" in m));
  });

  test("canonicalul poarta numele REAL, codificat ca in linkuri, cu `sale` si `page`", async () => {
    const m = await ralls({ cat: id(11), sale: "1", page: "3" });
    assert.deepEqual(m.alternates, { canonical: "https://ralls.ro?cat=Rochii&sale=1&page=3" });
    const spatiu = await ralls({ cat: "import vechi" });
    assert.deepEqual(spatiu.alternates, { canonical: "https://ralls.ro?cat=Import%20vechi" });
  });

  test("numele purtat doar de produse (din rezumat): exista, cu textul lui", async () => {
    const m = await ralls({ cat: "Import vechi" });
    assert.deepEqual(m.title, { absolute: "Import vechi | RALLS" });
    assert.equal(m.description, "Import vechi la RALLS, de la 15 lei. Printre produse: Produs vechi și Alt produs vechi.");
  });

  test("comutatoarele, sortarea grilei paginii principale si TVA-ul ajung in RPC si in text", async () => {
    const { rezultat, a, b } = await cuApeluri(() => ralls({ cat: "Rochii" }, { faraTva: true }));
    assert.ok(String(rezultat.description).includes("de la 89 lei fără TVA"), String(rezultat.description));
    // Asezarea paginii principale („pret crescator"), nu sortarea paginii de catalog.
    assert.equal(a[0].filtre.sortare, "price_asc");
    for (const x of [...a, ...b]) {
      assert.equal(x.filtre.faraImagini, true);
      assert.equal(x.filtre.faraStocAscuns, false);
    }
  });

  test("decizia 6: categoria fara produse e `noindex`", async () => {
    const m = await ralls({ cat: "Goale" });
    assert.equal(m.description, "Goale la RALLS.");
    assert.deepEqual(m.robots, { index: false, follow: true });
  });
});

describe("ramura 6: fara pagina de catalog, fara categorie", () => {
  test("`ralls/?page=2`: titlul cu „(pagina 2)”, textul catalogului, canonical propriu", async () => {
    const m = await ralls({ page: "2" });
    assert.deepEqual(m.title, { absolute: "RALLS - Bucuresti (pagina 2)" });
    assert.deepEqual(m.alternates, { canonical: "https://ralls.ro?page=2" });
    // Radacinile cu produse (fara „Goale", fara „Stinsa"), plus orfana din rezumat.
    assert.equal(m.description, "Catalogul RALLS: 120 de produse în 3 categorii: Rochii, Bluze și Import vechi.");
  });

  test("`ralls/?sale=1&page=3`: „Reduceri” in titlu si in text", async () => {
    const m = await ralls({ sale: "1", page: "3" });
    assert.deepEqual(m.title, { absolute: "Reduceri | RALLS - Bucuresti (pagina 3)" });
    assert.deepEqual(m.alternates, { canonical: "https://ralls.ro?sale=1&page=3" });
    assert.ok(String(m.description).startsWith("Reduceri: Catalogul RALLS"), String(m.description));
  });
});

describe("pe toate ramurile", () => {
  test("⚠ niciodata descrierea din Setari > SEO pe o adresa care nu e pagina principala", async () => {
    for (const m of [await caian({ cat: "PROSOAPE" }), await caian({ page: "2" }), await caian({ sale: "1" })]) {
      assert.notEqual(m.description, DESCRIERE_ACASA_CAIAN);
    }
    /*
     * Si pe ramurile 5 si 6 (fara pagina de catalog). Fixtura ralls n-are Setari > SEO, deci
     * acolo o descriere a paginii principale pusa inapoi nu se vedea la rulare: o prindea doar
     * proba de sursa. Aici ralls primeste una.
     */
    const seo = { description: "Descrierea paginii principale RALLS, scrisa in Setari > SEO." };
    for (const sp of [{ cat: "Rochii" }, { page: "2" }] as Sp[]) {
      const m = await ralls(sp, { seo, pageContent: { hide_products_without_images: true, home_order: { mod: "price_asc" }, seo } });
      assert.notEqual(m.description, seo.description, JSON.stringify(sp));
      assert.ok(String(m.description).startsWith(sp.cat ? "Rochii la RALLS" : "Catalogul RALLS"), String(m.description));
    }
  });

  test("`noindex` din Setari > SEO ramane, pe oricare ramura", async () => {
    for (const m of [
      await caian({ cat: "PROSOAPE" }, { seo: { noindex: true } }),
      await ralls({ page: "2" }, { seo: { noindex: true } }),
      await ralls({ cat: "zzz" }, { seo: { noindex: true } }),
    ]) {
      assert.deepEqual(m.robots, { index: false, follow: true });
    }
  });

  test("⚠ nicio valoare `undefined`", async () => {
    const toate = [
      await ralls({ cat: "Rochii" }, { acasa: { titlu: "P", descriere: "D", imagini: [] }, unSingurProdus: true }),
      await ralls({ cat: "zzz" }),
      await caian({ cat: "PROSOAPE" }),
      await caian({ page: "2" }),
      await ralls({ cat: "Rochii", q: "a", stoc: "1" }),
      await ralls({ page: "2" }),
    ];
    for (const m of toate) assert.deepEqual(nedefinite(m), [], JSON.stringify(m));
  });
});

/*
 * ═══ `metadataPaginiiPrincipale`: GARDA ADRESELOR FILTRATE, RULATA ═══
 *
 * Corpul lui `generateMetadata` din `[slug]/page.tsx`. Garda (`esteAcasaFiltrata`, apoi
 * `if (filtrata)`) decide canonicalul paginii principale la TOATE magazinele: rupta intr-o
 * parte, adresele filtrate primesc iar textul paginii principale; rupta in cealalta, pagina
 * principala a oricarui magazin cu pagina de catalog arata canonical catre `/magazin`.
 */

/** Produsul magazinului „un singur produs", cum il da `getStoreProduct`; restul: sters sau stins. */
const produseCerute: string[] = [];
const incarcaProdus = async (businessId: string, productId: string) => {
  produseCerute.push(`${businessId}/${productId}`);
  return businessId === B_RALLS && productId === P_UNIC
    ? { name: "Lampa Aurora", description: "Lampa de veghe din lemn de fag, lucrata manual.", images: ["https://cdn.tld/lampa.webp"], page_sections: { short_description: "Lampa de veghe din lemn." } }
    : null;
};
const principala = (slug: string, sp: Sp = {}) => metadataPaginiiPrincipale({ slug, sp, incarcaProdus });

describe("metadataPaginiiPrincipale", () => {
  test("⚠ pagina principala NEfiltrata isi pastreaza canonicalul, titlul si descrierea, cu sau fara pagina de catalog", async () => {
    // Cautarea, pagina 1 si parametrii de reclama nu filtreaza nimic.
    for (const sp of [{}, { q: "prosop" }, { page: "1" }, { utm_source: "fb", gclid: "x" }] as Sp[]) {
      const m = await principala("caian-textile", sp);
      assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro" }, JSON.stringify(sp));
      assert.deepEqual(m.title, { absolute: TITLU_ACASA_CAIAN });
      assert.equal(m.description, DESCRIERE_ACASA_CAIAN);
      assert.equal(og(m).url, "https://caian-textile.ro");
      assert.ok(!("robots" in m));
    }
    const r = await principala("ralls");
    assert.deepEqual(r.alternates, { canonical: "https://ralls.ro" });
    assert.deepEqual(r.title, { absolute: "RALLS - Bucuresti" });
    // Fara Setari > SEO: sloganul (`deriveStoreDescription`).
    assert.equal(r.description, "Rochii si bluze de designer.");
  });

  test("⚠ adresele filtrate primesc metadata lor, pe ambele feluri de magazin", async () => {
    const cat = await principala("caian-textile", { cat: "PROSOAPE" });
    assert.deepEqual(cat.alternates, { canonical: "https://caian-textile.ro/magazin/prosoape" });
    assert.deepEqual(cat.title, { absolute: "PROSOAPE | CAIAN TEXTILE" });
    assert.equal(cat.description, "PROSOAPE la CAIAN TEXTILE: 18 produse, de la 8,63 lei. Subcategoria: Prosoape Hotel.");
    assert.deepEqual((await principala("caian-textile", { page: "2" })).alternates, { canonical: "https://caian-textile.ro/magazin?page=2" });
    assert.deepEqual((await principala("caian-textile", { sale: "1" })).alternates, { canonical: "https://caian-textile.ro/magazin?sale=1" });

    const rochii = await principala("ralls", { cat: "Rochii" });
    assert.deepEqual(rochii.alternates, { canonical: "https://ralls.ro?cat=Rochii" });
    assert.deepEqual(rochii.title, { absolute: "Rochii | RALLS" });
    // TVA-ul din `store_settings` ajunge pana in text (`preturiFaraTva(settings)`).
    assert.ok(String(rochii.description).includes("de la 89 lei fără TVA"), String(rochii.description));
    // Cu comutatoarele magazinului, „Rochii" are produse: indexabila.
    assert.ok(!("robots" in rochii), JSON.stringify(rochii.robots));
    const p2 = await principala("ralls", { page: "2" });
    assert.deepEqual(p2.title, { absolute: "RALLS - Bucuresti (pagina 2)" });
    assert.deepEqual(p2.alternates, { canonical: "https://ralls.ro?page=2" });
  });

  test("magazinul „un singur produs”: pagina principala e produsul, si pe adresele filtrate", async () => {
    const de = produseCerute.length;
    for (const sp of [{}, { cat: "Rochii" }, { page: "3" }] as Sp[]) {
      const m = await principala("lampa", sp);
      assert.deepEqual(m.alternates, { canonical: "https://lampa.ro" }, JSON.stringify(sp));
      assert.deepEqual(m.title, { absolute: "Lampa Aurora" });
      assert.equal(m.description, "Lampa de veghe din lemn.");
      assert.deepEqual(og(m).images, ["https://cdn.tld/lampa.webp"]);
    }
    const cerute = produseCerute.slice(de);
    assert.equal(cerute.length, 3);
    assert.ok(cerute.every((x) => x === `${B_RALLS}/${P_UNIC}`), cerute.join(", "));
    /*
     * Filtrata sau nu, EXACT acelasi obiect. Ramura 1 din `metadataAcasaFiltrata` nu are voie
     * sa scrie altceva decat pagina produsului. ⚠ De aceea garda `if (filtrata)` de pe ramura
     * produsului nu se poate proba pe iesire: scoasa sau intoarsa, cele doua drumuri dau
     * acelasi rezultat (mutant echivalent). Proba tine ca ele sa ramana la fel.
     */
    const nefiltrata = await principala("lampa");
    for (const sp of [{ cat: "Rochii" }, { page: "3" }, { sale: "1" }] as Sp[]) {
      assert.deepEqual(await principala("lampa", sp), nefiltrata, JSON.stringify(sp));
    }
  });

  test("produsul ales lipseste: metadata magazinului", async () => {
    const m = await principala("lampa-stinsa");
    assert.deepEqual(m.alternates, { canonical: "https://lampa-veche.ro" });
    assert.deepEqual(m.title, { absolute: "Lampa Veche" });
    assert.equal(m.description, "Cumpara din Lampa Veche online.");
  });

  test("nepublicat: niciodata indexabil; slug inexistent: nimic", async () => {
    assert.deepEqual((await principala("nepublicat")).robots, { index: false, follow: false });
    assert.deepEqual(await principala("nu-exista-deloc"), {});
  });

  test("⚠ nicio valoare `undefined`", async () => {
    const cazuri: [string, Sp][] = [
      ["caian-textile", {}], ["caian-textile", { cat: "PROSOAPE" }], ["ralls", {}], ["ralls", { page: "2" }],
      ["lampa", {}], ["lampa", { cat: "Rochii" }], ["lampa-stinsa", {}],
    ];
    for (const [slug, sp] of cazuri) {
      const m = await principala(slug, sp);
      assert.deepEqual(nedefinite(m), [], `${slug} ${JSON.stringify(sp)}: ${JSON.stringify(m)}`);
    }
  });
});
