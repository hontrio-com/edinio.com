import assert from "node:assert/strict";
import { test } from "node:test";
import { headerHostsAnnouncement, standaloneAnnouncement } from "./chrome";
import { buildClassicDesign } from "./defaults";
import { DEMO_BANNERS } from "./demo-content";
import { MIN_CATEGORII_HERO_SIDEBAR, SECTION_REGISTRY } from "./registry";
import type { StoreDesign } from "./types";

function design(variant: string, enabled = true): StoreDesign {
  const d = buildClassicDesign({ primaryColor: "#1AB554", pageContent: {}, features: {} });
  d.chrome.header = { ...d.chrome.header, variant, enabled };
  d.chrome.announcement = {
    id: "announcement",
    kind: "announcement",
    variant: "marquee",
    enabled: true,
    settings: {},
  };
  return d;
}

test("header-ul clasic lasa bara de anunt separata", () => {
  const d = design("classic");
  assert.equal(headerHostsAnnouncement(d), false);
  assert.equal(standaloneAnnouncement(d)?.id, "announcement");
});

test("header-ul editorial isi poarta singur banda, deci bara separata dispare", () => {
  const d = design("editorial");
  assert.equal(headerHostsAnnouncement(d), true);
  assert.equal(standaloneAnnouncement(d), null);
});

test("un header stins nu poate gazdui nimic", () => {
  // Altfel un header ascuns ar inghiti anuntul si mesajul n-ar mai aparea nicaieri.
  const d = design("editorial", false);
  assert.equal(headerHostsAnnouncement(d), false);
  assert.equal(standaloneAnnouncement(d)?.id, "announcement");
});

test("varianta necunoscuta nu gazduieste banda", () => {
  const d = design("varianta-inexistenta");
  assert.equal(headerHostsAnnouncement(d), false);
  assert.equal(standaloneAnnouncement(d)?.id, "announcement");
});

test("catalogul de design-uri contine exact zonele pentru care facem variante", () => {
  // Lista e explicita, nu derivata din numarul de variante: randul de produse a
  // iesit (asezarea lui ramane in editorul magazinului), iar pagina de produs,
  // cosul si finalizarea comenzii au intrat, deocamdata cu designul de azi ca
  // singura varianta — de la el pornesc cele urmatoare.
  const inCatalog = Object.entries(SECTION_REGISTRY)
    .filter(([, m]) => m?.inCatalog)
    .map(([k]) => k)
    .sort();
  assert.deepEqual(inCatalog, ["cart_drawer", "checkout", "footer", "header", "hero", "product_page"]);
});

test("hero-ul cu bara de categorii isi declara pragul minim", () => {
  // Pragul e citit si de catalog (ca sa stinga varianta) si de componenta (ca sa
  // cada inapoi pe bannere daca magazinul scade sub el). Daca dispare de aici,
  // varianta devine alegibila la orice magazin si arata strambatura.
  const v = SECTION_REGISTRY.hero?.variants.categories;
  assert.equal(v?.requires?.minCategories, MIN_CATEGORII_HERO_SIDEBAR);
  assert.ok(MIN_CATEGORII_HERO_SIDEBAR >= 4);
});

test("continutul demo are cel putin doua bannere", () => {
  // Cu un singur banner, hero-ul „doar imagini" foloseste varianta turnata, a
  // carei inaltime e limitata la 60% din fereastra. In miniatura, fereastra e
  // exact inaltimea pe care i-o da parintele dupa masuratoare, deci imaginea si
  // masuratoarea s-ar micsora una pe alta pana la disparitie. Cu doua sau mai
  // multe se randeaza caruselul, cu raport fix, si bucla nu exista.
  assert.ok(DEMO_BANNERS.length >= 2, "hero-ul cu un singur banner depinde de inaltimea ferestrei");
});

test("fiecare design din catalog isi declara inaltimea miniaturii", () => {
  // Fara ea, cardul porneste de la o inaltime implicita si sare vizibil in clipa
  // in care miniatura isi raporteaza inaltimea adevarata.
  for (const [kind, meta] of Object.entries(SECTION_REGISTRY)) {
    if (!meta?.inCatalog) continue;
    for (const [variant, v] of Object.entries(meta.variants)) {
      assert.ok(v.previewHeight, `${kind}:${variant} nu are previewHeight`);
    }
  }
});

test("cosul si formularul de comanda se previzualizeaza la latime de telefon", () => {
  // Sunt panouri inguste: pe panza de desktop ar fi o fasie intr-un camp gol.
  for (const kind of ["cart_drawer", "checkout"] as const) {
    const variante = Object.values(SECTION_REGISTRY[kind]?.variants ?? {});
    assert.ok(variante.length > 0);
    for (const v of variante) assert.equal(v.previewWidth, 390);
  }
});

test("designurile din catalog acopera si comertul, nu doar paginile", () => {
  // Gruparea din bara laterala a catalogului se face pe `scope`; un scope gresit
  // ar muta „Cos" in „Pagina magazinului".
  assert.equal(SECTION_REGISTRY.product_page?.scope, "product");
  assert.equal(SECTION_REGISTRY.cart_drawer?.scope, "commerce");
  assert.equal(SECTION_REGISTRY.checkout?.scope, "commerce");
});
