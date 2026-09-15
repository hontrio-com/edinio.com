import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * URMARIREA SE SCRIE PE EXPEDIEREA PE CARE A CITIT-O            (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cronurile citesc un lot de comenzi cu identitatea expedierii, cheama furnizorul, si scriu inapoi
 * starea dupa `id` si `business_id`. Intre citire si scriere sta un apel extern, iar bugetele
 * rularilor sunt de 15 pana la 50 de secunde, scrise in fiecare fisier. Daca in fereastra aia
 * comanda primeste ALTA expediere, starea veche ateriza peste cea noua, si un cod FINAL o scotea
 * din urmarire pentru totdeauna, tacut.
 *
 * ⚠ SI DE CE NU S-A PUS PUR SI SIMPLU O CONDITIE PE TOT `update`-ul.
 *
 * Fiindca in aproape toate cronurile starea si MARCAJUL DE ROTATIE sunt aceeasi instructiune.
 * Marcajul e singurul lucru care face rotatia sa inainteze; fiecare fisier scrie pe larg ce se
 * intampla fara el: randul ramane cu marcajul `NULL`, iese PRIMUL la fiecare rulare, si o suta
 * douazeci de asemenea randuri blocheaza urmarirea intregii platforme, cu cronul raportand vesel
 * ca a lucrat. O conditie pusa mecanic ar fi schimbat un defect rar intr-unul permanent.
 *
 * Deci `scrieUrmarirea` le desparte: starea sub conditie, marcajul oricum.
 */

const RADACINA = "src/app/api/cron";

function ruteDeUrmarire(): string[] {
  return readdirSync(RADACINA, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-tracking"))
    .map((d) => `${RADACINA}/${d.name}/route.ts`);
}

const faraComentarii = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

/* ── 1. Acoperirea, cu numerele MASURATE ──────────────────────────────────── */

test("⚠ lista de rute nu se poate goli in tacere", () => {
  assert.ok(ruteDeUrmarire().length >= 16, "nu mai gasesc toate cronurile de urmarire");
});

test("⚠⚠ CINCISPREZECE cronuri scriu starea prin ajutor, si `innoship` ZERO dinadins", () => {
  /*
   * ⚠ NUMERELE SUNT MASURATE, NU ROTUNJITE. Tentatia era sa cer cate cronuri sunt, dar
   * `innoship-tracking` nu scrie starea el insusi: o scrie prin `aplica-urmarire.ts`, drumul comun
   * cronului si webhookului. O afirmatie rotunjita ar fi cazut pe cod BUN si m-ar fi impins s-o
   * slabesc, adica exact felul in care o plasa devine decor.
   */
  const cu: string[] = [];
  const fara: string[] = [];
  for (const cale of ruteDeUrmarire()) {
    (faraComentarii(cale).includes("scrieUrmarirea(admin, {") ? cu : fara).push(cale);
  }
  /* ⚠ Numarul URCA odata cu fiecare curier care isi capata urmarirea: 14 pana pe 15.09.2026,
     15 de cand Cargus si-a capatat-o pe a lui. Se urca, nu se slabeste in „cel putin". */
  assert.equal(cu.length, 15, `scriu prin ajutor ${cu.length} cronuri, nu cincisprezece`);
  assert.deepEqual(fara.map((c) => c.split("/")[4]), ["innoship-tracking"],
    "alt cron decat `innoship` a ramas fara ajutor, ori `innoship` a inceput sa scrie singur");

  assert.match(faraComentarii("src/lib/innoship/aplica-urmarire.ts"), /scrieUrmarirea\(admin, \{/,
    "drumul comun al Innoship nu mai trece prin ajutor, deci si cronul, si webhookul scriu orbeste");
});

test("⚠⚠ IDENTITATEA E CEA ADEVARATA, nu un tipar copiat", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT. Un tipar copiat mecanic ar fi pus `*_awb_number`
   * peste tot, iar acolo conditia ar fi fost mereu adevarata, adica decor:
   *
   *   * Packeta se citeste pe id-ul LOR intern; `packeta_external_tracking` se scrie mai tarziu;
   *   * Pall-Ex pe partida, fiindca `pallex_awb_number` e chiar campul pe care il SCRIE cronul
   *     cand afla codul.
   */
  const asteptat: Record<string, string | string[]> = {
    "dhl-tracking": "dhl_awb_number",
    "dpd-tracking": "dpd_awb_number",
    "ecolet-tracking": "ecolet_awb_number",
    "fancourier-tracking": "fan_courier_awb_number",
    "fedex-tracking": "fedex_awb_number",
    "gls-tracking": "gls_awb_number",
    "packeta-tracking": "packeta_packet_id",
    "pallex-tracking": "pallex_consignment_id",
    "posta-tracking": "posta_awb_number",
    /* ⚠ Sameday are DOUA cozi din 15.09.2026: coletul dus si cel care se intoarce. Sunt doua
       identitati adevarate, nu un tipar copiat, si ORDINEA lor conteaza: dusul intai. */
    "sameday-tracking": ["sameday_awb_number", "sameday_return_awb_number"],
    "cargus-tracking": "cargus_awb_number",
    "shipo-tracking": "shipo_awb_number",
    "smartship-tracking": "smartship_awb_number",
    "ups-tracking": "ups_awb_number",
    /* ⚠ Woot pe `woot_order_id`, nu pe numarul AWB: acela lipseste la platile cu cardul,
       iar identificatorul lor e cheia cu care se cere istoricul, eticheta si anularea. */
    "woot-tracking": "woot_order_id",
  };

  for (const [dosar, coloana] of Object.entries(asteptat)) {
    const s = faraComentarii(`${RADACINA}/${dosar}/route.ts`);
    const gasite = [...s.matchAll(/identitate: \{ coloana: "(\w+)"/g)].map((m) => m[1]);
    const cerute = Array.isArray(coloana) ? coloana : [coloana];
    assert.deepEqual(gasite, cerute, `${dosar} nu se mai conditioneaza pe ${cerute.join(" si ")}`);
  }

  assert.match(faraComentarii("src/lib/innoship/aplica-urmarire.ts"),
    /identitate: \{ coloana: "innoship_awb_number"/, "Innoship si-a pierdut identitatea");
});

test("⚠⚠ chemarea ajutorului sta pe un drum VIU, nu sub o paza mereu falsa", () => {
  /*
   * ═══ ⚠ SCRISA DUPA UN MUTANT CARE A SCAPAT (14.09.2026) ═══
   *
   * Bancul a inlocuit paza din DHL cu `if (false)`. Ramura a devenit cod MORT, dar textul
   * `scrieUrmarirea(admin, {` a ramas in fisier, iar afirmatia de mai sus il cauta tocmai pe el.
   * Deci ea masura PREZENTA UNUI SIR, nu faptul ca drumul chiar trece pe acolo: aceeasi capcana ca
   * „proba pe subsir nu apara o lista".
   *
   * ⚠ SI PORTILE NU PRIND ASTA. Masurat: cu `if (false)` pus, `tsc` trece curat, iar lint scoate
   * doar un avertisment („`prelucrat` assigned but never used") - iar clichetul numara ERORILE,
   * deci pragul n-ar creste. Proba asta e singura plasa.
   *
   * ⚠ SI NU SE CERE FORMA PAZEI, fiindca ea difera: zece cronuri au `prelucrat && cod !== null`,
   * dar Pall-Ex si Sameday cheama ajutorul NECONDITIONAT (acolo starea se scrie intotdeauna). O
   * afirmatie pe forma ar fi cazut pe cod bun si m-ar fi impins s-o slabesc. Se cere deci exact
   * ce a stricat mutantul: sa nu existe o conditie constanta care sa ocoleasca scrierea.
   */
  for (const cale of ruteDeUrmarire()) {
    const s = faraComentarii(cale);
    if (!s.includes("scrieUrmarirea(admin, {")) continue;
    assert.doesNotMatch(s, /\bif \((?:false|true|0|1)\)/,
      `${cale} are o paza constanta: drumul de scriere poate fi mort fara ca nimic sa cada`);
  }
});

/* ── 2. Ce n-are voie sa se schimbe: marcajul avanseaza ORICUM ────────────── */

test("⚠⚠ MARCAJUL NU INTRA NICIODATA SUB CONDITIE", () => {
  /*
   * ⚠ ASTA E JUMATATEA CARE APARA COADA, si e cea mai usor de stricat de cine „face ordine".
   *
   * In ajutor, `stare` si `marcaj` sunt doua campuri separate tocmai ca marcajul sa poata fi scris
   * si cand conditia nu prinde niciun rand. Daca cineva ar muta coloana de marcaj in `stare`, la
   * prima nepotrivire randul ar ramane in capul cozii pentru totdeauna, si nimic n-ar cadea.
   */
  const ajutor = faraComentarii("src/lib/orders/urmarirea-se-scrie-pe-identitate.ts");

  const iZero = ajutor.indexOf("if (data && data.length > 0) return { scris: true };");
  assert.ok(iZero > 0, "ramura care vede zero randuri a disparut");
  assert.match(ajutor.slice(iZero, iZero + 700), /await doarMarcajul\(admin, p\);/,
    "la zero randuri nu se mai scrie marcajul: coada ramane infometata");

  const iMarcaj = ajutor.indexOf("async function doarMarcajul(");
  assert.ok(iMarcaj > 0, "scrierea neconditionata a marcajului a disparut");
  const corp = ajutor.slice(iMarcaj, ajutor.indexOf("\n}", iMarcaj));
  assert.match(corp, /\.update\(p\.marcaj\)/, "marcajul nu se mai scrie singur");
  assert.doesNotMatch(corp, /identitate|p\.stare/,
    "marcajul a capatat conditie pe identitate, deci poate ramane nescris");
});

test("⚠ si niciun cron nu a pierdut marcajul de pe drumurile fara stare noua", () => {
  /*
   * Fiecare cron are cinci pana la sase iesiri care nu aduc nicio stare (magazin fara config, apel
   * picat, AWB necunoscut). Ele scriu doar marcajul, ca pana acum. Daca vreuna ar fi fost trecuta
   * din greseala prin ajutor, ar fi capatat o conditie de care n-are nevoie.
   */
  for (const cale of ruteDeUrmarire()) {
    const s = faraComentarii(cale);
    if (!s.includes("scrieUrmarirea(admin, {")) continue;
    assert.match(s, /_status_checked_at|ecolet_status_checked_at/,
      `${cale} nu mai scrie niciun marcaj de rotatie`);
  }
});

/* ── 3. Codul raportat e cel care a AJUNS pe comanda ──────────────────────── */

test("⚠⚠ Innoship nu mai raporteaza un cod pe care nu l-a scris", () => {
  /*
   * `scris: false` inseamna ca expedierea s-a schimbat sub noi si starea NU s-a scris. Raportat
   * oricum, cronul l-ar numara prelucrat si webhookul l-ar trece aplicat; la rularea urmatoare
   * `seSchimba` ar iesi fals fata de ce cred ei ca s-a scris, si un retur ar putea fi inghitit.
   */
  const s = faraComentarii("src/lib/innoship/aplica-urmarire.ts");
  assert.match(s, /codNou: prelucrat && scris \? codNou : null/,
    "codul se raporteaza fara sa se fi scris pe comanda");
});

/* ── 4. Ce a ramas NEATINS, si de ce ──────────────────────────────────────── */

test("⚠ eColet, partea de EMITERE, ramane fara conditie, si asta e o hotarare", () => {
  /*
   * ⚠ SE SCRIE CA SA NU PARA O SCAPARE.
   *
   * Scrierea care pune chiar AWB-ul (`ecolet_awb_number`) isi cere deja randurile inapoi si
   * trateaza „zero randuri" drept caz CRITIC, cu jurnal. Iar coada ei filtreaza pe
   * `.is("ecolet_awb_number", null)`: in clipa in care AWB-ul se scrie, randul iese singur. Iar
   * identitatea de acolo, `ecolet_order_to_send_id`, nu se schimba sub noi pe drumul asta.
   *
   * O conditie in plus n-ar apara nimic nou si ar adauga o a doua cale de esec peste una care deja
   * tipa corect.
   */
  const s = faraComentarii(`${RADACINA}/ecolet-tracking/route.ts`);
  assert.match(s, /\.is\("ecolet_awb_number", null\)/,
    "coada emiterilor nu se mai auto-goleste cand AWB-ul se scrie; conditia devine necesara");
  assert.match(s, /ecolet_awb_number: awb,[\s\S]{0,200}?\.select\("id"\)/,
    "scrierea AWB-ului nu-si mai cere randurile inapoi");
});
