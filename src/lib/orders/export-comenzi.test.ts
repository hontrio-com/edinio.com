import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { celulaFoii, foaiaExportului, tabelulExportului, type ComandaExport } from "./export-comenzi";

/*
 * Exportul .xlsx al comenzilor. Formele sunt cele reale (07.10.2026), cu date inventate: un cont
 * care comanda pentru doua persoane, campurile de checkout ale magazinului care a cerut exportul
 * („Cod postal", „Tara", „Punct reper"), si un AWB Curiera cu partenerul DPD.
 */

const CAMPURI = [
  { id: "cf_1", label: "Cod postal" },
  { id: "cf_2", label: "Tara" },
  { id: "cf_3", label: "Punct reper" },
  { id: "cf_4", label: "Marime inel" },
];

const baza = (o: Partial<ComandaExport>): ComandaExport => ({
  id: "o1", order_number: "#1001", created_at: "2026-10-07T12:17:00.000Z", status: "shipped",
  payment_method: "cash_on_delivery", payment_status: "unpaid", total: "199.90",
  customer_name: "Ana Pop", customer_phone: "0722000000", customer_email: "ana@exemplu.ro",
  billing_company: null, shipping_address: { address: "Str. Mare 12", city: "Iasi", county: "Iasi" }, notes: null,
  ...o,
});

const COMENZI: ComandaExport[] = [
  baza({
    id: "o1", notes: JSON.stringify({ cf_1: "700001", cf_2: "Romania", cf_3: "langa scoala", cf_vechi: "x" }),
    curiera_awb_number: "710915533", curiera_partener: "DPD", curiera_partener_awb: "80000000001",
  }),
  baza({ id: "o2", order_number: "#1002", customer_name: "Ion Pop", customer_email: "ion@exemplu.ro", notes: JSON.stringify({ cf_1: "400001" }) }),
  baza({ id: "o3", order_number: "#1003", customer_email: null }),
];

const CONTURI = {
  o1: { contId: "c-1", nume: "Revanzator", email: "cont@exemplu.ro" },
  o2: { contId: "c-1", nume: "Revanzator", email: "cont@exemplu.ro" },
};

const t = tabelulExportului(COMENZI, CONTURI, CAMPURI);
const col = (antet: string) => t.antete.indexOf(antet);

describe("Tabelul exportului", () => {
  test("⚠⚠ contul leaga comenzile puse pentru persoane diferite", () => {
    assert.deepEqual(t.randuri.map((r) => r[col("ID cont")]), ["c-1", "c-1", null]);
    assert.deepEqual(t.randuri.map((r) => r[col("Cont: email")]), ["cont@exemplu.ro", "cont@exemplu.ro", null]);
    /* Emailul COMENZII ramane al destinatarului. */
    assert.deepEqual(t.randuri.map((r) => r[col("Email")]), ["ana@exemplu.ro", "ion@exemplu.ro", null]);
  });

  test("fiecare camp de checkout are coloana lui, cu eticheta magazinului, in ordinea configurarii", () => {
    const coloaneCampuri = t.antete.slice(col("ID cont") + 1);
    /* „Marime inel" n-are nicio valoare: nu umple foaia. Cheia stearsa din configurare vine la urma. */
    /* ⚠ „Cod postal" si „Tara" exista si ca coloane fixe: campul primeste „(formular)". */
    assert.deepEqual(coloaneCampuri, ["Cod postal (formular)", "Tara (formular)", "Punct reper", "Vechi"]);
    assert.equal(new Set(t.antete).size, t.antete.length, "doua coloane cu acelasi antet");
    assert.equal(t.randuri[0][col("Punct reper")], "langa scoala");
    assert.equal(t.randuri[1][col("Cod postal (formular)")], "400001");
    assert.equal(t.randuri[2][col("Cod postal (formular)")], null);
    /* Antetele si latimile au aceeasi lungime, si fiecare rand la fel. */
    assert.equal(t.latimi.length, t.antete.length);
    for (const r of t.randuri) assert.equal(r.length, t.antete.length);
  });

  test("AWB-ul e al curierului care livreaza; brokerul ramane alaturi", () => {
    assert.equal(t.randuri[0][col("Curier")], "DPD");
    assert.equal(t.randuri[0][col("AWB")], "80000000001");
    assert.equal(t.randuri[0][col("AWB intermediar")], "Curiera 710915533");
    assert.equal(t.randuri[1][col("AWB")], null);
  });

  test("totalul e NUMAR, data e DATA, starea e textul din panou", () => {
    assert.equal(t.randuri[0][col("Total")], 199.9);
    assert.deepEqual(t.randuri[0][col("Data")], { data: "2026-10-07T12:17:00.000Z" });
    assert.equal(typeof t.randuri[0][col("Status")], "string");
    assert.notEqual(t.randuri[0][col("Status")], "shipped", "starea iese cu eticheta din panou, nu cu cheia");
  });
});

describe("Celulele foii", () => {
  test("⚠ data iese pe ora ROMANIEI (Excel n-are fus orar; biblioteca socoteste din UTC)", () => {
    const c = celulaFoii({ data: "2026-10-07T12:17:00.000Z" });
    assert.ok(c && "type" in c && c.type === Date);
    /* 12:17 UTC = 15:17 in Romania (ora de vara, UTC+3). */
    assert.equal((c.value as Date).toISOString(), "2026-10-07T15:17:00.000Z");
    const iarna = celulaFoii({ data: "2026-12-07T12:17:00.000Z" });
    assert.equal(((iarna as { value: Date }).value).toISOString(), "2026-12-07T14:17:00.000Z");
    assert.equal(celulaFoii({ data: "nu e data" }), null);
  });

  test("numerele raman numere, golurile raman goale", () => {
    assert.deepEqual(celulaFoii(12.5), { value: 12.5, type: Number, format: "#,##0.00" });
    assert.equal(celulaFoii(null), null);
    assert.deepEqual(celulaFoii("text"), { value: "text" });
  });
});

describe("Fisierul adevarat, dus si intors", () => {
  test("se scrie cu biblioteca si se citeste inapoi la fel", async () => {
    const { default: writeExcelFile } = await import("write-excel-file/node");
    const { default: readExcelFile } = await import("read-excel-file/node");
    const buf = await writeExcelFile(foaiaExportului(t) as never, { columns: t.latimi.map((width) => ({ width })) }).toBuffer();
    /* `read-excel-file` intoarce o lista de foi. */
    const [{ data: randuri }] = (await readExcelFile(buf)) as unknown as { data: unknown[][] }[];
    assert.deepEqual(randuri[0], t.antete);
    assert.equal(randuri.length, 1 + COMENZI.length);
    assert.equal(randuri[1][col("ID cont")], "c-1");
    assert.equal(randuri[1][col("Total")], 199.9);
    assert.equal(randuri[1][col("Punct reper")], "langa scoala");
  });
});

describe("Coloanele citite de export", () => {
  test("⚠ acopera FIECARE coloana de AWB din harta (altfel o comanda ar iesi „fara AWB”)", () => {
    const harta = readFileSync("src/lib/orders/awb-propriu.ts", "utf8");
    const bloc = harta.slice(harta.indexOf("export const COLOANA_AWB"), harta.indexOf("};", harta.indexOf("export const COLOANA_AWB")));
    /* Numai perechile `curier: "coloana"`, nu cuvintele dintre ghilimele din comentarii. */
    const coloane = [...bloc.matchAll(/^\s*[a-z]+: "([a-z_]+)",/gm)].map((m) => m[1]);
    assert.ok(coloane.length >= 19, coloane.join(","));
    const actiune = readFileSync("src/lib/actions/export-comenzi.actions.ts", "utf8");
    for (const c of coloane) assert.ok(actiune.includes(c), `exportul nu citeste ${c}`);
    for (const c of ["curiera_partener", "curiera_partener_awb", "packeta_external_tracking"]) {
      assert.ok(actiune.includes(c), `exportul nu citeste ${c}`);
    }
  });
});
