import assert from "node:assert/strict";
import { test } from "node:test";
import { headerHostsAnnouncement, standaloneAnnouncement } from "./chrome";
import { buildClassicDesign } from "./defaults";
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
  // Un ecran plin de sectiuni cu o singura varianta ar da impresia unei alegeri
  // care nu exista, asa ca lista e explicita, nu derivata din numarul de variante.
  // Pagina de produs intra aici cand ii construim design-urile: pana atunci ar fi
  // o intrare cu un singur card si cu previzualizare goala.
  const inCatalog = Object.entries(SECTION_REGISTRY)
    .filter(([, m]) => m?.inCatalog)
    .map(([k]) => k)
    .sort();
  assert.deepEqual(inCatalog, ["footer", "header", "hero", "product_row"]);
});

test("hero-ul cu bara de categorii isi declara pragul minim", () => {
  // Pragul e citit si de catalog (ca sa stinga varianta) si de componenta (ca sa
  // cada inapoi pe bannere daca magazinul scade sub el). Daca dispare de aici,
  // varianta devine alegibila la orice magazin si arata strambatura.
  const v = SECTION_REGISTRY.hero?.variants.categories;
  assert.equal(v?.requires?.minCategories, MIN_CATEGORII_HERO_SIDEBAR);
  assert.ok(MIN_CATEGORII_HERO_SIDEBAR >= 4);
});
