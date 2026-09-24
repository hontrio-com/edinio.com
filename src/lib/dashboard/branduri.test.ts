import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { brandCanonic, curataBrand, dubluriDeBrand } from "./branduri";
import { aplicaFiltreProduse, citesteFiltreProduse, FARA_BRAND } from "./produse-filtre";
import type { FiltreProduse } from "./produse-filtre";
import { MENIU_PANOU } from "../navigatie-panou";

/*
 * Brandul produsului: camp vazut in formular, filtru si actiune in masa in lista,
 * pagina Produse > Branduri. Brandul sta in `page_sections.google.brand`, de unde
 * il citesc pagina produsului, filtrul magazinului, feedurile si marketplace-urile.
 */

const RADACINA = process.cwd();
/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
const sursa = (f: string) => readFileSync(path.join(RADACINA, f), "utf8").replace(/\r\n/g, "\n");

/* ─────────────── forma brandului ─────────────── */

test("curataBrand strange spatiile si taie la 120", () => {
  assert.equal(curataBrand("  Port   west \n"), "Port west");
  assert.equal(curataBrand("x".repeat(200)).length, 120);
  assert.equal(curataBrand(null), "");
  assert.equal(curataBrand(42), "");
});

test("⚠⚠ brandCanonic: „armaf” scris de om devine „Armaf” cel existent", () => {
  /* Masurat pe productie (mokka): „Armaf” (1) si „ARMAF” (3), doua filtre in magazin. */
  assert.equal(brandCanonic("armaf", ["Portwest", "Armaf"]), "Armaf");
  assert.equal(brandCanonic("  ARMAF ", ["Armaf"]), "Armaf");
  assert.equal(brandCanonic("Port  west", ["Port west"]), "Port west");
});

test("brandCanonic lasa un brand NOU exact cum l-a scris omul (doar curatat)", () => {
  assert.equal(brandCanonic(" Dewalt ", ["Portwest"]), "Dewalt");
  assert.equal(brandCanonic("   ", ["Portwest"]), "");
});

test("dubluriDeBrand intoarce numai grupurile cu mai mult de un nume", () => {
  const g = dubluriDeBrand([
    { brand: "Armaf", produse: 1 },
    { brand: "ARMAF", produse: 3 },
    { brand: "Portwest", produse: 9 },
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map((b) => b.brand).sort(), ["ARMAF", "Armaf"]);
});

/* ─────────────── filtrul din lista ─────────────── */

function interogareFalsa() {
  const apeluri: { metoda: string; args: unknown[] }[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "or", "in", "ilike", "lte", "gte", "not", "is"]) {
    q[m] = (...args: unknown[]) => { apeluri.push({ metoda: m, args }); return q; };
  }
  return { q, apeluri };
}
const GOALE = citesteFiltreProduse({}) as FiltreProduse;

test("filtrul pe un brand cere EXACT calea din care citesc feedurile", () => {
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, { ...GOALE, brand: "Portwest" }, []);
  assert.ok(apeluri.some((a) => a.metoda === "eq" && a.args[0] === "page_sections->google->>brand" && a.args[1] === "Portwest"));
});

test("⚠ „Produse fara brand” cere si cheia lipsa, si sirul gol", () => {
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, { ...GOALE, brand: FARA_BRAND }, []);
  assert.ok(apeluri.some((a) => a.metoda === "or" && a.args[0] === "page_sections->google->>brand.is.null,page_sections->google->>brand.eq."));
  assert.equal(apeluri.some((a) => a.metoda === "eq" && a.args[1] === FARA_BRAND), false, "semnul nu e un nume de brand");
});

test("fara filtru de brand nu se atinge calea brandului", () => {
  const { q, apeluri } = interogareFalsa();
  aplicaFiltreProduse(q as never, GOALE, []);
  assert.equal(apeluri.some((a) => String(a.args[0]).includes("brand")), false);
});

/* ─────────────── baza ─────────────── */

test("⚠⚠ functiile din baza sunt `security invoker` si schimba NUMAI cheia brand", () => {
  /*
   * `security definer` ar fi ocolit RLS: oricine autentificat ar fi putut rescrie
   * brandul produselor altui magazin, dand alt `p_business`. Invoker = RLS-ul
   * „Owners can manage products” le margineste la produsele lui.
   */
  const m = sursa("migrations/2026-09-24-produse-branduri.sql");
  assert.doesNotMatch(m, /security\s+definer/i);
  assert.equal((m.match(/security\s+invoker/gi) ?? []).length >= 3, true);
  /* Stergerea scoate cheia, nu tot obiectul `google` (GTIN-ul si restul raman). */
  assert.match(m, /-> 'google'\)\s*-\s*'brand'/);
  assert.doesNotMatch(m, /page_sections\s*-\s*'google'/);
  assert.match(m, /revoke[^;]*from\s+public[^;]*anon|revoke[^;]*from\s+anon/i);
});

/* ─────────────── formularul ─────────────── */

test("⚠⚠ campul Brand sta in Organizare, NU doar in sectiunea Google", () => {
  /* Inainte se vedea numai cu Google Merchant conectat si comutatorul pornit: 3 din 4 magazine nu-l vedeau. */
  const f = sursa("src/components/dashboard/ProductForm.tsx");
  assert.equal((f.match(/id="produs-brand"/g) ?? []).length, 1);
  assert.equal((f.match(/value=\{form\.google\.brand\}/g) ?? []).length, 1, "un singur camp de brand, nu doua");
  assert.match(f, /brand: brandCanonic\(form\.google\.brand, brands\)/);
});

/* ─────────────── actiunile ─────────────── */

test("⚠⚠ fiecare actiune de brand verifica utilizatorul si ca magazinul e al lui", () => {
  const a = sursa("src/lib/actions/branduri.actions.ts");
  assert.match(a, /^"use server";/);
  assert.match(a, /auth\.getUser\(\)/);
  assert.match(a, /\.eq\("id", businessId\)\.eq\("user_id", user\.id\)/);
  const exporturi = [...a.matchAll(/export async function (\w+)/g)].map((x) => x[1]);
  assert.deepEqual(exporturi.sort(), ["adaugaBrandul", "redenumesteBrandul", "stergeBrandul", "unesteBrandul"]);
  /* Adaugarea scrie direct in `brands`: tot intai proprietarul, apoi scrierea. */
  const corpAdauga = a.slice(a.indexOf("export async function adaugaBrandul")).split("\nexport ")[0];
  assert.ok(corpAdauga.indexOf("magazinulMeu") > 0, "adaugaBrandul verifica proprietarul");
  assert.ok(corpAdauga.indexOf("magazinulMeu") < corpAdauga.indexOf('.from("brands").insert'), "verificarea vine INAINTEA scrierii");
  /* Toate trec prin `schimba`, care intreaba intai `magazinulMeu`. */
  const corpSchimba = a.slice(a.indexOf("async function schimba"), a.indexOf("export async function"));
  assert.ok(corpSchimba.indexOf("magazinulMeu") < corpSchimba.indexOf("rpc("), "verificarea vine INAINTEA scrierii");
  for (const nume of ["unesteBrandul", "stergeBrandul"]) {
    const corp = a.slice(a.indexOf(`export async function ${nume}`)).split("\nexport ")[0];
    assert.match(corp, /return schimba\(/, `${nume} trece prin schimba`);
  }
});

test("⚠ dupa schimbarea brandului pleaca feedurile si proiectia, ca la categorie", () => {
  for (const f of ["src/lib/actions/branduri.actions.ts", "src/lib/actions/product.actions.ts"]) {
    const s = sursa(f);
    const bucata = f.endsWith("branduri.actions.ts")
      ? s
      : s.slice(s.indexOf('action.kind === "brand"'), s.indexOf('action.kind === "brand"') + 2500);
    assert.ok(bucata.length > 0, f);
    for (const coada of ["enqueueGmcSyncMany", "enqueueOlxSyncMany", "enqueueAboutYouSyncMany", "enqueueTrendyolSyncMany", "enqueueEmagSyncMany", "proiecteazaImediat"]) {
      assert.match(bucata, new RegExp(coada), `${f}: ${coada}`);
    }
  }
});

test("Branduri e in meniul Produse", () => {
  const produse = MENIU_PANOU.flatMap((g) => ("items" in g ? g.items : [g]) as unknown[])
    .flatMap((i) => [i, ...(((i as { children?: unknown[] }).children) ?? [])]) as { href?: string; label?: string }[];
  assert.ok(produse.some((i) => i.href === "/dashboard/products/brands" && i.label === "Branduri"));
});

/* ─────────────── lista proprie (`brands`), ca la categorii ─────────────── */

test("⚠⚠ `brands`: RLS pornit, numai proprietarul, nicio citire pentru anon", () => {
  const m = sursa("migrations/2026-09-24-produse-branduri-z-lista.sql");
  assert.match(m, /alter table public\.brands enable row level security/);
  /* `with check` cere proprietarul si la SCRIERE: fara el, cineva ar putea insera in magazinul altuia. */
  assert.match(m, /with check \(business_id in \(select b\.id from public\.businesses b where b\.user_id = \(select auth\.uid\(\)\)\)\)/);
  assert.match(m, /revoke all on table public\.brands from public, anon, authenticated/);
  assert.doesNotMatch(m, /grant [^;]*on table public\.brands to [^;]*anon/);
  assert.doesNotMatch(m, /security\s+definer/i);
  /* Un brand in doua forme de majuscule e acelasi rand. */
  assert.match(m, /unique index [^;]*on public\.brands \(business_id, lower\(name\)\)/);
});

test("⚠ stergerea unei forme nu scoate din lista brandul inca folosit in alta forma", () => {
  /* Probat pe demo: „Sterge ARMAF” cu „Armaf” pe un produs lasa randul „Armaf”. */
  const m = sursa("migrations/2026-09-24-produse-branduri-z-lista.sql");
  const stergerea = m.slice(m.indexOf("delete from public.brands"), m.indexOf("end $$;", m.indexOf("delete from public.brands")));
  assert.match(stergerea, /and not exists \(select 1 from public\.products p/);
});

test("pagina Branduri are „Brand nou”, care cheama adaugaBrandul", () => {
  const c = sursa("src/components/dashboard/BranduriClient.tsx");
  assert.match(c, /Brand nou/);
  assert.match(c, /adaugaBrandul\(businessId, nume\)/);
});
