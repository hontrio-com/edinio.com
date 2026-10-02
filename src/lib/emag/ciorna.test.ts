import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deCeNuSeVinde, EMAG_VALIDARE_CIORNA, INDRUMARE_CIORNA_EDINIO } from "./de-ce-nu-se-vinde";
import { EMAG_VALIDARE } from "./types";
import { VALIDARE_RA } from "./probleme";

/*
  CIORNA LA eMAG (02.10.2026)

  Yvelle a trimis noua genti de trei ori si n-au aparut pe eMAG. Cererile treceau,
  ecranul scria „trimis”. La ei, fisele erau „Draft”: plecasera fara nicio
  caracteristica, iar o ciorna nu ajunge la validare. OKXI avea 45 la fel din august.
*/

test("ciorna se spune pe nume, cu ce e de facut, oriunde apare", () => {
  const r = deCeNuSeVinde({
    validation_status: EMAG_VALIDARE_CIORNA, offer_validation_status: 1, status_la_ei: 1, stoc_la_ei: 1,
    doc_errors: [], creat_de_edinio: true,
  });
  assert.equal(r.eticheta, "Ciornă la eMAG");
  assert.equal(r.seVinde, false);
  assert.equal(r.indrumare, INDRUMARE_CIORNA_EDINIO);
  assert.match(INDRUMARE_CIORNA_EDINIO, /Specificații produs/);
  assert.match(EMAG_VALIDARE[0], /Ciornă/, "coloana de validare din lista de oferte");
  assert.match(VALIDARE_RA[0], /Ciornă/, "centrul de probleme o numara");
});

test("respinsa si in validare raman inaintea ciornei; ciorna inaintea starii ofertei", () => {
  const baza = { offer_validation_status: 1, stoc_la_ei: 1, doc_errors: [] as string[] };
  assert.equal(deCeNuSeVinde({ ...baza, validation_status: 4, status_la_ei: 1 }).eticheta, "În validare la eMAG");
  assert.equal(deCeNuSeVinde({ ...baza, validation_status: 0, status_la_ei: 2 }).eticheta, "Ciornă la eMAG");
});

test("trimiterea unui produs NOU fara caracteristici o spune pe loc", () => {
  const s = readFileSync("src/lib/emag/trimite.ts", "utf8");
  assert.match(s, /const produsNouLaEi = cuCheie\.some\(\(r\) => !r\.part_number_key\);/);
  assert.match(s, /if \(produsNouLaEi && potrivite\.caracteristici\.length === 0\) \{\s*observatii\.push\(`Fișa pleacă fără nicio caracteristică\. \$\{INDRUMARE_CIORNA_EDINIO\}`\);/);
});
