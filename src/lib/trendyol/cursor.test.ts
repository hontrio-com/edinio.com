import assert from "node:assert/strict";
import { test } from "node:test";
import { marcajUrmator, pollPackages, type AducePagina } from "./orders";
import type { TrendyolSyncContext } from "./sync";
import type { TrendyolShipmentPackage } from "./types";

/**
 * Cursorul de sincronizare a comenzilor Trendyol, probat pe bucla ADEVARATA.
 *
 * ═══ DE CE TESTELE ASTEA ═══
 *
 * Trunchierea la 5 pagini nu se poate atinge cu date reale: masurat, 12 comenzi
 * Trendyol in toata baza. Deci singurul mod de a sti daca mecanismul e corect e
 * sa-i dai paginile de mana. Prima forma a reparatiei avea cursorul CORECT si
 * totusi pierdea comenzi, fiindca apelantul nu-l citea niciodata — un defect pe
 * care nicio citire atenta a cursorului singur nu-l gaseste.
 *
 * Probele merg pe TREI proprietati, in ordinea in care conteaza:
 *   1. nu se pierde nicio comanda;
 *   2. se face progres la fiecare tura (nu exista blocaj);
 *   3. nu se reciteste la nesfarsit acelasi lot.
 */

const OVERLAP = 5 * 60 * 1000;

const ctx = { businessId: "biz", auth: {}, config: {} } as unknown as TrendyolSyncContext;
const admin = {} as never;

function pachet(id: number, lastModifiedDate: number): TrendyolShipmentPackage {
  return { shipmentPackageId: id, orderNumber: `TY-${id}`, lastModifiedDate, lines: [] } as TrendyolShipmentPackage;
}

/** O sursa de pagini care taie o lista de pachete in pagini de `size`. */
function surse(pachete: TrendyolShipmentPackage[], size = 3): { aduPagina: AducePagina; cerute: number[] } {
  const cerute: number[] = [];
  const aduPagina: AducePagina = async ({ startDate, endDate, page }) => {
    cerute.push(page);
    // Fereastra chiar filtreaza, ca in API: altfel cursorul „ar merge" degeaba.
    const inFereastra = pachete
      .filter((p) => Number(p.lastModifiedDate) >= startDate && Number(p.lastModifiedDate) <= endDate)
      .sort((a, b) => Number(a.lastModifiedDate) - Number(b.lastModifiedDate));
    const totalPages = Math.max(1, Math.ceil(inFereastra.length / size));
    return { content: inFereastra.slice(page * size, page * size + size), totalPages };
  };
  return { aduPagina, cerute };
}

// ── Regula de marcaj, izolat ───────────────────────────────────────────────────

test("citire completa: marcajul sare la momentul rularii", () => {
  assert.equal(marcajUrmator({ ok: true }, { runStartMs: 1000, overlapMs: OVERLAP }), 1000);
});

test("citire partiala CU cursor: marcajul e cursorul, compensat cu suprapunerea", () => {
  // Compensarea nu e cosmetica: la citire se scad `overlapMs` din marcaj, deci
  // fara ea fereastra urmatoare ar porni INAINTEA cursorului.
  assert.equal(marcajUrmator({ ok: false, cursorMs: 900 }, { runStartMs: 1000, overlapMs: OVERLAP }), 900 + OVERLAP);
});

test("citire partiala FARA cursor: nu se muta nimic", () => {
  assert.equal(marcajUrmator({ ok: false }, { runStartMs: 1000, overlapMs: OVERLAP }), null);
});

// ── Bucla, cu pagini date de mana ──────────────────────────────────────────────

test("fara trunchiere, `ok` ramane adevarat si nu se cere cursor", async () => {
  const acum = Date.now();
  const pachete = [pachet(1, acum - 9000), pachet(2, acum - 8000)];
  const { aduPagina } = surse(pachete, 10);
  const r = await pollPackages(admin, ctx, acum - 60_000, { aduPagina, ingereaza: async () => "created" });
  assert.equal(r.ok, true);
  assert.equal(r.ingested, 2);
});

test("trunchierea stinge `ok` — altfel cursorul e cod mort", async () => {
  const acum = Date.now();
  // 20 de pachete, pagini de 3, plafon de 5 pagini => se citesc 15, raman 5.
  const pachete = Array.from({ length: 20 }, (_, i) => pachet(i, acum - 100_000 + i * 1000));
  const { aduPagina } = surse(pachete, 3);
  const r = await pollPackages(admin, ctx, acum - 200_000, { aduPagina, ingereaza: async () => "created" });
  assert.equal(r.ok, false, "trunchierea trebuie sa stinga ok, ca apelantul sa citeasca cursorul");
  assert.equal(r.ingested, 15);
  assert.equal(r.cursorMs, Number(pachete[14].lastModifiedDate), "cursorul e ultimul pachet CHIAR citit");
});

test("un pachet cazut ingheata cursorul acolo, nu mai departe", async () => {
  const acum = Date.now();
  const pachete = Array.from({ length: 6 }, (_, i) => pachet(i, acum - 60_000 + i * 1000));
  const { aduPagina } = surse(pachete, 3);
  const r = await pollPackages(admin, ctx, acum - 120_000, {
    aduPagina,
    // al treilea pachet pica; tot ce urmeaza nu mai are voie sa mute cursorul
    ingereaza: async (p) => (Number(p.shipmentPackageId) === 2 ? "failed" : "created"),
  });
  assert.equal(r.ok, false);
  assert.equal(r.cursorMs, Number(pachete[1].lastModifiedDate), "cursorul sta INAINTEA pachetului cazut");
});

test("un pachet `skipped` NU ingheata cursorul", async () => {
  /*
   * „skipped" inseamna un pachet care nu va intra niciodata asa cum e (date
   * respinse de o constrangere). Inghetat si pe el, cursorul ar ramane in urma lui
   * la fiecare rulare — si cum trunchierea stinge `ok`, fereastra s-ar opri
   * definitiv acolo. Un pachet otravit strica un pachet, nu magazinul.
   */
  const acum = Date.now();
  const pachete = Array.from({ length: 4 }, (_, i) => pachet(i, acum - 60_000 + i * 1000));
  const { aduPagina } = surse(pachete, 2);
  const r = await pollPackages(admin, ctx, acum - 120_000, {
    aduPagina,
    ingereaza: async (p) => (Number(p.shipmentPackageId) === 1 ? "skipped" : "created"),
  });
  assert.equal(r.cursorMs, Number(pachete[3].lastModifiedDate), "cursorul trece peste pachetul otravit");
});

// ── Proba care conteaza cel mai mult: mai multe ture la rand ───────────────────

test("peste mai multe ture: nimic pierdut, nimic blocat, nimic reluat la infinit", async () => {
  const acum = Date.now();
  // 40 de pachete raspandite pe o ora; pagini de 3 x 5 pagini = 15 pe tura.
  const pachete = Array.from({ length: 40 }, (_, i) => pachet(i, acum - 3_600_000 + i * 60_000));
  const { aduPagina, cerute } = surse(pachete, 3);

  const ingerate: number[] = [];
  let marcaj = acum - 7_200_000; // magazin cu restanta
  let ture = 0;

  while (ture < 20) {
    ture++;
    const sinceMs = marcaj - OVERLAP;
    const runStart = acum;
    const r = await pollPackages(admin, ctx, sinceMs, {
      aduPagina,
      ingereaza: async (p) => {
        const id = Number(p.shipmentPackageId);
        if (!ingerate.includes(id)) ingerate.push(id);
        return "created";
      },
    });
    const urmator = marcajUrmator(r, { runStartMs: runStart, overlapMs: OVERLAP });
    assert.notEqual(urmator, null, "nu are voie sa se blocheze: exista mereu cursor sau citire completa");
    assert.ok(urmator! > marcaj || r.ok, "marcajul trebuie sa avanseze strict cat timp mai e restanta");
    marcaj = urmator!;
    if (r.ok) break;
  }

  assert.ok(ture < 20, `trebuia sa termine restanta, a facut ${ture} ture`);
  assert.equal(ingerate.length, 40, "TOATE cele 40 de comenzi au fost citite, niciuna sarita");
  assert.ok(cerute.length < 60, "nu s-au cerut pagini la nesfarsit");
});

test("cursorul care nu avanseaza e refuzat, ca sa nu se reciteasca acelasi lot la infinit", async () => {
  /*
   * Cazul: toate pachetele citite au aceeasi milisecunda, deci cursorul ar iesi
   * egal cu marginea de jos a ferestrei. Fara garda, fereastra urmatoare ar fi
   * identica. Se refuza cursorul si se striga, in loc sa se invarta in gol.
   */
  const acum = Date.now();
  const cand = acum - 60_000;
  const pachete = Array.from({ length: 20 }, (_, i) => pachet(i, cand));
  const { aduPagina } = surse(pachete, 3);
  const r = await pollPackages(admin, ctx, cand, { aduPagina, ingereaza: async () => "created" });
  assert.equal(r.ok, false);
  assert.equal(r.cursorMs, undefined, "cursorul care nu creste nu se foloseste");
  assert.equal(marcajUrmator(r, { runStartMs: acum, overlapMs: OVERLAP }), null);
});

test("fara `lastModifiedDate` nu se inventeaza cursor", async () => {
  const acum = Date.now();
  const fara = Array.from({ length: 20 }, (_, i) =>
    ({ shipmentPackageId: i, orderNumber: `TY-${i}`, lines: [] } as TrendyolShipmentPackage));
  const aduPagina: AducePagina = async ({ page }) => ({
    content: fara.slice(page * 3, page * 3 + 3),
    totalPages: Math.ceil(fara.length / 3),
  });
  const r = await pollPackages(admin, ctx, acum - 60_000, { aduPagina, ingereaza: async () => "created" });
  assert.equal(r.ok, false);
  assert.equal(r.cursorMs, undefined);
  // Fereastra ramane pe loc — blocaj, dar ZGOMOTOS, nu pierdere tacuta.
  assert.equal(marcajUrmator(r, { runStartMs: acum, overlapMs: OVERLAP }), null);
});
