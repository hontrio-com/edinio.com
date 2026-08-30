import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awbPropriuAlComenzii } from "./awb-propriu";

/* ══════════════════════════════════════════════════════════════════════════
   AUDITUL 9.7 (25.08.2026, seara)
   ══════════════════════════════════════════════════════════════════════════

   Patru constatari, toate reale, toate verificate in cod inainte de a fi atinse. Doua sunt
   gauri in reparatiile facute de mine CHIAR IN ZIUA ACEEA — a doua oara cand se intampla, si
   se scrie ca sa se vada.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── 1) `auto_publish` pentru un produs NOU ───────────────────────────────── */

test("⚠ publicarea automata pierduta la creare se recupereaza", () => {
  /*
   * Comentariul din `queue.ts` o spunea deja: la un produs NOU, daca in chiar clipa punerii
   * in coada configul nu se poate citi, intentia NU se recupereaza mai tarziu, iar
   * „publicarea automata se degradeaza tacit in publicare manuala".
   */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /rpc\("emag_produse_noi_nepublicate"/);
  assert.match(cron, /publicaPeEmagMany\(businessId, ids\)/, "prin functia adevarata, nu de mana");
});

test("⚠ si numai cand `auto_publish` e APRINS", () => {
  /* Stins, publicarea e hotararea omului. Plasa repara ce s-a stricat, nu porneste ce n-a
     fost cerut — vezi incidentul din 24.08 cu 116 oferte publicate singure. */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /ctx\.config\.auto_publish !== true\) continue;/);
});

test("⚠ FEREASTRA DE TIMP e tot rostul, si e in SQL", () => {
  /*
   * Fara ea, prima aprindere a comutatorului ar trimite catalogul intreg la publicare. Un
   * produs vechi nu poate intra pe aici NICIODATA.
   *
   * ⚠ SE CITESTE MIGRATIA CEA NOUA, nu cea din 2026-10-20 in care s-a nascut functia.
   * Aceea si-a pastrat textul, dar semnatura ei nu mai exista in baza: `2026-10-23` a
   * sters-o si a pus una cu patru argumente. O proba lipita de fisierul vechi ar fi trecut
   * verde despre o functie care nu mai e acolo.
   */
  const mig = readFileSync("migrations/2026-10-23-publicare-de-cand.sql", "utf8");
  assert.match(mig, /p\.created_at > now\(\) - make_interval\(hours =>/);
  assert.match(mig, /not exists \([\s\S]{0,200}?emag_offers e/, "si numai ce n-are oferta");
  /* ⚠ `security definer` peste produsele oricui: fara revoke, o cheie anonima ar citi
     catalogul altui magazin. Iar EXECUTE se intoarce la PUBLIC dupa FIECARE
     `create or replace`, deci revoke-ul trebuie sa fie in aceeasi migratie cu functia. */
  assert.match(
    mig,
    /revoke execute on function public\.emag_produse_noi_nepublicate\(uuid, int, int, timestamptz\) from public, anon, authenticated;/,
  );
});

/* ── 2) intentia de propagare nu se stinge la o scriere picata ─────────────── */

test("⚠ un `0` de la coada nu mai inseamna trei lucruri deodata", () => {
  /*
   * `enqueueMany` intorcea `0` cand n-avea ce pune, cand magazinul e oprit, SI cand scrierea
   * a picat. Callerul nu le putea deosebi, deci stingea intentia si dupa un esec.
   *
   * ⚠ CE COSTA: pentru pret si stoc repara deriva. Pentru GPSR, `green_tax` si
   * `supply_lead_time` NU exista a doua plasa — pierdute acolo, se pierd de tot.
   */
  const q = viu("src/lib/emag/queue.ts");
  assert.match(q, /export type VerdictCoada =/);
  for (const fel of ["puse", "nimic", "oprit", "eroare"]) {
    assert.match(q, new RegExp(`fel: "${fel}"`), fel);
  }
  /* ⚠ Invelisurile vechi raman pe numar, ca sa nu se schimbe purtarea la ceilalti chematori. */
  assert.match(q, /return r\.fel === "puse" \? r\.cate : 0;/);
});

test("⚠ numai `eroare` opreste stingerea", () => {
  /* `nimic` si `oprit` sunt sfarsituri legitime: s-a facut ce era de facut, ori omul si-a
     stins singur sincronizarea. Tratate ca esec, cronul ar fi reincercat la nesfarsit. */
  const p = viu("src/lib/emag/propagare.ts");
  assert.match(p, /return \{ puse, sigur: verdict\.fel !== "eroare" \};/);

  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /if \(!rez\.sigur\) continue;/, "cronul nu stinge");
  const act = viu("src/lib/actions/emag.actions.ts");
  assert.match(act, /if \(!rez\.sigur\) return;/, "nici panoul");
});

/* ── 3) importul nu mai citeste o pana drept „gata" ───────────────────────── */

test("⚠ trei citiri din import nu mai mint cand pica", () => {
  /*
   * `const { data: pending } = ...` fara `error`: o pana da `pending = null`, iar functia
   * intoarce `remaining: 0`. Atunci jobul trece pe „gata", se anunta canalele de vanzare si
   * porneste publicarea — cu randuri INCA nescrise.
   *
   * ⚠ E ACEEASI CITIRE PE CARE AM INCHIS-O DIMINEATA la rehostul imaginilor, si i-am lasat
   * sora neatinsa. Regula casei: „nu stiu cate au ramas" inseamna REIA, niciodata zero.
   */
  const c = viu("src/lib/import/committer.ts");
  assert.match(c, /const \{ data: pending, error: ePending \}/);
  assert.match(c, /if \(ePending\) throw new Error\(/);
  assert.match(c, /const \{ count: remaining, error: eRamase \}/);
  assert.match(c, /if \(eRamase\) throw new Error\(/);
  /* ⚠ Si planul contului: o pana ar fi facut, pentru o clipa, dintr-un plan platit unul
     gratuit — iar limita mai mica ar fi respins randuri legitime. */
  assert.match(c, /const \{ data: profile, error: ePlan \}/);
  assert.match(c, /if \(ePlan\) throw new Error\(/);
});

/* ── 4) AWB-ul curent la schimbarea curierului ────────────────────────────── */

test("⚠ un AWB deja urcat nu mai e ales a doua oara", () => {
  /*
   * ═══ GAURA DIN REPARATIA DE DIMINEATA ═══
   *
   * `COLOANE_AWB` are ordine fixa, cu FAN primul. Comerciantul emite FAN123, se urca; renunta
   * la FAN si emite GLS999. Coloana FAN ramane plina, alegerea intoarce tot FAN123, iar
   * comparatia „acelasi numar" spune „nimic nou" — deci GLS999 nu ajunge NICIODATA la eMAG,
   * si cumparatorul urmareste un colet care nu mai vine.
   *
   * ⚠ Masurat inainte de reparatie: nicio comanda din productie n-are doua coloane de AWB
   * pline (134 au exact una, 89 niciuna). Deci n-a lovit inca pe nimeni — dar e o pierdere
   * tacuta, si tacerea e chiar lucrul vanat in integrarea asta.
   */
  const rand = { fan_courier_awb_number: "FAN123", gls_awb_number: "GLS999" };

  assert.equal(awbPropriuAlComenzii(rand)?.awb, "FAN123", "fara memorie, iese primul din lista");
  assert.equal(
    awbPropriuAlComenzii(rand, ["FAN123"])?.awb, "GLS999",
    "cu FAN123 deja urcat, se alege cel care n-a plecat",
  );
  assert.equal(
    awbPropriuAlComenzii(rand, ["FAN123", "GLS999"]), null,
    "cand toate sunt urcate, nu se mai alege nimic — ASA SE TERMINA bucla",
  );
});

test("⚠ de-aia e o MULTIME, nu ultimul numar", () => {
  /*
   * Cu un singur numar tinut minte, doua AWB-uri s-ar fi urcat pe rand la NESFARSIT: se urca
   * GLS, se scrie GLS, apoi FAN „nu e cel scris" deci se urca FAN, se scrie FAN, apoi GLS
   * „nu e cel scris"... Multimea opreste ciclul.
   */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /const dejaUrcate = r\.awb_uploaded_numbers \?\? \[\];/);
  assert.match(cron, /awb_uploaded_numbers: \[\.\.\.new Set\(\[\.\.\.dejaUrcate, awb\.awb\]\)\]/);
  assert.doesNotMatch(cron, /r\.awb_uploaded_number === awb\.awb/, "comparatia veche");
});

test("⚠ o citire picata din `emag_awb` nu inseamna „nu e al lor”", () => {
  /* Luata drept negasire, am fi atasat inapoi la eMAG chiar AWB-ul emis DE eMAG. Registrul ar
     fi oprit al doilea document, dar regula casei e ca o eroare de baza nu se citeste ca lipsa. */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /const \{ data: alNostru, error: eAlNostru \}/);
  const i = cron.indexOf("if (eAlNostru)");
  assert.ok(i > 0, "eroarea are ramura proprie");
  assert.match(cron.slice(i, i + 400), /continue;/, "si nu se trece mai departe ca si cum ar lipsi");
});
