import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { caInactivDacaEDemo, esteProdusDemo, FARA_PRODUSE_DEMO, SURSA_DEMO } from "./produse-demo";
import { SURSA_DEMO as SURSA_IMPORT } from "./import-demo";

/*
 * Etapa 18.1 din `docs/editor-magazin/PLAN.md` (hotararea lui, 29.10.2026: „Le opresc la toate canalele”): produsele
 * demo ale unei teme raman DOAR in magazin. Fiecare canal le sare ca pe un produs inactiv; paginile lor au `noindex`
 * si lipsesc din sitemap. Canalele vorbesc cu baza si cu altii, deci portile se probeaza pe sursa.
 */

test("regula: produsul demo se recunoaste dupa sursa; vazut ca inactiv, fara sa se schimbe altceva", () => {
  assert.equal(SURSA_DEMO, "tema-demo");
  assert.equal(SURSA_IMPORT, SURSA_DEMO, "importul scrie aceeasi sursa pe care o recunosc canalele");
  assert.equal(esteProdusDemo({ source: "tema-demo" }), true);
  for (const p of [{ source: null }, { source: "emag" }, {}, null, undefined]) assert.equal(esteProdusDemo(p), false);
  const demo = { id: "a", is_active: true, source: "tema-demo", price: 10 };
  assert.deepEqual(caInactivDacaEDemo(demo), { id: "a", is_active: false, source: "tema-demo", price: 10 });
  assert.equal(demo.is_active, true, "nu schimba randul citit");
  const alLui = { id: "b", is_active: true, source: null };
  assert.equal(caInactivDacaEDemo(alLui), alLui, "produsele lui trec neatinse");
});

test("⚠ filtrul pastreaza produsele FARA sursa (cele mai multe): un `neq` singur le-ar fi pierdut", () => {
  assert.equal(FARA_PRODUSE_DEMO, "source.is.null,source.neq.tema-demo");
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("⚠⚠ fiecare poarta de iesire sare produsele demo", () => {
  // Google Merchant: ca un inactiv, deci pe ramura de stergere (care nu face nimic pentru ce n-a plecat niciodata).
  assert.match(cod("src/app/api/cron/gmc-sync/route.ts"), /for \(const p of prods \?\? \[\]\) if \(p\.is_active && !esteProdusDemo\(p\)\) productMap\.set\(/);
  const gmc = cod("src/lib/actions/google-merchant.actions.ts");
  assert.equal((gmc.match(/\.eq\("is_active", true\)\.or\(FARA_PRODUSE_DEMO\)/g) ?? []).length, 2, "numaratoarea si „sincronizeaza tot”");
  // Fluxurile cu toate produsele active: Meta, Pepita, sitemapul.
  assert.match(cod("src/app/(public)/[slug]/facebook-catalog.xml/route.ts"), /\.eq\("is_active", true\)\s*\.or\(FARA_PRODUSE_DEMO\)/);
  assert.equal((cod("src/lib/actions/facebook-feeds.actions.ts").match(/\.or\(FARA_PRODUSE_DEMO\)/g) ?? []).length, 3);
  assert.match(cod("src/lib/pepita/feed.ts"), /\.eq\("business_id", businessId\)\.eq\("is_active", true\)\s*\.or\(FARA_PRODUSE_DEMO\)/);
  assert.match(cod("src/lib/pepita/includere-in-masa.ts"), /\.eq\("is_active", true\)\s*\.or\(FARA_PRODUSE_DEMO\)/);
  assert.match(cod("src/app/sitemap.ts"), /\.eq\("is_active", true\)\s*\.or\(FARA_PRODUSE_DEMO\)\s*\.not\("slug", "is", null\)/);
  // Email marketing: ca un inactiv, deci scos de la furnizor, nu trimis.
  const email = cod("src/lib/email-marketing/catalog.ts");
  assert.match(email, /const campuri = "id, name, price, images, slug, description, is_active, source";/);
  assert.match(email, /active: randuri\.filter\(\(r\) => r\.is_active !== false && !esteProdusDemo\(r\)\)/);
  assert.match(email, /inactive: randuri\.filter\(\(r\) => r\.is_active === false \|\| esteProdusDemo\(r\)\)/);
  // Marketplace-urile: unde se citeste produsul, demo-ul devine inactiv; drumul inactivului e al lor, probat.
  assert.match(cod("src/app/api/cron/olx-sync/route.ts"), /productMap\.set\(p\.id, caInactivDacaEDemo\(p\)\)/);
  assert.match(cod("src/lib/olx/sync.ts"), /return upsertRemote\(admin, ctx, businessId, productId, data \? caInactivDacaEDemo\(data as MappableProduct\) : null\);/);
  const trendyol = cod("src/lib/trendyol/sync.ts");
  assert.match(trendyol, /if \(esteProdusDemo\(product as \{ source\?: string \| null \}\)\) product\.is_active = false;/);
  assert.match(trendyol, /message: "Produs demo: rămâne doar în magazin\."/);
  assert.match(cod("src/lib/aboutyou/sync.ts"), /if \(!product\) return removeProductNow\(admin, ctx, productId\);\s*if \(esteProdusDemo\(product\)\) product\.is_active = false;/);
  assert.match(cod("src/lib/emag/trimite.ts"), /return p \? caInactivDacaEDemo\(p\) : null;/);
  assert.match(cod("src/lib/easysales/eligibilitate.ts"), /if \(esteProdusDemo\(p\)\) motive\.push\(blocheaza\("demo", "Produs demo din temă: rămâne doar în magazin\."\)\);/);
  // Coloanele citite au si sursa, altfel `esteProdusDemo` n-ar avea ce citi.
  for (const f of ["src/lib/olx/sync.ts", "src/lib/trendyol/sync.ts", "src/lib/easysales/eligibilitate.ts"]) {
    assert.match(cod(f), /(PRODUCT_FIELDS|COLOANE_PRODUS_CATALOG) =[^;]*, source";/, f);
  }
  // La About You `PRODUCT_FIELDS` e lista campurilor TRIMISE (o asculta declansatorul din baza): sursa se citeste aparte.
  const ay = cod("src/lib/aboutyou/sync.ts");
  assert.match(ay, /const PRODUCT_FIELDS_CU_SURSA = `\$\{PRODUCT_FIELDS\}, source` as const;/);
  assert.match(ay, /\.from\("products"\)\.select\(PRODUCT_FIELDS_CU_SURSA\)\.eq\("id", productId\)/);
  assert.doesNotMatch(ay, /PRODUCT_FIELDS =[^;]*source/);
  // Pagina produsului demo: `noindex`.
  assert.match(cod("src/app/(public)/[slug]/_rute/pagina-produs.tsx"), /const noindex = \(storeMode\.mode === "one_product" && storeMode\.productId !== product\.id\) \|\| esteProdusDemo\(product\);/);
});

/*
 * ⚠⚠ Un cititor NOU de produse intr-un canal: proba de mai jos cade. Atunci fie trece prin poarta lui (FARA_PRODUSE_DEMO,
 * esteProdusDemo, caInactivDacaEDemo), fie e de INTRARE (comenzi, importuri, monitorizare) si nu trimite nimic. Abia
 * dupa ce s-a hotarat, se scrie aici numarul nou.
 */
const CITIRI_IN_CANALE: Record<string, number> = {
  "src/app/(public)/[slug]/facebook-catalog.xml/route.ts": 1,
  "src/app/api/cron/emag-sync/route.ts": 2, // amprentele si deriva: doar produse cu oferte; trimiterea trece prin `citesteProdusul`
  "src/app/api/cron/gmc-sync/route.ts": 2, // a doua: componentele pachetelor
  "src/app/api/cron/olx-sync/route.ts": 1,
  "src/app/api/cron/santinela/route.ts": 3, // monitorizare, nu trimite nimic
  "src/app/sitemap.ts": 1,
  "src/lib/aboutyou/orders.ts": 1, // comenzi venite de la ei
  "src/lib/aboutyou/sync.ts": 4, // deriva, stocul si pretul: doar produse cu listare
  "src/lib/actions/aboutyou.actions.ts": 6,
  "src/lib/actions/emag.actions.ts": 9,
  "src/lib/actions/facebook-feeds.actions.ts": 4,
  "src/lib/actions/google-merchant.actions.ts": 2,
  "src/lib/actions/olx.actions.ts": 6,
  "src/lib/actions/pepita.actions.ts": 7,
  "src/lib/actions/trendyol.actions.ts": 9,
  "src/lib/easysales/catalog-actiuni.ts": 3,
  "src/lib/easysales/catalog-baza.ts": 1,
  "src/lib/easysales/catalog.ts": 2,
  "src/lib/easysales/comenzi.ts": 1,
  "src/lib/easysales/stoc.ts": 1,
  "src/lib/easysales/vanzari-externe.ts": 1,
  "src/lib/emag/import-run.ts": 2, // importul DE LA eMAG
  "src/lib/emag/trimite.ts": 1,
  "src/lib/email-marketing/catalog.ts": 2,
  "src/lib/olx/sync.ts": 4,
  "src/lib/pepita/feed.ts": 2, // a doua: componentele pachetelor
  "src/lib/pepita/includere-in-masa.ts": 1,
  "src/lib/pepita/ingest.ts": 2, // comenzi venite de la ei
  "src/lib/trendyol/sync.ts": 3,
};

const RADACINI_CANALE = [
  "src/lib/emag", "src/lib/olx", "src/lib/trendyol", "src/lib/aboutyou", "src/lib/easysales", "src/lib/pepita",
  "src/lib/email-marketing", "src/lib/google-merchant", "src/lib/facebook", "src/app/api/cron", "src/app/sitemap.ts",
  "src/app/sitemap-magazine.xml", "src/app/(public)/[slug]/sitemap.xml", "src/app/(public)/[slug]/facebook-catalog.xml",
  "src/lib/actions/aboutyou.actions.ts", "src/lib/actions/emag.actions.ts", "src/lib/actions/olx.actions.ts",
  "src/lib/actions/trendyol.actions.ts", "src/lib/actions/pepita.actions.ts", "src/lib/actions/google-merchant.actions.ts",
  "src/lib/actions/facebook-feeds.actions.ts",
];

function fisiere(p: string, out: string[] = []): string[] {
  let st;
  try { st = statSync(p); } catch { return out; }
  if (st.isDirectory()) for (const n of readdirSync(p)) fisiere(path.join(p, n), out);
  else if (/\.(ts|tsx)$/.test(p) && !/\.test\.ts$/.test(p)) out.push(p.split(path.sep).join("/"));
  return out;
}

test("⚠⚠ nicio citire noua de produse intr-un canal fara sa se hotarasca daca produsele demo trec pe acolo", () => {
  const gasite: Record<string, number> = {};
  for (const f of RADACINI_CANALE.flatMap((r) => fisiere(r)).sort()) {
    const n = (readFileSync(f, "utf8").match(/from\("(products|catalog_produs)"\)/g) ?? []).length;
    if (n > 0) gasite[f] = n;
  }
  assert.deepEqual(gasite, CITIRI_IN_CANALE);
});
