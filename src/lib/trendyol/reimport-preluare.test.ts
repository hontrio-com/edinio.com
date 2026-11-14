import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aceleasiCoduri, ensureListingFromMapping, esteCiornaGoala, MESAJ_LISTARE_PRELUATA } from "./sync";

/* ══════════════════════════════════════════════════════════════════════════
   PRODUSUL STERS SI REIMPORTAT ISI REIA LISTAREA TRENDYOL (14.11.2026)
   ══════════════════════════════════════════════════════════════════════════

   VetDepo si-a sters catalogul si l-a reimportat (12-14.11). Stergerea lasa listarea fara produs
   (`product_id` SET NULL) si o scotea de la vanzare; produsul reimportat, cu ACELASI cod de bare,
   cadea apoi pe „Barcode-ul este deja folosit de alt produs”, fiindca il tinea chiar listarea lui de
   dinainte. 2.081 de ciorne goale, marfa arhivata la Trendyol, iar o bucla incerca la zece minute
   s-o stearga definitiv.

   Probele merg prin `ensureListingFromMapping` adevarata, peste o baza falsa in memorie care
   intelege numai filtrele folosite acolo.
*/

type Rand = Record<string, unknown>;

/** Baza falsa: `from().select/update/delete` cu `eq`, `neq`, `in`, `is`, `limit`, `maybeSingle`. */
function bazaFalsa(tabele: Record<string, Rand[]>) {
  function cerere(tabel: string) {
    let fel: "select" | "update" | "delete" = "select";
    let date: Rand = {};
    let cuSelect = false;
    let limita: number | null = null;
    const filtre: ((r: Rand) => boolean)[] = [];
    const executa = () => {
      const t = tabele[tabel] ?? (tabele[tabel] = []);
      const alese = t.filter((r) => filtre.every((f) => f(r)));
      if (fel === "update") {
        for (const r of alese) Object.assign(r, date);
        return { data: cuSelect ? alese.map((r) => ({ id: r.id })) : null, error: null };
      }
      if (fel === "delete") {
        tabele[tabel] = t.filter((r) => !alese.includes(r));
        return { data: null, error: null };
      }
      return { data: limita == null ? alese : alese.slice(0, limita), error: null };
    };
    const b = {
      select() { if (fel !== "select") cuSelect = true; return b; },
      update(p: Rand) { fel = "update"; date = p; return b; },
      delete() { fel = "delete"; return b; },
      eq(c: string, v: unknown) { filtre.push((r) => r[c] === v); return b; },
      neq(c: string, v: unknown) { filtre.push((r) => r[c] !== v); return b; },
      in(c: string, v: unknown[]) { filtre.push((r) => v.includes(r[c])); return b; },
      is(c: string, v: unknown) { filtre.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
      limit(n: number) { limita = n; return b; },
      maybeSingle() {
        const r = executa();
        return Promise.resolve({ data: (r.data as Rand[] | null)?.[0] ?? null, error: null });
      },
      then(ok: (v: unknown) => unknown, rau?: (e: unknown) => unknown) { return Promise.resolve(executa()).then(ok, rau); },
    };
    return b;
  }
  return { from: cerere } as never;
}

const CTX = { businessId: "b1", config: {} } as never;
/** Produsul reimportat: SKU-ul e codul de bare (`deriveVariantSlots`), fara combinatii. */
const PRODUS = { id: "P-nou", name: "Hrana caini 3 kg", sku: "ABC123", page_sections: {} } as never;

function listareOrfana(extra: Rand = {}): Rand {
  return {
    id: "L-veche", business_id: "b1", product_id: null, product_main_id: "P-vechi", status: "removing",
    error: null, arhivat_la: "2026-11-12T13:00:00.000Z", sters_cerut_la: "2026-11-14T10:00:00.000Z",
    sters_eroare: "Produsul pe care doriți să îl ștergeți...", last_synced_at: "2026-11-10T18:00:00.000Z",
    ...extra,
  };
}
const varianta = (id: string, listing_id: string, barcode: string, product_id: string | null = null): Rand =>
  ({ id, listing_id, business_id: "b1", product_id, barcode });

test("⚠⚠ produsul reimportat preia listarea ramasa fara produs, cu acelasi cod de bare", async () => {
  const t: Record<string, Rand[]> = { trendyol_listings: [listareOrfana()], trendyol_variants: [varianta("V1", "L-veche", "ABC123")] };
  const r = await ensureListingFromMapping(bazaFalsa(t), CTX, PRODUS);
  assert.deepEqual(r, { listingId: "L-veche", creatAcum: false });

  const l = t.trendyol_listings[0];
  assert.equal(l.product_id, "P-nou");
  assert.equal(l.status, "error", "pe `error`, ca adoptarea s-o scoata din arhiva si sa-i trimita stocul");
  assert.equal(l.error, MESAJ_LISTARE_PRELUATA);
  assert.equal(l.arhivat_la, null, "stergerea definitiva amanata nu mai are de unde s-o aleaga");
  assert.equal(l.sters_cerut_la, null);
  assert.equal(l.sters_eroare, null);
  assert.equal(l.product_main_id, "P-vechi", "sub id-ul vechi o stie Trendyol");
  assert.equal(t.trendyol_variants[0].product_id, "P-nou", "si varianta: comenzile se leaga dupa codul de bare");
  assert.equal(t.trendyol_listings.length, 1, "nicio listare noua");
});

test("⚠⚠ ciorna goala lasata de o incercare cazuta se inlocuieste cu listarea veche", async () => {
  /* Starea VetDepo din 14.11: produsul nou avea deja o ciorna fara variante (conflictul de cod). */
  const t: Record<string, Rand[]> = {
    trendyol_listings: [
      listareOrfana(),
      { id: "C-goala", business_id: "b1", product_id: "P-nou", product_main_id: "P-nou", status: "draft", last_synced_at: null },
    ],
    trendyol_variants: [varianta("V1", "L-veche", "ABC123")],
  };
  const r = await ensureListingFromMapping(bazaFalsa(t), CTX, PRODUS);
  assert.deepEqual(r, { listingId: "L-veche", creatAcum: false });
  assert.deepEqual(t.trendyol_listings.map((l) => l.id), ["L-veche"], "ciorna goala a plecat");
  assert.equal(t.trendyol_listings[0].product_id, "P-nou");
});

test("o listare care a plecat la Trendyol (are variante) ramane a produsului, nu se cauta alta", async () => {
  const t: Record<string, Rand[]> = {
    trendyol_listings: [
      listareOrfana(),
      { id: "L-a-lui", business_id: "b1", product_id: "P-nou", product_main_id: "P-nou", status: "approved", last_synced_at: "2026-11-13T00:00:00.000Z" },
    ],
    trendyol_variants: [varianta("V1", "L-veche", "ABC123"), varianta("V2", "L-a-lui", "ALT-1", "P-nou")],
  };
  const r = await ensureListingFromMapping(bazaFalsa(t), CTX, PRODUS);
  assert.deepEqual(r, { listingId: "L-a-lui", creatAcum: false });
  assert.equal(t.trendyol_listings[0].product_id, null, "listarea orfana nu se atinge");
});

test("⚠ codul tinut de un produs VIU nu se ia: ramane conflictul vazut de om", async () => {
  const t: Record<string, Rand[]> = {
    trendyol_listings: [listareOrfana({ product_id: "P-altul" })],
    trendyol_variants: [varianta("V1", "L-veche", "ABC123", "P-altul")],
  };
  const r = await ensureListingFromMapping(bazaFalsa(t), CTX, PRODUS);
  assert.ok("error" in r, "drumul de dinainte (aici: categoria lipsa), nu o preluare");
  assert.equal(t.trendyol_listings[0].product_id, "P-altul");
  assert.equal(t.trendyol_variants[0].product_id, "P-altul");
});

test("⚠ o listare orfana cu un cod in plus nu se ia (ar fi legat un articol strain de produs)", async () => {
  const t: Record<string, Rand[]> = {
    trendyol_listings: [listareOrfana()],
    trendyol_variants: [varianta("V1", "L-veche", "ABC123"), varianta("V2", "L-veche", "XYZ999")],
  };
  const r = await ensureListingFromMapping(bazaFalsa(t), CTX, PRODUS);
  assert.ok("error" in r);
  assert.equal(t.trendyol_listings[0].product_id, null);
  assert.ok(t.trendyol_variants.every((v) => v.product_id === null), "nicio varianta preluata pe jumatate");
});

test("o ciorna orfana nu se ia: n-a plecat niciodata la ei", async () => {
  const t: Record<string, Rand[]> = {
    trendyol_listings: [listareOrfana({ status: "draft" })],
    trendyol_variants: [varianta("V1", "L-veche", "ABC123")],
  };
  const r = await ensureListingFromMapping(bazaFalsa(t), CTX, PRODUS);
  assert.ok("error" in r);
  assert.equal(t.trendyol_listings[0].product_id, null);
  assert.equal(t.trendyol_variants[0].product_id, null, "variantele puse la loc cand listarea nu se poate lua");
});

test("aceleasi coduri: fara ordine, fara spatii de margine, fara dubluri; altfel nu", () => {
  assert.equal(aceleasiCoduri(["B", " A"], ["A", "B"]), true);
  assert.equal(aceleasiCoduri(["A", "A"], ["A"]), true);
  assert.equal(aceleasiCoduri(["A"], ["A", "B"]), false);
  assert.equal(aceleasiCoduri(["A", "C"], ["A", "B"]), false);
  assert.equal(aceleasiCoduri([], []), true);
});

test("ciorna goala = draft sau eroare, neplecata, fara variante", () => {
  assert.equal(esteCiornaGoala({ status: "draft", last_synced_at: null }, false), true);
  assert.equal(esteCiornaGoala({ status: "error", last_synced_at: null }, false), true);
  assert.equal(esteCiornaGoala({ status: "error", last_synced_at: "2026-11-10" }, false), false, "a plecat la ei");
  assert.equal(esteCiornaGoala({ status: "draft", last_synced_at: null }, true), false, "are variante");
  assert.equal(esteCiornaGoala({ status: "approved", last_synced_at: null }, false), false);
});

test("⚠⚠ un produs INACTIV pleaca la Trendyol cu stocul zero, pe orice drum (adoptare, reconciliere)", () => {
  /*
   * Pana pe 14.11 zeroizarea depindea de apelant: `syncProductNow` trimitea `forceZero`, dar
   * adoptarea si reconcilierea nu. Regula sta acum in `computeInventoryItems`, unde se face
   * cantitatea: citeste `is_active` si il trece si in politica (zero trece peste comutatoare,
   * ca scoaterea din vanzare), si in cantitate.
   */
  const s = readFileSync("src/lib/trendyol/sync.ts", "utf8").replace(/\r\n/g, "\n");
  const i = s.indexOf("async function computeInventoryItems(");
  const f = s.slice(i, s.indexOf("\n}\n", i));
  assert.match(f, /\.select\("id, sku, price, compare_at_price, track_inventory, stock_quantity, page_sections, is_active"\)/);
  assert.match(f, /const zero = forceZero \|\| \(product as \{ is_active\?: boolean \| null \}\)\.is_active === false;/);
  assert.match(f, /politicaSincronizare\(ctx\.config, listing, \{ manual, forceZero: zero \}\)/);
  assert.match(f, /resolveVariantQuantity\(prod, v\.quantity, single, zero, /);
});
