import test from "node:test";
import assert from "node:assert/strict";
import { newProductSection } from "@/lib/store-sections";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { updateSection } from "@/lib/storefront/design/edit";
import { CONTINUT_GOL, parseContinutCiorna, type ContinutCiorna } from "@/lib/storefront/design/continut-ciorna";
import type { DesignContext } from "@/lib/storefront/design/types";
import {
  amprentaCiornei,
  cuCheilePc,
  cuColoanele,
  dupaPublicare,
  reductorCiorna,
  stareInitiala,
  type ContinutPublicat,
  type StareCiorna,
} from "./ciorna";

/**
 * CIORNA COMUNA A EDITORULUI UNIC: DESIGN SI CONTINUT (etapa 6 din `docs/editor-magazin/PLAN.md`).
 *
 * Rulare: `npm test`.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };
const publicat: ContinutPublicat = {
  pc: { logo_size: 36, reviews_section: { enabled: true, title: "Recenzii", items: [] } },
  magazin: { logo_url: "https://a/logo.png", cover_url: null, primary_color: "#07c527", gallery: [] },
};
const pornire = (): StareCiorna => stareInitiala({ design: buildClassicDesign(ctx), continut: CONTINUT_GOL });
let ceas = 1_000;
const scrieContinut = (s: StareCiorna, fn: (c: ContinutCiorna) => ContinutCiorna, cheie: string | null = null) =>
  reductorCiorna(s, { tip: "aplicaContinut", fn, ctxPublicat: ctx, cheie, acum: (ceas += 5_000) });
const randuri = (s: StareCiorna) => s.ciorna.design.home.filter((x) => x.kind === "product_row" && x.settings.mode !== "featured").length;

test("⚠⚠ un rand de produse scris in ciorna apare pe loc in design (re-derivarea)", () => {
  const rand = { ...newProductSection("selected"), title: "Noutati" };
  const s = scrieContinut(pornire(), (c) => cuCheilePc(c, { product_sections: [rand] }, publicat));
  assert.deepEqual(s.ciorna.continut.pc, { product_sections: [rand] });
  assert.equal(randuri(s), 1, "randul e in arbore inainte de orice salvare");
});

test("⚠⚠ Anuleaza desface si continutul, si designul derivat din el, impreuna", () => {
  const rand = { ...newProductSection("selected"), title: "Noutati" };
  const unu = scrieContinut(pornire(), (c) => cuCheilePc(c, { product_sections: [rand] }, publicat));
  const inapoi = reductorCiorna(unu, { tip: "anuleaza" });
  assert.deepEqual(inapoi.ciorna.continut, CONTINUT_GOL);
  assert.equal(randuri(inapoi), 0, "un design ramas cu randul, fara continutul lui, s-ar fi despartit");
  const iar = reductorCiorna(inapoi, { tip: "reface" });
  assert.equal(randuri(iar), 1);
});

test("un singur istoric: o schimbare de design si una de continut se desfac in ordine", () => {
  const s0 = pornire();
  const header = s0.ciorna.design.chrome.header.id;
  const s1 = reductorCiorna(s0, { tip: "aplica", urmatorul: (d) => updateSection(d, header, { variant: "centered" }), cheie: null, acum: 10 });
  const s2 = scrieContinut(s1, (c) => cuCheilePc(c, { logo_size: 70 }, publicat));
  const a1 = reductorCiorna(s2, { tip: "anuleaza" });
  assert.deepEqual(a1.ciorna.continut, CONTINUT_GOL, "intai continutul, ultimul schimbat");
  assert.equal(a1.ciorna.design.chrome.header.variant, "centered");
  const a2 = reductorCiorna(a1, { tip: "anuleaza" });
  assert.notEqual(a2.ciorna.design.chrome.header.variant, "centered");
});

test("o modificare de continut care nu schimba nimic nu e un pas", () => {
  const s = pornire();
  assert.equal(scrieContinut(s, (c) => c), s);
  // Aceeasi valoare ca in magazin: cheia nici nu intra in ciorna.
  assert.equal(scrieContinut(s, (c) => cuCheilePc(c, { logo_size: 36 }, publicat)), s);
});

test("⚠ o cheie adusa inapoi la valoarea publicata iese din ciorna (punctul si „Publică” n-o mai poarta)", () => {
  const c1 = cuCheilePc(CONTINUT_GOL, { logo_size: 70 }, publicat);
  assert.deepEqual(c1.pc, { logo_size: 70 });
  const c2 = cuCheilePc(c1, { logo_size: 36 }, publicat);
  assert.deepEqual(c2.pc, {});
  assert.equal(cuCheilePc(c2, { logo_size: 36 }, publicat), c2, "fara schimbare, acelasi obiect");
  // Ordinea cheilor nu conteaza (`jsonb`).
  assert.deepEqual(cuCheilePc(CONTINUT_GOL, { reviews_section: { items: [], title: "Recenzii", enabled: true } }, publicat).pc, {});
  const m1 = cuColoanele(CONTINUT_GOL, { primary_color: "#ff0000", logo_url: "https://a/logo.png" }, publicat);
  assert.deepEqual(m1.magazin, { primary_color: "#ff0000" }, "logo-ul e cel publicat: nu intra");
  assert.deepEqual(cuColoanele(m1, { primary_color: "#07c527" }, publicat).magazin, {});
  // `null` e o alegere (logo scos), nu lipsa.
  assert.deepEqual(cuColoanele(CONTINUT_GOL, { logo_url: null }, publicat).magazin, { logo_url: null });
});

test("dupa „Publică”, ciorna devine publicatul", () => {
  const c = cuColoanele(cuCheilePc(CONTINUT_GOL, { logo_size: 70 }, publicat), { primary_color: "#ff0000" }, publicat);
  const nou = dupaPublicare(publicat, c);
  assert.equal(nou.pc.logo_size, 70);
  assert.deepEqual(nou.pc.reviews_section, publicat.pc.reviews_section, "restul cheilor raman");
  assert.equal(nou.magazin.primary_color, "#ff0000");
  assert.equal(nou.magazin.logo_url, "https://a/logo.png");
  assert.equal(dupaPublicare(publicat, CONTINUT_GOL), publicat);
});

test("amprenta ciornei cuprinde continutul", () => {
  const s = pornire();
  const cu = { ...s.ciorna, continut: cuCheilePc(CONTINUT_GOL, { logo_size: 70 }, publicat) };
  assert.notEqual(amprentaCiornei(s.ciorna), amprentaCiornei(cu));
  assert.equal(amprentaCiornei(s.ciorna), amprentaCiornei({ ...s.ciorna }));
});

/* ═══ Etapa 7: cheile scoase si versiunea readusa ═══ */

test("⚠⚠ o cheie scrisa de om nu mai e scoasa", () => {
  const c0 = parseContinutCiorna({ scoase: ["logo_size", "store_bg_color"] });
  const c1 = cuCheilePc(c0, { logo_size: 70 }, publicat);
  assert.deepEqual(c1.pc, { logo_size: 70 });
  assert.deepEqual(c1.scoase, ["store_bg_color"]);
  // Adusa la valoarea publicata: nici scrisa, nici scoasa; ramane cea din magazin.
  const c2 = cuCheilePc(c0, { logo_size: 36 }, publicat);
  assert.deepEqual(c2.pc, {});
  assert.deepEqual(c2.scoase, ["store_bg_color"]);
  const c3 = cuCheilePc(c2, { store_bg_color: "#ffffff" }, publicat);
  assert.deepEqual(c3.pc, { store_bg_color: "#ffffff" });
  assert.equal("scoase" in c3, false, "lista goala nu ramane in ciorna");
  assert.equal(cuCheilePc(c0, {}, publicat), c0, "fara schimbare, acelasi obiect");
});

test("dupa „Publică”, cheia scoasa lipseste si din publicat", () => {
  const nou = dupaPublicare(publicat, parseContinutCiorna({ scoase: ["logo_size"] }));
  assert.equal(Object.hasOwn(nou.pc, "logo_size"), false);
  assert.deepEqual(nou.pc.reviews_section, publicat.pc.reviews_section);
});

test("⚠⚠ „readu” e un pas: Anuleaza aduce inapoi ciorna de dinainte, Refa versiunea", () => {
  const s1 = scrieContinut(pornire(), (c) => cuCheilePc(c, { logo_size: 70 }, publicat));
  const veche = buildClassicDesign(ctx);
  const versiune = {
    design: updateSection(veche, veche.chrome.header.id, { variant: "centered" }),
    continut: parseContinutCiorna({ scoase: ["reviews_section"] }),
  };
  const s2 = reductorCiorna(s1, { tip: "readu", ciorna: versiune, acum: (ceas += 5_000) });
  assert.deepEqual(s2.ciorna, versiune);
  const inapoi = reductorCiorna(s2, { tip: "anuleaza" });
  assert.deepEqual(inapoi.ciorna, s1.ciorna, "ciorna de dinainte, cu modificarea ei, revine");
  assert.deepEqual(reductorCiorna(inapoi, { tip: "reface" }).ciorna, versiune);
  // Versiunea care e deja pe ecran nu e un pas.
  assert.equal(reductorCiorna(s2, { tip: "readu", ciorna: { ...versiune }, acum: (ceas += 5_000) }), s2);
});
