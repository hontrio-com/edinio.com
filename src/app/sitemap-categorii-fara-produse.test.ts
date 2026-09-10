import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { citesteDateMagazin, intrariMagazin, type DateMagazinPentruSitemap } from "./sitemap";
import { potrivesteCategorie } from "@/lib/storefront/catalog/metadata-magazin";
import { subarboreAreProduse } from "@/lib/storefront/catalog/descriere-generata";
import { categoriiVizibile } from "@/lib/categories/vizibilitate";
import { slugCategorie } from "@/lib/storefront/category-href";
import { DESIGN_VERSION } from "@/lib/storefront/design/types";

/*
 * ═══ DECIZIA 6 IN SITEMAP (10.09.2026) ═══
 *
 * Categoria al carei subarbore n-are niciun produs poarta `noindex, follow` pe pagina ei
 * (`metadata-magazin.ts`) si iese din sitemap, dupa O SINGURA regula,
 * `subarboreAreProduse`. Despartite, pagina ar spune `noindex` iar sitemapul ar anunta-o:
 * exact contradictia pe care Search Console o raporteaza ca eroare.
 *
 * Trei feluri de probe:
 *   - `intrariMagazin` (pur): ce iese, ce ramane, si ca `null` (rezumat necitit) nu scoate
 *     nimic;
 *   - CUSATURA cu pagina: pentru fiecare segment, sitemapul hotaraste exact ce hotaraste
 *     pagina, cu functiile CHIAR ale paginii (`potrivesteCategorie`, apoi regula);
 *   - `citesteDateMagazin` rulata CHIAR ea, pe o baza de proba (PostgREST in proces, ca in
 *     `metadata-magazin.test.ts`): randul de rezumat al comutatoarelor magazinului si
 *     categoriile in ordinea paginii. Baza nu e mai darnica decat Postgres: doar coloanele
 *     cerute, iar fara `order` randurile vin INVERS.
 */

const BAZA = "https://caian-textile.ro";
const DESIGN_CU_CATALOG = { version: DESIGN_VERSION, chrome: {}, home: [], shop: { page: { id: "shop_page", kind: "shop_page", variant: "toolbar", settings: {} } } };
const DESIGN_FARA_CATALOG = { version: DESIGN_VERSION, chrome: {}, home: [], shop: { page: { id: "shop_page", kind: "shop_page", variant: "none", settings: {} } } };

type Cat = DateMagazinPentruSitemap["categorii"][number];

const magazin = (pageContent: Record<string, unknown> = {}, design: unknown = DESIGN_CU_CATALOG) => ({
  updated_at: "2026-09-01T10:00:00.000Z",
  store_settings: { page_content: pageContent, storefront_design: design, store_policies: {} },
});

const date = (categorii: Cat[], categoriiCuProduse: readonly string[] | null): DateMagazinPentruSitemap =>
  ({ categorii, categoriiCuProduse, produse: [], pagini: [] });

/** Segmentele de categorie din sitemap, in ordinea lor. */
function segmente(d: DateMagazinPentruSitemap, biz: ReturnType<typeof magazin> = magazin()): string[] {
  const prefix = `${BAZA}/magazin/`;
  return intrariMagazin(BAZA, biz, d).map((e) => e.url).filter((u) => u.startsWith(prefix)).map((u) => u.slice(prefix.length));
}

const cat = (id: string, name: string, parent_id: string | null = null, is_active = true): Cat => ({ id, name, parent_id, is_active });

/** Arborele real caian, in ordinea din panou (vezi `metadata-magazin.test.ts`). */
const CAIAN: Cat[] = [
  cat("28b12792", "PROSOAPE"),
  cat("e9a46811", "Prosoape Hotel", "28b12792"),
  cat("c91fcc94", "Prosoape SPA", "28b12792"),
  cat("95f0ec61", "Prosoape Salon & Beauty", "28b12792"),
  cat("548d6145", "Seturi", "28b12792"),
  cat("57cfb2e9", "LENJERII DE PAT"),
  cat("4d91a107", "Cearsafuri cu elastic", "57cfb2e9"),
  cat("dea4bf88", "PERNE SI PILOTE"),
  cat("3c2f3685", "Perne Hotel", "dea4bf88"),
  cat("7bdf0bd2", "HALATE SI PAPUCI"),
  cat("17ebcfda", "Papuci Hotelieri", "7bdf0bd2"),
  cat("c042240b", "PROTECTII SI ACCESORII"),
  cat("0b0cfe52", "Protectii impermeabile saltea", "c042240b"),
  cat("da25a30e", "HOME & DECO"),
  cat("fe85c523", "Prosoape pentru casa", "da25a30e"),
];
/** `catalog_rezumat.categorii` caian, citit pe 10.09.2026. */
const REZUMAT_CAIAN = [
  "Cearsafuri cu elastic", "Papuci Hotelieri", "Perne Hotel", "Prosoape Hotel", "Prosoape SPA",
  "Prosoape Salon & Beauty", "Protectii impermeabile saltea", "Seturi",
];

/*
 * Doua categorii cu ACELASI segment („bratari"): pagina adresei e a PRIMEI din panou.
 * Prima e goala, a doua are produse.
 */
const COLIZIUNE: Cat[] = [cat("o2", "Brățări"), cat("o1", "Bratari"), cat("o3", "Coliere")];
const REZUMAT_COLIZIUNE = ["Bratari", "Coliere"];

/*
 * Un subarbore stins cu un nume purtat si de o categorie vizibila: „Curele" de sub
 * „Accesorii" e stinsa, cealalta „Curele" e aprinsa si are produse. Pagina „Accesorii"
 * cauta in categoriile VIZIBILE, deci n-are produse.
 */
const STINSA: Cat[] = [cat("a1", "Accesorii"), cat("a2", "Curele", "a1", false), cat("a3", "Curele")];

describe("intrariMagazin: decizia 6", () => {
  test("caian: iese HOME & DECO, cu singurul ei copil; restul raman, in ordinea din panou", () => {
    assert.equal(slugCategorie("HOME & DECO"), "home-deco", "precondita: adresa din plan");
    const s = segmente(date(CAIAN, REZUMAT_CAIAN));
    assert.ok(!s.includes("home-deco"), "home-deco e `noindex` pe pagina, deci nu se anunta");
    assert.ok(!s.includes("prosoape-pentru-casa"));
    assert.deepEqual(s, CAIAN.filter((c) => !["HOME & DECO", "Prosoape pentru casa"].includes(c.name)).map((c) => slugCategorie(c.name)));
  });

  test("parintele fara produse pe numele lui ramane cand un copil are", () => {
    assert.ok(!REZUMAT_CAIAN.includes("PROSOAPE"));
    assert.ok(segmente(date(CAIAN, REZUMAT_CAIAN)).includes("prosoape"));
  });

  test("rezumat necitit (`null`): nu stim, deci toate raman", () => {
    assert.deepEqual(segmente(date(CAIAN, null)), CAIAN.map((c) => slugCategorie(c.name)));
  });

  test("rezumat gol: nicio categorie, dar catalogul ramane", () => {
    const urluri = intrariMagazin(BAZA, magazin(), date(CAIAN, [])).map((e) => e.url);
    assert.ok(urluri.includes(`${BAZA}/magazin`));
    assert.deepEqual(segmente(date(CAIAN, [])), []);
  });

  test("⚠ segment comun: hotaraste PRIMA categorie din panou, ca pe pagina", () => {
    assert.equal(slugCategorie("Brățări"), slugCategorie("Bratari"), "precondita: acelasi segment");
    assert.deepEqual(segmente(date(COLIZIUNE, REZUMAT_COLIZIUNE)), ["coliere"]);
    // In ordinea inversa, prima are produse: segmentul intra.
    assert.deepEqual(segmente(date([COLIZIUNE[1], COLIZIUNE[0], COLIZIUNE[2]], REZUMAT_COLIZIUNE)), ["bratari", "coliere"]);
  });

  test("subarborele se cauta in categoriile VIZIBILE, nu in tot tabelul", () => {
    assert.deepEqual(segmente(date(STINSA, ["Curele"])), ["curele"]);
  });

  test("magazinul ascuns din Google nu anunta nicio categorie, oricare ar fi rezumatul", () => {
    assert.deepEqual(segmente(date(CAIAN, REZUMAT_CAIAN), magazin({ seo: { noindex: true } })), []);
  });
});

describe("cusatura cu pagina: acelasi raspuns pe fiecare segment", () => {
  /**
   * Ce hotaraste PAGINA pentru fiecare segment, cu functiile ei: `potrivesteCategorie` pe
   * categoriile vizibile, apoi regula. Segmentele pe care pagina le lasa indexabile.
   */
  function dupaPagina(categorii: Cat[], rezumat: readonly string[] | null): string[] {
    const vizibile = categoriiVizibile(categorii);
    const out: string[] = [];
    for (const seg of new Set(vizibile.map((c) => slugCategorie(c.name)).filter(Boolean))) {
      const gasita = potrivesteCategorie(vizibile, seg);
      if (!gasita) continue;
      if (subarboreAreProduse(vizibile, gasita.name, rezumat) === false) continue;
      out.push(seg);
    }
    return out;
  }

  const SCENARII: [string, Cat[], readonly string[] | null][] = [
    ["caian", CAIAN, REZUMAT_CAIAN],
    ["caian fara rezumat", CAIAN, null],
    ["caian cu rezumat gol", CAIAN, []],
    ["segment comun, prima goala", COLIZIUNE, REZUMAT_COLIZIUNE],
    ["segment comun, prima plina", [COLIZIUNE[1], COLIZIUNE[0], COLIZIUNE[2]], REZUMAT_COLIZIUNE],
    ["subarbore stins", STINSA, ["Curele"]],
    // atelierul-larisei: un nume e si radacina, si propriul ei copil.
    ["nume care e si propriul copil", [cat("r1", "Obiecte personalizate"), cat("r2", "Obiecte personalizate", "r1"), cat("r3", "Cani", "r2")], ["Cani"]],
  ];

  for (const [nume, categorii, rezumat] of SCENARII) {
    test(nume, () => {
      assert.deepEqual(segmente(date(categorii, rezumat)), dupaPagina(categorii, rezumat));
    });
  }
});

/* ─── `citesteDateMagazin`, rulata pe o baza de proba ─────────────────────── */

const B_ESAFE = "b2000000-0000-4000-8000-000000000001";
const B_ORDINE = "b2000000-0000-4000-8000-000000000002";
const B_CADE = "b2000000-0000-4000-8000-000000000003";
const B_FARA_CATALOG = "b2000000-0000-4000-8000-000000000004";
const B_UN_PRODUS = "b2000000-0000-4000-8000-000000000005";

type Rand = Record<string, unknown>;

const CATEGORII: Rand[] = [
  // eSAFE isi ascunde produsele epuizate: numai randul (false, true) are „Bocanci".
  { business_id: B_ESAFE, id: "e1", name: "Incaltaminte de protectie", parent_id: null, sort_order: 0, is_active: true },
  { business_id: B_ESAFE, id: "e2", name: "Bocanci", parent_id: "e1", sort_order: 0, is_active: true },
  { business_id: B_ESAFE, id: "e3", name: "Manusi", parent_id: null, sort_order: 1, is_active: true },
  /*
   * Ordinea din panou (`sort_order`) e alta decat a id-urilor, si alta decat a
   * randurilor inversate: numai `sort_order, id` pune „Brățări" (goala) inaintea lui
   * „Bratari" (plina), ca pagina.
   */
  { business_id: B_ORDINE, id: "o2", name: "Brățări", parent_id: null, sort_order: 0, is_active: true },
  { business_id: B_ORDINE, id: "o1", name: "Bratari", parent_id: null, sort_order: 1, is_active: true },
  { business_id: B_ORDINE, id: "o3", name: "Coliere", parent_id: null, sort_order: 2, is_active: true },
  { business_id: B_CADE, id: "k1", name: "Goala", parent_id: null, sort_order: 0, is_active: true },
  { business_id: B_FARA_CATALOG, id: "f1", name: "Flori", parent_id: null, sort_order: 0, is_active: true },
];

const rez = (business_id: string, fara_imagini: boolean, fara_stoc_ascuns: boolean, categorii: string[]): Rand =>
  ({ business_id, fara_imagini, fara_stoc_ascuns, categorii, total: 0, price_min: "0", price_max: "0", fatete: { jetoane: [], fatete: [] } });

/** Patru randuri pe magazin, cate unul pe combinatie de comutatoare, cu liste diferite. */
const REZUMATE: Rand[] = [
  rez(B_ESAFE, false, false, ["Manusi"]),
  rez(B_ESAFE, false, true, ["Bocanci"]),
  rez(B_ESAFE, true, false, []),
  rez(B_ESAFE, true, true, []),
  rez(B_ORDINE, false, false, ["Bratari", "Coliere"]),
  rez(B_ORDINE, false, true, []),
  rez(B_ORDINE, true, false, []),
  rez(B_ORDINE, true, true, []),
];

const PRODUSE: Rand[] = [
  { business_id: B_ESAFE, id: "p1", slug: "bocanci-s3", updated_at: "2026-08-20T00:00:00.000Z", is_active: true },
  { business_id: B_ESAFE, id: "p2", slug: null, updated_at: null, is_active: true },
  { business_id: B_UN_PRODUS, id: "p3", slug: "unicul", updated_at: null, is_active: true },
];

const PAGINI: Rand[] = [
  { business_id: B_ESAFE, id: "g1", slug: "despre", updated_at: null, seo: {}, is_published: true },
];

/** Un filtru PostgREST: `eq.`, `is.null`, `not.is.null`. Orice alt operator e o eroare de proba. */
function trece(r: Rand, k: string, v: string): boolean {
  if (v.startsWith("eq.")) return String(r[k]) === v.slice(3);
  if (v === "is.null") return r[k] === null || r[k] === undefined;
  if (v === "not.is.null") return r[k] !== null && r[k] !== undefined;
  throw new Error(`operator neasteptat: ${k}=${v}`);
}

/** Raspunsul unui GET: filtre, `order`, `offset`/`limit`, doar coloanele din `select`. */
function raspunde(randuri: Rand[], url: URL): Rand[] {
  let out = randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (!trece(r, k, v)) return false;
    }
    return true;
  });
  const ordine = url.searchParams.get("order");
  if (ordine) {
    const chei = ordine.split(",").map((o) => o.split(".")[0]);
    out = [...out].sort((a, b) => {
      for (const col of chei) {
        const x = a[col] as string | number, y = b[col] as string | number;
        if (x < y) return -1;
        if (x > y) return 1;
      }
      return 0;
    });
  } else {
    out = [...out].reverse();
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : out.length;
  out = out.slice(offset, offset + limit);
  const select = url.searchParams.get("select");
  if (!select || select === "*") return out;
  const coloane = select.split(",").map((c) => c.trim());
  return out.map((r) => Object.fromEntries(coloane.filter((c) => c in r).map((c) => [c, r[c]])));
}

/** Fiecare cerere primita: cale + interogare, decodata. */
const jurnal: string[] = [];

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  jurnal.push(url.pathname + decodeURIComponent(url.search));
  const json = (cod: number, corp: unknown) => {
    res.writeHead(cod, { "content-type": "application/json" });
    res.end(JSON.stringify(corp));
  };
  try {
    if (url.pathname === "/rest/v1/categories") return json(200, raspunde(CATEGORII, url));
    if (url.pathname === "/rest/v1/products") return json(200, raspunde(PRODUSE, url));
    if (url.pathname === "/rest/v1/custom_pages") return json(200, raspunde(PAGINI, url));
    if (url.pathname === "/rest/v1/catalog_rezumat") {
      if (url.searchParams.get("business_id") === `eq.${B_CADE}`) {
        return json(500, { code: "XX000", message: "baza de proba: rezumatul nu raspunde" });
      }
      const r = raspunde(REZUMATE, url);
      // `maybeSingle`: ca PostgREST, un obiect cand se cere obiect, altfel lista.
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
        if (r.length === 1) return json(200, r[0]);
        return json(406, { code: "PGRST116", details: `The result contains ${r.length} rows`, message: "JSON object requested, multiple (or no) rows returned" });
      }
      return json(200, r);
    }
  } catch (e) {
    return json(400, { message: (e as Error).message });
  }
  json(404, { message: "ruta de proba necunoscuta" });
});

let adresa = "";
before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  adresa = `http://127.0.0.1:${(baza.address() as AddressInfo).port}`;
  // Clientul de serviciu (rezumatul) se face la fiecare citire din `process.env`.
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

/** Clientul vizitatorului, legat de baza de proba (in aplicatie: `createClient` de server). */
const vizitator = () =>
  createClient(adresa, "cheie-anonima-de-proba", { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Parameters<typeof citesteDateMagazin>[1];

const biz = (id: string, pageContent: Record<string, unknown> = {}, design: unknown = DESIGN_CU_CATALOG) => ({ id, ...magazin(pageContent, design) });

describe("citesteDateMagazin, rulata pe baza de proba", () => {
  test("⚠ rezumatul e randul comutatoarelor MAGAZINULUI (eSAFE ascunde epuizatele)", async () => {
    const b = biz(B_ESAFE, { hide_out_of_stock_products: true });
    const de = jurnal.length;
    const d = await citesteDateMagazin(b, vizitator());
    assert.deepEqual(d.categoriiCuProduse, ["Bocanci"]);
    const cerere = jurnal.slice(de).find((c) => c.startsWith("/rest/v1/catalog_rezumat")) ?? "";
    assert.match(cerere, /fara_imagini=eq\.false/);
    assert.match(cerere, /fara_stoc_ascuns=eq\.true/);
    assert.deepEqual(segmente(d, b), ["incaltaminte-de-protectie", "bocanci"], "Manusi are produse doar in randul fara comutatoare");
  });

  test("⚠ categoriile vin in ordinea PAGINII: segmentul comun e al primei din panou", async () => {
    const d = await citesteDateMagazin(biz(B_ORDINE), vizitator());
    assert.deepEqual(d.categorii.map((c) => c.name), ["Brățări", "Bratari", "Coliere"]);
    assert.deepEqual(segmente(d), ["coliere"]);
  });

  test("rezumatul nu raspunde: `null`, deci nu iese nicio categorie", async (t) => {
    t.mock.method(console, "error", () => {});
    const d = await citesteDateMagazin(biz(B_CADE), vizitator());
    assert.equal(d.categoriiCuProduse, null);
    assert.deepEqual(segmente(d), ["goala"]);
  });

  test("fara pagina de catalog nu se citesc nici categoriile, nici rezumatul", async () => {
    const de = jurnal.length;
    const d = await citesteDateMagazin(biz(B_FARA_CATALOG, {}, DESIGN_FARA_CATALOG), vizitator());
    const cereri = jurnal.slice(de);
    assert.ok(!cereri.some((c) => c.startsWith("/rest/v1/categories")), cereri.join("\n"));
    assert.ok(!cereri.some((c) => c.startsWith("/rest/v1/catalog_rezumat")), cereri.join("\n"));
    assert.deepEqual(d.categorii, []);
    assert.equal(d.categoriiCuProduse, null);
  });

  test("restul citirilor raman ce erau: produsele cu slug, paginile publicate; niciun produs la magazinul cu unul singur", async () => {
    const d = await citesteDateMagazin(biz(B_ESAFE, { hide_out_of_stock_products: true }), vizitator());
    assert.deepEqual(d.produse, [{ slug: "bocanci-s3", updated_at: "2026-08-20T00:00:00.000Z" }]);
    assert.deepEqual(d.pagini, [{ slug: "despre", updated_at: null, seo: {} }]);
    const de = jurnal.length;
    const unul = await citesteDateMagazin(biz(B_UN_PRODUS, { store_mode: "one_product", one_product_id: "p3" }, DESIGN_FARA_CATALOG), vizitator());
    assert.deepEqual(unul.produse, []);
    assert.ok(!jurnal.slice(de).some((c) => c.startsWith("/rest/v1/products")));
  });
});
