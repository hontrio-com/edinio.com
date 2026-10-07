import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { numarDeUrmarire } from "./awb-propriu";

/*
 * Ce numar primeste CUMPARATORUL in notificarea de expediere. ⚠ Numarul cu care se cauta la
 * curierul care chiar livreaza: la Curiera, al partenerului (DPD). Cerut de un magazin cu 90 de
 * AWB-uri Curiera, 88 cu numar DPD salvat si nevazut de client (07.10.2026).
 */

test("Curiera cu partener: numarul si numele PARTENERULUI, iar al Curierei alaturi", () => {
  assert.deepEqual(
    numarDeUrmarire({ curiera_awb_number: "710915533", curiera_partener: "DPD", curiera_partener_awb: " 80000000001 " }),
    { curier: "DPD", awb: "80000000001", prin: { curier: "Curiera", awb: "710915533" } },
  );
});

test("Curiera fara partener (inca necompletat de cron): numarul Curierei, ca inainte", () => {
  assert.deepEqual(numarDeUrmarire({ curiera_awb_number: "710915533" }), { curier: "Curiera", awb: "710915533" });
  assert.deepEqual(
    numarDeUrmarire({ curiera_awb_number: "710915533", curiera_partener: "DPD", curiera_partener_awb: "  " }),
    { curier: "Curiera", awb: "710915533" },
  );
  /* Numar de partener fara nume: nu se poate spune „Curier: ?", deci ramane Curiera. */
  assert.deepEqual(
    numarDeUrmarire({ curiera_awb_number: "710915533", curiera_partener: null, curiera_partener_awb: "80000000001" }),
    { curier: "Curiera", awb: "710915533" },
  );
});

test("ceilalti curieri nu primesc `prin`", () => {
  assert.deepEqual(numarDeUrmarire({ cargus_awb_number: "123" }), { curier: "Cargus", awb: "123" });
});

test("⚠ emailul din panou scrie si numarul brokerului", () => {
  const s = readFileSync("src/components/dashboard/OrderDetailClient.tsx", "utf8");
  assert.match(s, /expedierePeComanda\?\.prin \? `\\nAWB \$\{expedierePeComanda\.prin\.curier\}: \$\{expedierePeComanda\.prin\.awb\}`/);
});

test("⚠ contul cumparatorului da numarul partenerului, cu numele lui in `curier_real`", () => {
  const s = readFileSync("migrations/2026-10-07-epacket-curier.sql", "utf8");
  assert.match(s, /\('curiera',\s+coalesce\(nullif\(btrim\(o\.curiera_partener_awb\), ''\), o\.curiera_awb_number\)/);
  assert.match(s, /case when nullif\(btrim\(o\.curiera_partener_awb\), ''\) is not null then nullif\(btrim\(o\.curiera_partener\), ''\) end\)/);
});
