import test from "node:test";
import assert from "node:assert/strict";
import { buildClassicDesign } from "./defaults";
import { resolveHeroBanners } from "./hero-banners";
import type { DesignContext, SectionInstance } from "./types";

/**
 * Fidelitatea designului „classic" fata de randarea de azi.
 *
 * `buildClassicDesign` are o singura obligatie: sa produca exact ce afiseaza
 * `MiniStoreRenderer` in acest moment, pentru orice magazin care n-a atins inca
 * editorul nou. Testul reimplementeaza mai jos conditiile din componenta (cu
 * numerele de linie de la momentul scrierii) si le compara cu derivarea.
 *
 * Configuratiile de mai jos sunt tipare reale, luate din magazinele publicate:
 * majoritatea au `page_content` gol, restul acopera combinatiile intalnite.
 */

interface Fixture {
  nume: string;
  ctx: DesignContext;
}

const base = (over: Partial<DesignContext> = {}): DesignContext => ({
  primaryColor: "#1AB554",
  pageContent: {},
  features: {},
  ...over,
});

const FIXTURES: Fixture[] = [
  { nume: "magazin nou, fara page_content", ctx: base() },
  {
    nume: "anunt pornit, recomandate, recenzii goale, fundal colorat",
    ctx: base({
      pageContent: {
        store_bg_color: "#FDF2F8",
        reviews_section: { items: [], title: "Ce spun clientii nostri", enabled: true },
        announcement_bar: { text: "PLATA LA LIVRARE", enabled: true, bg_color: "#1AB554" },
        show_featured_section: true,
        featured_section_title: "Recomandate",
        show_shipping_progress: true,
        store_benefits_section: { items: [], enabled: false },
        show_trust_strip_on_store: false,
        show_announcement_on_store: true,
      },
      features: { floating_call: false, floating_whatsapp: true },
    }),
  },
  {
    nume: "hero cu overlay, trust pornit, anunt dezactivat din bara",
    ctx: base({
      pageContent: {
        hero_show_content: true,
        show_trust_strip_on_store: true,
        show_featured_section: true,
        show_shipping_progress: true,
        announcement_bar: { enabled: false },
        show_announcement_on_store: true,
        product_sections: [],
      },
    }),
  },
  {
    nume: "un rand custom de tip grila",
    ctx: base({
      pageContent: {
        hero_show_content: true,
        show_shipping_progress: true,
        product_sections: [
          { id: "sec_0vedlehc", mode: "selected", limit: 8, title: "Prosoape", layout: "grid", enabled: true },
        ],
      },
    }),
  },
  {
    nume: "rand de pachete, recomandate si recenzii cu continut",
    ctx: base({
      pageContent: {
        reviews_section: { items: [{ name: "Marian", rating: 5, text: "ok", date: "2025-02-04" }], enabled: true },
        announcement_bar: { text: "x", speed: 3, enabled: true },
        show_announcement_on_store: true,
        product_sections: [
          { id: "sec_e4dwahnh", mode: "bundles", limit: 2, title: "Pachete Speciale", layout: "grid", enabled: true },
        ],
        hero_show_content: false,
        show_featured_section: true,
        show_shipping_progress: true,
        show_trust_strip_on_store: true,
      },
    }),
  },
  {
    nume: "beneficii cu continut, galerie oprita din features",
    ctx: base({
      pageContent: {
        store_benefits_section: { items: [{ title: "a", desc: "b" }], enabled: true },
        reviews_section: { items: [{ name: "t", rating: 5, text: "t", date: "2026-06-05" }], enabled: true },
        show_featured_section: true,
        show_shipping_progress: true,
        show_trust_strip_on_store: true,
      },
      features: { show_gallery: false, show_about: false },
    }),
  },
  {
    nume: "rand dezactivat din editor",
    ctx: base({
      pageContent: {
        product_sections: [{ id: "sec_off", mode: "category", layout: "carousel", enabled: false }],
      },
    }),
  },
  {
    nume: "magazin cu slogan dar fara nicio imagine",
    ctx: base({ tagline: "Cadouri lucrate manual" }),
  },
  {
    nume: "magazin cu cover vechi, fara hero_banners",
    ctx: base({ coverUrl: "https://cdn/cover.jpg" }),
  },
];

/**
 * Ce afiseaza componenta de azi. Reimplementare deliberata a conditiilor din
 * `MiniStoreRenderer.tsx` (liniile 1596-1645 pentru flag-uri, 1965-2675 pentru
 * randare), ca sa avem cu ce compara.
 */
function randareaDeAzi(ctx: DesignContext) {
  const pc = ctx.pageContent as Record<string, never> & Record<string, unknown>;
  const f = ctx.features;
  const { banners } = resolveHeroBanners(ctx.pageContent, ctx.coverUrl);
  const benefits = pc.store_benefits_section as { enabled?: boolean } | undefined;
  const reviews = pc.reviews_section as { enabled?: boolean } | undefined;
  const announcement = pc.announcement_bar as { enabled?: boolean } | undefined;
  const rows = Array.isArray(pc.product_sections) ? (pc.product_sections as Record<string, unknown>[]) : [];

  return {
    announcement: pc.show_announcement_on_store !== false && announcement?.enabled === true,
    heroVizibil: banners.length > 0 || !!ctx.tagline,
    heroDoarImagine: banners.length > 0 && pc.hero_show_content !== true,
    trust: pc.show_trust_strip_on_store === true,
    shipping: pc.show_shipping_progress === true,
    featured: pc.show_featured_section === true,
    featuredTitlu: (pc.featured_section_title as string) || "Recomandate",
    randuri: rows.map((r) => ({
      id: r.id as string,
      carusel: r.layout === "carousel",
      activ: r.enabled !== false,
    })),
    benefits: benefits?.enabled === true,
    reviews: reviews?.enabled === true,
    gallery: f.show_gallery !== false,
    about: f.show_about !== false,
    /*
     * SINGURA abatere voita de la randarea de dinainte.
     *
     * Contactul era pornit implicit, ca galeria si descrierea. Acum e opt-in:
     * telefonul, emailul si orasul sunt deja in coloana Contact din footer, iar
     * identitatea firmei cu tot cu sediile e in blocul legal de sub el, care nici
     * nu se poate ascunde. Repetate si in corpul paginii, doar lungeau pagina.
     *
     * Restul liniilor de aici ramin oglinda fidela a ce se randa inainte.
     */
    contact: f.show_contact === true,
  };
}

const find = (home: SectionInstance[], id: string) => home.find((s) => s.id === id);

for (const { nume, ctx } of FIXTURES) {
  test(`classic fidel: ${nume}`, () => {
    const azi = randareaDeAzi(ctx);
    const d = buildClassicDesign(ctx);
    const h = d.home;

    assert.equal(d.chrome.announcement?.enabled, azi.announcement, "bara de anunt");

    const hero = find(h, "hero");
    assert.equal(hero?.enabled, azi.heroVizibil, "hero vizibil");
    assert.equal(hero?.variant, azi.heroDoarImagine ? "banners" : "overlay", "varianta de hero");

    assert.equal(find(h, "usp")?.enabled, azi.trust, "banda de incredere");
    assert.equal(find(h, "shipping")?.enabled, azi.shipping, "prag transport gratuit");

    const featured = find(h, "featured");
    assert.equal(featured?.enabled, azi.featured, "sectiunea Recomandate");
    assert.equal(featured?.settings.title, azi.featuredTitlu, "titlul sectiunii Recomandate");
    assert.equal(featured?.settings.mode, "featured");

    for (const rand of azi.randuri) {
      const s = find(h, rand.id);
      assert.ok(s, `randul ${rand.id} exista`);
      assert.equal(s?.kind, "product_row");
      assert.equal(s?.variant, rand.carusel ? "carousel" : "grid", `layout-ul randului ${rand.id}`);
      assert.equal(s?.enabled, rand.activ, `starea randului ${rand.id}`);
    }
    assert.equal(
      h.filter((s) => s.kind === "product_row").length,
      azi.randuri.length + 1,
      "randurile custom plus Recomandate",
    );

    assert.equal(find(h, "benefits")?.enabled, azi.benefits, "beneficii");
    assert.equal(find(h, "reviews")?.enabled, azi.reviews, "recenzii");
    assert.equal(find(h, "gallery")?.enabled, azi.gallery, "galerie");
    assert.equal(find(h, "about")?.enabled, azi.about, "despre");
    assert.equal(find(h, "contact")?.enabled, azi.contact, "contact");

    // Ordinea sectiunilor e cea hardcodata azi in JSX.
    assert.deepEqual(
      h.filter((s) => s.kind !== "product_row" || s.id === "featured").map((s) => s.kind),
      [
        "hero", "usp_strip", "catalog_toolbar", "category_nav", "shipping_progress",
        "product_row", "product_grid", "benefits", "reviews", "gallery", "about", "contact",
      ],
      "ordinea sectiunilor",
    );
    // Randurile custom stau intre Recomandate si catalogul principal.
    const idx = (kind: string) => h.findIndex((s) => s.kind === kind);
    for (const rand of azi.randuri) {
      const pozitie = h.findIndex((s) => s.id === rand.id);
      assert.ok(pozitie > idx("shipping_progress"), `${rand.id} dupa pragul de transport`);
      assert.ok(pozitie < idx("product_grid"), `${rand.id} inainte de catalog`);
    }
  });
}

// ── Contactul e opt-in ─────────────────────────────────────────────────────
//
// Test separat, cu numele intentiei, ca schimbarea sa nu poata fi intoarsa din
// greseala la un `notFalse` odata cu alta modificare in `defaults.ts`.

test("contactul e OPRIT cand nimeni nu l-a cerut", () => {
  for (const features of [{}, { show_contact: undefined }, { show_gallery: true }]) {
    const d = buildClassicDesign(base({ features }));
    assert.equal(find(d.home, "contact")?.enabled, false, JSON.stringify(features));
  }
});

test("contactul apare doar cand e pornit explicit", () => {
  const d = buildClassicDesign(base({ features: { show_contact: true } }));
  assert.equal(find(d.home, "contact")?.enabled, true);
});

test("un `false` salvat de dinainte tine sectiunea oprita", () => {
  const d = buildClassicDesign(base({ features: { show_contact: false } }));
  assert.equal(find(d.home, "contact")?.enabled, false);
});

test("galeria si descrierea RAMAN pornite implicit", () => {
  // Doar contactul s-a schimbat. Daca cineva atinge si pe celelalte doua, se vede.
  const d = buildClassicDesign(base());
  assert.equal(find(d.home, "gallery")?.enabled, true, "galeria");
  assert.equal(find(d.home, "about")?.enabled, true, "descrierea");
});
