import assert from "node:assert/strict";
import { test } from "node:test";
import { menuItemHref, type MenuItem } from "./menu";

/**
 * Intrarea „Magazin" din meniu duce la produse, nu la o pagina anume.
 *
 * Cat timp catalogul era pe prima pagina, cele doua coincideau si nimeni n-avea
 * de unde sti ca sunt doua lucruri. De cand exista pagina de catalog, un meniu
 * care scrie „Magazin" si duce la vitrina e o promisiune incalcata.
 */

const magazin: MenuItem = { id: "m1", type: "home", label: "Magazin" };

test("fara pagina de catalog, intrarea Magazin ramane exact unde era", () => {
  assert.equal(menuItemHref(magazin, "/pravalie", "/pravalie"), "/pravalie");
  assert.equal(menuItemHref(magazin, "", "/"), "/");
});

test("cu pagina de catalog, intrarea Magazin duce acolo", () => {
  assert.equal(menuItemHref(magazin, "/pravalie", "/pravalie/magazin"), "/pravalie/magazin");
  assert.equal(menuItemHref(magazin, "", "/magazin"), "/magazin");
});

test("un apel care nu spune unde e catalogul nu produce slash in plus", () => {
  assert.equal(menuItemHref(magazin, "/pravalie"), "/pravalie");
  assert.equal(menuItemHref(magazin, ""), "/");
});

test("paginile si linkurile externe nu se ating de radacina catalogului", () => {
  assert.equal(
    menuItemHref({ id: "m2", type: "page", label: "Contact", target: "contact" }, "/pravalie", "/pravalie/magazin"),
    "/pravalie/contact",
  );
  assert.equal(
    menuItemHref({ id: "m3", type: "link", label: "Blog", target: "https://exemplu.ro" }, "/pravalie", "/pravalie/magazin"),
    "https://exemplu.ro",
  );
});

test("categoriile pornesc de la catalog, nu de la radacina magazinului", () => {
  assert.equal(
    menuItemHref({ id: "m4", type: "category", label: "Hartie", target: "Hartie" }, "/pravalie", "/pravalie/magazin"),
    "/pravalie/magazin?cat=Hartie",
  );
});
