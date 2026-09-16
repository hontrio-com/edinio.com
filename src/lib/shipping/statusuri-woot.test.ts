import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clasificaStareaWoot, eStareFinalaWoot, eStareNecunoscutaWoot, esteReturWoot,
  statusUrmatorWoot, trebuieSemnalatWoot, ultimulEvenimentWoot,
} from "@/lib/shipping/statusuri-woot";

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

test("⚠⚠ harta e SCRISA DIN DATE, si numai din ele", () => {
  /*
   * ═══ ⚠ AICI STATEA PLASA CARE CEREA SA NU EXISTE NICIO HARTA ═══
   *
   * Ea spunea, si pe buna dreptate: „un numar ghicit drept livrat emite facturi pe colete inca in
   * masina", si se incheia cu „daca e masurata, sterge probele astea ANUME, cu masuratoarea langa
   * ele". Asta se intampla acum, si masuratoarea e mai jos.
   *
   * Prima rulare a cronului, 15.09.2026, 12 expedieri adevarate:
   *
   *     10 „Expedierea ta a fost livrata cu success."                          7 expedieri
   *      4 „Expedierea ta a fost receptionata in depozitul DPD."               3 expedieri
   *      5 „Expedierea ta a fost preluata spre livrare de catre curierul DPD." 1 expediere
   *      9 „Returnare comanda 5173400"                                        1 expediere
   *
   * Plus 1, 2 si 3 din exemplele documentatiei lor.
   *
   * ⚠ SI FACTURA: masurat INAINTE de cablare, singurul magazin cu expedieri Woot are facturarea
   * automata pe `confirmed`, nu pe `delivered`. Deci mutarea pe „Livrat" NU emite nicio factura
   * pentru el. Randul din cron ramane pentru orice magazin viitor care alege `delivered`.
   */
  assert.equal(clasificaStareaWoot(10), "livrat", "10 e chiar livrarea, masurata pe 7 expedieri");
  assert.equal(eStareFinalaWoot(10), true);
  assert.equal(statusUrmatorWoot("shipped", 10), "delivered");

  for (const cod of [3, 4, 5]) {
    assert.equal(statusUrmatorWoot("processing", cod), "shipped", `codul ${cod} nu mai duce coletul in retea`);
  }
  for (const cod of [1, 2]) {
    assert.equal(statusUrmatorWoot("pending", cod), "processing", `codul ${cod} nu mai e „la comerciant”`);
  }

  /* ⚠ Returul NU muta singur comanda si NU e final: coletul inca se misca. */
  assert.equal(statusUrmatorWoot("shipped", 9), null, "returul a mutat singur comanda");
  assert.equal(trebuieSemnalatWoot(9), true, "returul nu mai cheama omul");
  assert.equal(esteReturWoot(9), true);
  assert.equal(eStareFinalaWoot(9), false, "returul a fost socotit capat de drum");
});

test("⚠⚠ ce nu s-a VAZUT inca nu misca nimic", () => {
  /*
   * ⚠ MIEZUL HOTARARII, si el ramane: un numar nevazut nu primeste niciun inteles. Un
   * „probabil inseamna livrat" ar fi exact greseala pe care plasa asta o apara.
   *
   * ⚠⚠ LISTA S-A SCURTAT PE 16.09.2026, SI ASA TREBUIE SA SE INTAMPLE. `8` si `100` erau aici;
   * cronul le-a raportat in jurnal (`stari NECUNOSCUTE: 100, 8`), s-au masurat in baza cu
   * etichetele scrise de EI, si abia atunci au intrat in harta. Proba asta a si cazut cand
   * le-am adaugat, cu mesajul „codul 8 a capatat un inteles nemasurat" — adica si-a facut
   * treaba: m-a oprit si m-a trimis la masuratoare.
   *
   * Cine mai adauga un numar aici il scoate din lista de mai jos SI scrie eticheta masurata in
   * `statusuri-woot.ts`. Fara masuratoare, nu.
   */
  for (const cod of [6, 7, 11, 99, 0, -1]) {
    assert.equal(clasificaStareaWoot(cod), "necunoscut", `codul ${cod} a capatat un inteles nemasurat`);
    assert.equal(statusUrmatorWoot("shipped", cod), null, `codul ${cod} muta comanda`);
    assert.equal(eStareNecunoscutaWoot(cod), true, `codul ${cod} nu mai e numarat ca necunoscut`);
  }
  assert.equal(eStareNecunoscutaWoot(10), false, "un cod stiut a fost numarat drept necunoscut");
  assert.equal(clasificaStareaWoot(null), "necunoscut");
  assert.equal(clasificaStareaWoot(4.5), "necunoscut", "un numar care nu e intreg a trecut drept cod");
});

test("⚠⚠ cele doua stari masurate pe 16.09: redirectionarea si asteptarea la oficiu", () => {
  /*
   * `8` = „Redirectionare comanda {nr}", 3 expedieri. Perechea lui `9`: amandoua poarta
   * numarul comenzii LOR in eticheta si amandoua spun ca livrarea nu se intampla cum s-a plecat.
   *
   * ⚠⚠ DAR FARA `retur`, si asta e toata deosebirea: la redirectionare coletul merge in ALTA
   * parte, nu inapoi la comerciant. Un `retur` aici i-ar fi spus ca-i vine marfa acasa.
   */
  assert.equal(clasificaStareaWoot(8), "problema");
  assert.equal(trebuieSemnalatWoot(8), true, "redirectionarea nu-i mai spune nimic comerciantului");
  assert.equal(esteReturWoot(8), false, "redirectionarea NU e retur: coletul nu vine inapoi la el");
  assert.equal(statusUrmatorWoot("shipped", 8), null, "o redirectionare a miscat comanda");

  /*
   * `100` = „pregatita pentru a fi ridicata din oficiul DPD", 1 expediere. Nici livrat, nici
   * oprit: coletul asteapta omul. ⚠ Si e un numar de ALTA forma (toate celelalte erau sub 11),
   * deci vocabularul lor nu e o secventa si nu se poate ghici.
   */
  assert.equal(clasificaStareaWoot(100), "in_retea");
  assert.equal(trebuieSemnalatWoot(100), false, "asteptarea la oficiu e pasul normal, nu o alarma");
  assert.equal(esteReturWoot(100), false);
  assert.equal(eStareFinalaWoot(100), false, "coletul inca n-a fost ridicat");
  assert.equal(statusUrmatorWoot("confirmed", 100), "shipped", "coletul e in retea, comanda e expediata");

  /* ⚠ Si niciunul nu mai e numarat ca necunoscut: altfel jurnalul ar cere la nesfarsit o
     masuratoare deja facuta. */
  assert.equal(eStareNecunoscutaWoot(8), false);
  assert.equal(eStareNecunoscutaWoot(100), false);
});

test("⚠ starea nu COBOARA, si o comanda anulata nu se mai misca", () => {
  assert.equal(statusUrmatorWoot("delivered", 4), null, "un eveniment vechi a coborat comanda");
  assert.equal(statusUrmatorWoot("shipped", 4), null, "aceeasi treapta se rescrie degeaba");
  for (const stare of ["cancelled", "refunded"]) {
    assert.equal(statusUrmatorWoot(stare, 10), null, `o comanda ${stare} a fost mutata pe livrat`);
  }
});

test("⚠⚠ cronul muta comanda DOAR pe expedierea citita, si numara ce nu stie", () => {
  const s = sursa(CRON);

  assert.match(s, /expediere: \{ coloana: "woot_order_id", valoare: o\.woot_order_id \}/,
    "tranzitia nu mai poarta expedierea citita: o stare veche ar muta comanda noua");
  assert.match(s, /if \(!r\.scris\) continue;/,
    "tranzitia pleaca si cand starea n-a ajuns pe comanda");
  assert.match(s, /if \(eStareNecunoscutaWoot\(stare\.statusId\)\) \{/,
    "cronul nu mai desparte numerele nestiute de cele stiute");
  assert.match(s, /necunoscute\.add\(String\(stare\.statusId\)\)/,
    "numerele nestiute nu se mai strang, deci harta nu mai poate creste din trafic");
  assert.match(s, /stari NECUNOSCUTE/,
    "numerele nestiute nu mai ajung in jurnal, deci nu le vede nimeni");
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

test("⚠⚠ fereastra sta INTREAGA in interogare, nu pe jumatate in memorie", () => {
  /*
   * ⚠ GASIT PE PRIMA RULARE ADEVARATA, 15.09.2026. Forma de dinainte cerea doi termeni simpli
   * (`awb_at.gte.X` sau `awb_at.is.null`), iar restul conditiei statea in memorie. Cum
   * `woot_awb_at` e NULL pe toate expedierile dinainte de migratie, termenul `is.null` lasa sa
   * treaca si comenzile vechi: din 120 de randuri cerute, doar DOUASPREZECE treceau de filtrul din
   * memorie. Lotul se dilua, iar ordonarea dupa un ceas NULL peste tot nu putea prefera pe nimeni.
   *
   * ⚠ Forma imbricata a fost INCERCATA pe PostgREST-ul adevarat inainte de a fi scrisa: intoarce
   * 92 de randuri, toate in fereastra. Aia e si regula pentru cine o schimba, fiindca un
   * `and(...)` gresit in `or(...)` NU da eroare, da LISTA GOALA.
   */
  const s = sursa("src/app/api/cron/woot-tracking/route.ts");
  /* ⚠ Potrivire pe SIR, nu pe tipar: sirul cautat e plin de `.`, `(` si `${…}`, iar un tipar
     scris gresit ar fi trecut peste orice. Aici se cere exact textul. */
  assert.ok(
    s.includes("`woot_awb_at.gte.${since},and(woot_awb_at.is.null,created_at.gte.${since})`"),
    "fereastra nu mai e intreaga in interogare: lotul se dilueaza cu comenzi vechi",
  );
  assert.ok(
    !s.includes("`woot_awb_at.gte.${since},woot_awb_at.is.null`"),
    "s-a intors forma cu doi termeni simpli, cea care aducea 120 de randuri din care 12 bune",
  );
});
