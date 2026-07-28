import test from "node:test";
import assert from "node:assert/strict";
import { citesteSetariMagazin, citesteSetariMagazinDinSectiune } from "./shop-settings";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Setarile paginii de catalog sunt citite din DOUA locuri aflate la etaje
 * diferite: `MiniStoreRenderer` ia de aici cate produse intra pe o pagina si
 * felul paginarii, iar modelele iau restul. Implicite diferite intre ele ar
 * insemna un catalog care numara 24 pe pagina si o paginare care crede 20, adica
 * pagini goale la coada.
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };
const cu = (variant: string, settings: Record<string, unknown> = {}): StoreDesign => {
  const d = buildClassicDesign(ctx);
  return { ...d, shop: { page: { ...d.shop.page, variant, settings } } };
};

test("magazinul care n-a atins nimic primeste implicitele de dinainte de reglaje", () => {
  // Douazeci era numarul hardcodat al grilei. Un magazin nu trebuie sa vada alta
  // densitate doar fiindca a aparut o setare.
  const s = citesteSetariMagazin(cu("none"));
  assert.equal(s.perPage, 20);
  assert.equal(s.modPaginare, "pagini");
  assert.equal(s.titlu, "Toate produsele");
  assert.equal(s.arataTitlu, true);
});

test("implicitele variantei se aplica peste cele ale codului", () => {
  // Modelul compact e mai dens: cinci coloane, nu patru.
  assert.equal(citesteSetariMagazin(cu("compact")).coloane, 5);
  assert.equal(citesteSetariMagazin(cu("sidebar")).coloane, 4);
});

test("ce a scris comerciantul bate implicitul variantei", () => {
  const s = citesteSetariMagazin(cu("compact", { coloane: "3", perPage: 48 }));
  assert.equal(s.coloane, 3);
  assert.equal(s.perPage, 48);
});

test("valorile din afara intervalului se retin la margine, nu strica pagina", () => {
  // Parserul limiteaza deja campurile `range`, dar jsonb-ul poate fi scris si
  // direct in baza. Un `perPage` de zece mii ar fi randat tot catalogul deodata.
  assert.equal(citesteSetariMagazin(cu("sidebar", { perPage: 10000 })).perPage, 96);
  assert.equal(citesteSetariMagazin(cu("sidebar", { perPage: 0 })).perPage, 8);
  assert.equal(citesteSetariMagazin(cu("sidebar", { coloane: "99" })).coloane, 6);
});

test("un mod de paginare necunoscut cade pe paginile numerotate", () => {
  // Singurul care da linkuri crawlabile vizibile, deci refugiul sigur.
  assert.equal(citesteSetariMagazin(cu("sidebar", { modPaginare: "inventat" })).modPaginare, "pagini");
});

test("sortarea implicita a paginii ramane goala cand nu s-a ales nimic", () => {
  // Gol inseamna „foloseste sortarea magazinului". Un implicit scris aici ar fi
  // dublat setarea din Editeaza magazinul, si comerciantul ar fi stins-o acolo
  // fara niciun efect.
  assert.equal(citesteSetariMagazin(cu("sidebar")).sortareImplicita, "");
  assert.equal(citesteSetariMagazin(cu("sidebar", { sortareImplicita: "price_asc" })).sortareImplicita, "price_asc");
});

test("grupurile de filtre pornesc toate aprinse, in ordinea din catalog", () => {
  const s = citesteSetariMagazin(cu("sidebar"));
  assert.deepEqual(s.grupuriFiltre, ["categorii", "pret", "atribute", "brand", "etichete", "specificatii"]);
});

test("un grup stins din editor dispare, iar ordinea aleasa se pastreaza", () => {
  const s = citesteSetariMagazin(cu("sidebar", {
    grupuriFiltre: [
      { key: "brand", on: true },
      { key: "categorii", on: true },
      { key: "specificatii", on: false },
    ],
  }));
  assert.equal(s.grupuriFiltre[0], "brand");
  assert.equal(s.grupuriFiltre[1], "categorii");
  assert.ok(!s.grupuriFiltre.includes("specificatii"));
  // Grupurile pe care comerciantul nu le-a atins raman aprinse, la coada: un
  // grup adaugat mai tarziu nu trebuie sa lipseasca la cine si-a aranjat lista.
  assert.ok(s.grupuriFiltre.includes("pret"));
});

test("sortarile oferite se pot restrange", () => {
  const s = citesteSetariMagazin(cu("sidebar", {
    sortariOferite: [{ key: "price_asc", on: true }, { key: "popular", on: false }],
  }));
  assert.equal(s.sortariOferite[0], "price_asc");
  assert.ok(!s.sortariOferite.includes("popular"));
});

test("miniatura citeste aceleasi setari dintr-o sectiune fara design in jur", () => {
  // Galeria randeaza o sectiune sintetica, construita din `defaults`-urile
  // variantei; trebuie sa dea exact ce da magazinul real cu aceleasi setari.
  const dinDesign = citesteSetariMagazin(cu("compact", { perPage: 36 }));
  const dinSectiune = citesteSetariMagazinDinSectiune({ variant: "compact", settings: { perPage: 36 } });
  assert.deepEqual(dinSectiune, dinDesign);
});

test("textele goale nu inlocuiesc implicitul cu sir gol", () => {
  // Un titlu sters din editor trebuie sa cada pe „Toate produsele", nu sa lase
  // pagina cu un `h1` gol.
  assert.equal(citesteSetariMagazin(cu("sidebar", { titlu: "   " })).titlu, "Toate produsele");
});
