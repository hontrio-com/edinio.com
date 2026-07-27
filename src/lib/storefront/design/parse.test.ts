import test from "node:test";
import assert from "node:assert/strict";
import { isEmptyDesign, parseInternals, parseStoreDesign, parseStoreStyle } from "./parse";
import { buildClassicDesign, resolveStyle } from "./defaults";
import { styleToCssVars } from "./css-vars";
import type { DesignContext, SectionInstance } from "./types";

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
  assert.equal(byId(d.home, "h")?.variant, "banners");
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
  assert.equal(d.home.filter((s) => s.kind === "product_row").length, 2, "randurile se pot repeta");
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
  assert.equal(vars["--st-primary-contrast"], "#FFFFFF");
  assert.equal(vars["--st-card-border"], "1px solid var(--st-border)");
  assert.equal(vars["--st-text-base"], "1rem");
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
