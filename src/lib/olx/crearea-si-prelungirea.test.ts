import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   CE NU SE POATE DESFACE SE FACE O SINGURA DATA (30.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ 1. PAZA ANTI-DUPLICAT CADEA DESCHIS. Inaintea crearii se intreaba OLX daca produsul are deja un
   anunt (`GET /adverts?external_id=…`). Comentariul de acolo spunea ca un esec al interogarii nu
   trebuie sa opreasca publicarea, „ca sa nu blocheze la fiecare hopa de retea". Suna cuminte, si e
   pe dos: interogarea aia e SINGURA paza impotriva duplicatelor, si se strica exact atunci cand
   duplicatul e cel mai probabil — cand OLX are probleme.

       POST-ul de acum un minut a REUSIT la OLX, dar scrierea locala a picat
       se reia: interogarea da timeout
       „nu blocam publicarea" -> POST din nou
       -> doua anunturi pentru acelasi produs, si numai unul legat la noi

   ⚠ CREAREA E SINGURUL EFECT DIN TOT MARKETPLACE-UL CARE NU SE POATE DESFACE de la noi: al doilea
   anunt are alt id, nu e in `olx_adverts`, si nimeni nu-l mai gaseste vreodata.

   ⚠ 2. PLASA DE PRELUNGIRE BATEA IN EI DIN MINUT IN MINUT. Fereastra e „expira in mai putin de 24
   de ore", cronul porneste in fiecare minut, iar refuzul lor nu era nici citit, nici tinut minte.
*/

const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
const cron = readFileSync("src/app/api/cron/olx-sync/route.ts", "utf8");
const mapping = readFileSync("src/lib/olx/mapping.ts", "utf8");

test("⚠ daca nu putem verifica, nu cream", () => {
  /*
   * ⚠ Ancora cerea `if (isOlxError(existente)) {`. **Avea dreptate sub premisa de-atunci**: paza
   * chema `listAdverts` de-a dreptul. De cand trece prin `anunturileLorPentru` — acelasi rezolvitor
   * ca la stoc, stergere si butoanele manuale — raspunsul e `{ ok, esec }`, nu un `OlxResult`.
   *
   * Regula n-a schimbat-o nimic, ba s-a INTARIT: rezolvitorul pagineaza, cere doi martori, si se
   * opreste si la plafon, nu doar la o cerere picata.
   */
  const iPaza = sync.indexOf("if (!existente.ok) return existente.esec;");
  const iCreare = sync.indexOf("await createAdvert(ctx.token, body)");
  assert.ok(iPaza > 0, "lipseste iesirea pe interogare picata");
  assert.ok(iCreare > iPaza, "paza vine INAINTEA crearii, altfel nu pazeste nimic");
  /* ⚠ Si chiar rezolvitorul central, nu inca o chemare cu alta regula. */
  const iCautare = sync.indexOf("const existente = await anunturileLorPentru(ctx, product.id, false);");
  assert.ok(iCautare > 0 && iCautare < iPaza, "crearea trebuie sa foloseasca rezolvitorul paginat");
  assert.doesNotMatch(sync, /Un esec al interogarii NU opreste crearea/,
    "s-a intors comentariul care indreptatea crearea pe nevazute");
});

test("⚠ prelungirea isi tine minte incercarea, la reusita SI la refuz", () => {
  /*
   * ⚠ La reusita, `valid_to` se muta abia dupa urmatoarea citire de stare — deci fara marcaj randul
   * ar fi ramas in fereastra si l-am fi batut iar peste un minut, exact ca la refuz.
   */
  const i = cron.indexOf("for (const row of expiring ?? [])");
  const corp = cron.slice(i, cron.indexOf("console.log(`[olx-sync]", i));
  const iMarcaj = corp.indexOf("ultima_prelungire_la: now");
  const iSocoteala = corp.indexOf('if (!("error" in res)) extended++;');
  assert.ok(iMarcaj > 0, "incercarea nu se tine minte");
  assert.ok(iSocoteala > iMarcaj, "marcajul se scrie INAINTE de a socoti reusita");
  /* ⚠ Si randul se ocoleste o zi de-atunci. */
  assert.match(cron, /\.or\(`ultima_prelungire_la\.is\.null,ultima_prelungire_la\.lt\.\$\{deIncercat\}`\)/);
  /* ⚠ Si un marcaj nescris se vede: altfel il batem iar, tacut. */
  assert.match(corp, /if \(eMarcaj\) \{[\s\S]{0,300}?prelungirea s-a incercat, dar marcajul nu s-a scris/);
});

test("⚠ `photos_limit = 0` chiar inseamna zero", () => {
  /*
   * `Math.max(1, …)` trimitea o poza si atunci — iar OLX are categorii cu limita zero si raspunde
   * „Image limit exceeded". Publicarea pica intreaga, pentru o poza pe care noi am hotarat s-o
   * trimitem oricum.
   */
  assert.match(mapping, /Math\.max\(0, entry\.photos_limit \?\? 8\)/);
  assert.doesNotMatch(mapping, /Math\.max\(1, entry\.photos_limit/);
});

test("⚠ publicarea unei selectii ANUME sterge piatra; „publică tot” nu", () => {
  /*
   * ⚠ Deosebirea e cine a numit produsul. La o selectie, omul cere chiar produsele alea. La
   * „Publică tot", el cere „tot ce e de publicat", nu „desfa si hotararile mele de dinainte".
   */
  const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");
  const iSel = actiuni.indexOf("export async function publishProductsToOlx");
  const corpSel = actiuni.slice(iSel, actiuni.indexOf("\nexport ", iSel + 10));
  assert.match(corpSel, /\.update\(\{ sters_de_om_la: null \} as never\)/,
    "selectia anume trebuie sa stearga urma, altfel elementele intra in coada si sunt sarite");

  const iTot = actiuni.indexOf("export async function publishAllOlx");
  const corpTot = actiuni.slice(iTot, actiuni.indexOf("\nexport ", iTot + 10));
  assert.doesNotMatch(corpTot, /sters_de_om_la: null/, "„publică tot” nu invie ce a sters omul");
  /* ⚠ Dar spune cate a sarit: un numar care tace despre ele l-ar face sa creada ca pleaca si alea. */
  assert.match(corpTot, /sarite: sterseDeOm\.size/);
  const ecran = readFileSync("src/components/dashboard/OlxClient.tsx", "utf8");
  assert.match(ecran, /nu se republică/);
});

test("⚠ si scrierile in coada din publicarea in masa isi citesc raspunsul", () => {
  /*
   * Oarbe, raportau „N trimise la OLX" cand baza acceptase zero — chiar tiparul din antetul lui
   * `queue.ts`, pe alta cale.
   */
  const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");
  const scrieri = [...actiuni.matchAll(/await admin\s*\n?\s*\.?from\("olx_sync_queue"\)\s*\n?\s*\.upsert\(/g)];
  assert.ok(scrieri.length >= 2, "amandoua caile de publicare in masa");
  for (const m of scrieri) {
    const inainte = actiuni.slice(Math.max(0, (m.index ?? 0) - 34), m.index);
    assert.match(inainte, /const \{ error: eCoada \} = $/,
      `o scriere in masa nu-si prinde eroarea: …${actiuni.slice(Math.max(0, (m.index ?? 0) - 70), (m.index ?? 0) + 30)}`);
  }
});

test("⚠ contul de firma se afla de la ei, si nu calca ce a ales omul", () => {
  const tipuri = readFileSync("src/lib/olx/types.ts", "utf8");
  assert.match(tipuri, /is_business\?: boolean;/, "tipul nici nu cuprindea campul");
  const callback = readFileSync("src/app/api/olx/oauth/callback/route.ts", "utf8");
  /*
   * ⚠ Ancora cerea `config.advertiser_type ??= "business"`. **Avea dreptate sub premisa de-atunci**:
   * `config` ERA obiectul citit din baza, deci `??=` insemna „doar daca nu scrie deja ceva".
   *
   * De cand callback-ul scrie un PETIC — ca sa nu mai calce un token reimprospatat intre timp —
   * `config` e obiectul NOU, gol, iar `??=` pe el n-ar mai apara nimic: ar scrie mereu. Alegerea
   * omului sta acum in `existent`, si de-acolo se citeste.
   *
   * Regula n-a schimbat-o nimic: o reconectare nu are voie sa calce ce a ales el intre timp.
   */
  assert.match(callback, /config\.advertiser_type = existent\.advertiser_type \?\? "business"/);
  assert.doesNotMatch(callback, /config\.advertiser_type = "business";/,
    "s-a intors scrierea neconditionata, care calca alegerea omului");
  assert.match(callback, /config\.contact_name = existent\.contact_name \?\?/);
});
