import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/*
 * ═══ INCARCATORUL ADEVARAT, CU O BAZA DE PROBA ═══
 *
 * `contextDescriere` ruleaza CHIAR el, cu clientul Supabase adevarat. Singurul lucru
 * inlocuit e baza: un server HTTP local care vorbeste PostgREST atat cat il intreaba
 * incarcatorul (`categories`, `catalog_rezumat`, `rpc/catalog_pagina`).
 *
 * ⚠ Baza de proba nu are voie sa fie mai DARNICA decat Postgres, altfel probele trec
 * peste exact defectele pe care le cauta:
 *   - intoarce doar coloanele din `select` (un camp necerut vine lipsa, ca in viata);
 *   - fara `order`, intoarce randurile INVERS: Postgres nu promite nicio ordine;
 *   - filtreaza pe fiecare `eq`, iar `maybeSingle` pe mai multe randuri da EROARE;
 *   - `catalog_pagina` citeste `categorii` numai ca TABLOU, exact ca SQL-ul
 *     (`jsonb_typeof(...) = 'array'`): un sir inseamna tot magazinul.
 *
 * ⚠ Env-ul se pune INAINTE de primul apel: clientul se face la fiecare citire din
 * `process.env`, iar adresa bazei se afla abia dupa ce porneste serverul.
 */

const B = "b0000000-0000-4000-8000-000000000001";
const FARA_REZUMAT = "b0000000-0000-4000-8000-000000000002";
const RPC_CAZUT = "b0000000-0000-4000-8000-000000000003";
const TOTUL_CAZUT = "b0000000-0000-4000-8000-000000000004";

const idc = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Rand = Record<string, unknown>;

function categorii(business: string): Rand[] {
  const r = (n: number, name: string, parinte: number | null, sort: number, activ = true): Rand => ({
    business_id: business, id: idc(n), name, parent_id: parinte === null ? null : idc(parinte),
    image_url: null, sort_order: sort, is_active: activ, created_at: "2026-01-01",
  });
  return [
    r(1, "Textile", null, 0),
    r(2, "Prosoape", 1, 0),
    r(3, "Goale", 1, 1),
    r(4, "Lenjerii", 1, 2),
    r(5, "Seturi", 1, 3),
    r(6, "Seturi baie", 5, 0),
    r(10, "Accesorii", null, 1),
    // Numele care e si propriul copil, ca la atelierul-larisei.
    r(11, "Accesorii", 10, 0),
    r(12, "Brelocuri", 10, 1),
    // Acelasi nume ca 5, sub alt parinte, cu alt copil: pagina „Seturi" le arata pe amandoua.
    r(13, "Seturi", 10, 2),
    r(14, "Seturi cadou", 13, 0),
    r(20, "Stins", null, 2, false),
    r(21, "Ascuns", 20, 0),
    r(30, "Decor", null, 3),
    r(31, "Fara oferta", 30, 0),
  ];
}

const CATEGORII = [B, FARA_REZUMAT, RPC_CAZUT].flatMap(categorii);

const rezumat = (business: string, faraImagini: boolean, faraStoc: boolean, nume: string[]): Rand => ({
  business_id: business, fara_imagini: faraImagini, fara_stoc_ascuns: faraStoc,
  total: 0, price_min: "0", price_max: "0", categorii: nume, fatete: { jetoane: [], fatete: [] },
});

// Patru randuri pe magazin, cate unul pe combinatie, cu liste DIFERITE: o citire care
// uita un comutator (sau le inverseaza) se vede in subcategorii.
const TOT = ["Accesorii", "Ascuns", "Brelocuri", "Fara oferta", "Lenjerii", "Orfana", "Prosoape", "Seturi", "Seturi baie", "Seturi cadou"];
const REZUMATE = [B, RPC_CAZUT].flatMap((b) => [
  rezumat(b, false, false, TOT),
  rezumat(b, false, true, ["Accesorii", "Prosoape", "Seturi", "Seturi baie", "Seturi cadou"]),
  rezumat(b, true, false, ["Lenjerii", "Prosoape"]),
  rezumat(b, true, true, ["Prosoape"]),
]);

type Produs = {
  product_id: string; name: string; category: string | null; price_min: string; compare_at_price: string | null;
  has_range: boolean; fara_oferta: boolean; fara_stoc: boolean; are_imagine: boolean; creat: string;
  is_featured: boolean; sort_order: number;
};

let np = 0;
const p = (name: string, category: string | null, extra: Partial<Produs> = {}): Produs => ({
  product_id: `p0000000-0000-4000-8000-${String(++np).padStart(12, "0")}`,
  name, category, price_min: "10", compare_at_price: null, has_range: false, fara_oferta: false,
  fara_stoc: false, are_imagine: true, creat: `2026-01-${String(np).padStart(2, "0")}`,
  is_featured: false, sort_order: 0, ...extra,
});

// ⚠ `price_min` vine ca SIR: numeric-ul din Postgres poate ajunge text, iar descrierea
// trebuie sa-l citeasca prin `Number()`.
const PRODUSE: Produs[] = [
  p("Prosop alb", "Prosoape", { price_min: "25" }),
  p("Prosop gri", "Prosoape", { price_min: "8.63", compare_at_price: "12" }),
  p("Lenjerie dubla", "Lenjerii", { price_min: "175", fara_stoc: true }),
  p("Set 3 prosoape", "Seturi", { price_min: "40", has_range: true }),
  p("Breloc cadou", "Brelocuri", { price_min: "12", fara_stoc: true }),
  p("Accesoriu simplu", "Accesorii", { price_min: "30", are_imagine: false }),
  p("Produs orfan", "Orfana", { price_min: "5" }),
  p("Ascuns 1", "Ascuns", { price_min: "3" }),
  // In stoc, dar FARA oferta: `price_min` nu e un pret de vanzare. Cu variante, ca
  // `interval` sa arate daca s-a luat de pe randul ales sau de pe primul.
  p("Fara pret", "Fara oferta", { price_min: "1", fara_oferta: true, has_range: true }),
  p("Cu pret", "Fara oferta", { price_min: "90" }),
  p("Set baie", "Seturi baie", { price_min: "55" }),
  p("Set cadou", "Seturi cadou", { price_min: "60" }),
];
const ASCUNSE = new Set(["Ascuns"]);

/** `catalog_pagina`, cat il intreaba descrierea: aceleasi reguli ca SQL-ul din baseline. */
function catalogPagina(f: Rand, limit: unknown, offset: unknown) {
  const categoriiCerute = Array.isArray(f.categorii) ? (f.categorii as string[]) : null;
  const vizibile = PRODUSE.filter((x) =>
    (f.faraImagini !== true || x.are_imagine)
    && (f.faraStocAscuns !== true || !x.fara_stoc)
    && !(x.category && ASCUNSE.has(x.category)));
  const filtrate = vizibile.filter((x) =>
    (!categoriiCerute || (x.category !== null && categoriiCerute.includes(x.category)))
    && (f.reduceri !== true || (x.compare_at_price !== null && Number(x.compare_at_price) > Number(x.price_min)))
    && (f.stoc !== true || !x.fara_stoc));
  const dupaId = (a: Produs, b: Produs) => (a.product_id < b.product_id ? -1 : 1);
  const cmp: Record<string, (a: Produs, b: Produs) => number> = {
    price_asc: (a, b) => Number(a.price_min) - Number(b.price_min) || dupaId(a, b),
    name_asc: (a, b) => a.name.localeCompare(b.name, "ro", { numeric: true }) || dupaId(a, b),
    newest: (a, b) => (a.creat < b.creat ? 1 : a.creat > b.creat ? -1 : dupaId(a, b)),
  };
  const sortare = cmp[String(f.sortare ?? "")] ?? ((a: Produs, b: Produs) => a.sort_order - b.sort_order || dupaId(a, b));
  const lim = Math.min(Math.max(Number(limit ?? 20) || 20, 1), 96);
  const off = Math.max(Number(offset ?? 0) || 0, 0);
  return { total: filtrate.length, randuri: [...filtrate].sort(sortare).slice(off, off + lim) };
}

/** Raspunsul PostgREST la un GET: filtre `eq`, `order`, `offset`/`limit`, `select`. */
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
    const chei = ordine.split(",").map((o) => ({ col: o.split(".")[0], desc: o.split(".")[1] === "desc" }));
    out = [...out].sort((a, b) => {
      for (const { col, desc } of chei) {
        const x = a[col] as string | number, y = b[col] as string | number;
        if (x < y) return desc ? 1 : -1;
        if (x > y) return desc ? -1 : 1;
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
  if (select && select !== "*") {
    const coloane = select.split(",").map((c) => c.trim());
    out = out.map((r) => Object.fromEntries(coloane.filter((c) => c in r).map((c) => [c, r[c]])));
  }
  return out;
}

/** Fiecare GET primit de baza de proba: cale + interogare. */
const jurnal: string[] = [];
/** Fiecare apel `catalog_pagina`, cu argumentele lui. */
const apeluri: { business: string; filtre: Rand; limit: unknown; offset: unknown }[] = [];

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const json = (cod: number, corp: unknown) => {
    res.writeHead(cod, { "content-type": "application/json" });
    res.end(JSON.stringify(corp));
  };
  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/catalog_pagina") {
    let corp = "";
    req.on("data", (bucata) => (corp += bucata));
    req.on("end", () => {
      const a = JSON.parse(corp || "{}") as Rand;
      apeluri.push({ business: String(a.p_business), filtre: (a.p_filtre ?? {}) as Rand, limit: a.p_limit, offset: a.p_offset });
      if (a.p_business === RPC_CAZUT || a.p_business === TOTUL_CAZUT) return json(500, { message: "functia a picat", code: "XX000" });
      if (a.p_business !== B && a.p_business !== FARA_REZUMAT) return json(200, { total: 0, randuri: [] });
      json(200, catalogPagina((a.p_filtre ?? {}) as Rand, a.p_limit, a.p_offset));
    });
    return;
  }
  jurnal.push(url.pathname + url.search);
  if ((url.searchParams.get("business_id") ?? "") === `eq.${TOTUL_CAZUT}`) return json(500, { message: "baza a picat" });
  try {
    if (url.pathname === "/rest/v1/categories") return json(200, raspunde(CATEGORII, url));
    if (url.pathname === "/rest/v1/catalog_rezumat") return json(200, raspunde(REZUMATE, url));
  } catch (e) {
    return json(400, { message: (e as Error).message });
  }
  json(404, { message: "ruta de proba necunoscuta" });
});

let contextDescriere: (typeof import("./context-descriere"))["contextDescriere"];
let categoriiMagazin: (typeof import("./context-descriere"))["categoriiMagazin"];
let descrierePaginii: (typeof import("./descriere-generata"))["descrierePaginii"];

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  ({ contextDescriere, categoriiMagazin } = await import("./context-descriere"));
  ({ descrierePaginii } = await import("./descriere-generata"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

/** Apelurile `catalog_pagina` facute de `fn`, despartite in A (grila) si B (pretul). */
async function cuApeluri<T>(fn: () => Promise<T>) {
  const de = apeluri.length;
  const rezultat = await fn();
  const noi = apeluri.slice(de);
  return { rezultat, noi, a: noi.filter((x) => x.filtre.stoc !== true), b: noi.filter((x) => x.filtre.stoc === true) };
}

const sortat = (x: unknown) => [...(x as string[])].sort();

describe("apelurile catalog_pagina", () => {
  test("categoria pleaca TABLOU, cu subarborele REUNIT al numelui", async () => {
    const { rezultat, a, b } = await cuApeluri(() => contextDescriere(B, "Seturi", false, false, false, "name_asc", false));
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    for (const apel of [...a, ...b]) {
      assert.ok(Array.isArray(apel.filtre.categorii), "un sir ar fi insemnat TOT magazinul");
      assert.deepEqual(sortat(apel.filtre.categorii), ["Seturi", "Seturi baie", "Seturi cadou"]);
    }
    // Numarul grilei: produsele ambelor „Seturi", cu subcategoriile lor.
    assert.equal(rezultat.continut?.numar, 3);
    // Doi parinti diferiti: niciunul nu se scrie.
    assert.equal(rezultat.parinte, null);
    assert.deepEqual(rezultat.subcategorii, ["Seturi baie", "Seturi cadou"]);
  });

  test("stoc si price_asc DOAR pe B; sortarea grilei pe A; 3 randuri pe A, 20 pe B", async () => {
    const { a, b } = await cuApeluri(() => contextDescriere(B, "Textile", false, false, false, "name_asc", false));
    assert.equal(a.length, 1, "exact un apel fara `stoc`");
    assert.equal(b.length, 1, "exact un apel cu `stoc: true`");
    assert.equal(a[0].filtre.sortare, "name_asc");
    assert.equal(a[0].limit, 3);
    assert.equal(a[0].offset, 0);
    assert.equal(b[0].filtre.sortare, "price_asc");
    // Nu un singur rand: primul poate fi un produs fara oferta (vezi `RANDURI_PRET`).
    assert.equal(b[0].limit, 20);
    assert.equal(b[0].offset, 0);
  });

  test("comutatoarele si reducerile pleaca pe AMBELE apeluri", async () => {
    const { noi, rezultat } = await cuApeluri(() => contextDescriere(B, "Accesorii", true, true, true, "newest", false));
    assert.equal(noi.length, 2);
    for (const apel of noi) {
      assert.equal(apel.business, B);
      assert.equal(apel.filtre.faraImagini, true);
      assert.equal(apel.filtre.faraStocAscuns, true);
      assert.equal(apel.filtre.reduceri, true);
    }
    assert.equal(rezultat.reduceri, true);
  });

  test("numarul, primele produse in ordinea grilei si cel mai mic pret cumparabil", async () => {
    const r = await contextDescriere(B, "Textile", false, false, false, "name_asc", false);
    // Textile: Prosop alb, Prosop gri, Lenjerie dubla (epuizata), Set 3 prosoape, Set baie.
    assert.equal(r.continut?.numar, 5);
    assert.deepEqual(r.continut?.produse, ["Lenjerie dubla", "Prosop alb", "Prosop gri"]);
    // Venit ca sir: trebuie sa fie numar.
    assert.equal(r.continut?.pretMinim, 8.63);
    assert.equal(r.continut?.interval, false);
    assert.equal(r.parinte, null);
  });

  test("comutatoarele schimba numarul, ca pe grila", async () => {
    // Fara imagini si fara stoc ascuns: „Accesoriu simplu" (fara imagine) si
    // „Breloc cadou" (epuizat) ies.
    const r = await contextDescriere(B, "Accesorii", true, true, false, "newest", false);
    assert.equal(r.continut?.numar, 2);
    const toate = await contextDescriere(B, "Accesorii", false, false, false, "newest", false);
    assert.equal(toate.continut?.numar, 4);
  });

  test("reducerile: numarul si pretul vin din aceeasi felie", async () => {
    const r = await contextDescriere(B, "Textile", false, false, true, "newest", false);
    assert.equal(r.continut?.numar, 1);
    assert.equal(r.continut?.pretMinim, 8.63);
  });

  test("produsul cel mai ieftin cu variante: interval", async () => {
    const r = await contextDescriere(B, "Seturi", false, false, false, "newest", false);
    assert.equal(r.continut?.pretMinim, 40);
    assert.equal(r.continut?.interval, true);
  });

  test("⚠ un produs FARA oferta, mai ieftin si in stoc, nu sterge pretul: conteaza primul CU oferta", async () => {
    /*
     * `catalog_pagina` nu filtreaza dupa `fara_oferta`, deci „Fara pret" (1 leu, fara oferta,
     * cu variante) vine primul in B. Cu un singur rand cerut, categoria pierdea „de la 90 lei"
     * fara nicio eroare. `interval` e al randului ales, nu al primului.
     */
    const { rezultat: r, b } = await cuApeluri(() => contextDescriere(B, "Fara oferta", false, false, false, "newest", false));
    assert.equal(r.continut?.numar, 2);
    assert.equal(r.continut?.pretMinim, 90);
    assert.equal(r.continut?.interval, false);
    assert.equal(b[0].limit, 20);
  });

  test("catalogul: `categorii: null` (tot magazinul), nu un tablou", async () => {
    const { rezultat, noi } = await cuApeluri(() => contextDescriere(B, "", false, false, false, "newest", false));
    assert.equal(noi.length, 2);
    for (const apel of noi) assert.equal(apel.filtre.categorii, null);
    assert.equal(rezultat.continut?.numar, 11);
  });
});

describe("subcategoriile si rezumatul", () => {
  test("rezumatul e filtrat pe AMBELE comutatoare, fiecare pe coloana lui", async () => {
    const de = jurnal.length;
    const faraStoc = await contextDescriere(B, "Textile", false, true, false, "newest", false);
    assert.deepEqual(faraStoc.subcategorii, ["Prosoape", "Seturi"]);
    const faraImagini = await contextDescriere(B, "Textile", true, false, false, "newest", false);
    assert.deepEqual(faraImagini.subcategorii, ["Prosoape", "Lenjerii"]);
    const cereri = jurnal.slice(de).filter((c) => c.startsWith("/rest/v1/catalog_rezumat"));
    assert.equal(cereri.length, 2);
    assert.match(cereri[0], new RegExp(`business_id=eq\\.${B}`));
    assert.match(cereri[0], /fara_imagini=eq\.false/);
    assert.match(cereri[0], /fara_stoc_ascuns=eq\.true/);
  });

  test("subcategoriile: doar cele cu produse, in ordinea din panou", async () => {
    const r = await contextDescriere(B, "Textile", false, false, false, "newest", false);
    assert.deepEqual(r.subcategorii, ["Prosoape", "Lenjerii", "Seturi"]);
  });

  test("numele care e si propriul copil: nu e subcategorie, nu e parinte", async () => {
    const r = await contextDescriere(B, "Accesorii", false, false, false, "newest", false);
    assert.deepEqual(r.subcategorii, ["Brelocuri", "Seturi"]);
    assert.equal(r.parinte, null);
    const copil = await contextDescriere(B, "Prosoape", false, false, false, "newest", false);
    assert.equal(copil.parinte, "Textile");
  });

  test("catalogul: categoriile de sus cu produse, apoi orfanele; nici cele stinse, nici cele goale", async () => {
    const r = await contextDescriere(B, "", false, false, false, "newest", false);
    // „Stins" e stinsa; „Ascuns" e in rezumat (ramas vechi), dar are rand in tabel.
    assert.deepEqual(r.subcategorii, ["Textile", "Accesorii", "Decor", "Orfana"]);
  });

  test("categoria purtata doar de produse: numele singur, fara parinte", async () => {
    const { rezultat, a } = await cuApeluri(() => contextDescriere(B, "Orfana", false, false, false, "newest", false));
    assert.deepEqual(a[0].filtre.categorii, ["Orfana"]);
    assert.equal(rezultat.continut?.numar, 1);
    assert.equal(rezultat.parinte, null);
    assert.deepEqual(rezultat.subcategorii, []);
  });

  test("fara rezumat: subcategorii goale, dar continutul ramane", async () => {
    const r = await contextDescriere(FARA_REZUMAT, "Textile", false, false, false, "newest", false);
    assert.deepEqual(r.subcategorii, []);
    assert.equal(r.continut?.numar, 5);
  });
});

describe("erorile", () => {
  test("RPC-ul cade: `continut: null`, scris in consola, fara exceptie", async (t) => {
    const eroare = t.mock.method(console, "error", () => {});
    const r = await contextDescriere(RPC_CAZUT, "Textile", false, false, false, "newest", true);
    assert.equal(r.continut, null);
    assert.equal(r.faraTva, true);
    // Rezumatul si categoriile au raspuns: subcategoriile raman.
    assert.deepEqual(r.subcategorii, ["Prosoape", "Lenjerii", "Seturi"]);
    assert.ok(eroare.mock.calls.some((c) => String(c.arguments[0]).includes("catalog_pagina")));
  });

  test("baza cazuta cu totul: contextul neutru, niciodata o exceptie", async (t) => {
    t.mock.method(console, "error", () => {});
    const r = await contextDescriere(TOTUL_CAZUT, "Textile", false, false, false, "newest", false);
    assert.deepEqual(r, { parinte: null, subcategorii: [], continut: null, faraTva: false, reduceri: false });
  });

  test(`descrierea unei pagini cu RPC-ul cazut: doar deschiderea, niciodata „0 produse”`, async (t) => {
    t.mock.method(console, "error", () => {});
    const ctx = await contextDescriere(RPC_CAZUT, "Prosoape", false, false, false, "newest", false);
    assert.equal(descrierePaginii({ categorie: "Prosoape", magazin: "Magazin Proba SRL", context: ctx }), "Prosoape (Textile) la Magazin Proba.");
  });
});

describe("de la date la text", () => {
  test("categoria, cap-coada: incarcatorul adevarat si generatorul", async () => {
    const ctx = await contextDescriere(B, "Textile", false, false, false, "newest", false);
    assert.equal(
      descrierePaginii({ categorie: "Textile", magazin: "Magazin Proba SRL", context: ctx }),
      "Textile la Magazin Proba, de la 8,63 lei. Subcategorii: Prosoape, Lenjerii și Seturi.",
    );
  });

  test("preturi fara TVA: sufixul ajunge in text", async () => {
    const ctx = await contextDescriere(B, "Prosoape", false, false, false, "newest", true);
    assert.equal(
      descrierePaginii({ categorie: "Prosoape", magazin: "Magazin Proba SRL", context: ctx }),
      "Prosoape (Textile) la Magazin Proba, de la 8,63 lei fără TVA. Printre produse: Prosop gri și Prosop alb.",
    );
  });
});

describe("categoriiMagazin", () => {
  test("ordonate ca in panou, vizibilele fara subarborele stins, numele stinse separat", async () => {
    const c = await categoriiMagazin(B);
    assert.equal(c.toate.length, 15);
    assert.deepEqual(c.toate.slice(0, 3).map((x) => x.name), ["Textile", "Prosoape", "Seturi baie"]);
    assert.ok(!c.vizibile.some((x) => x.name === "Stins" || x.name === "Ascuns"));
    assert.deepEqual([...c.stinse].sort(), ["Ascuns", "Stins"]);
    // Coloanele pe care le cere randarea: fara ele, lista trimisa in browser se strica.
    assert.deepEqual(Object.keys(c.toate[0]).sort(), ["id", "image_url", "is_active", "name", "parent_id", "sort_order"]);
  });
});
