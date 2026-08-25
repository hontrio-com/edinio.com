import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  opulMaiGreu, peticDeIntentie, propagariNeterminate, RABDARE_PROPAGARE_MS,
} from "./propagare";

/* ══════════════════════════════════════════════════════════════════════════
   INTENTIA DE PROPAGARE (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Gaura reparata: intre „am salvat setarea" si „am pus catalogul in coada" era o
   fereastra in care instanta putea muri. Ce se pierdea acolo nu se mai recupera de
   nicaieri — plasa de schimbari neplecate compara amprenta de CONTINUT a produsului, iar o
   setare de magazin nu schimba nicio amprenta.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── Escaladarea ──────────────────────────────────────────────────────────── */

test("cea mai grea operatie o acopera pe cealalta", () => {
  assert.equal(opulMaiGreu("oferta", "stoc"), "oferta");
  assert.equal(opulMaiGreu("stoc", "oferta"), "oferta");
  assert.equal(opulMaiGreu("pret", "stoc"), "pret");
  assert.equal(opulMaiGreu("stoc", "pret"), "pret");
  assert.equal(opulMaiGreu(null, "stoc"), "stoc");
  assert.equal(opulMaiGreu(undefined, "oferta"), "oferta");
});

test("⚠ o cerere usoara NU stinge una grea care inca asteapta", () => {
  /*
   * Cazul adevarat: omul schimba `green_tax` (cere `oferta`), iar inainte ca propagarea sa
   * apuce sa plece schimba `stoc_rezervat` (cere `stoc`). Daca a doua ar inlocui-o pe
   * prima, taxa verde n-ar mai pleca NICIODATA — si asta e chiar paguba vanata: tacuta,
   * platita din marja, vazuta abia la contabilitate.
   */
  const p = peticDeIntentie(
    { propagare_ceruta_la: "2026-08-25T10:00:00.000Z", propagare_facuta_la: null },
    "stoc",
    "2026-08-25T10:00:30.000Z",
  );
  assert.equal(p.propagare_op, "stoc", "n-avea ce escalada: vechea cerere n-are `op`");

  const q = peticDeIntentie(
    {
      propagare_ceruta_la: "2026-08-25T10:00:00.000Z",
      propagare_op: "oferta",
      propagare_facuta_la: null,
    },
    "stoc",
    "2026-08-25T10:00:30.000Z",
  );
  assert.equal(q.propagare_op, "oferta", "cea grea ramane");
  assert.equal(q.propagare_ceruta_la, "2026-08-25T10:00:30.000Z", "dar marcajul e cel nou");
});

test("⚠ o cerere DUSA LA CAPAT nu mai ingreuneaza urmatoarea", () => {
  /*
   * Altfel un magazin care a cerut o data ruta grea ar fi ramas pe ea pentru totdeauna:
   * fiecare salvare de stoc ar fi pus catalogul intreg pe `product_offer/save`.
   *
   * „Dusa la capat" inseamna ca `emag_stinge_propagarea` a STERS cheia, deci configul vechi
   * nu mai poarta nimic de escaladat.
   */
  const p = peticDeIntentie(
    { propagare_facuta_la: "2026-08-25T10:00:00.000Z" },
    "stoc",
    "2026-08-25T11:00:00.000Z",
  );
  assert.equal(p.propagare_op, "stoc");
});

/* ── Ce ridica cronul ─────────────────────────────────────────────────────── */

interface Rand { business_id: string; emag_config: unknown }

/** Un client fals: tine minte doar ce randuri intoarce. */
function adminFals(randuri: Rand[]) {
  const lant = {
    select: () => lant,
    not: () => lant,
    filter: () => lant,
    order: () => lant,
    limit: () => Promise.resolve({ data: randuri, error: null }),
  };
  return { from: () => lant } as never;
}

const ACUM = Date.parse("2026-08-25T12:00:00.000Z");
const DEMULT = "2026-08-25T11:00:00.000Z";

test("o intentie neterminata si racita se ridica", async () => {
  const r = await propagariNeterminate(
    adminFals([{
      business_id: "b1",
      emag_config: { propagare_ceruta_la: DEMULT, propagare_op: "pret", propagare_facuta_la: null },
    }]),
    ACUM,
  );
  assert.deepEqual(r, [{ businessId: "b1", op: "pret", ceruta_la: DEMULT }]);
});

test("⚠ stingerea e COMPARE-AND-SET, si sub acelasi lacat", () => {
  /*
   * Intre clipa in care cronul citeste intentia si clipa in care o stinge poate veni o
   * cerere noua de la comerciant. Stinsa orbeste, a doua lui schimbare n-ar mai pleca
   * NICIODATA — chiar defectul reparat aici, doar mutat cu cateva secunde mai incolo.
   *
   * ⚠ Si nu e „fereastra mica": comparatia si scrierea stau sub acelasi `for update` ca
   * `jsonb_merge_config`, deci nu exista fereastra deloc.
   */
  const mig = readFileSync("migrations/2026-10-17-propagare-intentie.sql", "utf8");
  assert.match(mig, /for update/, "randul se incuie");
  assert.match(
    mig,
    /if v_curent->>'propagare_ceruta_la' is distinct from p_ceruta_la then\s*\n\s*return false;/,
    "se stinge numai intentia servita",
  );
  /* ⚠ `is distinct from`, nu `<>`: cu `null` de-o parte, `<>` da `null`, iar `if null then`
     n-ar intra pe nicio ramura — s-ar fi stins tacut cand nu trebuia. */
  assert.doesNotMatch(mig, /propagare_ceruta_la' <> p_ceruta_la/);

  /* Si cheia se STERGE, nu se pune pe null: filtrul din PostgREST e „cheia exista". */
  assert.match(mig, /v_curent - 'propagare_ceruta_la' - 'propagare_op'/);

  /* ⚠ `security definer` peste `privat.store_settings`, deci EXECUTE nu ramane la PUBLIC. */
  assert.match(
    mig,
    /revoke execute on function public\.emag_stinge_propagarea\(uuid, text\) from public, anon, authenticated;/,
  );

  /* Amandoua bratele trec prin ea, niciunul nu scrie marcajul de mana. */
  const act = viu("src/lib/actions/emag.actions.ts");
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(act, /stingePropagarea\(admin, businessId, cerutaLa\)/);
  assert.match(cron, /stingePropagarea\(admin, cerere\.businessId, cerere\.ceruta_la\)/);
  assert.doesNotMatch(act, /propagare_facuta_la:/, "panoul nu scrie marcajul de mana");
  assert.doesNotMatch(cron, /propagare_facuta_la:/, "si nici cronul");
});

test("⚠ parola ramane criptata: se scrie in `privat`, nu prin vedere", () => {
  /*
   * `emag_config` poarta parola comerciantului, iar in `privat.store_settings` ea sta
   * CRIPTATA. Citita si scrisa inapoi neatinsa, ramane asa. Trecuta prin vedere, ar fi fost
   * decriptata la citire si ar fi cerut recriptare la scriere — un drum in plus pe langa un
   * secret, pentru nimic.
   */
  const mig = readFileSync("migrations/2026-10-17-propagare-intentie.sql", "utf8");
  assert.match(mig, /from privat\.store_settings/);
  assert.match(mig, /update privat\.store_settings/);
});

test("un rand fara cheie nu se ridica", async () => {
  /* Asa arata unul dus la capat: `emag_stinge_propagarea` a sters cheia. In productie nici
     nu mai trece de filtrul din PostgREST; asta e a doua panda, in Node. */
  const r = await propagariNeterminate(
    adminFals([{
      business_id: "b1",
      emag_config: { propagare_facuta_la: DEMULT },
    }]),
    ACUM,
  );
  assert.deepEqual(r, []);
});

test("⚠ una prea proaspata se lasa in seama bratului iute", () => {
  /* Nu e o paza de corectitudine — punerea in coada e idempotenta — ci una de risipa:
     citirea unui catalog de mii de oferte n-are rost facuta de doua ori. */
  assert.equal(RABDARE_PROPAGARE_MS, 3 * 60 * 1000);
});

test("una prea proaspata chiar se sare", async () => {
  const proaspata = new Date(ACUM - 30_000).toISOString();
  const r = await propagariNeterminate(
    adminFals([{
      business_id: "b1",
      emag_config: { propagare_ceruta_la: proaspata, propagare_facuta_la: null },
    }]),
    ACUM,
  );
  assert.deepEqual(r, []);
});

test("⚠ un marcaj necitibil se sare, nu se reciteste la nesfarsit", async () => {
  const r = await propagariNeterminate(
    adminFals([{
      business_id: "b1",
      emag_config: { propagare_ceruta_la: "maine", propagare_facuta_la: null },
    }]),
    ACUM,
  );
  assert.deepEqual(r, []);
});

test("lipsa lui `propagare_op` inseamna ruta grea, nu nimic", async () => {
  /* Necunoscuta, se alege operatia care duce TOATE campurile. Ghicita in jos, ar fi
     insemnat o setare care nu pleaca — adica exact defectul reparat. */
  const r = await propagariNeterminate(
    adminFals([{
      business_id: "b1",
      emag_config: { propagare_ceruta_la: DEMULT, propagare_facuta_la: null },
    }]),
    ACUM,
  );
  assert.equal(r[0]?.op, "oferta");
});

/* ── Legaturile ───────────────────────────────────────────────────────────── */

test("⚠ intentia calatoreste in ACELASI petic cu datele", () => {
  /*
   * Tot rostul reparatiei sta in randul asta. Scrisa separat, ar fi a doua scriere — si
   * atunci ar exista iar o clipa in care setarea e salvata si intentia nu, adica exact
   * fereastra care se inchide aici. `patchEmagConfig` merge printr-o singura instructiune
   * Postgres, deci amandoua devin durabile deodata.
   */
  const act = viu("src/lib/actions/emag.actions.ts");
  assert.match(
    act,
    /patchEmagConfig\(createAdminClient\(\), businessId, \{ \.\.\.petic, \.\.\.intentie \}\)/,
  );
});

test("⚠ clasificarea se face INAINTE de scriere", () => {
  /* Altfel intentia n-ar avea ce sa calatoreasca: pana ieri `cereRutaGrea` se socotea dupa
     `patchEmagConfig`, si de-aia nu putea intra in petic. */
  const act = viu("src/lib/actions/emag.actions.ts");
  const iClasificare = act.indexOf("const cereRutaGrea =");
  const iScriere = act.indexOf("patchEmagConfig(createAdminClient(), businessId, { ...petic");
  assert.ok(iClasificare > 0 && iScriere > 0, "amandoua exista");
  assert.ok(iClasificare < iScriere, "clasificarea vine prima");
});

test("⚠ punerea in coada sta intr-un SINGUR loc", () => {
  /*
   * Doua copii ale aceleiasi puneri in coada se departeaza mai devreme sau mai tarziu —
   * chiar lectia din antetul lui `config.ts`, unde departarea insemna un magazin deconectat
   * fara ca nimeni sa fi atins butonul. Panoul si cronul cheama aceeasi functie.
   */
  const act = viu("src/lib/actions/emag.actions.ts");
  const i = act.indexOf('}, "setariEmagPropagate", businessId);');
  assert.ok(i > 0, "bratul iute exista");
  const brat = act.slice(act.lastIndexOf("dupaRaspuns(", i), i);
  assert.match(brat, /propagaSetarile\(admin, businessId,/);
  assert.doesNotMatch(brat, /fetchAllRowsStrict/, "citirea catalogului nu mai e aici");
  assert.doesNotMatch(brat, /enqueueEmag\w+Many/, "si nici punerea in coada");

  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /propagaSetarile\(admin, cerere\.businessId, cerere\.op\)/);
});

test("⚠ bratul iute foloseste operatia ESCALADATA, nu cea ceruta acum", () => {
  /* Perechea probei de escaladare de mai sus: degeaba se pastreaza `oferta` in config daca
     trecerea care stinge marcajul pleaca pe `stoc`. */
  const act = viu("src/lib/actions/emag.actions.ts");
  assert.match(act, /propagaSetarile\(admin, businessId, intentie\.propagare_op \?\? opPropagare\)/);
});

test("⚠ cronul spune cand ridica ceva: numarul trebuie sa fie zero", () => {
  /* In cazul obisnuit bratul de dupa raspuns apuca sa stampileze. Un rand aici inseamna ca
     o instanta chiar a murit dupa Salvare — o constatare, nu o reparatie de rutina. */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  const i = cron.indexOf("propagare de setari ramasa in aer");
  assert.ok(i > 0, "se scrie in jurnal");
  assert.match(cron.slice(i, i + 400), /severity: "warning"/);
});
