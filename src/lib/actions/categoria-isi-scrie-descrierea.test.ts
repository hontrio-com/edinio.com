import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";
// Constanta pura, fara baza: se poate importa inainte de a pune env-ul.
import { DESIGN_VERSION } from "@/lib/storefront/design/types";

/**
 * ═══ ACTIUNILE DESCRIERII UNEI CATEGORII, RULATE CHIAR ELE ═══
 *
 * `salveazaSeoCategorie`, `descriereAutomataCategorie` si lista alba din `updateCategory`
 * (`category.actions.ts`). Orice export dintr-un fisier „use server" e un punct de intrare
 * public, deci aici se proba ce ajunge in baza cand cererea vine cu orice: alt tip, categoria
 * altui magazin, chei in plus.
 *
 * ⚠ INLOCUITE SUNT DOAR DOUA CAPETE. Identitatea: `@/lib/supabase/server` iese pe un client
 * supabase-js adevarat, indreptat spre baza de proba, care raspunde la `auth.getUser()` cu
 * utilizatorul ales de proba. Si `revalidatePath`, care in afara lui Next arunca. Interogarile
 * sunt cele adevarate: magazinul se afla printr-o citire pe `businesses`, iar scrierea pleaca ca
 * PATCH, cu filtrele ei.
 *
 * ⚠ Baza de proba nu are voie sa fie mai DARNICA decat PostgREST: intoarce doar coloanele cerute,
 * refuza o coloana necunoscuta la scriere (PGRST204) si la citire (42703), iar `.single()` pe
 * zero randuri da 406. Altfel o cheie in plus scrisa de actiune ar fi trecut nevazuta.
 */

const U1 = "u5000000-0000-4000-8000-000000000001";
const U2 = "u5000000-0000-4000-8000-000000000002";
const BIZ1 = "b5000000-0000-4000-8000-000000000001";
const BIZ2 = "b5000000-0000-4000-8000-000000000002";
const K_PROSOAPE = "c5000000-0000-4000-8000-000000000001";
const K_HALATE = "c5000000-0000-4000-8000-000000000002";
const K_STRAINA = "c5000000-0000-4000-8000-000000000009";

type Rand = Record<string, unknown>;

const designCuCatalog = {
  version: DESIGN_VERSION,
  shop: { page: { id: "pagina-magazin", kind: "shop_page", variant: "toolbar", enabled: true, settings: {} } },
};

const MAGAZINE: Rand[] = [
  {
    id: BIZ1, user_id: U1, created_at: "2026-01-01T00:00:00Z", slug: "magazin-unu", business_name: "UNU SRL",
    store_name: "Magazin Unu", tagline: null, description: null, store_city: null, cover_url: null,
    custom_domain: "unu.ro", is_published: true,
    store_settings: { page_content: {}, storefront_design: designCuCatalog, vat_enabled: false, prices_include_vat: true },
  },
  // Fara domeniu propriu si fara pagina de catalog: textul categoriei sta pe `?cat=`.
  {
    id: BIZ2, user_id: U2, created_at: "2026-01-02T00:00:00Z", slug: "magazin-doi", business_name: "DOI SRL",
    store_name: "Magazin Doi", tagline: null, description: null, store_city: null, cover_url: null,
    custom_domain: null, is_published: true,
    store_settings: { page_content: {}, storefront_design: null, vat_enabled: false, prices_include_vat: true },
  },
];

const categorie = (id: string, business_id: string, name: string, sort_order: number, seo_description: string | null): Rand => ({
  id, business_id, name, parent_id: null, image_url: null, sort_order, is_active: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", seo_description,
});

/** Refacute inainte de fiecare proba: scrierile le schimba. */
let CATEGORII: Rand[] = [];
const rand = (id: string) => CATEGORII.find((r) => r.id === id) as Rand;

const REZUMATE: Rand[] = [BIZ1, BIZ2].flatMap((b) => [false, true].flatMap((fi) => [false, true].map((fs) => ({
  business_id: b, fara_imagini: fi, fara_stoc_ascuns: fs, total: 5, price_min: "10", price_max: "90", categorii: [],
  fatete: { jetoane: [], fatete: [] },
}))));

const COLOANE_CATEGORII = new Set([
  "id", "business_id", "name", "parent_id", "image_url", "sort_order", "is_active", "created_at", "updated_at", "seo_description",
]);
/** Pornit: baza de DINAINTEA migratiei, fara `seo_description`. */
let faraColoana = false;
const coloanaExista = (c: string) => COLOANE_CATEGORII.has(c) && !(faraColoana && c === "seo_description");

/** Fiecare PATCH primit: interogarea si corpul. Asa se vede CE a scris actiunea, si unde. */
let scrieri: { interogare: string; corp: Rand }[] = [];

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
  if (!select || select === "*") return { ...r };
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

/** Filtrele `eq`; orice alt operator e o eroare a bazei de proba, nu o lista goala. */
function filtreaza(randuri: Rand[], url: URL): Rand[] {
  return randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (!v.startsWith("eq.")) throw new Error(`operator neasteptat: ${k}=${v}`);
      if (String(r[k]) !== v.slice(3)) return false;
    }
    return true;
  });
}

function raspunde(randuri: Rand[], url: URL): Rand[] {
  let out = filtreaza(randuri, url);
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
  return out.slice(offset, offset + limit).map((r) => proiecteaza(r, url.searchParams.get("select") ?? "*"));
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  let corpBrut = "";
  req.on("data", (b) => (corpBrut += b));
  req.on("end", () => {
    const json = (cod: number, corp: unknown) => {
      res.writeHead(cod, { "content-type": "application/json" });
      res.end(JSON.stringify(corp));
    };
    const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    try {
      if (req.method === "POST" && cale === "rpc/catalog_pagina") {
        const f = ((JSON.parse(corpBrut || "{}") as Rand).p_filtre ?? {}) as Rand;
        return json(200, f.stoc === true
          ? { total: 5, randuri: [{ name: "ieftin", price_min: "10", has_range: false, fara_oferta: false }] }
          : { total: 5, randuri: [{ name: "Produs A" }, { name: "Produs B" }] });
      }
      if (req.method === "PATCH" && cale === "categories") {
        const corp = JSON.parse(corpBrut || "{}") as Rand;
        scrieri.push({ interogare: url.search, corp });
        const necunoscuta = Object.keys(corp).find((c) => !coloanaExista(c));
        if (necunoscuta) {
          return json(400, { code: "PGRST204", message: `Could not find the '${necunoscuta}' column of 'categories' in the schema cache` });
        }
        const tinta = filtreaza(CATEGORII, url);
        for (const r of tinta) Object.assign(r, corp);
        if ((req.headers.prefer ?? "").includes("return=representation")) {
          return json(200, tinta.map((r) => proiecteaza(r, url.searchParams.get("select") ?? "*")));
        }
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== "GET") return json(405, { message: `metoda neasteptata: ${req.method} ${cale}` });

      let randuri: Rand[];
      if (cale === "businesses") randuri = raspunde(MAGAZINE, url);
      else if (cale === "categories") {
        const necunoscuta = coloane(url.searchParams.get("select") ?? "").find((c) => !coloanaExista(c));
        if (necunoscuta) return json(400, { code: "42703", message: `column categories.${necunoscuta} does not exist` });
        randuri = raspunde(CATEGORII, url);
      } else if (cale === "catalog_rezumat") randuri = raspunde(REZUMATE, url);
      else if (cale === "products") randuri = [];
      else return json(404, { message: `ruta de proba necunoscuta: ${cale}` });

      if (!unul) return json(200, randuri);
      if (randuri.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return json(200, randuri[0]);
    } catch (e) {
      return json(400, { message: `baza de proba: ${(e as Error).message}` });
    }
  });
});

/*
 * Doar identitatea si `revalidatePath` sunt inlocuite. `next/cache` se inlocuieste NUMAI pentru
 * `category.actions.ts`: restul modulelor il primesc pe cel adevarat.
 */
const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return {
         url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"),
         shortCircuit: true, format: "module",
       };
     }
     if (specifier === "next/cache" && String(context.parentURL ?? "").endsWith("/category.actions.ts")) {
       return {
         url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = (...a) => { globalThis.__revalidari.push(a); }; export const revalidateTag = () => {};"),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

type Actiuni = typeof import("@/lib/actions/category.actions");
let salveazaSeoCategorie: Actiuni["salveazaSeoCategorie"];
let descriereAutomataCategorie: Actiuni["descriereAutomataCategorie"];
let updateCategory: Actiuni["updateCategory"];

let utilizator: { id: string } | null = { id: U1 };
const g = globalThis as unknown as { __clientDeProba: () => unknown; __revalidari: unknown[][] };

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  const adresa = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";

  register(HOOK);
  const { createClient } = await import("@supabase/supabase-js");
  const adevarat = createClient(adresa, "cheie-anonima-de-proba", { auth: { autoRefreshToken: false, persistSession: false } });
  g.__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: utilizator }, error: null }) },
    from: (tabel: string) => adevarat.from(tabel),
  });
  ({ salveazaSeoCategorie, descriereAutomataCategorie, updateCategory } = await import("@/lib/actions/category.actions"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  CATEGORII = [
    categorie(K_PROSOAPE, BIZ1, "Prosoape", 0, null),
    categorie(K_HALATE, BIZ1, "Halate", 1, "Text vechi"),
    categorie(K_STRAINA, BIZ2, "Rochii", 0, "Textul altui magazin"),
  ];
  scrieri = [];
  g.__revalidari = [];
  utilizator = { id: U1 };
  faraColoana = false;
});

const MESAJ_LUNG = "Descrierea poate avea cel mult 300 de caractere.";

describe("salveazaSeoCategorie", () => {
  test("neautentificat: refuz, nimic scris", async () => {
    utilizator = null;
    assert.deepEqual(await salveazaSeoCategorie(K_HALATE, "Text"), { error: "Neautorizat" });
    assert.equal(scrieri.length, 0);
  });

  test("curata textul si scrie O SINGURA coloana, pe randul lui, filtrat pe magazin", async () => {
    const rlo = String.fromCharCode(0x202e);
    const nul = String.fromCharCode(0);
    const r = await salveazaSeoCategorie(K_HALATE, `  <b>Halate</b> de baie${rlo}   pufoase \n${nul}`);
    assert.deepEqual(r, { success: true, descriere: "Halate de baie pufoase" });
    assert.equal(scrieri.length, 1);
    const { interogare, corp } = scrieri[0];
    // Cheie EXPLICITA, plus `updated_at`: nimic din ce n-a cerut panoul.
    assert.deepEqual(Object.keys(corp).sort(), ["seo_description", "updated_at"]);
    assert.equal(corp.seo_description, "Halate de baie pufoase");
    const q = new URLSearchParams(interogare);
    assert.equal(q.get("id"), `eq.${K_HALATE}`);
    assert.equal(q.get("business_id"), `eq.${BIZ1}`);
    assert.equal(rand(K_HALATE).seo_description, "Halate de baie pufoase");
    assert.deepEqual(g.__revalidari, [["/dashboard/products/categories"]]);
  });

  test("gol, doar spatii, doar etichete sau null: NULL in baza, adica textul automat", async () => {
    for (const gol of [null, "", "   ", "<p> </p>", String.fromCharCode(0x202e)]) {
      CATEGORII = [categorie(K_HALATE, BIZ1, "Halate", 1, "Text vechi")];
      const r = await salveazaSeoCategorie(K_HALATE, gol);
      assert.deepEqual(r, { success: true, descriere: null }, JSON.stringify(gol));
      assert.equal(rand(K_HALATE).seo_description, null, JSON.stringify(gol));
    }
  });

  test("⚠ peste 300 DUPA curatare: refuz cu mesaj; 300 trece; spatiile in plus nu se numara", async () => {
    assert.deepEqual(await salveazaSeoCategorie(K_HALATE, "a".repeat(301)), { error: MESAJ_LUNG });
    assert.equal(scrieri.length, 0, "textul refuzat a plecat totusi spre baza");
    assert.deepEqual(await salveazaSeoCategorie(K_HALATE, "a".repeat(300)), { success: true, descriere: "a".repeat(300) });
    // 600 de caractere brute, 299 dupa curatare: trece, fiindca se numara ce se publica.
    const rar = Array.from({ length: 150 }, () => "b").join("   ");
    const r = await salveazaSeoCategorie(K_HALATE, rar);
    assert.deepEqual(r, { success: true, descriere: Array.from({ length: 150 }, () => "b").join(" ") });
  });

  test("text urias: refuz inainte de orice curatare", async () => {
    assert.deepEqual(await salveazaSeoCategorie(K_HALATE, " ".repeat(10_001)), { error: MESAJ_LUNG });
    assert.equal(scrieri.length, 0);
  });

  test("⚠ categoria altui magazin: nimic atins, iar raspunsul spune ca nu exista", async () => {
    const r = await salveazaSeoCategorie(K_STRAINA, "Textul meu");
    assert.deepEqual(r, { error: "Categoria nu există." });
    assert.equal(rand(K_STRAINA).seo_description, "Textul altui magazin");
    // Scrierea a plecat CU filtrul pe magazin: fara el, randul strain ar fi fost rescris.
    assert.equal(new URLSearchParams(scrieri[0].interogare).get("business_id"), `eq.${BIZ1}`);
  });

  test("date de alt tip (o cerere mestesugita): refuz, nimic scris", async () => {
    for (const d of [42, {}, ["x"], undefined, true]) {
      assert.deepEqual(await salveazaSeoCategorie(K_HALATE, d as never), { error: "Date invalide." }, String(d));
    }
    assert.deepEqual(await salveazaSeoCategorie(5 as never, "x"), { error: "Date invalide." });
    assert.deepEqual(await salveazaSeoCategorie("", "x"), { error: "Date invalide." });
    assert.equal(scrieri.length, 0);
    assert.equal(rand(K_HALATE).seo_description, "Text vechi");
  });

  test("⚠ coloana inca lipsa (inaintea migratiei): eroare clara, iar restul ecranului merge", async (t) => {
    faraColoana = true;
    t.mock.method(console, "error", () => {});
    assert.deepEqual(await salveazaSeoCategorie(K_HALATE, "Text nou"), { error: "Descrierea nu s-a putut salva." });
    // Ascunderea, redenumirea si imaginea trimit doar cheile lor, deci nu depind de coloana.
    assert.deepEqual(await updateCategory(K_HALATE, { is_active: false }), { success: true, produseMutate: 0 });
    assert.equal(rand(K_HALATE).is_active, false);
  });
});

describe("updateCategory: lista alba", () => {
  test("⚠ o cerere cu chei in plus scrie DOAR cheile panoului", async () => {
    const r = await updateCategory(K_HALATE, {
      is_active: false, parent_id: K_PROSOAPE, business_id: BIZ2, seo_description: "ocolire",
      updated_at: "1999-01-01T00:00:00Z", name: undefined,
    } as never);
    assert.deepEqual(r, { success: true, produseMutate: 0 });
    const { corp } = scrieri[0];
    assert.deepEqual(Object.keys(corp).sort(), ["is_active", "updated_at"]);
    assert.notEqual(corp.updated_at, "1999-01-01T00:00:00Z");
    const h = rand(K_HALATE);
    assert.equal(h.parent_id, null, "`parent_id` a ocolit verificarile din `moveCategory`");
    assert.equal(h.business_id, BIZ1);
    assert.equal(h.seo_description, "Text vechi", "descrierea a ocolit curatarea si limita de 300");
  });

  test("cheile panoului trec neschimbate", async () => {
    assert.deepEqual(await updateCategory(K_PROSOAPE, { image_url: null, sort_order: 3, is_active: true }), { success: true, produseMutate: 0 });
    const { corp } = scrieri[0];
    assert.deepEqual(Object.keys(corp).sort(), ["image_url", "is_active", "sort_order", "updated_at"]);
    assert.equal(corp.image_url, null);
    assert.equal(corp.sort_order, 3);
    assert.equal(corp.is_active, true);
  });
});

describe("descriereAutomataCategorie", () => {
  test("neautentificat, sau categoria altui magazin: null", async () => {
    utilizator = null;
    assert.equal(await descriereAutomataCategorie(K_HALATE), null);
    utilizator = { id: U1 };
    assert.equal(await descriereAutomataCategorie(K_STRAINA), null);
    assert.equal(await descriereAutomataCategorie("" as string), null);
  });

  test("categoria lui: textul AUTOMAT (nu cel salvat), adresa de pe domeniul lui", async () => {
    const d = await descriereAutomataCategorie(K_HALATE);
    assert.ok(d && d.text, JSON.stringify(d));
    assert.equal(d.text, "Halate la Magazin Unu, de la 10 lei. Printre produse: Produs A și Produs B.");
    assert.notEqual(d.text, "Text vechi");
    assert.deepEqual(
      { adresa: d.adresa, areDomeniu: d.areDomeniu, ascunsa: d.ascunsa, umbritaDe: d.umbritaDe },
      { adresa: "https://unu.ro/magazin/halate", areDomeniu: true, ascunsa: false, umbritaDe: null },
    );
  });

  test("magazinul fara domeniu si fara pagina de catalog: adresa `?cat=` de pe platforma", async () => {
    utilizator = { id: U2 };
    const d = await descriereAutomataCategorie(K_STRAINA);
    assert.ok(d, "null pentru propria categorie");
    assert.equal(d.adresa, "https://www.edinio.com/magazin-doi?cat=Rochii");
    assert.equal(d.areDomeniu, false);
    assert.equal(d.text, "Rochii la Magazin Doi, de la 10 lei. Printre produse: Produs A și Produs B.");
    assert.equal(await descriereAutomataCategorie(K_HALATE), null, "U2 a vazut categoria lui U1");
  });
});
