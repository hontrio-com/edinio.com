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
  const f = sync.slice(i, i + 700);
  assert.match(f, /tranzient_de_la: null/, "sirul de esecuri de transport se rupe intotdeauna");

  /*
   * ═══ ⚠ AMANAREA NU MAI E MEREU STEARSA (27.08.2026) ═══
   *
   * Era: „un raspuns bun sterge si amanarea". Adevarat cat timp singura amanare venea din esecuri
   * de TRANSPORT. Acum mai exista una, voita: un lot pe care About You il macina de peste doua ore
   * se intreaba mai rar, ca sa nu ocupe un loc in selectia celor mai vechi si sa infometeze
   * loturile noi. Inainte, unul ca asta era declarat `failed` la 120 de treceri — un verdict pe
   * care ei nu-l dadusera niciodata.
   *
   * Deci: `tranzient_de_la` se sterge intotdeauna; `next_poll_at` numai cand lotul nu e incetinit.
   */
  assert.match(f, /next_poll_at: incetinit/);
  assert.match(f, /: null,/);
  assert.match(sync, /const AMANARE_LOT_LENT_MS = 30 \* 60 \* 1000;/);
  /* ⚠ Si nu se mai inventeaza „a esuat": la capat, mesajul spune ca NOI am incetat sa intrebam. */
  assert.match(sync, /amIncetatSaIntrebam: true/);
  assert.match(sync, /am incetat sa intrebam/);
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

test("⚠ un lot asezat dupa unul mai nou reimpinge valoarea de acum", () => {
  /*
   * ═══ ⚠ DOUA LOTURI DE STOC POT SA SE ASEZE IN ORDINE INVERSA (26.08.2026) ═══
   *
   * Loturile lor se prelucreaza ASINCRON. Trimitem stocul 5, apoi la o secunda stocul 3; daca al
   * doilea se aseaza primul si primul dupa el, la ei ramane 5 — iar la noi coada e goala, deci
   * nimic nu mai reimpinge. Se vinde marfa care nu exista.
   *
   * ⚠ EI AU UN CAMP ANUME PENTRU ASTA — `valid_at` — dar nu-l putem folosi: documentatia lor cere
   * autentificare de partener, iar o marca de timp gresita ar putea opri impingerea de stoc
   * pentru toate magazinele.
   *
   * ⚠ SI NU EXISTA NICIUN CAPAT DE CITIRE a stocului sau pretului: `GET /products/` da doar
   * `style_key`, `sku` si `status` — verificat in `types.ts` si in tot clientul. Deci nici deriva
   * fata de ei nu se poate masura.
   *
   * ⚠ DAR REORDONAREA SE VEDE DIN DATELE NOASTRE, si asta nu cere nimic de la ei.
   */
  assert.match(sync, /if \(b\.kind === "stock" \|\| b\.kind === "price"\) \{/);
  assert.match(sync, /\.gt\("submitted_at", b\.submitted_at\)/);
  assert.match(sync, /\.eq\("status", "completed"\)/);
  assert.match(sync, /\.neq\("id", b\.id\)/, "lotul curent nu se numara pe sine");

  /* ⚠ Si reimpingerea intra pe calea potrivita: stocul pe `stock`, pretul pe `upsert`. */
  assert.match(sync, /op: b\.kind === "stock" \? "stock" : "upsert"/);

  /* ⚠ Numai la lot REUSIT: unul respins n-a suprascris nimic. */
  assert.match(sync, /if \(!hardFail && randListare\.product_id\)/);
});

test("⚠ si nu exista niciun capat de citire a stocului sau pretului", () => {
  /*
   * Proba asta pazeste o AFIRMATIE, nu un comportament: daca maine apare un `getStock`, nota de
   * mai sus devine mincinoasa, si atunci se poate face o verificare de deriva adevarata.
   */
  const client = readFileSync("src/lib/aboutyou/client.ts", "utf8");
  for (const nume of ["getStock(", "getPrices(", "getProductStock(", "getProductPrices("]) {
    assert.ok(!client.includes(`export function ${nume}`), `a aparut ${nume}: se poate masura deriva`);
    assert.ok(!client.includes(`export async function ${nume}`), `a aparut ${nume}: se poate masura deriva`);
  }
});
