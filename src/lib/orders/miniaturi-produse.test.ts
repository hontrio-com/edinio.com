import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { idsProduseDinLinii, miniaturileProduselor, pozaLiniei, primaPoza } from "./miniaturi-produse";

/*
 * Miniaturile din „Produse comandate” (pagina comenzii, in panou). Liniile comenzii nu poarta imaginea,
 * deci poza vine din catalog, dupa regula contului de client: prima poza, numai cand e un sir.
 */

const A = "0b7a6f52-3c1d-4e8f-9a2b-1c3d5e7f9a0b";
const B = "1c8b7063-4d2e-4f90-8b3c-2d4e6f8a0b1c";

describe("id-urile din liniile comenzii", () => {
  test("numai UUID-urile, fara dubluri, cu litere mici", () => {
    const linii = [
      { product_id: A, name: "Inel", quantity: 1 },
      { product_id: A.toUpperCase(), name: "Inel, a doua linie", quantity: 2 },
      { product_id: B, name: "Cercei" },
      /* ⚠ Un singur ne-UUID in `.in()` face PostgREST sa refuze TOT raspunsul (22P02). */
      { product_id: "extra_ambalaj", name: "Ambalaj cadou" },
      { product_id: "12345", name: "Linie veche" },
      { product_id: 42 },
      { name: "Fara id" },
      null,
      "sir",
    ];
    assert.deepEqual(idsProduseDinLinii(linii), [A, B]);
  });

  test("orice nu e lista da lista goala", () => {
    for (const v of [null, undefined, {}, "x", 7]) assert.deepEqual(idsProduseDinLinii(v), []);
  });
});

describe("prima poza", () => {
  test("ca in contul clientului: `images[0]`, numai cand e un sir nevid", () => {
    assert.equal(primaPoza(["https://img.edinio-cdn.com/products/a.webp", "https://x/b.webp"]), "https://img.edinio-cdn.com/products/a.webp");
    assert.equal(primaPoza([" https://x/a.webp "]), "https://x/a.webp");
    assert.equal(primaPoza([{ url: "https://x/a.webp" }]), null, "un obiect nu e poza, nici in cont");
    assert.equal(primaPoza(["", "https://x/b.webp"]), null, "a doua poza nu urca in locul primei");
    assert.equal(primaPoza([]), null);
    assert.equal(primaPoza(null), null);
    assert.equal(primaPoza("https://x/a.webp"), null);
  });

  test("linia isi gaseste poza dupa id, oricum ar fi scris", () => {
    const harta = { [A]: "https://x/a.webp" };
    assert.equal(pozaLiniei(harta, A), "https://x/a.webp");
    assert.equal(pozaLiniei(harta, A.toUpperCase()), "https://x/a.webp");
    assert.equal(pozaLiniei(harta, B), null);
    assert.equal(pozaLiniei(harta, "extra_ambalaj"), null);
    assert.equal(pozaLiniei(harta, undefined), null);
  });
});

/** Un client care raspunde din `produse` si tine minte ce i s-a cerut. */
function clientFals(produse: { id: string; business_id: string; images: unknown }[], opt: { cadeLaFelia?: number; arunca?: boolean } = {}) {
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
          const data = produse.filter((p) => p.business_id === c.magazin && ids.includes(p.id)).map(({ id, images }) => ({ id, images }));
          return Promise.resolve({ data, error: null });
        },
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, cereri };
}

describe("citirea din catalog", () => {
  const MAGAZIN = "ccdbd9cc-580e-4d3d-9860-13cde8a633af";

  test("cere numai produsele magazinului si da harta id -> poza", async () => {
    const { client, cereri } = clientFals([
      { id: A, business_id: MAGAZIN, images: ["https://x/a.webp"] },
      { id: B, business_id: "alt-magazin", images: ["https://x/strain.webp"] },
    ]);
    const harta = await miniaturileProduselor(client, MAGAZIN, [{ product_id: A }, { product_id: B }, { product_id: "extra_x" }]);
    assert.deepEqual(harta, { [A]: "https://x/a.webp" });
    assert.equal(cereri.length, 1);
    assert.equal(cereri[0].tabel, "products");
    assert.equal(cereri[0].coloane, "id, images");
    assert.equal(cereri[0].magazin, MAGAZIN, "fara filtrul pe magazin, interogarea s-ar bizui doar pe RLS");
    assert.deepEqual(cereri[0].ids, [A, B]);
  });

  test("fara linii de catalog nu se intreaba baza deloc", async () => {
    const { client, cereri } = clientFals([]);
    assert.deepEqual(await miniaturileProduselor(client, MAGAZIN, [{ product_id: "extra_x" }]), {});
    assert.equal(cereri.length, 0);
  });

  test("⚠ id-urile pleaca in felii de cate o suta: lista sta in ADRESA cererii", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const { client, cereri } = clientFals(ids.map((id) => ({ id, business_id: MAGAZIN, images: [`https://x/${id}.webp`] })));
    const harta = await miniaturileProduselor(client, MAGAZIN, ids.map((product_id) => ({ product_id })));
    assert.deepEqual(cereri.map((c) => c.ids.length), [100, 100, 30]);
    assert.equal(Object.keys(harta).length, 230);
  });

  test("⚠ o felie picata nu le strica pe celelalte, iar o cadere intreaga da harta goala, nu o pagina cazuta", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const produse = ids.map((id) => ({ id, business_id: MAGAZIN, images: [`https://x/${id}.webp`] }));
    const linii = ids.map((product_id) => ({ product_id }));
    const eroare = console.error;
    console.error = () => {};
    try {
      const { client } = clientFals(produse, { cadeLaFelia: 0 });
      assert.equal(Object.keys(await miniaturileProduselor(client, MAGAZIN, linii)).length, 50);
      const { client: cazut } = clientFals(produse, { arunca: true });
      assert.deepEqual(await miniaturileProduselor(cazut, MAGAZIN, linii), {});
    } finally {
      console.error = eroare;
    }
  });
});

describe("cablarea", () => {
  const viu = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  test("pagina comenzii cere miniaturile odata cu restul si le da ecranului", () => {
    const s = viu("src/app/(dashboard)/dashboard/orders/[orderId]/page.tsx");
    assert.match(s, /const \[\{ data: biz \}, \{ data: settings \}, miniaturi\] = await Promise\.all\(\[/);
    assert.match(s, /miniaturileProduselor\(supabase, order\.business_id, order\.items\),\s*\]\);/);
    assert.match(s, /miniaturi=\{miniaturi\}/);
  });

  test("„Produse comandate” arata poza liniei, cu pictograma doar cand poza lipseste", () => {
    const s = viu("src/components/dashboard/OrderDetailClient.tsx");
    const i = s.indexOf("Produse comandate");
    assert.notEqual(i, -1);
    const card = s.slice(i, i + 2500);
    assert.match(card, /const poza = pozaLiniei\(miniaturi, item\.product_id\);/);
    assert.match(card, /<MiniaturaProdus poza=\{poza\} \/>/);
    /* ⚠ Poza de catalog trece prin optimizator NUMAI din componenta ei: fisierele de personalizare
       din pagina comenzii raman `<img>` pe ruta cu sesiune (`panou-fisiere.test.ts`). */
    assert.doesNotMatch(s, /from "next\/image"/);
    const m = viu("src/components/dashboard/MiniaturaProdus.tsx");
    assert.match(m, /if \(!poza\) \{\s*return \(\s*<span className="grid h-10 w-10[^"]*">\s*<Package /);
    assert.match(m, /<Image src=\{poza\} alt="" width=\{40\} height=\{40\}/);
  });
});
