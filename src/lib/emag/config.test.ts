import test from "node:test";
import assert from "node:assert/strict";


/* ══════════════════════════════════════════════════════════════════════════
   PETICUL DE CONFIGURARE SE IMBINA IN POSTGRES (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

test("`patchEmagConfig` nu mai citeste-si-scrie: imbina in baza", async () => {
  /*
   * ═══ DOUA PAGUBE INTR-O SINGURA FORMA ═══
   *
   * 1. Citirea picata reducea configurarea la PETIC. `const { data } = …` arunca `error`;
   *    la o pana de o clipa, `config` devenea `{}` si in `emag_config` ramanea numai
   *    `{"reconcile_page": 20}`. Dispareau `username`, `connected`, `tara`,
   *    `category_map` — magazinul aparea deconectat. `pazeste_secretele` tine parola, dar
   *    numai parola.
   *
   * 2. Doua scrieri concurente se calcau. Cronul citeste, comerciantul apasa „Conectează"
   *    cu parola noua, cronul scrie inapoi obiectul VECHI. Ecranul zice „conectat", iar
   *    cererile pica pe autentificare.
   *
   * `jsonb_merge_config` face `set emag_config = coalesce(emag_config,'{}') || $1` intr-o
   * singura instructiune. Exista de mult si e deja folosita de cronul About You.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/emag/config.ts", "utf8");
  const faraNote = sursa.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");

  assert.match(faraNote, /jsonb_merge_config/, "imbinarea trebuie facuta in Postgres");
  assert.ok(
    !/\.select\("emag_config"\)/.test(faraNote),
    "nu se mai citeste configurarea ca s-o imbinam in Node",
  );
  assert.ok(
    !/\.update\(\{\s*emag_config/.test(faraNote),
    "nu se mai scrie obiectul intreg: ar calca o salvare concurenta",
  );
});

test("eroarea la scrierea peticului se SPUNE, dar nu rupe trecerea", async () => {
  /*
   * ⚠ Se cheama din cron, DUPA lucrari care chiar au reusit — un cursor de comenzi mutat,
   * un marcaj de retururi. O exceptie ar pierde si ce a mers. Dar tacuta cu totul, ar fi
   * chiar tiparul vanat toata ziua: marcajul nu avanseaza, fereastra reciteste la
   * nesfarsit aceleasi comenzi, si nimic nu spune de ce.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/emag/config.ts", "utf8");
  assert.match(sursa, /if \(error\)/, "eroarea trebuie citita");
  assert.match(sursa, /logError/, "si scrisa in jurnal");
  assert.ok(!/throw/.test(sursa), "dar nu aruncata: ar rupe trecerea cronului");
});

test("webhook-ul nu mai are propria copie de citire-si-scriere", async () => {
  /*
   * ⚠ Era a doua copie, si cea mai periculoasa: ruleaza pe ritmul LOR, deci poate cadea
   * peste orice — peste o trecere de cron, peste „Conectează", peste import.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/app/api/emag/webhook/route.ts", "utf8");
  assert.match(sursa, /jsonb_merge_config/, "webhook-ul trebuie sa imbine tot in baza");
  assert.ok(
    !/\.select\("emag_config"\)/.test(sursa),
    "webhook-ul nu mai citeste configurarea ca s-o rescrie intreaga",
  );
});
