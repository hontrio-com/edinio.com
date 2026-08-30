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
  /*
   * ⚠ SE CER CAILE, NU NUMARUL LOR. Prima varianta cerea „exact trei"; de cand exista si retragerea
   * durabila dinaintea stergerii, sunt patru — iar un numar fix ar fi picat tocmai la ADAUGAREA
   * unei cai noi, adica exact cand regula se respecta mai bine. Se cere ca fiecare scriere sa-si
   * citeasca raspunsul, oricate ar fi.
   */
  const scrieri = [...coada.matchAll(/await admin\.from\("olx_sync_queue"\)\.upsert\(/g)];
  assert.ok(scrieri.length >= 3, `asteptam cel putin trei cai de punere la coada, sunt ${scrieri.length}`);
  for (const m of scrieri) {
    const inainte = coada.slice(Math.max(0, (m.index ?? 0) - 34), m.index);
    assert.match(inainte, /const \{ error(: eCoada)? \} = $/,
      `o scriere in coada nu-si prinde eroarea: …${coada.slice(Math.max(0, (m.index ?? 0) - 70), (m.index ?? 0) + 30)}`);
  }
});

test("⚠ si citirea configului: o pana nu inseamna „magazinul n-are OLX”", () => {
  /*
   * Inghitita, `config` iesea `{}`, `connected` iesea fals, si functia se intorcea linistita — o
   * hotarare luata pe baza unei pene, si tocmai in sensul care pierde munca.
   */
  const citiri = [...coada.matchAll(/\.select\("olx_config"\)/g)];
  assert.ok(citiri.length >= 2, "amandoua functiile citesc configul");
  /*
   * ⚠ Fiecare citire isi prinde eroarea — dar nu toate ARUNCA: retragerea dinaintea stergerii
   * intoarce `nesigur`, fiindca acolo cine cheama trebuie sa AFLE, ca sa nu stearga produsul.
   * Se cere fapta (eroarea e citita si opreste drumul), nu forma ei.
   */
  const pazite = (coada.match(/if \(eConfig\)/g) ?? []).length;
  assert.equal(pazite, citiri.length, "fiecare citire de config trebuie sa-si prinda eroarea");
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

/* ── Rotatia tokenului ────────────────────────────────────────────────────── */

test("⚠ rotatia tokenului are un singur castigator", () => {
  /*
   * ═══ ⚠ DOUA FIRE PORNEAU AMANDOUA REIMPROSPATAREA (30.08.2026) ═══
   *
   * `ensureMerchantToken` se cheama din cron, din actiuni si din callback. Doua fire care gasesc
   * acelasi access token expirat pleaca amandoua cu acelasi refresh token:
   *
   *     A: OLX -> A2 + R2, scrie R2
   *     B: OLX cu R1 -> refuz, fiindca R1 s-a consumat
   *     B scrie peste configul SANATOS al lui A ❌
   *
   * ⚠ COMPARAREA NU SE POATE FACE PE TOKEN: `refresh_token` e criptat in baza. Dar rotatia lasa un
   * martor necriptat, `token_updated_at`, si „nimeni n-a rotit de cand am citit eu" se spune atunci
   * simplu. Masurat pe baza adevarata: al doilea fir primeste `false`, iar peticul lui NU intra.
   */
  const oauth = readFileSync("src/lib/olx/oauth.ts", "utf8");
  assert.match(oauth, /await db\.rpc\("olx_roteste_tokenul", \{/);
  assert.match(oauth, /p_vazut: vazut,/);
  /* ⚠ Cine pierde cursa RECITESTE, nu se plange: celalalt fir a scris deja un token bun. */
  assert.match(oauth, /if \(!eRotatie && aScris === false\) \{[\s\S]{0,400}?citesteConfig\(db, businessId\)/);
  assert.doesNotMatch(oauth, /aScris === false[\s\S]{0,200}?needsReconnect: true/,
    "un fir care a pierdut cursa nu declara sesiunea moarta");

  /* ⚠ Si conditia chiar e in baza, sub incuietoare — altfel doua fire ar trece amandoua de ea. */
  const temelie = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = temelie.indexOf("FUNCTION public.olx_roteste_tokenul");
  assert.notEqual(i, -1, "functia lipseste din temelie");
  const d = temelie.indexOf("AS $function$", i);
  const corp = temelie.slice(d, temelie.indexOf("$function$", d + 13));
  assert.match(corp, /for update/i, "randul se incuie INAINTE de comparare");
  assert.match(corp, /v_acum is distinct from p_vazut/,
    "`is distinct from` acopera si cazul „niciunul nu exista inca”");
  /* ⚠ Si nu se rescrie logica de secrete: se sprijina pe `jsonb_merge_config`. */
  assert.match(corp, /perform public\.jsonb_merge_config\(p_business_id, 'olx_config', p_patch\)/);
});

/* ── Retragerea durabila inaintea stergerii ──────────────────────────────── */

test("⚠ produsul nu se sterge pana retragerea de pe OLX nu e SCRISA", () => {
  /*
   * ═══ ⚠ STERGEREA UNUI PRODUS NU GARANTA RETRAGEREA (30.08.2026, tarziu) ═══
   *
   * `enqueueOlxSync(..., "delete")` se chema DUPA stergere, prin `dupaRaspuns`, iar functia e
   * dinadins non-throwing:
   *
   *     produsul se sterge din Edinio ✅
   *     punerea la coada pica -> se scrie in jurnal
   *     dar produsul a DISPARUT deja
   *     -> anuntul ramane ACTIV la OLX, si nimic nu mai stie de el ❌
   *
   * eMAG avea deja apararea asta; OLX nu. Nu se asteapta dupa OLX — doar ca lucrarea sa fie SCRISA.
   */
  const q = readFileSync("src/lib/olx/queue.ts", "utf8");
  assert.match(q, /export async function enqueueOlxRetragereInainteDeStergere\(/);
  /* ⚠ Si „n-am putut citi" NU e „nu e conectat": puse sub acelasi raspuns, o pana lasa stergerea sa treaca. */
  assert.match(q, /if \(eConfig\) \{[\s\S]{0,180}?fel: "nesigur"/);
  assert.match(q, /if \(!config\.connected \|\| !config\.refresh_token\) return \{ fel: "gata" \};/);
  /* ⚠ Si aici NU se inghite, spre deosebire de restul fisierului: cine cheama trebuie sa afle. */
  assert.match(q, /scrieEsecul\("retragereInainteDeStergere"[\s\S]{0,140}?fel: "nesigur"/);

  const act = readFileSync("src/lib/actions/product.actions.ts", "utf8");
  /* ⚠ Si chiar INAINTEA stergerii, pe amandoua caile — una singura lasata pe dinafara ajunge. */
  for (const nume of ["deleteProduct", "bulk"]) void nume;
  const chemari = [...act.matchAll(/enqueueOlxRetragereInainteDeStergere\(/g)];
  assert.equal(chemari.length, 2, "si stergerea unui produs, si cea in masa");
  for (const m of chemari) {
    const dupa = act.slice(m.index ?? 0, (m.index ?? 0) + 400);
    assert.match(dupa, /fel === "nesigur"/, "rezultatul retragerii trebuie citit");
  }
  const iRetragere = act.indexOf("enqueueOlxRetragereInainteDeStergere(businessId, [productId])");
  const iStergere = act.indexOf('.from("products").delete()', iRetragere);
  assert.ok(iRetragere > 0 && iStergere > iRetragere, "retragerea se scrie INAINTEA stergerii");
});

test("⚠ o intentie noua reinvie o scrisoare moarta", () => {
  /*
   * Dupa cinci incercari elementul primeste `abandonat_la`, iar `revendica_din_coada` il ocoleste.
   * Dar `upsert`-ul nu atingea campurile alea, deci nici urmatoarea modificare a produsului nu-l
   * readucea: pretul nou nu pleca NICIODATA.
   *
   * ⚠ Aici ajung doar apasarile omului — reincercarile cronului trec prin `scrieDacaNeschimbat` —
   * deci resetarea nu poate face o roata perfecta din ceva ce esueaza mereu.
   */
  assert.match(coada, /const REINVIE = \{ attempts: 0, last_error: null, next_retry_at: null, abandonat_la: null \}/);
  const scrieri = [...coada.matchAll(/await admin\.from\("olx_sync_queue"\)\.upsert\(/g)];
  for (const m of scrieri) {
    const dupa = coada.slice(m.index ?? 0, (m.index ?? 0) + 420);
    assert.match(dupa, /\.\.\.REINVIE/, "o punere la coada care nu reinvie lasa lucrarea moarta");
  }
  /* ⚠ Si NU atinge `generation`: declansatorul o creste singur, deci lucratorul vechi nu mai scrie. */
  assert.doesNotMatch(coada, /generation:/);
});

test("⚠ o pana la citirea produselor nu mai sterge anunturi vii", () => {
  /*
   * ═══ ⚠ CEL MAI SCUMP DEFECT DIN TOATA INTEGRAREA ═══
   *
   * Citirea produselor mergea oarba, iar `productMap.get(...) ?? null` da `null` pentru orice
   * produs negasit. `upsertRemote` citeste `null` ca „produsul a fost sters din magazin" si cheama
   * `removeRemote` — adica dezactiveaza SI STERGE anuntul la OLX:
   *
   *     produsul exista, anuntul e ACTIV la OLX
   *     SELECT-ul pica o clipa -> harta e goala -> product = null
   *     -> DELETE la OLX ❌
   *
   * ⚠ `null` ARE VOIE SA INSEMNE UN SINGUR LUCRU: „am putut intreba, si produsul chiar nu mai e".
   */
  const i = cron.indexOf("const { data: prods, error: eProduse }");
  assert.notEqual(i, -1, "citirea produselor nu-si prinde eroarea");
  const dupa = cron.slice(i, cron.indexOf("for (const item of items)", i));
  assert.match(dupa, /if \(eProduse\) \{[\s\S]{0,700}?continue;/,
    "o citire picata trebuie sa opreasca TOT lucrul pentru magazinul asta");
  /* ⚠ Si lucrarile raman: se amana, nu se arunca. */
  assert.match(dupa, /next_retry_at: asteptareaUrmatoare\(attempts\)/);
  assert.doesNotMatch(dupa, /stergeDacaNeschimbat/);
});
