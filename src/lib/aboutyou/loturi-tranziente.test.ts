import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O PANA DE SASE MINUTE LA EI OMORA TOATE LOTURILE TUTUROR MAGAZINELOR
   ══════════════════════════════════════════════════════════════════════════

   Contorul `poll_errors` e per lot, si asta e corect. Dar CAUZA e comuna: cand About You da 5xx
   sau 429, TOATE loturile deschise ale TUTUROR magazinelor esueaza la aceeasi interogare, in
   aceeasi rulare a cronului.

   Cronul merge din minut in minut, pragul era sase — deci sase minute de indisponibilitate la ei
   inchideau ca `failed` tot ce era deschis in platforma. Iar selectia de sondare exclude
   `failed`: loturile alea nu mai erau interogate NICIODATA, desi la ei puteau fi de mult
   `completed`.

   ⚠ 429 / 5xx / retea NU SPUN NIMIC DESPRE LOT. Singurele care il pot inchide sunt un raspuns
   explicit de esec de la ei, sau un 4xx permanent — lot necunoscut, cheie invalidata.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const sync = viu("src/lib/aboutyou/sync.ts");

test("⚠ o cauza trecatoare nu mai inchide lotul", () => {
  assert.match(sync, /const trecatoare = res\.status === 0 \|\| res\.status === 429 \|\| res\.status >= 500;/);
  assert.match(sync, /const renuntam = !trecatoare && esecuri >= 6;/);
});

test("⚠ in locul pragului, o amanare care CRESTE", () => {
  /* Cauza obisnuita e o limita de rata sau o pana la ei — adica exact situatia in care a intreba
     din minut in minut inrautateste lucrurile. */
  assert.match(sync, /function amanare\(esecuri: number\): number \{/);
  assert.match(sync, /Math\.min\(15, 2 \*\* Math\.max\(0, esecuri - 1\)\) \* 60_000/);

  /* ⚠ Si selectia chiar SARE peste loturile amanate: fara asta, amanarea n-ar insemna nimic. */
  assert.match(sync, /next_poll_at\.is\.null,next_poll_at\.lte\./);
});

test("⚠ un raspuns bun sterge si amanarea, si sirul de esecuri", () => {
  /* Interogarea A RASPUNS, deci sirul s-a rupt. Fara resetare, pragul ar numara esecuri
     NECONSECUTIVE si un lot deschis legitim doua ore ar aduna hopuri raspandite. */
  /* ⚠ Ancora e resetarea din BUCLA DE SONDARE, nu cea din `recordBatch`: acolo `poll_errors: 0`
     apare tot, si prima potrivire ar fi cazut pe fisierul gresit. */
  const i = sync.indexOf("attempts: incercari,");
  assert.ok(i > 0, "resetarea din bucla de sondare exista");
  const f = sync.slice(i, i + 300);
  assert.match(f, /next_poll_at: null/);
  assert.match(f, /tranzient_de_la: null/);
});

test("⚠ tacerea nu e o optiune cand lotul ramane deschis la nesfarsit", () => {
  /*
   * Se scrie o data dupa un ceas de esecuri neintrerupte — nu la fiecare trecere, altfel acelasi
   * lot ar umple jurnalul si l-ar face necitibil taman cand e nevoie de el.
   */
  assert.match(sync, /const ORE_PANA_LA_ALARMA = 1;/);
  assert.match(sync, /const scrisRecent = b\.alarma_scrisa_la/);
  assert.match(sync, /alarma_scrisa_la: now/);
});

test("⚠ si listarea nu se vopseste in rosu pentru o cauza trecatoare", () => {
  /* Un 429 pe ruta de rezultate nu spune nimic despre produs — el poate fi deja acceptat la ei.
     Marcata „error", listarea n-ar mai ajunge niciodata `draft`. */
  const i = sync.indexOf("if (renuntam) {");
  assert.ok(i > 0, "ramura exista");
  /* `renuntam` e deja fals pentru trecatoare, deci conditia dubla de dinainte a disparut. */
  assert.doesNotMatch(sync, /renuntam && !trecator\b/);
});

test("⚠ indexul urmeaza chiar interogarea de sondare", () => {
  const mig = readFileSync("migrations/2026-11-19-aboutyou-loturi-fara-esec-fals.sql", "utf8");
  assert.match(mig, /create index if not exists aboutyou_batches_deschise_idx/);
  assert.match(mig, /where status in \('pending', 'processing', 'retry'\)/);
});
