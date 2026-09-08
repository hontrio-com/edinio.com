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
import { citesteComanda, type ComandaPepita } from "./comanda-forma";
import { idArticol } from "./identitate";
import { ingereaza, leagaLiniile } from "./ingest";
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
}
interface RandOrder {
  id: string; business_id: string; order_number: string; total: number; subtotal: number;
  items: unknown; payment_method: string; payment_status: string; status: string;
  order_source: Record<string, unknown>; shipping_address: Record<string, unknown>;
  internal_notes: string; stoc_marketplace_la: string | null;
}

function faceBaza(
  articole: { articol_id: string; product_id: string; combinatie: string }[] = [],
  /** De cate ori la rand cade consumul de stoc. Pentru „ce se intampla cand chiar pica". */
  cadeStocDeAtateaOri = 0,
) {
  const comenzi: RandComanda[] = [];
  const orders: RandOrder[] = [];
  const consumuri: { orderId: string; produse: { product_id: string; quantity: number }[]; variante: unknown[] }[] = [];
  let n = 0;

  const raspunde = (tabela: string, fel: string, corp: unknown, filtre: [string, unknown][]): { data: unknown; error: unknown } => {
    const f = (k: string) => filtre.find((x) => x[0] === k)?.[1];

    if (tabela === "products") {
      const ids = f("id") as string[] | undefined;
      const skuri = f("sku") as string[] | undefined;
      const biz = f("business_id") as string;
      /* ⚠ Filtrul pe magazin se aplica CU ADEVARAT: altfel proba de izolare ar trece degeaba. */
      const gasite = PRODUSE.filter((p) => p.business_id === biz
        && (ids ? ids.includes(p.id) : true)
        && (skuri ? (p.sku != null && skuri.includes(p.sku)) : true));
      return { data: ids || skuri ? gasite : [], error: null };
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
      const rand = comenzi.find((x) => x.business_id === f("business_id") && x.external_order_id === f("external_order_id"));
      return { data: rand ?? null, error: null };
    }

    if (tabela === "orders") {
      if (fel === "insert") {
        const o = corp as RandOrder;
        if (orders.some((x) => x.business_id === o.business_id && x.order_number === o.order_number)) {
          return { data: null, error: { code: "23505", message: "duplicate order_number" } };
        }
        const rand = { ...o, id: `ord-${++n}`, stoc_marketplace_la: null };
        orders.push(rand);
        return { data: { id: rand.id }, error: null };
      }
      const gasita = orders.find((x) => x.business_id === f("business_id") && x.order_number === f("order_number"));
      return { data: gasita ? { id: gasita.id } : null, error: null };
    }

    return { data: null, error: null };
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (tabela: string) => {
    let fel = "";
    let corp: unknown = null;
    const filtre: [string, unknown][] = [];
    const b: any = {
      select: () => { if (!fel) fel = "select"; return b; },
      insert: (p: unknown) => { fel = "insert"; corp = p; return b; },
      update: (p: unknown) => { fel = "update"; corp = p; return b; },
      upsert: (p: unknown) => { fel = "upsert"; corp = p; return b; },
      eq: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      in: (k: string, v: unknown) => { filtre.push([k, v]); return b; },
      is: () => b, not: () => b, neq: () => b, order: () => b, limit: () => b, range: () => b,
      maybeSingle: () => Promise.resolve(raspunde(tabela, fel, corp, filtre)),
      single: () => Promise.resolve(raspunde(tabela, fel, corp, filtre)),
      then: (bun: (v: unknown) => unknown, rau?: (e: unknown) => unknown) =>
        Promise.resolve(raspunde(tabela, fel, corp, filtre)).then(bun, rau),
    };
    return b;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const db = {
    from: (t: string) => builder(t),
    rpc: (nume: string, args: Record<string, unknown>) => {
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
      consumuri.push({
        orderId: o.id,
        produse: args.p_produse as { product_id: string; quantity: number }[],
        variante: args.p_variante as unknown[],
      });
      return Promise.resolve({ data: { gasit: true, deja: false, lipsa: [] }, error: null });
    },
  };

  return { db: db as unknown as SupabaseClient<Database>, comenzi, orders, consumuri };
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

test("⚠ starea de plata lipsa se deduce din modul de plata, nu se pune „platit” din reflex", async () => {
  const b1 = faceBaza();
  await ingereaza(b1.db, CTX, comanda({ payment_mode: "cod", payment_status: undefined }));
  assert.equal(b1.orders[0].payment_status, "unpaid", "rambursul neplatit: curierul incaseaza");

  const b2 = faceBaza();
  await ingereaza(b2.db, CTX, comanda({ payment_mode: "creditcard", payment_status: undefined }));
  assert.equal(b2.orders[0].payment_status, "paid", "documentatia lor: cardul e „paid” de obicei");
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

test("⚠ transferul in avans nu se incaseaza la usa", async () => {
  /* „Transferul nu ajunge la Pepita, ci direct la voi", scrie la ei: banii vin prin banca. */
  const b = faceBaza();
  await ingereaza(b.db, CTX, comanda({ payment_mode: "transfer", payment_status: "unpaid", delivery_mod: "shipping" }));
  const o = b.orders[0];
  assert.equal(o.payment_status, "unpaid", "nu se pretinde ca banii au venit");
  assert.equal(
    rambursDeIncasat({ payment_status: o.payment_status, total: o.total, order_source: o.order_source }),
    0,
    "dar la livrare nu se cere nimic",
  );
  assert.match(o.internal_notes, /transfer ajunge direct la tine/);
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
