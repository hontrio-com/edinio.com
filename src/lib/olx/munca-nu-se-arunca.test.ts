import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   MUNCA CERUTA DE COMERCIANT NU SE ARUNCA (29.08.2026, noaptea)
   ══════════════════════════════════════════════════════════════════════════

   Trei drumuri deosebite duceau in acelasi loc: o modificare ceruta de om disparea fara ca cineva
   sa afle.

   ⚠ 1. PUNEREA LA COADA MERGEA OARBA. Antetul lui `queue.ts` povesteste incidentul cu 1051 de
   produse si spune ca de-atunci esecurile se scriu. Nu se scriau: `supabase-js` NU arunca la o
   eroare PostgREST, o INTOARCE in `{ error }`, iar niciuna din cele trei functii nu-l citea. Deci
   `try/catch`-ul pazea doar caderile de retea ale clientului — tocmai cazul rar.

   ⚠ 2. `null` INSEMNA CINCI LUCRURI. `loadOlxContext` intorcea `null` si pentru „nu e conectat", si
   pentru „OLX n-a raspuns", si pentru „baza a picat" — iar cronul citea `null` ca „deconectat" si
   STERGEA lucrarile revendicate. O pana de cinci secunde arunca definitiv preturile si stocurile.

   ⚠ 3. LA A CINCEA INCERCARE SE STERGEA. Dar cauzele permanente sunt tratate mai devreme, deci
   acolo ajung doar `429`, `500` si retea. O pana OLX de o jumatate de ora consuma cele cinci
   incercari intr-un minut si arunca modificarea — iar pretul ramane vechi la ei pana cand omul mai
   atinge produsul, poate niciodata.
*/

const coada = readFileSync("src/lib/olx/queue.ts", "utf8");
const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
const cron = readFileSync("src/app/api/cron/olx-sync/route.ts", "utf8");

test("⚠ fiecare scriere in coada isi citeste raspunsul", () => {
  /*
   * ⚠ SE NUMARA CE A RAMAS DESCOPERIT, nu ce e acoperit: un prag pe „cel putin N verificate" ar
   * trece verde peste o functie noua lasata pe dinafara.
   */
  /*
   * ⚠ ANCORA SE PUNE PE ATRIBUIRE, nu pe forma cererii. Cautat `await admin.from(...).upsert(`,
   * regexul prindea si scrierile REPARATE — ele contin exact acelasi text, doar precedat de
   * `const { error: eCoada } = `. Ce deosebeste o scriere pazita de una oarba nu e cererea, ci ce
   * se face cu raspunsul ei.
   */
  const scrieri = [...coada.matchAll(/await admin\.from\("olx_sync_queue"\)\.upsert\(/g)];
  assert.equal(scrieri.length, 3, "cele trei functii de punere la coada");
  for (const m of scrieri) {
    const inainte = coada.slice(Math.max(0, (m.index ?? 0) - 30), m.index);
    assert.match(inainte, /const \{ error: eCoada \} = $/,
      `o scriere in coada nu-si prinde eroarea: …${coada.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 30)}`);
  }
  assert.equal((coada.match(/if \(eCoada\) throw new Error/g) ?? []).length, 3);
});

test("⚠ si citirea configului: o pana nu inseamna „magazinul n-are OLX”", () => {
  /*
   * Inghitita, `config` iesea `{}`, `connected` iesea fals, si functia se intorcea linistita — o
   * hotarare luata pe baza unei pene, si tocmai in sensul care pierde munca.
   */
  const citiri = [...coada.matchAll(/\.select\("olx_config"\)/g)];
  assert.ok(citiri.length >= 2, "amandoua functiile citesc configul");
  assert.equal((coada.match(/if \(eConfig\) throw new Error/g) ?? []).length, citiri.length,
    "fiecare citire de config trebuie sa-si prinda eroarea");
});

test("⚠ contextul spune DE CE, nu doar „nu”", () => {
  assert.match(sync, /export type RezultatContext =/);
  for (const stare of ["gata", "deconectat", "cere-reconectare", "trecatoare"]) {
    assert.match(sync, new RegExp(`stare: "${stare}"`), `lipseste starea ${stare}`);
  }
  /* ⚠ O citire picata a configului NU e „deconectat": ar duce la stergerea cozii pentru o pana. */
  assert.match(sync, /if \(eConfig\) return \{ stare: "trecatoare"/);
  assert.match(sync, /if \(eBiz\) return \{ stare: "trecatoare"/);
  /* ⚠ Iar „cere reconectare" se ia de la EI, din `needsReconnect`, nu se ghiceste. */
  assert.match(sync, /tok\.needsReconnect\s*\n?\s*\?\s*\{ stare: "cere-reconectare"/);
});

test("⚠ numai „deconectat” indreptateste stergerea lucrarilor", () => {
  const i = cron.indexOf('if (r.stare !== "gata") {');
  assert.notEqual(i, -1, "cronul nu mai citeste verdictul contextului");
  const ramura = cron.slice(i, cron.indexOf("const ctx = r.ctx;", i));
  /* ⚠ Stergerea trebuie sa fie INAUNTRUL ramurii de „deconectat", nu a intregului „nu e gata". */
  assert.match(ramura, /if \(r\.stare === "deconectat"\) \{[\s\S]{0,220}?stergeDacaNeschimbat/);
  /* ⚠ Iar celelalte doua ASTEAPTA: se scrie o incercare si o asteptare, nu se sterge. */
  /*
   * ⚠ Prima socoteala taia „+30 de caractere" dupa `if (r.stare === "deconectat")` — adica exact
   * INAUNTRUL blocului, care chiar contine stergerea. Se taie de la CAPATUL blocului.
   */
  const iBloc = ramura.indexOf('if (r.stare === "deconectat")');
  const dupaDeconectat = ramura.slice(ramura.indexOf("continue;", iBloc) + "continue;".length);
  assert.doesNotMatch(dupaDeconectat, /stergeDacaNeschimbat/,
    "o pana trecatoare nu are voie sa stearga munca");
  assert.match(dupaDeconectat, /next_retry_at: asteptareaUrmatoare\(attempts\)/);
});

test("⚠ un esec trecator nu se mai arunca la a cincea incercare", () => {
  /*
   * ⚠ `permanent` e tratat mai sus, deci aici ajung doar cauze trecatoare. Sters, ce a cerut omul
   * dispare definitiv; abandonat, ramane vizibil — cu de cate ori s-a incercat si cu ultima eroare.
   */
  const i = cron.indexOf("} else {\n        failed++;");
  assert.notEqual(i, -1);
  const ramura = cron.slice(i, cron.indexOf("await pause(PACE_MS);", i));
  assert.doesNotMatch(ramura, /stergeDacaNeschimbat/, "munca trecatoare nu se sterge");
  assert.match(ramura, /abandonat_la: now/, "la capat se pun scrisori moarte, nu stergere");
  assert.match(ramura, /severity: "critical"/, "si abandonul se vede in jurnal");
});

test("⚠ asteptarea creste, dar are plafon", () => {
  /*
   * Fara plafon, a cincea asteptare ar fi de ore si o modificare de pret ar sta degeaba dupa ce OLX
   * si-a revenit demult. Fara crestere, cele cinci incercari s-ar consuma intr-un minut — chiar
   * defectul reparat.
   */
  assert.match(cron, /function asteptareaUrmatoare\(attempts: number\): string \{/);
  assert.match(cron, /Math\.min\(15, 2 \*\* Math\.max\(0, attempts - 1\)\)/);
});

test("⚠ si coada chiar ocoleste ce e abandonat sau in asteptare", () => {
  /*
   * ⚠ Fara asta, jumatatea de sus ar fi o teorie: un element cu `next_retry_at` in viitor ar fi
   * revendicat oricum, iar unul abandonat s-ar relua la nesfarsit.
   */
  const temelie = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = temelie.indexOf("FUNCTION public.revendica_din_coada");
  const d = temelie.indexOf("AS $function$", i);
  const corp = temelie.slice(d, temelie.indexOf("$function$", d + 13));
  assert.match(corp, /and c\.abandonat_la is null/);
  assert.match(corp, /and \(c\.next_retry_at is null or c\.next_retry_at <= now\(\)\)/);
});
