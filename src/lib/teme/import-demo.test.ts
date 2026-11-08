import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import sharp from "sharp";
import { DATE_DEMO_JUPITER } from "./jupiter/date-demo";
import { CHEI_SCRISE_DE_IMPORT } from "./golire-demo";
import { temaDupaCheie } from "./teme";
import { VARIANTE_MARI, VARIANTE_MICI, adresaVarianteiTemei } from "./variante-imagini";
import {
  bannereDupaImport, categoriiDeCreat, externalIdDemo, idRandDemo, importaDateleDemo, randuriDupaImport, sluguriUnice, urmaDateDemoDin, urmaDupaImport,
} from "./import-demo";
import type { SetDateDemo } from "./tipuri";

/*
 * Etapa 16.1: setul de date al temei Jupiter si importul lui. Raspunsul lui: „Adaugă, marcate demo”, deci nimic din
 * ce are magazinul nu se sterge si nu se suprascrie.
 */

const D = DATE_DEMO_JUPITER;
const toateCategoriile = D.categorii.flatMap((c) => [c.nume, ...c.copii]);

test("setul Jupiter: fiecare produs, banner, card si placa duce la o categorie care exista", () => {
  const nume = new Set(toateCategoriile);
  for (const p of D.produse) assert.ok(nume.has(p.categorie), `${p.cheie}: ${p.categorie}`);
  for (const x of [...D.bannere, ...D.carduri, ...D.placi]) assert.ok(nume.has(x.categorie), x.categorie);
});

test("setul Jupiter: chei, nume, poze si categorii unice, preturi cu sens, cele 12 raioane ale lui", () => {
  assert.equal(new Set(D.produse.map((p) => p.cheie)).size, D.produse.length, "chei unice");
  assert.equal(new Set(D.produse.map((p) => p.nume)).size, D.produse.length, "nume unice");
  assert.equal(new Set(D.produse.map((p) => p.imagine)).size, D.produse.length, "fiecare produs cu poza lui");
  assert.equal(new Set(toateCategoriile.map((n) => n.toLowerCase())).size, toateCategoriile.length, "categorii unice");
  for (const p of D.produse) {
    assert.ok(p.pret > 0, p.cheie);
    if (p.pretVechi !== undefined) assert.ok(p.pretVechi > p.pret, `${p.cheie}: reducerea e reala`);
    assert.ok(p.descriere.length > 20, p.cheie);
  }
  // Raioanele lui sunt 12, cate o poza pentru fiecare (etapa 20); produsele sunt cate a dat.
  assert.equal(D.categorii.length, 12);
  assert.ok(D.produse.length > 0);
});

/** Toate pozele setului (adresele relative din `public/`), cu felul lor (folderul). */
const pozeleSetului = [
  ...D.categorii.map((c) => c.imagine), ...D.produse.map((p) => p.imagine),
  ...D.bannere.map((b) => b.imagine), ...D.carduri.map((c) => c.imagine), ...D.placi.map((p) => p.imagine),
];

/** Fisierele dintr-un folder, cu subfolderele lui. */
function fisiere(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? fisiere(join(dir, n)) : [join(dir, n)]));
}

test("⚠ pozele setului: locale, din `public/teme/jupiter`, toate pe disc (o poza lipsa e o poza rupta in vitrina)", () => {
  for (const u of pozeleSetului) {
    assert.match(u, /^\/teme\/jupiter\/(bannere|categorii|placi|carduri|produse)\/[a-z0-9-]+\.webp$/, u);
    assert.ok(existsSync(join("public", u)), `lipseste de pe disc: public${u}`);
  }
  assert.match(temaDupaCheie("jupiter")!.siglaDemo, /^\/teme\/jupiter\/[a-z0-9-]+\.webp$/);
  assert.ok(existsSync(join("public", temaDupaCheie("jupiter")!.siglaDemo)), "sigla lipseste de pe disc");
});

test("⚠ pozele temei sunt mici (vitrina le descarca intregi: incarcatorul nu le redimensioneaza) si niciuna nu sta degeaba", () => {
  // Plafoanele sunt de vreo doua ori cat ies azi din `scripts/teme/imagini-jupiter.mjs`: o poza pusa nemicsorata le sare.
  const PLAFON_KB: Record<string, number> = { bannere: 220, categorii: 80, placi: 80, carduri: 60, produse: 120, ".": 15 };
  const folosite = new Set([...pozeleSetului, temaDupaCheie("jupiter")!.siglaDemo, String(temaDupaCheie("jupiter")!.setariDemo.favicon_url)]);
  const peDisc = fisiere(join("public", "teme", "jupiter"));
  assert.ok(peDisc.length > 0);
  for (const cale of peDisc) {
    const adresa = `/${relative("public", cale).split(sep).join("/")}`;
    // Variantele mici (`scripts/teme/variante-imagini.mjs`) nu le foloseste setul, ci loaderul, in locul originalului.
    if (/\.w\d+\.webp$/.test(adresa)) {
      const baza = adresa.replace(/\.w\d+\.webp$/, ".");
      const original = [...folosite].find((f) => f.startsWith(baza) && !/\.w\d+\.webp$/.test(f));
      assert.ok(original, `${adresa}: varianta unei poze nefolosite`);
      continue;
    }
    assert.ok(folosite.has(adresa), `${adresa}: pe disc, dar nefolosita de set`);
    const fel = dirname(relative(join("public", "teme", "jupiter"), cale)).split(sep)[0];
    const kb = statSync(cale).size / 1024;
    assert.ok(kb <= PLAFON_KB[fel], `${adresa}: ${kb.toFixed(0)} KB, peste ${PLAFON_KB[fel]} KB`);
  }
});

test("⚠ bannerele au raportul slotului (2,14:1, `HeroCuCarduri`): un alt raport s-ar taia, iar textul lor sta pe margini", async () => {
  assert.match(cod("src/components/storefront/sections/hero/HeroCuCarduri.tsx"), /slideClass="shrink-0 w-full snap-center aspect-\[2\.14\/1\] /);
  for (const b of D.bannere) {
    const m = await sharp(join("public", b.imagine)).metadata();
    assert.ok(Math.abs(m.width! / m.height! - 2.14) < 0.01, `${b.imagine}: ${m.width} x ${m.height}`);
    assert.ok(m.width! >= 1280, `${b.imagine}: prea mic pentru desktop`);
  }
  for (const p of D.produse) {
    const m = await sharp(join("public", p.imagine)).metadata();
    assert.equal(m.width, m.height, `${p.imagine}: cardul de produs e patrat`);
  }
});

test("randurile: „Oferte” are doar produse reduse, iar un produs nu apare in doua randuri", () => {
  const dupaCheie = new Map(D.produse.map((p) => [p.cheie, p]));
  for (const k of D.randuri.find((r) => r.cheie === "oferte")!.produse) assert.ok(dupaCheie.get(k)?.pretVechi, `${k}: in „Oferte”, fara reducere`);
  const toate = D.randuri.flatMap((r) => r.produse);
  assert.equal(new Set(toate).size, toate.length);
});

test("⚠ nimic de la Dedeman in setul demo: nici numele, nici adresele lor (comentariul spune doar de unde e inspiratia)", () => {
  assert.doesNotMatch(cod("src/lib/teme/jupiter/date-demo.ts"), /dedeman/i);
});

test("categoriile: se creeaza doar cele care lipsesc, intai primul nivel, si una de-a lui cu acelasi nume se refoloseste", () => {
  const produs = (cheie: string, categorie: string) => ({ ...D.produse[0], cheie, categorie, imagine: `${cheie}.webp` });
  const date: SetDateDemo = {
    ...D,
    categorii: [{ nume: "Grădină", imagine: "i", copii: ["Unelte de grădină", "Ghivece"] }, { nume: "Mobilă", imagine: "j", copii: ["Mese"] }],
    produse: [produs("foarfeca", "Unelte de grădină"), produs("grebla", "Unelte de grădină")],
  };
  const plan = categoriiDeCreat(["  grădină ", "Mese"], date);
  assert.deepEqual(plan, [
    { nume: "Mobilă", parinte: null, imagine: "j" },
    { nume: "Unelte de grădină", parinte: "Grădină", imagine: "foarfeca.webp" },
    { nume: "Ghivece", parinte: "Grădină", imagine: null },
  ], "subcategoria ia poza PRIMULUI ei produs; fara produse, fara poza");
  assert.equal(categoriiDeCreat(toateCategoriile, D).length, 0, "importul repetat nu mai creeaza nimic");
});

test("slugurile: ca la produsele adaugate de mana, baza si apoi -2, -3, fata de cele ocupate si intre ele", () => {
  assert.deepEqual(sluguriUnice(["Ciocan cu gheară", "Ciocan cu gheară", "Bec LED"], ["ciocan-cu-gheara"]), ["ciocan-cu-gheara-2", "ciocan-cu-gheara-3", "bec-led"]);
});

test("bannerele: ale lui raman primele si neatinse, cele demo se adauga o singura data, cu linkurile in pereche", () => {
  const pc = { hero_banners: ["a.jpg", "b.jpg"], hero_banner_links: ["/contact"] };
  const r = bannereDupaImport(pc, D, "/magazin");
  assert.deepEqual(r.imagini.slice(0, 2), ["a.jpg", "b.jpg"]);
  assert.deepEqual(r.linkuri.slice(0, 2), ["/contact", ""], "linkul lipsa al lui ramane gol, nu se muta");
  assert.equal(r.imagini.length, 2 + D.bannere.length);
  assert.equal(r.linkuri.length, r.imagini.length);
  assert.match(r.linkuri[2], /^\/magazin\?cat=/);
  const iar = bannereDupaImport({ hero_banners: r.imagini, hero_banner_links: r.linkuri }, D, "/magazin");
  assert.equal(iar.adaugate.length, 0, "importul repetat nu dubleaza bannerele");
});

test("urma: se aduna peste cea de dinainte, fara dubluri, iar codul produsului e „<tema>:<cheie>”", () => {
  const u = urmaDupaImport({ tema: "jupiter", categorii: ["c1"], bannere: ["x"] }, "jupiter", ["c1", "c2"], ["y"], ["r1"], "2026-10-28T20:00:00Z");
  assert.deepEqual(u, { tema: "jupiter", categorii: ["c1", "c2"], bannere: ["x", "y"], randuri: ["r1"], la: "2026-10-28T20:00:00Z" });
  assert.equal(externalIdDemo("jupiter", "roaba-85l"), "jupiter:roaba-85l");
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("⚠ importul nu trimite nimic spre marketplace-uri si nu sterge nimic", () => {
  const c = cod("src/lib/teme/import-demo.ts");
  assert.doesNotMatch(c, /enqueue|Sync\(|\.delete\(|\.upsert\(/);
  assert.match(c, /source: SURSA_DEMO,\s*external_id: externalIdDemo\(tema, p\.cheie\),/);
  assert.match(c, /await proiecteazaImediat\(businessId\);/);
});

test("randurile: produsele lor exista in set, iar ale lui raman primele si neatinse", () => {
  const chei = new Set(D.produse.map((p) => p.cheie));
  for (const r of D.randuri) for (const k of r.produse) assert.ok(chei.has(k), `${r.cheie}: ${k}`);

  const idDupaCheie = new Map(D.produse.map((p, i) => [p.cheie, `id${i}`]));
  const alLui = { id: "r_lui", title: "Noutăți", enabled: true, mode: "category", category: "X" };
  const r = randuriDupaImport({ product_sections: [alLui] }, D, "jupiter", idDupaCheie);
  assert.equal(r.randuri[0], alLui, "randul lui, acelasi obiect, primul");
  assert.deepEqual(r.adaugate, D.randuri.map((x) => idRandDemo("jupiter", x.cheie)));
  const oferte = r.randuri[1] as { mode: string; productIds: string[]; layout: string };
  assert.equal(oferte.mode, "selected");
  assert.equal(oferte.layout, "carousel");
  assert.equal(oferte.productIds.length, D.randuri[0].produse.length);
  for (const id of r.adaugate) assert.ok(id.length <= 64, "incape in legatura din design");

  const iar = randuriDupaImport({ product_sections: r.randuri }, D, "jupiter", idDupaCheie);
  assert.equal(iar.adaugate.length, 0, "importul repetat nu dubleaza randurile");
  assert.equal(randuriDupaImport({}, D, "jupiter", new Map()).adaugate.length, 0, "fara produse gasite, niciun rand gol");
});

test("urma din `page_content`: citita cu grija; lipsa, stricata sau stearsa = niciun import", () => {
  assert.equal(urmaDateDemoDin(null), null);
  assert.equal(urmaDateDemoDin({}), null);
  assert.equal(urmaDateDemoDin({ date_demo: "x" }), null);
  assert.equal(urmaDateDemoDin({ date_demo: [] }), null);
  assert.deepEqual(urmaDateDemoDin({ date_demo: { tema: "jupiter", categorii: ["c1", 7], bannere: "x" } }),
    { tema: "jupiter", categorii: ["c1"], bannere: [], randuri: [], la: "" });
});

/**
 * Baza falsa pentru `importaDateleDemo`: tine `page_content` ca o baza adevarata (scrierile se vad la citirile de dupa)
 * si jurnalul cererilor, in ordine. `cadeLa` = a cata inserare de categorii cade.
 */
function bazaImport(o: { categorii?: { id: string; name: string; sort_order: number }[]; cadeLa?: number } = {}) {
  let pc: Record<string, unknown> = { hero_banners: ["al-lui.jpg"] };
  const jurnal: { op: string; date?: unknown }[] = [];
  const produse: { id: string; external_id: string }[] = [];
  let inserariCategorii = 0;
  const client = {
    from(tabel: string) {
      let coloane = "";
      let scriere: { fel: "update" | "insert"; date: unknown } | null = null;
      const q = {
        select(c: string) { coloane = c; return q; },
        eq() { return q; },
        not() { return q; },
        like() { return q; },
        update(date: unknown) { scriere = { fel: "update", date }; return q; },
        insert(date: unknown) { scriere = { fel: "insert", date }; return q; },
        single() {
          jurnal.push({ op: `citeste ${tabel}` });
          return Promise.resolve({ data: { page_content: pc }, error: null });
        },
        then(ok: (v: unknown) => unknown, nu?: (e: unknown) => unknown) {
          let v: unknown = { data: [], error: null };
          if (scriere) {
            jurnal.push({ op: `${scriere.fel} ${tabel}`, date: scriere.date });
            if (tabel === "store_settings") pc = (scriere.date as { page_content: Record<string, unknown> }).page_content;
            if (tabel === "categories" && ++inserariCategorii === o.cadeLa) v = { error: { message: "cazut" } };
            else if (tabel === "products") {
              for (const r of scriere.date as { external_id: string }[]) produse.push({ id: `p${produse.length}`, external_id: r.external_id });
              v = { error: null };
            } else v = { error: null };
          } else {
            jurnal.push({ op: `citeste ${tabel}.${coloane}` });
            if (tabel === "categories") v = { data: o.categorii ?? [], error: null };
            else if (tabel === "products" && coloane === "id, external_id") v = { data: produse, error: null };
          }
          return Promise.resolve(v).then(ok, nu);
        },
      };
      return q;
    },
  };
  return { client, jurnal, pc: () => pc };
}

test("⚠⚠ 18.3: categoriile intra in urma INAINTE de scriere, cu id-urile cu care se scriu; subcategoriile, sub parintii lor", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; // proiectia de la sfarsit nu are voie sa iasa din proba
  const b = bazaImport({ categorii: [{ id: "lui", name: "Grădină", sort_order: 3 }] });
  const r = await importaDateleDemo(b.client as never, "m1", "jupiter", D, "/magazin");
  const prima = b.jurnal.findIndex((x) => x.op === "update store_settings");
  const inserari = b.jurnal.filter((x) => x.op === "insert categories");
  assert.ok(prima >= 0 && prima < b.jurnal.findIndex((x) => x.op === "insert categories"), "urma inaintea primei categorii");
  const urma = (b.jurnal[prima].date as { page_content: { date_demo: { categorii: string[] } } }).page_content.date_demo;
  const scrise = inserari.flatMap((x) => x.date as { id: string; name: string; parent_id: string | null }[]);
  assert.deepEqual([...urma.categorii].sort(), scrise.map((c) => c.id).sort(), "exact id-urile scrise, toate");
  assert.equal(r.categorii, scrise.length);
  assert.ok(!scrise.some((c) => c.name === "Grădină"), "a lui, cu acelasi nume, nu se creeaza");
  const dupaId = new Map(scrise.map((c) => [c.id, c]));
  for (const c of scrise.filter((x) => x.parent_id)) {
    assert.ok(dupaId.has(c.parent_id!) || c.parent_id === "lui", `${c.name}: sub un parinte creat acum sau al lui`);
  }
  // La sfarsit, urma le are inca, langa bannerele si randurile adaugate; bannerul lui ramane primul.
  const fin = b.pc() as { hero_banners: string[]; date_demo: { categorii: string[]; bannere: string[]; randuri: string[] } };
  assert.deepEqual([...fin.date_demo.categorii].sort(), [...urma.categorii].sort());
  assert.equal(fin.date_demo.bannere.length, D.bannere.length);
  assert.equal(fin.hero_banners[0], "al-lui.jpg");
});

test("⚠ golirea magazinului demo (etapa 20) scoate tot ce scrie importul in `page_content`: o cheie noua ar ramane", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const b = bazaImport();
  const inainte = { ...b.pc() };
  await importaDateleDemo(b.client as never, "m1", "jupiter", D, "/magazin");
  const dupa = b.pc();
  const schimbate = Object.keys(dupa).filter((k) => JSON.stringify(dupa[k]) !== JSON.stringify(inainte[k]));
  assert.ok(schimbate.length >= 3, schimbate.join());
  for (const k of schimbate) assert.ok((CHEI_SCRISE_DE_IMPORT as readonly string[]).includes(k), `${k}: scrisa de import, lasata de golire`);
});

test("⚠⚠ o cadere la subcategorii lasa urma cu toate id-urile alese: „Șterge datele demo” gaseste ce s-a apucat de scris", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const b = bazaImport({ cadeLa: 2 });
  await assert.rejects(importaDateleDemo(b.client as never, "m1", "jupiter", D, "/magazin"), /categorii noi: cazut/);
  const urma = urmaDateDemoDin(b.pc());
  const primul = (b.jurnal.find((x) => x.op === "insert categories")!.date as { id: string }[]).map((c) => c.id);
  assert.ok(primul.length > 0 && primul.every((id) => urma!.categorii.includes(id)), "primul nivel, scris, e in urma");
  assert.equal(urma!.categorii.length, categoriiDeCreat([], D).length, "si subcategoriile alese, chiar daca nescrise");
  assert.ok(!b.jurnal.some((x) => x.op === "insert products"), "dupa cadere, nimic altceva");
});

test("⚠ fiecare poza din `public/teme` are variantele pe care le cere loaderul (altfel poza iese rupta)", () => {
  const poze = fisiere(join("public", "teme")).filter((f) => /\.(webp|png|jpe?g)$/i.test(f) && !/\.w\d+\.webp$/.test(f));
  assert.ok(poze.length > 700);
  for (const cale of poze) {
    const adresa = `/${relative("public", cale).split(sep).join("/")}`;
    for (const w of [...VARIANTE_MICI, ...(VARIANTE_MARI[adresa] ?? [])]) {
      const varianta = adresaVarianteiTemei(adresa, w)!;
      assert.ok(existsSync(join("public", varianta)), `${varianta} lipseste: ruleaza scripts/teme/variante-imagini.mjs`);
    }
  }
  // Regula loaderului: cea mai mica varianta care acopera latimea; peste ultima, poza intreaga.
  assert.equal(adresaVarianteiTemei("/teme/x/a.webp", 300), "/teme/x/a.w384.webp");
  assert.equal(adresaVarianteiTemei("/teme/x/a.webp", 640), "/teme/x/a.webp", "o poza mica n-are varianta de 640");
  assert.equal(adresaVarianteiTemei("/products/a.webp", 300), null, "doar pozele temelor");
});
