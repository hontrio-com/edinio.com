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
  assert.match(sync, /\.select\("id, olx_advert_id, status, offer_id, sters_de_om_la"\)/);
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

test("⚠ se reactiveaza numai ce a expirat singur, nu ce a oprit omul", () => {
  assert.match(sync, /if \(\(advert\.status \|\| row\.status\) === "outdated"\) \{/);
  assert.doesNotMatch(sync, /\["removed_by_user", "outdated"\]\.includes\(advert\.status \|\| row\.status\)/,
    "reactivarea automata a lui `removed_by_user` desface apasarea pe „Dezactivează”");
  /* ⚠ Si butonul manual a ramas acolo unde era: fara el, refuzul de mai sus ar fi o fundatura. */
  const ecran = readFileSync("src/components/dashboard/OlxClient.tsx", "utf8");
  assert.match(ecran, /canActivate = \["removed_by_user", "outdated"\]\.includes\(a\.status\)/);
  /* ⚠ Si starea noua are un nume in ecran, altfel apare ca necunoscuta. */
  assert.match(ecran, /sters_de_om: \{ label: "Șters de tine"/);
});
