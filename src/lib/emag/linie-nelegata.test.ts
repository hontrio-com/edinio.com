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

test("⚠ si comerciantul o vede in panou, nu doar eu in jurnal", () => {
  /* Un jurnal pe care il citesc numai eu nu repara stocul nimanui. */
  const act = viu("src/lib/actions/emag.actions.ts");
  assert.match(act, /cheie: "linie-nelegata"/);
  assert.match(act, /Comenzi la care stocul NU a scăzut/);
  assert.match(act, /sursa: "edinio"/, "reparatia e la noi, nu in panoul lor");
  /* ⚠ Si citirea picata nu se citeste ca „nicio problema". */
  assert.match(act, /if \(eRanduri \|\| eAbandonate \|\| eComenzi\)/);
});
