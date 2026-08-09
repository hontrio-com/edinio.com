import assert from "node:assert/strict";
import { test } from "node:test";
import { pollOrders, type AducePaginaAy } from "./orders";
import { marcajUrmator } from "@/lib/marketplace/marcaj";
import type { AboutYouSyncContext } from "./sync";
import type { AboutYouOrder } from "./types";

/**
 * Cursorul de comenzi About You, probat pe bucla adevarata.
 *
 * ═══ DEOSEBIREA FATA DE TRENDYOL, SI DE CE CONTEAZA ═══
 *
 * La Trendyol cerem noi sortarea si ne putem baza pe ea. Aici API-ul NU are
 * parametru de sortare, deci ordinea paginilor e o PRESUPUNERE — iar un cursor
 * construit peste o ordine gresita ar sari comenzi, adica exact defectul pe care
 * il inchide. De aceea ordinea se verifica LA RULARE, iar testele astea sunt
 * proba ca verificarea chiar functioneaza in ambele sensuri:
 * cand ordinea e buna, cursorul avanseaza; cand nu e, se anuleaza si fereastra
 * ramane pe loc — blocaj, dar zgomotos, in loc de pierdere tacuta.
 */

const OVERLAP = 5 * 60 * 1000;
const ctx = { businessId: "biz", auth: {}, config: {} } as unknown as AboutYouSyncContext;
const admin = {} as never;

const T0 = Date.UTC(2026, 7, 1, 12, 0, 0);
function comanda(n: number, laMs: number): AboutYouOrder {
  return { order_number: `AY-${n}`, status: "open", order_items: [], created_at: new Date(laMs).toISOString() } as unknown as AboutYouOrder;
}

/**
 * Sursa care da un lot doar pentru statusul `open`; restul sunt goale.
 *
 * ⚠ Plafonul e de 40 de pagini, iar bucla iese mai devreme la prima pagina goala.
 * Deci ca sa se ATINGA trunchierea, lotul trebuie sa aiba destule comenzi cat sa
 * umple toate cele 40 de pagini. Prima forma a testelor n-avea, si „trunchierea"
 * nu se declansa deloc — testul trecea peste alt drum decat cel probat.
 */
const PER_PAGINA = 2;
const PLAFON_PAGINI = 40;

function sursaOpen(comenzi: AboutYouOrder[], paginiRaportate?: number): AducePaginaAy {
  return async ({ status, page }) => {
    if (status !== "open") return { items: [], pages: 1 };
    return {
      items: comenzi.slice((page - 1) * PER_PAGINA, (page - 1) * PER_PAGINA + PER_PAGINA),
      pages: paginiRaportate ?? Math.max(1, Math.ceil(comenzi.length / PER_PAGINA)),
    };
  };
}

/** Sursa cu loturi diferite pe statusuri diferite. */
function sursaPeStatusuri(loturi: Partial<Record<string, AboutYouOrder[]>>, pagini: Partial<Record<string, number>> = {}): AducePaginaAy {
  return async ({ status, page }) => {
    const lot = loturi[status] ?? [];
    return {
      items: lot.slice((page - 1) * PER_PAGINA, (page - 1) * PER_PAGINA + PER_PAGINA),
      pages: pagini[status] ?? Math.max(1, Math.ceil(lot.length / PER_PAGINA)),
    };
  };
}

/** Destule comenzi cat sa umple plafonul si sa mai ramana: trunchiere sigura. */
function lotCareTrunchiaza(laMs: (i: number) => number, cate = PLAFON_PAGINI * PER_PAGINA + 10) {
  return Array.from({ length: cate }, (_, i) => comanda(i, laMs(i)));
}

test("citire completa: `ok` ramane adevarat, marcajul sare la momentul rularii", async () => {
  const comenzi = [comanda(1, T0), comanda(2, T0 + 1000)];
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaOpen(comenzi),
    ingereaza: async () => "created",
  });
  assert.equal(r.ok, true);
  assert.equal(r.ingested, 2);
  assert.equal(marcajUrmator(r, { runStartMs: T0 + 9999, overlapMs: OVERLAP }), T0 + 9999);
});

test("trunchierea stinge `ok` si lasa un cursor, cand ordinea e crescatoare", async () => {
  const comenzi = lotCareTrunchiaza((i) => T0 + i * 1000);
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaOpen(comenzi, 99),
    ingereaza: async () => "created",
  });
  assert.equal(r.ok, false, "trunchierea trebuie sa stinga ok, altfel cursorul e cod mort");
  // Valoarea, nu doar tipul: `typeof === "number"` ar trece si cu un cursor gresit,
  // adica exact cu un cursor care SARE comenzi.
  const citite = PLAFON_PAGINI * PER_PAGINA;
  assert.equal(
    r.cursorMs,
    Date.parse(String(comenzi[citite - 1].created_at)),
    "cursorul e ULTIMA comanda chiar citita, nu alta",
  );
  assert.equal(
    marcajUrmator(r, { runStartMs: T0 + 999_999, overlapMs: OVERLAP }),
    r.cursorMs! + OVERLAP,
    "cursorul se scrie compensat cu suprapunerea care se scade la citire",
  );
});

/*
 * ⚠ Proba care conteaza cel mai mult: presupunerea despre API se demonstreaza
 * falsa la rulare, si atunci NU se inventeaza un cursor.
 */
test("cand comenzile NU vin crescator, cursorul se anuleaza si fereastra ramane pe loc", async () => {
  // Ordine zimtata: a doua comanda e mai VECHE decat prima.
  const comenzi = lotCareTrunchiaza((i) => T0 + (i === 1 ? -5000 : i * 1000));
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaOpen(comenzi, 99),
    ingereaza: async () => "created",
  });
  assert.equal(r.ok, false, "trunchierea s-a atins");
  assert.equal(r.cursorMs, undefined, "ordinea neasteptata NU are voie sa produca un cursor");
  // Fara cursor si fara citire completa, marcajul nu se misca: blocaj ZGOMOTOS,
  // nu pierdere tacuta.
  assert.equal(marcajUrmator(r, { runStartMs: T0 + 999_999, overlapMs: OVERLAP }), null);
});

test("o comanda fara `created_at` anuleaza cursorul", async () => {
  const fara = { order_number: "AY-x", status: "open", order_items: [] } as unknown as AboutYouOrder;
  const comenzi = lotCareTrunchiaza((i) => T0 + i * 1000);
  comenzi[3] = fara;
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaOpen(comenzi, 99),
    ingereaza: async () => "created",
  });
  assert.equal(r.cursorMs, undefined);
});

test("o comanda care arunca ingheata cursorul si stinge `ok`", async () => {
  const comenzi = lotCareTrunchiaza((i) => T0 + i * 1000);
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaOpen(comenzi, 99),
    ingereaza: async (o) => {
      if (o.order_number === "AY-2") throw new Error("consumul de stoc a picat");
      return "created";
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.cursorMs, undefined, "un status cu o comanda cazuta nu contribuie cu cursor");
});

test("cursorul care nu depaseste marcajul curent e refuzat", async () => {
  // Toate comenzile au exact momentul marcajului: fereastra urmatoare ar fi identica.
  const comenzi = lotCareTrunchiaza(() => T0);
  const r = await pollOrders(admin, ctx, new Date(T0).toISOString(), {
    aduPagina: sursaOpen(comenzi, 99),
    ingereaza: async () => "created",
  });
  assert.equal(r.cursorMs, undefined);
  assert.equal(marcajUrmator(r, { runStartMs: T0 + 999_999, overlapMs: OVERLAP }), null);
});

/*
 * ⚠ Testul care lipsea, si care ar fi prins defectul imediat.
 *
 * Un status citit COMPLET, cu ordine descrescatoare (sau cu o comanda fara
 * `created_at`), NU are voie sa strice cursorul statusului TRUNCHIAT: pe el s-a
 * citit tot, deci nu constrange nimic. Prima forma le amesteca intr-un singur
 * steag, iar rezultatul era `{ ok: false, cursorMs: undefined }` — adica marcajul
 * nu se mai scria NICIODATA, si nici comenzile noi nu mai intrau.
 */
test("un status COMPLET, in ordine rea, nu strica cursorul statusului trunchiat", async () => {
  const deschise = lotCareTrunchiaza((i) => T0 + i * 1000);
  const anulate = [comanda(900, T0 + 9000), comanda(901, T0 + 1000)]; // descrescator
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaPeStatusuri({ open: deschise, cancelled: anulate }, { open: 99 }),
    ingereaza: async () => "created",
  });
  assert.equal(r.ok, false, "statusul open e trunchiat");
  assert.equal(
    r.cursorMs,
    Date.parse(String(deschise[PLAFON_PAGINI * PER_PAGINA - 1].created_at)),
    "cursorul ramane cel al statusului trunchiat",
  );
});

test("o comanda cazuta pe ORICE status opreste avansul peste tot", async () => {
  const deschise = lotCareTrunchiaza((i) => T0 + i * 1000);
  const anulate = [comanda(900, T0 + 1000), comanda(901, T0 + 2000)];
  const r = await pollOrders(admin, ctx, new Date(T0 - 60_000).toISOString(), {
    aduPagina: sursaPeStatusuri({ open: deschise, cancelled: anulate }, { open: 99 }),
    ingereaza: async (o) => {
      if (o.order_number === "AY-901") throw new Error("consumul de stoc a picat");
      return "created";
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.cursorMs, undefined, "un esec real blocheaza avansul, oriunde s-ar produce");
});

test("peste mai multe ture: nimic pierdut si nimic blocat", async () => {
  /*
   * ⚠ Lotul trebuie sa DEPASEASCA plafonul, altfel prima tura citeste tot, `ok` e
   * adevarat, si testul iese fara sa fi atins cursorul niciodata. Prima forma avea
   * 30 de comenzi la un plafon de 80 — trecea, dar nu proba nimic.
   */
  const total = PLAFON_PAGINI * PER_PAGINA * 2 + 7;
  const toate = Array.from({ length: total }, (_, i) => comanda(i, T0 + i * 60_000));
  const vazute = new Set<string>();
  let marcaj = T0 - 3_600_000;
  let ture = 0;

  while (ture < 15) {
    ture++;
    const since = new Date(marcaj - OVERLAP).toISOString();
    const sinceMs = Date.parse(since);
    // Fereastra chiar filtreaza, ca in API.
    const inFereastra = toate.filter((o) => Date.parse(String(o.created_at)) >= sinceMs);
    const r = await pollOrders(admin, ctx, since, {
      aduPagina: sursaOpen(inFereastra),
      ingereaza: async (o) => { vazute.add(String(o.order_number)); return "created"; },
    });
    const urmator = marcajUrmator(r, { runStartMs: T0 + 10_000_000, overlapMs: OVERLAP });
    assert.notEqual(urmator, null, "nu are voie sa se blocheze cat timp mai e restanta");
    assert.ok(urmator! > marcaj, "marcajul trebuie sa avanseze strict");
    marcaj = urmator!;
    if (r.ok) break;
  }

  assert.ok(ture < 15, `trebuia sa termine restanta, a facut ${ture} ture`);
  assert.equal(vazute.size, total, "TOATE comenzile au fost citite, niciuna sarita");
});
