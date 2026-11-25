import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { legaturaLiniei, legaturiDinSluguri, sluguriProduselor } from "./legaturi-produse";

/*
 * Legaturile din „Produse comandate” (pagina comenzii, in panou): numele produsului duce la pagina
 * lui din magazin. Linia comenzii poarta doar `product_id`, deci adresa vine din catalogul de azi.
 */

const A = "0b7a6f52-3c1d-4e8f-9a2b-1c3d5e7f9a0b";
const B = "1c8b7063-4d2e-4f90-8b3c-2d4e6f8a0b1c";
const C = "2d9c8174-5e3f-4a01-9c4d-3e5f7a9b1c2d";
const MAGAZIN = "ccdbd9cc-580e-4d3d-9860-13cde8a633af";

describe("adresa din slug", () => {
  test("radacina magazinului + prefixul de produse + slugul", () => {
    assert.deepEqual(
      legaturiDinSluguri({ [A]: "vaza-din-sticla", [B]: "ceas-de-perete" }, "https://magazin.ro/produs"),
      { [A]: "https://magazin.ro/produs/vaza-din-sticla", [B]: "https://magazin.ro/produs/ceas-de-perete" },
    );
  });

  test("bara de la capatul radacinii nu se dubleaza, iar slugul se codeaza ca segment", () => {
    assert.deepEqual(
      legaturiDinSluguri({ [A]: "perna 45x45/gri" }, "https://www.edinio.com/casa-lumen/product/"),
      { [A]: "https://www.edinio.com/casa-lumen/product/perna%2045x45%2Fgri" },
    );
  });

  test("fara radacina sau fara slug nu iese nicio legatura", () => {
    assert.deepEqual(legaturiDinSluguri({ [A]: "x" }, ""), {});
    assert.deepEqual(legaturiDinSluguri({ [A]: "" }, "https://magazin.ro/product"), {});
  });

  test("linia isi gaseste legatura dupa id, oricum ar fi scris; restul liniilor n-au", () => {
    const harta = { [A]: "https://magazin.ro/product/vaza" };
    assert.equal(legaturaLiniei(harta, A), "https://magazin.ro/product/vaza");
    assert.equal(legaturaLiniei(harta, A.toUpperCase()), "https://magazin.ro/product/vaza");
    assert.equal(legaturaLiniei(harta, B), null);
    /* Extraoptiunile si liniile de marketplace nelegate de catalog raman text. */
    assert.equal(legaturaLiniei(harta, "extra_ambalaj"), null);
    assert.equal(legaturaLiniei(harta, undefined), null);
  });
});

/** Un client care raspunde din `produse` si tine minte ce i s-a cerut. */
function clientFals(
  produse: { id: string; business_id: string; slug: unknown; is_active: unknown }[],
  opt: { cadeLaFelia?: number; arunca?: boolean } = {},
) {
  const cereri: { tabel: string; coloane: string; magazin: unknown; ids: string[] }[] = [];
  const client = {
    from(tabel: string) {
      const c = { tabel, coloane: "", magazin: undefined as unknown, ids: [] as string[] };
      const b = {
        select(coloane: string) { c.coloane = coloane; return b; },
        eq(col: string, v: unknown) { if (col === "business_id") c.magazin = v; return b; },
        in(col: string, ids: string[]) {
          assert.equal(col, "id");
          c.ids = ids;
          cereri.push(c);
          if (opt.arunca) return Promise.reject(new Error("retea"));
          if (opt.cadeLaFelia === cereri.length - 1) return Promise.resolve({ data: null, error: { message: "22P02" } });
          const data = produse
            .filter((p) => p.business_id === c.magazin && ids.includes(p.id))
            .map(({ id, slug, is_active }) => ({ id, slug, is_active }));
          return Promise.resolve({ data, error: null });
        },
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, cereri };
}

describe("citirea slugurilor din catalog", () => {
  test("numai produsele ACTIVE ale magazinului, cu slug", async () => {
    const { client, cereri } = clientFals([
      { id: A, business_id: MAGAZIN, slug: "vaza", is_active: true },
      /* ⚠ Pagina publica a unui produs dezactivat raspunde „negasit": legatura ar fi moarta. */
      { id: B, business_id: MAGAZIN, slug: "ceas", is_active: false },
      { id: C, business_id: "alt-magazin", slug: "strain", is_active: true },
    ]);
    const harta = await sluguriProduselor(client, MAGAZIN, [{ product_id: A }, { product_id: B }, { product_id: C }, { product_id: "extra_x" }]);
    assert.deepEqual(harta, { [A]: "vaza" });
    assert.equal(cereri.length, 1);
    assert.equal(cereri[0].tabel, "products");
    assert.equal(cereri[0].coloane, "id, slug, is_active");
    assert.equal(cereri[0].magazin, MAGAZIN, "fara filtrul pe magazin, interogarea s-ar bizui doar pe RLS");
    assert.deepEqual(cereri[0].ids, [A, B, C]);
  });

  test("⚠ un produs fara steag de activ sau fara slug nu primeste legatura", async () => {
    const { client } = clientFals([
      { id: A, business_id: MAGAZIN, slug: "vaza", is_active: null },
      { id: B, business_id: MAGAZIN, slug: "  ", is_active: true },
      { id: C, business_id: MAGAZIN, slug: 42, is_active: true },
    ]);
    assert.deepEqual(await sluguriProduselor(client, MAGAZIN, [{ product_id: A }, { product_id: B }, { product_id: C }]), {});
  });

  test("fara linii de catalog nu se intreaba baza deloc", async () => {
    const { client, cereri } = clientFals([]);
    assert.deepEqual(await sluguriProduselor(client, MAGAZIN, [{ product_id: "extra_x" }]), {});
    assert.equal(cereri.length, 0);
  });

  test("⚠ id-urile pleaca in felii de cate o suta: lista sta in ADRESA cererii", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const { client, cereri } = clientFals(ids.map((id) => ({ id, business_id: MAGAZIN, slug: `p-${id}`, is_active: true })));
    const harta = await sluguriProduselor(client, MAGAZIN, ids.map((product_id) => ({ product_id })));
    assert.deepEqual(cereri.map((c) => c.ids.length), [100, 100, 30]);
    assert.equal(Object.keys(harta).length, 230);
  });

  test("⚠ o felie picata nu le strica pe celelalte, iar o cadere intreaga da harta goala, nu o pagina cazuta", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const produse = ids.map((id) => ({ id, business_id: MAGAZIN, slug: `p-${id}`, is_active: true }));
    const linii = ids.map((product_id) => ({ product_id }));
    const eroare = console.error;
    console.error = () => {};
    try {
      const { client } = clientFals(produse, { cadeLaFelia: 0 });
      assert.equal(Object.keys(await sluguriProduselor(client, MAGAZIN, linii)).length, 50);
      const { client: cazut } = clientFals(produse, { arunca: true });
      assert.deepEqual(await sluguriProduselor(cazut, MAGAZIN, linii), {});
    } finally {
      console.error = eroare;
    }
  });
});

describe("pagina comenzii", () => {
  const viu = (cale: string) => readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("serverul compune legaturile din radacina magazinului si din prefixul lui de produse", () => {
    const s = viu("src/app/(dashboard)/dashboard/orders/[orderId]/page.tsx");
    assert.match(s, /sluguriProduselor\(supabase, order\.business_id, order\.items\)/);
    assert.match(s, /legaturiDinSluguri\(/);
    assert.match(s, /storeBaseUrl\(/, "radacina nu mai tine cont de domeniul propriu");
    assert.match(s, /permalinkuriDin\(/, "prefixul de produse nu mai e cel ales de magazin");
    assert.match(s, /legaturiProduse=\{legaturiProduse\}/);
  });

  test("numele produsului e legatura, in fila noua, doar cand produsul are pagina", () => {
    const s = viu("src/components/dashboard/OrderDetailClient.tsx");
    const i = s.indexOf("Produse comandate");
    assert.notEqual(i, -1);
    const card = s.slice(i, i + 3000);
    assert.match(card, /const legatura = legaturaLiniei\(legaturiProduse, item\.product_id\);/);
    assert.match(card, /\{legatura \? \(\s*<a href=\{legatura\} target="_blank" rel="noopener noreferrer"/);
    /* Fara legatura, numele ramane text: o extraoptiune sau un produs sters n-au unde duce. */
    assert.match(card, /\) : \(\s*<span className="[^"]*">\{item\.name\}<\/span>/);
  });
});
