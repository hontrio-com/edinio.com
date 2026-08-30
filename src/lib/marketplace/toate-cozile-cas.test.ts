import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   TOATE CELE CINCI COZI, NU DOUA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Migratia `2026-10-09-generatia-cozilor` a pus coloana `generation` si declansatorul
   `trg_generatie` pe TOATE cinci cozile, anume ca sa nu ramana niciuna in urma. Nota ei o spune
   pe fata: „Un leac pus doar pe una ar fi lasat celelalte patru cu acelasi defect si cu impresia
   ca s-a rezolvat."

   ⚠ Iar apararea din cod acoperea DOUA. Trendyol si eMAG treceau prin CAS; About You, GMC si OLX
   faceau `.delete().eq("id", ...)` gol — desi toate trei trec prin `revendica_din_coada`, care
   intoarce randul INTREG, deci generatia venea deja in raspuns si se arunca.

   ⚠ Proba asta exista ca sa nu se mai poata intampla: orice cron care scrie intr-o coada cu
   generatie trebuie sa scrie prin `coada-cas`.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Cozile care au `generation` in baza. Sursa: declansatoarele `trg_generatie` din baseline. */
const COZI_CU_GENERATIE = [
  "aboutyou_sync_queue", "emag_sync_queue", "gmc_sync_queue",
  "olx_sync_queue", "trendyol_sync_queue",
];

test("⚠ baseline-ul chiar are declansator pe toate cinci", () => {
  /* Daca se adauga o coada noua cu generatie, proba de mai jos trebuie s-o acopere si pe ea. */
  const baza = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const gasite = [...baza.matchAll(/CREATE TRIGGER trg_generatie BEFORE UPDATE ON public\.(\w+)/g)]
    .map((m) => m[1]).sort();
  assert.deepEqual(gasite, [...COZI_CU_GENERATIE].sort(),
    "lista din proba nu mai e la fel cu declansatoarele din baza");
});

test("⚠ si lista alba a CAS-ului le contine pe toate", () => {
  const cas = viu("src/lib/marketplace/coada-cas.ts");
  for (const coada of COZI_CU_GENERATIE) {
    assert.match(cas, new RegExp(`"${coada}"`), `${coada} lipseste din \`NumeCoada\``);
  }
});

test("⚠ niciun cron nu mai sterge IN BLOC dintr-o coada cu generatie", () => {
  /*
   * ═══ ⚠ O STERGERE IN BLOC NU POATE FI PAZITA ═══
   *
   * `delete ... in (ids)` sterge tot ce nimereste, inclusiv randurile rescrise intre timp.
   * Comparatia pe generatie se face pe UN rand, deci calea in bloc o ocoleste prin constructie.
   *
   * ⚠ Locul e mereu acelasi: magazinul deconectat. Cererile n-au unde pleca — dar daca cineva
   * tocmai l-a reconectat si a pus ceva la coada, aia trebuie sa ramana.
   *
   * ⚠ Proba asta a fost scrisa pentru About You si a gasit acelasi loc nepazit si la eMAG, si la
   * Trendyol — desi restul scrierilor lor treceau de mult prin CAS. De-aia matura toate cronurile,
   * nu doar pe cel la care lucram.
   *
   * ⚠ SCRIERILE PE UN SINGUR RAND NU SE VERIFICA AICI: eMAG isi are propria implementare de CAS
   * in fisier (`scoateDinCoada`/`scrieInCoada`), tipizata pe tabela lui. E o a doua implementare,
   * nu o scapare, si merge — deci n-o fortez la cea partajata printr-o proba.
   *
   * ⚠ FARA REGEX, ANUME. Un sablon construit la rulare are escapuri usor de stricat — prima
   * varianta a probei astea a picat exact asa, cu regexul rupt in transport.
   */
  const dir = "src/app/api/cron";
  const vinovate: string[] = [];
  for (const sub of readdirSync(dir)) {
    const cale = `${dir}/${sub}/route.ts`;
    let text: string;
    try { text = viu(cale); } catch { continue; }
    for (const coada of COZI_CU_GENERATIE) {
      if (text.includes(`from("${coada}").delete().in(`)) vinovate.push(`${sub}: ${coada}`);
    }
  }
  assert.deepEqual(vinovate, [], "stergere in bloc dintr-o coada cu generatie");
});

test("⚠ si cronurile fara CAS propriu il folosesc pe cel partajat", () => {
  /* About You, GMC si OLX n-au implementare proprie: trebuie sa treaca prin `coada-cas`. */
  for (const [sub, coada] of [
    ["aboutyou-sync", "aboutyou_sync_queue"],
    ["gmc-sync", "gmc_sync_queue"],
    ["olx-sync", "olx_sync_queue"],
  ] as const) {
    const text = viu(`src/app/api/cron/${sub}/route.ts`);
    assert.match(text, /from "@\/lib\/marketplace\/coada-cas"/, `${sub} nu importa CAS-ul`);
    for (const cap of [".delete(", ".update("]) {
      assert.ok(!text.includes(`from("${coada}")${cap}`), `${sub} scrie direct: ${coada}${cap}`);
    }
  }
});
