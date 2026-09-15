import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * FIECARE SCRIERE DE EXPEDIERE POARTA MAGAZINUL                 (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ `business_id` NU E UN FILTRU DE PRISOS PE DRUMURILE ASTEA, E AUTORIZARE.
 *
 * Fratele probei asteia, `api/cron/scrierile-de-urmarire-poarta-magazinul.test.ts`, pazeste
 * cronurile. Dar AWB-ul nu se scrie numai din cron: se scrie si din actiunea pe care o
 * apasa comerciantul. Acolo nu era nimic care sa ceara filtrul, si se vedea:
 *
 * Masurat pe 15.09.2026, din saisprezece fisiere de actiuni care scriu un numar de
 * expediere, PATRU aveau scrieri fara el: Sameday (doua: si turul, si returul), Cargus,
 * DPD, Colete Online, plus doua intr-o functie Packeta pe care n-o cheama nimeni.
 *
 * ⚠ SI DE CE CONTEAZA, cand proprietatea e dovedita cu cateva randuri mai sus:
 *
 *   1. La Colete Online si la Packeta scrie clientul de SERVICIU, care OCOLESTE RLS. Acolo
 *      filtrul chiar e singurul lucru care margineste scrierea.
 *   2. La celelalte scrie clientul omului, deci RLS tine azi. Dar RLS pe `orders` s-a mai
 *      slabit o data pe platforma asta, si atunci a doua incuietoare e tot ce ramane.
 *
 * ⚠ SI DE CE E O PROBA CARE ENUMERA, nu una scrisa pe fisierele reparate: reparate acum,
 * urmatorul curier adaugat ar naste aceeasi gaura, si nimeni n-ar afla.
 */

const DIR = "src/lib/actions";

/** Un lant `from("orders")....;` intreg, taiat pe paranteze potrivite. */
function lanturileDeScriere(sursa: string): string[] {
  const s = sursa
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  const lanturi: string[] = [];
  const ANCORA = 'from("orders")';
  let i = 0;
  while ((i = s.indexOf(ANCORA, i)) !== -1) {
    let paranteze = 0, acolade = 0, sfarsit = s.length;
    for (let j = i + ANCORA.length; j < s.length; j++) {
      const c = s[j];
      if (c === "(") paranteze++;
      else if (c === ")") paranteze--;
      else if (c === "{") acolade++;
      else if (c === "}") acolade--;
      /* Sfarsitul instructiunii, nu al randului: lantul e scris pe mai multe randuri. */
      else if (c === ";" && paranteze === 0 && acolade === 0) { sfarsit = j; break; }
    }
    const lant = s.slice(i, sfarsit);
    /* Numai scrierile. Citirile au propria lor paza si propriile lor filtre. */
    if (/^\s*\n?\s*\.update\(|\)\s*\n?\s*\.update\(/.test(lant.slice(0, 60))) lanturi.push(lant);
    i += ANCORA.length;
  }
  return lanturi;
}

/** Fisierele de actiuni care chiar scriu o expediere pe comanda. Gasite pe disc. */
function fisiereDeExpediere(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".actions.ts"))
    .filter((f) => /_awb_number:|_packet_id:|_order_to_send_id:|_status_checked_at:/
      .test(readFileSync(`${DIR}/${f}`, "utf8")))
    .map((f) => `${DIR}/${f}`);
}

test("⚠ lista de fisiere nu se poate goli in tacere", () => {
  /*
   * Fara afirmatia asta, o mutare de dosar ar face lista goala, bucla de mai jos n-ar rula
   * niciodata, iar proba ar raporta vesel ca pazeste ceva. O proba care nu poate cadea
   * singura nu e o proba.
   */
  const fisiere = fisiereDeExpediere();
  assert.ok(fisiere.length >= 15, `am gasit doar ${fisiere.length} fisiere de expediere`);
});

test("⚠ cautatorul de lanturi chiar gaseste scrieri, nu se preface", () => {
  /* A doua plasa: daca `lanturileDeScriere` s-ar strica si ar intoarce mereu o lista goala,
     proba de mai jos ar trece pe fiecare fisier fara sa se uite la nimic. */
  const total = fisiereDeExpediere()
    .reduce((n, f) => n + lanturileDeScriere(readFileSync(f, "utf8")).length, 0);
  assert.ok(total >= 30, `am gasit doar ${total} scrieri pe orders in actiunile de expediere`);
});

test("fiecare scriere pe orders din actiunile de expediere poarta business_id", () => {
  const vinovate: string[] = [];

  for (const fisier of fisiereDeExpediere()) {
    for (const lant of lanturileDeScriere(readFileSync(fisier, "utf8"))) {
      if (lant.includes('eq("business_id"')) continue;
      vinovate.push(`${fisier}: ${lant.replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    `scrieri fara filtrul de autorizare:\n  ${vinovate.join("\n  ")}`,
  );
});
