import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coletDeTrimisInapoi, nuSeTrimiteInapoi } from "./retur-forma";
import type { TrendyolClaim } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   CHEILE LOR, ASA CUM LE SCRIU EI (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Campurile de nivel intai ale unei cereri, din raspunsul-exemplu al lui `reference/getclaims`:

     id · claimId · orderNumber · orderDate · customerFirstName · customerLastName · claimDate
     cargoTrackingNumber · cargoTrackingLink · cargoSenderNumber · cargoProviderName
     orderShipmentPackageId · replacementOutboundpackageinfo · rejectedpackageinfo · items
     lastModifiedDate · orderOutboundPackageId

   ⚠ DOUA LUCRURI IES DIN LISTA ASTA, si amandoua ne costau:

     1. `status` NU EXISTA. Il scriam in `claim_status`, care iesea NULL la fiecare rand.
     2. `rejectedpackageinfo` E CU `p` MIC. Noi il citeam `rejectedPackageInfo`.

   ⚠ Iar schema lor foloseste ALTA scriere decat exemplul lor — deci nu se poate sti care vine in
   trafic, si n-avem cum sa masuram: niciun cont al nostru n-are inca vreun retur.
*/

const colet = { dontShipBack: false, cargoTrackingNumber: 123 };

test("⚠ coletul se citeste si cu `P` mare, si cu `p` mic", () => {
  /*
   * ⚠ CE AR FI COSTAT sa ghicesc gresit: `colet_respins` si `dont_ship_back` raman goale, deci
   * comerciantul nu afla NICIODATA ca are un colet de trimis inapoi clientului. Netrimis, returul
   * se intoarce impotriva lui — chiar paguba pentru care s-a scris toata bucata asta.
   */
  assert.deepEqual(coletDeTrimisInapoi({ rejectedPackageInfo: colet } as TrendyolClaim), colet);
  assert.deepEqual(coletDeTrimisInapoi({ rejectedpackageinfo: colet } as TrendyolClaim), colet);

  /* ⚠ Si cele trei stari raman trei, pe amandoua scrierile. */
  assert.equal(nuSeTrimiteInapoi({ rejectedpackageinfo: colet } as TrendyolClaim), false);
  assert.equal(nuSeTrimiteInapoi({ rejectedpackageinfo: { dontShipBack: true } } as TrendyolClaim), true);
  assert.equal(nuSeTrimiteInapoi({} as TrendyolClaim), null, "absenta NU e `false`");
});

test("⚠ absenta ramane a treia stare, nu se scurge in `false`", () => {
  /* Documentatia lor: „If there is no return rejection package, this field will not appear."
     Un `?? false` i-ar fi spus comerciantului „ai de trimis un colet" la fiecare retur respins —
     iar cand alarma suna mereu, nu mai suna deloc. */
  assert.equal(coletDeTrimisInapoi({} as TrendyolClaim), null);
  assert.equal(nuSeTrimiteInapoi({ rejectedpackageinfo: {} } as TrendyolClaim), null,
    "colet fara `dontShipBack` inseamna tot „nu stim”");
});

test("⚠ fiecare camp pe care il citim e ori in lista lor, ori numit ca abatere", () => {
  /*
   * Proba asta exista fiindca `status` a trecut neobservat: restul fisierului isi marcheaza anume
   * campurile verificate, iar acela statea gol printre ele. Ce nu e in lista lor trebuie sa aiba
   * langa el o nota care spune DE CE.
   */
  const ALE_LOR = new Set([
    "id", "claimId", "orderNumber", "orderDate", "customerFirstName", "customerLastName",
    "claimDate", "cargoTrackingNumber", "cargoTrackingLink", "cargoSenderNumber",
    "cargoProviderName", "orderShipmentPackageId", "replacementOutboundpackageinfo",
    "rejectedpackageinfo", "items", "lastModifiedDate", "orderOutboundPackageId",
  ]);
  /* ⚠ Abaterile stiute, fiecare cu motivul ei scris in tip. */
  const ABATERI_EXPLICATE = new Set([
    "shipmentPackageId",     // fallback vechi; nota spune ca „nu exista in raspuns"
    "rejectedPackageInfo",   // cealalta scriere, fiindca schema lor difera de exemplul lor
    "status",                // NU exista; pastrat doar ca sa nu fie recitit din greseala
    "claimItems",            // forma plata, pe care unele raspunsuri o mai dau
  ]);

  const t = readFileSync("src/lib/trendyol/types.ts", "utf8");
  const i = t.indexOf("export interface TrendyolClaim {");
  const bloc = t.slice(i, t.indexOf("\n}", i));
  const campuri = [...bloc.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);

  assert.ok(campuri.length > 10, `am gasit doar ${campuri.length} campuri; regexul s-a rupt`);
  for (const c of campuri) {
    assert.ok(ALE_LOR.has(c) || ABATERI_EXPLICATE.has(c),
      `\`${c}\` nu e in lista lor si nu e o abatere explicata. Verifica-l in `
      + "`reference/getclaims` inainte sa te bazezi pe el — asa a trecut `status`.");
  }
});

test("⚠ si nimeni nu mai citeste `c.status`", () => {
  for (const f of ["src/lib/trendyol/retururi.ts", "src/lib/trendyol/retur-forma.ts"]) {
    const viu = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(viu, /\bc\.status\b/, f);
  }
});
