import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   EXPEDIEREA: TRANSPORTATORUL LOR, SI ETICHETA DE RETUR (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Doua lucruri se trimiteau pe presupunere.

   TRANSPORTATORUL. `carrier_key` se socotea din curierul Edinio si din harta din setari, fara sa
   ne uitam vreodata la ce a atribuit About You comenzii. Cand cele doua difera, coletul pleaca
   declarat la alt transportator decat cel pe care il asteapta ei.

   ETICHETA DE RETUR. `return_tracking_key: awbRetur || tracking` - fara AWB de retur, pleca
   numarul de TUR. Clientul primeste atunci o eticheta de retur care nu duce nicaieri: un document
   valid pentru alt drum. Nu e o lipsa, e o informatie FALSA, si e mai rea decat lipsa.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");

test("⚠ transportatorul atribuit de ei se citeste din raspunsul BRUT, nu se ghiceste", () => {
  /*
   * ⚠ Nu se inventeaza un nume de camp. Se citeste `carrier_key` din comanda asa cum a venit, si
   * numai daca e chiar acolo. Lipsa lui inseamna „ei nu atribuie nimic", si atunci ramane exact
   * purtarea de pana acum - deci nicio expediere nu se strica din reparatia asta.
   */
  assert.match(sync, /select\("id, items, fulfillment_type, raw"\)/);
  assert.match(sync, /typeof brut\?\.carrier_key === "string"/);
  assert.match(sync, /const carrierKey = alLor \?\? alNostru;/);
});

test("⚠ si cand difera, se OPRESTE, nu se alege unul dintre ele", () => {
  /*
   * Al lor cu AWB-ul nostru e gresit (numarul apartine curierului nostru); al nostru peste
   * hotararea lor e gresit la fel. Amandoua tacute produc un colet pe care nu-l gaseste nimeni.
   */
  assert.match(sync, /if \(alLor && alNostru && alLor !== alNostru\) \{/);
  assert.match(sync, /a atribuit comenzii transportatorul/);
});

test("⚠ fara AWB de retur adevarat, campul se OMITE", () => {
  /*
   * ⚠ Ca e optional nu e o presupunere: `shipOrderItems` il are `?` in semnatura, iar
   * `AboutYouOrderItem.return_tracking_key` e `?: string | null` in schema lor de citire. Doua
   * semne independente.
   */
  assert.match(sync, /\.\.\.\(cuRetur \? \{ return_tracking_key: cuRetur \} : \{\}\)/);
  assert.doesNotMatch(sync, /return_tracking_key: awbRetur \|\| tracking/, "rezerva veche s-a intors");

  const client = readFileSync("src/lib/aboutyou/client.ts", "utf8");
  assert.match(client, /return_tracking_key\?: string \}\[\]/, "semnatura nu-l mai da optional");
  const tipuri = readFileSync("src/lib/aboutyou/types.ts", "utf8");
  assert.match(tipuri, /return_tracking_key\?: string \| null;/);
});

test("⚠ numarul de tur nu mai pleaca drept retur, NICIODATA", () => {
  /*
   * ═══ ⚠ DIMINEATA MAI EXISTA O RELUARE (27.08.2026, seara) ═══
   *
   * Scosesem rezerva din prima cerere, dar lasasem o reluare: la un refuz limpede se retrimitea cu
   * numarul de TUR, si chiar logul spunea „care NU e o eticheta de retur valabila". Adica: codul
   * stia ca informatia e falsa si o trimitea oricum. Aia nu se apara cu nimic.
   *
   * ⚠ E cu atat mai rau daca `return_tracking_key` e CERUT de schema lor: atunci prima cerere ar
   * fi refuzata mereu, deci reluarea ar fi calea OBISNUITA, nu exceptia - fiecare colet ar pleca
   * cu o eticheta de retur care nu duce nicaieri.
   */
  assert.doesNotMatch(sync, /trimiteExpedierea\(tracking\)/, "reluarea cu numarul de tur s-a intors");
  assert.doesNotMatch(sync, /NU e o eticheta de retur valabila/);
  /* O singura trimitere: nu mai exista a doua incercare cu alt continut. */
  assert.equal((sync.match(/await trimiteExpedierea\(/g) ?? []).length, 1);
});

test("⚠ ce nu stim se declara, nu se ghiceste", () => {
  /*
   * Ce STIM: ca ei tin `shipment_tracking_key` si `return_tracking_key` drept doua campuri
   * deosebite - asta e in schema. Ce NU stim: daca la un curier anume acelasi numar e valabil in
   * amandoua sensurile - asta e in contractul comerciantului cu curierul.
   *
   * Deci nu hotaram noi: declara el, pe curier, si nedeclarat inseamna OPRIT.
   */
  assert.match(sync, /const bidirectional = ctx\.config\.retur_bidirectional\?\.\[codCurier\] === true;/);
  assert.match(sync, /const cheiaDeRetur = awbRetur \|\| \(bidirectional \? tracking : undefined\);/);
  assert.match(sync, /if \(!cheiaDeRetur\) \{/);
  /* ⚠ Si oprirea NU e trecatoare: cronul n-are ce relua singur, e treaba omului. */
  const i = sync.indexOf("if (!cheiaDeRetur) {");
  assert.match(sync.slice(i, i + 700), /status: 409,/);
});

test("⚠ si mesajul trimite la bifa care CHIAR exista", () => {
  /* ⚠ De doua ori intr-o zi am trimis clientul la un buton inexistent. */
  assert.match(sync, /bifează în Setări → About You/);
  const ecran = readFileSync("src/components/dashboard/AboutYouCarrierMapping.tsx", "utf8");
  assert.match(ecran, /Același AWB e valabil și pentru retur/);
  assert.match(ecran, /saveAboutYouReturBidirectional\(businessId, courierCode, valoare\)/);
  /* Si bifa ajunge chiar in configul pe care il citeste expedierea. */
  const act = readFileSync("src/lib/actions/aboutyou.actions.ts", "utf8");
  assert.match(act, /retur_bidirectional: harta/);
});

test("⚠ „nedeclarat” si „declarat ca nu” duc la aceeasi oprire", () => {
  /* Se STERGE cheia in loc sa se scrie `false`: doua feluri de a spune acelasi lucru, o singura
     forma in date. Altfel ar fi trebuit sa deosebim intre ele undeva, degeaba. */
  const act = readFileSync("src/lib/actions/aboutyou.actions.ts", "utf8");
  assert.match(act, /if \(valoare\) harta\[courierCode\] = true;[\s\S]{0,12}else delete harta\[courierCode\];/);
});

test("⚠ raspunsul brut se pastreaza la fiecare ingest, pe amandoua caile", () => {
  /*
   * ⚠ Ce nu pastram nu se mai poate intreba niciodata. Intrebarea „About You atribuie un
   * transportator?" n-a putut fi raspunsa din baza tocmai fiindca `toAyItems` arunca tot ce nu
   * incapea in schema noastra.
   */
  const orders = viu("src/lib/aboutyou/orders.ts");
  assert.equal((orders.match(/raw: order as never/g) ?? []).length, 2, "si la creare, si la actualizare");
});
