import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { citesteDescrierileCategoriilor } from "./descrieri-panou";

/*
 * Citirea descrierilor pentru Google in ecranul Produse > Categorii, prin CLIENTUL real
 * (supabase-js), pe o baza de proba care vorbeste PostgREST. Nu are voie sa fie mai DARNICA decat
 * PostgREST:
 *   - intoarce doar coloanele cerute;
 *   - taie la 1000 de randuri pe raspuns, oricat ar cere `limit` (plafonul Supabase);
 *   - fara `order`, randurile vin INVERS;
 *   - cu `faraColoana` e baza de DINAINTEA migratiei: un select cu `seo_description` primeste 42703.
 */

const B1 = "b7000000-0000-4000-8000-000000000001";
const B2 = "b7000000-0000-4000-8000-000000000002";
const B_MARE = "b7000000-0000-4000-8000-000000000003";
const id = (n: number) => `c7000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Rand = Record<string, unknown>;

/** Scris OCOLIND salvarea (direct prin PostgREST): peste 300, sub plafonul de 1000 al bazei. */
const LUNG = Array.from({ length: 60 }, (_, i) => `prosop${i}`).join(" ");

const rand = (b: string, cid: string, name: string, seo: string | null): Rand => ({
  business_id: b, id: cid, name, parent_id: null, sort_order: 0, is_active: true, image_url: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: null, seo_description: seo,
});

const RANDURI: Rand[] = [
  rand(B1, id(1), "PROSOAPE", "  Prosoape <b>hoteliere</b>\n din bumbac "),
  rand(B1, id(2), "Lenjerii", null),
  rand(B1, id(3), "Seturi", "   "),
  rand(B1, id(4), "Halate", LUNG),
  rand(B1, id(5), "Perne", `Perne${String.fromCharCode(0x202e)} de hotel`),
  rand(B2, id(6), "Strain", "Textul altui magazin"),
  ...Array.from({ length: 1500 }, (_, i) => rand(B_MARE, id(100 + i), `C${i}`, `Descrierea ${i}`)),
];

let faraColoana = false;
/** Fereastra de la care baza raspunde cu eroare (o cadere la mijlocul citirii). */
let cadeLaOffset: number | null = null;
const jurnal: URL[] = [];

function raspunde(url: URL): Rand[] {
  let out = RANDURI.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      if (v.startsWith("eq.")) {
        if (String(r[k]) !== v.slice(3)) return false;
        continue;
      }
      if (v === "not.is.null") {
        if (r[k] === null || r[k] === undefined) return false;
        continue;
      }
      throw new Error(`operator neasteptat: ${k}=${v}`);
    }
    return true;
  });
  const ordine = url.searchParams.get("order");
  out = ordine
    ? [...out].sort((a, b) => {
        for (const col of ordine.split(",").map((o) => o.split(".")[0])) {
          const x = String(a[col]), y = String(b[col]);
          if (x < y) return -1;
          if (x > y) return 1;
        }
        return 0;
      })
    : [...out].reverse();
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : 1000, 1000);
  const select = url.searchParams.get("select") ?? "*";
  const coloane = select === "*" ? null : select.split(",").map((c) => c.trim());
  return out.slice(offset, offset + limit).map((r) =>
    coloane ? Object.fromEntries(coloane.filter((c) => c in r).map((c) => [c, r[c]])) : r,
  );
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const json = (cod: number, corp: unknown) => {
    res.writeHead(cod, { "content-type": "application/json" });
    res.end(JSON.stringify(corp));
  };
  if (url.pathname !== "/rest/v1/categories") return json(404, { message: "ruta de proba necunoscuta" });
  jurnal.push(url);
  if (faraColoana && (url.searchParams.get("select") ?? "").includes("seo_description")) {
    return json(400, { code: "42703", message: "column categories.seo_description does not exist" });
  }
  if (cadeLaOffset !== null && Number(url.searchParams.get("offset") ?? 0) >= cadeLaOffset) {
    return json(500, { code: "57014", message: "canceling statement due to statement timeout" });
  }
  try {
    json(200, raspunde(url));
  } catch (e) {
    json(400, { message: (e as Error).message });
  }
});

let client: SupabaseClient<Database>;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  client = createClient<Database>(`http://127.0.0.1:${port}`, "cheie-de-proba", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

describe("citesteDescrierileCategoriilor", () => {
  test("doar textele proprii ale magazinului, in forma in care le publica vitrina", async () => {
    const r = await citesteDescrierileCategoriilor(client, B1);
    assert.equal(r.citite, true);
    assert.deepEqual(Object.keys(r.descrieri).sort(), [id(1), id(4), id(5)]);
    assert.equal(r.descrieri[id(1)], "Prosoape hoteliere din bumbac");
    // Controlul de directie scos: in Google s-ar fi citit altceva decat in panou.
    assert.equal(r.descrieri[id(5)], "Perne de hotel");
    const h = r.descrieri[id(4)];
    assert.ok(h.length <= 300 && h.length > 240, String(h.length));
    assert.ok(LUNG.startsWith(h) && LUNG[h.length] === " ", "taiat prin mijlocul unui cuvant");
  });

  test("cererea: exact cele doua coloane, magazinul lui, numai randurile cu text, ordonate", async () => {
    const de = jurnal.length;
    await citesteDescrierileCategoriilor(client, B1);
    const cereri = jurnal.slice(de);
    assert.ok(cereri.length >= 1, "nu s-a citit nimic");
    for (const u of cereri) {
      const q = u.searchParams;
      assert.equal(q.get("select"), "id,seo_description", u.search);
      assert.equal(q.get("business_id"), `eq.${B1}`, u.search);
      assert.equal(q.get("seo_description"), "not.is.null", u.search);
      assert.match(q.get("order") ?? "", /^id(\.|$)/, u.search);
    }
  });

  test("peste 1000 de randuri: toate, pe ferestre", async () => {
    const de = jurnal.length;
    const r = await citesteDescrierileCategoriilor(client, B_MARE);
    assert.equal(r.citite, true);
    assert.equal(Object.keys(r.descrieri).length, 1500);
    assert.equal(r.descrieri[id(100 + 1499)], "Descrierea 1499");
    assert.deepEqual(jurnal.slice(de).map((u) => u.searchParams.get("offset")), ["0", "1000"]);
  });

  test("⚠ inaintea migratiei: `citite: false`, nimic inventat, eroarea in consola", async (t) => {
    const erori = t.mock.method(console, "error", () => {});
    faraColoana = true;
    try {
      assert.deepEqual(await citesteDescrierileCategoriilor(client, B1), { descrieri: {}, citite: false });
      assert.ok(erori.mock.callCount() > 0, "citirea a cazut in tacere");
    } finally {
      faraColoana = false;
    }
  });

  test(`⚠ o fereastra cazuta la mijloc: NIMIC, nu jumatate (jumatatea lipsa ar fi aratat „text automat”)`, async (t) => {
    t.mock.method(console, "error", () => {});
    cadeLaOffset = 1000;
    try {
      assert.deepEqual(await citesteDescrierileCategoriilor(client, B_MARE), { descrieri: {}, citite: false });
    } finally {
      cadeLaOffset = null;
    }
  });
});

describe("pagina Categorii: citirea separata, cablata", () => {
  const PAGINA = "src/app/(dashboard)/dashboard/products/categories/page.tsx";
  // Fara comentarii, dar numai cele care incep un rand (vezi `sursa` din `descriere-google.test.ts`).
  const sursa = readFileSync(path.resolve(process.cwd(), PAGINA), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/ .*$/gm, "");

  test("cheama citirea si trimite panoului AMBELE valori", () => {
    assert.match(sursa, /citesteDescrierileCategoriilor\(supabase, business\.id\)/);
    assert.match(sursa, /descrieriInitiale=\{descrieri\.descrieri\}/);
    assert.match(sursa, /descrieriCitite=\{descrieri\.citite\}/);
  });

  test("⚠ lista categoriilor ramane fara coloana: o eroare acolo ar fi golit ecranul", () => {
    const selecturi = [...sursa.matchAll(/\.select\(\s*"([^"]*)"\s*\)/g)].map((m) => m[1]);
    assert.ok(
      selecturi.includes("id, business_id, parent_id, name, sort_order, is_active, image_url, created_at, updated_at"),
      JSON.stringify(selecturi),
    );
    for (const s of selecturi) assert.ok(!s.includes("seo_description"), s);
  });
});
