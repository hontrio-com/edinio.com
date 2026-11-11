import test from "node:test";
import assert from "node:assert/strict";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { CHEIE_DATE_DEMO, idRandDemo } from "./import-demo";
import {
  amprenteleTemelor,
  continutCuRandurileDemoDeAcum,
  faraTexteleTemelor,
  pcFaraDemoAlAltorTeme,
  produseDemoDeScos,
  stareDinVersiune,
  stareaMagazinului,
  temaBanneruluiDemo,
  temaRanduluiDemo,
} from "./inlocuire-demo";
import { loculDinContext } from "./limita-demo";
import { TEME, temaDupaCheie } from "./teme";

/*
 * Etapa 25.3 (11.11.2026): o singura tema demo in magazin, iar o tema noua nu mai pastreaza textele celei de dinainte.
 * Gasit la proba de dinaintea lansarii: dupa Electra, prima pagina Jupiter scria „Alege camera” si „Cele mai iubite
 * camere”, cu placile „Pentru ea / Pentru el / Pentru copii” ale unei teme de moda.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

/** Textele pe care le scrie o tema (titluri, etichete, bannerul si elementele demo, mesajul barii). */
function texteleTemei(cheie: string): Set<string> {
  const t = temaDupaCheie(cheie)!;
  const a = amprenteleTemelor([t]);
  const s = new Set<string>();
  for (const v of a.texte.values()) for (const x of v) s.add(x);
  for (const b of a.bannere) s.add(b.titlu);
  for (const e of a.elemente) s.add(e.titlu);
  for (const m of a.mesaje) s.add(m);
  return s;
}

test("amprentele prind textele fiecarei teme, si pe ale lui Jupiter (care nu e facuta dupa reteta)", () => {
  const a = amprenteleTemelor();
  assert.ok((a.texte.get("category_nav.titlu")?.size ?? 0) >= 10);
  assert.ok((a.texte.get("placi_promo.titlu")?.size ?? 0) >= 15);
  // 13 la 11.11: celelalte isi pun textul demo in carduri, placi sau mozaic (prinse in `elemente`).
  assert.ok(a.bannere.length >= 10, `bannere: ${a.bannere.length}`);
  assert.ok(a.elemente.length >= 100, `elemente: ${a.elemente.length}`);
  assert.ok(texteleTemei("jupiter").size > 0);
  // Exact cazul din proba: ale Electrei.
  assert.ok(texteleTemei("electra").has("Alege camera"));
});

test("⚠⚠ tema noua peste oricare alta: din textele celei de dinainte nu ramane NIMIC (toate 30, pe rand)", () => {
  for (let i = 0; i < TEME.length; i++) {
    const a = TEME[i];
    const b = TEME[(i + 1) % TEME.length];
    const dupaA = a.design(ctx, a.date);
    const baza = faraTexteleTemelor(dupaA, { siTexteleTemei: true }).design;
    for (const cuDemo of [true, false]) {
      const dupaB = JSON.stringify(b.design(ctx, cuDemo ? b.date : null, baza));
      const aleLuiB = texteleTemei(b.cheie);
      for (const text of texteleTemei(a.cheie)) {
        if (aleLuiB.has(text) || text.length < 4) continue;
        assert.ok(!dupaB.includes(JSON.stringify(text)), `${a.cheie} -> ${b.cheie} (${cuDemo ? "cu" : "fara"} demo): a ramas „${text}”`);
      }
    }
  }
});

test("⚠⚠ ce a scris omul ramane: titlurile, placile si bannerul lui nu sunt ale niciunei teme", () => {
  const electra = temaDupaCheie("electra")!;
  const d = electra.design(ctx, electra.date);
  const alLui: StoreDesign = {
    ...d,
    home: d.home.map((s) => {
      if (s.kind === "category_nav") return { ...s, settings: { ...s.settings, titlu: "Raioanele mele" } };
      if (s.kind === "placi_promo") {
        const placi = Array.isArray(s.settings.placi) ? s.settings.placi : [];
        return { ...s, settings: { ...s.settings, placi: [...placi, { titlu: "Oferta mea", imagine: "https://cdn.exemplu.ro/a.webp", link: "/x" }] } };
      }
      if (s.kind === "hero") return { ...s, settings: { ...s.settings, titlu: "Bine ai venit la noi", imagine: "https://cdn.exemplu.ro/b.webp" } };
      return s;
    }),
  };
  const { design } = faraTexteleTemelor(alLui, { siTexteleTemei: true });
  const sir = JSON.stringify(design);
  for (const text of ["Raioanele mele", "Oferta mea", "Bine ai venit la noi"]) assert.ok(sir.includes(text), text);
  assert.ok(!sir.includes("Alege camera"));
});

test("fara `siTexteleTemei` („Șterge datele demo”), titlurile temei aplicate raman; pleaca doar ce e demo", () => {
  const electra = temaDupaCheie("electra")!;
  const d = electra.design(ctx, electra.date);
  const { design, schimbat } = faraTexteleTemelor(d, { siTexteleTemei: false });
  assert.equal(schimbat, true);
  assert.ok(JSON.stringify(design).includes("Alege camera"));
  const hero = design.home.find((s) => s.kind === "hero")!.settings;
  assert.equal(hero.titlu, "");
  // Un design fara nimic demo iese neschimbat, chiar acelasi obiect.
  const curat = electra.design(ctx, null);
  assert.equal(faraTexteleTemelor(curat, { siTexteleTemei: false }).design, curat);
});

test("datele demo din `page_content`: pleaca ale altor teme, raman ale temei pastrate si ale lui", () => {
  const pc: Record<string, unknown> = {
    hero_banners: ["https://cdn.exemplu.ro/al-lui.webp", "/teme/electra/poze/hero.webp", "/teme/jupiter/poze/hero.webp"],
    hero_banner_links: ["/magazin", "/magazin?cat=Canapele", "/magazin?cat=Scule"],
    product_sections: [
      { id: "r-al-lui", title: "Noutati" },
      { id: idRandDemo("electra", "noi"), title: "Noi" },
      { id: idRandDemo("jupiter", "top"), title: "Top" },
    ],
    [CHEIE_DATE_DEMO]: { tema: "electra", categorii: [], bannere: ["/teme/electra/poze/hero.webp"], randuri: [idRandDemo("electra", "noi")], la: "2026-11-11T00:00:00Z" },
    store_tagline: "al lui",
  };
  const patch = pcFaraDemoAlAltorTeme(pc, "jupiter");
  assert.deepEqual(patch.hero_banners, ["https://cdn.exemplu.ro/al-lui.webp", "/teme/jupiter/poze/hero.webp"]);
  // Linkurile pleaca pereche cu pozele lor, ca ale lui sa nu se mute.
  assert.deepEqual(patch.hero_banner_links, ["/magazin", "/magazin?cat=Scule"]);
  assert.deepEqual((patch.product_sections as { id: string }[]).map((r) => r.id), ["r-al-lui", idRandDemo("jupiter", "top")]);
  assert.equal(patch[CHEIE_DATE_DEMO], null, "urma altei teme iese");
  assert.ok(!("store_tagline" in patch), "doar cheile care se schimba");
  // `null` = ale niciunei teme: raman doar ale lui.
  const tot = pcFaraDemoAlAltorTeme(pc, null);
  assert.deepEqual(tot.hero_banners, ["https://cdn.exemplu.ro/al-lui.webp"]);
  assert.deepEqual((tot.product_sections as { id: string }[]).map((r) => r.id), ["r-al-lui"]);
  // Nimic demo: niciun patch.
  assert.deepEqual(pcFaraDemoAlAltorTeme({ hero_banners: ["https://cdn.exemplu.ro/a.webp"] }, null), {});
  assert.equal(temaBanneruluiDemo("/teme/maia/poze/hero.webp"), "maia");
  assert.equal(temaBanneruluiDemo("https://cdn.exemplu.ro/teme/maia/x.webp"), null);
  assert.equal(temaRanduluiDemo({ id: "demo-mercur-noi" }), "mercur");
  assert.equal(temaRanduluiDemo({ id: "randul-meu" }), null);
});

test("produsele demo de scos: ale altor teme; cu `null`, toate", () => {
  const p = [
    { id: "1", external_id: "electra:canapea" },
    { id: "2", external_id: "jupiter:bormasina" },
    { id: "3", external_id: null },
  ];
  assert.deepEqual(produseDemoDeScos(p, "jupiter"), ["1", "3"]);
  assert.deepEqual(produseDemoDeScos(p, null), ["1", "2", "3"]);
  // „jupiter” nu e prefixul lui „jupiter2”: codul are doua puncte dupa tema.
  assert.deepEqual(produseDemoDeScos([{ id: "4", external_id: "jupiterx:a" }], "jupiter"), ["4"]);
});

test("starea din versiune: scrisa intreaga, citita inapoi; o versiune veche (fara stare) e `undefined`", () => {
  const pc = {
    tema_aplicata: { cheie: "electra", la: "2026-11-11T08:00:00.000Z" },
    [CHEIE_DATE_DEMO]: { tema: "electra", categorii: ["c1"], bannere: ["/teme/electra/poze/hero.webp"], randuri: ["demo-electra-noi"], la: "2026-11-11T08:00:00.000Z" },
  };
  const stare = stareaMagazinului(pc);
  const inapoi = stareDinVersiune(JSON.parse(JSON.stringify({ pc: {}, magazin: {}, stare })));
  assert.deepEqual(inapoi, stare);
  assert.equal(stareDinVersiune({ pc: {}, magazin: {} }), undefined);
  assert.deepEqual(stareDinVersiune({ pc: {}, stare: { tema: null, demo: null } }), { tema: null, demo: null });
});

test("„Pune la loc” dupa reimport: randurile demo ale versiunii iau produsele de acum; ale lui raman", () => {
  const versiune = {
    pc: { product_sections: [{ id: "r-al-lui", productIds: ["a"] }, { id: "demo-electra-noi", productIds: ["vechi1"] }, { id: "demo-electra-sters", productIds: ["vechi2"] }] },
    magazin: {},
    stare: { tema: null, demo: null },
  };
  const acum = { product_sections: [{ id: "demo-electra-noi", productIds: ["nou1"] }] };
  const rez = continutCuRandurileDemoDeAcum(versiune, acum) as typeof versiune;
  assert.deepEqual(rez.pc.product_sections, [{ id: "r-al-lui", productIds: ["a"] }, { id: "demo-electra-noi", productIds: ["nou1"] }]);
  assert.deepEqual(rez.stare, versiune.stare);
});

test("limita: produsele demo ale celorlalte teme pleaca, deci nu mai ocupa loc", () => {
  const jupiter = temaDupaCheie("jupiter")!;
  const coduri = Array.from({ length: 15 }, (_, i) => `electra:p${i}`);
  // 500 de produse in plan, 495 in cont, din care 15 demo Electra: fara ele incap cele 10 ale lui Jupiter.
  const loc = loculDinContext({ limita: 500, produse: 495, coduri }, "jupiter", jupiter.date);
  assert.equal(loc.incap, true);
  assert.equal(loc.produse, 480);
  // Aceeasi tema, aplicata din nou: produsele ei nu pleaca si nu se numara de doua ori.
  const aceeasi = loculDinContext({ limita: 500, produse: 500, coduri: jupiter.date.produse.map((p) => `jupiter:${p.cheie}`) }, "jupiter", jupiter.date);
  assert.equal(aceeasi.noi, 0);
  assert.equal(aceeasi.incap, true);
});
