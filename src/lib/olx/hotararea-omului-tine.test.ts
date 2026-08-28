import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   CE A HOTARAT OMUL NU SE DESFACE SINGUR (29.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   Modelul OLX e „produs vandabil -> creeaza sau actualizeaza anuntul", scris chiar in antetul lui
   `sync.ts`. Bun cat timp singura intentie e a automatului. Dar ecranul are trei butoane manuale —
   „Dezactivează", „Activează", „Șterge anunțul" — iar automatul le desfacea pe doua din trei.

   ⚠ 1. „ȘTERGE ANUNȚUL". `removeRemote` stergea si anuntul la OLX, si randul local. Iar coada OLX
   n-are garda „numai produsele deja listate" (About You si Trendyol o au) si se umple dupa FIECARE
   editare de pret sau stoc — inclusiv dupa fiecare comanda venita de pe alt marketplace, prin
   `stoc-pe-canale`. La trecerea urmatoare `getRow` nu gasea nimic, deci ramura de CREARE, deci
   anuntul reaparea la OLX cu alt id.

   Iar butonul ii promite textual: „Acțiunea nu poate fi anulată."

   ⚠ 2. „DEZACTIVEAZĂ". `deactivateRemote` scrie `removed_by_user`, iar `upsertRemote` vedea starea
   asta si chema `activateRemote`. Butonul „Activează" exista separat — deci reactivarea automata il
   facea fara rost si ii lua omului hotararea din mana.

   ⚠ `outdated` NU E LA FEL: acolo OLX a expirat anuntul singur, si reactivarea automata e chiar ce
   trebuie. Deosebirea nu e cum arata starea, ci CINE a hotarat-o.
*/

const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");

test("⚠ stergerea lasa o urma, nu goleste randul", () => {
  assert.doesNotMatch(sync, /await admin\.from\("olx_adverts"\)\.delete\(\)\.eq\("id", row\.id\);/,
    "randul sters ia cu el singura urma ca omul a cerut stergerea");
  assert.match(sync, /sters_de_om_la: new Date\(\)\.toISOString\(\)/);
  assert.match(sync, /status: "sters_de_om"/);
});

test("⚠ si daca urma nu se scrie, stergerea NU se raporteaza reusita", () => {
  /*
   * ⚠ Aici e tot rostul: raportata reusita cu urma nescrisa, trecerea urmatoare ar recrea anuntul —
   * adica exact defectul, doar mai rar. `permanent: false` inseamna „se reia".
   */
  assert.match(sync, /if \(eUrma\) \{[\s\S]{0,220}?permanent: false/);
});

test("⚠ un anunt sters de om nu se recreeaza singur", () => {
  /*
   * ⚠ Paza vine INAINTEA oricarei cai de creare, si dupa cea de stergere: un produs disparut
   * trebuie sa poata fi curatat chiar daca a fost sters de om mai devreme.
   */
  const iStergere = sync.indexOf("if (!product) return removeRemote(");
  const iPaza = sync.indexOf("if (row?.sters_de_om_la) return { ok: true, action: \"skipped\" };");
  const iCreare = sync.indexOf("await createAdvert(ctx.token, body)");
  assert.ok(iStergere > 0 && iPaza > iStergere, "paza vine dupa calea de stergere");
  assert.ok(iCreare > iPaza, "si INAINTEA crearii");
});

test("⚠ urma chiar se citeste din baza, nu doar se scrie", () => {
  /*
   * ⚠ Proba care scaneaza sursa arata ca SCRIE `row.sters_de_om_la`, nu ca are ce citi. Acelasi
   * lant care lipsea la `aprobat_odata`: coloana, selectul, tipul randului.
   */
  assert.match(sync, /\.select\("id, olx_advert_id, status, offer_id, sters_de_om_la, dezactivat_de"\)/);
  assert.match(sync, /^\s*sters_de_om_la: string \| null;$/m);
  const temelie = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(temelie, /sters_de_om_la timestamp with time zone/i);
});

test("⚠ „Postează pe OLX” e iesirea, si sterge urma INAINTE de trimitere", () => {
  /*
   * ⚠ Lasata, `syncProductNow` ar iesi `skipped` si comerciantul ar apasa degeaba, fara sa afle de
   * ce. O regula care refuza fara iesire e o usa incuiata fara clanta — aici clanta exista, dar
   * trebuia legata.
   */
  const i = actiuni.indexOf("export async function publishOlxProduct");
  const j = actiuni.indexOf("\nexport ", i + 10);
  const corp = actiuni.slice(i, j > 0 ? j : actiuni.length);
  const iUrma = corp.indexOf('.update({ sters_de_om_la: null }');
  const iTrimite = corp.indexOf("syncProductNow(");
  assert.ok(iUrma > 0, "publicarea nu sterge urma");
  assert.ok(iTrimite > iUrma, "urma se sterge INAINTE de trimitere");
  /* ⚠ Si daca stergerea urmei pica, nu se trimite: altfel iese `skipped` si omul nu intelege. */
  assert.match(corp, /if \(eUrma\) return \{ error:/);
});

test("⚠ se reactiveaza ce am stins NOI, nu ce a oprit omul", () => {
  /*
   * ═══ ⚠ REGULA DE IERI INGHETASE SI DEZACTIVARILE AUTOMATE (30.08.2026) ═══
   *
   * Proba cerea, pana azi, ca `removed_by_user` sa NU se reactiveze niciodata automat. **Avea
   * dreptate sub premisa de-atunci**: starea aia insemna, dupa nume, „omul a hotarat".
   *
   * Premisa a cazut cand s-a vazut ca ACEEASI stare o scriem si noi, singuri, cand stocul ajunge la
   * zero. Deci regula ingheta si ce stinsesem noi:
   *
   *     stoc 5 -> 0 -> stingem anuntul, si scriem `removed_by_user`
   *     stoc 0 -> 10 -> produsul e iar vandabil
   *     dar starea spune „omul a hotarat" -> anuntul RAMANE stins ❌
   *
   * Acum deosebirea se citeste din `dezactivat_de`, nu din numele starii.
   */
  assert.match(sync, /const stinsDeNoi = stareaAcum === "removed_by_user"\s*\n?\s*&& row\.dezactivat_de != null && row\.dezactivat_de !== "om";/);
  assert.match(sync, /if \(stareaAcum === "outdated" \|\| stinsDeNoi\) \{/);
  assert.doesNotMatch(sync, /\["removed_by_user", "outdated"\]\.includes\(advert\.status \|\| row\.status\)/,
    "reactivarea neconditionata desface apasarea pe „Dezactivează”");
  /* ⚠ Si `null` se citeste prudent, ca „om": un anunt care asteapta o apasare e mai ieftin decat
     unul care porneste singur cand n-ar trebui. */
  assert.match(sync, /row\.dezactivat_de != null/);
  /* ⚠ Si butonul manual a ramas acolo unde era: fara el, refuzul de mai sus ar fi o fundatura. */
  const ecran = readFileSync("src/components/dashboard/OlxClient.tsx", "utf8");
  assert.match(ecran, /canActivate = \["removed_by_user", "outdated"\]\.includes\(a\.status\)/);
  /* ⚠ Si starea noua are un nume in ecran, altfel apare ca necunoscuta. */
  assert.match(ecran, /sters_de_om: \{ label: "Șters de tine"/);
});

/* ── Cine a hotarat dezactivarea ─────────────────────────────────────────── */

test("⚠ dezactivarea isi scrie motivul, si nu se mai presupune o vanzare", () => {
  /*
   * ⚠ La OLX, `is_success` inseamna „tranzactia s-a incheiat cu bine" — adica S-A VANDUT. Il
   * trimiteam `true` la fiecare dezactivare: la apasarea omului, la stoc zero, la produs inactiv,
   * si chiar inaintea unei stergeri. Niciunul nu e o vanzare. E o informatie falsa data unui
   * furnizor despre propriul lui produs.
   */
  const client = readFileSync("src/lib/olx/client.ts", "utf8");
  assert.match(client, /body\.is_success = optiuni\?\.sAVandut === true;/);
  assert.doesNotMatch(client, /body\.is_success = true;/, "s-a intors presupunerea");

  /* ⚠ Si toate cele patru cai ale noastre spun limpede ca NU e o vanzare. */
  const chemari = [...sync.matchAll(/advertCommand\([^)]*"deactivate"[^)]*\)/g)];
  assert.ok(chemari.length >= 2, "amandoua caile de dezactivare");
  for (const m of chemari) {
    assert.match(m[0], /sAVandut: false/, `o dezactivare nu spune ca nu e vanzare: ${m[0]}`);
  }

  /* ⚠ Iar motivul se scrie pe rand, ca reactivarea sa poata deosebi. */
  assert.match(sync, /export type SursaDezactivarii = "om" \| "stoc" \| "produs-inactiv" \| "inainte-de-stergere";/);
  assert.match(sync, /dezactivat_de: sursa/);
  assert.match(sync, /deactivateRemote\(admin, ctx, row, product\.is_active \? "stoc" : "produs-inactiv"\)/);
  assert.equal((sync.match(/deactivateRemote\(admin, ctx, row, "om"\)/g) ?? []).length, 2,
    "amandoua apasarile din ecran spun „om”");
});

test("⚠ piatra se pune numai daca OLX chiar a sters anuntul", () => {
  /*
   * ═══ ⚠ SE PUNEA SI CAND ANUNTUL RAMANEA VIU ═══
   *
   * OLX refuza sa stearga un anunt ACTIV: `400 Invalid status`. Iar `classify` socoteste orice
   * `400` drept permanent, deci codul mergea mai departe si scria local „șters de tine" — in timp
   * ce la ei anuntul se vindea in continuare. Si de-acum e mai rau: piatra il opreste sa fie
   * recreat, deci nimic nu-l mai atinge.
   *
   * ⚠ NUMAI DOUA RASPUNSURI INDREPTATESC PIATRA: stergerea reusita, si `404`.
   */
  const i = sync.indexOf("async function removeRemote");
  const corp = sync.slice(i, sync.indexOf("\nasync function", i + 10));
  assert.match(corp, /if \(isOlxError\(res\) && res\.status !== 404\) \{[\s\S]{0,260}?permanent: false/,
    "orice alt raspuns decat 204/404 inseamna „poate e inca viu”, deci se reia");
  assert.doesNotMatch(corp, /const \{ permanent \} = classify\(res\);/,
    "s-a intors socoteala care lua `400` drept „gata, putem uita de el”");
  /* ⚠ Si rezultatul dezactivarii de dinainte se citeste: e chiar cauza celui mai probabil `400`. */
  assert.match(corp, /const dez = await advertCommand\([\s\S]{0,140}?"deactivate"/);
  assert.match(corp, /if \(isOlxError\(dez\) && dez\.status !== 400\)/);
});
