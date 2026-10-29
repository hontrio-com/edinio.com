import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CHEI_SCRISE_DE_IMPORT, continutFaraImport, golesteMagazinulDemo } from "./golire-demo";
import { SURSA_DEMO } from "./produse-demo";

/*
 * Etapa 20: scriptul magazinului demo scoate INTAI setul vechi, apoi il pune pe cel nou (importul doar adauga, deci
 * altfel produsele vechi ramaneau langa cele noi, iar categoriile cu acelasi nume, cu pozele vechi). Golirea merge doar
 * pe magazinul demo al unei teme si doar cat n-are niciun produs care sa nu fie demo.
 */

interface Op {
  op: "citeste" | "numara" | "sterge" | "scrie";
  tabel: string;
  filtre: string[];
  date?: unknown;
}

/** Baza falsa: jurnalul cererilor, in ordine, cu filtrele lor. */
function baza(o: { slug?: string; straine?: number; eSetari?: boolean; eNumarare?: boolean; pc?: Record<string, unknown> } = {}) {
  const jurnal: Op[] = [];
  const client = {
    from(tabel: string) {
      const op: Op = { op: "citeste", tabel, filtre: [] };
      const q = {
        select(_c: string, opt?: { head?: boolean }) { if (opt?.head) op.op = "numara"; return q; },
        eq(c: string, v: unknown) { op.filtre.push(`${c}=${String(v)}`); return q; },
        or(f: string) { op.filtre.push(`or(${f})`); return q; },
        delete() { op.op = "sterge"; return q; },
        update(date: unknown) { op.op = "scrie"; op.date = date; return q; },
        single() {
          jurnal.push(op);
          if (tabel === "businesses") return Promise.resolve({ data: { slug: o.slug ?? "tema-jupiter" }, error: null });
          if (o.eSetari) return Promise.resolve({ data: null, error: { message: "cazut" } });
          return Promise.resolve({ data: { page_content: o.pc ?? {} }, error: null });
        },
        then(ok: (v: unknown) => unknown, nu?: (e: unknown) => unknown) {
          jurnal.push(op);
          let v: unknown = { error: null };
          if (op.op === "numara") v = o.eNumarare ? { count: null, error: { message: "cazut" } } : { count: o.straine ?? 0, error: null };
          if (op.op === "sterge") v = { count: tabel === "products" ? 58 : 39, error: null };
          return Promise.resolve(v).then(ok, nu);
        },
      };
      return q;
    },
  };
  const scrieri = () => jurnal.filter((x) => x.op === "sterge" || x.op === "scrie");
  return { client: client as never, jurnal, scrieri };
}

const PC = {
  hero_banners: ["https://images.unsplash.com/a"], hero_banner_links: ["/magazin?cat=x"],
  product_sections: [{ id: "demo-jupiter-oferte" }], date_demo: { tema: "jupiter", categorii: ["c1"] },
  magazin_demo: true, show_category_badges: false, fundal: "#FFFFFF", menu: [{ id: "m1" }],
};

test("⚠⚠ golirea: intai produsele demo, apoi categoriile, apoi `page_content` fara ce a scris importul; restul ramane", async () => {
  const b = baza({ pc: PC });
  assert.deepEqual(await golesteMagazinulDemo(b.client, "m1"), { produse: 58, categorii: 39 });
  assert.deepEqual(b.jurnal.map((x) => `${x.op} ${x.tabel}`), [
    "citeste businesses", "numara products", "citeste store_settings", "sterge products", "sterge categories", "scrie store_settings",
  ]);
  const [, numara, , produse, categorii, scrie] = b.jurnal;
  assert.deepEqual(numara.filtre, ["business_id=m1", `or(source.is.null,source.neq.${SURSA_DEMO})`], "se numara si produsele fara sursa");
  assert.deepEqual(produse.filtre, ["business_id=m1", `source=${SURSA_DEMO}`], "doar produsele demo, doar ale magazinului");
  assert.deepEqual(categorii.filtre, ["business_id=m1"]);
  assert.deepEqual(scrie.filtre, ["business_id=m1"]);
  assert.deepEqual((scrie.date as { page_content: unknown }).page_content, {
    magazin_demo: true, show_category_badges: false, fundal: "#FFFFFF", menu: [{ id: "m1" }],
  }, "semnul demo, identitatea si meniul raman");
});

test("⚠⚠ refuza fara sa stearga nimic: alt magazin decat al unei teme, un produs care nu e demo, numaratoare sau setari necitite", async () => {
  const cazuri: [Parameters<typeof baza>[0], RegExp][] = [
    [{ slug: "floraria-mea", pc: PC }, /„floraria-mea” nu e magazinul demo al unei teme/],
    [{ straine: 1, pc: PC }, /are 1 produse care nu sunt demo/],
    [{ eNumarare: true, pc: PC }, /produse: cazut/],
    [{ eSetari: true }, /setari: cazut/],
  ];
  for (const [o, mesaj] of cazuri) {
    const b = baza(o);
    await assert.rejects(golesteMagazinulDemo(b.client, "m1"), mesaj);
    assert.deepEqual(b.scrieri(), [], String(mesaj));
  }
});

test("continutFaraImport: scoate doar cheile importului, fara sa schimbe obiectul primit", () => {
  const pc = { ...PC };
  assert.deepEqual(Object.keys(continutFaraImport(pc)), ["magazin_demo", "show_category_badges", "fundal", "menu"]);
  assert.deepEqual(pc, PC);
  assert.deepEqual([...CHEI_SCRISE_DE_IMPORT], ["hero_banners", "hero_banner_links", "product_sections", "date_demo"]);
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("scriptul magazinului demo: goleste INAINTEA importului si pune sigla temei", () => {
  const s = cod("scripts/teme/seamana-demo.ts");
  const golire = s.indexOf("const golit = await golesteMagazinulDemo(admin, magazin.id);");
  const importul = s.indexOf("await importaDateleDemo(admin, magazin.id, tema.cheie, tema.date, \"/magazin\");");
  assert.ok(golire > 0 && importul > golire, "golirea inaintea importului");
  assert.match(s, /\.update\(\{ \.\.\.magazinCuIdentitatea\(tema\.identitate\), logo_url: tema\.siglaDemo \}\)\.eq\("id", magazin\.id\);/);
  // Golirea e doar in script: importul si actiunile panoului nu golesc nimic.
  for (const f of ["src/lib/teme/import-demo.ts", "src/lib/actions/store-design.actions.ts"]) assert.doesNotMatch(cod(f), /golesteMagazinulDemo/, f);
});
