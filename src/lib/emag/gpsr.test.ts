import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITE_EMAG } from "./limite";

/* ══════════════════════════════════════════════════════════════════════════
   DATELE GPSR SE POT COMPLETA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `emag_config.gpsr` exista in tipuri, `mapping.ts` il trimitea, iar preflight-ul spunea
   „Nu sunt completate datele GPSR". Dar NIMIC din Edinio nu-l scria: nici formular, nici
   actiune. Deci comerciantul era trimis sa completeze ceva ce n-avea unde.

   ⚠ Probele de aici pazesc DOUA lucruri: ca impachetarea se face intr-un singur loc, si ca
   un nume gol nu pleaca — fiindca eMAG cere `name` pe fiecare set, iar o adresa completata
   cu numele uitat ar face ca oferta INTREAGA sa fie refuzata.
*/

const act = readFileSync("src/lib/actions/emag.actions.ts", "utf8");
const viu = act.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("impachetarea se face intr-un singur loc", () => {
  /* Ecranul trimite CAMPURI, nu structura lor. Altfel forma lui `emag_config.gpsr` ar fi
     fost scrisa si in componenta, si aici — doua locuri care se despart. */
  assert.match(viu, /function gpsrDinCampuri\(/);
  assert.match(viu, /\.\.\.\(setari\.gpsr !== undefined \? \{ gpsr: gpsrDinCampuri\(setari\.gpsr\) \} : \{\}\)/);
});

test("⚠ o entitate FARA NUME nu se trimite deloc", () => {
  /*
   * Cea mai importanta din fisier. eMAG cere `name` pe fiecare set. O adresa completata si
   * un nume uitat ar fi facut ca oferta INTREAGA sa fie refuzata, cu un mesaj despre GPSR
   * pe care omul l-ar fi citit ca „lipsesc datele", desi el le pusese.
   */
  assert.match(viu, /const n = \(nume \?\? ""\)\.trim\(\);/);
  assert.match(viu, /if \(!n\) return \[\];/);
});

test("⚠ lista goala, nu `undefined`: datele trebuie sa se poata STERGE", () => {
  /* Peticul se imbina, iar o cheie lipsa inseamna „las-o cum e". Un comerciant care isi
     sterge datele trebuie sa le poata sterge. */
  /*
   * ⚠ Fereastra se ia pana la functia URMATOARE, nu pana la primul `\n}`: acela se
   * potriveste la inchiderea listei de parametri (`}): EmagConfig["gpsr"] {`), iar corpul
   * ar fi iesit gol. Prima forma a probei a picat exact asa, pe cod bun.
   */
  const i = viu.indexOf("function gpsrDinCampuri");
  const j = viu.indexOf("export async function salveazaSetariEmag", i);
  const corp = viu.slice(i, j > i ? j : i + 2000);
  assert.match(corp, /manufacturer: entitate\(/);
  assert.match(corp, /eu_representative: entitate\(/);
  assert.doesNotMatch(corp, /\?\s*undefined/, "nu se intoarce `undefined` pentru o entitate lipsa");
});

test("⚠ se taie la limitele LOR chiar la salvare, nu abia la trimitere", () => {
  /*
   * Un nume de 300 de semne salvat intreg ar fi aratat pe ecran ca acceptat si ar fi fost
   * taiat abia in drum spre ei — iar comerciantul n-ar fi stiut care jumatate a ajuns.
   */
  assert.match(viu, /\.slice\(0, LIMITE_EMAG\.gpsrNume\)/);
  assert.match(viu, /\.slice\(0, LIMITE_EMAG\.gpsrAdresa\)/);
  assert.match(viu, /\.slice\(0, LIMITE_EMAG\.gpsrEmail\)/);
  assert.match(viu, /\.slice\(0, LIMITE_EMAG\.gpsrSiguranta\)/);
});

test("⚠ limita avertismentelor e a NOASTRA, si e mult sub a lor", () => {
  /*
   * In schema lor `safety_information` are `maxLength: 16777215` — adica „text lung in
   * baza de date", nu o hotarare despre ce e rezonabil. Un camp fara margine in panou e o
   * invitatie sa se lipeasca acolo o fisa tehnica intreaga, care apoi pleaca la FIECARE
   * oferta a magazinului, in fiecare incarcatura.
   */
  assert.equal(LIMITE_EMAG.gpsrSiguranta, 4000);
  assert.ok(LIMITE_EMAG.gpsrSiguranta < 16_777_215);
  /* Iar limitele entitatilor sunt chiar ale lor. */
  assert.equal(LIMITE_EMAG.gpsrNume, 200);
  assert.equal(LIMITE_EMAG.gpsrAdresa, 500);
  assert.equal(LIMITE_EMAG.gpsrEmail, 100);
});

test("starea ajunge la ecran DESPACHETATA", () => {
  /* Componenta primeste campuri, nu liste — ca sa nu stie si ea forma. */
  assert.match(viu, /producatorNume: config\.gpsr\?\.manufacturer\?\.\[0\]\?\.name \?\? ""/);
  assert.match(viu, /reprezentantEmail: config\.gpsr\?\.eu_representative\?\.\[0\]\?\.email \?\? ""/);
});

test("⚠ formularul chiar exista si e montat", () => {
  const ui = readFileSync("src/components/dashboard/EmagClient.tsx", "utf8");
  assert.match(ui, /function PanouGpsr\(/);
  assert.match(ui, /<PanouGpsr businessId=\{businessId\} status=\{status\} \/>/);
  /* ⚠ Si spune limpede ce NU rezolva: marci cu producatori diferiti cer date pe produs. */
  assert.match(ui, /mărci cu\s*\n?\s*producători diferiți/);
});

test("⚠ preflight-ul nu mai e o fundatura", () => {
  /*
   * Dimineata spunea „nu se pot completa încă din Edinio" — adevarat atunci. Acum
   * formularul exista, deci textul acela ar fi devenit neadevarat in cealalta directie.
   */
  const pre = readFileSync("src/lib/emag/pregatire.ts", "utf8");
  const viuPre = pre.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(viuPre, /nu se pot completa încă/);
  assert.match(viuPre, /setările integrării eMAG/, "spune UNDE se face");
});
