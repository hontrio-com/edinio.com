import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { perioadaOfertei, ziuaClipei } from "@/lib/zi-romaneasca";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O OFERTĂ CHIAR POATE AVEA O PERIOADĂ                           (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECTUL ERA SCRIS ÎN DOUĂ RÂNDURI DE COD, ȘI A STAT ASCUNS TOCMAI
 * FIINDCĂ TOT RESTUL DRUMULUI EXISTA.
 *
 * Coloanele `offers.starts_at` și `offers.ends_at` erau în bază de la început,
 * `loadActiveOffers` chiar le citea și le respecta, iar tipul `OfferFormData`
 * le purta. Dar `OfferForm.tsx` scria, în cod:
 *
 *     starts_at: null,
 *     ends_at: null,
 *
 * Deci nicio ofertă nu se putea programa, și orice perioadă pusă de mână în bază
 * era ȘTEARSĂ la prima salvare din panou. Măsurat pe producție la 22.09.2026:
 * ZERO din 13 oferte aveau perioadă — nu fiindcă nimeni n-ar fi vrut, ci fiindcă
 * nu se putea.
 *
 * ⚠ Și ziua se preface în clipă PE SERVER, nu în browser: altfel „1 octombrie”
 * ar fi însemnat miezul nopții din fusul celui care salvează. Aceeași regulă ca
 * la coduri, aceeași funcție.
 */

const FORMULAR = readFileSync("src/components/dashboard/OfferForm.tsx", "utf8");
const ACTIUNI = readFileSync("src/lib/actions/offer.actions.ts", "utf8");

test("⚠⚠ formularul nu mai scrie perioada goală în cod", () => {
  /* ⚠ SE CAUTĂ UN RÂND DE COD ÎNTREG, nu textul oriunde: cele două nume apar
     și în comentariul care explică ce s-a schimbat, iar o probă care cade pe
     propriile ei explicații se repară slăbind-o. */
  assert.ok(!/^\s*starts_at: null,\s*$/m.test(FORMULAR), "formularul stinge iar data de pornire");
  assert.ok(!/^\s*ends_at: null,\s*$/m.test(FORMULAR), "formularul stinge iar data de sfârșit");
  assert.match(FORMULAR, /incepe_in: incepeIn/);
  assert.match(FORMULAR, /se_incheie_in: seIncheieIn/);
});

test("⚠⚠ formularul citește ziua cu `ziuaClipei`, nu cu `slice(0, 10)`", () => {
  /*
   * O ofertă care pornește pe 1 octombrie se ține ca `2026-09-30T21:00:00Z` —
   * ora României, scrisă în UTC. Tăiată cu `slice`, editarea ar fi arătat „30
   * septembrie”, iar salvată așa, oferta s-ar fi mutat cu o zi înapoi la FIECARE
   * deschidere a formularului.
   */
  assert.match(FORMULAR, /ziuaClipei\(offer\?\.starts_at\)/);
  assert.match(FORMULAR, /ziuaClipei\(offer\?\.ends_at\)/);
  assert.ok(!/starts_at.*slice\(0, 10\)/.test(FORMULAR));
});

test("⚠⚠ ziua se preface în clipă PE SERVER, la amândouă drumurile", () => {
  /*
   * Lăsată pe seama formularului, o ofertă salvată de pe un ceas pus pe alt fus
   * ar fi pornit sau s-ar fi stins cu o zi alături. Și `createOffer`, și
   * `updateOffer` trebuie s-o cheme: una singură ar fi însemnat că editarea
   * strică ce a scris creația.
   */
  const chemari = ACTIUNI.split("perioadaOfertei(data.incepe_in, data.se_incheie_in)").length - 1;
  assert.equal(chemari, 2, "conversia nu se face pe amândouă drumurile");
  const scrieri = ACTIUNI.split("starts_at: perioada.starts_at").length - 1;
  assert.equal(scrieri, 2, "se scrie iar ce a trimis browserul");
  /* ⚠ Și refuzul ajunge la om, nu se înghite. */
  assert.match(ACTIUNI, /if \("error" in perioada\) return \{ error: perioada\.error \}/);
});

/* ── Regula însăși, măsurată cu numere ──────────────────────────────────── */

test("ziua scrisă de comerciant e o ZI ROMÂNEASCĂ, nu una UTC", () => {
  /*
   * 1 octombrie 2026 e în ora de vară (UTC+3), deci ziua începe la 21:00 UTC pe
   * 30 septembrie. Scrisă ca miezul nopții UTC, oferta ar fi pornit la 03:00
   * dimineața în chiar ziua ei.
   */
  const p = perioadaOfertei("2026-10-01", "2026-10-31");
  assert.ok(!("error" in p));
  assert.equal(p.starts_at, "2026-09-30T21:00:00.000Z");
  /*
    ⚠ Capătul de sus e SFÂRȘITUL zilei: „până pe 31” înseamnă toată ziua aceea.

    ⚠⚠ ȘI E ALT DECALAJ DECÂT LA CELĂLALT CAPĂT, în aceeași perioadă: ora de
    vară se încheie în ultima duminică din octombrie (25.10.2026), deci 1
    octombrie e UTC+3 și 31 octombrie e UTC+2. Scris cu un decalaj fix, capătul
    ăsta ar fi căzut cu o oră alături — chiar aici am greșit eu întâi, și
    funcția a avut dreptate.
  */
  assert.equal(p.ends_at, "2026-10-31T21:59:59.999Z");
});

test("ziua de iarnă socotește singură alt decalaj", () => {
  /* 1 decembrie e UTC+2: nicăieri nu e scris „+3”, se află din chiar ceasul zilei. */
  const p = perioadaOfertei("2026-12-01", null);
  assert.ok(!("error" in p));
  assert.equal(p.starts_at, "2026-11-30T22:00:00.000Z");
  assert.equal(p.ends_at, null);
});

test("⚠ drumul înapoi e chiar ziua scrisă, nu una alăturată", () => {
  /* Dus-întors: ce pune omul în formular trebuie să se întoarcă la fel. */
  const p = perioadaOfertei("2026-10-01", "2026-10-31");
  assert.ok(!("error" in p));
  assert.equal(ziuaClipei(p.starts_at), "2026-10-01");
  assert.equal(ziuaClipei(p.ends_at), "2026-10-31");
});

test("⚠⚠ o perioadă întoarsă se REFUZĂ", () => {
  /*
   * „De pe 10, până pe 3” nu e o campanie, e o greșeală de tastare — și, scrisă
   * așa, ar fi dat o ofertă pe care ecranul o arată „Programată” și care nu
   * pornește niciodată.
   */
  const p = perioadaOfertei("2026-10-10", "2026-10-03");
  assert.ok("error" in p);
  const o = perioadaOfertei("2026-10-03", "2026-10-03");
  assert.ok(!("error" in o), "o campanie de o singură zi e în regulă");
});

test("fără perioadă înseamnă fără capete, nu o zi ghicită", () => {
  const p = perioadaOfertei(null, null);
  assert.ok(!("error" in p));
  assert.equal(p.starts_at, null);
  assert.equal(p.ends_at, null);
});
