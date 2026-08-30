import test from "node:test";
import assert from "node:assert/strict";
import { isEmptyDesign, parseInternals, parseStoreDesign, parseStoreStyle } from "./parse";
import { buildClassicDesign, resolveStyle } from "./defaults";
import { styleToCssVars } from "./css-vars";
import { addSection, moveSection, removeSection, toggleSection, updateSection } from "./edit";
import { SECTION_REGISTRY } from "./registry";
import type { DesignContext, SectionInstance, StoreDesign } from "./types";

/**
 * Parserul de design e singurul lucru care sta intre jsonb-ul din baza si ce vede
 * un client intr-un magazin. Trebuie sa fie total (orice intrare -> design valid)
 * si sa nu lase sa treaca valori periculoase catre atributul `style`.
 *
 * Rulare: `npm test`.
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };

const byId = (list: SectionInstance[], id: string) => list.find((s) => s.id === id);

test("orice intrare invalida randeaza designul classic", () => {
  for (const raw of [null, undefined, {}, [], "x", 5, { version: 99 }]) {
    const d = parseStoreDesign(raw, ctx);
    assert.equal(d.version, 1);
    assert.equal(d.chrome.header.variant, "classic");
    assert.ok(d.home.some((s) => s.kind === "product_grid"));
  }
});

test("designul classic reflecta flag-urile din page_content", () => {
  const d = buildClassicDesign({
    ...ctx,
    pageContent: {
      hero_show_content: true,
      show_trust_strip_on_store: true,
      show_featured_section: true,
      featured_section_title: "Alese de noi",
      announcement_bar: { enabled: true },
      product_sections: [{ id: "sec_a", layout: "carousel", enabled: true }],
    },
    features: { show_gallery: false },
  });
  assert.equal(byId(d.home, "hero")?.variant, "overlay");
  assert.equal(byId(d.home, "usp")?.enabled, true);
  assert.equal(byId(d.home, "featured")?.settings.title, "Alese de noi");
  assert.equal(byId(d.home, "gallery")?.enabled, false);
  assert.equal(d.chrome.announcement?.enabled, true);
  assert.equal(byId(d.home, "sec_a")?.variant, "carousel");
  assert.equal(byId(d.home, "sec_a")?.settings.sectionRef, "sec_a");
});

test("varianta de hero reproduce exact logica din MiniStoreRenderer", () => {
  // Azi: `heroImageOnly = banners.length > 0 && hero_show_content !== true`
  // si `hasHero = banners.length > 0 || !!tagline`. Un magazin cu slogan dar
  // fara nicio imagine primeste hero-ul cu overlay, nu niciun hero.
  const hero = (pageContent: Record<string, unknown>, extra: Partial<DesignContext> = {}) =>
    buildClassicDesign({ ...ctx, pageContent, ...extra }).home.find((s) => s.kind === "hero");

  assert.equal(hero({ hero_banners: ["/a.jpg"] })?.variant, "banners");
  assert.equal(hero({ hero_banners: ["/a.jpg"], hero_show_content: true })?.variant, "overlay");
  assert.equal(hero({}, { coverUrl: "/cover.jpg" })?.variant, "banners", "cover_url tine loc de banner");

  const doarSlogan = hero({}, { tagline: "Cadouri lucrate manual" });
  assert.equal(doarSlogan?.variant, "overlay");
  assert.equal(doarSlogan?.enabled, true);

  assert.equal(hero({})?.enabled, false, "fara imagini si fara slogan nu exista hero");
});

test("id-urile derivate sunt stabile intre apeluri", () => {
  // Designul classic se re-deriva la fiecare cerere pentru magazinele care n-au
  // salvat nimic; id-uri instabile ar rupe cheile React si selectia din editor.
  const a = buildClassicDesign(ctx).home.map((s) => s.id);
  const b = buildClassicDesign(ctx).home.map((s) => s.id);
  assert.deepEqual(a, b);
});

test("sectiunile necunoscute si variantele disparute nu rup layout-ul", () => {
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {},
      home: [
        { id: "x", kind: "inexistent", variant: "y" },
        { id: "h", kind: "hero", variant: "varianta-stearsa" },
      ],
    },
    ctx,
  );
  assert.equal(byId(d.home, "x"), undefined);
  // Varianta stearsa cade pe una valida, iar de acolo hero-ul intra sub regula
  // de re-derivare: intre `banners` si `overlay` decide comutatorul din editorul
  // magazinului, nu ce scrie in jsonb. Magazinul asta n-are niciun banner, deci
  // varianta corecta e `overlay`.
  assert.equal(byId(d.home, "h")?.variant, "overlay");
  assert.ok(d.home.some((s) => s.kind === "product_grid"), "catalogul se readauga daca lipseste");
});

test("singleton-urile si id-urile duplicate se curata", () => {
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {},
      home: [
        { id: "a", kind: "hero", variant: "banners" },
        { id: "a", kind: "hero", variant: "overlay" },
        { id: "b", kind: "product_row", variant: "grid" },
        { id: "b", kind: "product_row", variant: "carousel" },
      ],
    },
    ctx,
  );
  assert.equal(d.home.filter((s) => s.kind === "hero").length, 1, "hero e singleton");
  // Doua din configuratia salvata, plus cele derivate din `page_content`:
  // randurile EXISTA acolo, iar un rand adaugat dupa salvarea designului trebuie
  // sa apara in magazin, nu sa se piarda tacut.
  const randuri = d.home.filter((s) => s.kind === "product_row");
  assert.ok(randuri.length >= 2, "randurile se pot repeta");
  assert.equal(new Set(randuri.map((s) => s.id)).size, randuri.length, "fara id-uri duplicate");
  const ids = d.home.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "id-urile raman unice");
});

test("culorile ajung intr-un atribut style, deci se filtreaza strict", () => {
  const style = parseStoreStyle({
    colors: {
      primary: "#ff0000",
      background: "rgb(1, 2, 3)",
      text: "var(--color-text-primary)",
      accent: "url(javascript:alert(1))",
      surface: "expression(alert(1))",
      border: "'; background: url(x)",
    },
  });
  assert.equal(style.colors?.primary, "#ff0000");
  assert.equal(style.colors?.background, "rgb(1, 2, 3)");
  assert.equal(style.colors?.text, "var(--color-text-primary)");
  assert.equal(style.colors?.accent, undefined);
  assert.equal(style.colors?.surface, undefined);
  assert.equal(style.colors?.border, undefined);
});

test("linkurile cu schema periculoasa sunt respinse", () => {
  // Acoperire directa pe sanitizarea de href; campurile de tip `link` apar in
  // variantele cu buton (hero, banner CTA) construite in fazele urmatoare.
  const { sanitizeHrefForTest } = parseInternals;
  assert.equal(sanitizeHrefForTest("/produs/abc"), "/produs/abc");
  assert.equal(sanitizeHrefForTest("https://exemplu.ro"), "https://exemplu.ro");
  assert.equal(sanitizeHrefForTest("mailto:a@b.ro"), "mailto:a@b.ro");
  assert.equal(sanitizeHrefForTest("#sectiune"), "#sectiune");
  assert.equal(sanitizeHrefForTest("javascript:alert(1)"), undefined);
  assert.equal(sanitizeHrefForTest("data:text/html,<script>"), undefined);
  assert.equal(sanitizeHrefForTest("vbscript:msgbox"), undefined);
});

test("valorile de enum invalide cad pe implicit", () => {
  const style = parseStoreStyle({ radius: "urias", density: "airy", fontHeading: "comic" });
  assert.equal(style.radius, undefined);
  assert.equal(style.density, "airy");
  assert.equal(style.fontHeading, undefined);
});

test("doar setarile declarate de varianta se salveaza", () => {
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {
        header: {
          id: "header",
          kind: "header",
          variant: "market",
          settings: { topText: "Ok", nedeclarat: "<script>" },
        },
      },
      home: [],
    },
    ctx,
  );
  assert.equal(d.chrome.header.settings.topText, "Ok");
  assert.equal(d.chrome.header.settings.nedeclarat, undefined);
});

test("cheile de legatura ale unui rand de produse trec, desi nu sunt campuri", () => {
  // `mode` si `sectionRef` spun randului de unde isi ia produsele. Nu apar in
  // formular, deci nu sunt validate prin `fields`, dar fara ele randul ramane gol.
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {},
      home: [
        { id: "r", kind: "product_row", variant: "grid", settings: { mode: "featured", evil: "<script>" } },
      ],
    },
    ctx,
  );
  const row = byId(d.home, "r");
  assert.equal(row?.settings.mode, "featured");
  assert.equal(row?.settings.evil, undefined);
});

test("numarul de sectiuni e plafonat", () => {
  const home = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, kind: "product_row", variant: "grid" }));
  const d = parseStoreDesign({ version: 1, chrome: {}, home }, ctx);
  // Plafonul se aplica SI dupa readucerea randurilor din continut.
  assert.ok(d.home.length <= 41, `plafonat, are ${d.home.length}`);
});

test("implicitele reproduc aspectul de dinaintea sistemului de design", () => {
  const style = resolveStyle({}, ctx);
  assert.equal(style.colors.primary, "#1AB554");
  assert.equal(style.colors.background, "var(--color-background)");
  assert.equal(style.cardStyle, "bordered");

  const vars = styleToCssVars(style);
  assert.equal(vars["--st-bg"], "var(--color-background)");
  assert.equal(vars["--st-radius"], "12px");
  assert.equal(vars["--st-container"], "72rem");
  assert.equal(vars["--st-space"], "2.5rem");
  assert.equal(vars["--st-card-border"], "1px solid var(--st-border)");
  assert.equal(vars["--st-text-base"], "1rem");
});

test("textul de pe fundal colorat e cel cu contrastul mai mare", () => {
  // Verdele platformei da 2,7:1 cu alb si 6,6:1 cu inchis. Alegerea se face
  // comparand cele doua rapoarte, nu taind luminanta la un prag fix: pragul
  // returna alb, adica exact varianta care nu trece pragul AA.
  assert.equal(styleToCssVars(resolveStyle({}, ctx))["--st-primary-contrast"], "#111827");
  // Un albastru inchis ramane cu text alb.
  assert.equal(
    styleToCssVars(resolveStyle({ colors: { primary: "#1E3A8A" } }, ctx))["--st-primary-contrast"],
    "#FFFFFF",
  );
});

test("store_bg_color din page_content devine fundalul magazinului", () => {
  const style = resolveStyle({}, { ...ctx, pageContent: { store_bg_color: "#FAFAFA" } });
  assert.equal(styleToCssVars(style)["--st-bg"], "#FAFAFA");
});

test("un fundal deschis primeste text de contrast inchis", () => {
  const style = resolveStyle({ colors: { primary: "#FFE066" } }, ctx);
  assert.equal(styleToCssVars(style)["--st-primary-contrast"], "#111827");
});

test("isEmptyDesign distinge magazinele nematerializate", () => {
  assert.equal(isEmptyDesign({}), true);
  assert.equal(isEmptyDesign({ version: 1 }), false);
});

test("pagina de produs e o singura sectiune, cu designul classic implicit", () => {
  const d = parseStoreDesign(null, ctx);
  assert.equal(d.product.page.kind, "product_page");
  assert.equal(d.product.page.variant, "classic");
});

test("o ciorna veche, cu sectiunile separate ale paginii de produs, nu rupe nimic", () => {
  // Inainte, pagina de produs era descrisa prin patru sectiuni (galerie, zona de
  // cumparare, detalii, similare) pe care nu le randa nimeni. Configuratiile
  // salvate atunci trebuie sa cada elegant pe pagina intreaga.
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {},
      home: [],
      product: {
        gallery: { id: "pdp_gallery", kind: "pdp_gallery", variant: "classic", settings: {} },
        buybox: { id: "pdp_buybox", kind: "pdp_buybox", variant: "classic", settings: {} },
        sections: [{ id: "pdp_related", kind: "pdp_related", variant: "carousel", settings: {} }],
      },
    },
    ctx,
  );
  assert.equal(d.product.page.kind, "product_page");
  assert.equal(d.product.page.variant, "classic");
});

test("cosul si finalizarea comenzii isi pastreaza designul salvat", () => {
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {},
      home: [],
      commerce: {
        cartDrawer: { id: "cart_drawer", kind: "cart_drawer", variant: "clasic-inexistent", settings: {} },
        checkout: { id: "checkout", kind: "checkout", variant: "classic", settings: {} },
      },
    },
    ctx,
  );
  // Varianta necunoscuta cade pe prima declarata, nu lasa magazinul fara cos.
  assert.equal(d.commerce.cartDrawer.variant, "classic");
  assert.equal(d.commerce.checkout.variant, "classic");
});

test("header-ul si footerul nu pot ramane stinse dintr-o configuratie salvata", () => {
  // Footerul poarta blocul legal: datele firmei, retragerea din contract,
  // politicile si ANPC. O ciorna salvata inainte ca editorul sa scoata butonul
  // de ascundere, sau scrisa direct in jsonb, nu are voie sa il ascunda.
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {
        header: { id: "header", kind: "header", variant: "classic", enabled: false, settings: {} },
        footer: { id: "footer", kind: "footer", variant: "dark", enabled: false, settings: {} },
      },
      home: [],
    },
    ctx,
  );
  assert.equal(d.chrome.header.enabled, true);
  assert.equal(d.chrome.footer.enabled, true);

  // Bara de anunt ramane stingibila: ascunderea ei e o alegere legitima.
  const cuAnunt = parseStoreDesign(
    {
      version: 1,
      chrome: { announcement: { id: "a", kind: "announcement", variant: "marquee", enabled: false, settings: {} } },
      home: [],
    },
    ctx,
  );
  assert.equal(cuAnunt.chrome.announcement?.enabled, false);
});

/**
 * Slotul paginii de magazin.
 *
 * Parserul NU face merge peste jsonb-ul salvat: construieste si returneaza un
 * obiect literal, iar server action-ul scrie exact acel obiect in baza. Un slot
 * uitat din acel obiect dispare la prima autosalvare din editor, iar alegerea
 * comerciantului se pierde fara nicio eroare.
 */
test("designul classic da tuturor magazinelor o pagina de magazin stinsa", () => {
  const d = parseStoreDesign(null, ctx);
  assert.equal(d.shop.page.kind, "shop_page");
  assert.equal(d.shop.page.variant, "none");
  // Aprinsa, dar pe varianta care nu deschide nicio ruta: alegerea unui design
  // de pagina trebuie sa fie o singura apasare, nu doua.
  assert.equal(d.shop.page.enabled, true);
});

test("pagina de magazin nu intra in lista paginii principale", () => {
  // In `home` ar fi schimbat ordinea paginii principale pentru toate magazinele
  // si ar fi aparut in paleta „Adauga sectiune".
  const d = parseStoreDesign(null, ctx);
  assert.ok(!d.home.some((s) => s.kind === "shop_page"));
});

test("slotul paginii de magazin supravietuieste unui ciclu salvare-citire", () => {
  const salvat = parseStoreDesign(null, ctx);
  const dupa = parseStoreDesign(JSON.parse(JSON.stringify(salvat)), ctx);
  assert.deepEqual(dupa.shop, salvat.shop);
});

test("o varianta de pagina de magazin necunoscuta cade pe cea inofensiva", () => {
  const d = parseStoreDesign(
    {
      version: 1,
      chrome: {},
      home: [],
      shop: { page: { id: "shop_page", kind: "shop_page", variant: "inexistenta", settings: {} } },
    },
    ctx,
  );
  assert.equal(d.shop.page.variant, "none");
});

test("o configuratie salvata inainte de slot primeste implicitul, nu o gaura", () => {
  // Cele doua magazine cu design materializat au fost salvate fara cheia `shop`.
  const d = parseStoreDesign({ version: 1, chrome: {}, home: [] }, ctx);
  assert.equal(d.shop.page.variant, "none");
});

// ───────────────────────────────────────────────────────────────────────────
// Cele doua editoare, si cine comanda ce
//
// Acelasi magazin se regleaza din doua ecrane: „Editeaza magazinul" scrie in
// `page_content`, editorul de design scrie in jsonb. Cat timp au impartit un
// singur camp `enabled`, fiecare il anula pe celalalt — si mereu tacut.
// ───────────────────────────────────────────────────────────────────────────

/** Designul classic al unui context, trecut printr-un ciclu salvare-citire. */
const salvatSiCitit = (d: unknown, c: DesignContext = ctx) =>
  parseStoreDesign(JSON.parse(JSON.stringify(d)), c);

test("⚠⚠ ochiul din editorul de design nu se mai anuleaza singur la salvare", () => {
  // M8. Stingeai o sectiune, disparea instant din previzualizare (care primeste
  // designul neparsat), apasai Publica — si revenea, fiindca `page_content` o
  // dadea aprinsa si parserul copia de acolo neconditionat.
  const pornit = buildClassicDesign({ ...ctx, pageContent: { show_trust_strip_on_store: true } });
  assert.equal(byId(pornit.home, "usp")?.enabled, true);

  const stins = toggleSection(pornit, "usp");
  const dupaSalvare = salvatSiCitit(stins, { ...ctx, pageContent: { show_trust_strip_on_store: true } });
  assert.equal(byId(dupaSalvare.home, "usp")?.enabled, false, "alegerea din editorul de design tine");
});

test("⚠ sectiunile fara comutator in editorul vechi se pot stinge, in sfarsit", () => {
  // Designul classic le construieste cu `enabled` scris in cod, deci pana acum
  // „Cautare si filtre", „Categorii" si „Catalog produse" nu puteau fi stinse
  // niciodata — ochiul se misca, si nu se intampla nimic.
  for (const id of ["toolbar", "categories", "catalog"]) {
    const stins = toggleSection(buildClassicDesign(ctx), id);
    assert.equal(byId(salvatSiCitit(stins).home, id)?.enabled, false, id);
  }
});

test("fara semn explicit, comanda ramane la comutatorul din editorul magazinului", () => {
  // Partea care mergea si inainte, si care nu trebuie pierduta: un comerciant
  // care n-a atins niciodata editorul de design isi regleaza magazinul de unde
  // l-a reglat mereu.
  const design = buildClassicDesign({ ...ctx, pageContent: { show_trust_strip_on_store: true } });
  const acumStins = salvatSiCitit(design, { ...ctx, pageContent: { show_trust_strip_on_store: false } });
  assert.equal(byId(acumStins.home, "usp")?.enabled, false);
});

test("⚠⚠ o sectiune aprinsa in editorul magazinului se intoarce daca lipseste din design", () => {
  // M11. Din classic se readuceau doar randurile de produse si `product_grid`.
  // Restul, lipsa dintr-un design salvat de o versiune mai veche, nu se mai
  // intorcea niciodata: comutatorul „Recenzii" se aprindea, se salva, arata bifa
  // verde, si nu facea absolut nimic.
  const faraRecenzii = buildClassicDesign(ctx);
  faraRecenzii.home = faraRecenzii.home.filter((s) => s.id !== "reviews");

  const cu = salvatSiCitit(faraRecenzii, { ...ctx, pageContent: { reviews_section: { enabled: true } } });
  assert.equal(byId(cu.home, "reviews")?.enabled, true);
});

test("sectiunea readusa aterizeaza la locul ei, nu la coada", () => {
  const design = buildClassicDesign(ctx);
  design.home = design.home.filter((s) => s.id !== "reviews");

  const cu = salvatSiCitit(design, { ...ctx, pageContent: { reviews_section: { enabled: true } } });
  const iCatalog = cu.home.findIndex((s) => s.id === "catalog");
  const iBenefits = cu.home.findIndex((s) => s.id === "benefits");
  const iReviews = cu.home.findIndex((s) => s.id === "reviews");
  assert.ok(iCatalog < iReviews, "dupa catalog, ca in classic");
  assert.ok(iBenefits < iReviews, "dupa beneficii, ca in classic");
});

test("o sectiune STINSA care lipseste nu se readauga degeaba", () => {
  const design = buildClassicDesign(ctx);
  design.home = design.home.filter((s) => s.id !== "reviews");
  assert.equal(byId(salvatSiCitit(design).home, "reviews"), undefined);
});

test("⚠⚠ bara de anunt se poate APRINDE din editorul magazinului", () => {
  // M9. Bucla de resincronizare itera numai peste `home`; bara sta in `chrome`
  // si se lua intreaga din jsonb. Mergea intr-o singura directie: stinsa de
  // acolo disparea, aprinsa de acolo nu aparea niciodata.
  const stinsa = buildClassicDesign(ctx);
  assert.equal(stinsa.chrome.announcement?.enabled, false);

  const dupa = salvatSiCitit(stinsa, { ...ctx, pageContent: { announcement_bar: { enabled: true } } });
  assert.equal(dupa.chrome.announcement?.enabled, true);
});

test("bara de anunt stinsa din editorul de design ramane stinsa", () => {
  const pornita = buildClassicDesign({ ...ctx, pageContent: { announcement_bar: { enabled: true } } });
  const stinsa = toggleSection(pornita, pornita.chrome.announcement!.id);
  const dupa = salvatSiCitit(stinsa, { ...ctx, pageContent: { announcement_bar: { enabled: true } } });
  assert.equal(dupa.chrome.announcement?.enabled, false);
});

test("⚠⚠ „Afiseaza continutul peste banner\" chiar comuta hero-ul dupa salvare", () => {
  // M10. Flagul alege doar VARIANTA in designul derivat. Odata ce designul era
  // salvat, varianta venea din jsonb si nu se mai re-deriva: comutai, salvai,
  // previzualizarea se reincarca — si hero-ul era identic in ambele pozitii.
  const cuBanner = { hero_banners: ["/a.jpg"] };
  const salvat = buildClassicDesign({ ...ctx, pageContent: cuBanner });
  assert.equal(byId(salvat.home, "hero")?.variant, "banners");

  const dupa = salvatSiCitit(salvat, { ...ctx, pageContent: { ...cuBanner, hero_show_content: true } });
  assert.equal(byId(dupa.home, "hero")?.variant, "overlay");
});

test("o varianta de hero aleasa in editorul de design nu se re-deriva", () => {
  // Regula atinge doar cele doua variante pe care le comuta flagul. Orice
  // altceva e o decizie de design si ramane a comerciantului.
  const cuBanner = { hero_banners: ["/a.jpg"] };
  const salvat = buildClassicDesign({ ...ctx, pageContent: cuBanner });
  const altele = Object.keys(SECTION_REGISTRY.hero?.variants ?? {}).filter(
    (v) => v !== "banners" && v !== "overlay",
  );
  if (altele.length === 0) return; // hero are doar cele doua variante derivate

  const ales = updateSection(salvat, "hero", { variant: altele[0] });
  const dupa = salvatSiCitit(ales, { ...ctx, pageContent: { ...cuBanner, hero_show_content: true } });
  assert.equal(byId(dupa.home, "hero")?.variant, altele[0]);
});

test("⚠⚠ ordinea randurilor de produse urmeaza editorul magazinului", () => {
  // M12. Sagetile promit „Trage de sageti ca sa schimbi ordinea", scriu in
  // `page_content.product_sections` — si nimeni nu citea ordinea aia.
  const randuri = (ids: string[]) => ({
    product_sections: ids.map((id) => ({ id, layout: "grid", enabled: true })),
  });

  const salvat = buildClassicDesign({ ...ctx, pageContent: randuri(["a", "b"]) });
  const dupa = salvatSiCitit(salvat, { ...ctx, pageContent: randuri(["b", "a"]) });

  const ordinea = dupa.home.filter((s) => s.kind === "product_row").map((s) => s.id);
  assert.deepEqual(ordinea, ["featured", "b", "a"]);
});

test("reasezarea randurilor nu misca sloturile, doar cine le ocupa", () => {
  // Pozitia blocului fata de restul paginii ramane a editorului de design.
  const randuri = (ids: string[]) => ({
    product_sections: ids.map((id) => ({ id, layout: "grid", enabled: true })),
  });
  const salvat = buildClassicDesign({ ...ctx, pageContent: randuri(["a", "b"]) });
  const inainte = salvat.home.map((s) => s.kind);

  const dupa = salvatSiCitit(salvat, { ...ctx, pageContent: randuri(["b", "a"]) });
  assert.deepEqual(dupa.home.map((s) => s.kind), inainte, "structura paginii ramane identica");
});

// ───────────────────────────────────────────────────────────────────────────
// Ce sterge, muta si alege comerciantul in editorul de design NU se anuleaza
//
// Regulile de mai sus readuc sectiuni, re-deriva varianta hero-ului si reaseaza
// randurile. Toate trei sunt corecte cat timp nimeni n-a spus altceva — si
// dezastruoase cand rescriu o alegere facuta anume.
// ───────────────────────────────────────────────────────────────────────────

test("⚠⚠ o sectiune STEARSA nu se readauga, oricat ar fi de aprinsa in editorul vechi", () => {
  const pc = { announcement_bar: { enabled: true }, reviews_section: { enabled: true } };
  const design = buildClassicDesign({ ...ctx, pageContent: pc });

  const dupa = salvatSiCitit(removeSection(design, "reviews"), { ...ctx, pageContent: pc });
  assert.equal(byId(dupa.home, "reviews"), undefined);
});

test("⚠⚠ bara de anunt stearsa ramane stearsa", () => {
  // `removeSection` o scrie `null`. Tratata ca „lipseste", revenea la prima
  // citire pe fiecare pagina, cat timp comutatorul vechi era pornit.
  const pc = { announcement_bar: { enabled: true } };
  const design = buildClassicDesign({ ...ctx, pageContent: pc });
  assert.equal(design.chrome.announcement?.enabled, true);

  const dupa = salvatSiCitit(removeSection(design, design.chrome.announcement!.id), { ...ctx, pageContent: pc });
  assert.equal(dupa.chrome.announcement, null);
});

test("⚠ stearsa si adaugata la loc din paleta: o singura data, nu doua", () => {
  // Sectiunea noua primeste alt id, deci cea din classic parea „lipsa" si se
  // readauga peste ea. Rezultatul: doua galerii in magazin, si autosalvarea
  // cadea la fiecare incercare fiindca designul nu se mai stabiliza.
  const pc = { announcement_bar: { enabled: false } };
  let d = buildClassicDesign({ ...ctx, pageContent: pc });
  d = removeSection(d, "gallery");
  d = addSection(d, "gallery");

  const dupa = salvatSiCitit(d, { ...ctx, pageContent: pc });
  assert.equal(dupa.home.filter((s) => s.kind === "gallery").length, 1);
});

test("⚠⚠ varianta de hero aleasa din galerie bate comutatorul din editorul vechi", () => {
  // „Doar imagini" si „Imagine cu text peste" sunt si design-uri din catalog, nu
  // doar cele doua stari ale comutatorului. Re-derivate neconditionat, nu puteau
  // fi alese niciodata.
  const pc = { hero_banners: ["/a.jpg"], hero_show_content: true };
  const design = buildClassicDesign({ ...ctx, pageContent: pc });
  assert.equal(byId(design.home, "hero")?.variant, "overlay");

  const ales = updateSection(design, "hero", { variant: "banners" });
  assert.equal(byId(salvatSiCitit(ales, { ...ctx, pageContent: pc }).home, "hero")?.variant, "banners");
});

test("fara alegere explicita, varianta de hero urmeaza mai departe comutatorul", () => {
  const cuBanner = { hero_banners: ["/a.jpg"] };
  const salvat = buildClassicDesign({ ...ctx, pageContent: cuBanner });
  const dupa = salvatSiCitit(salvat, { ...ctx, pageContent: { ...cuBanner, hero_show_content: true } });
  assert.equal(byId(dupa.home, "hero")?.variant, "overlay");
});

test("⚠⚠ ordinea aranjata in editorul de design nu se mai rescrie din page_content", () => {
  // Aplicata neconditionat, reasezarea trimitea in slotul din capul paginii ALT
  // rand decat cel tras acolo: editorul arata una, magazinul alta.
  const randuri = (ids: string[]) => ({
    product_sections: ids.map((id) => ({ id, layout: "grid", enabled: true })),
  });
  const pc = randuri(["a", "b"]);
  const design = buildClassicDesign({ ...ctx, pageContent: pc });

  const de = design.home.findIndex((s) => s.id === "b");
  const la = design.home.findIndex((s) => s.id === "featured");
  const mutat = moveSection(design, de, la);
  const ordineaDinEditor = mutat.home.filter((s) => s.kind === "product_row").map((s) => s.id);

  const dupa = salvatSiCitit(mutat, { ...ctx, pageContent: pc });
  assert.deepEqual(dupa.home.filter((s) => s.kind === "product_row").map((s) => s.id), ordineaDinEditor);
});

test("sagetile din editorul vechi raman functionale cat timp nimeni n-a mutat nimic", () => {
  const randuri = (ids: string[]) => ({
    product_sections: ids.map((id) => ({ id, layout: "grid", enabled: true })),
  });
  const salvat = buildClassicDesign({ ...ctx, pageContent: randuri(["a", "b"]) });
  const dupa = salvatSiCitit(salvat, { ...ctx, pageContent: randuri(["b", "a"]) });
  assert.deepEqual(dupa.home.filter((s) => s.kind === "product_row").map((s) => s.id), ["featured", "b", "a"]);
});

test("⚠ semnele supravietuiesc unui ciclu salvare-citire", () => {
  // `saveDesignDraft` scrie forma PARSATA. Daca parserul nu le intoarce, prima
  // scriere le pierde si tot ce apara ele se anuleaza la citirea urmatoare.
  const pc = {
    announcement_bar: { enabled: true },
    reviews_section: { enabled: true },
    product_sections: [
      { id: "a", layout: "grid", enabled: true },
      { id: "b", layout: "grid", enabled: true },
    ],
  };
  let d = buildClassicDesign({ ...ctx, pageContent: pc });
  d = removeSection(d, "reviews");
  d = moveSection(d, d.home.findIndex((s) => s.id === "b"), d.home.findIndex((s) => s.id === "featured"));

  const odata = salvatSiCitit(d, { ...ctx, pageContent: pc });
  assert.ok(odata.sterse?.includes("reviews"));
  assert.equal(odata.ordineAtinsa, true);

  const deDouaOri = salvatSiCitit(odata, { ...ctx, pageContent: pc });
  assert.deepEqual(deDouaOri, odata, "parserul ramane idempotent");
});

test("⚠⚠ mutarea unei sectiuni FARA legatura nu omoara sagetile din editorul vechi", () => {
  // Semnul pus la orice mutare insemna ca o singura tragere de „Beneficii" cu o
  // pozitie mai sus dezactiva pentru totdeauna reordonarea randurilor din
  // „Editeaza magazinul": sagetile scriau mai departe, aratau „Salvat", si
  // magazinul pastra ordinea veche.
  const randuri = (ids: string[]) => ({
    product_sections: ids.map((id) => ({ id, layout: "grid", enabled: true })),
  });
  const d = buildClassicDesign({ ...ctx, pageContent: randuri(["a", "b"]) });
  const mutatAltceva = moveSection(d, d.home.findIndex((s) => s.id === "benefits"), 0);
  assert.equal(mutatAltceva.ordineAtinsa, undefined);

  const dupa = salvatSiCitit(mutatAltceva, { ...ctx, pageContent: randuri(["b", "a"]) });
  assert.deepEqual(dupa.home.filter((s) => s.kind === "product_row").map((s) => s.id), ["featured", "b", "a"]);
});

test("⚠ lista de sterse nu creste la nesfarsit si nu-si pierde ultimele intrari", () => {
  // Plafonata si taiata de la cap, arunca tocmai cele mai NOI stergeri: prima
  // parsare le respecta, a doua nu — iar garda de ciorna, care presupune ca
  // parsarea e stabila, raporta un conflict inventat.
  const pc = { reviews_section: { enabled: true } };
  let d = buildClassicDesign({ ...ctx, pageContent: pc });
  // Cicluri sterge/adauga pe o sectiune din paleta: fiecare adaugare da un id nou.
  for (let i = 0; i < 45; i++) {
    d = removeSection(d, d.home.find((s) => s.kind === "gallery")?.id ?? "gallery");
    d = addSection(d, "gallery");
  }
  d = removeSection(d, "reviews");

  const odata = salvatSiCitit(d, { ...ctx, pageContent: pc });
  const deDouaOri = salvatSiCitit(odata, { ...ctx, pageContent: pc });
  assert.equal(byId(deDouaOri.home, "reviews"), undefined, "stergerea tine si la a doua citire");
  assert.deepEqual(deDouaOri, odata, "parserul ramane idempotent");
  assert.ok((odata.sterse?.length ?? 0) <= buildClassicDesign(ctx).home.length + 1);
});

// ───────────────────────────────────────────────────────────────────────────
// Magazinele care EXISTAU deja cand au aparut semnele
//
// Cea mai urata forma de regresie e cea pe care n-o provoaca nimeni: un
// comerciant care si-a sters o sectiune sau si-a ales un hero acum o luna nu are
// de ce sa le vada revenind singure la un deploy.
// ───────────────────────────────────────────────────────────────────────────

/** Un design salvat de o versiune veche: fara cheia `sterse`. */
function designVechi(d: StoreDesign): Record<string, unknown> {
  const { sterse: _s, ordineAtinsa: _o, ...rest } = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
  return rest;
}

test("⚠⚠ o sectiune stearsa inainte de semne NU revine la deploy", () => {
  const pc = { reviews_section: { enabled: true } };
  const d = buildClassicDesign({ ...ctx, pageContent: pc });
  // Asa arata in baza un design vechi din care comerciantul stersese „Recenzii":
  // pur si simplu lipseste din lista, fara nimic care sa spuna de ce.
  const brut = designVechi(d) as { home: SectionInstance[] };
  brut.home = brut.home.filter((s) => s.id !== "reviews");

  const dupa = parseStoreDesign(brut, { ...ctx, pageContent: pc });
  assert.equal(byId(dupa.home, "reviews"), undefined);
  assert.ok(dupa.sterse?.includes("reviews"), "intentia se noteaza acum, o singura data");
});

test("⚠⚠ un hero ales din galerie inainte de semne nu se pierde", () => {
  const pc = { hero_banners: ["/a.jpg"], hero_show_content: true };
  const d = updateSection(buildClassicDesign({ ...ctx, pageContent: pc }), "hero", { variant: "banners" });
  const brut = designVechi(d) as Record<string, unknown>;
  // Semnul nu exista in designurile vechi; alegerea traia doar in `variant`.
  (brut.home as SectionInstance[]).forEach((s) => { delete (s as { variantOverride?: string }).variantOverride; });

  const dupa = parseStoreDesign(brut, { ...ctx, pageContent: pc });
  assert.equal(byId(dupa.home, "hero")?.variant, "banners");
});

test("⚠ o varianta INVALIDA dintr-un design vechi nu conteaza ca alegere", () => {
  // Ea cade pe prima din catalog, iar aceea poate nimeri chiar peste una
  // derivata: fara verificarea pe jsonb-ul brut, un design stricat si-ar fi ales
  // singur un hero, pe veci.
  const pc = { hero_banners: ["/a.jpg"], hero_show_content: true };
  const dupa = parseStoreDesign(
    { version: 1, chrome: {}, home: [{ id: "hero", kind: "hero", variant: "inexistenta" }] },
    { ...ctx, pageContent: pc },
  );
  assert.equal(byId(dupa.home, "hero")?.variant, "overlay", "urmeaza comutatorul, ca orice design nederivat");
});

test("⚠⚠ o ordine aranjata inainte de semne nu se rescrie", () => {
  const randuri = (ids: string[]) => ({
    product_sections: ids.map((id) => ({ id, layout: "grid", enabled: true })),
  });
  const pc = randuri(["a", "b"]);
  const d = buildClassicDesign({ ...ctx, pageContent: pc });
  const mutat = moveSection(d, d.home.findIndex((s) => s.id === "b"), d.home.findIndex((s) => s.id === "featured"));
  const ordineaLui = mutat.home.filter((s) => s.kind === "product_row").map((s) => s.id);

  const dupa = parseStoreDesign(designVechi(mutat), { ...ctx, pageContent: pc });
  assert.deepEqual(dupa.home.filter((s) => s.kind === "product_row").map((s) => s.id), ordineaLui);
  assert.equal(dupa.ordineAtinsa, true, "intentia se noteaza acum");
});

test("un design vechi NEATINS nu capata intentii inventate", () => {
  const pc = { reviews_section: { enabled: true }, announcement_bar: { enabled: true } };
  const d = buildClassicDesign({ ...ctx, pageContent: pc });

  const dupa = parseStoreDesign(designVechi(d), { ...ctx, pageContent: pc });
  assert.deepEqual(dupa.sterse, []);
  assert.equal(dupa.ordineAtinsa, undefined);
  assert.equal(dupa.chrome.announcement?.enabled, true);
});

test("⚠ dupa prima citire, semnele sunt scrise si nu se mai reconstituie", () => {
  // Cheia `sterse` exista de acum, chiar goala: fara ea, orice sectiune adaugata
  // mai tarziu in designul classic ar fi fost luata drept stearsa pentru
  // totdeauna.
  const pc = { reviews_section: { enabled: true } };
  const odata = parseStoreDesign(designVechi(buildClassicDesign({ ...ctx, pageContent: pc })), { ...ctx, pageContent: pc });
  assert.ok(Array.isArray(odata.sterse));

  const faraGalerie = { ...odata, home: odata.home.filter((s) => s.id !== "gallery") };
  const dupa = parseStoreDesign(JSON.parse(JSON.stringify(faraGalerie)), { ...ctx, pageContent: pc });
  assert.ok(byId(dupa.home, "gallery"), "o sectiune lipsa dintr-un design NOU se readuce, ca inainte");
});
