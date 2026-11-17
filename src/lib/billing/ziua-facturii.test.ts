import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { ziuaCalendaristica, ziuaPlus } from "./ziua-facturii";

describe("ziua documentului fiscal, in calendarul Romaniei", () => {
  test("⚠ noaptea, ziua Romaniei e deja urmatoarea: 01:30 pe 1 decembrie nu e 30 noiembrie", () => {
    /* 1.12.2026 01:30 la Bucuresti = 30.11.2026 23:30 UTC (iarna, UTC+2). */
    assert.equal(ziuaCalendaristica(new Date("2026-11-30T23:30:00Z")), "2026-12-01");
    /* Vara, UTC+3: 1.07.2026 02:30 la Bucuresti = 30.06.2026 23:30 UTC. */
    assert.equal(ziuaCalendaristica(new Date("2026-06-30T23:30:00Z")), "2026-07-01");
    /* Ziua, cele doua coincid. */
    assert.equal(ziuaCalendaristica(new Date("2026-11-30T12:00:00Z")), "2026-11-30");
  });
  test("scadenta: zile calendaristice, peste luna si an", () => {
    assert.equal(ziuaPlus("2026-12-01", 0), "2026-12-01");
    assert.equal(ziuaPlus("2026-12-25", 15), "2027-01-09");
    assert.equal(ziuaPlus("2028-02-28", 1), "2028-02-29", "an bisect");
    assert.equal(ziuaPlus("2026-03-28", 3), "2026-03-31", "trecerea la ora de vara nu muta ziua");
  });
});

describe("casele vechi nu mai iau ziua UTC", () => {
  const viu = (f: string) => faraComentarii(readFileSync(f, "utf8"));
  test("SmartBill, Oblio si fGO: nicio data de document sau scadenta din `toISOString()`", () => {
    for (const f of [
      "src/lib/actions/smartbill.actions.ts",
      "src/lib/actions/oblio.actions.ts",
      "src/lib/actions/fgo.actions.ts",
      "src/lib/smartbill.ts",
    ]) {
      assert.ok(!/toISOString\(\)\.split\("T"\)\[0\]/.test(viu(f)), `${f}: ziua UTC pe un document`);
    }
  });
  test("SmartBill si Oblio pun ziua documentului pe randul de registru (SAGA o ia de acolo)", () => {
    const sb = viu("src/lib/actions/smartbill.actions.ts");
    assert.match(sb, /data: params\.issueDate \?\? null/);
    assert.match(sb, /data: ziuaStornarii/);
    const ob = viu("src/lib/actions/oblio.actions.ts");
    assert.match(ob, /data: data\.issueDate \?\? null/);
    assert.match(ob, /data: stornoData\.issueDate \?\? null/);
  });
});
