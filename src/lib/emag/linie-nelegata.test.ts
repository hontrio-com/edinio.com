import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chiarEOfertaNoastra } from "./orders";

/* ══════════════════════════════════════════════════════════════════════════
   O LINIE NELEGATA E MARFA VANDUTA FARA SCADERE DE STOC — SI TACEA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Refuzul legarii e CORECT: `chiarEOfertaNoastra` cere doi martori fiindca id-urile lor se
   pot recicla, iar o linie legata GRESIT scade stocul altui produs — si aia nu se mai vede
   niciodata. „La indoiala se refuza legarea, nu se ghiceste."

   ⚠ DAR TACEREA NU E CORECTA. Comanda intra, se vede in panou, se factureaza si se
   expediaza — si nimeni nu afla ca stocul n-a scazut. Magazinul propriu si celelalte canale
   vand mai departe ce tocmai a plecat din depozit.

   ⚠ MASURAT PE O COMANDA REALA: 501350435, „Hrana uscata Josera Active Nature 12,5 Kg",
   406,99 lei, intrata azi la 19:04. Id-ul lor se potrivea (50014810) si pana si
   `part_number_key` era acelasi (D29M3DYBM) — dar `part_number` nu: ei au trimis
   4032254775386, la noi era 50014810. Zero randuri in jurnal.

   ═══ ⚠ SI DE-AIA NU S-A SLABIT REGULA, DESI ERAM GATA S-O FAC ═══

   `part_number_key` PARE un martor mai tare decat codul vanzatorului: e pagina LOR de
   produs, nu un cod pe care comerciantul si-l alege singur. Eram gata sa accept legarea cand
   PNK-ul se potriveste.

   Verificat pe datele vechi INAINTE de a schimba ceva: la cele doua comenzi cu „Vas wc
   Mondial" (id 433), PNK-ul se potrivea SI EL — `D2G25MMBM` de amandoua partile — desi
   produsele chiar erau diferite (la noi, `emag_id = 433` e hrana pentru caini). Deci PNK-ul
   nostru poate fi la fel de invechit ca id-ul. Slabita, regula ar fi scazut stocul de hrana
   pentru caini pe o comanda de vas de WC.

   Se repara ARATAND, nu ghicind.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ regula celor doi martori ramane INTACTA", () => {
  /* Proba care apara reparatia de mine. Daca vreodata cade, cineva a slabit legarea. */
  assert.equal(chiarEOfertaNoastra("4032254775386", "50014810"), false, "coduri diferite ⇒ NU");
  assert.equal(chiarEOfertaNoastra("cilmondial", "106027L"), false, "vasul de WC ramane nelegat");
  assert.equal(chiarEOfertaNoastra("106027L", "106027L"), true);
  /* ⚠ Cand unul lipseste se leaga: la ofertele publicate de noi codul e mereu acelasi, iar
     cerand dovada de la ambele parti s-ar fi rupt calea buna ca sa se apere un caz rar. */
  assert.equal(chiarEOfertaNoastra(null, "106027L"), true);
  assert.equal(chiarEOfertaNoastra("106027L", null), true);
  /* Spatii, virgule si punct-virgula se scot: eMAG le sterge oricum din `part_number`. */
  assert.equal(chiarEOfertaNoastra("106 027L", "106027l"), true);
});

test("⚠ `part_number_key` NU e martor de acceptare", () => {
  /*
   * Pe datele reale, PNK-ul se potrivea si acolo unde produsele erau diferite. O reparatie
   * care l-ar fi crezut ar fi scazut stocul gresit — exact paguba pe care regula o apara.
   */
  const o = viu("src/lib/emag/orders.ts");
  const i = o.indexOf("export function chiarEOfertaNoastra(");
  assert.ok(i > 0);
  assert.doesNotMatch(
    o.slice(i, i + 500), /part_number_key/,
    "hotararea de legare nu are voie sa se sprijine pe PNK",
  );
});

test("⚠ o linie nelegata se scrie in jurnal, cu ce s-a vandut", () => {
  const o = viu("src/lib/emag/orders.ts");
  assert.match(o, /const nelegate = linii\.filter\(\(l\) => !l\.product_id\);/);
  assert.match(o, /STOCUL NU SCADE pentru ele/);
  /* ⚠ Cu detalii: fara ele, omul stie ca s-a intamplat ceva dar nu ce anume s-a vandut. */
  assert.match(o, /emag_product_id: l\.emag_product_id, nume: l\.name, cate: l\.quantity/);
});

test("⚠ si O SINGURA DATA pe comanda, nu la fiecare re-citire", () => {
  /*
   * ═══ DEFECTUL A FOST AL MEU, LA O ORA DUPA CE AM SCRIS AVERTISMENTUL ═══
   *
   * Prima forma scria inainte de a sti daca mai vazusem comanda. Cea de proba (501350435)
   * sta in fereastra de suprapunere si e re-citita din minut in minut, deci acelasi rand a
   * aparut la 19:53, 19:54, 19:55, 19:56... Am si spus, gresit, ca „s-a scris o data" —
   * masurasem la un minut dupa prima linie, prea devreme ca sa se vada repetitia.
   *
   * ⚠ Un avertisment care se repeta la nesfarsit inceteaza sa mai fie citit, si atunci
   * acopera chiar lucrul pe care voia sa-l arate.
   *
   * ⚠ Nimic nu se pierde din tacerea de dupa: intrarea din panou se citeste din
   * `orders.items` si ramane acolo cat timp linia e nelegata.
   */
  const o = viu("src/lib/emag/orders.ts");
  assert.match(o, /if \(nelegate\.length > 0 && !ex\?\.order_id\) \{/);
  /* ⚠ Si hotararea vine DUPA citirea lui `ex`: scrisa inainte, n-ar fi avut cu ce deosebi
     o comanda noua de a suta re-citire a aceleiasi. */
  const iEx = o.indexOf("const ex = randCitit");
  const iLog = o.indexOf("if (nelegate.length > 0 && !ex?.order_id) {");
  assert.ok(iEx > 0 && iLog > iEx, "avertismentul vine dupa citirea comenzii existente");
});

test("⚠ si comerciantul o vede in panou, nu doar eu in jurnal", () => {
  /* Un jurnal pe care il citesc numai eu nu repara stocul nimanui. */
  const act = viu("src/lib/actions/emag.actions.ts");
  assert.match(act, /cheie: "linie-nelegata"/);
  assert.match(act, /Comenzi la care stocul NU a scăzut/);
  assert.match(act, /sursa: "edinio"/, "reparatia e la noi, nu in panoul lor");
  /* ⚠ Si citirea picata nu se citeste ca „nicio problema". */
  assert.match(act, /if \(eRanduri \|\| eAbandonate \|\| eComenzi\)/);
});
