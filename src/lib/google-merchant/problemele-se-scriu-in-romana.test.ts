import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { problemeDeAfisat } from "./probleme";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEMELE DE PRODUS SE SCRIU IN ROMANA                       (23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ SEMNALAT DE EL, pe fisa unui produs respins: „ba scrie in engleza, ba in
 * romana". Textul problemei venea de la Google in engleza, iar tot ce scriem noi
 * in jurul lui („Afectează:", „cum rezolv", numele suprafetelor) in romana.
 *
 * ⚠ LA PROBLEMELE DE CONT SE CERE IN ROMANA DE LA EI (`languageCode=ro` in
 * `listAccountIssues`). La cele de PRODUS nu se poate: `accounts.products.get`
 * n-are un asemenea parametru. De-aia exista un dictionar pe `code`.
 */

const CODURI_MASURATE = [
  "homepage_not_claimed",
  "policy_enforcement_account_disapproval",
  "missing_potentially_required_attribute",
  "misrepresentation",
  "image_too_small_for_high_resolution",
  "image_link_pending_crawl",
  "description_short",
  "title_all_caps",
  "attribute_pending_review",
  "item_missing_required_attribute",
  "missing_shipping_no_account_shipping_exist",
  "pending_initial_policy_review_free_listings",
  "attribute_violated_discovery_ads_policy",
  "image_link_broken",
  "guns_parts_policy_violation",
  "low_image_quality",
  "violated_discovery_ads_policy_experiment2",
  "image_link_internal_error",
];

/* ══ 1. Fiecare cod care CHIAR exista pe productie are text romanesc ═══════ */

test("⚠⚠ toate cele 18 coduri masurate pe productie au text in romana", () => {
  /*
   * ⚠ Lista de sus e masurata, nu inchipuita: sunt toate codurile din
   * `gmc_products.issues` la 23.09.2026, de la 6.520 de aparitii pana la 4.
   * Daca apare un cod nou pe productie, se adauga si aici, si in dictionar.
   */
  const fara: string[] = [];
  for (const code of CODURI_MASURATE) {
    const [p] = problemeDeAfisat([{ code, description: "English text", detail: "English detail", severity: "DISAPPROVED" }]);
    assert.ok(p, `codul ${code} n-a mai iesit deloc din strangere`);
    if (p.titlu === "English text" || p.detaliu === "English detail") fara.push(code);
  }
  assert.deepEqual(
    fara,
    [],
    "Coduri care se vad pe productie si au ramas in engleza:\n  " + fara.join("\n  "),
  );
});

test("⚠ textele romanesti chiar sunt in romana, nu copii ale celor englezesti", () => {
  /*
   * ⚠ Plasa pentru cea mai usoara greseala de completare: un rand copiat si lasat
   * cu textul lui Google. Se cere o litera cu semne diacritice SAU un cuvant
   * romanesc obisnuit, in titlu sau in lamurire.
   */
  const fara: string[] = [];
  for (const code of CODURI_MASURATE) {
    const [p] = problemeDeAfisat([{ code, description: "x", detail: "y", severity: "DEMOTED" }]);
    const text = `${p.titlu} ${p.detaliu ?? ""}`;
    if (!/[ăâîșțĂÂÎȘȚ]/.test(text) && !/\b(nu|se|de|în|si|și|cu|la|pe)\b/i.test(text)) fara.push(code);
  }
  assert.deepEqual(fara, [], "texte care par tot englezesti:\n  " + fara.join("\n  "));
});

/* ══ 2. Ce nu stim ramane al lor, si NU se pierde ══════════════════════════ */

test("⚠⚠ un cod necunoscut pastreaza textul lui Google, nu iese gol", () => {
  /*
   * Google are zeci de coduri, si scoate altele noi fara sa anunte. Mai bine
   * textul lor in engleza decat un rand gol, sau o traducere inventata de noi
   * despre o regula a lor pe care n-am citit-o.
   */
  const [p] = problemeDeAfisat([{
    code: "un_cod_pe_care_nu_l-am_vazut_niciodata",
    description: "Some brand new Google issue",
    detail: "And its explanation",
    severity: "DISAPPROVED",
  }]);
  assert.equal(p.titlu, "Some brand new Google issue", "textul lui Google s-a pierdut pe drum");
  assert.equal(p.detaliu, "And its explanation");
});

test("⚠ o problema fara cod si fara descriere tot are un titlu", () => {
  const [p] = problemeDeAfisat([{ severity: "DEMOTED" }]);
  assert.ok(p.titlu.trim().length > 0, "randul ar fi iesit gol pe ecran");
});

/* ══ 3. Strangerea pe suprafete nu s-a stricat ════════════════════════════ */

test("⚠ aceeasi problema pe sase suprafete ramane UN rand, cu suprafetele adunate", () => {
  /*
   * Regula dinainte, pazita mai departe: Google intoarce aceeasi problema o data
   * pe fiecare suprafata. La `mokka` erau 38 de produse × 2 probleme × 6
   * suprafete, iar panoul le arata pe toate: sase randuri identice sub fiecare
   * produs. Traducerea nu are voie s-o strice.
   */
  const suprafete = ["SHOPPING_ADS", "FREE_LISTINGS", "DISPLAY_ADS", "DEMAND_GEN_ADS", "VIDEO_ADS", "DEMAND_GEN_ADS_DISCOVER_SURFACE"];
  const iesire = problemeDeAfisat(suprafete.map((reportingContext) => ({
    code: "description_short", severity: "DEMOTED", reportingContext,
  })));
  assert.equal(iesire.length, 1, "aceeasi problema se arata iar o data pe fiecare suprafata");
  assert.deepEqual(iesire[0].suprafete.sort(), [...suprafete].sort());
});

/* ══ 4. Si problemele de CONT chiar se cer in romana de la ei ═════════════ */

test("⚠ problemele de cont se cer de la Google in romana", () => {
  /*
   * Acolo se poate, si atunci se cere: altfel am fi tradus de mana un text pe
   * care furnizorul ni-l da gata tradus.
   */
  const sursa = readFileSync("src/lib/google-merchant/client.ts", "utf8");
  const chemare = sursa.slice(sursa.indexOf("export function listAccountIssues"));
  assert.match(
    chemare.slice(0, 400),
    /languageCode=ro/,
    "problemele de cont nu se mai cer in romana, desi capatul lor primeste limba",
  );
});
