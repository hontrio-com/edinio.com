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

test("⚠ dar daca ei totusi il cer, expedierea nu se blocheaza", () => {
  /*
   * O reluare, o singura data, cu numarul de tur - si scrisa, ca sa nu para o hotarare buna.
   * Numai pe REFUZ LIMPEDE (4xx), fiindca doar acolo stim ca nu s-a intamplat nimic: o retrimitere
   * peste un raspuns necunoscut ar putea expedia de doua ori.
   */
  assert.match(sync, /if \(isAboutYouError\(res\) && !awbRetur && eRefuzLimpede\(res\.status\)\) \{/);
  assert.match(sync, /NU e o eticheta de retur valabila/);
  /* Si chiar o SINGURA data: reluarea trimite `tracking`, deci a doua oara conditia nu mai tine. */
  assert.equal((sync.match(/res = await trimiteExpedierea\(/g) ?? []).length, 2);
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
