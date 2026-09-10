import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
// Constanta pura, fara baza: se poate importa inainte de a pune env-ul.
import { DESIGN_VERSION } from "@/lib/storefront/design/types";

/*
 * ═══ ETAPA 2: TEXTUL SCRIS DE COMERCIANT PE CATEGORIE, PRIN APELANTII ADEVARATI ═══
 *
 * Decizia proprietarului (10.09.2026): textul scris in Produse > Categorii castiga pe ORICE
 * suprafata care descrie categoria: `/magazin/<categorie>`, `/magazin?cat=`, `/?cat=` pe toate
 * ramurile lui `metadataAcasaFiltrata` si nodul `CollectionPage`. Exceptia: `?sale=1` isi
 * pastreaza textul generat al reducerilor. Paginile 2..N poarta textul paginii 1.
 *
 * Aici se ruleaza CHIAR apelantii (`metadataMagazin`, `dateStructuratePaginaCatalog`,
 * `metadataPaginiiPrincipale`) si `descriereAutomataCategoriei`, pe o baza de proba care vorbeste
 * PostgREST atat cat o intreaba ei. Nu are voie sa fie mai DARNICA decat Postgres:
 *   - intoarce doar coloanele cerute: o lista care n-a cerut coloana n-o primeste „din greseala";
 *   - fara `order`, randurile vin INVERS: o citire neordonata alege alt rand;
 *   - `.single()` pe zero randuri da 406;
 *   - cu `faraColoana` e baza de DINAINTEA migratiei: orice select care cere `seo_description`
 *     primeste 42703, ca de la PostgREST.
 *
 * ⚠ Env-ul se pune INAINTE de import: clientul se face la fiecare citire din `process.env`, iar
 * adresa bazei se afla abia dupa ce porneste serverul.
 */

const B_CAT = "b6000000-0000-4000-8000-000000000001";
const B_FARA = "b6000000-0000-4000-8000-000000000002";
const id = (n: number) => `c6000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Aceeasi adresa ca PROSOAPE, mai jos in panou, dar cu id-ul MAI MIC. */
const C_DUBLURA = id(0);
const C_PROSOAPE = id(1);
const C_HOTEL = id(2);
const C_SPA = id(3);
const C_SETURI = id(4);
const C_DECO = id(5);
const C_STINSA = id(6);
const R_ROCHII = id(11);
const R_SEARA = id(12);
const R_BLUZE = id(13);

type Rand = Record<string, unknown>;

const DESCRIERE_ACASA = "Textile hoteliere CAIAN: prosoape, lenjerii de pat și protecții saltea 100% bumbac, certificate OEKO-TEX.";
const SEO_PROSOAPE = "Prosoape hoteliere din bumbac 100%, de 500 GSM, pentru hoteluri, pensiuni și saloane. Livrare în toată țara.";
const SEO_ROCHII = "Rochii de zi și de seară, croite în atelierul nostru din București. Mărimi de la XS la XXL.";
/** Scris OCOLIND salvarea (direct prin PostgREST): peste 300, sub plafonul de 1000 al bazei. */
const LUNG = Array.from({ length: 60 }, (_, i) => `prosop${i}`).join(" ");
const MURDAR = `  <b>Prosoape SPA</b>${String.fromCharCode(0x202e)}   pentru\n saloane${String.fromCharCode(0)} `;

const cat = (b: string, cid: string, name: string, parinte: string | null, sort: number, seo: string | null, activ = true): Rand => ({
  business_id: b, id: cid, name, parent_id: parinte, image_url: null, sort_order: sort, is_active: activ, seo_description: seo,
});

const CATEGORII: Rand[] = [
  cat(B_CAT, C_PROSOAPE, "PROSOAPE", null, 0, SEO_PROSOAPE),
  cat(B_CAT, C_HOTEL, "Prosoape Hotel", C_PROSOAPE, 0, LUNG),
  cat(B_CAT, C_SPA, "Prosoape SPA", C_PROSOAPE, 1, MURDAR),
  cat(B_CAT, C_SETURI, "Seturi", C_PROSOAPE, 2, "   "),
  cat(B_CAT, C_DECO, "HOME & DECO", null, 1, null),
  // O citire ordonata doar dupa id, sau neordonata, ar alege-o pe ea in locul lui PROSOAPE.
  cat(B_CAT, C_DUBLURA, "Prosoape", C_DECO, 9, "Textul dublurii"),
  cat(B_CAT, C_STINSA, "Stinsa", null, 2, "Text ascuns", false),
  cat(B_FARA, R_ROCHII, "Rochii", null, 0, SEO_ROCHII),
  cat(B_FARA, R_SEARA, "Rochii de seara", R_ROCHII, 0, null),
  cat(B_FARA, R_BLUZE, "Bluze", null, 1, null),
  // Stinsa, cu ACEEASI adresa ca „Rochii" si mai sus in panou: n-are pagina, deci nici textul ei
  // nu are voie sa ajunga pe pagina celei vizibile.
  cat(B_FARA, id(10), "ROCHII", null, -1, "Text ascuns cu aceeasi adresa", false),
];

/** Patru randuri pe magazin; numai cel al comutatoarelor lui are categorii. */
const REZUMATE: Rand[] = [
  ...[false, true].flatMap((fi) => [false, true].map((fs) => ({
    business_id: B_CAT, fara_imagini: fi, fara_stoc_ascuns: fs,
    categorii: !fi && fs ? ["Prosoape Hotel", "Prosoape SPA", "Seturi"] : [],
  }))),
  ...[false, true].flatMap((fi) => [false, true].map((fs) => ({
    business_id: B_FARA, fara_imagini: fi, fara_stoc_ascuns: fs,
    categorii: fi && !fs ? ["Rochii de seara", "Bluze"] : [],
  }))),
].map((r) => ({ total: 0, price_min: "0", price_max: "0", fatete: { jetoane: [], fatete: [] }, ...r }));

/** [total A, primele din grila in ordinea „newest", pret B]; cheia "" = catalogul intreg. */
type Grila = [number, string[], number | null];
const GRILA: Record<string, Record<string, Grila>> = {
  [B_CAT]: {
    "": [41, ["Husa de pat", "Protectie saltea", "Perna"], 2.1],
    "PROSOAPE": [18, ["Set 3 prosoape", "Prosop alb", "Prosop verde"], 8.63],
    "Prosoape Hotel": [9, ["Prosop hotel alb", "Prosop hotel gri"], 34.79],
    "Prosoape SPA": [5, ["Prosop SPA"], 12],
    "Seturi": [3, ["Set A", "Set B", "Set C"], 20],
  },
  [B_FARA]: {
    "": [120, ["Rochie rosie", "Bluza alba"], 49.9],
    "Rochii": [40, ["Rochie rosie", "Rochie neagra", "Rochie verde"], 89],
    "Bluze": [7, ["Bluza alba"], 30],
  },
};

const designCuCatalog = {
  version: DESIGN_VERSION,
  shop: { page: { id: "pagina-magazin", kind: "shop_page", variant: "toolbar", enabled: true, settings: { subtitlu: "Subtitlul catalogului, scris anume pentru el." } } },
};

const MAGAZINE: Rand[] = [
  // Cu pagina de catalog, preturi FARA TVA, epuizatele ascunse si o sortare implicita: orice
  // argument pierdut pe drum schimba textul.
  {
    id: B_CAT, slug: "cu-catalog", business_name: "SC CAIAN SRL", store_name: "CAIAN TEXTILE", tagline: null, description: null,
    store_city: "Bucuresti", cover_url: "https://cdn.tld/caian.webp", custom_domain: "cu-catalog.ro", is_published: true,
    store_settings: {
      page_content: { seo: { description: DESCRIERE_ACASA }, hide_out_of_stock_products: true, sort_options: { default_sort: "price_desc" } },
      storefront_design: designCuCatalog, vat_enabled: true, prices_include_vat: false,
    },
  },
  // Fara pagina de catalog: categoria traieste pe `/?cat=`, cu sortarea grilei paginii principale.
  {
    id: B_FARA, slug: "fara-catalog", business_name: "RALLS SRL", store_name: "RALLS", tagline: "Rochii si bluze de designer.", description: null,
    store_city: "Bucuresti", cover_url: null, custom_domain: "fara-catalog.ro", is_published: true,
    store_settings: {
      page_content: { hide_products_without_images: true, home_order: { mod: "price_asc" } },
      storefront_design: null, vat_enabled: false, prices_include_vat: true,
    },
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
  const select = url.searchParams.get("select");
  return out.slice(offset, offset + limit).map((r) => (select && select !== "*" ? proiecteaza(r, select) : r));
}

/** Pornit: baza de DINAINTEA migratiei. */
let faraColoana = false;
/** Fiecare GET primit: cale + interogare. */
const jurnal: string[] = [];
/** Fiecare apel `catalog_pagina`, cu argumentele lui. */
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
      // Ca SQL-ul: `categorii` care nu e tablou inseamna TOT magazinul.
      const pagina = Array.isArray(f.categorii) ? String(f.categorii[0] ?? "") : "";
      const [total, produse, pret] = GRILA[String(a.p_business)]?.[pagina] ?? [0, [], null];
      if (f.stoc === true) {
        return json(200, { total, randuri: pret == null ? [] : [{ name: "ieftin", price_min: String(pret), has_range: false, fara_oferta: false }] });
      }
      // Ordinea grilei depinde de sortare: o sortare pierduta pe drum numeste alte produse.
      const ordonate = f.sortare === "newest" ? produse : [...produse].reverse();
      json(200, { total, randuri: ordonate.slice(0, Number(a.p_limit) || 20).map((name) => ({ name })) });
    });
    return;
  }
  jurnal.push(url.pathname + url.search);
  const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const intoarce = (randuri: Rand[]) => {
    if (!unul) return json(200, randuri);
    if (randuri.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return json(200, randuri[0]);
  };
  try {
    if (url.pathname === "/rest/v1/businesses") return intoarce(raspunde(MAGAZINE, url));
    if (url.pathname === "/rest/v1/categories") {
      if (faraColoana && (url.searchParams.get("select") ?? "").includes("seo_description")) {
        return json(400, { code: "42703", message: "column categories.seo_description does not exist" });
      }
      return intoarce(raspunde(CATEGORII, url));
    }
    if (url.pathname === "/rest/v1/catalog_rezumat") return intoarce(raspunde(REZUMATE, url));
    if (url.pathname === "/rest/v1/products") return intoarce([]);
  } catch (e) {
    return json(400, { message: (e as Error).message });
  }
  json(404, { message: "ruta de proba necunoscuta" });
});

let metadataMagazin: (typeof import("./metadata-magazin"))["metadataMagazin"];
let dateStructuratePaginaCatalog: (typeof import("./metadata-magazin"))["dateStructuratePaginaCatalog"];
let randulPaginiiCategoriei: (typeof import("./metadata-magazin"))["randulPaginiiCategoriei"];
let metadataPaginiiPrincipale: (typeof import("./metadata-acasa"))["metadataPaginiiPrincipale"];
let descriereAutomataCategoriei: (typeof import("./descriere-automata"))["descriereAutomataCategoriei"];
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
  ({ metadataMagazin, dateStructuratePaginaCatalog, randulPaginiiCategoriei } = await import("./metadata-magazin"));
  ({ metadataPaginiiPrincipale } = await import("./metadata-acasa"));
  ({ descriereAutomataCategoriei } = await import("./descriere-automata"));
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
const pagina = (slug: string, categorieSlug: string, sp: Sp = {}) => metadataMagazin({ slug, sp, categorieSlug });
const catalog = (slug: string, sp: Sp = {}) => metadataMagazin({ slug, sp });
const acasa = (slug: string, sp: Sp) => metadataPaginiiPrincipale({ slug, sp, incarcaProdus: async () => null });
const og = (m: Metadata) => m.openGraph as Record<string, unknown>;
const tw = (m: Metadata) => m.twitter as Record<string, unknown>;
const canonical = (m: Metadata) => (m.alternates as { canonical: string }).canonical;

/** Descrierea din `<head>`, din og si din twitter: trebuie sa fie ACELASI sir. */
function descrieri(m: Metadata): unknown[] {
  return [m.description, og(m).description, tw(m).description];
}

/**
 * Datele structurate pe care le scrie RANDAREA, prin `dateStructuratePaginaCatalog`, din
 * intrarile pe care i le da `RandeazaMagazin` (acelasi tipar ca in `metadata-magazin.test.ts`).
 */
async function randare(slug: string, numeCategorie: string, parinte: string | null, sp: Sp = {}) {
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
    products: [],
    reusitPeServer: false,
    esteCiorna: false,
    esteCautare: false,
    categorii: categorii.vizibile,
    categoriiCuProduse: rez?.categorii,
  });
}
const colectie = (ld: string | null) =>
  ld ? (JSON.parse(ld)["@graph"] as Rand[]).find((n) => n["@type"] === "CollectionPage") ?? null : null;

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

describe("`/magazin/<categorie>` si `/magazin?cat=`: textul scris castiga", () => {
  test("acelasi text in meta, og, twitter si CollectionPage; titlul ramane al categoriei", async () => {
    const m = await pagina("cu-catalog", "prosoape");
    assert.deepEqual(descrieri(m), [SEO_PROSOAPE, SEO_PROSOAPE, SEO_PROSOAPE]);
    assert.deepEqual(m.title, { absolute: "PROSOAPE | CAIAN TEXTILE" });
    assert.equal(canonical(m), "https://cu-catalog.ro/magazin/prosoape");
    assert.equal(colectie(await randare("cu-catalog", "PROSOAPE", null))?.description, SEO_PROSOAPE);
  });

  test("`/magazin?cat=` (dupa nume, dupa id, cu alte litere) si pagina 2: acelasi text", async () => {
    for (const sp of [{ cat: "PROSOAPE" }, { cat: C_PROSOAPE }, { cat: "prosoape" }] as Sp[]) {
      assert.equal((await catalog("cu-catalog", sp)).description, SEO_PROSOAPE, JSON.stringify(sp));
    }
    const p2 = await pagina("cu-catalog", "prosoape", { page: "2" });
    assert.equal(p2.description, SEO_PROSOAPE);
    assert.equal(canonical(p2), "https://cu-catalog.ro/magazin/prosoape?page=2");
    assert.equal(colectie(await randare("cu-catalog", "PROSOAPE", null, { page: "2" }))?.description, SEO_PROSOAPE);
  });

  test("⚠ pe `?sale=1` ramane textul generat al reducerilor: are alt canonical si ar dubla pagina fara reduceri", async () => {
    const m = await pagina("cu-catalog", "prosoape", { sale: "1" });
    assert.ok(String(m.description).startsWith("Reduceri: PROSOAPE la CAIAN TEXTILE"), String(m.description));
    assert.equal(colectie(await randare("cu-catalog", "PROSOAPE", null, { sale: "1" }))?.description, m.description);
  });

  test("citirea curata si taie ce s-a scris ocolind salvarea; meta = CollectionPage si atunci", async () => {
    const d = String((await pagina("cu-catalog", "prosoape-hotel")).description);
    assert.ok(d.length <= 300 && d.length > 240, String(d.length));
    assert.ok(LUNG.startsWith(d) && LUNG[d.length] === " ", "taiat prin mijlocul unui cuvant");
    assert.equal(colectie(await randare("cu-catalog", "Prosoape Hotel", "PROSOAPE"))?.description, d);
    assert.equal((await pagina("cu-catalog", "prosoape-spa")).description, "Prosoape SPA pentru saloane");
    // Doar spatii: textul automat, ca si cum n-ar fi scris nimic.
    const seturi = String((await pagina("cu-catalog", "seturi")).description);
    assert.ok(seturi.startsWith("Seturi (PROSOAPE) la CAIAN TEXTILE"), seturi);
  });

  test("⚠ doua categorii cu aceeasi adresa: textul PRIMEI din panou (`sort_order`, apoi `id`)", async () => {
    const m = await pagina("cu-catalog", "prosoape");
    assert.notEqual(m.description, "Textul dublurii");
    assert.equal(m.description, SEO_PROSOAPE);
  });

  test("categoria ascunsa n-are pagina, deci nici text", async () => {
    assert.deepEqual(await pagina("cu-catalog", "stinsa"), {});
  });
});

describe("`/?cat=` pe pagina principala: textul scris castiga pe fiecare ramura", () => {
  test("ramura 3 (cu pagina de catalog): textul si canonicalul paginii categoriei", async () => {
    const m = await acasa("cu-catalog", { cat: "PROSOAPE" });
    assert.deepEqual(descrieri(m), [SEO_PROSOAPE, SEO_PROSOAPE, SEO_PROSOAPE]);
    assert.equal(canonical(m), "https://cu-catalog.ro/magazin/prosoape");
  });

  test("⚠ ramura 5 (FARA pagina de catalog): textul scris, dupa nume sau id, si pe pagina 2; pe `?sale=1` nu", async () => {
    const m = await acasa("fara-catalog", { cat: "Rochii" });
    assert.deepEqual(descrieri(m), [SEO_ROCHII, SEO_ROCHII, SEO_ROCHII]);
    assert.equal(canonical(m), "https://fara-catalog.ro?cat=Rochii");
    assert.equal((await acasa("fara-catalog", { cat: R_ROCHII })).description, SEO_ROCHII);
    assert.equal((await acasa("fara-catalog", { cat: "Rochii", page: "2" })).description, SEO_ROCHII);
    const reduceri = String((await acasa("fara-catalog", { cat: "Rochii", sale: "1" })).description);
    assert.ok(reduceri.startsWith("Reduceri: Rochii la RALLS"), reduceri);
  });

  test("ramura 6 (fara categorie): textul catalogului, niciun text de categorie", async () => {
    const d = String((await acasa("fara-catalog", { page: "2" })).description);
    assert.ok(d.startsWith("Catalogul RALLS"), d);
  });
});

describe("citirea: tintita, tolerata, numai pentru randul paginii", () => {
  test("⚠ un singur rand, dupa id SI magazin; lista categoriilor nu cere coloana", async () => {
    const de = jurnal.length;
    await pagina("cu-catalog", "prosoape");
    const cereri = jurnal.slice(de).filter((c) => c.startsWith("/rest/v1/categories"));
    const cuColoana = cereri.filter((c) => c.includes("seo_description"));
    assert.ok(cuColoana.length >= 1, "textul nu s-a citit deloc");
    for (const c of cuColoana) {
      const q = new URL(c, "http://baza").searchParams;
      assert.equal(q.get("select"), "seo_description", c);
      assert.equal(q.get("id"), `eq.${C_PROSOAPE}`, c);
      assert.equal(q.get("business_id"), `eq.${B_CAT}`, c);
    }
    assert.ok(cereri.some((c) => !c.includes("seo_description")), "lista categoriilor nu s-a mai citit separat");
  });

  test("⚠ coloana inca lipsa (inaintea migratiei): textul automat peste tot, nimic nu cade", async (t) => {
    const erori = t.mock.method(console, "error", () => {});
    faraColoana = true;
    try {
      const m = await pagina("cu-catalog", "prosoape");
      assert.ok(String(m.description).startsWith("PROSOAPE la CAIAN TEXTILE"), String(m.description));
      assert.deepEqual(m.title, { absolute: "PROSOAPE | CAIAN TEXTILE" }, "lista categoriilor a cazut odata cu textul");
      assert.equal(colectie(await randare("cu-catalog", "PROSOAPE", null))?.description, m.description);
      const rochii = String((await acasa("fara-catalog", { cat: "Rochii" })).description);
      assert.ok(rochii.startsWith("Rochii la RALLS"), rochii);
      assert.ok(erori.mock.callCount() > 0, "citirea a cazut in tacere");
    } finally {
      faraColoana = false;
    }
  });
});

describe("descriereAutomataCategoriei: textul automat EXACT al paginii din magazin", () => {
  /** Descrierea din magazin cu textul comerciantului sters: ce apare cand alege textul automat. */
  async function faraText<T>(cid: string, fn: () => Promise<T>): Promise<T> {
    const r = CATEGORII.find((c) => c.id === cid)!;
    const salvat = r.seo_description;
    r.seo_description = null;
    try {
      return await fn();
    } finally {
      r.seo_description = salvat;
    }
  }

  test("magazin CU pagina de catalog: exact descrierea de pe `/magazin/<categorie>`, cu aceleasi argumente in RPC", async () => {
    const { rezultat: m, a: aMagazin } = await cuApeluri(() => faraText(C_PROSOAPE, () => pagina("cu-catalog", "prosoape")));
    const { rezultat: d, a: aPanou } = await cuApeluri(() => descriereAutomataCategoriei(B_CAT, C_PROSOAPE));
    assert.ok(d, "null pentru o categorie vizibila");
    assert.equal(d.text, m.description);
    assert.notEqual(d.text, SEO_PROSOAPE, "a intors textul scris, nu pe cel automat");
    assert.ok(String(d.text).includes("fără TVA"), String(d.text));
    assert.equal(d.adresa, canonical(m));
    // Previzualizarea din panou poarta titlul din `<title>`, nu unul compus a doua oara.
    assert.deepEqual(m.title, { absolute: d.titlu });
    assert.deepEqual(aPanou.map((x) => x.filtre), aMagazin.map((x) => x.filtre));
    assert.deepEqual({ ascunsa: d.ascunsa, umbritaDe: d.umbritaDe, areDomeniu: d.areDomeniu }, { ascunsa: false, umbritaDe: null, areDomeniu: true });
  });

  test("magazin FARA pagina de catalog: exact descrierea de pe `/?cat=<nume>` (ramura 5)", async () => {
    const { rezultat: m, a: aMagazin } = await cuApeluri(() => faraText(R_ROCHII, () => acasa("fara-catalog", { cat: "Rochii" })));
    const { rezultat: d, a: aPanou } = await cuApeluri(() => descriereAutomataCategoriei(B_FARA, R_ROCHII));
    assert.ok(d, "null pentru o categorie vizibila");
    assert.equal(d.text, m.description);
    assert.notEqual(d.text, SEO_ROCHII, "a intors textul scris, nu pe cel automat");
    assert.equal(d.adresa, "https://fara-catalog.ro?cat=Rochii");
    assert.equal(d.adresa, canonical(m));
    assert.deepEqual(m.title, { absolute: d.titlu });
    assert.deepEqual(aPanou.map((x) => x.filtre), aMagazin.map((x) => x.filtre));
    // Sortarea grilei paginii principale (asezarea), nu cea implicita.
    assert.equal(aPanou[0].filtre.sortare, "price_asc");
  });

  test("ascunsa: fara text, cu motivul; umbrita: fara text, cu categoria care ia pagina", async () => {
    assert.deepEqual(await descriereAutomataCategoriei(B_CAT, C_STINSA), {
      text: null, titlu: null, adresa: "https://cu-catalog.ro/magazin/stinsa", ascunsa: true, umbritaDe: null, areDomeniu: true,
    });
    assert.deepEqual(await descriereAutomataCategoriei(B_CAT, C_DUBLURA), {
      text: null, titlu: null, adresa: "https://cu-catalog.ro/magazin/prosoape", ascunsa: false,
      umbritaDe: { id: C_PROSOAPE, nume: "PROSOAPE" }, areDomeniu: true,
    });
  });

  test("categoria altui magazin, categorie sau magazin inexistent: null", async () => {
    assert.equal(await descriereAutomataCategoriei(B_CAT, R_ROCHII), null);
    assert.equal(await descriereAutomataCategoriei(B_CAT, id(999)), null);
    assert.equal(await descriereAutomataCategoriei("b6000000-0000-4000-8000-000000000999", C_PROSOAPE), null);
  });
});

describe("randulPaginiiCategoriei", () => {
  const lista = [
    { id: "a", name: "PROSOAPE" }, { id: "b", name: "Prosoape" }, { id: "c", name: "!!!" }, { id: "d", name: "???" },
  ];

  test("acelasi segment de adresa: PRIMA din lista (ordinea din panou)", () => {
    assert.equal(randulPaginiiCategoriei(lista, "Prosoape")?.id, "a");
    assert.equal(randulPaginiiCategoriei(lista, "prosoape")?.id, "a");
  });

  test("un nume fara segment (doar semne) se cauta dupa numele exact, nu se amesteca cu altele", () => {
    assert.equal(randulPaginiiCategoriei(lista, "???")?.id, "d");
    assert.equal(randulPaginiiCategoriei(lista, "!!!")?.id, "c");
  });

  test("gol sau necunoscut: niciun rand", () => {
    assert.equal(randulPaginiiCategoriei(lista, "  "), null);
    assert.equal(randulPaginiiCategoriei(lista, "Altceva"), null);
  });
});

test("⚠ nicio valoare `undefined`, pe nicio suprafata cu text scris", async () => {
  const toate = [
    await pagina("cu-catalog", "prosoape"),
    await pagina("cu-catalog", "prosoape-hotel", { page: "2" }),
    await catalog("cu-catalog", { cat: "PROSOAPE", sale: "1" }),
    await acasa("cu-catalog", { cat: "PROSOAPE" }),
    await acasa("fara-catalog", { cat: "Rochii" }),
    await acasa("fara-catalog", { cat: "Rochii", sale: "1", page: "3" }),
  ];
  for (const m of toate) assert.deepEqual(nedefinite(m), [], JSON.stringify(m));
});

test("⚠ `seo_description` se cere NUMAI tintit: niciun select din aplicatie n-o poarta langa alte coloane", () => {
  /*
   * Lista categoriilor pleaca in browser pe fiecare pagina a magazinului, iar o coloana
   * necunoscuta pica TOATA interogarea. Coloana pusa intr-un select larg ar fi trimis toate
   * descrierile in HTML si, inaintea migratiei, ar fi golit navigarea pe toate magazinele.
   * Permise: vitrina (`seo_description`, un rand) si panoul (`id, seo_description`, separat de
   * lista). Si niciun `select("*")` / `select()` pe `categories`: acela ar aduce coloana tacut.
   */
  const SRC = path.resolve(process.cwd(), "src");
  const fisiere = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return fisiere(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [p] : [];
  });
  const permise = new Set(["seo_description", "id, seo_description"]);
  const gasite: string[] = [];
  for (const f of fisiere(SRC)) {
    const text = readFileSync(f, "utf8");
    const rel = path.relative(SRC, f).replace(/\\/g, "/");
    for (const m of text.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
      if (!m[2].includes("seo_description")) continue;
      const lista = m[2].replace(/\s+/g, " ").trim();
      gasite.push(rel);
      assert.ok(permise.has(lista), `${rel}: select("${lista}")`);
    }
    const stea = /\.from\(\s*["'`]categories["'`]\s*\)((?:(?!\.from\()[\s\S]){0,300}?)\.select\(\s*(?:["'`]\*["'`])?\s*\)/.exec(text);
    assert.equal(stea, null, `${rel}: \`categories\` citita cu toate coloanele`);
  }
  assert.ok(gasite.includes("lib/storefront/catalog/seo-categorie.ts"), "citirea tintita a vitrinei a disparut");
});
