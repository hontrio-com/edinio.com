import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { includeToateActive, PAGINA, PE_TRECERE } from "./includere-in-masa";

const BID = "11111111-1111-1111-1111-111111111111";
const ACUM = "2026-09-08T10:00:00.000Z";

/* ══════════════════════════════════════════════════════════════════════════
   O BAZA FALSA CARE CHIAR SE PLIMBA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Schela din `feed.test.ts` nu se putea folosi aici: acolo `limit` e no-op si `.gt` nu
   exista deloc, deci o proba scrisa pe ea ar fi fost verde SI peste codul de azi, SI peste
   cel de maine. Asta implementeaza `order`, `limit`, `gt` SI `range`, ca sa poata deosebi
   plimbarea pe cheie de cea pe offset. Fara `range`, mutantul „inapoi la offset" n-ar putea
   fi pus, iar proba ar apara o regula pe care nimeni n-o poate incalca.
*/
function faceBaza(opt: {
  produse: string[];
  /** Chemata dupa fiecare citire, ca sa se poata simula un import care ruleaza in acelasi timp. */
  laCitire?: (produse: string[], aCata: number) => void;
  scriereaCade?: boolean;
}) {
  const produse = [...opt.produse].sort();
  const scrise: Record<string, unknown>[] = [];
  let citiri = 0;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (tabela: string) => {
    let dupa: string | null = null;
    let cate: number | null = null;
    let interval: [number, number] | null = null;
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: (n: number) => { cate = n; return b; },
      gt: (_k: string, v: string) => { dupa = v; return b; },
      range: (a: number, c: number) => { interval = [a, c]; return b; },
      upsert: (randuri: Record<string, unknown>[]) => {
        if (opt.scriereaCade) return Promise.resolve({ error: { message: "scrierea a cazut" } });
        scrise.push(...randuri);
        return Promise.resolve({ error: null });
      },
      then: (bun: (v: unknown) => unknown, rau?: (e: unknown) => unknown) => {
        if (tabela !== "products") return Promise.resolve({ data: [], error: null }).then(bun, rau);
        let r = produse;
        if (dupa !== null) r = r.filter((id) => id > (dupa as string));
        if (interval) r = r.slice(interval[0], interval[1] + 1);
        if (cate !== null) r = r.slice(0, cate);
        citiri += 1;
        opt.laCitire?.(produse, citiri);
        return Promise.resolve({ data: r.map((id) => ({ id })), error: null }).then(bun, rau);
      },
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return { db, scrise, citiri: () => citiri };
}

const idProdus = (n: number) => `p${String(n).padStart(6, "0")}`;

test("toate inseamna toate: si peste plafonul unei pagini", async () => {
  const produse = Array.from({ length: 1200 }, (_, i) => idProdus(i));
  const { db, scrise, citiri } = faceBaza({ produse });

  const r = await includeToateActive(db, BID, null, ACUM);

  assert.equal(r.scrise, 1200);
  assert.equal(r.incomplet, false);
  assert.deepEqual(scrise.map((x) => x.product_id).sort(), [...produse].sort());
  /* O pagina neplina opreste plimbarea: nicio citire in plus, despre care se stie ca vine goala. */
  assert.equal(citiri(), Math.ceil(1200 / PAGINA), "s-a mai facut o citire dupa ultima pagina");
});

test("⚠ un produs inserat in timpul plimbarii nu SARE niciun produs vechi", async () => {
  /*
   * ⚠ ASTA E CHIAR MOTIVUL PLIMBARII PE CHEIE. `products.id` e uuid aleator, iar offsetul
   * numara randurile DUPA ordonare: un import care insereaza in acelasi timp un id mai mic
   * decat cel la care am ajuns imping toate randurile cu o pozitie, si unul se pierde.
   * Cu offset, proba asta cade; cu cheie, trece.
   */
  const produse = Array.from({ length: 1200 }, (_, i) => idProdus(i * 2 + 1));
  const { db, scrise } = faceBaza({
    produse,
    laCitire: (p, aCata) => { if (aCata === 1) { p.unshift(idProdus(0)); p.sort(); } },
  });

  await includeToateActive(db, BID, null, ACUM);

  const puse = new Set(scrise.map((x) => x.product_id as string));
  for (const id of produse) assert.ok(puse.has(id), `produsul ${id} a fost sarit`);
});

test("⚠ plafonul de trecere SPUNE ca s-a oprit, si de unde se reia", async () => {
  const produse = Array.from({ length: PE_TRECERE + 600 }, (_, i) => idProdus(i));
  const { db, scrise } = faceBaza({ produse });

  const unu = await includeToateActive(db, BID, null, ACUM);
  assert.equal(unu.scrise, PE_TRECERE);
  assert.equal(unu.incomplet, true, "plafonul atins si nespus e chiar defectul");
  assert.ok(unu.dupa, "s-a oprit fara sa spuna de unde se reia");

  const doi = await includeToateActive(db, BID, unu.dupa, ACUM);
  assert.equal(doi.scrise, 600);
  assert.equal(doi.incomplet, false);

  const puse = new Set(scrise.map((x) => x.product_id as string));
  assert.equal(puse.size, produse.length, "reluarea a sarit sau a repetat produse");
});

test("⚠ o scriere cazuta ARUNCA, si nu se numara ca reusita", async () => {
  const { db } = faceBaza({ produse: [idProdus(1), idProdus(2)], scriereaCade: true });
  await assert.rejects(() => includeToateActive(db, BID, null, ACUM));
});

test("⚠ sarcina scrisa e exact atat: un camp in plus ar sterge reglajele de mana", async () => {
  const { db, scrise } = faceBaza({ produse: [idProdus(1)] });
  await includeToateActive(db, BID, null, ACUM);
  assert.deepEqual(Object.keys(scrise[0]).sort(), ["actualizat_la", "business_id", "inclus", "product_id"]);
  assert.equal(scrise[0].inclus, true);
  assert.equal(scrise[0].actualizat_la, ACUM);
});
