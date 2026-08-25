import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   AUDITUL 9.6 (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DOUA DIN TREI ERAU GRESELI FACUTE DE MINE IN ACEEASI ZI, la cateva ore dupa ce
   salvasem in memorie chiar lectia pe care le-am incalcat. Se scrie aici ca sa se vada.
*/

const fisier = (p: string) => readFileSync(p, "utf8");
const viu = (p: string) =>
  fisier(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── P1 #2: GPSR cere ruta grea ───────────────────────────────────────────── */

test("⚠ GPSR e in clasificarea care cere ruta grea", () => {
  /*
   * `safety_information`, `manufacturer` si `eu_representative` pleaca NUMAI pe
   * `product_offer/save`. Nu sunt in amprenta si nu sunt in deriva — deci fara asta nu
   * ajungeau NICIODATA singure la ofertele deja publicate.
   *
   * ⚠ CE COSTA: un produs respins de ei tocmai fiindca ii lipsea GPSR-ul ramanea respins
   * dupa ce comerciantul completa datele. El le vedea salvate, ei nu le primeau.
   */
  const cod = viu("src/lib/actions/emag.actions.ts");
  assert.match(cod, /const cereRutaGrea = sASchimbat\("green_tax"\) \|\| sASchimbat\("supply_lead_time"\) \|\| gpsrSAChimbat;/);
});

test("⚠ GPSR se compara pe FORMA, nu pe identitate", () => {
  /*
   * E un obiect: `!==` ar fi fost mereu adevarat, fiindca peticul poarta o valoare noua de
   * fiecare data — chiar cand omul n-a schimbat nimic si a apasat doar Salveaza. Atunci
   * catalogul intreg s-ar fi pus in coada la fiecare apasare, mii de cereri GRELE pentru
   * zero schimbari.
   */
  const cod = viu("src/lib/actions/emag.actions.ts");
  assert.match(cod, /const gpsrSAChimbat = \(\(\) => \{/);
  assert.match(cod, /JSON\.stringify\(\[g\.safety_information \?\? "", g\.manufacturer \?\? \[\], g\.eu_representative \?\? \[\]\]\)/);
  /* ⚠ Si numai cand cheia chiar e in petic: altfel orice salvare de setari ar fi cerut-o. */
  assert.match(cod, /if \(!Object\.prototype\.hasOwnProperty\.call\(petic, "gpsr"\)\) return false;/);
});

test("⚠ si ecranul promitea deja ce codul nu facea", () => {
  /*
   * Proba asta pazeste legatura, nu codul. Mesajul „Datele pleacă la ofertele tale în
   * câteva minute" a fost scris de mine cu doua ore INAINTE ca propagarea sa existe —
   * adica exact boala pe care o reparam in alte trei locuri in aceeasi zi.
   *
   * Daca maine cineva scoate propagarea, proba asta cade si spune de ce.
   */
  const ui = fisier("src/components/dashboard/EmagClient.tsx");
  assert.match(ui, /Datele pleacă la ofertele tale în câteva minute/);
});

/* ── P1 #3: un AWB reemis ajunge si el ────────────────────────────────────── */

test("⚠ trecerea de AWB nu mai cauta `awb_uploaded_at is null`", () => {
  /*
   * Prima urcare mergea; a DOUA, nu — dupa ce campul e scris, comanda nu mai era privita
   * niciodata. Iar coletele chiar se reemit: adresa gresita, colet pierdut, curier schimbat.
   * eMAG ramanea cu numarul VECHI, si cumparatorul urmarea un AWB inexistent.
   */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /rpc\("emag_comenzi_de_verificat_awb"/);
  const i = cron.indexOf("async function urcaAwburile");
  const j = cron.indexOf("\n}\n", cron.indexOf("return urcate;", i));
  const corp = cron.slice(i, j);
  assert.doesNotMatch(corp, /\.is\("awb_uploaded_at", null\)/, "forma veche, oarba la reemitere");
});

test("⚠ se compara NUMARUL, si de aceea se si scrie", () => {
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  assert.match(cron, /if \(r\.awb_uploaded_number === awb\.awb\)/, "acelasi numar: nu s-a reemis");
  assert.match(cron, /awb_uploaded_at: acum\(\), awb_uploaded_number: awb\.awb/, "si se tine minte");
});

test("⚠ fara AWB se STAMPILEAZA, ca teancul sa nu creasca la nesfarsit", () => {
  /*
   * Nestampilata, o comanda neexpediata ar fi fost recitita la fiecare trecere — iar
   * teancul acela creste cu fiecare comanda care asteapta. Stampila spune „m-am uitat";
   * numarul gol spune „n-am urcat nimic", deci cand chiar apare un AWB, comparatia de mai
   * sus il vede ca schimbare.
   */
  const cron = viu("src/app/api/cron/emag-sync/route.ts");
  /* ⚠ Fereastra se taie la `continue;`, nu la un numar de semne: o fereastra fixa intra in
     ramura urmatoare, care CHIAR scrie numarul, si proba ar fi cazut pe cod bun. */
  const i = cron.indexOf("if (!awb) {");
  assert.ok(i > 0, "ramura fara AWB exista");
  const ramura = cron.slice(i, cron.indexOf("continue;", i));
  assert.match(ramura, /awb_uploaded_at: acum\(\)/);
  assert.doesNotMatch(ramura, /awb_uploaded_number/, "numarul ramane gol");
});

test("⚠ ordinea curierilor ramane intr-un SINGUR loc", () => {
  /*
   * Functia din baza spune doar „uita-te iar la asta"; CE anume s-a schimbat se hotaraste
   * in cod, cu `awbPropriuAlComenzii`. Scrisa si in SQL, regula s-ar fi despartit la primul
   * curier adaugat.
   */
  const mig = fisier("migrations/2026-10-16-awb-reemis.sql");
  assert.doesNotMatch(mig, /fan_courier_awb_number/, "SQL-ul nu stie ordinea curierilor");
  assert.match(mig, /o\.updated_at > eo\.awb_uploaded_at/, "intreaba doar daca s-a atins ceva");
});

test("⚠ functia noua nu e deschisa oricui", () => {
  /* `security definer` + `PUBLIC` primeste EXECUTE implicit la fiecare `create or replace`.
     Fara revoke, oricine cu o cheie anonima ar cere comenzile altui magazin. */
  const mig = fisier("migrations/2026-10-16-awb-reemis.sql");
  assert.match(mig, /revoke execute on function public\.emag_comenzi_de_verificat_awb\(uuid, int, int\) from public, anon, authenticated;/);
});

/* ── P2: butonul de stergere ──────────────────────────────────────────────── */

test("cartea de stergere nu se arata la o comanda tinuta de ei", () => {
  /* Serverul o refuza oricum. Asta e ca sa nu fie o cursa. */
  /*
   * ⚠ Se cauta PORNIND DE LA butonul de stergere inapoi, nu de la prima paza gasita:
   * `{!tinutaDeEi && (` apare de doua ori — o data la butonul de Salvare, o data aici.
   * Prima forma a probei lua prima potrivire si cadea pe cod bun. A treia oara azi cand
   * `indexOf` gaseste altceva decat caut.
   */
  const ui = viu("src/components/dashboard/OrderDetailClient.tsx");
  const iButon = ui.indexOf("Sterge definitiv");
  assert.ok(iButon > 0, "butonul exista");
  const inainte = ui.slice(Math.max(0, iButon - 700), iButon);
  assert.match(inainte, /\{!tinutaDeEi && \(/, "cartea de stergere sta sub paza");
});
