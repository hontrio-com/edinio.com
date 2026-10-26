import test from "node:test";
import assert from "node:assert/strict";
import { newProductSection } from "@/lib/store-sections";
import { CHEI_CONTINUT, CHEI_RETRASE } from "@/lib/editor-magazin/noduri";
import {
  CHEI_PC_CIORNA,
  CONTINUT_GOL,
  amprentaContinut,
  areContinut,
  ciornaCuContinut,
  contextCuCiorna,
  continutDinCiorna,
  jsonCanonic,
  magazinCuCiorna,
  parseContinutCiorna,
  pcCuCiorna,
  type ContinutCiorna,
} from "./continut-ciorna";
import { buildClassicDesign } from "./defaults";
import { ciornaAFostSchimbata } from "./draft-guard";
import { toggleSection } from "./edit";
import { parseStoreDesign } from "./parse";
import type { DesignContext } from "./types";

/**
 * CONTINUTUL NEPUBLICAT IN CIORNA DE DESIGN (etapa 6 din `docs/editor-magazin/PLAN.md`).
 *
 * Rulare: `npm test`.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };
const cu = (pc: Record<string, unknown> = {}, magazin: Record<string, unknown> = {}): ContinutCiorna =>
  parseContinutCiorna({ pc, magazin });

test("⚠⚠ ciorna tine DOAR cheile editorului: nimic din ce scriu alte ecrane", () => {
  const c = parseContinutCiorna({
    pc: {
      reviews_section: { enabled: true, title: "Recenzii", items: [] },
      font_titluri: "inter",
      // Scrise pe loc de alte ecrane; o ciorna care le-ar purta le-ar rescrie la „Publică”.
      permalinks: { produs: "p" },
      pagina_acasa: "x",
      seo: { title: "x" },
      store_mode: "one_product",
      checkout_config: {},
      menu: [],
      hide_out_of_stock_products: true,
      // Retrasa: nu o mai scrie niciun nod.
      show_featured_section: false,
    },
  });
  assert.deepEqual(Object.keys(c.pc).sort(), ["font_titluri", "reviews_section"]);
  for (const cheie of Object.values(CHEI_CONTINUT).flat()) assert.ok(CHEI_PC_CIORNA.has(cheie), cheie);
  for (const cheie of Object.keys(CHEI_RETRASE)) assert.ok(!CHEI_PC_CIORNA.has(cheie), `retrasa: ${cheie}`);
  assert.ok(!CHEI_PC_CIORNA.has("permalinks") && !CHEI_PC_CIORNA.has("pagina_acasa"));
});

test("coloanele din `businesses`: doar cele patru, cu valori pe care le poate scrie editorul", () => {
  const c = parseContinutCiorna({
    magazin: {
      logo_url: "https://cdn.edinio.com/logos/a.webp",
      cover_url: null,
      primary_color: "#12ab9F",
      gallery: ["https://cdn.edinio.com/g/1.webp", "javascript:alert(1)", 7, "/imagini/2.webp"],
      // In afara listei: le scrie alt ecran, sau nimeni de aici.
      is_published: false,
      slug: "alt-magazin",
      suspended_until: null,
    },
  });
  assert.deepEqual(c.magazin, {
    logo_url: "https://cdn.edinio.com/logos/a.webp",
    cover_url: null,
    primary_color: "#12ab9F",
    gallery: ["https://cdn.edinio.com/g/1.webp", "/imagini/2.webp"],
  });
  assert.deepEqual(parseContinutCiorna({ magazin: { logo_url: "javascript:alert(1)", primary_color: "red;}" } }).magazin, {});
});

test("parserul e total: orice intrare da un continut valid, cel mult gol", () => {
  for (const raw of [undefined, null, "x", 3, [], [1, 2], { pc: "x", magazin: [] }, { pc: [1], magazin: null }]) {
    assert.deepEqual(parseContinutCiorna(raw), { pc: {}, magazin: {} }, JSON.stringify(raw));
  }
  assert.equal(areContinut(CONTINUT_GOL), false);
  assert.deepEqual(continutDinCiorna({ version: 1, continut: { pc: { logo_size: 60 } } }).pc, { logo_size: 60 });
  assert.deepEqual(continutDinCiorna(null), { pc: {}, magazin: {} });
});

test("⚠ fara continut, ciorna ramane EXACT obiectul de dinainte (cioarnele vechi nu se schimba)", () => {
  const design = buildClassicDesign(ctx);
  assert.equal(ciornaCuContinut(design, CONTINUT_GOL), design);
  const c = cu({ logo_size: 70 });
  const scrisa = ciornaCuContinut(design, c) as unknown as Record<string, unknown>;
  assert.deepEqual(scrisa.continut, c);
  // Parserul designului nu cunoaste cheia: designul citit din ciorna e acelasi.
  assert.deepEqual(parseStoreDesign(scrisa, ctx), parseStoreDesign(design, ctx));
});

test("suprapunerea: ciorna bate ce e in magazin, dar numai pe cheile ei", () => {
  const pc = { logo_size: 40, faq_section: { enabled: true }, seo: { title: "x" } };
  assert.deepEqual(pcCuCiorna(pc, cu({ logo_size: 70 })), { logo_size: 70, faq_section: { enabled: true }, seo: { title: "x" } });
  assert.equal(pcCuCiorna(pc, CONTINUT_GOL), pc, "fara ciorna, acelasi obiect");
  const business = { id: "b", logo_url: "https://a/vechi.png", cover_url: "https://a/c.png", primary_color: "#000000", gallery: [] as string[] };
  // `null` e o valoare: logo-ul scos in ciorna dispare si din previzualizare.
  assert.deepEqual(magazinCuCiorna(business, cu({}, { logo_url: null, primary_color: "#ff0000" })), {
    ...business, logo_url: null, primary_color: "#ff0000",
  });
  assert.equal(magazinCuCiorna(business, cu({ logo_size: 1 })), business);
  const ctxNou = contextCuCiorna({ ...ctx, coverUrl: "https://a/c.png" }, cu({ hero_banners: ["https://a/b.png"] }, { primary_color: "#ff0000", cover_url: null }));
  assert.equal(ctxNou.primaryColor, "#ff0000");
  assert.equal(ctxNou.coverUrl, null);
  assert.deepEqual(ctxNou.pageContent, { hero_banners: ["https://a/b.png"] });
});

test("⚠ amprenta nu depinde de ordinea cheilor (`jsonb` le rearanjeaza)", () => {
  const a = cu({ reviews_section: { title: "R", enabled: true, items: [{ text: "x", name: "A", rating: 5 }] } });
  const b = cu({ reviews_section: { items: [{ rating: 5, name: "A", text: "x" }], enabled: true, title: "R" } });
  assert.equal(amprentaContinut(a), amprentaContinut(b));
  assert.notEqual(amprentaContinut(a), amprentaContinut(cu({ reviews_section: { title: "R2", enabled: true, items: [] } })));
  assert.equal(jsonCanonic({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"d":3}],"b":1}');
});

test("⚠⚠ garda: o ciorna schimbata doar la continut e tot o ciorna schimbata", () => {
  const design = buildClassicDesign(ctx);
  const inBaza = ciornaCuContinut(design, cu({ logo_size: 70 }));
  assert.equal(ciornaAFostSchimbata(inBaza, inBaza, ctx), false);
  assert.equal(ciornaAFostSchimbata(inBaza, ciornaCuContinut(design, cu({ logo_size: 80 })), ctx), true);
  assert.equal(ciornaAFostSchimbata(inBaza, design, ctx), true, "alta fila a scos continutul");
  // Aceeasi ciorna, cu cheile in alta ordine, cum o intoarce `jsonb`: nu e un conflict.
  const reordonata = JSON.parse(JSON.stringify({ continut: (inBaza as unknown as Record<string, unknown>).continut, ...design }));
  assert.equal(ciornaAFostSchimbata(reordonata, inBaza, ctx), false);
});

test("⚠⚠ un rand de produse care exista doar in ciorna ramane in design", () => {
  // Decizia 4 din plan: parserul scoate randurile fara pereche in `page_content`. Parsat cu
  // contextul magazinului, randul nou s-ar fi pierdut; parsat cu cel al ciornei, ramane.
  const rand = { ...newProductSection("selected"), title: "Noutati" };
  const continut = cu({ product_sections: [rand] });
  const design = buildClassicDesign(contextCuCiorna(ctx, continut));
  const ciorna = ciornaCuContinut(design, continut);
  const randuri = (d: ReturnType<typeof parseStoreDesign>) => d.home.filter((s) => s.kind === "product_row" && s.settings.mode !== "featured").length;
  assert.equal(randuri(parseStoreDesign(ciorna, ctx)), 0, "cu contextul magazinului, randul cade");
  assert.equal(randuri(parseStoreDesign(ciorna, contextCuCiorna(ctx, continutDinCiorna(ciorna)))), 1);
});

test("⚠ garda vede si schimbarile de pe un rand care exista doar in ciorna", () => {
  // Parsate cu contextul magazinului, ambele cioarne ar fi pierdut randul, deci ar fi parut
  // egale: o fila care l-a ascuns ar fi fost suprascrisa tacut de cealalta.
  const rand = { ...newProductSection("selected"), title: "Noutati" };
  const continut = cu({ product_sections: [rand] });
  const design = buildClassicDesign(contextCuCiorna(ctx, continut));
  const idRand = design.home.find((s) => s.kind === "product_row" && s.settings.mode !== "featured")!.id;
  const ascuns = toggleSection(design, idRand);
  assert.notDeepEqual(ascuns, design);
  assert.equal(ciornaAFostSchimbata(ciornaCuContinut(design, continut), ciornaCuContinut(ascuns, continut), ctx), true);
});

/* ═══ Etapa 7: cheile SCOASE de o versiune readusa din istoric ═══ */

test("⚠⚠ cheile scoase: pe lista alba, ordonate, fara dubluri, niciuna si scrisa", () => {
  const c = parseContinutCiorna({ pc: { logo_size: 40 }, scoase: ["store_bg_color", "permalinks", "logo_size", "store_bg_color", "font_text", 7, null] });
  assert.deepEqual(c.scoase, ["font_text", "store_bg_color"]);
  // Goala sau numai din afara listei: lipseste cu totul, deci cioarnele vechi isi pastreaza amprenta.
  assert.deepEqual(parseContinutCiorna({ pc: {}, scoase: [] }), { pc: {}, magazin: {} });
  assert.equal("scoase" in parseContinutCiorna({ scoase: ["permalinks", "pagina_acasa", "checkout_config"] }), false);
  assert.equal("scoase" in parseContinutCiorna({ scoase: "store_bg_color" }), false);
});

test("⚠⚠ o cheie scoasa dispare din `page_content`: in previzualizare, in context si la „Publică”", () => {
  const pc = { store_bg_color: "#111111", font_text: "inter", checkout_config: { extras: [] } };
  const c = parseContinutCiorna({ pc: { logo_size: 50 }, scoase: ["store_bg_color"] });
  assert.deepEqual(pcCuCiorna(pc, c), { font_text: "inter", checkout_config: { extras: [] }, logo_size: 50 });
  // Doar scoase, fara nicio cheie scrisa: tot e continut nepublicat, si tot se aplica.
  const doar = parseContinutCiorna({ scoase: ["store_bg_color"] });
  assert.equal(areContinut(doar), true);
  assert.deepEqual(pcCuCiorna(pc, doar), { font_text: "inter", checkout_config: { extras: [] } });
  assert.equal(Object.hasOwn(contextCuCiorna({ ...ctx, pageContent: pc }, doar).pageContent, "store_bg_color"), false);
  assert.equal(pc.store_bg_color, "#111111", "suprapunerea nu atinge obiectul primit");
});

test("⚠ cheile scoase intra in amprenta, in coloana si in garda", () => {
  const design = buildClassicDesign(ctx);
  const doar = parseContinutCiorna({ scoase: ["store_bg_color", "font_text"] });
  assert.notEqual(amprentaContinut(doar), amprentaContinut(CONTINUT_GOL));
  assert.equal(amprentaContinut(doar), amprentaContinut(parseContinutCiorna({ scoase: ["font_text", "store_bg_color"] })));
  const scrisa = ciornaCuContinut(design, doar);
  assert.deepEqual(continutDinCiorna(scrisa), doar, "drumul dus-intors prin coloana le pastreaza");
  assert.equal(ciornaAFostSchimbata(scrisa, design, ctx), true, "alta fila a pierdut cheile scoase");
  assert.equal(ciornaAFostSchimbata(scrisa, ciornaCuContinut(design, doar), ctx), false);
});
