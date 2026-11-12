import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   STOCUL SI PRETUL, SEPARAT, PE DRUMUL ADEVARAT (12.11.2026)
   ══════════════════════════════════════════════════════════════════════════

   `politica-sincronizare.test.ts` proba regula singura. Aici se proba LEGATURA: `trimiteElement`
   adevarat, cu baza falsa si cu un eMAG fals care tine minte fiecare cerere. Asa se vede ce
   PLEACA, nu ce ar trebui sa plece: o regula buna, nelegata, ar fi trecut proba de alaturi si
   ar fi lasat pretul sa plece mai departe.

   ⚠ Inlocuit e numai `./client` CERUT DIN `trimite.ts`; restul modulelor raman ale lor.
   ⚠ Fara accente grave si fara ghilimele duble in modulul fals: tot blocul sta intr-un sablon
   (vezi nota din `curata-fisiere/poarta-stergerii.test.ts`).
*/
const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === './client' && String(context.parentURL || '').includes('/lib/emag/trimite.ts')) {
       return {
         url: 'data:text/javascript,' + encodeURIComponent(
           'export const isEmagError = (r) => !!r && typeof r === ' + String.fromCharCode(39) + 'object' + String.fromCharCode(39) + ' && (' + String.fromCharCode(39) + 'error' + String.fromCharCode(39) + ' in r);' +
           'export const citesteOferte = async (auth, filtre) => globalThis.__emagFals.citeste(filtre);' +
           'export const salveazaOferte = async (auth, oferte) => globalThis.__emagFals.scrie(String.fromCharCode(111,102,102,101,114), oferte);' +
           'export const salveazaProduseOferte = async (auth, el) => globalThis.__emagFals.scrie(String.fromCharCode(112,114,111,100,117,115), el);' +
           'export const salveazaMasuratori = async () => ({ data: [], verdict: String.fromCharCode(114,101,117,115,105,116), mesaje: [] });' +
           'export const cautaDupaEan = async () => ({ data: [], verdict: String.fromCharCode(114,101,117,115,105,116), mesaje: [] });'),
         shortCircuit: true, format: 'module',
       };
     }
     return next(specifier, context);
   }`,
)}`;

type Cerere = { ruta: "offer" | "produs" | "citire"; corp: unknown };
const cereri: Cerere[] = [];
let raspunsCitire: unknown = { data: [], verdict: "reusit", mesaje: [] };

/* ── Baza falsa, aceeasi forma ca in `citire.test.ts` ───────────────────── */

type Raspuns = { data: unknown; error: { message: string; code?: string } | null };

function lant(raspuns: Raspuns): unknown {
  const nod: unknown = new Proxy(function () {} as unknown as object, {
    get(_t, cheie) {
      if (cheie === "then") return (resolve: (v: Raspuns) => void) => resolve(raspuns);
      return () => nod;
    },
    apply() { return nod; },
  });
  return nod;
}

function clientFals(peTabela: Record<string, Raspuns>) {
  return {
    from(tabela: string) {
      const r = peTabela[tabela] ?? { data: null, error: null };
      return new Proxy({} as Record<string, unknown>, { get() { return () => lant(r); } });
    },
  } as never;
}

const PRODUS = {
  id: "p-1", name: "Hrana caini 10 kg", description: "", price: 121, compare_at_price: null,
  images: [], category: "Caini", sku: "H1", weight_grams: 10_000, stock_quantity: 7,
  is_active: true, is_bundle: false, page_sections: {}, source: null,
};
const OFERTA = {
  id: "o-1", emag_id: 501, variant_title: null, nume_emag: "Hrana caini 10 kg", status_la_ei: 1,
  family_id: null, part_number_key: null, ean: null, auto_sync: true,
  last_synced_at: "2026-11-01T00:00:00Z", creat_de_edinio: true,
};
const admin = clientFals({
  products: { data: PRODUS, error: null },
  emag_offers: { data: [OFERTA], error: null },
});

function ctx(config: Record<string, unknown>) {
  return {
    businessId: "biz-1",
    auth: { username: "u", password: "p", tara: "ro" },
    config: { catalog_citit_la: "2026-11-01T00:00:00Z", vat_id: 3, warehouse_id: 1, handling_time: 1, ...config },
    vatRate: 21,
    pricesIncludeVat: true,
  } as never;
}

let trimite: typeof import("./trimite");

before(async () => {
  register(HOOK);
  (globalThis as unknown as { __emagFals: unknown }).__emagFals = {
    citeste: async (filtre: unknown) => { cereri.push({ ruta: "citire", corp: filtre }); return raspunsCitire; },
    scrie: async (ruta: string, corp: unknown) => {
      cereri.push({ ruta: ruta === "offer" ? "offer" : "produs", corp });
      return { data: [], verdict: "reusit", mesaje: [] };
    },
  };
  trimite = await import("./trimite");
});

beforeEach(() => {
  cereri.length = 0;
  raspunsCitire = { data: [], verdict: "reusit", mesaje: [] };
});

const oferteaTrimisa = () => {
  const c = cereri.filter((x) => x.ruta === "offer");
  assert.equal(c.length, 1, `trebuia o singura cerere offer/save, au fost ${c.length}`);
  return (c[0].corp as Record<string, unknown>[])[0];
};

/* ── Proba de control: fara comutatoare, pretul CHIAR pleaca ───────────── */

test("control: fara comutatoare scrise, o schimbare de pret duce pretul si cota", async () => {
  /* ⚠ Fara proba asta, celelalte ar fi trecut si pe un eMAG fals care nu prinde nimic. */
  const r = await trimite.trimiteElement(admin, ctx({}), "p-1", "pret");
  assert.equal(r.verdict, "reusit", r.mesaj);
  const o = oferteaTrimisa();
  assert.equal(o.sale_price, 100);
  assert.equal(o.vat_id, 3);
  assert.ok(Array.isArray(o.stock));
});

test("pret oprit: schimbarea de pret pleaca FARA niciun camp de pret", async () => {
  const r = await trimite.trimiteElement(admin, ctx({ sincronizeaza_pretul: false }), "p-1", "pret");
  assert.equal(r.verdict, "reusit", r.mesaj);
  const o = oferteaTrimisa();
  for (const camp of ["sale_price", "min_sale_price", "max_sale_price", "recommended_price", "vat_id"]) {
    assert.equal(o[camp], undefined, `${camp} n-are voie sa plece cu pretul oprit`);
  }
  assert.deepEqual(o.stock, [{ warehouse_id: 1, value: 7 }], "stocul pleaca mai departe");
  assert.equal(o.status, 1, "starea pleaca mai departe");
});

test("pret oprit: nici apasarea omului nu trimite pretul", async () => {
  await trimite.trimiteElement(admin, ctx({ sincronizeaza_pretul: false }), "p-1", "pret", true);
  assert.equal(oferteaTrimisa().sale_price, undefined);
});

test("stoc oprit: miscarea de stoc nu face NICIO cerere si nu e o eroare", async () => {
  const r = await trimite.trimiteElement(admin, ctx({ sincronizeaza_stocul: false }), "p-1", "stoc");
  assert.equal(r.verdict, "sarit");
  assert.equal(cereri.length, 0);
});

test("stoc oprit: apasarea omului trece si trimite numai `{id, stock}`", async () => {
  const r = await trimite.trimiteElement(admin, ctx({ sincronizeaza_stocul: false }), "p-1", "stoc", true);
  assert.equal(r.verdict, "reusit", r.mesaj);
  assert.deepEqual(oferteaTrimisa(), { id: 501, stock: [{ warehouse_id: 1, value: 7 }] });
});

test("stoc oprit: schimbarea de pret pleaca fara stoc", async () => {
  await trimite.trimiteElement(admin, ctx({ sincronizeaza_stocul: false }), "p-1", "pret");
  const o = oferteaTrimisa();
  assert.equal(o.stock, undefined);
  assert.equal(o.sale_price, 100);
});

/* ── Ruta grea: valorile lor, citite chiar inainte ─────────────────────── */

const grea = (id: number) => ({
  id, status: 1, sale_price: 100, min_sale_price: 70, max_sale_price: 130,
  stock: [{ warehouse_id: 1, value: 7 }], vat_id: 3, name: "Hrana",
}) as never;

test("ruta grea, pret oprit: oferta existenta pleaca cu pretul citit de la ei", async () => {
  raspunsCitire = {
    data: [{ id: 501, sale_price: 80, min_sale_price: 60, max_sale_price: 99, vat_id: 5, stock: [{ warehouse_id: 1, value: 2 }] }],
    verdict: "reusit", mesaje: [],
  };
  const r = await trimite.cuValorileLorPastrate(ctx({}), [grea(501), grea(502)], new Set([501]), { stoc: true, pret: false }, 30);
  assert.equal(r.fel, "gata");
  if (r.fel !== "gata") return;
  assert.deepEqual(cereri.filter((x) => x.ruta === "citire").map((x) => x.corp), [{ id: 501 }], "se citeste numai cea existenta");
  const [existenta, noua] = r.oferte as unknown as Record<string, unknown>[];
  assert.equal(existenta.sale_price, 80);
  assert.equal(existenta.vat_id, 5);
  assert.deepEqual(existenta.stock, [{ warehouse_id: 1, value: 7 }], "stocul e al nostru");
  assert.equal(noua.sale_price, 100, "o oferta noua pleaca cu pretul magazinului");
});

test("ruta grea: citirea cazuta nu e „n-au nimic”", async () => {
  raspunsCitire = { error: "Prea multe cereri.", status: 429, verdict: "trecatoare", mesaje: [] };
  const r = await trimite.cuValorileLorPastrate(ctx({}), [grea(501)], new Set([501]), { stoc: true, pret: false }, 30);
  assert.equal(r.fel, "eroare");
  if (r.fel === "eroare") assert.equal(r.verdict, "trecatoare");
});

test("ruta grea: oferta pe care n-o gasim la ei NU pleaca cu pretul magazinului", async () => {
  raspunsCitire = { data: [], verdict: "reusit", mesaje: [] };
  const r = await trimite.cuValorileLorPastrate(ctx({}), [grea(501)], new Set([501]), { stoc: true, pret: false }, 30);
  assert.equal(r.fel, "lipsa");
});

/* ── Legaturile care nu se pot rula aici fara un catalog intreg ─────────── */

function faraNote(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

test("ruta grea: pleaca lista de DUPA politica, nu cea construita", () => {
  /*
   * ⚠ Ruta grea cere categorie, caracteristici, imagini si catalogul lor: prea mult pentru o baza
   * falsa. Functia care pune valorile lor e probata mai sus; aici se proba ca e si CHEMATA, si ca
   * rezultatul ei e chiar ce pleaca.
   */
  const cod = faraNote("src/lib/emag/trimite.ts");
  const i = cod.indexOf("async function duTotul(");
  const corp = cod.slice(i, cod.indexOf("async function cuValorileLorPastrate(", i) > i
    ? cod.indexOf("async function cuValorileLorPastrate(", i) : undefined);
  assert.match(corp, /if \(!pol\.stoc \|\| !pol\.pret\) \{[\s\S]*?cuValorileLorPastrate\(/);
  assert.match(corp, /deTrimis = pastrate\.oferte;/);
  assert.match(corp, /trimiteInLoturi\(admin, ctx, produs\.id, deTrimis,/);
});

test("deriva: campul oprit din setari nu se masoara, deci nici nu se repara", () => {
  const cron = faraNote("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /const pol = politicaSincronizare\(ctx\.config\);/);
  assert.match(
    cron,
    /derivaOfertei\([\s\S]*?\)\.filter\(\(d\) => \(d\.camp === "pret" \? pol\.pret : pol\.stoc\)\);/,
  );
});
