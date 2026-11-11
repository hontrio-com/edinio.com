import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  adreseFaraSlug, CHEIE_MAGAZIN_DEMO, esteMagazinDemo, esteRandDeMagazinDemo, esteSlugDeMagazinDemo, MAGAZINE_DEMO,
  MESAJ_COMENZI_OPRITE, slugDemoDupaGazda,
} from "./gazde-demo";
import { adresaDemo, TEME, temaDupaCheie } from "./teme";
import { adresaCapturii, CAPTURI_TEME } from "./capturi-teme";

/*
 * Etapa 19: demo-ul temei pe subdomeniul ei (`jupiter.edinio.com`, local `jupiter.localhost:3000`), magazinul demo fara
 * comenzi, slugurile `tema-*` rezervate. Rescrierea din proxy e probata pe proxy-ul adevarat, in `src/proxy.test.ts`.
 */

test("subdomeniul: doar `<tema>.edinio.com` si `<tema>.localhost`, oricum ar fi scrisa gazda", () => {
  for (const gazda of ["jupiter.edinio.com", "JUPITER.edinio.com", "jupiter.edinio.com:443", "jupiter.localhost:3000", "jupiter.localhost"]) {
    assert.equal(slugDemoDupaGazda(gazda), "tema-jupiter", gazda);
  }
  for (const gazda of [
    "www.edinio.com", "edinio.com", "ajutor.edinio.com", "pluton.edinio.com", "constructor.edinio.com", "__proto__.edinio.com",
    "x.jupiter.edinio.com", "jupiter.edinio.com.strain.ro", "jupiter.vercel.app", "localhost:3000", "jupiter.ro", "", null, undefined,
  ]) {
    assert.equal(slugDemoDupaGazda(gazda), null, String(gazda));
  }
});

test("fiecare tema are subdomeniul ei, spre CHIAR magazinul ei demo, si nimic in plus", () => {
  assert.equal(MAGAZINE_DEMO.size, TEME.length);
  for (const t of TEME) assert.equal(MAGAZINE_DEMO.get(t.cheie), t.slugDemo, t.cheie);
});

test("adresele fara slug: pe domeniul propriu si pe subdomeniul demo al CHIAR magazinului, nicaieri altundeva", () => {
  const demo = { slug: "tema-jupiter", custom_domain: null };
  assert.equal(adreseFaraSlug("jupiter.edinio.com", demo), true);
  assert.equal(adreseFaraSlug("jupiter.localhost:3000", demo), true);
  assert.equal(adreseFaraSlug("www.edinio.com", demo), false, "pe platforma, cu slug");
  assert.equal(adreseFaraSlug("jupiter.edinio.com", { slug: "floraria-mea", custom_domain: null }), false, "alt magazin");
  assert.equal(adreseFaraSlug("magazin-client.ro", { slug: "cu-domeniu", custom_domain: "magazin-client.ro" }), true);
  assert.equal(adreseFaraSlug("www.edinio.com", { slug: "cu-domeniu", custom_domain: "magazin-client.ro" }), false);
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function fisiere(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const cale = join(dir, n);
    return statSync(cale).isDirectory() ? fisiere(cale) : /\.tsx?$/.test(n) && !n.includes(".test.") ? [cale] : [];
  });
}

test("⚠ fiecare `basePath` al vitrinei trece prin `adreseFaraSlug` (altfel, pe subdomeniu, slugul s-ar dubla)", () => {
  const surse = [...fisiere(join("src", "app", "(public)", "[slug]")), ...fisiere(join("src", "lib", "storefront"))];
  const locuri: string[] = [];
  for (const f of surse) {
    for (const rand of cod(f).split("\n")) {
      if (/const basePath = .+\? "" : `\//.test(rand)) {
        locuri.push(f);
        assert.match(rand, /adreseFaraSlug\(/, `${f}: ${rand.trim()}`);
      }
    }
  }
  assert.ok(locuri.length >= 11, `doar ${locuri.length} locuri gasite: tiparul s-a schimbat?`);
});

test("indexarea, contul de client si Search Console raman pe `esteDomeniulPropriu` (demo-ul nu e domeniul nimanui)", () => {
  const strat = cod("src/app/(public)/[slug]/layout.tsx");
  assert.match(strat, /peOrigineaMagazinului: esteDomeniulPropriu\(host, customDomain\),/);
  assert.match(cod("src/lib/seo.ts"), /return esteDomeniulPropriu\(gazda, business\.custom_domain\) \? undefined : \{ index: false, follow: true \};/);
  assert.match(cod("src/lib/cont/origine.ts"), /return esteDomeniulPropriu\(host, business\.custom_domain\);/);
});

test("magazinul demo: semnul e al temei (scris de script), iar aplicarea si importul nu-l scriu niciodata", () => {
  for (const t of TEME) assert.equal(t.setariDemo[CHEIE_MAGAZIN_DEMO], true, t.cheie);
  assert.equal(esteMagazinDemo({ magazin_demo: true }), true);
  for (const pc of [{ magazin_demo: "true" }, { magazin_demo: 1 }, {}, null, undefined, "magazin_demo"]) assert.equal(esteMagazinDemo(pc), false, JSON.stringify(pc));
  for (const f of ["src/lib/actions/store-design.actions.ts", "src/lib/teme/import-demo.ts", "src/lib/teme/aplicare.ts"]) {
    const s = cod(f);
    assert.ok(!s.includes("CHEIE_MAGAZIN_DEMO") && !s.includes("magazin_demo") && !s.includes("setariDemo"), f);
  }
  assert.match(cod("scripts/teme/seamana-demo.ts"), /\.\.\.tema\.setariDemo/);
});

test("⚠⚠ fara comenzi pe magazinul demo: amandoua caile refuza INAINTEA contului, a cuponului, a stocului si a scrierii", () => {
  const s = cod("src/lib/actions/order.actions.ts");
  for (const nume of ["placeOrder", "placeCartOrder"]) {
    const i = s.indexOf(`export async function ${nume}(`);
    const f = s.slice(i, s.indexOf("\nexport async function ", i + 10));
    const poarta = f.indexOf("if (esteMagazinDemo(cfgRow?.page_content)) return { error: MESAJ_COMENZI_OPRITE };");
    assert.ok(poarta > 0, `${nume}: fara poarta`);
    assert.ok(poarta > f.indexOf("if (eroareCfg && cfgRow === null"), `${nume}: inaintea citirii setarilor`);
    for (const dupa of ["poartaContuluiLaComanda(", "claim_discount_use", "next_order_number", ".from(\"orders\").insert("]) {
      const j = f.indexOf(dupa);
      assert.ok(j < 0 || j > poarta, `${nume}: ${dupa} inaintea portii`);
    }
  }
  assert.match(MESAJ_COMENZI_OPRITE, /magazin demo/);
  // Il citeste clientul, in vitrina: fara diacritice, ca restul refuzurilor comenzii (vazut la proba 19.4).
  assert.doesNotMatch(MESAJ_COMENZI_OPRITE, /[ăâîșțşţĂÂÎȘȚŞŢ]/);
});

test("slugurile `tema-*` sunt rezervate la crearea magazinului si la intrebarea „e liber?”", () => {
  assert.equal(esteSlugDeMagazinDemo("tema-jupiter"), true);
  assert.equal(esteSlugDeMagazinDemo("tema-saturn"), true);
  for (const slug of ["tema", "temax", "floraria-tema-mea", "jupiter"]) assert.equal(esteSlugDeMagazinDemo(slug), false, slug);
  const b = cod("src/lib/actions/business.actions.ts");
  assert.match(b, /if \(NON_STORE_SEGMENTS\.has\(slug\) \|\| esteSlugDeMagazinDemo\(slug\)\) \{/);
  // Aceeasi functie la creare si la verificarea disponibilitatii: „liber” nu poate minti inaintea platii.
  assert.match(b, /const motiv = motivSlugRespins\(slug\);/);
  assert.match(b, /if \(motivSlugRespins\(normalizat\)\) return false;/);
});

test("„Vezi demo” pe subdomeniu, dupa gazda panoului; pe card, captura temei (nu demo-ul viu, din 08.11)", () => {
  const j = temaDupaCheie("jupiter")!;
  assert.equal(adresaDemo(j, "localhost:3000"), "http://jupiter.localhost:3000");
  assert.equal(adresaDemo(j, "www.edinio.com"), "https://jupiter.edinio.com");
  assert.equal(adresaDemo(j, "edinio.com"), "https://jupiter.edinio.com");
  assert.equal(adresaDemo(j, "edinio-git-x.vercel.app"), "/tema-jupiter", "pe o desfasurare, subdomeniul nu exista");
  assert.equal(adresaDemo(j, null), "/tema-jupiter");
  const p = cod("src/app/(dashboard)/dashboard/editor/teme/page.tsx");
  assert.match(p, /adresaDemo: adresaDemo\(t, gazda\),/);
  assert.match(p, /captura: CAPTURI_TEME\[t\.cheie\] \? \{ adresa: adresaCapturii\(t\.cheie\), \.\.\.CAPTURI_TEME\[t\.cheie\] \} : null,/);
  // 30 de magazine intregi in iframe-uri, doar ca sa fie privite: nu mai.
  assert.doesNotMatch(cod("src/components/teme/TemeClient.tsx"), /<iframe/);
  // Fiecare tema are captura ei pe disc, cu dimensiunile scrise de script (`scripts/teme/capturi-teme.mjs`).
  for (const t of TEME) {
    const c = CAPTURI_TEME[t.cheie];
    assert.ok(c && c.latime > 0 && c.inaltime > c.latime, `${t.cheie}: captura lipseste din CAPTURI_TEME`);
    assert.ok(statSync(join("public", adresaCapturii(t.cheie))).size > 0, `${t.cheie}: lipseste fisierul capturii`);
  }
  assert.match(cod("next.config.ts"), /allowedDevOrigins: \["\*\.localhost"\],/);
});

test("productia, pregatita si oprita: scriptul cere `--productie`, SQL-ul nu preia slugul altui cont", () => {
  assert.match(cod("scripts/teme/seamana-demo.ts"), /if \(url\.includes\(PRODUCTIA\) && !process\.argv\.includes\("--productie"\)\) \{\s*throw new Error/);
  const sql = readFileSync("scripts/teme/magazinul-demo.sql", "utf8");
  assert.match(sql, /elsif not exists \(select 1 from public\.businesses where id = magazin and user_id = cont\) then\s*-- [^\n]*\n\s*raise exception/);
  assert.match(sql, /slug_magazin constant text := 'tema-jupiter';/);
  assert.match(sql, /update public\.users_profile set plan = 'ultra', plan_expires_at = '2099-12-31 00:00:00\+00' where id = cont;/);
  assert.match(sql, /insert into privat\.store_settings \(business_id\) values \(magazin\) on conflict \(business_id\) do nothing;/);
  assert.doesNotMatch(sql, /\bdelete\b|\bdrop\b|\btruncate\b/i, "procedura nu sterge nimic");
});

test("santinela nu probeaza magazinele demo: slugul rezervat SAU semnul ajung singure, in orice forma a setarilor", () => {
  // Magazine de comerciant: slug obisnuit, fara semn (si cu setarile lipsa sau ca lista).
  assert.equal(esteRandDeMagazinDemo({ slug: "esafero-echipamente-protectia-muncii", store_settings: { page_content: { pagina_acasa: "x" } } }), false);
  assert.equal(esteRandDeMagazinDemo({ slug: "okxi", store_settings: null }), false);
  assert.equal(esteRandDeMagazinDemo({ slug: "okxi", store_settings: [{ page_content: { [CHEIE_MAGAZIN_DEMO]: false } }] }), false);
  // Un sir „true” nu e semnul: semnul e boolean, ca la poarta comenzilor (`esteMagazinDemo`).
  assert.equal(esteRandDeMagazinDemo({ slug: "un-magazin", store_settings: { page_content: { [CHEIE_MAGAZIN_DEMO]: "true" } } }), false);
  // Demo: slugul ajunge singur (intre SQL-ul care face magazinul si umplere, semnul inca lipseste)...
  assert.equal(esteRandDeMagazinDemo({ slug: "tema-vega", store_settings: null }), true);
  // ...si semnul ajunge singur, fie ca PostgREST da setarile ca obiect, fie ca lista.
  assert.equal(esteRandDeMagazinDemo({ slug: "un-magazin", store_settings: { page_content: { [CHEIE_MAGAZIN_DEMO]: true } } }), true);
  assert.equal(esteRandDeMagazinDemo({ slug: "un-magazin", store_settings: [{ page_content: { [CHEIE_MAGAZIN_DEMO]: true } }] }), true);

  // Si santinela chiar ii scoate, o singura data, INAINTEA ambelor liste (vii si publicate fara domeniu).
  const ruta = readFileSync("src/app/api/cron/santinela/route.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(ruta, /const reale = \(mag \?\? \[\]\)\.filter\(\(b\) => !esteRandDeMagazinDemo\(b\)\);/);
  assert.equal((ruta.match(/mag \?\? \[\]/g) ?? []).length, 1, "o lista citita pe langa filtru ar aduce demo-urile inapoi");
  assert.match(ruta, /const publicateFaraDomeniu: MagazinPublicat\[\] = reale\n/);
  assert.match(ruta, /for \(const b of reale\) \{/);
});
