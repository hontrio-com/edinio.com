import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";

/*
 * Ecranele eMAG nu au voie sa tina navigarea pe loc.
 *
 * ═══ CE S-A INTAMPLAT (MNY AROMA, 28.10.2026) ═══
 *
 * Comerciantul a scris ca „apas peste tot si nu ma lasa sa ies” de pe pagina eMAG.
 * Butoanele chemau actiunile de server prin `useTransition` cu o functie `async`, iar in
 * React 19 orice tranzitie noua (si navigarea din Next e una) asteapta dupa o asemenea
 * actiune pana se termina. „Sugerează” a stat patru minute la eMAG.
 *
 * `useLucru` arata aceeasi rotita fara sa fie tranzitie. Proba tine ca niciun ecran eMAG
 * sa nu se intoarca la forma veche: unul singur ajunge ca pagina sa nu mai poata fi
 * parasita.
 */

const DOSAR = "src/components/dashboard";

/** Codul fara comentarii: o pomenire in explicatii nu e o folosire. */
function faraComentarii(sursa: string): string {
  return sursa
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ECRANE = readdirSync(DOSAR).filter((f) => /^Emag.*\.tsx$/.test(f));

test("ecranele eMAG: niciunul nu mai foloseste `useTransition`", () => {
  assert.ok(ECRANE.length >= 11, `s-au gasit doar ${ECRANE.length} ecrane eMAG; s-a mutat dosarul?`);
  const vinovate = ECRANE.filter((f) => /\buseTransition\b|\bstartTransition\b/.test(
    faraComentarii(readFileSync(`${DOSAR}/${f}`, "utf8")),
  ));
  assert.deepEqual(vinovate, [], "folosesc tranzitii, deci tin navigarea pe loc cat lucreaza");
});

test("ecranele eMAG: rotitele vin din `useLucru`", () => {
  for (const f of ["EmagClient.tsx", "EmagCategoryMapping.tsx", "EmagListings.tsx", "EmagDePublicat.tsx"]) {
    const cod = faraComentarii(readFileSync(`${DOSAR}/${f}`, "utf8"));
    assert.match(cod, /from "@\/components\/dashboard\/useLucru"/, `${f} nu importa useLucru`);
    assert.match(cod, /useLucru\(\)/, `${f} nu cheama useLucru`);
  }
});

test("useLucru: nu e tranzitie si nu lasa rotita pornita dupa o cadere", () => {
  const cod = faraComentarii(readFileSync(`${DOSAR}/useLucru.ts`, "utf8"));
  assert.doesNotMatch(cod, /useTransition|startTransition/);
  assert.match(cod, /finally\s*\{[^}]*setCate\(\(n\) => n - 1\)/, "contorul scade si cand lucrarea cade");
});

test("cautarea de categorii nu mai trimite omul la „Sugerează”", () => {
  /*
   * Dupa conectare raftul e gol. Inainte, cautarea raspundea „Apasă întâi «Sugestii»”,
   * iar butonul acela a stat patru minute. Acum cautarea il aduce singura.
   */
  const ecran = faraComentarii(readFileSync(`${DOSAR}/EmagCategoryMapping.tsx`, "utf8"));
  assert.doesNotMatch(ecran, /Apasă întâi/);
  assert.doesNotMatch(ecran, /raftAdus/);

  const actiuni = faraComentarii(readFileSync("src/lib/actions/emag.actions.ts", "utf8"));
  const cautarea = actiuni.slice(actiuni.indexOf("export async function cautaCategorieEmag"));
  const corp = cautarea.slice(0, cautarea.indexOf("\nexport async function", 10));
  assert.match(corp, /raftulEmag\(/, "fara raft memorat, cautarea il aduce");
});
