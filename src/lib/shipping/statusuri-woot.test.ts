import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ultimulEvenimentWoot } from "@/lib/shipping/statusuri-woot";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * URMARIREA COLETULUI WOOT                                       (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Woot duce 96% din expedierile platformei si era singurul curier cu trafic adevarat pe care
 * nu-l intreba nimeni nimic dupa emitere.
 *
 * ⚠ CE APARA PROBELE DE MAI JOS, si nu e doar alegerea evenimentului: e si GRANITA. Cronul
 * inregistreaza si NU hotaraste, fiindca in specificatia lor nu exista nicio enumerare a
 * starilor unei comenzi. Ultimele probe cad daca cineva cableaza totusi o tranzitie sau
 * facturarea automata pe un numar ghicit.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. CARE EVENIMENT E ULTIMUL
   ═══════════════════════════════════════════════════════════════════════════ */

test("ultimul eveniment se ia dupa TIMP, nu dupa locul din lista", () => {
  /*
   * ⚠ Exemplul lor vine in ordine crescatoare, dar ordinea unei liste nu e un contract. Lista de
   * aici e chiar exemplul lor, intors pe dos: „ultimul element" ar da acum „Comanda primita",
   * adica un colet care merge inapoi in timp de fiecare data cand ei schimba sortarea.
   */
  const istoric = [
    { id: 1, status_id: 1, comment: "Comanda primita", added: "2026-09-15T09:00:00" },
    { id: 3, status_id: 3, comment: "Ridicat de curier", added: "2026-09-15T14:30:00" },
    { id: 2, status_id: 2, comment: "AWB generat", added: "2026-09-15T09:01:00" },
  ].reverse();

  const stare = ultimulEvenimentWoot(istoric);
  assert.equal(stare?.statusId, 3);
  assert.equal(stare?.eticheta, "Ridicat de curier");
  assert.equal(stare?.cand, "2026-09-15T14:30:00");
});

test("la acelasi timp hotaraste `id`-ul, care creste cu fiecare eveniment", () => {
  /*
   * ⚠ CEL MIC STA PRIMUL IN LISTA, DINADINS. Asezat al doilea, proba ar fi trecut si fara nicio
   * departajare, din simpla intamplare ca primul vazut ramane ales: prins de bancul de mutanti,
   * unde scoaterea departajarii n-a facut nicio proba sa cada.
   */
  const stare = ultimulEvenimentWoot([
    { id: 4, status_id: 3, comment: "Primul", added: "2026-09-15T14:30:00" },
    { id: 9, status_id: 7, comment: "Al doilea", added: "2026-09-15T14:30:00" },
  ]);
  assert.equal(stare?.statusId, 7);
  assert.equal(stare?.eticheta, "Al doilea");
});

test("⚠ si un eveniment fara timp nu se strecoara peste unul cu timp", () => {
  const stare = ultimulEvenimentWoot([
    { id: 1, status_id: 3, comment: "Ridicat de curier", added: "2026-09-15T14:30:00" },
    { id: 2, status_id: 9, comment: "Fara data" },
  ]);
  assert.equal(stare?.eticheta, "Ridicat de curier", "evenimentul fara data a luat locul celui datat");
});

test("un istoric gol, lipsa sau stricat inseamna „nu stiu”, nu o stare inventata", () => {
  assert.equal(ultimulEvenimentWoot([]), null);
  assert.equal(ultimulEvenimentWoot(null), null);
  assert.equal(ultimulEvenimentWoot(undefined), null);
  /* Evenimente fara nicio informatie: nici numar, nici text. */
  assert.equal(ultimulEvenimentWoot([{ added: "2026-09-15T09:00:00" }, { comment: "   " }]), null);
  assert.equal(ultimulEvenimentWoot([null as never, undefined as never]), null);
});

test("⚠ eticheta se curata, iar lipsa ei nu devine sir gol", () => {
  const stare = ultimulEvenimentWoot([{ id: 1, status_id: 4, comment: "  Livrat  ", added: "2026-09-15T10:00:00" }]);
  assert.equal(stare?.eticheta, "Livrat");

  /* Numar fara text: se pastreaza numarul, iar eticheta e `null`, nu „". */
  const faraText = ultimulEvenimentWoot([{ id: 1, status_id: 4, added: "2026-09-15T10:00:00" }]);
  assert.equal(faraText?.statusId, 4);
  assert.equal(faraText?.eticheta, null);

  /* Text fara numar: se pastreaza textul, iar numarul ramane `null` in loc de `NaN`. */
  const faraNumar = ultimulEvenimentWoot([{ id: 1, comment: "In tranzit", added: "2026-09-15T10:00:00" }]);
  assert.equal(faraNumar?.statusId, null);
  assert.equal(faraNumar?.eticheta, "In tranzit");
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. ⚠ GRANITA: CRONUL INREGISTREAZA, NU HOTARASTE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ Comentariile se taie inainte de cautare: fisierele isi explica pe larg chiar regula asta,
   iar textul explicatiei ar face plasa sa treaca degeaba. */

const RAD = process.cwd();

function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const CRON = "src/app/api/cron/woot-tracking/route.ts";
const REGULA = "src/lib/shipping/statusuri-woot.ts";
const ACTIUNI = "src/lib/actions/woot.actions.ts";

test("⚠⚠ cronul NU muta comanda si NU factureaza, cat timp numerele lor n-au inteles", () => {
  /*
   * ⚠ CEA MAI IMPORTANTA DIN FISIER, si e o plasa pusa pe VIITOR. Ceilalti paisprezece cronuri
   * de urmarire cheama `tranzitieComandaMarketplace`, iar la livrare si `maybeAutoInvoice`.
   * Copiat mecanic si aici, tiparul ar cere o harta de stari, iar singura harta care se poate
   * scrie azi e ghicita: in specificatia lor nu exista nicio enumerare a starilor unei comenzi.
   * Un numar ghicit drept „livrat" emite facturi pe colete inca in masina.
   */
  const s = sursa(CRON);

  assert.doesNotMatch(s, /tranzitieComandaMarketplace/,
    "cronul Woot a inceput sa mute starea comenzii pe o harta de stari care nu exista");
  assert.doesNotMatch(s, /maybeAutoInvoice/,
    "cronul Woot a inceput sa emita facturi dupa un numar de stare fara inteles documentat");

  /* Si regula insasi nu are voie sa capete o harta pe furis. */
  assert.doesNotMatch(sursa(REGULA), /statusUrmator|eStareFinala/,
    "a aparut o harta de stari Woot; daca e masurata, sterge probele astea ANUME, cu masuratoarea langa ele");
});

test("⚠⚠ urmarirea se scrie pe `woot_order_id`, nu pe numarul AWB", () => {
  /*
   * ⚠ IDENTITATEA NU E „AWB-UL", si aici chiar ar fi fost gresita: `woot_awb_number` lipseste la
   * platile cu cardul, iar `woot_order_id` e cheia cu care se cere istoricul, eticheta si
   * anularea. Aceeasi lectie ca la Packeta si Pall-Ex.
   */
  const s = sursa(CRON);

  assert.match(s, /identitate: \{ coloana: "woot_order_id"/,
    "starea nu se mai leaga de expedierea pe care a citit-o cronul");
  assert.match(s, /scrieUrmarirea\(/, "cronul nu mai trece prin scriitorul comun de urmarire");
  assert.match(s, /\.not\("woot_order_id", "is", null\)/,
    "cronul nu mai filtreaza expedierile dupa identificatorul lor");
});

test("⚠⚠ cronul e si PORNIT, nu doar scris", () => {
  /*
   * ⚠ O ruta de cron fara rand in `vercel.json` nu ruleaza NICIODATA, si nimic nu se plange:
   * fisierul exista, probele trec, si urmarirea pur si simplu nu se intampla. Exact forma
   * „integrarii care nu face nimic".
   */
  const vercel = JSON.parse(readFileSync(path.join(RAD, "vercel.json"), "utf8")) as
    { crons: { path: string; schedule: string }[] };
  const randul = vercel.crons.find((c) => c.path === "/api/cron/woot-tracking");
  assert.ok(randul, "ruta de urmarire Woot nu e programata in vercel.json, deci nu ruleaza niciodata");
  assert.match(randul.schedule, /^\d+ \*\/\d+ \* \* \*$/, `orarul cronului Woot arata ciudat: ${randul.schedule}`);
});

test("⚠ si expedierea isi scrie ceasul la emitere, altfel fereastra n-are de unde porni", () => {
  /*
   * ⚠ Fara `woot_awb_at`, fereastra de 21 de zile s-ar masura din `created_at`, iar o comanda
   * veche careia comerciantul ii emite AWB abia azi n-ar fi intrebata NICIODATA.
   */
  assert.match(
    sursa(ACTIUNI), /woot_awb_at: new Date\(\)\.toISOString\(\)/,
    "emiterea Woot nu mai scrie clipa expedierii, deci urmarirea nu stie de cand sa numere",
  );
});
