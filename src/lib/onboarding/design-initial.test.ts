import test from "node:test";
import assert from "node:assert/strict";
import { designInitial } from "./design-initial";
import { STILURI, stilDupaId } from "./aspect";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { DesignContext } from "@/lib/storefront/design/types";

/*
 * Stilul ales la inscriere chiar ajunge in magazin (27.09.2026).
 *
 * Designul se scrie o data, la creare, dar se CITESTE la fiecare cerere prin
 * `parseStoreDesign`, care il impaca cu designul clasic. Proba cere ce vede un
 * client: dupa aceasta a doua trecere, antetul si subsolul sunt ale stilului.
 */
const ctx: DesignContext = { primaryColor: "#6D28D9", pageContent: {}, features: {}, coverUrl: null, tagline: null };

for (const stil of STILURI) {
  test(`stilul „${stil.nume}" ajunge in magazin: antet ${stil.antet}, subsol ${stil.subsol}`, () => {
    assert.ok(variantMeta("header", stil.antet), `antetul ${stil.antet} nu exista in registru`);
    assert.ok(variantMeta("footer", stil.subsol), `subsolul ${stil.subsol} nu exista in registru`);

    const salvat = designInitial(stil.id, ctx);
    const citit = parseStoreDesign(JSON.parse(JSON.stringify(salvat)), ctx);

    assert.equal(citit.chrome.header.variant, stil.antet);
    assert.equal(citit.chrome.footer.variant, stil.subsol);
    const hero = citit.home.find((s) => s.kind === "hero");
    assert.ok(hero?.enabled, "magazinul nou porneste fara hero, adica direct cu o grila goala");
  });
}

test("bannerele adaugate mai tarziu schimba singure hero-ul, iar stilul ramane", () => {
  const salvat = JSON.parse(JSON.stringify(designInitial("catalog", ctx)));
  const cuBannere: DesignContext = { ...ctx, pageContent: { hero_banners: ["https://exemplu.ro/b1.webp"] } };
  const citit = parseStoreDesign(salvat, cuBannere);
  assert.equal(citit.home.find((s) => s.kind === "hero")?.variant, "banners");
  assert.equal(citit.chrome.header.variant, "market");
});

test("un stil necunoscut venit din browser da stilul clasic", () => {
  assert.equal(stilDupaId("<script>").id, "clasic");
  assert.equal(designInitial(undefined, ctx).chrome.header.variant, "classic");
});
