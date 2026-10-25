import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ciornaDeRandat } from "./ciorna-proprietarului";

/*
 * Paginile magazinului in editorul unic (etapa 2, 25.10.2026; continutul ciornei din etapa 6).
 *
 * Pana in etapa 2, pagina de produs, cosul si comanda randau mereu designul publicat si nu
 * ascultau editorul. Acum fiecare pagina aleasa in editor randeaza ciorna proprietarului, iar din
 * etapa 6 si continutul ei nepublicat (texte, logo, culoare), inainte de „Publică”.
 */

const RAD = process.cwd();
const cod = (f: string) =>
  readFileSync(path.join(RAD, f), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const RUTE: Record<string, string> = {
  acasa: "src/app/(public)/[slug]/page.tsx",
  pagina: "src/app/(public)/[slug]/[pageSlug]/page.tsx",
  produs: "src/app/(public)/[slug]/_rute/pagina-produs.tsx",
  magazin: "src/lib/storefront/catalog/pagina-magazin.tsx",
  cos: "src/app/(public)/[slug]/cos/page.tsx",
  comanda: "src/app/(public)/[slug]/checkout/page.tsx",
};
/** Miniaturile din galeria de design-uri: tot ale proprietarului, fara semnele de editor. */
const MINIATURI = "src/app/(public)/preview-sectiune/[slug]/page.tsx";

test("⚠⚠ coloana de ciorna nu intra in randul de setari al niciunei pagini", () => {
  /*
   * Randul de setari pleaca intreg catre componente de client, iar React il serializeaza in
   * HTML-ul fiecarui vizitator. Ciorna se citeste numai prin `ciornaDeRandat`, separat.
   */
  for (const [pagina, fisier] of Object.entries({ ...RUTE, miniaturi: MINIATURI })) {
    assert.doesNotMatch(cod(fisier), /storefront_design_draft/, `${pagina}: ${fisier} cere ciorna in randul de setari`);
  }
});

test("⚠⚠ ciorna si continutul ei: nicio citire si nimic intors pentru cine nu e proprietarul, in editor", async () => {
  let citiri = 0;
  const ciornaInBaza = { version: 1, continut: { pc: { logo_size: 70 }, magazin: { primary_color: "#ff0000" } } };
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            citiri += 1;
            return { data: { storefront_design_draft: ciornaInBaza } };
          },
        }),
      }),
    }),
  } as never;

  const vizitator = await ciornaDeRandat(admin, "b", false);
  assert.equal(citiri, 0, "pentru un vizitator nu se citeste nici macar coloana");
  assert.deepEqual(vizitator, { ciorna: null, continut: { pc: {}, magazin: {} } });

  const proprietar = await ciornaDeRandat(admin, "b", true);
  assert.equal(citiri, 1);
  assert.equal(proprietar.ciorna, ciornaInBaza);
  assert.deepEqual(proprietar.continut, { pc: { logo_size: 70 }, magazin: { primary_color: "#ff0000" } });
});

test("⚠⚠ paginile alese in editor randeaza ciorna SI continutul ei, si asculta editorul", () => {
  for (const [pagina, fisier] of Object.entries(RUTE)) {
    const text = cod(fisier);
    assert.match(text, /esteEditorDeDesign\(/, `${pagina}: nu afla daca e deschisa in editor`);
    // Continutul vine DOAR din `ciornaDeRandat`, cu semnul de editor: altfel l-ar vedea si un vizitator.
    assert.match(text, /ciornaDeRandat\((?:createAdminClient\(\)|admin), (?:business|businessCitit)\.id, esteEditorDesign\)/, `${pagina}: nu citeste ciorna in editor`);
    assert.match(text, /ciorna\.ciorna \?\? storeSettings\?\.storefront_design/, `${pagina}: randeaza mereu designul publicat`);
    assert.match(text, /pcCuCiorna\([^;]*ciorna\.continut\)/, `${pagina}: textele nepublicate nu ajung in previzualizare`);
    assert.match(text, /const magazin = magazinCuCiorna\((business|businessCitit), ciorna\.continut\);/, `${pagina}: logo-ul si culoarea nepublicate nu ajung in previzualizare`);
    // Antetul, subsolul si pagina primesc magazinul cu ciorna, nu pe cel citit.
    assert.match(text, /business: magazin|pentruBrowser\(magazin\)/, `${pagina}: randarea foloseste magazinul fara ciorna`);
    // Si NICIUN loc de randare cu cel citit: o plasa care cere „macar una” nu cade cand ramane una veche.
    assert.doesNotMatch(text, /pentruBrowser\(business\)|business: business as never|buildChromeData\(\{\s*(?:searchCategories,\s*)?business,/, `${pagina}: un loc de randare primeste magazinul fara ciorna`);
    assert.doesNotMatch(text, /const pageContent = \(storeSettings\?\.page_content \?\? \{\}\) as StorePageContent;/, `${pagina}: textele fara ciorna`);
    // Direct, sau prin `color` (pagina proprie), luata tot din magazinul cu ciorna.
    assert.match(text, /primaryColor: magazin\.primary_color|const color = magazin\.primary_color/, `${pagina}: designul se rezolva cu culoarea veche`);
    assert.doesNotMatch(text, /primaryColor: business\.primary_color/, `${pagina}: designul se rezolva cu culoarea veche`);
    assert.match(text, /(esteEditorDesign|editorDesign)=\{esteEditorDesign\}/, `${pagina}: nu asculta mesajele editorului`);
  }
});

test("miniaturile de sectiune arata si identitatea nepublicata, tot numai proprietarului", () => {
  const text = cod(MINIATURI);
  assert.match(text, /const esteProprietar = !!user && user\.id === businessCitit\.user_id;/);
  assert.match(text, /ciornaDeRandat\(createAdminClient\(\), businessCitit\.id, esteProprietar\)/);
  assert.match(text, /const business = magazinCuCiorna\(businessCitit, ciorna\.continut\);/);
  assert.match(text, /pcCuCiorna\([^;]*ciorna\.continut\)/);
});
