import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sablonImpusDin } from "./preview-protocol";

/**
 * SABLOANELE IN MAGAZIN (etapa 4b.2). Rutele nu se pot randa intr-o proba de Node, deci legaturile
 * se probeaza pe sursa; alegerea propriu-zisa e in `sabloane-produs.test.ts`.
 *
 * Rulare: `npm test`.
 */

const fara = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const sursa = (f: string) => fara(readFileSync(f, "utf8"));

const RUTA_PRODUS = "src/app/(public)/[slug]/_rute/pagina-produs.tsx";
const RUTA_UN_PRODUS = "src/app/(public)/[slug]/page.tsx";
const DIN_DESIGN = "src/components/storefront/sections/product/ProductPageDinDesign.tsx";

test("sablonul impus din adresa: doar un id curat, o singura data", () => {
  assert.equal(sablonImpusDin({ sablon: "sec_abc_1" }), "sec_abc_1");
  assert.equal(sablonImpusDin({ sablon: ["a", "b"] }), null);
  assert.equal(sablonImpusDin({ sablon: "<script>" }), null);
  assert.equal(sablonImpusDin({ sablon: "" }), null);
  assert.equal(sablonImpusDin(undefined), null);
});

test("⚠⚠ sablonul se alege din designul VIU si marcajul poarta id-ul lui", () => {
  const s = sursa(DIN_DESIGN);
  // Din context (designul trimis live de editor), nu din proprietati venite de pe server.
  assert.match(s, /const \{ design \} = useStoreChrome\(\);/);
  assert.match(s, /sablonulProdusului\(design\.product, restul\.product\.id, categoriiProdusului\)/);
  assert.match(s, /<MarcajSectiune sectiune=\{pagina\}>/, "marcajul trebuie sa poarte sablonul ales");
  for (const p of ["variant={pagina.variant}", "setari={pagina.settings}", "blocuri={pagina.blocks}", "idPagina={pagina.id}"]) {
    assert.ok(s.includes(p), `lipseste ${p}`);
  }
});

test("⚠⚠ rutele nu mai pun marcajul de pe server: ar fi ramas id-ul primei randari", () => {
  for (const f of [RUTA_PRODUS, RUTA_UN_PRODUS]) {
    const s = sursa(f);
    assert.doesNotMatch(s, /<MarcajSectiune sectiune=\{[^}]*product\.page\}/, `${f} infasoara iar pagina de produs`);
    assert.match(s, /<ProductPageDinDesign\b[^>]*paginaImplicita=/);
  }
  // Magazinul cu un singur produs: pagina lui e pagina principala, mereu Implicit.
  assert.match(sursa(RUTA_UN_PRODUS), /<ProductPageDinDesign[\s\S]{0,200}doarImplicit/);
});

test("⚠ pagina publica nu citeste categoriile decat cand designul are sabloane pe categorii, sau in editor", () => {
  const s = sursa(RUTA_PRODUS);
  assert.match(s, /product\.category && \(esteEditorDesign \|\| areSabloanePeCategorii\(resolved\.design\.product\)\)/);
  assert.equal(s.split('from("categories")').length - 1, 1, "o singura citire a categoriilor");
  // Sablonul impus vine din adresa numai in editor: altfel oricine ar fi schimbat pagina cu `?sablon=`.
  assert.match(s, /const sablonImpus = esteEditorDesign \? sablonImpusDin\(sp\) : null;/);
});

test("variantele isi iau id-ul paginii din sablonul ales, cand il primesc", () => {
  for (const f of ["src/components/storefront/sections/product/ProductPageClassic.tsx", "src/components/storefront/sections/product/ProductPageDetailed.tsx"]) {
    assert.match(sursa(f), /const idPagina = idPaginaSablon \?\? chrome\?\.design\?\.product\.page\.id \?\? "product_page";/, f);
  }
});
