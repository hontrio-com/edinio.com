import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   PLASA DE PUBLICARE NU PRINDE PRODUSE DE DINAINTEA COMUTATORULUI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Auditul a scris-o scurt: „auto_publish trebuie bazat pe intent real, nu fereastra de 24h".
   Avea dreptate, si iata gaura pe ceas:

     10:00  omul face un produs. Comutatorul „Publica automat" e STINS. Nu vrea sa-l publice.
     11:00  aprinde comutatorul, gandindu-se la produsele de MAINE.
     11:03  plasa vede un produs de acum o ora, fara oferta, la un magazin cu `auto_publish`
            aprins — si il trimite la eMAG.

   Marfa ajunge la vanzare fara ca nimeni s-o fi cerut. E chiar incidentul din 24.08.2026,
   micsorat la 24 de ore: „plasa repara ce s-a stricat, nu porneste ce n-a fost cerut".

   ⚠ CE LIPSEA, EXACT: fereastra de ore spune CAT DE DEPARTE se uita plasa inapoi. Nu spune
   DE CAND are voie sa se uite. A doua e o intrebare despre intentia omului, si nu se poate
   ghici din produse — oricat de bine ar fi pusa fereastra.

   ⚠ DE CE NU UN DECLANSATOR PE `products`, cum cerea auditul. Ar fi scris intentia la fiecare
   inserare, din orice cale, si ar fi raspuns obiectiei ca „o cale uitata muta defectul". Dar
   ar fi pus o scriere in plus pe drumul cel mai fierbinte din aplicatie — importurile scriu
   produse in loturi de sute — pentru o informatie care e ACEEASI pentru toate produsele unui
   magazin la un moment dat. O data pe magazin, la apasarea comutatorului, spune acelasi lucru.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ marca se scrie NUMAI la trecerea stins → aprins", () => {
  /*
   * Rescrisa la fiecare salvare, ar fi impins marca inainte si ar fi ascuns tocmai produsele
   * pe care plasa TREBUIE sa le prinda: cele facute dupa aprindere, carora li s-a pierdut
   * punerea in coada. Adica reparatia ar fi stricat lucrul pe care il apara.
   */
  const act = viu("src/lib/actions/emag.actions.ts");
  assert.match(
    act,
    /setari\.auto_publish === true && veche\.auto_publish !== true\s*\?\s*\{ auto_publish_since: new Date\(\)\.toISOString\(\) \}/,
  );
});

test("⚠ plasa cere marca, si lipsa ei o opreste", () => {
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /const deCand = ctx\.config\.auto_publish_since;/);
  assert.match(cron, /if \(!deCand\) continue;/, "lipsa inseamna NU, nu „presupune ca da”");
  assert.match(cron, /p_de_cand: deCand/, "si chiar pleaca la functie");
});

test("⚠ SI BAZA REFUZA, nu doar apelantul", () => {
  /*
   * ⚠ Doua paze, dinadins. Garda din cron scuteste cererea; conditia din SQL apara si de un
   * al doilea chemator scris maine, care ar uita-o. `security definer` peste produsele
   * oricui nu are voie sa se sprijine pe bunavointa apelantului.
   */
  const mig = readFileSync("migrations/2026-10-23-publicare-de-cand.sql", "utf8");
  assert.match(mig, /where p_de_cand is not null/);
  assert.match(mig, /and p\.created_at > p_de_cand/);
  /* ⚠ Semnatura veche se sterge ANUME: lasata, ramanea o a doua functie cu acelasi nume,
     trei argumente, chemabila si fara paza noua. */
  assert.match(mig, /drop function if exists public\.emag_produse_noi_nepublicate\(uuid, int, int\);/);
});

test("⚠ backfill-ul pune „acum”, nu retroactiv", () => {
  /*
   * Un „de cand" pus in trecut — data conectarii magazinului, de pilda — ar fi facut exact
   * publicarea pe care migratia o opreste: catalogul de pana azi devenea deodata „cerut".
   */
  const mig = readFileSync("migrations/2026-10-23-publicare-de-cand.sql", "utf8");
  assert.match(mig, /jsonb_set\(\s*emag_config, '\{auto_publish_since\}', to_jsonb\(now\(\)\), true\)/);
  assert.match(mig, /emag_config->>'auto_publish_since' is null/, "si numai unde lipseste");
  /* ⚠ Se scrie in `privat.store_settings`, NU prin vederea publica: acolo declansatoarele
     `instead of` cripteaza campurile din `campuri_secrete`, iar parola eMAG e deja criptata
     in rand. Trecuta a doua oara prin criptare, magazinul ar fi primit 401 de la eMAG. */
  assert.match(mig, /update privat\.store_settings/);
  assert.doesNotMatch(mig, /update public\.store_settings/);
});

/* ══════════════════════════════════════════════════════════════════════════
   SI BUTONUL „PUBLICA" NU MAI DA O CAUZA CARE NU E ADEVARATA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ publicarea ceruta de om are VERDICT, nu numar", () => {
  /*
   * Mesajele de esec se compuneau din numarul intors: zero insemna „magazinul nu e conectat"
   * sau „ofertele sunt preluate din contul tau eMAG". Dar zero mai inseamna si „scrierea in
   * coada a picat" — iar atunci omul primea o cauza falsa si era trimis sa caute unde nu e
   * nimic. El vede mesajul, il crede, si NU mai reincearca.
   *
   * ⚠ Acelasi defect a fost reparat dimineata la propagarea setarilor, si a ramas nereparat
   * chiar pe drumul pe care apasa OMUL.
   */
  const q = viu("src/lib/emag/queue.ts");
  assert.match(q, /export function publicaPeEmagStrict\(/);
  assert.match(q, /enqueueManyDetaliat\(businessId, productIds, "oferta", \{ publicaSiFaraOferta: true \}\)/);

  const act = viu("src/lib/actions/emag.actions.ts");
  /*
   * ⚠ TOATE butoanele de publicare, nu un numar scris de mana.
   *
   * Prima forma cerea exact DOUA — „publica toata categoria" si „publica produsele alese". Cand a
   * aparut al treilea drum (publicarea din bara de selectie a listei de produse), proba a picat pe
   * un cod CORECT, si singura reparatie evidenta ar fi fost sa i se mareasca numarul. Atunci
   * urmatorul drum ar fi putut fi adaugat FARA verdict, si numarul ar fi ramas bun.
   *
   * Regula e „fiecare chemare isi citeste verdictul", si asa se si cere acum.
   */
  const chemari = (act.match(/await publicaPeEmagStrict\(/g) ?? []).length;
  assert.ok(chemari >= 2, `asteptam cel putin doua drumuri de publicare, sunt ${chemari}`);
  assert.equal(
    (act.match(/const verdict = await publicaPeEmagStrict\(/g) ?? []).length, chemari,
    "fiecare chemare trebuie sa-si pastreze verdictul, nu doar numarul",
  );
  assert.equal(
    (act.match(/if \(verdict\.fel === "eroare"\) \{/g) ?? []).length, chemari,
    "si fiecare spune pana ca pana",
  );
  assert.doesNotMatch(act, /publicaPeEmagMany/, "invelisul pe numar n-are ce cauta pe drumul omului");
});
