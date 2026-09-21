import test from "node:test";
import assert from "node:assert/strict";

import {
  DESPRE_STARE, DE_CE_DOUA_CIFRE, STARI, sePoateFolosi, stareaCodului,
  toateMotivele, utilizarile, type CodDeJudecat,
} from "./stare";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CE TINE UN COD DIN A FI FOLOSIT                               (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana acum ecranul arata doua stari si le socotea pe loc, in mijlocul randului
 * din tabel. Le va intreba insa si filtrul, si sertarul, si cardurile din cap.
 *
 * ⚠⚠ Scrisa de patru ori, regula s-ar fi despartit — iar atunci filtrul
 * „expirate" ar fi aratat alte coduri decat cele scrise „Expirat" in tabel, si
 * nimic n-ar fi dat vreo eroare.
 */

const ACUM = new Date("2026-09-21T12:00:00Z").getTime();
const zile = (n: number) => new Date(ACUM + n * 86_400_000).toISOString();

function cod(p: Partial<CodDeJudecat> = {}): CodDeJudecat {
  return { is_active: true, starts_at: null, expires_at: null, max_uses: null, uses_count: 0, ...p };
}

test("un cod fara nicio piedica e activ", () => {
  assert.equal(stareaCodului(cod(), ACUM), "activ");
  assert.equal(sePoateFolosi(cod(), ACUM), true);
  assert.deepEqual(toateMotivele(cod(), ACUM), []);
});

test("fiecare piedica, luata singura", () => {
  assert.equal(stareaCodului(cod({ is_active: false }), ACUM), "oprit");
  assert.equal(stareaCodului(cod({ expires_at: zile(-1) }), ACUM), "expirat");
  assert.equal(stareaCodului(cod({ max_uses: 5, uses_count: 5 }), ACUM), "epuizat");
  assert.equal(stareaCodului(cod({ starts_at: zile(3) }), ACUM), "programat");
});

test("⚠⚠ ORDINEA e cea a lucrului de facut, nu una intamplatoare", () => {
  /*
   * Un cod poate fi deodata oprit, expirat SI epuizat. Pe rand incape o singura
   * eticheta, si trebuie sa fie cea care ii spune comerciantului ce are de facut
   * INTAI. „Oprit" e singura stare pusa de om, deci prima.
   */
  const tot = cod({ is_active: false, expires_at: zile(-1), max_uses: 5, uses_count: 5 });
  assert.equal(stareaCodului(tot, ACUM), "oprit");

  const expiratSiEpuizat = cod({ expires_at: zile(-1), max_uses: 5, uses_count: 5 });
  assert.equal(stareaCodului(expiratSiEpuizat, ACUM), "expirat");
});

test("⚠⚠ dar SERTARUL arata TOATE motivele, nu doar primul", () => {
  /*
   * Cine reaprinde un cod oprit SI expirat trebuie sa afle acum ca mai are un
   * pas — nu dupa ce apasa comutatorul si nu se intampla nimic.
   */
  const tot = cod({ is_active: false, expires_at: zile(-1), max_uses: 5, uses_count: 5 });
  assert.deepEqual(toateMotivele(tot, ACUM), ["oprit", "expirat", "epuizat"]);
  assert.equal(sePoateFolosi(tot, ACUM), false);
});

test("⚠ marginile de timp: chiar in clipa pornirii merge, chiar in clipa expirarii nu", () => {
  /*
   * `expires_at` inseamna „pana la", deci la fix acea clipa codul a expirat.
   * `starts_at` inseamna „de la", deci la fix acea clipa merge. Puse amandoua
   * pe `<`, un cod programat la miezul noptii n-ar fi pornit decat la 00:00:01.
   */
  assert.equal(stareaCodului(cod({ starts_at: new Date(ACUM).toISOString() }), ACUM), "activ");
  assert.equal(stareaCodului(cod({ expires_at: new Date(ACUM).toISOString() }), ACUM), "activ");
  assert.equal(stareaCodului(cod({ expires_at: new Date(ACUM - 1).toISOString() }), ACUM), "expirat");
});

test("⚠ o data stricata NU opreste codul", () => {
  /*
   * `new Date("maine").getTime()` da `NaN`, iar `NaN < acum` e fals. Citit fara
   * paza, un rand cu data stricata ar fi picat pe ramura de expirare sau ar fi
   * aruncat. Se poarta ca si cum n-ar avea data.
   */
  assert.equal(stareaCodului(cod({ expires_at: "maine" }), ACUM), "activ");
  assert.equal(stareaCodului(cod({ starts_at: "" }), ACUM), "activ");
});

test("⚠ `epuizat` cere `max_uses`, nu se deduce din zero", () => {
  /* Fara limita, oricate utilizari ar fi, codul nu se epuizeaza niciodata. */
  assert.equal(stareaCodului(cod({ max_uses: null, uses_count: 9999 }), ACUM), "activ");
  assert.equal(stareaCodului(cod({ max_uses: 10, uses_count: 9 }), ACUM), "activ");
  assert.equal(stareaCodului(cod({ max_uses: 10, uses_count: 10 }), ACUM), "epuizat");
  /* Peste limita (s-a coborat `max_uses` dupa ce s-a folosit) tot epuizat e. */
  assert.equal(stareaCodului(cod({ max_uses: 3, uses_count: 10 }), ACUM), "epuizat");
});

test("fiecare stare are text si o explicatie care spune ce ai de facut", () => {
  assert.equal(Object.keys(DESPRE_STARE).length, STARI.length);
  for (const s of STARI) {
    assert.ok(DESPRE_STARE[s].text.length >= 5, s);
    assert.ok(DESPRE_STARE[s].explicatie.length > 30, `${s}: explicatia e prea scurta`);
  }
});

/* ── Cele doua cifre de utilizari ───────────────────────────────────────── */

test("⚠⚠ se arata AMANDOUA cifrele, si a doua numai cand difera", () => {
  /*
   * ⚠ MASURAT PE DEMO, si de-aia s-a schimbat: `BINEAIVENIT10` scria „26", dar
   * codul e pe 30 de comenzi — patru anulate. `uses_count` scade inapoi la
   * anulare, fiindca utilizarea se da inapoi campaniei.
   *
   * Niciuna nu e gresita, dar raspund la intrebari deosebite, iar pe ecran scria
   * doar „Utilizari". Hotararea proprietarului: amandoua.
   */
  const cuAnulari = utilizarile({ uses_count: 26, max_uses: 100 }, 30);
  assert.equal(cuAnulari.principal, "26 din 100");
  assert.equal(cuAnulari.langa, "30 în total");

  /* ⚠ Fara anulari NU se adauga zgomot: a doua cifra ar repeta-o pe prima. */
  const fara = utilizarile({ uses_count: 10, max_uses: null }, 10);
  assert.equal(fara.principal, "10");
  assert.equal(fara.langa, null);
});

test("⚠ cand nu se stie cate comenzi sunt, nu se inventeaza a doua cifra", () => {
  /* `null` inseamna „inca nu s-a numarat", nu „zero". */
  assert.equal(utilizarile({ uses_count: 7, max_uses: 20 }, null).langa, null);
  assert.equal(utilizarile({ uses_count: 7, max_uses: 20 }, null).principal, "7 din 20");
});

test("⚠ limita se scrie langa cifra, nu se lasa de ghicit", () => {
  /* „26" singur nu spune daca mai sunt utilizari. „26 din 100" spune. */
  assert.equal(utilizarile({ uses_count: 3, max_uses: 5 }, 3).principal, "3 din 5");
  assert.equal(utilizarile({ uses_count: 3, max_uses: null }, 3).principal, "3");
});

test("⚠ explicatia spune DE CE difera, nu doar ca difera", () => {
  /* Fara lamurire, comerciantul crede ca una dintre cifre e stricata. */
  assert.match(DE_CE_DOUA_CIFRE, /anulate|anulare/);
  assert.match(DE_CE_DOUA_CIFRE, /limita/);
  assert.ok(DE_CE_DOUA_CIFRE.length > 120);
});
