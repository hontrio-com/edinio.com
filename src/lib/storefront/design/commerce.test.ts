import test from "node:test";
import assert from "node:assert/strict";
import { radacinaCatalog, sectiuniAcasa, shopHref, shopOnPage } from "./commerce";
import { buildClassicDesign } from "./defaults";
import type { DesignContext, StoreDesign } from "./types";

/**
 * Gate-ul paginii de catalog. Un raspuns gresit aici nu strica un aspect, ci
 * deschide sau inchide o ruta publica pe toate magazinele deodata.
 */

const ctx: DesignContext = { primaryColor: "#1AB554", pageContent: {}, features: {} };
const classic = () => buildClassicDesign(ctx);
const cuVarianta = (variant: string, enabled = true): StoreDesign => {
  const d = classic();
  return { ...d, shop: { page: { ...d.shop.page, variant, enabled } } };
};

test("magazinul care n-a ales nimic nu are pagina de catalog", () => {
  // Slotul ajunge derivat la TOATE magazinele. Daca gate-ul ar raspunde da aici,
  // ruta s-ar deschide in ziua deployului pe fiecare magazin publicat.
  assert.equal(shopOnPage(classic()), false);
});

test("o varianta de tip pagina deschide ruta", () => {
  assert.equal(shopOnPage(cuVarianta("sidebar")), true);
});

test("sectiunea stinsa inchide ruta, chiar cu o varianta de tip pagina", () => {
  /*
   * Verificarea pe `enabled` e in plus fata de cos si checkout, unde exista un
   * panou ca alternativa. Aici orice varianta in afara de „none" e o pagina,
   * deci fara ea o sectiune stinsa ar fi lasat ruta deschisa mai departe.
   */
  assert.equal(shopOnPage(cuVarianta("sidebar", false)), false);
});

test("o varianta necunoscuta nu deschide ruta", () => {
  assert.equal(shopOnPage(cuVarianta("inventata")), false);
});

test("radacina catalogului urmeaza designul, pe ambele feluri de adresa", () => {
  assert.equal(radacinaCatalog("/pravalie", classic()), "/pravalie");
  assert.equal(radacinaCatalog("", classic()), "/");
  assert.equal(radacinaCatalog("/pravalie", cuVarianta("sidebar")), "/pravalie/magazin");
  assert.equal(radacinaCatalog("", cuVarianta("sidebar")), "/magazin");
});

test("segmentul rutei se compune intr-un singur loc", () => {
  assert.equal(shopHref("/pravalie"), "/pravalie/magazin");
  assert.equal(shopHref(""), "/magazin");
});

test("fara pagina de catalog, pagina principala ramane neatinsa", () => {
  const d = classic();
  assert.equal(sectiuniAcasa(d), d.home);
});

test("cu pagina de catalog, grila si bara de cautare ies de pe pagina principala", () => {
  // Altfel aceleasi produse ar fi listate la doua adrese auto-canonice, iar
  // Google ar fi ales singur intre ele.
  const acasa = sectiuniAcasa(cuVarianta("sidebar"));
  assert.ok(!acasa.some((s) => s.kind === "product_grid"));
  assert.ok(!acasa.some((s) => s.kind === "catalog_toolbar"));
});

test("categoriile si randurile de produse RAMAN pe pagina principala", () => {
  // Pastilele de categorii sunt navigare catre catalog, nu filtrare in el.
  const acasa = sectiuniAcasa(cuVarianta("sidebar"));
  assert.ok(acasa.some((s) => s.kind === "category_nav"));
  assert.ok(acasa.some((s) => s.kind === "product_row"));
  assert.ok(acasa.some((s) => s.kind === "hero"));
});

test("taierea nu atinge configuratia salvata", () => {
  // Comerciantul care se razgandeste isi gaseste pagina principala exact cum a
  // lasat-o: sectiunile raman in design, se sar doar la randare.
  const d = cuVarianta("sidebar");
  const inainte = d.home.length;
  sectiuniAcasa(d);
  assert.equal(d.home.length, inainte);
});
