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
  moneda?: string;
  /** Cota de TVA a magazinului. Schimbata, schimba pretul brut din feed. */
  tva?: number;
  tvaPornit?: boolean;
  preturiCuTva?: boolean;
  categoriiAtinseLa?: string;
  /** Cand s-a atins ultima oara magazinul: numele lui si adresa intra in feed. */
  magazinAtinsLa?: string;
  /** Cate categorii are magazinul. Peste 1000, citirea TREBUIE paginata. */
  cateCategorii?: number;
  /** Scrierea evidentei articolelor trimise cade. Feedul NU are voie sa se rupa din asta. */
  cadeEvidenta?: boolean;
  /** Scrierea stampilei de configurare cade. Feedul NU are voie sa se rupa din asta. */
  cadeStampila?: boolean;
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
  /*
   * ⚠ CONFIGURAREA E VIE, ca in baza: amprenta si stampila scrise de feed se intorc la citirea
   * urmatoare. Fara asta, feedul ar fi scris o stampila noua la fiecare trecere si `<LastMod>`
   * ar fi fost mereu „acum" in probe, adica exact defectul pe care il repara.
   */
  const configCurent: Record<string, unknown> = { activ: true, ...(o.config ?? {}) };
  const stampile: Record<string, unknown>[] = [];
  let pagini = 0;
  /* Ce a scris feedul in evidenta articolelor trimise. */
  const scrise: { product_id: string; combinatie: string; articol_id: string }[] = [];

  const raspunde = (tabela: string, filtre: [string, unknown][], interval: [number, number] | null, corp: unknown = null, coloane?: string, optiuni?: { onConflict?: string }, dupa?: string | null, cate?: number | null) => {
    /*
     * ⚠ Plimbarea pe CHEIE se aplica cu adevarat: cu `gt` si `limit` no-op, mutarea feedului
     * de pe offset pe cheie ar fi trecut neprobata, si un `break` pus in loc de conditie ar fi
     * ramas verde.
     */
    const felie = <T>(v: T[], cheia?: (x: T) => string): T[] => {
      let r = v;
      if (dupa != null && cheia) r = r.filter((x) => cheia(x) > dupa);
      if (interval) r = r.slice(interval[0], interval[1] + 1);
      if (cate != null) r = r.slice(0, cate);
      return r;
    };
    if (tabela === "businesses") {
      return { data: doar({ id: BID, slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL", is_published: true, updated_at: o.magazinAtinsLa ?? "2026-08-01T10:00:00.000Z" }, coloane), error: null };
    }
    if (tabela === "store_settings") {
      return {
        data: doar({
          pepita_config: configCurent,
          vat_enabled: o.tvaPornit ?? true, vat_rate: o.tva ?? 21,
          prices_include_vat: o.preturiCuTva ?? true,
          currency: o.moneda ?? "RON",
        }, coloane),
        error: null,
      };
    }
    if (tabela === "categories") {
      /*
       * ⚠ PAGINAT CA IN PRODUCTIE. Manipulatorul de dinainte intorcea intotdeauna UN rand si
       * ignora `.range()`, deci bucla se rotea o singura data si un `break` neconditionat
       * trecea verde. Un magazin cu peste 1000 de categorii primea un arbore taiat tacut.
       */
      const cate = o.cateCategorii ?? 1;
      const toate = Array.from({ length: cate }, (_, i) => ({
        id: i === 0 ? "c1" : `c${String(i + 1).padStart(5, "0")}`,
        name: i === 0 ? "Scaune" : `Categoria ${i + 1}`,
        parent_id: null,
        /*
         * ⚠ CLIPA NOUA STA PE ULTIMA CATEGORIE, dinadins. Pusa pe toate, o citire taiata la
         * prima pagina ar fi dat acelasi maxim, si proba n-ar fi aparat nimic.
         */
        updated_at: i === cate - 1
          ? (o.categoriiAtinseLa ?? "2026-08-01T10:00:00.000Z")
          : "2026-08-01T10:00:00.000Z",
      }));
      return { data: felie(toate, (c) => c.id).map((c) => doar(c, coloane)), error: null };
    }
    if (tabela === "pepita_listari") {
      const toate = [...(o.listari ?? [])].sort((a, c) => (a.product_id < c.product_id ? -1 : 1));
      return { data: felie(toate, (r) => r.product_id).map((r) => doar(r as unknown as Record<string, unknown>, coloane)), error: null };
    }
    if (tabela === "pepita_articole") {
      if (o.cadeEvidenta) return { data: null, error: { code: "42P01", message: "relation does not exist" } };
      /*
       * ⚠ TINTA CONFLICTULUI CHIAR SE VERIFICA. Tabela are unic pe (business_id, articol_id);
       * cu alta tinta, Postgres raspunde 42P10 la fiecare scriere, `try/catch`-ul o inghite ca
       * avertisment, si evidenta ramane GOALA pentru totdeauna — adica drumul inapoi al unei
       * comenzi intarziate moare tacut.
       */
      if (optiuni?.onConflict !== "business_id,articol_id") {
        return { data: null, error: { code: "42P10", message: "there is no unique constraint matching the ON CONFLICT specification" } };
      }
      for (const r of (corp as { product_id: string; combinatie: string; articol_id: string }[]) ?? []) scrise.push(r);
      return { data: null, error: null };
    }
    if (tabela === "products") {
      pagini++;
      if (o.cadeLaPagina && pagini >= o.cadeLaPagina) {
        return { data: null, error: { code: "57014", message: "citirea a cazut" } };
      }
      /* ⚠ Filtrul pe magazin chiar se aplica, ca proba de izolare sa insemne ceva. */
      const aleLui = produse.filter(() => filtre.some(([k, v]) => k === "business_id" && v === BID));
      return { data: felie(aleLui, (p) => p.id).map((p) => doar(p as unknown as Record<string, unknown>, coloane)), error: null };
    }
    return { data: null, error: null };
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (tabela: string) => {
    const filtre: [string, unknown][] = [];
    let interval: [number, number] | null = null;
    let corp: unknown = null;
    let coloane: string | undefined;
    let optiuni: { onConflict?: string } | undefined;
    let dupa: string | null = null;
    let cate: number | null = null;
    const b: any = {
      select: (c?: string) => { coloane = c; return b; },
      upsert: (p: unknown, opt?: { onConflict?: string }) => { corp = p; optiuni = opt; return b; },
      eq: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      in: () => b, is: () => b, not: () => b, neq: () => b, order: () => b,
      gt: (_k: string, v: string) => { dupa = v; return b; },
      limit: (n: number) => { cate = n; return b; },
      range: (a: number, c: number) => { interval = [a, c]; return b; },
      maybeSingle: () => Promise.resolve(raspunde(tabela, filtre, interval, corp, coloane, optiuni, dupa, cate)),
      single: () => Promise.resolve(raspunde(tabela, filtre, interval, corp, coloane, optiuni, dupa, cate)),
      then: (bun: (v: unknown) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(tabela, filtre, interval, corp, coloane, optiuni, dupa, cate)).then(bun, rau),
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = {
    from: (t: string) => builder(t),
    rpc: (nume: string, args: Record<string, unknown>) => {
      if (nume === "jsonb_merge_config") {
        if (o.cadeStampila) return Promise.resolve({ data: null, error: { message: "randul e incuiat" } });
        /*
         * ⚠ COLOANA SI MAGAZINUL CHIAR SE VERIFICA. Imbinat orbeste, un mutant care scrie in
         * `olx_config` sau pe alt magazin trecea toate probele de `<LastMod>`, desi in productie
         * nimic nu s-ar fi pastrat: amprenta ar fi fost mereu lipsa, stampila s-ar fi rescris la
         * fiecare citire, si data ar fi devenit „acum" pe tot catalogul — chiar defectul reparat.
         */
        if (args.p_column !== "pepita_config") {
          return Promise.resolve({ data: null, error: { message: `coloana gresita: ${String(args.p_column)}` } });
        }
        if (args.p_business_id !== BID) {
          return Promise.resolve({ data: null, error: { message: "alt magazin" } });
        }
        const petic = args.p_patch as Record<string, unknown>;
        Object.assign(configCurent, petic);
        stampile.push(petic);
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient<Database>;
  return Object.assign(db, { __scrise: scrise, __config: configCurent, __stampile: stampile });
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

   ⚠ Prima incercare lua `store_settings.updated_at`, si era gresita: coloana aceea urca la
   FIECARE COMANDA, prin numerotarea secventiala. Pragul ar fi fost „acum" in fiecare zi, pe tot
   catalogul. Acum e o amprenta a campurilor care chiar ajung in feed, cu o stampila scrisa cand
   amprenta se schimba.
*/

const secunde = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const lastMod = (xml: string): number | null => {
  const m = xml.match(/<LastMod>(\d+)<\/LastMod>/);
  return m ? Number(m[1]) : null;
};

const TOATE = { mod_includere: "toate" };
const CLIPA_VECHE = "2026-08-01T10:00:00.000Z";

/**
 * Feedul, cu stampila configurarii ASEZATA, ca sa nu domine.
 *
 * Prima trecere scrie amprenta (nu exista niciuna), a doua o gaseste potrivita si foloseste
 * stampila. Intre ele o coboram la o clipa veche: altfel stampila ar fi „acum" si ar acoperi
 * tot ce vrem sa masuram.
 */
async function feedAsezat(db: ReturnType<typeof faceBaza>, fel: "produse" | "stoc" = "produse") {
  await feed(db, fel);
  (db as unknown as { __config: Record<string, unknown> }).__config.feed_stamp = CLIPA_VECHE;
  return feed(db, fel);
}

test("⚠ o schimbare in configurarea feedului urca `LastMod`, desi produsul n-a fost atins", async () => {
  const db = faceBaza({ config: TOATE, produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })] });
  assert.equal(lastMod(await feedAsezat(db)), secunde(CLIPA_VECHE), "stampila configurarii nu se vede deloc");

  /* Comerciantul schimba stocul de siguranta: nu atinge niciun produs, dar schimba feedul. */
  (db as unknown as { __config: Record<string, unknown> }).__config.safety_stock = 3;
  const xml = await feed(db);

  const scrise = (db as unknown as { __stampile: Record<string, unknown>[] }).__stampile;
  const ultima = scrise[scrise.length - 1].feed_stamp as string;
  assert.equal(lastMod(xml), secunde(ultima), "schimbarea de configurare n-a urcat data");
  assert.ok(secunde(ultima) > secunde(CLIPA_VECHE));
});

test("⚠ o trecere care nu schimba nimic NU rescrie stampila", async () => {
  /*
   * Altfel `<LastMod>` ar fi „acum" la fiecare citire a feedului, adica exact defectul primei
   * incercari, mutat in alt loc.
   */
  const db = faceBaza({ config: TOATE, produse: [produs(1)] });
  await feedAsezat(db);
  const cate = (db as unknown as { __stampile: unknown[] }).__stampile.length;
  await feed(db);
  await feed(db);
  assert.equal((db as unknown as { __stampile: unknown[] }).__stampile.length, cate);
});

test("un produs atins mai tarziu decat configurarea isi pastreaza propria data", async () => {
  const db = faceBaza({ config: TOATE, produse: [produs(1, { updated_at: "2026-09-07T08:00:00.000Z" })] });
  assert.equal(lastMod(await feedAsezat(db)), secunde("2026-09-07T08:00:00.000Z"));
});

test("⚠ reglajul pus pe UN produs urca `LastMod` doar la el", async () => {
  const p1 = produs(1, { updated_at: "2026-01-01T00:00:00.000Z" });
  const p2 = produs(2, { updated_at: "2026-01-01T00:00:00.000Z" });
  const db = faceBaza({
    produse: [p1, p2],
    listari: [
      { product_id: p1.id, inclus: true, safety_stock: 2, pret_override: null, actualizat_la: "2026-09-06T09:00:00.000Z" },
      { product_id: p2.id, inclus: true, safety_stock: null, pret_override: null, actualizat_la: null },
    ],
  });
  const xml = await feedAsezat(db);
  const toate = [...xml.matchAll(/<LastMod>(\d+)<\/LastMod>/g)].map((m) => Number(m[1]));
  assert.equal(toate.length, 2);
  assert.equal(toate[0], secunde("2026-09-06T09:00:00.000Z"));
  assert.equal(toate[1], secunde(CLIPA_VECHE), "al doilea produs a primit data primului");
});

test("o redenumire de categorie urca `LastMod`", async () => {
  const db = faceBaza({
    config: TOATE,
    produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })],
    categoriiAtinseLa: "2026-09-04T07:00:00.000Z",
  });
  assert.equal(lastMod(await feedAsezat(db)), secunde("2026-09-04T07:00:00.000Z"));
});

test("⚠ magazinul redenumit urca si el `LastMod`: numele lui pleaca in fiecare articol", async () => {
  const db = faceBaza({
    config: TOATE,
    produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })],
    magazinAtinsLa: "2026-09-03T06:00:00.000Z",
  });
  assert.equal(lastMod(await feedAsezat(db)), secunde("2026-09-03T06:00:00.000Z"));
});

test("⚠ o data nevalida nu scrie `NaN` in XML", async () => {
  /* `el()` nu sare peste sirul „NaN": ar fi iesit `<LastMod>NaN</LastMod>`, adica XML minciuna. */
  const db = faceBaza({ config: TOATE, produse: [produs(1, { updated_at: "nu e o data" })] });
  const xml = await feedAsezat(db);
  assert.ok(!xml.includes("NaN"), "a iesit NaN in feed");
  assert.equal(lastMod(xml), secunde(CLIPA_VECHE));
});

test("⚠ arborele de categorii se citeste PAGINAT: PostgREST da cel mult 1000 de randuri", async () => {
  /*
   * Fara paginare, un magazin cu peste 1000 de categorii primea un arbore taiat tacut: caile
   * din feed ieseau gresite sau goale pentru produsele din ultimele categorii, iar `updated_at`
   * al lor nu mai intra in pragul lui `<LastMod>`.
   */
  const xml = await feedAsezat(faceBaza({
    config: TOATE,
    produse: [produs(1)],
    cateCategorii: 1400,
    categoriiAtinseLa: "2026-09-04T07:00:00.000Z",
  }));
  /* Daca bucla s-ar opri la prima pagina, ultimele 400 de categorii n-ar intra in prag. */
  assert.equal(lastMod(xml), secunde("2026-09-04T07:00:00.000Z"));
  assert.match(xml, /<Category>/);
});

test("⚠ evidenta articolelor trimise NU are voie sa rupa feedul", async () => {
  /*
   * Invariantul cel mai apasat din `feed.ts`: o exceptie in scrierea evidentei ar iesi din
   * generator, `</Catalog>` nu s-ar mai scrie, si TOATE magazinele ar livra XML invalid. Cazul
   * concret: migratia `pepita-articole-exportate` neaplicata inca pe baza, deci 42P01 la fiecare
   * scriere.
   */
  const db = faceBaza({ config: { mod_includere: "toate" }, produse: [produs(1), produs(2)], cadeEvidenta: true });
  const xml = await feed(db);

  assert.match(xml, /<\/Catalog>/, "feedul s-a rupt: XML neinchis");
  assert.equal((xml.match(/<Product>/g) ?? []).length, 2, "produsele n-au mai plecat");
  assert.equal((db as unknown as { __scrise: unknown[] }).__scrise.length, 0);
});

test("⚠ o schimbare de COTA DE TVA urca si ea `LastMod`: schimba pretul brut din feed", async () => {
  /*
   * TVA-ul n-are stampila proprie nicaieri in baza, si de aceea intra in amprenta. Lasat pe
   * dinafara, o schimbare de cota — adica o schimbare de pret la ei — n-ar mai fi ajuns
   * niciodata in `<LastMod>`.
   */
  const db = faceBaza({ config: TOATE, produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })], tva: 21 });
  assert.equal(lastMod(await feedAsezat(db)), secunde(CLIPA_VECHE));

  const db2 = faceBaza({ config: TOATE, produse: [produs(1, { updated_at: "2026-01-01T00:00:00.000Z" })], tva: 11 });
  await feed(db2);
  const amprenteDiferite = (db as unknown as { __config: Record<string, unknown> }).__config.feed_amprenta
    !== (db2 as unknown as { __config: Record<string, unknown> }).__config.feed_amprenta;
  assert.ok(amprenteDiferite, "cota de TVA nu intra in amprenta, deci o schimbare de pret nu urca data");
});

test("⚠ feedul se plimba pe CHEIE: un produs inserat in timpul citirii nu SARE niciun produs", async () => {
  /*
   * `products.id` e uuid aleator, iar `.range()` numara randurile DUPA ordonare: un import care
   * insereaza un id mai mic muta fereastra cu unu si un produs de la granita paginii lipseste
   * din feedul trimis lui Pepita. Pe deasupra, articolele lui raman in evidenta si sunt numarate
   * ORFANE la urmatoarea verificare, iar comerciantului i se spune sa ceara scoaterea lor.
   */
  /* ⚠ PESTE o pagina (500): sub atat, catalogul incape intr-o citire si mutantul nu se vede. */
  const multe = Array.from({ length: 700 }, (_, i) => produs(i * 2 + 1));
  const db = faceBaza({ config: TOATE, produse: multe });

  /* Dupa prima pagina apare un produs cu id mai mic decat fereastra curenta. */
  let paginiCitite = 0;
  const originalFrom = (db as unknown as { from: (t: string) => unknown }).from;
  (db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
    if (t === "products") {
      paginiCitite += 1;
      if (paginiCitite === 1) multe.unshift(produs(0));
    }
    return (originalFrom as (x: string) => unknown)(t);
  };

  const xml = await feed(db);
  assert.ok(paginiCitite >= 2, "catalogul a incaput intr-o citire: proba nu masoara nimic");
  for (const p of multe) {
    assert.ok(xml.includes(`<Id>${p.id}</Id>`), `produsul ${p.id} lipseste din feed`);
  }
});

test("⚠ si listarile se citesc pe cheie: un rand sarit scoate produsul din feed", async () => {
  /*
   * Pe modul „doar cele alese", un rand de listare sarit inseamna un produs care nu mai pleaca.
   * Pe modul „toate", inseamna un produs care isi pierde pretul propriu si stocul de siguranta.
   */
  const multe = Array.from({ length: 1400 }, (_, i) => produs(i * 2 + 1));
  const listari = multe.map((p) => ({ product_id: p.id, inclus: true, safety_stock: null, pret_override: null, actualizat_la: null }));
  const xml = await feedAsezat(faceBaza({ produse: multe, listari }));

  for (const p of multe.slice(-3)) {
    assert.ok(xml.includes(`<Id>${p.id}</Id>`), `produsul ${p.id} a fost scos din feed de o listare sarita`);
  }
});

test("⚠ o stampila care nu se poate scrie NU rupe feedul", async () => {
  /*
   * Stampila e o imbunatatire a lui `<LastMod>`, nu o parte din feed. Fara `try/catch`, o pana a
   * lui `jsonb_merge_config` (randul incuiat de o salvare de setari, magazin fara rand in
   * `privat.store_settings`) ar fi facut `pregateste` sa arunce, iar ruta ar fi raspuns 503 in
   * loc de XML — pentru ORICE magazin, la fiecare citire.
   */
  const db = faceBaza({ config: TOATE, produse: [produs(1), produs(2)], cadeStampila: true });
  const xml = await feed(db);

  assert.match(xml, /<\/Catalog>/, "feedul s-a rupt");
  assert.equal((xml.match(/<Product>/g) ?? []).length, 2);
  /* Fara stampila pastrata, pragul e „acum": proaspat, adica directia care nu strica nimic. */
  assert.ok((lastMod(xml) ?? 0) > secunde("2026-09-08T00:00:00.000Z"));
});

test("⚠ FIECARE camp al amprentei conteaza: schimbat, stampila se rescrie", async () => {
  /*
   * Amprenta are unsprezece valori. Probele fixau doua, deci scoaterea oricareia dintre celelalte
   * trecea verde — iar cea mai grava e strategia de pret: schimbata, TOATE preturile din feed se
   * schimba, dar `<LastMod>` n-ar mai fi urcat pe niciun produs, si Pepita ar fi vandut la
   * preturile vechi pana cand cineva atinge produsele unul cate unul.
   */
  const deBaza = { mod_includere: "toate" } as Record<string, unknown>;
  const amprenta = async (config: Record<string, unknown>, peste: Partial<Optiuni> = {}) => {
    const db = faceBaza({ config, produse: [produs(1)], ...peste });
    await feed(db);
    return (db as unknown as { __config: Record<string, unknown> }).__config.feed_amprenta as string;
  };

  const referinta = await amprenta(deBaza);
  const variante: [string, Record<string, unknown>, Partial<Optiuni>][] = [
    ["strategia de pret", { ...deBaza, strategie_pret: { fel: "procent", valoare: 10 } }, {}],
    ["stocul de siguranta", { ...deBaza, safety_stock: 3 }, {}],
    ["termenul de livrare", { ...deBaza, shipping_delay: 4 }, {}],
    ["pretul transportului", { ...deBaza, shipping_price: 19.99 }, {}],
    ["garantia", { ...deBaza, garantie: { tip: "Year", durata: 2 } }, {}],
    ["modul de includere", { ...deBaza, mod_includere: "selectate" }, {}],
    ["cota de TVA", deBaza, { tva: 11 }],
    ["TVA-ul pornit sau stins", deBaza, { tvaPornit: false }],
    ["preturile cu sau fara TVA", deBaza, { preturiCuTva: false }],
  ];
  for (const [nume, config, peste] of variante) {
    assert.notEqual(await amprenta(config, peste), referinta, `${nume} nu intra in amprenta`);
  }

  /*
   * ⚠ Al zecelea camp, `config.piata`, nu se poate varia: `PIETE` are o singura piata („ro").
   * Se spune, ca sa nu para acoperit de proba de mai sus.
   */
});
