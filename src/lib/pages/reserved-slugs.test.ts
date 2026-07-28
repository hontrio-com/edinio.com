import assert from "node:assert/strict";
import { test } from "node:test";
import { isReservedSlug, validatePageSlug, RESERVED_PAGE_SLUGS } from "./reserved-slugs";
import { SEGMENT_CHECKOUT, SEGMENT_COS } from "@/lib/storefront/design/commerce";

/**
 * Un segment de ruta care nu e rezervat inseamna o pagina proprie care dispare
 * fara 404 si fara mesaj: in App Router segmentul static bate `[pageSlug]`, deci
 * pagina ramane in dashboard, in meniu si in sitemap, dar serveste alt continut.
 *
 * Testul leaga cele doua liste care pot ramane in urma una fata de alta:
 * segmentele declarate langa gate-urile de design si lista de sluguri rezervate.
 */

test("fiecare segment de ruta de comert e rezervat", () => {
  for (const segment of [SEGMENT_COS, SEGMENT_CHECKOUT]) {
    assert.ok(isReservedSlug(segment), `segmentul ${segment} nu e in lista rezervata`);
  }
});

test("segmentul paginii de catalog si sinonimele lui sunt rezervate", () => {
  // Sinonimele stau langa el ca sa nu apara o pagina proprie „produse" pe care
  // comerciantul o crede legata de catalog.
  for (const slug of ["magazin", "shop", "produse", "catalog"]) {
    assert.ok(isReservedSlug(slug), `${slug} nu e rezervat`);
  }
});

test("validarea respinge slugul rezervat cu mesaj in romana", () => {
  const v = validatePageSlug("Magazin");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.error : "", /rezervat/);
});

test("un slug obisnuit trece si e normalizat", () => {
  assert.deepEqual(validatePageSlug("Despre noi"), { ok: true, slug: "despre-noi" });
});

/**
 * Sufixul copiei nu poate ateriza pe un slug rezervat: `duplicatePage` compune
 * mereu `<slug>-copie`, iar lista nu contine nimic cu terminatia asta. De aceea
 * duplicarea nu trece prin validare, si testul tine afirmatia adevarata.
 */
test("nicio rezervare nu se termina in -copie, deci duplicarea nu poate cadea pe una", () => {
  for (const slug of RESERVED_PAGE_SLUGS) {
    assert.ok(!slug.endsWith("-copie"), `${slug} ar face duplicarea sa produca un slug rezervat`);
  }
});
