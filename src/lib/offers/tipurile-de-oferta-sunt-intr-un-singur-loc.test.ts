import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DESPRE_TIPUL_OFERTEI, OFFER_TYPES, PHASE1_OFFER_TYPES, TIPURI_CARE_SE_POT_FACE, isOfferType,
} from "./offer.types";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * TIPURILE DE OFERTĂ SUNT SCRISE O SINGURĂ DATĂ                  (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ ERAU CINCI LISTE, ȘI UNA NU AVEA NICIUN CITITOR.
 *
 *   `OFFER_TYPES` (8)                    — schema
 *   `PHASE1_OFFER_TYPES` (3)             — ce se rezolvă în vitrină
 *   `OFFER_TYPES_IMPLEMENTATE` (4)       — ZERO cititori, verificat cu grep
 *   `PHASE1` din `OfferForm.tsx` (4)     — cu etichete, descrieri și steaguri
 *   `TYPE_LABEL` din `OffersClient` (8)  — încă un rând de etichete
 *
 * Un tip nou trebuia adăugat în toate cinci, iar nimic n-ar fi spus care a rămas
 * în urmă: un tip lipsă din `TYPE_LABEL` ar fi desenat `undefined` în listă, iar
 * unul lipsă din `PHASE1` n-ar fi apărut în formular. Amândouă tăcute.
 *
 * Acum e un singur tabel (`DESPRE_TIPUL_OFERTEI`), iar listele se derivă din el.
 * Proba asta ține ușa închisă.
 */

const RADACINA = path.resolve(process.cwd(), "src");

function fisiere(): { rel: string; s: string }[] {
  const out: { rel: string; s: string }[] = [];
  const mergi = (dir: string) => {
    for (const intrare of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, intrare.name);
      if (intrare.isDirectory()) { mergi(p); continue; }
      if (!/\.tsx?$/.test(intrare.name) || intrare.name.endsWith(".test.ts")) continue;
      out.push({ rel: path.relative(RADACINA, p).split(path.sep).join("/"), s: fs.readFileSync(p, "utf8") });
    }
  };
  mergi(RADACINA);
  return out;
}

test("⚠ fiecare tip din uniune are un rând în tabel, și niciunul în plus", () => {
  /*
   * `OFFER_TYPES` se DERIVĂ din tabel, deci egalitatea e dată. Ce se probează
   * aici e uniunea `OfferType`: un tip adăugat la ea și uitat din tabel ar fi
   * fost prins de TypeScript (`Record` cere toate cheile), dar unul SCOS din
   * uniune și rămas în tabel n-ar fi fost prins de nimeni.
   */
  assert.deepEqual(OFFER_TYPES, Object.keys(DESPRE_TIPUL_OFERTEI));
  for (const t of OFFER_TYPES) assert.ok(isOfferType(t), `\`isOfferType\` nu recunoaște „${t}”`);
});

test("⚠⚠ listele se DERIVĂ din tabel, nu se înșiră a doua oară", () => {
  const sursa = fs.readFileSync("src/lib/offers/offer.types.ts", "utf8");
  for (const nume of ["PHASE1_OFFER_TYPES", "TIPURI_CARE_SE_POT_FACE"]) {
    const rand = sursa.split("\n").find((l) => l.includes(`export const ${nume}`));
    assert.ok(rand, `${nume} a dispărut`);
    assert.ok(rand!.includes("OFFER_TYPES.filter("),
      `${nume} e iar scrisă de mână: „${rand!.trim()}”`);
  }
});

test("`volume` se poate face, dar NU se rezolvă în vitrină", () => {
  /*
   * ⚠ Aici stă pricina pentru care erau două liste. `volume` nu randează nimic la
   * afișare: scrie praguri pe produse (`duPraguriLaProduse`). Adus de
   * `loadActiveOffers`, ar fi fost cerut pe fiecare pagină de produs degeaba.
   */
  assert.ok(TIPURI_CARE_SE_POT_FACE.includes("volume"));
  assert.ok(!PHASE1_OFFER_TYPES.includes("volume"));
  assert.deepEqual(PHASE1_OFFER_TYPES, ["frequently_bought", "cross_sell", "order_bump"]);
});

test("⚠⚠ eticheta fiecărui tip e scrisă ÎNTR-UN SINGUR fișier", () => {
  /*
   * Plasa care prinde a doua listă. `TYPE_LABEL` din `OffersClient` era exact
   * asta: opt etichete scrise a doua oară, care s-au și despărțit de formular
   * („Cumparate impreuna" acolo, fără diacritice, față de „Cumpărate împreună").
   */
  for (const t of OFFER_TYPES) {
    const eticheta = DESPRE_TIPUL_OFERTEI[t].eticheta;
    const unde = fisiere().filter((f) => f.s.includes(`"${eticheta}"`)).map((f) => f.rel);
    assert.deepEqual(unde, ["lib/offers/offer.types.ts"],
      `eticheta „${eticheta}” e scrisă și în: ${unde.filter((u) => u !== "lib/offers/offer.types.ts").join(", ")}`);
  }
});

test("⚠⚠ iconițele au exact aceleași chei ca tabelul, deși stau în altă parte", () => {
  /*
   * Iconițele NU pot sta în `offer.types.ts`: ar fi adus `lucide-react` într-un
   * fișier pe care îl încarcă și serverul, la fiecare rezolvare de ofertă din
   * vitrină. Dar despărțite, un tip nou ar fi căzut pe `Sparkles` fără nicio
   * eroare — `ICOANA_TIPULUI[t] ?? Sparkles`.
   *
   * ⚠ Se citește ca TEXT, nu se importă: importul ar fi tras `lucide-react` și
   * React într-o probă care rulează pe Node gol.
   */
  const sursa = fs.readFileSync("src/components/dashboard/oferte/tipuri-ui.ts", "utf8");
  const de = sursa.indexOf("ICOANA_TIPULUI: Record<OfferType, LucideIcon> = {");
  assert.ok(de > 0, "tabelul de iconițe s-a mutat sau s-a redenumit");
  const corp = sursa.slice(de, sursa.indexOf("};", de));
  const chei = [...corp.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(chei.sort(), [...OFFER_TYPES].sort());
});

test("⚠ tipurile nefăcute spun pe față că sunt nefăcute", () => {
  /*
   * Schema ține opt tipuri; patru se pot face azi. Un tip care nu se poate face
   * și n-ar spune asta în explicație ar fi fost o promisiune pe care formularul
   * n-o poate ține — și cineva ar fi adăugat butonul crezând că merge.
   */
  for (const t of OFFER_TYPES) {
    const d = DESPRE_TIPUL_OFERTEI[t];
    if (d.sePoateFace) continue;
    assert.match(d.explicatie, /nefăcut/, `„${d.eticheta}” nu spune că nu se poate face încă`);
  }
  assert.equal(TIPURI_CARE_SE_POT_FACE.length, 4);
});

test("⚠ un tip care oferă produse are și un nume pentru ele", () => {
  /*
   * `numeleProduselorOferite` se scrie deasupra listei de produse din formular.
   * Gol la un tip care chiar oferă produse, eticheta ar fi fost o linie albă.
   * Gol e îngăduit doar la cele care NU oferă nimic (`volume`, `spend_reward`).
   */
  for (const t of OFFER_TYPES) {
    const d = DESPRE_TIPUL_OFERTEI[t];
    const ofera = !d.cuPraguri && d.sePoateFace;
    if (ofera) assert.ok(d.numeleProduselorOferite.length > 0, `„${d.eticheta}” n-are nume pentru produsele oferite`);
  }
});
