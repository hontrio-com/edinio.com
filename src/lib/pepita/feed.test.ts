/* ⚠ Fara chei de mediu: `createAdminClient()` arunca pe loc, iar `logError` se opreste in
   `catch`-ul lui, fara sa deschida nicio conexiune. Vezi nota din `ingest.test.ts`. */
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import test from "node:test";
import assert from "node:assert/strict";
import { XMLValidator } from "fast-xml-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { pregateste, scrieFeed } from "./feed";

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ ATOMICITATEA FEEDULUI, PROBATA PE STARI, NU PE TEXTUL CODULUI
   ══════════════════════════════════════════════════════════════════════════

   Intrebarea nu e „scrie in cod `yield INCHEIERE` la sfarsit", ci „ce iese cand baza cade la
   mijloc". Un feed VALID cu jumatate de catalog inseamna jumatate de magazin scos de la
   vanzare la ei, fara ca nimeni sa afle. Un feed neinchis e invalid, deci il resping intreg
   si pastreaza ce aveau.
*/

const BID = "99999999-8888-7777-6666-555555555555";

const produs = (i: number, peste: Record<string, unknown> = {}) => ({
  id: `3f2504e0-4f89-41d3-9a0c-0305e82c${String(i).padStart(4, "0")}`,
  name: `Produs ${i}`, slug: `produs-${i}`, description: "Descriere.",
  price: 100, compare_at_price: null, sku: `SKU-${i}`,
  images: ["https://cdn.ro/a.jpg"], category: "Scaune",
  track_inventory: true, stock_quantity: 3, weight_grams: null,
  page_sections: {}, is_bundle: false, updated_at: "2026-09-01T10:00:00.000Z", is_active: true,
  ...peste,
});

interface Optiuni {
  produse?: ReturnType<typeof produs>[];
  listari?: { product_id: string; inclus: boolean; safety_stock: number | null; pret_override: number | null; actualizat_la?: string | null }[];
  /** Cand s-au atins ultima oara setarile magazinului. Intra in `<LastMod>`. */
  setariAtinseLa?: string;
  categoriiAtinseLa?: string;
  /** Cand s-a atins ultima oara magazinul: numele lui si adresa intra in feed. */
  magazinAtinsLa?: string;
  config?: Record<string, unknown>;
  /** De la a cata pagina de produse cade citirea. `null` = niciodata. */
  cadeLaPagina?: number | null;
}

/**
 * Randul, taiat la COLOANELE CERUTE.
 *
 * ⚠ FARA ASTA, BAZA FALSA E MAI DARNICA DECAT CEA ADEVARATA, si atunci probele apara mai
 * putin decat par. In repo-ul asta cea mai des repetata greseala e chiar aceasta: un camp
 * necerut in `.select()` vine `undefined`, iar verificarea de mai jos tace exact pe randurile
 * pentru care exista. O baza falsa care intoarce tot n-o poate prinde NICIODATA.
 */
function doar<T extends Record<string, unknown>>(rand: T, coloane: string | undefined): Record<string, unknown> {
  if (!coloane || coloane.includes("*")) return rand;
  const chei = coloane.split(",").map((c) => c.trim()).filter(Boolean);
  const iesire: Record<string, unknown> = {};
  for (const k of chei) if (k in rand) iesire[k] = rand[k];
  return iesire;
}

function faceBaza(o: Optiuni = {}) {
  const produse = o.produse ?? [produs(1), produs(2)];
  let pagini = 0;
  /* Ce a scris feedul in evidenta articolelor trimise. */
  const scrise: { product_id: string; combinatie: string; articol_id: string }[] = [];

  const raspunde = (tabela: string, filtre: [string, unknown][], interval: [number, number] | null, corp: unknown = null, coloane?: string) => {
    if (tabela === "businesses") {
      return { data: doar({ id: BID, slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL", is_published: true, updated_at: o.magazinAtinsLa ?? "2026-08-01T10:00:00.000Z" }, coloane), error: null };
    }
    if (tabela === "store_settings") {
      return {
        data: doar({
          pepita_config: { activ: true, ...(o.config ?? {}) },
          vat_enabled: true, vat_rate: 21, prices_include_vat: true,
          updated_at: o.setariAtinseLa ?? "2026-08-01T10:00:00.000Z",
        }, coloane),
        error: null,
      };
    }
    if (tabela === "categories") {
      return { data: [doar({ id: "c1", name: "Scaune", parent_id: null, updated_at: o.categoriiAtinseLa ?? "2026-08-01T10:00:00.000Z" }, coloane)], error: null };
    }
    if (tabela === "pepita_listari") {
      return { data: (o.listari ?? []).map((r) => doar(r as unknown as Record<string, unknown>, coloane)), error: null };
    }
    if (tabela === "pepita_articole") {
      for (const r of (corp as { product_id: string; combinatie: string; articol_id: string }[]) ?? []) scrise.push(r);
      return { data: null, error: null };
    }
    if (tabela === "products") {
      pagini++;
      if (o.cadeLaPagina && pagini >= o.cadeLaPagina) {
        return { data: null, error: { code: "57014", message: "citirea a cazut" } };
      }
      const [de, pana] = interval ?? [0, 999];
      /* ⚠ Filtrul pe magazin chiar se aplica, ca proba de izolare sa insemne ceva. */
      const aleLui = produse.filter(() => filtre.some(([k, v]) => k === "business_id" && v === BID));
      return { data: aleLui.slice(de, pana + 1).map((p) => doar(p as unknown as Record<string, unknown>, coloane)), error: null };
    }
    return { data: null, error: null };
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (tabela: string) => {
    const filtre: [string, unknown][] = [];
    let interval: [number, number] | null = null;
    let corp: unknown = null;
    let coloane: string | undefined;
    const b: any = {
      select: (c?: string) => { coloane = c; return b; },
      upsert: (p: unknown) => { corp = p; return b; },
      eq: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      in: () => b, is: () => b, not: () => b, neq: () => b, order: () => b, limit: () => b,
      range: (a: number, c: number) => { interval = [a, c]; return b; },
      maybeSingle: () => Promise.resolve(raspunde(tabela, filtre, interval, corp, coloane)),
      single: () => Promise.resolve(raspunde(tabela, filtre, interval, corp, coloane)),
      then: (bun: (v: unknown) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(tabela, filtre, interval, corp, coloane)).then(bun, rau),
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return Object.assign(db, { __scrise: scrise });
}

async function feed(db: SupabaseClient<Database>, fel: "produse" | "stoc" = "produse") {
  const pre = await pregateste(db, BID);
  assert.ok(pre, "pregatirea trebuie sa reuseasca");
  let out = "";
  for await (const bucata of scrieFeed(db, BID, pre, fel)) out += bucata;
  return out;
}

test("feedul intreg e XML valid si contine produsele incluse", async () => {
  const xml = await feed(faceBaza({ config: { mod_includere: "toate" } }));
  assert.equal(XMLValidator.validate(xml), true);
  assert.equal((xml.match(/<Product>/g) ?? []).length, 2);
});

test("⚠ o cadere a bazei la mijloc lasa XML NEINCHIS, nu un feed valid pe jumatate", async () => {
  const db = faceBaza({
    config: { mod_includere: "toate" },
    produse: Array.from({ length: 900 }, (_, i) => produs(i)),
    cadeLaPagina: 2,
  });
  const pre = await pregateste(db, BID);
  assert.ok(pre);

  let out = "";
  let aAruncat = false;
  try {
    for await (const bucata of scrieFeed(db, BID, pre, "produse")) out += bucata;
  } catch {
    aAruncat = true;
  }

  assert.equal(aAruncat, true, "caderea nu se inghite");
  assert.ok(out.includes("<Product>"), "ce apucase sa iasa a iesit");
  assert.ok(!out.includes("</Catalog>"), "⚠ incheierea NU se scrie pe calea de eroare");
  assert.notEqual(XMLValidator.validate(out), true, "⚠ si tocmai de aceea XML-ul e invalid");
});

test("⚠ integrarea oprita nu da un feed GOL, ci niciun feed", async () => {
  /* Un `<Catalog>` gol i-ar spune lui Pepita „nu mai am niciun produs", si ar scoate tot de
     la vanzare. Ruta raspunde 404, si atunci ei pastreaza ce au. */
  const pre = await pregateste(faceBaza({ config: { activ: false } }), BID);
  assert.equal(pre, null);
});

test("pe „doar produsele alese” pleaca numai cele bifate", async () => {
  const produse = [produs(1), produs(2), produs(3)];
  const db = faceBaza({
    config: { mod_includere: "selectate" },
    produse,
    listari: [{ product_id: produse[1].id, inclus: true, safety_stock: null, pret_override: null }],
  });
  const xml = await feed(db);
  assert.equal((xml.match(/<Product>/g) ?? []).length, 1);
  assert.ok(xml.includes(produse[1].id));
});

test("pe „toate produsele active” un rand cu `inclus=false` SCOATE produsul", async () => {
  const produse = [produs(1), produs(2)];
  const db = faceBaza({
    config: { mod_includere: "toate" },
    produse,
    listari: [{ product_id: produse[0].id, inclus: false, safety_stock: null, pret_override: null }],
  });
  const xml = await feed(db);
  assert.equal((xml.match(/<Product>/g) ?? []).length, 1);
  assert.ok(!xml.includes(produse[0].id));
});

test("suprascrierile pe produs bat setarile integrarii", async () => {
  const p = produs(1, { stock_quantity: 10 });
  const db = faceBaza({
    config: { mod_includere: "toate", safety_stock: 8 },
    produse: [p],
    listari: [{ product_id: p.id, inclus: true, safety_stock: 1, pret_override: 250 }],
  });
  const xml = await feed(db);
  assert.ok(xml.includes("<Price>250</Price>"), "pretul impus pe produs");
  assert.ok(xml.includes("<Quantity>9</Quantity>"), "stocul de siguranta al produsului, nu cel general");
});

test("un produs nevalid nu darama feedul celorlalte", async () => {
  /* Aceeasi hotarare ca in panou: produsul iese, restul pleaca. */
  const db = faceBaza({
    config: { mod_includere: "toate" },
    produse: [produs(1, { images: [] }), produs(2)],
  });
  const xml = await feed(db);
  assert.equal(XMLValidator.validate(xml), true);
  assert.equal((xml.match(/<Product>/g) ?? []).length, 1);
});

test("feedul de stoc are aceleasi produse, dar numai disponibilitatea", async () => {
  const db = faceBaza({ config: { mod_includere: "toate" } });
  const stoc = await feed(db, "stoc");
  assert.equal(XMLValidator.validate(stoc), true);
  assert.equal((stoc.match(/<Product>/g) ?? []).length, 2);
  assert.ok(!stoc.includes("<Prices>"));
  assert.ok(!stoc.includes("<Descriptions>"));
});

test("un catalog gol da un feed valid si gol, nu o cadere", async () => {
  const xml = await feed(faceBaza({ config: { mod_includere: "toate" }, produse: [] }));
  assert.equal(XMLValidator.validate(xml), true);
  assert.ok(!xml.includes("<Product>"));
  assert.ok(xml.includes("</Catalog>"));
});

/* ══════════════════════════════════════════════════════════════════════════
   EVIDENTA A CE AM TRIMIS
   ══════════════════════════════════════════════════════════════════════════ */

const cuDouaVariante = (i: number) => produs(i, {
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Mărime", values: ["S", "M"] }],
      combinations: [
        { id: "s", title: "S", price: "", compare_at_price: "", sku: "", stock_quantity: "2", image: "", enabled: true },
        { id: "m", title: "M", price: "", compare_at_price: "", sku: "", stock_quantity: "2", image: "", enabled: true },
      ],
    },
  },
});

test("⚠ feedul de produse tine minte ce `<Id>` a trimis pentru fiecare combinatie", async () => {
  /* De aici traieste drumul inapoi: o comanda intarziata, sosita dupa o redenumire, poarta
     `<Id>`-ul vechi si nu s-ar mai potrivi cu nicio amprenta recalculata. */
  const db = faceBaza({ config: { mod_includere: "toate" }, produse: [cuDouaVariante(1)] });
  const xml = await feed(db, "produse");
  const scrise = (db as unknown as { __scrise: { product_id: string; combinatie: string; articol_id: string }[] }).__scrise;

  assert.equal(scrise.length, 2, "cate un rand pentru fiecare combinatie trimisa");
  assert.deepEqual(scrise.map((r) => r.combinatie).sort(), ["M", "S"]);
  for (const r of scrise) {
    assert.ok(xml.includes(`<Id>${r.articol_id}</Id>`), "id-ul scris e chiar cel trimis");
  }
});

test("produsul simplu se tine minte cu combinatia sir GOL, nu `null`", async () => {
  /* In Postgres doua `null` sunt distincte intr-un index unic, deci acelasi produs simplu ar
     fi putut capata oricate randuri. */
  const db = faceBaza({ config: { mod_includere: "toate" }, produse: [produs(1)] });
  await feed(db, "produse");
  const scrise = (db as unknown as { __scrise: { combinatie: string }[] }).__scrise;
  assert.deepEqual(scrise.map((r) => r.combinatie), [""]);
});

test("⚠ feedul de STOC nu scrie evidenta: aceleasi randuri, de 24 de ori pe zi", async () => {
  const db = faceBaza({ config: { mod_includere: "toate" }, produse: [cuDouaVariante(1)] });
  await feed(db, "stoc");
  assert.deepEqual((db as unknown as { __scrise: unknown[] }).__scrise, []);
});

/* ══════════════════════════════════════════════════════════════════════════
   `<LastMod>` NU MAI MINTE
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Venea doar din `products.updated_at`. Dar feedul se schimba si fara ca produsul sa fie
   atins: strategia de pret, stocul de siguranta, TVA-ul, garantia, transportul, numele
   magazinului, arborele de categorii. Pepita citea „nimic nou aici" despre un produs al carui
   pret tocmai se schimbase.
*/

const secunde = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const lastMod = (xml: string): number | null => {
  const m = xml.match(/<LastMod>(\d+)<\/LastMod>/);
  return m ? Number(m[1]) : null;
};

test("⚠ o schimbare in setarile magazinului urca `LastMod`, desi produsul n-a fost atins", async () => {
  const TOATE = { mod_includere: "toate" };
  const vechi = await feed(faceBaza({ config: TOATE, produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })] }));
  assert.equal(lastMod(vechi), secunde("2026-08-01T10:00:00.000Z"), "pragul magazinului nu se vede deloc");

  const nou = await feed(faceBaza({
    config: TOATE,
    produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })],
    setariAtinseLa: "2026-09-05T12:00:00.000Z",
  }));
  assert.equal(lastMod(nou), secunde("2026-09-05T12:00:00.000Z"));
});

test("un produs atins mai tarziu decat setarile isi pastreaza propria data", async () => {
  const xml = await feed(faceBaza({ config: { mod_includere: "toate" }, produse: [produs(1, { updated_at: "2026-09-07T08:00:00.000Z" })] }));
  assert.equal(lastMod(xml), secunde("2026-09-07T08:00:00.000Z"));
});

test("⚠ reglajul pus pe UN produs urca `LastMod` doar la el", async () => {
  const p1 = produs(1, { updated_at: "2026-01-01T00:00:00.000Z" });
  const p2 = produs(2, { updated_at: "2026-01-01T00:00:00.000Z" });
  const xml = await feed(faceBaza({
    produse: [p1, p2],
    listari: [
      { product_id: p1.id, inclus: true, safety_stock: 2, pret_override: null, actualizat_la: "2026-09-06T09:00:00.000Z" },
      { product_id: p2.id, inclus: true, safety_stock: null, pret_override: null, actualizat_la: null },
    ],
  }));
  const toate = [...xml.matchAll(/<LastMod>(\d+)<\/LastMod>/g)].map((m) => Number(m[1]));
  assert.equal(toate.length, 2);
  assert.equal(toate[0], secunde("2026-09-06T09:00:00.000Z"));
  assert.equal(toate[1], secunde("2026-08-01T10:00:00.000Z"), "al doilea produs a primit data primului");
});

test("o redenumire de categorie urca `LastMod`", async () => {
  const xml = await feed(faceBaza({
    config: { mod_includere: "toate" },
    produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })],
    categoriiAtinseLa: "2026-09-04T07:00:00.000Z",
  }));
  assert.equal(lastMod(xml), secunde("2026-09-04T07:00:00.000Z"));
});

test("⚠ o data nevalida nu scrie `NaN` in XML", async () => {
  /* `el()` nu sare peste sirul „NaN": ar fi iesit `<LastMod>NaN</LastMod>`, adica XML minciuna. */
  const xml = await feed(faceBaza({ config: { mod_includere: "toate" }, produse: [produs(1, { updated_at: "nu e o data" })] }));
  assert.ok(!xml.includes("NaN"), "a iesit NaN in feed");
  assert.equal(lastMod(xml), secunde("2026-08-01T10:00:00.000Z"));
});

test("⚠ magazinul redenumit urca si el `LastMod`: numele lui pleaca in fiecare articol", () => {
  return (async () => {
    const xml = await feed(faceBaza({
      config: { mod_includere: "toate" },
      produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })],
      magazinAtinsLa: "2026-09-03T06:00:00.000Z",
    }));
    assert.equal(lastMod(xml), secunde("2026-09-03T06:00:00.000Z"));
  })();
});
