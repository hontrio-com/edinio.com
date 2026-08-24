import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { deCeNuSeVinde, EMAG_OFERTA_OPRITA, EMAG_OFERTA_SCOASA } from "./de-ce-nu-se-vinde";

/* ══════════════════════════════════════════════════════════════════════════
   PANOUL DE SUS (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Minea in trei feluri deodata: „In validare" numara starea NOASTRA si nu verdictul
   lor (3.445 din 3.693 erau de fapt aprobate), cartonasele se suprapuneau (cele 154
   respinse erau numarate de doua ori), si lipsea cu totul starea care privea cel mai
   mult catalogul — 3.089 „End of Life" plus 318 oprite, care se repornesc DOAR din
   panoul eMAG.

   Pe ecran: „Oferte 3754" si dedesubt 61 + 3693 + 154 = 3908.
*/

/** Toate etichetele pe care le poate da `deCeNuSeVinde`, culese din stari adevarate. */
function toateEtichetele(): Set<string> {
  const gasite = new Set<string>();
  for (const validation of [null, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
    for (const oferta of [null, 1, 2]) {
      for (const laEi of [null, 0, 1, EMAG_OFERTA_OPRITA, EMAG_OFERTA_SCOASA]) {
        for (const stoc of [null, 0, 5]) {
          gasite.add(deCeNuSeVinde({
            validation_status: validation,
            offer_validation_status: oferta,
            status_la_ei: laEi,
            stoc_la_ei: stoc,
            doc_errors: [],
          }).eticheta);
        }
      }
    }
  }
  return gasite;
}

test("fiecare stare are exact o eticheta: galetile nu se suprapun", () => {
  /* ⚠ Chiar defectul: „De revizuit" filtra pe `validation_status`, „In validare" pe
     `status`, si nu se excludeau niciodata. `deCeNuSeVinde` intoarce UNA singura, deci
     numaratoarea pe ea se aduna la total prin constructie. */
  const st = { validation_status: 8, offer_validation_status: 1, status_la_ei: 2, stoc_la_ei: 0, doc_errors: [] };
  const r = deCeNuSeVinde(st);
  assert.equal(typeof r.eticheta, "string");
  assert.equal(r.eticheta, "Respins de eMAG", "respinsa bate si scoaterea, si lipsa de stoc");
});

test("`validation_status: 12` e si respinsa, si vandabila: castiga respinsa", () => {
  /* ⚠ 12 e in AMANDOUA multimile. Ordinea `case`-ului e chiar regula, nu o preferinta. */
  const r = deCeNuSeVinde({
    validation_status: 12, offer_validation_status: 1, status_la_ei: 1, stoc_la_ei: 9, doc_errors: [],
  });
  assert.equal(r.eticheta, "Respins de eMAG");
  assert.equal(r.seVinde, false);
});

test("panoul cunoaste TOATE etichetele pe care le poate da verdictul", () => {
  /*
   * ⚠ Etichetele sunt CHEILE din raspunsul lui `numara_ofertele_emag`. Una lipsa din
   * lista ecranului inseamna o galeata plina care nu se arata nicaieri — exact ce s-a
   * intamplat cu cele 3.089 „End of Life".
   */
  const ecran = readFileSync("src/components/dashboard/EmagClient.tsx", "utf8");
  const i = ecran.indexOf("const ORDINEA_STARILOR = [");
  assert.notEqual(i, -1, "ecranul n-are lista starilor");
  const lista = ecran.slice(i, ecran.indexOf("] as const;", i));

  for (const eticheta of toateEtichetele()) {
    assert.ok(lista.includes(`"${eticheta}"`), `panoul nu arata niciodata „${eticheta}”`);
  }
});

test("functia din baza foloseste ACELEASI cuvinte ca verdictul", () => {
  /*
   * ⚠ Numaratoarea se face in SQL, ca sa nu depinda de marimea catalogului. Pretul e ca
   * regula sta scrisa in doua locuri. Deci se compara: o litera schimbata intr-unul din
   * ele, si cartonasul arata zero pentru o galeata plina.
   */
  const sql = readFileSync("migrations/2026-10-06-panoul-emag-adevarat.sql", "utf8");
  for (const eticheta of toateEtichetele()) {
    assert.ok(sql.includes(`'${eticheta}'`), `functia din baza nu da niciodata „${eticheta}”`);
  }
});

test("necitit NU se numara ca vandut", () => {
  /* ⚠ `null` inseamna „n-am intrebat inca", nu „e in regula". Confundate, un rand
     necitit ar fi aratat verde. Sunt 742 asa pe contul real. */
  const r = deCeNuSeVinde({
    validation_status: 9, offer_validation_status: 1, status_la_ei: null, stoc_la_ei: null, doc_errors: [],
  });
  assert.equal(r.seVinde, false);
  assert.equal(r.eticheta, "Încă necitit de la eMAG");
});
