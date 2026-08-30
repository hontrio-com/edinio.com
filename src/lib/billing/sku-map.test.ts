import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchSkuMap } from "./sku-map";

/**
 * Interogarea codurilor de articol. Pana acum `error` nu era citit niciodata —
 * doar un `try/catch` care nu se declanseaza, fiindca `supabase-js` nu arunca:
 * pune eroarea in `error` si lasa `data` null. Orice cadere trecea drept
 * „produsele n-au SKU-uri".
 */

type Raspuns = { data: { id: string; sku: string | null }[] | null; error: { message: string } | null };

/** Client fals, care tine minte ce a fost intrebat. */
function client(raspuns: Raspuns) {
  const intrebari: { businessId?: string; ids?: string[] } = {};
  const supabase = {
    from: () => ({
      select: () => ({
        eq: (_c: string, businessId: string) => {
          intrebari.businessId = businessId;
          return { in: (_col: string, ids: string[]) => { intrebari.ids = ids; return Promise.resolve(raspuns); } };
        },
      }),
    }),
  };
  return { supabase: supabase as never, intrebari };
}

const PRODUS = "8b6071e3-a94f-4ad2-93b6-cc3acfbaaabf";
const EXTRA = "extra_ext_1781723399523";

test("interogarea cazuta se VEDE, si nu trece drept lipsa de SKU-uri", async () => {
  const { supabase } = client({ data: null, error: { message: "invalid input syntax for type uuid" } });
  const avertismente: string[] = [];
  const skus = await fetchSkuMap(supabase, "biz", [{ product_id: PRODUS }], (m) => avertismente.push(m.message));

  assert.equal(skus.size, 0);
  assert.deepEqual(avertismente, ["invalid input syntax for type uuid"],
    "caderea se vede; un produs fara SKU completat NU produce avertisment, ar fi zgomot");
});

test("extraoptiunea nu mai ajunge in interogare, deci nu o mai poate darama", async () => {
  const { supabase, intrebari } = client({ data: [{ id: PRODUS, sku: "SNI-001" }], error: null });
  const skus = await fetchSkuMap(supabase, "biz", [{ product_id: PRODUS }, { product_id: EXTRA }]);

  assert.deepEqual(intrebari.ids, [PRODUS], "doar uuid-uri pleaca spre baza");
  assert.equal(skus.get(PRODUS), "SNI-001");
});

test("interogarea e legata de magazin, nu se sprijina doar pe politici", async () => {
  const { supabase, intrebari } = client({ data: [], error: null });
  await fetchSkuMap(supabase, "biz-7", [{ product_id: PRODUS }]);
  assert.equal(intrebari.businessId, "biz-7");
});

test("fara id-uri de cautat, baza nici nu e atinsa", async () => {
  const catastrofa = { from: () => { throw new Error("nu trebuia sa intrebi nimic"); } };
  const skus = await fetchSkuMap(catastrofa as never, "biz", [{ product_id: EXTRA }, { product_id: null }]);
  assert.equal(skus.size, 0);
});

test("produsul fara SKU completat nu intra in harta", async () => {
  const avertismente: string[] = [];
  const { supabase } = client({ data: [{ id: PRODUS, sku: null }], error: null });
  const skus = await fetchSkuMap(supabase, "biz", [{ product_id: PRODUS }], (m) => avertismente.push(m.message));
  assert.equal(skus.size, 0);
  assert.deepEqual(avertismente, [], "sunt magazine intregi fara SKU-uri: nu e o anomalie");
});
