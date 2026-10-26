import test from "node:test";
import assert from "node:assert/strict";
import { newProductSection } from "@/lib/store-sections";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { updateSection } from "@/lib/storefront/design/edit";
import { CHEI_PC_CIORNA, pcCuCiorna } from "@/lib/storefront/design/continut-ciorna";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import type { ContinutPublicat } from "./ciorna";
import { contextDesign } from "./derivare";
import { ciornaDinVersiune, dataVersiunii, esteInMagazin, instantaneuContinut, VERSIUNI_PASTRATE } from "./versiuni";

/**
 * ISTORICUL PUBLICARILOR (etapa 7 din `docs/editor-magazin/PLAN.md`): ce se pastreaza la „Publică”
 * si ce ciorna iese dintr-o versiune readusa.
 *
 * Rulare: `npm test`.
 */

const MAGAZIN: ContinutPublicat["magazin"] = {
  logo_url: "https://cdn.edinio.com/logos/a.webp",
  cover_url: null,
  primary_color: "#6D28D9",
  gallery: ["https://cdn.edinio.com/g/1.webp"],
};
const RECENZII = { enabled: true, title: "Recenzii", items: [{ name: "Ana", text: "Bun", rating: 5 }] };
/** Ce e publicat acum: chei ale editorului, plus chei scrise de Setari (comanda, pagina principala). */
const ACUM: ContinutPublicat = {
  pc: {
    store_bg_color: "#111111",
    logo_size: 36,
    reviews_section: RECENZII,
    checkout_config: { extras: [{ id: "x", label: "Ambalaj", price: 5 }] },
    pagina_acasa: "cb30f6bd-5b15-477f-9af1-920ad19bd81c",
  },
  magazin: MAGAZIN,
};
const ctxDin = (p: ContinutPublicat): DesignContext => contextDesign({
  primaryColor: p.magazin.primary_color, pageContent: p.pc, features: {}, coverUrl: p.magazin.cover_url, tagline: null,
});
const randuri = (d: StoreDesign) => d.home.filter((s) => s.kind === "product_row" && s.settings.mode !== "featured");

test("instantaneul: doar cheile editorului si cele patru coloane, nimic din Setari", () => {
  const inst = instantaneuContinut({ ...ACUM.pc, permalinks: { produs: "p" }, seo: { title: "x" }, font_text: undefined }, MAGAZIN);
  assert.deepEqual(Object.keys(inst.pc).sort(), ["logo_size", "reviews_section", "store_bg_color"]);
  assert.ok(Object.keys(inst.pc).every((k) => CHEI_PC_CIORNA.has(k)));
  assert.deepEqual(inst.magazin, MAGAZIN);
  assert.equal("scoase" in inst, false);
});

test("⚠⚠ readusa versiunea de ACUM, ciorna nu schimba nimic", () => {
  const ctx = ctxDin(ACUM);
  const publicatAcum = updateSection(buildClassicDesign(ctx), buildClassicDesign(ctx).chrome.header.id, { variant: "centered" });
  const c = ciornaDinVersiune({ design: publicatAcum, continut: instantaneuContinut(ACUM.pc, MAGAZIN) }, ACUM, ctx);
  assert.deepEqual(c.continut, { pc: {}, magazin: {} });
  assert.deepEqual(c.design, parseStoreDesign(publicatAcum, ctx));
});

test("⚠⚠ fata de ce e publicat: o cheie lipsa din versiune se SCOATE, una schimbata se scrie, una egala nu intra", () => {
  const veche = {
    design: {},
    // Versiunea nu avea fundalul (ales dupa); avea alt logo_size si aceleasi recenzii, in alta ordine a cheilor.
    continut: {
      pc: { logo_size: 50, reviews_section: { items: [{ rating: 5, text: "Bun", name: "Ana" }], title: "Recenzii", enabled: true } },
      magazin: { ...MAGAZIN, primary_color: "#07c527", gallery: [] },
    },
  };
  const c = ciornaDinVersiune(veche, ACUM, ctxDin(ACUM));
  assert.deepEqual(c.continut.pc, { logo_size: 50 });
  assert.deepEqual(c.continut.scoase, ["store_bg_color"]);
  assert.deepEqual(c.continut.magazin, { primary_color: "#07c527", gallery: [] });
  // La „Publică”: fundalul dispare, iar ce au scris Setarile ramane neatins.
  const dupa = pcCuCiorna(ACUM.pc, c.continut);
  assert.equal(Object.hasOwn(dupa, "store_bg_color"), false);
  assert.deepEqual(dupa.checkout_config, ACUM.pc.checkout_config);
  assert.equal(dupa.pagina_acasa, ACUM.pc.pagina_acasa);
  assert.equal(dupa.logo_size, 50);
});

test("⚠ o versiune cu chei din afara listei (sau stricata) nu poate duce nimic altceva in ciorna", () => {
  const c = ciornaDinVersiune({
    design: "x",
    continut: { pc: { permalinks: { produs: "alt" }, pagina_acasa: null, logo_size: 36 }, magazin: { primary_color: "rosu", logo_url: "javascript:alert(1)", slug: "alt" }, scoase: ["checkout_config"] },
  }, ACUM, ctxDin(ACUM));
  // Tot ce era din editor si lipsea din versiune se scoate; Setarile, nu.
  assert.deepEqual(c.continut.pc, {});
  assert.deepEqual(c.continut.scoase, ["reviews_section", "store_bg_color"]);
  assert.deepEqual(c.continut.magazin, {});
  assert.deepEqual(c.design, parseStoreDesign({}, ctxDin({ ...ACUM, pc: pcCuCiorna(ACUM.pc, c.continut) })));
});

test("⚠⚠ randul de produse al versiunii ramane in design (parsat cu continutul versiunii)", () => {
  const rand = { ...newProductSection("selected"), title: "Vechi" };
  const ctxVechi = ctxDin({ ...ACUM, pc: { product_sections: [rand] } });
  const designVechi = buildClassicDesign(ctxVechi);
  assert.equal(randuri(designVechi).length, 1);
  const c = ciornaDinVersiune({ design: designVechi, continut: { pc: { product_sections: [rand] }, magazin: MAGAZIN } }, ACUM, ctxDin(ACUM));
  assert.deepEqual(c.continut.pc, { product_sections: [rand] });
  // Parsat cu ce e publicat acum (fara randuri), randul ar fi iesit ca orfan.
  assert.equal(randuri(parseStoreDesign(designVechi, ctxDin(ACUM))).length, 0);
  assert.equal(randuri(c.design).length, 1);
});

test("„În magazin acum” doar pe versiunea cu CHIAR data publicarii", () => {
  assert.equal(esteInMagazin("2026-10-26T10:00:00.123+00:00", "2026-10-26T10:00:00.123Z"), true);
  assert.equal(esteInMagazin("2026-10-26T10:00:00.124+00:00", "2026-10-26T10:00:00.123Z"), false);
  assert.equal(esteInMagazin("2026-10-26T10:00:00.123+00:00", null), false);
  assert.equal(esteInMagazin("nu e o data", "nu e o data"), false);
});

test("data versiunii: azi, ieri, in anul acesta, alt an (in fusul magazinului)", () => {
  const acum = new Date("2026-10-26T12:00:00Z");
  const fus = "Europe/Bucharest";
  assert.equal(dataVersiunii("2026-10-26T08:05:00Z", acum, fus), "Azi, 10:05");
  // 22:30 UTC pe 25 e deja 00:30 pe 26 la Bucuresti: ziua se socoteste in fus, nu in UTC.
  assert.equal(dataVersiunii("2026-10-25T22:30:00Z", acum, fus), "Azi, 00:30");
  assert.equal(dataVersiunii("2026-10-25T21:59:00Z", acum, fus), "Ieri, 23:59");
  // Inainte de trecerea la ora de iarna (25.10, 04:00): UTC+3.
  assert.equal(dataVersiunii("2026-10-24T16:05:00Z", acum, fus), "24 oct., 19:05");
  assert.equal(dataVersiunii("2025-10-24T16:05:00Z", acum, fus), "24 oct. 2025, 19:05");
  assert.equal(dataVersiunii("2026-01-01T10:00:00Z", new Date("2026-01-01T23:30:00Z"), fus), "Ieri, 12:00", "23:30 UTC e deja 2 ianuarie");
  assert.equal(dataVersiunii("x", acum, fus), "");
});

test("plafonul e cel din plan", () => {
  assert.equal(VERSIUNI_PASTRATE, 30);
});
