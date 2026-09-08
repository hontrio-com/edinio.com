/*
 * ⚠ CHEILE ADEVARATE NU AU CE CAUTA AICI, si se sting INAINTE de orice import.
 *
 * `logError` si cozile de stoc cheama `createAdminClient()`, care citeste din mediu. Daca
 * cineva ruleaza probele intr-un shell in care a incarcat `.env.local` (s-a mai intamplat),
 * ele ar vorbi cu PRODUCTIA. Scrise aici, valorile de mai jos castiga oricum.
 */
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/*
 * ⚠ SI ASA SE TAIE SI RETEAUA. Fara chei, `createAdminClient()` arunca pe loc, iar
 * `logError` si cele cinci cozi de stoc se opresc in `catch`-ul lor, fara sa deschida nicio
 * conexiune. Cu chei false catre o adresa moarta, fiecare proba astepta sapte secunde de
 * reincercari, iar o proba lenta e o proba pe care nimeni n-o mai ruleaza.
 *
 * ⚠ Si e totodata dovada ca `impingeStoculPeCeleLalteCanale` chiar nu arunca: ingestul de
 * mai jos trece cu bine desi toate cele cinci cozi pica.
 */

import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { readFileSync } from "node:fs";
import { citesteComanda, type ComandaPepita } from "./comanda-forma";
import { idArticol } from "./identitate";
import { ingereaza, leagaLiniile, reproceseaza } from "./ingest";
import { rambursDeIncasat } from "@/lib/orders/ramburs";

/* ══════════════════════════════════════════════════════════════════════════
   O BAZA FALSA CU CONSTRANGERILE ADEVARATE
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE APARA PROBELE DE AICI, si de ce nu se poate raspunde scanand sursa:

   Panoul Pepita are „Resend order". Aceeasi comanda poate sosi de zece ori, si poate sosi
   de doua ori DEODATA. Intrebarea nu e „scrie in cod `on conflict`", ci „ce se intampla
   cand chiar soseste a doua oara". Cel mai grav raspuns gresit nu e o comanda dubla, ci o
   comanda SINGURA cu stocul scazut de DOUA ori: marfa care nu mai exista continua sa se
   vanda pe celelalte patru marketplace-uri.

   Baza falsa de mai jos poarta deci chiar constrangerile care apara asta:
     - `pepita_comenzi` unic pe (business_id, external_order_id);
     - `orders` unic pe (business_id, order_number);
     - `consuma_stoc_comanda_marketplace` idempotenta prin `stoc_marketplace_la`, exact ca
       functia din Postgres.
*/

const BID = "99999999-8888-7777-6666-555555555555";
const ALT_MAGAZIN = "11111111-1111-1111-1111-111111111111";
const P_SIMPLU = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const P_VARIANTE = "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const P_STRAIN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

interface Produs {
  id: string; business_id: string; name: string; sku: string | null; page_sections: unknown;
}

const PRODUSE: Produs[] = [
  { id: P_SIMPLU, business_id: BID, name: "Scaun", sku: "SCAUN-1", page_sections: {} },
  {
    id: P_VARIANTE, business_id: BID, name: "Tricou", sku: "TRICOU", page_sections: {
      variants: {
        enabled: true,
        options: [{ id: "o1", name: "Mărime", values: ["S", "M"] }],
        combinations: [
          { id: "s", title: "S", price: "", compare_at_price: "", sku: "", stock_quantity: "5", image: "", enabled: true },
          { id: "m", title: "M", price: "", compare_at_price: "", sku: "", stock_quantity: "5", image: "", enabled: true },
        ],
      },
    },
  },
  /* ⚠ Produsul altui magazin. Nicio potrivire nu are voie sa ajunga la el. */
  { id: P_STRAIN, business_id: ALT_MAGAZIN, name: "Al altuia", sku: "STRAIN", page_sections: {} },
];

interface RandComanda {
  id: string; business_id: string; external_order_id: string; order_id: string | null;
  stare: string; motiv: string | null; incercari: number; ultima_eroare: string | null;
  rezumat: unknown;
}
interface RandOrder {
  id: string; business_id: string; order_number: string; total: number; subtotal: number;
  items: unknown; payment_method: string; payment_status: string; status: string;
  order_source: Record<string, unknown>; shipping_address: Record<string, unknown>;
  customer_name: string; customer_phone: string;
  internal_notes: string; stoc_marketplace_la: string | null; stoc_eliberat_la: string | null;
  /** Ce s-a rezervat cu adevarat, ca in `orders.stoc_rezervat`: de el se leaga ajustarea. */
  rezervat: { product_id: string; quantity: number }[];
}

/**
 * Randul, taiat la COLOANELE CERUTE.
 *
 * ⚠ FARA ASTA, BAZA FALSA E MAI DARNICA DECAT CEA ADEVARATA. In repo-ul asta cea mai des
 * repetata greseala e chiar aceasta: un camp necerut in `.select()` vine `undefined`, iar
 * verificarea de mai jos tace exact pe randurile pentru care exista. O baza falsa care
 * intoarce tot n-o poate prinde NICIODATA. (Aceeasi reparatie s-a facut si in `feed.test.ts`.)
 */
function doar<T extends Record<string, unknown>>(rand: T, coloane: string | undefined): Record<string, unknown> {
  if (!coloane || coloane.includes("*")) return rand;
  /* Se pastreaza numai numele simple: `orders!inner(...)` si alte forme se lasa in pace. */
  if (/[()]/.test(coloane)) return rand;
  const chei = coloane.split(",").map((c) => c.trim()).filter(Boolean);
  const iesire: Record<string, unknown> = {};
  for (const k of chei) if (k in rand) iesire[k] = rand[k];
  return iesire;
}

function faceBaza(
  articole: { articol_id: string; product_id: string | null; combinatie: string }[] = [],
  /** De cate ori la rand cade consumul de stoc. Pentru „ce se intampla cand chiar pica". */
  cadeStocDeAtateaOri = 0,
) {
  const comenzi: RandComanda[] = [];
  const orders: RandOrder[] = [];
  const consumuri: { orderId: string; produse: { product_id: string; quantity: number }[]; variante: unknown[] }[] = [];
  const ajustari: { orderId: string; consumat: { product_id: string; quantity: number }[] }[] = [];
  /** Comutator: ajustarea raspunde cu eroare cat timp e adevarat. */
  const stare = { ajustareaCade: false };
  let n = 0;

  const raspunde = (tabela: string, fel: string, corp: unknown, filtre: [string, unknown][], coloane?: string): { data: unknown; error: unknown } => {
    const f = (k: string) => filtre.find((x) => x[0] === k)?.[1];

    if (tabela === "products") {
      const ids = f("id") as (string | null)[] | undefined;
      /*
       * ⚠ UN `null` IN `.in("id", ...)` NU E O CITIRE GOALA, E O INTEROGARE CAZUTA.
       *
       * PostgREST primeste `id=in.(null)`, incearca sa citeasca sirul „null" ca `uuid` si
       * raspunde `22P02`. Iar eroarea nu loveste doar linia orfana: cade CITIREA INTREAGA, deci
       * niciun produs al comenzii nu se mai gaseste. De cand `pepita_articole.product_id` poate
       * fi `null` (produs sters), asta chiar se poate intampla, si o baza falsa care ar raspunde
       * linistit cu zero randuri ar lasa defectul sa treaca verde.
       */
      if (ids?.some((x) => typeof x !== "string")) {
        return { data: null, error: { code: "22P02", message: 'invalid input syntax for type uuid: "null"' } };
      }
      const skuri = f("sku") as string[] | undefined;
      const biz = f("business_id") as string;
      /* ⚠ Filtrul pe magazin se aplica CU ADEVARAT: altfel proba de izolare ar trece degeaba. */
      const gasite = PRODUSE.filter((p) => p.business_id === biz
        && (ids ? (ids as string[]).includes(p.id) : true)
        && (skuri ? (p.sku != null && skuri.includes(p.sku)) : true));
      return { data: ids || skuri ? gasite.map((p) => doar(p as unknown as Record<string, unknown>, coloane)) : [], error: null };
    }

    if (tabela === "pepita_articole") {
      const coduri = f("articol_id") as string[] | undefined;
      const biz = f("business_id") as string;
      return {
        data: articole.filter((a) => biz === BID && (coduri ? coduri.includes(a.articol_id) : true)),
        error: null,
      };
    }

    if (tabela === "pepita_comenzi") {
      if (fel === "insert") {
        const c = corp as RandComanda;
        const exista = comenzi.some((x) => x.business_id === c.business_id && x.external_order_id === c.external_order_id);
        /* ⚠ Cheia unica, chiar ea: a doua sosire primeste `23505`, nu un al doilea rand. */
        if (exista) return { data: null, error: { code: "23505", message: "duplicate key" } };
        const rand = { ...c, id: `pc-${++n}`, order_id: null, motiv: null, ultima_eroare: null };
        comenzi.push(rand);
        return { data: { id: rand.id }, error: null };
      }
      if (fel === "update") {
        const rand = comenzi.find((x) => x.id === f("id"));
        if (rand) Object.assign(rand, corp);
        return { data: null, error: null };
      }
      /* Reprocesarea cauta randul dupa magazin si dupa id-ul lor, ca ingestul. */
      const rand = comenzi.find((x) => x.business_id === f("business_id") && x.external_order_id === f("external_order_id"));
      return { data: rand ? doar(rand as unknown as Record<string, unknown>, coloane) : null, error: null };
    }

    if (tabela === "orders") {
      if (fel === "insert") {
        const o = corp as RandOrder;
        if (orders.some((x) => x.business_id === o.business_id && x.order_number === o.order_number)) {
          return { data: null, error: { code: "23505", message: "duplicate order_number" } };
        }
        const rand = { ...o, id: `ord-${++n}`, stoc_marketplace_la: null, stoc_eliberat_la: null, rezervat: [] };
        orders.push(rand);
        return { data: { id: rand.id }, error: null };
      }
      if (fel === "update") {
        const rand = orders.find((x) => x.id === f("id"));
        if (rand) Object.assign(rand, corp);
        return { data: null, error: null };
      }
      /* ⚠ Reprocesarea citeste comanda dupa `id`; ingestul, dupa numarul ei. Amandoua trec pe aici. */
      const dupaId = f("id") as string | undefined;
      const gasita = dupaId
        ? orders.find((x) => x.id === dupaId && x.business_id === f("business_id"))
        : orders.find((x) => x.business_id === f("business_id") && x.order_number === f("order_number"));
      return { data: gasita ? doar(gasita as unknown as Record<string, unknown>, coloane) : null, error: null };
    }

    return { data: null, error: null };
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (tabela: string) => {
    let fel = "";
    let corp: unknown = null;
    const filtre: [string, unknown][] = [];
    let coloane: string | undefined;
    const b: any = {
      select: (c?: string) => { if (!fel) fel = "select"; coloane = c; return b; },
      insert: (p: unknown) => { fel = "insert"; corp = p; return b; },
      update: (p: unknown) => { fel = "update"; corp = p; return b; },
      upsert: (p: unknown) => { fel = "upsert"; corp = p; return b; },
      eq: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      in: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      is: () => b, not: () => b, neq: () => b, order: () => b, limit: () => b, range: () => b,
      maybeSingle: () => Promise.resolve(raspunde(tabela, fel, corp, filtre, coloane)),
      single: () => Promise.resolve(raspunde(tabela, fel, corp, filtre, coloane)),
      then: (bun: (v: unknown) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(tabela, fel, corp, filtre, coloane)).then(bun, rau),
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = {
    from: (t: string) => builder(t),
    rpc: (nume: string, args: Record<string, unknown>) => {
      if (nume === "ajusteaza_stoc_comanda_marketplace") {
        /*
         * ⚠ SEMANTICA FUNCTIEI DIN BAZA, copiata aici, fiindca de ea atarna reprocesarea:
         *   - fara marcaj, refuza (nu s-a consumat nimic inca);
         *   - dupa eliberare, refuza (marfa s-a intors pe raft);
         *   - altfel scade DIFERENTA fata de ce e rezervat, si setul trimis e AUTORITAR.
         */
        if (stare.ajustareaCade) return Promise.resolve({ data: null, error: { message: "statement timeout" } });
        const o = orders.find((x) => x.id === args.p_order_id);
        if (!o) return Promise.resolve({ data: { gasit: false }, error: null });
        if (!o.stoc_marketplace_la) return Promise.resolve({ data: { gasit: true, neconsumat: true, schimbat: false }, error: null });
        if (o.stoc_eliberat_la) return Promise.resolve({ data: { gasit: true, eliberat: true, schimbat: false }, error: null });
        const vechi = new Map(o.rezervat.map((x) => [x.product_id, x.quantity]));
        const nou = new Map((args.p_produse as { product_id: string; quantity: number }[]).map((x) => [x.product_id, x.quantity]));
        const consumat: { product_id: string; quantity: number }[] = [];
        for (const [pid, q] of nou) {
          const d = q - (vechi.get(pid) ?? 0);
          if (d > 0) consumat.push({ product_id: pid, quantity: d });
        }
        const eliberat = [...vechi.keys()].filter((pid) => !nou.has(pid));
        if (consumat.length === 0 && eliberat.length === 0) {
          return Promise.resolve({ data: { gasit: true, schimbat: false }, error: null });
        }
        ajustari.push({ orderId: o.id, consumat });
        o.rezervat = (args.p_produse as { product_id: string; quantity: number }[]).map((x) => ({ ...x }));
        return Promise.resolve({ data: { gasit: true, schimbat: true }, error: null });
      }
      if (nume !== "consuma_stoc_comanda_marketplace") return Promise.resolve({ data: null, error: null });
      if (cadeStocDeAtateaOri > 0) {
        cadeStocDeAtateaOri--;
        return Promise.resolve({ data: null, error: { message: "statement timeout" } });
      }
      const o = orders.find((x) => x.id === args.p_order_id);
      if (!o) return Promise.resolve({ data: { gasit: false }, error: null });
      /*
       * ⚠ IDEMPOTENTA FUNCTIEI DIN BAZA, copiata aici: marcajul se pune in aceeasi
       * instructiune cu scaderea, deci a doua chemare nu mai scade nimic.
       */
      if (o.stoc_marketplace_la) return Promise.resolve({ data: { gasit: true, deja: true, lipsa: [] }, error: null });
      o.stoc_marketplace_la = new Date().toISOString();
      o.rezervat = (args.p_produse as { product_id: string; quantity: number }[]).map((x) => ({ ...x }));
      consumuri.push({
        orderId: o.id,
        produse: args.p_produse as { product_id: string; quantity: number }[],
        variante: args.p_variante as unknown[],
      });
      return Promise.resolve({ data: { gasit: true, deja: false, lipsa: [] }, error: null });
    },
  };

  return {
    db: db as unknown as SupabaseClient<Database>, comenzi, orders, consumuri, ajustari,
    set ajustareaCade(v: boolean) { stare.ajustareaCade = v; },
    get ajustareaCade() { return stare.ajustareaCade; },
  };
}

/* ── Sarcina utila ───────────────────────────────────────────────────────── */

function comanda(peste: Record<string, unknown> = {}, linii?: Record<string, unknown>[]): ComandaPepita {
  const v = citesteComanda({
    origin: "pepita.ro",
    id: 555001,
    date: "2026-09-08 10:23:41",
    payment_mode: "cod",
    payment_status: "unpaid",
    delivery_mod: "shipping",
    total_shipping_price: 20,
    total_shipping_price_currency: "RON",
    voucher: "",
    customer: {
      last_name: "Pop", first_name: "Ion", phone: "0720000000", email: "alias@pepita.ro",
      shipping_country: "RO", shipping_county: "Cluj", shipping_city: "Cluj-Napoca",
      shipping_street: "Str. Florilor 12", shipping_postal_code: "400001",
    },
    products: linii ?? [{ id: "77", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 2, price: 100, vat: 21 }],
    ...peste,
  });
  assert.equal(v.ok, true);
  return v.ok ? v.comanda : (undefined as never);
}

const CTX = { businessId: BID, monedaMagazin: "RON" };

/* ── Probele ─────────────────────────────────────────────────────────────── */

test("comanda intra si se leaga de produsul din catalog", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda());

  assert.equal(r.stare, "creata");
  assert.equal(b.orders.length, 1);
  const o = b.orders[0];
  assert.equal(o.order_number, "PEP-555001");
  assert.equal(o.order_source.marketplace, "pepita");
  assert.equal(o.order_source.order_number, "555001");
  assert.equal(o.order_source.currency, "RON");
  assert.equal(o.status, "pending");
  assert.equal(b.comenzi[0].stare, "importata");
});

test("⚠ totalurile vin DE LA EI, nu se recalculeaza din preturile noastre de azi", () => {
  /*
   * Comanda e o tranzactie istorica: pretul magazinului se poate schimba a doua zi.
   * Recalculata, factura ar arata alta suma decat a incasat marketplace-ul.
   */
  return (async () => {
    const b = faceBaza();
    await ingereaza(b.db, CTX, comanda({ total_shipping_price: 20, voucher: 30 }));
    const o = b.orders[0];
    assert.equal(o.subtotal, 200, "2 bucati x 100 lei, exact cat au trimis ei");
    assert.equal(o.total, 190, "200 marfa + 20 transport - 30 voucher");
  })();
});

test("⚠ ZECE trimiteri ale aceleiasi comenzi fac O comanda si UN consum de stoc", async () => {
  /* „Resend order" din panoul lor. Cel mai grav defect posibil ar fi o comanda unica cu
     stocul scazut de zece ori. */
  const b = faceBaza();
  const rezultate: string[] = [];
  for (let i = 0; i < 10; i++) rezultate.push((await ingereaza(b.db, CTX, comanda())).stare);

  assert.equal(b.orders.length, 1, "o singura comanda");
  assert.equal(b.comenzi.length, 1, "un singur rand de evidenta");
  assert.equal(b.consumuri.length, 1, "stocul s-a scazut O SINGURA DATA");
  assert.deepEqual(rezultate, ["creata", ...Array(9).fill("duplicat")]);
  assert.equal(b.comenzi[0].incercari, 10, "toate sosirile se numara");
});

test("⚠ zece trimiteri CONCURENTE fac tot o singura comanda", async () => {
  /*
   * Aici „verific daca exista si apoi inserez" ar cadea: toate zece citesc „nu exista"
   * inainte ca vreuna sa scrie. Paza adevarata e cheia unica.
   */
  const b = faceBaza();
  const rezultate = await Promise.all(Array.from({ length: 10 }, () => ingereaza(b.db, CTX, comanda())));

  /*
   * ⚠ CE SE PROMITE AICI SUNT INVARIANTELE, nu repartizarea verdictelor.
   *
   * Sub concurenta adevarata, o parte dintre cereri vad randul de evidenta scris de alta,
   * dar inca fara `order_id`, si incearca si ele sa scrie comanda. Constrangerea unica pe
   * `order_number` le opreste, iar cea care nu apuca sa regaseasca randul deja scris
   * primeste „esec” si raspunde 503, adica „mai incearcă”, si atunci gaseste.
   *
   * Ce NU se poate intampla, si asta se probeaza: doua comenzi, sau doua scaderi de stoc.
   */
  assert.equal(b.orders.length, 1, "o singura comanda, oricat de concurent");
  assert.equal(b.comenzi.length, 1, "un singur rand de evidenta");
  assert.equal(b.consumuri.length, 1, "stocul s-a scazut O SINGURA DATA");
  assert.ok(rezultate.filter((r) => r.stare === "creata").length <= 1, "cel mult una raporteaza creare");
  const idUri = new Set(rezultate.map((r) => r.orderId).filter(Boolean));
  assert.ok(idUri.size <= 1, "toate cererile arata spre aceeasi comanda");
});

test("⚠ consumul de stoc picat la prima incercare se duce la capat la retrimitere", async () => {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda());
  /* Se sterge marcajul, ca si cum consumul ar fi picat pe un timeout dupa ce comanda s-a scris. */
  b.orders[0].stoc_marketplace_la = null;
  b.consumuri.length = 0;

  await ingereaza(b.db, CTX, comanda());
  assert.equal(b.consumuri.length, 1, "retrimiterea repara ce a ramas nefacut");
  assert.equal(b.orders.length, 1, "si nu face o a doua comanda");
});

test("varianta se recunoaste din amprenta, si stocul scade pe EA", async () => {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: idArticol(P_VARIANTE, "M"), currency: "RON", quantity: 1, price: 89, vat: 21 },
  ]));

  const items = b.orders[0].items as { name: string; variant_title?: string; product_id: string }[];
  assert.equal(items[0].name, "Tricou (M)");
  assert.equal(items[0].variant_title, "M");
  assert.deepEqual(b.consumuri[0].variante, [{ product_id: P_VARIANTE, variant_title: "M", quantity: 1 }]);
});

test("⚠ o combinatie disparuta NU cade pe produsul intreg", async () => {
  /*
   * Al doilea martor. Cazuta pe produs, s-ar fi scazut stocul altei marimi si ar fi
   * plecat alta marfa decat s-a cumparat.
   */
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: idArticol(P_VARIANTE, "XXL"), currency: "RON", quantity: 1, price: 89, vat: 21 },
  ]));

  assert.equal(r.stare, "carantina");
  assert.equal(b.comenzi[0].stare, "carantina");
  assert.equal(b.orders.length, 1, "comanda TOT se scrie: comerciantul trebuie s-o vada");
  assert.deepEqual(b.consumuri[0].produse, [], "si nu se scade niciun stoc pentru ea");
});

test("⚠ un cod fara corespondent duce comanda in carantina, dar n-o pierde", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "1", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 1, price: 100, vat: 21 },
    { id: "2", sku: "cod-inventat", currency: "RON", quantity: 3, price: 50, vat: 21 },
  ]));

  assert.equal(r.stare, "carantina");
  assert.ok(r.mesaje.join(" ").includes("cod-inventat"), "raspunsul catre ei SPUNE ce lipseste");
  assert.equal(b.orders.length, 1);
  const items = b.orders[0].items as { product_id: string | null }[];
  assert.equal(items.length, 2, "linia nemapata ramane pe comanda, nu dispare");
  assert.equal(items[1].product_id, null);
  assert.deepEqual(b.consumuri[0].produse, [{ product_id: P_SIMPLU, quantity: 1 }],
    "se scade numai ce s-a putut lega");
  assert.match(b.orders[0].internal_notes, /Linii fără corespondent/);
});

test("⚠ un cod care arata a produs al ALTUI magazin nu se leaga de nimic", async () => {
  /* Citim cu cheia de serviciu, deci RLS nu mai apara: filtrul pe magazin e singura
     izolare intre chiriasi, si e chiar ce se probeaza aici. */
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "1", sku: idArticol(P_STRAIN, null), currency: "RON", quantity: 1, price: 100, vat: 21 },
  ]));

  assert.equal(r.stare, "carantina");
  assert.deepEqual(b.consumuri[0].produse, []);
  const items = b.orders[0].items as { product_id: string | null }[];
  assert.equal(items[0].product_id, null);
});

test("plasa: `sku`-ul produsului nostru leaga linia chiar daca nu e `<Id>`-ul din feed", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "1", sku: "SCAUN-1", currency: "RON", quantity: 1, price: 100, vat: 21 },
  ]));
  assert.equal(r.stare, "creata");
  assert.deepEqual(b.consumuri[0].produse, [{ product_id: P_SIMPLU, quantity: 1 }]);
});

test("ramburs si card se scriu diferit, iar necunoscutul nu devine ramburs", async () => {
  for (const [mod, stare, metodaAsteptata, plataAsteptata] of [
    ["cod", "unpaid", "cash_on_delivery", "unpaid"],
    ["creditcard", "paid", "pepita", "paid"],
    ["transfer", "unpaid", "pepita", "unpaid"],
    /* ⚠ Un mod necunoscut NU devine `cash_on_delivery`: curierul ar mai cere o data banii. */
    ["bitcoin", "paid", "pepita", "paid"],
  ] as const) {
    const b = faceBaza();
    await ingereaza(b.db, CTX, comanda({ payment_mode: mod, payment_status: stare, id: `x-${mod}` }));
    assert.equal(b.orders[0].payment_method, metodaAsteptata, `mod ${mod}`);
    assert.equal(b.orders[0].payment_status, plataAsteptata, `mod ${mod}`);
  }
});

test("⚠ starea de plata lipsa NU se completeaza din modul de plata, nici pentru card", async () => {
  /*
   * ⚠ PROBA ASTA CEREA PE DOS PANA PE 08.09.2026, si apara chiar defectul.
   *
   * Ea cerea ca o comanda cu cardul si FARA stare de plata sa iasa „paid", pe temeiul ca
   * documentatia lor spune ca `paid` „se atribuie de obicei platilor cu cardul". „De obicei"
   * nu e o confirmare: o plata cu cardul poate fi inca nefinalizata cand ne impinge comanda,
   * iar noi o scriam ca incasata.
   *
   * Ce tinea regula veche era o asimetrie de cost care intre timp a disparut: pe comenzile
   * Pepita rambursul e zero oricum, deci un „neplatit" pus gresit nu mai precompleteaza nimic.
   * A ramas doar greseala care costa marfa.
   */
  const b1 = faceBaza();
  await ingereaza(b1.db, CTX, comanda({ payment_mode: "cod", payment_status: undefined }));
  assert.equal(b1.orders[0].payment_status, "unpaid", "rambursul neplatit: curierul incaseaza");

  const b2 = faceBaza();
  await ingereaza(b2.db, CTX, comanda({ payment_mode: "creditcard", payment_status: undefined }));
  assert.equal(b2.orders[0].payment_status, "unpaid", "cardul nefinalizat trecea drept incasat");
  /* ⚠ Si omul afla din nota, nu doar dintr-o coloana pe care n-o citeste nimeni. */
  assert.match(b2.orders[0].internal_notes, /Plata cu cardul NU e confirmată/);

  /* Un „paid” spus de EI ramane platit: nu s-a inasprit peste ce zic ei, doar peste ce ghicim noi. */
  const b3 = faceBaza();
  await ingereaza(b3.db, CTX, comanda({ payment_mode: "creditcard", payment_status: "paid" }));
  assert.equal(b3.orders[0].payment_status, "paid");
});

test("adresa se NORMALIZEAZA la numele pe care le citeste restul aplicatiei", async () => {
  /* Copiata cu numele lor, ar fi trecut de tipuri si ar fi aparut GOALA pe AWB si pe factura. */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda());
  const a = b.orders[0].shipping_address as Record<string, string>;
  assert.equal(a.address, "Str. Florilor 12");
  assert.equal(a.city, "Cluj-Napoca");
  assert.equal(a.county, "Cluj");
  assert.equal(a.postal_code, "400001");
  assert.equal(a.country, "RO");
});

test("⚠ nota interna spune ca statusul nu pleaca inapoi la Pepita", async () => {
  /* Fara randul asta, comerciantul ar apasa „expediat" in Edinio si ar crede ca a
     confirmat comanda la ei. Pepita cere confirmarea in cel mult o zi. */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda());
  assert.match(b.orders[0].internal_notes, /Pepita Admin/);
});

test("⚠ comanda pe firma capata datele de facturare, cu prefixul „RO” drept martor", async () => {
  /*
   * Fara ele, o comanda pe firma s-ar factura pe persoana fizica, iar o factura fiscala
   * gresita nu se retrage, se storneaza. `verified` ramane fals fiindca NU intrebam ANAF pe
   * calea de ingest: ruta trebuie sa raspunda repede, iar panoul arata atunci „date
   * neconfirmate", exact ce trebuie sa vada omul inainte sa emita.
   */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({
    customer: {
      last_name: "Pop", first_name: "Ion", phone: "0720000000",
      billing_name: "Firma Mea SRL", billing_city: "Cluj-Napoca", billing_street: "Str. Firmei 3",
      shipping_country: "RO", shipping_city: "Cluj-Napoca", shipping_street: "Str. Florilor 12",
      tax_number: "RO14399840",
    },
  }));
  const f = (b.orders[0] as unknown as { billing_company: Record<string, unknown> }).billing_company;
  assert.equal(f.cui, "14399840", "codul se pastreaza in cifre, prefixul e alt camp");
  assert.equal(f.company_name, "Firma Mea SRL");
  assert.equal(f.vat_payer, true, "prefixul „RO” inseamna inregistrat in scopuri de TVA");
  assert.equal(f.verified, false, "n-am intrebat ANAF, si n-o pretindem");
});

test("un cod fiscal care nu e CUI valid nu produce date de facturare inventate", async () => {
  /* O denumire pusa pe factura fara un cod valid e mai rea decat lipsa ei. */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({
    customer: { last_name: "Pop", first_name: "Ion", phone: "0720000000", tax_number: "HU12345678", billing_name: "Kft" },
  }));
  assert.equal((b.orders[0] as unknown as { billing_company: unknown }).billing_company, null);
});

test("o comanda pe persoana fizica n-are date de firma", async () => {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda());
  assert.equal((b.orders[0] as unknown as { billing_company: unknown }).billing_company, null);
});

test("⚠ comanda Pepita Delivery cu ramburs NU mai ajunge sa fie incasata si de curierul nostru", async () => {
  /*
   * ═══ DEFECTUL, DE LA UN CAPAT LA ALTUL ═══
   *
   * Nu se probeaza ca `metodaPlata` intoarce un sir, ci ca suma pe care o precompleteaza
   * formularele de AWB e ZERO. Intre cele doua stau ingestul, `order_source` si
   * `rambursDeIncasat`, iar defectul traia tocmai in cusatura dintre ele: fiecare piesa
   * parea corecta.
   */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({ payment_mode: "cod", delivery_mod: "gls", total_shipping_price: 0 }));
  const o = b.orders[0];

  assert.equal(o.payment_method, "pepita", "nu e rambursul comerciantului");
  assert.equal(o.payment_status, "unpaid", "si totusi banii chiar n-au intrat inca");
  assert.equal(o.order_source.incaseaza_marketplace, true);
  assert.equal(
    rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
    0,
    "⚠ zero: altfel clientul plateste o data curierului Pepita si inca o data al nostru",
  );
  assert.match(o.internal_notes, /Livrare Pepita/);
  assert.match(o.internal_notes, /NU pune ramburs/);
});

test("⚠ perechea: cu curierul comerciantului, rambursul se incaseaza ca oricare altul", async () => {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({ payment_mode: "cod", delivery_mod: "shipping", total_shipping_price: 0 }));
  const o = b.orders[0];
  assert.equal(o.payment_method, "cash_on_delivery");
  assert.equal(o.order_source.incaseaza_marketplace, false);
  assert.equal(
    rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
    o.total,
    "aici marfa chiar pleaca fara bani daca nu se incaseaza",
  );
});

test("⚠ transferul CONFIRMAT nu se incaseaza la usa", async () => {
  /* „Transferul nu ajunge la Pepita, ci direct la voi", scrie la ei: banii vin prin banca. */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({ payment_mode: "transfer", payment_status: "paid", delivery_mod: "shipping" }));
  const o = b.orders[0];
  assert.equal(o.payment_status, "paid");
  assert.equal(
    rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
    0,
    "banii au venit prin banca: la usa nu se mai cere nimic",
  );
  assert.match(o.internal_notes, /a ajuns direct la tine/);
});

test("⚠ transferul NEFACUT nu se preface in ramburs: nu schimbam metoda aleasa la ei", () => {
  return (async () => {
    /*
     * ⚠ AICI AM GRESIT IN AMANDOUA DIRECTIILE, si proba pastreaza povestea.
     *
     * O vreme rambursul se precompleta cu totalul pe un transfer neplatit — adica un transfer
     * bancar nefacut se transforma singur in plata la livrare, iar clientul care alesese banca
     * se trezea cu curierul cerandu-i numerar la usa. Nu schimbam metoda de plata aleasa la ei:
     * marfa nu pleaca pana nu se lamuresc banii, si asta se SPUNE pe comanda.
     */
    const b = faceBaza();
    await ingereaza(b.db, CTX, comanda({ payment_mode: "transfer", payment_status: "unpaid", delivery_mod: "shipping" }));
    const o = b.orders[0];

    assert.equal(o.payment_status, "unpaid", "nu se pretinde ca banii au venit");
    assert.equal(o.payment_method, "pepita", "nu se scrie plata la livrare pe o comanda cu transfer");
    assert.equal(
      rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
      0,
      "un transfer nefacut a devenit ramburs",
    );
    /* ⚠ Si comerciantul afla, din nota randata pe pagina comenzii, ca banii n-au venit. */
    assert.match(o.internal_notes, /Plata prin transfer NU e confirmată/);
    /* ⚠ Si NU mai indeamna la ramburs. Textul spunea „altfel lasă rambursul pe AWB", adica
       exact transformarea pe care restul probei o interzice. */
    assert.doesNotMatch(o.internal_notes, /rambursul pe AWB/);
  })();
});

test("⚠ un mod de livrare GLS necunoscut inca nu produce ramburs la usa", () => {
  return (async () => {
    /*
     * Documentele lor nu sunt de acord: pagina despre Pepita Delivery pomeneste
     * `gls_parcellocker` si `gls_xxl`, documentul de impingere a comenzilor nu. Tratate ca
     * livrare proprie, ar fi produs `cash_on_delivery` si un ramburs precompletat pe un colet
     * dus de GLS-ul contractat de EI: clientul ar fi platit a doua oara la usa.
     */
    for (const mod of ["gls_parcellocker", "gls_xxl"]) {
      const b = faceBaza();
      await ingereaza(b.db, CTX, comanda({ payment_mode: "cod", payment_status: "unpaid", delivery_mod: mod, id: `x-${mod}` }));
      const o = b.orders[0];
      assert.equal(o.payment_method, "pepita", `${mod}: s-a scris plata la livrare`);
      assert.equal(o.order_source.incaseaza_marketplace, true, `${mod}: rambursul ar fi al comerciantului`);
      assert.equal(
        rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
        0,
        `${mod}: clientul ar fi platit a doua oara la usa`,
      );
      assert.match(o.internal_notes, /Livrare Pepita/);
    }
  })();
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ COMANDA CARE SOSESTE DUPA CE VARIANTA A FOST REDENUMITA
   ══════════════════════════════════════════════════════════════════════════

   In Edinio, redenumirea unei valori CHIAR distruge combinatia: `generateCombinations` o
   cauta dupa titlu, deci „M" redenumit in „Mediu" se naste ca o combinatie noua, cu pretul si
   stocul goale. Deci `<Id>`-ul nou la Pepita e adevarul, nu o scapare a exportului.

   Ce era stricat era DRUMUL INAPOI: comanda poarta `<Id>`-ul vechi, iar potrivirea recalcula
   amprentele titlurilor de ACUM, deci nu se mai potrivea nimic si linia ajungea in carantina
   fara sa stim macar despre ce produs e vorba.
*/

test("⚠ un `<Id>` vechi se leaga de produs prin evidenta, chiar dupa redenumire", async () => {
  const idVechi = idArticol(P_VARIANTE, "M");
  /* Evidenta spune ca `idVechi` a plecat pentru combinatia „M". Produsul o mai are. */
  const b = faceBaza([{ articol_id: idVechi, product_id: P_VARIANTE, combinatie: "M" }]);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: idVechi, currency: "RON", quantity: 1, price: 89, vat: 21 },
  ]));
  assert.equal(r.stare, "creata");
  assert.deepEqual(b.consumuri[0].variante, [{ product_id: P_VARIANTE, variant_title: "M", quantity: 1 }]);
});

test("⚠ cand combinatia chiar a disparut, motivul o NUMESTE, nu spune „cod necunoscut”", async () => {
  /* Fara evidenta, tot ce puteam spune era ca un cod nu se potriveste cu nimic. Cu ea, stim
     si produsul, si ce varianta era: de acolo comerciantul chiar poate porni. */
  const idVechi = idArticol(P_VARIANTE, "XL-vechi");
  const b = faceBaza([{ articol_id: idVechi, product_id: P_VARIANTE, combinatie: "XL-vechi" }]);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: idVechi, currency: "RON", quantity: 1, price: 89, vat: 21 },
  ]));
  assert.equal(r.stare, "carantina");
  assert.match(b.comenzi[0].motiv ?? "", /XL-vechi/);
  assert.match(b.comenzi[0].motiv ?? "", /Tricou/);
  assert.deepEqual(b.consumuri[0].produse, [], "si nu se scade nimic pe ghicite");
});

test("⚠ produsul STERS nu se confunda cu un cod necunoscut, si nu rastoarna restul comenzii", async () => {
  /*
   * ⚠ CE APARA. Pana la `on delete set null`, cheia straina era `on delete cascade`: stergerea
   * produsului stergea si randul de evidenta, deci comanda intarziata a Pepitei ajungea in
   * carantina cu „cod necunoscut", iar comerciantul n-avea de unde sa inceapa. Acum randul
   * ramane cu `product_id` gol, si asta INSEAMNA ceva: articolul a plecat la ei, produsul nu mai
   * e la noi. Vezi `2027-01-01-pepita-articolul-ramane-orfan.sql`.
   *
   * ⚠ SI DE CE COMANDA ARE DOUA LINII. Orfanul e periculos si prin altceva: `product_id`-ul gol
   * ajungea nefiltrat in `.in("id", ...)`, iar PostgREST cade atunci cu `22P02` pe TOATA citirea.
   * Adica o singura linie orfana ar fi rupt legarea liniei SANATOASE de langa ea. A doua linie e
   * acolo ca sa se vada ca ea chiar se leaga si chiar isi scade stocul.
   */
  /*
   * ⚠ `<Id>`-ul poarta chiar uuid-ul produsului STERS, fiindca asa a plecat el in feed. Deci nici
   * drumul de rezerva (desfacerea codului) nu-l mai gaseste: produsul nu mai e in catalog. Asta e
   * si deosebirea fata de proba de deasupra, unde produsul traieste si doar combinatia a murit.
   */
  const P_STERS = "dddddddd-1111-4222-8333-444444444444";
  const codOrfan = idArticol(P_STERS, "M");
  const b = faceBaza([{ articol_id: codOrfan, product_id: null, combinatie: "M" }]);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: codOrfan, currency: "RON", quantity: 1, price: 89, vat: 21 },
    { id: "10", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 2, price: 100, vat: 21 },
  ]));

  assert.equal(r.stare, "carantina");
  const motiv = b.comenzi[0].motiv ?? "";
  assert.match(motiv, /produsul a fost șters din catalog/, "motivul nu spune ce s-a intamplat");
  /* ⚠ `/M/` singur ar fi trecut peste orice majuscula din motiv. Aici se cere chiar bucata care
     NUMESTE combinatia: „varianta", ghilimeaua, M, ghilimeaua. */
  assert.match(motiv, /varianta .M./, "si nici din ce varianta venea");
  assert.match(motiv, /Coduri/, "codul orfan tot trebuie numit, ca sa se poata cauta la ei");
  /* ⚠ Linia sanatoasa TOT se leaga si TOT isi scade stocul: orfanul n-a rasturnat citirea. */
  assert.deepEqual(b.consumuri[0].produse, [{ product_id: P_SIMPLU, quantity: 2 }]);
});

test("⚠ si schema o pastreaza: `pepita_articole.product_id` e `on delete set null`", () => {
  /*
   * ⚠ TOATA PROBA DE DEASUPRA ATARNA DE ASTA. Cu `on delete cascade` — cum era pana pe
   * 08.09.2026 — randul de evidenta dispare odata cu produsul, deci nu mai exista niciun
   * `product_id` gol de recunoscut: mesajul precis n-ar avea de unde sa vina, iar articolul ramas
   * la Pepita n-ar mai fi numarat de nimeni ca orfan.
   */
  /* ⚠ `String.fromCharCode(10)`, nu un sir cu backslash: escaparea se pierde pe drumul
     dintre unealta si fisier, si atunci sirul ar contine un RAND ADEVARAT.
     S-a intamplat chiar la scrierea probei asteia. */
  const RAND_NOU = String.fromCharCode(10);
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const linie = baseline.split(RAND_NOU).find((l) => l.includes("pepita_articole_product_id_fkey"));
  assert.ok(linie, "cheia straina a articolelor nu mai e in schema");
  assert.match(linie, /ON DELETE SET NULL/,
    "produsul sters ar duce cu el si dovada ca articolul a plecat la Pepita");
});

test("⚠ un `sku` care NU e `<Id>`-ul nostru derivat se leaga daca e in evidenta", async () => {
  /*
   * Pana acum ne bizuiam pe presupunerea ca `sku`-ul intors de ei e chiar `<Id>`-ul din feed,
   * recalculat. Daca Pepita trimite altceva ce noi am scris vreodata, evidenta il recunoaste.
   */
  const b = faceBaza([{ articol_id: "COD-CU-TOTUL-ALTFEL", product_id: P_SIMPLU, combinatie: "" }]);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: "COD-CU-TOTUL-ALTFEL", currency: "RON", quantity: 2, price: 100, vat: 21 },
  ]));
  assert.equal(r.stare, "creata");
  assert.deepEqual(b.consumuri[0].produse, [{ product_id: P_SIMPLU, quantity: 2 }]);
});

test("evidenta unui alt magazin nu leaga nimic", async () => {
  /* Filtrul pe magazin se aplica si la evidenta, nu doar la produse. */
  const b = faceBaza([{ articol_id: "COD-STRAIN", product_id: P_STRAIN, combinatie: "" }]);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "9", sku: "COD-STRAIN", currency: "RON", quantity: 1, price: 10, vat: 21 },
  ]));
  assert.equal(r.stare, "carantina");
  assert.deepEqual(b.consumuri[0].produse, []);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ STOCUL CARE N-A SCAZUT NU SE RAPORTEAZA CA REUSITA
   ══════════════════════════════════════════════════════════════════════════

   Pana la reparatia din 08.09.2026, un consum picat se scria in jurnal si se mergea mai
   departe, iar ruta raspundea „a mers". Deci: comanda exista, stocul NU scazuse, iar Pepita
   n-avea niciun motiv sa retrimita. Stocul nostru ramanea umflat, si celelalte cinci canale
   continuau sa vanda marfa care nu mai era.
*/

test("⚠ cand consumul de stoc pica, ingestul spune ESEC, nu tace", async () => {
  const b = faceBaza([], 1);
  const r = await ingereaza(b.db, CTX, comanda());

  assert.equal(r.stare, "stoc-nefacut");
  assert.equal(b.orders.length, 1, "comanda TOT se scrie: pierduta ar fi mai rau");
  assert.equal(b.comenzi[0].stare, "carantina", "si nu ramane «importata», adica «s-a facut tot»");
  assert.match(b.comenzi[0].motiv ?? "", /Stocul nu s-a putut scădea/);
});

test("⚠ o retrimitere dupa esec duce consumul la capat, fara sa faca a doua comanda", async () => {
  const b = faceBaza([], 1);
  const prima = await ingereaza(b.db, CTX, comanda());
  assert.equal(prima.stare, "stoc-nefacut");
  assert.equal(b.consumuri.length, 0, "premisa: chiar n-a scazut nimic");

  const aDoua = await ingereaza(b.db, CTX, comanda());
  assert.equal(aDoua.stare, "duplicat");
  assert.equal(b.orders.length, 1, "tot o singura comanda");
  assert.equal(b.consumuri.length, 1, "si stocul a scazut exact o data");
});

test("⚠ daca pica si a doua oara, verdictul ramane esec: reincercarea urmatoare mai are o sansa", async () => {
  const b = faceBaza([], 2);
  await ingereaza(b.db, CTX, comanda());
  const aDoua = await ingereaza(b.db, CTX, comanda());
  assert.equal(aDoua.stare, "stoc-nefacut");
  assert.equal(b.consumuri.length, 0);

  const aTreia = await ingereaza(b.db, CTX, comanda());
  assert.equal(aTreia.stare, "duplicat");
  assert.equal(b.consumuri.length, 1);
});

test("⚠ cota de TVA ramane PE FIECARE LINIE, nu doar in totalul comenzii", async () => {
  /*
   * Pepita trimite TVA pe fiecare produs, iar in Romania cotele chiar difera: hrana 11%,
   * restul 21%. Pastrata numai ca `orders.vat_rate`, adica un singur numar, informatia se
   * pierdea si nimic nu mai putea sti ca a fost o comanda cu cote amestecate.
   */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({}, [
    { id: "1", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 1, price: 900, vat: 11 },
    { id: "2", sku: idArticol(P_VARIANTE, "S"), currency: "RON", quantity: 1, price: 20, vat: 21 },
  ]));
  const items = b.orders[0].items as { vat_rate?: number }[];
  assert.deepEqual(items.map((i) => i.vat_rate), [11, 21]);
});

test("⚠ cota comenzii NU mai e maximul: supra-taxa toate liniile", async () => {
  /* 900 de lei cu 11% si 20 de lei cu 21%. `max` ar fi pus 21% pe toata comanda. */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({}, [
    { id: "1", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 1, price: 900, vat: 11 },
    { id: "2", sku: idArticol(P_VARIANTE, "S"), currency: "RON", quantity: 1, price: 20, vat: 21 },
  ]));
  assert.equal((b.orders[0] as unknown as { vat_rate: number }).vat_rate, 11);
  assert.deepEqual(b.orders[0].order_source.vat_mixt, [11, 21], "si amestecul se vede");
  assert.match(b.orders[0].internal_notes, /cote de TVA diferite/);
});

test("o comanda cu o singura cota nu poarta niciun semn de amestec", async () => {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda());
  assert.equal((b.orders[0] as unknown as { vat_rate: number }).vat_rate, 21);
  assert.equal(b.orders[0].order_source.vat_mixt, undefined);
  assert.ok(!/cote de TVA diferite/.test(b.orders[0].internal_notes));
});

test("potrivirea liniilor nu cere nicio scriere", async () => {
  const b = faceBaza();
  const r = await leagaLiniile(b.db, BID, comanda().linii);
  assert.equal(r.nelegate.length, 0);
  assert.equal(r.legate[0].productId, P_SIMPLU);
  assert.equal(b.orders.length, 0);
});

/* ══════════════════════════════════════════════════════════════════════════
   COMANDA PE CARE NU O POTI EXPEDIA
   ══════════════════════════════════════════════════════════════════════════ */

const FARA_DATE = {
  last_name: "Pop", first_name: "Ion", phone: "", email: "alias@pepita.ro",
  shipping_country: "RO", shipping_county: "Cluj", shipping_city: "Cluj-Napoca",
  shipping_street: "",
};

test("⚠ curier propriu fara telefon si fara strada: comanda intra, dar in CARANTINA", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({ customer: FARA_DATE }));

  /* Comanda E scrisa: o comanda pierduta e mai rea decat una care are nevoie de verificare. */
  assert.equal(b.orders.length, 1);
  assert.equal(r.stare, "carantina");
  assert.equal(b.comenzi[0].stare, "carantina");
  assert.match(b.comenzi[0].motiv ?? "", /telefonul/);
  assert.match(b.comenzi[0].motiv ?? "", /strada/);

  /* ⚠ Cine intra pe lista obisnuita de comenzi, nu prin panoul Pepita, afla din nota interna. */
  assert.match(b.orders[0].internal_notes, /nu se poate expedia/i);
  assert.ok(r.mesaje.some((m) => /nu se poate expedia/i.test(m)), "nu li s-a spus nimic");

  /* ⚠ STOCUL SCADE OFICUM: marfa e vanduta la ei, iar nescazuta se supravinde pe alte canale. */
  assert.equal(b.consumuri.length, 1);
});

test("⚠ aceleasi date lipsa, dar cu LIVRARE PEPITA, nu opresc nimic", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({ customer: FARA_DATE, delivery_mod: "gls" }));

  /* Coletul pleaca cu eticheta lor: telefonul si strada nu-i trebuie comerciantului. */
  assert.equal(r.stare, "creata");
  assert.equal(b.comenzi[0].stare, "importata");
  assert.equal(b.comenzi[0].motiv, null);
});

test("⚠ datele de facturare tin loc celor de livrare, si comanda NU intra in carantina", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda({
    customer: {
      last_name: "Pop", first_name: "Ion", phone: "0720000000",
      shipping_country: "RO", shipping_county: "Bihor", shipping_city: "", shipping_street: "",
      billing_city: "Oradea", billing_street: "Str. Republicii 3", billing_postal_code: "410001",
    },
  }));

  assert.equal(r.stare, "creata");
  const a = b.orders[0].shipping_address as { city: string; address: string; postal_code: string };
  assert.equal(a.city, "Oradea");
  assert.equal(a.address, "Str. Republicii 3");
  assert.equal(a.postal_code, "410001");
});

test("⚠ doua motive de carantina stau AMANDOUA pe rand, unul nu-l sterge pe celalalt", async () => {
  /*
   * Aici era defectul: esecul de stoc scria `motiv` peste cel dinainte, iar cronul de stoc
   * scoate din carantina randurile al caror motiv e chiar al lui. Deci o comanda cu o linie
   * nelegata SI stocul nescazut ar fi iesit din carantina cu prima problema nerezolvata,
   * adica ar fi disparut din lista comerciantului.
   */
  const b = faceBaza([], 1);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "77", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 1, price: 100 },
    { id: "78", sku: "COD-INVENTAT", currency: "RON", quantity: 1, price: 50 },
  ]));

  assert.equal(r.stare, "stoc-nefacut");
  const motiv = b.comenzi[0].motiv ?? "";
  assert.match(motiv, /COD-INVENTAT/, "motivul liniei nelegate a fost sters de cel de stoc");
  assert.match(motiv, /Stocul nu s-a putut scădea/, "motivul de stoc lipseste");
});

/* ══════════════════════════════════════════════════════════════════════════
   MONEDA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ o comanda in alta moneda decat magazinul intra, dar in CARANTINA", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda(
    { total_shipping_price_currency: "HUF" },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), currency: "HUF", quantity: 1, price: 3192 }],
  ));

  assert.equal(r.stare, "carantina");
  assert.match(b.comenzi[0].motiv ?? "", /altă monedă/);
  assert.equal(b.orders[0].order_source.currency, "HUF");
  /* ⚠ Cifra de pe comanda nu e in lei, si o afla si cine intra pe lista obisnuita de comenzi. */
  assert.match(b.orders[0].internal_notes, /în HUF/);
  assert.match(b.orders[0].internal_notes, /NU emite AWB cu ramburs/);
});

test("⚠ rambursul unei comenzi in alta moneda e ZERO: curierul incaseaza lei", async () => {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda(
    { total_shipping_price_currency: "HUF" },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), currency: "HUF", quantity: 1, price: 3192 }],
  ));
  const o = b.orders[0];

  assert.equal(rambursDeIncasat({
    payment_status: o.payment_status, total: o.total, order_source: o.order_source,
  }), 0, "cifra ungureasca ar fi fost ceruta la usa in LEI");
});

test("moneda netrimisa NU e o abatere: se cade pe moneda magazinului", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda(
    { total_shipping_price_currency: undefined },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), quantity: 1, price: 100 }],
  ));

  assert.equal(r.stare, "creata");
  assert.equal(b.orders[0].order_source.currency, "RON");
});

test("⚠ un cod de moneda necitit duce comanda in carantina, nu la gunoi", async () => {
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda(
    { total_shipping_price_currency: undefined },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), currency: "ronn", quantity: 1, price: 100 }],
  ));

  /* Comanda E scrisa, dar nu trece drept lamurita: nu avem voie sa presupunem despre bani. */
  assert.equal(b.orders.length, 1);
  assert.equal(r.stare, "carantina");
  assert.match(b.comenzi[0].motiv ?? "", /nu am putut-o citi/);
});

/* ══════════════════════════════════════════════════════════════════════════
   REPROCESAREA UNEI COMENZI DIN CARANTINA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Carantina era un fund de sac: comerciantul putea crea produsul lipsa, si comanda ramanea
   acolo pentru totdeauna. Nici „Resend order" din panoul lor nu ajuta, fiindca sosirea a doua
   raspundea „deja" la consumul de stoc si nu repara nimic.
*/

/** Un cod care nu se leaga de nimic: uuid care nu e al niciunui produs din baza falsa. */
const P_INEXISTENT = "cccccccc-dddd-4eee-8fff-999999999999";

/** O linie din `orders.items`, care in baza falsa e `unknown`. */
const linie = (o: RandOrder, i: number) => (o.items as Record<string, unknown>[])[i];

async function comandaInCarantina(evidenta: { articol_id: string; product_id: string; combinatie: string }[]) {
  const b = faceBaza(evidenta);
  const codOrfan = idArticol(P_INEXISTENT, null);
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "77", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 2, price: 100 },
    { id: "78", sku: codOrfan, currency: "RON", quantity: 3, price: 50 },
  ]));
  assert.equal(r.stare, "carantina");
  return { b, codOrfan };
}

test("⚠ produsul creat intre timp scoate comanda din carantina, si se scade DOAR diferenta", async () => {
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);

  /* Prima scadere a luat doar linia legata: 2 bucati. */
  assert.equal(b.consumuri.length, 1);
  assert.deepEqual(b.consumuri[0].produse, [{ product_id: P_SIMPLU, quantity: 2 }]);
  assert.equal(linie(b.orders[0], 1).product_id, null);

  /* Comerciantul leaga codul de un produs (aici: evidenta capata randul care lipsea). */
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });

  const r = await reproceseaza(b.db, CTX, "555001");

  assert.equal(r.ok, true);
  assert.equal(b.comenzi[0].stare, "importata", "comanda a ramas in carantina desi s-a reparat");
  assert.equal(b.comenzi[0].motiv, null);
  assert.equal(linie(b.orders[0], 1).product_id, P_VARIANTE, "linia n-a fost legata in `items`");

  /*
   * ⚠ AJUSTARE, NU CONSUM DE LA ZERO. Marcajul era pus, deci a doua chemare scade DIFERENTA:
   * cele 3 bucati ale liniei tocmai reparate, si nimic din cele 2 scazute deja.
   */
  assert.equal(b.ajustari.length, 1);
  assert.deepEqual(b.ajustari[0].consumat, [{ product_id: P_VARIANTE, quantity: 3 }]);
  assert.equal(b.consumuri.length, 1, "s-a consumat de la zero peste ce era deja scazut");
});

test("⚠ marcajul `stoc_marketplace_la` NU se sterge la reprocesare", async () => {
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  const marcaj = b.orders[0].stoc_marketplace_la;
  assert.ok(marcaj, "prima scadere n-a marcat nimic");

  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });
  await reproceseaza(b.db, CTX, "555001");

  /* Sters, consumul ar porni de la zero peste ce s-a scazut deja. */
  assert.equal(b.orders[0].stoc_marketplace_la, marcaj);
});

test("⚠ a doua apasare nu mai face nimic, si spune asta", async () => {
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });

  await reproceseaza(b.db, CTX, "555001");
  const aDoua = await reproceseaza(b.db, CTX, "555001");

  assert.equal(aDoua.ok, true);
  assert.equal(aDoua.schimbat, false);
  assert.equal(b.ajustari.length, 1, "a doua apasare a mai scazut o data stoc");
});

test("comanda care nu se poate lega ramane in carantina, cu motivul ei", async () => {
  const { b } = await comandaInCarantina([]);
  const r = await reproceseaza(b.db, CTX, "555001");

  assert.equal(r.ok, true);
  assert.equal(b.comenzi[0].stare, "carantina");
  assert.match(b.comenzi[0].motiv ?? "", /Coduri fără corespondent/);
  assert.equal(b.ajustari.length, 0, "nu s-a schimbat nimic, deci nu se atinge stocul");
});

test("⚠ liniile care nu mai corespund OPRESC reparatia, in loc sa ghiceasca", async () => {
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });

  /* Comerciantul a adaugat o linie de mana din panou: cale permisa azi. */
  (b.orders[0].items as Record<string, unknown>[]).push({ product_id: P_SIMPLU, name: "Adaugat", price: 10, quantity: 1 });

  const r = await reproceseaza(b.db, CTX, "555001");

  assert.equal(r.ok, false);
  assert.match(r.mesaj, /nu pot repara pe ghicite/);
  /*
   * ⚠ ASTA APARA BANII SI MARFA: setul trimis lui `ajusteaza` e AUTORITAR, iar linia adaugata
   * de mana nu e in ce ne-au trimis ei. Reparata pe ghicite, i s-ar fi dat stocul inapoi.
   */
  assert.equal(b.ajustari.length, 0);
  assert.equal(b.comenzi[0].stare, "carantina");
});

test("⚠ cand stocul n-a fost facut deloc, reprocesarea CONSUMA, nu ajusteaza", async () => {
  const b = faceBaza([], 1);
  const r = await ingereaza(b.db, CTX, comanda());
  assert.equal(r.stare, "stoc-nefacut");
  assert.equal(b.orders[0].stoc_marketplace_la, null);
  assert.match(b.comenzi[0].motiv ?? "", /Stocul nu s-a putut scădea/);

  const rep = await reproceseaza(b.db, CTX, "555001");

  assert.equal(rep.ok, true);
  assert.equal(rep.stocEsuat, false);
  assert.equal(b.consumuri.length, 1, "consumul nu s-a facut");
  assert.equal(b.ajustari.length, 0, "ajustarea refuza oricum fara marcaj, dar nici n-avea ce cauta aici");
  assert.equal(b.comenzi[0].stare, "importata");
});

test("⚠ pe o comanda anulata, reprocesarea NU atinge stocul", async () => {
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });

  /* Marfa s-a intors pe raft: un consum aici ar scadea pentru o comanda care nu mai exista. */
  b.orders[0].stoc_eliberat_la = new Date().toISOString();

  const r = await reproceseaza(b.db, CTX, "555001");

  assert.equal(r.ok, true);
  assert.equal(b.ajustari.length, 0);
  assert.equal(b.consumuri.length, 1, "s-a mai scazut o data pe o comanda anulata");
  assert.match(r.mesaj, /anulată sau restituită/);
  /* Legatura din `items` se repara oricum: factura si AWB-ul o citesc. */
  assert.equal(linie(b.orders[0], 1).product_id, P_VARIANTE);
});

test("⚠ retrimiterea lor face acum exact ce face butonul", async () => {
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });

  /*
   * Pana la reparatia asta, ramura de duplicat chema doar consumul de stoc, care raspunde
   * „deja" cand marcajul e pus: comanda ramanea in carantina oricate retrimiteri ar fi venit.
   */
  const r = await ingereaza(b.db, CTX, comanda({}, [
    { id: "77", sku: idArticol(P_SIMPLU, null), currency: "RON", quantity: 2, price: 100 },
    { id: "78", sku: codOrfan, currency: "RON", quantity: 3, price: 50 },
  ]));

  assert.equal(r.stare, "duplicat");
  assert.equal(b.comenzi[0].stare, "importata", "retrimiterea n-a scos comanda din carantina");
  assert.equal(linie(b.orders[0], 1).product_id, P_VARIANTE);
  assert.equal(b.orders.length, 1, "s-a facut o a doua comanda");
});

test("⚠ un motiv pe care reprocesarea nu-l poate recalcula SUPRAVIETUIESTE", async () => {
  /*
   * Sarcina bruta nu se pastreaza nicaieri, dinadins: unele motive (moneda necitita, de pilda)
   * nu se mai pot afla din nou. Sterse la prima apasare, comanda ar fi iesit din carantina cu
   * problema nerezolvata, adica ar fi disparut din lista comerciantului.
   */
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });
  b.comenzi[0].motiv = `${b.comenzi[0].motiv} | Ceva scris de altcineva, maine`;

  await reproceseaza(b.db, CTX, "555001");

  assert.equal(b.comenzi[0].stare, "carantina", "motivul nerecunoscut a fost sters");
  assert.equal(b.comenzi[0].motiv, "Ceva scris de altcineva, maine");
});

/* ══════════════════════════════════════════════════════════════════════════
   PAZELE REPROCESARII, GASITE LA A DOUA TRECERE
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ pe o comanda ANULATA inainte de orice consum, reprocesarea nu scade nimic", async () => {
  /*
   * Deosebit de proba cu `stoc_eliberat_la`: cand consumul n-a apucat sa se faca, `stoc_rezervat`
   * e NULL, deci `elibereaza_stoc_comanda` iese cu „necunoscut" si NU stampileaza nimic. Doar
   * statusul mai spune ca marfa nu mai pleaca.
   */
  const b = faceBaza([], 1);
  await ingereaza(b.db, CTX, comanda());
  assert.equal(b.orders[0].stoc_marketplace_la, null);
  assert.equal(b.orders[0].stoc_eliberat_la, null, "aici e capcana: nu s-a stampilat nimic");
  b.orders[0].status = "cancelled";

  const r = await reproceseaza(b.db, CTX, "555001");

  assert.equal(r.ok, true);
  assert.equal(b.consumuri.length, 0, "s-a scazut stocul pentru o comanda care nu pleaca");
  assert.match(r.mesaj, /anulată sau restituită/);
});

test("⚠ o legatura PIERDUTA opreste ajustarea: altfel marfa plecata primea stocul inapoi", async () => {
  /*
   * Setul trimis lui `ajusteaza` e AUTORITAR: ce lipseste din el se ELIBEREAZA. Daca intre
   * sosire si reprocesare comerciantul redenumeste varianta unei linii DEJA consumate,
   * `leagaLiniile` n-o mai gaseste, iar setul nou n-o mai contine.
   */
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  assert.equal(b.consumuri.length, 1, "prima linie chiar s-a consumat");

  /* Codul orfan capata legatura, dar linia DEJA legata o pierde. */
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });
  const iLegata = (b.orders[0].items as Record<string, unknown>[]).findIndex((x) => x.product_id);
  assert.ok(iLegata >= 0);
  b.comenzi[0].rezumat = {
    ...(b.comenzi[0].rezumat as Record<string, unknown>),
    linii: ((b.comenzi[0].rezumat as { linii: Record<string, unknown>[] }).linii).map((l, i) =>
      i === iLegata ? { ...l, sku: "COD-CARE-NU-MAI-EXISTA" } : l),
  };

  const r = await reproceseaza(b.db, CTX, "555001");

  assert.equal(r.ok, true);
  assert.equal(b.ajustari.length, 0, "s-a ajustat stocul cu o legatura pierduta, deci s-a eliberat marfa plecata");
  assert.match(r.mesaj, /nu se mai recunoaște/);
});

test("⚠ cand ajustarea PICA, liniile NU se scriu: altfel a doua apasare iese fara stoc", async () => {
  /*
   * Scrise oricum, a doua apasare ar fi vazut `items` deja reparate, deci n-ar mai fi chemat
   * nici ajustarea, nici consumul, iar `motiveNerecalculabile` ar fi sters tocmai bucata de
   * stoc: comanda ar fi iesit din carantina cu stocul nescazut, si n-ar mai fi avut cine sa-l
   * scada (cronul cere marcajul gol, iar aici e pus).
   */
  const evidenta: { articol_id: string; product_id: string; combinatie: string }[] = [];
  const { b, codOrfan } = await comandaInCarantina(evidenta);
  evidenta.push({ articol_id: codOrfan, product_id: P_VARIANTE, combinatie: "" });
  b.ajustareaCade = true;

  const unu = await reproceseaza(b.db, CTX, "555001");
  assert.equal(unu.stocEsuat, true);
  assert.equal(linie(b.orders[0], 1).product_id, null, "liniile s-au scris desi stocul a picat");
  assert.equal(b.comenzi[0].stare, "carantina");

  /* A doua apasare, cu baza sanatoasa, duce treaba la capat. */
  b.ajustareaCade = false;
  const doi = await reproceseaza(b.db, CTX, "555001");
  assert.equal(doi.ok, true);
  assert.equal(b.ajustari.length, 1, "reincercarea n-a mai ajustat nimic");
  assert.equal(linie(b.orders[0], 1).product_id, P_VARIANTE);
  assert.equal(b.comenzi[0].stare, "importata");
});

test("⚠ cand liniile n-au moneda, o da TRANSPORTUL: altfel o comanda de forinti iese „RON”", async () => {
  /*
   * Sunt sarcini in care `products[].currency` lipseste, dar `total_shipping_price_currency` e
   * „HUF". Fara caderea pe transport, comanda se scria cu moneda magazinului: nu intra in
   * carantina, nu primea nota, iar cifra ei pleca in rambursul unui AWB si intr-o factura in lei.
   */
  const b = faceBaza();
  const r = await ingereaza(b.db, CTX, comanda(
    { total_shipping_price: 1490, total_shipping_price_currency: "HUF" },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), quantity: 1, price: 3192 }],
  ));

  assert.equal(b.orders[0].order_source.currency, "HUF");
  assert.equal(r.stare, "carantina");
  assert.match(b.comenzi[0].motiv ?? "", /altă monedă/);
  assert.match(b.orders[0].internal_notes, /în HUF/);
});

test("⚠ codul necitit pune un STEAG, si el opreste rambursul", async () => {
  /*
   * `currency` ramane cea mai buna presupunere, fiindca rapoartele au nevoie de ceva. Dar a
   * precompleta un ramburs pe o presupunere despre bani inseamna sa ceri la usa o cifra care
   * poate fi in alta moneda.
   */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda(
    { total_shipping_price_currency: undefined },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), currency: "Ft", quantity: 1, price: 100 }],
  ));
  const o = b.orders[0];

  assert.equal(o.order_source.moneda_necitita, true);
  assert.equal(
    rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
    0,
    "s-a precompletat un ramburs pe o moneda pe care am scris ca n-o stim",
  );
  /* ⚠ Si cine intra pe lista obisnuita de comenzi afla din nota, nu doar din panoul Pepita. */
  assert.match(o.internal_notes, /nu s-a putut citi/);
});

test("⚠ nota interna chiar AJUNGE PE UN ECRAN", () => {
  /*
   * ⚠ PANA PE 08.09.2026 NU AJUNGEA NICAIERI. `orders.internal_notes` era scris de ingest cu
   * tocmai lucrurile de care atarna banii — cine incaseaza rambursul, ca totalul e in alta
   * moneda, ca moneda n-a putut fi citita, ca liniile au cote de TVA diferite — si nicio
   * componenta nu-l randa. Comentariile din cod spuneau „aici afla cine intra pe lista obisnuita
   * de comenzi", iar afirmatia era falsa: comerciantul apasa pe factura sau pe AWB fara sa fi
   * avut cum sa stie.
   *
   * ⚠ Plasa scaneaza componenta, deci spune ca nota e randata, nu cum arata. Ce apara e
   * intoarcerea la starea in care avertismentele se scriu si nu le vede nimeni.
   */
  /*
   * ⚠ COMENTARIILE SE SCOT INTAI. Doua din cele trei tipare se potriveau si pe chiar nota care
   * explica reparatia, deci proba ar fi ramas verde peste un ecran care nu randeaza nimic.
   */
  const ecran = readFileSync("src/components/dashboard/OrderDetailClient.tsx", "utf8")
    .replace(/[/][*][^]*?[*][/]/g, " ")
    .replace(/^\s*[/][/].*$/gm, " ");
  assert.match(ecran, /internal_notes/, "nota interna nu e citita de niciun ecran");
  assert.match(ecran, /{noteInterne && \(/, "nota interna e citita, dar nu se randeaza");
  assert.match(ecran, /{noteInterne}/, "nota nu ajunge in niciun element");
  assert.match(ecran, /whitespace-pre-line/, "randurile notei se lipesc intre ele");
});

/* ══════════════════════════════════════════════════════════════════════════
   STEAGUL MONEDEI SI MOTIVUL SE STING IMPREUNA, SI DOAR LA APASAREA UNUI OM
   ══════════════════════════════════════════════════════════════════════════ */

async function comandaCuMonedaNecitita() {
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda(
    { total_shipping_price_currency: undefined },
    [{ id: "77", sku: idArticol(P_SIMPLU, null), currency: "Ft", quantity: 1, price: 100 }],
  ));
  assert.equal(b.orders[0].order_source.moneda_necitita, true);
  assert.match(b.comenzi[0].motiv ?? "", /nu am putut-o citi/);
  return b;
}

test("⚠ NICIO reprocesare nu stinge steagul monedei necitite, nici cea apasata de om", () => {
  return (async () => {
    /*
     * ⚠ Prima incercare il stingea la apasarea omului. Dar steagul e SINGURA paza care tine
     * rambursul pe zero si facturarea automata oprita pe o comanda despre care noi insine am
     * scris ca nu stim in ce moneda e. Stins, `rambursDeIncasat` intoarce totalul intreg — iar
     * la generarea in MASA de AWB nu exista niciun camp de corectat, deci cifra ungureasca ar fi
     * ceruta in LEI la usa. O apasare pe „Reprocesează" nu e o hotarare despre bani.
     */
    const b = await comandaCuMonedaNecitita();

    const r = await reproceseaza(b.db, CTX, "555001");

    assert.equal(r.ok, true);
    assert.equal(b.comenzi[0].stare, "carantina", "comanda a iesit din carantina cu moneda tot necunoscuta");
    assert.match(b.comenzi[0].motiv ?? "", /nu am putut-o citi/);
    assert.equal(b.orders[0].order_source.moneda_necitita, true, "steagul s-a stins");

    const o = b.orders[0];
    assert.equal(
      rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
      0,
      "rambursul s-a deschis pe o comanda a carei moneda nu se stie",
    );
  })();
});
