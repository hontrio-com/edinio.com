import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Metadata } from "next";
// Constanta pura, fara baza: se poate importa inainte de a pune env-ul.
import { DESIGN_VERSION } from "@/lib/storefront/design/types";

/*
 * ═══ `metadataMagazin` RULATA CHIAR EA, CU O BAZA DE PROBA ═══
 *
 * Reclamatia caian-textile.ro (10.09.2026): catalogul si fiecare categorie purtau in
 * Google descrierea PAGINII PRINCIPALE. Generatorul si incarcatorul au probele lor; aici
 * se proba APELANTUL: ce citeste, ce trimite mai departe, ce ajunge in `<head>`. Un
 * apelant care uita `faraTva`, citeste alt rand de rezumat sau pune `seo.description`
 * inapoi trece de toate celelalte probe si pica aici.
 *
 * Singurul lucru inlocuit e baza: un server HTTP local care vorbeste PostgREST atat cat
 * il intreaba metadata (`businesses`, `categories`, `catalog_rezumat`, `products`,
 * `rpc/catalog_pagina`). Nu are voie sa fie mai DARNIC decat Postgres:
 *   - intoarce doar coloanele cerute, si din `store_settings(...)` doar cele cerute;
 *   - fara `order`, randurile vin INVERS;
 *   - `.single()` pe zero randuri da 406, ca PostgREST.
 *
 * `catalog_pagina` raspunde din datele REALE caian citite pe 10.09.2026 (vezi
 * `descriere-generata.test.ts`), dupa numele paginii (primul din subarbore), si
 * inregistreaza fiecare apel, ca proba sa vada ce a trimis apelantul.
 *
 * ⚠ Env-ul se pune INAINTE de import: clientul se face la fiecare citire din
 * `process.env`, iar adresa bazei se afla abia dupa ce porneste serverul.
 */

const B_CAIAN = "b1000000-0000-4000-8000-000000000001";
const B_FARA_SUBTITLU = "b1000000-0000-4000-8000-000000000002";
const B_COPIAT = "b1000000-0000-4000-8000-000000000003";
const B_ESAFE = "b1000000-0000-4000-8000-000000000004";
const B_FARA_REZUMAT = "b1000000-0000-4000-8000-000000000005";
const B_NEPUBLICAT = "b1000000-0000-4000-8000-000000000006";
const B_SLOGAN = "b1000000-0000-4000-8000-000000000007";
const B_ASCUNS = "b1000000-0000-4000-8000-000000000008";
const AI_CAIAN = [B_CAIAN, B_FARA_SUBTITLU, B_COPIAT, B_FARA_REZUMAT, B_SLOGAN, B_ASCUNS];

type Rand = Record<string, unknown>;

const DESCRIERE_ACASA_CAIAN = "Textile hoteliere CAIAN: prosoape, lenjerii de pat și protecții saltea 100% bumbac, certificate OEKO-TEX. Livrare rapidă în România, prețuri speciale HoReCa.";
const SUBTITLU_CAIAN = "Prosoape, lenjerii de pat si protectii saltea certificate OEKO-TEX, pentru hoteluri, pensiuni si uz casnic.";

/** Arborele real caian, ordonat ca in panou (id, nume, parinte). */
const CAIAN: [string, string, string | null][] = [
  ["28b12792-fc10-4d4a-9c1a-0749a33d0448", "PROSOAPE", null],
  ["e9a46811-ae3c-42ba-a47c-37f0f0f0ba74", "Prosoape Hotel", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["c91fcc94-ddde-4552-a120-2bb759f082d0", "Prosoape SPA", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["95f0ec61-2348-4005-be02-6bc3d60b1b2f", "Prosoape Salon & Beauty", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["548d6145-bca9-4a4b-b2fc-d33ec687e989", "Seturi", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["57cfb2e9-6892-451e-bcd1-549dca073e11", "LENJERII DE PAT", null],
  ["4d91a107-aa23-4001-988d-f23a0cdfbfc6", "Cearsafuri cu elastic", "57cfb2e9-6892-451e-bcd1-549dca073e11"],
  ["dea4bf88-d859-4240-a7e0-7e001ac48aee", "PERNE SI PILOTE", null],
  ["3c2f3685-981b-4625-bc94-ee6b31d15ecf", "Perne Hotel", "dea4bf88-d859-4240-a7e0-7e001ac48aee"],
  ["7bdf0bd2-b802-4360-9643-7b3616e3a5be", "HALATE SI PAPUCI", null],
  ["17ebcfda-9679-47be-ae73-2819a066d65c", "Papuci Hotelieri", "7bdf0bd2-b802-4360-9643-7b3616e3a5be"],
  ["c042240b-4334-43d6-9f3e-99bc05927935", "PROTECTII SI ACCESORII", null],
  ["0b0cfe52-1e8d-443d-8424-7d40f6111202", "Protectii impermeabile saltea", "c042240b-4334-43d6-9f3e-99bc05927935"],
  ["da25a30e-b683-498a-ab06-026b843545b2", "HOME & DECO", null],
  ["fe85c523-04a5-4612-8eb7-d6a579351ab7", "Prosoape pentru casa", "da25a30e-b683-498a-ab06-026b843545b2"],
];
const REZUMAT_CAIAN = [
  "Cearsafuri cu elastic", "Papuci Hotelieri", "Perne Hotel", "Prosoape Hotel", "Prosoape SPA",
  "Prosoape Salon & Beauty", "Protectii impermeabile saltea", "Seturi",
];

/** [total A, primele 3 din grila, pret B, has_range B]; cheia "" = catalogul intreg. */
type Grila = [number, string[], number | null, boolean];
const GRILA_CAIAN: Record<string, Grila> = {
  "": [41, ["Husa de Pat CAIAN Elastic Jersey 100% Bumbac 140x200 cm Alb", "Protectie Saltea Caian Impermeabila cu Fermoar 180x200 cm Alba", "Protectie Saltea Caian Impermeabila cu Fermoar 90x200 cm Alba"], 2.1, false],
  "PROSOAPE": [18, ["Set 3 Prosoape CAIAN Greek Border Albastru 50x90 cm - 500 GSM", "Set 5 Prosoape CAIAN Greek Border Albastru 30x50 cm - 500 GSM", "Set 3 Prosoape CAIAN Greek Border Verde 50x90 cm - 500 GSM"], 8.63, false],
  "Prosoape Salon & Beauty": [9, ["Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM", "Prosop CAIAN Greek Border Verde 30x50 cm - 500 GSM", "Prosop CAIAN Greek Border Verde 50x90 cm - 500 GSM"], 8.63, false],
  "HOME & DECO": [0, [], null, false],
  "Orfana veche": [1, ["Produs vechi"], 12, false],
};
/** Aceleasi pagini pe `?sale=1`: alta felie, deci alt numar si alt pret. */
const GRILA_CAIAN_REDUCERI: Record<string, Grila> = {
  "": [6, ["Prosop redus"], 15.58, false],
  "PROSOAPE": [3, ["Prosop redus"], 15.58, false],
};
const GRILA_ESAFE: Record<string, Grila> = {
  "Bocanci": [214, ["Metatarsal S3 M SRC", "Welder S3 HRO SRA", "Bocanci Iarna"], 63.07, false],
};

/**
 * Designul publicat, cu pagina de catalog aprinsa si reglajele ei.
 *
 * ⚠ Fara `version`, parserul il ia drept design nematerializat si randeaza „classic",
 * adica FARA pagina de catalog: subtitlul si sortarea n-ar mai fi citite deloc.
 */
const design = (settings: Rand) => ({
  version: DESIGN_VERSION,
  shop: { page: { id: "pagina-magazin", kind: "shop_page", variant: "toolbar", enabled: true, settings } },
});

const setari = (peste: Rand = {}): Rand => ({
  page_content: { seo: { description: DESCRIERE_ACASA_CAIAN } },
  storefront_design: design({ subtitlu: SUBTITLU_CAIAN }),
  vat_enabled: false,
  prices_include_vat: true,
  ...peste,
});

const magazin = (id: string, slug: string, peste: Rand = {}): Rand => ({
  id, slug, business_name: "SC CAIAN SRL", store_name: "CAIAN TEXTILE", tagline: null, description: null,
  store_city: "Bucuresti", cover_url: "https://cdn.tld/caian.webp", custom_domain: null, is_published: true,
  store_settings: setari(),
  ...peste,
});

const MAGAZINE: Rand[] = [
  magazin(B_CAIAN, "caian-textile", { custom_domain: "caian-textile.ro" }),
  // Fara subtitlu, cu o sortare implicita a paginii de catalog: descrierea trebuie sa
  // numeasca produsele in ORDINEA grilei, deci sortarea ajunge pana in RPC.
  magazin(B_FARA_SUBTITLU, "caian-fara-subtitlu", { store_settings: setari({ storefront_design: design({ sortareImplicita: "name_asc" }) }) }),
  // Subtitlul e chiar descrierea paginii principale, scrisa altfel: nu conteaza drept text propriu.
  magazin(B_COPIAT, "caian-copiat", {
    store_settings: setari({ storefront_design: design({ subtitlu: "  textile hoteliere caian: prosoape, lenjerii de pat si protectii saltea 100% bumbac, certificate oeko-tex. livrare rapida in romania, preturi speciale horeca " }) }),
  }),
  magazin(B_ESAFE, "esafe", {
    store_name: "eSAFE.ro - Echipamente protectia muncii", custom_domain: "esafe.ro",
    store_settings: setari({
      page_content: { hide_out_of_stock_products: true, sort_options: { default_sort: "price_desc" } },
      storefront_design: design({}),
      vat_enabled: true,
      prices_include_vat: false,
    }),
  }),
  magazin(B_FARA_REZUMAT, "caian-fara-rezumat"),
  magazin(B_NEPUBLICAT, "nepublicat", { is_published: false }),
  // Fara Setari > SEO: descrierea paginii principale e atunci sloganul, copiat si ca
  // subtitlu al paginii de catalog. Prinde un select care uita `tagline`.
  magazin(B_SLOGAN, "caian-slogan", { tagline: SUBTITLU_CAIAN, store_settings: setari({ page_content: {} }) }),
  // Ascuns din Google din Setari > SEO: catalogul si categoriile lui la fel.
  magazin(B_ASCUNS, "caian-ascuns", {
    store_settings: setari({ page_content: { seo: { description: DESCRIERE_ACASA_CAIAN, noindex: true } } }),
  }),
];

const CATEGORII: Rand[] = [
  ...AI_CAIAN.flatMap((b) => CAIAN.map(([id, name, parent_id], i) => ({
    business_id: b, id, name, parent_id, image_url: null, sort_order: i, is_active: true,
  }))),
  { business_id: B_ESAFE, id: "e0000000-0000-4000-8000-000000000001", name: "Incaltaminte de protectie", parent_id: null, image_url: null, sort_order: 0, is_active: true },
  { business_id: B_ESAFE, id: "e0000000-0000-4000-8000-000000000002", name: "Bocanci", parent_id: "e0000000-0000-4000-8000-000000000001", image_url: null, sort_order: 0, is_active: true },
];

/** Patru randuri pe magazin, cate unul pe combinatie de comutatoare, cu liste diferite. */
const REZUMATE: Rand[] = [
  ...[B_CAIAN, B_FARA_SUBTITLU, B_COPIAT, B_SLOGAN, B_ASCUNS].flatMap((b) => [
    { business_id: b, fara_imagini: false, fara_stoc_ascuns: false, categorii: REZUMAT_CAIAN },
    { business_id: b, fara_imagini: false, fara_stoc_ascuns: true, categorii: [] },
    { business_id: b, fara_imagini: true, fara_stoc_ascuns: false, categorii: [] },
    { business_id: b, fara_imagini: true, fara_stoc_ascuns: true, categorii: [] },
  ]),
  // eSAFE isi ascunde produsele epuizate: numai randul (false, true) are „Bocanci".
  { business_id: B_ESAFE, fara_imagini: false, fara_stoc_ascuns: false, categorii: [] },
  { business_id: B_ESAFE, fara_imagini: false, fara_stoc_ascuns: true, categorii: ["Bocanci"] },
  { business_id: B_ESAFE, fara_imagini: true, fara_stoc_ascuns: false, categorii: [] },
  { business_id: B_ESAFE, fara_imagini: true, fara_stoc_ascuns: true, categorii: [] },
].map((r) => ({ total: 0, price_min: "0", price_max: "0", fatete: { jetoane: [], fatete: [] }, ...r }));

/*
 * Categoria ramasa DOAR pe produse, dintr-un import, la magazinul fara rezumat (acolo
 * randarea o gaseste tot in produse). La caian ar fi schimbat numarul real de
 * categorii din descrierea catalogului.
 */
const PRODUSE: Rand[] = [
  { business_id: B_FARA_REZUMAT, id: "p1", category: "Orfana veche", is_active: true },
  { business_id: B_FARA_REZUMAT, id: "p2", category: "PROSOAPE", is_active: true },
  { business_id: B_FARA_REZUMAT, id: "p3", category: "Ascuns", is_active: false },
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

/** Raspunsul unui GET: filtre `eq`, `order`, `offset`/`limit`, `select`. */
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
  return select && select !== "*" ? out.map((r) => proiecteaza(r, select)) : out;
}

/** Fiecare GET primit: cale + interogare. */
const jurnal: string[] = [];
/** Fiecare apel `catalog_pagina`, cu argumentele lui. */
const apeluri: { business: string; filtre: Rand; limit: unknown }[] = [];

function catalogPagina(business: string, f: Rand, limit: unknown) {
  // Ca SQL-ul: `categorii` care nu e tablou inseamna TOT magazinul.
  const pagina = Array.isArray(f.categorii) ? String(f.categorii[0] ?? "") : "";
  const tabel = business === B_ESAFE ? GRILA_ESAFE : f.reduceri === true ? GRILA_CAIAN_REDUCERI : GRILA_CAIAN;
  const [total, produse, pret, interval] = tabel[pagina] ?? [0, [], null, false];
  if (f.stoc === true) {
    return { total, randuri: pret == null ? [] : [{ name: "cel mai ieftin", price_min: String(pret), has_range: interval, fara_oferta: false }] };
  }
  return { total, randuri: produse.slice(0, Number(limit) || 20).map((name) => ({ name })) };
}

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
      const filtre = (a.p_filtre ?? {}) as Rand;
      apeluri.push({ business: String(a.p_business), filtre, limit: a.p_limit });
      json(200, catalogPagina(String(a.p_business), filtre, a.p_limit));
    });
    return;
  }
  jurnal.push(url.pathname + url.search);
  try {
    if (url.pathname === "/rest/v1/businesses") {
      const randuri = raspunde(MAGAZINE, url);
      const unul = (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
      if (!unul) return json(200, randuri);
      if (randuri.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return json(200, randuri[0]);
    }
    if (url.pathname === "/rest/v1/categories") return json(200, raspunde(CATEGORII, url));
    if (url.pathname === "/rest/v1/catalog_rezumat") {
      const r = raspunde(REZUMATE, url);
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
        if (r.length > 1) return json(406, { code: "PGRST116", message: "multiple rows" });
        return r.length ? json(200, r[0]) : json(406, { code: "PGRST116", message: "no rows" });
      }
      return json(200, r);
    }
    if (url.pathname === "/rest/v1/products") return json(200, raspunde(PRODUSE, url));
  } catch (e) {
    return json(400, { message: (e as Error).message });
  }
  json(404, { message: "ruta de proba necunoscuta" });
});

let metadataMagazin: (typeof import("./metadata-magazin"))["metadataMagazin"];
let dateStructuratePaginaCatalog: (typeof import("./metadata-magazin"))["dateStructuratePaginaCatalog"];
let categoriiMagazin: (typeof import("./context-descriere"))["categoriiMagazin"];
let rezumatMagazin: (typeof import("./context-descriere"))["rezumatMagazin"];
let preturiFaraTva: (typeof import("./descriere-generata"))["preturiFaraTva"];
let citesteSetariMagazin: (typeof import("./shop-settings"))["citesteSetariMagazin"];
let parseStoreDesign: (typeof import("@/lib/storefront/design/parse"))["parseStoreDesign"];
let citesteFiltreDinAdresa: (typeof import("./url"))["citesteFiltreDinAdresa"];

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  ({ metadataMagazin, dateStructuratePaginaCatalog } = await import("./metadata-magazin"));
  ({ categoriiMagazin, rezumatMagazin } = await import("./context-descriere"));
  ({ preturiFaraTva } = await import("./descriere-generata"));
  ({ citesteSetariMagazin } = await import("./shop-settings"));
  ({ parseStoreDesign } = await import("@/lib/storefront/design/parse"));
  ({ citesteFiltreDinAdresa } = await import("./url"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

type Sp = Record<string, string | string[] | undefined>;
const categorie = (slug: string, categorieSlug: string, sp: Sp = {}) => metadataMagazin({ slug, sp, categorieSlug });
const catalog = (slug: string, sp: Sp = {}) => metadataMagazin({ slug, sp });

const og = (m: Metadata) => m.openGraph as Record<string, unknown>;
const tw = (m: Metadata) => m.twitter as Record<string, unknown>;

/** Apelurile `catalog_pagina` facute de `fn`: A (grila) si B (pretul). */
async function cuApeluri<T>(fn: () => Promise<T>) {
  const de = apeluri.length;
  const rezultat = await fn();
  const noi = apeluri.slice(de);
  return { rezultat, a: noi.filter((x) => x.filtre.stoc !== true), b: noi.filter((x) => x.filtre.stoc === true) };
}

/** Caile din `m` la care sta o valoare `undefined`: in Next 16, o asemenea cheie STERGE mostenirea. */
function nedefinite(m: unknown, cale = ""): string[] {
  if (m === undefined) return [cale || "(radacina)"];
  if (m === null || typeof m !== "object") return [];
  return Object.entries(m as Record<string, unknown>).flatMap(([k, v]) => nedefinite(v, cale ? `${cale}.${k}` : k));
}

describe("categoriile caian: textul lor, niciodata descrierea paginii principale", () => {
  test("PROSOAPE: exact textul din plan, acelasi in meta, og si twitter", async () => {
    const m = await categorie("caian-textile", "prosoape");
    const text = "PROSOAPE la CAIAN TEXTILE: 18 produse, de la 8,63 lei. Subcategorii: Prosoape Hotel, Prosoape SPA, Prosoape Salon & Beauty și Seturi.";
    assert.equal(m.description, text);
    assert.equal(og(m).description, text);
    assert.equal(tw(m).description, text);
    assert.deepEqual(m.title, { absolute: "PROSOAPE | CAIAN TEXTILE" });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin/prosoape" });
    assert.ok(!("robots" in m), "categoria cu produse ramane indexabila");
  });

  test("Prosoape Salon & Beauty: parintele in deschidere, primul produs din grila", async () => {
    const m = await categorie("caian-textile", "prosoape-salon-beauty");
    assert.equal(m.description, "Prosoape Salon & Beauty (PROSOAPE) la CAIAN TEXTILE, de la 8,63 lei. Printre produse: Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM.");
  });

  test("⚠ descrierea din Setari > SEO nu apare pe nicio pagina de catalog", async () => {
    for (const m of [
      await categorie("caian-textile", "prosoape"),
      await categorie("caian-textile", "home-deco"),
      await catalog("caian-textile"),
      await catalog("caian-fara-subtitlu"),
      await catalog("caian-textile", { cat: "PROSOAPE" }),
    ]) {
      for (const d of [m.description, og(m).description, tw(m).description]) {
        assert.notEqual(d, DESCRIERE_ACASA_CAIAN);
        assert.ok(!String(d).includes("Textile hoteliere"), String(d));
      }
    }
  });

  /**
   * Datele structurate pe care le scrie RANDAREA, prin `dateStructuratePaginaCatalog`, din
   * intrarile pe care i le da `RandeazaMagazin`: randul de magazin, `page_content`, TVA-ul,
   * setarile paginii de catalog din designul publicat, filtrele parsate, categoriile
   * vizibile si rezumatul pentru comutatoarele magazinului. Firul din `.tsx` (ca pagina
   * chiar le da pe acestea) e verificat pe sursa, in `apelantii-descrierii.test.ts`.
   */
  async function randare(
    slug: string, numeCategorie: string, parinte: string | null, sp: Sp = {}, esteCautare = false,
    peste: { products?: Rand[]; reusitPeServer?: boolean; esteCiorna?: boolean } = {},
  ) {
    const m = MAGAZINE.find((x) => x.slug === slug)!;
    const s = m.store_settings as Rand;
    const pc = (s.page_content ?? {}) as Rand;
    const [categorii, rez] = await Promise.all([
      categoriiMagazin(String(m.id)),
      rezumatMagazin(String(m.id), pc.hide_products_without_images === true, pc.hide_out_of_stock_products === true),
    ]);
    return dateStructuratePaginaCatalog({
      business: m as never,
      pageContent: s.page_content ?? null,
      faraTva: preturiFaraTva(s as { vat_enabled?: boolean | null; prices_include_vat?: boolean | null }),
      setari: citesteSetariMagazin(parseStoreDesign(s.storefront_design ?? null, { primaryColor: "#1AB554", pageContent: {}, features: {} })),
      sp,
      filtre: citesteFiltreDinAdresa(sp, []),
      numeCategorie,
      parinteCategorie: parinte,
      products: (peste.products ?? []) as never,
      reusitPeServer: peste.reusitPeServer ?? false,
      esteCiorna: peste.esteCiorna ?? false,
      esteCautare,
      categorii: categorii.vizibile,
      categoriiCuProduse: rez?.categorii,
    });
  }
  const nodDin = (ld: string | null, tip: string) =>
    ld ? (JSON.parse(ld)["@graph"] as Rand[]).find((n) => n["@type"] === tip) ?? null : null;
  const colectie = (ld: string | null) => nodDin(ld, "CollectionPage");

  test("⚠ meta = CollectionPage: randarea, din intrarile ei, scrie EXACT textul din `<head>`", async () => {
    /*
     * Cazurile difera ANUME de implicite: parintele, subtitlul, sortarea paginii de catalog,
     * TVA-ul cu comutatorul si `default_sort` (eSAFE), reducerile, sloganul copiat. Pe
     * implicite, o categorie, un subtitlu sau o sortare pierduta pe drum ar fi dat acelasi
     * text sus si jos, deci n-ar fi picat nimic.
     */
    const cazuri: [string, () => Promise<Metadata>, () => Promise<string | null>][] = [
      ["categorie, cu parinte", () => categorie("caian-textile", "prosoape-salon-beauty"), () => randare("caian-textile", "Prosoape Salon & Beauty", "PROSOAPE")],
      ["catalogul, cu subtitlul (decizia 5)", () => catalog("caian-textile"), () => randare("caian-textile", "", null)],
      ["catalogul, cu sortarea paginii de catalog", () => catalog("caian-fara-subtitlu"), () => randare("caian-fara-subtitlu", "", null)],
      ["eSAFE: TVA, comutatorul si `default_sort`", () => categorie("esafe", "bocanci"), () => randare("esafe", "Bocanci", "Incaltaminte de protectie")],
      ["reducerile", () => catalog("caian-textile", { sale: "1" }), () => randare("caian-textile", "", null, { sale: "1" })],
      ["sloganul copiat in subtitlu", () => catalog("caian-slogan"), () => randare("caian-slogan", "", null)],
    ];
    for (const [unde, meta, ld] of cazuri) {
      const m = await meta();
      const nod = colectie(await ld());
      assert.ok(nod, `${unde}: randarea n-a scris CollectionPage`);
      assert.equal(nod.description, m.description, unde);
    }
  });

  test("⚠ `/cautare`: randarea NU scrie CollectionPage si nu plateste contextul descrierii", async () => {
    const { rezultat, a, b } = await cuApeluri(() => randare("caian-textile", "", null, { q: "prosop" }, true));
    assert.equal(rezultat, null);
    assert.equal(a.length + b.length, 0, "rezultatele cautarii au cerut RPC-urile descrierii");
    // Fara steag, aceeasi adresa ar fi descris catalogul intreg: steagul e cel care opreste.
    assert.ok(colectie(await randare("caian-textile", "", null, { q: "prosop" }, false)));
  });

  test("randarea cere contextul cu sortarea si comutatoarele MAGAZINULUI, si tace pe categoriile fara produse", async () => {
    /*
     * ⚠ Egalitatea textului singura nu prinde o sortare sau un comutator pierdut pe drum:
     * RPC-ul de proba le ignora. De aceea se verifica si ce pleaca in RPC.
     */
    const esafe = await cuApeluri(() => randare("esafe", "Bocanci", "Incaltaminte de protectie"));
    assert.equal(esafe.a[0].filtre.sortare, "price_desc");
    for (const x of [...esafe.a, ...esafe.b]) {
      assert.equal(x.filtre.faraStocAscuns, true);
      assert.equal(x.filtre.faraImagini, false);
    }
    const cuDesign = await cuApeluri(() => randare("caian-fara-subtitlu", "", null));
    assert.equal(cuDesign.a[0].filtre.sortare, "name_asc");
    // Decizia 6: categoria fara produse nu se descrie, ca in `<head>` (unde e `noindex`).
    assert.equal(await randare("caian-textile", "HOME & DECO", null), null);
  });

  test("⚠ randarea: ciorna, `?cat=`, adresa, parintele si palierul ajung pana in JSON-LD", async () => {
    /*
     * `dateStructuratePaginaCatalog` le da mai departe lui `construiesteDateCatalog`. Pierdute
     * pe drum, `<head>`-ul nu se schimba, deci nicio proba de metadata nu le vede: ciorna si
     * forma veche `?cat=` (al carei canonical e in alta parte) ar emite `CollectionPage`,
     * pagina de reduceri s-ar declara pe canonicalul FARA `sale=1`, firimiturile ar sari
     * parintele, iar pe palierul client lista ar declara drept membri ai raftului tot
     * catalogul (vezi `construiesteDateCatalog`). Gasite de mutanti, nu de recitire.
     */
    assert.equal(await randare("caian-textile", "", null, {}, false, { esteCiorna: true }), null, "ciorna nu se descrie");
    assert.equal(await randare("caian-textile", "PROSOAPE", null, { cat: "PROSOAPE" }), null, "`?cat=` isi are canonicalul pe pagina categoriei");

    // Reducerile: acelasi canonical ca `<head>`-ul, cu `sale=1`.
    const reduceri = colectie(await randare("caian-textile", "", null, { sale: "1" }));
    assert.equal(reduceri?.url, "https://caian-textile.ro/magazin?sale=1");
    assert.deepEqual((await catalog("caian-textile", { sale: "1" })).alternates, { canonical: reduceri?.url });

    // Parintele: treapta lui in firimituri, inaintea categoriei.
    const firimituri = nodDin(await randare("caian-textile", "Prosoape Salon & Beauty", "PROSOAPE"), "BreadcrumbList");
    const trepte = ((firimituri?.itemListElement ?? []) as Rand[]).map((t) => t.name);
    assert.deepEqual(trepte.slice(-2), ["PROSOAPE", "Prosoape Salon & Beauty"], JSON.stringify(trepte));

    // Palierul: lista de produse numai cand felia chiar a venit de pe server.
    const produse: Rand[] = [{ id: "p-alb", name: "Prosop alb", slug: "prosop-alb", images: ["https://cdn.tld/prosop-alb.webp"] }];
    const client = colectie(await randare("caian-textile", "PROSOAPE", null, {}, false, { products: produse, reusitPeServer: false }));
    assert.ok(client, "categoria cu produse se descrie");
    assert.ok(!("mainEntity" in client), "pe palierul client `products` e tot catalogul, nu felia paginii");
    const server = colectie(await randare("caian-textile", "PROSOAPE", null, {}, false, { products: produse, reusitPeServer: true }));
    assert.equal((server?.mainEntity as Rand | undefined)?.numberOfItems, 1);
  });

  test("`?cat=PROSOAPE` pe /magazin: canonical pe pagina categoriei, cu textul ei", async () => {
    const m = await catalog("caian-textile", { cat: "PROSOAPE" });
    const pe = await categorie("caian-textile", "prosoape");
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin/prosoape" });
    assert.equal(m.description, pe.description);
  });

  test("categoria purtata doar de produse: pagina adevarata, cu text", async () => {
    const m = await categorie("caian-fara-rezumat", "orfana-veche");
    assert.deepEqual(m.title, { absolute: "Orfana veche | CAIAN TEXTILE" });
    assert.equal(m.description, "Orfana veche la CAIAN TEXTILE: 12 lei. Produsul: Produs vechi.");
  });

  test("categorie inexistenta: nimic (ruta da 404)", async () => {
    assert.deepEqual(await categorie("caian-textile", "nu-exista"), {});
  });
});

describe("decizia 6: categoria fara niciun produs", () => {
  test("HOME & DECO: textul neutru, si `noindex, follow`", async () => {
    const m = await categorie("caian-textile", "home-deco");
    assert.equal(m.description, "HOME & DECO la CAIAN TEXTILE.");
    assert.deepEqual(m.robots, { index: false, follow: true });
  });

  test("fara rezumat: nu stim, deci pagina ramane indexabila", async () => {
    const m = await categorie("caian-fara-rezumat", "home-deco");
    assert.ok(!("robots" in m), JSON.stringify(m.robots));
  });

  test("⚠ rezumatul se citeste pentru comutatoarele MAGAZINULUI (eSAFE ascunde epuizatele)", async () => {
    const de = jurnal.length;
    const m = await categorie("esafe", "bocanci");
    assert.ok(!("robots" in m), "Bocanci are produse in randul (false, true); alt rand l-ar fi facut noindex");
    const cerere = jurnal.slice(de).find((c) => c.startsWith("/rest/v1/catalog_rezumat")) ?? "";
    assert.match(cerere, /fara_imagini=eq\.false/);
    assert.match(cerere, /fara_stoc_ascuns=eq\.true/);
  });

  test("catalogul intreg nu e niciodata `noindex` pe regula asta", async () => {
    assert.ok(!("robots" in (await catalog("caian-textile"))));
  });
});

describe("/magazin: decizia 5", () => {
  test("caian: subtitlul comerciantului, fiindca difera de pagina principala", async () => {
    const m = await catalog("caian-textile");
    assert.equal(m.description, SUBTITLU_CAIAN);
    assert.deepEqual(m.title, { absolute: "Toate produsele | CAIAN TEXTILE" });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/magazin" });
  });

  test("fara subtitlu: textul generat, cu numele categoriilor de sus", async () => {
    const m = await catalog("caian-fara-subtitlu");
    assert.equal(m.description, "Catalogul CAIAN TEXTILE: 41 de produse în 5 categorii, printre care PROSOAPE, LENJERII DE PAT, PERNE SI PILOTE și HALATE SI PAPUCI.");
  });

  test("subtitlul copiat din pagina principala nu conteaza drept text propriu", async () => {
    const m = await catalog("caian-copiat");
    assert.ok(String(m.description).startsWith("Catalogul CAIAN TEXTILE: 41 de produse"), String(m.description));
  });

  test("pe `?sale=1`: textul reducerilor, din felia lor, iar RPC-ul primeste `reduceri`", async () => {
    const { rezultat, a, b } = await cuApeluri(() => catalog("caian-textile", { sale: "1" }));
    assert.equal(rezultat.description, "Reduceri: Catalogul CAIAN TEXTILE: 6 produse.");
    assert.deepEqual(rezultat.alternates, { canonical: "https://caian-textile.ro/magazin?sale=1" });
    for (const x of [...a, ...b]) assert.equal(x.filtre.reduceri, true);
  });

  test("categoria pe `?sale=1`: prefixul si numarul reducerilor", async () => {
    const m = await categorie("caian-textile", "prosoape", { sale: "1" });
    assert.ok(String(m.description).startsWith("Reduceri: PROSOAPE la CAIAN TEXTILE, de la 15,58 lei."), String(m.description));
  });

  test("fara Setari > SEO, un subtitlu egal cu SLOGANUL nu conteaza drept text propriu", async () => {
    /*
     * Descrierea paginii principale e atunci sloganul (`deriveStoreDescription`), deci
     * subtitlul copiat din el ar fi refacut dublura. Pica daca metadata nu mai citeste
     * `tagline`: sloganul lipsa face ca subtitlul sa para text nou.
     */
    const m = await catalog("caian-slogan");
    assert.ok(String(m.description).startsWith("Catalogul CAIAN TEXTILE: 41 de produse"), String(m.description));
  });
});

describe("`noindex` din Setari > SEO", () => {
  test("catalogul si o categorie CU produse ale unui magazin ascuns din Google: `noindex, follow`", async () => {
    for (const m of [await catalog("caian-ascuns"), await categorie("caian-ascuns", "prosoape")]) {
      assert.deepEqual(m.robots, { index: false, follow: true });
    }
    // Aceeasi pagina, fara steag, e indexabila: steagul e cel care decide.
    assert.ok(!("robots" in (await categorie("caian-textile", "prosoape"))));
  });
});

describe("ce trimite apelantul mai departe", () => {
  test("sortarea: a paginii de catalog din design, apoi `default_sort`, apoi „newest”", async () => {
    const cuDesign = await cuApeluri(() => catalog("caian-fara-subtitlu"));
    assert.equal(cuDesign.a[0].filtre.sortare, "name_asc");
    const cuImplicit = await cuApeluri(() => categorie("esafe", "bocanci"));
    assert.equal(cuImplicit.a[0].filtre.sortare, "price_desc");
    const nimic = await cuApeluri(() => catalog("caian-textile"));
    assert.equal(nimic.a[0].filtre.sortare, "newest");
  });

  test("⚠ `?sort=` din adresa NU schimba descrierea: ea descrie canonicalul", async () => {
    const { a } = await cuApeluri(() => categorie("caian-textile", "prosoape", { sort: "price_asc" }));
    assert.equal(a[0].filtre.sortare, "newest");
  });

  test("categoria pleaca TABLOU, cu subarborele ei", async () => {
    const { a, b } = await cuApeluri(() => categorie("caian-textile", "prosoape"));
    for (const x of [...a, ...b]) {
      assert.ok(Array.isArray(x.filtre.categorii), "un sir ar fi insemnat TOT magazinul");
      assert.deepEqual([...(x.filtre.categorii as string[])].sort(), ["PROSOAPE", "Prosoape Hotel", "Prosoape SPA", "Prosoape Salon & Beauty", "Seturi"].sort());
    }
  });

  test("comutatoarele magazinului ajung in AMBELE apeluri", async () => {
    const { a, b } = await cuApeluri(() => categorie("esafe", "bocanci"));
    for (const x of [...a, ...b]) {
      assert.equal(x.filtre.faraStocAscuns, true);
      assert.equal(x.filtre.faraImagini, false);
    }
  });

  test(`preturi fara TVA (eSAFE): „fără TVA” langa pret`, async () => {
    const m = await categorie("esafe", "bocanci");
    assert.equal(
      m.description,
      "Bocanci (Incaltaminte de protectie) la eSAFE.ro: 214 produse, de la 63,07 lei fără TVA. Printre produse: Metatarsal S3 M SRC și Welder S3 HRO SRA.",
    );
  });

  test(`preturi cu TVA (caian): fara sufix`, async () => {
    assert.ok(!String((await categorie("caian-textile", "prosoape")).description).includes("TVA"));
  });
});

describe("/cautare", () => {
  test("`noindex, follow`, canonical fix, descriere fara termen, og si twitter complete", async () => {
    const m = await metadataMagazin({ slug: "caian-textile", sp: { q: "prosop" }, esteCautare: true });
    assert.deepEqual(m.robots, { index: false, follow: true });
    assert.deepEqual(m.alternates, { canonical: "https://caian-textile.ro/cautare" });
    assert.equal(m.description, "Caută printre produsele CAIAN TEXTILE.");
    assert.deepEqual(m.title, { absolute: "Rezultate pentru „prosop” · CAIAN TEXTILE" });
    assert.deepEqual(og(m), {
      type: "website", locale: "ro_RO", siteName: "CAIAN TEXTILE", title: "Caută · CAIAN TEXTILE",
      description: "Caută printre produsele CAIAN TEXTILE.", url: "https://caian-textile.ro/cautare",
      images: ["https://cdn.tld/caian.webp"],
    });
    for (const t of [m.description, og(m).description, og(m).title, tw(m).description, tw(m).title]) {
      assert.ok(!String(t).toLowerCase().includes("prosop"), `termenul cautat s-ar vedea in partajare: ${t}`);
    }
  });

  test("`?q=a&q=b` (tablou) nu cade, iar fara termen fila spune „Caută”", async () => {
    const m = await metadataMagazin({ slug: "caian-textile", sp: { q: ["unu", "doi"] }, esteCautare: true });
    assert.deepEqual(m.title, { absolute: "Rezultate pentru „unu” · CAIAN TEXTILE" });
    const gol = await metadataMagazin({ slug: "caian-textile", sp: {}, esteCautare: true });
    assert.deepEqual(gol.title, { absolute: "Caută · CAIAN TEXTILE" });
  });

  test("nu cere contextul descrierii: n-are ce descrie", async () => {
    const { a, b } = await cuApeluri(() => metadataMagazin({ slug: "caian-textile", sp: { q: "prosop" }, esteCautare: true }));
    assert.equal(a.length + b.length, 0);
  });
});

describe("restul", () => {
  test("magazin nepublicat: niciodata indexabil", async () => {
    const m = await catalog("nepublicat");
    assert.deepEqual(m.robots, { index: false, follow: false });
  });

  test("slug inexistent: nimic", async () => {
    assert.deepEqual(await catalog("nu-exista-deloc"), {});
  });

  test("⚠ nicio valoare `undefined`, pe nicio ramura", async () => {
    const toate = [
      await catalog("caian-textile"),
      await catalog("caian-fara-subtitlu", { page: "2" }),
      await catalog("caian-textile", { cat: "PROSOAPE", sale: "1" }),
      await catalog("caian-textile", { cat: "zzz" }),
      await categorie("caian-textile", "home-deco"),
      await categorie("esafe", "bocanci", { q: "a", stoc: "1" }),
      await metadataMagazin({ slug: "caian-textile", sp: { q: "prosop" }, esteCautare: true }),
      await metadataMagazin({ slug: "caian-textile", sp: {}, esteCautare: true }),
    ];
    for (const m of toate) assert.deepEqual(nedefinite(m), [], JSON.stringify(m));
  });
});
