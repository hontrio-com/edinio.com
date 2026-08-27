import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   UN LOT „NECUNOSCUT" BLOCA PRODUSUL PENTRU TOTDEAUNA (27.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   Dimineata am adaugat `intentie` si `necunoscut` la verificarea fratilor, ca un produs cu peste
   100 de variante sa nu se publice cu o transa lipsa. Corect - dar a deschis un fund de sac:

       transa A → cerere trimisa → 5xx → randul ramane `necunoscut`
       `caUnRezultat` o socoteste reluabila (un produs retrimis da acelasi produs)
       coada reia → transa A2 → `completed` ✅
       dar randul `necunoscut` al lui A RAMANE, si n-are `batchRequestId`
       → nu poate fi sondat NICIODATA
       → verificarea fratilor il gaseste mereu
       → produsul nu se mai publica NICIODATA

   ⚠ MASURAT PE PRODUCTIE, intr-o tranzactie data inapoi:

       dupa a doua trimitere, cu filtrul de generatie ....... 0 frati → PUBLICA
       aceeasi stare, fara filtrul de generatie ............. 1 frate → BLOCAT PE VECI
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");

test("⚠ generatia se creste ATOMIC, nu prin citeste-si-scrie", () => {
  /*
   * Doi lucratori care trimit acelasi produs in aceeasi clipa ar citi altfel amandoi aceeasi
   * valoare si s-ar crede amandoi generatia curenta - iar loturile lor s-ar bloca reciproc.
   */
  assert.match(sync, /await admin\.rpc\("aboutyou_generatie_noua", \{/);
  const migr = readFileSync("migrations/2026-11-27-aboutyou-generatia-trimiterii.sql", "utf8");
  assert.match(migr, /set generatie = generatie \+ 1[\s\S]{0,80}returning generatie into v_gen/);
});

test("⚠ cand generatia nu se poate deschide, NU se trimite nimic", () => {
  /*
   * Un lot fara generatie n-ar putea fi nici numarat printre frati, nici depasit mai tarziu -
   * adica exact fundul de sac pe care generatia il inlatura.
   */
  assert.match(sync, /if \(eGen \|\| typeof genNoua !== "number"\) \{/);
  const i = sync.indexOf('if (eGen || typeof genNoua !== "number")');
  const j = sync.indexOf("upsertProducts(ctx.auth");
  assert.ok(i > 0 && j > i, "verificarea trebuie sa fie inaintea primei trimiteri");
});

test("⚠ fratii se numara DOAR in generatia lotului", () => {
  assert.match(sync, /\.eq\("generatie", b\.generatie \?\? -1\)/);
  /* Si lotul poarta generatia cu el, de la trimitere. */
  assert.match(sync, /upsertProducts\(ctx\.auth, built\.items\.slice\(i, i \+ 100\)\), generatie, cititLa\)/);
});

test("⚠ un lot dintr-o generatie depasita nu mai scrie nimic", () => {
  /*
   * Comerciantul a mai trimis produsul de-atunci. Ce spune lotul asta e despre o versiune care nu
   * mai exista: n-are voie nici sa scrie starea, nici sa publice.
   *
   * ⚠ Si ramura lui vine INAINTEA celei care publica: pusa dupa, n-ar fi intrat niciodata.
   */
  assert.match(sync, /b\.kind === "product" && b\.generatie != null && b\.generatie < listing\.generatie/);
  const iDepasit = sync.indexOf("b.generatie < listing.generatie");
  const iPublica = sync.indexOf('b.kind === "product" && listing.status === "pending"');
  assert.ok(iDepasit > 0 && iPublica > iDepasit, "ramura depasita trebuie sa fie prima");
});

test("⚠ orfanii vechi se INCHID, ca alarma sa nu strige la nesfarsit", () => {
  /*
   * O alarma care striga mereu nu mai e o alarma. Se inchid ca `depasit`, nu se sterg: randul e
   * urma unei cereri care CHIAR a plecat spre About You, si aia nu se sterge fiindca ne-a devenit
   * incomoda.
   */
  assert.match(sync, /async function inchideLoturileDepasite/);
  assert.match(sync, /\.update\(\{ status: "depasit", polled_at: new Date\(\)\.toISOString\(\) \} as never\)/);
  /*
   * ⚠ SE PORNESTE DE LA LOTURI, nu de la listari. Prima varianta citea `aboutyou_listings …
   * limit(500)`: la zece mii de produse vedea o douăzecime, mereu aceleași primele, deci un lot orb
   * al produsului opt mii n-ar fi fost atins niciodată. Vezi `dupa-aprobare-si-reasertare.test.ts`.
   */
  assert.match(sync, /\.in\("status", \["intentie", "necunoscut"\]\)/);
  assert.match(sync, /if \(lot\.generatie != null && lot\.generatie >= listing\.generatie\) continue;/);
  /* Si se cheama INAINTEA alarmei, altfel ar striga tocmai despre cele care tocmai s-au inchis. */
  const iInchide = sync.indexOf("await inchideLoturileDepasite(admin, ctx);");
  const iAlarma = sync.indexOf('"aboutyou.intentiiDeschise"');
  assert.ok(iInchide > 0 && iAlarma > iInchide);
});

test("⚠ `depasit` nu e o stare sondabila", () => {
  /* Sondarea ia doar `pending/processing/retry`: un lot depasit n-are ce sa mai intrebe. */
  /*
   * Sondarea nu-l cuprinde: un lot depasit n-are ce sa mai intrebe, si nici n-are id.
   *
   * ⚠ `stalled` E in selectie, cu o amanare de sase ore — vezi nota de acolo: un nume onest peste
   * o purtare la fel de terminala ca `failed` tot fund de sac ramane.
   */
  assert.match(sync, /\.in\("status", \["pending", "processing", "retry", "stalled"\]\)/);
  assert.doesNotMatch(sync, /\.in\("status", \[[^\]]*"depasit"[^\]]*\]\)\s*\n?\s*\.or\(/);
});
