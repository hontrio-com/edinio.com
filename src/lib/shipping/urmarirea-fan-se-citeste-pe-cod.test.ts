import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clasificaCod,
  eStareFinala,
  esteRetur,
  statusUrmator,
  trebuieSemnalat,
  ultimulEveniment,
} from "@/lib/fancourier/statusuri";

/**
 * URMARIREA FAN SE CITESTE PE COD, NU PE TEXT.
 *
 * ═══ ⚠ CE S-A DESCHIS (13.09.2026) ═══
 *
 * FAN nu era intrebat NICIODATA ce s-a intamplat cu un AWB emis: zero coloane, zero cron,
 * zero functie in client. Comanda ramanea „Expediata" pana suna clientul. Doisprezece curieri
 * aveau deja bucla; FAN si Woot erau singurii fara.
 *
 * ═══ ⚠ DE CE NU SEAMANA CU PROBA ECOLET ═══
 *
 * eColet clasifica din TEXT, cu liste de cuvinte si o lista de NEGATII („not delivered"
 * contine „delivered"). Trebuie: statusurile lui sunt nume libere. FAN publica un tabel de
 * coduri stabil (`reports/awb-events`, pag. 41-44), deci aici se citeste CODUL si dispare
 * toata clasa aia de greseli.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: mutand `S46` pe „livrat", scotand marcajul pentru AWB-urile
 * neintoarse, sau citind `ultimul.name` in loc de `ultimul.id` in cron, probele de mai jos cad.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGULA, PE CODURI ADEVARATE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ S2 e SINGURUL cod care inchide comanda", () => {
  assert.equal(clasificaCod("S2"), "livrat");
  assert.equal(statusUrmator("shipped", "S2"), "delivered");
  assert.equal(eStareFinala("S2"), true);

  /*
   * ⚠ SI CONTRA-CAZUL, care e chiar greseala cea mai usor de facut.
   *
   * `S46` = „Handed over on the delivery point": coletul e ajuns la FANbox, la PayPoint sau
   * la oficiu, dar cumparatorul NU l-a ridicat. Trecut pe „Livrata", comanda s-ar inchide cu
   * marfa inca in dulap; daca omul n-o ridica, ea se intoarce si nimeni nu mai e atent.
   */
  assert.equal(clasificaCod("S46"), "in_retea");
  assert.notEqual(statusUrmator("shipped", "S46"), "delivered");
  assert.equal(eStareFinala("S46"), false, "predarea in punct nu are voie sa opreasca urmarirea");

  /* Si `S47`, predarea catre un partener extern, la fel: coletul e tot pe drum. */
  assert.equal(clasificaCod("S47"), "in_retea");
});

test("⚠ REFUZURILE NU SUNT FINALE: dupa ele vine returul", () => {
  /*
   * `S6` receptie refuzata, `S7` transport refuzat, `S15` plata la livrare refuzata. Arata a
   * capat de drum, dar coletul se intoarce, iar tocmai drumul acela il intereseaza pe
   * comerciant. Marcate „final", am inceta sa intrebam exact atunci.
   *
   * Schimbul e asimetric si se alege in partea ieftina: o stare finala tratata ca nefinala
   * costa cateva cereri in plus.
   */
  for (const cod of ["S6", "S7", "S15", "S50"]) {
    assert.equal(clasificaCod(cod), "problema", `${cod} ar trebui sa ceara atentie`);
    assert.equal(eStareFinala(cod), false, `${cod} nu e capat de drum: dupa el vine returul`);
    assert.equal(trebuieSemnalat(cod), true, `${cod} trebuie sa ajunga la comerciant`);
  }
});

test("⚠ returul se recunoaste, si `S43` e capat de drum", () => {
  assert.equal(esteRetur("S43"), true);
  assert.equal(eStareFinala("S43"), true);
  /* Dar NU muta comanda: anularea si returul banilor raman decizia comerciantului. */
  assert.equal(statusUrmator("shipped", "S43"), null);

  /* Cererea de retur si returul „la timp" sunt tot retur, dar inca in desfasurare. */
  assert.equal(esteRetur("S33"), true);
  assert.equal(eStareFinala("S33"), false);

  /* Iar o piedica obisnuita NU e retur: altfel instiintarea ar spune ceva neadevarat. */
  assert.equal(esteRetur("S42"), false, "adresa gresita nu inseamna ca marfa vine inapoi");
  assert.equal(trebuieSemnalat("S42"), true);
});

test("⚠ un cod NEDOCUMENTAT nu misca nimic si nu semnaleaza nimic", () => {
  /*
   * ⚠ Documentatia are goluri in sir: S17, S18, S23, S26, S29, S31, S32, S34, S36, S39-S41,
   * S44, S45, S48 nu sunt publicate. Ghicite din nume, tocmai alea ar fi fost ghicite gresit.
   */
  for (const cod of ["S17", "S23", "S44", "X9", "", "  ", "livrat", "delivered", null, undefined]) {
    assert.equal(clasificaCod(cod), "necunoscut", `„${String(cod)}" nu are voie sa fie inteles`);
    assert.equal(statusUrmator("shipped", cod), null);
    assert.equal(trebuieSemnalat(cod), false);
    assert.equal(eStareFinala(cod), false);
  }

  /* ⚠ Perechea: un cod adevarat CHIAR e inteles, altfel proba de sus ar trece pe un tabel gol. */
  assert.equal(clasificaCod("H2"), "in_retea");
});

test("⚠ starea nu coboara niciodata, si o comanda oprita nu se misca", () => {
  /*
   * Evenimentele nu vin garantat in ordine. Un „in tranzit" sosit dupa „livrat" ar fi dat
   * comanda inapoi pe „Expediata", sub ochii comerciantului.
   */
  assert.equal(statusUrmator("delivered", "H2"), null, "livrata nu are voie sa redevina expediata");
  assert.equal(statusUrmator("shipped", "C1"), null, "expediata nu se rescrie cu tot expediata");
  assert.equal(statusUrmator("processing", "H2"), "shipped");

  for (const oprita of ["cancelled", "refunded"]) {
    assert.equal(statusUrmator(oprita, "S2"), null, `${oprita} nu se mai misca de la un eveniment de curier`);
  }
});

test("⚠ ultimul eveniment se ia dupa DATA, nu dupa pozitie", () => {
  /*
   * ⚠ De asta exista ajutorul. Exemplul din documentatia FAN e ordonat crescator, ceea ce
   * invita la „ultimul din lista"; ordinea nu e insa garantata nicaieri. Pe o lista sosita
   * invers, „ultimul din lista" ar fi citit PRIMA stare a coletului drept cea de acum, si
   * comanda ar fi ramas pe „Expediata" la nesfarsit.
   */
  const invers = [
    { id: "S2", date: "2026-03-06 13:58:43" },
    { id: "H4", date: "2026-03-01 04:46:46" },
  ];
  assert.equal(ultimulEveniment(invers)?.id, "S2", "s-a luat primul din lista, nu cel mai nou");
  assert.equal(invers[invers.length - 1].id, "H4", "asa arata capcana: ultimul din lista e cel vechi");

  /* Datele se compara ca SIRURI: formatul „YYYY-MM-DD HH:MM:SS" e sortabil lexicografic, iar
     `new Date` pe un sir fara fus orar ar fi interpretat local, deci altfel pe alta masina. */
  assert.equal(ultimulEveniment([{ id: "A", date: "2026-03-06 09:00:00" }, { id: "B", date: "2026-03-06 10:00:00" }])?.id, "B");

  /* Fara evenimente, sau cu date lipsa, nu se inventeaza nimic. */
  assert.equal(ultimulEveniment([]), null);
  assert.equal(ultimulEveniment(null), null);
  assert.equal(ultimulEveniment([{ id: "A" }]), null, "un eveniment fara data nu poate fi cel mai nou");
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CABLAREA: cronul chiar exista, si citeste codul
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const CRON = "src/app/api/cron/fancourier-tracking/route.ts";
const ACTIUNE_FAN = "src/lib/actions/fancourier.actions.ts";

test("⚠ hotararile cronului se iau pe COD, nu pe numele evenimentului", () => {
  const s = sursa(CRON);

  assert.match(s, /const ultimul = ultimulEveniment\(r\.events\);/,
    "cronul nu mai alege evenimentul dupa data");
  assert.match(s, /const cod = \(ultimul\?\.id \?\? ""\)\.trim\(\) \|\| null;/,
    "cronul nu mai citeste CODUL evenimentului");

  /* Toate trei hotararile primesc codul. Numele ramane doar pentru ochii omului. */
  assert.match(s, /statusUrmator\(o\.status, cod\)/);
  assert.match(s, /trebuieSemnalat\(cod\)/);
  assert.match(s, /esteRetur\(cod\)/);

  /* ⚠ Si nu s-a strecurat numele intr-o hotarare. */
  assert.doesNotMatch(s, /statusUrmator\([^)]*\.name/, "starea comenzii se decide din nume");
  assert.doesNotMatch(s, /trebuieSemnalat\([^)]*\.name/, "instiintarea se decide din nume");
});

test("⚠⚠ marcajul se scrie pentru TOATE cele cerute, inclusiv cele neintoarse", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT.
   *
   * Un AWB necunoscut contului lipseste pur si simplu din raspuns, fara vreo eroare. Marcat
   * doar ce s-a intors, cele lipsa raman cu `fan_courier_status_checked_at` NULL, ies primele
   * la FIECARE rulare si blocheaza permanent capul cozii: urmarirea intregii platforme se
   * opreste, cu `ok: true`. Blocajul a fost deja platit o data, la cronul GLS.
   */
  const s = sursa(CRON);

  assert.match(s, /const neintoarse: string\[\] = \[\];/, "cronul nu mai tine socoteala celor lipsa");
  assert.match(s, /if \(!r\) \{ neintoarse\.push\(o\.id\); continue; \}/);
  assert.match(s, /await marcheaza\(neintoarse\);/,
    "AWB-urile pe care FAN nu le-a intors NU mai primesc marcaj: capul cozii se blocheaza");

  /* Si pe esecul lotului, si pe magazinul fara configurare: rotatia trebuie sa inainteze mereu. */
  assert.match(s, /await marcheaza\(felie\.map\(\(o\) => o\.id\)\);/,
    "pe lot picat nu se mai marcheaza nimic");
  assert.match(s, /faraConfig \+= lista\.length;/);
  assert.match(s, /\.update\(\{ fan_courier_status_checked_at: new Date\(\)\.toISOString\(\) \}\)/,
    "magazinul fara configurare nu mai primeste marcaj");
});

test("⚠ rotatia ia cele mai vechi, si rularea are buget de timp", () => {
  const s = sursa(CRON);

  assert.match(s, /\.order\("fan_courier_status_checked_at", \{ ascending: true, nullsFirst: true \}\)/,
    "rotatia nu mai incepe cu cele niciodata verificate");
  assert.match(s, /const BUGET_MS = 50_000;/, "rularea nu mai are buget propriu sub `maxDuration`");
  assert.match(s, /const termen = Date\.now\(\) \+ BUGET_MS;/);
  assert.ok((s.match(/if \(Date\.now\(\) >= termen\) break;/g) ?? []).length >= 2,
    "bugetul nu se mai verifica in ambele bucle");

  /* Poarta: un cron fara secret e un endpoint public care scrie pe comenzi. */
  assert.match(s, /if \(!verificaCron\(req\)\)/, "cronul nu-si mai verifica secretul");
});

test("⚠ cronul e INREGISTRAT, altfel nu ruleaza niciodata", () => {
  /*
   * ⚠ Un cron scris si neinregistrat e cel mai tacut fel de a nu face nimic: fisierul exista,
   * probele trec, si nimeni nu-l cheama.
   */
  const vercel = readFileSync(path.join(RAD, "vercel.json"), "utf8");
  assert.match(vercel, /"\/api\/cron\/fancourier-tracking"/,
    "cronul de urmarire FAN nu e in `vercel.json`: nu-l cheama nimeni");
});

test("⚠ clipa emiterii se scrie, si se sterge odata cu AWB-ul", () => {
  /*
   * ⚠ Fara scriere, fereastra de urmarire n-are reper si cronul n-ar gasi nicio comanda:
   * ar rula cuminte, verde, fara sa intrebe de nimeni.
   */
  const s = sursa(ACTIUNE_FAN);
  assert.match(s, /fan_courier_awb_at: new Date\(\)\.toISOString\(\),/,
    "clipa emiterii nu se mai scrie: urmarirea n-ar porni niciodata");

  /* Si la dezlegare pleaca, impreuna cu starea: altfel o reemitere ar porni cu starea veche. */
  assert.match(s, /fan_courier_awb_at: null,/);
  assert.match(s, /fan_courier_status_code: null,/);
  assert.match(s, /fan_courier_status_checked_at: null,/);
});
